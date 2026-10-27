"""Shapes, SVG parsing and image tracing for CalicoCutters.

Everything here is pure Python + NumPy + Shapely + Pillow.  The same module is
used by the local tests and by the Pyodide build in the browser.
"""

from __future__ import annotations

import io
import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Iterable

import numpy as np
from PIL import Image
from shapely import affinity
from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.ops import unary_union
from shapely.validation import make_valid

from .vendor.svg.path import parse_path
from .vendor.svg.path.path import Arc, Close, CubicBezier, Move, QuadraticBezier

Point2 = tuple[float, float]


def _clean_polygon(poly: Polygon) -> Polygon | None:
    if poly is None or poly.is_empty:
        return None
    if not poly.is_valid:
        fixed = make_valid(poly)
        if isinstance(fixed, Polygon):
            poly = fixed
        elif isinstance(fixed, MultiPolygon):
            poly = max(fixed.geoms, key=lambda g: g.area)
        else:
            return None
    if poly.area <= 1e-6:
        return None
    return poly


def _polys(geom) -> list[Polygon]:
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    if hasattr(geom, "geoms"):
        out: list[Polygon] = []
        for g in geom.geoms:
            out.extend(_polys(g))
        return out
    return []


def _ring_list(poly: Polygon) -> tuple[list[Point2], list[list[Point2]]]:
    outer = [(float(x), float(y)) for x, y in poly.exterior.coords[:-1]]
    holes = [[(float(x), float(y)) for x, y in ring.coords[:-1]] for ring in poly.interiors]
    return outer, holes


def _bounds(poly: Polygon) -> dict[str, float]:
    minx, miny, maxx, maxy = poly.bounds
    return {
        "minX": float(minx),
        "minY": float(miny),
        "maxX": float(maxx),
        "maxY": float(maxy),
        "width": float(maxx - minx),
        "height": float(maxy - miny),
    }


@dataclass
class Shape:
    name: str
    outer: list[Point2]
    holes: list[list[Point2]] = field(default_factory=list)
    details: list[list[Point2]] = field(default_factory=list)
    extras: list[list[Point2]] = field(default_factory=list)
    source_kind: str = "svg"
    warnings: list[str] = field(default_factory=list)
    image_size: tuple[int, int] | None = None
    source_svg: str | None = None
    source_color: str | None = None

    @property
    def main_polygon(self) -> Polygon:
        poly = Polygon(self.outer, self.holes)
        fixed = _clean_polygon(poly)
        if fixed is None:
            raise ValueError("La silueta principal es degenerada.")
        return fixed

    @property
    def detail_polygons(self) -> list[Polygon]:
        # `details` is a flat list of rings; rebuild components by containment
        # so holes in line art survive.
        return _components_from_rings(self.details)

    @property
    def bounds(self) -> dict[str, float]:
        return _bounds(self.main_polygon)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "outer": self.outer,
            "holes": self.holes,
            "details": self.details,
            "extras": self.extras,
            "source_kind": self.source_kind,
            "warnings": self.warnings,
            "image_size": self.image_size,
            "bounds": self.bounds,
            "source_color": self.source_color,
        }

    @staticmethod
    def from_dict(d: dict) -> "Shape":
        if not isinstance(d, dict):
            raise ValueError("El diseño no tiene el formato esperado.")
        outer = _ring_from_json(d.get("outer"), "contorno")
        holes = _rings_from_json(d.get("holes"), "agujeros")
        details = _rings_from_json(d.get("details"), "detalles")
        extras = _rings_from_json(d.get("extras"), "formas exteriores")
        warnings = d.get("warnings", [])
        if not isinstance(warnings, list):
            warnings = []
        image_size = d.get("image_size")
        if image_size and len(image_size) == 2:
            image_size = (int(image_size[0]), int(image_size[1]))
        else:
            image_size = None
        color = d.get("source_color")
        return Shape(
            name=str(d.get("name", "Diseño"))[:120],
            outer=outer,
            holes=holes,
            details=details,
            extras=extras,
            source_kind=str(d.get("source_kind", "svg")),
            warnings=[str(w) for w in warnings],
            image_size=image_size,
            source_svg=None,
            source_color=str(color) if color else None,
        )


def _ring_from_json(value, label: str) -> list[Point2]:
    if not isinstance(value, (list, tuple)) or len(value) < 3:
        raise ValueError(f"La silueta no tiene un {label} válido.")
    if len(value) > 30000:
        raise ValueError(f"El {label} tiene demasiados puntos.")
    out: list[Point2] = []
    for pair in value:
        if not isinstance(pair, (list, tuple)) or len(pair) < 2:
            raise ValueError(f"El {label} contiene una coordenada no válida.")
        try:
            x = float(pair[0])
            y = float(pair[1])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"El {label} contiene una coordenada no numérica.") from exc
        if not (math.isfinite(x) and math.isfinite(y)):
            raise ValueError(f"El {label} contiene una coordenada infinita.")
        out.append((x, y))
    return out


def _rings_from_json(value, label: str) -> list[list[Point2]]:
    if value is None:
        return []
    if not isinstance(value, (list, tuple)):
        raise ValueError(f"Los {label} no tienen el formato esperado.")
    if len(value) > 2000:
        raise ValueError(f"Hay demasiados {label}.")
    return [_ring_from_json(ring, label) for ring in value]


# ------------------------------------------------------------------ SVG ----
_NUM = r"[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?"
_TRANSFORM_RE = re.compile(r"([a-zA-Z]+)\s*\(([^)]*)\)")
_MATRIX_RE = re.compile(_NUM)


def _identity() -> np.ndarray:
    return np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]])


def _matrix(a: float, b: float, c: float, d: float, e: float, f: float) -> np.ndarray:
    return np.array([[a, c, e], [b, d, f], [0.0, 0.0, 1.0]])


def _parse_transform(text: str | None) -> np.ndarray:
    if not text:
        return _identity()
    out = _identity()
    for name, args in _TRANSFORM_RE.findall(text):
        vals = [float(v) for v in _MATRIX_RE.findall(args)]
        name = name.lower()
        if name == "matrix" and len(vals) == 6:
            out = out @ _matrix(*vals)
        elif name == "translate" and len(vals) >= 1:
            out = out @ _matrix(1, 0, 0, 1, vals[0], vals[1] if len(vals) > 1 else 0)
        elif name == "scale" and len(vals) >= 1:
            out = out @ _matrix(vals[0], 0, 0, vals[1] if len(vals) > 1 else vals[0], 0, 0)
        elif name == "rotate" and len(vals) >= 1:
            a = math.radians(vals[0])
            rot = _matrix(math.cos(a), math.sin(a), -math.sin(a), math.cos(a), 0, 0)
            if len(vals) >= 3:
                cx, cy = vals[1], vals[2]
                rot = _matrix(1, 0, 0, 1, cx, cy) @ rot @ _matrix(1, 0, 0, 1, -cx, -cy)
            out = out @ rot
        elif name == "skewx" and len(vals) == 1:
            out = out @ _matrix(1, 0, math.tan(math.radians(vals[0])), 1, 0, 0)
        elif name == "skewy" and len(vals) == 1:
            out = out @ _matrix(1, math.tan(math.radians(vals[0])), 0, 1, 0, 0)
    return out


def _apply_matrix(m: np.ndarray, points: Iterable[Point2]) -> list[Point2]:
    out: list[Point2] = []
    for x, y in points:
        tx = m[0, 0] * x + m[0, 1] * y + m[0, 2]
        ty = m[1, 0] * x + m[1, 1] * y + m[1, 2]
        out.append((float(tx), float(ty)))
    return out


def _color_from_value(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip().lower()
    m = re.fullmatch(r"#([0-9a-f]{3}|[0-9a-f]{6})", text)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = "".join(ch * 2 for ch in h)
        return f"#{h}"
    m = re.fullmatch(r"rgb\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*\)", text)
    if m:
        return "#" + "".join(f"{max(0, min(255, int(v))):02x}" for v in m.groups())
    return None


def _useful_color(colors: list[str]) -> str | None:
    """Pick a colour for the preview; neutral/black artwork becomes Calico pink."""
    counts: dict[str, int] = {}
    for c in colors:
        try:
            r = int(c[1:3], 16)
            g = int(c[3:5], 16)
            b = int(c[5:7], 16)
        except Exception:
            continue
        mx, mn = max(r, g, b), min(r, g, b)
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if mx - mn < 24 or lum < 38 or lum > 235:
            continue
        counts[c] = counts.get(c, 0) + 1
    if not counts:
        return None
    return max(counts.items(), key=lambda kv: kv[1])[0]


def _dominant_raster_color(img: Image.Image) -> str:
    arr = np.asarray(img.convert("RGBA"))
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3].astype(float)
    lum = 0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    mask = (alpha > 20) & (lum > 30) & (lum < 242) & ((mx - mn) > 26)
    if mask.sum() < 20:
        return "#f39ab1"
    med = np.median(rgb[mask], axis=0)
    return "#" + "".join(f"{max(0, min(255, int(v))):02x}" for v in med)


def _style(el: ET.Element) -> dict[str, str]:
    out: dict[str, str] = {}
    style = el.get("style")
    if style:
        for item in style.split(";"):
            if ":" in item:
                k, v = item.split(":", 1)
                out[k.strip().lower()] = v.strip()
    for k in ("fill", "stroke", "stroke-width", "fill-rule", "opacity", "fill-opacity"):
        if el.get(k) is not None:
            out[k] = str(el.get(k))
    return out


def _shape_path(el: ET.Element) -> str | None:
    tag = el.tag.split("}")[-1].lower()
    if tag == "path":
        return el.get("d")
    if tag == "rect":
        x = float(el.get("x", 0) or 0)
        y = float(el.get("y", 0) or 0)
        w = float(el.get("width", 0) or 0)
        h = float(el.get("height", 0) or 0)
        rx = min(float(el.get("rx", 0) or 0), w / 2)
        ry = min(float(el.get("ry", rx) or rx), h / 2)
        if w <= 0 or h <= 0:
            return None
        if rx > 0 or ry > 0:
            r = max(rx, ry)
            return (
                f"M{x + r} {y}H{x + w - r}A{r} {r} 0 0 1 {x + w} {y + r}"
                f"V{y + h - r}A{r} {r} 0 0 1 {x + w - r} {y + h}"
                f"H{x + r}A{r} {r} 0 0 1 {x} {y + h - r}"
                f"V{y + r}A{r} {r} 0 0 1 {x + r} {y}Z"
            )
        return f"M{x} {y}H{x + w}V{y + h}H{x}Z"
    if tag == "circle":
        cx = float(el.get("cx", 0) or 0)
        cy = float(el.get("cy", 0) or 0)
        r = float(el.get("r", 0) or 0)
        if r <= 0:
            return None
        return f"M{cx + r} {cy}A{r} {r} 0 1 0 {cx - r} {cy}A{r} {r} 0 1 0 {cx + r} {cy}Z"
    if tag == "ellipse":
        cx = float(el.get("cx", 0) or 0)
        cy = float(el.get("cy", 0) or 0)
        rx = float(el.get("rx", 0) or 0)
        ry = float(el.get("ry", 0) or 0)
        if rx <= 0 or ry <= 0:
            return None
        return f"M{cx + rx} {cy}A{rx} {ry} 0 1 0 {cx - rx} {cy}A{rx} {ry} 0 1 0 {cx + rx} {cy}Z"
    if tag in {"polygon", "polyline"}:
        pts = (el.get("points") or "").strip()
        if not pts:
            return None
        return "M" + re.sub(r"[,\s]+", " ", pts).strip() + "Z"
    return None


def _sample_path(d: str, matrix: np.ndarray, tolerance: float = 0.7) -> list[list[Point2]]:
    rings: list[list[Point2]] = []
    current: list[Point2] = []
    try:
        path = parse_path(d)
    except Exception:
        return rings
    for seg in path:
        if isinstance(seg, Move):
            if len(current) > 2:
                rings.append(current)
            current = [(seg.end.real, seg.end.imag)]
            continue
        if not current:
            current = [(seg.start.real, seg.start.imag)]
        if isinstance(seg, Close):
            if len(current) > 2:
                rings.append(current)
            current = []
            continue
        if isinstance(seg, (CubicBezier, QuadraticBezier, Arc)):
            try:
                length = float(seg.length(error=0.01))
            except Exception:
                length = abs(seg.end - seg.start) * 2
            n = max(6, min(160, int(math.ceil(length / tolerance))))
            for i in range(1, n + 1):
                p = seg.point(i / n)
                current.append((p.real, p.imag))
        else:
            current.append((seg.end.real, seg.end.imag))
    if len(current) > 2:
        rings.append(current)
    out: list[list[Point2]] = []
    for ring in rings:
        ring = _apply_matrix(matrix, ring)
        if len(ring) > 3 and math.dist(ring[0], ring[-1]) < 1e-5:
            ring = ring[:-1]
        if len(ring) > 2:
            out.append(ring)
    return out


def _components_from_rings(rings: list[list[Point2]]) -> list[Polygon]:
    polys: list[Polygon | None] = []
    for ring in rings:
        p = _clean_polygon(Polygon(ring))
        polys.append(p)
    items = [(i, p, p.area) for i, p in enumerate(polys) if p is not None]
    items.sort(key=lambda x: -x[2])
    parent: dict[int, int] = {}
    for idx, (i, p, _) in enumerate(items):
        parent[i] = -1
        best = None
        best_area = float("inf")
        for j, q, a in items:
            if i == j or a <= p.area:
                continue
            if q.buffer(1e-7).contains(p.representative_point()):
                if a < best_area:
                    best, best_area = j, a
        if best is not None:
            parent[i] = best
    depth: dict[int, int] = {}

    def get_depth(i: int) -> int:
        if i in depth:
            return depth[i]
        p = parent.get(i, -1)
        d = 0 if p < 0 else get_depth(p) + 1
        depth[i] = d
        return d

    comps: list[Polygon] = []
    for i, p, _ in items:
        if get_depth(i) % 2 != 0:
            continue
        holes = []
        for j, q, _ in items:
            if parent.get(j) == i:
                holes.append(list(q.exterior.coords[:-1]))
        poly = Polygon(list(p.exterior.coords[:-1]), holes)
        clean = _clean_polygon(poly)
        if clean is not None:
            comps.append(clean)
    return comps


def parse_svg(svg_text: str, name: str = "Diseño", target_mm: float = 75.0) -> Shape:
    text = re.sub(r"<\?xml[^>]*\?>", "", svg_text)
    try:
        root = ET.fromstring(text)
    except Exception as exc:
        raise ValueError(f"El SVG no es válido: {exc}") from exc
    warnings: list[str] = []
    components: list[Polygon] = []
    skipped_strokes = 0
    fill_colors: list[str] = []

    def walk(el: ET.Element, parent_matrix: np.ndarray) -> None:
        nonlocal skipped_strokes
        tag = el.tag.split("}")[-1].lower()
        if tag in {"defs", "clippath", "mask", "symbol", "lineargradient", "radialgradient"}:
            return
        matrix = parent_matrix @ _parse_transform(el.get("transform"))
        if tag in {"path", "rect", "circle", "ellipse", "polygon", "polyline"}:
            style = _style(el)
            fill = (style.get("fill") or "black").strip()
            stroke = (style.get("stroke") or "none").strip()
            c = _color_from_value(fill)
            if c:
                fill_colors.append(c)
            if fill in {"none", "transparent"} or fill.startswith("url("):
                if stroke not in {"none", "transparent"}:
                    skipped_strokes += 1
                return
            d = _shape_path(el)
            if d:
                rings = _sample_path(d, matrix)
                components.extend(_components_from_rings(rings))
            return
        for child in list(el):
            walk(child, matrix)

    walk(root, _identity())

    if not components:
        raise ValueError(
            "No se ha encontrado ninguna forma rellena en el SVG. "
            "Convierte los trazos a contornos o sube un PNG."
        )
    if skipped_strokes:
        warnings.append("Se han ignorado trazos sin relleno. Convierte el dibujo a contornos rellenos para usarlos.")

    components.sort(key=lambda p: -p.area)
    main = components[0]
    details: list[Polygon] = []
    extras: list[Polygon] = []
    top: list[Polygon] = [main]
    for comp in components[1:]:
        p = comp.representative_point()
        inside = main.contains(p) and not any(Polygon(h).contains(p) for h in main.interiors)
        if inside and comp.area < main.area * 0.94:
            details.append(comp)
        else:
            top.append(comp)

    # Head + bow (or other touching parts) should form one cutter outline.
    merged = _clean_polygon(unary_union(top))
    if isinstance(merged, MultiPolygon):
        merged = max(merged.geoms, key=lambda g: g.area)
        warnings.append("Hay varias formas separadas; se usará la mayor.")
    if merged is None:
        raise ValueError("No se pudo construir la silueta principal.")
    if extras:
        warnings.append("Hay formas exteriores adicionales; se ha usado la mayor.")
    if not details:
        warnings.append(
            "Este dibujo no tiene detalles interiores: el sello será una base plana. "
            "Para relieve, sube un dibujo con ojos, líneas o formas interiores."
        )

    # Stay inside the main silhouette and normalize to target size.
    clipped_details: list[Polygon] = []
    for d in details:
        c = _clean_polygon(d.intersection(merged))
        if c is not None and c.area > 1e-4:
            clipped_details.append(c)
    scale = target_mm / max(merged.bounds[2] - merged.bounds[0], merged.bounds[3] - merged.bounds[1], 1e-6)
    minx, miny, maxx, maxy = merged.bounds
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    merged = affinity.scale(merged, scale, scale, origin=(0, 0))
    merged = affinity.translate(merged, -cx * scale, -cy * scale)
    scaled_details: list[Polygon] = []
    for d in clipped_details:
        ds = affinity.scale(d, scale, scale, origin=(0, 0))
        ds = affinity.translate(ds, -cx * scale, -cy * scale)
        c = _clean_polygon(ds.intersection(merged))
        if c is not None:
            scaled_details.append(c)

    outer, holes = _ring_list(merged)
    detail_rings: list[list[Point2]] = []
    for d in scaled_details:
        detail_rings.append([(float(x), float(y)) for x, y in d.exterior.coords[:-1]])
        for ring in d.interiors:
            detail_rings.append([(float(x), float(y)) for x, y in ring.coords[:-1]])
    return Shape(
        name=name.removesuffix(".svg"),
        outer=outer,
        holes=holes,
        details=detail_rings,
        source_kind="svg",
        warnings=warnings,
        source_svg=svg_text,
        source_color=_useful_color(fill_colors) or "#f39ab1",
    )


# --------------------------------------------------------------- raster ----
def _mask_from_image(img: Image.Image, force_filled: bool = False) -> tuple[np.ndarray, np.ndarray, bool]:
    """Return (silhouette_mask, detail_mask, was_line_art).

    Opaque images are traced against their border colour, not only against
    darkness.  This keeps light pastel artwork on a white background working
    instead of producing an empty or clipped silhouette.
    """
    import cv2

    rgba = np.asarray(img.convert("RGBA"))
    alpha = rgba[:, :, 3]
    rgb = rgba[:, :, :3]
    lum = rgb.mean(axis=2)
    has_alpha = bool((alpha < 250).mean() > 0.02)
    opaque = alpha > 24
    if has_alpha and opaque.any():
        opaque_frac = float(opaque.mean())
        dark = (lum < 170) & opaque
        dark_frac = float(dark.sum()) / max(1.0, float(opaque.sum()))
        line_art = (opaque_frac < 0.55 and dark_frac > 0.5) and not force_filled
        silhouette = opaque
        ink = dark
        line_source = ink
    else:
        border = np.concatenate([
            rgb[:3, :, :].reshape(-1, 3),
            rgb[-3:, :, :].reshape(-1, 3),
            rgb[:, :3, :].reshape(-1, 3),
            rgb[:, -3:, :].reshape(-1, 3),
        ])
        background = np.median(border, axis=0)
        spread = float(np.max(np.std(border, axis=0)))
        background_is_flat = spread < 24
        color_distance = np.linalg.norm(rgb.astype(float) - background, axis=2)
        color_foreground = color_distance > max(26.0, spread * 2.5)
        dark = lum < 175
        foreground = color_foreground | dark
        dark_frac = float(dark.mean())
        fill_ratio = 0.0
        if foreground.any():
            fg8 = (foreground.astype(np.uint8) * 255)
            contours, _ = cv2.findContours(fg8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            outer_area = sum(max(0.0, cv2.contourArea(c)) for c in contours)
            fill_ratio = float(foreground.sum()) / max(1.0, outer_area)
        # Thin line art has a low fill ratio; a filled silhouette does not.
        line_art = (
            background_is_flat and foreground.any() and fill_ratio < 0.38 and dark_frac < 0.45
        ) and not force_filled
        if background_is_flat and foreground.any() and float(foreground.mean()) < 0.9:
            silhouette = foreground
        else:
            silhouette = dark
        ink = dark
        line_source = foreground if background_is_flat and foreground.any() else ink
    if not (silhouette.any() or ink.any()):
        raise ValueError("La imagen no tiene una silueta visible.")
    if line_art:
        silhouette = line_source
        ink = line_source
    if not silhouette.any():
        raise ValueError("La imagen no tiene una silueta visible.")
    # Crop to the silhouette to avoid a giant empty canvas.
    ys, xs = np.where(silhouette)
    y0, y1 = max(0, ys.min() - 4), min(silhouette.shape[0], ys.max() + 5)
    x0, x1 = max(0, xs.min() - 4), min(silhouette.shape[1], xs.max() + 5)
    silhouette = silhouette[y0:y1, x0:x1]
    ink = ink[y0:y1, x0:x1]
    rgb = rgb[y0:y1, x0:x1]
    if line_art:
        # Close small gaps in the ink line, then fill its outer contour.
        ink8 = (ink.astype(np.uint8) * 255)
        ink8 = cv2.morphologyEx(ink8, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        contours, _ = cv2.findContours(ink8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        filled = np.zeros_like(ink8)
        if contours:
            largest = max(cv2.contourArea(c) for c in contours)
            for c in contours:
                if cv2.contourArea(c) >= largest * 0.04:
                    cv2.drawContours(filled, [c], -1, 255, thickness=cv2.FILLED)
        silhouette = filled > 0
        # Interior ink, but not the outer outline touching the silhouette edge.
        try:
            from scipy import ndimage
            inner = ndimage.binary_erosion(silhouette, iterations=5)
        except Exception:
            inner = silhouette
        details = (ink8 > 0) & inner
    else:
        # Interior pixels that differ from the dominant fill become relief.
        if silhouette.any():
            fill = np.median(rgb[silhouette], axis=0)
            detail_distance = np.linalg.norm(rgb.astype(float) - fill, axis=2)
            try:
                from scipy import ndimage
                inner = ndimage.binary_erosion(silhouette, iterations=3)
            except Exception:
                inner = silhouette
            details = (detail_distance > 32.0) & inner
            details |= ink & inner
            details = cv2.morphologyEx(
                (details.astype(np.uint8) * 255), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)
            ) > 0
        else:
            details = np.zeros_like(silhouette)
    if not silhouette.any():
        raise ValueError("No se pudo rellenar la silueta de la imagen.")
    return silhouette, details, line_art


def _contours_to_polys(mask: np.ndarray, sx: float, sy: float, eps_px: float = 1.3) -> list[Polygon]:
    import cv2

    m = (mask.astype(np.uint8) * 255)
    contours, hierarchy = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hierarchy is None:
        return []
    hierarchy = hierarchy[0]
    polys: list[Polygon] = []
    for i, c in enumerate(contours):
        if hierarchy[i][3] != -1:
            continue
        if cv2.contourArea(c) < 8:
            continue
        approx = cv2.approxPolyDP(c, eps_px, True).reshape(-1, 2).astype(float)
        if len(approx) < 3:
            continue
        holes = []
        child = hierarchy[i][2]
        while child != -1:
            h = cv2.approxPolyDP(contours[child], eps_px, True).reshape(-1, 2).astype(float)
            if len(h) >= 3 and cv2.contourArea(contours[child]) > 4:
                holes.append([(float(x) * sx, float(y) * sy) for x, y in h])
            child = hierarchy[child][0]
        outer = [(float(x) * sx, float(y) * sy) for x, y in approx]
        p = _clean_polygon(Polygon(outer, holes))
        if p is not None:
            polys.append(p)
    return polys


def _detail_polys_from_mask(mask: np.ndarray, sx: float, sy: float) -> list[Polygon]:
    import cv2

    m = (mask.astype(np.uint8) * 255)
    contours, hierarchy = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hierarchy is None:
        return []
    hierarchy = hierarchy[0]
    out: list[Polygon] = []
    for i, c in enumerate(contours):
        if hierarchy[i][3] != -1:
            continue
        if cv2.contourArea(c) < 10:
            continue
        approx = cv2.approxPolyDP(c, 1.2, True).reshape(-1, 2).astype(float)
        if len(approx) < 3:
            continue
        holes: list[list[tuple[float, float]]] = []
        child = hierarchy[i][2]
        while child != -1:
            h = cv2.approxPolyDP(contours[child], 1.2, True).reshape(-1, 2).astype(float)
            if len(h) >= 3 and cv2.contourArea(contours[child]) > 5:
                holes.append([(float(x) * sx, float(y) * sy) for x, y in h])
            child = hierarchy[child][0]
        p = _clean_polygon(Polygon(
            [(float(x) * sx, float(y) * sy) for x, y in approx],
            holes,
        ))
        if p is not None:
            out.append(p)
    return out


def parse_raster(data: bytes, name: str = "Imagen", target_mm: float = 75.0, force_filled: bool = False) -> Shape:
    img = Image.open(io.BytesIO(data))
    if getattr(img, "is_animated", False):
        img.seek(0)
    img = img.convert("RGBA")
    # Keep the canvas reasonable; A4 at 300 dpi is already enough for a cutter.
    img.thumbnail((1800, 1800), Image.Resampling.LANCZOS)
    silhouette, detail_mask, line_art = _mask_from_image(img, force_filled)
    ys, xs = np.where(silhouette)
    w_px = int(xs.max() - xs.min() + 1)
    h_px = int(ys.max() - ys.min() + 1)
    scale = target_mm / max(w_px, h_px, 1)
    # Work in the cropped canvas: coordinates start at 0.
    main_polys = _contours_to_polys(silhouette, scale, scale, eps_px=1.4)
    if not main_polys:
        raise ValueError("No se pudo extraer el contorno exterior de la imagen.")
    main_polys.sort(key=lambda p: -p.area)
    main = main_polys[0]
    for p in main_polys[1:]:
        if p.area > main.area * 0.02:
            main = unary_union([main, p])
            if isinstance(main, MultiPolygon):
                main = max(main.geoms, key=lambda g: g.area)
    details = [p for p in _detail_polys_from_mask(detail_mask, scale, scale)
               if main.buffer(0.4).contains(p.representative_point())]
    # Normalize precisely to the target longest side, then center.
    minx, miny, maxx, maxy = main.bounds
    span = max(maxx - minx, maxy - miny, 1e-6)
    scale_final = target_mm / span
    main = affinity.scale(main, scale_final, scale_final, origin=(0, 0))
    details = [affinity.scale(p, scale_final, scale_final, origin=(0, 0)) for p in details]
    minx, miny, maxx, maxy = main.bounds
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    main = affinity.translate(main, -cx, -cy)
    details = [affinity.translate(p, -cx, -cy) for p in details]
    # Remove the outline that hugs the silhouette and keep true interior ink.
    inner_zone = main.buffer(-max(0.7, min(main.bounds[2] - main.bounds[0], main.bounds[3] - main.bounds[1]) * 0.012))
    clipped_details: list[Polygon] = []
    for p in details:
        c = p.intersection(inner_zone)
        if c.is_empty:
            continue
        for q in _polys(c):
            if q.area > 0.02:
                clipped_details.append(q)
    details = clipped_details
    # Remove line-art components that hug the outer contour.  They are part of
    # the silhouette outline, not a printable inner detail, and would otherwise
    # become a tall, fragile ridge on the stamp.
    edge_band = max(0.25, min(main.bounds[2] - main.bounds[0], main.bounds[3] - main.bounds[1]) * 0.004)
    details = [p for p in details if p.distance(main.exterior) > edge_band]
    detail_rings: list[list[Point2]] = []
    for d in details:
        detail_rings.append([(float(x), float(y)) for x, y in d.exterior.coords[:-1]])
        for ring in d.interiors:
            detail_rings.append([(float(x), float(y)) for x, y in ring.coords[:-1]])
    bounds = _bounds(main)
    warnings: list[str] = []
    if line_art:
        warnings.append(
            "Dibujo de líneas detectado: se ha rellenado la silueta exterior y se han conservado los detalles interiores."
        )
    if not details and not force_filled:
        warnings.append("No se han encontrado detalles interiores; el sello será una base plana.")
    outer, holes = _ring_list(main)
    return Shape(
        name=name.rsplit(".", 1)[0],
        outer=outer,
        holes=holes,
        details=detail_rings,
        source_kind="raster",
        warnings=warnings,
        image_size=(img.width, img.height),
        source_color=_dominant_raster_color(img),
    )


def analyze_bytes(data: bytes, filename: str, target_mm: float = 75.0, force_filled: bool = False) -> Shape:
    lower = filename.lower()
    if lower.endswith(".svg"):
        return parse_svg(data.decode("utf-8", errors="replace"), filename, target_mm)
    if lower.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff")):
        return parse_raster(data, filename, target_mm, force_filled=force_filled)
    raise ValueError("Formato no soportado. Usa SVG, PNG, JPG o WebP.")
