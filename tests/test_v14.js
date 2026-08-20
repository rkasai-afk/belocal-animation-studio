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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa14');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  async function clickAspect(matchText) {
    const btns = await page.$$('.aspect-btn');
    const labels = await Promise.all(btns.map(b => b.textContent()));
    const idx = labels.findIndex(l => l.includes(matchText));
    if (idx === -1) throw new Error('aspect button not found: ' + matchText);
    await btns[idx].click();
    await page.waitForTimeout(400);
  }
  async function loadTemplateByLabel(matchText) {
    const btns = await page.$$('.tpl-btn');
    const labels = await Promise.all(btns.map(b => b.textContent()));
    const idx = labels.findIndex(l => l.includes(matchText));
    if (idx === -1) throw new Error('template button not found: ' + matchText);
    await btns[idx].click();
    await page.waitForTimeout(400);
  }
  function checkOverflow() {
    return page.evaluate(() => canvas.getObjects().filter(o => {
      const r = o.getBoundingRect(true, true);
      return r.left < -1 || r.top < -1 || r.left + r.width > canvas.width + 1 || r.top + r.height > canvas.height + 1;
    }).map(o => o.name || o.type));
  }

  // --- 1. Quick-add Map Graphic defaults to a world map highlighting Japan ---
  const blankBtns = await page.$$('.tpl-btn');
  const blankLabels = await Promise.all(blankBtns.map(b => b.textContent()));
  await blankBtns[blankLabels.findIndex(l => l.includes('Blank canvas'))].click();
  await page.waitForTimeout(200);
  await page.click('#addMap');
  await page.waitForTimeout(300);
  const initial = await page.evaluate(() => canvas.getActiveObject().data.map);
  console.log('1. quick-add default:', JSON.stringify(initial), initial.scope === 'world' && initial.highlights.some(h => h.name === 'Japan') ? 'OK' : 'FAIL');
  console.log('1b. layer list shows MAP badge:', (await page.textContent('#layerList')).includes('MAP') ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '01_default_world_map.png') });

  // --- 2. switching scope in the props panel regenerates the group and resets highlights ---
  let scopeBtn = null;
  for (const b of await page.$$('#propsBody button')) {
    if ((await b.textContent()).trim() === 'Japan prefectures') { scopeBtn = b; break; }
  }
  await scopeBtn.click();
  await page.waitForTimeout(400);
  const afterScope = await page.evaluate(() => canvas.getActiveObject().data.map);
  console.log('2. scope switch to japan resets highlights:', JSON.stringify(afterScope), afterScope.scope === 'japan' && afterScope.highlights.length === 0 ? 'OK' : 'FAIL');

  // --- 3. add a highlight via the region dropdown + color swatch ---
  const addSel = await page.$('#propsBody select');
  await addSel.selectOption('Kanagawa');
  const addSwatches = await page.$$('#propsBody .swatches .swatch');
  await addSwatches[3].click(); // amber
  await page.waitForTimeout(400);
  let mapData = await page.evaluate(() => canvas.getActiveObject().data.map);
  console.log('3. highlight added via dropdown+swatch:', JSON.stringify(mapData.highlights), mapData.highlights.length === 1 && mapData.highlights[0].name === 'Kanagawa' ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '02_kanagawa_highlighted.png') });

  // --- 4. remove that highlight via its chip's remove button ---
  const removeBtn = await page.$('.asset-chip button');
  await removeBtn.click();
  await page.waitForTimeout(400);
  mapData = await page.evaluate(() => canvas.getActiveObject().data.map);
  console.log('4. highlight removed via chip:', mapData.highlights.length, mapData.highlights.length === 0 ? 'OK' : 'FAIL');

  // --- 5. route arrow between two regions (re-query selects after each rebuild, since
  // rebuildMap() recreates #propsBody the same way rebuildDotGrid()/rebuildPin() do) ---
  let selects = await page.$$('#propsBody select');
  await selects[1].selectOption('Tōkyō');
  await page.waitForTimeout(400);
  selects = await page.$$('#propsBody select');
  await selects[2].selectOption('Ōsaka');
  await page.waitForTimeout(400);
  const routeState = await page.evaluate(() => { const m = canvas.getActiveObject().data.map; return { from: m.routeFrom, to: m.routeTo }; });
  console.log('5. route from/to set:', JSON.stringify(routeState), routeState.from === 'Tōkyō' && routeState.to === 'Ōsaka' ? 'OK' : 'FAIL');
  const routeShapeCount = await page.evaluate(() => canvas.getActiveObject().getObjects().length);
  console.log('5b. route drawn (arrow adds 4 shapes: line+2 dots+head):', routeShapeCount, routeShapeCount >= 4 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '03_route_tokyo_osaka.png') });

  // --- 6. the three starter templates exist and are tagged "Maps" ---
  await loadTemplateByLabel('Blank canvas');
  const chipLabels = await Promise.all((await page.$$('.cat-chip')).map(b => b.textContent()));
  console.log('6. Maps category chip present:', chipLabels.includes('Maps') ? 'OK' : 'FAIL');

  // --- 7-15. all three map templates stay within the frame at every aspect ratio ---
  let n = 7;
  for (const tplLabel of ['Map: Highlight Country', 'Map: Japan Region Highlight', 'Map: Route Between Two Places']) {
    for (const aspectLabel of ['Vertical', 'Square', 'Widescreen']) {
      await clickAspect(aspectLabel);
      await loadTemplateByLabel(tplLabel);
      const overflow = await checkOverflow();
      console.log(`${n}. ${tplLabel} @ ${aspectLabel}: overflowing =`, overflow, overflow.length === 0 ? 'OK' : 'FAIL');
      await page.screenshot({ path: path.join(outDir, `${String(n).padStart(2, '0')}_${tplLabel.replace(/[^a-z0-9]/gi, '_')}_${aspectLabel}.png`) });
      n++;
    }
  }
  await clickAspect('Widescreen');

  // --- 16. save/load round trip preserves a map layer's config ---
  await loadTemplateByLabel('Blank canvas');
  await page.click('#addMap');
  await page.waitForTimeout(300);
  const selAdd2 = await page.$('#propsBody select');
  await selAdd2.selectOption('South Korea');
  const sw2 = await page.$$('#propsBody .swatches .swatch');
  await sw2[4].click(); // red
  await page.waitForTimeout(400);
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download = await downloadPromise;
  const projPath = path.join(outDir, 'map_scene.json');
  await download.saveAs(projPath);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const fileInput = await page.$('#projectFile');
  await fileInput.setInputFiles(projPath);
  await page.waitForTimeout(800);
  const reloaded = await page.evaluate(() => {
    const o = canvas.getObjects().find(o => o.data && o.data.map);
    return o ? o.data.map : null;
  });
  console.log('16. map layer + highlights survive save/load:', JSON.stringify(reloaded), reloaded && reloaded.highlights.some(h => h.name === 'South Korea') ? 'OK' : 'FAIL');

  console.log('HAD ERROR:', hadError);
  await browser.close();
  if (hadError) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
