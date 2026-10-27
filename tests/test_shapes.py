from __future__ import annotations

import pytest

from conectors.shapes import custom_polygon, decor_details, decor_polygon


@pytest.mark.parametrize(
    "name",
    [
        "cat",
        "star",
        "heart",
        "flower",
        "cloud",
        "mushroom",
        "leaf",
        "clover",
        "diamond",
        "moon",
        "sun",
        "paw",
        "bunny",
        "bear",
        "frog",
        "bat",
        "ghost",
        "butterfly",
        "crown",
        "hex",
        "square",
        "capsule",
    ],
)
def test_decor_polygons_are_valid(name: str) -> None:
    poly = decor_polygon(name, 60)
    assert poly.is_valid
    assert poly.area > 10
    assert max(poly.bounds[2] - poly.bounds[0], poly.bounds[3] - poly.bounds[1]) == pytest.approx(60, abs=0.2)
    details = decor_details(name, 60)
    assert all(detail.is_valid for detail in details)


def test_custom_shape_with_hole() -> None:
    outer = [[-20, -20], [20, -20], [20, 20], [-20, 20]]
    holes = [[[-8, -8], [8, -8], [8, 8], [-8, 8]]]
    poly = custom_polygon(outer, holes, 50)
    assert poly.is_valid
    assert len(poly.interiors) == 1
    assert poly.bounds[2] - poly.bounds[0] == pytest.approx(50, abs=0.1)


def test_invalid_custom_shape_raises() -> None:
    with pytest.raises(ValueError):
        custom_polygon([], [], 50)
