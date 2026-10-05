#!/usr/bin/env python3
"""Generate Tau Editor's macOS DMG background image.

The image intentionally contains no application or Applications icons. Finder
adds those items to the DMG window from the Tauri bundle configuration; this
asset supplies only the light-blue surface, the central drag cue, and a clear
installation hint placed below the native icon area.
"""

# @description Generate a deterministic 660x400 DMG background with a subtle
#              blue gradient, light texture, and a centered ASCII/arrow cue.
# @author Albert_Luo
# @email 480199976@qq.com
# @date 2026-10-05 00:00

from __future__ import annotations

import argparse
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter


WIDTH = 660
HEIGHT = 400
SCALE = 3
SEED = 20261005


def load_monospace_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Load a stable macOS monospace font, falling back to Pillow's bitmap font."""

    candidates = (
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Monaco.dfont",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    )
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def load_ui_font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Load a readable system UI font with Chinese-capable fallbacks."""

    if bold:
        candidates = (
            "/System/Library/Fonts/STHeiti Medium.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
            "/System/Library/Fonts/HelveticaNeue.ttc",
            "/System/Library/Fonts/Arial Unicode.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        )
    else:
        candidates = (
            "/System/Library/Fonts/STHeiti Light.ttc",
            "/System/Library/Fonts/Hiragino Sans GB.ttc",
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/Arial Unicode.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        )
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size)
            except OSError:
                continue
    return ImageFont.load_default()


def build_gradient(width: int, height: int) -> Image.Image:
    """Build the reference-inspired blue-to-lilac installation surface."""

    rng = random.Random(SEED)
    pixels = []
    for y in range(height):
        vertical = y / max(1, height - 1)
        for x in range(width):
            horizontal = x / max(1, width - 1)

            # Start with the saturated sky-blue upper area from the reference
            # and fade into a pale blue/lilac lower area.
            top = (66.0, 145.0, 224.0)
            bottom = (218.0, 236.0, 249.0)
            diagonal = (vertical * 0.88) + (horizontal * 0.12)
            noise = rng.uniform(-0.9, 0.9)
            base = tuple(int(round(a + (b - a) * diagonal + noise)) for a, b in zip(top, bottom))

            # A cool indigo wash in the top-left and a restrained lilac wash in
            # the lower-right reproduce the soft depth of the reference image.
            top_left = max(0.0, 1.0 - (((x - width * 0.02) / (width * 0.88)) ** 2 + ((y - height * 0.02) / (height * 0.98)) ** 2))
            lower_right = max(0.0, 1.0 - (((x - width * 1.02) / (width * 0.92)) ** 2 + ((y - height * 1.02) / (height * 0.92)) ** 2))
            base = (
                min(255, int(round(base[0] - top_left * 18 + lower_right * 8))),
                min(255, int(round(base[1] - top_left * 17 + lower_right * 1))),
                min(255, int(round(base[2] + top_left * 4 + lower_right * 11))),
            )

            # A broad white halo behind the cue keeps the foreground legible
            # without introducing another object into the Finder layout.
            dx = (x - width * 0.52) / (width * 0.68)
            dy = (y - height * 0.49) / (height * 0.74)
            halo = max(0.0, 1.0 - (dx * dx + dy * dy)) * 13.0
            pixels.append(tuple(min(255, int(round(channel + halo))) for channel in base))

    image = Image.new("RGB", (width, height), color=(0, 0, 0))
    image.putdata(pixels)
    return image


def draw_drag_cue(canvas: Image.Image) -> None:
    """Draw a restrained blue arrow, trajectory, particles, and code-like cue."""

    draw = ImageDraw.Draw(canvas, "RGBA")
    width, height = canvas.size
    center_y = int(height * 0.51)
    blue = (8, 83, 158, 235)
    pale_blue = (16, 113, 198, 54)

    def sx(value: float) -> int:
        return int(round(value * width / WIDTH))

    def sy(value: float) -> int:
        return int(round(value * height / HEIGHT))

    # A soft, curved light trail gives the static DMG image a sense of motion
    # while leaving the Finder icon slots at x≈180 and x≈480 unobstructed.
    trail_points = [
        (sx(248), sy(208)),
        (sx(275), sy(182)),
        (sx(319), sy(191)),
        (sx(359), sy(223)),
        (sx(411), sy(204)),
    ]
    trail_glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    trail_glow_draw = ImageDraw.Draw(trail_glow, "RGBA")
    trail_glow_draw.line(trail_points, fill=(29, 169, 238, 52), width=sx(18), joint="curve")
    trail_glow = trail_glow.filter(ImageFilter.GaussianBlur(radius=sx(8)))
    canvas.alpha_composite(trail_glow)
    draw.line(trail_points, fill=(12, 103, 181, 142), width=sx(2), joint="curve")

    # A partial orbit and small sparks suggest a transfer in progress rather
    # than a plain static arrow. They stay in the center gap between icons.
    orbit = (sx(258), sy(143), sx(404), sy(267))
    orbit_glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    orbit_glow_draw = ImageDraw.Draw(orbit_glow, "RGBA")
    orbit_glow_draw.arc(orbit, start=202, end=340, fill=(51, 185, 241, 92), width=sx(8))
    orbit_glow = orbit_glow.filter(ImageFilter.GaussianBlur(radius=sx(6)))
    canvas.alpha_composite(orbit_glow)
    draw.arc(orbit, start=202, end=340, fill=(55, 180, 235, 112), width=sx(2))
    sparks = (
        (274, 166, 2.0, 178),
        (299, 145, 1.5, 150),
        (352, 149, 2.2, 184),
        (388, 177, 1.6, 165),
        (394, 238, 2.0, 150),
        (280, 243, 1.4, 135),
    )
    for x, y, radius, alpha in sparks:
        r = sx(radius)
        draw.ellipse((sx(x) - r, sy(y) - r, sx(x) + r, sy(y) + r), fill=(11, 104, 190, alpha))
        if radius >= 2:
            draw.line((sx(x) - r * 2, sy(y), sx(x) + r * 2, sy(y)), fill=(255, 255, 255, alpha // 2), width=max(1, sx(0.7)))
            draw.line((sx(x), sy(y) - r * 2, sx(x), sy(y) + r * 2), fill=(255, 255, 255, alpha // 2), width=max(1, sx(0.7)))

    # Three small transfer dots make the direction legible at a glance and
    # echo the familiar macOS drag-and-drop motion cue.
    for index, alpha in enumerate((180, 150, 118)):
        radius = sx(3.0 - index * 0.55)
        x = sx(369 + index * 13)
        y = sy(205 + (index - 1) * 4)
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(7, 89, 171, alpha))

    # Soft glow behind the directional cue.
    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow, "RGBA")
    glow_draw.line((int(width * 0.39), center_y, int(width * 0.61), center_y), fill=pale_blue, width=18)
    glow_draw.line((int(width * 0.57), center_y - 13, int(width * 0.62), center_y), fill=pale_blue, width=18)
    glow_draw.line((int(width * 0.57), center_y + 13, int(width * 0.62), center_y), fill=pale_blue, width=18)
    glow = glow.filter(ImageFilter.GaussianBlur(radius=7))
    canvas.alpha_composite(glow)

    # The actual arrow is intentionally smaller than the native Finder icons.
    arrow_start = int(width * 0.405)
    arrow_end = int(width * 0.60)
    draw.line((arrow_start, center_y, arrow_end, center_y), fill=blue, width=5)
    draw.line((arrow_end - 28, center_y - 20, arrow_end, center_y), fill=blue, width=5)
    draw.line((arrow_end - 28, center_y + 20, arrow_end, center_y), fill=blue, width=5)

    # Code-like hash marks echo the supplied reference without pretending to be
    # a real terminal command or placing duplicate app/folder artwork.
    font = load_monospace_font(max(14, int(width * 0.033)))
    rows = ("# # #", "  # # # #", "# # # # # #", "  # # # #", "# # #")
    text_x = int(width * 0.46)
    text_y = int(height * 0.32)
    for index, row in enumerate(rows):
        draw.text((text_x, text_y + index * int(height * 0.052)), row, font=font, fill=(8, 100, 185, 218), anchor="mm")


def draw_install_hint(canvas: Image.Image) -> None:
    """Draw top and bottom installation prompts in the safe areas."""

    draw = ImageDraw.Draw(canvas, "RGBA")
    width, height = canvas.size

    def sx(value: float) -> int:
        return int(round(value * width / WIDTH))

    def sy(value: float) -> int:
        return int(round(value * height / HEIGHT))

    # The top copy sits above the Finder icon row and gives the user an
    # immediate instruction before they even notice the arrow.
    center_x = sx(WIDTH / 2)
    header_font = load_ui_font(sx(16), bold=True)
    subheader_font = load_ui_font(sx(11), bold=False)
    draw.text((center_x, sy(56)), "拖动 Tau Editor 到 Applications", font=header_font, fill=(244, 250, 255, 238), anchor="ma")
    draw.text((center_x, sy(79)), "Drag to install  ·  Ready to write", font=subheader_font, fill=(231, 246, 255, 218), anchor="ma")
    draw.line((sx(258), sy(94), sx(402), sy(94)), fill=(240, 250, 255, 110), width=max(1, sx(1)))

    # Keep a tiny footer below the Finder labels rather than placing a card in
    # the icon row. This leaves the native App and Applications names clear.
    footer_font = load_ui_font(sx(10), bold=False)
    draw.text((center_x, sy(374)), "提示 · 将左侧图标拖到右侧 Applications 文件夹", font=footer_font, fill=(35, 95, 139, 184), anchor="ms")


def generate(output: Path) -> Path:
    """Generate and save the final 660x400 RGB PNG."""

    base = build_gradient(WIDTH * SCALE, HEIGHT * SCALE).convert("RGBA")
    draw_drag_cue(base)
    draw_install_hint(base)
    final = base.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS).convert("RGB")
    output.parent.mkdir(parents=True, exist_ok=True)
    final.save(output, format="PNG", optimize=True, dpi=(72, 72))
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).with_name("dmg-background.png"),
        help="output PNG path (default: icons/dmg-background.png)",
    )
    args = parser.parse_args()
    output = generate(args.output)
    print(f"Generated {output} ({WIDTH}x{HEIGHT})")


if __name__ == "__main__":
    main()
