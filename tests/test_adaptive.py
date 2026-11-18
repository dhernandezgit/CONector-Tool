from conectors.adaptive import adaptive_mesh, available
from conectors.engine import build
from conectors.mesh import is_shell_watertight
from conectors.profiles import load_profiles


def test_all_adaptive_meshes_are_clean_watertight_and_enveloped():
    ids = available()
    assert len(ids) == 43
    profiles = load_profiles()["profiles"]
    failures = []
    for profile_id in ids:
        mesh = adaptive_mesh(profile_id)
        if not len(mesh.faces):
            failures.append(f"{profile_id}: empty")
            continue
        if not is_shell_watertight(mesh):
            failures.append(f"{profile_id}: non-watertight")
        if mesh.signed_volume() <= 0:
            failures.append(f"{profile_id}: invalid orientation")
        target = profiles[profile_id].get("target_extents")
        if target:
            for axis in range(3):
                if abs(mesh.extents[axis] - float(target[axis])) > 0.08:
                    failures.append(f"{profile_id}: envelope axis {axis}")
    assert not failures, failures


def test_high_fidelity_preset_build_is_parametric_and_printable():
    result = build(
        {
            "family": "profile",
            "profile_id": "edge1",
            "profile_high_fidelity": True,
            "profile_scale_x": 1.1,
            "print": {"orientation": "auto45"},
        }
    )
    assert result["ok"]
    part = result["parts"][0]
    assert part["watertight"]
    assert part["dimensions"][0] > 8.0


def test_adaptive_shape_deformation_stays_watertight():
    mesh = adaptive_mesh(
        "connector",
        {"profile_shape": "rounded", "profile_shape_blend": 0.12},
    )
    assert len(mesh.faces)
    assert is_shell_watertight(mesh)


