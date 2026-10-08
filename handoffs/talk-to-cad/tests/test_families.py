"""Geometry contract for every family (written by Claude, do not edit).

talk_to_cad.build.build_part(spec: dict, out_dir: str, bed: float = 260) -> dict
must write spec.json, part.stl and part.3mf into out_dir and return a dict with
those three paths under keys "spec", "stl", "3mf".  The mesh must satisfy
checks/check_mesh.py (bbox, origin, single watertight body, analytic volume,
hole sections, bed fit, 3MF round trip).  Test ids contain the family name so
`-k plate` etc. selects one family.
"""
import json
import os

import pytest

from checks.check_mesh import check_out_dir
from talk_to_cad.build import build_part

GOLDEN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "checks", "golden.json")
with open(GOLDEN, encoding="utf-8") as f:
    CASES = json.load(f)["cases"]

EXTRA = [
    # thin plate, off-centre holes of two sizes
    {"name": "plate_extra", "spec": {"spec_version": 1, "family": "plate", "name": "plate_extra",
        "dims": {"length": 80, "width": 20, "thickness": 2, "corner_radius": 3},
        "holes": [{"d": 3.2, "x": -30, "y": 5}, {"d": 6.5, "x": 20, "y": -3}]}},
    # tall tube: thin wall
    {"name": "cylinder_extra", "spec": {"spec_version": 1, "family": "cylinder", "name": "cylinder_extra",
        "dims": {"outer_d": 30, "height": 80, "inner_d": 27}}},
    # tiny washer
    {"name": "washer_extra", "spec": {"spec_version": 1, "family": "washer", "name": "washer_extra",
        "dims": {"outer_d": 7, "inner_d": 3.2, "thickness": 0.8}}},
    # box with explicit thicker floor
    {"name": "box_extra", "spec": {"spec_version": 1, "family": "box", "name": "box_extra",
        "dims": {"length": 100, "width": 70, "height": 40, "wall": 3, "floor": 5}}},
    # unequal legs, two holes on one leg, none on the other
    {"name": "bracket_extra", "spec": {"spec_version": 1, "family": "bracket", "name": "bracket_extra",
        "dims": {"leg_a": 60, "leg_b": 30, "width": 25, "thickness": 4},
        "holes_a": [{"d": 5, "x": 20, "y": 12.5}, {"d": 5, "x": 45, "y": 12.5}], "holes_b": []}},
]
ALL = [(c["name"], c["spec"]) for c in CASES] + [(c["name"], c["spec"]) for c in EXTRA]


@pytest.mark.parametrize("name,spec", ALL, ids=[n for n, _ in ALL])
def test_family_geometry(tmp_path, name, spec):
    out_dir = str(tmp_path / name)
    paths = build_part(spec, out_dir)
    assert set(paths) >= {"spec", "stl", "3mf"}
    for p in paths.values():
        assert os.path.exists(p), p
    errs = check_out_dir(out_dir)
    assert not errs, "\n".join(errs)


def test_bed_fit_is_enforced(tmp_path):
    spec = {"spec_version": 1, "family": "plate", "name": "too_big",
            "dims": {"length": 300, "width": 20, "thickness": 2}}
    with pytest.raises(Exception) as ei:
        build_part(spec, str(tmp_path / "big"), bed=260)
    assert "bed" in str(ei.value).lower()
