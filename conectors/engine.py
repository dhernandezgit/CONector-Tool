"""Parametric connector engine for CONector Tool."""

from __future__ import annotations

import base64
import copy
import math
import time
from typing import Any, Iterable

import numpy as np
from shapely import affinity
from shapely.geometry import MultiPolygon, Point, Polygon, box
from shapely.ops import unary_union

from . import __version__
from .mesh import (
    Mesh,
    annulus,
    axis_vector,
    c_profile,
    circle_polygon,
    cylinder,
    cylinder_along,
    empty_mesh,
    extrude_polygon,
    frame_z_to,
    is_shell_watertight,
    mesh_components,
    mesh_to_stl,
    overhang_ratio,
    regular_polygon,
    rounded_rect,
    split_mesh,
    three_mf_bytes,
    transform_matrix,
    tube,
    tube_along,
)
from .shapes import custom_polygon, decor_details, decor_polygon
from .shape import Shape, analyze_bytes
from .profiles import profile_mesh
from .adaptive import adaptive_mesh
from .csg import base_mesh as csg_base_mesh, cutters as csg_cutters
from .freeform import parametric_mesh
from .spool import spool_mesh
from .template import template_meshes

MM = 1.0


def _deep_merge(base: dict, extra: dict) -> dict:
    out = copy.deepcopy(base)
    for key, value in (extra or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


DEFAULTS: dict[str, Any] = {
    "family": "node",
    "name": "Conector",
    "profile_id": "",
    "profile_scale_x": 1.0,
    "profile_scale_y": 1.0,
    "profile_scale_z": 1.0,
    "profile_taper": 0.0,
    "profile_twist": 0.0,
    "profile_shape": "base",
    "profile_shape_blend": 0.0,
    "profile_high_fidelity": True,
    "parametric_customized": False,
    "ports": [],
    "body_width": 0.0,
    "body_depth": 0.0,
    "channel_width": 0.0,
    "grip_lines": 0,
    "grip_depth": 0.5,
    "smoothness": 0.65,
    "port_height": 0.0,
    "leg_azimuth": 0.0,
    "leg_width": 12.0,
    "leg_thickness": 4.0,
    "template_id": 4,
    "template_scale_xy": 1.0,
    "template_scale_z": 1.0,
    "template_mirror": False,
    "template_rotate": 0.0,
    "template_legs": {
        "enabled": False,
        "sides": ["right", "back"],
        "length": 24.0,
        "width": 12.0,
        "height": 30.0,
        "foot": 18.0,
        "sole": 3.0,
        "thickness": 4.0,
    },
    "template_decor": {
        "enabled": False,
        "side": "right",
        "shape": "cat",
        "custom": None,
        "size": 19.0,
        "thickness": 2.4,
        "border": 0.8,
        "relief": 0.5,
        "color": "#ef8ca5",
        "height_pct": 0.5,
        "offset": 0.0,
    },
    "panel_type": "wire",
    "wire_diameter": 4.0,
    "panel_thickness": 4.0,
    "clearance": 0.25,
    "grip_wall": 2.4,
    "grip_length": 16.0,
    "mouth_width": 3.2,
    "wrap_degrees": 325.0,
    "wire_count": 1,
    "wire_spacing": 5.0,
    "edge_style": "flat",
    "edge_length": 13.5,
    "edge_width": 8.0,
    "edge_spacing": 18.0,
    "edge_foot": 0.0,
    "flat_width": 37.0,
    "flat_depth": 31.5,
    "flat_height": 8.0,
    "calibration_mode": "wire",
    "joint_preset": "corner90",
    "angle": 90.0,
    "tilt": 0.0,
    "arms": [],
    "body_shape": "rounded",
    "body_size": 46.0,
    "body_height": 22.6,
    "belt_height": 8.0,
    "arm_width": 76.0,
    "body_chamfer": 3.0,
    "body_color": "#e98da6",
    "inner_radius": 6.0,
    "body_style": "auto",
    "horizontal_ports": [0.0, 90.0],
    "vertical_ports": [45.0],
    "top_channels": True,
    "bottom_channels": True,
    "scallops": True,
    "scallop_count": 4,
    "decor": {
        "enabled": False,
        "shape": "cat",
        "custom": None,
        "size": 60.0,
        "thickness": 3.0,
        "side": "front",
        "mount": "press",
        "border": 1.4,
        "relief": 0.7,
        "color": "#ef8ca5",
    },
    "leg": {
        "enabled": False,
        "height": 50.0,
        "angle": 0.0,
        "foot": 24.0,
        "sole": 3.0,
    },
    "leg_mode": "elevated",
    "leg_length": 48.0,
    "special": {
        "table_cut": False,
        "hook": False,
        "peg": False,
        "peg_diameter": 5.0,
        "peg_length": 8.0,
        "zip_tie": False,
        "screws": False,
    },
    "split": {
        "enabled": False,
        "axis": "z",
        "offset": 0.0,
        "screw_pads": True,
        "gap": 2.0,
    },
    "print": {
        "bed_width": 256.0,
        "bed_depth": 256.0,
        "material": "PETG",
        "nozzle": 0.4,
        "layer": 0.2,
        "orientation": "upright",
        "diagonal": False,
    },
}

JOINT_ARMS: dict[str, list[str]] = {
    "corner90": ["+x", "+y"],
    "flat": ["+x", "-x"],
    "tee": ["+x", "-x", "+y"],
    "cross": ["+x", "-x", "+y", "-y"],
    "corner3d": ["+x", "+y", "+z"],
    "four3d": ["+x", "-x", "+y", "+z"],
    "five": ["+x", "-x", "+y", "-y", "+z"],
    "six": ["+x", "-x", "+y", "-y", "+z", "-z"],
    "angle": [],
    "custom": [],
    "single": ["+x"],
}

FAMILY_LABELS = {
    "node": "Nodo",
    "angle": "Ángulo",
    "leg": "Pata",
    "edge": "Borde",
    "flat": "Placa plana",
    "hook": "Gancho",
    "plate": "Placa",
    "profile": "Perfil derivado",
    "parametric": "Param\u00e9trico",
    "calibration": "Calibración",
}


def _f(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _i(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default)


def _bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).lower() in {"1", "true", "yes", "on"}


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _color(value: Any, fallback: str = "#ef6f5e") -> str:
    text = str(value or fallback)
    if len(text) == 7 and text.startswith("#"):
        return text
    return fallback


def _shape_dict_from_custom(custom: Any, size: float) -> Polygon:
    if not custom:
        raise ValueError("No hay una silueta importada en este proyecto.")
    outer = custom.get("outer") or []
    holes = custom.get("holes") or []
    return custom_polygon(outer, holes, size)


def _panel_grip_geometry(settings: dict, direction: np.ndarray, start: np.ndarray) -> Mesh:
    wire = _clamp(_f(settings.get("wire_diameter"), 4.0), 1.5, 12.0)
    clearance = _clamp(_f(settings.get("clearance"), 0.25), 0.0, 1.2)
    wall = _clamp(_f(settings.get("grip_wall"), 2.4), 1.2, 8.0)
    length = _clamp(_f(settings.get("grip_length"), 16.0), 6.0, 45.0)
    mouth = _clamp(_f(settings.get("mouth_width"), 3.2), 1.0, wire * 0.98)
    wrap = _clamp(_f(settings.get("wrap_degrees"), 305.0), 180.0, 340.0)
    d = direction / max(1e-9, np.linalg.norm(direction))
    mouth_vec = np.cross(d, np.array([0.0, 0.0, 1.0]))
    if float(np.linalg.norm(mouth_vec)) < 0.2:
        mouth_vec = np.array([1.0, 0.0, 0.0])
    mouth_vec /= np.linalg.norm(mouth_vec)
    side = np.cross(d, mouth_vec)
    side /= max(1e-9, np.linalg.norm(side))
    count = max(1, min(3, _i(settings.get("wire_count"), 1)))
    spacing = _clamp(_f(settings.get("wire_spacing"), 5.0), 0.0, 20.0)
    profile = c_profile(
        wire_diameter=wire,
        clearance=clearance,
        wall=wall,
        mouth_width=mouth,
        wrap_degrees=wrap,
        segments=64,
    )
    if profile.is_empty:
        return empty_mesh()
    grip = extrude_polygon(profile, 0.0, length)
    transform = frame_z_to(d, up_hint=mouth_vec)
    grip = grip.transformed(transform)
    base = start.copy()
    if count > 1:
        offsets = [(i - (count - 1) / 2.0) * spacing for i in range(count)]
    else:
        offsets = [0.0]
    out = empty_mesh()
    for offset in offsets:
        p = base + side * offset
        out = out.append(grip.translated(p))
    # A small reinforcing saddle at the hub end prevents the C lips from
    # acting as the only load path in a display corner.
    saddle = rounded_rect(wall * 2.6, wall * 1.3, wall * 0.45)
    saddle_mesh = extrude_polygon(saddle, 0.0, 2.2)
    saddle_transform = frame_z_to(d, up_hint=mouth_vec)
    saddle_mesh = saddle_mesh.transformed(saddle_transform)
    out = out.append(saddle_mesh.translated(base + mouth_vec * (wire / 2 + wall * 1.35)))
    return out


def _hub_profile(shape: str, size: float, chamfer: float) -> Polygon:
    s = _clamp(size, 8.0, 60.0)
    c = _clamp(chamfer, 0.5, s * 0.45)
    shape = (shape or "rounded").lower()
    if shape == "round":
        return circle_polygon(s / 2.0, 64)
    if shape == "hex":
        return regular_polygon(s / 2.0, 6, 30)
    if shape == "octagon":
        return regular_polygon(s / 2.0, 8, 22.5)
    if shape == "organic":
        return regular_polygon(s / 2.0, 12, 15).buffer(0)
    return rounded_rect(s, s, c)


def _body_pad(settings: dict, side: float) -> Mesh:
    """A flat landing pad for the swappable decorative face."""
    size = _clamp(_f(settings.get("body_size"), 16.0), 10.0, 60.0)
    pad_size = _clamp(size * 1.75, 30.0, 80.0)
    pad = rounded_rect(pad_size, pad_size, min(8.0, pad_size * 0.18))
    y0 = side * (size * 0.5 - 0.4)
    # Build the silhouette in XZ by mapping local Y to world Z and local Z to
    # world Y.  This makes a vertical pad with its face towards ±Y.
    mesh = extrude_polygon(pad, 0.0, 2.4)
    m = np.array([[1, 0, 0, 0], [0, 0, 1, y0], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=float)
    if side < 0:
        m = np.array([[-1, 0, 0, 0], [0, 0, -1, y0], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=float)
    return mesh.transformed(m).oriented()


def _mount_hardware(settings: dict, side: float) -> Mesh:
    mount = str(settings.get("decor", {}).get("mount", "press"))
    size = _clamp(_f(settings.get("body_size"), 16.0), 10.0, 60.0)
    front = side * (size * 0.5 + 2.0)
    out = _body_pad(settings, side)
    axis = np.array([0.0, side, 0.0])
    start = np.array([0.0, front, 0.0])
    if mount == "magnet":
        for x in (-11.0, 11.0):
            d = np.array([x, 0.0, 0.0])
            out = out.append(tube_along(7.4, 6.1, 3.4, axis, start + d, 36))
    else:
        inner = 3.4 if mount == "screw" else 4.45
        out = out.append(tube_along(7.6, inner, 4.0, axis, start, 48))
        if mount == "press":
            out = out.append(tube_along(6.2, 4.1, 1.2, axis, start + axis * 3.7, 48))
    return out


def _plate_mesh(settings: dict, side: float = 1.0) -> tuple[Mesh, str]:
    decor = settings.get("decor", {})
    shape_name = str(decor.get("shape", "cat"))
    size = _clamp(_f(decor.get("size"), 60.0), 12.0, 160.0)
    thickness = _clamp(_f(decor.get("thickness"), 3.0), 1.2, 8.0)
    border_w = _clamp(_f(decor.get("border"), 1.4), 0.0, 8.0)
    relief = _clamp(_f(decor.get("relief"), 0.7), 0.0, 3.0)
    custom = decor.get("custom")
    if shape_name == "custom" and custom:
        poly = _shape_dict_from_custom(custom, size)
    else:
        poly = decor_polygon(shape_name, size)
    body_size = _clamp(_f(settings.get("body_size"), 16.0), 10.0, 60.0)
    ring_len = 4.0
    y0 = side * (body_size * 0.5 + 2.0 + ring_len)
    # Local: XY silhouette, Z = thickness towards the visible face.
    plate = extrude_polygon(poly, 0.0, thickness)
    if border_w > 0.1:
        inner = poly.buffer(-border_w, join_style=1, quad_segs=8)
        ring = poly.difference(inner)
        if not ring.is_empty:
            plate = plate.append(extrude_polygon(ring, thickness - 0.02, 0.65))
    if relief > 0.05:
        for detail in decor_details(shape_name, size):
            piece = detail.intersection(poly.buffer(0.2))
            if not piece.is_empty and getattr(piece, "area", 0) > 0.2:
                plate = plate.append(extrude_polygon(piece, thickness - 0.02, relief + 0.02))
    # Mounting peg or magnet bosses on the back of the plate.
    mount = str(decor.get("mount", "press"))
    if mount == "press":
        peg = cylinder(4.0, 4.8, 40, -5.0)
        peg = peg.append(cylinder(4.55, 0.9, 40, -5.8))
        for angle in (0, 120, 240):
            rib = cylinder(0.55, 4.8, 12, -5.0)
            m = transform_matrix(rotate_z=math.radians(angle), translate=(0, 3.3, 0))
            peg = peg.append(rib.transformed(m))
        plate = plate.append(peg)
    elif mount == "magnet":
        for x in (-11.0, 11.0):
            plate = plate.append(tube(7.0, 6.1, 1.9, 36, -1.9).translated((x, 0, 0)))
    else:
        plate = plate.append(tube(6.8, 3.3, 4.0, 36, -4.0))
    # Map local Z to ±Y and local Y to Z.
    if side > 0:
        m = np.array([[1, 0, 0, 0], [0, 0, 1, y0], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=float)
    else:
        m = np.array([[-1, 0, 0, 0], [0, 0, -1, y0], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=float)
    plate = plate.transformed(m).oriented()
    return plate, _color(decor.get("color"), "#ef6f5e")


def _build_hub(settings: dict) -> Mesh:
    size = _clamp(_f(settings.get("body_size"), 16.0), 8.0, 60.0)
    height = _clamp(_f(settings.get("body_height"), size), 6.0, 70.0)
    profile = _hub_profile(str(settings.get("body_shape", "rounded")), size, _f(settings.get("body_chamfer"), 3.0))
    return extrude_polygon(profile, -height / 2.0, height)


def _apply_arm_tilt(arms: Iterable[str], tilt: float) -> list[np.ndarray]:
    result = []
    t = math.radians(_clamp(tilt, -80.0, 80.0))
    for name in arms:
        d = axis_vector(str(name))
        if t:
            # Tilt around the horizontal X axis so the user can create
            # compound, non-orthogonal panel displays.
            ct, st = math.cos(t), math.sin(t)
            d = np.array([d[0], d[1] * ct - d[2] * st, d[1] * st + d[2] * ct])
        result.append(d / max(1e-9, np.linalg.norm(d)))
    return result


def _arms_for(settings: dict) -> list[np.ndarray]:
    family = str(settings.get("family", "node"))
    preset = str(settings.get("joint_preset", "corner90"))
    if family == "angle":
        angle = _clamp(_f(settings.get("angle"), 90.0), 5.0, 175.0)
        half = math.radians(angle / 2.0)
        d1 = np.array([math.cos(half), math.sin(half), 0.0])
        d2 = np.array([math.cos(half), -math.sin(half), 0.0])
        return _apply_arm_tilt([d1, d2], _f(settings.get("tilt"), 0.0))
    if family == "edge":
        return []
    names = JOINT_ARMS.get(preset, ["+x", "+y"])
    if preset == "custom":
        names = [str(x) for x in (settings.get("arms") or [])]
        if not names:
            names = ["+x", "+y"]
    elif preset == "angle":
        return _arms_for({**settings, "family": "angle"})
    return _apply_arm_tilt(names, _f(settings.get("tilt"), 0.0))


def _leg_mesh(settings: dict) -> Mesh:
    leg = settings.get("leg", {})
    height = _clamp(_f(leg.get("height"), 50.0), 8.0, 220.0)
    angle = _clamp(_f(leg.get("angle"), 0.0), 0.0, 60.0)
    foot_r = _clamp(_f(leg.get("foot"), 24.0), 8.0, 70.0) / 2.0
    sole = _clamp(_f(leg.get("sole"), 3.0), 1.2, 8.0)
    body = _clamp(_f(settings.get("body_size"), 16.0), 8.0, 60.0)
    a = math.radians(angle)
    direction = np.array([math.sin(a), 0.0, -math.cos(a)])
    length = max(10.0, height)
    start = np.array([0.0, 0.0, -body / 2.0])
    out = cylinder_along(4.2, length, direction, start, 32)
    # A little flare at the top makes the leg much stronger against layer
    # splitting.
    brace = cylinder_along(7.0, min(10.0, length * 0.22), direction, start, 32)
    out = out.append(brace)
    foot_center = start + direction * length
    out = out.append(cylinder(foot_r, sole, 40, foot_center[2] - sole))
    # Round foot landing.  Its top is fused to the leg.
    if foot_r > 2.5:
        out = out.append(tube(foot_r + 0.1, foot_r - 1.2, 1.2, 40, foot_center[2] + 0.1))
    return out


def _leg_connector_mesh(settings: dict) -> Mesh:
    """Horizontal leg/support connector from the Connector Bundle.

    The body is the same puck grammar as the node family; a long arm extends
    from one side at the selected angle.  It is deliberately different from
    the elevated display leg generated by the ``elevated`` mode.
    """
    core_settings = copy.deepcopy(settings)
    core_settings["leg"] = {**core_settings.get("leg", {}), "enabled": False}
    core_settings["joint_preset"] = "custom"
    core_settings["horizontal_ports"] = [0.0, 90.0, 180.0, 270.0]
    core_settings["vertical_ports"] = []
    core_settings["body_style"] = "full"
    body = spool_mesh(core_settings)
    length = _clamp(_f(settings.get("leg_length"), 48.0), 8.0, 140.0)
    angle = _clamp(_f(settings.get("leg", {}).get("angle"), 0.0), 0.0, 60.0)
    width = _clamp(_f(settings.get("leg", {}).get("foot"), 22.0), 8.0, 60.0)
    height = _clamp(_f(settings.get("body_height"), 26.0), 4.0, 100.0)
    arm = extrude_polygon(rounded_rect(length, width, min(4.0, width * 0.22)), 0.0, height * 0.62)
    rad = math.radians(-angle)
    direction = np.array([math.cos(rad), math.sin(rad), 0.0])
    arm = arm.transformed(transform_matrix(rotate_z=rad))
    body = body.append(arm.translated(direction * (_clamp(_f(settings.get("body_size"), 37.0), 8.0, 90.0) / 2.0)))
    # A small round landing at the free end makes the part readable and stable.
    tip = cylinder(width * 0.38, height * 0.62, 24, 0.0)
    tip = tip.transformed(transform_matrix(rotate_z=rad))
    body = body.append(tip.translated(direction * (_clamp(_f(settings.get("body_size"), 37.0), 8.0, 90.0) / 2.0 + length)))
    return body


def _hook_mesh(settings: dict) -> Mesh:
    size = _clamp(_f(settings.get("body_size"), 16.0), 8.0, 60.0)
    front = size / 2.0 - 0.5
    out = empty_mesh()
    rail_len = 34.0
    for x in (-8.0, 8.0):
        out = out.append(cylinder_along(2.2, rail_len, np.array([0.0, 1.0, 0.0]), np.array([x, front, 0.0]), 20))
    out = out.append(cylinder_along(2.2, 16.0, np.array([1.0, 0.0, 0.0]), np.array([-8.0, front + rail_len, 0.0]), 20))
    out = out.append(cylinder_along(2.2, 16.0, np.array([1.0, 0.0, 0.0]), np.array([-8.0, front, 8.0]), 20))
    out = out.append(cylinder_along(2.2, 16.0, np.array([0.0, 1.0, 0.0]), np.array([8.0, front, 8.0]), 20))
    return out


def _table_cut(body: Mesh, settings: dict) -> Mesh:
    """Trim a connector where it meets a table and add a flat foot pad."""
    if not _bool(settings.get("special", {}).get("table_cut"), False):
        return body
    b = body.bounds
    zmin = float(b["min"][2])
    # Only cut when there is actually material below the table plane.  Leave a
    # small pad so the connector has a visible landing surface.
    if zmin >= -0.2:
        pad = cylinder(8.0, 2.0, 32, -1.0)
        return body.append(pad)
    drop = -zmin - 0.2
    shifted = body.translated((0, 0, drop))
    pad = cylinder(8.0, 1.8, 36, float(shifted.bounds["min"][2]) - 1.2)
    return shifted.append(pad)


def _screw_pad_shape(axis: str, side: float, offset: float, width: float) -> Mesh:
    # A small ear with a through hole, built as a 2D profile then mapped to the
    # split plane normal.  The hole is part of the extrusion profile, so this
    # adds no 3D boolean.
    pad = rounded_rect(width, 10.0, 3.0).difference(Point(0, 0).buffer(1.75, quad_segs=24))
    if axis == "z":
        mesh = extrude_polygon(pad, 0.0, 3.0)
        if side > 0:
            mesh = mesh.translated((0, 0, offset))
        else:
            mesh = mesh.translated((0, 0, offset - 3.0))
        return mesh
    # x split: map local Z to X so the ear is a flange in the YZ plane.
    mesh = extrude_polygon(pad, 0.0, 3.0)
    m = np.array([[0, 0, 1, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=float)
    mesh = mesh.transformed(m)
    if side > 0:
        mesh = mesh.translated((offset, 0, 0))
    else:
        mesh = mesh.translated((offset - 3.0, 0, 0))
    return mesh


def _screw_ear(angle_deg: float, outer_radius: float, offset: float, side: float) -> Mesh:
    """An external ear with a neck, an M3 clearance hole and a flat face."""
    pad_center = outer_radius + 5.2
    pad = rounded_rect(13.0, 10.0, 3.0)
    pad = affinity.translate(pad, pad_center, 0)
    neck = box(outer_radius - 2.5, -2.2, pad_center, 2.2)
    ear = unary_union([pad, neck]).difference(Point(pad_center, 0).buffer(1.75, quad_segs=24))
    ear = affinity.rotate(ear, angle_deg, origin=(0, 0))
    mesh = extrude_polygon(ear, 0.0, 3.0)
    if side > 0:
        mesh = mesh.translated((0, 0, offset))
    else:
        mesh = mesh.translated((0, 0, offset - 3.0))
    return mesh


def _combine(meshes: list[Mesh]) -> Mesh:
    out = empty_mesh()
    for mesh in meshes:
        out = out.append(mesh)
    return out


def _split_with_pads(body: Mesh, settings: dict) -> list[tuple[str, Mesh]]:
    axis = str(settings.get("split", {}).get("axis", "z")).lower()
    offset = _f(settings.get("split", {}).get("offset"), 0.0)
    upper_parts: list[Mesh] = []
    lower_parts: list[Mesh] = []
    try:
        for component in mesh_components(body):
            upper, lower = split_mesh(component, axis, offset)
            if len(upper.faces):
                upper_parts.append(upper)
            if len(lower.faces):
                lower_parts.append(lower)
    except Exception as exc:
        raise ValueError(f"No se pudo dividir el conector: {exc}") from exc
    if not upper_parts or not lower_parts:
        raise ValueError("El plano de corte no atraviesa el conector. Mueve el corte.")
    upper = _combine(upper_parts)
    lower = _combine(lower_parts)
    if _bool(settings.get("split", {}).get("screw_pads"), True):
        size = _clamp(_f(settings.get("body_size"), 16.0), 8.0, 60.0)
        width = max(10.0, size * 0.8)
        positions = [-(size * 0.5 + width * 0.45), size * 0.5 + width * 0.45]
        for pos in positions:
            if axis == "z":
                upper = upper.append(_screw_pad_shape("z", 1, offset, width).translated((pos, 0, 0)))
                lower = lower.append(_screw_pad_shape("z", -1, offset, width).translated((pos, 0, 0)))
            else:
                upper = upper.append(_screw_pad_shape("x", 1, offset, width).translated((0, pos, 0)))
                lower = lower.append(_screw_pad_shape("x", -1, offset, width).translated((0, pos, 0)))
    return [("Cuerpo A", upper), ("Cuerpo B", lower)]


def _calibration_mesh(settings: dict) -> Mesh:
    # Five wire jaws with very small clearance differences.  The user prints
    # this once, tests the wire, and selects the best value in the app.
    base = extrude_polygon(rounded_rect(100.0, 24.0, 5.0), 0.0, 2.2)
    out = base
    for i, diameter in enumerate((3.6, 3.8, 4.0, 4.2, 4.4)):
        profile = c_profile(
            wire_diameter=diameter,
            clearance=0.20,
            wall=2.2,
            mouth_width=diameter * 0.82,
            wrap_degrees=305.0,
        )
        grip = extrude_polygon(profile, 0.0, 15.0)
        x = -40.0 + i * 20.0
        out = out.append(grip.translated((x, 0, 0)))
        # One to five dots make the coupon self-documenting without text.
        for dot in range(i + 1):
            out = out.append(cylinder(0.8, 0.7, 12, 2.2).translated((x - 8 + dot * 4.0, 9.0, 0)))
    return out


def _edge_mesh(settings: dict) -> Mesh:
    """Thin edge-clamp family (Edge1..Edge7).

    The reference family is a strip with two C-shaped grip rows.  We rebuild
    that grammar from a central core and radial clamp branches, so the same
    code can produce single, flat, L, T, corner and 3D variants.
    """
    wire = _clamp(_f(settings.get("wire_diameter"), 4.0), 1.5, 12.0)
    clearance = _clamp(_f(settings.get("clearance"), 0.25), 0.0, 1.2)
    wall = _clamp(_f(settings.get("grip_wall"), 1.8), 1.0, 6.0)
    mouth = _clamp(_f(settings.get("mouth_width"), 3.2), 1.0, 10.0)
    body_size = _clamp(_f(settings.get("body_size"), 8.0), 4.0, 60.0)
    edge_length = _clamp(_f(settings.get("edge_length"), 13.5), 2.0, 80.0)
    spacing = _clamp(_f(settings.get("edge_spacing"), 18.0), 0.0, 70.0)
    height = _clamp(_f(settings.get("body_height"), 26.0), 10.0, 90.0)
    foot = _clamp(_f(settings.get("edge_foot"), 0.0), 0.0, 20.0)
    style = str(settings.get("edge_style", "flat") or "flat").lower()
    ports = settings.get("horizontal_ports")
    if not isinstance(ports, list) or not ports:
        ports = {
            "flat": [0.0, 180.0],
            "corner": [0.0, 90.0],
            "L": [0.0, 90.0, 180.0],
            "T": [0.0, 90.0, 270.0],
            "corner3d": [0.0, 90.0, 180.0],
            "custom": [0.0, 90.0],
        }.get(style, [0.0, 180.0])
    try:
        angles = sorted({float(angle) % 360.0 for angle in ports})
    except (TypeError, ValueError):
        angles = [0.0, 180.0]

    profile = c_profile(
        wire_diameter=wire,
        clearance=clearance,
        wall=wall,
        mouth_width=mouth,
        wrap_degrees=_clamp(_f(settings.get("wrap_degrees"), 305.0), 180.0, 340.0),
    )
    outer = (wire / 2.0 + clearance) + wall
    core_radius = body_size / 2.0
    core = extrude_polygon(_hub_profile(str(settings.get("body_shape", "rounded")), body_size, min(3.0, body_size * 0.22)), 0.0, height)
    # The two clamp rows are what makes the 26 mm edge family recognisable.
    row_offset = max(0.0, spacing) / 2.0
    row_center = height / 2.0
    branch = empty_mesh()
    for row in (row_center - row_offset, row_center + row_offset):
        part = extrude_polygon(affinity.translate(profile, 0.0, row), 0.0, edge_length)
        branch = branch.append(part)
    # A slim web ties both rows together without sealing the wire mouth.
    web_w = max(1.4, min(4.0, outer * 0.45))
    web = extrude_polygon(rounded_rect(web_w, max(1.0, spacing + outer * 0.8), web_w * 0.35), 0.0, edge_length)
    web = web.transformed(transform_matrix(translate=(0.0, row_center, 0.0)))
    branch = branch.append(web)

    out = core
    for angle in angles:
        a = math.radians(angle)
        axis = np.array([math.cos(a), math.sin(a), 0.0])
        oriented = branch.transformed(frame_z_to(axis))
        out = out.append(oriented.translated(axis * core_radius))

    if foot > 0.01:
        pad = extrude_polygon(rounded_rect(body_size * 0.9, body_size * 0.9, 2.0), -foot, foot)
        out = out.append(pad)
    # Keep the result centered on the print bed.
    b = out.bounds
    return out.translated((-(b["min"][0] + b["max"][0]) / 2.0, -(b["min"][1] + b["max"][1]) / 2.0, -b["min"][2]))


def _flat_peg_mesh(settings: dict) -> Mesh:
    """Low-profile plate with the same central 5 mm peg as the reference."""
    width = _clamp(_f(settings.get("flat_width"), 37.0), 10.0, 140.0)
    depth = _clamp(_f(settings.get("flat_depth"), 31.5), 8.0, 140.0)
    height = _clamp(_f(settings.get("flat_height"), 8.0), 2.0, 40.0)
    body = extrude_polygon(rounded_rect(width, depth, min(5.0, min(width, depth) * 0.16)), 0.0, height)
    body = body.append(
        cylinder(
            _clamp(_f(settings.get("special", {}).get("peg_diameter"), 5.0), 2.0, 12.0) / 2.0,
            _clamp(_f(settings.get("special", {}).get("peg_length"), 8.0), 1.0, 30.0),
            40,
            -_clamp(_f(settings.get("special", {}).get("peg_length"), 8.0), 1.0, 30.0),
        )
    )
    return body


def _peg_cutout_mesh(settings: dict) -> Mesh:
    """Compact 6 mm peg/cutout coupon used for fit calibration."""
    size = _clamp(_f(settings.get("body_size"), 6.0), 3.0, 30.0)
    height = _clamp(_f(settings.get("body_height"), 2.5), 0.8, 12.0)
    peg = _clamp(_f(settings.get("special", {}).get("peg_diameter"), 5.0), 1.0, 20.0)
    outer = rounded_rect(size, size, min(1.5, size * 0.2))
    hole = circle_polygon(max(0.2, peg / 2.0), 40)
    return extrude_polygon(outer.difference(hole), 0.0, height)


def _edge_body(settings: dict) -> tuple[Mesh, str]:
    decor = settings.get("decor", {})
    size = _clamp(_f(decor.get("size"), 60.0), 20.0, 180.0)
    thickness = _clamp(_f(decor.get("thickness"), 3.0), 1.2, 8.0)
    shape = str(decor.get("shape", "cat"))
    custom = decor.get("custom")
    poly = _shape_dict_from_custom(custom, size) if shape == "custom" and custom else decor_polygon(shape, size)
    body = extrude_polygon(poly, 0.0, thickness)
    # A border and details make the flat edge connector feel like the same
    # product family as the volumetric connector.
    border_w = _clamp(_f(decor.get("border"), 1.4), 0.0, 8.0)
    if border_w > 0.1:
        ring = poly.difference(poly.buffer(-border_w, join_style=1, quad_segs=8))
        if not ring.is_empty:
            body = body.append(extrude_polygon(ring, thickness - 0.02, 0.7))
    if _f(decor.get("relief"), 0.7) > 0.05:
        for detail in decor_details(shape, size):
            piece = detail.intersection(poly.buffer(0.2))
            if not piece.is_empty and getattr(piece, "area", 0) > 0.2:
                body = body.append(extrude_polygon(piece, thickness - 0.02, _f(decor.get("relief"), 0.7) + 0.02))
    # Map the flat silhouette into a vertical plate facing +Y.
    m = np.array([[1, 0, 0, 0], [0, 0, 1, 2.2], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=float)
    body = body.transformed(m).oriented()
    # Two vertical clips on the back so the plate grips a panel edge.  Their
    # wire axis is the world Z axis and their mouths face the panel behind.
    wire = _clamp(_f(settings.get("wire_diameter"), 4.0), 1.5, 12.0)
    clearance = _clamp(_f(settings.get("clearance"), 0.25), 0.0, 1.2)
    wall = _clamp(_f(settings.get("grip_wall"), 2.4), 1.2, 8.0)
    mouth = _clamp(_f(settings.get("mouth_width"), 3.2), 1.0, wire * 0.98)
    profile = c_profile(wire, clearance, wall, mouth, _f(settings.get("wrap_degrees"), 325.0))
    grip = extrude_polygon(profile, 0.0, 13.0)
    back_y = 2.2 - (wall + clearance + wire / 2.0)
    for z in (-size * 0.27, size * 0.27):
        body = body.append(grip.translated((0.0, back_y, z - 6.5)))
    return body, _color(decor.get("color"), "#ef6f5e")


def _build_connector_meshes(settings: dict) -> tuple[list[tuple[str, Mesh, str]], list[str], list[str]]:
    family = str(settings.get("family", "node"))
    warnings: list[str] = []
    details: list[str] = []
    color = _color(settings.get("decor", {}).get("color"), "#ef6f5e")
    body_color = _color(settings.get("body_color"), "#465a66")
    meshes: list[tuple[str, Mesh, str]] = []
    body_size = _clamp(_f(settings.get("body_size"), 38.0), 8.0, 90.0)
    decor = settings.get("decor", {})
    decor_enabled = _bool(decor.get("enabled"), False)

    if family == "parametric":
        body = parametric_mesh(settings)
        if not len(body.faces):
            raise ValueError(
                "No se pudo generar el conector param\u00e9trico. Revisa el cuerpo, "
                "las conexiones y las patas."
            )
        meshes.append(("Cuerpo param\u00e9trico", body, body_color))
        details.append(
            "Conector generado desde cuerpo, conexiones, canales y patas editables. "
            "Ajusta \u00e1ngulos, alturas, anchos y l\u00edneas de agarre."
        )
        split = settings.get("split", {})
        if _bool(split.get("enabled"), False):
            split_parts = _split_with_pads(body, settings)
            meshes = []
            for name, half in split_parts:
                meshes.append((name, half, body_color))
            warnings.append(
                "El conector va dividido. Usa los agujeros de las orejetas para alinear y atornillar las mitades."
            )
        return meshes, warnings, details

    if family == "profile":
        profile_id = str(settings.get("profile_id") or "")
        body = empty_mesh()
        high_fidelity = _bool(settings.get("profile_high_fidelity"), True)
        custom_ports = _bool(settings.get("profile_custom_ports"), False)
        if custom_ports:
            body = csg_base_mesh(profile_id, settings)
            settings["_csg_cutters"] = csg_cutters(profile_id, settings)
        elif high_fidelity:
            body = adaptive_mesh(profile_id, settings)
        if not len(body.faces):
            body = profile_mesh(settings)
        if not len(body.faces):
            raise ValueError(
                "No se encontr\u00f3 el modelo param\u00e9trico. Elige un modelo de la biblioteca "
                "o vuelve a una familia param\u00e9trica."
            )
        meshes.append(("Cuerpo param\u00e9trico", body, body_color))
        if custom_ports:
            details.append(
                "Conexiones personalizadas por CSG: cuerpo base sin canales y cortes C "
                "recalculados para los \u00e1ngulos, niveles, anchos y profundidades elegidos."
            )
        elif high_fidelity and settings.get("profile_id"):
            details.append(
                "Malla adaptativa de alta fidelidad: superficie derivada simplificada, "
                "estanca y preparada para imprimir. No se carga ning\u00fan STL de referencia."
            )
        else:
            details.append(
                f"Modelo '{profile_id}' generado por secciones param\u00e9tricas 2D. "
                "Las escalas X/Y/Z y el ajuste de forma permiten configuraciones intermedias."
            )
        details.append(
            "La orientaci\u00f3n de impresi\u00f3n autom\u00e1tica prueba inclinaciones de 45\u00b0 "
            "y elige la que reduce el voladizo y cabe en la cama."
        )
        split = settings.get("split", {})
        if _bool(split.get("enabled"), False):
            split_parts = _split_with_pads(body, settings)
            meshes = []
            for name, half in split_parts:
                meshes.append((name, half, body_color))
            warnings.append(
                "El perfil va dividido. Usa los agujeros de las orejetas para alinear y atornillar las mitades."
            )
        return meshes, warnings, details

    if family == "template":
        reference, reference_warnings = template_meshes(settings)
        for label, mesh, part_color in reference:
            if len(mesh.faces):
                meshes.append((label, mesh, part_color))
        warnings.extend(reference_warnings)
        details.append(
            "Base exacta del set de referencia: conserva sus canales originales. "
            "Las patas y decoraciones son añadidos paramétricos."
        )
        if _bool(settings.get("template_legs", {}).get("enabled"), False):
            details.append(
                "Las patas apoyan en la cama y elevan el conector; gíralo con el control de orientación sin perder la vertical."
            )
        if _bool(settings.get("template_decor", {}).get("enabled"), False):
            details.append(
                "La decoración se imprime aparte, plana y en su color, y se encola en la cara elegida."
            )
        return meshes, warnings, details

    if family == "calibration":
        if str(settings.get("calibration_mode", "wire")) == "peg_cutout":
            return [("Cup?n de clavija", _peg_cutout_mesh(settings), "#f2c14e")], warnings, [
                "Prueba la clavija y la holgura antes de imprimir el conector completo."
            ]
        return [("Cup?n de calibraci?n", _calibration_mesh(settings), "#f2c14e")], warnings, [
            "Imprime el cupon y prueba los cinco canales antes de exportar el conector."
        ]

    if family == "edge":
        body = _edge_mesh(settings)
        meshes.append(("Conector de borde", body, body_color))
        if decor_enabled:
            side_mode = str(decor.get("side", "front"))
            sides = [1.0] if side_mode == "front" else ([-1.0] if side_mode == "back" else [1.0, -1.0])
            for side in sides:
                plate, plate_color = _plate_mesh(settings, side)
                meshes.append(("Decoraci?n de borde", plate, plate_color))
        return meshes, warnings, [
            "El conector de borde combina un n?cleo con brazos de agarre C. Los canales se generan a partir de sus medidas."
        ]

    if family == "flat":
        meshes.append(("Placa con clavija", _flat_peg_mesh(settings), body_color))
        return meshes, warnings, [
            "La placa plana usa una clavija central; comprueba la holgura antes de imprimir."
        ]

    if family == "plate":
        body = empty_mesh()
    elif family == "leg" and str(settings.get("leg_mode", "elevated")) == "connector":
        body = _leg_connector_mesh(settings)
        if len(body.faces):
            meshes.append(("Pata conectora", body, body_color))
        if _bool(settings.get("special", {}).get("peg", False), False):
            peg_d = _clamp(_f(settings.get("special", {}).get("peg_diameter"), 5.0), 2.0, 12.0)
            peg_l = _clamp(_f(settings.get("special", {}).get("peg_length"), 8.0), 2.0, 30.0)
            meshes.append(("Clavija", cylinder_along(peg_d / 2, peg_l, (0, 0, 1), (0, 0, 0), 32), "#f2c14e"))
    else:
        # Compact solid puck with C-channel cavities, matching the wire-grid
        # connector set: grooves in the rim, scalloped lips, no protruding hub.
        if family == "leg" and not _bool(settings.get("leg", {}).get("enabled"), False):
            settings = copy.deepcopy(settings)
            settings.setdefault("leg", {})["enabled"] = True
        body = spool_mesh(settings)
        if family == "hook" or _bool(settings.get("special", {}).get("hook", False), False):
            body = body.append(_hook_mesh(settings))
        if _bool(settings.get("special", {}).get("peg", False), False):
            peg_d = _clamp(_f(settings.get("special", {}).get("peg_diameter"), 5.0), 2.0, 12.0)
            peg_l = _clamp(_f(settings.get("special", {}).get("peg_length"), 8.0), 2.0, 30.0)
            body = body.append(cylinder_along(peg_d / 2, peg_l, (0, 0, 1), (0, 0, body_size * 0.25), 32))
        body = _table_cut(body, settings)
        if decor_enabled:
            warnings.append(
                "La placa de cara está reservada a los conectores de borde y placa; "
                "este nodo estructural se genera sin placa para no tapar los canales de la reja."
            )
        if len(body.faces):
            meshes.append(("Cuerpo", body, body_color))

    if family == "plate" and decor_enabled:
        side_mode = str(decor.get("side", "front"))
        sides = [1.0] if side_mode == "front" else ([-1.0] if side_mode == "back" else [1.0, -1.0])
        for side in sides:
            plate, plate_color = _plate_mesh(settings, side)
            label = "Placa frontal" if side > 0 else "Placa trasera"
            meshes.append((label, plate, plate_color))
    if family == "plate" and not decor_enabled:
        warnings.append("La placa está desactivada; activa una decoración para generar geometría.")

    if _bool(settings.get("special", {}).get("zip_tie", False), False):
        # Two open eyes on the body side for a cable/zip tie.
        for x in (-body_size * 0.5 - 2.0, body_size * 0.5 + 2.0):
            ring = tube(3.2, 1.7, 3.0, 28)
            meshes.append(("Ojal para brida", ring.transformed(transform_matrix(translate=(x, 0, 0))), "#f2c14e"))

    # Split the structural body, not the thin decorative plate.
    split = settings.get("split", {})
    if _bool(split.get("enabled"), False):
        split_parts = _split_with_pads(body, settings)
        meshes = [m for m in meshes if m[0] != "Cuerpo"]
        for name, half in split_parts:
            meshes.append((name, half, body_color))
        warnings.append(
            "El conector va dividido. Usa los agujeros de las orejetas para alinear y atornillar las mitades."
        )
    if split.get("axis") == "z" and _bool(split.get("enabled"), False):
        details.append("Las dos mitades se imprimen con la cara de corte hacia abajo.")
    return meshes, warnings, details


def _place_on_bed(mesh: Mesh, split_axis: str | None = None, lower_half: bool = False) -> Mesh:
    if not len(mesh.faces):
        return mesh
    m = mesh.copy()
    if split_axis == "z" and lower_half:
        m = m.transformed(transform_matrix(rotate_x=math.pi))
    b = m.bounds
    m = m.translated((-(b["min"][0] + b["max"][0]) / 2.0, -(b["min"][1] + b["max"][1]) / 2.0, -b["min"][2]))
    return m


def _prepare_print_mesh(
    mesh: Mesh,
    orientation: str,
    split_axis: str | None,
    lower_half: bool,
    bed_width: float,
    bed_depth: float,
) -> tuple[Mesh, str, float]:
    """Orient a printable part, preferring the lowest 45-degree overhang.

    The assembled model is always Z-up.  For printing we test the upright pose
    plus the useful 45-degree tilts around X and Y.  The selected pose is the
    one with the least downward-facing area that fits the configured bed; this
    is the practical "print without supports" pose for these clamp shapes.
    """
    candidates: list[tuple[str, float, float, float]] = [("vertical", 0.0, 0.0, 0.0)]
    if orientation == "diagonal":
        candidates = [("diagonal Z", 0.0, 0.0, 45.0)]
    elif orientation == "auto45":
        candidates = [
            ("vertical", 0.0, 0.0, 0.0),
            ("X +45", 45.0, 0.0, 0.0),
            ("X -45", -45.0, 0.0, 0.0),
            ("Y +45", 0.0, 45.0, 0.0),
            ("Y -45", 0.0, -45.0, 0.0),
            ("XY +45", 45.0, 45.0, 0.0),
            ("XY -45", -45.0, -45.0, 0.0),
            ("X+Y", 45.0, -45.0, 0.0),
            ("X-Y", -45.0, 45.0, 0.0),
        ]

    best: tuple[Mesh, str, float] | None = None
    best_score = float("inf")
    for label, rotate_x, rotate_y, rotate_z in candidates:
        transformed = mesh.transformed(
            transform_matrix(
                rotate_x=math.radians(rotate_x),
                rotate_y=math.radians(rotate_y),
                rotate_z=math.radians(rotate_z),
            )
        )
        placed = _place_on_bed(transformed, split_axis=split_axis, lower_half=lower_half)
        bounds = placed.bounds
        dims = [bounds["max"][i] - bounds["min"][i] for i in range(3)]
        if dims[0] > bed_width + 0.01 or dims[1] > bed_depth + 0.01:
            continue
        overhang = overhang_ratio(placed)
        # Overhang dominates; height and footprint are gentle tie-breakers.
        score = overhang * 10.0 + dims[2] / max(bed_width, 1.0) * 0.05
        if score < best_score:
            best_score = score
            best = (placed, label, overhang)
    if best is None:
        placed = _place_on_bed(mesh, split_axis=split_axis, lower_half=lower_half)
        return placed, "vertical (no cabe inclinada)", overhang_ratio(placed)
    return best


def _serialize_part(
    name: str,
    mesh: Mesh,
    color: str,
    index: int,
    lower_half: bool = False,
    split_axis: str | None = None,
    orientation: str = "upright",
    diagonal: bool = False,
    bed_width: float = 256.0,
    bed_depth: float = 256.0,
) -> dict:
    b = mesh.bounds
    dims = [b["max"][i] - b["min"][i] for i in range(3)]
    effective_orientation = orientation
    if diagonal and effective_orientation not in {"auto45", "diagonal"}:
        effective_orientation = "diagonal"
    print_mesh, print_orientation, print_overhang = _prepare_print_mesh(
        mesh,
        effective_orientation,
        split_axis,
        lower_half,
        bed_width,
        bed_depth,
    )
    pb = print_mesh.bounds
    pdims = [pb["max"][i] - pb["min"][i] for i in range(3)]
    return {
        "id": f"part-{index}",
        "name": name,
        "color": color,
        "b64": base64.b64encode(mesh_to_stl(mesh)).decode("ascii"),
        "print_b64": base64.b64encode(mesh_to_stl(print_mesh)).decode("ascii"),
        "bounds": b,
        "print_bounds": pb,
        "dimensions": dims,
        "print_dimensions": pdims,
        "volume": mesh.volume(),
        "triangles": mesh.triangles,
        "watertight": is_shell_watertight(mesh),
        "overhang": overhang_ratio(mesh),
        "print_overhang": print_overhang,
        "print_orientation": print_orientation,
    }


def _material_density(material: str) -> float:
    return {
        "PLA": 1.24,
        "PETG": 1.27,
        "ABS": 1.04,
        "ASA": 1.07,
        "TPU": 1.21,
        "RESINA": 1.15,
    }.get(str(material).upper(), 1.24)


def build(payload: dict) -> dict:
    started = time.perf_counter()
    settings = _deep_merge(DEFAULTS, payload or {})
    name = str(settings.get("name") or "Conector")[:80]
    family = str(settings.get("family", "node"))
    meshes, warnings, tips = _build_connector_meshes(settings)
    if not meshes:
        raise ValueError("No se ha generado geometría. Revisa el tipo de conector y la decoración.")
    parts = []
    split_axis = str(settings.get("split", {}).get("axis", "z")) if _bool(settings.get("split", {}).get("enabled"), False) else None
    diagonal = _bool(settings.get("print", {}).get("diagonal"), False)
    print_settings = settings.get("print", {})
    orientation = str(print_settings.get("orientation", "upright") or "upright")
    bed_width = _f(print_settings.get("bed_width"), 256.0)
    bed_depth = _f(print_settings.get("bed_depth"), 256.0)
    csg_info = None
    cutters = settings.pop("_csg_cutters", None)
    for i, (part_name, mesh, color) in enumerate(meshes):
        if not len(mesh.faces):
            continue
        lower = part_name == "Cuerpo B"
        parts.append(
            _serialize_part(
                part_name,
                mesh,
                color,
                i,
                lower_half=lower,
                split_axis=split_axis,
                orientation=orientation,
                diagonal=diagonal,
                bed_width=bed_width,
                bed_depth=bed_depth,
            )
        )
    if not parts:
        raise ValueError("Las piezas generadas están vacías.")
    if cutters is not None and parts:
        csg_info = {
            "base_b64": parts[0]["b64"],
            "cutters_b64": [
                base64.b64encode(mesh_to_stl(cutter)).decode("ascii")
                for cutter in cutters
                if len(cutter.faces)
            ],
        }
    material = str(settings.get("print", {}).get("material", "PETG"))
    density = _material_density(material)
    total_volume = sum(float(p["volume"]) for p in parts) / 1000.0  # cm3
    grams = total_volume * density
    all_names = " ".join(p["name"] for p in parts)
    if "Placa" in all_names:
        tips.append("La placa decorativa se imprime plana y se acopla con el sistema de montaje elegido.")
    if _bool(settings.get("decor", {}).get("enabled"), True):
        tips.append("Prueba primero el cupón de agarre: la holgura real depende de tu impresora y filamento.")
    checks = []
    for p in parts:
        if not p["watertight"]:
            checks.append({"level": "error", "title": "Malla no estanca", "detail": f"{p['name']} tiene bordes abiertos. Prueba otra orientación o desactiva el split."})
        if p["print_overhang"] > 0.35:
            checks.append({"level": "warn", "title": "Voladizos altos", "detail": f"{p['name']} tiene un {p['print_overhang']*100:.0f}% de superficie en voladizo incluso en la orientaci\u00f3n elegida. Revisa la pieza o a\u00f1ade soportes locales."})
        elif p["print_orientation"] != "vertical":
            checks.append({"level": "info", "title": "Orientaci\u00f3n de impresi\u00f3n", "detail": f"{p['name']} se ha colocado en {p['print_orientation']} para reducir voladizos ({p['print_overhang']*100:.0f}%)."})
        bed_w = _f(settings.get("print", {}).get("bed_width"), 256.0)
        bed_d = _f(settings.get("print", {}).get("bed_depth"), 256.0)
        pd = p["print_dimensions"]
        if pd[0] > bed_w or pd[1] > bed_d or pd[2] > bed_w:
            checks.append({"level": "warn", "title": "No cabe en la cama", "detail": f"{p['name']} mide {pd[0]:.1f} × {pd[1]:.1f} × {pd[2]:.1f} mm. Activa el partido o cambia la cama."})
    for w in warnings:
        checks.append({"level": "warn", "title": "Aviso de diseño", "detail": w})
    raw_dims = [max(float(p["dimensions"][i]) for p in parts) for i in range(3)]
    return {
        "ok": True,
        "version": __version__,
        "name": name,
        "family": family,
        "parts": parts,
        # The design world is Z-up.  Keep the print part dimensions raw
        # (X/Y/Z) but present the assembled model as width/height/depth.
        "dimensions": {"width": raw_dims[0], "height": raw_dims[2], "depth": raw_dims[1]},
        "warnings": warnings,
        "tips": tips,
        "checks": checks,
        "material_grams": grams,
        "material": material,
        "build_ms": int((time.perf_counter() - started) * 1000),
        "settings": settings,
        **({"csg": csg_info} if csg_info else {}),
    }


def export_3mf(payload: dict) -> dict:
    settings = _deep_merge(DEFAULTS, payload or {})
    result = build(settings)
    selected = payload.get("parts") if isinstance(payload, dict) else None
    entries = []
    for part in result["parts"]:
        if selected and part["name"] not in selected:
            continue
        mesh = _mesh_from_print_b64(part["print_b64"])
        entries.append((part["name"], mesh, part["color"], (0.0, 0.0, 0.0)))
    if not entries:
        raise ValueError("No hay piezas para exportar.")
    # Arrange print-ready objects with a 12 mm gap and center them on the bed.
    gap = 12.0
    cursor_x = 0.0
    cursor_y = 0.0
    row_h = 0.0
    bed_w = _f(settings.get("print", {}).get("bed_width"), 256.0)
    positioned = []
    for name, mesh, color, _ in entries:
        b = mesh.bounds
        w = b["max"][0] - b["min"][0]
        d = b["max"][1] - b["min"][1]
        if cursor_x > 0 and cursor_x + w > bed_w:
            cursor_x = 0.0
            cursor_y += row_h + gap
            row_h = 0.0
        offset = (cursor_x - b["min"][0], cursor_y - b["min"][1], -b["min"][2])
        positioned.append((name, mesh.translated(offset), color, offset))
        cursor_x += w + gap
        row_h = max(row_h, d)
    data = three_mf_bytes(positioned, title=settings.get("name", "CONector Tool"))
    return {
        "ok": True,
        "filename": f"{_safe_name(settings.get('name', 'conector'))}.3mf",
        "data_b64": base64.b64encode(data).decode("ascii"),
        "objects": [e[0] for e in entries],
    }


def export_kit(payload: dict) -> dict:
    """Build several connector variants and pack their print meshes in 3MF."""
    items = payload.get("items") or []
    if not items:
        raise ValueError("No hay conectores en el kit.")
    entries: list[tuple[str, Mesh, str, tuple[float, float, float]]] = []
    gap = 10.0
    bed_w = 256.0
    cursor_x = 0.0
    cursor_y = 0.0
    row_h = 0.0
    for item in items:
        settings = _deep_merge(DEFAULTS, item.get("settings") or {})
        qty = max(1, min(50, _i(item.get("quantity"), 1)))
        result = build(settings)
        for _ in range(qty):
            for part in result["parts"]:
                mesh = _mesh_from_print_b64(part["print_b64"])
                b = mesh.bounds
                w = b["max"][0] - b["min"][0]
                d = b["max"][1] - b["min"][1]
                if cursor_x > 0 and cursor_x + w > bed_w:
                    cursor_x = 0.0
                    cursor_y += row_h + gap
                    row_h = 0.0
                shift = (cursor_x - b["min"][0], cursor_y - b["min"][1], -b["min"][2])
                entries.append((f"{result['name']} · {part['name']}", mesh.translated(shift), part["color"], shift))
                cursor_x += w + gap
                row_h = max(row_h, d)
    data = three_mf_bytes(entries, title="Kit de conectores")
    return {
        "ok": True,
        "filename": "kit-conectores.3mf",
        "data_b64": base64.b64encode(data).decode("ascii"),
        "objects": [e[0] for e in entries],
    }


def _mesh_from_print_b64(value: str) -> Mesh:
    return mesh_from_stl(base64.b64decode(value))


def mesh_from_stl(data: bytes) -> Mesh:
    if len(data) < 84:
        return empty_mesh()
    count = int(np.frombuffer(data[80:84], dtype="<u4")[0])
    if len(data) < 84 + count * 50:
        raise ValueError("STL incompleto.")
    records = np.frombuffer(data[84:84 + count * 50], dtype=np.uint8).reshape(count, 50)
    floats = records[:, :48].copy().view("<f4").reshape(count, 12)
    vertices = floats[:, 3:12].reshape(-1, 3)
    faces = np.arange(count * 3, dtype=np.int64).reshape(-1, 3)
    # Merge duplicate vertices so the mesh can be used for arrangements.
    return Mesh(vertices, faces).merged()


def analyze(payload: dict) -> dict:
    import base64 as b64

    filename = str(payload.get("filename") or "dibujo.svg")
    data = b64.b64decode(str(payload.get("data_b64") or ""))
    target = _clamp(_f(payload.get("target_mm"), 70.0), 10.0, 200.0)
    shape = analyze_bytes(data, filename, target_mm=target, force_filled=_bool(payload.get("force_filled")))
    main: Polygon = shape.main_polygon
    return {
        "ok": True,
        "shape": {
            "name": shape.name,
            "outer": [(float(x), float(y)) for x, y in main.exterior.coords[:-1]],
            "holes": [[(float(x), float(y)) for x, y in ring.coords[:-1]] for ring in main.interiors],
            "bounds": shape.bounds,
            "warnings": shape.warnings,
            "source_color": shape.source_color,
            "source_kind": shape.source_kind,
        },
    }


def _safe_name(value: str) -> str:
    text = str(value or "conector").strip().lower()
    keep = []
    for char in text:
        if char.isalnum() or char in {"-", "_"}:
            keep.append(char)
        elif char in {" ", ".", "/"}:
            keep.append("-")
    out = "".join(keep).strip("-")
    return out or "conector"
