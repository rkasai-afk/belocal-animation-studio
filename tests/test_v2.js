const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1350, height: 1300 }, acceptDownloads: true });
  const page = await context.newPage();
  let hadError = false;
  page.on('console', msg => { if (msg.type() === 'error') { console.log('CONSOLE ERROR:', msg.text()); hadError = true; } });
  page.on('pageerror', err => { console.log('PAGE ERROR:', err.message); hadError = true; });

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa2');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '01_initial_stat_template.png') });
  console.log('1. initial load ok');

  // switch to cards template
  const tplBtns = await page.$$('.tpl-btn');
  const labels = await Promise.all(tplBtns.map(b => b.textContent()));
  console.log('templates found:', labels);
  const cardsIdx = labels.findIndex(l => l.includes('Category Cards'));
  await tplBtns[cardsIdx].click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '02_cards_template.png') });
  console.log('2. cards template loaded');

  // select first layer in list and check props panel
  const firstLayerRow = await page.$('.layer-row');
  await firstLayerRow.click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, '03_layer_selected_props.png') });
  console.log('3. layer selected, props shown');

  // drag the selected object on canvas (simulate move)
  const canvasBox = await page.locator('#fcanvas').boundingBox();
  // click near center-top area where eyebrow text likely is, then drag it down
  const startX = canvasBox.x + canvasBox.width * 0.5;
  const startY = canvasBox.y + canvasBox.height * 0.16;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 60, startY + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, '04_after_drag.png') });
  console.log('4. drag attempted');

  // add a text layer, rect, circle
  await page.click('#addText');
  await page.click('#addRect');
  await page.click('#addCircle');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, '05_added_layers.png') });
  console.log('5. added text/rect/circle');

  // switch font preset
  const fontBtns = await page.$$('.font-preset');
  await fontBtns[1].click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, '06_font_switch.png') });
  console.log('6. font switched');

  // back to stat template for preview/record test
  const tplBtns2 = await page.$$('.tpl-btn');
  const labels2 = await Promise.all(tplBtns2.map(b => b.textContent()));
  const statIdx = labels2.findIndex(l => l.includes('Stat Reveal'));
  await tplBtns2[statIdx].click();
  await page.waitForTimeout(200);

  // preview
  await page.click('#btnPlay');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(outDir, '07_preview_mid.png') });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '08_preview_end.png') });
  console.log('7-8. preview mid/end captured');
  await page.waitForTimeout(1500); // let it return to edit

  // background image upload test
  // create a small test image
  const testImgPath = path.join(outDir, 'test_bg.png');
  if (!fs.existsSync(testImgPath)) {
    const { execSync } = require('child_process');
    execSync(`node -e "
      const {createCanvas} = require('canvas');
    " 2>/dev/null || true`);
  }
  // Use a simple 1x1 png via base64 write instead (avoids needing 'canvas' package)
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAFUlEQVR42mNk+M9QDwAB/wDNvrBixQAAAABJRU5ErkJggg==';
  fs.writeFileSync(testImgPath, Buffer.from(pngBase64, 'base64'));

  const bgFileInput = await page.$('#bgFile');
  await bgFileInput.setInputFiles(testImgPath);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, '09_bg_image.png') });
  console.log('9. background image added');

  // adjust opacity slider
  await page.fill('#bgOpacity', '30');
  await page.dispatchEvent('#bgOpacity', 'input');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, '10_bg_opacity_low.png') });
  console.log('10. bg opacity adjusted');

  // save project
  const downloadPromise1 = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download1 = await downloadPromise1;
  const projPath = path.join(outDir, 'saved_scene.json');
  await download1.saveAs(projPath);
  console.log('11. project saved:', fs.statSync(projPath).size, 'bytes');

  // record test
  const downloadPromise2 = page.waitForEvent('download', { timeout: 20000 });
  await page.click('#btnRecord');
  const download2 = await downloadPromise2;
  const recPath = path.join(outDir, 'recorded.webm');
  await download2.saveAs(recPath);
  console.log('12. recorded:', fs.statSync(recPath).size, 'bytes');

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
