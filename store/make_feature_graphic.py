"""Generate the 1024x500 Play Store feature graphic for Pardon Me.
Uses the real app icon and the app's own dark-industrial palette
(#0d0d0d background, #2ecc71 accent) rather than a generic template.
"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1024, 500
BG = (13, 13, 13, 255)        # #0d0d0d
BG2 = (17, 17, 17, 255)       # #111
ACCENT = (46, 204, 113, 255)  # #2ecc71
TEXT = (255, 255, 255, 255)
SUBTEXT = (150, 150, 150, 255)

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
icon_path = os.path.join(base_dir, "assets", "play-icon-512.png")

canvas = Image.new("RGBA", (W, H), BG)
draw = ImageDraw.Draw(canvas)

# Subtle vertical gradient panel on the right for depth
for x in range(W):
    t = x / W
    r = int(BG[0] + (BG2[0] - BG[0]) * t)
    g = int(BG[1] + (BG2[1] - BG[1]) * t)
    b = int(BG[2] + (BG2[2] - BG[2]) * t)
    draw.line([(x, 0), (x, H)], fill=(r, g, b, 255))

# Thin accent line top edge (industrial look)
draw.rectangle([0, 0, W, 4], fill=ACCENT)

# App icon, left side
icon = Image.open(icon_path).convert("RGBA")
icon_size = 320
icon = icon.resize((icon_size, icon_size), Image.LANCZOS)
icon_x, icon_y = 60, (H - icon_size) // 2
canvas.paste(icon, (icon_x, icon_y), icon)

# Fonts
def load_font(size, bold=True):
    candidates = [
        "C:\\Windows\\Fonts\\segoeuib.ttf" if bold else "C:\\Windows\\Fonts\\segoeui.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf" if bold else "C:\\Windows\\Fonts\\arial.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()

title_font = load_font(64, bold=True)
subtitle_font = load_font(30, bold=False)

text_x = icon_x + icon_size + 50
draw.text((text_x, 150), "Pardon Me", font=title_font, fill=TEXT)
draw.text((text_x, 230), "Fake Call Escape", font=subtitle_font, fill=ACCENT)
draw.text((text_x, 285), "Double-press volume for a realistic", font=subtitle_font, fill=SUBTEXT)
draw.text((text_x, 320), "incoming call. Your exit, any time.", font=subtitle_font, fill=SUBTEXT)

out_path = os.path.join(base_dir, "store", "feature_graphic.png")
canvas.convert("RGB").save(out_path, "PNG")
print("Saved:", out_path, canvas.size)
