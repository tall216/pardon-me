"""Run the golden set end to end through the CLI (written by Claude, do not edit).

  python checks/run_golden.py            # spec -> files (no LLM): builders, export, preview
  python checks/run_golden.py --live     # description -> LLM -> spec -> files; spec must match exactly
  python checks/run_golden.py --only NAME

Exit 0 only if every case passes every check.  Output goes to out/golden/ or
out/golden_live/.  Run from WORKDIR.
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from checks.check_mesh import DEFAULT_BED, check_out_dir   # noqa: E402
from checks.check_preview import check_png                 # noqa: E402

GOLDEN = os.path.join(HERE, "golden.json")


def _norm(x):
    if isinstance(x, dict):
        return {k: _norm(v) for k, v in sorted(x.items())}
    if isinstance(x, list):
        return [_norm(v) for v in x]
    if isinstance(x, (int, float)) and not isinstance(x, bool):
        return round(float(x), 4)
    return x


def spec_matches(got, want):
    """Family, dims and hole lists must match exactly (names/notes may differ)."""
    keys = ["family", "dims", "holes", "holes_a", "holes_b"]
    g = {k: _norm(got.get(k, [] if k.startswith("holes") else None)) for k in keys}
    w = {k: _norm(want.get(k, [] if k.startswith("holes") else None)) for k in keys}
    return g == w, g, w


def run_case(case, live, bed):
    name = case["name"]
    out_dir = os.path.join("out", "golden_live" if live else "golden", name)
    if live:
        cmd = [sys.executable, "-m", "talk_to_cad", case["description"], "--out", out_dir,
               "--bed", str(bed), "--no-ask"]
    else:
        spec_path = os.path.join("out", "golden_specs", name + ".json")
        os.makedirs(os.path.dirname(spec_path), exist_ok=True)
        with open(spec_path, "w", encoding="utf-8") as f:
            json.dump(case["spec"], f, indent=1)
        cmd = [sys.executable, "-m", "talk_to_cad", "--spec", spec_path, "--out", out_dir,
               "--bed", str(bed)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    errs = []
    if r.returncode != 0:
        errs.append(f"CLI exit {r.returncode}\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}")
        return errs
    if live:
        try:
            with open(os.path.join(out_dir, "spec.json"), encoding="utf-8") as f:
                got = json.load(f)
        except Exception as e:  # noqa: BLE001
            return [f"no spec.json written: {e}"]
        ok, g, w = spec_matches(got, case["spec"])
        if not ok:
            errs.append(f"LLM spec mismatch\n   got:  {json.dumps(g)}\n   want: {json.dumps(w)}")
    errs += check_out_dir(out_dir, bed=bed)
    errs += check_png(os.path.join(out_dir, "preview.png"))
    return errs


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--only")
    ap.add_argument("--bed", type=float, default=DEFAULT_BED)
    a = ap.parse_args(argv)
    with open(GOLDEN, encoding="utf-8") as f:
        cases = json.load(f)["cases"]
    if a.only:
        cases = [c for c in cases if c["name"] == a.only]
    failed = 0
    for case in cases:
        errs = run_case(case, a.live, a.bed)
        print(("OK   " if not errs else "FAIL ") + case["name"])
        for e in errs:
            print("  - " + e)
        failed += bool(errs)
    print(f"{len(cases) - failed}/{len(cases)} golden cases passed ({'live' if a.live else 'spec'} mode)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
