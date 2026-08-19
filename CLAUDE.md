# BeLocal Animation Studio v2

A free-form, browser-based editor for building B-roll/explainer animations — stat reveals,
category cards, before/after comparisons, process flows, checklists, dot-grid pictograms,
timelines, lower-thirds, quotes, listicles, map pins, and org/family trees — for the BeLocal
Japan Explainer Series YouTube videos, and more broadly for other B-roll needs beyond that
one series. Built for a non-technical video editor to use directly — no install, no
account, no server.

Canvas size is a per-project choice (Widescreen 16:9, Vertical 9:16, or Square 1:1 — see
"Aspect ratio system" below), so it's no longer landscape-only. Layers can be grouped into
one movable/alignable unit, the canvas background can be set fully transparent (for
recording video with real alpha, to composite over other footage later), and Vertical scenes
can show a platform "safe zone" guide (TikTok / Instagram Reels / YouTube Shorts) so text
and faces don't end up hidden behind that app's own UI chrome.

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
tests/test_v5.js              Playwright regression: aspect-ratio switching (canvas actually
                               resizes, active template regenerates, blank-canvas layers
                               survive a switch unwiped), and a bounding-box overflow check
                               for every template x aspect-ratio combination
tests/test_v6.js              Playwright regression: the four content templates added after
                               the original 7 (Lower-Third, Quote, Timeline, Listicle),
                               overflow-checked across all 3 aspect ratios, plus preview
                               animation screenshots
tests/test_v7.js              Playwright regression: template picker category chips
                               (filtering, restoring "All", loading from a filtered view)
tests/test_v8.js              Playwright regression: layer z-order buttons (verified with
                               distinctly-named objects, not just "did it crash") and the
                               Dot-Grid quick-add button
tests/test_v9.js              Playwright regression: Map/Location Pin quick-add, props-panel
                               edits, transform preservation across rebuilds, save/load
tests/test_v10.js             Playwright regression: Org/Family Tree quick-add, branching
                               (not just linear-chain) layout math verified directly via
                               parseOrgTree()/layoutOrgTree(), color edits, save/load
tests/test_v11.js             Playwright regression: layer Group/Ungroup (bounding box
                               matches pre-group union, group aligns as one unit, composite
                               layers like Dot-Grid can't be ungrouped), save/load with a
                               group in the scene, and the Vertical squished-canvas fix
                               re-checked at a realistic 1440x840 viewport
tests/test_v12.js             Playwright regression: transparent background swatch, its
                               explanatory note, save/load round-trip, a recorded WebM's
                               actual decoded pixel alpha (real transparency, not just an
                               editor preview), and the canvas frame outline/shadow
tests/test_v13.js             Playwright regression: the Vertical-only safe-zone guide
                               (TikTok/Instagram Reels/YouTube Shorts) — chip gating outside
                               Vertical, per-platform band percentages, reset-to-None on
                               leaving Vertical, and a recorded WebM's decoded pixels
                               confirming the guide is never baked into output
docs/Research_and_Architecture_Brief.md   Why Fabric.js, explainer-video technique notes
docs/GITHUB_PAGES_SETUP.md    How this got deployed (GitHub Pages + custom subdomain via
                               MuuMuu DNS CNAME to `rkasai-afk.github.io`)
```

## Workflow

1. Edit `src/app.js` (and `src/studio_v2_template.html` if the UI needs new elements).
2. `npm run build` — regenerates `index.html`.
3. `npm test` — runs build + all thirteen Playwright suites headless. Every suite must end
   with `HAD ERROR: false` (no console/page errors). Read the printed assertions, not just
   the exit code — several tests print `OK`/`FAIL` inline rather than throwing.
4. For anything visual (new template, layout change, animation timing), also actually look
   at the screenshots the tests write to `qa/qa2/` through `qa/qa13/` — passing assertions
   don't catch "it renders but looks wrong." Read a few of them back before calling it done.
   For anything aspect-ratio-related specifically, check Vertical and Square, not just the
   Widescreen default — a layout that fits fine at 1920 wide can overflow badly at 1080.
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
  Map/Location Pin (`buildPinGroup()`/`rebuildPin()`) and Org/Family Tree
  (`buildOrgChartGroup()`/`rebuildOrgChart()`) follow the exact same pattern. If you add
  another "many small identical things" or "regenerate from a few fields" layer type,
  follow this same pattern rather than making them individually draggable.
- **`specToObject()` defaults `width` to `400` and `textAlign` to `'center'`** for any text
  spec that omits them — not Fabric's own defaults, this project's. A short text object
  positioned with `originX:'left'` but no explicit `textAlign` will silently center itself
  inside that phantom 400px-wide box instead of sitting flush against its anchor point,
  which reads as "text positioned nowhere near where I put it" and, if the object sits near
  a canvas edge, can genuinely push its bounding box off-canvas. Always set both `width` and
  `textAlign` explicitly on every new text spec — don't rely on the defaults being harmless.
- **A rotated shape's bounding box doesn't shrink to its visual silhouette.** `angle:180` on
  a `fabric.Triangle` flips which way it visually points, but `left`/`top`/`originY:'top'`
  still anchor against the *original* (pre-rotation) rectangular bounding box, so a shape
  positioned to "poke out" below another object can end up fully hidden behind it instead.
  For an explicit custom silhouette (like the Map Pin's downward pointer), build a
  `fabric.Polygon` from explicit points rather than rotating a primitive — verify by
  comparing the parent group's rendered bounding-box height before/after adding the shape,
  not by eyeballing a screenshot at normal zoom (an 8-10px difference is easy to miss).
- **In Playwright tests, don't pair `ElementHandle.fill()` with an explicit
  `dispatchEvent('change')`** on a control wired to a rebuild-in-place pattern (Dot-Grid,
  Map Pin). Together they can fire the change handler twice; the second call lands on a
  stale closure bound to the object the first call already swapped away, silently leaving
  an orphaned duplicate on the canvas that a test asserting only on the *current* active
  object's properties won't catch. A single `dispatchEvent(new Event('change', {bubbles:
  true}))` via `page.evaluate()` fires it exactly once. This is a test-authoring pitfall,
  not a user-facing bug — real typing-then-blur only ever fires `change` once.
- **Anything that must be visible in the editor but must NOT appear in recorded video has to
  be a plain DOM element, never a Fabric object added to `canvas`.** `MediaRecorder` in
  `startRecording()` calls `canvas.lowerCanvasEl.captureStream()` — it only ever captures the
  canvas's own pixel buffer, not sibling/child DOM. This is how the transparent-background
  checkerboard (styled onto `#stageWrap`, only visible through a transparent canvas) and the
  safe-zone overlay (a div appended to `canvas.wrapperEl`, i.e. Fabric's own
  `.canvas-container`) both stay editor-only for free, with no special-casing at record time.
  If you add another "guide/chrome, not content" layer, follow the same pattern — and verify
  it with the same technique used in `test_v12.js`/`test_v13.js`: decode the actual recorded
  WebM's pixels in a fresh page (not just eyeball the live editor), since a bug here would
  otherwise only show up after the user already downloaded their video.

## Architecture notes

- **Aspect ratio system.** `W`/`H` (`app.js`) are `let`, not `const` — `ASPECT_PRESETS`
  (Widescreen 1920x1080, Vertical 1080x1920, Square 1080x1080) and `setAspect(id)` resize the
  canvas's real backing store (so recording resolution follows) and re-run the active
  template's `layers()` against the new size. A blank/manually-built scene is left in place
  rather than regenerated (there's nothing to regenerate it *from*). Every template derives
  its layout from `W`/`H` — never hardcode pixel positions assuming 1920x1080. The common
  pattern is `const cx = W/2, rel = W/1920;` then positions as `cx + offset*rel` and widths
  as `baseWidth*rel` — this keeps horizontal layout correct at any width while leaving
  vertical positions as literal numbers (tuned for `H=1080`, which Widescreen and Square both
  are — only Vertical's taller `H=1920` differs, and extra trailing whitespace there is fine,
  unlike horizontal overflow). Templates whose content is inherently a horizontal row
  (Category Cards, Before/After, Process Flow) additionally branch on `const portrait = H >
  W` to recompose into a stacked column instead of just shrinking a row that can't fit —
  see any of those three for the pattern. When adding a template, sanity-check it against
  all three presets, not just the Widescreen default it'll look fine in by construction.
- **Templates are data, not code.** Each entry in the `TEMPLATES` object (`app.js`) is a
  `layers()` function returning an array of plain-object layer specs built with the `T()`
  (text), `R()` (rect), `C()` (circle), `D()` (dot-grid), `P()` (map pin), `O()` (org/family
  tree) helpers. Adding a
  template means writing a new entry with new specs — it does not touch the
  rendering/animation engine. `specToObject()` turns a spec into a live Fabric object. Each
  entry also carries a `category` string (shown as a filter chip in the template picker) —
  give a new template one of the existing categories, or a new one if it genuinely doesn't fit
  (a new category just appears automatically, no separate registry to update).
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
- **Layer grouping** (`groupSelected()`/`ungroupSelected()`) turns a multi-select
  (`fabric.ActiveSelection`) into (or back out of) a single `fabric.Group` tagged
  `data.userGroup = true`. That tag is what lets `selectProps()` show an "Ungroup" button —
  composite layers like Dot-Grid/Map Pin/Org-Chart are also `fabric.Group`s but must never
  show it, so every group-type branch checks `data.userGroup` specifically rather than just
  `type === 'group'`.
- **Transparent background** is the literal string `'transparent'` in `BG_COLOR_OPTIONS`
  (`app.js`) and `canvas.backgroundColor` — deliberately not `''`, which would be falsy and
  silently break the `proj.bgColor || '#1F3864'` load fallback. Verified (not assumed) that
  Chrome's VP9 WebM recording path preserves real per-pixel alpha end-to-end, not just an
  editor-preview checkerboard — see `test_v12.js`'s decoded-pixel assertions. The canvas's
  visible frame (outline/shadow) lives on Fabric's `.canvas-container` div, not on the outer
  `#stageWrap` card, specifically so it stays visible/correct against a transparent canvas
  and at every aspect ratio (`#stageWrap` is a fixed-width card regardless of `W`/`H`).
- **Safe zone guide** (`SAFE_ZONE_PRESETS`, `renderSafeZoneButtons()`,
  `updateSafeZoneOverlay()` in `app.js`) shows a per-platform tinted-band overlay for
  Vertical-only scenes. Figures are approximate/community-sourced (no platform publishes an
  official spec) — re-check against current app screenshots if TikTok/Reels/Shorts visibly
  redesign their UI, and update the dated comment above `SAFE_ZONE_PRESETS` when you do. Only
  meaningful for the Vertical preset (all three platforms are vertical-only), so
  `renderSafeZoneButtons()` disables the platform chips outside Vertical and `setAspect()`
  resets the selection to "None" on leaving it, rather than leaving a stale guide showing over
  a shape it wasn't measured for. The overlay itself is a plain DOM element (see the DOM-
  overlay gotcha above), positioned with percentage sizing so it re-scales for free on
  resize/aspect-change with no extra JS.

## Deferred / likely next asks

Flagged to the user already as not-yet-built, in case they come back to them:

- **Undo/redo and drag-to-reorder layers** — the layers panel has bring-forward/send-backward
  buttons (`app.js`, `refreshLayerList()`) but no full undo history and no pointer-drag
  reordering. Both are real, independent UI investments (a command/state-snapshot stack;
  pointer/drop-index handling) rather than something to bolt on quickly.
- A geographic map/callout layer exists now (Map/Location Pin — a manual overlay marker over
  a background map image), but genuine mapping (tiles, geocoding) is intentionally out of
  scope — it would need external requests, which the single-file/no-network architecture
  rules out categorically, not just as a matter of remaining effort.

## Who this is for

The end user (Ryu, non-technical, runs BeLocal's video production) opens `index.html` (or
the live URL) directly in a browser and builds animations by dragging/typing — they don't
see or touch any of this source. Keep the props panel's language plain and avoid exposing
new raw technical controls unless there's no simpler way to express the same capability —
that restraint (e.g. duration/delay only, no per-keyframe easing curves) was a deliberate
choice to keep the tool usable, not an oversight.
