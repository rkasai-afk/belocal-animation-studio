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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa10');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  const tplBtns = await page.$$('.tpl-btn');
  const tplLabels = await Promise.all(tplBtns.map(b => b.textContent()));
  await tplBtns[tplLabels.findIndex(l => l.includes('Blank canvas'))].click();
  await page.waitForTimeout(200);

  // --- 1. quick-add: default sample is a 5-generation linear chain ---
  await page.click('#addOrgChart');
  await page.waitForTimeout(200);
  const added = await page.evaluate(() => {
    const o = canvas.getActiveObject();
    return o ? { type: o.type, orgchart: o.data && o.data.orgchart, childCount: o.getObjects().length } : null;
  });
  // 5 named nodes -> 5 rects + 5 texts + 4 connector lines = 14
  console.log('1. quick-add result:', added, added && added.type === 'group' && added.orgchart && added.childCount === 14 ? 'OK' : 'FAIL');

  // --- 2. layers list shows a TREE badge ---
  const rowTexts = await page.$$eval('.layer-row', rows => rows.map(r => r.textContent));
  console.log('2. layer list entry:', rowTexts, rowTexts.some(t => t.includes('TREE')) ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '01_chain_added.png') });

  // --- 3. branching tree: parent correctly centered above its own children ---
  await page.evaluate(() => {
    const ta = document.querySelector('#propsBody textarea');
    ta.value = 'Grandparent\n  Parent A\n    Child A1\n    Child A2\n    Child A3\n  Parent B\n    Child B1';
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(200);
  const branch = await page.evaluate(() => {
    const root = parseOrgTree(document.querySelector('#propsBody textarea').value);
    layoutOrgTree(root, 190, 56, 24, 46);
    const parentA = root.children[0], parentB = root.children[1];
    const avgA = (parentA.children[0].cx + parentA.children[parentA.children.length - 1].cx) / 2;
    const avgB = parentB.children[0].cx; // single child, should sit exactly under it
    return {
      grandparentCentered: Math.abs(root.cx - (parentA.cx + parentB.cx) / 2) < 0.01,
      parentACentered: Math.abs(parentA.cx - avgA) < 0.01,
      parentBAboveOnlyChild: Math.abs(parentB.cx - avgB) < 0.01,
      childCount: canvas.getObjects()[0].getObjects().length, // 7 names * 2 + 6 connector lines = 20
    };
  });
  console.log('3. branching layout math:', branch,
    branch.grandparentCentered && branch.parentACentered && branch.parentBAboveOnlyChild && branch.childCount === 20 ? 'OK' : 'FAIL');
  await page.evaluate(() => { canvas.discardActiveObject(); canvas.requestRenderAll(); });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, '02_branching_tree.png') });

  // --- 4. color swatch edit ---
  await page.evaluate(() => { canvas.setActiveObject(canvas.getObjects()[0]); });
  await page.waitForTimeout(150);
  const swatches = await page.$$('#propsBody .swatch');
  await swatches[2].click();
  await page.waitForTimeout(200);
  const color = await page.evaluate(() => canvas.getActiveObject().data.orgchart.color);
  const pinCountAfterColor = await page.evaluate(() => canvas.getObjects().filter(o => o.data && o.data.orgchart).length);
  console.log('4. color changed:', color, '| tree object count:', pinCountAfterColor, pinCountAfterColor === 1 ? 'OK' : 'FAIL');

  // --- 5. save/load round trip ---
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download = await downloadPromise;
  const projPath = path.join(outDir, 'orgchart_scene.json');
  await download.saveAs(projPath);
  console.log('5. saved project:', fs.statSync(projPath).size, 'bytes');

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const fileInput = await page.$('#projectFile');
  await fileInput.setInputFiles(projPath);
  await page.waitForTimeout(1000);
  const reloaded = await page.evaluate(() => {
    const objs = canvas.getObjects().filter(o => o.data && o.data.orgchart);
    const o = objs[0];
    return o ? { count: objs.length, color: o.data.orgchart.color, childCount: o.getObjects().length, textStartsRight: o.data.orgchart.text.startsWith('Grandparent') } : null;
  });
  console.log('6. reloaded tree:', reloaded, reloaded && reloaded.count === 1 && reloaded.color === color && reloaded.childCount === 20 && reloaded.textStartsRight ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '03_after_reload.png') });

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
