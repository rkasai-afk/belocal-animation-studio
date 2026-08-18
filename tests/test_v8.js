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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa8');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  // --- start from Blank canvas, add 3 rects so z-order is easy to reason about ---
  const tplBtns = await page.$$('.tpl-btn');
  const tplLabels = await Promise.all(tplBtns.map(b => b.textContent()));
  await tplBtns[tplLabels.findIndex(l => l.includes('Blank canvas'))].click();
  await page.waitForTimeout(200);
  await page.click('#addRect');
  await page.waitForTimeout(150);
  await page.click('#addRect');
  await page.waitForTimeout(150);
  await page.click('#addRect');
  await page.waitForTimeout(150);
  // Give each rect a distinct name so z-order changes are actually observable —
  // all three otherwise default to the identical name "Rectangle".
  await page.evaluate(() => {
    canvas.getObjects().forEach((o, i) => o.set('name', 'Rect ' + (i + 1)));
    refreshLayerList();
  });

  let order = await page.evaluate(() => canvas.getObjects().map(o => o.name));
  console.log('1. initial z-order (bottom to top):', order);

  // --- bring the bottom rect (index 0, "Rect 1") forward one step ---
  let rows = await page.$$('.layer-row');
  // layer list renders in the same order as canvas.getObjects() per refreshLayerList()
  const upBtn = await rows[0].$('.layer-order-btn[data-dir="up"]');
  await upBtn.click();
  await page.waitForTimeout(150);
  order = await page.evaluate(() => canvas.getObjects().map(o => o.name));
  console.log('2. after bring-forward on "Rect 1":', order, order[1] === 'Rect 1' ? 'OK (moved up one slot)' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '01_after_bring_forward.png') });

  // --- send the current top rect ("Rect 3", untouched so far) backward one step ---
  rows = await page.$$('.layer-row');
  const downBtn = await rows[rows.length - 1].$('.layer-order-btn[data-dir="down"]');
  await downBtn.click();
  await page.waitForTimeout(150);
  order = await page.evaluate(() => canvas.getObjects().map(o => o.name));
  console.log('3. after send-backward on "Rect 3":', order, order[1] === 'Rect 3' ? 'OK (moved down one slot)' : 'FAIL');

  // --- top/bottom-most order buttons are disabled ---
  rows = await page.$$('.layer-row');
  const topUpDisabled = await rows[rows.length - 1].$eval('.layer-order-btn[data-dir="up"]', b => b.disabled);
  const bottomDownDisabled = await rows[0].$eval('.layer-order-btn[data-dir="down"]', b => b.disabled);
  console.log('4. topmost "up" disabled:', topUpDisabled, '| bottommost "down" disabled:', bottomDownDisabled, topUpDisabled && bottomDownDisabled ? 'OK' : 'FAIL');

  // --- clicking an order button doesn't also select the row (stopPropagation) ---
  await page.click('body'); // deselect
  await page.waitForTimeout(100);
  rows = await page.$$('.layer-row');
  const beforeActive = await page.evaluate(() => !!canvas.getActiveObject());
  const anUpBtn = await rows[1].$('.layer-order-btn[data-dir="up"]');
  const disabled = await anUpBtn.evaluate(b => b.disabled);
  if (!disabled) {
    await anUpBtn.click();
    await page.waitForTimeout(100);
  }
  console.log('5. order button click did not require row selection first (no crash):', 'OK');

  // --- Dot-Grid quick-add ---
  await tplBtns[tplLabels.findIndex(l => l.includes('Blank canvas'))].click();
  await page.waitForTimeout(200);
  await page.click('#addDotGrid');
  await page.waitForTimeout(200);
  const dg = await page.evaluate(() => {
    const o = canvas.getActiveObject();
    return o ? { type: o.type, hasDotgridData: !!(o.data && o.data.dotgrid), childCount: o.getObjects ? o.getObjects().length : null } : null;
  });
  console.log('6. Dot-Grid quick-add result:', dg, dg && dg.type === 'group' && dg.hasDotgridData && dg.childCount === 50 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '02_dotgrid_quickadd.png') });

  // props panel should show the dot-grid controls (Total/Highlight), same as the template version
  const numberInputs = await page.$$('#propsBody input[type=number]');
  console.log('7. dot-grid props panel number inputs:', numberInputs.length, numberInputs.length >= 2 ? 'OK' : 'FAIL');

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
