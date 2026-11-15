"""Verify the derived faithful surfaces against the private reference STLs.

Local-only QA.  It reports symmetric point-to-surface error (mean nearest
distance), normalized by the reference bounding-box diagonal.  The committed
``exact_meshes.npz`` must stay below 0.1 % for every default preset.
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

from conectors.exact import available_exact, exact_mesh  # noqa: E402
from conectors.mesh import is_shell_watertight  # noqa: E402
from scripts.extract_connector_profiles import REFERENCE_FILES, _find_reference  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edge-dir", type=Path, required=True)
    parser.add_argument("--connector-dir", type=Path, required=True)
    parser.add_argument("--samples", type=int, default=25000)
    args = parser.parse_args()
    roots = [args.edge_dir, args.connector_dir]
    failures: list[str] = []
    worst = (0.0, "")
    for profile_id in available_exact():
        path = _find_reference(REFERENCE_FILES[profile_id], roots)
        if path is None:
            failures.append(f"{profile_id}: missing reference")
            continue
        reference = trimesh.load(path, force="mesh", process=True)
        generated = exact_mesh(profile_id)
        if not is_shell_watertight(generated):
            failures.append(f"{profile_id}: not watertight")
            continue
        generated = trimesh.Trimesh(
            vertices=np.asarray(generated.vertices),
            faces=np.asarray(generated.faces),
            process=False,
        )
        a = np.asarray(reference.sample(args.samples), dtype=float)
        b = np.asarray(generated.sample(args.samples), dtype=float)
        forward = trimesh.proximity.closest_point(generated, a)[1]
        backward = trimesh.proximity.closest_point(reference, b)[1]
        diagonal = float(np.linalg.norm(reference.extents))
        error = max(float(forward.mean()), float(backward.mean())) / max(diagonal, 1e-9) * 100.0
        worst = max(worst, (error, profile_id))
        if error >= 0.1:
            failures.append(f"{profile_id}: {error:.4f}%")
        print(f"{profile_id:24s} {error:.5f}%")
    print(f"Worst: {worst[0]:.5f}% ({worst[1]})")
    if failures:
        print("Failures:", *failures, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
