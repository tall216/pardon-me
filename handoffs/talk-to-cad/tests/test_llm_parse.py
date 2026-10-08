"""Contract for talk_to_cad.llm (written by Claude, do not edit).

build_messages(description: str, followups: list[tuple[str, str]] | None = None) -> list[dict]
    OpenAI-style chat messages.  The system prompt must carry the schema.
parse_model_output(text: str) -> dict
    Returns either a validated spec (via talk_to_cad.spec.validate) or
    {"missing": [question, ...]} when the model asked for information.
    Raises LLMParseError if no JSON object can be recovered.
describe_to_spec(description, ask=None) -> dict
    Not tested here (needs the live model); exercised by checks/run_golden.py --live.
"""
import glob
import json
import os

import pytest

from talk_to_cad.llm import LLMParseError, build_messages, parse_model_output

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "llm_outputs")


def _read(name):
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return f.read()


def test_system_prompt_mentions_every_family_and_rules():
    msgs = build_messages("a 10 mm cube")
    assert msgs[0]["role"] == "system"
    sys_text = msgs[0]["content"].lower()
    for fam in ("plate", "cylinder", "washer", "box", "bracket"):
        assert fam in sys_text
    for word in ("mm", "missing", "json", "never invent", "corner_radius", "holes_a", "inner_d"):
        assert word in sys_text, word
    assert msgs[-1]["role"] == "user" and "10 mm cube" in msgs[-1]["content"]


def test_followups_are_appended():
    msgs = build_messages("a plate", followups=[("How thick?", "3 mm")])
    text = json.dumps(msgs)
    assert "How thick?" in text and "3 mm" in text
    assert msgs[-1]["role"] == "user"


@pytest.mark.parametrize("fname", sorted(os.path.basename(p) for p in glob.glob(os.path.join(FIX, "ok_*.txt"))))
def test_parses_valid_outputs(fname):
    raw = _read(fname)
    expected = json.loads(_read(fname.replace(".txt", ".expected.json")))
    out = parse_model_output(raw)
    assert out["family"] == expected["family"]
    assert out["dims"] == expected["dims"]
    for k in ("holes", "holes_a", "holes_b"):
        assert out.get(k, []) == expected.get(k, [])


def test_parses_missing_question():
    out = parse_model_output(_read("missing_thickness.txt"))
    assert list(out) == ["missing"]
    assert out["missing"] and all(isinstance(q, str) for q in out["missing"])


@pytest.mark.parametrize("fname", ["bad_prose_only.txt", "bad_invalid_spec.txt"])
def test_rejects_garbage(fname):
    with pytest.raises(LLMParseError):
        parse_model_output(_read(fname))
