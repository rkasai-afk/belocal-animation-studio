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

## Multi-tool repo structure

This repo hosts more than one independent tool under `www.animate.adaptinc.jp`, and is
expected to grow more over time. Each tool is self-contained — its own source, its own
tests — and GitHub Pages serves them all for free as subdirectories of the same repo, no
extra deploy config needed per tool:

- **Animation Studio** — this editor, at `/` (source under `src/`, built to `index.html`).
- **Auto Subtitles** — EN/JA video/audio → SRT, at `/subtitles/` (source and docs in
  `subtitles/`; see `subtitles/README.md` for that tool's own architecture notes).
- **Documentary Studio** — episode planning, Edit Blueprint, Assets library and Fact Lock
  for full documentaries (this is the tool that ties the other two into one workflow), at
  `/production/` (source in `production/`; see `production/README.md` for that tool's own
  architecture notes, including how it hands off to and receives files back from the other
  two tools).

**Global nav.** Every tool's page carries a `<nav class="global-nav">` bar linking to every
other tool, so a visitor to any one of them can reach any other. There is deliberately no
shared nav component/JS file — the animation studio must stay a single self-contained file
with zero external requests (see above), which rules out fetching a shared nav fragment at
runtime, so each tool's nav is hand-duplicated markup instead. **When adding a new tool,
add its link to the nav in every existing tool's page** (currently:
`src/studio_v2_template.html`'s `<nav>` near the top of `<body>`, and `subtitles/index.html`'s
equivalent) — there's no registry that does this automatically. A newly added tool's own
page should likewise link back to all the others.

## File map

```
src/studio_v2_template.html   HTML shell: layout, CSS, and three placeholder comments
src/fonts_embed.css           @font-face declarations, base64 woff2 (Space Grotesk, Bebas
                               Neue, Inter, Work Sans, Playfair Display, Source Sans 3)
src/fabric.min.js             Fabric.js v7.4.0 UMD build, vendored (not npm-installed at
                               runtime — it's spliced directly into index.html)
src/map_data.js                Vendored geographic boundary data (world countries + Japan
                               prefectures) for the Map Graphic layer — see that file's own
                               header comment for sources/licenses and the "Map Graphic"
                               architecture note below for why this needs no network access.
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
                               leaving Vertical, auto-fit nudging a template's layers clear of
                               the selected zone (with a bounding-box overflow check like the
                               aspect-ratio tests use) and the manual "Fit layers to safe
                               zone" button re-nudging a layer dragged back in, and a recorded
                               WebM's decoded pixels confirming the guide is never baked into
                               output
tests/test_v14.js             Playwright regression: Map Graphic's events-based animation
                               system (quick-add default, scope switching, click-to-highlight
                               toggle via a real canvas click, highlight animating from its
                               neutral base color rather than appearing pre-highlighted, route
                               arrowhead direction sanity across three compass directions,
                               camera zoom capped at MAX_CAMERA_ZOOM, the flagship flight
                               sequence's marker/camera/stat arrival, stat-card containment
                               checked on both a large region and a tiny one, the redundant
                               Edit-tab-click regression, the four Map starter templates
                               checked for overflow across all 3 aspect ratios like test_v5's
                               pattern, save/load round-trip of the full events array, a stat
                               card's optional secondary+source lines staying inside the card,
                               applyFrame(t) determinism — scrubbing 0 -> 5000 -> 2200
                               reproduces the exact same state as rendering 2200 directly — the
                               declarative control manifest driving real DOM interaction for
                               every control type (text, checkbox, range, buttonGroup) across
                               all four event types, manual camera pct-to-native-coordinate
                               conversion, a longer non-monotonic seek stress test whose result
                               must match a completely fresh page load's direct render of the
                               same instant, and the geographic dataset registry resolving
                               mapRegionsFor()/an unknown scope's fallback/the scope-switch
                               buttons all through GEOGRAPHIC_DATASETS)
tests/test_v15.js             Playwright regression: the TemporalDataSource foundation
                               (video-time <-> data-time mapping is an exact inverse pair,
                               exact source values at real observed years, a correctly
                               interpolated + explicitly-not-observed value between two real
                               rows, reverse/non-monotonic seeking reproducing a direct
                               lookup), the Temporal Linked View benchmark's MapView/LineView/
                               StatView agreeing at five different requested scene times and
                               after a non-monotonic seek — the actual synchronization proof,
                               not just the underlying math — the sequence settling on the
                               final observed value at the end of playback, overflow-checked
                               across all 3 aspect ratios, and save/load round-trip of both
                               new layer kinds
docs/Research_and_Architecture_Brief.md   Why Fabric.js, explainer-video technique notes
docs/GITHUB_PAGES_SETUP.md    How this got deployed (GitHub Pages + custom subdomain via
                               MuuMuu DNS CNAME to `rkasai-afk.github.io`)
subtitles/                    Auto Subtitles tool (EN/JA video/audio -> SRT for CapCut),
                               served at /subtitles/. Separate, independent tool — see
                               "Multi-tool repo structure" above and subtitles/README.md
                               for its own architecture notes. No build step of its own.
tests/test_subtitles.js       Playwright regression for the Auto Subtitles tool: cue-
                               packing, editable preview, SRT export (via a stubbed Worker),
                               plus a best-effort real-pipeline check
production/                    Documentary Studio (episode planning around the edit), served
                               at /production/. Separate, independent tool — see "Multi-tool
                               repo structure" above and production/README.md for its own
                               architecture notes. No build step of its own; ES modules
                               served directly, so it needs http(s), not file://, in tests.
tests/test_production.js      Playwright regression for Documentary Studio: episode/beat
                               CRUD, autosave, smart status derivation, drag reorder, asset
                               upload/log/delete, Fact Lock claim/source status, progress
                               math, Next Actions, global search, and the real cross-tool
                               postMessage handoff with both the Animation Maker (a beat's
                               "Create Graphic" round-trips a recorded WebM back as an
                               attached asset) and Auto Subtitles (a voiceover blob is
                               handed over automatically once that tab signals it's ready).
```

## Workflow

1. Edit `src/app.js` (and `src/studio_v2_template.html` if the UI needs new elements).
2. `npm run build` — regenerates `index.html`.
3. `npm test` — runs build + all sixteen Playwright suites headless. Every suite must end
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
- **`restoreBaseState()` must skip any layer whose `data.baseLeft` was never captured.**
  `captureBaseState()` (called from `startPlayback()`) is what records each layer's pre-
  animation `left`/`top`/`scaleX`/`scaleY`/`opacity` onto `data.base*`; `restoreBaseState()`
  (called from `backToEdit()`, which both `#modeEdit` and `#btnStop` call unconditionally on
  every click) blindly applies those `data.base*` fields back. If `backToEdit()` runs before
  `captureBaseState()` ever has — e.g. a user clicks the "Edit" tab redundantly right after
  loading a template, with nothing yet played — every layer's `data.base*` fields are still
  `undefined`, and `restoreBaseState()` wipes `left`/`top`/`scaleX`/`scaleY` to `undefined` on
  every object in the scene. This doesn't throw where it happens; the canvas just silently goes
  blank, and only surfaces later as a wall of `drawImage: ... canvas element with a width or
  height of 0` errors on the *next* Preview/Record, once Fabric tries to cache-render an object
  with `NaN` dimensions — a confusing, delayed symptom that looks unrelated to its actual
  cause. `restoreBaseState()` now guards with `o.data.baseLeft === undefined` before applying.
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
- **Give every new row of pill/chip buttons its own CSS class, even when it visually reuses
  an existing style.** `.tpl-btn`/`.aspect-btn`/`.cat-chip`/`.szone-btn` all share one look
  via a grouped CSS selector, but each has its own class specifically so a test's
  `page.$$('.foo-btn')` only ever matches the one button row it's meant to. Reusing an
  existing class (e.g. giving the safe-zone chips `.aspect-btn` because they look like the
  aspect buttons) silently makes `tests/test_v5.js`'s `.aspect-btn` query match both rows at
  once — this has broken a test's element count twice now (once for `.tpl-btn`, again for
  `.aspect-btn`). Treat "new button row, shared look" as a two-line change: a new class in
  the JS, added to the existing grouped CSS selector for styling — never reuse another row's
  class just because it looks the same.

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
- **Map Graphic** (`buildMapGroup()`/`rebuildMap()`/`applyMapTimeline()`, `src/map_data.js`)
  renders illustrated country or Japan-prefecture outlines from vendored SVG path data — real
  geographic boundaries, but static vector data rather than live tiles, so (unlike the
  Map/Location Pin above) it needs zero network requests and still fits this project's
  single-file architecture. Regions are matched by exact name (case-insensitive) against
  `WORLD_MAP_DATA.countries`/`JAPAN_MAP_DATA.prefectures` — the props panel only ever offers
  names from a `<select>`, so a typo can't silently fail to highlight anything. The layer's
  config is `data.map = {scope, events[], baseTransform, _runtime}` — an ordered list of
  `highlight`/`zoom`/`route`/`stat` events, each with its own `start`/`duration`, is the map's
  own sub-timeline, played by `applyMapTimeline()` as a second pass inside `applyFrame()` after
  the normal per-layer fade/pop/slide pass (so a map's entrance animation and its internal
  story beats are independent, not fused into one hard-coded sequence). `migrateMapConfig()`
  synthesizes an equivalent `events[]` from the old flat `highlights`/`routeFrom`/`routeTo`
  shape so older saved projects still load. A region's centroid/bounds — used for the route
  anchor, the camera zoom target, and the stat card anchor alike — is `regionAnchor()`'s
  largest-subpath-by-shoelace-area centroid, **not** a raw bounding-box center: several
  prefectures/countries include far-flung islands or get split at the antimeridian, which
  drags a naive bbox-center miles from the actual landmass. `regionAnchor()` caches by
  `scope|name` in `_regionAnchorCache` — when editing this function, the `best` candidate
  object it keeps across iterations MUST carry `area` alongside `x`/`y`/`bounds`, or the
  `c.area > best.area` comparison silently becomes `c.area > undefined` (always false) after
  the first subpath, degrading it to "whichever subpath appears first in the path string"
  instead of "largest" — this exact regression once made every zoom/route/stat anchor land on
  a stray island or coastline fragment instead of the real landmass, with no error or crash to
  flag it, only wrong-looking geometry. The camera (`computeCameraTarget()`/
  `applyCameraState()`) scales/pans the whole map `fabric.Group` as one transform — never
  individual children — which is what keeps regions/routes/markers/stat cards geometrically
  coherent through a zoom, and is capped at `MAX_CAMERA_ZOOM` (currently 6x) so a tiny region
  (a prefecture can be 1/15th the width of the whole Japan map) doesn't produce a jarring,
  un-cinematic lurch. **MapSpace vs ScreenSpace** is an explicit distinction, not just an
  implementation detail: geography, region highlights, routes, and the moving marker are pure
  MapSpace — native map coordinates, children of the one `fabric.Group` the camera transforms
  as a whole, so they're geometrically coherent through any pan/zoom by construction. A layer's
  own entrance (fade/pop/slide, `data.anim`) and the eyebrow/title text around the map are pure
  ScreenSpace — positioned in canvas coordinates, never touched by `applyCameraState()`. A stat
  card is the one deliberately hybrid case: **map-space positioned but screen-space sized** —
  its shapes are ordinary children of the map group (so the card tracks its region through a
  camera move, i.e. its *position* is MapSpace), but `applyMapTimeline()` counter-scales them by
  `1/camScaleMultiplier` every frame and repositions them as `anchor + baseOffset*counterScale`
  (offsets recorded once at build time in `buildStatCard()`'s returned `offsets` map, alongside
  `label`/`value`/`secondary`/`source` rows laid out via a running cursor rather than hand-tuned
  per-row offsets) — without this, the card's on-screen *size* and its distance from the region
  it annotates would both balloon with camera zoom, the same way a map marker icon shouldn't
  grow as you zoom a slippy map. If a future layer type needs the reverse hybrid (ScreenSpace
  position, e.g. fixed to a video-frame corner, but MapSpace-driven content), it should get its
  own explicit counter-transform the same way — never assume "child of the map group" implies
  "moves and scales exactly like the map." Every shape `buildStatCard()` constructs must set
  `originX`/`originY` explicitly
  (`'left'`/`'top'`, matching the `left`/`top` values used to position it) — a plain
  `new fabric.Rect({left, top, ...})` with no origin defaults to **center** origin in this
  vendored Fabric v7 build, so a background card built that way renders centered on `(left,
  top)` while text built with explicit `originX:'left'` renders with `(left,top)` as its
  corner, silently misaligning the two even though their local coordinates look consistent on
  paper — always screenshot a real render at the actual (non-1x) camera scale the card will
  appear at, not just inspect the constructor args, since the two origins agree exactly at a
  scale of 1 and only visibly diverge once zoomed. Click-to-highlight
  (`canvas.on('mouse:down', ...)`) hit-tests via `findRegionAtPoint()` (ray-casting against
  each region's subpaths) rather than Fabric's own event targeting, converting the click with
  `canvas.getScenePoint(e)` and `fabric.util.transformPoint(pt, fabric.util.invertTransform(
  obj.calcTransformMatrix()))` — **not** `canvas.getPointer()`/`object.toLocalPoint()`, both of
  which this vendored Fabric v7 build has removed entirely (calling either throws
  `TypeError: ... is not a function`, silently breaking every click on a selected map with no
  visible symptom beyond "clicking a region does nothing"); double-check any *new* pointer/
  coordinate code against what's actually exported from `src/fabric.min.js`, since Fabric's own
  migration guides and search-engine answers still describe the pre-v7 API. Follows the exact
  regenerate-in-place pattern as Dot-Grid/Pin/Org-Chart above — switching scope resets
  `events` (prefecture and country names don't overlap), and dragging/resizing the whole group
  works like any other layer via `scaleX`/`scaleY`.
- **Map rendering: vector-quality zoom.** Every shape `buildMapGroup()` builds (region
  `fabric.Path`s, route line/dots/marker, stat card rect+text) is constructed with
  `objectCaching: false`, as is the top-level `fabric.Group` itself — the one deliberate,
  narrow exception to Fabric's default object caching anywhere in this app (every other layer
  type keeps caching on). Root cause this was fixed for: Fabric's object cache renders an
  object once into an offscreen bitmap sized for its *current* effective scale and reuses that
  bitmap on later frames, but the cache is capped at a fixed total pixel budget
  (`fabric.config.perfLimitSizeTotal`, 2^21 ≈ 2.1 effective megapixels) regardless of the
  object's actual on-screen size — once camera zoom pushed a cached map object past that
  budget, Fabric silently shrank the cache bitmap to fit and then *stretched* it to cover the
  real (larger) on-screen area, producing visible pixel blocks with the underlying vector data
  completely untouched. Confirmed empirically, not guessed: a zoomed map group's internal
  `zoomX` (the scale its cache was actually rendered at, 2.39) diverged from its real `scaleX`
  (the scale it was actually displayed at, 5.91) after a camera zoom, and the cache canvas
  measured exactly 1467×1429px — `1467*1429 = 2,096,343`, matching `perfLimitSizeTotal`
  (2,097,152) almost to the pixel. This is *not* insufficient canvas backing resolution,
  missing retina scaling, CSS stretching, or raster geometry — the canvas backing store
  already matches the project's real export resolution 1:1, and the map is real vector path
  data the whole way through. Disabling caching on just this bounded set of map shapes (not
  globally) is a deliberate, reasoned exception rather than "caching is bad": this whole group
  is re-scaled every frame during any camera move (`applyCameraState()`), so a bitmap cache
  was already being re-rendered almost every frame anyway — verified caching was buying near-
  zero benefit here (an in-page A/B comparison during a real zoom sequence measured a *higher*
  frame rate with caching off, 47.8fps vs 37.3fps, because building/invalidating an offscreen
  cache canvas every frame costs more than drawing the shapes directly) while remaining a live
  correctness hazard the rest of the time. Verified at the actual worst case in this app, not
  just the small region that first surfaced the bug: a full manual 6x zoom (`MAX_CAMERA_ZOOM`)
  on Hokkaidō — the largest Japan prefecture, ~7x Kanagawa's bounding box — settles with no
  cache canvas existing on any map shape at all (`hasCacheCanvas: false` unconditionally,
  regardless of zoom level or canvas backing-store size — re-verified with the canvas
  resized to a hypothetical 3840×2160 backing store), which is what makes this a real
  architectural guarantee rather than "happened to be under budget at 1920×1080 today." If you
  add a new shape type to the map module (a new event type's own marker, say), give it
  `objectCaching: false` too, for the same reason.
- **Geographic dataset registry** (`GEOGRAPHIC_DATASETS`, `mapRegionsFor()`,
  `normalizeMapScope()`, `app.js`) replaced a hardcoded `scope === 'japan' ? ... : ...` ternary
  (duplicated in three places) as the one source of truth for which map datasets exist. A
  `GeographicDataset` is `{id, label, kind:'modern'|'historical', features}`; a
  `GeographicFeature` is whatever shape a dataset's source data already uses (for the two
  vendored datasets, `{id, name, kanji?, region?, path}`) — every engine function that touches
  regions reads only `.name`/`.path` off a feature, which is *why* this was a safe, mechanical
  extraction rather than a redesign: nothing had to change about how a region is used, only
  where the list of regions comes from. `normalizeMapScope(scope)` centralizes the "unknown
  scope falls back to `'world'`" default that used to be re-derived at each call site.
  `mapRegionsFor(scope)` keeps its exact original signature and return shape (an array of
  region objects) — every one of its ~15 call sites (region dropdowns, `regionAnchor()`,
  `findRegionAtPoint()`, `computeCameraTarget()`, `buildMapGroup()`, `statAnchorPoint()`)
  needed zero changes. See "Historical map layer" below for what this extension point does and
  doesn't unlock yet.
- **Map event control manifest** (`MAP_EVENT_CONTROLS`, `renderEventControl()`,
  `renderEventControlsForType()`, `app.js`) is what generates the props-panel UI for every map
  event type (`highlight`/`zoom`/`route`/`stat`) — adding a plain field to an event type (a new
  text/select/checkbox/color/region/range control) is a one-line manifest entry, not new UI
  code. Each control declares `key`/`label`/`type` and type-specific fields (`options` for
  `select`/`buttonGroup`, `min`/`max`/`step` for `range`, `placeholder` for `text`); the
  manifest describes *semantic* controls a creator edits ("Curve: Medium"), never raw
  implementation properties (bezier control points, transform matrices) — see the `route`
  entry's `curve` control (one preset dropdown) versus what it would look like exposing the
  underlying bezier control point directly. Two escape hatches keep this from needing a bigger
  framework: `showIf(e)` is the only conditional-visibility mechanism (used by the zoom type's
  auto/manual toggle — the manual-framing `range` controls are hidden until `e.manual` is
  checked) and `onSet(e, v)` lets one control's change imply a composite update a plain
  `e[key]=v` can't express (route's `style` buttonGroup also derives `movingObject` and a
  default `curve`) — both are still *data* attached to the field descriptor, not a new branch
  in the renderer. `pairWithNext: true` renders a control side-by-side with the one after it in
  a `row2` (From/To, Value/Unit) — the only layout hint this needs right now. Adding a genuinely
  new control *type* (not just a new field) still means a new branch in `renderEventControl()`
  itself — the manifest removes per-event-type duplication, not the primitive-control set.
- **PLAYBACK CLOCK vs SCENE EVALUATOR** is an explicit split, not just an implementation
  detail. The playback clock is whatever produces a requested elapsed-millisecond value —
  `loop()`'s `requestAnimationFrame` during Preview/Record, or the timeline scrubber dragging
  directly — and it may jump around non-monotonically (a user scrubbing back and forth). The
  scene evaluator is `applyFrame(elapsed)` (and, for a Map Graphic, `applyMapTimeline()` inside
  it): given one prior `captureBaseState()` call, it is a **pure function of `elapsed`** — every
  object's state is recomputed fresh from `elapsed` and the project's own config every call,
  with no accumulated/carried-over state from previous calls. This is verified, not assumed:
  `tests/test_v14.js` #43 seeks `0 -> 5000 -> 2200` and diffs against a direct render of 2200;
  #48 runs a longer non-monotonic sequence (`0, 500, 2500, 900, 4200, 1300`) and diffs the
  result against a *completely fresh page load's* direct render of 1300, across highlight
  color, camera transform, route marker position/rotation, and stat text/opacity together.
  `requestAnimationFrame` remains the right choice for interactive playback — nothing here
  argues for a frame-indexed renderer — but the reason scrubbing, recording, and this test
  suite all behave correctly is that the clock and the evaluator never share mutable state.
  The one thing that *would* break this: calling `captureBaseState()` more than once per
  playback/scrub session (each call re-captures each object's *current* — possibly
  already-animated — properties as the new "base", corrupting later evaluations); it's called
  exactly once, from `startPlayback()` and `beginScrub()`.
- **Temporal data foundation** (`createTemporalDataSource()`, `TEMPORAL_FIXTURES`,
  `temporalSourceFor()`, `app.js`) maps VIDEO TIME (elapsed milliseconds, the same currency
  every other animation in this file runs on) to DATA TIME (whatever unit a dataset's own time
  field uses) and back, and distinguishes OBSERVED (an exact source row) from INTERPOLATED (a
  smoothly-animated in-between state) — `valueAt(entity, dataTime)` returns `{value, time,
  observed}`, never silently presenting an interpolated state as if it were real. This is a
  reusable primitive, not a chart component: it knows nothing about maps, lines, or stat cards.
  `TEMPORAL_FIXTURES.fixtureIndex` is clearly-labeled **test fixture data** (round synthetic
  numbers, matching the exact example given in the phase spec this was built against) — not
  real documentary statistics; a real scene would supply its own sourced records via the same
  `{records, timeField, entityField, valueField}` shape. Two new layer kinds read from it:
  `buildLineChartGroup()`/`applyLineChartTimeline()` (`data.temporalLine` — a first-version line
  chart: baseline, full value line, a moving cursor, current value, min/max labels) and
  `buildTemporalStatGroup()`/`applyTemporalStatTimeline()` (`data.temporalStat` — reuses
  `buildStatCard()` directly, the *same* visual system a Map Graphic's stat event uses, per
  "use the existing stat/event visual system where practical" rather than a second
  implementation). A plain map `highlight` event (already existing, no new map code) plays the
  MapView role for the first proof — "just show which entity," not a choropleth. These are
  deliberately three independent layer types, not one `PopulationMapWithGraphComponent`: **the
  synchronization proof is that they agree despite never referencing each other**, only the
  same `{sourceId, videoStart, videoEnd}` config and the same `elapsed` — see
  `tests/test_v15.js` #8/#9. **Critical gotcha already hit once**: a temporal layer's
  `videoStart`/`videoEnd` is scene-global data time, and `applyFrame()`'s second pass for
  `temporalLine`/`temporalStat` deliberately does NOT subtract each layer's own
  `data.anim.delay` before evaluating it (unlike `applyMapTimeline`, which does subtract the
  map's own delay for its *own* sub-events). Two sibling temporal views with different
  entrance-fade delays would otherwise silently read *different* data-time windows at the same
  instant despite identical `videoStart`/`videoEnd` config — this exact bug was caught by
  `test_v15.js` #8 during development (LineView and StatView showed "94 idx" vs "95 idx" at the
  same elapsed time until fixed). Deferred, per the phase spec's explicit scoping: rankings,
  population pyramids, scatter/trails, flows, small multiples, narration/word-timing sync,
  and any props-panel UI for editing these two new layer types beyond template-authored
  starting points — this is the shared clock/data primitive those would eventually read from,
  not any of those forms themselves.
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
- **Fitting layers to the safe zone** (`safeZoneRect()`, `fitLayersToSafeZone()` in `app.js`)
  is a generic, engine-level pass — not a per-template concern. It reads each top-level
  object's absolute `getBoundingRect(true, true)` and translates it (never resizes/rescales)
  just enough to sit inside the inset safe rect, the same "read bounding rect, shift by a
  delta" technique `alignObjToCanvas()` already uses, so it's safe under rotation/scale/
  groups for the same reason. An object already bigger than the safe rect on an axis is
  aligned to its near edge as a best effort rather than force-fit (nothing to shrink it into
  without breaking the template's own sizing), and anything covering ≥92% of `W` or `H` is
  left alone entirely on the assumption it's an intentional full-bleed background element,
  not "content" that should dodge the guide. It runs automatically wherever layers already
  get (re)built with a zone active — `loadTemplate()` (covers initial load, template
  switches, and the aspect-switch reload path) and the safe-zone chip's own click handler
  (covers a blank/hand-built scene, and re-fits anything the user has since dragged back into
  the band) — plus a manual "Fit layers to safe zone" button for re-running it on demand.
  Because every entry point funnels through this one function, adding a new template or new
  composite layer kind needs zero safe-zone-specific code of its own.

## Documentary Studio

`production/` is a separate tool (episode planning around the edit — see "Multi-tool repo
structure" above) with its own architecture, distinct from the animation editor's single-file
constraint. Full detail lives in `production/README.md`; the essentials:

- **Storage is IndexedDB, not localStorage or a server.** GitHub Pages only serves static
  files, so there is no backend to call. `production/db.js` is the one module that touches
  `indexedDB` — every view module goes through it, never `indexedDB` directly. Small assets
  (thumbnails, recorded graphics, SRTs) are stored as real Blobs; raw footage is not assumed
  to live in the browser at all — "Log Asset" records metadata with no file, for footage that
  stays on disk/NAS and gets pulled into Resolve directly.
- **Progress % and beat status are pure functions of stored data**, not hand-maintained flags
  — see `production/progress.js` (`beatStatus()`, `computeEpisodeProgress()`,
  `computeNextActions()`). If you add a new required-for-READY condition, add it there; don't
  scatter status logic into view code.
- **Cross-tool handoff uses `window.open()` + `postMessage()`**, not file download/re-upload,
  because Documentary Studio and the other two tools share an origin. Documentary Studio opens
  the other tool with `?docHandoff=1&...` context in the URL; that tool shows a banner and,
  once it has something to hand back (a recorded WebM, a generated SRT), posts it to
  `window.opener` as a Blob (structured-clone supports this directly, no base64 needed). This
  is additive in both `src/app.js` and `subtitles/app.js` — opened normally (no query params),
  neither tool's existing behavior changes at all. See `production/integration.js` for the
  opener side and the `docHandoff`/`sendDocHandoffAsset` blocks near the end of the other two
  tools' `app.js` files for the child side.
- **Production-document import** (`production/import*.js`) parses the standard BeLocal
  `.docx`/`.pdf` production document into an episode, its beats, sources, and Fact Lock
  claims. The parsing logic is a pure function of a block/line array (unit-testable without
  a browser); getting that array out of the file is the only format-specific part — a
  hand-rolled ZIP+DOMParser reader for `.docx` (no library needed, the browser already has
  `DecompressionStream`), and vendored pdf.js (`production/vendor/`, same "vendor a finished
  build artifact" pattern as `src/fabric.min.js`/`subtitles/transformers.min.js`) for `.pdf`.
  See `production/README.md` "Import Production Document" for the full field mapping.

## Deferred / likely next asks

Flagged to the user already as not-yet-built, in case they come back to them:

- **Undo/redo and drag-to-reorder layers** — the layers panel has bring-forward/send-backward
  buttons (`app.js`, `refreshLayerList()`) but no full undo history and no pointer-drag
  reordering. Both are real, independent UI investments (a command/state-snapshot stack;
  pointer/drop-index handling) rather than something to bolt on quickly.
- Two geographic layer types now exist, deliberately different in kind: Map/Location Pin (a
  manual overlay marker over a background map image) and Map Graphic (illustrated country/
  prefecture outlines with fill highlights and route arrows — see "Map Graphic" below). Live,
  navigable, tile-based mapping (pan/zoom street or satellite imagery, real geocoding) is
  still intentionally out of scope — that genuinely needs external requests at runtime, which
  the single-file/no-network architecture rules out categorically. Map Graphic doesn't need
  that, because it's vendored static vector boundary data, not live tiles.
- **Documentary Studio** (`production/`) has its own deferred list — AI-assisted asset
  tagging/search, Evidence Visualizer, Data Story Engine, Voiceover/Radio Cut
  assembly, and Final QC cross-checking — all intentionally stubbed or left as future hooks
  rather than built fragile. See `production/README.md` "Deferred / future modules" for what
  each one needs before it's real. Production-document import (`.docx`/`.pdf`) *is* built —
  see that same file's "Import Production Document" section for the field mapping and known
  limitations.
- **Historical map layer.** No historical (pre-modern-prefecture) boundary data is vendored,
  and none should be fabricated — `src/map_data.js`'s header already documents its sources for
  the *modern* boundaries it does ship. A historical layer needs its own vetted dataset (the
  kind of institution — Geospatial Information Authority of Japan, National Diet Library,
  university historical-GIS projects — matters for credibility here) before any code is worth
  writing against it. The extension point now has a name: add a `GEOGRAPHIC_DATASETS['sengoku']
  = {id, label, kind:'historical', features:[...]}` entry (see "Geographic dataset registry"
  below) with its own province/domain path data shaped like the existing `{name, path}`
  features, and every engine function (`regionAnchor()`/`computeCameraTarget()`/
  `buildMapGroup()`/`findRegionAtPoint()`) reuses it unmodified — they were already generic
  over "a named region with a path," never assuming "prefecture" or "country." What's still
  missing on purpose: a `kind:'historical'` dataset is deliberately excluded from the
  props-panel scope-switch buttons (they only render `kind:'modern'` entries) since selecting a
  historical scope needs its own workflow (a date, a source, a confidence indicator), not a
  bare button; and a feature's optional `meta` provenance object (`dateStart`/`dateEnd`/
  `controller`/`disputed`/`approximate`/`source`/`confidence`) has a reserved shape but nothing
  reads or renders it yet.
- **Declarative control manifest for a future event type.** `MAP_EVENT_CONTROLS` (see "Map
  event control manifest" below) covers every control the current four event types need
  (`text`/`checkbox`/`color`/`region`/`select`/`buttonGroup`/`range`/`time`). A genuinely new
  control shape (e.g. a multi-line text area, a date picker for a future historical event)
  would still need a new branch added to `renderEventControl()` — the manifest removes the
  *per-event-type* duplication, not the need to ever add a new primitive control renderer.
- **Temporal layer editor UI.** `data.temporalLine`/`data.temporalStat` (see "Temporal data
  foundation" above) have no props-panel controls yet — they're template-authored only (see the
  "Temporal: Map + Line + Stat" starter). A creator can't currently pick a different entity,
  dataset, or time window without hand-editing the saved JSON. Building that UI is a smaller
  lift than it sounds now that the control manifest exists (a `sourceId` select, an `entity`
  select populated from `TemporalDataSource.entities()`, two `time` controls for the video
  window) but was left out of this pass per the phase's own explicit scoping ("do not yet
  build... a huge chart props panel") — the point of this pass was proving the
  TemporalDataSource/MapView/LineView/StatView architecture, not shipping a data-bound
  editing surface. Also deliberately not built, per that same scoping: bar-chart races,
  population pyramids, scatter/trails, Sankey/flow diagrams, small multiples, real dataset
  import (CSV/XLSX), and any automatic chart-type recommendation — `createTemporalDataSource()`
  is the shared primitive those would eventually read from, not any of those forms themselves.

## Who this is for

The end user (Ryu, non-technical, runs BeLocal's video production) opens `index.html` (or
the live URL) directly in a browser and builds animations by dragging/typing — they don't
see or touch any of this source. Keep the props panel's language plain and avoid exposing
new raw technical controls unless there's no simpler way to express the same capability —
that restraint (e.g. duration/delay only, no per-keyframe easing curves) was a deliberate
choice to keep the tool usable, not an oversight.
