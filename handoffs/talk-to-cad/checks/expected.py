"""Analytic ground truth for every part family (written by Claude, do not edit).

Everything here is derived from the spec alone, never from the mesh, so the
checks in check_mesh.py compare the minion's geometry against independent math.
All units are mm.
"""
import math

FAMILIES = ("plate", "cylinder", "washer", "box", "bracket")


def _hole_vol(holes, depth):
    return sum(math.pi * (h["d"] / 2.0) ** 2 * depth for h in holes or [])


def expected_bbox(spec):
    """(x, y, z) extents the exported mesh must have."""
    f, d = spec["family"], spec["dims"]
    if f == "plate":
        return (d["length"], d["width"], d["thickness"])
    if f == "cylinder":
        return (d["outer_d"], d["outer_d"], d["height"])
    if f == "washer":
        return (d["outer_d"], d["outer_d"], d["thickness"])
    if f == "box":
        return (d["length"], d["width"], d["height"])
    if f == "bracket":
        return (d["leg_a"], d["width"], d["leg_b"])
    raise ValueError(f"unknown family {f}")


def expected_volume(spec):
    f, d = spec["family"], spec["dims"]
    if f == "plate":
        r = d.get("corner_radius", 0.0)
        v = d["length"] * d["width"] * d["thickness"]
        v -= (4.0 - math.pi) * r * r * d["thickness"]
        return v - _hole_vol(spec.get("holes"), d["thickness"])
    if f == "cylinder":
        return math.pi / 4.0 * (d["outer_d"] ** 2 - d.get("inner_d", 0.0) ** 2) * d["height"]
    if f == "washer":
        return math.pi / 4.0 * (d["outer_d"] ** 2 - d["inner_d"] ** 2) * d["thickness"]
    if f == "box":
        w, fl = d["wall"], d["floor"]
        outer = d["length"] * d["width"] * d["height"]
        inner = (d["length"] - 2 * w) * (d["width"] - 2 * w) * (d["height"] - fl)
        return outer - inner
    if f == "bracket":
        t, w = d["thickness"], d["width"]
        v = d["leg_a"] * w * t + d["leg_b"] * w * t - t * t * w
        return v - _hole_vol(spec.get("holes_a"), t) - _hole_vol(spec.get("holes_b"), t)
    raise ValueError(f"unknown family {f}")


def expected_sections(spec):
    """Plane cuts the checker makes and what it must find in each.

    Returns a list of dicts: {"axis": 'x'|'y'|'z', "at": float,
    "interiors": [ {"d": diam, "center": (u, v)} | {"rect": (w, h)} ]}
    Section coordinates (u, v) are the two remaining axes in order (x,y),(x,z),(y,z).
    """
    f, d = spec["family"], spec["dims"]
    if f == "plate":
        ints = [{"d": h["d"], "center": (h["x"], h["y"])} for h in spec.get("holes", [])]
        return [{"axis": "z", "at": d["thickness"] / 2.0, "interiors": ints}]
    if f == "cylinder":
        ints = [] if d.get("inner_d", 0) <= 0 else [{"d": d["inner_d"], "center": (0.0, 0.0)}]
        return [{"axis": "z", "at": d["height"] / 2.0, "interiors": ints}]
    if f == "washer":
        return [{"axis": "z", "at": d["thickness"] / 2.0,
                 "interiors": [{"d": d["inner_d"], "center": (0.0, 0.0)}]}]
    if f == "box":
        w = d["wall"]
        return [
            {"axis": "z", "at": d["floor"] / 2.0, "interiors": []},
            {"axis": "z", "at": (d["floor"] + d["height"]) / 2.0,
             "interiors": [{"rect": (d["length"] - 2 * w, d["width"] - 2 * w)}]},
        ]
    if f == "bracket":
        t = d["thickness"]
        # Bracket coordinates: outer corner at origin. Leg A along +X (z in [0,t]),
        # leg B along +Z (x in [0,t]). Hole x = distance along the leg from the
        # outer corner, y = across the width. Both legs' holes use the same keys.
        ints_a = [{"d": h["d"], "center": (h["x"], h["y"])} for h in spec.get("holes_a", [])]
        ints_b = [{"d": h["d"], "center": (h["y"], h["x"])} for h in spec.get("holes_b", [])]
        return [
            {"axis": "z", "at": t / 2.0, "interiors": ints_a},   # section plane (x, y)
            {"axis": "x", "at": t / 2.0, "interiors": ints_b},   # section plane (y, z)
        ]
    raise ValueError(f"unknown family {f}")


def expected_origin(spec):
    """Where the mesh's bounding-box minimum corner must be (keeps orientation fixed)."""
    f, d = spec["family"], spec["dims"]
    if f in ("plate", "cylinder", "washer", "box"):
        bx, by, _ = expected_bbox(spec)
        return (-bx / 2.0, -by / 2.0, 0.0)   # centered in XY, sitting on Z=0
    if f == "bracket":
        return (0.0, 0.0, 0.0)
    raise ValueError(f"unknown family {f}")
