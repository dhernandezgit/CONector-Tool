"""Original decorative silhouettes and import helpers."""

from __future__ import annotations

import math
from typing import Iterable

import numpy as np
from shapely import affinity
from shapely.geometry import MultiPolygon, Point, Polygon, box
from shapely.ops import unary_union

from .mesh import clean_polygon, rounded_rect


def _ellipse(cx: float, cy: float, rx: float, ry: float, segments: int = 48) -> Polygon:
    t = np.linspace(0, math.tau, max(16, segments), endpoint=False)
    return Polygon(np.column_stack([cx + np.cos(t) * rx, cy + np.sin(t) * ry]))


def _poly(pts: Iterable[tuple[float, float]]) -> Polygon:
    p = Polygon(list(pts))
    return p if p.is_valid else p.buffer(0)


def _normalize(geom, size: float) -> Polygon:
    parts = []
    if isinstance(geom, MultiPolygon):
        parts = list(geom.geoms)
    elif hasattr(geom, "geoms"):
        for child in geom.geoms:
            parts.extend(list(child.geoms) if isinstance(child, MultiPolygon) else [child])
    elif isinstance(geom, Polygon):
        parts = [geom]
    if not parts:
        raise ValueError("La silueta está vacía.")
    main = max(parts, key=lambda p: p.area)
    if not isinstance(main, Polygon) or main.is_empty:
        raise ValueError("La silueta no es válida.")
    b = main.bounds
    w = max(1e-6, b[2] - b[0])
    h = max(1e-6, b[3] - b[1])
    scale = max(2.0, float(size)) / max(w, h)
    main = affinity.scale(main, scale, scale, origin=(0, 0))
    b = main.bounds
    cx, cy = (b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0
    main = affinity.translate(main, -cx, -cy)
    return main


def _star(points: int, inner: float) -> Polygon:
    pts = []
    count = points * 2
    for i in range(count):
        angle = math.pi / 2 + i * math.tau / count
        radius = 1.0 if i % 2 == 0 else inner
        pts.append((math.cos(angle) * radius, math.sin(angle) * radius))
    return _poly(pts)


def _heart() -> Polygon:
    pts = []
    for i in range(96):
        t = -math.pi + i * math.tau / 95
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 18.0, y / 18.0))
    return _poly(pts)


def _cloud() -> Polygon:
    return unary_union([
        _ellipse(-0.27, -0.02, 0.25, 0.2),
        _ellipse(0.0, 0.14, 0.29, 0.26),
        _ellipse(0.29, 0.0, 0.23, 0.2),
        box(-0.5, -0.16, 0.5, 0.1),
    ])


def _flower() -> Polygon:
    petals = []
    for i in range(6):
        a = i * math.tau / 6
        petals.append(_ellipse(math.cos(a) * 0.26, math.sin(a) * 0.26, 0.26, 0.2))
    return unary_union(petals + [_ellipse(0, 0, 0.23, 0.23)])


def _clover() -> Polygon:
    leaves = []
    for i in range(4):
        a = i * math.tau / 4 + math.pi / 4
        leaves.append(_ellipse(math.cos(a) * 0.22, math.sin(a) * 0.22, 0.25, 0.25))
    stem = rounded_rect(0.13, 0.42, 0.06)
    stem = affinity.translate(stem, 0.08, -0.48)
    return unary_union(leaves + [stem])


def _leaf() -> Polygon:
    # Two mirrored circular arcs produce a leaf, plus a short stem.
    left = _ellipse(-0.24, 0.0, 0.42, 0.28)
    right = _ellipse(0.24, 0.0, 0.42, 0.28)
    body = unary_union([left, right]).intersection(_ellipse(0, 0, 0.58, 0.4))
    stem = rounded_rect(0.08, 0.42, 0.03)
    stem = affinity.translate(stem, 0.28, -0.54)
    return unary_union([body, stem])


def _mushroom() -> Polygon:
    cap = _ellipse(0, 0.18, 0.55, 0.38)
    cap = cap.intersection(box(-0.6, 0.0, 0.6, 0.6))
    stem = rounded_rect(0.28, 0.48, 0.12)
    stem = affinity.translate(stem, 0, -0.24)
    return unary_union([cap, stem])


def _bunny() -> Polygon:
    head = _ellipse(0, -0.14, 0.38, 0.38)
    left = _ellipse(-0.2, 0.32, 0.13, 0.35)
    right = _ellipse(0.2, 0.32, 0.13, 0.35)
    return unary_union([head, left, right])


def _bear() -> Polygon:
    head = _ellipse(0, -0.04, 0.45, 0.42)
    left = _ellipse(-0.38, 0.34, 0.17, 0.17)
    right = _ellipse(0.38, 0.34, 0.17, 0.17)
    return unary_union([head, left, right])


def _cat() -> Polygon:
    head = _ellipse(0, -0.1, 0.45, 0.4)
    left = _poly([(-0.43, 0.12), (-0.33, 0.55), (-0.05, 0.27)])
    right = _poly([(0.43, 0.12), (0.33, 0.55), (0.05, 0.27)])
    return unary_union([head, left, right])


def _frog() -> Polygon:
    head = _ellipse(0, -0.08, 0.48, 0.36)
    left = _ellipse(-0.31, 0.3, 0.2, 0.2)
    right = _ellipse(0.31, 0.3, 0.2, 0.2)
    return unary_union([head, left, right])


def _paw() -> Polygon:
    main = _ellipse(0, -0.2, 0.33, 0.3)
    toes = [
        _ellipse(-0.38, 0.16, 0.13, 0.17),
        _ellipse(-0.13, 0.36, 0.13, 0.17),
        _ellipse(0.13, 0.36, 0.13, 0.17),
        _ellipse(0.38, 0.16, 0.13, 0.17),
    ]
    return unary_union([main] + toes)


def _bat() -> Polygon:
    body = _ellipse(0, -0.04, 0.18, 0.34)
    left = _poly([(-0.08, 0.2), (-0.58, 0.38), (-0.46, 0.05), (-0.55, -0.12), (-0.22, -0.04), (-0.08, -0.28)])
    right = _poly([(0.08, 0.2), (0.58, 0.38), (0.46, 0.05), (0.55, -0.12), (0.22, -0.04), (0.08, -0.28)])
    ears = [
        _poly([(-0.1, 0.23), (-0.16, 0.53), (0.0, 0.34)]),
        _poly([(0.1, 0.23), (0.16, 0.53), (0.0, 0.34)]),
    ]
    return unary_union([body, left, right] + ears)


def _ghost() -> Polygon:
    pts = [(-0.38, 0.3), (-0.38, -0.22)]
    for i in range(5):
        x = -0.38 + (i + 0.5) * 0.76 / 5
        pts.append((x, -0.42 if i % 2 == 0 else -0.22))
    pts.extend([(0.38, -0.22), (0.38, 0.3)])
    return unary_union([_ellipse(0, 0.28, 0.38, 0.33), _poly(pts)])


def _moon() -> Polygon:
    outer = _ellipse(0, 0, 0.48, 0.48)
    cut = _ellipse(0.22, 0.08, 0.42, 0.42)
    return outer.difference(cut)


def _sun() -> Polygon:
    rays = []
    for i in range(12):
        a = i * math.tau / 12
        r1, r2 = 0.44, 0.62
        width = 0.075
        ca, sa = math.cos(a), math.sin(a)
        px, py = -sa * width, ca * width
        rays.append(_poly([(ca * r1 + px, sa * r1 + py), (ca * r2, sa * r2), (ca * r1 - px, sa * r1 - py)]))
    return unary_union([_ellipse(0, 0, 0.4, 0.4)] + rays)


def _diamond() -> Polygon:
    return _poly([(0, 0.55), (0.36, 0.08), (0, -0.55), (-0.36, 0.08)])


def _crown() -> Polygon:
    return _poly([
        (-0.5, -0.25), (0.5, -0.25), (0.5, 0.3), (0.31, 0.14),
        (0.18, 0.46), (0, 0.18), (-0.18, 0.46), (-0.31, 0.14), (-0.5, 0.3),
    ])


def _butterfly() -> Polygon:
    body = _ellipse(0, 0, 0.08, 0.42)
    wings = []
    for sx, sy, rx, ry in [(-0.3, 0.2, 0.27, 0.23), (-0.27, -0.18, 0.22, 0.19), (0.3, 0.2, 0.27, 0.23), (0.27, -0.18, 0.22, 0.19)]:
        wings.append(_ellipse(sx, sy, rx, ry))
    return unary_union([body] + wings)


def decor_polygon(name: str, size: float = 60.0) -> Polygon:
    name = (name or "circle").strip().lower()
    if name == "heart":
        geom = _heart()
    elif name == "star":
        geom = _star(5, 0.45)
    elif name == "star6":
        geom = _star(6, 0.5)
    elif name == "cloud":
        geom = _cloud()
    elif name == "flower":
        geom = _flower()
    elif name == "clover":
        geom = _clover()
    elif name == "leaf":
        geom = _leaf()
    elif name == "mushroom":
        geom = _mushroom()
    elif name == "bunny":
        geom = _bunny()
    elif name == "bear":
        geom = _bear()
    elif name == "cat":
        geom = _cat()
    elif name == "frog":
        geom = _frog()
    elif name == "paw":
        geom = _paw()
    elif name == "bat":
        geom = _bat()
    elif name == "ghost":
        geom = _ghost()
    elif name == "moon":
        geom = _moon()
    elif name == "sun":
        geom = _sun()
    elif name == "diamond":
        geom = _diamond()
    elif name == "crown":
        geom = _crown()
    elif name == "butterfly":
        geom = _butterfly()
    elif name == "hex":
        geom = _poly([(math.cos(i * math.tau / 6) * 0.5, math.sin(i * math.tau / 6) * 0.5) for i in range(6)])
    elif name == "square":
        geom = rounded_rect(1.0, 1.0, 0.13)
    elif name == "capsule":
        geom = rounded_rect(0.7, 1.0, 0.35)
    else:
        geom = _ellipse(0, 0, 0.5, 0.5)
    return _normalize(geom, size)


def decor_details(name: str, size: float) -> list[Polygon]:
    """Small raised shapes that make a silhouette read as a face/object."""
    name = (name or "").lower()
    s = float(size)
    out: list[Polygon] = []
    if name in {"cat", "bear", "frog", "bunny"}:
        eye_y = 0.0 if name == "cat" else 0.03
        for x in (-0.16, 0.16):
            out.append(affinity.translate(Point(x * s, eye_y * s).buffer(max(1.2, s * 0.035), quad_segs=16), 0, 0))
        if name in {"cat", "bear"}:
            out.append(Point(0, -0.12 * s).buffer(max(1.0, s * 0.023), quad_segs=12))
    elif name in {"flower", "sun"}:
        out.append(Point(0, 0).buffer(max(1.2, s * 0.12), quad_segs=24))
    elif name == "mushroom":
        for x in (-0.17, 0.18):
            out.append(Point(x * s, 0.2 * s).buffer(max(1.0, s * 0.05), quad_segs=16))
    elif name == "paw":
        out.append(_ellipse(0, 0.19 * s, 0.09 * s, 0.07 * s))
    elif name == "moon":
        out.append(Point(-0.18 * s, 0.12 * s).buffer(max(1.0, s * 0.045), quad_segs=16))
    elif name == "cloud":
        for x, y, r in [(-0.25, 0.05, 0.04), (0.25, 0.05, 0.04)]:
            out.append(Point(x * s, y * s).buffer(max(1.0, r * s), quad_segs=12))
    return out


def custom_polygon(outer: list[list[float]], holes: list[list[list[float]]], size: float) -> Polygon:
    if not outer or len(outer) < 3:
        raise ValueError("La silueta importada no tiene un contorno válido.")
    poly = Polygon([(float(p[0]), float(p[1])) for p in outer], [
        [(float(p[0]), float(p[1])) for p in ring] for ring in holes if len(ring) >= 3
    ])
    cleaned = clean_polygon(poly)
    if cleaned is None:
        raise ValueError("La silueta importada es demasiado pequeña o no es válida.")
    normalized = _normalize(cleaned, size)
    # SVG/raster coordinates are Y-down.  The plate builder works in a Y-up
    # design plane, so flip the imported silhouette once here.
    return affinity.scale(normalized, 1.0, -1.0, origin=(0, 0))
