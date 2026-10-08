"""Fail if the minion modified any Claude-written test or check file.

Compares WORKDIR/tests and WORKDIR/checks against the handoff originals.
Usage: python checks/verify_untouched.py   (run from WORKDIR)
Set TALK_TO_CAD_HANDOFF to override the handoff folder location.
"""
import filecmp
import os
import sys

HANDOFF = os.environ.get("TALK_TO_CAD_HANDOFF", r"C:\Users\david\hermes-work\handoffs\talk-to-cad")
FOLDERS = ("checks", "tests")
SKIP_DIRS = {"__pycache__", ".pytest_cache"}


def main():
    bad = []
    for folder in FOLDERS:
        src_root = os.path.join(HANDOFF, folder)
        if not os.path.isdir(src_root):
            print(f"handoff folder not found: {src_root} (set TALK_TO_CAD_HANDOFF)")
            return 2
        for dirpath, dirnames, filenames in os.walk(src_root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            rel = os.path.relpath(dirpath, src_root)
            for fn in filenames:
                src = os.path.join(dirpath, fn)
                dst = os.path.join(os.getcwd(), folder, rel, fn) if rel != "." else os.path.join(os.getcwd(), folder, fn)
                if not os.path.exists(dst):
                    bad.append(f"missing in workdir: {os.path.normpath(dst)}")
                elif not filecmp.cmp(src, dst, shallow=False):
                    bad.append(f"modified: {os.path.normpath(dst)} (restore it from {src})")
    if bad:
        print("FAIL verify_untouched")
        for b in bad:
            print("  - " + b)
        return 1
    print("OK tests/ and checks/ match the handoff originals")
    return 0


if __name__ == "__main__":
    sys.exit(main())
