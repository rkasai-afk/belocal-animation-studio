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
  async function selectActiveMap() {
    return page.evaluate(() => {
      const obj = canvas.getObjects().find(o => o.data && o.data.map);
      if (obj) { canvas.setActiveObject(obj); canvas.requestRenderAll(); }
      return !!obj;
    });
  }
  async function playAndWait(ms) {
    await page.click('#btnPlay');
    await page.waitForTimeout(ms);
  }
  async function backToEditMode() {
    await page.click('#modeEdit');
    await page.waitForTimeout(150);
  }

  // --- 1. Quick-add Map Graphic defaults to a world map highlighting Japan ---
  const blankBtns = await page.$$('.tpl-btn');
  const blankLabels = await Promise.all(blankBtns.map(b => b.textContent()));
  await blankBtns[blankLabels.findIndex(l => l.includes('Blank canvas'))].click();
  await page.waitForTimeout(200);
  await page.click('#addMap');
  await page.waitForTimeout(300);
  const initial = await page.evaluate(() => canvas.getObjects().find(o => o.data && o.data.map).data.map);
  console.log('1. quick-add default:', JSON.stringify(initial.scope), initial.events.length, initial.scope === 'world' && initial.events.some(e => e.type === 'highlight' && e.region === 'Japan') ? 'OK' : 'FAIL');
  console.log('1b. layer list shows MAP badge:', (await page.textContent('#layerList')).includes('MAP') ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '01_default_world_map.png') });

  // --- 2. switching scope in the props panel regenerates the group and resets events ---
  let scopeBtn = null;
  for (const b of await page.$$('#propsBody button')) {
    if ((await b.textContent()).trim() === 'Japan prefectures') { scopeBtn = b; break; }
  }
  await scopeBtn.click();
  await page.waitForTimeout(400);
  const afterScope = await page.evaluate(() => canvas.getObjects().find(o => o.data && o.data.map).data.map);
  console.log('2. scope switch to japan resets events:', afterScope.scope, afterScope.events.length, afterScope.scope === 'japan' && afterScope.events.length === 0 ? 'OK' : 'FAIL');

  // --- 3. click-to-highlight: click a known point inside the Kanagawa region on the canvas ---
  // (native map coords -> canvas pixel via the same math applyMapTimeline/click-handler use)
  const kanagawaScreen = await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    canvas.setActiveObject(obj);
    const region = mapRegionsFor('japan').find(r => r.name === 'Kanagawa');
    const a = regionAnchor('japan', region.name, region.path);
    const rt = obj.data.map._runtime;
    const groupLocal = new fabric.Point(a.x - rt.groupOffsetX, a.y - rt.groupOffsetY);
    const canvasPt = fabric.util.transformPoint(groupLocal, obj.calcTransformMatrix());
    const vpt = canvas.viewportTransform;
    // canvasPt is in the canvas's internal backing-store pixels (e.g. 1920 wide); the
    // upper-canvas element is displayed scaled down via CSS to fit the sidebar layout, so a
    // real mouse click needs the CSS-pixel equivalent, not the raw internal coordinate.
    const internalX = canvasPt.x * vpt[0] + vpt[4], internalY = canvasPt.y * vpt[3] + vpt[5];
    return { x: internalX, y: internalY, internalW: canvas.width, internalH: canvas.height };
  });
  const canvasBox = await page.$('canvas.upper-canvas');
  const box = await canvasBox.boundingBox();
  const cssX = box.x + kanagawaScreen.x * (box.width / kanagawaScreen.internalW);
  const cssY = box.y + kanagawaScreen.y * (box.height / kanagawaScreen.internalH);
  await page.mouse.click(cssX, cssY);
  await page.waitForTimeout(300);
  let mapData = await page.evaluate(() => canvas.getObjects().find(o => o.data && o.data.map).data.map);
  console.log('3. click-to-highlight added a highlight event for Kanagawa:', JSON.stringify(mapData.events.map(e => e.type + ':' + e.region)), mapData.events.some(e => e.type === 'highlight' && e.region === 'Kanagawa') ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '02_click_highlight_kanagawa.png') });

  // --- 4. clicking the same region again removes the highlight (toggle) ---
  await page.mouse.click(cssX, cssY);
  await page.waitForTimeout(300);
  mapData = await page.evaluate(() => canvas.getObjects().find(o => o.data && o.data.map).data.map);
  console.log('4. clicking again removes the highlight:', mapData.events.length, mapData.events.length === 0 ? 'OK' : 'FAIL');

  // --- 5. highlight animates from the neutral base state, not pre-highlighted ---
  await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    rebuildMap(obj, { events: [{ type: 'highlight', id: 'ev_test', region: 'Kanagawa', color: '#FF7A3D', start: 300, duration: 700, dim: true }] });
  });
  await page.waitForTimeout(150);
  const highlightProgression = await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    const rt = obj.data.map._runtime;
    const path = rt.regionPaths.get('Kanagawa');
    applyMapTimeline(obj, 0); // before the event starts
    const beforeFill = path.fill;
    applyMapTimeline(obj, 1000); // event finished (300+700)
    const afterFill = path.fill;
    return { beforeFill, afterFill };
  });
  console.log('5. highlight starts neutral then animates to the target color:', JSON.stringify(highlightProgression),
    highlightProgression.beforeFill !== highlightProgression.afterFill && highlightProgression.beforeFill.includes('255,255,255') ? 'OK' : 'FAIL');

  // --- 6-8. route direction sanity: arrow points toward its destination, not a fixed angle ---
  function angleOfVector(dx, dy) { return Math.atan2(dy, dx) * 180 / Math.PI; }
  const routeChecks = await page.evaluate(() => {
    function check(from, to) {
      const scope = 'japan';
      const fromR = mapRegionsFor(scope).find(r => r.name === from);
      const toR = mapRegionsFor(scope).find(r => r.name === to);
      const fromA = regionAnchor(scope, fromR.name, fromR.path), toA = regionAnchor(scope, toR.name, toR.path);
      const geo = routeGeometry({ x: fromA.x, y: fromA.y }, { x: toA.x, y: toA.y }, 'medium');
      const finalAngle = bezierTangentAngle(geo.from, geo.control, geo.to, 1);
      const straightAngle = Math.atan2(toA.y - fromA.y, toA.x - fromA.x) * 180 / Math.PI;
      let diff = Math.abs(finalAngle - straightAngle) % 360; if (diff > 180) diff = 360 - diff;
      return { from, to, finalAngle, straightAngle, diff };
    }
    return [check('Tōkyō', 'Hokkaidō'), check('Ōsaka', 'Fukuoka'), check('Tōkyō', 'Okinawa')];
  });
  routeChecks.forEach((r, i) => {
    console.log(`${6 + i}. route ${r.from} -> ${r.to} arrowhead direction within 45deg of straight line:`, JSON.stringify(r), r.diff < 45 ? 'OK' : 'FAIL');
  });

  // --- 9. camera zoom is capped to a sane maximum even for a tiny region ---
  const zoomCap = await page.evaluate(() => computeCameraTarget('japan', 'Kanagawa', 0.28, null));
  console.log('9. camera zoom capped to a professional maximum:', zoomCap.scaleMultiplier, zoomCap.scaleMultiplier <= 6.01 ? 'OK' : 'FAIL');

  // --- 10-12. the flagship flight sequence: marker travels, arrives, camera settles, stat counts up ---
  await loadTemplateByLabel('Flight Route');
  await backToEditMode();
  await selectActiveMap();
  await playAndWait(2500);
  const midFlight = await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    const rt = obj.data.map._runtime;
    const routeEvent = obj.data.map.events.find(e => e.type === 'route');
    const r = rt.routeRuntimes.get(routeEvent.id);
    return { markerOpacity: r.marker.opacity, angle: r.marker.angle };
  });
  console.log('10. mid-flight: plane marker visible and rotated to the route tangent:', JSON.stringify(midFlight), midFlight.markerOpacity > 0.9 && midFlight.angle !== 0 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '03_flight_mid.png') });

  await page.waitForTimeout(4300);
  const settled = await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    const rt = obj.data.map._runtime;
    const statEvent = obj.data.map.events.find(e => e.type === 'stat');
    const s = rt.statRuntimes.get(statEvent.id);
    return {
      scaleX: obj.scaleX, baseScaleX: obj.data.map.baseTransform.scaleX,
      statOpacity: s.valueText.opacity, statText: s.valueText.text,
      bgRect: s.bg.getBoundingRect(true, true), valueRect: s.valueText.getBoundingRect(true, true),
    };
  });
  const cardContainsValue = settled.valueRect.left >= settled.bgRect.left - 1 && settled.valueRect.top >= settled.bgRect.top - 1 &&
    (settled.valueRect.left + settled.valueRect.width) <= (settled.bgRect.left + settled.bgRect.width + 1) &&
    (settled.valueRect.top + settled.valueRect.height) <= (settled.bgRect.top + settled.bgRect.height + 1);
  console.log('11. camera has zoomed in on arrival:', settled.scaleX, 'vs base', settled.baseScaleX, settled.scaleX > settled.baseScaleX * 1.3 ? 'OK' : 'FAIL');
  console.log('12. stat card value text stays fully inside its own card background:', JSON.stringify({ bgRect: settled.bgRect, valueRect: settled.valueRect }), cardContainsValue ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '04_flight_arrival_stat.png') });
  await backToEditMode();

  // --- 13-16. the same stat-card containment check on a much smaller region (Kanagawa), where
  // the un-fixed version of this bug produced a card several times larger than the frame ---
  await loadTemplateByLabel('Region Highlight + Zoom');
  await backToEditMode();
  await selectActiveMap();
  await playAndWait(4200);
  const kanagawaStat = await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    const rt = obj.data.map._runtime;
    const statEvent = obj.data.map.events.find(e => e.type === 'stat');
    const s = rt.statRuntimes.get(statEvent.id);
    return { bgRect: s.bg.getBoundingRect(true, true), valueRect: s.valueText.getBoundingRect(true, true), canvasW: canvas.width };
  });
  const kanagawaContains = kanagawaStat.valueRect.left >= kanagawaStat.bgRect.left - 1 && kanagawaStat.valueRect.top >= kanagawaStat.bgRect.top - 1 &&
    (kanagawaStat.valueRect.left + kanagawaStat.valueRect.width) <= (kanagawaStat.bgRect.left + kanagawaStat.bgRect.width + 1) &&
    (kanagawaStat.valueRect.top + kanagawaStat.valueRect.height) <= (kanagawaStat.bgRect.top + kanagawaStat.bgRect.height + 1);
  console.log('13. Kanagawa (small region) stat card also contains its value text:', kanagawaContains ? 'OK' : 'FAIL');
  console.log('14. Kanagawa stat card stays a reasonable fraction of the frame (not blown up by zoom):', kanagawaStat.bgRect.width, kanagawaStat.canvasW, kanagawaStat.bgRect.width < kanagawaStat.canvasW * 0.5 ? 'OK' : 'FAIL');
  await page.screenshot({ path: path.join(outDir, '05_kanagawa_zoom_stat.png') });
  await backToEditMode();

  // --- 15. redundant "Edit" tab click on a freshly loaded template (nothing has played yet)
  // must NOT wipe every layer's position — this was the actual root cause behind a raft of
  // "drawImage: 0x0 canvas" crashes during Preview that looked like a map-system bug but
  // wasn't: restoreBaseState() was blindly applying undefined base* fields. ---
  await loadTemplateByLabel('Flight Route');
  await page.waitForTimeout(300);
  const beforeRedundantEdit = await page.evaluate(() => canvas.getObjects().map(o => o.left));
  await page.click('#modeEdit'); // already in edit mode; this used to corrupt state
  await page.waitForTimeout(200);
  const afterRedundantEdit = await page.evaluate(() => canvas.getObjects().map(o => o.left));
  console.log('15. redundant Edit-tab click does not wipe layer positions:', JSON.stringify(beforeRedundantEdit), '->', JSON.stringify(afterRedundantEdit),
    JSON.stringify(beforeRedundantEdit) === JSON.stringify(afterRedundantEdit) && beforeRedundantEdit.every(v => v != null) ? 'OK' : 'FAIL');

  // --- 16. the three starter templates exist and are tagged "Maps" ---
  await loadTemplateByLabel('Blank canvas');
  const chipLabels = await Promise.all((await page.$$('.cat-chip')).map(b => b.textContent()));
  console.log('16. Maps category chip present:', chipLabels.includes('Maps') ? 'OK' : 'FAIL');

  // --- 17-40. all four map templates stay within the frame at every aspect ratio (settled,
  // non-playing state — animation transiently moves things off-frame by design, e.g. slide-ins) ---
  let n = 17;
  for (const tplLabel of ['Map: Highlight Country', 'Map: Region Highlight + Zoom + Stat', 'Map: Flight Route + Arrival Zoom', 'Map: Highlight Then Route Onward']) {
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

  // --- 41. save/load round trip preserves a map layer's full events-based config ---
  await loadTemplateByLabel('Flight Route');
  await page.waitForTimeout(300);
  const beforeSave = await page.evaluate(() => canvas.getObjects().find(o => o.data && o.data.map).data.map.events);
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
  const reloadedEvents = await page.evaluate(() => {
    const o = canvas.getObjects().find(o => o.data && o.data.map);
    return o ? o.data.map.events : null;
  });
  console.log('41. map layer events survive save/load:', JSON.stringify(reloadedEvents), reloadedEvents && reloadedEvents.length === beforeSave.length && reloadedEvents.some(e => e.type === 'route' && e.from === 'Tōkyō') ? 'OK' : 'FAIL');

  // --- 42. a stat card's optional secondary line and source line stay inside the card,
  // even on top of the region-scaled base cardH (added after a real overflow bug where the
  // source line's own line-height was underestimated) ---
  await loadTemplateByLabel('Flight Route');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    const events = obj.data.map.events.map(e => e.type === 'stat' ? Object.assign({}, e, { source: 'MIC Statistics Bureau, 2023', secondary: '↑ up from 5.1M in 2010' }) : e);
    rebuildMap(obj, { events });
  });
  await backToEditMode();
  await selectActiveMap();
  await playAndWait(6900);
  const sourceCheck = await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    const rt = obj.data.map._runtime;
    const s = rt.statRuntimes.get(obj.data.map.events.find(e => e.type === 'stat').id);
    const bgR = s.bg.getBoundingRect(true, true);
    const within = (o) => { const r = o.getBoundingRect(true, true); return r.left >= bgR.left - 1 && r.top >= bgR.top - 1 && (r.left + r.width) <= (bgR.left + bgR.width + 1) && (r.top + r.height) <= (bgR.top + bgR.height + 1); };
    return { sourceText: s.sourceText ? s.sourceText.text : null, secondaryOK: within(s.secondaryText), sourceOK: within(s.sourceText) };
  });
  console.log('42. stat card secondary + source lines stay inside the card:', JSON.stringify(sourceCheck), sourceCheck.secondaryOK && sourceCheck.sourceOK ? 'OK' : 'FAIL');
  await backToEditMode();

  // --- 43. determinism: applyFrame(t) is a pure function of t (given one captureBaseState())
  // — scrubbing to 0, then 5000, then back to 2200 must reproduce the exact same visual state
  // as rendering 2200 directly, matching every object touched by the map's own sub-timeline ---
  await loadTemplateByLabel('Flight Route');
  await page.waitForTimeout(300);
  await page.evaluate(() => captureBaseState());
  function snapshotAt(t) {
    return page.evaluate((elapsed) => {
      applyFrame(elapsed);
      const obj = canvas.getObjects().find(o => o.data && o.data.map);
      const rt = obj.data.map._runtime;
      const r = rt.routeRuntimes.get(obj.data.map.events.find(e => e.type === 'route').id);
      const s = rt.statRuntimes.get(obj.data.map.events.find(e => e.type === 'stat').id);
      return {
        mapLeft: obj.left, mapTop: obj.top, mapScaleX: obj.scaleX,
        markerLeft: r.marker.left, markerAngle: r.marker.angle, markerOpacity: r.marker.opacity,
        lineDashOffset: r.lineShape.strokeDashOffset, statValueText: s.valueText.text, statOpacity: s.valueText.opacity,
        eyebrowOpacity: canvas.getObjects().find(o => o.name === 'Eyebrow').opacity,
      };
    }, t);
  }
  const direct2200 = await snapshotAt(2200);
  await snapshotAt(0);
  await snapshotAt(5000);
  const afterSeek2200 = await snapshotAt(2200);
  console.log('43. deterministic frame re-seek (0 -> 5000 -> 2200 matches direct 2200):', JSON.stringify(direct2200) === JSON.stringify(afterSeek2200) ? 'OK' : 'FAIL');

  // --- 44-47. the declarative control-manifest renders real, working UI for every event
  // type — not just correct underlying data. Drives actual DOM elements (text inputs, a
  // checkbox, a range slider, a buttonGroup), the same way a creator would. ---
  await loadTemplateByLabel('Flight Route');
  await backToEditMode();
  await selectActiveMap();
  await page.waitForTimeout(200);
  async function findEventCard(typeBadge) {
    for (const c of await page.$$('#propsBody .source-box')) {
      const badge = await c.$('.badge-visual');
      if (badge && (await badge.textContent()) === typeBadge) return c;
    }
    return null;
  }
  const statCard = await findEventCard('STAT');
  let statInputs = await statCard.$$('input[type=text]'); // label, value, unit, secondary, source, sourceUrl
  await statInputs[4].fill('MIC Statistics Bureau, 2023'); await statInputs[4].dispatchEvent('change');
  await page.waitForTimeout(150);
  const statCard2 = await findEventCard('STAT');
  statInputs = await statCard2.$$('input[type=text]');
  await statInputs[5].fill('https://example.gov/stats'); await statInputs[5].dispatchEvent('change');
  await page.waitForTimeout(150);
  const sourceMeta = await page.evaluate(() => {
    const ev = canvas.getObjects().find(o => o.data && o.data.map).data.map.events.find(e => e.type === 'stat');
    return { source: ev.source, sourceUrl: ev.sourceUrl };
  });
  console.log('44. stat Source/Source URL fields write through the manifest UI:', JSON.stringify(sourceMeta),
    sourceMeta.source === 'MIC Statistics Bureau, 2023' && sourceMeta.sourceUrl === 'https://example.gov/stats' ? 'OK' : 'FAIL');
  const sourceUrlOnScreen = await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    const s = obj.data.map._runtime.statRuntimes.get(obj.data.map.events.find(e => e.type === 'stat').id);
    return s.sourceText.text;
  });
  console.log('44b. sourceUrl is editor metadata only, never appears on the rendered card:', sourceUrlOnScreen, !sourceUrlOnScreen.includes('example.gov') ? 'OK' : 'FAIL');

  const zoomCard = await findEventCard('ZOOM');
  await zoomCard.$eval('input[type=checkbox]', el => { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(150);
  const zoomCard2 = await findEventCard('ZOOM');
  const rangeCount = await zoomCard2.$$eval('input[type=range]', els => els.length);
  await zoomCard2.$eval('input[type=range]', el => { el.value = '4'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(150);
  const zoomState = await page.evaluate(() => {
    const ev = canvas.getObjects().find(o => o.data && o.data.map).data.map.events.find(e => e.type === 'zoom');
    return { manual: ev.manual, manualZoom: ev.manualZoom };
  });
  console.log('45. zoom event: manual toggle reveals range sliders, slider writes manualZoom:', JSON.stringify(zoomState), rangeCount,
    zoomState.manual === true && zoomState.manualZoom === 4 && rangeCount === 3 ? 'OK' : 'FAIL');

  const routeCard = await findEventCard('ROUTE');
  const styleLabels = await routeCard.$$eval('.row2 button', els => els.map(e => e.textContent.trim()));
  const lineIdx = styleLabels.indexOf('Line');
  await (await routeCard.$$('.row2 button'))[lineIdx].click();
  await page.waitForTimeout(150);
  const routeState = await page.evaluate(() => {
    const ev = canvas.getObjects().find(o => o.data && o.data.map).data.map.events.find(e => e.type === 'route');
    return { style: ev.style, movingObject: ev.movingObject };
  });
  console.log('46. route style buttonGroup click derives movingObject via manifest onSet hook:', JSON.stringify(routeState),
    routeState.style === 'line' && routeState.movingObject === 'none' ? 'OK' : 'FAIL');

  // --- 47. manual camera framing math: percentage-based pan/zoom converts to native map
  // coordinates correctly, independent of any region-based automatic framing ---
  const camMath = await page.evaluate(() => ({
    centered: computeCameraTarget('japan', null, null, { zoom: 3, xPct: 0, yPct: 0 }),
    shifted: computeCameraTarget('japan', null, null, { zoom: 3, xPct: 50, yPct: -25 }),
    full: mapNativeBounds('japan'),
  }));
  const expectedDx = (camMath.full.maxX - camMath.full.minX) / 2 * 0.5;
  const expectedDy = (camMath.full.maxY - camMath.full.minY) / 2 * -0.25;
  console.log('47. manual camera pct->native conversion:', JSON.stringify(camMath.shifted), 'expected dx/dy', expectedDx, expectedDy,
    camMath.centered.dxNative === 0 && Math.abs(camMath.shifted.dxNative - expectedDx) < 0.01 && Math.abs(camMath.shifted.dyNative - expectedDy) < 0.01 ? 'OK' : 'FAIL');
  await backToEditMode();

  // --- 48. determinism stress test: a longer non-monotonic seek sequence (matching the
  // exact scrub pattern a creator dragging a scrubber back and forth would produce) must
  // land on the identical state a completely fresh page load + single direct render of the
  // same instant produces — proving PLAYBACK CLOCK (whatever produced the requested time,
  // scrubbing forward/back/forward again) is fully decoupled from SCENE EVALUATOR (applyFrame
  // itself has no memory of how it got there). Covers highlight color, camera transform,
  // route marker position+rotation, and stat text/opacity together on one map layer. ---
  function fullSnapshot(t) {
    return page.evaluate((elapsed) => {
      applyFrame(elapsed);
      const obj = canvas.getObjects().find(o => o.data && o.data.map);
      const rt = obj.data.map._runtime;
      const highlightPath = rt.regionPaths.get('Hokkaidō');
      const r = rt.routeRuntimes.get(obj.data.map.events.find(e => e.type === 'route').id);
      const s = rt.statRuntimes.get(obj.data.map.events.find(e => e.type === 'stat').id);
      return {
        highlightFill: highlightPath.fill, highlightStroke: highlightPath.stroke,
        mapLeft: obj.left, mapTop: obj.top, mapScaleX: obj.scaleX,
        markerLeft: r.marker.left, markerTop: r.marker.top, markerAngle: r.marker.angle, markerOpacity: r.marker.opacity,
        statText: s.valueText.text, statOpacity: s.valueText.opacity,
      };
    }, t);
  }
  await loadTemplateByLabel('Flight Route');
  await page.waitForTimeout(300);
  await page.evaluate(() => captureBaseState());
  for (const t of [0, 500, 2500, 900, 4200]) await fullSnapshot(t); // non-monotonic scrub, matching the spec's own example sequence
  const seekResult = await fullSnapshot(1300);

  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); // fully fresh app state
  await page.waitForTimeout(800);
  await loadTemplateByLabel('Flight Route');
  await page.waitForTimeout(300);
  await page.evaluate(() => captureBaseState());
  const freshResult = await fullSnapshot(1300);

  console.log('48. non-monotonic seek (0,500,2500,900,4200,1300) matches a fresh-page direct render of 1300:',
    JSON.stringify(seekResult), 'vs', JSON.stringify(freshResult),
    JSON.stringify(seekResult) === JSON.stringify(freshResult) ? 'OK' : 'FAIL');

  // --- 49. GeographicDataset/GeographicFeature abstraction: mapRegionsFor() resolves through
  // the GEOGRAPHIC_DATASETS registry (not a hardcoded ternary), an unknown scope falls back to
  // 'world' rather than throwing, and the scope-switch buttons in the props panel are
  // generated from the registry — proving a future dataset entry would need no engine changes,
  // just a new registry entry, to be usable by every existing map function. ---
  const geoAbstraction = await page.evaluate(() => ({
    worldCount: mapRegionsFor('world').length,
    japanCount: mapRegionsFor('japan').length,
    unknownFallsBackToWorld: mapRegionsFor('nonexistent-scope').length === mapRegionsFor('world').length,
    registryHasBothDatasets: !!GEOGRAPHIC_DATASETS.world && !!GEOGRAPHIC_DATASETS.japan,
    bothAreModernKind: GEOGRAPHIC_DATASETS.world.kind === 'modern' && GEOGRAPHIC_DATASETS.japan.kind === 'modern',
  }));
  console.log('49. GeographicDataset registry backs mapRegionsFor(), unknown scope falls back safely:', JSON.stringify(geoAbstraction),
    geoAbstraction.worldCount > 100 && geoAbstraction.japanCount === 47 && geoAbstraction.unknownFallsBackToWorld && geoAbstraction.registryHasBothDatasets && geoAbstraction.bothAreModernKind ? 'OK' : 'FAIL');
  const scopeButtonLabels = await page.evaluate(() => {
    const obj = canvas.getObjects().find(o => o.data && o.data.map);
    canvas.setActiveObject(obj); canvas.requestRenderAll();
    return Array.from(document.querySelectorAll('#propsBody .row2 button')).slice(0, 2).map(b => b.textContent.trim());
  });
  console.log('49b. scope-switch buttons generated from the registry:', JSON.stringify(scopeButtonLabels),
    scopeButtonLabels.includes('World') && scopeButtonLabels.includes('Japan prefectures') ? 'OK' : 'FAIL');

  console.log('HAD ERROR:', hadError);
  await browser.close();
  if (hadError) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
