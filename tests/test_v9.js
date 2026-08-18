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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa9');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  const tplBtns = await page.$$('.tpl-btn');
  const tplLabels = await Promise.all(tplBtns.map(b => b.textContent()));
  await tplBtns[tplLabels.findIndex(l => l.includes('Blank canvas'))].click();
  await page.waitForTimeout(200);

  // --- 1. quick-add produces a single group object with pin data ---
  await page.click('#addPin');
  await page.waitForTimeout(200);
  const added = await page.evaluate(() => {
    const o = canvas.getActiveObject();
    return o ? { type: o.type, pin: o.data && o.data.pin, childCount: o.getObjects().length } : null;
  });
  console.log('1. quick-add result:', added, added && added.type === 'group' && added.pin && added.childCount === 4 ? 'OK' : 'FAIL');

  // --- 2. layers list shows a PIN badge ---
  const rowTexts = await page.$$eval('.layer-row', rows => rows.map(r => r.textContent));
  console.log('2. layer list entry:', rowTexts, rowTexts.some(t => t.includes('PIN')) ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '01_pin_added.png') });

  // --- 3. props panel: edit label ---
  // NOTE: deliberately not using ElementHandle.fill() + a separate dispatchEvent('change') —
  // together they fire the 'change' listener twice against this rebuild-in-place control
  // (rebuildPin swaps in a whole new object, unlike a plain textbox's in-place .set()), and
  // the second call lands on a stale closure bound to the already-removed old object, silently
  // leaving an orphaned duplicate. A single native dispatch avoids that entirely.
  await page.evaluate(() => {
    const inp = document.querySelector('#propsBody input[type=text]');
    inp.value = 'Kyoto Station';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  let label = await page.evaluate(() => canvas.getActiveObject().data.pin.label);
  let pinCount = await page.evaluate(() => canvas.getObjects().filter(o => o.data && o.data.pin).length);
  console.log('3. label edited:', label, '| pin object count:', pinCount, label === 'Kyoto Station' && pinCount === 1 ? 'OK' : 'FAIL');

  // --- 4. props panel: switch marker shape to Dot, then back to Pin ---
  async function clickShapeButton(text) {
    const btns = await page.$$('#propsBody button');
    for (const b of btns) { if ((await b.textContent()) === text) { await b.click(); return true; } }
    return false;
  }
  await clickShapeButton('Dot');
  await page.waitForTimeout(200);
  let style = await page.evaluate(() => canvas.getActiveObject().data.pin.style);
  let childCountDot = await page.evaluate(() => canvas.getActiveObject().getObjects().length);
  console.log('4. switched to Dot style:', style, 'children:', childCountDot, style === 'dot' && childCountDot === 3 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '02_pin_dot_style.png') });

  await clickShapeButton('Pin');
  await page.waitForTimeout(200);
  style = await page.evaluate(() => canvas.getActiveObject().data.pin.style);
  let childCountPin = await page.evaluate(() => canvas.getActiveObject().getObjects().length);
  console.log('5. switched back to Pin style:', style, 'children:', childCountPin, style === 'pin' && childCountPin === 4 ? 'OK' : 'FAIL');

  // --- 6. props panel: change color ---
  const swatches = await page.$$('#propsBody .swatch');
  await swatches[1].click();
  await page.waitForTimeout(200);
  const color = await page.evaluate(() => canvas.getActiveObject().data.pin.color);
  console.log('6. color changed:', color);

  // --- 7. edited pin survives being moved (transform preserved across rebuild) ---
  const posBefore = await page.evaluate(() => { const o = canvas.getActiveObject(); return { left:o.left, top:o.top }; });
  await page.evaluate(() => { canvas.getActiveObject().set({ left: 500, top: 300 }); canvas.getActiveObject().setCoords(); });
  await clickShapeButton('Dot');
  await page.waitForTimeout(200);
  const posAfter = await page.evaluate(() => { const o = canvas.getActiveObject(); return { left:o.left, top:o.top }; });
  console.log('7. position preserved across rebuild:', posBefore, '->', posAfter, posAfter.left === 500 && posAfter.top === 300 ? 'OK' : 'FAIL');

  // --- 8. save/load round trip ---
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download = await downloadPromise;
  const projPath = path.join(outDir, 'pin_scene.json');
  await download.saveAs(projPath);
  console.log('8. saved project:', fs.statSync(projPath).size, 'bytes');

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const fileInput = await page.$('#projectFile');
  await fileInput.setInputFiles(projPath);
  await page.waitForTimeout(1000);
  const reloadedPinCount = await page.evaluate(() => canvas.getObjects().filter(o => o.data && o.data.pin).length);
  const reloaded = await page.evaluate(() => {
    const o = canvas.getObjects().find(x => x.data && x.data.pin);
    return o ? { type: o.type, pin: o.data.pin, childCount: o.getObjects().length, left: o.left, top: o.top } : null;
  });
  console.log('9. reloaded pin:', reloaded, '| pin object count:', reloadedPinCount,
    reloaded && reloadedPinCount === 1 && reloaded.pin.label === 'Kyoto Station' && reloaded.pin.style === 'dot'
      && reloaded.left === 500 && reloaded.top === 300 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '03_pin_after_reload.png') });

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
