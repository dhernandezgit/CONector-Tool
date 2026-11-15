"""Faithful derived surfaces for the reference presets.

Only a compact, quantised ``.npz`` table is committed.  The original STL
files remain outside the repository.  Quantising to 16 bits over each local
bounding box keeps the point-cloud error well below the 0.1 % target while
avoiding a full-precision STL copy.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

from .mesh import Mesh, empty_mesh

EXACT_FILE = Path(__file__).with_name("exact_meshes.npz")


def _scaled(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 1.0
    return max(0.25, min(3.0, number))


@lru_cache(maxsize=1)
def _archive() -> Any:
    try:
        return np.load(EXACT_FILE, allow_pickle=False)
    except (OSError, ValueError):
        return None


def available_exact() -> list[str]:
    archive = _archive()
    if archive is None:
        return []
    return sorted(
        key[: -len("/vertices")]
        for key in archive.files
        if key.endswith("/vertices")
    )


def exact_mesh(profile_id: str, settings: dict[str, Any] | None = None) -> Mesh:
    archive = _archive()
    if archive is None or not profile_id:
        return empty_mesh()
    prefix = f"{profile_id}/"
    if f"{prefix}vertices" not in archive.files:
        return empty_mesh()
    raw_vertices = np.asarray(archive[f"{prefix}vertices"], dtype=np.float64)
    faces = np.asarray(archive[f"{prefix}faces"], dtype=np.int64)
    if raw_vertices.ndim != 2 or raw_vertices.shape[1] != 3 or faces.ndim != 2:
        return empty_mesh()
    if f"{prefix}lower" in archive.files and f"{prefix}span" in archive.files:
        lower = np.asarray(archive[f"{prefix}lower"], dtype=np.float64)
        span = np.asarray(archive[f"{prefix}span"], dtype=np.float64)
        vertices = lower + raw_vertices / 65535.0 * span
    else:
        vertices = raw_vertices
    values = settings or {}
    scale = np.asarray(
        [
            _scaled(values.get("profile_scale_x", 1.0)),
            _scaled(values.get("profile_scale_y", 1.0)),
            _scaled(values.get("profile_scale_z", 1.0)),
        ],
        dtype=float,
    )
    if not np.allclose(scale, 1.0):
        center = (vertices.min(axis=0) + vertices.max(axis=0)) / 2.0
        vertices = center + (vertices - center) * scale
    return Mesh(vertices, faces).oriented()
