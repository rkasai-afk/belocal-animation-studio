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
import_parse.js Pure text -> {episode,beats,sources,claims} parser for the BeLocal
                production-document format. No DOM/File APIs — unit-testable in plain Node,
                independent of how the source bytes were read (see "Import Production
                Document" below).
import_docx.js  Browser-only .docx -> block-list extraction: a ~100-line ZIP central-
                directory reader + DecompressionStream('deflate-raw') to inflate, then a
                DOMParser walk of word/document.xml. No vendored library — deliberately,
                since both are small bounded problems and the browser already has what's
                needed.
import_pdf.js   Browser-only .pdf -> line-array extraction via vendored pdf.js.
import.js       Ties the above together: picks the extractor by file extension, runs
                import_parse.js, and writes the result into db.js as a new episode.
vendor/         pdf.js (Mozilla, MIT), vendored the same way src/fabric.min.js and
                subtitles/transformers.min.js are — see "Import Production Document" below.
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

## Import Production Document

Real, not a stub — built once real examples of the BeLocal production-document format
(both the plain docx style and the newer "bracketed" style with `[OWN]`/`[GRAPHIC]`/`[SOURCE]`
visual-type tags and a RESEARCH EVALUATION confidence section) were available to parse
against. Episodes → Import Production Document accepts `.docx` or `.pdf`, entirely
client-side — nothing is uploaded anywhere, matching the rest of this tool.

**Field mapping**, from a document section to where it lands:

| Document section | Goes to |
|---|---|
| `EPISODE NN` / title | `episode.number` / `episode.title` |
| `THE VERDICT` | `episode.description`, and becomes Fact Lock claim `C01` |
| `RUNTIME` | `episode.runtimeTarget` |
| `3 THINGS TO KNOW`, `WHAT THIS EPISODE IS NOT`, `EDITORIAL GUARDRAILS`, `RECHECK` condition | `episode.productionNotes` (one combined reference block) |
| Each beat's narration + visual/source cell | one `beat` per row/section — narration, `visualType` (from a `[BRACKET]` tag if present, else a keyword heuristic), `visualInstruction`, and an `EDIT CAUTION:` line if present → `beat.notes` |
| `Source: S0N` in a beat | resolves against the parsed source list and sets `beat.sourceId` (first code if several are cited; the raw citation is kept in the beat's `visualInstruction` either way, so nothing is lost even when a beat cites more than one source) |
| Numbered `Sources` list | one `Source` record each, code `S01`, `S02`, ... — a bare domain URL (no `https://`, as these docs write them) gets one added so it's clickable |
| `RESEARCH EVALUATION` (when present): `HIGH CONFIDENCE` / `MODERATE BUT SUPPORTIVE` items | additional Fact Lock claims, status `VERIFIED` / `VERIFIED WITH QUALIFIER` |
| `RESEARCH EVALUATION`: `REJECTED OVERCLAIM` items | folded into `productionNotes` as "do not say these" guardrails, not turned into claims — they describe what the script must *not* assert |
| `Short-Form Cut` / `FINAL SPOKEN SCRIPT` | `episode.shortScript` |
| `Publishing Copy` / `YOUTUBE DESCRIPTION` | `episode.masterCaption` |

The parsing logic (`import_parse.js`) is pure — no DOM, no File APIs — so it's unit-tested
directly against real block/line arrays, independent of the browser-only extraction
(`import_docx.js`'s hand-rolled ZIP+XML reader, `import_pdf.js`'s vendored pdf.js). See
`tests/test_production.js`'s import assertions for the end-to-end path against a synthetic
fixture (`tests/fixtures/sample_production_doc.docx` — synthetic on purpose, so no real
unpublished episode script ever needs to live in this public repo as test data).

**Known limitations**, by design rather than oversight:
- Parsing is best-effort and format-specific to this house style, not a general docx/PDF
  importer — every field stays editable after import, and the preview modal shows exactly
  what was found before anything is written, specifically so a bad parse is never silent.
- A beat citing multiple sources (`Source: S01/S02`) only gets `beat.sourceId` set to the
  first one — `db.js`'s beat model links one source per beat. The full citation text is
  preserved in the beat's visual instruction either way.
- A source URL that's hyphen-wrapped mid-string by the PDF's own line breaking can come out
  truncated (the PDF text layer doesn't mark a hyphen as "this word continues on the next
  line" vs. "this is a real hyphen") — rare, and the publisher/title fields are unaffected,
  so it's a quick visible fix rather than silent data loss.
- Re-importing the same file always creates a brand-new episode; it never merges into or
  overwrites an existing one, so nothing hand-edited can be silently clobbered by a re-run.

## Deferred / future modules

Intentionally not built yet, to avoid shipping something fragile or half-working. Each is
designed to attach without redesigning what exists:

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
