"""Contract for talk_to_cad.spec (written by Claude, do not edit).

validate(spec: dict) -> dict  returns a NEW normalized spec with defaults
filled, or raises SpecError whose .missing lists missing required dim names
(empty list for other errors).  DEFAULTS and FAMILIES are module constants.
"""
import copy
import json
import os

import pytest

from talk_to_cad.spec import DEFAULTS, FAMILIES, SpecError, validate

GOLDEN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "checks", "golden.json")
with open(GOLDEN, encoding="utf-8") as f:
    CASES = json.load(f)["cases"]


def test_families_constant():
    assert set(FAMILIES) == {"plate", "cylinder", "washer", "box", "bracket"}


def test_defaults_table():
    assert DEFAULTS["plate"]["corner_radius"] == 0
    assert DEFAULTS["cylinder"]["inner_d"] == 0
    assert DEFAULTS["box"]["wall"] == 2.4
    assert "floor" not in DEFAULTS["box"] or DEFAULTS["box"]["floor"] is None  # floor defaults to wall at validate time


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_golden_specs_validate_unchanged(case):
    spec = copy.deepcopy(case["spec"])
    out = validate(spec)
    assert out["family"] == case["spec"]["family"]
    assert out["dims"] == case["spec"]["dims"]
    for k in ("holes", "holes_a", "holes_b"):
        assert out.get(k, []) == case["spec"].get(k, [])
    assert spec == case["spec"], "validate must not mutate its input"


def test_defaults_are_filled():
    out = validate({"family": "box", "name": "t", "dims": {"length": 30, "width": 20, "height": 10}})
    assert out["dims"]["wall"] == 2.4 and out["dims"]["floor"] == 2.4
    out = validate({"family": "box", "name": "t", "dims": {"length": 30, "width": 20, "height": 10, "wall": 3}})
    assert out["dims"]["floor"] == 3
    out = validate({"family": "plate", "name": "t", "dims": {"length": 10, "width": 10, "thickness": 2}})
    assert out["dims"]["corner_radius"] == 0 and out["holes"] == []
    out = validate({"family": "cylinder", "name": "t", "dims": {"outer_d": 10, "height": 5}})
    assert out["dims"]["inner_d"] == 0
    out = validate({"family": "bracket", "name": "t", "dims": {"leg_a": 20, "leg_b": 20, "width": 10, "thickness": 2}})
    assert out["holes_a"] == [] and out["holes_b"] == []
    assert out["spec_version"] == 1


def test_missing_required_lists_names():
    with pytest.raises(SpecError) as ei:
        validate({"family": "plate", "name": "t", "dims": {"length": 10}})
    assert set(ei.value.missing) == {"width", "thickness"}
    with pytest.raises(SpecError) as ei:
        validate({"family": "washer", "name": "t", "dims": {"outer_d": 10, "thickness": 1}})
    assert ei.value.missing == ["inner_d"]


@pytest.mark.parametrize("bad", [
    {"family": "sphere", "name": "t", "dims": {"d": 5}},
    {"family": "plate", "name": "t", "dims": {"length": 0, "width": 10, "thickness": 2}},
    {"family": "plate", "name": "t", "dims": {"length": -5, "width": 10, "thickness": 2}},
    {"family": "plate", "name": "t", "dims": {"length": 10, "width": 10, "thickness": 2, "corner_radius": 6}},
    {"family": "plate", "name": "t", "dims": {"length": 10, "width": 10, "thickness": 2}, "holes": [{"d": 3, "x": 9, "y": 0}]},
    {"family": "plate", "name": "t", "dims": {"length": 10, "width": 10, "thickness": 2}, "holes": [{"d": 3, "x": 0}]},
    {"family": "cylinder", "name": "t", "dims": {"outer_d": 10, "height": 5, "inner_d": 10}},
    {"family": "washer", "name": "t", "dims": {"outer_d": 10, "inner_d": 12, "thickness": 1}},
    {"family": "box", "name": "t", "dims": {"length": 10, "width": 10, "height": 10, "wall": 5}},
    {"family": "box", "name": "t", "dims": {"length": 10, "width": 10, "height": 10, "floor": 10}},
    {"family": "bracket", "name": "t", "dims": {"leg_a": 20, "leg_b": 20, "width": 10, "thickness": 25}},
    {"family": "bracket", "name": "t", "dims": {"leg_a": 20, "leg_b": 20, "width": 10, "thickness": 2},
     "holes_a": [{"d": 3, "x": 1, "y": 5}]},   # hole overlaps the corner / vertical leg
    {"family": "plate", "name": "t", "dims": {"length": "ten", "width": 10, "thickness": 2}},
    {"family": "plate", "dims": {"length": 10, "width": 10, "thickness": 2}},   # no name
], ids=lambda b: json.dumps(b)[:60])
def test_rejects_bad_specs(bad):
    with pytest.raises(SpecError):
        validate(bad)


def test_name_is_normalised():
    out = validate({"family": "cylinder", "name": "My Spacer #2", "dims": {"outer_d": 8, "height": 10}})
    assert out["name"] == "my_spacer_2"
