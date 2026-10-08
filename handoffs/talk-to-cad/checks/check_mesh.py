"""Verify an exported part against its spec (written by Claude, do not edit).

Usage:  python checks/check_mesh.py OUT_DIR [--bed 260] [--margin 5]
OUT_DIR must contain spec.json, part.stl, part.3mf.  Exit 0 only if every
check passes; prints one line per failure.

Checks: bbox extents and position, watertight single body, analytic volume,
section cuts (hole count, diameter, position), bed fit, 3MF round-trip.
"""
import argparse
import json
import math
import os
import sys

import numpy as np
import trimesh

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from checks.expected import (expected_bbox, expected_origin, expected_sections,
                             expected_volume)

DIM_TOL = 0.05        # mm, bounding box
POS_TOL = 0.1         # mm, hole centres and origin
HOLE_TOL = 0.1        # mm, hole diameter measured on a mid-plane section
VOL_TOL = 0.01        # 1 % of analytic volume (tessellation of circles is < 0.3 %)
DEFAULT_BED = float(os.environ.get("TALK_TO_CAD_BED_MM", "260"))
DEFAULT_MARGIN = 5.0

_AXIS = {"x": 0, "y": 1, "z": 2}
_PLANE_UV = {"x": (1, 2), "y": (0, 2), "z": (0, 1)}


def _section_interiors(mesh, axis, at):
    """Return list of interior rings (as Nx2 arrays in plane (u,v)) of the cut."""
    normal = np.zeros(3)
    normal[_AXIS[axis]] = 1.0
    origin = np.zeros(3)
    origin[_AXIS[axis]] = at
    sec = mesh.section(plane_origin=origin, plane_normal=normal)
    if sec is None:
        return None, "section is empty"
    u, v = _PLANE_UV[axis]
    # Work in the world (u, v) plane directly instead of to_planar's own frame.
    pts3 = sec.vertices
    path2 = trimesh.path.Path2D(entities=sec.entities, vertices=pts3[:, [u, v]])
    polys = path2.polygons_full
    if len(polys) != 1:
        return None, f"section at {axis}={at} has {len(polys)} outer loops, expected 1"
    rings = [np.asarray(i.coords) for i in polys[0].interiors]
    return rings, None


def _ring_diameter_center(ring):
    mn, mx = ring.min(axis=0), ring.max(axis=0)
    ext = mx - mn
    return ext, (mn + mx) / 2.0


def check_mesh_file(stl_path, spec, bed=DEFAULT_BED, margin=DEFAULT_MARGIN, threemf_path=None):
    errors = []
    mesh = trimesh.load(stl_path, force="mesh")
    if mesh.is_empty or len(mesh.faces) == 0:
        return ["STL is empty"]

    # --- bounding box -------------------------------------------------------
    ext = mesh.bounding_box.extents
    want = np.array(expected_bbox(spec), dtype=float)
    for name, got, exp in zip("xyz", ext, want):
        if abs(got - exp) > DIM_TOL:
            errors.append(f"bbox {name}: got {got:.3f} mm, expected {exp:.3f} mm (tol {DIM_TOL})")
    origin = mesh.bounds[0]
    want_o = np.array(expected_origin(spec), dtype=float)
    for name, got, exp in zip("xyz", origin, want_o):
        if abs(got - exp) > POS_TOL:
            errors.append(f"bbox min {name}: got {got:.3f}, expected {exp:.3f} (part must be positioned per PLAN.md)")

    # --- solidity ----------------------------------------------------------
    if not mesh.is_watertight:
        errors.append("mesh is not watertight")
    if not mesh.is_winding_consistent:
        errors.append("mesh winding is not consistent")
    bodies = mesh.split(only_watertight=False)
    if len(bodies) != 1:
        errors.append(f"mesh has {len(bodies)} bodies, expected 1")
    vol = float(mesh.volume)
    if vol <= 0:
        errors.append(f"mesh volume is {vol:.3f} (inverted normals?)")

    # --- analytic volume ---------------------------------------------------
    want_v = expected_volume(spec)
    if abs(vol - want_v) > VOL_TOL * want_v:
        errors.append(f"volume: got {vol:.2f} mm^3, expected {want_v:.2f} mm^3 (tol {VOL_TOL*100:.1f}%)")

    # --- section cuts: holes / cavities ------------------------------------
    for sec in expected_sections(spec):
        rings, err = _section_interiors(mesh, sec["axis"], sec["at"])
        if err:
            errors.append(err)
            continue
        want_ints = sec["interiors"]
        if len(rings) != len(want_ints):
            errors.append(f"section {sec['axis']}={sec['at']}: found {len(rings)} holes/cavities, expected {len(want_ints)}")
            continue
        unmatched = list(rings)
        for wi in want_ints:
            best = None
            for i, ring in enumerate(unmatched):
                ext2, ctr = _ring_diameter_center(ring)
                if "d" in wi:
                    ok = (abs(ext2[0] - wi["d"]) <= HOLE_TOL and abs(ext2[1] - wi["d"]) <= HOLE_TOL
                          and np.linalg.norm(ctr - np.array(wi["center"])) <= POS_TOL)
                else:
                    ok = abs(ext2[0] - wi["rect"][0]) <= DIM_TOL and abs(ext2[1] - wi["rect"][1]) <= DIM_TOL
                if ok:
                    best = i
                    break
            if best is None:
                errors.append(f"section {sec['axis']}={sec['at']}: no hole/cavity matches {wi}")
            else:
                unmatched.pop(best)

    # --- bed fit -----------------------------------------------------------
    usable = bed - 2 * margin
    if any(e > usable + 1e-6 for e in ext):
        errors.append(f"does not fit bed: extents {ext.round(2).tolist()} > usable {usable} mm")

    # --- 3MF round trip ----------------------------------------------------
    if threemf_path is not None:
        if not os.path.exists(threemf_path):
            errors.append("part.3mf missing")
        else:
            try:
                m3 = trimesh.load(threemf_path, force="mesh")
                if abs(float(m3.volume) - vol) > 0.005 * max(vol, 1.0):
                    errors.append(f"3MF volume {m3.volume:.2f} differs from STL volume {vol:.2f}")
                if not m3.is_watertight:
                    errors.append("3MF mesh is not watertight")
            except Exception as e:  # noqa: BLE001
                errors.append(f"3MF failed to load: {e}")
    return errors


def check_out_dir(out_dir, bed=DEFAULT_BED, margin=DEFAULT_MARGIN):
    spec_p = os.path.join(out_dir, "spec.json")
    stl_p = os.path.join(out_dir, "part.stl")
    mf_p = os.path.join(out_dir, "part.3mf")
    missing = [p for p in (spec_p, stl_p, mf_p) if not os.path.exists(p)]
    if missing:
        return [f"missing file: {p}" for p in missing]
    with open(spec_p, encoding="utf-8") as f:
        spec = json.load(f)
    return check_mesh_file(stl_p, spec, bed=bed, margin=margin, threemf_path=mf_p)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir")
    ap.add_argument("--bed", type=float, default=DEFAULT_BED)
    ap.add_argument("--margin", type=float, default=DEFAULT_MARGIN)
    a = ap.parse_args(argv)
    errs = check_out_dir(a.out_dir, a.bed, a.margin)
    if errs:
        print(f"FAIL {a.out_dir}")
        for e in errs:
            print("  - " + e)
        return 1
    print(f"OK {a.out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
