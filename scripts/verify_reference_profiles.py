"""Local point-cloud check for the derived connector profiles.

This is intentionally a local authoring/QA script: point it at the private
reference STL folders and it rebuilds every profile from ``profiles.json`` and
measures the symmetric Chamfer distance.  It never copies an STL into the
repository.  Optional dependencies: trimesh and scipy.

The reported percentage is the larger of the two mean nearest-neighbour
distances divided by the reference bounding-box diagonal.  The studio keeps the
same sections and caps, so this is the number used for the <= 1 % target.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import trimesh
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from conectors.mesh import is_shell_watertight  # noqa: E402
from conectors.profiles import build_profile_mesh, load_profiles  # noqa: E402
from scripts.extract_connector_profiles import REFERENCE_FILES, _find_reference  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edge-dir", type=Path, required=True)
    parser.add_argument("--connector-dir", type=Path, required=True)
    parser.add_argument("--samples", type=int, default=20000)
    args = parser.parse_args()

    roots = [args.edge_dir, args.connector_dir]
    profiles = load_profiles().get("profiles", {})
    failures = []
    worst = (0.0, "")
    for profile_id, profile in profiles.items():
        path = _find_reference(REFERENCE_FILES[profile_id], roots)
        if path is None:
            failures.append(f"{profile_id}: missing reference")
            continue
        reference = trimesh.load(path, force="mesh", process=True)
        generated = build_profile_mesh(profile)
        if not is_shell_watertight(generated):
            failures.append(f"{profile_id}: generated mesh is not watertight")
            continue
        generated_trimesh = trimesh.Trimesh(
            vertices=np.asarray(generated.vertices),
            faces=np.asarray(generated.faces),
            process=True,
        )
        a = np.asarray(reference.sample(args.samples), dtype=float)
        b = np.asarray(generated_trimesh.sample(args.samples), dtype=float)
        forward = cKDTree(b).query(a)[0]
        backward = cKDTree(a).query(b)[0]
        diagonal = float(np.linalg.norm(reference.extents))
        error = max(float(forward.mean()), float(backward.mean())) / max(diagonal, 1e-9) * 100.0
        if error >= 1.0:
            failures.append(f"{profile_id}: {error:.3f}% > 1%")
        if error > worst[0]:
            worst = (error, profile_id)
        print(f"{profile_id:26s} {error:6.3f}%  watertight={is_shell_watertight(generated)}")
    print(f"Worst: {worst[0]:.3f}% ({worst[1]})")
    if failures:
        print("Failures:", *failures, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
