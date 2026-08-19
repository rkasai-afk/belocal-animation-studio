const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

// Documentary Studio loads real ES modules (db.js, app.js, view_*.js), which browsers
// refuse to import under file:// — same reason the subtitles tool needs a static server.
// Serving the whole repo root also lets it exercise the real cross-tool handoff with the
// Animation Maker (../) and Auto Subtitles (../subtitles/) at their real relative URLs.
function startServer(root) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.wav': 'audio/wav', '.png': 'image/png', '.json': 'application/json' };
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

function writeToneWav(filePath) {
  const sampleRate = 44100;
  const numSamples = sampleRate * 1;
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

// 1x1 transparent PNG, base64-decoded — enough to exercise the image-thumbnail path.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

async function main() {
  const outDir = path.resolve(__dirname, '..', 'qa', 'qa_production');
  fs.mkdirSync(outDir, { recursive: true });
  const toneWav = path.join(outDir, 'voiceover.wav');
  writeToneWav(toneWav);
  const tinyPng = path.join(outDir, 'photo.png');
  fs.writeFileSync(tinyPng, TINY_PNG);

  const repoRoot = path.resolve(__dirname, '..');
  const server = await startServer(repoRoot);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/production/`;

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  let hadError = false;
  const errLabel = (p) => (msg) => console.log(`${p} ERROR:`, msg);
  page.on('console', (msg) => { if (msg.type() === 'error') { errLabel('CONSOLE')(msg.text()); hadError = true; } });
  page.on('pageerror', (err) => { errLabel('PAGE')(err.message); hadError = true; });

  // --- 1. Empty state ---
  await page.goto(baseUrl);
  await page.waitForTimeout(400);
  const emptyVisible = await page.isVisible('.empty-state');
  console.log('1. empty episodes state shown:', emptyVisible ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '01_empty.png') });

  // --- 2. Create episode ---
  await page.click('#btnNewEpisode');
  await page.fill('#neNumber', '14');
  await page.fill('#neTitle', 'Japanese Review Culture');
  await page.fill('#neDesc', 'Why NPS scores read low in Japan.');
  await page.click('#neCreate');
  await page.waitForTimeout(400);
  const onDashboard = /#dashboard\//.test(page.url());
  console.log('2. episode created, navigated to dashboard:', onDashboard ? 'OK' : 'FAIL');
  const episodeId = page.url().split('#dashboard/')[1];
  await page.screenshot({ path: path.join(outDir, '02_dashboard_empty.png') });

  // --- 3. Next Actions mentions voiceover when there's nothing else to do ---
  const naText = await page.textContent('#naList');
  console.log('3. next actions mention voiceover with no beats:', naText.includes('Upload voiceover') ? 'OK' : 'FAIL');

  // --- 4. Create first beat ---
  await page.click('#qlEdit');
  await page.waitForTimeout(300);
  await page.click('#esNewBeat');
  await page.waitForTimeout(300);
  let badge = await page.textContent('.status-badge');
  console.log('4. new beat starts NEEDS NARRATION:', badge.trim(), badge.includes('NEEDS NARRATION') ? 'OK' : 'FAIL');

  // --- 5. Fill narration, autosave shows SAVED ---
  await page.fill('.f-title', 'Why NPS looks low in Japan');
  await page.fill('.f-narration', 'NPS treats a score of eight as passive, which reads very differently in Japan.');
  await page.waitForTimeout(900);
  const saveState = await page.textContent('#editSaveState');
  console.log('5. autosave reached SAVED:', saveState.trim(), saveState.includes('SAVED') ? 'OK' : 'FAIL');

  // --- 6. Switch visual type to GRAPHIC -> status becomes NEEDS GRAPHIC, button appears ---
  await page.click('.vtype-btn[data-vt="GRAPHIC"]');
  await page.waitForTimeout(800); // status refresh runs inside the debounced (500ms) autosave
  badge = await page.textContent('.status-badge');
  console.log('6. visual type GRAPHIC -> NEEDS GRAPHIC:', badge.trim(), badge.includes('NEEDS GRAPHIC') ? 'OK' : 'FAIL');
  const createGraphicVisible = await page.isVisible('.btn-create-graphic');
  console.log('6b. Create Graphic button appeared:', createGraphicVisible ? 'OK' : 'FAIL');

  // --- 7. Attach a source (not required for GRAPHIC, but exercise the flow) ---
  await page.click('.btn-attach-source');
  await page.fill('#srcPub', 'Bain / Net Promoter System');
  await page.fill('#srcTitle', 'What NPS Measures');
  await page.fill('#srcUrl', 'https://example.com/nps');
  await page.click('#srcSave');
  await page.waitForTimeout(300);
  const sourceBoxText = await page.textContent('.source-box');
  console.log('7. source attached, URL visible:', sourceBoxText.includes('https://example.com/nps') ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '03_beat_graphic_source.png') });

  // --- 8. Create Graphic -> opens Animation Maker with beat context, records, posts back ---
  const popupPromise = context.waitForEvent('page');
  await page.click('.btn-create-graphic');
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await popup.waitForTimeout(1200);
  const bannerText = await popup.textContent('#docHandoffBanner');
  console.log('8. Animation Maker shows beat context banner:', bannerText.includes('Why NPS looks low in Japan') ? 'OK' : 'FAIL');
  await popup.screenshot({ path: path.join(outDir, '04_animation_maker_handoff.png') });

  await popup.click('#btnRecord');
  // Wait for the beat's status badge on the ORIGINAL page to flip to READY once the
  // recorded graphic comes back over postMessage and gets attached automatically.
  try {
    await page.waitForFunction(
      () => document.querySelector('.status-badge')?.textContent.trim() === 'READY',
      { timeout: 20000 }
    );
    console.log('9. graphic auto-attached, beat now READY: OK');
  } catch {
    const finalBadge = await page.textContent('.status-badge').catch(() => '(none)');
    console.log('9. graphic auto-attached, beat now READY: FAIL (badge is', finalBadge, ')');
  }
  await popup.close().catch(() => {});
  await page.screenshot({ path: path.join(outDir, '05_beat_ready.png') });

  // --- 10. Graphic asset shows up in the Assets library ---
  await page.goto(`${baseUrl}#assets/${episodeId}`);
  await page.waitForTimeout(400);
  await page.fill('#fSearch', 'belocal_scene');
  await page.waitForTimeout(300);
  const assetCardCount = await page.$$eval('.asset-card', (els) => els.length);
  console.log('10. graphic asset visible in library:', assetCardCount, assetCardCount >= 1 ? 'OK' : 'FAIL');
  await page.fill('#fSearch', '');

  // --- 11. Upload a plain file via the dropzone file input, skip metadata ---
  await page.setInputFiles('#fileInput', tinyPng);
  await page.waitForTimeout(200);
  await page.click('#uaSkip');
  await page.waitForTimeout(400);
  const gridText = await page.textContent('#assetGridWrap');
  console.log('11. uploaded photo asset appears:', gridText.includes('photo.png') ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '06_assets_grid.png') });

  // --- 12. Log an asset with no file ---
  await page.click('#btnLogAsset');
  await page.fill('#laName', 'Kamakura_034.mov (on NAS)');
  await page.selectOption('#laType', 'Own footage');
  await page.click('#laSave');
  await page.waitForTimeout(300);
  const gridText2 = await page.textContent('#assetGridWrap');
  console.log('12. logged (fileless) asset appears:', gridText2.includes('Kamakura_034') ? 'OK' : 'FAIL');

  // --- 13. Fact Check: create a claim, verify status color + edit ---
  await page.goto(`${baseUrl}#factcheck/${episodeId}`);
  await page.waitForTimeout(300);
  await page.click('#btnNewClaim');
  await page.fill('#clText', 'Japan targets 60 million international visitors by 2030.');
  await page.click('#clSave');
  await page.waitForTimeout(300);
  let claimClass = await page.getAttribute('.claim-card', 'class');
  console.log('13. new UNVERIFIED claim renders as bad tier:', claimClass, claimClass.includes('bad') ? 'OK' : 'FAIL');

  await page.selectOption('.claim-status-select', 'VERIFIED');
  await page.waitForTimeout(300);
  claimClass = await page.getAttribute('.claim-card', 'class');
  console.log('14. VERIFIED claim renders as ok tier:', claimClass, claimClass.includes('ok') ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '07_factcheck.png') });

  // --- 15. Dashboard progress reflects everything above ---
  await page.goto(`${baseUrl}#dashboard/${episodeId}`);
  await page.waitForTimeout(400);
  const rowsText = await page.textContent('.progress-rows');
  console.log('15. dashboard progress rows rendered:', rowsText.includes('Fact Check') ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '08_dashboard_progress.png') });

  // --- 16. Voiceover upload + Create Subtitles handoff wiring (no real transcription run) ---
  await page.setInputFiles('#voiceoverFile', toneWav);
  await page.waitForTimeout(400);
  const voiceoverPill = await page.textContent('#voiceoverCard');
  console.log('16. voiceover marked uploaded:', voiceoverPill.includes('Voiceover uploaded') ? 'OK' : 'FAIL');

  const subPopupPromise = context.waitForEvent('page');
  await page.click('#btnCreateSubtitles');
  const subPopup = await subPopupPromise;
  await subPopup.waitForLoadState('domcontentloaded');
  await subPopup.waitForTimeout(1500);
  try {
    await subPopup.waitForFunction(
      () => document.getElementById('docHandoffBanner')?.textContent.includes('Voiceover received'),
      { timeout: 8000 }
    );
    const genDisabled = await subPopup.getAttribute('#generateBtn', 'disabled');
    console.log('17. subtitles tool received voiceover via postMessage, Generate enabled:', genDisabled === null ? 'OK' : 'FAIL');
  } catch {
    console.log('17. subtitles tool received voiceover via postMessage, Generate enabled: FAIL (banner never updated)');
  }
  await subPopup.screenshot({ path: path.join(outDir, '09_subtitles_handoff.png') });
  await subPopup.close().catch(() => {});

  // --- 18. Global search finds the beat we created ---
  await page.goto(`${baseUrl}#episodes`);
  await page.waitForTimeout(300);
  await page.fill('#globalSearch', 'NPS looks low');
  await page.waitForTimeout(400);
  const searchText = await page.textContent('#searchResults');
  console.log('18. global search finds the beat:', searchText.includes('Why NPS looks low in Japan') ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '10_global_search.png') });

  // --- 19. Delete an asset with confirmation ---
  await page.goto(`${baseUrl}#assets/${episodeId}`);
  await page.waitForTimeout(400);
  const beforeCount = await page.$$eval('.asset-card', (els) => els.length);
  await page.click('.asset-card');
  await page.waitForTimeout(200);
  await page.click('#adDelete');
  await page.waitForTimeout(150);
  await page.click('#cfOk');
  await page.waitForTimeout(400);
  const afterCount = await page.$$eval('.asset-card', (els) => els.length);
  console.log('19. asset deleted after confirmation:', beforeCount, '->', afterCount, afterCount === beforeCount - 1 ? 'OK' : 'FAIL');

  console.log('HAD ERROR:', hadError);
  await browser.close();
  server.close();
  if (hadError) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
