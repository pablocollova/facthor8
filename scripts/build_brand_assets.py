#!/usr/bin/env python3
"""Build deterministic Facthor8 SVG brand assets."""

from __future__ import annotations

import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "brand"
WEB = ROOT / "dist" / "assets" / "brand"

NAVY = "#06294D"
DARK = "#041C34"
GREEN = "#00D39A"
ICE = "#F7FAFC"
SLATE = "#7890A5"


def polar(cx: float, cy: float, radius: float, degrees: float) -> tuple[float, float]:
    radians = math.radians(degrees)
    return cx + radius * math.cos(radians), cy + radius * math.sin(radians)


def sector_path(
    cx: float,
    cy: float,
    outer: float,
    inner: float,
    start: float,
    end: float,
) -> str:
    ox1, oy1 = polar(cx, cy, outer, start)
    ox2, oy2 = polar(cx, cy, outer, end)
    ix2, iy2 = polar(cx, cy, inner, end)
    ix1, iy1 = polar(cx, cy, inner, start)
    return (
        f"M {ox1:.3f} {oy1:.3f} "
        f"A {outer} {outer} 0 0 1 {ox2:.3f} {oy2:.3f} "
        f"L {ix2:.3f} {iy2:.3f} "
        f"A {inner} {inner} 0 0 0 {ix1:.3f} {iy1:.3f} Z"
    )


def symbol_group(navy: str, green: str, mono: bool = False) -> str:
    cx, cy = 180.0, 168.0
    outer, inner = 142.0, 82.0
    span = 39.0
    parts: list[str] = []
    for index in range(8):
        center = -90.0 + index * 45.0
        start, end = center - span / 2, center + span / 2
        is_human = index == 4
        fill = navy if mono else (green if is_human else navy)
        offset_y = 12.0 if is_human else 0.0
        d = sector_path(cx, cy + offset_y, outer, inner, start, end)
        parts.append(f'<path d="{d}" fill="{fill}"/>')

    head_fill = navy if mono else green
    parts.append(f'<circle cx="180" cy="230" r="21" fill="{head_fill}"/>')
    return "\n    ".join(parts)


def svg_symbol(navy: str = NAVY, green: str = GREEN, mono: bool = False) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" role="img" aria-labelledby="title desc">
  <title id="title">Facthor8 symbol</title>
  <desc id="desc">Eight security layers with the human layer highlighted</desc>
  <g>
    {symbol_group(navy, green, mono)}
  </g>
</svg>
'''


def svg_horizontal(dark_background: bool = False, mono: str | None = None, reverse: bool = False) -> str:
    if mono == "navy":
        symbol_navy, symbol_green, word, accent, tagline = NAVY, NAVY, NAVY, NAVY, NAVY
        background = ""
    elif mono == "white":
        symbol_navy, symbol_green, word, accent, tagline = ICE, ICE, ICE, ICE, ICE
        background = ""
    elif reverse:
        symbol_navy, symbol_green, word, accent, tagline = ICE, GREEN, ICE, GREEN, "#B8C7D3"
        background = ""
    elif dark_background:
        symbol_navy, symbol_green, word, accent, tagline = ICE, GREEN, ICE, GREEN, "#B8C7D3"
        background = f'<rect width="1600" height="400" fill="{DARK}"/>'
    else:
        symbol_navy, symbol_green, word, accent, tagline = NAVY, GREEN, NAVY, GREEN, NAVY
        background = ""

    mono_symbol = mono is not None
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400" role="img" aria-labelledby="title desc">
  <title id="title">Facthor8 The Human Security Layer</title>
  <desc id="desc">Facthor8 horizontal brand logo</desc>
  {background}
  <g transform="translate(28 20) scale(1)">
    {symbol_group(symbol_navy, symbol_green, mono_symbol)}
  </g>
  <text x="420" y="210" font-family="Nimbus Sans, Arial, sans-serif" font-size="145" font-weight="700" letter-spacing="-5">
    <tspan fill="{word}">FACT</tspan><tspan fill="{accent}">H</tspan><tspan fill="{word}">OR</tspan><tspan fill="{accent}">8</tspan>
  </text>
  <text x="424" y="282" fill="{tagline}" font-family="Nimbus Sans, Arial, sans-serif" font-size="34" font-weight="400" letter-spacing="7">THE HUMAN SECURITY LAYER</text>
</svg>
'''


def palette_svg() -> str:
    colors = [("Midnight Navy", NAVY), ("Deep Navy", DARK), ("Human Green", GREEN), ("Mineral White", ICE), ("Signal Slate", SLATE)]
    swatches = []
    for i, (name, value) in enumerate(colors):
        x = i * 240
        label = ICE if value in {NAVY, DARK} else DARK
        swatches.append(
            f'<rect x="{x}" width="240" height="220" fill="{value}"/>'
            f'<text x="{x + 20}" y="165" fill="{label}" font-family="Nimbus Sans, Arial, sans-serif" font-size="20" font-weight="700">{name}</text>'
            f'<text x="{x + 20}" y="195" fill="{label}" font-family="Nimbus Sans, Arial, sans-serif" font-size="18">{value}</text>'
        )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 220">{''.join(swatches)}</svg>\n'''


def write_assets() -> None:
    BRAND.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    assets = {
        "facthor8-symbol.svg": svg_symbol(),
        "facthor8-symbol-white.svg": svg_symbol(ICE, ICE, True),
        "facthor8-horizontal.svg": svg_horizontal(),
        "facthor8-horizontal-dark.svg": svg_horizontal(dark_background=True),
        "facthor8-horizontal-reverse.svg": svg_horizontal(reverse=True),
        "facthor8-horizontal-navy.svg": svg_horizontal(mono="navy"),
        "facthor8-horizontal-white.svg": svg_horizontal(mono="white"),
        "facthor8-palette.svg": palette_svg(),
    }
    for filename, content in assets.items():
        (BRAND / filename).write_text(content, encoding="utf-8")
        if filename != "facthor8-palette.svg":
            (WEB / filename).write_text(content, encoding="utf-8")


if __name__ == "__main__":
    write_assets()
