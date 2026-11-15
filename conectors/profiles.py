"""Parametric section-loft engine.

The reference connector bundles are proprietary STL files and are never
committed or shipped.  This module consumes a compact table of derived 2D
section curves: a set of cross-sections per connector.  The runtime builds a
watertight shell by lofting those curves.  It deliberately never loads a 3D
mesh: the stored data are 2D control rings, and scale, taper and twist are the
editable parameters.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from shapely.geometry import Polygon

from .mesh import Mesh, empty_mesh, triangulate_polygon

PROFILE_FILE = Path(__file__).with_name("profiles.json")


@lru_cache(maxsize=1)
def load_profiles() -> dict[str, Any]:
    """Load the derived contour table (a tiny JSON file, not raw meshes)."""
    try:
        data = json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {"version": 0, "profiles": {}}
    profiles = data.get("profiles")
    return data if isinstance(profiles, dict) else {"version": 0, "profiles": {}}


def profile_definition(profile_id: str) -> dict[str, Any] | None:
    profiles = load_profiles().get("profiles", {})
    value = profiles.get(str(profile_id or ""))
    return value if isinstance(value, dict) else None


def available_profiles() -> list[str]:
    return sorted(load_profiles().get("profiles", {}).keys())


def _clamp_scale(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 1.0
    return max(0.25, min(3.0, number))


def _world_scale(scale_x: Any, scale_y: Any, scale_z: Any) -> np.ndarray:
    return np.asarray(
        [_clamp_scale(scale_x), _clamp_scale(scale_y), _clamp_scale(scale_z)],
        dtype=float,
    )


def _clamp_signed(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(-1.0, min(1.0, number))


def _shape_radius(angle: np.ndarray, half_u: float, half_v: float, shape: str) -> np.ndarray:
    """Radial boundary of a section-shape family at the given angles."""
    cu = np.maximum(np.abs(np.cos(angle)) / max(half_u, 1e-6), 1e-9)
    cv = np.maximum(np.abs(np.sin(angle)) / max(half_v, 1e-6), 1e-9)
    exponent = {
        "rounded": 4.0,
        "round": 2.0,
        "ellipse": 2.0,
        "hex": 6.0,
        "octagon": 8.0,
        "organic": 2.5,
    }.get(shape, 0.0)
    if exponent <= 0.0:
        return np.hypot(1.0 / cu, 1.0 / cv)
    return (cu**exponent + cv**exponent) ** (-1.0 / exponent)


def build_profile_mesh(
    profile: dict[str, Any] | None,
    scale_x: Any = 1.0,
    scale_y: Any = 1.0,
    scale_z: Any = 1.0,
    taper: Any = 0.0,
    twist: Any = 0.0,
    shape: Any = "base",
    shape_blend: Any = 0.0,
) -> Mesh:
    """Loft the stored 2D control sections into a watertight shell.

    Each section is a single closed outer contour.  Reference sections were
    aligned before being stored, so the runtime path is deterministic and only
    has to connect corresponding points.  The end sections are capped with the
    same ring vertices, which keeps the shell watertight.

    ``taper`` scales the cross-section from the negative end (-) to the
    positive end (+) of the loft axis.  ``twist`` rotates it by up to +/-45
    degrees over that span.  Both are ordinary shape parameters and do not
    change the section count or channel topology.
    """
    if not profile:
        return empty_mesh()

    axis = int(profile.get("axis", 2))
    axes = profile.get("axes") or [0, 1]
    if axis not in (0, 1, 2) or len(axes) != 2:
        return empty_mesh()
    u_axis, v_axis = int(axes[0]), int(axes[1])
    if u_axis == v_axis or axis in (u_axis, v_axis):
        return empty_mesh()

    positions = np.asarray(profile.get("positions", []), dtype=float)
    rings = np.asarray(profile.get("rings", []), dtype=float)
    if positions.ndim != 1 or rings.ndim != 3 or rings.shape[0] != positions.size:
        return empty_mesh()
    if rings.shape[1] < 3 or rings.shape[2] != 2:
        return empty_mesh()

    # The first extraction pass can lose a fraction of a millimetre at the
    # tangent caps.  Normalise the generated base to the measured reference
    # envelope, then apply the user scales around that envelope centre.  This
    # keeps every preset at its exact reference width/depth/height while the
    # section curves remain the editable source.
    raw_centers = np.zeros(3, dtype=float)
    raw_centers[u_axis] = (float(np.min(rings[:, :, 0])) + float(np.max(rings[:, :, 0]))) / 2.0
    raw_centers[v_axis] = (float(np.min(rings[:, :, 1])) + float(np.max(rings[:, :, 1]))) / 2.0
    raw_centers[axis] = (float(np.min(positions)) + float(np.max(positions))) / 2.0
    raw_extents = np.ones(3, dtype=float)
    raw_extents[u_axis] = max(1e-6, float(np.max(rings[:, :, 0]) - np.min(rings[:, :, 0])))
    raw_extents[v_axis] = max(1e-6, float(np.max(rings[:, :, 1]) - np.min(rings[:, :, 1])))
    raw_extents[axis] = max(1e-6, float(np.max(positions) - np.min(positions)))

    target_center = np.asarray(profile.get("target_center") or raw_centers, dtype=float)
    target_extents = np.asarray(profile.get("target_extents") or raw_extents, dtype=float)
    if target_center.shape != (3,) or target_extents.shape != (3,):
        target_center, target_extents = raw_centers, raw_extents
    if np.any(target_extents <= 1e-6):
        target_extents = raw_extents

    centers = target_center
    scale = _world_scale(scale_x, scale_y, scale_z)
    envelope_factors = np.ones(3, dtype=float)
    envelope_factors[u_axis] = target_extents[u_axis] / raw_extents[u_axis]
    envelope_factors[v_axis] = target_extents[v_axis] / raw_extents[v_axis]
    envelope_factors[axis] = target_extents[axis] / raw_extents[axis]

    u = centers[u_axis] + (rings[:, :, 0] - raw_centers[u_axis]) * envelope_factors[u_axis] * scale[u_axis]
    v = centers[v_axis] + (rings[:, :, 1] - raw_centers[v_axis]) * envelope_factors[v_axis] * scale[v_axis]
    along = centers[axis] + (positions - raw_centers[axis]) * envelope_factors[axis] * scale[axis]

    # Taper and twist are applied per section around the same envelope
    # centre.  They are intentionally 2D deformations: the rings keep their
    # point count and the loft stays watertight.
    taper_value = _clamp_signed(taper)
    twist_value = _clamp_signed(twist) * 45.0
    positions_span = float(np.max(positions) - np.min(positions))
    for layer in range(rings.shape[0]):
        if positions_span <= 1e-9:
            fraction = 0.5
        else:
            fraction = float((positions[layer] - np.min(positions)) / positions_span)
        factor = max(0.25, min(3.0, 1.0 + taper_value * (fraction * 2.0 - 1.0)))
        x = (u[layer] - centers[u_axis]) * factor
        y = (v[layer] - centers[v_axis]) * factor
        angle = np.deg2rad(twist_value * (fraction * 2.0 - 1.0))
        c, s = float(np.cos(angle)), float(np.sin(angle))
        u[layer] = centers[u_axis] + x * c - y * s
        v[layer] = centers[v_axis] + x * s + y * c

    shape_name = str(shape or "base").lower()
    blend = max(0.0, min(1.0, float(shape_blend or 0.0)))
    if blend > 0.001 and shape_name not in {"", "base", "original"}:
        for layer in range(rings.shape[0]):
            dx = u[layer] - centers[u_axis]
            dy = v[layer] - centers[v_axis]
            half_u = max(1e-6, float(np.max(np.abs(dx))))
            half_v = max(1e-6, float(np.max(np.abs(dy))))
            theta = np.arctan2(dy, dx)
            radius = np.hypot(dx, dy)
            target = _shape_radius(theta, half_u, half_v, shape_name)
            radius = radius + (target - radius) * blend
            u[layer] = centers[u_axis] + radius * np.cos(theta)
            v[layer] = centers[v_axis] + radius * np.sin(theta)

    layers, points = rings.shape[:2]
    vertices = np.zeros((layers * points, 3), dtype=float)
    vertices[:, u_axis] = u.reshape(-1)
    vertices[:, v_axis] = v.reshape(-1)
    vertices[:, axis] = np.repeat(along, points)

    faces: list[list[int]] = []
    for layer in range(layers - 1):
        a0 = layer * points
        b0 = (layer + 1) * points
        for index in range(points):
            nxt = (index + 1) % points
            a = a0 + index
            b = a0 + nxt
            c = b0 + nxt
            d = b0 + index
            faces.append([a, b, c])
            faces.append([a, c, d])

    # Caps.  Triangulate in contour space and map the same points back to 3D.
    for layer, flip in ((0, True), (layers - 1, False)):
        contour = np.column_stack([u[layer], v[layer]])
        cap_vertices, cap_faces = triangulate_polygon(Polygon(contour))
        if not len(cap_faces):
            return empty_mesh()
        base = len(vertices)
        extra = np.zeros((len(cap_vertices), 3), dtype=float)
        extra[:, u_axis] = cap_vertices[:, 0]
        extra[:, v_axis] = cap_vertices[:, 1]
        extra[:, axis] = along[layer]
        vertices = np.vstack([vertices, extra])
        for triangle in cap_faces:
            a, b, c = (int(triangle[0]), int(triangle[1]), int(triangle[2]))
            if flip:
                faces.append([base + a, base + c, base + b])
            else:
                faces.append([base + a, base + b, base + c])

    if not faces:
        return empty_mesh()
    return Mesh(vertices, np.asarray(faces, dtype=np.int64)).merged(decimals=5).oriented()


def profile_mesh(settings: dict[str, Any]) -> Mesh:
    """Build the mesh selected by ``settings['profile_id']``."""
    profile_id = str(settings.get("profile_id") or "")
    return build_profile_mesh(
        profile_definition(profile_id),
        settings.get("profile_scale_x", 1.0),
        settings.get("profile_scale_y", 1.0),
        settings.get("profile_scale_z", 1.0),
        settings.get("profile_taper", 0.0),
        settings.get("profile_twist", 0.0),
        settings.get("profile_shape", "base"),
        settings.get("profile_shape_blend", 0.0),
    )
