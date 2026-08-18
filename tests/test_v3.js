const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 1400 }, acceptDownloads: true });
  const page = await context.newPage();
  let hadError = false;
  page.on('console', msg => { if (msg.type() === 'error') { console.log('CONSOLE ERROR:', msg.text()); hadError = true; } });
  page.on('pageerror', err => { console.log('PAGE ERROR:', err.message); hadError = true; });

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa3');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(outDir, '01_initial.png') });
  console.log('1. initial load ok');

  // --- ALIGN TO CANVAS: select a single text layer, note position, click "Right" align, verify it moved ---
  const firstLayerRow = await page.$('.layer-row');
  await firstLayerRow.click();
  await page.waitForTimeout(200);
  const beforeLeft = await page.evaluate(() => canvas.getActiveObject().left);
  await page.screenshot({ path: path.join(outDir, '02_layer_selected.png') });

  // click the "Right" align-to-canvas button (row1 3rd button in first row2 after divider)
  const alignButtons = await page.$$('#propsBody button.ghost');
  const alignLabels = await Promise.all(alignButtons.map(b => b.textContent()));
  console.log('align buttons found:', alignLabels);
  const rightIdx = alignLabels.findIndex(l => l.includes('Right') && l.includes('⟹'));
  await alignButtons[rightIdx].click();
  await page.waitForTimeout(200);
  const afterLeft = await page.evaluate(() => canvas.getActiveObject().left);
  console.log('2. align-right: before left=', beforeLeft, 'after left=', afterLeft, afterLeft > beforeLeft ? 'MOVED RIGHT (ok)' : 'DID NOT MOVE (FAIL)');
  await page.screenshot({ path: path.join(outDir, '03_after_align_right.png') });

  // align center H
  const centerIdx = alignLabels.findIndex(l => l.includes('Center') && l.includes('↔'));
  await alignButtons[centerIdx].click();
  await page.waitForTimeout(200);
  const centerLeftResult = await page.evaluate(() => {
    const o = canvas.getActiveObject();
    const r = o.getBoundingRect(true, true);
    return { left: r.left, width: r.width, canvasW: 1920 };
  });
  const expectedCenterLeft = (centerLeftResult.canvasW - centerLeftResult.width) / 2;
  console.log('3. align-center-h: rect.left=', centerLeftResult.left, 'expected=', expectedCenterLeft, Math.abs(centerLeftResult.left - expectedCenterLeft) < 1 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '04_after_align_center.png') });

  // --- DURATION FIELD: verify present and editable ---
  const durInputs = await page.$$('#propsBody input[type=number]');
  console.log('number inputs in props (fontSize, delay, duration expected):', durInputs.length);
  // last two number inputs should be delay/duration
  const delayInput = durInputs[durInputs.length - 2];
  const durationInput = durInputs[durInputs.length - 1];
  await durationInput.fill('900');
  await durationInput.dispatchEvent('input');
  const durVal = await page.evaluate(() => canvas.getActiveObject().data.anim.duration);
  console.log('4. duration set to 900, actual=', durVal, durVal === 900 ? 'OK' : 'FAIL');

  // --- TEXT ALIGN buttons ---
  const taButtons = await page.$$('#propsBody button.small');
  const taLabels = await Promise.all(taButtons.map(b => b.textContent()));
  const centerTA = taLabels.findIndex(l => l.trim() === 'Center');
  if (centerTA >= 0) {
    await taButtons[centerTA].click();
    await page.waitForTimeout(150);
    const ta = await page.evaluate(() => canvas.getActiveObject().textAlign);
    console.log('5. textAlign set via button, actual=', ta, ta === 'center' ? 'OK' : 'FAIL');
  } else {
    console.log('5. FAIL - could not find text-align Center button');
  }
  await page.screenshot({ path: path.join(outDir, '05_textalign.png') });

  // --- FONT FAMILY DROPDOWN present ---
  const fontSelect = await page.$('#propsBody select');
  const selects = await page.$$('#propsBody select');
  console.log('selects found (should be 2: anim type + font family):', selects.length);

  // --- MULTI-SELECT ALIGN TO EACH OTHER ---
  // switch to cards template which has many similar layers
  const tplBtns = await page.$$('.tpl-btn');
  const labels = await Promise.all(tplBtns.map(b => b.textContent()));
  const cardsIdx = labels.findIndex(l => l.includes('Category Cards'));
  await tplBtns[cardsIdx].click();
  await page.waitForTimeout(300);

  // rubber-band select a region covering multiple cards
  const canvasBox = await page.locator('#fcanvas').boundingBox();
  await page.mouse.move(canvasBox.x + canvasBox.width*0.05, canvasBox.y + canvasBox.height*0.30);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width*0.95, canvasBox.y + canvasBox.height*0.70, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '06_multiselect.png') });
  const selCount = await page.evaluate(() => {
    const o = canvas.getActiveObject();
    return o && (o.type === 'activeSelection' || o.type === 'activeselection') ? o.getObjects().length : 0;
  });
  console.log('6. multi-select count=', selCount);

  if (selCount >= 2) {
    const eachOtherButtons = await page.$$('#propsBody button.ghost');
    const eoLabels = await Promise.all(eachOtherButtons.map(b => b.textContent()));
    console.log('each-other buttons:', eoLabels);
    const topEdgesIdx = eoLabels.lastIndexOf('Top edges');
    if (topEdgesIdx >= 0) {
      const beforeTops = await page.evaluate(() => canvas.getActiveObject().getObjects().map(o => o.getBoundingRect(true,true).top));
      await eachOtherButtons[topEdgesIdx].click();
      await page.waitForTimeout(200);
      const afterTops = await page.evaluate(() => canvas.getActiveObject().getObjects().map(o => o.getBoundingRect(true,true).top));
      console.log('7. align top-edges: before=', beforeTops, 'after=', afterTops);
      const allEqual = afterTops.every(t => Math.abs(t - afterTops[0]) < 1.5);
      console.log('   all tops equal after align:', allEqual ? 'OK' : 'FAIL');
    } else {
      console.log('7. FAIL - could not find Top edges button');
    }
  }
  await page.screenshot({ path: path.join(outDir, '07_after_align_each_other.png') });

  // --- TIMELINE SCRUBBER ---
  await tplBtns[labels.findIndex(l => l.includes('Stat Reveal'))].click();
  await page.waitForTimeout(300);
  const scrubMax = await page.evaluate(() => document.getElementById('timelineScrub').max);
  console.log('8. scrub max=', scrubMax);
  const scrubEl = page.locator('#timelineScrub');
  const box = await scrubEl.boundingBox();
  await page.mouse.move(box.x + 4, box.y + box.height/2);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(box.x + box.width*0.5, box.y + box.height/2, { steps: 8 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(outDir, '08_scrub_mid.png') });
  const midOpacities = await page.evaluate(() => canvas.getObjects().filter(o=>o.data).map(o=>o.opacity));
  console.log('9. mid-scrub opacities sample:', midOpacities.slice(0,4), midOpacities.some(o=>o>0 && o<1) || midOpacities.some(o=>o===0) ? 'ANIMATING (ok)' : 'NOT CHANGING (check)');
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '09_after_scrub_release.png') });
  const canEditAfterScrub = await page.evaluate(() => canvas.getObjects()[1] ? canvas.getObjects()[1].selectable : null);
  console.log('10. interactive restored after scrub release, selectable=', canEditAfterScrub);

  // --- FONT IMPORT ---
  // build a minimal valid woff2/ttf-like file won't actually parse as font, so instead download a real small font from local fontsource cache if available, else generate one via fonttools if present.
  let testFontPath = null;
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  ];
  for (const c of candidates) { if (fs.existsSync(c)) { testFontPath = c; break; } }
  if (!testFontPath) {
    // search filesystem broadly
    try {
      const { execSync } = require('child_process');
      const found = execSync("find /usr/share/fonts -name '*.ttf' 2>/dev/null | head -1").toString().trim();
      if (found) testFontPath = found;
    } catch(e) {}
  }
  console.log('font test file:', testFontPath);
  if (testFontPath) {
    const destPath = path.join(outDir, 'TestFont.ttf');
    fs.copyFileSync(testFontPath, destPath);
    const fontFileInput = await page.$('#fontFile');
    await fontFileInput.setInputFiles(destPath);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, '10_font_imported.png') });
    const fontListText = await page.textContent('#customFontList');
    console.log('11. custom font list text:', fontListText);

    // select a text layer, check font family dropdown includes the custom font, select it
    const layerRows = await page.$$('.layer-row');
    await layerRows[0].click();
    await page.waitForTimeout(200);
    const selects2 = await page.$$('#propsBody select');
    // font family select is the 2nd select (after anim type) for textbox; find by checking options include 'TestFont'
    let fontFamilySelect = null, testFontLabel = null;
    for (const s of selects2) {
      const opts = await s.$$eval('option', els => els.map(e => e.textContent));
      const match = opts.find(o => o.includes('TestFont'));
      if (match) { fontFamilySelect = s; testFontLabel = match; break; }
    }
    if (fontFamilySelect) {
      await fontFamilySelect.selectOption({ label: testFontLabel });
      await page.waitForTimeout(200);
      const appliedFont = await page.evaluate(() => canvas.getActiveObject().fontFamily);
      console.log('12. applied custom font family:', appliedFont, appliedFont === testFontLabel ? 'OK' : 'FAIL');
    } else {
      console.log('12. FAIL - custom font not found in font-family dropdown');
    }
    await page.screenshot({ path: path.join(outDir, '11_custom_font_applied.png') });
  } else {
    console.log('11. SKIPPED font import test - no system font file found for test upload');
  }

  // --- SAVE / LOAD ROUND TRIP (verify duration + custom font + alignment persist) ---
  const downloadPromise1 = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download1 = await downloadPromise1;
  const projPath = path.join(outDir, 'saved_scene.json');
  await download1.saveAs(projPath);
  const savedJson = JSON.parse(fs.readFileSync(projPath, 'utf8'));
  console.log('13. saved project version=', savedJson.version, 'customFonts count=', (savedJson.customFonts||[]).length, 'objects=', savedJson.objects.length);

  // reload page fresh, load the saved project, verify it restores duration/font
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const fileInput = await page.$('#projectFile');
  await fileInput.setInputFiles(projPath);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, '12_after_project_load.png') });
  const loadedCustomFonts = await page.evaluate(() => customFonts.length);
  console.log('14. after load, customFonts in memory=', loadedCustomFonts);

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
