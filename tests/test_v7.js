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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa7');
  fs.mkdirSync(outDir, { recursive: true });

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1000);

  // --- 1. category chips present, "All" shows every template ---
  const chipBtns = await page.$$('.cat-chip');
  const chipLabels = await Promise.all(chipBtns.map(b => b.textContent()));
  console.log('category chips found:', chipLabels);
  console.log('1. chips include All + 6 categories:', chipLabels.length === 7 ? 'OK' : 'FAIL');

  const allTplBtns = await page.$$('#templateGrid .tpl-btn');
  console.log('2. "All" shows all 14 templates:', allTplBtns.length, allTplBtns.length === 14 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '01_all_templates.png') });

  // --- 3. filtering by a category narrows the grid, and loading a template from it still works ---
  const statsIdx = chipLabels.findIndex(l => l.includes('Stats & Data'));
  await chipBtns[statsIdx].click();
  await page.waitForTimeout(200);
  const filteredBtns = await page.$$('#templateGrid .tpl-btn');
  const filteredLabels = await Promise.all(filteredBtns.map(b => b.textContent()));
  console.log('3. "Stats & Data" filtered list:', filteredLabels, filteredLabels.length === 2 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '02_stats_filtered.png') });

  await filteredBtns[filteredLabels.findIndex(l => l.includes('Dot-Grid'))].click();
  await page.waitForTimeout(300);
  const loaded = await page.evaluate(() => canvas.getObjects().some(o => o.data && o.data.dotgrid));
  console.log('4. loaded Dot-Grid from filtered grid:', loaded ? 'OK' : 'FAIL');

  // --- 5. back to "All" restores the full list ---
  const chipBtns2 = await page.$$('.cat-chip');
  const chipLabels2 = await Promise.all(chipBtns2.map(b => b.textContent()));
  await chipBtns2[chipLabels2.findIndex(l => l === 'All')].click();
  await page.waitForTimeout(200);
  const restoredBtns = await page.$$('#templateGrid .tpl-btn');
  console.log('5. back to All restores full list:', restoredBtns.length, restoredBtns.length === 14 ? 'OK' : 'FAIL');

  console.log('HAD ERROR:', hadError);
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
