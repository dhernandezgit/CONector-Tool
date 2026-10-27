from __future__ import annotations

import numpy as np

from conectors.mesh import (
    Mesh,
    c_profile,
    cylinder,
    extrude_polygon,
    rounded_rect,
    split_mesh,
    weld_mesh,
)


def test_extrusion_is_watertight() -> None:
    mesh = extrude_polygon(rounded_rect(30, 20, 4), 0, 8)
    assert mesh.is_watertight()
    assert mesh.volume() > 0
    assert mesh.bounds["max"][2] == 8


def test_extrusion_with_hole() -> None:
    outer = rounded_rect(30, 30, 5)
    hole = rounded_rect(10, 10, 2).buffer(0)
    from shapely.geometry import Point

    poly = outer.difference(Point(0, 0).buffer(4, quad_segs=32))
    assert hole.area > 0
    mesh = extrude_polygon(poly, 0, 5)
    assert mesh.is_watertight()
    assert len(mesh.faces) > 0


def test_c_profile_has_open_mouth() -> None:
    poly = c_profile(wire_diameter=4, clearance=0.25, wall=2.4, mouth_width=3.2)
    assert poly.is_valid
    assert poly.area > 10
    # The C must not be a closed washer: its outer ring has a real mouth.
    assert poly.bounds[3] > 4
    assert poly.bounds[3] < 7


def test_split_cube_halves_are_watertight() -> None:
    mesh = extrude_polygon(rounded_rect(20, 20, 4), -10, 20)
    upper, lower = split_mesh(mesh, "z", 0)
    assert upper.is_watertight()
    assert lower.is_watertight()
    assert abs((upper.volume() + lower.volume()) - mesh.volume()) < 1.0
    assert upper.bounds["min"][2] >= -1e-5
    assert lower.bounds["max"][2] <= 1e-5


def test_split_grip_like_shape() -> None:
    profile = c_profile(4, 0.25, 2.4, 3.2)
    mesh = extrude_polygon(profile, 0, 20)
    upper, lower = split_mesh(mesh, "z", 9)
    assert upper.is_watertight()
    assert lower.is_watertight()


def test_weld_merges_near_duplicate_vertices() -> None:
    mesh = Mesh(
        np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0.005, 0, 0], [1, 0, 0], [0, 1, 0]], dtype=float),
        np.array([[0, 1, 2], [3, 4, 5]], dtype=np.int64),
    )
    welded = weld_mesh(mesh, 0.02)
    assert len(welded.vertices) < len(mesh.vertices)


def test_cylinder_has_expected_volume() -> None:
    mesh = cylinder(5, 10, 60)
    expected = np.pi * 25 * 10
    assert abs(mesh.volume() - expected) / expected < 0.02
    assert mesh.is_watertight()
