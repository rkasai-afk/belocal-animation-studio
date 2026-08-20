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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa15');
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

  // ==========================================================================================
  // TemporalDataSource core (Phase 7) — pure math, tested directly, no template needed.
  // ==========================================================================================

  // --- 1-3. video time <-> data time mapping ---
  const timeMapping = await page.evaluate(() => {
    const src = createTemporalDataSource({ records: TEMPORAL_FIXTURES.fixtureIndex.records, timeField: 'year', entityField: 'region', valueField: 'value', videoStart: 1000, videoEnd: 5000 });
    return {
      atVideoStart: src.videoTimeToDataTime(1000), atVideoEnd: src.videoTimeToDataTime(5000),
      reverseAtDataStart: src.dataTimeToVideoTime(2000), reverseAtDataEnd: src.dataTimeToVideoTime(2020),
      dataStart: src.dataStart, dataEnd: src.dataEnd,
    };
  });
  console.log('1. video start maps to first data time (2000):', timeMapping.atVideoStart, timeMapping.atVideoStart === 2000 ? 'OK' : 'FAIL');
  console.log('2. video end maps to last data time (2020):', timeMapping.atVideoEnd, timeMapping.atVideoEnd === 2020 ? 'OK' : 'FAIL');
  console.log('3. dataTimeToVideoTime is the exact inverse of videoTimeToDataTime:', JSON.stringify(timeMapping),
    timeMapping.reverseAtDataStart === 1000 && timeMapping.reverseAtDataEnd === 5000 ? 'OK' : 'FAIL');

  // --- 4-5. observation boundaries: exact source values at actual observed data times ---
  const observed = await page.evaluate(() => {
    const src = createTemporalDataSource({ records: TEMPORAL_FIXTURES.fixtureIndex.records, timeField: 'year', entityField: 'region', valueField: 'value', videoStart: 0, videoEnd: 4000 });
    return { at2000: src.valueAt('Hokkaidō', 2000), at2010: src.valueAt('Hokkaidō', 2010), at2020: src.valueAt('Hokkaidō', 2020) };
  });
  console.log('4. exact observed values at real source rows (2000/2010/2020):', JSON.stringify(observed),
    observed.at2000.value === 100 && observed.at2000.observed === true &&
    observed.at2010.value === 91 && observed.at2010.observed === true &&
    observed.at2020.value === 82 && observed.at2020.observed === true ? 'OK' : 'FAIL');

  // --- 5. intermediate time: correctly interpolated, and explicitly marked NOT observed ---
  const interp = await page.evaluate(() => {
    const src = createTemporalDataSource({ records: TEMPORAL_FIXTURES.fixtureIndex.records, timeField: 'year', entityField: 'region', valueField: 'value', videoStart: 0, videoEnd: 4000 });
    return src.valueAt('Hokkaidō', 2002); // exactly 2/5 of the way from 2000 (100) to 2005 (96) -> 98.4
  });
  console.log('5. interpolated value between two real observations, explicitly marked not-observed:', JSON.stringify(interp),
    Math.abs(interp.value - 98.4) < 0.001 && interp.observed === false ? 'OK' : 'FAIL');

  // --- 6. reverse seeking: seeking backward to a data time gives the same result as seeking
  // forward to it — valueAt() has no memory of prior calls, matching the same determinism
  // property already verified for the map's applyMapTimeline() ---
  const reverseSeek = await page.evaluate(() => {
    const src = createTemporalDataSource({ records: TEMPORAL_FIXTURES.fixtureIndex.records, timeField: 'year', entityField: 'region', valueField: 'value', videoStart: 0, videoEnd: 4000 });
    src.valueAt('Hokkaidō', 2018); // seek far forward first
    src.valueAt('Hokkaidō', 2003);
    const afterForwardThenBack = src.valueAt('Hokkaidō', 2012);
    const direct = src.valueAt('Hokkaidō', 2012);
    return { afterForwardThenBack, direct };
  });
  console.log('6. reverse/non-monotonic seeking reproduces the same value as a direct lookup:', JSON.stringify(reverseSeek),
    JSON.stringify(reverseSeek.afterForwardThenBack) === JSON.stringify(reverseSeek.direct) ? 'OK' : 'FAIL');

  // ==========================================================================================
  // Linked view proof (Phase 8) — the actual benchmark template, real playback
  // ==========================================================================================

  await loadTemplateByLabel('Temporal:');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, '01_static.png') });

  // --- 7. the map highlights the entity the line/stat are also tracking (Hokkaidō) ---
  const mapHighlight = await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    return obj.data.map.events.find(e => e.type === 'highlight').region;
  });
  console.log('7. MapView highlights the same entity LineView/StatView track:', mapHighlight, mapHighlight === 'Hokkaidō' ? 'OK' : 'FAIL');

  // --- 8-9. linked synchronization: at several different requested scene times, LineView's
  // current value and StatView's current value must agree exactly — proving they're reading
  // one consistent notion of "current data time" rather than two independently-drifting clocks ---
  await page.evaluate(() => captureBaseState());
  function readSync(t) {
    return page.evaluate((elapsed) => {
      applyFrame(elapsed);
      const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
      const stat = canvas.getObjects().find(o => o.data && o.data.temporalStat);
      return { lineText: line.data.temporalLine._runtime.valueLabel.text, statText: stat.data.temporalStat._runtime.valueText.text };
    }, t);
  }
  const results = [];
  for (const t of [1000, 2200, 3000, 3700, 5000]) results.push({ t, r: await readSync(t) });
  const allSynced = results.every(({ r }) => r.lineText === r.statText);
  console.log('8. LineView and StatView agree at every requested scene time:', JSON.stringify(results), allSynced ? 'OK' : 'FAIL');

  // --- 9. non-monotonic seek across the linked template lands on the same synchronized state
  // a direct render of that instant would — the same PLAYBACK CLOCK / SCENE EVALUATOR property
  // already verified for the map system, now verified for the temporal views too ---
  await readSync(4200); await readSync(1500); await readSync(3300);
  const afterNonMonotonic = await readSync(2200);
  const direct2200 = results.find(r => r.t === 2200).r;
  console.log('9. non-monotonic seek through the temporal views matches the direct-render value at 2200ms:',
    JSON.stringify(afterNonMonotonic), 'vs', JSON.stringify(direct2200),
    JSON.stringify(afterNonMonotonic) === JSON.stringify(direct2200) ? 'OK' : 'FAIL');

  // --- 10. the sequence actually plays and lands on the final observed value (82) at the end ---
  await page.click('#modeEdit');
  await page.evaluate(() => {
    const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    canvas.setActiveObject(line); canvas.requestRenderAll();
  });
  await page.click('#btnPlay');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, '02_mid_playback.png') });
  await page.waitForTimeout(3200);
  const finalState = await page.evaluate(() => {
    const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    return line.data.temporalLine._runtime.valueLabel.text;
  });
  console.log('10. sequence plays through and settles on the final observed value (82 idx):', finalState, finalState === '82 idx' ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '03_settled.png') });
  await page.click('#modeEdit');
  await page.waitForTimeout(200);

  // --- 11-19. Temporal Linked View benchmark stays within frame at every aspect ratio ---
  let n = 11;
  for (const aspectLabel of ['Vertical', 'Square', 'Widescreen']) {
    await clickAspect(aspectLabel);
    await loadTemplateByLabel('Temporal:');
    const overflow = await checkOverflow();
    console.log(`${n}. Temporal Linked View @ ${aspectLabel}: overflowing =`, overflow, overflow.length === 0 ? 'OK' : 'FAIL');
    await page.screenshot({ path: path.join(outDir, `${String(n).padStart(2, '0')}_${aspectLabel}.png`) });
    n++;
  }
  await clickAspect('Widescreen');

  // --- 14. save/load round trip preserves both new layer kinds' full config ---
  await loadTemplateByLabel('Temporal:');
  await page.waitForTimeout(300);
  const beforeSave = await page.evaluate(() => ({
    line: canvas.getObjects().find(o => o.data && o.data.temporalLine).data.temporalLine,
    stat: canvas.getObjects().find(o => o.data && o.data.temporalStat).data.temporalStat,
  }));
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download = await downloadPromise;
  const projPath = path.join(outDir, 'temporal_scene.json');
  await download.saveAs(projPath);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const fileInput = await page.$('#projectFile');
  await fileInput.setInputFiles(projPath);
  await page.waitForTimeout(800);
  const reloaded = await page.evaluate(() => {
    const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    const stat = canvas.getObjects().find(o => o.data && o.data.temporalStat);
    return { line: line ? { sourceId: line.data.temporalLine.sourceId, entity: line.data.temporalLine.entity } : null, stat: stat ? { sourceId: stat.data.temporalStat.sourceId, entity: stat.data.temporalStat.entity } : null };
  });
  console.log('14. temporalLine/temporalStat layers survive save/load:', JSON.stringify(reloaded),
    reloaded.line && reloaded.line.sourceId === beforeSave.line.sourceId && reloaded.line.entity === beforeSave.line.entity &&
    reloaded.stat && reloaded.stat.sourceId === beforeSave.stat.sourceId && reloaded.stat.entity === beforeSave.stat.entity ? 'OK' : 'FAIL');

  console.log('HAD ERROR:', hadError);
  await browser.close();
  if (hadError) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
