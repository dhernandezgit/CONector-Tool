"""Feature-based parametric connector generator.

This is deliberately not a contour copy.  A connector is assembled from
editable features:

* a smooth central body whose shape, size, height and rounding are parameters;
* a list of radial ports (angle, level, reach and width) around the body;
* a C-shaped clamp at every port whose cavity width, wall, mouth, wrap and
  internal grip ribs are parameters;
* optional legs whose height, angle, reach, foot, sole, width and azimuth are
  parameters;
* optional pegs and other small add-ons.

The ports and legs are ordinary watertight extruded/lofted shells.  Overlaps
are intentional: slicers union them, which keeps the browser kernel fast and
avoids fragile 3D booleans.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from .mesh import (
    Mesh,
    c_profile,
    circle_polygon,
    cylinder,
    empty_mesh,
    extrude_polygon,
    loft_layers,
    regular_polygon,
    rounded_rect,
    transform_matrix,
)


def _f(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _b(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).lower() in {"1", "true", "yes", "on"}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _polygons(geom) -> list[Polygon]:
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if hasattr(geom, "geoms"):
        out: list[Polygon] = []
        for child in geom.geoms:
            out.extend(_polygons(child))
        return out
    return []


def _radial_rect(angle: float, r0: float, r1: float, width: float) -> Polygon:
    """A rounded radial root web from radius r0 to r1."""
    r0 = min(r0, r1 - 0.1)
    length = max(0.2, r1 - r0)
    shape = rounded_rect(length, max(1.0, width), min(width * 0.3, length * 0.25))
    shape = affinity.translate(shape, r0 + length / 2.0, 0.0)
    return affinity.rotate(shape, angle, origin=(0.0, 0.0))


def _body_polygon(settings: dict, body_radius: float, channel_radius: float) -> Polygon:
    shape = str(settings.get("body_shape", "rounded") or "rounded").lower()
    chamfer = _clamp(_f(settings.get("body_chamfer"), 3.0), 0.0, body_radius * 0.45)
    smooth = _clamp(_f(settings.get("smoothness"), 0.65), 0.0, 1.0)
    body_width = _clamp(_f(settings.get("body_width"), body_radius * 2.0), 4.0, 140.0)
    body_depth = _clamp(_f(settings.get("body_depth"), body_radius * 2.0), 4.0, 140.0)
    sx = body_width / max(0.1, body_radius * 2.0)
    sy = body_depth / max(0.1, body_radius * 2.0)
    if shape == "round":
        hub = circle_polygon(body_radius, 72)
    elif shape == "ellipse":
        hub = circle_polygon(body_radius, 72)
    elif shape == "hex":
        hub = regular_polygon(body_radius, 6, 30.0)
    elif shape == "octagon":
        hub = regular_polygon(body_radius, 8, 22.5)
    elif shape == "organic":
        hub = regular_polygon(body_radius, 12, 15.0)
        hub = hub.buffer(chamfer * 0.35, join_style=1, quad_segs=10).buffer(
            -chamfer * 0.35, join_style=1, quad_segs=10
        )
    elif shape == "teardrop":
        # A soft, tapered body: a round front and a narrower back.
        hub = circle_polygon(body_radius, 72)
        hub = affinity.scale(hub, xfact=1.15, yfact=0.86, origin=(0, 0))
        hub = affinity.rotate(hub, 180.0, origin=(0, 0))
    else:
        hub = rounded_rect(body_radius * 2.0, body_radius * 2.0, chamfer)
    if abs(sx - 1.0) > 1e-3 or abs(sy - 1.0) > 1e-3:
        hub = affinity.scale(hub, xfact=sx, yfact=sy, origin=(0.0, 0.0))

    # Blend the hub into the roots of all ports.  The double buffer removes
    # the hard junctions where an arm meets the body.
    roots: list[Polygon] = []
    for port in _normalise_ports(settings):
        if not port["enabled"]:
            continue
        angle = port["angle"]
        width = max(port["width"], channel_radius * 1.4)
        reach = body_radius * 0.85 + port["length"]
        roots.append(_radial_rect(angle, body_radius * 0.32, reach, width))
    if roots:
        hub = unary_union([hub, *roots])
    if smooth > 0.01:
        blob = smooth * max(0.4, min(2.2, body_radius * 0.10))
        hub = hub.buffer(blob, join_style=1, quad_segs=10).buffer(
            -blob, join_style=1, quad_segs=10
        )
    parts = _polygons(hub)
    if not parts:
        return circle_polygon(max(2.0, body_radius), 48)
    return max(parts, key=lambda item: item.area)


def _body_mesh(plan: Polygon, height: float, bevel: float) -> Mesh:
    bevel = _clamp(bevel, 0.0, min(height * 0.24, 5.0))
    if bevel <= 0.05:
        return extrude_polygon(plan, 0.0, height)
    inset = plan.buffer(-bevel, join_style=1, quad_segs=10)
    parts = _polygons(inset)
    if not parts or len(parts) > 1:
        return extrude_polygon(plan, 0.0, height)
    try:
        return loft_layers(
            [parts[0], plan, plan, parts[0]],
            [0.0, bevel, height - bevel, height],
            segments=max(96, min(320, int(plan.length * 5))),
        )
    except Exception:
        return extrude_polygon(plan, 0.0, height)


def _normalise_ports(settings: dict) -> list[dict[str, Any]]:
    raw_ports = settings.get("ports")
    body_size = _clamp(_f(settings.get("body_size"), 37.0), 8.0, 90.0)
    default_width = _f(settings.get("arm_width"), 0.0)
    if default_width < 5.0 or default_width > 45.0:
        default_width = max(7.0, body_size * 0.30)
    default_top = _b(settings.get("top_channels"), True)
    default_bottom = _b(settings.get("bottom_channels"), True)
    if default_top and default_bottom:
        default_level = "both"
    elif default_top:
        default_level = "top"
    elif default_bottom:
        default_level = "bottom"
    else:
        default_level = "middle"

    if isinstance(raw_ports, list):
        if not raw_ports:
            return []
        out: list[dict[str, Any]] = []
        for index, item in enumerate(raw_ports):
            if not isinstance(item, dict):
                continue
            angle = _f(item.get("angle"), 0.0) % 360.0
            level = str(item.get("level", default_level) or default_level).lower()
            if level not in {"top", "bottom", "both", "middle"}:
                level = default_level
            out.append(
                {
                    "id": str(item.get("id") or f"port-{index}"),
                    "angle": angle,
                    "level": level,
                    "length": _clamp(_f(item.get("length"), 0.0), 0.0, 80.0),
                    "width": _clamp(_f(item.get("width"), default_width), 3.0, 80.0),
                    "enabled": _b(item.get("enabled"), True),
                }
            )
        if out:
            return out

    angles: list[float] = []
    for key in ("horizontal_ports", "vertical_ports"):
        values = settings.get(key)
        if not isinstance(values, list):
            continue
        for value in values:
            try:
                angle = float(value) % 360.0
            except (TypeError, ValueError):
                continue
            if not any(abs(((angle - existing + 180.0) % 360.0) - 180.0) < 0.4 for existing in angles):
                angles.append(angle)
    if not angles:
        angles = [0.0, 90.0]
    return [
        {
            "id": f"port-{index}",
            "angle": angle,
            "level": default_level,
            "length": 0.0,
            "width": default_width,
            "enabled": True,
        }
        for index, angle in enumerate(sorted(angles))
    ]


def _channel_profile(settings: dict) -> Polygon:
    wire = _clamp(_f(settings.get("wire_diameter"), 4.0), 1.5, 12.0)
    clearance = _clamp(_f(settings.get("clearance"), 0.25), 0.0, 1.2)
    inner = _clamp(_f(settings.get("channel_width"), wire + clearance * 2.0), 1.5, 30.0)
    wall = _clamp(_f(settings.get("grip_wall"), 2.4), 1.0, 8.0)
    mouth = _clamp(_f(settings.get("mouth_width"), 3.2), 0.8, inner * 1.25 + 1.0)
    wrap = _clamp(_f(settings.get("wrap_degrees"), 305.0), 120.0, 340.0)
    ribs = int(_clamp(_f(settings.get("grip_lines"), 0.0), 0.0, 20.0))
    depth = _clamp(_f(settings.get("grip_depth"), 0.5), 0.0, inner * 0.32)
    return c_profile(
        wire_diameter=inner,
        clearance=0.0,
        wall=wall,
        mouth_width=mouth,
        wrap_degrees=wrap,
        segments=max(48, min(128, int(48 + _f(settings.get("smoothness"), 0.65) * 80))),
        grip_lines=ribs,
        grip_depth=depth,
    )


def _port_meshes(settings: dict, body_radius: float, body_height: float, channel: Polygon) -> list[Mesh]:
    out: list[Mesh] = []
    ports = [port for port in _normalise_ports(settings) if port["enabled"]]
    if not ports:
        return out
    requested_height = _clamp(_f(settings.get("port_height"), 0.0), 0.0, body_height * 0.9)
    both_height = requested_height if requested_height > 0.8 else body_height * 0.41
    for port in ports:
        angle = port["angle"]
        level = port["level"]
        if level == "both":
            spans = [(0.0, both_height), (body_height - both_height, body_height)]
        elif level == "top":
            span = requested_height if requested_height > 0.8 else body_height * 0.78
            spans = [(max(0.0, body_height - span), body_height)]
        elif level == "bottom":
            span = requested_height if requested_height > 0.8 else body_height * 0.78
            spans = [(0.0, min(body_height, span))]
        else:
            span = requested_height if requested_height > 0.8 else body_height * 0.82
            span = min(body_height, span)
            spans = [((body_height - span) / 2.0, (body_height + span) / 2.0)]
        origin_r = max(0.5, body_radius + port["length"] - 0.8)
        for z0, z1 in spans:
            if z1 <= z0 + 0.05:
                continue
            piece = extrude_polygon(channel, z0, z1 - z0)
            piece = piece.transformed(transform_matrix(rotate_z=math.radians(angle - 90.0)))
            piece = piece.translated(
                (
                    origin_r * math.cos(math.radians(angle)),
                    origin_r * math.sin(math.radians(angle)),
                    0.0,
                )
            )
            out.append(piece)
    return out


def _leg_mesh(settings: dict, body_radius: float, body_height: float, body_z: float) -> Mesh:
    leg = settings.get("leg") or {}
    if not _b(leg.get("enabled"), False):
        return empty_mesh()
    height = _clamp(_f(leg.get("height"), 40.0), 0.0, 220.0)
    angle = _clamp(_f(leg.get("angle"), 0.0), 0.0, 75.0)
    reach = _clamp(_f(settings.get("leg_length"), 48.0) * 0.7, 4.0, 140.0)
    foot = _clamp(_f(leg.get("foot"), 24.0), 6.0, 80.0)
    sole = _clamp(_f(leg.get("sole"), 3.0), 1.0, 8.0)
    width = _clamp(_f(settings.get("leg_width"), 12.0), 4.0, 40.0)
    thickness = _clamp(_f(settings.get("leg_thickness"), 4.0), 2.0, 12.0)
    azimuth = _clamp(_f(settings.get("leg_azimuth"), 0.0), 0.0, 360.0)
    # The body sits above the foot; the leg is a smooth capsule in the XZ
    # plane, extruded across Y.  The foot disc lands flat on the bed.
    beam_z = max(sole * 0.5, width * 0.5)
    p0 = (body_radius * 0.72, body_z + beam_z)
    drop = max(2.0, height - sole)
    p1 = (body_radius + reach + math.tan(math.radians(angle)) * drop, beam_z)
    path = LineString([p0, p1])
    side = path.buffer(width * 0.5, cap_style=1, join_style=1, quad_segs=12)
    # The foot is a flat pad in the XY plane, not a disc in the side profile.
    # This keeps the bottom of the foot on z=0 and makes the leg printable.
    piece = extrude_polygon(side, -thickness * 0.5, thickness)
    matrix = np.array(
        [[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1]],
        dtype=float,
    )
    piece = piece.transformed(matrix)
    pad = extrude_polygon(circle_polygon(max(1.0, foot * 0.5), 36), 0.0, sole)
    pad = pad.translated((p1[0], 0.0, 0.0))
    piece = piece.append(pad)
    if abs(azimuth) > 0.01:
        piece = piece.transformed(transform_matrix(rotate_z=math.radians(azimuth)))
    return piece


def parametric_mesh(settings: dict) -> Mesh:
    """Build a connector from its feature parameters."""
    body_size = _clamp(_f(settings.get("body_size"), 37.0), 8.0, 90.0)
    body_height = _clamp(_f(settings.get("body_height"), 26.0), 6.0, 100.0)
    raw_width = _f(settings.get("body_width"), 0.0)
    raw_depth = _f(settings.get("body_depth"), 0.0)
    body_width = _clamp(raw_width if raw_width > 0.1 else body_size, 4.0, 140.0)
    body_depth = _clamp(raw_depth if raw_depth > 0.1 else body_size, 4.0, 140.0)
    channel = _channel_profile(settings)
    # Keep the ports on the rim of the editable body.  The smaller plan
    # dimension controls the hub radius; the root webs carry the remaining
    # width/depth out to the channels.
    profile_bounds = np.asarray(channel.exterior.coords, dtype=float)
    channel_radius = max(
        float(np.max(np.abs(profile_bounds[:, 0]))),
        float(np.max(np.abs(profile_bounds[:, 1]))),
    )
    body_radius = max(2.0, min(body_width, body_depth) * 0.5 - channel_radius * 0.72)
    plan = _body_polygon(settings, body_radius, channel_radius)
    bevel = _f(settings.get("body_chamfer"), 3.0) * (0.4 + 0.6 * _clamp(_f(settings.get("smoothness"), 0.65), 0.0, 1.0))
    leg = settings.get("leg") or {}
    body_z = _clamp(_f(leg.get("height"), 0.0), 0.0, 220.0) if _b(leg.get("enabled"), False) else 0.0
    body = _body_mesh(plan, body_height, bevel)
    body = body.translated((0.0, 0.0, body_z))

    out = body
    ports = _port_meshes(settings, body_radius, body_height, channel)
    for piece in ports:
        out = out.append(piece.translated((0.0, 0.0, body_z)))
    out = out.append(_leg_mesh(settings, body_radius, body_height, body_z))

    special = settings.get("special") or {}
    if _b(special.get("peg"), False):
        peg_d = _clamp(_f(special.get("peg_diameter"), 5.0), 1.5, 20.0)
        peg_l = _clamp(_f(special.get("peg_length"), 8.0), 1.0, 40.0)
        out = out.append(cylinder(peg_d * 0.5, peg_l, 40, body_z + body_height))

    if _b(settings.get("template_mirror"), False):
        out = out.transformed(
            np.array([[-1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], dtype=float)
        ).oriented()
    # Center on X/Y and put the lowest point on the print bed.
    b = out.bounds
    out = out.translated(
        (
            -(b["min"][0] + b["max"][0]) / 2.0,
            -(b["min"][1] + b["max"][1]) / 2.0,
            -b["min"][2],
        )
    )
    return out
