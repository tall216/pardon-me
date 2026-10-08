"""Verify a preview PNG is a real rendering (written by Claude, do not edit).

Usage: python checks/check_preview.py OUT_DIR   (expects OUT_DIR/preview.png)
Passes only if the PNG opens, is at least 800x600, is not blank, and has an
object covering between 2 % and 90 % of the frame.
"""
import os
import sys

import numpy as np
from PIL import Image

MIN_W, MIN_H = 800, 600


def check_png(png_path):
    errs = []
    if not os.path.exists(png_path):
        return [f"missing file: {png_path}"]
    if os.path.getsize(png_path) < 5000:
        errs.append("preview.png is under 5 KB, almost certainly blank")
    try:
        im = Image.open(png_path).convert("RGB")
    except Exception as e:  # noqa: BLE001
        return [f"preview.png does not open as an image: {e}"]
    if im.width < MIN_W or im.height < MIN_H:
        errs.append(f"preview is {im.width}x{im.height}, need at least {MIN_W}x{MIN_H}")
    a = np.asarray(im).astype(np.int32)
    gray = a.mean(axis=2)
    if gray.std() < 15:
        errs.append(f"preview looks blank (pixel std {gray.std():.1f})")
    # Background = most common colour; the object is everything that differs from it.
    flat = a.reshape(-1, 3)
    vals, counts = np.unique(flat, axis=0, return_counts=True)
    bg = vals[counts.argmax()]
    diff = (np.abs(flat - bg).sum(axis=1) > 30).mean()
    if diff < 0.02:
        errs.append(f"object covers only {diff*100:.1f}% of the frame (is the part in view?)")
    if diff > 0.90:
        errs.append(f"object covers {diff*100:.1f}% of the frame (camera inside the part?)")
    return errs


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1:
        print(__doc__)
        return 2
    errs = check_png(os.path.join(argv[0], "preview.png"))
    if errs:
        print(f"FAIL {argv[0]}")
        for e in errs:
            print("  - " + e)
        return 1
    print(f"OK {argv[0]}/preview.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())
