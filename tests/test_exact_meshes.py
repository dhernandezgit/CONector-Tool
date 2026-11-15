from conectors.engine import build
from conectors.exact import available_exact, exact_mesh
from conectors.mesh import is_shell_watertight


def test_all_exact_derived_surfaces_are_watertight() -> None:
    ids = available_exact()
    assert len(ids) == 43
    failures = []
    for profile_id in ids:
        mesh = exact_mesh(profile_id)
        if not len(mesh.faces) or not is_shell_watertight(mesh):
            failures.append(profile_id)
    assert not failures, failures


def test_faithful_default_and_customized_parametric_state() -> None:
    faithful = build(
        {
            "family": "parametric",
            "profile_id": "edge1",
            "parametric_customized": False,
            "body_size": 8,
            "body_width": 8,
            "body_depth": 18.5,
            "body_height": 26,
            "print": {"orientation": "auto45"},
        }
    )
    assert faithful["ok"]
    assert faithful["parts"][0]["watertight"]
    dimensions = faithful["parts"][0]["dimensions"]
    assert abs(dimensions[0] - 8.0) < 0.01
    assert abs(dimensions[1] - 18.5) < 0.01
    assert abs(dimensions[2] - 26.0) < 0.01

    customized = build(
        {
            "family": "parametric",
            "profile_id": "edge1",
            "parametric_customized": True,
            "body_size": 8,
            "body_width": 8,
            "body_depth": 18.5,
            "body_height": 26,
            "ports": [
                {"id": "a", "angle": 0, "level": "both", "length": 0, "width": 7, "enabled": True}
            ],
            "print": {"orientation": "auto45"},
        }
    )
    assert customized["ok"]
    assert customized["parts"][0]["watertight"]
