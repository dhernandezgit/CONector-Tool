"""Derived profile loft engine.

The reference connector bundles are proprietary STL files and are never
committed or shipped.  This module consumes a compact, derived description of
their outer contours: a handful of resampled cross-sections per connector.
Those sections are enough to rebuild the printable outer shell within the 1 %
point-cloud tolerance while keeping the result fully parametric through the
three world-axis scale controls.
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


def build_profile_mesh(
    profile: dict[str, Any] | None,
    scale_x: Any = 1.0,
    scale_y: Any = 1.0,
    scale_z: Any = 1.0,
) -> Mesh:
    """Loft the stored cross-sections into a watertight printable shell.

    Each section is a single closed outer contour.  Reference sections were
    aligned before being stored, so the runtime path is deterministic and only
    has to connect corresponding points.  The end sections are capped with the
    same ring vertices, which keeps the shell watertight.
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

    # Scale around the reference envelope centre, not the world origin.  That
    # makes the controls usable for intermediate sizes without drifting.
    centers = np.zeros(3, dtype=float)
    centers[u_axis] = (float(np.min(rings[:, :, 0])) + float(np.max(rings[:, :, 0]))) / 2.0
    centers[v_axis] = (float(np.min(rings[:, :, 1])) + float(np.max(rings[:, :, 1]))) / 2.0
    centers[axis] = (float(np.min(positions)) + float(np.max(positions))) / 2.0
    scale = _world_scale(scale_x, scale_y, scale_z)

    u = centers[u_axis] + (rings[:, :, 0] - centers[u_axis]) * scale[u_axis]
    v = centers[v_axis] + (rings[:, :, 1] - centers[v_axis]) * scale[v_axis]
    along = centers[axis] + (positions - centers[axis]) * scale[axis]

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
    )
