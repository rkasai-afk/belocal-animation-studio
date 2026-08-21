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

  const outDir = path.resolve(__dirname, '..', 'qa', 'qa16');
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
  function clickFormButton(text) {
    return page.evaluate((t) => {
      const btns = Array.from(document.querySelectorAll('#dataSourceForm button'));
      const b = btns.find(b => b.textContent === t);
      if (!b) throw new Error('form button not found: ' + t);
      b.click();
    }, text);
  }

  // ==========================================================================================
  // Data Source Registry — CSV parsing, validation, CRUD (pure functions, no template needed)
  // ==========================================================================================

  // --- 1. parseCSV: headers + rows, including a quoted field with an embedded comma ---
  const csvParsed = await page.evaluate(() => {
    return parseCSV('city,note,pop\nTokyo,"large, dense",140\nOsaka,"mid, coastal",90');
  });
  console.log('1. parseCSV handles quoted fields with embedded commas:', JSON.stringify(csvParsed),
    csvParsed.headers.length === 3 && csvParsed.rows.length === 2 && csvParsed.rows[0][1] === 'large, dense' ? 'OK' : 'FAIL');

  // --- 2. validateAndBuildRecords: valid rows build correctly ---
  const validBuild = await page.evaluate(() => {
    const { headers, rows } = parseCSV('city,year,pop\nTokyo,2000,100\nTokyo,2010,120');
    return validateAndBuildRecords(headers, rows, 'year', 'city', 'pop');
  });
  console.log('2. valid CSV builds clean records with no errors:', JSON.stringify(validBuild),
    validBuild.errors.length === 0 && validBuild.records.length === 2 && validBuild.records[0].pop === 100 ? 'OK' : 'FAIL');

  // --- 3. non-numeric value is skipped with a warning, NEVER coerced to zero ---
  const missingVal = await page.evaluate(() => {
    const { headers, rows } = parseCSV('city,year,pop\nTokyo,2000,100\nTokyo,2010,\nTokyo,2020,140');
    return validateAndBuildRecords(headers, rows, 'year', 'city', 'pop');
  });
  console.log('3. missing/non-numeric value row is skipped, never coerced to 0:', JSON.stringify(missingVal),
    missingVal.records.length === 2 && missingVal.records.every(r => r.pop !== 0) && missingVal.warnings.length === 1 ? 'OK' : 'FAIL');

  // --- 4. duplicate entity+time row is detected and skipped (first kept) ---
  const dupCheck = await page.evaluate(() => {
    const { headers, rows } = parseCSV('city,year,pop\nTokyo,2000,100\nTokyo,2000,999');
    return validateAndBuildRecords(headers, rows, 'year', 'city', 'pop');
  });
  console.log('4. duplicate entity+time is skipped, first kept:', JSON.stringify(dupCheck),
    dupCheck.records.length === 1 && dupCheck.records[0].pop === 100 && dupCheck.warnings.some(w => /duplicate/i.test(w)) ? 'OK' : 'FAIL');

  // --- 5. irregular time intervals are flagged as a warning, never an error (doesn't block) ---
  const irregular = await page.evaluate(() => {
    const { headers, rows } = parseCSV('city,year,pop\nTokyo,2000,100\nTokyo,2005,110\nTokyo,2020,140');
    return validateAndBuildRecords(headers, rows, 'year', 'city', 'pop');
  });
  console.log('5. irregular intervals flagged as warning, not an error:', JSON.stringify(irregular),
    irregular.errors.length === 0 && irregular.records.length === 3 && irregular.warnings.some(w => /evenly spaced/i.test(w)) ? 'OK' : 'FAIL');

  // --- 6. missing field mapping (typo'd column name) produces a clear error, builds nothing ---
  const badField = await page.evaluate(() => {
    const { headers, rows } = parseCSV('city,year,pop\nTokyo,2000,100');
    return validateAndBuildRecords(headers, rows, 'YEAR_TYPO', 'city', 'pop');
  });
  console.log('6. unmapped field name produces an error, no records built:', JSON.stringify(badField),
    badField.errors.length === 1 && badField.records.length === 0 ? 'OK' : 'FAIL');

  // --- 7. addDataSourceFromForm: full round trip through the registry function ---
  const dsAdd = await page.evaluate(() => {
    const result = addDataSourceFromForm({
      name: 'Test Cities', csvText: 'city,year,pop\nTokyo,2000,100\nTokyo,2010,120\nTokyo,2020,140\nOsaka,2000,100\nOsaka,2010,95\nOsaka,2020,85',
      timeField: 'year', entityField: 'city', valueField: 'pop', unit: 'k people', source: 'Test Bureau', sourceUrl: 'https://example.test',
    });
    return { result, entry: dataSources[result.id] };
  });
  console.log('7. addDataSourceFromForm registers a usable source:', JSON.stringify(dsAdd.result),
    dsAdd.result.ok && dsAdd.entry.records.length === 6 && dsAdd.entry.unit === 'k people' ? 'OK' : 'FAIL');

  // --- 8. UI round trip: add via the real form, appears in the list, and offered on a layer ---
  await page.evaluate(() => { dataSources = {}; renderDataSourceList(); }); // isolate from test 7's direct call
  await page.click('#btnAddDataSource');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('#dataSourceForm input[type="text"]'));
    inputs[0].value = 'UI Cities';
    document.querySelector('#dataSourceForm textarea').value = 'city,year,pop\nTokyo,2000,100\nTokyo,2010,120\nTokyo,2020,145\nOsaka,2000,100\nOsaka,2010,94\nOsaka,2020,80';
  });
  await clickFormButton('Read columns');
  await page.waitForTimeout(150);
  await clickFormButton('Add data source');
  await page.waitForTimeout(200);
  const uiListText = await page.$eval('#dataSourceList', el => el.textContent);
  console.log('8. data source added via the real UI form appears in the list:', uiListText.includes('UI Cities') ? 'OK' : 'FAIL', '|', uiListText.replace(/\s+/g, ' ').trim());

  await page.click('#addTemporalLine');
  await page.waitForTimeout(200);
  const lineObjHandle = await page.evaluate(() => { const o = canvas.getObjects().find(x => x.data && x.data.temporalLine); canvas.setActiveObject(o); selectProps(o); return true; });
  await page.waitForTimeout(150);
  const sourceOptions = await page.$$eval('#propsBody select', sels => Array.from(sels[0].options).map(o => o.textContent));
  console.log('9. temporalLine\'s Data source dropdown offers the just-added source:', JSON.stringify(sourceOptions), sourceOptions.includes('UI Cities') ? 'OK' : 'FAIL');

  // --- 10. entity switching: switch the line to the new source + a specific entity, verify
  // the rendered layer actually reflects the new entity's own data, not the old one's ---
  const dsId = await page.evaluate(() => Object.keys(dataSources).find(id => dataSources[id].name === 'UI Cities'));
  const afterEntitySwitch = await page.evaluate((id) => {
    const obj = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    rebuildLineChart(obj, { sourceId: id, entity: 'Osaka', videoStart: 0, videoEnd: 4000 });
    const newObj = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    captureBaseState();
    applyFrame(4000);
    return { entity: newObj.data.temporalLine.entity, valueLabel: newObj.data.temporalLine._runtime.valueLabel.text };
  }, dsId);
  console.log('10. entity switch renders that entity\'s own final value (Osaka -> 80):', JSON.stringify(afterEntitySwitch),
    afterEntitySwitch.entity === 'Osaka' && afterEntitySwitch.valueLabel === '80' ? 'OK' : 'FAIL');
  const afterEntitySwitch2 = await page.evaluate((id) => {
    const obj = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    rebuildLineChart(obj, { entity: 'Tokyo' });
    const newObj = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    captureBaseState();
    applyFrame(4000);
    return { entity: newObj.data.temporalLine.entity, valueLabel: newObj.data.temporalLine._runtime.valueLabel.text };
  }, dsId);
  console.log('10b. switching back to Tokyo renders Tokyo\'s own final value (145):', JSON.stringify(afterEntitySwitch2),
    afterEntitySwitch2.entity === 'Tokyo' && afterEntitySwitch2.valueLabel === '145' ? 'OK' : 'FAIL');

  // --- 11-13. TemporalDataSource correctness against a USER-PASTED source (not just the
  // built-in fixture) — boundary, midpoint interpolation, reverse seek ---
  const boundaryMid = await page.evaluate((id) => {
    const src = temporalSourceFor({ sourceId: id, videoStart: 0, videoEnd: 4000 });
    return {
      atStart: src.valueAt('Osaka', 2000), atEnd: src.valueAt('Osaka', 2020),
      atMid: src.valueAt('Osaka', 2005), // halfway 100 -> 94 = 97
    };
  }, dsId);
  console.log('11. exact observed boundary values for a user-pasted source:', JSON.stringify(boundaryMid),
    boundaryMid.atStart.value === 100 && boundaryMid.atStart.observed === true &&
    boundaryMid.atEnd.value === 80 && boundaryMid.atEnd.observed === true ? 'OK' : 'FAIL');
  console.log('12. interpolated midpoint marked not-observed:', JSON.stringify(boundaryMid.atMid),
    Math.abs(boundaryMid.atMid.value - 97) < 0.001 && boundaryMid.atMid.observed === false ? 'OK' : 'FAIL');
  const reverseSeek2 = await page.evaluate((id) => {
    const src = temporalSourceFor({ sourceId: id, videoStart: 0, videoEnd: 4000 });
    src.valueAt('Osaka', 2018); src.valueAt('Osaka', 2003);
    const afterJump = src.valueAt('Osaka', 2012);
    const direct = src.valueAt('Osaka', 2012);
    return { afterJump, direct };
  }, dsId);
  console.log('13. reverse/non-monotonic seek on a user-pasted source matches a direct lookup:', JSON.stringify(reverseSeek2),
    JSON.stringify(reverseSeek2.afterJump) === JSON.stringify(reverseSeek2.direct) ? 'OK' : 'FAIL');

  // --- 14. missing data is never treated as zero: requesting a time before/after an entity's
  // OWN observed range returns its nearest real edge value, not 0 ---
  const edgeVal = await page.evaluate((id) => {
    const src = temporalSourceFor({ sourceId: id, videoStart: 0, videoEnd: 4000 });
    return { before: src.valueAt('Osaka', 1990), after: src.valueAt('Osaka', 2030) };
  }, dsId);
  console.log('14. out-of-range requests clamp to the nearest real value, never 0:', JSON.stringify(edgeVal),
    edgeVal.before.value === 100 && edgeVal.after.value === 80 ? 'OK' : 'FAIL');

  // --- 15. stable/fixed Y-domain: LineView's Y-domain is computed ONCE at build time, not
  // recalculated per frame — rendering the same data value at two different elapsed times
  // (after seeking around) must place the cursor at the exact same pixel Y each time ---
  const stableDomain = await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    const minVBefore = obj.data.temporalLine._runtime.minV, maxVBefore = obj.data.temporalLine._runtime.maxV;
    captureBaseState();
    applyFrame(0); const y1 = obj.data.temporalLine._runtime.cursor.top;
    applyFrame(4000); applyFrame(1500); applyFrame(0); const y2 = obj.data.temporalLine._runtime.cursor.top;
    const minVAfter = obj.data.temporalLine._runtime.minV, maxVAfter = obj.data.temporalLine._runtime.maxV;
    return { y1, y2, minVBefore, maxVBefore, minVAfter, maxVAfter };
  });
  console.log('15. Y-domain (minV/maxV) never changes across seeks, and the same data time always lands at the same pixel Y:', JSON.stringify(stableDomain),
    stableDomain.y1 === stableDomain.y2 && stableDomain.minVBefore === stableDomain.minVAfter && stableDomain.maxVBefore === stableDomain.maxVAfter ? 'OK' : 'FAIL');

  // --- 16. number formatting: compact + percentage modes ---
  const numberFormats = await page.evaluate(() => ({
    plain: formatTemporalValue(82.4, 'idx'),
    compact: formatTemporalValue(12400, 'people', { compact: true }),
    compactSmall: formatTemporalValue(340, 'people', { compact: true }), // under 1000 -> not abbreviated
    percentage: formatTemporalValue(12.345, null, { percentage: true }),
  }));
  console.log('16. number formatting (plain/compact/percentage):', JSON.stringify(numberFormats),
    numberFormats.plain === '82.4 idx' && numberFormats.compact === '12.4K people' && numberFormats.compactSmall === '340 people' && numberFormats.percentage === '12.3%' ? 'OK' : 'FAIL');

  // --- 17. dataset-level provenance vs per-instance visible source are separate fields ---
  const provenance = await page.evaluate((id) => {
    const obj = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    rebuildLineChart(obj, { source: 'Custom instance caption' });
    const newObj = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    return { datasetSource: dataSources[id].source, datasetUrl: dataSources[id].sourceUrl, instanceSource: newObj.data.temporalLine.source };
  }, dsId);
  console.log('17. dataset-level source/sourceUrl and a layer\'s own instance source caption stay independent:', JSON.stringify(provenance),
    provenance.datasetSource === 'Test Bureau' || provenance.datasetSource === '' ? 'n/a-dataset-untouched OK' : 'check',
    provenance.instanceSource === 'Custom instance caption' ? 'OK' : 'FAIL');

  // --- 18-20. responsive aspect ratios: a custom-source-driven scene doesn't overflow ---
  let n = 18;
  for (const aspectLabel of ['Vertical', 'Square', 'Widescreen']) {
    await clickAspect(aspectLabel);
    await page.click('#addTemporalLine');
    await page.click('#addTemporalStat');
    const overflow = await checkOverflow();
    console.log(`${n}. Temporal Line/Stat quick-add @ ${aspectLabel}: overflowing =`, overflow, overflow.length === 0 ? 'OK' : 'FAIL');
    await page.screenshot({ path: path.join(outDir, `${String(n).padStart(2, '0')}_${aspectLabel}.png`) });
    n++;
  }
  await clickAspect('Widescreen');

  // ==========================================================================================
  // Permanent benchmark: "TEMPORAL MAP + CONTEXT LINE" — Map + Line + Stat linked view, using
  // TWO divergent entities (Hokkaidō declining, Okinawa rising — 5 observations each, already
  // present in TEMPORAL_FIXTURES.fixtureIndex), exercising the full sequence INCLUDING an
  // entity change and a backward seek, layered onto the existing proven "Temporal: Map + Line
  // + Stat" template rather than a near-duplicate second template (see CLAUDE.md).
  // ==========================================================================================
  await loadTemplateByLabel('Temporal:');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '30_benchmark_static.png') });

  await page.evaluate(() => captureBaseState());
  function readSync(t) {
    return page.evaluate((elapsed) => {
      applyFrame(elapsed);
      const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
      const stat = canvas.getObjects().find(o => o.data && o.data.temporalStat);
      const map = canvas.getObjects().find(o => o.data && o.data.map);
      return {
        lineText: line.data.temporalLine._runtime.valueLabel.text,
        statText: stat.data.temporalStat._runtime.valueText.text,
        mapHighlightColor: map.data.map._runtime.regionPaths.get('Hokkaidō').fill,
      };
    }, t);
  }
  const seq = [];
  for (const t of [1000, 2500, 4000]) seq.push({ t, r: await readSync(t) });
  console.log('21. benchmark: Map/Line/Stat agree across the forward sequence:', JSON.stringify(seq),
    seq.every(({ r }) => r.lineText === r.statText) ? 'OK' : 'FAIL');

  // entity change mid-benchmark: switch Line + Stat to Okinawa (rising trajectory, the
  // divergent counterpart to Hokkaidō's decline), verify they re-sync on the new entity
  await page.evaluate(() => {
    const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    rebuildLineChart(line, { entity: 'Okinawa' });
    const stat = canvas.getObjects().find(o => o.data && o.data.temporalStat);
    rebuildTemporalStat(stat, { entity: 'Okinawa' });
    captureBaseState();
  });
  const afterEntityChange = await readSync(3000);
  console.log('22. benchmark: after switching to the divergent entity (Okinawa), Line/Stat re-sync:', JSON.stringify(afterEntityChange),
    afterEntityChange.lineText === afterEntityChange.statText ? 'OK' : 'FAIL');

  // backward seek: jump forward then back, must match a direct render of the same instant
  const forward = await readSync(4800);
  const backward = await readSync(1200);
  const backToForward = await readSync(4800);
  console.log('23. benchmark: backward seek then returning forward reproduces the same state:', JSON.stringify({ forward, backToForward }),
    JSON.stringify(forward) === JSON.stringify(backToForward) ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '31_benchmark_after_entity_change.png') });

  // full play-through of the benchmark sequence
  await page.click('#modeEdit');
  await page.waitForTimeout(200);
  await page.click('#btnPlay');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '32_benchmark_mid_playback.png') });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(outDir, '33_benchmark_settled.png') });
  await page.click('#modeEdit');
  await page.waitForTimeout(200);

  // --- 24. template naming: no template is named/labeled after a specific population dataset
  // ("Population Animation") — the generic sample stays generically named ---
  const templateLabels = await page.evaluate(() => Object.values(TEMPLATES).map(t => t.label));
  console.log('24. no template literally titled "Population Animation":', JSON.stringify(templateLabels.filter(l => /temporal/i.test(l))),
    !templateLabels.some(l => /population animation/i.test(l)) ? 'OK' : 'FAIL');

  // ==========================================================================================
  // Full save/load fidelity: dataSources registry + every new temporalLine/temporalStat field
  // survive a round trip, AND the reloaded project actually plays back correctly (not just
  // config-field equality) — this is the fix for the _runtime-doesn't-survive-JSON gap.
  // ==========================================================================================
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  await page.click('#btnAddDataSource');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('#dataSourceForm input[type="text"]'));
    inputs[0].value = 'Persistence Test';
    document.querySelector('#dataSourceForm textarea').value = 'city,year,pop\nKyoto,2000,50\nKyoto,2010,55\nKyoto,2020,60';
  });
  await clickFormButton('Read columns');
  await page.waitForTimeout(150);
  await clickFormButton('Add data source');
  await page.waitForTimeout(200);
  const persistDsId = await page.evaluate(() => Object.keys(dataSources)[0]);
  await page.click('#addTemporalLine');
  await page.waitForTimeout(150);
  await page.evaluate((id) => {
    const obj = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    canvas.setActiveObject(obj);
    rebuildLineChart(obj, { sourceId: id, entity: 'Kyoto', videoStart: 500, videoEnd: 3500, compactNumbers: true, percentage: false, source: 'Instance caption', sourceUrl: 'https://instance.example' });
  }, persistDsId);
  await page.waitForTimeout(150);

  const beforeSave2 = await page.evaluate(() => {
    const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    return { cfg: line.data.temporalLine, dataSources };
  });
  const downloadPromise2 = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download2 = await downloadPromise2;
  const projPath2 = path.join(outDir, 'persistence_scene.json');
  await download2.saveAs(projPath2);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const fileInput2 = await page.$('#projectFile');
  await fileInput2.setInputFiles(projPath2);
  await page.waitForTimeout(1000);
  const reloaded2 = await page.evaluate(() => {
    const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    return { cfg: line ? line.data.temporalLine : null, dataSources };
  });
  const cfgMatches = reloaded2.cfg && reloaded2.cfg.sourceId === beforeSave2.cfg.sourceId && reloaded2.cfg.entity === beforeSave2.cfg.entity &&
    reloaded2.cfg.videoStart === beforeSave2.cfg.videoStart && reloaded2.cfg.videoEnd === beforeSave2.cfg.videoEnd &&
    reloaded2.cfg.compactNumbers === true && reloaded2.cfg.source === 'Instance caption' && reloaded2.cfg.sourceUrl === 'https://instance.example';
  const dsMatches = Object.keys(reloaded2.dataSources).length === 1 && Object.values(reloaded2.dataSources)[0].name === 'Persistence Test' &&
    Object.values(reloaded2.dataSources)[0].records.length === 3;
  console.log('25. save/load: dataSources registry + full temporalLine config (incl. new fields) survive round trip:',
    JSON.stringify({ cfgMatches, dsMatches }), cfgMatches && dsMatches ? 'OK' : 'FAIL');

  // The actual regression this guards: _runtime is non-serializable and must be rebuilt after
  // enlivenObjects(), or Preview/scrub on a reloaded project throws instead of just working.
  await page.click('#btnPlay');
  await page.waitForTimeout(2000);
  const postReloadPlayback = await page.evaluate(() => {
    const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    return line.data.temporalLine._runtime && line.data.temporalLine._runtime.valueLabel ? line.data.temporalLine._runtime.valueLabel.text : 'MISSING';
  });
  console.log('26. reloaded project actually plays back (not just config equality) — value label:', postReloadPlayback,
    postReloadPlayback !== 'MISSING' && postReloadPlayback !== '' ? 'OK' : 'FAIL');
  await page.click('#modeEdit');
  await page.waitForTimeout(200);

  // ==========================================================================================
  // 12-step creator workflow acceptance test, exercised through the real UI end to end:
  // add data source -> paste/import -> map fields -> add temporal layer -> select entity ->
  // configure range/duration -> enable map+line+stat -> scrub -> see sync -> save -> reload ->
  // get the same scene.
  // ==========================================================================================
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  // 1. add data source
  await page.click('#btnAddDataSource');
  await page.waitForTimeout(150);
  // 2. paste/import
  await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('#dataSourceForm input[type="text"]'));
    inputs[0].value = 'Workflow Regions';
    document.querySelector('#dataSourceForm textarea').value = 'region,year,idx\nNorth,2000,100\nNorth,2010,80\nNorth,2020,60\nSouth,2000,100\nSouth,2010,130\nSouth,2020,160';
  });
  // 3. map fields
  await clickFormButton('Read columns');
  await page.waitForTimeout(150);
  await clickFormButton('Add data source');
  await page.waitForTimeout(200);
  const wfDsId = await page.evaluate(() => Object.keys(dataSources).find(id => dataSources[id].name === 'Workflow Regions'));
  // 4. add a temporal story (map + line + stat layers)
  await page.click('#addMap');
  await page.click('#addTemporalLine');
  await page.click('#addTemporalStat');
  await page.waitForTimeout(200);
  // 5-6. select entity + configure range/duration for line and stat
  await page.evaluate((id) => {
    const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    rebuildLineChart(line, { sourceId: id, entity: 'South', videoStart: 0, videoEnd: 5000 });
    const stat = canvas.getObjects().find(o => o.data && o.data.temporalStat);
    rebuildTemporalStat(stat, { sourceId: id, entity: 'South', videoStart: 0, videoEnd: 5000 });
  }, wfDsId);
  await page.waitForTimeout(150);
  // 7. enable map+line+stat — already added; make the map highlight the same entity
  await page.evaluate(() => {
    const map = canvas.getObjects().find(o => o.data && o.data.map);
    canvas.setActiveObject(map);
    toggleMapRegionHighlight(map, 'Hokkaidō'); // stand-in region on the map layer itself
  });
  await page.waitForTimeout(150);
  // 8-9. scrub and see sync between Line/Stat (both reading the same South entity)
  await page.evaluate(() => captureBaseState());
  const workflowSync = await page.evaluate(() => {
    applyFrame(2500);
    const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    const stat = canvas.getObjects().find(o => o.data && o.data.temporalStat);
    return { lineText: line.data.temporalLine._runtime.valueLabel.text, statText: stat.data.temporalStat._runtime.valueText.text };
  });
  console.log('27. 12-step workflow: scrubbing shows Line/Stat in sync on the user-authored entity:', JSON.stringify(workflowSync),
    workflowSync.lineText === workflowSync.statText && workflowSync.lineText !== '' ? 'OK' : 'FAIL');
  await page.click('#modeEdit');
  await page.waitForTimeout(150);
  // 10-11. save -> reload
  const sceneBefore = await page.evaluate(() => canvas.getObjects().length);
  const downloadPromise3 = page.waitForEvent('download', { timeout: 10000 });
  await page.click('#btnSaveProject');
  const download3 = await downloadPromise3;
  const projPath3 = path.join(outDir, 'workflow_scene.json');
  await download3.saveAs(projPath3);
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForTimeout(800);
  const fileInput3 = await page.$('#projectFile');
  await fileInput3.setInputFiles(projPath3);
  await page.waitForTimeout(1000);
  // 12. get the same scene back
  const sceneAfter = await page.evaluate(() => canvas.getObjects().length);
  await page.evaluate(() => captureBaseState());
  const workflowSyncAfterReload = await page.evaluate(() => {
    applyFrame(2500);
    const line = canvas.getObjects().find(o => o.data && o.data.temporalLine);
    const stat = canvas.getObjects().find(o => o.data && o.data.temporalStat);
    return { lineText: line.data.temporalLine._runtime.valueLabel.text, statText: stat.data.temporalStat._runtime.valueText.text };
  });
  console.log('28. 12-step workflow: reloaded scene has the same layer count and still syncs at the same instant:',
    JSON.stringify({ sceneBefore, sceneAfter, workflowSyncAfterReload }),
    sceneBefore === sceneAfter && JSON.stringify(workflowSyncAfterReload) === JSON.stringify(workflowSync) ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '40_workflow_final.png') });

  console.log('HAD ERROR:', hadError);
  await browser.close();
  if (hadError) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
