"""Parametric spool connector family for wire-grid displays.

The geometry is an original reconstruction of the reference grammar: a
central belt that grips vertical wires and petal-shaped arms above and below
that grip horizontal wires.  Everything is generated from dimensions.
"""

from __future__ import annotations

import math
from typing import Any

from shapely import affinity
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

from .mesh import Mesh, empty_mesh, extrude_polygon

PRESET_PORTS: dict[str, dict[str, Any]] = {
    "corner90": {"h": [0.0, 90.0], "v": [45.0], "top": True, "bottom": True, "h_height": 22.6, "size": 46.0, "belt": 8.0},
    "corner3d": {"h": [0.0, 90.0, 180.0], "v": [45.0, 135.0], "top": True, "bottom": True, "h_height": 22.6, "size": 46.0, "belt": 8.0},
    "flat": {"h": [0.0, 180.0], "v": [], "top": True, "bottom": False, "h_height": 12.0, "size": 38.0, "belt": 8.0},
    "tee": {"h": [0.0, 90.0, 180.0], "v": [], "top": True, "bottom": True, "h_height": 15.0, "size": 38.0, "belt": 8.0},
    "cross": {"h": [0.0, 90.0, 180.0, 270.0], "v": [], "top": True, "bottom": True, "h_height": 15.0, "size": 38.0, "belt": 8.0},
    "six": {"h": [0.0, 90.0, 180.0, 270.0], "v": [45.0, 135.0, 225.0, 315.0], "top": True, "bottom": True, "h_height": 41.0, "size": 38.0, "belt": 13.0},
    "horizontal1": {"h": [0.0], "v": [], "top": True, "bottom": False, "h_height": 11.0, "size": 38.0, "belt": 6.0},
    "horizontal2": {"h": [0.0, 90.0], "v": [], "top": True, "bottom": False, "h_height": 11.0, "size": 46.0, "belt": 6.0},
    "horizontal4": {"h": [0.0, 90.0, 180.0, 270.0], "v": [], "top": True, "bottom": False, "h_height": 11.0, "size": 38.0, "belt": 6.0},
    "vertical1": {"h": [], "v": [45.0], "top": False, "bottom": False, "h_height": 22.6, "size": 46.0, "belt": 8.0},
    "vertical2": {"h": [], "v": [45.0, 135.0], "top": False, "bottom": False, "h_height": 22.6, "size": 46.0, "belt": 8.0},
    "single": {"h": [0.0], "v": [45.0], "top": True, "bottom": True, "h_height": 22.6, "size": 38.0, "belt": 8.0},
    "angle": {"h": [0.0, 45.0], "v": [], "top": True, "bottom": True, "h_height": 22.6, "size": 46.0, "belt": 8.0},
    "custom": {"h": [0.0, 90.0], "v": [45.0], "top": True, "bottom": True, "h_height": 22.6, "size": 46.0, "belt": 8.0},
}


def _f(v: Any, d: float) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def _b(v: Any, d: bool) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return d
    return str(v).lower() in {"1", "true", "yes", "on"}


def _angles(values: Any, fallback: list[float]) -> list[float]:
    out: list[float] = []
    if not isinstance(values, list):
        return list(fallback)
    for value in values:
        try:
            a = float(value) % 360.0
        except (TypeError, ValueError):
            continue
        if not any(abs(((a - b + 180.0) % 360.0) - 180.0) < 0.5 for b in out):
            out.append(a)
    return out


def _sector(a0: float, a1: float, r: float, segments: int = 72) -> Polygon:
    span = (a1 - a0) % 360.0
    if span < 0.1:
        span = 360.0
    pts = [(0.0, 0.0)]
    for i in range(segments + 1):
        a = math.radians(a0 + span * i / segments)
        pts.append((r * math.cos(a), r * math.sin(a)))
    p = Polygon(pts)
    return p if p.is_valid else p.buffer(0)


def _ring_sector(a0: float, a1: float, outer: float, inner: float) -> Polygon:
    if (a1 - a0) % 360.0 < 0.1:
        return Point(0, 0).buffer(outer, quad_segs=72).difference(Point(0, 0).buffer(inner, quad_segs=72))
    return _sector(a0, a1, outer).difference(Point(0, 0).buffer(inner, quad_segs=72))


def _petal(angle: float, width: float, inner: float, outer: float, clip: Polygon | None) -> Polygon:
    p = _sector(angle - width / 2, angle + width / 2, outer).difference(Point(0, 0).buffer(inner, quad_segs=48))
    if clip is not None:
        p = p.intersection(clip)
    return p


def _radial_strip(angle: float, half: float, r0: float, r1: float) -> Polygon:
    return affinity.rotate(box(r0, -half, r1, half), angle, origin=(0, 0))


def _vertical_void(angle: float, radius: float, wire_r: float, mouth: float) -> Polygon:
    a = math.radians(angle)
    c = (radius * math.cos(a), radius * math.sin(a))
    cav = Point(c).buffer(wire_r, quad_segs=32)
    corridor = affinity.translate(
        affinity.rotate(box(0, -mouth / 2, 200, mouth / 2), angle, origin=(0, 0)),
        *c,
    )
    return unary_union([cav, corridor])


def _arm_mesh(
    angle: float,
    width: float,
    inner: float,
    outer: float,
    clip: Polygon | None,
    z0: float,
    height: float,
    top: bool,
    wire_r: float,
    mouth: float,
    scallops: bool,
    scallop_count: int,
) -> Mesh:
    petal = _petal(angle, width, inner, outer, clip)
    if petal.is_empty:
        return empty_mesh()
    depth = min(height - 0.8, wire_r * 2.0 + 2.0)
    base_h = max(0.6, height - depth)
    broad = _radial_strip(angle, wire_r, inner - 1.0, outer + 2.0)
    narrow = _radial_strip(angle, mouth / 2.0, inner - 1.0, outer + 2.0)
    parts: list[Mesh] = []
    if top:
        parts.append(extrude_polygon(petal, z0, base_h))
        cavity = petal.difference(broad)
        if cavity.is_empty:
            cavity = petal
        parts.append(extrude_polygon(cavity, z0 + base_h, depth - 1.1))
        lip = petal.difference(narrow)
        if scallops:
            a = math.radians(angle)
            bites: list[Polygon] = []
            for i in range(max(1, scallop_count)):
                rr = inner + (outer - inner) * (0.32 + i * 0.16)
                for side in (-1, 1):
                    px = rr * math.cos(a) - side * (mouth / 2.0 + 0.35) * math.sin(a)
                    py = rr * math.sin(a) + side * (mouth / 2.0 + 0.35) * math.cos(a)
                    bites.append(Point(px, py).buffer(0.75, quad_segs=10))
            lip = lip.difference(unary_union(bites))
        parts.append(extrude_polygon(lip, z0 + height - 1.1, 1.1))
    else:
        # Mirror the top construction around the arm's local base.
        parts.append(extrude_polygon(petal, z0 + height - base_h, base_h))
        cavity = petal.difference(broad)
        if cavity.is_empty:
            cavity = petal
        parts.append(extrude_polygon(cavity, z0 + 1.1, max(0.2, depth - 1.1)))
        lip = petal.difference(narrow)
        if scallops:
            a = math.radians(angle)
            bites = []
            for i in range(max(1, scallop_count)):
                rr = inner + (outer - inner) * (0.32 + i * 0.16)
                for side in (-1, 1):
                    px = rr * math.cos(a) - side * (mouth / 2.0 + 0.35) * math.sin(a)
                    py = rr * math.sin(a) + side * (mouth / 2.0 + 0.35) * math.cos(a)
                    bites.append(Point(px, py).buffer(0.75, quad_segs=10))
            lip = lip.difference(unary_union(bites))
        parts.append(extrude_polygon(lip, z0, 1.1))
    out = empty_mesh()
    for part in parts:
        out = out.append(part)
    return out


def spool_mesh(settings: dict[str, Any]) -> Mesh:
    preset = str(settings.get("joint_preset", "corner90"))
    base = PRESET_PORTS.get(preset, PRESET_PORTS["corner90"])
    horizontal = settings.get("horizontal_ports")
    vertical = settings.get("vertical_ports")
    if preset in PRESET_PORTS and preset not in {"custom", "angle"} and settings.get("family") != "angle":
        horizontal = list(base["h"])
        vertical = list(base["v"])
        top = bool(base["top"])
        bottom = bool(base["bottom"])
    else:
        horizontal = _angles(horizontal if isinstance(horizontal, list) else base["h"], base["h"])
        vertical = _angles(vertical if isinstance(vertical, list) else base["v"], base["v"])
        top = _b(settings.get("top_channels"), bool(base["top"]))
        bottom = _b(settings.get("bottom_channels"), bool(base["bottom"]))
    if preset == "angle" or settings.get("family") == "angle":
        angle = max(5.0, min(175.0, _f(settings.get("angle"), 90.0)))
        horizontal = [0.0, angle]
        vertical = []
    horizontal = sorted(set(horizontal))
    vertical = sorted(set(vertical))
    if not horizontal and not vertical:
        horizontal = [0.0, 90.0]
    height = max(10.0, min(80.0, _f(settings.get("body_height"), _f(base.get("h_height"), 22.6))))
    size = max(12.0, min(90.0, _f(settings.get("body_size"), _f(base.get("size"), 38.0))))
    radius = size / 2.0
    belt_h = max(5.0, min(height * 0.55, _f(settings.get("belt_height"), _f(base.get("belt"), 8.0))))
    if top and bottom:
        arm_h = max(2.2, (height - belt_h) / 2.0)
        belt_z0 = height / 2.0 - belt_h / 2.0
    elif top:
        arm_h = max(2.2, height - belt_h)
        belt_z0 = 0.0
    elif bottom:
        arm_h = max(2.2, height - belt_h)
        belt_z0 = height - belt_h
    else:
        arm_h = 0.0
        belt_h = height
        belt_z0 = 0.0
    wire = max(1.5, min(12.0, _f(settings.get("wire_diameter"), 4.0)))
    clearance = max(0.0, min(1.2, _f(settings.get("clearance"), 0.25)))
    wire_r = wire / 2.0 + clearance
    mouth = max(1.0, min(wire * 0.99, _f(settings.get("mouth_width"), 3.2)))
    wall = max(2.0, min(8.0, _f(settings.get("grip_wall"), 2.8)))
    belt_wall = max(wire + 1.0, min(radius * 0.65, _f(settings.get("belt_wall"), 4.2)))
    inner = max(0.35 * radius, wire_r + 1.2)
    arm_width = max(22.0, min(160.0, _f(settings.get("arm_width"), 76.0)))
    scallops = _b(settings.get("scallops"), True)
    scallop_count = max(1, min(8, int(_f(settings.get("scallop_count"), 4))))
    style = str(settings.get("body_style", "auto"))

    # The belt occupies the angular span of the arms; four or more arms make
    # a full ring.  With fewer arms the body becomes the characteristic sector.
    dirs = sorted(set(horizontal + vertical))
    if style == "full" or not dirs or len(dirs) >= 4:
        a0, a1 = 0.0, 360.0
    else:
        if len(dirs) == 1:
            a0, a1 = dirs[0] - arm_width / 2 - 5.0, dirs[0] + arm_width / 2 + 5.0
        else:
            gaps = []
            for i, start in enumerate(dirs):
                end = dirs[(i + 1) % len(dirs)]
                gap = (end - start) % 360.0
                if i == len(dirs) - 1:
                    gap = 360.0 - start + end
                gaps.append((gap, start, end))
            gap, gap_start, gap_end = max(gaps, key=lambda item: item[0])
            span = 360.0 - gap
            a0 = gap_end - 4.0
            a1 = gap_end + span + 4.0
            if span > 250.0:
                a0, a1 = 0.0, 360.0
    body_clip = _sector(a0, a1, radius + 1.2) if (a1 - a0) % 360.0 > 0.1 else None
    body_ring = _ring_sector(a0, a1, radius, radius - belt_wall)
    # Vertical C channels in the belt.
    for angle in vertical:
        body_ring = body_ring.difference(_vertical_void(angle, radius - belt_wall * 0.5, wire_r, mouth))
    body = extrude_polygon(body_ring, belt_z0, belt_h)
    # Petal arms.
    for angle in horizontal:
        if top:
            arm = _arm_mesh(angle, arm_width, inner, radius, body_clip, belt_z0 + belt_h - 0.7, arm_h + 0.7, True, wire_r, mouth, scallops, scallop_count)
            body = body.append(arm)
        if bottom:
            arm = _arm_mesh(angle, arm_width, inner, radius, body_clip, 0.0, arm_h + 0.7, False, wire_r, mouth, scallops, scallop_count)
            body = body.append(arm)
    # Central leg / elevation.
    leg = settings.get("leg", {})
    if _b(leg.get("enabled"), False):
        leg_h = max(8.0, min(220.0, _f(leg.get("height"), 50.0)))
        leg_angle = max(0.0, min(55.0, _f(leg.get("angle"), 0.0)))
        foot = max(8.0, min(70.0, _f(leg.get("foot"), 24.0))) / 2.0
        sole = max(1.0, min(8.0, _f(leg.get("sole"), 3.0)))
        # Raise the spool and put a strut below it.
        body = body.translated((0, 0, leg_h))
        a = math.radians(leg_angle)
        direction = (math.sin(a), 0.0, -math.cos(a))
        top = (0.0, 0.0, leg_h)
        from .mesh import cylinder_along, cylinder
        length = leg_h / max(0.2, math.cos(a))
        strut = cylinder_along(4.0, length, direction, top, 28)
        foot_center = (top[0] + direction[0] * length, top[1], top[2] + direction[2] * length)
        foot_mesh = cylinder(foot, sole, 36, max(0.0, foot_center[2] - sole))
        brace = cylinder_along(6.8, min(9.0, leg_h * 0.2), direction, top, 28)
        body = body.append(strut).append(brace).append(foot_mesh)
    # Move the lowest point to z=0 for printing / preview.
    b = body.bounds
    body = body.translated((-(b["min"][0] + b["max"][0]) / 2.0, -(b["min"][1] + b["max"][1]) / 2.0, -b["min"][2]))
    return body
