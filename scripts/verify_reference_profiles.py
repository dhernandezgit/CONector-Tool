"""Local surface check for the derived 2D connector profiles.

This is intentionally a local authoring/QA script: point it at the private
reference STL folders and it rebuilds every profile from ``profiles.json`` and
measures the symmetric point-to-surface distance.  It never copies an STL into
the repository.  Optional dependencies: trimesh and scipy.

The reported percentage is the larger of the two mean surface distances divided
by the reference bounding-box diagonal.  The profile table stores only 2D
section curves; the runtime loft is the only generated geometry.
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
from conectors.profiles import build_profile_mesh, load_profiles  # noqa: E402
from scripts.extract_connector_profiles import REFERENCE_FILES, _find_reference  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--edge-dir", type=Path, required=True)
    parser.add_argument("--connector-dir", type=Path, required=True)
    parser.add_argument("--samples", type=int, default=8000)
    parser.add_argument("--report", type=Path, default=None)
    parser.add_argument("--limit", type=float, default=0.5)
    args = parser.parse_args()

    roots = [args.edge_dir, args.connector_dir]
    profiles = load_profiles().get("profiles", {})
    failures = []
    report = []
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
        forward = trimesh.proximity.closest_point(generated_trimesh, a)[1]
        backward = trimesh.proximity.closest_point(reference, b)[1]
        diagonal = float(np.linalg.norm(reference.extents))
        error = max(float(forward.mean()), float(backward.mean())) / max(diagonal, 1e-9) * 100.0
        extents = [float(value) for value in generated_trimesh.extents]
        target = [float(value) for value in reference.extents]
        envelope_error = max(abs(extents[i] - target[i]) for i in range(3))
        if error >= args.limit:
            failures.append(f"{profile_id}: {error:.3f}% > {args.limit:.3f}%")
        if envelope_error > 0.06:
            failures.append(f"{profile_id}: envelope drift {envelope_error:.3f} mm")
        if error > worst[0]:
            worst = (error, profile_id)
        report.append(
            {
                "id": profile_id,
                "surface_error_pct": round(error, 4),
                "extents": [round(value, 4) for value in extents],
                "target_extents": [round(value, 4) for value in target],
                "envelope_error_mm": round(envelope_error, 4),
                "watertight": bool(is_shell_watertight(generated)),
            }
        )
        print(
            f"{profile_id:26s} {error:6.3f}%  envelope={envelope_error:.3f}mm  "
            f"watertight={is_shell_watertight(generated)}"
        )
    print(f"Worst: {worst[0]:.3f}% ({worst[1]})")
    if args.report:
        args.report.write_text(
            json.dumps({"profiles": report, "worst": {"id": worst[1], "error_pct": worst[0]}}, indent=2),
            encoding="utf-8",
        )
    if failures:
        print("Failures:", *failures, sep="\n  ")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
