---
name: blueprint-app-icon
description: >-
  Generates pixel-perfect 1024x1024 vector SVG and transparent PNG app icons using the classic
  Apple/Xcode/Discord-Beta architectural blueprint icon grid (continuous squircle, 8x8 grid,
  3 concentric keyline circles, 2 diagonals, top specular sheen, and inner rim) with any
  custom color palette and any central SVG emblem. Use when creating or restyling a desktop/web
  app icon in a blueprint aesthetic, swapping color variants, or preparing master assets for
  Tauri, macOS, Linux, Windows, or favicons.
---

# Blueprint App Icon Generator

Composes a clean, mathematically aligned **Apple / Xcode / Beta-style Blueprint App Icon** (`1024×1024` pure vector `.svg` + transparent-background `.png`) combining a customizable color background, the exact architectural construction grid, and any centered foreground SVG mark.

## Exact Blueprint Geometry

- **Canvas:** `1024 × 1024` (`viewBox="0 0 1024 1024"`), transparent outside the squircle.
- **Outer Squircle:** Continuous superellipse (`n = 4.8`) centered at `(512, 512)` with `half = 476` (`36px` dock-safe margin on each side; configurable via `--inset`).
- **Apple / Xcode Architectural Grid (clipped to squircle):**
  - **8×8 open grid** (`7` vertical + `7` horizontal lines across the `952px` squircle; cell size `119px`; outer safe-zone lines `k = 1, 7` and center crosshair `k = 4` weighted slightly stronger than subdivisions `k = 2, 3, 5, 6`).
  - **3 concentric keyline circles** centered at `(512, 512)` with radii `1×`, `2×`, and `3×` cell (`119px`, `238px`, `357px`).
  - **2 corner-to-corner 45° diagonals** crossing `(512, 512)`.
- **Surface Polish:** Vertical 3-stop background gradient, subtle radial top highlight (`18%` white fade), `5px` translucent inner glass rim stroke, and a soft grounded drop shadow under the foreground emblem so it floats physically above the grid.

## Quick Start (Bundled Script)

Run [scripts/render_blueprint_icon.py](./scripts/render_blueprint_icon.py) from any directory:

```bash
# Built-in color presets: prussian | xcode | terracotta | forest | charcoal
python3 .agents/skills/blueprint-app-icon/scripts/render_blueprint_icon.py \
  --preset prussian \
  --emblem .agents/skills/blueprint-app-icon/examples/schemacrafter-emblem.svg \
  --out ./my-icon

# Custom color variable palette
python3 .agents/skills/blueprint-app-icon/scripts/render_blueprint_icon.py \
  --bg-top "#1E4D40" --bg-mid "#14382E" --bg-bot "#0B241D" \
  --grid-color "#e8fff6" --grid-opacity 0.28 \
  --emblem ./path/to/custom-emblem.svg \
  --out ./forest-icon
```

This writes both `<out>.svg` and `<out>.png` (`1024×1024` RGBA PNG).

## Authoring a Custom Central Emblem (`--emblem`)

Design the central icon as a standalone SVG file on a `0 0 1024 1024` coordinate system—see [examples/schemacrafter-emblem.svg](./examples/schemacrafter-emblem.svg) as a working reference:

1. **Safe Area:** Keep primary shapes centered around `(512, 512)` within roughly `190..834` (`~62%` of canvas width) so the emblem sits comfortably inside the `r = 3 cells` outer blueprint circle and remains legible at `16px–32px`.
2. **Scoped IDs:** Put any `<linearGradient>`, `<radialGradient>`, `<mask>`, or `<clipPath>` inside `<defs>...</defs>` using prefixed IDs (e.g., `emblem-*`) to avoid colliding with the template's internal IDs (`squircleClip`, `bgGrad`, `topGlow`, `rimGrad`, `emblemShadow`).
3. **Shadows:** By default the script wraps the emblem body in a subtle grounded drop shadow (`emblemShadow`). Pass `--no-shadow` if the emblem defines its own multi-layer shadows.
4. **Vector Fidelity Tip:** When translating an existing raster concept into an emblem SVG, measure key bounding boxes, stroke/bar widths, and negative-space gaps from the raster first rather than eyeballing proportions. For smooth straight-bar-to-circle connectors, compute exact tangent fillets instead of large concave hourglass arcs.

## Visual Verification Checklist

Always inspect the rendered `.png` with `read_file` after running the script:

1. Confirm the squircle corners are smooth with clean transparency outside the badge.
2. Check that the `8×8` grid lines, `3` concentric circles, and `2` diagonals stay delicate behind the foreground mark without reducing contrast.
3. Verify the foreground emblem has zero clipped edges, inverted SVG arc sweep flags, or unwanted mask stubs.
4. Confirm strong foreground-to-background contrast (e.g., warm ivory `#FCF9F2` or deep ink `#132A47` depending on background luminance) so the silhouette reads cleanly even when scaled down to `32×32`.

## Exporting for Desktop & Web Apps

- **Tauri v2 (`src-tauri/icons/`):**
  ```bash
  pnpm tauri icon <out>.png
  ```
- **Web Favicon (`public/favicon.svg`):** Re-run with `--inset 12 --svg-only` if you want the squircle slightly larger in browser tabs, or copy `<out>.svg` directly to `public/favicon.svg`.
