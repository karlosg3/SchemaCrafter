#!/usr/bin/env python3
"""
Deterministic Apple/Xcode/Discord-Beta style Blueprint App Icon composer & rasterizer.

Takes any central foreground SVG emblem (on a 1024x1024 viewBox) and composites it over
a continuous squircle filled with a customizable 3-stop gradient and the classic 8x8 +
3 concentric circles + 2 diagonals architectural blueprint grid. Outputs both `.svg`
and anti-aliased RGBA `.png`.
"""

import argparse
import ctypes
import math
import os
import re
import shutil
import subprocess
import sys

PRESETS = {
    'prussian': {
        'bg_top': '#265385',
        'bg_mid': '#193A62',
        'bg_bot': '#102644',
        'grid_color': '#e8f4ff',
        'grid_opacity': 0.30,
        'rim_opacity': 0.28,
    },
    'xcode': {
        'bg_top': '#56BEFF',
        'bg_mid': '#2A88FF',
        'bg_bot': '#1461EC',
        'grid_color': '#ffffff',
        'grid_opacity': 0.36,
        'rim_opacity': 0.32,
    },
    'terracotta': {
        'bg_top': '#E8633B',
        'bg_mid': '#D64A25',
        'bg_bot': '#B9391A',
        'grid_color': '#fff4ee',
        'grid_opacity': 0.32,
        'rim_opacity': 0.28,
    },
    'forest': {
        'bg_top': '#1F4B3C',
        'bg_mid': '#15362B',
        'bg_bot': '#0D241C',
        'grid_color': '#e9fff5',
        'grid_opacity': 0.28,
        'rim_opacity': 0.26,
    },
    'charcoal': {
        'bg_top': '#30343D',
        'bg_mid': '#21242B',
        'bg_bot': '#14161B',
        'grid_color': '#e5e9f0',
        'grid_opacity': 0.24,
        'rim_opacity': 0.24,
    },
}


def squircle_path(cx: float, cy: float, half: float, n: float = 4.8, steps: int = 240) -> str:
    """Approximates an Apple-style continuous superellipse squircle."""
    pts = []
    for i in range(steps):
        t = (2.0 * math.pi * i) / steps
        ct = math.cos(t)
        st = math.sin(t)
        x = cx + math.copysign(abs(ct) ** (2.0 / n), ct) * half
        y = cy + math.copysign(abs(st) ** (2.0 / n), st) * half
        pts.append(f'{x:.2f},{y:.2f}')
    return 'M ' + ' L '.join(pts) + ' Z'


def extract_emblem_parts(svg_path: str) -> tuple[str, str]:
    """Extracts `<defs>` content and inner body markup from a standalone emblem SVG."""
    with open(svg_path, 'r', encoding='utf-8') as f:
        raw = f.read()

    # Strip XML declaration and outer <svg ...> ... </svg> wrapper if present
    cleaned = re.sub(r'<\?xml[^>]*\?>', '', raw, flags=re.IGNORECASE).strip()
    outer = re.search(r'<svg\b[^>]*>(.*)</svg>', cleaned, flags=re.IGNORECASE | re.DOTALL)
    inner = outer.group(1).strip() if outer else cleaned

    defs_chunks: list[str] = []

    def _collect_defs(match: re.Match) -> str:
        defs_chunks.append(match.group(1).strip())
        return ''

    body = re.sub(r'<defs\b[^>]*>(.*?)</defs>', _collect_defs, inner, flags=re.IGNORECASE | re.DOTALL).strip()
    return '\n'.join(defs_chunks), body


def compose_blueprint_svg(
    *,
    bg_top: str,
    bg_mid: str,
    bg_bot: str,
    grid_color: str,
    grid_opacity: float,
    rim_opacity: float,
    inset: float,
    emblem_defs: str,
    emblem_body: str,
    apply_shadow: bool,
) -> str:
    half = 512.0 - inset
    sq = squircle_path(512.0, 512.0, half, n=4.8)
    sq_inner = squircle_path(512.0, 512.0, max(1.0, half - 3.0), n=4.8)

    span = 2.0 * half
    cell = span / 8.0
    edge_min = inset
    edge_max = 1024.0 - inset

    grid_lines: list[str] = []
    for k in range(1, 8):
        pos = edge_min + k * cell
        w = 2.4 if k in (1, 4, 7) else 1.7
        op = min(1.0, grid_opacity * (1.15 if k in (1, 4, 7) else 0.85))
        grid_lines.append(
            f'      <line x1="{pos:.2f}" y1="0" x2="{pos:.2f}" y2="1024" stroke="{grid_color}" stroke-width="{w}" stroke-opacity="{op:.3f}" />'
        )
        grid_lines.append(
            f'      <line x1="0" y1="{pos:.2f}" x2="1024" y2="{pos:.2f}" stroke="{grid_color}" stroke-width="{w}" stroke-opacity="{op:.3f}" />'
        )

    circles: list[str] = []
    for mult, w, op_mult in [(3.0, 2.5, 1.15), (2.0, 2.0, 0.95), (1.0, 1.8, 0.85)]:
        r = mult * cell
        op = min(1.0, grid_opacity * op_mult)
        circles.append(
            f'      <circle cx="512" cy="512" r="{r:.2f}" fill="none" stroke="{grid_color}" stroke-width="{w}" stroke-opacity="{op:.3f}" />'
        )

    diag_op = min(1.0, grid_opacity * 0.95)
    diagonals = [
        f'      <line x1="{edge_min:.2f}" y1="{edge_min:.2f}" x2="{edge_max:.2f}" y2="{edge_max:.2f}" stroke="{grid_color}" stroke-width="2.0" stroke-opacity="{diag_op:.3f}" />',
        f'      <line x1="{edge_max:.2f}" y1="{edge_min:.2f}" x2="{edge_min:.2f}" y2="{edge_max:.2f}" stroke="{grid_color}" stroke-width="2.0" stroke-opacity="{diag_op:.3f}" />',
    ]

    emblem_group = (
        f'    <g filter="url(#emblemShadow)">\n{emblem_body}\n    </g>'
        if apply_shadow
        else f'    <g>\n{emblem_body}\n    </g>'
    )

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <clipPath id="squircleClip">
      <path d="{sq}" />
    </clipPath>

    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{bg_top}" />
      <stop offset="52%" stop-color="{bg_mid}" />
      <stop offset="100%" stop-color="{bg_bot}" />
    </linearGradient>

    <radialGradient id="topGlow" cx="50%" cy="10%" r="72%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.18" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>

    <linearGradient id="rimGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="{min(1.0, rim_opacity + 0.22):.2f}" />
      <stop offset="45%" stop-color="#ffffff" stop-opacity="{rim_opacity * 0.45:.2f}" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="{rim_opacity * 0.70:.2f}" />
    </linearGradient>

    <filter id="emblemShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#050c18" flood-opacity="0.34" />
    </filter>
{emblem_defs}
  </defs>

  <g clip-path="url(#squircleClip)">
    <rect x="0" y="0" width="1024" height="1024" fill="url(#bgGrad)" />
    <rect x="0" y="0" width="1024" height="1024" fill="url(#topGlow)" />

    <g>
{chr(10).join(grid_lines)}
{chr(10).join(diagonals)}
{chr(10).join(circles)}
    </g>

{emblem_group}

    <path d="{sq_inner}" fill="none" stroke="url(#rimGrad)" stroke-width="5" />
  </g>
</svg>
'''


def rasterize_via_librsvg(svg_path: str, png_path: str, size: int) -> bool:
    """Renders SVG -> RGBA PNG using native librsvg-2 + libcairo via ctypes."""
    try:
        libcairo = ctypes.CDLL('libcairo.so.2')
        librsvg = ctypes.CDLL('librsvg-2.so.2')
        libgobject = ctypes.CDLL('libgobject-2.0.so.0')
    except OSError:
        return False

    class RsvgRectangle(ctypes.Structure):
        _fields_ = [
            ('x', ctypes.c_double),
            ('y', ctypes.c_double),
            ('width', ctypes.c_double),
            ('height', ctypes.c_double),
        ]

    libcairo.cairo_image_surface_create.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
    libcairo.cairo_image_surface_create.restype = ctypes.c_void_p
    libcairo.cairo_create.argtypes = [ctypes.c_void_p]
    libcairo.cairo_create.restype = ctypes.c_void_p
    libcairo.cairo_surface_write_to_png.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
    libcairo.cairo_surface_write_to_png.restype = ctypes.c_int
    libcairo.cairo_destroy.argtypes = [ctypes.c_void_p]
    libcairo.cairo_surface_destroy.argtypes = [ctypes.c_void_p]

    librsvg.rsvg_handle_new_from_file.argtypes = [ctypes.c_char_p, ctypes.POINTER(ctypes.c_void_p)]
    librsvg.rsvg_handle_new_from_file.restype = ctypes.c_void_p
    librsvg.rsvg_handle_render_document.argtypes = [
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.POINTER(RsvgRectangle),
        ctypes.POINTER(ctypes.c_void_p),
    ]
    librsvg.rsvg_handle_render_document.restype = ctypes.c_bool
    libgobject.g_object_unref.argtypes = [ctypes.c_void_p]

    err = ctypes.c_void_p(None)
    handle = librsvg.rsvg_handle_new_from_file(svg_path.encode('utf-8'), ctypes.byref(err))
    if not handle:
        return False

    surface = libcairo.cairo_image_surface_create(0, size, size)
    ctx = libcairo.cairo_create(surface)
    rect = RsvgRectangle(0.0, 0.0, float(size), float(size))
    ok = librsvg.rsvg_handle_render_document(handle, ctx, ctypes.byref(rect), ctypes.byref(err))
    if ok:
        libcairo.cairo_surface_write_to_png(surface, png_path.encode('utf-8'))

    libcairo.cairo_destroy(ctx)
    libcairo.cairo_surface_destroy(surface)
    libgobject.g_object_unref(handle)
    return bool(ok)


def rasterize_svg(svg_path: str, png_path: str, size: int) -> None:
    if rasterize_via_librsvg(svg_path, png_path, size):
        return
    if shutil.which('rsvg-convert'):
        subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), svg_path, '-o', png_path], check=True)
        return
    if shutil.which('inkscape'):
        subprocess.run(['inkscape', svg_path, '--export-type=png', f'--export-filename={png_path}', f'-w={size}', f'-h={size}'], check=True)
        return
    if shutil.which('magick'):
        subprocess.run(['magick', '-background', 'none', svg_path, '-resize', f'{size}x{size}', png_path], check=True)
        return
    if shutil.which('convert'):
        subprocess.run(['convert', '-background', 'none', svg_path, '-resize', f'{size}x{size}', png_path], check=True)
        return
    raise RuntimeError(
        'No SVG rasterizer available. Install librsvg2 (Linux), rsvg-convert, inkscape, or ImageMagick, or pass --svg-only.'
    )


def main() -> int:
    parser = argparse.ArgumentParser(description='Generate an Apple/Xcode-style architectural blueprint app icon.')
    parser.add_argument('--preset', choices=sorted(PRESETS.keys()), default='prussian', help='Built-in background palette preset')
    parser.add_argument('--bg-top', help='Override top background gradient hex color')
    parser.add_argument('--bg-mid', help='Override middle background gradient hex color')
    parser.add_argument('--bg-bot', help='Override bottom background gradient hex color')
    parser.add_argument('--grid-color', help='Override blueprint grid line hex color')
    parser.add_argument('--grid-opacity', type=float, help='Override blueprint grid opacity (0.0-1.0)')
    parser.add_argument('--rim-opacity', type=float, help='Override squircle inner rim highlight opacity (0.0-1.0)')
    parser.add_argument('--inset', type=float, default=36.0, help='Outer transparent margin around squircle in px (default: 36)')
    parser.add_argument('--size', type=int, default=1024, help='Output PNG width/height in pixels (default: 1024)')
    parser.add_argument('--emblem', required=True, help='Path to central foreground SVG emblem (authored for 1024x1024 viewBox)')
    parser.add_argument('--no-shadow', action='store_true', help='Skip default drop shadow wrapper around emblem')
    parser.add_argument('--svg-only', action='store_true', help='Write only the .svg output without rasterizing .png')
    parser.add_argument('--out', required=True, help='Output path prefix without extension (writes <out>.svg and <out>.png)')
    args = parser.parse_args()

    palette = dict(PRESETS[args.preset])
    if args.bg_top:
        palette['bg_top'] = args.bg_top
    if args.bg_mid:
        palette['bg_mid'] = args.bg_mid
    if args.bg_bot:
        palette['bg_bot'] = args.bg_bot
    if args.grid_color:
        palette['grid_color'] = args.grid_color
    if args.grid_opacity is not None:
        palette['grid_opacity'] = args.grid_opacity
    if args.rim_opacity is not None:
        palette['rim_opacity'] = args.rim_opacity

    emblem_defs, emblem_body = extract_emblem_parts(args.emblem)
    svg_text = compose_blueprint_svg(
        bg_top=str(palette['bg_top']),
        bg_mid=str(palette['bg_mid']),
        bg_bot=str(palette['bg_bot']),
        grid_color=str(palette['grid_color']),
        grid_opacity=float(palette['grid_opacity']),
        rim_opacity=float(palette['rim_opacity']),
        inset=args.inset,
        emblem_defs=emblem_defs,
        emblem_body=emblem_body,
        apply_shadow=not args.no_shadow,
    )

    out_prefix = re.sub(r'\.(?:svg|png)$', '', args.out, flags=re.IGNORECASE)
    parent_dir = os.path.dirname(os.path.abspath(out_prefix))
    if parent_dir:
        os.makedirs(parent_dir, exist_ok=True)

    svg_path = f'{out_prefix}.svg'
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(svg_text)
    print(f'Wrote {svg_path}')

    if not args.svg_only:
        png_path = f'{out_prefix}.png'
        rasterize_svg(svg_path, png_path, args.size)
        print(f'Wrote {png_path}')

    return 0


if __name__ == '__main__':
    sys.exit(main())
