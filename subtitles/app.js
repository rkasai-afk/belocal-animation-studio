const fileInput = document.getElementById('fileInput');
const langSelect = document.getElementById('langSelect');
const modelSelect = document.getElementById('modelSelect');
const generateBtn = document.getElementById('generateBtn');
const statusLine = document.getElementById('statusLine');
const progressWrap = document.getElementById('progressWrap');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const resultsPanel = document.getElementById('resultsPanel');
const cueList = document.getElementById('cueList');
const downloadBtn = document.getElementById('downloadBtn');

let selectedFile = null;
let cues = [];
let worker = null;

fileInput.addEventListener('change', () => {
  selectedFile = fileInput.files[0] || null;
  generateBtn.disabled = !selectedFile;
  setStatus('');
});

generateBtn.addEventListener('click', () => runTranscription());
downloadBtn.addEventListener('click', () => downloadSrt());

function setStatus(message, isError) {
  statusLine.textContent = message;
  statusLine.classList.toggle('error', !!isError);
}

function setProgress(active, pct, label) {
  progressWrap.classList.toggle('active', active);
  if (typeof pct === 'number') progressFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (label !== undefined) progressLabel.textContent = label;
}

// --- Audio decode: read the file, decode its audio track, downmix + resample to the
// 16kHz mono Float32 format Whisper expects. Web Audio's decodeAudioData handles the
// audio track inside common video containers (mp4/mov/webm) directly, no separate
// demuxing step needed.
async function decodeToWhisperInput(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const probeCtx = new AudioCtx();
  let decoded;
  try {
    decoded = await probeCtx.decodeAudioData(arrayBuffer);
  } finally {
    probeCtx.close();
  }

  const targetRate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  // Connecting a multi-channel source to a 1-channel destination downmixes
  // automatically per the Web Audio spec's standard mixing rules.
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function ensureWorker() {
  if (!worker) worker = new Worker('./worker.js', { type: 'module' });
  return worker;
}

async function runTranscription() {
  if (!selectedFile) return;
  generateBtn.disabled = true;
  resultsPanel.style.display = 'none';
  setStatus('Decoding audio…');
  setProgress(true, 0, 'Reading file…');

  let audio;
  try {
    audio = await decodeToWhisperInput(selectedFile);
  } catch (err) {
    setStatus(`Could not read audio from this file: ${err.message}`, true);
    setProgress(false);
    generateBtn.disabled = false;
    return;
  }

  const language = langSelect.value;
  const tier = modelSelect.value;
  const w = ensureWorker();

  setStatus('Loading speech model (only needed the first time)…');

  w.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      setProgress(true, msg.progress, `Downloading model: ${msg.file} (${Math.round(msg.progress)}%)`);
    } else if (msg.type === 'status') {
      setStatus(msg.message);
      setProgress(true, 100, 'Transcribing…');
    } else if (msg.type === 'result') {
      setProgress(false);
      setStatus(`Done — ${msg.chunks.length} words recognized.`);
      cues = packCues(msg.chunks, language);
      renderCues();
      generateBtn.disabled = false;
    } else if (msg.type === 'error') {
      setProgress(false);
      setStatus(`Transcription failed: ${msg.message}`, true);
      generateBtn.disabled = false;
    }
  };
  w.onerror = (err) => {
    setProgress(false);
    setStatus(`Worker error: ${err.message}`, true);
    generateBtn.disabled = false;
  };

  w.postMessage({ type: 'transcribe', audio, language, tier }, [audio.buffer]);
}

// --- Word timestamps -> subtitle cues. Greedy-packs words into readable lines, capped
// by character count and duration, preferring to break on sentence-ending punctuation.
function packCues(wordChunks, language) {
  const maxCharsPerLine = language === 'ja' ? 16 : 42;
  const maxCueChars = maxCharsPerLine * 2;
  const maxDuration = 7;
  const sentenceEnd = /[.!?。！？]\s*$/;

  const result = [];
  let cur = null;

  for (const w of wordChunks) {
    const raw = w.text ?? '';
    const [start, end] = w.timestamp ?? [0, 0];
    if (!cur) {
      cur = { start, end, text: raw.trim() };
      continue;
    }
    const candidate = `${cur.text} ${raw.trim()}`.trim();
    const duration = end - cur.start;
    if (candidate.length <= maxCueChars && duration <= maxDuration) {
      cur.text = candidate;
      cur.end = end;
    } else {
      result.push(cur);
      cur = { start, end, text: raw.trim() };
      continue;
    }
    if (sentenceEnd.test(raw)) {
      result.push(cur);
      cur = null;
    }
  }
  if (cur) result.push(cur);
  return result;
}

function wrapLines(text, language) {
  const maxCharsPerLine = language === 'ja' ? 16 : 42;
  if (text.length <= maxCharsPerLine) return text;

  if (language === 'ja') {
    const mid = Math.ceil(text.length / 2);
    return `${text.slice(0, mid)}\n${text.slice(mid)}`;
  }

  const words = text.split(' ');
  let line1 = '';
  let line2 = '';
  for (const word of words) {
    if (!line2 && `${line1} ${word}`.trim().length <= maxCharsPerLine) {
      line1 = `${line1} ${word}`.trim();
    } else {
      line2 = `${line2} ${word}`.trim();
    }
  }
  return line2 ? `${line1}\n${line2}` : line1;
}

function renderCues() {
  cueList.innerHTML = '';
  cues.forEach((cue, i) => {
    const row = document.createElement('div');
    row.className = 'cue';

    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = `${formatTimestamp(cue.start)} →\n${formatTimestamp(cue.end)}`;
    time.style.whiteSpace = 'pre';

    const textarea = document.createElement('textarea');
    textarea.value = cue.text;
    textarea.addEventListener('input', () => {
      cues[i].text = textarea.value;
    });

    row.appendChild(time);
    row.appendChild(textarea);
    cueList.appendChild(row);
  });
  cueList.classList.add('active');
  resultsPanel.style.display = 'block';
}

function formatTimestamp(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n, len) => String(n).padStart(len, '0');
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function buildSrt() {
  const language = langSelect.value;
  return cues
    .map((cue, i) => {
      const text = wrapLines(cue.text.trim(), language);
      return `${i + 1}\n${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${text}\n`;
    })
    .join('\n');
}

function downloadSrt() {
  if (!cues.length) return;
  const srt = buildSrt();
  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const baseName = (selectedFile?.name || 'subtitles').replace(/\.[^.]+$/, '');
  a.href = url;
  a.download = `${baseName}.srt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
