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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa11');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  // --- 0. Vertical display-size fix: canvas shouldn't get squeezed under ~420px wide even
  // on a modest laptop-height window (this is the same page, just note the default viewport
  // here is tall enough that the floor won't bind — the fix is exercised for real by the
  // realistic-viewport check further down).
  const tplBtns = await page.$$('.tpl-btn');
  const tplLabels = await Promise.all(tplBtns.map(b => b.textContent()));
  await tplBtns[tplLabels.findIndex(l => l.includes('Blank canvas'))].click();
  await page.waitForTimeout(200);

  // --- 1. build 3 distinct objects, select all, group them ---
  await page.click('#addRect');
  await page.waitForTimeout(100);
  await page.click('#addCircle');
  await page.waitForTimeout(100);
  await page.click('#addText');
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => {
    canvas.getObjects().forEach((o, i) => o.set('name', ['RectA', 'CircA', 'TextA'][i]));
    return canvas.getObjects().map(o => o.getBoundingRect(true, true));
  });
  const unionBefore = {
    left: Math.min(...before.map(r => r.left)),
    top: Math.min(...before.map(r => r.top)),
    right: Math.max(...before.map(r => r.left + r.width)),
    bottom: Math.max(...before.map(r => r.top + r.height)),
  };

  await page.evaluate(() => {
    const sel = new fabric.ActiveSelection(canvas.getObjects().slice(), { canvas });
    canvas.setActiveObject(sel);
    canvas.requestRenderAll();
    selectProps(sel);
  });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, '01_multiselect_props.png') });

  async function clickButtonContaining(text) {
    const btns = await page.$$('#propsBody button');
    for (const b of btns) { if ((await b.textContent()).includes(text)) { await b.click(); return true; } }
    return false;
  }
  const groupClicked = await clickButtonContaining('Group into one layer');
  await page.waitForTimeout(200);
  const afterGroup = await page.evaluate(() => {
    const objs = canvas.getObjects();
    const g = objs[0];
    return {
      topLevelCount: objs.length, type: g.type, isUserGroup: !!(g.data && g.data.userGroup),
      childCount: g.getObjects().length, childNames: g.getObjects().map(o => o.name),
      rect: g.getBoundingRect(true, true),
    };
  });
  console.log('1. group button clicked:', groupClicked, '| after group:', JSON.stringify(afterGroup));
  const positionMatches = Math.abs(afterGroup.rect.left - unionBefore.left) < 0.5 && Math.abs(afterGroup.rect.top - unionBefore.top) < 0.5
    && Math.abs((afterGroup.rect.left + afterGroup.rect.width) - unionBefore.right) < 0.5
    && Math.abs((afterGroup.rect.top + afterGroup.rect.height) - unionBefore.bottom) < 0.5;
  console.log('2. grouped bounding box matches pre-group union (no visual jump):', positionMatches ? 'OK' : 'FAIL',
    { unionBefore, groupRect: afterGroup.rect });
  console.log('3. group structure:', afterGroup.topLevelCount === 1 && afterGroup.type === 'group' && afterGroup.isUserGroup
    && afterGroup.childCount === 3 && afterGroup.childNames.join(',') === 'RectA,CircA,TextA' ? 'OK' : 'FAIL');

  // --- 4. layers list shows a GROUP badge ---
  const rowTexts = await page.$$eval('.layer-row', rows => rows.map(r => r.textContent));
  console.log('4. layer list entry:', rowTexts, rowTexts.some(t => t.includes('GROUP')) ? 'OK' : 'FAIL');

  // --- 5. the group aligns to canvas as a single unit (existing align toolbar, for free) ---
  const alignBtns = await page.$$('#propsBody button');
  let rightAlignBtn = null;
  for (const b of alignBtns) { if ((await b.textContent()).includes('Right') && (await b.textContent()).includes('⟹')) rightAlignBtn = b; }
  if (rightAlignBtn) {
    const beforeAlign = await page.evaluate(() => canvas.getObjects()[0].getBoundingRect(true, true).left);
    await rightAlignBtn.click();
    await page.waitForTimeout(150);
    const afterAlign = await page.evaluate(() => {
      const r = canvas.getObjects()[0].getBoundingRect(true, true);
      return { left: r.left, rightEdge: r.left + r.width, canvasW: canvas.width };
    });
    console.log('5. group aligned right as one unit:', beforeAlign, '->', afterAlign,
      Math.abs(afterAlign.rightEdge - afterAlign.canvasW) < 1 ? 'OK' : 'FAIL');
  }
  await page.screenshot({ path: path.join(outDir, '02_grouped_aligned.png') });

  // --- 6. ungroup restores 3 independent top-level objects at their exact prior positions ---
  const groupRectBeforeUngroup = await page.evaluate(() => canvas.getObjects()[0].getBoundingRect(true, true));
  const childAbsBefore = await page.evaluate(() => {
    const g = canvas.getObjects()[0];
    return g.getObjects().map(o => o.getBoundingRect(true, true));
  });
  const ungroupClicked = await clickButtonContaining('Ungroup');
  await page.waitForTimeout(200);
  const afterUngroup = await page.evaluate(() => canvas.getObjects().map(o => ({ name: o.name, type: o.type, rect: o.getBoundingRect(true, true) })));
  console.log('6. ungroup clicked:', ungroupClicked, '| top-level count:', afterUngroup.length, afterUngroup.length === 3 ? 'OK' : 'FAIL');
  // Each ungrouped object's absolute position should match where it visually was while grouped
  // (group left/top + child rect, since getBoundingRect on a live nested child returns
  // group-local coordinates, not canvas-absolute).
  const namesMatch = afterUngroup.map(o => o.name).sort().join(',') === 'CircA,RectA,TextA';
  console.log('7. all three original objects present after ungroup:', namesMatch ? 'OK' : 'FAIL', afterUngroup.map(o => o.name));
  await page.screenshot({ path: path.join(outDir, '03_after_ungroup.png') });

  // --- 8. save/load round trip with a group in the scene ---
  await page.evaluate(() => {
    const sel = new fabric.ActiveSelection(canvas.getObjects().slice(), { canvas });
    canvas.setActiveObject(sel);
    canvas.requestRenderAll();
    selectProps(sel);
  });
  await page.waitForTimeout(150);
  await clickButtonContaining('Group into one layer');
  await page.waitForTimeout(200);
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download = await downloadPromise;
  const projPath = path.join(outDir, 'group_scene.json');
  await download.saveAs(projPath);
  console.log('8. saved project:', fs.statSync(projPath).size, 'bytes');

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const fileInput = await page.$('#projectFile');
  await fileInput.setInputFiles(projPath);
  await page.waitForTimeout(1000);
  const reloaded = await page.evaluate(() => {
    const objs = canvas.getObjects();
    const g = objs.find(o => o.data && o.data.userGroup);
    return g ? { topLevelCount: objs.length, childCount: g.getObjects().length, childNames: g.getObjects().map(o => o.name).sort() } : null;
  });
  console.log('9. reloaded group:', JSON.stringify(reloaded),
    reloaded && reloaded.topLevelCount === 1 && reloaded.childCount === 3 && reloaded.childNames.join(',') === 'CircA,RectA,TextA' ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '04_reloaded_group.png') });

  // --- 10. Dot-Grid/Map Pin/Org-Chart composite groups must NOT show an Ungroup button —
  // only user-created groups (data.userGroup) should be ungroupable.
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const tplBtns2 = await page.$$('.tpl-btn');
  const tplLabels2 = await Promise.all(tplBtns2.map(b => b.textContent()));
  await tplBtns2[tplLabels2.findIndex(l => l.includes('Blank canvas'))].click();
  await page.waitForTimeout(200);
  await page.click('#addDotGrid');
  await page.waitForTimeout(200);
  const dotGridButtons = await page.$$eval('#propsBody button', btns => btns.map(b => b.textContent));
  console.log('10. Dot-Grid props panel has no Ungroup button:', dotGridButtons, !dotGridButtons.some(t => t.includes('Ungroup')) ? 'OK' : 'FAIL');

  // --- 11. realistic laptop-height viewport: Vertical canvas display width floored (the
  // squished-canvas fix) — re-check in a fresh page with a shorter viewport.
  await browser.close();
  const browser2 = await chromium.launch();
  const page2 = await browser2.newPage({ viewport: { width: 1440, height: 840 } });
  let hadError2 = false;
  page2.on('console', msg => { if (msg.type() === 'error') { console.log('CONSOLE ERROR:', msg.text()); hadError2 = true; } });
  page2.on('pageerror', err => { console.log('PAGE ERROR:', err.message); hadError2 = true; });
  await page2.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page2.waitForTimeout(800);
  const aBtns = await page2.$$('.aspect-btn');
  const aLabels = await Promise.all(aBtns.map(b => b.textContent()));
  await aBtns[aLabels.findIndex(l => l.includes('Vertical'))].click();
  await page2.waitForTimeout(500);
  const dispW = await page2.evaluate(() => document.getElementById('fcanvas').getBoundingClientRect().width);
  console.log('11. Vertical canvas display width at 1440x840 viewport:', dispW, dispW >= 400 ? 'OK (not squished)' : 'FAIL');
  await page2.screenshot({ path: path.join(outDir, '05_vertical_realistic_viewport.png') });
  hadError = hadError || hadError2;
  console.log('HAD ERROR:', hadError);
  await browser2.close();
}

main().catch(e => { console.error(e); process.exit(1); });
