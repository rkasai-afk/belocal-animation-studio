const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1400 }, acceptDownloads: true });
  const page = await context.newPage();
  let hadError = false;
  page.on('console', msg => { if (msg.type() === 'error') { console.log('CONSOLE ERROR:', msg.text()); hadError = true; } });
  page.on('pageerror', err => { console.log('PAGE ERROR:', err.message); hadError = true; });

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa12');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  // --- 1. transparent swatch present, and selecting it sets canvas.backgroundColor ---
  const swatches = await page.$$('#bgColorSwatches .swatch');
  console.log('1. background swatch count (4 colors + transparent):', swatches.length, swatches.length === 5 ? 'OK' : 'FAIL');
  await swatches[swatches.length - 1].click();
  await page.waitForTimeout(200);
  const bg = await page.evaluate(() => canvas.backgroundColor);
  console.log('2. canvas.backgroundColor after selecting transparent:', bg, bg === 'transparent' ? 'OK' : 'FAIL');

  // --- 3. the explanatory note appears only when transparent is selected ---
  const noteVisibleWhenTransparent = await page.evaluate(() => getComputedStyle(document.getElementById('bgTransparentNote')).display !== 'none');
  await page.evaluate(() => document.querySelector('#bgColorSwatches .swatch').click());
  await page.waitForTimeout(150);
  const noteHiddenWhenOpaque = await page.evaluate(() => getComputedStyle(document.getElementById('bgTransparentNote')).display === 'none');
  console.log('3. note visible only for transparent:', noteVisibleWhenTransparent, noteHiddenWhenOpaque, noteVisibleWhenTransparent && noteHiddenWhenOpaque ? 'OK' : 'FAIL');

  // --- 4. save/load round trip preserves transparent (a plain falsy-string bug would silently revert to navy) ---
  await page.evaluate(() => document.querySelectorAll('#bgColorSwatches .swatch')[4].click());
  await page.waitForTimeout(150);
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download = await downloadPromise;
  const projPath = path.join(outDir, 'transparent_scene.json');
  await download.saveAs(projPath);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const fileInput = await page.$('#projectFile');
  await fileInput.setInputFiles(projPath);
  await page.waitForTimeout(800);
  const reloadedBg = await page.evaluate(() => canvas.backgroundColor);
  console.log('4. transparent survives save/load round trip:', reloadedBg, reloadedBg === 'transparent' ? 'OK' : 'FAIL');

  // --- 5. the recorded WebM carries real, non-flattened alpha (empty area fully transparent) ---
  const tplBtns = await page.$$('.tpl-btn');
  const tplLabels = await Promise.all(tplBtns.map(b => b.textContent()));
  await tplBtns[tplLabels.findIndex(l => l.includes('Blank canvas'))].click();
  await page.waitForTimeout(200);
  await page.click('#addRect');
  await page.waitForTimeout(150);
  await page.evaluate(() => { canvas.getActiveObject().set({ left: 100, top: 100, fill: 'red', opacity: 1 }); canvas.getActiveObject().data.anim = { type: 'none', delay: 0, duration: 500 }; canvas.requestRenderAll(); });
  await page.evaluate(() => document.querySelectorAll('#bgColorSwatches .swatch')[4].click());
  await page.waitForTimeout(200);
  const downloadPromise2 = page.waitForEvent('download', { timeout: 20000 });
  await page.click('#btnRecord');
  const download2 = await downloadPromise2;
  const vidPath = path.join(outDir, 'transparent_recording.webm');
  await download2.saveAs(vidPath);
  console.log('5. recorded transparent webm:', fs.statSync(vidPath).size, 'bytes');

  const page2 = await context.newPage();
  await page2.goto('about:blank');
  const fileData = Array.from(fs.readFileSync(vidPath));
  const pixels = await page2.evaluate(async (fileData) => {
    const blob = new Blob([new Uint8Array(fileData)], { type: 'video/webm' });
    const video = document.createElement('video');
    video.src = URL.createObjectURL(blob); video.muted = true;
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = rej; video.load(); });
    await video.play().catch(() => {});
    await new Promise(r => setTimeout(r, 300));
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return {
      insideRect: Array.from(ctx.getImageData(250, 200, 1, 1).data),
      outsideRect: Array.from(ctx.getImageData(1800, 1000, 1, 1).data),
    };
  }, fileData);
  console.log('6. recorded pixel alpha — inside opaque red rect:', pixels.insideRect, '| outside (empty):', pixels.outsideRect,
    pixels.outsideRect[3] === 0 && pixels.insideRect[3] > 200 && pixels.insideRect[0] > 200 ? 'OK' : 'FAIL');
  await page2.close();

  // --- 7. the canvas frame has a visible outline independent of aspect ratio / background ---
  const outlineInfo = await page.evaluate(() => {
    const cc = document.querySelector('#stageWrap .canvas-container');
    const cs = getComputedStyle(cc);
    return { outline: cs.outlineStyle, boxShadow: cs.boxShadow !== 'none' };
  });
  console.log('7. canvas frame has its own outline/shadow:', JSON.stringify(outlineInfo), outlineInfo.outline !== 'none' && outlineInfo.boxShadow ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '01_frame_and_transparency.png') });

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
