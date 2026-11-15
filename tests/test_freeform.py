from conectors.engine import build
from conectors.freeform import parametric_mesh
from conectors.mesh import is_shell_watertight


def _settings(**overrides):
    base = {
        "family": "parametric",
        "body_size": 37,
        "body_width": 37,
        "body_depth": 37,
        "body_height": 26,
        "body_shape": "rounded",
        "body_chamfer": 3,
        "smoothness": 0.65,
        "wire_diameter": 4,
        "clearance": 0.25,
        "channel_width": 4.5,
        "grip_wall": 2.4,
        "mouth_width": 3.2,
        "wrap_degrees": 305,
        "grip_lines": 3,
        "grip_depth": 0.35,
        "ports": [
            {"id": "a", "angle": 0, "level": "both", "length": 0, "width": 10, "enabled": True},
            {"id": "b", "angle": 90, "level": "both", "length": 0, "width": 10, "enabled": True},
        ],
        "leg": {"enabled": False, "height": 0, "angle": 0, "foot": 24, "sole": 3},
        "leg_length": 48,
        "leg_azimuth": 0,
        "leg_width": 12,
        "leg_thickness": 4,
        "special": {"peg": False, "peg_diameter": 5, "peg_length": 8},
    }
    base.update(overrides)
    return base


def test_parametric_mesh_is_watertight_and_editable() -> None:
    base = parametric_mesh(_settings())
    assert len(base.faces) > 200
    assert is_shell_watertight(base)

    angled = _settings(
        ports=[
            {"id": "a", "angle": 0, "level": "both", "length": 0, "width": 10, "enabled": True},
            {"id": "b", "angle": 30, "level": "both", "length": 18, "width": 10, "enabled": True},
        ]
    )
    angled_mesh = parametric_mesh(angled)
    assert is_shell_watertight(angled_mesh)
    assert angled_mesh.bounds != base.bounds

    narrow = parametric_mesh(
        _settings(
            channel_width=3.2,
            ports=[
                {"id": "a", "angle": 0, "level": "both", "length": 0, "width": 3.2, "depth": 10, "enabled": True},
                {"id": "b", "angle": 90, "level": "both", "length": 0, "width": 3.2, "depth": 10, "enabled": True},
            ],
        )
    )
    assert is_shell_watertight(narrow)
    assert narrow.volume() > base.volume()

    ribbed = parametric_mesh(_settings(grip_lines=8, grip_depth=0.8))
    assert is_shell_watertight(ribbed)
    assert ribbed.volume() > base.volume()

    extra = parametric_mesh(
        _settings(
            ports=[
                *(_settings()["ports"]),
                {"id": "c", "angle": 180, "level": "top", "length": 8, "width": 12, "enabled": True},
            ]
        )
    )
    assert is_shell_watertight(extra)
    assert extra.volume() < base.volume()


def test_leg_height_and_build_branch() -> None:
    low = parametric_mesh(_settings(leg={"enabled": True, "height": 0, "angle": 30, "foot": 24, "sole": 3}))
    high = parametric_mesh(_settings(leg={"enabled": True, "height": 40, "angle": 30, "foot": 24, "sole": 3}))
    assert is_shell_watertight(low)
    assert is_shell_watertight(high)
    assert high.extents[2] > low.extents[2] + 20

    result = build({**_settings(), "print": {"orientation": "auto45"}})
    assert result["ok"]
    assert result["parts"][0]["watertight"]
    assert result["parts"][0]["print_overhang"] <= 0.35
