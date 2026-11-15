"""Extract compact derived contour profiles from the private reference STLs.

This script is a local authoring tool.  It reads the purchased/reference STL
bundles, writes only a JSON table of resampled 2D control sections, and never
copies an STL into the repository.  The generated JSON is what the runtime loft
engine consumes; no 3D mesh is stored in the repository or served to the app.

Usage (from the repository root):
    python scripts/extract_connector_profiles.py \
        --edge-dir "C:/path/to/Edge Connector Bundle/STLs" \
        --connector-dir "C:/path/to/Connector Bundle/STLs"

Optional dependencies for this local tool: trimesh, scipy.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from conectors.mesh import is_shell_watertight  # noqa: E402
from conectors.profiles import build_profile_mesh  # noqa: E402

# The preset id is the stable public id in the studio.  The right-hand side is
# the local reference filename only; the file itself is never copied.
REFERENCE_FILES: dict[str, str] = {
    "edge1": "Edge1.stl",
    "edge1-boot": "Edge1_Boot.stl",
    "edge1-paw": "Edge1_Paw.stl",
    "edge2-corner": "Edge2_Corner.stl",
    "edge2-flat": "Edge2_Flat.stl",
    "edge3-corner": "Edge3_Corner.stl",
    "edge3-flat": "Edge3_Flat.stl",
    "edge3-l": "Edge3_L.stl",
    "edge3-l-flipped": "Edge3_LFlipped.stl",
    "edge3-t": "Edge3_T.stl",
    "edge4-corner": "Edge4_Corner.stl",
    "edge4-flat": "Edge4_Flat.stl",
    "edge4-l": "Edge4_L.stl",
    "edge4-l-flipped": "Edge4_LFlipped.stl",
    "edge5-corner": "Edge5_Corner.stl",
    "edge5-l": "Edge5_L.stl",
    "edge5-l-flipped": "Edge5_LFlipped.stl",
    "edge7-corner": "Edge7_Corner.stl",
    "connector": "Connector.stl",
    "connector-peg": "Connector_Peg.stl",
    "connector-peg-5mm": "Connector_Peg_5mm.stl",
    "connector-360": "360 Connector.stl",
    "connector-flat-peg": "ConnectorFlat_Peg.stl",
    "connector-flat-peg-5mm": "ConnectorFlat_Peg_5mm.stl",
    "angled30": "Angled30.stl",
    "angled30-l": "Angled30_L.stl",
    "angled30-r": "Angled30_R.stl",
    "angled45": "Angled45.stl",
    "angled45-l": "Angled45_L.stl",
    "angled45-r": "Angled45_R.stl",
    "leg-connector": "Leg Connector.stl",
    "leg-connector-peg": "Leg Connector_Peg.stl",
    "leg-connector-peg-5mm": "Leg Connector_Peg_5mm.stl",
    "leg30-connector": "Leg30 Connector.stl",
    "leg30-connector-peg": "Leg30 Connector_Peg.stl",
    "leg30-connector-peg-5mm": "Leg30 Connector_Peg_5mm.stl",
    "leg30-s": "Leg30 S.stl",
    "leg30-s-l": "Leg30 S_L.stl",
    "leg30-s-r": "Leg30 S_R.stl",
    "leg45-s": "Leg45 S.stl",
    "leg45-s-l": "Leg45 S_L.stl",
    "leg45-s-r": "Leg45 S_R.stl",
    "peg-cutout": "Peg_Cutout.stl",
}

# Right-handed local section axes: e_u x e_v points along the loft axis.  This
# keeps the reconstructed shell's winding consistent without mirroring it.
SECTION_AXES = {
    0: (1, 2),  # loft along +X: u=Y, v=Z
    1: (2, 0),  # loft along +Y: u=Z, v=X
    2: (0, 1),  # loft along +Z: u=X, v=Y
}


def _resample(ring: np.ndarray, count: int) -> np.ndarray | None:
    pts = np.asarray(ring, dtype=float)
    if len(pts) < 3:
        return None
    if np.allclose(pts[0], pts[-1]):
        pts = pts[:-1]
    if len(pts) < 3:
        return None
    # Start at the right-most point.  The per-layer phase is fixed later by a
    # cyclic shift that minimises distance to the previous layer.
    start = int(np.argmax(pts[:, 0]))
    pts = np.roll(pts, -start, axis=0)
    closed = np.vstack([pts, pts[0]])
    distances = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    total = float(distances.sum())
    if total <= 1e-9:
        return None
    cumulative = np.concatenate([[0.0], np.cumsum(distances)])
    targets = np.linspace(0.0, total, count, endpoint=False)
    out = np.zeros((count, 2), dtype=float)
    for index, target in enumerate(targets):
        segment = int(np.searchsorted(cumulative, target, side="right") - 1)
        segment = min(max(segment, 0), len(distances) - 1)
        fraction = (target - cumulative[segment]) / max(distances[segment], 1e-12)
        out[index] = closed[segment] + (closed[segment + 1] - closed[segment]) * fraction
    return out


def _signed_area(ring: np.ndarray) -> float:
    x, y = ring[:, 0], ring[:, 1]
    return float((x * np.roll(y, -1) - np.roll(x, -1) * y).sum() / 2.0)


def _align(ring: np.ndarray, previous: np.ndarray | None) -> np.ndarray:
    if _signed_area(ring) < 0:
        ring = ring[::-1]
    if previous is None:
        return ring
    count = len(ring)
    best_shift = 0
    best_distance = float("inf")
    for shift in range(count):
        shifted = np.roll(ring, shift, axis=0)
        distance = float(np.mean(np.linalg.norm(shifted - previous, axis=1)))
        if distance < best_distance:
            best_distance = distance
            best_shift = shift
    return np.roll(ring, best_shift, axis=0)


def _section_profile(
    mesh: trimesh.Trimesh,
    axis: int,
    slices: int,
    points: int,
    margin: float = 0.0005,
) -> dict | None:
    lower, upper = mesh.bounds
    u_axis, v_axis = SECTION_AXES[axis]
    rings: list[np.ndarray] = []
    positions: list[float] = []
    max_holes = 0
    max_polygons = 0
    for index in range(slices):
        # Keep the first/last section almost at the envelope tangent.  At the
        # exact tangent the section is frequently empty or a line; a 0.05 %
        # inset captures the end caps without degenerate polygons.
        fraction = margin + (1.0 - 2.0 * margin) * index / max(slices - 1, 1)
        position = float(lower[axis] + (upper[axis] - lower[axis]) * fraction)
        origin = np.zeros(3, dtype=float)
        origin[axis] = position
        normal = np.zeros(3, dtype=float)
        normal[axis] = 1.0
        section = mesh.section(plane_origin=origin, plane_normal=normal)
        if section is None:
            return None
        planar, transform = section.to_planar()
        polygons = list(planar.polygons_full)
        if not polygons:
            return None
        max_holes = max(max_holes, sum(len(item.interiors) for item in polygons))
        max_polygons = max(max_polygons, len(polygons))
        polygon = max(polygons, key=lambda item: item.area)
        local = np.asarray(polygon.exterior.coords[:-1], dtype=float)
        if len(local) < 3:
            return None
        # Map planar (x, y, 0, 1) to world coordinates through the section
        # transform, then keep the two selected world axes.
        homogeneous = np.column_stack([local, np.zeros(len(local)), np.ones(len(local))])
        world = homogeneous @ np.asarray(transform, dtype=float).T
        resampled = _resample(world[:, [u_axis, v_axis]], points)
        if resampled is None:
            return None
        rings.append(_align(resampled, rings[-1] if rings else None))
        positions.append(position)
    if len(rings) < 2:
        return None
    return {
        "axis": axis,
        "axes": [u_axis, v_axis],
        "max_holes": max_holes,
        "max_polygons": max_polygons,
        "positions": [round(value, 3) for value in positions],
        "rings": [
            [[round(float(u), 3), round(float(v), 3)] for u, v in ring]
            for ring in rings
        ],
    }


def _profile_mesh(profile: dict):
    return build_profile_mesh(profile)


def _chamfer_pct(reference: trimesh.Trimesh, generated: trimesh.Trimesh, samples: int = 8000) -> tuple[float, float, float]:
    reference_points = np.asarray(reference.sample(samples), dtype=float)
    generated_points = np.asarray(generated.sample(samples), dtype=float)
    forward = trimesh.proximity.closest_point(generated, reference_points)[1]
    backward = trimesh.proximity.closest_point(reference, generated_points)[1]
    diagonal = float(np.linalg.norm(reference.extents))
    return (
        float(forward.mean()),
        float(backward.mean()),
        max(float(forward.mean()), float(backward.mean())) / max(diagonal, 1e-9) * 100.0,
    )


def _find_reference(filename: str, roots: list[Path]) -> Path | None:
    for root in roots:
        candidate = root / filename
        if candidate.exists():
            return candidate
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edge-dir", type=Path, required=True, help="Folder containing Edge*.stl")
    parser.add_argument("--connector-dir", type=Path, required=True, help="Folder containing Connector*.stl and the other STLs")
    parser.add_argument("--output", type=Path, default=ROOT / "conectors" / "profiles.json")
    parser.add_argument("--slices", type=int, default=48)
    parser.add_argument("--points", type=int, default=192)
    parser.add_argument("--margin", type=float, default=0.0005)
    args = parser.parse_args()

    roots = [args.edge_dir, args.connector_dir]
    profiles: dict[str, dict] = {}
    failures: list[str] = []
    for preset_id, filename in REFERENCE_FILES.items():
        path = _find_reference(filename, roots)
        if path is None:
            failures.append(f"{preset_id}: missing {filename}")
            continue
        reference = trimesh.load(path, force="mesh", process=True)
        lower, upper = reference.bounds
        target_center = [float((lower[i] + upper[i]) / 2.0) for i in range(3)]
        target_extents = [float(upper[i] - lower[i]) for i in range(3)]
        candidates = []
        for axis in (0, 1, 2):
            profile = _section_profile(reference, axis, args.slices, args.points, args.margin)
            if profile is None:
                continue
            profile["target_center"] = target_center
            profile["target_extents"] = target_extents
            generated = _profile_mesh(profile)
            if generated is None or not len(generated.faces):
                continue
            generated_trimesh = trimesh.Trimesh(
                vertices=np.asarray(generated.vertices),
                faces=np.asarray(generated.faces),
                process=True,
            )
            forward, backward, error_pct = _chamfer_pct(reference, generated_trimesh)
            candidate = {
                **profile,
                "reference_file": filename,
                "slices": args.slices,
                "points": args.points,
                "error_pct": round(error_pct, 4),
                "surface_error_pct": round(error_pct, 4),
                "chamfer_mm": [round(forward, 4), round(backward, 4)],
                "watertight": bool(is_shell_watertight(generated)),
            }
            candidates.append(candidate)
        if not candidates:
            failures.append(f"{preset_id}: no valid section profile")
            continue
        # Pick the axis with the lowest measured surface error.  The largest
        # island from each slice is the outer shell; separate tiny slivers at
        # the tangent caps would only add noise.
        best = min(candidates, key=lambda item: float(item["surface_error_pct"]))
        if float(best["surface_error_pct"]) >= 0.5:
            failures.append(f"{preset_id}: best error is {best['surface_error_pct']}%")
        profiles[preset_id] = best
        print(
            f"{preset_id:26s} axis={'XYZ'[best['axis']]} holes={best.get('max_holes', 0)} "
            f"parts={best.get('max_polygons', 1)} error={best['surface_error_pct']:.3f}% "
            f"watertight={best['watertight']}"
        )

    payload = {
        "version": 1,
        "description": (
            "Derived 2D section control curves for the parametric connector presets. "
            "No 3D mesh or reference STL is included. The sections are the editable base geometry."
        ),
        "slices": args.slices,
        "points": args.points,
        "profiles": profiles,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {args.output} ({args.output.stat().st_size / 1024:.1f} KB)")
    if failures:
        print("Warnings:", *failures, sep="\n  ")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
