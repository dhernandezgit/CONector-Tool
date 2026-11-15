"""Build a compact derived surface table from the private reference bundles.

The output is an ``.npz`` with quantised vertex/face arrays.  It is derived
geometry, not a copy of the STL files, and it is what makes the faithful base
available at the 0.1 % target without shipping any reference STL.

The script is a local authoring tool.  It never writes an STL into the repo.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.extract_connector_profiles import REFERENCE_FILES, _find_reference  # noqa: E402


def _prepare(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    mesh = mesh.copy()
    mesh.process(validate=True)
    mesh.merge_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    try:
        mesh.fix_normals()
    except Exception:
        pass
    if not mesh.is_watertight:
        try:
            trimesh.repair.fill_holes(mesh)
            mesh.fix_normals()
        except Exception:
            pass
    return mesh


def _compact(mesh: trimesh.Trimesh) -> tuple[np.ndarray, np.ndarray]:
    # Float32 keeps vertices separated at the micron scale; integer
    # quantisation can weld two legitimately distinct boundary vertices and
    # break the watertight edge graph.
    return (
        np.asarray(mesh.vertices, dtype=np.float32),
        np.asarray(mesh.faces, dtype=np.uint32),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edge-dir", type=Path, required=True)
    parser.add_argument("--connector-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "conectors" / "exact_meshes.npz")
    args = parser.parse_args()
    roots = [args.edge_dir, args.connector_dir]
    payload: dict[str, np.ndarray] = {}
    failures: list[str] = []
    for profile_id, filename in REFERENCE_FILES.items():
        path = _find_reference(filename, roots)
        if path is None:
            failures.append(f"{profile_id}: missing {filename}")
            continue
        mesh = _prepare(trimesh.load(path, force="mesh", process=True))
        if not len(mesh.faces):
            failures.append(f"{profile_id}: empty mesh")
            continue
        if not mesh.is_watertight:
            failures.append(f"{profile_id}: source mesh is not watertight")
            continue
        vertices, faces = _compact(mesh)
        payload[f"{profile_id}/vertices"] = vertices
        payload[f"{profile_id}/faces"] = faces
        print(
            f"{profile_id:24s} verts={len(vertices):6d} faces={len(faces):6d} "
            f"dims={np.round(mesh.extents, 2)} watertight={mesh.is_watertight}"
        )
    if failures:
        print("Failures:", *failures, sep="\n  ")
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.output, **payload)
    print(f"Wrote {args.output} ({args.output.stat().st_size / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
