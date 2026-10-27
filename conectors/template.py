"""Exact reference connectors supplied with the project.

The seven meshes come from the user's Wire Grid Connector Set reference file
(CloudedCat, CC BY-NC 4.0).  They are offered as exact base configurations;
the generative mode remains available for new topologies and dimensions.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .mesh import Mesh, transform_matrix

ROOT = Path(__file__).resolve().parent / "templates"


def manifest() -> list[dict]:
    try:
        return json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    except Exception:
        return []


def load_template(index: int) -> Mesh:
    items = manifest()
    item = next((entry for entry in items if int(entry["id"]) == int(index)), None)
    if not item:
        raise ValueError("La base de referencia seleccionada no existe.")
    path = ROOT / str(item["file"])
    data = path.read_bytes()
    if len(data) < 84:
        raise ValueError("La plantilla está vacía.")
    count = int(np.frombuffer(data[80:84], dtype="<u4")[0])
    if len(data) < 84 + count * 50:
        raise ValueError("La plantilla STL está incompleta.")
    records = np.frombuffer(data[84:84 + count * 50], dtype=np.uint8).reshape(count, 50)
    floats = records[:, :48].copy().view("<f4").reshape(count, 12)
    vertices = floats[:, 3:12].reshape(-1, 3)
    faces = np.arange(count * 3, dtype=np.int64).reshape(-1, 3)
    return Mesh(vertices, faces).merged(decimals=5).oriented()


def template_meshes(settings: dict) -> tuple[list[tuple[str, Mesh]], list[str]]:
    index = int(settings.get("template_id", 4))
    mesh = load_template(index)
    sx = max(0.3, min(3.0, float(settings.get("template_scale_xy", 1.0))))
    sz = max(0.3, min(3.0, float(settings.get("template_scale_z", 1.0))))
    m = np.eye(4)
    m[0, 0] = sx
    m[1, 1] = sx
    m[2, 2] = sz
    mesh = mesh.transformed(m)
    if bool(settings.get("template_mirror", False)):
        mesh = mesh.transformed(
            np.array([[-1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], dtype=float)
        )
        mesh = mesh.oriented()
    angle = float(settings.get("template_rotate", 0.0))
    if abs(angle) > 0.01:
        mesh = mesh.transformed(transform_matrix(rotate_z=angle * np.pi / 180.0))
    b = mesh.bounds
    mesh = mesh.translated((-(b["min"][0] + b["max"][0]) / 2, -(b["min"][1] + b["max"][1]) / 2, -b["min"][2]))
    warnings: list[str] = []
    if bool(settings.get("split", {}).get("enabled", False)):
        warnings.append(
            "Las bases exactas se conservan enteras para no alterar sus canales. "
            "Para partir una pieza, crea una variante generativa."
        )
    return [("Base de referencia", mesh)], warnings
