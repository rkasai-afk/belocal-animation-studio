# Auto Subtitles

Upload a video or audio file (English or Japanese), get back an `.srt` file to import into
CapCut. Lives at `www.animate.adaptinc.jp/subtitles/`, alongside the animation studio in
this same repo — GitHub Pages serves the whole repo tree, so no separate deploy config was
needed for this subdirectory.

## How it works

Everything runs in the visitor's own browser. No server, no account, no API key, and the
file never leaves the machine:

1. `app.js` (main thread) reads the uploaded file and decodes its audio track via the Web
   Audio API (`decodeAudioData` handles the audio inside common video containers directly,
   not just standalone audio files), then resamples to 16kHz mono — the format Whisper
   expects.
2. That resampled audio is handed off to `worker.js`, a dedicated Web Worker, so the actual
   speech-to-text inference doesn't freeze the page. It runs a Whisper model via
   [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) (the
   in-browser ML runtime, formerly `@xenova/transformers`), requesting word-level
   timestamps.
3. `app.js` greedily packs those word timestamps into subtitle-cue-sized chunks (character
   and duration limits, preferring to break on sentence-ending punctuation), renders them
   as an editable list so typos/mis-transcriptions can be fixed by hand, and exports the
   result as a standard `.srt` file on download.

## The vendored model library

`transformers.min.js` in this folder is **not** the raw npm package output — the published
`dist/transformers.web.min.js` contains an unresolved bare import
(`from "onnxruntime-web/webgpu"`) that only a bundler can resolve, so it throws if loaded
directly as a browser `<script type="module">` or Worker import. This file is instead a
from-scratch bundle (esbuild, `platform: browser`, `format: esm`) that statically resolves
`@huggingface/transformers` together with its `onnxruntime-web` dependency into one
self-contained ESM file with zero remaining bare imports — the same "vendor a finished
build artifact" pattern the main app uses for `src/fabric.min.js`.

To rebuild it (e.g. to upgrade the library version):

```bash
mkdir /tmp/tfjs_build && cd /tmp/tfjs_build
npm init -y
npm install @huggingface/transformers@<version> onnxruntime-web@<the exact dev version pinned in that package's package.json dependencies>
echo 'export { pipeline, env } from "@huggingface/transformers";' > entry.js
npx esbuild entry.js --bundle --format=esm --platform=browser --minify --outfile=out.min.js
cp out.min.js <repo>/subtitles/transformers.min.js
```

The `onnxruntime-web` version **must** match exactly what the `@huggingface/transformers`
version you're installing depends on (check its `package.json`) — a mismatch can silently
pull in an incompatible WASM/JS interface.

## The one deliberate network dependency

Unlike the animation studio, this page is not a fully self-contained zero-network artifact.
On first use it fetches, from public CDNs, both the actual Whisper model weights (tens to
hundreds of MB depending on the quality tier picked) and the ONNX Runtime Web WASM
execution engine — vendoring either into this repo was ruled out (multi-hundred-MB binary
diffs are a bad fit for git, and it's how effectively every transformers.js browser app is
deployed). Both are cached by the browser after the first load, so it's a one-time cost per
device, not per use.

## Model tiers (`worker.js`, `MODEL_TIERS`)

| Tier | Model | Notes |
|---|---|---|
| Fast | `onnx-community/whisper-base` | Smallest download, roughest draft. |
| Balanced (default) | `onnx-community/whisper-small` | Established EN/JA accuracy balance. |
| Accurate | `onnx-community/whisper-large-v3-turbo` | Best Japanese quality; larger download, uses a split dtype config (`fp32` encoder / `q4` decoder) per that model's own card — a single dtype string isn't valid across its multiple ONNX components. |

Language is a required, explicit choice (English or Japanese) rather than "auto-detect" —
transformers.js's Whisper implementation doesn't currently do real language detection when
`language` is omitted (it silently defaults to English), and forcing the known language
measurably improves accuracy anyway.

## Known limitations

- Best on Chrome/Edge (WebGPU + WASM SIMD); Safari falls back to slower WASM-only.
- Very long inputs (45min+) will be slow without WebGPU — fine for BeLocal's typical
  few-minute explainer clips.
- This is a first-draft transcription, not final copy — proper nouns and jargon will need
  manual correction, hence the editable preview before export.
- A cloud API (e.g. OpenAI's Whisper endpoint) remains a documented fallback option if
  in-browser Japanese accuracy proves insufficient on real footage — not built, since it
  would need a small server-side proxy to keep an API key secret and was deliberately
  deferred in favor of shipping the free, private, zero-setup version first.

## Testing

`tests/test_subtitles.js` (repo root) covers the parts under this project's actual control
deterministically — word-timestamp cue-packing, the editable preview, SRT formatting/export
— via a stubbed Worker, plus a best-effort (non-fatal on network-restricted environments)
check that the real pipeline reaches either a successful transcription or a clean network
failure rather than crashing. Run via `npm test` from the repo root, or directly:
`node tests/test_subtitles.js` (serves the repo over a throwaway local HTTP server itself,
since — unlike the animation studio — this page needs to run over http(s), not `file://`,
for its ES module imports to load).
