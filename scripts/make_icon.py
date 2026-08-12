"""Generate PardonMe's app icon: a cute anime smartphone character, ringing.

Why a character: at 48dp on a home screen, fine detail disappears. Anime
mascot design solves this the way real app icons do — one big silhouette,
very few colours, huge eyes, hard black line art. It reads instantly at any
size and it is unmistakably "anime phone".

Drawn programmatically at 4x and downsampled for clean anti-aliasing.

Outputs:
  assets/icon.png            1024  full-bleed (Play Store / legacy launcher)
  assets/adaptive-icon.png   1024  transparent foreground, subject inside the
                                   safe zone Android crops to
  assets/splash.png          1024  subject on the dark brand background
  assets/play-icon-512.png    512  Play Console listing icon
"""
from __future__ import annotations

import math

from PIL import Image, ImageDraw

SS = 4
SIZE = 1024
S = SIZE * SS

# Few colours, high saturation — cel-animation rules.
SKY_TOP = (138, 92, 255)
SKY_BOT = (255, 106, 168)
INK = (20, 14, 32)
BODY = (58, 214, 255)        # phone body: bright cyan
BODY_SHADE = (28, 156, 200)
SCREEN = (24, 22, 46)
WHITE = (255, 255, 255)
GOLD = (255, 209, 92)
BLUSH = (255, 128, 150)


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (1, size))
    px = img.load()
    for y in range(size):
        t = (y / (size - 1)) ** 0.9
        px[0, y] = tuple(int(SKY_TOP[i] + (SKY_BOT[i] - SKY_TOP[i]) * t) for i in range(3))
    return img.resize((size, size), Image.BICUBIC)


def sunburst(img: Image.Image, cx: float, cy: float):
    """Soft alternating wedges — anime "excitement" background."""
    d = ImageDraw.Draw(img, "RGBA")
    spokes = 24
    R = S * 1.1
    for i in range(spokes):
        if i % 2:
            continue
        a0 = (2 * math.pi / spokes) * i
        a1 = a0 + (2 * math.pi / spokes)
        d.polygon(
            [(cx, cy),
             (cx + math.cos(a0) * R, cy + math.sin(a0) * R),
             (cx + math.cos(a1) * R, cy + math.sin(a1) * R)],
            fill=(255, 255, 255, 34),
        )


def ring_arcs(d: ImageDraw.ImageDraw, cx: float, cy: float, r: float, ink: int):
    """Sound waves either side, so the phone is clearly RINGING."""
    for side in (-1, 1):
        for k in range(3):
            rr = r * (1.0 + 0.24 * k)
            box = (cx - rr, cy - rr, cx + rr, cy + rr)
            start, end = (-40, 40) if side > 0 else (140, 220)
            d.arc(box, start, end, fill=INK, width=ink)
            d.arc(box, start + 4, end - 4, fill=GOLD, width=max(2, ink // 2))


def sparkle(d: ImageDraw.ImageDraw, x: float, y: float, r: float, colour):
    t = r * 0.17
    d.polygon(
        [(x, y - r), (x + t, y - t), (x + r, y), (x + t, y + t),
         (x, y + r), (x - t, y + t), (x - r, y), (x - t, y - t)],
        fill=colour,
    )


def draw_phone(base: Image.Image, cx: float, cy: float, h: float, tilt: float):
    """The mascot: a rounded phone with a big expressive face."""
    w = h * 0.62
    ink = max(3, int(h * 0.045))
    pad = int(h * 1.4)
    L = pad * 2
    layer = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    ox = oy = pad

    body = (ox - w / 2, oy - h / 2, ox + w / 2, oy + h / 2)
    r = w * 0.26

    # drop shadow keeps the subject readable on any wallpaper
    d.rounded_rectangle(
        (body[0] + ink * 1.2, body[1] + ink * 1.6, body[2] + ink * 1.2, body[3] + ink * 1.6),
        radius=r, fill=(0, 0, 0, 70),
    )
    d.rounded_rectangle(body, radius=r, fill=BODY, outline=INK, width=ink)
    # cel shadow down the right edge
    d.rounded_rectangle(
        (ox + w * 0.16, body[1] + ink, body[2] - ink * 0.7, body[3] - ink * 0.7),
        radius=r * 0.8, fill=BODY_SHADE,
    )
    # screen inset
    sm = w * 0.13
    screen = (body[0] + sm, body[1] + h * 0.10, body[2] - sm, body[3] - h * 0.12)
    d.rounded_rectangle(screen, radius=r * 0.62, fill=SCREEN, outline=INK, width=int(ink * 0.8))

    # --- face -----------------------------------------------------------
    eye_y = (screen[1] + screen[3]) / 2 - h * 0.045
    eye_dx = w * 0.17
    eye_w, eye_h = w * 0.20, h * 0.155

    for sx in (-1, 1):
        ex = ox + sx * eye_dx
        # big glossy anime eye
        d.ellipse((ex - eye_w / 2, eye_y - eye_h / 2, ex + eye_w / 2, eye_y + eye_h / 2),
                  fill=WHITE, outline=INK, width=int(ink * 0.9))
        # iris
        ir_w, ir_h = eye_w * 0.62, eye_h * 0.66
        d.ellipse((ex - ir_w / 2, eye_y - ir_h * 0.35, ex + ir_w / 2, eye_y + ir_h * 0.75),
                  fill=(38, 92, 210))
        d.ellipse((ex - ir_w * 0.28, eye_y + ir_h * 0.02, ex + ir_w * 0.28, eye_y + ir_h * 0.58),
                  fill=INK)
        # the two highlights that make an eye look "anime"
        d.ellipse((ex - ir_w * 0.34, eye_y - ir_h * 0.30,
                   ex - ir_w * 0.02, eye_y + ir_h * 0.02), fill=WHITE)
        d.ellipse((ex + ir_w * 0.10, eye_y + ir_h * 0.34,
                   ex + ir_w * 0.26, eye_y + ir_h * 0.52), fill=WHITE)

    # open ":D" mouth
    mw, mh = w * 0.26, h * 0.085
    my = eye_y + eye_h * 0.92
    d.chord((ox - mw / 2, my - mh, ox + mw / 2, my + mh), 10, 170,
            fill=(46, 24, 40), outline=INK, width=int(ink * 0.8))
    d.chord((ox - mw * 0.26, my + mh * 0.10, ox + mw * 0.26, my + mh * 0.95), 0, 180,
            fill=(255, 122, 140))

    # blush
    for sx in (-1, 1):
        bx = ox + sx * (eye_dx + eye_w * 0.72)
        d.ellipse((bx - w * 0.085, eye_y + eye_h * 0.34,
                   bx + w * 0.085, eye_y + eye_h * 0.74), fill=BLUSH)

    # speaker slot + home dot, so it still reads as a phone
    d.rounded_rectangle((ox - w * 0.10, body[1] + h * 0.045,
                         ox + w * 0.10, body[1] + h * 0.065),
                        radius=h * 0.01, fill=INK)
    d.ellipse((ox - w * 0.045, body[3] - h * 0.095,
               ox + w * 0.045, body[3] - h * 0.035),
              fill=BODY_SHADE, outline=INK, width=int(ink * 0.7))

    layer = layer.rotate(tilt, resample=Image.BICUBIC, center=(ox, oy))
    base.alpha_composite(layer, (int(cx - ox), int(cy - oy)))


def build(subject_h: float, background: str) -> Image.Image:
    cx, cy = S / 2, S / 2
    if background == "sky":
        base = gradient(S).convert("RGBA")
        sunburst(base, cx, cy)
    elif background == "dark":
        base = Image.new("RGBA", (S, S), (11, 11, 15, 255))
    else:
        base = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    h = S * subject_h
    d = ImageDraw.Draw(base)
    ring_arcs(d, cx, cy, h * 0.46, max(4, int(h * 0.052)))
    draw_phone(base, cx, cy, h, tilt=-12)

    d = ImageDraw.Draw(base)
    sparkle(d, cx - h * 0.70, cy - h * 0.60, h * 0.10, WHITE + (255,))
    sparkle(d, cx + h * 0.68, cy + h * 0.52, h * 0.075, GOLD + (255,))
    sparkle(d, cx + h * 0.52, cy - h * 0.70, h * 0.05, WHITE + (255,))

    return base.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    icon = build(subject_h=0.56, background="sky")
    icon.convert("RGB").save("assets/icon.png")
    print("assets/icon.png")

    # Adaptive foreground: Android masks to a circle/squircle and only the
    # centre ~66% is guaranteed visible, so the mascot is drawn smaller.
    build(subject_h=0.40, background="none").save("assets/adaptive-icon.png")
    print("assets/adaptive-icon.png")

    build(subject_h=0.46, background="dark").convert("RGB").save("assets/splash.png")
    print("assets/splash.png")

    icon.resize((512, 512), Image.LANCZOS).convert("RGB").save("assets/play-icon-512.png")
    print("assets/play-icon-512.png")


if __name__ == "__main__":
    main()
