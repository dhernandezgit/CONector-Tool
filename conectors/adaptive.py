"""Adaptive high-fidelity meshes for the connector presets.

The committed archive contains only compact, simplified derived surfaces.
It is not an STL copy and is never treated as a reference mode.  The app
uses it as a printable base when high fidelity is enabled; the section-loft
engine remains the fallback and the source of the lightweight editor.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from .mesh import Mesh, empty_mesh
from .profiles import _shape_radius, profile_definition

ADAPTIVE_FILE = Path(__file__).with_name("adaptive_meshes.npz")


@lru_cache(maxsize=1)
def _archive() -> Any:
    try:
        return np.load(ADAPTIVE_FILE, allow_pickle=False)
    except (OSError, ValueError):
        return None


def available() -> list[str]:
    archive = _archive()
    if archive is None:
        return []
    return sorted(key[: -len("/vertices")] for key in archive.files if key.endswith("/vertices"))


def _clamp_scale(value: Any, default: float = 1.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.25, min(3.0, number))


def adaptive_mesh(profile_id: str, settings: dict[str, Any] | None = None) -> Mesh:
    """Return the simplified printable surface for a preset id."""
    archive = _archive()
    prefix = f"{profile_id}/"
    if archive is None or not profile_id or f"{prefix}vertices" not in archive.files:
        return empty_mesh()
    vertices = np.asarray(archive[prefix + "vertices"], dtype=float).copy()
    faces = np.asarray(archive[prefix + "faces"], dtype=np.int64).copy()
    if vertices.ndim != 2 or vertices.shape[1] != 3 or faces.ndim != 2 or not len(faces):
        return empty_mesh()
    values = settings or {}
    definition = profile_definition(profile_id) or {}
    target_center = np.asarray(definition.get("target_center", []), dtype=float)
    target_extents = np.asarray(definition.get("target_extents", []), dtype=float)
    if target_center.shape != (3,) or target_extents.shape != (3,) or np.any(target_extents <= 1e-6):
        target_center = (vertices.min(axis=0) + vertices.max(axis=0)) / 2.0
        target_extents = vertices.max(axis=0) - vertices.min(axis=0)
    source_center = (vertices.min(axis=0) + vertices.max(axis=0)) / 2.0
    source_extents = np.maximum(vertices.max(axis=0) - vertices.min(axis=0), 1e-6)
    vertices = target_center + (vertices - source_center) * (target_extents / source_extents)

    scale = np.asarray(
        [
            _clamp_scale(values.get("profile_scale_x", 1.0)),
            _clamp_scale(values.get("profile_scale_y", 1.0)),
            _clamp_scale(values.get("profile_scale_z", 1.0)),
        ],
        dtype=float,
    )
    vertices = target_center + (vertices - target_center) * scale

    shape_name = str(values.get("profile_shape", "base") or "base").lower()
    shape_blend = max(0.0, min(1.0, float(values.get("profile_shape_blend", 0.0) or 0.0)))
    if shape_blend > 0.001 and shape_name not in {"", "base", "original"}:
        half_x = max(1e-6, float(target_extents[0] * scale[0]) / 2.0)
        half_y = max(1e-6, float(target_extents[1] * scale[1]) / 2.0)
        dx = vertices[:, 0] - target_center[0]
        dy = vertices[:, 1] - target_center[1]
        theta = np.arctan2(dy, dx)
        radius = np.hypot(dx, dy)
        desired = _shape_radius(theta, half_x, half_y, shape_name)
        radius = radius + (desired - radius) * shape_blend
        vertices[:, 0] = target_center[0] + radius * np.cos(theta)
        vertices[:, 1] = target_center[1] + radius * np.sin(theta)

    # The adaptive base is Z-up.  Taper/twist are applied around that axis so
    # the printable mesh remains closed and keeps its channel topology.
    taper = max(-0.5, min(0.5, float(values.get("profile_taper", 0.0) or 0.0)))
    twist = max(-1.0, min(1.0, float(values.get("profile_twist", 0.0) or 0.0))) * 45.0
    span = max(1e-9, float(target_extents[2] * scale[2]))
    z0 = float(target_center[2] - span / 2.0)
    for index in range(len(vertices)):
        fraction = max(0.0, min(1.0, (vertices[index, 2] - z0) / span))
        factor = max(0.25, min(3.0, 1.0 + taper * (fraction * 2.0 - 1.0)))
        angle = np.deg2rad(twist * (fraction * 2.0 - 1.0))
        x = (vertices[index, 0] - target_center[0]) * factor
        y = (vertices[index, 1] - target_center[1]) * factor
        c, s = np.cos(angle), np.sin(angle)
        vertices[index, 0] = target_center[0] + x * c - y * s
        vertices[index, 1] = target_center[1] + x * s + y * c
    return Mesh(vertices, faces).oriented()
