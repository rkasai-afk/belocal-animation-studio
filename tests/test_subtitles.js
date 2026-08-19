const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

// The subtitles tool loads real ES modules (app.js, worker.js), which browsers refuse to
// import under file:// — unlike the self-contained animation studio, it needs serving over
// http(s). Spin up a minimal static server for the repo root rather than adding a new dep.
function startServer(root) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(url.parse(req.url).pathname);
    if (p.endsWith('/')) p += 'index.html';
    const filePath = path.join(root, p);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

// A tiny synthetic WAV (sine tone) — enough to exercise decode/resample and the full
// UI/export pipeline without needing a real speech sample or network access.
function writeToneWav(filePath) {
  const sampleRate = 44100;
  const numSamples = sampleRate * 2;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const val = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.3 * 32767;
    buf.writeInt16LE(Math.round(val), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

async function main() {
  const outDir = path.resolve(__dirname, '..', 'qa', 'qa_subtitles');
  fs.mkdirSync(outDir, { recursive: true });
  const toneWav = path.join(outDir, 'tone.wav');
  writeToneWav(toneWav);

  const repoRoot = path.resolve(__dirname, '..');
  const server = await startServer(repoRoot);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/subtitles/`;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  let hadError = false;
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
      hadError = true;
    }
  });
  page.on('pageerror', (err) => { console.log('PAGE ERROR:', err.message); hadError = true; });

  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '01_initial.png') });

  // --- 1. file selection enables Generate ---
  const disabledBefore = await page.$eval('#generateBtn', (el) => el.disabled);
  await page.setInputFiles('#fileInput', toneWav);
  const disabledAfter = await page.$eval('#generateBtn', (el) => el.disabled);
  console.log('1. Generate disabled before/enabled after file select:', disabledBefore, disabledAfter, disabledBefore && !disabledAfter ? 'OK' : 'FAIL');
  if (!(disabledBefore && !disabledAfter)) hadError = true;

  // --- 2. cue-packing / editable preview / SRT export, via a stubbed Worker so this
  // suite doesn't depend on downloading a real speech model (huggingface.co access is not
  // guaranteed in every environment this runs in) ---
  await page.addInitScript(() => {
    class FakeWorker {
      postMessage(msg) {
        if (msg.type !== 'transcribe') return;
        const chunks = [
          { text: ' Hello', timestamp: [0.0, 0.4] },
          { text: ' world.', timestamp: [0.4, 1.0] },
          { text: ' This', timestamp: [1.5, 1.8] },
          { text: ' is', timestamp: [1.8, 2.0] },
          { text: ' a', timestamp: [2.0, 2.1] },
          { text: ' test.', timestamp: [2.1, 2.5] },
        ];
        setTimeout(() => this.onmessage && this.onmessage({ data: { type: 'result', chunks, text: 'stub' } }), 20);
      }
    }
    window.Worker = FakeWorker;
  });
  await page.reload({ waitUntil: 'load' });
  await page.setInputFiles('#fileInput', toneWav);
  await page.click('#generateBtn');
  await page.waitForSelector('#cueList.active', { timeout: 5000 }).catch(() => {});
  const cueTexts = await page.$$eval('#cueList textarea', (els) => els.map((e) => e.value));
  const cuesOk = cueTexts.length === 2 && cueTexts[0] === 'Hello world.' && cueTexts[1] === 'This is a test.';
  console.log('2. word timestamps packed into sentence-boundary cues:', JSON.stringify(cueTexts), cuesOk ? 'OK' : 'FAIL');
  if (!cuesOk) hadError = true;
  await page.screenshot({ path: path.join(outDir, '02_cues.png') });

  // --- 3. manual edits carry through to the exported SRT ---
  await page.$eval('#cueList textarea', (el) => { el.value = 'Edited line.'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#downloadBtn'),
  ]);
  const srtPath = await download.path();
  const srt = fs.readFileSync(srtPath, 'utf8');
  const wellFormed = /^1\n00:00:00,000 --> 00:00:01,000\nEdited line\.\n\n2\n00:00:01,500 --> 00:00:02,500\nThis is a test\.\n$/.test(srt);
  console.log('3. SRT is well-formed and reflects the edited cue:', JSON.stringify(srt), wellFormed ? 'OK' : 'FAIL');
  if (!wellFormed) hadError = true;
  console.log('   suggested filename:', download.suggestedFilename(), download.suggestedFilename() === 'tone.srt' ? 'OK' : 'FAIL');

  // --- 4. best-effort real pipeline check: not fatal on network-restricted environments,
  // but must fail cleanly (network error) rather than crash the page, and any UNEXPECTED
  // failure mode is still surfaced as a real bug. ---
  await page.reload({ waitUntil: 'load' });
  // Undo the Worker stub for this pass by reloading without the init script's effect —
  // addInitScript persists across reloads on the same page, so use a fresh page instead.
  const realPage = await context.newPage();
  let realHadUnexpectedError = false;
  realPage.on('pageerror', (err) => { console.log('PAGE ERROR (real pipeline check):', err.message); realHadUnexpectedError = true; });
  await realPage.goto(baseUrl, { waitUntil: 'load' });
  await realPage.setInputFiles('#fileInput', toneWav);
  await realPage.selectOption('#langSelect', 'en');
  await realPage.selectOption('#modelSelect', 'fast');
  await realPage.click('#generateBtn');
  await realPage.waitForFunction(
    () => {
      const t = document.getElementById('statusLine').textContent;
      return t.startsWith('Done') || t.startsWith('Transcription failed') || t.includes('Could not read audio');
    },
    { timeout: 60000 },
  ).catch(() => {});
  const realStatus = await realPage.$eval('#statusLine', (el) => el.textContent);
  const acceptable = realStatus.startsWith('Done') || /failed to fetch|networkerror|timeout/i.test(realStatus);
  console.log('4. real pipeline reaches a clean end state (model download or graceful network failure):', realStatus, acceptable ? 'OK' : 'FAIL');
  if (!acceptable || realHadUnexpectedError) hadError = true;
  await realPage.close();

  console.log('HAD ERROR:', hadError);
  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
