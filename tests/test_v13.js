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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa13');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  async function safeZoneButtons() {
    return page.$$eval('#safeZoneGrid button', btns => btns.map(b => ({ text: b.textContent, disabled: b.disabled, active: b.className.includes('active') })));
  }
  async function clickSafeZone(labelIncludes) {
    const btns = await page.$$('#safeZoneGrid button');
    const labels = await Promise.all(btns.map(b => b.textContent()));
    await btns[labels.findIndex(l => l.includes(labelIncludes))].click();
    await page.waitForTimeout(150);
  }
  async function clickAspect(labelIncludes) {
    const btns = await page.$$('.aspect-btn');
    const labels = await Promise.all(btns.map(b => b.textContent()));
    await btns[labels.findIndex(l => l.includes(labelIncludes))].click();
    await page.waitForTimeout(300);
  }

  // --- 1. default (Widescreen) — 4 chips (None + 3 platforms), only None enabled ---
  const landscapeBtns = await safeZoneButtons();
  console.log('1. chip count (None + 3 platforms):', landscapeBtns.length, landscapeBtns.length === 4 ? 'OK' : 'FAIL');
  const onlyNoneEnabled = landscapeBtns[0].text === 'None' && !landscapeBtns[0].disabled
    && landscapeBtns.slice(1).every(b => b.disabled);
  console.log('2. non-None chips disabled outside Vertical shape:', JSON.stringify(landscapeBtns), onlyNoneEnabled ? 'OK' : 'FAIL');

  // --- 3. switch to Vertical — all chips enabled ---
  await clickAspect('Vertical');
  const verticalBtns = await safeZoneButtons();
  console.log('3. all chips enabled in Vertical:', JSON.stringify(verticalBtns), verticalBtns.every(b => !b.disabled) ? 'OK' : 'FAIL');

  // --- 4. selecting each platform builds a 4-band overlay as a child of .canvas-container,
  // with the top band's height matching that platform's configured top fraction ---
  async function overlayInfo() {
    return page.evaluate(() => {
      const el = document.getElementById('safeZoneOverlay');
      const cc = document.querySelector('#stageWrap .canvas-container');
      return {
        parentIsCanvasContainer: el.parentElement === cc,
        display: getComputedStyle(el).display,
        bandCount: el.children.length,
        topBandHeightPct: el.children[0] ? parseFloat(el.children[0].style.height) : null,
      };
    });
  }
  await clickSafeZone('TikTok');
  const tiktok = await overlayInfo();
  console.log('4. TikTok overlay:', JSON.stringify(tiktok), tiktok.parentIsCanvasContainer && tiktok.display === 'block' && tiktok.bandCount === 4 && Math.abs(tiktok.topBandHeightPct - 7.3) < 0.1 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '01_tiktok_overlay.png') });

  await clickSafeZone('Instagram Reels');
  const insta = await overlayInfo();
  console.log('5. Instagram Reels overlay top band %:', insta.topBandHeightPct, Math.abs(insta.topBandHeightPct - 11.7) < 0.1 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '02_instagram_overlay.png') });

  await clickSafeZone('YouTube Shorts');
  const yt = await overlayInfo();
  console.log('6. YouTube Shorts overlay top band %:', yt.topBandHeightPct, Math.abs(yt.topBandHeightPct - 19.8) < 0.1 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '03_youtube_overlay.png') });

  // --- 7. None hides the overlay ---
  await clickSafeZone('None');
  const none = await overlayInfo();
  console.log('7. None hides overlay:', none.display, none.display === 'none' ? 'OK' : 'FAIL');

  // --- 8. leaving Vertical resets selection to None and disables platform chips again ---
  await clickSafeZone('TikTok');
  await clickAspect('Square');
  const afterSquare = await safeZoneButtons();
  const resetOk = afterSquare[0].active && afterSquare.slice(1).every(b => b.disabled && !b.active);
  console.log('8. leaving Vertical resets to None + disables platform chips:', JSON.stringify(afterSquare), resetOk ? 'OK' : 'FAIL');
  const overlayAfterSquare = await overlayInfo();
  console.log('9. overlay hidden after leaving Vertical:', overlayAfterSquare.display, overlayAfterSquare.display === 'none' ? 'OK' : 'FAIL');

  // --- 10. the overlay is a DOM guide only — never baked into recorded video output ---
  await clickAspect('Vertical');
  const tplBtns = await page.$$('.tpl-btn');
  const tplLabels = await Promise.all(tplBtns.map(b => b.textContent()));
  await tplBtns[tplLabels.findIndex(l => l.includes('Blank canvas'))].click();
  await page.waitForTimeout(200);
  await page.evaluate(() => { canvas.backgroundColor = '#1F3864'; canvas.requestRenderAll(); });
  await clickSafeZone('TikTok');
  await page.waitForTimeout(200);
  const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
  await page.click('#btnRecord');
  const download = await downloadPromise;
  const vidPath = path.join(outDir, 'safezone_recording.webm');
  await download.saveAs(vidPath);
  console.log('10. recorded webm with safe zone guide active:', fs.statSync(vidPath).size, 'bytes');

  const page2 = await context.newPage();
  await page2.goto('about:blank');
  const fileData = Array.from(fs.readFileSync(vidPath));
  const pixel = await page2.evaluate(async (fileData) => {
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
    // TikTok's top band covers roughly the top 7.3% (~140px of 1920) — sample well inside it.
    return Array.from(ctx.getImageData(540, 50, 1, 1).data);
  }, fileData);
  // Plain navy background (#1F3864 = rgb(31,56,100)) — no pink safe-zone tint blended in,
  // since the overlay is a DOM element outside the captured canvas stream.
  const noTintBaked = Math.abs(pixel[0] - 31) < 25 && Math.abs(pixel[1] - 56) < 25 && Math.abs(pixel[2] - 100) < 25;
  console.log('11. recorded pixel inside safe-zone band shows plain background, no baked-in tint:', pixel, noTintBaked ? 'OK' : 'FAIL');
  await page2.close();

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
