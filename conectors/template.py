"""Exact reference connectors supplied with the project.

The seven meshes come from the user's Wire Grid Connector Set reference file
(CloudedCat, CC BY-NC 4.0).  They are offered as exact base configurations;
the generative mode remains available for new topologies and dimensions.

On top of each exact base the studio can add two parametric, non-destructive
extras:

* ``template_legs`` extends a sturdy L-shaped foot from one or more free
  sides and lifts the connector so the display starts at the chosen height.
* ``template_decor`` mounts a flat decorative silhouette on a free side.  It
  is exported as a separate plate so it can be printed flat in its own color.

Both extras are built in the local frame of the reference mesh, then the whole
assembly is rotated around Z and placed on the print bed.  With both extras
disabled the output is byte-for-byte the original reference mesh.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from .mesh import Mesh, extrude_polygon, frame_z_to, rounded_rect, transform_matrix
from .shapes import custom_polygon, decor_details, decor_polygon

ROOT = Path(__file__).resolve().parent / "templates"

# Side labels shared with the TypeScript UI.  "front" is -Y (the side facing
# the default studio camera), "back" is +Y, "right" is +X and "left" is -X.
SIDE_LABELS = {
    "right": "derecha (+X)",
    "left": "izquierda (-X)",
    "back": "fondo (+Y)",
    "front": "frente (-Y)",
}

# Sides without a wire channel, measured from the reference meshes.  They are
# recommendations: the UI still lets the user choose another side and warns.
FREE_SIDES: dict[int, list[str]] = {
    0: [],
    1: [],
    2: ["right"],
    3: ["right"],
    4: ["right", "back"],
    5: ["left", "right"],
    6: ["right", "front", "back"],
}


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


def _f(value: object, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _flag(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).lower() in {"1", "true", "yes", "on"}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _color(value: object, fallback: str) -> str:
    text = str(value or fallback)
    return text if len(text) == 7 and text.startswith("#") else fallback


def _side_list(value: object) -> list[str]:
    if isinstance(value, str):
        raw = [value]
    elif isinstance(value, (list, tuple)):
        raw = [str(item) for item in value]
    else:
        raw = []
    out: list[str] = []
    for item in raw:
        key = item.strip().lower()
        if key in SIDE_LABELS and key not in out:
            out.append(key)
    return out


def _center_on_bed(mesh: Mesh) -> Mesh:
    bounds = mesh.bounds
    return mesh.translated(
        (
            -(bounds["min"][0] + bounds["max"][0]) / 2.0,
            -(bounds["min"][1] + bounds["max"][1]) / 2.0,
            -bounds["min"][2],
        )
    )


def _side_geometry(bounds: dict[str, list[float]], side: str) -> tuple[float, float, float, float, float]:
    """Return side coordinate, tangent centre, tangent extent, z center, z extent."""
    minx, miny, minz = bounds["min"]
    maxx, maxy, maxz = bounds["max"]
    cx, cy = (minx + maxx) / 2.0, (miny + maxy) / 2.0
    if side == "right":
        return maxx, cy, maxy - miny, (minz + maxz) / 2.0, maxz - minz
    if side == "left":
        return minx, cy, maxy - miny, (minz + maxz) / 2.0, maxz - minz
    if side == "back":
        return maxy, cx, maxx - minx, (minz + maxz) / 2.0, maxz - minz
    return miny, cx, maxx - minx, (minz + maxz) / 2.0, maxz - minz


def _leg_mesh(bounds: dict[str, list[float]], side: str, legs: dict) -> Mesh:
    """One L-shaped leg that lifts the connector and leaves a broad foot."""
    length = _clamp(_f(legs.get("length"), 24.0), 10.0, 120.0)
    requested_width = _clamp(_f(legs.get("width"), 12.0), 5.0, 70.0)
    height = _clamp(_f(legs.get("height"), 30.0), 0.0, 220.0)
    thickness = _clamp(_f(legs.get("thickness"), 4.0), 3.0, 14.0)
    sole = _clamp(_f(legs.get("sole"), 3.0), 1.2, 8.0)
    requested_foot = _clamp(_f(legs.get("foot"), 18.0), 10.0, 90.0)

    _, _, tangent_extent, _, _ = _side_geometry(bounds, side)
    # A leg can never be wider than the face it grows from.  This matters for
    # the thin standard connector (8.3 mm) and keeps every add-on printable.
    width = min(requested_width, max(5.0, tangent_extent - 1.2))
    overlap = min(4.0, max(1.5, tangent_extent * 0.18))
    foot = max(width + 6.0, min(requested_foot, 90.0))
    radius = min(width, length) * 0.18

    # Local frame: +X points out of the selected side, +Y is tangential, +Z up.
    arm_len = length + overlap
    arm = extrude_polygon(rounded_rect(arm_len, width, radius), 0.0, thickness)
    arm = arm.translated(((length - overlap) / 2.0, 0.0, 0.0))

    if height <= 0.01:
        # A horizontal extension that rests directly on the table.
        cap = extrude_polygon(rounded_rect(foot, foot, min(foot * 0.2, 5.0)), 0.0, thickness)
        out = arm.append(cap.translated((length, 0.0, 0.0)))
    else:
        post = extrude_polygon(
            rounded_rect(width, width, min(width * 0.25, 3.0)),
            -height,
            height + thickness + 0.25,
        )
        out = arm.append(post.translated((length, 0.0, 0.0)))
        pad = extrude_polygon(
            rounded_rect(foot, foot, min(foot * 0.2, 5.0)),
            -height,
            sole,
        )
        out = out.append(pad.translated((length, 0.0, 0.0)))

    angle = {"right": 0.0, "back": 90.0, "left": 180.0, "front": -90.0}[side]
    if abs(angle) > 0.01:
        out = out.transformed(transform_matrix(rotate_z=math.radians(angle)))

    side_value, tangent_center, _, _, _ = _side_geometry(bounds, side)
    if side in {"right", "left"}:
        offset = (side_value, tangent_center, 0.0)
    else:
        offset = (tangent_center, side_value, 0.0)
    return out.translated(offset)


def _decor_plate(bounds: dict[str, list[float]], cfg: dict) -> tuple[Mesh, str]:
    """A flat silhouette mounted on a vertical face, with an optional rim."""
    shape = str(cfg.get("shape", "cat") or "cat")
    size = _clamp(_f(cfg.get("size"), 20.0), 6.0, 160.0)
    thickness = _clamp(_f(cfg.get("thickness"), 2.4), 1.2, 8.0)
    border = _clamp(_f(cfg.get("border"), 0.8), 0.0, 8.0)
    relief = _clamp(_f(cfg.get("relief"), 0.5), 0.0, 3.0)
    color = _color(cfg.get("color"), "#ef8ca5")

    side = str(cfg.get("side", "back") or "back").lower()
    if side not in SIDE_LABELS:
        side = "back"

    side_value, tangent_center, tangent_extent, _, z_extent = _side_geometry(bounds, side)
    max_size = max(6.0, min(tangent_extent * 0.86, z_extent * 0.86))
    size = min(size, max_size)

    custom = cfg.get("custom")
    if shape == "custom" and custom:
        poly = custom_polygon(custom.get("outer") or [], custom.get("holes") or [], size)
    else:
        poly = decor_polygon(shape, size)

    # Embed the back of the plate 1 mm into the body so it is fused in the
    # assembled view and has a clean contact surface for gluing.
    plate = extrude_polygon(poly, -1.0, thickness + 1.0)
    if border > 0.12:
        inner = poly.buffer(-border, join_style=1, quad_segs=8)
        ring = poly.difference(inner)
        if not ring.is_empty:
            plate = plate.append(extrude_polygon(ring, thickness - 0.02, 0.65))
    if relief > 0.05:
        for detail in decor_details(shape, size):
            piece = detail.intersection(poly.buffer(0.2))
            if not piece.is_empty and getattr(piece, "area", 0.0) > 0.2:
                plate = plate.append(extrude_polygon(piece, thickness - 0.02, relief + 0.02))

    # Rotate the local XY silhouette to a vertical plane whose +Z points out
    # of the selected side.  frame_z_to keeps local +Y aligned with world +Z,
    # so the decoration always stands upright.
    axis = {
        "right": (1.0, 0.0, 0.0),
        "left": (-1.0, 0.0, 0.0),
        "back": (0.0, 1.0, 0.0),
        "front": (0.0, -1.0, 0.0),
    }[side]
    plate = plate.transformed(frame_z_to(axis, up_hint=(0.0, 0.0, 1.0)))

    height_pct = _clamp(_f(cfg.get("height_pct"), 0.5), 0.08, 0.92)
    minz = float(bounds["min"][2])
    maxz = float(bounds["max"][2])
    z_center = minz + height_pct * (maxz - minz)
    half = size / 2.0
    low, high = minz + half + 0.4, maxz - half - 0.4
    if low <= high:
        z_center = _clamp(z_center, low, high)
    else:
        z_center = (minz + maxz) / 2.0

    offset = _clamp(
        _f(cfg.get("offset"), 0.0),
        -max(0.0, (tangent_extent - size) / 2.0),
        max(0.0, (tangent_extent - size) / 2.0),
    )
    if side in {"right", "left"}:
        translation = (side_value, tangent_center + offset, z_center)
    else:
        translation = (tangent_center + offset, side_value, z_center)
    return plate.translated(translation), color


def _finalize(parts: list[Mesh], angle_deg: float) -> list[Mesh]:
    if not parts:
        return []
    if abs(angle_deg) > 0.01:
        matrix = transform_matrix(rotate_z=math.radians(angle_deg))
        parts = [part.transformed(matrix) for part in parts]
    bounds = [part.bounds for part in parts]
    minx = min(b["min"][0] for b in bounds)
    maxx = max(b["max"][0] for b in bounds)
    miny = min(b["min"][1] for b in bounds)
    maxy = max(b["max"][1] for b in bounds)
    minz = min(b["min"][2] for b in bounds)
    shift = (-(minx + maxx) / 2.0, -(miny + maxy) / 2.0, -minz)
    return [part.translated(shift) for part in parts]


def template_meshes(settings: dict) -> tuple[list[tuple[str, Mesh, str]], list[str]]:
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

    # Work in the local, unrotated frame so side labels always refer to the
    # original model.  Rotation is applied to the whole assembly at the end.
    mesh = _center_on_bed(mesh)
    bounds = mesh.bounds

    warnings: list[str] = []
    free = FREE_SIDES.get(index, [])
    legs = settings.get("template_legs") or {}
    sides = _side_list(legs.get("sides"))
    legs_used: list[str] = []
    if _flag(legs.get("enabled"), False):
        if not sides:
            warnings.append("Activa al menos un lado para la pata o el conector se quedará sin apoyo.")
        for side in sides:
            mesh = mesh.append(_leg_mesh(bounds, side, legs))
            legs_used.append(side)
            if side not in free:
                warnings.append(
                    f"La pata en {SIDE_LABELS[side]} puede tapar un canal de reja. "
                    "Muévela a un lado libre si el panel entra por ahí."
                )

    parts: list[Mesh] = [mesh]
    decor_cfg = settings.get("template_decor") or {}
    if _flag(decor_cfg.get("enabled"), False):
        decor_side = str(decor_cfg.get("side", "back") or "back").lower()
        if decor_side not in SIDE_LABELS:
            decor_side = "back"
            decor_cfg = {**decor_cfg, "side": decor_side}
        plate, plate_color = _decor_plate(bounds, decor_cfg)
        parts.append(plate)
        if decor_side not in free:
            warnings.append(
                f"La decoración en {SIDE_LABELS[decor_side]} puede cubrir un canal de reja. "
                "Elige un lado libre para no bloquear el panel."
            )


    parts = _finalize(parts, float(settings.get("template_rotate", 0.0)))

    body_color = _color(settings.get("body_color"), "#465a66")
    base_label = "Base + patas" if legs_used else "Base de referencia"
    result: list[tuple[str, Mesh, str]] = [(base_label, parts[0], body_color)]
    if len(parts) > 1:
        decor_color = _color(decor_cfg.get("color"), "#ef8ca5")
        result.append(("Decoración", parts[1], decor_color))

    if _flag(settings.get("split", {}).get("enabled", False)):
        warnings.append(
            "Las bases exactas se conservan enteras para no alterar sus canales. "
            "Para partir una pieza, crea una variante generativa."
        )
    return result, warnings
