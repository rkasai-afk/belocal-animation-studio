# BeLocal Documentary Studio

Episode planning around the edit — approved script → visual planning → assets → source
evidence → graphics → fact checking → edit preparation. DaVinci Resolve stays the actual
editor; this tool prepares everything around it. Lives at
`www.animate.adaptinc.jp/production/`, alongside the Animation Studio and Auto Subtitles in
this same repo — see the repo root `CLAUDE.md`, "Multi-tool repo structure."

## How it works

Everything runs in the browser, same as the rest of this repo — no server, no account,
nothing leaves the machine. GitHub Pages only serves static files, so there genuinely isn't
a backend this tool could call even if it wanted one.

- **Storage is IndexedDB** (`db.js`), not localStorage (too small) or a server (doesn't
  exist). It has five object stores — `episodes`, `beats`, `sources`, `claims`, `assets` —
  plus a `blobs` store keyed by asset id for the actual file bytes (thumbnails, small
  graphic/audio/subtitle exports). Every other module goes through `db.js`; nothing else
  touches `indexedDB` directly.
- **Raw footage is not assumed to live in the browser.** An asset can be "logged" with no
  file at all — just filename/type/tags/location — for footage that stays on disk or a NAS
  and gets pulled into Resolve's media pool directly. Uploading a file is supported too
  (stores the real Blob, generates a thumbnail), used for graphics, audio, and subtitles
  more than multi-gigabyte camera originals.
- **No build step.** Plain ES modules (`<script type="module">`), served directly — which
  means, unlike the self-contained animation studio, it needs to be loaded over http(s), not
  `file://` (browsers block ES module imports under `file://`). `tests/test_production.js`
  spins up a throwaway local static server for exactly this reason.

## File map

```
index.html      Shell: global nav, header/search bar, section nav, #main mount point
style.css       All styling — light "paper" theme matching the Animation Studio's palette
db.js           The only module that touches indexedDB. CRUD + query helpers per store.
progress.js     Pure functions: beat status derivation, per-episode progress %, Next Actions
util.js         Shared helpers: toast(), openModal()/closeModal(), escapeHtml(), debounce()
integration.js  Cross-tool handoff — opens the Animation Maker / Auto Subtitles with beat
                context, listens for the postMessage'd result, attaches it as an asset
app.js          Router (hash-based) + global search + main-nav wiring
view_episodes.js    Episodes list (home screen), + New Episode, Import stub
view_dashboard.js   Episode dashboard: progress header, Next Actions, voiceover/subtitles,
                    episode details/script fields
view_edit.js        Edit Blueprint: beat cards, inline editing, drag reorder, source/asset
                    attach, Create Graphic
view_assets.js      Asset library: upload/log, search/filter, detail/edit/delete
view_factcheck.js   Fact Lock: claims, sources, status color-coding, recheck
```

## Progress and status math

Every percentage is `done / required` over real records — see `progress.js` for the exact
definitions, but in short:

- **Script** = beats with non-empty narration / total beats.
- **Visuals** = beats with at least one asset attached / total beats.
- **Sources** = beats that need a source (visual type `SOURCE`, or the beat has a linked
  fact claim) with a source attached / beats that need one.
- **Graphics** = beats with visual type `GRAPHIC` that have an asset attached / total
  `GRAPHIC` beats.
- **Fact Check** = claims with status tier "ok" (`VERIFIED`, `CURRENT`) / total claims.
- **Overall %** = the mean of whichever of the above rows currently have a nonzero
  denominator (a episode with zero claims logged yet doesn't get penalized for it).
- **A beat's status badge** (`beatStatus()`) is auto-derived unless the beat has a manual
  override (the Status dropdown in its footer): missing narration beats missing source beats
  missing visual, in that priority order, because narration blocks everything downstream.
- **"READY FOR RESOLVE"** requires every beat READY, every claim at an "ok" status tier (or
  zero claims), a Voiceover asset, and a Subtitle asset.

## How the Animation Maker / Auto Subtitles integration works

Documentary Studio, the Animation Maker (`/`), and Auto Subtitles (`/subtitles/`) share an
origin, so a window opened with `window.open()` can `postMessage()` back to its opener —
including Blobs, which the structured-clone algorithm supports directly. No manual
download-then-reupload step is needed, and nothing about either tool's standalone behavior
changes.

**Creating a graphic** (`integration.js` → `openAnimationMakerForBeat`):
1. Documentary Studio opens `../?docHandoff=1&episodeId=...&beatId=...&title=...&notes=...`.
2. The Animation Maker (see the `docHandoff` block near the end of `src/app.js`) shows a
   banner with that context and, when the user clicks **Record & Download**, sends the
   recorded WebM to `window.opener` via `postMessage` in addition to its normal local
   download — standalone use is completely unaffected.
3. Documentary Studio's listener creates a `Graphic` asset from that Blob (with a
   best-effort video-frame thumbnail) and attaches it to the beat automatically.

**Generating subtitles** (`integration.js` → `openSubtitlesForEpisode`):
1. Documentary Studio opens `../subtitles/?docHandoff=1&episodeId=...`.
2. Auto Subtitles (see the `docContext` block near the top of `subtitles/app.js`) posts a
   `doc-subtitles-ready` handshake back once its listener is registered.
3. Documentary Studio responds with the already-uploaded voiceover Blob via `postMessage` —
   the user never has to pick a file in that tab.
4. Once transcription finishes, Auto Subtitles posts the built SRT back the same way, and
   Documentary Studio attaches it as a `Subtitle` asset.

Language/quality selection in Auto Subtitles stays a manual, explicit choice in both flows —
handoff only replaces the file-picking step, not the tool's own decisions.

## Deferred / future modules

Intentionally not built yet, to avoid shipping something fragile or half-working. Each is
designed to attach without redesigning what exists:

- **DOCX production-document import** — the "Import Production Document" button on the
  Episodes screen currently explains this isn't built yet rather than faking it. A real
  parser would populate `createEpisode()`'s fields directly; nothing about the data model
  needs to change to support it later.
- **AI-assisted asset search/tagging** — `view_assets.js`'s "suggested tags" are a cheap,
  local, non-AI heuristic (splitting the filename), deliberately not dependent on an
  external AI API per the project brief. Conventional metadata search (filename/tags/
  location/description) is what's built; semantic/visual search is a future addition on top.
- **Evidence Visualizer, Map Builder, Data Story Engine, Voiceover/Radio Cut, Final QC** —
  all out of scope for this build. Each would ultimately produce a `Graphic` (or `Subtitle`)
  asset attached to a beat, the same shape `integration.js` already knows how to receive —
  so adding one of these later is "point it at the same attach path," not a redesign.
- **Automated source-change monitoring** — `view_factcheck.js` flags a source as
  "⚠ Recheck recommended" once its `lastChecked` date is 90+ days old (a plain date
  comparison, `RECHECK_WARN_DAYS` in that file). There is no scraping or "the URL still
  returns 200 so it must be fine" logic, deliberately — that would be actively misleading
  for a fact-checking tool.
