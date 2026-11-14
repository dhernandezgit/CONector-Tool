from conectors.mesh import is_shell_watertight
from conectors.profiles import build_profile_mesh, load_profiles


def test_all_derived_profiles_are_within_tolerance_and_watertight():
    data = load_profiles()
    profiles = data["profiles"]
    assert len(profiles) == 43
    failures = []
    for profile_id, profile in profiles.items():
        if float(profile["error_pct"]) >= 1.0:
            failures.append(f"{profile_id}: error {profile['error_pct']}%")
        mesh = build_profile_mesh(profile)
        if not len(mesh.faces) or not is_shell_watertight(mesh):
            failures.append(f"{profile_id}: non-watertight")
        if any(value <= 0 for value in mesh.extents):
            failures.append(f"{profile_id}: empty extents")
    assert not failures, failures


def test_profile_scales_are_parametric_and_stay_watertight():
    data = load_profiles()
    profile = data["profiles"]["edge1"]
    base = build_profile_mesh(profile)
    scaled = build_profile_mesh(profile, 1.25, 0.9, 1.1)
    assert scaled.extents[0] > base.extents[0]
    assert scaled.extents[2] > base.extents[2]
    assert is_shell_watertight(scaled)
