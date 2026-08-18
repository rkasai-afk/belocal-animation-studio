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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa5');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  // renderAspectButtons() rebuilds the .aspect-btn DOM nodes on every click (to update the
  // active-state highlight), so cached ElementHandles go stale — always re-query by text.
  async function clickAspect(matchText) {
    const btns = await page.$$('.aspect-btn');
    const labels = await Promise.all(btns.map(b => b.textContent()));
    const idx = labels.findIndex(l => l.includes(matchText));
    if (idx === -1) throw new Error('aspect button not found: ' + matchText);
    await btns[idx].click();
    await page.waitForTimeout(400);
    return labels;
  }

  // --- 1. aspect buttons present, landscape is the default ---
  const initialBtns = await page.$$('.aspect-btn');
  const aspectLabels = await Promise.all(initialBtns.map(b => b.textContent()));
  console.log('aspect buttons found:', aspectLabels);
  console.log('1. found', aspectLabels.length, 'aspect buttons', aspectLabels.length === 3 ? 'OK' : 'FAIL');

  let dims = await page.evaluate(() => ({ w: canvas.width, h: canvas.height }));
  console.log('2. default dims:', dims, dims.w === 1920 && dims.h === 1080 ? 'OK (landscape)' : 'FAIL');

  // --- 3. switch to vertical, verify backing-store size and a screenshot ---
  await clickAspect('Vertical');
  dims = await page.evaluate(() => ({ w: canvas.width, h: canvas.height }));
  console.log('3. vertical dims:', dims, dims.w === 1080 && dims.h === 1920 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '01_vertical_stat.png') });
  // NOTE: templates aren't aspect-aware yet (that's PR-2a/2b) so objects are expected to
  // overflow a 1080-wide frame here — no bounding-box assertion in this PR, just confirming
  // the canvas itself actually resized and nothing crashed.

  // --- 4. switch to square ---
  await clickAspect('Square');
  dims = await page.evaluate(() => ({ w: canvas.width, h: canvas.height }));
  console.log('4. square dims:', dims, dims.w === 1080 && dims.h === 1080 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '02_square_stat.png') });

  // --- 5. back to landscape ---
  await clickAspect('Widescreen');
  dims = await page.evaluate(() => ({ w: canvas.width, h: canvas.height }));
  console.log('5. landscape dims:', dims, dims.w === 1920 && dims.h === 1080 ? 'OK' : 'FAIL');

  // --- 6. W/H-relative templates (Stat Reveal, Checklist Reveal, Dot-Grid) must stay fully
  // within the frame at every aspect ratio — these three were converted to relative layout
  // math in this PR, so unlike step 3 above, overflow here IS a real regression.
  async function loadTemplateByLabel(matchText) {
    const btns = await page.$$('.tpl-btn');
    const labels = await Promise.all(btns.map(b => b.textContent()));
    const idx = labels.findIndex(l => l.includes(matchText));
    if (idx === -1) throw new Error('template button not found: ' + matchText);
    await btns[idx].click();
    await page.waitForTimeout(300);
  }
  async function checkOverflow(label) {
    return page.evaluate(() => {
      return canvas.getObjects().filter(o => {
        const r = o.getBoundingRect(true, true);
        return r.left < -1 || r.top < -1 || r.left + r.width > canvas.width + 1 || r.top + r.height > canvas.height + 1;
      }).map(o => o.name || o.type);
    });
  }
  let n = 7;
  for (const tplLabel of ['Stat Reveal', 'Checklist Reveal', 'Dot-Grid Pictogram', 'Category Cards', 'Before / After', 'Process Flow']) {
    for (const aspectLabel of ['Vertical', 'Square', 'Widescreen']) {
      await clickAspect(aspectLabel);
      await loadTemplateByLabel(tplLabel);
      const overflow = await checkOverflow();
      console.log(`${n}. ${tplLabel} @ ${aspectLabel}: overflowing =`, overflow, overflow.length === 0 ? 'OK' : 'FAIL');
      await page.screenshot({ path: path.join(outDir, `${String(n).padStart(2,'0')}_${tplLabel.replace(/[^a-z0-9]/gi,'_')}_${aspectLabel}.png`) });
      n++;
    }
  }
  await clickAspect('Widescreen');

  // --- blank canvas + manual layer survives an aspect switch (not wiped) ---
  const tplBtns = await page.$$('.tpl-btn');
  const tplLabels = await Promise.all(tplBtns.map(b => b.textContent()));
  const blankIdx = tplLabels.findIndex(l => l.includes('Blank canvas'));
  await tplBtns[blankIdx].click();
  await page.waitForTimeout(300);
  await page.click('#addText');
  await page.waitForTimeout(200);
  const beforeCount = await page.evaluate(() => canvas.getObjects().length);
  await clickAspect('Vertical');
  const afterCount = await page.evaluate(() => canvas.getObjects().length);
  console.log(`${n}. blank-canvas manual layer count before/after aspect switch:`, beforeCount, afterCount, beforeCount === afterCount && afterCount > 0 ? 'OK (preserved)' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '03_blank_manual_after_switch.png') });

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
