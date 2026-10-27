"""Small, dependency-light mesh kernel for CONector Tool.

The browser build only has NumPy and Shapely.  Instead of a full 3D CSG
kernel we build watertight 2.5D profiles, extrude them, transform them and
let the slicer union overlapping shells.  The only real 3D operation is the
planar cutter used for printable halves, implemented below.
"""

from __future__ import annotations

import io
import math
import struct
import zipfile
from dataclasses import dataclass
from typing import Iterable, Sequence
from xml.sax.saxutils import escape

import numpy as np
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Polygon, box
from shapely.ops import polygonize, unary_union
from shapely.geometry.polygon import orient

from .vendor.earcut import earcut


@dataclass
class Mesh:
    vertices: np.ndarray
    faces: np.ndarray

    def __post_init__(self) -> None:
        self.vertices = np.asarray(self.vertices, dtype=np.float64)
        self.faces = np.asarray(self.faces, dtype=np.int64)

    def append(self, other: "Mesh") -> "Mesh":
        if len(self.vertices) == 0:
            return other.copy()
        if len(other.vertices) == 0:
            return self.copy()
        offset = len(self.vertices)
        return Mesh(
            np.vstack([self.vertices, other.vertices]),
            np.vstack([self.faces, other.faces + offset]),
        )

    def copy(self) -> "Mesh":
        return Mesh(self.vertices.copy(), self.faces.copy())

    def merged(self, decimals: int = 6) -> "Mesh":
        if len(self.vertices) == 0 or len(self.faces) == 0:
            return self
        rounded = np.round(self.vertices, decimals=decimals)
        unique, inverse = np.unique(rounded, axis=0, return_inverse=True)
        faces = inverse[self.faces]
        keep = (
            (faces[:, 0] != faces[:, 1])
            & (faces[:, 1] != faces[:, 2])
            & (faces[:, 0] != faces[:, 2])
        )
        return Mesh(unique, faces[keep])

    def oriented(self) -> "Mesh":
        if len(self.faces) == 0:
            return self
        if self.signed_volume() < 0:
            return Mesh(self.vertices, self.faces[:, ::-1].copy())
        return self

    def signed_volume(self) -> float:
        if len(self.faces) == 0:
            return 0.0
        v = self.vertices
        f = self.faces
        a = v[f[:, 0]]
        b = v[f[:, 1]]
        c = v[f[:, 2]]
        return float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)

    def volume(self) -> float:
        return abs(self.signed_volume())

    @property
    def bounds(self) -> dict[str, list[float]]:
        if len(self.vertices) == 0:
            return {"min": [0, 0, 0], "max": [0, 0, 0]}
        return {
            "min": [float(x) for x in self.vertices.min(axis=0)],
            "max": [float(x) for x in self.vertices.max(axis=0)],
        }

    @property
    def extents(self) -> list[float]:
        b = self.bounds
        return [b["max"][i] - b["min"][i] for i in range(3)]

    @property
    def triangles(self) -> int:
        return int(len(self.faces))

    def translated(self, offset: Sequence[float]) -> "Mesh":
        v = self.vertices + np.asarray(offset, dtype=float)
        return Mesh(v, self.faces.copy())

    def transformed(self, matrix: np.ndarray) -> "Mesh":
        m = np.asarray(matrix, dtype=float)
        if m.shape != (4, 4):
            raise ValueError("La transformación debe ser una matriz 4x4.")
        v = self.vertices @ m[:3, :3].T + m[:3, 3]
        return Mesh(v, self.faces.copy())

    def stl_bytes(self) -> bytes:
        return mesh_to_stl(self)

    def is_watertight(self, decimals: int = 5) -> bool:
        if len(self.faces) == 0:
            return False
        v = np.round(self.vertices, decimals=decimals)
        unique, inverse = np.unique(v, axis=0, return_inverse=True)
        faces = inverse[self.faces]
        edges: dict[tuple[int, int], int] = {}
        for a, b, c in faces:
            for p, q in ((a, b), (b, c), (c, a)):
                if p == q:
                    return False
                key = (int(p), int(q)) if p < q else (int(q), int(p))
                edges[key] = edges.get(key, 0) + 1
        return bool(edges) and all(count == 2 for count in edges.values())


def _triangle_area2(p: np.ndarray, q: np.ndarray, r: np.ndarray) -> float:
    return float((q[0] - p[0]) * (r[1] - p[1]) - (r[0] - p[0]) * (q[1] - p[1]))


def triangulate_polygon(poly: Polygon) -> tuple[np.ndarray, np.ndarray]:
    if poly is None or poly.is_empty:
        return np.zeros((0, 2)), np.zeros((0, 3), dtype=np.int64)
    if not poly.is_valid:
        poly = poly.buffer(0)
        if isinstance(poly, MultiPolygon):
            poly = max(poly.geoms, key=lambda p: p.area)
    poly = orient(poly, sign=1.0)
    rings: list[np.ndarray] = [np.asarray(poly.exterior.coords[:-1], dtype=float)]
    for interior in poly.interiors:
        rings.append(np.asarray(interior.coords[:-1], dtype=float))
    flat: list[float] = []
    hole_indices: list[int] = []
    cursor = 0
    for i, ring in enumerate(rings):
        if i > 0:
            hole_indices.append(cursor)
        flat.extend(ring.reshape(-1).tolist())
        cursor += len(ring)
    if len(flat) < 6:
        return np.zeros((0, 2)), np.zeros((0, 3), dtype=np.int64)
    try:
        faces = np.asarray(earcut(flat, hole_indices if hole_indices else None, 2), dtype=np.int64)
    except Exception:
        return np.zeros((0, 2)), np.zeros((0, 3), dtype=np.int64)
    if len(faces) % 3 != 0:
        return np.zeros((0, 2)), np.zeros((0, 3), dtype=np.int64)
    verts = np.asarray(flat, dtype=float).reshape(-1, 2)
    faces = faces.reshape(-1, 3)
    for i, tri in enumerate(faces):
        if _triangle_area2(verts[tri[0]], verts[tri[1]], verts[tri[2]]) < 0:
            faces[i] = tri[[0, 2, 1]]
    return verts, faces


def _polygon_parts(geom) -> list[Polygon]:
    if geom is None or geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    if isinstance(geom, MultiPolygon):
        return list(geom.geoms)
    if hasattr(geom, "geoms"):
        out: list[Polygon] = []
        for child in geom.geoms:
            out.extend(_polygon_parts(child))
        return out
    return []


def _signed_area(ring: np.ndarray) -> float:
    if len(ring) < 3:
        return 0.0
    x = ring[:, 0]
    y = ring[:, 1]
    return float((x * np.roll(y, -1) - np.roll(x, -1) * y).sum() / 2.0)


def _resample_ring(ring: np.ndarray, count: int, reference: np.ndarray | None = None) -> np.ndarray:
    pts = np.asarray(ring, dtype=float)
    if len(pts) < 3:
        return np.zeros((0, 2))
    # Drop a duplicated closing point if present.
    if np.allclose(pts[0], pts[-1]):
        pts = pts[:-1]
    if reference is None:
        # Start at the right-most point so all layers share a phase.
        start = int(np.argmax(pts[:, 0]))
    else:
        d = np.linalg.norm(pts - reference, axis=1)
        start = int(np.argmin(d))
    pts = np.roll(pts, -start, axis=0)
    closed = np.vstack([pts, pts[0]])
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    total = float(seg.sum())
    if total <= 1e-9:
        return np.zeros((0, 2))
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    targets = np.linspace(0.0, total, count, endpoint=False)
    out = np.zeros((count, 2), dtype=float)
    for i, t in enumerate(targets):
        k = int(np.searchsorted(cum, t, side="right") - 1)
        k = min(max(k, 0), len(seg) - 1)
        f = (t - cum[k]) / max(seg[k], 1e-12)
        out[i] = closed[k] + (closed[k + 1] - closed[k]) * f
    # Break exact collinearity so earcut cannot collapse boundary points.
    j = np.arange(count, dtype=float)
    out[:, 0] += 0.0008 * np.sin(j * 1.71)
    out[:, 1] += 0.0008 * np.cos(j * 2.13)
    return out


def loft_layers(polygons: list[Polygon], zs: list[float], segments: int = 320) -> Mesh:
    """Loft one simple polygon per z into a single smooth shell.

    The body layers are simple rings with no holes (the wire channels open to
    the rim).  Welding the rings into one surface removes the visible stair
    steps of the stacked-slice fallback and uses far fewer triangles.
    """
    if len(polygons) < 2 or len(polygons) != len(zs):
        return empty_mesh()
    if any(p.geom_type != "Polygon" or p.is_empty or len(p.interiors) for p in polygons):
        return empty_mesh()
    rings: list[np.ndarray] = []
    prev_ref: np.ndarray | None = None
    for poly in polygons:
        ring = np.asarray(poly.exterior.coords[:-1], dtype=float)
        if _signed_area(ring) < 0:
            ring = ring[::-1]
        resampled = _resample_ring(ring, segments, prev_ref)
        if len(resampled) != segments:
            return empty_mesh()
        prev_ref = resampled[0]
        rings.append(resampled)
    # Side walls.
    verts: list[list[float]] = []
    for ring, z in zip(rings, zs):
        for x, y in ring:
            verts.append([float(x), float(y), float(z)])
    faces: list[list[int]] = []
    for k in range(len(rings) - 1):
        a0 = k * segments
        b0 = (k + 1) * segments
        for j in range(segments):
            j2 = (j + 1) % segments
            a = a0 + j
            b = a0 + j2
            c = b0 + j2
            d = b0 + j
            faces.append([a, b, c])
            faces.append([a, c, d])
    # Caps.  Triangulate the same resampled ring so the cap boundary matches.
    for layer, flip in ((0, True), (len(rings) - 1, False)):
        ring = rings[layer]
        poly = Polygon(ring)
        cap_verts, cap_faces = triangulate_polygon(poly)
        if not len(cap_faces):
            return empty_mesh()
        base = len(verts)
        z = zs[layer]
        for x, y in cap_verts:
            verts.append([float(x), float(y), float(z)])
        for tri in cap_faces:
            if flip:
                faces.append([base + int(tri[0]), base + int(tri[2]), base + int(tri[1])])
            else:
                faces.append([base + int(tri[0]), base + int(tri[1]), base + int(tri[2])])
    return Mesh(np.asarray(verts), np.asarray(faces, dtype=np.int64)).merged(decimals=5).oriented()


def _jitter_ring(coords, seed: int) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for i, (x, y) in enumerate(coords):
        out.append((
            float(x) + 0.001 * math.sin((i + 1) * 1.71 + seed),
            float(y) + 0.001 * math.cos((i + 1) * 2.13 + seed),
        ))
    return out


def _jitter_polygon(poly: Polygon) -> Polygon:
    outer = _jitter_ring(list(poly.exterior.coords[:-1]), 0.0)
    holes: list[list[tuple[float, float]]] = []
    for i, ring in enumerate(poly.interiors):
        holes.append(_jitter_ring(list(ring.coords[:-1]), i + 1.0))
    out = Polygon(outer, holes)
    if not out.is_valid:
        fixed = out.buffer(0)
        parts = _polygon_parts(fixed)
        if parts:
            out = max(parts, key=lambda p: p.area)
    return out


def clean_polygon(poly: Polygon | None) -> Polygon | None:
    if poly is None or poly.is_empty:
        return None
    if not poly.is_valid:
        fixed = poly.buffer(0)
        parts = _polygon_parts(fixed)
        if not parts:
            return None
        poly = max(parts, key=lambda p: p.area)
    if poly.area <= 1e-7:
        return None
    return poly


def extrude_polygon(poly: Polygon | MultiPolygon, z0: float, height: float) -> Mesh:
    """Watertight vertical extrusion of a polygon with holes."""
    if poly is None or poly.is_empty or height <= 0:
        return Mesh(np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64))
    if isinstance(poly, MultiPolygon):
        out = empty_mesh()
        for p in poly.geoms:
            out = out.append(extrude_polygon(p, z0, height))
        return out
    poly = clean_polygon(poly)
    if poly is None:
        return empty_mesh()
    poly = _jitter_polygon(poly)
    poly = orient(poly, sign=1.0)
    verts2d, faces = triangulate_polygon(poly)
    if len(faces) == 0:
        return empty_mesh()
    n = len(verts2d)
    z1 = z0 + height
    bottom = np.column_stack([verts2d, np.full(n, z0)])
    top = np.column_stack([verts2d, np.full(n, z1)])
    vertices = np.vstack([bottom, top])
    all_faces: list[list[int]] = []
    for tri in faces:
        all_faces.append([int(tri[0]), int(tri[2]), int(tri[1])])
        all_faces.append([int(tri[0]) + n, int(tri[1]) + n, int(tri[2]) + n])
    rings = [np.asarray(poly.exterior.coords[:-1], dtype=float)]
    rings.extend(np.asarray(r.coords[:-1], dtype=float) for r in poly.interiors)
    for ri, ring in enumerate(rings):
        m = len(ring)
        if m < 3:
            continue
        base = len(vertices)
        extra = []
        for i in range(m):
            x, y = ring[i]
            extra.extend([[x, y, z0], [x, y, z1]])
        vertices = np.vstack([vertices, np.asarray(extra, dtype=float)])
        reverse = ri > 0
        for i in range(m):
            j = (i + 1) % m
            a = base + i * 2
            b = base + j * 2
            c = b + 1
            d = a + 1
            if reverse:
                all_faces.append([a, c, b])
                all_faces.append([a, d, c])
            else:
                all_faces.append([a, b, c])
                all_faces.append([a, c, d])
    return Mesh(vertices, np.asarray(all_faces, dtype=np.int64)).merged().oriented()


def empty_mesh() -> Mesh:
    return Mesh(np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64))


def rounded_rect(w: float, h: float, r: float) -> Polygon:
    r = max(0.0, min(r, min(w, h) / 2))
    if r <= 0:
        return box(-w / 2, -h / 2, w / 2, h / 2)
    return box(-w / 2 + r, -h / 2 + r, w / 2 - r, h / 2 - r).buffer(r, join_style=1, quad_segs=8)


def circle_polygon(radius: float, segments: int = 48) -> Polygon:
    t = np.linspace(0, math.tau, max(12, int(segments)), endpoint=False)
    return Polygon(np.column_stack([np.cos(t) * radius, np.sin(t) * radius]))


def regular_polygon(radius: float, sides: int, rotation: float = 0.0) -> Polygon:
    t = np.linspace(0, math.tau, max(3, int(sides)), endpoint=False) + math.radians(rotation)
    return Polygon(np.column_stack([np.cos(t) * radius, np.sin(t) * radius]))


def c_profile(
    wire_diameter: float = 4.0,
    clearance: float = 0.25,
    wall: float = 2.4,
    mouth_width: float = 3.2,
    wrap_degrees: float = 305.0,
    segments: int = 64,
) -> Polygon:
    """Open C-shaped clamp cross-section.  The mouth is on +Y.

    The opening is a wedge.  Its width at the outer radius is the requested
    mouth width, so the wire snaps past the lips and remains captured in the
    round channel.
    """
    ri = max(0.4, wire_diameter / 2 + clearance)
    ro = ri + max(1.2, wall)
    span = math.radians(max(120.0, min(340.0, wrap_degrees)))
    # A requested mouth width can require a larger gap than wrap_degrees.
    mouth_gap = 2.0 * math.asin(min(0.98, max(0.1, mouth_width) / (2.0 * ro)))
    gap = max(math.tau - span, mouth_gap)
    gap = min(gap, math.radians(200.0))
    start = math.pi / 2.0 + gap / 2.0
    outer_t = np.linspace(start, start + math.tau - gap, max(24, segments // 2))
    inner_t = np.linspace(start + math.tau - gap, start, max(24, segments // 2))
    outer = np.column_stack([np.cos(outer_t) * ro, np.sin(outer_t) * ro])
    inner = np.column_stack([np.cos(inner_t) * ri, np.sin(inner_t) * ri])
    pts = np.vstack([outer, inner])
    poly = Polygon(pts)
    if not poly.is_valid:
        poly = poly.buffer(0)
        parts = _polygon_parts(poly)
        if parts:
            poly = max(parts, key=lambda p: p.area)
    return poly


def annulus(outer_radius: float, inner_radius: float, segments: int = 48) -> Polygon:
    outer = circle_polygon(max(outer_radius, inner_radius + 0.1), segments)
    inner = circle_polygon(max(0.1, inner_radius), segments)
    return outer.difference(inner)


def cylinder(radius: float, height: float, segments: int = 40, z0: float = 0.0) -> Mesh:
    return extrude_polygon(circle_polygon(radius, segments), z0, height)


def tube(outer_radius: float, inner_radius: float, height: float, segments: int = 48, z0: float = 0.0) -> Mesh:
    return extrude_polygon(annulus(outer_radius, inner_radius, segments), z0, height)


def frame_z_to(axis: Sequence[float], up_hint: Sequence[float] = (0, 0, 1)) -> np.ndarray:
    """Rotation matrix mapping local +Z to the given world axis."""
    z = np.asarray(axis, dtype=float)
    norm = np.linalg.norm(z)
    if norm < 1e-9:
        raise ValueError("Eje de longitud cero.")
    z /= norm
    up = np.asarray(up_hint, dtype=float)
    if abs(float(np.dot(z, up))) > 0.94:
        up = np.array([0.0, 1.0, 0.0])
    x = np.cross(up, z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    m = np.eye(4)
    m[:3, 0] = x
    m[:3, 1] = y
    m[:3, 2] = z
    return m


def transform_matrix(
    translate: Sequence[float] = (0, 0, 0),
    rotate_z: float = 0.0,
    rotate_x: float = 0.0,
    rotate_y: float = 0.0,
) -> np.ndarray:
    cx, sx = math.cos(rotate_x), math.sin(rotate_x)
    cy, sy = math.cos(rotate_y), math.sin(rotate_y)
    cz, sz = math.cos(rotate_z), math.sin(rotate_z)
    rx = np.array([[1, 0, 0, 0], [0, cx, -sx, 0], [0, sx, cx, 0], [0, 0, 0, 1]], dtype=float)
    ry = np.array([[cy, 0, sy, 0], [0, 1, 0, 0], [-sy, 0, cy, 0], [0, 0, 0, 1]], dtype=float)
    rz = np.array([[cz, -sz, 0, 0], [sz, cz, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], dtype=float)
    m = rz @ ry @ rx
    m[:3, 3] = np.asarray(translate, dtype=float)
    return m


def tube_along(
    outer_radius: float,
    inner_radius: float,
    length: float,
    axis: Sequence[float],
    start: Sequence[float] = (0, 0, 0),
    segments: int = 48,
) -> Mesh:
    m = frame_z_to(axis)
    mesh = tube(outer_radius, inner_radius, length, segments)
    mesh = mesh.transformed(m)
    return mesh.translated(start)


def cylinder_along(
    radius: float,
    length: float,
    axis: Sequence[float],
    start: Sequence[float] = (0, 0, 0),
    segments: int = 32,
) -> Mesh:
    m = frame_z_to(axis)
    mesh = cylinder(radius, length, segments)
    mesh = mesh.transformed(m)
    return mesh.translated(start)


def axis_vector(name: str) -> np.ndarray:
    key = str(name).strip().lower()
    if key in {"x", "z", "y"}:
        key = "+" + key
    mapping = {
        "+x": (1, 0, 0),
        "-x": (-1, 0, 0),
        "+y": (0, 1, 0),
        "-y": (0, -1, 0),
        "+z": (0, 0, 1),
        "-z": (0, 0, -1),
    }
    return np.asarray(mapping.get(key, (1, 0, 0)), dtype=float)


def _cap_from_segments(segments: list[tuple[np.ndarray, np.ndarray]], plane_normal: np.ndarray, plane_offset: float, wanted_normal: np.ndarray) -> Mesh:
    if not segments:
        return empty_mesh()
    n = plane_normal / np.linalg.norm(plane_normal)
    # Two-dimensional basis on the plane.
    helper = np.array([0.0, 0.0, 1.0])
    if abs(float(np.dot(n, helper))) > 0.94:
        helper = np.array([0.0, 1.0, 0.0])
    u = np.cross(n, helper)
    u /= np.linalg.norm(u)
    v = np.cross(n, u)
    lines = []
    for a, b in segments:
        aa = (round(float(np.dot(a, u)), 5), round(float(np.dot(a, v)), 5))
        bb = (round(float(np.dot(b, u)), 5), round(float(np.dot(b, v)), 5))
        if aa != bb:
            lines.append(LineString([aa, bb]))
    if not lines:
        return empty_mesh()
    merged = unary_union(lines)
    polys = [p for p in polygonize(merged) if p.area > 1e-6]
    if not polys:
        return empty_mesh()
    # Overlapping cross-sections are common in shell-based designs.
    geom = unary_union(polys)
    faces_all: list[list[int]] = []
    vertices_all: list[list[float]] = []
    for poly in _polygon_parts(geom):
        verts2d, faces = triangulate_polygon(poly)
        if not len(faces):
            continue
        base = len(vertices_all)
        for x, y in verts2d:
            world = u * float(x) + v * float(y) + n * float(plane_offset)
            vertices_all.append(np.round(world, 4).tolist())
        for tri in faces:
            p0 = u * float(verts2d[tri[0]][0]) + v * float(verts2d[tri[0]][1])
            p1 = u * float(verts2d[tri[1]][0]) + v * float(verts2d[tri[1]][1])
            p2 = u * float(verts2d[tri[2]][0]) + v * float(verts2d[tri[2]][1])
            normal = np.cross(p1 - p0, p2 - p0)
            a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
            if float(np.dot(normal, wanted_normal)) < 0:
                a, c = c, a
            faces_all.append([base + a, base + b, base + c])
    if not faces_all:
        return empty_mesh()
    return Mesh(np.asarray(vertices_all, dtype=float), np.asarray(faces_all, dtype=np.int64)).merged()


def _cap_from_boundary(mesh: Mesh, plane_normal: np.ndarray, plane_offset: float, wanted_normal: np.ndarray) -> Mesh:
    """Cap a clipped half using its exact open boundary.

    Reusing the boundary vertices is important: a separately polygonized cap
    can differ by a few microns and leave non-manifold slits in the STL.
    """
    if not len(mesh.faces):
        return empty_mesh()
    v = np.round(mesh.vertices, 5)
    unique, inverse = np.unique(v, axis=0, return_inverse=True)
    faces = inverse[mesh.faces]
    edges: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for fi, (a, b, c) in enumerate(faces):
        for p, q in ((a, b), (b, c), (c, a)):
            key = (int(p), int(q)) if p < q else (int(q), int(p))
            edges.setdefault(key, []).append((int(fi), 1 if (int(p), int(q)) == key else -1))
    boundary = [key for key, items in edges.items() if len(items) == 1]
    if len(boundary) < 3:
        return empty_mesh()
    n = plane_normal / np.linalg.norm(plane_normal)
    helper = np.array([0.0, 0.0, 1.0])
    if abs(float(np.dot(n, helper))) > 0.94:
        helper = np.array([0.0, 1.0, 0.0])
    u = np.cross(n, helper)
    u /= np.linalg.norm(u)
    v2 = np.cross(n, u)
    lines = []
    for a, b in boundary:
        pa = unique[a]
        pb = unique[b]
        aa = (round(float(np.dot(pa, u)), 5), round(float(np.dot(pa, v2)), 5))
        bb = (round(float(np.dot(pb, u)), 5), round(float(np.dot(pb, v2)), 5))
        if aa != bb:
            lines.append(LineString([aa, bb]))
    if not lines:
        return empty_mesh()
    merged = unary_union(lines)
    polys = [p for p in polygonize(merged) if p.area > 1e-6]
    if not polys:
        return empty_mesh()
    geom = unary_union(polys)
    vertices_all: list[list[float]] = []
    faces_all: list[list[int]] = []
    for poly in _polygon_parts(geom):
        verts2d, cap_faces = triangulate_polygon(poly)
        if not len(cap_faces):
            continue
        base = len(vertices_all)
        for x, y in verts2d:
            world = u * float(x) + v2 * float(y) + n * float(plane_offset)
            vertices_all.append(np.round(world, 4).tolist())
        for tri in cap_faces:
            p0 = u * float(verts2d[tri[0]][0]) + v2 * float(verts2d[tri[0]][1])
            p1 = u * float(verts2d[tri[1]][0]) + v2 * float(verts2d[tri[1]][1])
            p2 = u * float(verts2d[tri[2]][0]) + v2 * float(verts2d[tri[2]][1])
            normal = np.cross(p1 - p0, p2 - p0)
            a, b, c = int(tri[0]), int(tri[1]), int(tri[2])
            if float(np.dot(normal, wanted_normal)) < 0:
                a, c = c, a
            faces_all.append([base + a, base + b, base + c])
    if not faces_all:
        return empty_mesh()
    return Mesh(np.asarray(vertices_all, dtype=float), np.asarray(faces_all, dtype=np.int64)).merged(decimals=4)


def weld_mesh(mesh: Mesh, tolerance: float = 0.05) -> Mesh:
    """Merge vertices inside a small spatial tolerance.

    Unlike rounding to a decimal grid this is not affected by values sitting
    exactly on a grid boundary.  It is used after planar clipping, where two
    independently computed boundary vertices can differ by a few microns.
    """
    if not len(mesh.vertices) or tolerance <= 0:
        return mesh
    tol = float(tolerance)
    keys = np.floor(mesh.vertices / tol + 0.5).astype(np.int64)
    _, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    faces = inverse[mesh.faces]
    keep = (
        (faces[:, 0] != faces[:, 1])
        & (faces[:, 1] != faces[:, 2])
        & (faces[:, 0] != faces[:, 2])
    )
    vertices = mesh.vertices[first]
    return Mesh(vertices, faces[keep]).oriented()


def is_shell_watertight(mesh: Mesh) -> bool:
    """True when every disconnected shell is individually closed.

    A connector is intentionally a union of overlapping closed primitives.  A
    naive edge count over the union can report false failures where shells
    happen to share a vertex; the slicer only needs each shell to be closed.
    """
    components = mesh_components(mesh)
    return bool(components) and all(component.is_watertight() for component in components)


def mesh_components(mesh: Mesh) -> list[Mesh]:
    """Split a mesh into vertex-connected shells.

    Appending closed primitives is cheaper than 3D CSG, so this lets us split
    each primitive independently.  Each half then keeps its own clean cap.
    """
    if not len(mesh.faces):
        return []
    edge_faces: dict[tuple[int, int], list[int]] = {}
    for fi, face in enumerate(mesh.faces):
        for i in range(3):
            a, b = int(face[i]), int(face[(i + 1) % 3])
            key = (a, b) if a < b else (b, a)
            edge_faces.setdefault(key, []).append(fi)
    parent = list(range(len(mesh.faces)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for items in edge_faces.values():
        for i in range(1, len(items)):
            union(items[0], items[i])
    groups: dict[int, list[int]] = {}
    for fi in range(len(mesh.faces)):
        groups.setdefault(find(fi), []).append(fi)
    out: list[Mesh] = []
    for face_ids in groups.values():
        verts: list[np.ndarray] = []
        remap: dict[int, int] = {}
        faces: list[list[int]] = []
        for fi in face_ids:
            for vertex_index in mesh.faces[fi]:
                idx = int(vertex_index)
                if idx not in remap:
                    remap[idx] = len(verts)
                    verts.append(mesh.vertices[idx])
            faces.append([remap[int(v)] for v in mesh.faces[fi]])
        out.append(Mesh(np.asarray(verts), np.asarray(faces, dtype=np.int64)))
    return out


def split_mesh(mesh: Mesh, axis: str, offset: float = 0.0) -> tuple[Mesh, Mesh]:
    """Split a mesh by a principal plane and cap both halves.

    Returns (positive_side, negative_side).  The mesh is assumed to be made of
    closed shells.  The caps are reconstructed from the intersection linework.
    """
    normal = axis_vector(axis)
    n = normal / np.linalg.norm(normal)
    vertices = mesh.vertices
    faces = mesh.faces
    if not len(faces):
        return empty_mesh(), empty_mesh()
    dist = vertices @ n - float(offset)

    def clip(sign: int) -> tuple[Mesh, list[tuple[np.ndarray, np.ndarray]]]:
        out_v: list[np.ndarray] = []
        out_f: list[list[int]] = []
        cuts: list[tuple[np.ndarray, np.ndarray]] = []
        eps = 1e-7

        def add_vertex(co: np.ndarray) -> int:
            out_v.append(co)
            return len(out_v) - 1

        for face in faces:
            pts = vertices[face]
            d = dist[face]
            poly: list[np.ndarray] = []
            on_plane: list[np.ndarray] = []
            for i in range(3):
                j = (i + 1) % 3
                di, dj = float(d[i]), float(d[j])
                if abs(di) <= eps:
                    on_plane.append(pts[i])
                if (sign > 0 and di >= -eps) or (sign < 0 and di <= eps):
                    poly.append(pts[i])
                if (di > eps and dj < -eps) or (di < -eps and dj > eps):
                    t = di / (di - dj)
                    p = pts[i] + (pts[j] - pts[i]) * t
                    poly.append(p)
                    on_plane.append(p)
            # The two unique points where this triangle meets the plane are
            # one segment of the cap boundary.
            unique: list[np.ndarray] = []
            for p in on_plane:
                if not any(float(np.linalg.norm(p - q)) < 1e-6 for q in unique):
                    unique.append(p)
            if len(unique) == 2:
                cuts.append((unique[0], unique[1]))
            # If the triangle lies on the plane it does not contribute a cap.
            if len(poly) < 3:
                continue
            # Remove duplicates produced by vertices exactly on the plane.
            clean: list[np.ndarray] = []
            for p in poly:
                if not clean or float(np.linalg.norm(p - clean[-1])) > 1e-7:
                    clean.append(p)
            if len(clean) > 2 and float(np.linalg.norm(clean[0] - clean[-1])) < 1e-7:
                clean.pop()
            if len(clean) < 3:
                continue
            idx = [add_vertex(p) for p in clean]
            for k in range(1, len(idx) - 1):
                out_f.append([idx[0], idx[k], idx[k + 1]])
        if not out_f:
            return empty_mesh(), cuts
        return Mesh(np.asarray(out_v), np.asarray(out_f, dtype=np.int64)).merged(), cuts

    upper, _upper_cuts = clip(1)
    lower, _lower_cuts = clip(-1)
    cap_upper = _cap_from_boundary(upper, n, offset, n)
    cap_lower = _cap_from_boundary(lower, n, offset, -n)
    # Cap boundaries can differ by a few microns due to independent
    # quantization.  A 0.05 mm weld is far below print resolution and removes
    # micro-slits without changing the part.
    upper = weld_mesh(upper.append(cap_upper), 0.05)
    lower = weld_mesh(lower.append(cap_lower), 0.05)
    return upper.oriented(), lower.oriented()


def mesh_to_stl(mesh: Mesh) -> bytes:
    if len(mesh.faces) == 0:
        return b""
    v = mesh.vertices
    f = mesh.faces
    triangles = v[f]
    normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    lengths = np.linalg.norm(normals, axis=1)
    lengths[lengths == 0] = 1
    normals = normals / lengths[:, None]
    header = b"CONector Tool - conector para reja de exposicion".ljust(80, b" ")
    buf = io.BytesIO()
    buf.write(header)
    buf.write(struct.pack("<I", len(f)))
    for n, tri in zip(normals, triangles):
        vals = [float(n[0]), float(n[1]), float(n[2])]
        for p in tri:
            vals.extend([float(p[0]), float(p[1]), float(p[2])])
        buf.write(struct.pack("<12fH", *vals, 0))
    return buf.getvalue()


def _escape(value: str) -> str:
    return escape(value, {'"': "&quot;"})


def three_mf_bytes(parts: list[tuple[str, Mesh, str, tuple[float, float, float]]], title: str = "CONector Tool") -> bytes:
    materials = "".join(
        f'<base name="{_escape(name)}" displaycolor="{color}" />'
        for name, _mesh, color, _off in parts
    )
    objects: list[str] = []
    items: list[str] = []
    for i, (name, mesh, _color, offset) in enumerate(parts):
        oid = i + 2
        verts = "".join(
            f'<vertex x="{x:.4f}" y="{y:.4f}" z="{z:.4f}"/>'
            for x, y, z in mesh.vertices
        )
        tris = "".join(
            f'<triangle v1="{int(a)}" v2="{int(b)}" v3="{int(c)}"/>'
            for a, b, c in mesh.faces
        )
        objects.append(
            f'<object id="{oid}" type="model" name="{_escape(name)}" pid="1" pindex="{i}">'
            f'<mesh><vertices>{verts}</vertices><triangles>{tris}</triangles></mesh></object>'
        )
        tx, ty, tz = offset
        items.append(f'<item objectid="{oid}" transform="1 0 0 0 1 0 0 0 1 {tx:.4f} {ty:.4f} {tz:.4f}"/>')
    model = f'''<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="es-ES" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">{_escape(title)}</metadata>
  <metadata name="Application">CONector Tool</metadata>
  <resources><basematerials id="1">{materials}</basematerials>{''.join(objects)}</resources>
  <build>{''.join(items)}</build>
</model>'''
    content_types = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>'''
    rels = '''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>'''
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("3D/3dmodel.model", model)
    return buf.getvalue()


def overhang_ratio(mesh: Mesh, limit_degrees: float = 45.0) -> float:
    if not len(mesh.faces):
        return 0.0
    tris = mesh.vertices[mesh.faces]
    normals = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    lengths = np.linalg.norm(normals, axis=1)
    valid = lengths > 1e-9
    if not valid.any():
        return 0.0
    normals = normals[valid] / lengths[valid, None]
    # Downward-facing surfaces more horizontal than the limit.
    downward = normals[:, 2] < -math.sin(math.radians(limit_degrees))
    area = lengths[valid] / 2.0
    total = float(area.sum()) or 1.0
    return float(area[downward].sum() / total)
