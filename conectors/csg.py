"""Port-free parametric bodies and arbitrary C-channel cutters for CSG.

The base body is a compact 2D envelope loft; the cutters are ordinary C-shaped
prisms.  The browser applies the final boolean operation with manifold-3d, so
arbitrary port angles, levels, widths and depths are real geometry operations,
not preset substitutions.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from shapely import affinity
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

from .mesh import Mesh, empty_mesh, extrude_polygon, loft_layers, rounded_rect

FILE = Path(__file__).with_name("base_bodies.npz")
META = Path(__file__).with_name("base_bodies.json")


@lru_cache(maxsize=1)
def _archive() -> Any:
    try:
        return np.load(FILE, allow_pickle=False)
    except (OSError, ValueError):
        return None


@lru_cache(maxsize=1)
def _meta() -> dict[str, Any]:
    try:
        value = json.loads(META.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {}
    return value if isinstance(value, dict) else {}


def _clamp(value: Any, low: float, high: float, default: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, number))


def _params(profile_id: str, settings: dict[str, Any]) -> tuple[np.ndarray, np.ndarray]:
    meta = _meta().get(profile_id, {})
    center = np.asarray(meta.get("target_center", [0, 0, 0]), dtype=float)
    extents = np.asarray(meta.get("target_extents", [1, 1, 1]), dtype=float)
    scale = np.asarray(
        [
            _clamp(settings.get("profile_scale_x"), 0.25, 3.0, 1.0),
            _clamp(settings.get("profile_scale_y"), 0.25, 3.0, 1.0),
            _clamp(settings.get("profile_scale_z"), 0.25, 3.0, 1.0),
        ],
        dtype=float,
    )
    return center, extents * scale


def base_mesh(profile_id: str, settings: dict[str, Any] | None = None) -> Mesh:
    archive = _archive()
    if archive is None or not profile_id or f"{profile_id}/rings" not in archive.files:
        return empty_mesh()
    values = settings or {}
    center, extents = _params(profile_id, values)
    rings = np.asarray(archive[profile_id + "/rings"], dtype=float)
    positions = np.asarray(archive[profile_id + "/positions"], dtype=float)
    taper = _clamp(values.get("profile_taper"), -0.5, 0.5, 0.0)
    twist = _clamp(values.get("profile_twist"), -1.0, 1.0, 0.0) * 45.0
    zmin, zmax = float(positions.min()), float(positions.max())
    span = max(1e-9, zmax - zmin)
    plans: list[Polygon] = []
    zs: list[float] = []
    for index, raw in enumerate(rings):
        fraction = float(np.clip((positions[index] - zmin) / span, 0.0, 1.0))
        factor = max(0.25, min(3.0, 1.0 + taper * (fraction * 2.0 - 1.0)))
        angle = np.deg2rad(twist * (fraction * 2.0 - 1.0))
        cos_a, sin_a = float(np.cos(angle)), float(np.sin(angle))
        xy = raw.copy()
        xy[:, 0] = center[0] + (xy[:, 0] - center[0]) * factor
        xy[:, 1] = center[1] + (xy[:, 1] - center[1]) * factor
        dx = xy[:, 0] - center[0]
        dy = xy[:, 1] - center[1]
        xy[:, 0] = center[0] + dx * cos_a - dy * sin_a
        xy[:, 1] = center[1] + dx * sin_a + dy * cos_a
        plans.append(Polygon(xy).buffer(0))
        zs.append(center[2] + (fraction - 0.5) * extents[2])
    if len(plans) < 2:
        return empty_mesh()
    try:
        mesh = loft_layers(plans, zs, segments=192)
    except Exception:
        return empty_mesh()
    # Enforce the configured envelope.
    source_center = (mesh.vertices.min(axis=0) + mesh.vertices.max(axis=0)) / 2.0
    source_extents = np.maximum(mesh.vertices.max(axis=0) - mesh.vertices.min(axis=0), 1e-6)
    vertices = center + (mesh.vertices - source_center) * (extents / source_extents)
    return Mesh(vertices, mesh.faces).oriented()


def _cutter_plan(settings: dict[str, Any], port: dict[str, Any], width: float, depth: float) -> Polygon:
    wall = _clamp(settings.get("grip_wall"), 0.8, 8.0, 2.4)
    mouth = _clamp(settings.get("mouth_width"), 0.8, 30.0, 3.2)
    cut_width = _clamp(port.get("width"), 2.0, 90.0, max(4.0, width * 0.22))
    cut_depth = _clamp(port.get("depth"), 2.0, 140.0, max(6.0, depth * 0.55))
    half = max(width, depth) * 0.5
    center_y = half - cut_depth * 0.5 - max(0.8, wall * 0.55)
    cavity = rounded_rect(cut_width, cut_depth, min(cut_width, cut_depth) * 0.28)
    cavity = affinity.translate(cavity, 0.0, center_y)
    corridor = box(-mouth * 0.5, center_y + cut_depth * 0.5 - 0.8, mouth * 0.5, half + 4.0)
    return affinity.rotate(unary_union([cavity, corridor]), float(port.get("angle", 0.0)), origin=(0.0, 0.0))


def cutters(profile_id: str, settings: dict[str, Any] | None = None) -> list[Mesh]:
    values = settings or {}
    meta = _meta().get(profile_id, {})
    center = np.asarray(meta.get("target_center", [0, 0, 0]), dtype=float)
    base_ext = np.asarray(meta.get("target_extents", [1, 1, 1]), dtype=float)
    scale = np.asarray(
        [
            _clamp(values.get("profile_scale_x"), 0.25, 3.0, 1.0),
            _clamp(values.get("profile_scale_y"), 0.25, 3.0, 1.0),
            _clamp(values.get("profile_scale_z"), 0.25, 3.0, 1.0),
        ],
        dtype=float,
    )
    width, depth = base_ext[0] * scale[0], base_ext[1] * scale[1]
    height = base_ext[2] * scale[2]
    zmin = center[2] - height * 0.5
    zmax = center[2] + height * 0.5
    items: list[Mesh] = []
    for port in values.get("ports") or []:
        if not isinstance(port, dict) or not port.get("enabled", True):
            continue
        level = str(port.get("level", "both")).lower()
        if level == "top":
            z0, z1 = zmin + height * 0.24, zmax
        elif level == "bottom":
            z0, z1 = zmin, zmin + height * 0.76
        else:
            z0, z1 = zmin, zmax
        plan = _cutter_plan(values, port, width, depth)
        plan = affinity.translate(plan, center[0], center[1])
        piece = extrude_polygon(plan, 0.0, z1 - z0).translated((0, 0, z0))
        items.append(piece)
    return items
