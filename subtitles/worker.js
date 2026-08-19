import { pipeline } from './transformers.min.js';

// Model tiers. `accurate` uses whisper-large-v3-turbo with the dtype split that its own
// model card documents (fp32 encoder / q4 decoder) — a single string dtype isn't valid
// across its multiple ONNX components. `fast`/`balanced` are single-file-per-role models
// where one quantization level applies uniformly.
const MODEL_TIERS = {
  fast: { model: 'onnx-community/whisper-base', dtype: 'q8' },
  balanced: { model: 'onnx-community/whisper-small', dtype: 'q8' },
  accurate: {
    model: 'onnx-community/whisper-large-v3-turbo',
    dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
  },
};

const device = typeof navigator !== 'undefined' && navigator.gpu ? 'webgpu' : 'wasm';

const pipelines = {};

function getPipeline(tier, onProgress) {
  if (!pipelines[tier]) {
    const cfg = MODEL_TIERS[tier];
    pipelines[tier] = pipeline('automatic-speech-recognition', cfg.model, {
      dtype: cfg.dtype,
      device,
      progress_callback: onProgress,
    });
  }
  return pipelines[tier];
}

self.onmessage = async (event) => {
  const { type, audio, language, tier } = event.data;
  if (type !== 'transcribe') return;

  try {
    const transcriber = await getPipeline(tier, (p) => {
      if (p.status === 'progress') {
        self.postMessage({
          type: 'progress',
          file: p.file,
          progress: p.progress ?? 0,
        });
      }
    });

    self.postMessage({ type: 'status', message: 'Transcribing audio… this can take a few minutes for longer files.' });

    const output = await transcriber(audio, {
      language,
      task: 'transcribe',
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    self.postMessage({ type: 'result', chunks: output.chunks ?? [], text: output.text ?? '' });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
