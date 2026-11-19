---
name: brand-logo-discovery
description: >-
  Guides a step-by-step, anti-cliché brand and app logo discovery process from initial concept
  exploration to a firm, friendly, open-source-ready vector mark. Use when the user wants to
  design a new app logo, move away from generic AI/SaaS aesthetics, explore distinct visual
  directions (from typographic monograms to pure product emblems), or derive an app's visual
  identity and color palette from its logo.
---

# Brand & Logo Discovery Workflow

A structured, collaborative workflow for designing distinctive app logos that feel **firm, intentional, friendly, and human-crafted**—avoiding generic dark-purple/neon-cyan AI-template clichés—and turning the chosen concept into a clean, scalable vector mark.

## Core Design Principles

1. **Reject generic AI/SaaS clichés by default:** Unless explicitly requested, avoid dark obsidian + purple/indigo-to-violet gradients, glowing neon cyan lines, glossy 3D glass bubbles, and generic circuit-board motifs.
2. **One strong graphic element:** A great app icon works as a single confident silhouette at both `1024×1024` and `16×16`. Prefer bold geometry, crisp negative space, and 2–3 flat/sculpted tones over fine clutter.
3. **Firm yet approachable:** Balance solid architectural/Swiss weight with subtle optical softening so indie and open-source tools feel reliable without looking cold or corporate.
4. **Logo as aesthetic anchor:** Treat each logo concept as a complete mini design system capable of inspiring the application's Light and Dark UI surfaces, borders, and accent color.

## Step-by-Step Procedure

### Step 1: Understand the Product & Anti-Goals
- Inspect the project name, core user action (e.g., connecting schemas, writing notes, routing APIs), and existing icon/favicon if any.
- Clarify tone and constraints with the user if unspecified: firmness vs. friendliness, typography vs. abstract symbol, and any aesthetics to avoid.

### Step 2: Explore the Full Visual Spectrum (3 Polarized Concepts)
Generate **3 genuinely distinct directions in parallel** (using the `image-generator` subagent) spanning three clear points on the identity spectrum so the user can react to real contrast rather than minor variations:

1. **Direction 1 — Pure Typographic Monogram:** Initials only (1–2 letters), custom bold geometric-humanist weight, tight kerning, one crisp structural accent detail.
2. **Direction 2 — Modular / Constructive Hybrid:** A single interlocking geometric mark inspired by joinery or modular craft that subtly echoes the app's initial or core metaphor.
3. **Direction 3 — Pure Graphic Product Emblem (Zero Letters):** One iconic, tactile geometric object representing what the user *builds or connects* in the product—memorable without any text.

Assign each direction its own distinct, non-generic palette from [references/anti-cliche-palettes.md](./references/anti-cliche-palettes.md) so the user evaluates both **form** and **color identity** together.

### Step 3: Visually Inspect & Present in a Carousel Artifact
- **Mandatory inspection:** Always view every generated image using `read_file` before presenting it. Never present unverified output.
- Present the 3 concepts in a markdown artifact inside the conversation artifact directory using a ````carousel` block paired with a concise comparison table describing:
  - The concept & spectrum position,
  - Its base color palette (exact hex codes),
  - How the full application UI (Dark & Light modes) could be derived from that logo.
- Ask the user which direction (or mix of form + palette) resonates before iterating further.

### Step 4: Iterative Refinement & Exact Geometry Preservation
When the user selects a direction and requests modifications (such as adding a blueprint grid, changing palette, or refining proportions):

- **Preserve the approved silhouette:** Never accidentally soften, distort, or redesign proportions the user already approved.
- **Measure before vectorizing:** When converting an approved raster concept into pure mathematical SVG, measure actual bounding boxes, corner radii, bar widths, and negative-space gaps directly from the approved image (e.g., via ImageMagick `convert ... -resize 48x48! -depth 8 txt:-` or Python pixel inspection) so the vector recreation is 100% faithful.
- **Inspect every render visually:** After generating or rendering any SVG/PNG revision, open the rendered PNG with `read_file` to catch inverted SVG arc sweep flags, unwanted clipping stubs, imbalanced margins, or contrast issues.

### Step 5: Blueprint Framing or Final Asset Handoff
- If the user wants the iconic Apple/Xcode/Discord-style blueprint squircle framing over their chosen emblem (with customizable color palettes), activate the companion **`blueprint-app-icon`** skill (`.agents/skills/blueprint-app-icon/SKILL.md`).
- Save approved master files cleanly (both `.svg` vector source and `1024×1024` `.png`) under `docs/brand/` (or the user's preferred brand directory) before integrating into `public/favicon.svg`, app chrome, or `pnpm tauri icon`.
