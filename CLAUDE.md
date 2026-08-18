# BeLocal Animation Studio v2

A free-form, browser-based editor for building B-roll/explainer animations (stat reveals,
category cards, before/after comparisons, process flows, checklists, dot-grid pictograms)
for the BeLocal Japan Explainer Series YouTube videos. Built for a non-technical video
editor to use directly — no install, no account, no server.

Live at `http://www.animate.adaptinc.jp/` (GitHub Pages, repo `rkasai-afk/belocal-animation-studio`).

## Non-negotiable design constraint

**The deployed artifact is one self-contained `index.html` file** — Fabric.js, all fonts
(base64-embedded), and all app logic inlined into a single file with no external requests
and no build step to *view* it. This was a deliberate choice so the user can open it by
double-clicking, with zero setup. Don't introduce a bundler, CDN dependency, or multi-file
serving setup without discussing it with the user first — it would break the "just open it"
promise the tool was designed around.

Editing still happens across normal source files (below); `build.js` assembles them into
`index.html`. Never hand-edit `index.html` directly — it's a build artifact and will be
overwritten.

## File map

```
src/studio_v2_template.html   HTML shell: layout, CSS, and three placeholder comments
src/fonts_embed.css           @font-face declarations, base64 woff2 (Space Grotesk, Bebas
                               Neue, Inter, Work Sans, Playfair Display, Source Sans 3)
src/fabric.min.js             Fabric.js v7.4.0 UMD build, vendored (not npm-installed at
                               runtime — it's spliced directly into index.html)
src/app.js                    All application logic — the file you'll edit almost every time
build.js                      Assembles the above into index.html at repo root
index.html                    BUILD OUTPUT. This is what GitHub Pages serves. Don't hand-edit.
tests/test_v2.js              Playwright regression: templates, drag, add-layer, preview,
                               background media, save/load, record
tests/test_v3.js              Playwright regression: alignment tools, duration field, text
                               align, font import, timeline scrubber
tests/test_v4.js              Playwright regression: Dot-Grid/Before-After/Process Flow
                               templates, dot-grid regeneration, save/load round-trip
docs/Research_and_Architecture_Brief.md   Why Fabric.js, explainer-video technique notes
docs/GITHUB_PAGES_SETUP.md    How this got deployed (GitHub Pages + custom subdomain via
                               MuuMuu DNS CNAME to `rkasai-afk.github.io`)
```

## Workflow

1. Edit `src/app.js` (and `src/studio_v2_template.html` if the UI needs new elements).
2. `npm run build` — regenerates `index.html`.
3. `npm test` — runs build + all three Playwright suites headless. Every suite must end
   with `HAD ERROR: false` (no console/page errors). Read the printed assertions, not just
   the exit code — several tests print `OK`/`FAIL` inline rather than throwing.
4. For anything visual (new template, layout change, animation timing), also actually look
   at the screenshots the tests write to `qa/qa2/`, `qa/qa3/`, `qa/qa4/` — passing assertions
   don't catch "it renders but looks wrong." Read a few of them back before calling it done.
5. Commit `index.html` along with the source changes — GitHub Pages serves directly from
   the `main` branch root, there's no separate deploy step. Once pushed, the live site
   updates within about a minute.

## Critical gotchas (hit these once already — don't re-hit them)

- **`String.replace()` in build.js must use a function replacer**, not a plain string
  (`.replace(placeholder, () => content)`, not `.replace(placeholder, content)`).
  `fabric.min.js` contains literal `$&`/`` $` ``/`$'` sequences that a string replacement
  argument interprets as special regex tokens, silently corrupting the output. Already
  handled correctly in `build.js` — just don't "simplify" it.
- **Fabric v7's multi-select type string is `'activeselection'` (all lowercase)**, not
  `'activeSelection'`. `obj.type === 'activeSelection'` silently fails and multi-select
  UI never renders. Check both, or check lowercase, everywhere you branch on `obj.type`.
- **The embedded font files are subsetted** (fontsource latin subsets) and may be missing
  glyphs like `⟹`. Canvas text rendering falls back to a system font for missing glyphs,
  which usually still displays *something*, but don't assume an arbitrary Unicode character
  will render in the intended typeface — stick to plain `→` for arrows, which is reliably
  present, or test any new glyph visually before shipping it in a template.
- **Dot-Grid Pictogram is one resizable `fabric.Group`, not N individual objects.** With
  totals up to several hundred, individually-draggable dots would be unusable (Layers list
  clutter, terrible perf on drag). It regenerates via `buildDotGridGroup()` /
  `rebuildDotGrid()` whenever Total/Highlighted/Color change in the props panel — the old
  group is torn down and a new one built in its place, preserving position/scale/opacity.
  If you add another "many small identical things" layer type, follow this same pattern
  rather than making them individually draggable.

## Architecture notes

- **Templates are data, not code.** Each entry in the `TEMPLATES` object (`app.js`) is a
  `layers()` function returning an array of plain-object layer specs built with the `T()`
  (text), `R()` (rect), `C()` (circle), `D()` (dot-grid) helpers. Adding a template means
  writing a new entry with new specs — it does not touch the rendering/animation engine.
  `specToObject()` turns a spec into a live Fabric object.
- **Per-layer entrance animation** lives in `obj.data.anim = {type, delay, duration}`.
  The animation engine (`captureBaseState` → `applyFrame(elapsed)` → `restoreBaseState`,
  driven by one `requestAnimationFrame` loop in `loop()`) is generic across every layer
  type — new animation types are added by extending the `switch (a.type)` block in
  `applyFrame()` and the `ANIM_OPTIONS` list, not by touching individual templates.
- **The timeline scrubber** (`#timelineScrub`) calls `applyFrame(t)` directly for a given
  millisecond offset without running the rAF loop — used for fine-tuning timing without
  full playback. `updateScrubRange()` keeps its `max` in sync with `computeContentEnd()`.
- **Alignment** (`alignObjToCanvas`, `alignChildrenToEachOther`) works by reading each
  object's absolute `getBoundingRect(true, true)` and translating via `left`/`top` deltas —
  this is safe under rotation/scale because translating an object's origin point shifts its
  whole rendered bounding box by the same delta, regardless of its own transform.
- **Custom font import** registers via the `FontFace` API (`registerCustomFont`) and is
  persisted into saved `.json` projects as base64 data URLs (`customFonts` array) so a
  reloaded project re-registers the same fonts before enlivening objects.
- Save/load round-trips through `canvas.toJSON()`-equivalent (`obj.toObject(['data','name'])`
  per object) and `fabric.util.enlivenObjects()`. Fabric's own group serialization already
  handles nested `fabric.Group` children (the dot-grid), so no special-casing was needed there.

## Deferred / likely next asks

Flagged to the user already as not-yet-built, in case they come back to it:

- A geographic map/callout layer type.
- An org/family-tree layer type (needed for Episode 11's Imperial succession beats).

Both should follow the existing extension points: a new `kind` in `specToObject()`, a new
branch in `selectProps()` for its properties panel, and it gets drag/resize/align/animate/
record for free from the existing generic machinery — same as how Dot-Grid was added.

## Who this is for

The end user (Ryu, non-technical, runs BeLocal's video production) opens `index.html` (or
the live URL) directly in a browser and builds animations by dragging/typing — they don't
see or touch any of this source. Keep the props panel's language plain and avoid exposing
new raw technical controls unless there's no simpler way to express the same capability —
that restraint (e.g. duration/delay only, no per-keyframe easing curves) was a deliberate
choice to keep the tool usable, not an oversight.
