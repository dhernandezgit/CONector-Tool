"""Parametric wire-grid connector family.

The reference parts are compact, solid pucks with C-shaped wire channels cut
into their rims.  They are not a hub with protruding tubes.  This module
builds that language with stacked 2D sections: every layer is a closed
profile, so the result slices reliably while still allowing the wire grooves
and the scalloped snap lips to change with height.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from shapely import affinity
from shapely.geometry import MultiPolygon, Point, Polygon, box
from shapely.ops import unary_union

from .mesh import Mesh, empty_mesh, extrude_polygon

PRESET_PORTS: dict[str, dict[str, Any]] = {
    "horizontal1": {"h": [0.0], "top": True, "bottom": False, "v": [], "h_height": 11.0},
    "horizontal2": {"h": [0.0, 90.0], "top": True, "bottom": False, "v": [], "h_height": 11.0},
    "horizontal4": {"h": [0.0, 90.0, 180.0, 270.0], "top": True, "bottom": False, "v": [], "h_height": 11.0},
    "vertical1": {"h": [], "top": False, "bottom": False, "v": [0.0], "h_height": 22.6},
    "vertical2": {"h": [], "top": False, "bottom": False, "v": [0.0, 90.0], "h_height": 22.6},
    "corner90": {"h": [0.0, 90.0], "top": True, "bottom": True, "v": [0.0, 90.0], "h_height": 22.6},
    "flat": {"h": [0.0, 180.0], "top": True, "bottom": False, "v": [], "h_height": 12.0},
    "tee": {"h": [0.0, 90.0, 180.0], "top": True, "bottom": True, "v": [], "h_height": 15.0},
    "cross": {"h": [0.0, 90.0, 180.0, 270.0], "top": True, "bottom": True, "v": [], "h_height": 15.0},
    "corner3d": {"h": [0.0, 90.0], "top": True, "bottom": True, "v": [0.0, 90.0], "h_height": 22.6},
    "four3d": {"h": [0.0, 90.0, 180.0], "top": True, "bottom": True, "v": [0.0, 90.0, 180.0], "h_height": 24.0},
    "five": {"h": [0.0, 90.0, 180.0, 270.0], "top": True, "bottom": True, "v": [0.0, 90.0, 180.0], "h_height": 24.0},
    "six": {"h": [0.0, 90.0, 180.0, 270.0], "top": True, "bottom": True, "v": [0.0, 90.0, 180.0, 270.0], "h_height": 26.0},
    "single": {"h": [0.0], "top": True, "bottom": True, "v": [0.0], "h_height": 22.6},
    "angle": {"h": [], "top": True, "bottom": True, "v": [], "h_height": 22.6},
    "custom": {"h": [], "top": True, "bottom": True, "v": [], "h_height": 22.6},
}


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


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _norm_angles(values: list[Any], fallback: list[float]) -> list[float]:
    out: list[float] = []
    for value in values:
        try:
            angle = float(value) % 360.0
        except (TypeError, ValueError):
            continue
        if not any(abs(((angle - other + 180.0) % 360.0) - 180.0) < 0.5 for other in out):
            out.append(angle)
    return out or list(fallback)


def _sector(a0: float, a1: float, radius: float, segments: int = 96) -> Polygon:
    pts: list[tuple[float, float]] = [(0.0, 0.0)]
    span = (a1 - a0) % 360.0
    if span < 0.1:
        span = 360.0
    for i in range(segments + 1):
        a = math.radians(a0 + span * i / segments)
        pts.append((radius * math.cos(a), radius * math.sin(a)))
    poly = Polygon(pts)
    return poly if poly.is_valid else poly.buffer(0)


def _radial_strip(angle_deg: float, half_width: float, r0: float = -4.0, r1: float = 200.0) -> Polygon:
    """A rectangle aligned with a radial direction."""
    p = box(r0, -half_width, r1, half_width)
    return affinity.rotate(p, angle_deg, origin=(0, 0))


def _vertical_void(angle_deg: float, radius: float, wire_radius: float, mouth: float) -> Polygon:
    a = math.radians(angle_deg)
    cx, cy = radius * math.cos(a), radius * math.sin(a)
    circle = Point(cx, cy).buffer(wire_radius, quad_segs=40)
    corridor = affinity.rotate(box(0, -mouth / 2, 180, mouth / 2), angle_deg, origin=(0, 0))
    corridor = affinity.translate(corridor, cx, cy)
    return unary_union([circle, corridor])


def _footprint(
    horizontal: list[float],
    vertical: list[float],
    radius: float,
    style: str,
    margin_deg: float,
) -> Polygon:
    directions = sorted(set(horizontal + vertical))
    if style == "full" or not directions or len(directions) >= 4:
        return Point(0, 0).buffer(radius, quad_segs=96)
    if style == "sector" and len(directions) < 2:
        return Point(0, 0).buffer(radius, quad_segs=96)
    if len(directions) == 1:
        return Point(0, 0).buffer(radius, quad_segs=96)
    gaps: list[tuple[float, float, float]] = []
    ordered = sorted(directions)
    for i, start in enumerate(ordered):
        end = ordered[(i + 1) % len(ordered)]
        gap = (end - start) % 360.0
        if i == len(ordered) - 1:
            gap = 360.0 - start + end
        gaps.append((gap, start, end))
    biggest = max(gaps, key=lambda item: item[0])
    if biggest[0] > 300.0:
        return Point(0, 0).buffer(radius, quad_segs=96)
    start = biggest[2] % 360.0
    end = biggest[1] % 360.0
    span = (end - start) % 360.0
    if span > 240.0:
        return Point(0, 0).buffer(radius, quad_segs=96)
    poly = _sector(start - margin_deg, start + span + margin_deg, radius)
    return poly


def _groove_void(
    z: float,
    top_z: float,
    bottom_z: float,
    angles: list[float],
    wire_radius: float,
    half_lip: float,
    wire_offsets: list[float],
    scallops: bool,
    scallop_count: int,
    radius: float,
) -> list[Polygon]:
    voids: list[Polygon] = []
    for zc, is_top in ((top_z, True), (bottom_z, False)):
        dz = z - zc
        if abs(dz) > wire_radius:
            continue
        broad = math.sqrt(max(0.0, wire_radius * wire_radius - dz * dz))
        # Above/below the wire centre the slot narrows to the flexible lip.
        half = half_lip if ((is_top and dz >= 0.0) or ((not is_top) and dz <= 0.0)) else broad
        for angle in angles:
            a = math.radians(angle)
            for offset in wire_offsets:
                p = _radial_strip(angle, half)
                if offset:
                    p = affinity.translate(p, -offset * math.sin(a), offset * math.cos(a))
                voids.append(p)
            if scallops and ((is_top and dz > 0.35) or ((not is_top) and dz < -0.35)):
                for index in range(max(1, scallop_count)):
                    rr = min(radius - 2.2, radius * 0.32 + index * max(3.0, radius * 0.14))
                    for offset in wire_offsets:
                        for side in (-1, 1):
                            px = rr * math.cos(a) - side * (half + 0.22 + offset) * math.sin(a)
                            py = rr * math.sin(a) + side * (half + 0.22 + offset) * math.cos(a)
                            voids.append(Point(px, py).buffer(0.82, quad_segs=12))
    return voids


def wire_node_mesh(
    settings: dict[str, Any],
    z_start: float = 0.0,
    z_end: float | None = None,
    cap_start: bool = False,
    cap_end: bool = False,
) -> MeshLike:
    """Build a compact wire-grid connector from the current settings.

    A sub-range is used for printable halves: each half keeps its own closed
    layers and a flat cap at the cut plane.
    """
    preset = str(settings.get("joint_preset", "corner90"))
    base = PRESET_PORTS.get(preset, PRESET_PORTS["corner90"])
    if preset in PRESET_PORTS and preset not in {"custom", "angle"} and settings.get("family") != "angle":
        horizontal = list(base["h"])
        vertical = list(base["v"])
        top = bool(base["top"])
        bottom = bool(base["bottom"])
    else:
        horizontal = settings.get("horizontal_ports")
        vertical = settings.get("vertical_ports")
        if not isinstance(horizontal, list):
            horizontal = base["h"]
        if not isinstance(vertical, list):
            vertical = base["v"]
        top = _b(settings.get("top_channels"), bool(base["top"]))
        bottom = _b(settings.get("bottom_channels"), bool(base["bottom"]))
    if preset == "angle" or settings.get("family") == "angle":
        angle = _clamp(_f(settings.get("angle"), 90.0), 5.0, 175.0)
        horizontal = [0.0, angle]
        vertical = []
    horizontal = _norm_angles(horizontal, [])
    vertical = _norm_angles(vertical, []) if vertical else []
    if not horizontal and not vertical:
        horizontal = [0.0, 90.0]
    if not top and not bottom and not vertical:
        top = True
    height = _clamp(_f(settings.get("body_height"), _f(base.get("h_height"), 22.6)), 6.0, 70.0)
    size = _clamp(_f(settings.get("body_size"), 38.0), 10.0, 80.0)
    wire = _clamp(_f(settings.get("wire_diameter"), 4.0), 1.5, 12.0)
    clearance = _clamp(_f(settings.get("clearance"), 0.25), 0.0, 1.2)
    wire_r = wire / 2.0 + clearance
    mouth = _clamp(_f(settings.get("mouth_width"), wire * 0.8), 1.0, wire * 0.99)
    wire_count = max(1, min(3, int(_f(settings.get("wire_count"), 1))))
    spacing = _clamp(_f(settings.get("wire_spacing"), 5.0), 0.0, 20.0)
    offsets = [0.0] if wire_count <= 1 else [
        (i - (wire_count - 1) / 2.0) * spacing for i in range(wire_count)
    ]
    wall = _clamp(_f(settings.get("grip_wall"), 2.4), 1.2, 8.0)
    core_r = max(2.8, mouth * 0.9)
    margin = math.degrees(math.asin(min(0.82, (mouth / 2.0 + wall * 0.55) / max(12.0, size))))
    style = str(settings.get("body_style", "auto"))
    sector_body = len(set(horizontal + vertical)) < 4 and not (style == "full")
    radius = size if sector_body else size / 2.0
    if len(set(horizontal + vertical)) <= 1:
        sector_body = False
        radius = size / 2.0
    if vertical:
        margin = max(margin, math.degrees(math.asin(min(0.82, (wire_r + wall * 0.9) / max(12.0, radius)))))
    body = _footprint(horizontal, vertical, radius, style, margin)
    if body.is_empty:
        raise ValueError("El perfil del conector está vacío.")

    top_z = height - max(1.1, wire_r * 0.65)
    bottom_z = max(1.1, wire_r * 0.65)
    if bottom_z + wire_r + 1.2 > height:
        bottom = False
        bottom_z = max(1.1, wire_r * 0.65)
    if top_z - wire_r - 1.2 < 0:
        top = False

    vertical_voids = [
        _vertical_void(angle, max(wire_r + wall, radius - (wire_r + wall * 0.9)), wire_r, mouth)
        for angle in vertical
    ]
    scallops = _b(settings.get("scallops"), True)
    scallop_count = max(1, min(8, int(_f(settings.get("scallop_count"), 4))))
    z0 = _clamp(float(z_start), 0.0, height)
    z1 = _clamp(float(height if z_end is None else z_end), z0, height)
    if z1 - z0 < 0.2:
        return empty_mesh()

    def make_layer(z: float) -> Polygon:
        layer = body
        edge = min(z, height - z)
        if edge < 1.0:
            inset = (1.0 - edge) * 0.65
            shrunk = layer.buffer(-inset, join_style=1, quad_segs=8)
            if not shrunk.is_empty:
                layer = shrunk
        voids: list[Polygon] = list(vertical_voids)
        if top:
            if z >= top_z:
                if not top_lip.is_empty:
                    voids.append(top_lip)
                if not top_bites.is_empty:
                    voids.append(top_bites)
            else:
                dz = z - top_z
                if abs(dz) <= wire_r:
                    q = math.sqrt(max(0.0, wire_r * wire_r - dz * dz))
                    for angle in horizontal:
                        a = math.radians(angle)
                        for offset in offsets:
                            p = _radial_strip(angle, q, core_r, 200.0)
                            if offset:
                                p = affinity.translate(p, -offset * math.sin(a), offset * math.cos(a))
                            voids.append(p)
        if bottom:
            if z <= bottom_z:
                if not bottom_lip.is_empty:
                    voids.append(bottom_lip)
                if not bottom_bites.is_empty:
                    voids.append(bottom_bites)
            else:
                dz = z - bottom_z
                if abs(dz) <= wire_r:
                    q = math.sqrt(max(0.0, wire_r * wire_r - dz * dz))
                    for angle in horizontal:
                        a = math.radians(angle)
                        for offset in offsets:
                            p = _radial_strip(angle, q, core_r, 200.0)
                            if offset:
                                p = affinity.translate(p, -offset * math.sin(a), offset * math.cos(a))
                            voids.append(p)
        if voids:
            layer = layer.difference(unary_union(voids))
        return layer

    def lip_union(angles: list[float]) -> tuple[Polygon, Polygon]:
        strips: list[Polygon] = []
        bites: list[Polygon] = []
        for angle in angles:
            a = math.radians(angle)
            for offset in offsets:
                p = _radial_strip(angle, mouth / 2.0, core_r, 200.0)
                if offset:
                    p = affinity.translate(p, -offset * math.sin(a), offset * math.cos(a))
                strips.append(p)
                if scallops:
                    for index in range(max(1, scallop_count)):
                        rr = min(radius - 2.2, radius * 0.32 + index * max(3.0, radius * 0.14))
                        for side in (-1, 1):
                            px = rr * math.cos(a) - side * (mouth / 2.0 + 0.22 + offset) * math.sin(a)
                            py = rr * math.sin(a) + side * (mouth / 2.0 + 0.22 + offset) * math.cos(a)
                            bites.append(Point(px, py).buffer(0.82, quad_segs=12))
        return unary_union(strips) if strips else Polygon(), unary_union(bites) if bites else Polygon()

    top_lip, top_bites = lip_union(horizontal) if top else (Polygon(), Polygon())
    bottom_lip, bottom_bites = lip_union(horizontal) if bottom else (Polygon(), Polygon())

    # A small number of z slabs is enough for a printable C-channel.  This
    # keeps geometry generation fast enough for live sliders while preserving
    # the narrow snap lip and the wider wire cavity.
    cuts: set[float] = {0.0, height}
    if top:
        cuts.add(max(0.0, min(height, top_z - wire_r)))
        cuts.add(max(0.0, min(height, top_z)))
        cuts.add(max(0.0, min(height, top_z - wire_r * 0.5)))
    if bottom:
        cuts.add(max(0.0, min(height, bottom_z)))
        cuts.add(max(0.0, min(height, bottom_z + wire_r)))
        cuts.add(max(0.0, min(height, bottom_z + wire_r * 0.5)))
    # Extra thin slabs at the two faces soften the visual edge.
    cuts.add(0.5)
    cuts.add(height - 0.5)
    cuts = {round(value, 4) for value in cuts if value >= z0 - 1e-6 and value <= z1 + 1e-6}
    cuts.add(round(z0, 4))
    cuts.add(round(z1, 4))
    ordered = sorted(cuts)
    slabs: list[tuple[float, float]] = []
    for a, b in zip(ordered, ordered[1:]):
        if b - a > 0.08:
            slabs.append((a, b))

    parts: list[MeshLike] = []
    for a, b in slabs:
        z = (a + b) / 2.0
        layer = make_layer(z)
        if layer.is_empty:
            continue
        parts.append(extrude_polygon(layer, a - 0.012, b - a + 0.024))
    # Flat cut caps for printable halves.  They are inside the half so the
    # two pieces meet cleanly at the split plane.
    if cap_end and z1 < height - 0.01:
        cut = make_layer(z1)
        if not cut.is_empty:
            parts.append(extrude_polygon(cut, z1 - 0.42, 0.44))
    if cap_start and z0 > 0.01:
        cut = make_layer(z0)
        if not cut.is_empty:
            parts.append(extrude_polygon(cut, z0 - 0.02, 0.44))
    if not parts:
        raise ValueError("Las ranuras han eliminado toda la pieza. Reduce la boca o aumenta el cuerpo.")
    out = empty_mesh()
    for part in parts:
        out = out.append(part)
    return out


MeshLike = Mesh
