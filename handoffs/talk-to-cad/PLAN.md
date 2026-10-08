# talk-to-cad — PLAN

## Goal
David describes a simple functional part in plain English (typed, or dictated with
Win+H into the same prompt) and the local pipeline produces, with no cloud calls:

- `out/<stamp>_<name>/spec.json`  — the exact dimensions the model understood
- `out/<stamp>_<name>/part.stl` and `part.3mf` — solid, watertight, fits the K2 bed
- `out/<stamp>_<name>/preview.png` — isometric render with the dimensions printed on it

David opens the STL/3MF in Creality Print himself. No printer connection, ever.

MVP = five parametric part families with exact dimensions. Nothing organic, no
threads, no assemblies, no lids. Those are phase 2 (see bottom).

## Architecture (decisions and WHY — do not re-decide)

1. **The local model never writes CAD code.** It only turns a description into a
   small JSON spec (`spec_version: 1`). Fixed CadQuery builders, one per family,
   turn the spec into geometry. WHY: Qwen3.8-27B is A-grade at filling numbers
   into an exact schema (measured 2026-10-08) and unreliable at writing correct
   CadQuery from scratch; exact dimensions are the whole point.
2. **Families (MVP):** `plate`, `cylinder` (solid or tube), `washer`, `box`
   (open-top tray), `bracket` (L). Each has required dims, a defaults table, and
   fixed coordinate conventions (below). WHY: a closed vocabulary makes every
   requirement checkable.
3. **Never invent a number.** If a required dim is missing the model returns
   `{"missing": ["question", ...]}` and the CLI asks David once, then re-asks the
   model with the answer appended. Optional dims use the defaults table silently.
4. **CadQuery -> STL** (tolerance 0.01 mm, angular 0.1) then **trimesh -> 3MF**
   from that STL. WHY: one tessellation, so STL and 3MF are byte-for-byte the same
   mesh and the 3MF round-trip check is meaningful.
5. **Preview is a pure PIL + numpy painter's-algorithm render** (no OpenGL,
   no pyrender, no Blender). WHY: zero fragile GPU/GL dependencies on Windows;
   it must work in the venv every time.
6. **Verification is independent of the builders.** `checks/expected.py` computes
   bbox, analytic volume and section-cut expectations from the spec alone;
   `checks/check_mesh.py` compares the mesh against them. Tests and checks are
   Claude-written and `checks/verify_untouched.py` fails any job that edits them.
7. **Local model endpoint:** OpenAI-compatible chat completions over HTTP on
   localhost, `temperature 0`, `<think>...</think>` stripped before parsing.
   URL and model name come from env (`TALK_TO_CAD_LLM_URL`, `TALK_TO_CAD_LLM_MODEL`).
   WHY: Ollama, llama.cpp, vLLM and LM Studio all speak it; no SDK dependency.

### Coordinate conventions (the checks enforce these exactly)
- Units mm. Z is up (print orientation). Part sits on Z = 0.
- `plate`, `cylinder`, `washer`, `box`: centred on the XY origin.
  `plate.length` is X, `width` is Y, `thickness` is Z. Holes: `{"d","x","y"}`
  from the plate centre, through Z. `corner_radius` rounds the four vertical edges.
  `cylinder`/`washer`: axis Z, `outer_d`, `inner_d` (0 = solid; washer requires > 0).
  `box`: outside dims `length` (X) `width` (Y) `height` (Z); `wall` (default 2.4),
  `floor` (default = wall); open top.
- `bracket`: outer corner at the origin, NOT centred. Leg A along +X
  (x in [0, leg_a], z in [0, thickness]); leg B along +Z (x in [0, thickness],
  z in [0, leg_b]); `width` along Y, y in [0, width]. Holes `holes_a` / `holes_b`
  are `{"d","x","y"}` where `x` = distance along that leg from the outer corner
  and `y` = across the width. A hole must lie fully on its leg and clear the
  corner overlap (x - d/2 >= thickness).

### Spec schema v1 (what the model emits, what the builders consume)
```json
{"spec_version": 1, "family": "plate", "name": "snake_case_name",
 "dims": {"length": 50, "width": 30, "thickness": 5, "corner_radius": 0},
 "holes": [{"d": 5, "x": -20, "y": 0}]}
```
Required dims: plate length,width,thickness · cylinder outer_d,height ·
washer outer_d,inner_d,thickness · box length,width,height · bracket leg_a,leg_b,width,thickness.
Defaults: plate.corner_radius 0 · cylinder.inner_d 0 · box.wall 2.4 · box.floor = wall ·
holes lists []. Rejected: non-positive dims, inner_d >= outer_d, 2*wall >= length or
width, floor >= height, 2*corner_radius > min(length,width), thickness >= either leg,
any hole off its face, unknown family, missing name. See `checks/golden.json` for 8
worked examples and `tests/test_spec.py` for the full contract.

## Must never happen
- Any job edits anything under `tests/` or `checks/` (verify_untouched fails the job).
- The model guesses a dimension that was not stated and is not in the defaults table.
- A file is written outside `WORKDIR` (code) or `WORKDIR/out/` (generated parts).
- Any network call other than the local LLM endpoint on localhost.
- Any printer, Creality Print, or Blender automation. Files only.
- Deleting previous `out/` folders. Installing packages not listed below.
- Touching any other project under hermes-work.

## Context for workers
WORKDIR = C:\Users\david\hermes-work\talk-to-cad  (all commands run here, Hermes venv active)
HANDOFF = C:\Users\david\hermes-work\handoffs\talk-to-cad  (PLAN.md, jobs.json, checks/, tests/ originals)

Layout:
  talk_to_cad/__init__.py
  talk_to_cad/spec.py          FAMILIES, DEFAULTS, SpecError(.missing), validate(spec)->new dict
  talk_to_cad/families/__init__.py   build(spec) -> cadquery.Workplane, dispatches on spec["family"]
  talk_to_cad/families/{plate,cylinder,washer,box,bracket}.py   each: build(spec) -> cq.Workplane
  talk_to_cad/build.py         build_part(spec, out_dir, bed=260.0) -> {"spec","stl","3mf"} paths
  talk_to_cad/preview.py       render(stl_path, png_path, spec) -> png_path   (PIL + numpy only)
  talk_to_cad/llm.py           build_messages, parse_model_output, LLMParseError, describe_to_spec
  talk_to_cad/__main__.py      CLI: python -m talk_to_cad "<description>" | --spec FILE
                               [--out DIR] [--bed MM] [--no-preview] [--no-ask] [--dry-run]
  checks/   Claude-written verifiers (copied from HANDOFF, never edit)
  tests/    Claude-written pytest suite (copied from HANDOFF, never edit)
  out/      generated parts, one folder per run: spec.json part.stl part.3mf preview.png

Run / test:
  python -m pytest tests -q                    full suite
  python -m pytest tests/test_spec.py -q       one file;  -k plate  selects by test id
  python checks/verify_untouched.py            must print OK before every verify
  python checks/check_mesh.py out/<dir>        bbox, solid, volume, holes, bed fit, 3MF
  python checks/check_preview.py out/<dir>     preview.png is a real render
  python checks/run_golden.py [--live]         all 8 golden cases end to end
Conventions:
  Python 3.10+ style, type hints, no classes where a function will do. stdlib + cadquery,
  trimesh, shapely, numpy, PIL only (trimesh[easy] extras are allowed: scipy, networkx, rtree, lxml).
  No `requests`, no OpenAI SDK — use urllib for the LLM call.
  validate() returns a NEW dict (deep copy); never mutate the caller's spec.
  build_part(): validate -> families.build -> cq.exporters.export(wp, stl, tolerance=0.01,
  angularTolerance=0.1) -> trimesh.load(stl).export(3mf) -> write spec.json (the validated spec).
  Bed fit: every bbox extent must be <= bed - 10 (5 mm margin each side) else raise ValueError
  containing the word "bed". Default bed = env TALK_TO_CAD_BED_MM or 260.
  CadQuery: use workplane(centerOption="ProjectedOrigin") so hole coordinates are global XY.
  Bracket holes: cut with explicit cylinders (Workplane("XY") for leg A, Workplane("YZ") for
  leg B, local centre (y, x)) — do not rely on face selection.
  Preview: 1200x900 white background, orthographic isometric, faces painter-sorted far-to-near,
  Lambert shading, text block top-left: name, family, "L x W x H mm" bbox from spec, hole list.
Gotchas:
  trimesh section/3MF need scipy, networkx, rtree, shapely, lxml -> pip install "trimesh[easy]".
  Qwen wraps JSON in ```json fences and may emit <think> blocks: strip both before json.loads.
  cq.exporters.export needs exportType='STL' if the extension is not recognised.
  Windows paths: build them with os.path.join; never hard-code backslashes in code.
  The verify commands run in WORKDIR by the runner; HANDOFF NOTES go to JOURNAL.md.

## Phase 2 (not in this run)
Lids/snap-fit boxes, countersinks and counterbores, slots, chamfers, hex pockets for
nuts, multi-body export, OpenSCAD/SolidPython fallback, a proper STT front end instead
of Win+H, a "revise the last part" conversational loop, Creality Print project files.

## Gear and run time
J01-J07 and J10 are exact specs: small gear. J08 (renderer) and J09 (prompt + parser) need
judgment: big gear, so the 5090 must be free for those two (`brain_mode.py big`, check
`tools\gpu_status.ps1` first). Budget 395 minutes max, realistically 3-4 h with retries.

## Assumptions Claude made (David: confirm or fix before `handoff.py run`)
- WORKDIR path above, and that `workdir` is the jobs.json key handoff.py expects
  (compare with the skeleton `handoff.py new` writes and merge if the keys differ).
- Base-model K2 (260 mm bed). For a K2 Pro set TALK_TO_CAD_BED_MM=300, K2 Plus 350.
- The Hermes venv's `python` is what the runner uses for verify commands.
- Runtime LLM for the finished tool: main Ollama at http://127.0.0.1:11434/v1/chat/completions.
  Set TALK_TO_CAD_LLM_MODEL to the Ollama tag you want the tool to use day to day (the small
  gear model is fine: it is a schema-fill task) before `handoff.py run`, since J09 and J10 call it.
- J09/J10 call Ollama while the minion is also being served by it; Ollama queues a second
  client, so this only costs time. If it stalls, run `handoff.py run talk-to-cad --only J10` after.
