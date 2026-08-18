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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa4');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  const tplBtns = await page.$$('.tpl-btn');
  const labels = await Promise.all(tplBtns.map(b => b.textContent()));
  console.log('templates:', labels);

  // --- DOT-GRID ---
  const dgIdx = labels.findIndex(l => l.includes('Dot-Grid'));
  await tplBtns[dgIdx].click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '01_dotgrid_edit.png') });
  console.log('1. dotgrid template loaded');

  // click preview to see animation mid-way
  await page.click('#btnPlay');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, '02_dotgrid_preview_mid.png') });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: path.join(outDir, '03_dotgrid_preview_end.png') });
  await page.waitForTimeout(1500); // let it return to edit
  console.log('2-3. dotgrid preview captured');

  // select the dot-grid layer, verify it's one object, edit total/highlight
  const layerRows = await page.$$('.layer-row');
  const rowTexts = await Promise.all(layerRows.map(r => r.textContent()));
  console.log('layers:', rowTexts);
  const dotsIdx = rowTexts.findIndex(t => t.includes('DOTS'));
  await layerRows[dotsIdx].click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, '04_dotgrid_selected.png') });
  const objType = await page.evaluate(() => canvas.getActiveObject().type);
  console.log('4. dotgrid object type:', objType, objType === 'group' ? 'OK (single group object)' : 'CHECK');

  const totalInputs = await page.$$('#propsBody input[type=number]');
  console.log('number inputs on dotgrid props:', totalInputs.length);
  await totalInputs[0].fill('120');
  await totalInputs[0].dispatchEvent('change');
  await page.waitForTimeout(300);
  await totalInputs[1] ? null : null;
  const afterEdit = await page.evaluate(() => {
    const o = canvas.getActiveObject();
    return { total: o.data.dotgrid.total, childCount: o.getObjects().length, type: o.type };
  });
  console.log('5. after editing total to 120:', afterEdit, afterEdit.total===120 && afterEdit.childCount===120 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '05_dotgrid_edited.png') });

  // --- BEFORE/AFTER ---
  const cmpIdx = labels.findIndex(l => l.includes('Before'));
  await tplBtns[cmpIdx].click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '06_compare_edit.png') });
  await page.click('#btnPlay');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: path.join(outDir, '07_compare_preview_mid.png') });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, '08_compare_preview_end.png') });
  await page.waitForTimeout(1500);
  console.log('6-8. compare template captured');

  // --- PROCESS FLOW ---
  const flowIdx = labels.findIndex(l => l.includes('Process Flow'));
  await tplBtns[flowIdx].click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '09_flow_edit.png') });
  await page.click('#btnPlay');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, '10_flow_preview_mid.png') });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, '11_flow_preview_end.png') });
  await page.waitForTimeout(1500);
  console.log('9-11. flow template captured');

  // --- SAVE/LOAD ROUND TRIP with dotgrid template (verify group persists) ---
  await tplBtns[dgIdx].click();
  await page.waitForTimeout(300);
  const downloadPromise1 = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download1 = await downloadPromise1;
  const projPath = path.join(outDir, 'dotgrid_scene.json');
  await download1.saveAs(projPath);
  console.log('12. saved dotgrid project:', fs.statSync(projPath).size, 'bytes');

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const fileInput = await page.$('#projectFile');
  await fileInput.setInputFiles(projPath);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '12_dotgrid_after_load.png') });
  const reloadedInfo = await page.evaluate(() => {
    const dotsObj = canvas.getObjects().find(o => o.data && o.data.dotgrid);
    return dotsObj ? { type: dotsObj.type, total: dotsObj.data.dotgrid.total, childCount: dotsObj.getObjects().length } : null;
  });
  console.log('13. reloaded dotgrid:', reloadedInfo, reloadedInfo && reloadedInfo.childCount === reloadedInfo.total ? 'OK' : 'CHECK');

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
