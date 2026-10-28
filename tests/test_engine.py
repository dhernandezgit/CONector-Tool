from __future__ import annotations

import base64
import io
import zipfile

import pytest
from PIL import Image, ImageDraw

from conectors.engine import DEFAULTS, _deep_merge, analyze, build, export_3mf, export_kit


def settings(**overrides):
    return _deep_merge(DEFAULTS, overrides)


@pytest.mark.parametrize(
    "preset",
    ["corner90", "flat", "tee", "cross", "corner3d", "four3d", "five", "six", "single"],
)
def test_build_joint_presets(preset: str) -> None:
    result = build(settings(name=preset, joint_preset=preset, decor={"enabled": False}))
    assert result["ok"]
    assert result["parts"]
    assert all(part["watertight"] for part in result["parts"])
    assert result["dimensions"]["width"] > 15


def test_angle_is_customizable() -> None:
    result = build(settings(family="angle", angle=37, decor={"enabled": False}))
    assert result["parts"][0]["watertight"]
    assert 10 < result["dimensions"]["width"] < 80


def test_families_build() -> None:
    for family in ("node", "angle", "leg", "edge", "hook", "plate"):
        result = build(settings(family=family, name=family, decor={"enabled": True}))
        assert result["parts"], family
        assert all(part["watertight"] for part in result["parts"]), family


def test_split_produces_two_watertight_pieces() -> None:
    base = build(settings(decor={"enabled": False}, split={"enabled": False}))
    split = build(
        settings(
            decor={"enabled": False},
            split={"enabled": True, "axis": "z", "offset": 1.5, "screw_pads": True},
        )
    )
    body_a = next(part for part in split["parts"] if part["name"] == "Cuerpo A")
    body_b = next(part for part in split["parts"] if part["name"] == "Cuerpo B")
    assert body_a["watertight"] and body_b["watertight"]
    assert body_a["volume"] + body_b["volume"] > base["parts"][0]["volume"] * 0.9


def test_custom_decor_shape_is_used() -> None:
    shape = {
        "name": "custom",
        "outer": [[-20, -20], [20, -20], [20, 20], [-20, 20]],
        "holes": [[[-6, -6], [6, -6], [6, 6], [-6, 6]]],
        "bounds": {"minX": -20, "minY": -20, "maxX": 20, "maxY": 20, "width": 40, "height": 40},
        "warnings": [],
    }
    result = build(
        settings(
            family="plate",
            decor={"enabled": True, "shape": "custom", "custom": shape, "size": 50},
        )
    )
    plate = next(part for part in result["parts"] if part["name"] == "Placa frontal")
    assert plate["watertight"]
    assert plate["volume"] > 100


@pytest.mark.parametrize("side", ["front", "back", "both"])
@pytest.mark.parametrize("mount", ["press", "magnet", "screw"])
def test_decor_mounts_and_sides(side: str, mount: str) -> None:
    result = build(
        settings(
            family="plate",
            decor={
                "enabled": True,
                "shape": "flower",
                "side": side,
                "mount": mount,
                "size": 50,
            },
        )
    )
    plates = [part for part in result["parts"] if part["name"].startswith("Placa")]
    assert len(plates) == (2 if side == "both" else 1)
    assert all(part["watertight"] for part in result["parts"])


def test_edge_connector_with_imported_shape() -> None:
    shape = {
        "name": "foto",
        "outer": [[-20, -20], [20, -20], [10, 20], [-10, 20]],
        "holes": [],
        "bounds": {"minX": -20, "minY": -20, "maxX": 20, "maxY": 20, "width": 40, "height": 40},
        "warnings": [],
    }
    result = build(
        settings(
            family="edge",
            decor={"enabled": True, "shape": "custom", "custom": shape, "size": 65},
        )
    )
    assert result["parts"][0]["watertight"]
    assert result["dimensions"]["height"] > 50


def test_table_rest_and_leg_build() -> None:
    result = build(
        settings(
            family="leg",
            leg={"enabled": True, "height": 45, "angle": 30, "foot": 26},
            special={**DEFAULTS["special"], "table_cut": True},
            decor={"enabled": False},
        )
    )
    body = result["parts"][0]
    assert body["watertight"]
    assert body["print_bounds"]["min"][2] == pytest.approx(0, abs=0.05)


def test_calibration_coupon() -> None:
    result = build(settings(family="calibration", name="Cupón"))
    assert result["parts"][0]["name"].startswith("Cupón")
    assert result["parts"][0]["watertight"]
    assert result["parts"][0]["dimensions"][0] > 90


def test_analyze_svg() -> None:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M50 8 C75 8 92 28 92 52 C92 80 72 94 50 94 C28 94 8 80 8 52 C8 28 25 8 50 8 Z" fill="#ef6f5e"/>
    <circle cx="50" cy="48" r="10" fill="#fff"/>
    </svg>"""
    payload = {
        "filename": "flower.svg",
        "data_b64": base64.b64encode(svg.encode()).decode(),
        "target_mm": 70,
    }
    result = analyze(payload)
    assert result["ok"]
    assert len(result["shape"]["outer"]) > 10
    assert result["shape"]["bounds"]["width"] == pytest.approx(70, abs=2)


def test_analyze_raster_png() -> None:
    img = Image.new("RGB", (300, 300), "white")
    draw = ImageDraw.Draw(img)
    draw.ellipse((50, 50, 250, 250), fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    result = analyze(
        {
            "filename": "circle.png",
            "data_b64": base64.b64encode(buf.getvalue()).decode(),
            "target_mm": 60,
        }
    )
    assert result["ok"]
    assert len(result["shape"]["outer"]) > 8
    assert result["shape"]["source_kind"] in {"raster", "svg"}


def test_export_3mf_contains_objects() -> None:
    result = export_3mf(settings(name="Prueba 3MF", decor={"enabled": False}))
    assert result["ok"]
    data = base64.b64decode(result["data_b64"])
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        model = z.read("3D/3dmodel.model").decode()
    assert "<object" in model
    assert "Prueba 3MF" in model


def test_export_kit_quantities() -> None:
    item = settings(name="Esquina kit", decor={"enabled": False})
    result = export_kit({"items": [{"settings": item, "quantity": 2}]})
    assert result["ok"]
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(result["data_b64"]))) as z:
        model = z.read("3D/3dmodel.model").decode()
    assert model.count("<object ") >= 2


def test_checks_report_open_mesh_cleanly() -> None:
    result = build(settings(decor={"enabled": False}))
    assert isinstance(result["checks"], list)
    assert result["material_grams"] > 0
    assert result["build_ms"] >= 0
