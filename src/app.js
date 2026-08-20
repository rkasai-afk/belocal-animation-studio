/* ============ COLOR / FONT SYSTEM ============ */
const COLORS = {
  teal:'#0E7C7B', tealLight:'#6FD3D2', green:'#2E7D32', greenLight:'#8FD19E',
  amber:'#B7791F', amberLight:'#F0C674', red:'#A33131', redLight:'#E39B9B',
  navy:'#1F3864', white:'#FFFFFF',
};
const CARD_PALETTE = [COLORS.tealLight, COLORS.greenLight, COLORS.amberLight, COLORS.redLight, '#B9C6E8', '#FFFFFF'];
const BG_COLOR_OPTIONS = [
  {name:'navy', val:'#1F3864'}, {name:'teal-dark', val:'#0B4A49'},
  {name:'charcoal', val:'#22252B'}, {name:'wine', val:'#3A1F2B'},
  {name:'transparent', val:'transparent'},
];
const SWATCH_OPTIONS = [
  {name:'white', val:'#FFFFFF'}, {name:'teal', val:COLORS.tealLight}, {name:'green', val:COLORS.greenLight},
  {name:'amber', val:COLORS.amberLight}, {name:'red', val:COLORS.redLight}, {name:'navy', val:COLORS.navy},
];

const FONT_PRESETS = {
  modern:      { name:'Modern Sans',       display:"Space Grotesk", displayWeight:700, body:"Inter", bodyWeight:400 },
  editorial:   { name:'Bold Editorial',    display:"Bebas Neue",    displayWeight:400, body:"Work Sans", bodyWeight:400 },
  documentary: { name:'Documentary Serif', display:"Playfair Display", displayWeight:900, body:"Source Sans 3", bodyWeight:400 },
  clean:       { name:'Clean Sans',        display:"Work Sans",     displayWeight:700, body:"Inter", bodyWeight:400 },
};
const FONT_FACE_LIST = [
  ["Space Grotesk",400],["Space Grotesk",500],["Space Grotesk",700],
  ["Bebas Neue",400],
  ["Inter",400],["Inter",600],["Inter",700],
  ["Work Sans",400],["Work Sans",600],["Work Sans",700],
  ["Playfair Display",700],["Playfair Display",900],
  ["Source Sans 3",400],["Source Sans 3",600],
];
let currentFontPreset = 'modern';
function resolveFont(role) {
  const p = FONT_PRESETS[currentFontPreset];
  return role === 'display' ? p.display : p.body;
}
function resolveWeight(role) {
  const p = FONT_PRESETS[currentFontPreset];
  return role === 'display' ? p.displayWeight : p.bodyWeight;
}

/* ============ CANVAS SETUP ============ */
const ASPECT_PRESETS = {
  landscape: { w:1920, h:1080, label:'Widescreen', hint:'YouTube / standard video' },
  vertical:  { w:1080, h:1920, label:'Vertical',   hint:'Shorts / Reels / TikTok' },
  square:    { w:1080, h:1080, label:'Square',     hint:'Feed post' },
};
let currentAspect = 'landscape';
let W = ASPECT_PRESETS[currentAspect].w, H = ASPECT_PRESETS[currentAspect].h;
let activeTemplateId = null;
const canvas = new fabric.Canvas('fcanvas', { width: W, height: H, backgroundColor: '#1F3864', preserveObjectStacking: true });
function fitCanvasToWrap() {
  const wrap = document.getElementById('stageWrap');
  const availW = Math.min(860, (wrap.parentElement && wrap.parentElement.clientWidth) || 860);
  const availH = Math.max(320, window.innerHeight - 260);
  let scale = Math.min(availW / W, availH / H);
  // A tall (Vertical) canvas on a normal laptop-height window gets squeezed down to an
  // uncomfortably tiny width by the height constraint above (fitting a 1920-tall canvas
  // within ~500-600px of vertical space forces the width under 350px). Floor the display
  // width at a size that's still workable to drag/resize layers in, even if that means the
  // canvas runs taller than the visible viewport and the page needs a little scrolling to
  // reach the transport buttons below it — a tiny unusable thumbnail is the worse trade.
  const minDispW = Math.min(availW, 420);
  if (W * scale < minDispW) scale = minDispW / W;
  canvas.setDimensions({ width: W * scale, height: H * scale }, { cssOnly: true });
}
fitCanvasToWrap();
window.addEventListener('resize', fitCanvasToWrap);

function setAspect(id) {
  if (!ASPECT_PRESETS[id] || id === currentAspect) return;
  currentAspect = id;
  W = ASPECT_PRESETS[id].w; H = ASPECT_PRESETS[id].h;
  canvas.setDimensions({ width: W, height: H });
  fitCanvasToWrap();
  renderAspectButtons();
  if (currentAspect !== 'vertical') currentSafeZone = 'none';
  renderSafeZoneButtons();
  updateSafeZoneOverlay();
  if (activeTemplateId && activeTemplateId !== 'blank') {
    loadTemplate(activeTemplateId);
    setStatus('Video shape changed — "' + TEMPLATES[activeTemplateId].label + '" reloaded to fit.');
  } else {
    refreshLayerList();
    updateScrubRange();
    setStatus('Video shape changed. Existing layers keep their position — reposition or reload a template to fit.');
  }
}
function renderAspectButtons() {
  const wrap = document.getElementById('aspectGrid');
  if (!wrap) return;
  wrap.innerHTML = '';
  Object.keys(ASPECT_PRESETS).forEach(id => {
    const p = ASPECT_PRESETS[id];
    const btn = document.createElement('button');
    btn.className = 'aspect-btn' + (id === currentAspect ? ' active' : '');
    btn.innerHTML = p.label + ' <span style="font-weight:400;opacity:0.7;">— ' + p.hint + '</span>';
    btn.addEventListener('click', () => setAspect(id));
    wrap.appendChild(btn);
  });
}

/* ============ SAFE ZONE / "DEAD ZONE" GUIDE ============ */
// No platform publishes an official safe-zone spec — these are approximate, community-
// sourced figures (checked 2026-08) for where each app's own UI chrome (captions box,
// like/comment/share rail, caption/progress bar) tends to sit over a 1080x1920 vertical
// video. Treat as "roughly where to avoid important text/faces," not a pixel-exact spec —
// re-check against current app screenshots if a platform visibly redesigns its UI.
const SAFE_ZONE_PRESETS = {
  tiktok:     { label:'TikTok',            top:0.073, bottom:0.229, left:0.046, right:0.148 },
  instagram:  { label:'Instagram Reels',   top:0.117, bottom:0.229, left:0.02,  right:0.111 },
  youtube:    { label:'YouTube Shorts',    top:0.198, bottom:0.198, left:0.056, right:0.111 },
};
let currentSafeZone = 'none';

function renderSafeZoneButtons() {
  const wrap = document.getElementById('safeZoneGrid');
  if (!wrap) return;
  wrap.innerHTML = '';
  const vertical = currentAspect === 'vertical';
  ['none', ...Object.keys(SAFE_ZONE_PRESETS)].forEach(id => {
    const btn = document.createElement('button');
    btn.className = 'szone-btn' + (id === currentSafeZone ? ' active' : '');
    btn.textContent = id === 'none' ? 'None' : SAFE_ZONE_PRESETS[id].label;
    if (!vertical && id !== 'none') { btn.disabled = true; btn.style.opacity = '0.4'; btn.style.cursor = 'not-allowed'; }
    btn.addEventListener('click', () => {
      currentSafeZone = id;
      renderSafeZoneButtons();
      updateSafeZoneOverlay();
      if (id !== 'none') {
        const moved = fitLayersToSafeZone();
        setStatus(moved
          ? `Nudged ${moved} layer${moved === 1 ? '' : 's'} clear of the ${SAFE_ZONE_PRESETS[id].label} safe zone.`
          : `All layers already clear of the ${SAFE_ZONE_PRESETS[id].label} safe zone.`);
      }
    });
    wrap.appendChild(btn);
  });
  const note = document.getElementById('safeZoneNote');
  if (note) {
    note.textContent = vertical
      ? 'Shaded bands show roughly where that app’s own UI (captions, like/share buttons, progress bar) covers your video. Guide only — never recorded or exported. Click a platform again anytime to re-fit layers you’ve since dragged into its band.'
      : 'Only meaningful in the Vertical video shape — TikTok, Reels, and Shorts are all vertical-only formats.';
  }
  const fitBtn = document.getElementById('btnFitSafeZone');
  if (fitBtn) {
    fitBtn.disabled = !vertical || currentSafeZone === 'none';
    fitBtn.onclick = () => {
      const moved = fitLayersToSafeZone();
      setStatus(moved
        ? `Nudged ${moved} layer${moved === 1 ? '' : 's'} clear of the ${SAFE_ZONE_PRESETS[currentSafeZone].label} safe zone.`
        : `All layers already clear of the ${SAFE_ZONE_PRESETS[currentSafeZone].label} safe zone.`);
    };
  }
}

// Pixel-space content rect that layers should stay clear of the excluded bands within —
// the full canvas when no platform guide is active, or the inset rect between the guide's
// shaded bands otherwise.
function safeZoneRect() {
  const zone = (currentAspect === 'vertical') ? SAFE_ZONE_PRESETS[currentSafeZone] : null;
  if (!zone) return { left: 0, top: 0, right: W, bottom: H };
  return { left: zone.left * W, top: zone.top * H, right: W - zone.right * W, bottom: H - zone.bottom * H };
}

// Nudges each top-level layer that pokes into the currently-selected safe zone back inside
// it, by translating only — never resizing/rescaling — using the same "read the absolute
// bounding rect, shift by a delta" technique as alignObjToCanvas(). A layer already wider or
// taller than the safe rect itself is aligned to its near edge as a best effort rather than
// forced to fit (there's nowhere to shrink it to without breaking the template's own sizing).
// Elements that intentionally span most of the frame (a full-bleed bar or backdrop panel) are
// left alone — nudging those isn't "fitting," it's breaking the layout they were meant to have.
// Returns the number of layers actually moved, for user-facing feedback.
function fitLayersToSafeZone() {
  const zone = safeZoneRect();
  if (zone.left === 0 && zone.top === 0 && zone.right === W && zone.bottom === H) return 0;
  const zoneW = zone.right - zone.left, zoneH = zone.bottom - zone.top;
  let moved = 0;
  canvas.getObjects().forEach(obj => {
    if (obj === bgMediaObj) return;
    const r = obj.getBoundingRect(true, true);
    if (r.width >= W * 0.92 || r.height >= H * 0.92) return;
    let dx = 0, dy = 0;
    if (r.width <= zoneW) {
      if (r.left < zone.left) dx = zone.left - r.left;
      else if (r.left + r.width > zone.right) dx = zone.right - (r.left + r.width);
    } else {
      dx = zone.left - r.left;
    }
    if (r.height <= zoneH) {
      if (r.top < zone.top) dy = zone.top - r.top;
      else if (r.top + r.height > zone.bottom) dy = zone.bottom - (r.top + r.height);
    } else {
      dy = zone.top - r.top;
    }
    if (dx || dy) {
      obj.set({ left: obj.left + dx, top: obj.top + dy });
      obj.setCoords();
      moved++;
    }
  });
  if (moved) canvas.requestRenderAll();
  return moved;
}

// Renders as a plain DOM overlay appended to Fabric's own canvas wrapper element, NOT as
// objects on the Fabric canvas — this is the same trick the transparent-background
// checkerboard uses. MediaRecorder captures canvas.lowerCanvasEl's own pixel buffer only, so
// anything living in sibling/child DOM here is automatically excluded from recorded video
// without any special-casing at record time. Percentage-based band sizing means it re-scales
// for free on window resize / aspect-ratio change with no extra JS.
function updateSafeZoneOverlay() {
  let el = document.getElementById('safeZoneOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'safeZoneOverlay';
    el.style.cssText = 'position:absolute; left:0; top:0; right:0; bottom:0; pointer-events:none; z-index:5;';
    canvas.wrapperEl.appendChild(el);
  }
  const zone = (currentAspect === 'vertical') ? SAFE_ZONE_PRESETS[currentSafeZone] : null;
  if (!zone) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.style.display = 'block';
  const band = 'position:absolute; background:rgba(255,45,85,0.24); box-shadow:inset 0 0 0 1px rgba(255,45,85,0.5); box-sizing:border-box;';
  el.innerHTML =
    `<div style="${band} left:0; top:0; right:0; height:${zone.top * 100}%;"></div>` +
    `<div style="${band} left:0; bottom:0; right:0; height:${zone.bottom * 100}%;"></div>` +
    `<div style="${band} left:0; top:0; bottom:0; width:${zone.left * 100}%;"></div>` +
    `<div style="${band} right:0; top:0; bottom:0; width:${zone.right * 100}%;"></div>`;
}

let bgMediaObj = null;   // fabric.Image for background (image or video-backed)
let bgVideoEl = null;    // underlying <video> element if background is a video
let customFonts = [];    // {family, dataUrl, mime} — imported by the user
// dataSources: {[id]: {id, name, type:'csv', timeField, entityField, valueField, unit, source,
// sourceUrl, records}} — user-pasted data, project-level like customFonts above. Shares the
// exact {records, timeField, entityField, valueField} shape TEMPORAL_FIXTURES entries already
// use, which is what lets temporalSourceFor() (see "Temporal data foundation") read from either
// with no special-casing. See "Data Source Registry" near PROJECT SAVE / LOAD for the paste-CSV
// UI and validation.
let dataSources = {};

/* ============ TEMPLATE PRESETS ============ */
function T(text, opts) {
  return Object.assign({ kind:'text', text }, opts);
}
function R(opts) { return Object.assign({ kind:'rect' }, opts); }
function C(opts) { return Object.assign({ kind:'circle' }, opts); }
function D(opts) { return Object.assign({ kind:'dotgrid' }, opts); }
function P(opts) { return Object.assign({ kind:'pin' }, opts); }
function O(opts) { return Object.assign({ kind:'orgchart' }, opts); }
function M(opts) { return Object.assign({ kind:'map' }, opts); }
function LN(opts) { return Object.assign({ kind:'temporalLine' }, opts); }
function TS(opts) { return Object.assign({ kind:'temporalStat' }, opts); }

/* ---- Dot-Grid Pictogram: built as one resizable "generated group" layer, not      ---- */
/* ---- hundreds of individually-draggable dots. Total/highlight are edited via      ---- */
/* ---- number fields in the properties panel, which regenerate the group in place.  ---- */
function buildDotGridGroup(total, highlight, highlightColor) {
  total = Math.max(1, Math.round(total));
  highlight = Math.min(total, Math.max(0, Math.round(highlight)));
  const boxW = Math.min(1400, W * 0.9), maxH = 380;
  let cols = Math.max(1, Math.ceil(Math.sqrt(total * (boxW / maxH))));
  let rows = Math.ceil(total / cols);
  let pitch = Math.min(boxW / cols, maxH / rows);
  pitch = Math.max(10, Math.min(34, pitch));
  const radius = pitch * 0.32;
  const baseCount = total - highlight;
  const dots = [];
  for (let i = 0; i < total; i++) {
    const row = Math.floor(i / cols), col = i % cols;
    const isHl = i >= baseCount;
    dots.push(new fabric.Circle({
      left: col * pitch + pitch/2, top: row * pitch + pitch/2,
      radius: isHl ? radius * 1.08 : radius,
      fill: isHl ? highlightColor : 'rgba(255,255,255,0.24)',
      originX: 'center', originY: 'center', selectable:false, evented:false,
    }));
  }
  return new fabric.Group(dots, { subTargetCheck:false });
}
function rebuildDotGrid(obj, patch) {
  const cfg = Object.assign({}, obj.data.dotgrid, patch);
  cfg.highlight = Math.min(cfg.total, cfg.highlight);
  const idx = canvas.getObjects().indexOf(obj);
  const anim = obj.data.anim;
  const newObj = buildDotGridGroup(cfg.total, cfg.highlight, cfg.highlightColor);
  newObj.set({ left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle, opacity: obj.opacity, originX: obj.originX, originY: obj.originY });
  newObj.set('name', obj.get('name'));
  newObj.data = { role:null, isCounter:false, anim, dotgrid: cfg };
  canvas.remove(obj);
  canvas.insertAt(idx, newObj);
  canvas.setActiveObject(newObj);
  canvas.requestRenderAll();
  refreshLayerList();
  selectProps(newObj);
  updateScrubRange();
}

/* ---- Map/Location Pin: a manual overlay marker, not a mapping feature — no tiles or geo   ---- */
/* ---- data (would need external requests, which the single-file architecture rules out).   ---- */
/* ---- Drop a map screenshot in as background media, then place pins on it. One regenerable  ---- */
/* ---- group, following the exact same pattern as Dot-Grid Pictogram above.                  ---- */
function buildPinGroup(label, color, style) {
  label = label || 'Location';
  color = color || COLORS.amberLight;
  style = style === 'dot' ? 'dot' : 'pin';
  const r = 16;
  const parts = [];
  if (style === 'pin') {
    const tw = r*1.1, th = r*0.9;
    parts.push(new fabric.Polygon([{x:-tw/2,y:0},{x:tw/2,y:0},{x:0,y:th}], {
      left:0, top:r*1.6, fill:color, originX:'center', originY:'top', selectable:false, evented:false,
    }));
  }
  parts.push(new fabric.Circle({ left:0, top:0, radius:r, fill:color, stroke:'#FFFFFF', strokeWidth:2, originX:'center', originY:'top', selectable:false, evented:false }));
  parts.push(new fabric.Circle({ left:0, top:r, radius:5, fill:'#FFFFFF', originX:'center', originY:'center', selectable:false, evented:false }));
  parts.push(new fabric.Textbox(label, { left:r+14, top:r, width:240, fontSize:24, fontWeight:700, fill:'#FFFFFF', textAlign:'left', originX:'left', originY:'center', selectable:false, evented:false, splitByGrapheme:false }));
  return new fabric.Group(parts, { subTargetCheck:false });
}
function rebuildPin(obj, patch) {
  const cfg = Object.assign({}, obj.data.pin, patch);
  const idx = canvas.getObjects().indexOf(obj);
  const anim = obj.data.anim;
  const newObj = buildPinGroup(cfg.label, cfg.color, cfg.style);
  newObj.set({ left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle, opacity: obj.opacity, originX: obj.originX, originY: obj.originY });
  newObj.set('name', obj.get('name'));
  newObj.data = { role:null, isCounter:false, anim, pin: cfg };
  canvas.remove(obj);
  canvas.insertAt(idx, newObj);
  canvas.setActiveObject(newObj);
  canvas.requestRenderAll();
  refreshLayerList();
  selectProps(newObj);
  updateScrubRange();
}

/* ================================================================================
   MAP GRAPHIC — geographic storytelling engine
   ================================================================================
   Replaces the old "one flat highlight list + one static route" version with a real
   per-map sub-timeline (data.map.events[]) so highlight/zoom/route/stat moments can each
   have their own start/duration/easing instead of being fused into one whole-group fade.
   Everything below is plain Fabric.js Canvas primitives — no SVG/DOM/GSAP — vendored
   region path data (src/map_data.js) + hand-written geometry (this file) + the existing
   applyFrame() rAF loop, which now also drives a map object's internal timeline.

   Architecture (see CLAUDE.md "Map Graphic" note for the full writeup):

     Map object (one fabric.Group, like Dot-Grid/Pin/Org-Chart)
       data.map = {
         scope, baseTransform: {left,top,scaleX,scaleY},   // camera reference ("full extent")
         events: [ {type:'highlight'|'zoom'|'route'|'stat', start, duration, ...}, ... ],
         _runtime: { regionPaths, routeGroups, statGroups } // cached child refs, rebuilt each
       }                                                     // time the group is regenerated

   buildMapGroup() renders the FINAL/settled state of every event (used for the static
   editor view, same convention every other layer already follows: edit mode shows the
   resting look, Preview/Record is what actually plays the animation).
   applyMapTimeline() is the per-frame counterpart, called from applyFrame() during
   Preview/scrub — it interpolates the SAME target values buildMapGroup() computes, so
   the animation always lands exactly on the static look, never a mismatched "pop".

   ---- Map rendering: vector-quality zoom (why every shape below sets objectCaching:false) ----
   ROOT CAUSE (diagnosed, not guessed — reproduced with a direct Fabric internals inspection):
   this map is real vector geometry the whole way through (SVG path data in src/map_data.js ->
   fabric.Path, never a raster image or a pre-rendered bitmap) and the canvas backing store
   already matches the project's real export resolution 1:1 (no missing retina scaling, no CSS
   stretching — devicePixelRatio contributes nothing extra in the headless/test environment and
   isn't the bug even where it does). The pixelation came from Fabric's own object-cache
   optimization: by default, an object with objectCaching:true (Fabric's default for every
   object type) renders itself once into an offscreen bitmap sized for its CURRENT effective
   scale, then reuses that bitmap on later frames instead of re-rendering — a real win for
   objects that render expensively and rarely change. But that cache is capped at a fixed total
   pixel budget (fabric.config.perfLimitSizeTotal, 2^21 ~= 2.1 megapixels) regardless of the
   object's actual on-screen size: once camera zoom pushes an object's needed resolution past
   that budget, Fabric's _limitCacheSize() silently shrinks the cache bitmap to fit, and then
   STRETCHES that undersized bitmap to cover the real (larger) on-screen area — visible pixel
   blocks, with the underlying vector data completely untouched. Confirmed by inspecting a
   zoomed map object's internal zoomX (the scale its cache was actually rendered at) against its
   real scaleX (the scale it's actually displayed at) after a camera zoom: pre-fix, a group
   cached at 2.39x was being displayed at 5.91x — and its cache canvas measured exactly
   1467x1429px, i.e. 1467*1429 = 2,096,343, matching perfLimitSizeTotal (2,097,152) almost to
   the pixel. That match is what turned "seems related to caching" into a confirmed root cause.

   THE FIX is objectCaching:false on every shape this module builds (region Paths, route
   line/dots/marker, stat card rect+text) plus the top-level Group itself — not a global
   Fabric setting change (every other layer type in this app keeps Fabric's default caching
   unchanged). This is a narrow, reasoned exception rather than "caching is bad": this whole
   group is re-scaled every single frame during any camera move (applyCameraState() sets a new
   scaleX/scaleY/left/top on it each requestAnimationFrame tick), so a bitmap cache never
   actually gets reused during the exact moments zoom quality is visible to a viewer — Fabric
   ends up re-rendering the cache almost every frame anyway, meaning the cache was already
   buying near-zero benefit here while remaining a live correctness hazard. Verified this holds
   at the campaign's actual worst case, not just the small region first caught: a full manual
   6x zoom (MAX_CAMERA_ZOOM) on Hokkaidō — the largest Japan prefecture's path, ~7x Kanagawa's
   bounding box — settles with the region Path's own cache-relevant zoomX exactly equal to the
   group's real scaleX (5.98 == 5.98, no mismatch), because with objectCaching:false the shape
   is drawn fresh against the real canvas context every frame instead of through any cache.

   WHY NOT rely on per-object caching just being "small enough" instead: it would have worked
   for the specific regions tested by luck of their size relative to the 1920x1080 canvas this
   app currently ships, not by any actual guarantee — a canvas backing store larger than
   ~1447x1447 (2.1 effective megapixels) makes even a single full-frame-filling Path exceed
   perfLimitSizeTotal again, which is a real future risk (e.g. a hypothetical 4K/3840x2160
   export preset) that a "happens to be under budget today" fix would silently reintroduce.
   Disabling caching on this bounded, fixed-size set of map shapes (a few dozen simple paths/
   circles/text per map, not thousands of objects) is what makes the map's sharpness a real
   architectural guarantee instead of a coincidence of today's canvas size.
   ================================================================================ */

// ---- geographic dataset registry -------------------------------------------------------
// GeographicDataset: {id, label, kind:'modern'|'historical', features: GeographicFeature[]}.
// GeographicFeature: whatever a dataset's source data already shapes its entries as — for the
// two vendored datasets below, {id, name, kanji?, region?, path}. Nothing downstream (
// regionAnchor/computeCameraTarget/findRegionAtPoint/buildMapGroup/statAnchorPoint/the map
// event control manifest) reads anything beyond `.name` and `.path` — they operate on "a named
// region with an SVG path" generically, never assuming "prefecture" or "country" specifically.
// That's what makes this a real extension point rather than a relabeling: a future historical
// dataset (`GEOGRAPHIC_DATASETS['historical-sengoku'] = {kind:'historical', features:[...]}`)
// slots in without touching any engine function, PROVIDED its features are shaped the same way.
// A feature MAY carry an optional `meta` object for provenance a modern prefecture doesn't need
// (`dateStart`/`dateEnd`/`controller`/`disputed`/`approximate`/`source`/`confidence`) — nothing
// here requires it, reads it, or renders it; it's reserved space for whenever a historical
// dataset actually exists (see CLAUDE.md's "Historical map layer" note for why none is vendored
// yet — no rendering or UI work is worth doing before a real, sourced dataset is in hand).
const GEOGRAPHIC_DATASETS = {
  world: { id: 'world', label: 'World', kind: 'modern', get features() { return WORLD_MAP_DATA.countries; } },
  japan: { id: 'japan', label: 'Japan prefectures', kind: 'modern', get features() { return JAPAN_MAP_DATA.prefectures; } },
};
function normalizeMapScope(scope) { return GEOGRAPHIC_DATASETS[scope] ? scope : 'world'; }
function mapRegionsFor(scope) {
  return GEOGRAPHIC_DATASETS[normalizeMapScope(scope)].features;
}

// ---- geometry: parsing the vendored path data ----------------------------------------
// Vendored region paths (src/map_data.js) use only M/m, L/l, Z/z, sometimes as SVG's
// compact relative-lineto shorthand (chained coordinate pairs after one command letter).
function parseMapPathSubpaths(pathStr) {
  const tokens = pathStr.match(/[MLZmlz]|-?\d*\.?\d+/g) || [];
  const subpaths = [];
  let current = null, cx = 0, cy = 0, cmd = null, i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (/^[MLZmlz]$/.test(tok)) { cmd = tok; i++; continue; }
    const x = parseFloat(tok), y = parseFloat(tokens[i + 1]);
    i += 2;
    if (cmd === 'M' || cmd === 'L') { cx = x; cy = y; }
    else if (cmd === 'm' || cmd === 'l') { cx += x; cy += y; }
    if (cmd === 'M' || cmd === 'm') {
      if (current && current.length > 2) subpaths.push(current);
      current = [[cx, cy]];
      cmd = (cmd === 'M') ? 'L' : 'l';
    } else {
      if (!current) current = [[cx, cy]]; else current.push([cx, cy]);
    }
  }
  if (current && current.length > 2) subpaths.push(current);
  return subpaths;
}
function polygonAreaCentroid(points) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i], p1 = points[(i + 1) % points.length];
    const cross = p0[0] * p1[1] - p1[0] * p0[1];
    a += cross; cx += (p0[0] + p1[0]) * cross; cy += (p0[1] + p1[1]) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return { area: 0, x: xs.reduce((s, v) => s + v, 0) / xs.length, y: ys.reduce((s, v) => s + v, 0) / ys.length };
  }
  return { area: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) };
}
function boundsOfPoints(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  return { minX, minY, maxX, maxY };
}
// A region's raw bounding-box center is NOT a safe "where is this place" anchor: several
// prefectures/countries include far-flung islands or get split at the antimeridian (Tokyo's
// bbox reaches ~500km south to the Izu/Ogasawara islands; Russia's spans almost the entire
// map width when split at +/-180deg), which drags a naive bbox-center miles from the actual
// landmass — this was the root cause of routes not starting/ending where expected. Parsing
// into subpaths and taking the largest-by-area one's true polygon centroid (shoelace
// formula) fixes this — the same "largest ring wins" convention GIS label-placement tools
// use — for BOTH route anchors and camera zoom targets.
const _regionAnchorCache = new Map();
function regionAnchor(scope, name, pathStr) {
  const key = scope + '|' + name;
  if (_regionAnchorCache.has(key)) return _regionAnchorCache.get(key);
  const subpaths = parseMapPathSubpaths(pathStr);
  let best = null;
  for (const sp of subpaths) {
    const c = polygonAreaCentroid(sp);
    if (!best || c.area > best.area) best = { x: c.x, y: c.y, area: c.area, bounds: boundsOfPoints(sp) };
  }
  _regionAnchorCache.set(key, best);
  return best;
}
function pointInPolygon(px, py, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1], xj = points[j][0], yj = points[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function findRegionAtPoint(scope, px, py) {
  for (const r of mapRegionsFor(scope)) {
    for (const sp of parseMapPathSubpaths(r.path)) {
      if (pointInPolygon(px, py, sp)) return r.name;
    }
  }
  return null;
}
const _mapNativeBoundsCache = new Map();
function mapNativeBounds(scope) {
  if (_mapNativeBoundsCache.has(scope)) return _mapNativeBoundsCache.get(scope);
  const regions = mapRegionsFor(scope);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  regions.forEach(r => {
    for (const sp of parseMapPathSubpaths(r.path)) {
      const b = boundsOfPoints(sp);
      if (b.minX < minX) minX = b.minX; if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX; if (b.maxY > maxY) maxY = b.maxY;
    }
  });
  const result = { minX, minY, maxX, maxY };
  _mapNativeBoundsCache.set(scope, result);
  return result;
}

// ---- color + easing -------------------------------------------------------------------
function parseColorToRgba(c) {
  if (!c) return { r: 255, g: 255, b: 255, a: 0 };
  c = String(c).trim();
  if (c.startsWith('rgb')) {
    const nums = (c.match(/[\d.]+/g) || [255, 255, 255]).map(Number);
    return { r: nums[0], g: nums[1], b: nums[2], a: nums.length > 3 ? nums[3] : 1 };
  }
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: 1 };
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}
function lerpColor(colorA, colorB, t) {
  const a = parseColorToRgba(colorA), b = parseColorToRgba(colorB);
  const r = Math.round(a.r + (b.r - a.r) * t), g = Math.round(a.g + (b.g - a.g) * t), bl = Math.round(a.b + (b.b - a.b) * t);
  const al = a.a + (b.a - a.a) * t;
  return `rgba(${r},${g},${bl},${al.toFixed(3)})`;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(t) { return Math.max(0, Math.min(1, t)); }
// Disney's "slow in / slow out" — the standard for camera moves, color settles and any
// transition that should feel considered rather than mechanical (vs. the app's existing
// ease() cubic-out, kept for simple entrances elsewhere). See CLAUDE.md map research notes.
function easeInOutCubic(t) { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

// ---- quadratic bezier: point, tangent angle, arc-length table -------------------------
function bezierPoint(p0, c, p2, t) {
  const mt = 1 - t;
  return { x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p2.x, y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p2.y };
}
function bezierTangentAngle(p0, c, p2, t) {
  const mt = 1 - t;
  const dx = 2 * mt * (c.x - p0.x) + 2 * t * (p2.x - c.x);
  const dy = 2 * mt * (c.y - p0.y) + 2 * t * (p2.y - c.y);
  return Math.atan2(dy, dx) * 180 / Math.PI;
}
function buildArcLengthTable(p0, c, p2, samples) {
  samples = samples || 40;
  const table = [{ t: 0, cum: 0 }];
  let prev = p0, cum = 0;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const pt = bezierPoint(p0, c, p2, t);
    cum += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    table.push({ t, cum });
    prev = pt;
  }
  return table;
}
// Finds the parameter t whose arc-length fraction along the curve equals `frac` (0..1) —
// gives visually constant travel speed along a curved route instead of the uneven speed a
// raw parametric t would produce on a sharply bowed bezier. Standard technique (the same
// idea as SVGPathElement.getPointAtLength, which Fabric.js canvas paths don't expose).
function tAtArcFraction(table, frac) {
  const total = table[table.length - 1].cum;
  const target = clamp01(frac) * total;
  for (let i = 1; i < table.length; i++) {
    if (table[i].cum >= target) {
      const a = table[i - 1], b = table[i];
      const span = b.cum - a.cum;
      const localT = span > 1e-9 ? (target - a.cum) / span : 0;
      return lerp(a.t, b.t, localT);
    }
  }
  return 1;
}

// ---- camera framing: D3 fitExtent-style bounds-to-viewport fit ------------------------
// Computes how far to zoom/pan (relative to the map's own "full extent" base placement) so
// a target region fills a good portion of the frame the whole map currently occupies, with
// padding — the same fit-to-bounds idea d3-geo's projection.fitExtent uses, just expressed
// as a Fabric Group scale/translate delta instead of a re-projection. Supports chaining
// (fromState = a previous zoom event's own target) for multi-stage camera moves.
// A prefecture-scale region (Kanagawa) can be 1/15th the width of the whole Japan map, which
// an uncapped "fit the region to the frame" formula would zoom into literally — technically
// accurate, but it reads as a jarring, un-cinematic lurch rather than a considered camera
// move, and blows up anything anchored to that spot (a stat card's own on-screen size scales
// with the whole map group, camera included — see the stat block below). Capping how far any
// single stage can push in keeps every zoom stage looking like a deliberate editorial choice.
const MAX_CAMERA_ZOOM = 6;
function computeCameraTarget(scope, regionName, padding, manual) {
  const full = mapNativeBounds(scope);
  const nativeCenter = { x: (full.minX + full.maxX) / 2, y: (full.minY + full.maxY) / 2 };
  if (manual && typeof manual.zoom === 'number') {
    // Manual framing is expressed to the creator as a percentage of the map's own half-width/
    // half-height ("shift the camera by up to half the map"), never as raw native coordinates
    // or a transform matrix — converting here, where `full` is already in scope, keeps that
    // percentage-based UI value the one source of truth rather than needing the same
    // half-width/half-height math duplicated wherever a manual event gets read.
    const fullW = full.maxX - full.minX, fullH = full.maxY - full.minY;
    return {
      scaleMultiplier: Math.max(1, Math.min(MAX_CAMERA_ZOOM, manual.zoom)),
      dxNative: (manual.xPct || 0) / 100 * (fullW / 2),
      dyNative: (manual.yPct || 0) / 100 * (fullH / 2),
    };
  }
  if (!regionName) return { scaleMultiplier: 1, dxNative: 0, dyNative: 0 };
  const region = mapRegionsFor(scope).find(r => r.name.toLowerCase() === regionName.toLowerCase());
  if (!region) return { scaleMultiplier: 1, dxNative: 0, dyNative: 0 };
  const anchor = regionAnchor(scope, region.name, region.path);
  const rb = anchor.bounds;
  const pad = typeof padding === 'number' ? padding : 0.2;
  const regionW = Math.max(1, rb.maxX - rb.minX) * (1 + pad * 2);
  const regionH = Math.max(1, rb.maxY - rb.minY) * (1 + pad * 2);
  const fullW = full.maxX - full.minX, fullH = full.maxY - full.minY;
  const scaleMultiplier = Math.max(1, Math.min(MAX_CAMERA_ZOOM, fullW / regionW, fullH / regionH));
  const regionCenter = { x: (rb.minX + rb.maxX) / 2, y: (rb.minY + rb.maxY) / 2 };
  return { scaleMultiplier, dxNative: regionCenter.x - nativeCenter.x, dyNative: regionCenter.y - nativeCenter.y };
}
// Applies a camera state (as returned by computeCameraTarget, or interpolated between two
// of them) to the map group's actual transform. Scaling/panning the WHOLE group is what
// keeps every child — regions, routes, markers, labels — perfectly attached during the
// move, since they're all one Fabric object being transformed together, not independently
// animated pieces trying to stay in sync.
function applyCameraState(obj, base, camState) {
  const newScaleX = base.scaleX * camState.scaleMultiplier;
  const newScaleY = base.scaleY * camState.scaleMultiplier;
  obj.set({
    scaleX: newScaleX, scaleY: newScaleY,
    left: base.left - camState.dxNative * newScaleX,
    top: base.top - camState.dyNative * newScaleY,
  });
}
function lerpCameraState(a, b, t) {
  return { scaleMultiplier: lerp(a.scaleMultiplier, b.scaleMultiplier, t), dxNative: lerp(a.dxNative, b.dxNative, t), dyNative: lerp(a.dyNative, b.dyNative, t) };
}

// ---- route geometry & presets -----------------------------------------------------------
const ROUTE_CURVE_FACTORS = { straight: 0, low: 0.12, medium: 0.26, high: 0.42 };
function routeGeometry(from, to, curve) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const factor = ROUTE_CURVE_FACTORS[curve] != null ? ROUTE_CURVE_FACTORS[curve] : ROUTE_CURVE_FACTORS.medium;
  const bow = dist * factor;
  const mx = (from.x + to.x) / 2 - (dy / dist) * bow;
  const my = (from.y + to.y) / 2 + (dx / dist) * bow;
  const control = { x: mx, y: my };
  const table = buildArcLengthTable(from, control, to, 40);
  return { from, to, control, table, dist };
}
// A small abstract dart/chevron silhouette for the 'plane' moving-object preset — reads as
// "aircraft" at documentary/editorial scale without a literal, cartoonish icon.
function buildPlaneShape(color) {
  return new fabric.Path('M 0 -11 L 3.5 -2 L 11 3 L 3 3.6 L 3.6 10 L 0 7 L -3.6 10 L -3 3.6 L -11 3 L -3.5 -2 Z', {
    fill: color, stroke: 'rgba(0,0,0,0.25)', strokeWidth: 0.6, originX: 'center', originY: 'center', selectable: false, evented: false, objectCaching: false,
  });
}
function buildArrowHeadShape(color) {
  return new fabric.Triangle({ width: 18, height: 20, fill: color, originX: 'center', originY: 'center', selectable: false, evented: false, objectCaching: false });
}

// ---- statistics overlay (map-space: anchored to a region, or a default caption spot) ---
function statAnchorPoint(scope, e) {
  if (e.region) {
    const region = mapRegionsFor(scope).find(r => r.name.toLowerCase() === e.region.toLowerCase());
    if (region) { const a = regionAnchor(scope, region.name, region.path); return { x: a.x, y: a.y }; }
  }
  const b = mapNativeBounds(scope);
  return { x: (b.minX + b.maxX) / 2, y: b.maxY - (b.maxY - b.minY) * 0.06 };
}
function buildStatCard(e, anchor) {
  const parts = e.value != null && e.value !== '' ? parseCounterParts(String(e.value)) : null;
  const finalValueText = e.value != null ? String(e.value) + (e.unit ? ' ' + e.unit : '') : '';
  const cardW = 208, padX = 16, padY = 12;
  const hasSecondary = !!e.secondary, hasSource = !!e.source;
  // Cursor-based layout (rather than hand-tuned magic offsets for every row combination) —
  // each row advances a running Y and reports where it ended, so cardH and every other row's
  // position fall out of that instead of needing to be kept in sync by hand.
  let cursorY = padY;
  const labelText = new fabric.Textbox((e.label || '').toUpperCase(), { left: 0, top: cursorY, width: cardW - padX * 2, fontSize: 12.5, fontWeight: 700, fill: 'rgba(255,255,255,0.7)', charSpacing: 50, originX: 'left', originY: 'top', textAlign: 'left', selectable: false, evented: false, splitByGrapheme: false, objectCaching: false });
  cursorY += 20;
  const valueText = new fabric.Textbox(finalValueText, { left: 0, top: cursorY, width: cardW - padX * 2, fontSize: 27, fontWeight: 800, fill: '#FFFFFF', originX: 'left', originY: 'top', textAlign: 'left', selectable: false, evented: false, splitByGrapheme: false, objectCaching: false });
  cursorY += 34;
  let secondaryText = null;
  if (hasSecondary) {
    secondaryText = new fabric.Textbox(e.secondary, { left: 0, top: cursorY, width: cardW - padX * 2, fontSize: 13.5, fontWeight: 600, fill: COLORS.tealLight, originX: 'left', originY: 'top', textAlign: 'left', selectable: false, evented: false, splitByGrapheme: false, objectCaching: false });
    cursorY += 22;
  }
  let sourceText = null;
  if (hasSource) {
    sourceText = new fabric.Textbox('SOURCE — ' + e.source, { left: 0, top: cursorY, width: cardW - padX * 2, fontSize: 10, fontWeight: 600, fill: 'rgba(255,255,255,0.5)', charSpacing: 15, originX: 'left', originY: 'top', textAlign: 'left', selectable: false, evented: false, splitByGrapheme: false, objectCaching: false });
    cursorY += 18;
  }
  const cardH = cursorY + padY;
  const x0 = anchor.x - padX, y0 = anchor.y - cardH * 0.55;
  // Shapes were laid out with top=0 at the card's own content origin — shift every one down
  // by (x0,y0) now that the card's total height (and therefore y0, which depends on cardH) is
  // known, rather than threading x0/y0 through the cursor loop above.
  [labelText, valueText, secondaryText, sourceText].forEach(o => { if (o) o.set({ left: o.left + x0 + padX, top: o.top + y0 }); });
  const bg = new fabric.Rect({ left: x0, top: y0, width: cardW, height: cardH, rx: 9, ry: 9, fill: 'rgba(13,22,40,0.78)', stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1, originX: 'left', originY: 'top', selectable: false, evented: false, objectCaching: false });
  const shapes = [bg, labelText, valueText];
  if (secondaryText) shapes.push(secondaryText);
  if (sourceText) shapes.push(sourceText);
  // Each shape's position relative to the anchor, recorded at this (unzoomed) base scale —
  // applyMapTimeline replays these as anchor + offset*counterScale each frame, so the card
  // stays the same screen distance from its region regardless of camera zoom (see the
  // counter-scaling note beside camScaleMultiplier for why the card can't just inherit the
  // group's own zoom scale the way a highlight/route/marker legitimately does).
  const offsetOf = (o) => ({ dx: o.left - anchor.x, dy: o.top - anchor.y });
  const offsets = { bg: offsetOf(bg), labelText: offsetOf(labelText), valueText: offsetOf(valueText) };
  if (secondaryText) offsets.secondaryText = offsetOf(secondaryText);
  if (sourceText) offsets.sourceText = offsetOf(sourceText);
  return { shapes, labelText, valueText, secondaryText, sourceText, bg, counterParts: parts, finalValueText, anchor, offsets };
}

// ---- event list helpers -----------------------------------------------------------------
function newMapEventId() { return 'ev_' + Math.random().toString(36).slice(2, 9); }
const MAP_EVENT_DEFAULTS = {
  highlight: () => ({ type: 'highlight', id: newMapEventId(), region: '', color: COLORS.tealLight, start: 0, duration: 700, dim: true }),
  zoom: () => ({ type: 'zoom', id: newMapEventId(), region: '', padding: 0.22, start: 0, duration: 1200 }),
  route: () => ({ type: 'route', id: newMapEventId(), from: '', to: '', style: 'arrow', curve: 'medium', movingObject: 'arrow', color: COLORS.amberLight, showTrail: true, start: 0, duration: 1800 }),
  // `source` is VISIBLE TEXT — buildStatCard() renders it as a small caption on the card
  // itself. `sourceUrl` is EDITOR-ONLY METADATA — a reference for whoever is fact-checking the
  // scene, saved into the project JSON like any other field, but never read by anything that
  // draws to the canvas. Keeping these as two separate fields (rather than one that's
  // sometimes shown and sometimes not) is what the "distinguish editor metadata from visible
  // source text" requirement means in practice; a future `institution`/`dataset`/`confidence`
  // provenance set would extend this same pattern rather than overload `source` further.
  stat: () => ({ type: 'stat', id: newMapEventId(), region: '', label: 'Population', value: '', unit: '', secondary: '', source: '', sourceUrl: '', countUp: true, start: 0, duration: 900 }),
};
// Old saved projects/templates only ever had a flat `highlights` list and one static
// `routeFrom`/`routeTo` — synthesize equivalent events (staggered so it still reads as a
// sequence rather than everything landing at once) so those keep working unmodified.
function migrateMapConfig(cfg) {
  if (cfg.events) return cfg;
  const events = [];
  let t = 0;
  (cfg.highlights || []).forEach(h => {
    events.push({ type: 'highlight', id: newMapEventId(), region: h.name, color: h.color, start: t, duration: 600, dim: false });
    t += 300;
  });
  if (cfg.routeFrom && cfg.routeTo) {
    events.push({ type: 'route', id: newMapEventId(), from: cfg.routeFrom, to: cfg.routeTo, style: 'arrow', curve: 'medium', movingObject: 'arrow', color: cfg.routeColor || COLORS.amberLight, showTrail: true, start: t, duration: 1800 });
  }
  return Object.assign({}, cfg, { events });
}

// ---- build (final/settled state — the editor's non-playing view) ----------------------
function buildMapGroup(scope, events) {
  scope = normalizeMapScope(scope);
  events = events || [];
  const regions = mapRegionsFor(scope);
  const shapes = [];
  const regionPaths = new Map();
  const baseFill = 'rgba(255,255,255,0.14)', baseStroke = 'rgba(255,255,255,0.45)';
  const baseStrokeWidth = scope === 'japan' ? 1.2 : 0.7;

  const highlightEvents = events.filter(e => e.type === 'highlight' && e.region);
  const finalHighlight = new Map();
  let anyDim = false;
  highlightEvents.forEach(e => { finalHighlight.set(e.region.toLowerCase(), { color: e.color || COLORS.amberLight }); if (e.dim !== false) anyDim = true; });

  regions.forEach(r => {
    const hl = finalHighlight.get(r.name.toLowerCase());
    const path = new fabric.Path(r.path, {
      fill: hl ? hl.color : baseFill,
      stroke: hl ? '#FFFFFF' : baseStroke,
      strokeWidth: hl ? baseStrokeWidth * 2 : baseStrokeWidth,
      strokeLineJoin: 'round',
      opacity: (anyDim && !hl) ? 0.35 : 1,
      selectable: false, evented: false, objectCaching: false,
    });
    shapes.push(path);
    regionPaths.set(r.name, path);
  });

  const routeRuntimes = new Map();
  events.filter(e => e.type === 'route' && e.from && e.to).forEach(e => {
    const fromR = regions.find(r => r.name.toLowerCase() === e.from.toLowerCase());
    const toR = regions.find(r => r.name.toLowerCase() === e.to.toLowerCase());
    if (!fromR || !toR) return;
    const fromA = regionAnchor(scope, fromR.name, fromR.path), toA = regionAnchor(scope, toR.name, toR.path);
    const geo = routeGeometry({ x: fromA.x, y: fromA.y }, { x: toA.x, y: toA.y }, e.curve);
    const color = e.color || COLORS.amberLight;
    const d = `M ${geo.from.x} ${geo.from.y} Q ${geo.control.x} ${geo.control.y} ${geo.to.x} ${geo.to.y}`;
    const lineShape = new fabric.Path(d, {
      fill: '', stroke: color, strokeWidth: e.style === 'flight' ? 3.2 : 4.5, strokeLineCap: 'round',
      strokeDashArray: e.dashed ? [11, 9] : null, opacity: e.showTrail === false ? 0 : 0.85, selectable: false, evented: false, objectCaching: false,
    });
    const originDot = e.originMarker !== 'none' ? new fabric.Circle({ left: geo.from.x, top: geo.from.y, radius: 6, fill: color, stroke: '#FFFFFF', strokeWidth: 1.5, originX: 'center', originY: 'center', selectable: false, evented: false, objectCaching: false }) : null;
    const destDot = e.destMarker !== 'none' ? new fabric.Circle({ left: geo.to.x, top: geo.to.y, radius: 6, fill: color, stroke: '#FFFFFF', strokeWidth: 1.5, originX: 'center', originY: 'center', selectable: false, evented: false, objectCaching: false }) : null;
    let marker = null;
    const finalAngle = bezierTangentAngle(geo.from, geo.control, geo.to, 1);
    if (e.movingObject === 'plane') { marker = buildPlaneShape(color); marker.set({ left: geo.to.x, top: geo.to.y, angle: finalAngle + 90 }); }
    else if (e.movingObject === 'arrow') { marker = buildArrowHeadShape(color); marker.set({ left: geo.to.x, top: geo.to.y, angle: finalAngle + 90 }); }
    shapes.push(lineShape);
    if (originDot) shapes.push(originDot);
    if (destDot) shapes.push(destDot);
    if (marker) shapes.push(marker);
    routeRuntimes.set(e.id, { lineShape, originDot, destDot, marker, geo, totalLen: geo.table[geo.table.length - 1].cum });
  });

  const statRuntimes = new Map();
  events.filter(e => e.type === 'stat').forEach(e => {
    const anchor = statAnchorPoint(scope, e);
    const built = buildStatCard(e, anchor);
    shapes.push(...built.shapes);
    statRuntimes.set(e.id, built);
  });

  // Fabric.Group re-origins every child's left/top to be relative to the group's own
  // bounding-box center at construction time (verified empirically — see the map-system
  // design notes). That shift is one constant (dx,dy) applied identically to every child,
  // so capturing it once (via a shape whose pre-group native position we still know) lets
  // any later per-frame update convert a native coordinate back into the right
  // group-relative position — needed for the moving route marker.
  const refShape = shapes[0];
  const preGroupLeft = refShape.left, preGroupTop = refShape.top;
  // objectCaching:false on the group AND on every shape built above (region Paths, route
  // line/dots/marker, stat card rect+text) — see "Map rendering: vector-quality zoom" near
  // the top of this file for the full root-cause writeup. Short version: this whole group is
  // re-scaled every frame during any camera move, so a per-object bitmap cache buys nothing
  // during the exact moments zoom quality matters (it just gets re-rendered every frame
  // anyway) while remaining a correctness hazard the rest of the time — Fabric's cache is
  // capped at a fixed total pixel budget (fabric.config.perfLimitSizeTotal, 2^21px)
  // regardless of the object's actual on-screen size, so once zoom pushes a cached object
  // past that budget, Fabric silently renders it into an undersized bitmap and stretches
  // that bitmap to fill the real on-screen area — visible pixelation with the vector data
  // itself untouched. Disabling caching on this bounded set of map shapes (never done
  // globally — every other layer type keeps Fabric's default caching) makes Fabric draw them
  // directly against the real canvas context every frame, at full backing-store resolution,
  // so the map stays vector-sharp at any zoom/export resolution the camera or canvas can reach.
  const group = new fabric.Group(shapes, { subTargetCheck: false, objectCaching: false });
  const groupOffsetX = preGroupLeft - refShape.left, groupOffsetY = preGroupTop - refShape.top;
  return { group, runtime: { regionPaths, routeRuntimes, statRuntimes, groupOffsetX, groupOffsetY } };
}

function rebuildMap(obj, patch) {
  const cfg = Object.assign({}, obj.data.map, patch);
  const idx = canvas.getObjects().indexOf(obj);
  const anim = obj.data.anim;
  const baseTransform = obj.data.map.baseTransform; // preserved across edits — see note below
  const { group: newObj, runtime } = buildMapGroup(cfg.scope, cfg.events);
  newObj.set({ left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle, opacity: obj.opacity, originX: obj.originX, originY: obj.originY });
  newObj.set('name', obj.get('name'));
  cfg._runtime = runtime;
  // If this edit changed the base placement itself (drag/resize with no zoom event active),
  // treat the object's current transform as the new camera "full extent" reference.
  const hasZoom = (cfg.events || []).some(e => e.type === 'zoom');
  cfg.baseTransform = hasZoom ? baseTransform : { left: newObj.left, top: newObj.top, scaleX: newObj.scaleX, scaleY: newObj.scaleY };
  newObj.data = { role: null, isCounter: false, anim, map: cfg };
  canvas.remove(obj);
  canvas.insertAt(idx, newObj);
  canvas.setActiveObject(newObj);
  canvas.requestRenderAll();
  refreshLayerList();
  selectProps(newObj);
  updateScrubRange();
}

// ---- playback: per-frame interpolation (called from applyFrame during Preview/scrub) ---
function applyMapTimeline(obj, elapsed) {
  const cfg = obj.data.map;
  if (!cfg || !cfg.events || !cfg.events.length) return;
  const rt = cfg._runtime;
  if (!rt) return;
  const scope = cfg.scope;
  const offX = rt.groupOffsetX || 0, offY = rt.groupOffsetY || 0;

  // --- highlight + dim ---
  const highlightEvents = cfg.events.filter(e => e.type === 'highlight' && e.region);
  const activeTouch = new Map(); // region name (lower) -> {t, color}
  highlightEvents.forEach(e => {
    if (elapsed < e.start) return;
    const t = easeInOutCubic((elapsed - e.start) / e.duration);
    activeTouch.set(e.region.toLowerCase(), { t, color: e.color || COLORS.amberLight });
  });
  const anyDimActive = highlightEvents.some(e => e.dim !== false && elapsed >= e.start);
  const dimT = anyDimActive ? Math.max(0, ...highlightEvents.filter(e => e.dim !== false && elapsed >= e.start).map(e => easeInOutCubic((elapsed - e.start) / e.duration))) : 0;
  const baseFill = 'rgba(255,255,255,0.14)', baseStroke = 'rgba(255,255,255,0.45)';
  const baseSW = scope === 'japan' ? 1.2 : 0.7;
  rt.regionPaths.forEach((path, name) => {
    const touch = activeTouch.get(name.toLowerCase());
    if (touch) {
      path.set({ fill: lerpColor(baseFill, touch.color, touch.t), stroke: lerpColor(baseStroke, '#FFFFFF', touch.t), strokeWidth: lerp(baseSW, baseSW * 2, touch.t), opacity: 1 });
    } else {
      path.set({ fill: baseFill, stroke: baseStroke, strokeWidth: baseSW, opacity: lerp(1, 0.35, dimT) });
    }
  });

  // --- camera (chained zoom stages) ---
  const zoomEvents = cfg.events.filter(e => e.type === 'zoom').sort((a, b) => a.start - b.start);
  let camScaleMultiplier = 1;
  if (zoomEvents.length && cfg.baseTransform) {
    let camState = { scaleMultiplier: 1, dxNative: 0, dyNative: 0 };
    for (const e of zoomEvents) {
      const target = computeCameraTarget(scope, e.region, e.padding, e.manual ? { zoom: e.manualZoom || 2, xPct: e.manualX, yPct: e.manualY } : null);
      if (elapsed < e.start) break;
      const t = elapsed >= e.start + e.duration ? 1 : easeInOutCubic((elapsed - e.start) / e.duration);
      camState = lerpCameraState(camState, target, t);
    }
    applyCameraState(obj, cfg.baseTransform, camState);
    obj.setCoords();
    camScaleMultiplier = camState.scaleMultiplier;
  }

  // --- routes: path draw + marker travel with tangent-based rotation ---
  cfg.events.filter(e => e.type === 'route').forEach(e => {
    const r = rt.routeRuntimes.get(e.id);
    if (!r) return;
    const raw = (elapsed - e.start) / e.duration;
    const revealFrac = clamp01(raw);
    const eased = easeInOutCubic(raw);
    if (r.lineShape) {
      r.lineShape.set({ strokeDashArray: [r.totalLen, r.totalLen], strokeDashOffset: r.totalLen * (1 - revealFrac), opacity: e.showTrail === false ? 0 : (raw < 0 ? 0 : 0.85) });
    }
    if (r.originDot) r.originDot.set({ opacity: raw < 0 ? 0 : Math.min(1, Math.max(raw, 0) * 6) });
    if (r.destDot) r.destDot.set({ opacity: revealFrac >= 0.985 ? 1 : 0 });
    if (r.marker) {
      if (raw < 0) {
        r.marker.set({ opacity: 0 });
      } else {
        const tt = tAtArcFraction(r.geo.table, eased);
        const pt = bezierPoint(r.geo.from, r.geo.control, r.geo.to, tt);
        const ang = bezierTangentAngle(r.geo.from, r.geo.control, r.geo.to, tt);
        r.marker.set({ left: pt.x - offX, top: pt.y - offY, angle: ang + 90, opacity: 1 });
        r.marker.setCoords();
      }
    }
  });

  // --- statistics: fade/slide + optional count-up ---
  // A stat card is map-space (anchored to a region's coordinates, so it stays put through a
  // camera pan) but its READABILITY needs to be screen-space — broadcast/documentary info
  // cards hold a constant on-screen size regardless of how far the camera has pushed in, the
  // same way a Mapbox marker icon doesn't balloon as you zoom the map under it. Since the
  // card's shapes are children of the same Fabric.Group the camera zoom scales as a whole,
  // counter-scaling each shape by 1/camScaleMultiplier (around its own top-left origin, so
  // its anchor point doesn't drift) cancels the camera's contribution and leaves only the
  // template's own base map scale — see MAX_CAMERA_ZOOM above for the matching camera-side cap.
  const statCounterScale = 1 / Math.max(1, camScaleMultiplier);
  cfg.events.filter(e => e.type === 'stat').forEach(e => {
    const s = rt.statRuntimes.get(e.id);
    if (!s) return;
    const raw = (elapsed - e.start) / e.duration;
    const visible = raw >= 0;
    const fadeT = easeInOutCubic(raw);
    [['bg', s.bg], ['labelText', s.labelText], ['valueText', s.valueText], ['secondaryText', s.secondaryText], ['sourceText', s.sourceText]].forEach(([key, o]) => {
      if (!o) return;
      const off = s.offsets[key];
      o.set({
        left: s.anchor.x + off.dx * statCounterScale - offX, top: s.anchor.y + off.dy * statCounterScale - offY,
        scaleX: statCounterScale, scaleY: statCounterScale,
      });
      o.setCoords();
    });
    [s.bg, s.labelText, s.secondaryText, s.sourceText].forEach(o => { if (o) o.set({ opacity: visible ? Math.min(1, fadeT * 1.6) : 0 }); });
    if (s.valueText) {
      s.valueText.set({ opacity: visible ? Math.min(1, fadeT * 1.6) : 0 });
      if (e.countUp && s.counterParts && visible) {
        const val = clamp01(raw * 1.3) * s.counterParts.num; // count-up finishes a bit before the card's own fade window ends
        const txt = s.counterParts.prefix + (s.counterParts.decimals ? val.toFixed(s.counterParts.decimals) : Math.round(val)) + s.counterParts.suffix + (e.unit ? ' ' + e.unit : '');
        s.valueText.set('text', txt);
      } else if (visible) {
        s.valueText.set('text', s.finalValueText);
      }
    }
  });
}

// ---- click-to-highlight: click a region on the canvas to add/remove a highlight event --
// The map's own children are non-interactive (selectable:false/evented:false, same as
// Dot-Grid/Pin/Org-Chart) so the whole group drags/resizes as one layer like any other —
// clicking *through* to a specific region is handled here via real point-in-polygon
// hit-testing against the same parsed geometry the rest of the system already trusts,
// rather than relying on Fabric's group sub-target event quirks.
let mapPenColor = COLORS.tealLight;
// A click on an ALREADY-selected map layer is interpreted as "pick a region" (drag/resize
// of the layer itself still works normally via the first click, which just selects it, the
// same as any other layer) — converts the click to the group's own native coordinate space
// via toLocalPoint() + the same groupOffset correction used for the moving route marker.
canvas.on('mouse:down', (opt) => {
  if (mode !== 'edit') return;
  const obj = opt.target;
  if (!obj || !obj.data || !obj.data.map) return;
  if (canvas.getActiveObject() !== obj) return; // first click on a not-yet-selected map just selects it
  const rt = obj.data.map._runtime;
  if (!rt) return;
  // Fabric v7 dropped the old Canvas#getPointer method (still exists as an internal
  // fabric.util helper, but not as a public Canvas API) in favor of getScenePoint/
  // getViewportPoint — getScenePoint is the direct replacement for getPointer's default
  // (non-"absolute") behavior, i.e. canvas-space coordinates ignoring any viewport pan/zoom.
  const pointer = canvas.getScenePoint(opt.e);
  // Fabric v7 also dropped Object#toLocalPoint — invert the object's own scene-space
  // transform matrix and apply it to the click point, which is what toLocalPoint did
  // internally. The result is relative to the object's center, matching the old
  // toLocalPoint(pointer, 'center', 'center') call this replaces.
  const local = fabric.util.transformPoint(new fabric.Point(pointer.x, pointer.y), fabric.util.invertTransform(obj.calcTransformMatrix()));
  const nativeX = local.x + rt.groupOffsetX, nativeY = local.y + rt.groupOffsetY;
  const name = findRegionAtPoint(obj.data.map.scope, nativeX, nativeY);
  if (!name) return;
  toggleMapRegionHighlight(obj, name);
});
function toggleMapRegionHighlight(obj, regionName) {
  const cfg = obj.data.map;
  const events = cfg.events || [];
  const existingIdx = events.findIndex(e => e.type === 'highlight' && e.region && e.region.toLowerCase() === regionName.toLowerCase());
  let nextEvents;
  if (existingIdx >= 0) {
    nextEvents = events.filter((_, i) => i !== existingIdx);
  } else {
    const prevEnd = events.reduce((m, e) => Math.max(m, e.start + e.duration), 0);
    const ev = MAP_EVENT_DEFAULTS.highlight();
    ev.region = regionName; ev.color = mapPenColor; ev.start = events.length ? prevEnd + 150 : 0;
    nextEvents = events.concat([ev]);
  }
  rebuildMap(obj, { events: nextEvents });
  setStatus(`${nextEvents.length > events.length ? 'Highlighted' : 'Removed highlight from'} ${regionName}.`);
}

// ---- props panel: event-list editor ----------------------------------------------------
function mapEventSummary(e) {
  if (e.type === 'highlight') return `Highlight ${e.region || '(pick a region)'}`;
  if (e.type === 'zoom') return e.manual ? 'Zoom (manual framing)' : `Zoom to ${e.region || '(pick a region)'}`;
  if (e.type === 'route') return `Route ${e.from || '?'} → ${e.to || '?'}`;
  if (e.type === 'stat') return `Stat: ${e.label || '(untitled)'}${e.value ? ' = ' + e.value : ''}`;
  return e.type;
}
function mapEventTypeLabel(type) {
  return { highlight: 'Highlight', zoom: 'Zoom', route: 'Route', stat: 'Statistic' }[type] || type;
}
// ---- declarative event control manifest -------------------------------------------------
// What the creator is allowed to edit for each event type, as data rather than scattered
// `if (e.type === 'highlight') {...} else if (...)` branches — adding a plain field (a new
// text/select/checkbox/color/region/range control) to an event type is now a one-line manifest
// entry, not new UI code. This describes semantic controls only ("Curve: Medium"), never raw
// implementation properties (bezier control points, transform matrices) — see the `route`
// entry's `curve` control for the pattern: one preset dropdown, not four coordinate inputs.
// Composite side effects that a plain field can't express (route style also implying a
// movingObject/curve default) are still declared here via a control's own `onSet` hook,
// keeping the *data* declarative even though the effect itself is a few lines of logic.
const MAP_EVENT_CONTROLS = {
  highlight: [
    { key: 'region', label: 'Region', type: 'region' },
    { key: 'color', label: 'Highlight color', type: 'color' },
    { key: 'dim', label: 'Dim other regions while this is highlighted', type: 'checkbox', default: true },
    { key: 'start', label: 'Start (sec)', type: 'time' },
    { key: 'duration', label: 'Duration (sec)', type: 'time' },
  ],
  zoom: [
    { key: 'region', label: 'Zoom to region', type: 'region', showIf: e => !e.manual },
    { key: 'padding', label: 'Padding around region', type: 'select', valueType: 'number', showIf: e => !e.manual,
      options: [{ value: 0.35, label: 'Loose' }, { value: 0.22, label: 'Comfortable' }, { value: 0.1, label: 'Tight' }] },
    { key: 'manual', label: 'Manually adjust framing instead of automatic', type: 'checkbox', default: false },
    { key: 'manualZoom', label: 'Zoom amount', type: 'range', min: 1, max: MAX_CAMERA_ZOOM, step: 0.1, default: 2, showIf: e => !!e.manual },
    { key: 'manualX', label: 'Horizontal framing', type: 'range', min: -50, max: 50, step: 1, default: 0, showIf: e => !!e.manual,
      help: 'Shifts the camera left/right, as a % of the map width' },
    { key: 'manualY', label: 'Vertical framing', type: 'range', min: -50, max: 50, step: 1, default: 0, showIf: e => !!e.manual,
      help: 'Shifts the camera up/down, as a % of the map height' },
    { key: 'start', label: 'Start (sec)', type: 'time' },
    { key: 'duration', label: 'Duration (sec)', type: 'time' },
  ],
  route: [
    { key: 'from', label: 'From', type: 'region', pairWithNext: true },
    { key: 'to', label: 'To', type: 'region' },
    { key: 'style', label: 'Style', type: 'buttonGroup', options: [{ value: 'line', label: 'Line' }, { value: 'arrow', label: 'Arrow' }, { value: 'flight', label: 'Flight' }],
      onSet: (e, v) => { e.style = v; e.movingObject = v === 'flight' ? 'plane' : v === 'arrow' ? 'arrow' : 'none'; e.curve = v === 'flight' ? 'medium' : e.curve; } },
    { key: 'curve', label: 'Curve', type: 'select', options: [{ value: 'straight', label: 'Straight' }, { value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }] },
    { key: 'color', label: 'Route color', type: 'color' },
    { key: 'start', label: 'Start (sec)', type: 'time' },
    { key: 'duration', label: 'Duration (sec)', type: 'time' },
  ],
  stat: [
    { key: 'label', label: 'Label', type: 'text', placeholder: 'Population' },
    { key: 'value', label: 'Value', type: 'text', placeholder: '5.0M', pairWithNext: true },
    { key: 'unit', label: 'Unit (optional)', type: 'text', placeholder: 'people' },
    { key: 'secondary', label: 'Secondary line (optional)', type: 'text', placeholder: '↑ 12.4% vs last year' },
    { key: 'source', label: 'Source (optional — shown small at the bottom of the card)', type: 'text', placeholder: 'MIC Statistics Bureau, 2023' },
    { key: 'sourceUrl', label: 'Source URL (optional — editor reference only, never shown in the video)', type: 'text', placeholder: 'https://…' },
    { key: 'region', label: 'Anchor to region (optional — otherwise shown at the bottom of the map)', type: 'region' },
    { key: 'countUp', label: 'Count up to the value (numbers only)', type: 'checkbox', default: true },
    { key: 'start', label: 'Start (sec)', type: 'time' },
    { key: 'duration', label: 'Duration (sec)', type: 'time' },
  ],
};
// One renderer for every control type below, instead of one hand-built form per event type.
// `container` receives the finished field (label + input); `commit()` re-runs rebuildMap().
function renderEventControl(container, control, e, commit, scope) {
  const wrap = document.createElement('div');
  const value = e[control.key] != null ? e[control.key] : control.default;
  const setValue = (v) => { (control.onSet || ((ev, val) => { ev[control.key] = val; }))(e, v); commit(); };

  if (control.type === 'checkbox') {
    const label = document.createElement('label');
    label.style.cssText = 'font-size:11.5px;margin-top:6px;display:flex;align-items:center;gap:6px;';
    const inp = document.createElement('input'); inp.type = 'checkbox'; inp.style.width = 'auto'; inp.checked = value !== false;
    inp.addEventListener('change', () => setValue(inp.checked));
    label.appendChild(inp); label.appendChild(document.createTextNode(control.label));
    wrap.appendChild(label);
    container.appendChild(wrap);
    return wrap;
  }

  const label = document.createElement('label'); label.textContent = control.label; label.style.fontSize = '11px'; wrap.appendChild(label);
  if (control.type === 'time') {
    // `timeKind` disambiguates a DURATION (floored at 100ms, can't be 0) from a POINT in time
    // (can legitimately be 0) — defaults to the map events' own start/duration convention when
    // unset, so every existing MAP_EVENT_CONTROLS entry keeps its exact prior behavior.
    const isDuration = control.timeKind ? control.timeKind === 'duration' : control.key === 'duration';
    const inp = document.createElement('input'); inp.type = 'number'; inp.step = '0.1'; inp.min = isDuration ? 0.1 : 0;
    inp.value = ((value || 0) / 1000).toFixed(1);
    inp.addEventListener('change', () => {
      const ms = Math.round(parseFloat(inp.value) * 1000) || 0;
      setValue(isDuration ? Math.max(100, ms) : Math.max(0, ms));
    });
    wrap.appendChild(inp);
  } else if (control.type === 'text') {
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = value || ''; if (control.placeholder) inp.placeholder = control.placeholder;
    inp.addEventListener('change', () => setValue(inp.value));
    wrap.appendChild(inp);
  } else if (control.type === 'color') {
    const row = document.createElement('div'); row.className = 'swatches';
    SWATCH_OPTIONS.forEach(o => {
      const s = document.createElement('div'); s.className = 'swatch' + (value === o.val ? ' active' : ''); s.style.background = o.val; s.title = o.name;
      s.addEventListener('click', () => setValue(o.val));
      row.appendChild(s);
    });
    wrap.appendChild(row);
  } else if (control.type === 'region') {
    const sel = document.createElement('select');
    const none = document.createElement('option'); none.value = ''; none.textContent = '— choose —'; sel.appendChild(none);
    mapRegionsFor(scope).map(r => r.name).sort().forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
    sel.value = value || '';
    sel.addEventListener('change', () => setValue(sel.value));
    wrap.appendChild(sel);
  } else if (control.type === 'select') {
    // `options` (static array) or `optionsFor(target)` (computed at render time, e.g. from the
    // current data source registry / that source's own entity list) — same descriptor shape,
    // just resolved lazily for controls whose choices can't be known ahead of time.
    const sel = document.createElement('select');
    const opts = control.options || (control.optionsFor ? control.optionsFor(e) : []);
    if (!opts.length) { const none = document.createElement('option'); none.value = ''; none.textContent = '— none available —'; sel.appendChild(none); }
    opts.forEach(o => { const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.label; sel.appendChild(opt); });
    sel.value = value != null ? value : (opts[0] ? opts[0].value : '');
    sel.addEventListener('change', () => setValue(control.valueType === 'number' ? parseFloat(sel.value) : sel.value));
    wrap.appendChild(sel);
  } else if (control.type === 'buttonGroup') {
    const row = document.createElement('div'); row.className = 'row2';
    control.options.forEach(o => {
      const b = document.createElement('button'); b.type = 'button'; b.style.flex = '1';
      b.className = 'small' + (value === o.value ? ' primary' : ' ghost'); b.textContent = o.label;
      b.addEventListener('click', () => setValue(o.value));
      row.appendChild(b);
    });
    wrap.appendChild(row);
  } else if (control.type === 'range') {
    const row = document.createElement('div'); row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px';
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = control.min; inp.max = control.max; inp.step = control.step || 1;
    inp.value = value != null ? value : control.default; inp.style.flex = '1';
    const out = document.createElement('span'); out.style.fontSize = '11px'; out.style.minWidth = '2.5em'; out.textContent = inp.value;
    inp.addEventListener('input', () => { out.textContent = inp.value; });
    inp.addEventListener('change', () => setValue(parseFloat(inp.value)));
    row.appendChild(inp); row.appendChild(out);
    wrap.appendChild(row);
    if (control.help) { const help = document.createElement('div'); help.className = 'empty-note'; help.style.fontSize = '10.5px'; help.textContent = control.help; wrap.appendChild(help); }
  }
  container.appendChild(wrap);
  return wrap;
}
// Walks ANY control manifest (an array of control descriptors, not just a map event type's)
// against ANY target object, honoring each control's `showIf` (the only conditional-visibility
// mechanism this needs right now — see the zoom type's auto/manual toggle) and `pairWithNext`
// (renders this control and the one after it side by side in a row2, matching the From/To and
// Value/Unit layouts the old hand-built UI used). Shared by the map event editor below AND the
// temporalLine/temporalStat props panels (see TEMPORAL_LINE_CONTROLS/TEMPORAL_STAT_CONTROLS) —
// same declarative-manifest architecture, not a second implementation of it.
function renderControlList(body2, controls, target, commit, scope) {
  for (let i = 0; i < controls.length; i++) {
    const c = controls[i];
    if (c.showIf && !c.showIf(target)) continue;
    if (c.pairWithNext) {
      const row = document.createElement('div'); row.className = 'row2'; body2.appendChild(row);
      const c1 = document.createElement('div'); row.appendChild(c1);
      renderEventControl(c1, c, target, commit, scope);
      const next = controls[++i];
      const c2 = document.createElement('div'); row.appendChild(c2);
      if (next) renderEventControl(c2, next, target, commit, scope);
    } else {
      renderEventControl(body2, c, target, commit, scope);
    }
  }
}
function renderEventControlsForType(body2, e, commit, scope) {
  renderControlList(body2, MAP_EVENT_CONTROLS[e.type] || [], e, commit, scope);
}
function renderMapEventList(body, obj) {
  const cfg = obj.data.map;
  const wrap = document.createElement('div'); wrap.id = 'mapEventsWrap'; body.appendChild(wrap);

  function commit() { rebuildMap(obj, { events: cfg.events.slice() }); }

  function paint() {
    wrap.innerHTML = '';
    cfg.events.forEach((e, idx) => {
      const card = document.createElement('div'); card.className = 'source-box'; card.style.marginBottom = '8px'; wrap.appendChild(card);
      const head = document.createElement('div'); head.style.display = 'flex'; head.style.alignItems = 'center'; head.style.gap = '6px'; card.appendChild(head);
      const badge = document.createElement('span'); badge.className = 'badge-visual'; badge.style.background = COLORS.navy; badge.textContent = e.type.toUpperCase(); head.appendChild(badge);
      const title = document.createElement('span'); title.style.flex = '1'; title.style.fontSize = '12px'; title.style.fontWeight = '700'; title.textContent = mapEventSummary(e); head.appendChild(title);
      const upBtn = document.createElement('button'); upBtn.type = 'button'; upBtn.className = 'small ghost'; upBtn.textContent = '↑'; upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => { [cfg.events[idx - 1], cfg.events[idx]] = [cfg.events[idx], cfg.events[idx - 1]]; commit(); });
      head.appendChild(upBtn);
      const downBtn = document.createElement('button'); downBtn.type = 'button'; downBtn.className = 'small ghost'; downBtn.textContent = '↓'; downBtn.disabled = idx === cfg.events.length - 1;
      downBtn.addEventListener('click', () => { [cfg.events[idx + 1], cfg.events[idx]] = [cfg.events[idx], cfg.events[idx + 1]]; commit(); });
      head.appendChild(downBtn);
      const rmBtn = document.createElement('button'); rmBtn.type = 'button'; rmBtn.className = 'small ghost'; rmBtn.textContent = '✕'; rmBtn.title = 'Remove event';
      rmBtn.addEventListener('click', () => { cfg.events.splice(idx, 1); commit(); });
      head.appendChild(rmBtn);

      const body2 = document.createElement('div'); body2.style.marginTop = '8px'; card.appendChild(body2);
      renderEventControlsForType(body2, e, commit, cfg.scope);
    });

    const addRow = document.createElement('div'); addRow.className = 'add-row'; addRow.style.marginTop = '4px'; wrap.appendChild(addRow);
    Object.keys(MAP_EVENT_CONTROLS).forEach((type) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'small'; b.textContent = '+ ' + mapEventTypeLabel(type);
      b.addEventListener('click', () => {
        const prevEnd = cfg.events.reduce((m, e) => Math.max(m, e.start + e.duration), 0);
        const ev = MAP_EVENT_DEFAULTS[type]();
        ev.start = cfg.events.length ? prevEnd + 150 : 0;
        cfg.events = cfg.events.concat([ev]);
        commit();
      });
      addRow.appendChild(b);
    });
  }
  paint();
}

function renderMapPropsPanel(body, obj) {
  const cfg = obj.data.map;
  const lblSc = document.createElement('label'); lblSc.textContent = 'Map'; body.appendChild(lblSc);
  const scRow = document.createElement('div'); scRow.className = 'row2'; body.appendChild(scRow);
  // Only 'modern' datasets are offered here — a future historical dataset in
  // GEOGRAPHIC_DATASETS is deliberately NOT exposed through this generic switcher (see
  // "Historical map layer" in CLAUDE.md): historical scope selection needs its own workflow
  // (a date, a source, a confidence indicator), not a bare scope button next to "World".
  Object.values(GEOGRAPHIC_DATASETS).filter(ds => ds.kind === 'modern').forEach(ds => {
    const b = document.createElement('button'); b.type = 'button'; b.style.flex = '1';
    b.className = 'small' + (cfg.scope === ds.id ? ' primary' : ' ghost');
    b.textContent = ds.label;
    b.addEventListener('click', () => { if (cfg.scope !== ds.id) rebuildMap(obj, { scope: ds.id, events: [] }); });
    scRow.appendChild(b);
  });

  const lblPen = document.createElement('label'); lblPen.textContent = 'Pen color — used when you click a region directly on the map'; lblPen.style.marginTop = '8px'; body.appendChild(lblPen);
  const penRow = document.createElement('div'); penRow.className = 'swatches'; body.appendChild(penRow);
  SWATCH_OPTIONS.forEach(o => {
    const s = document.createElement('div'); s.className = 'swatch' + (mapPenColor === o.val ? ' active' : '');
    s.style.background = o.val; s.title = o.name;
    s.addEventListener('click', () => { mapPenColor = o.val; penRow.querySelectorAll('.swatch').forEach(el => el.classList.remove('active')); s.classList.add('active'); });
    penRow.appendChild(s);
  });
  const clickNote = document.createElement('div'); clickNote.className = 'empty-note'; clickNote.style.marginTop = '4px';
  clickNote.textContent = 'This layer is already selected, so clicking a region on the canvas toggles a Highlight event for it — click again to remove.';
  body.appendChild(clickNote);

  const div1 = document.createElement('div'); div1.className = 'divider'; body.appendChild(div1);
  const lblEv = document.createElement('label'); lblEv.textContent = 'Timeline — what happens, and when'; body.appendChild(lblEv);
  renderMapEventList(body, obj);

  const note = document.createElement('div'); note.className = 'empty-note'; note.style.marginTop = '8px';
  note.textContent = cfg.scope === 'japan'
    ? 'Region-level only (all 47 prefectures) — for a specific city like Kamakura, use the Map/Location Pin marker over a background map image instead.'
    : 'Country-level only — switch to Japan prefectures for regional detail within Japan.';
  body.appendChild(note);
}

/* ================================================================================
   TEMPORAL DATA FOUNDATION — video time vs data time, observed vs interpolated
   ================================================================================
   A reusable primitive, not a chart component: createTemporalDataSource() knows nothing
   about maps, lines, or stat cards. It maps VIDEO TIME (elapsed milliseconds, the same
   currency every other animation in this file runs on) to DATA TIME (whatever unit the
   dataset's own time field uses — years, here) and back, and answers "what's this entity's
   value at this data time" with an explicit OBSERVED vs INTERPOLATED distinction — never
   silently presenting a smoothly-animated in-between state as if it were a real observation
   the dataset actually contains. Three independent layer kinds below (an existing map
   highlight, a new line chart, a new stat card) each read from this SAME primitive with the
   SAME {sourceId, videoStart, videoEnd} config; because every one of them is a pure function
   of `elapsed` (matching the PLAYBACK CLOCK vs SCENE EVALUATOR split documented for the map
   system above), they stay synchronized by construction — proven in tests/test_v14.js by
   comparing their independently-computed states at the same elapsed instant, not by any
   runtime event bus between them. See CLAUDE.md's "Temporal data foundation" note for the
   full architectural rationale and what's deliberately NOT built yet (rankings, pyramids,
   scatter/trails, flows, small multiples — this is the shared clock/data primitive those
   would eventually read from, not any of those chart forms themselves).
   ================================================================================ */
// TEST FIXTURE DATA — deliberately simple round numbers (matching the exact example given in
// the phase spec this was built against), NOT real documentary/production statistics. Proves
// the TemporalDataSource architecture without performing any research inside this
// implementation pass. A real documentary scene would supply its own sourced records.
const TEMPORAL_FIXTURES = {
  fixtureIndex: {
    label: 'Fixture: regional index (TEST DATA, not real statistics)',
    timeField: 'year', entityField: 'region', valueField: 'value', unit: 'index (2000=100)',
    records: [
      { region: 'Hokkaidō', year: 2000, value: 100 },
      { region: 'Hokkaidō', year: 2005, value: 96 },
      { region: 'Hokkaidō', year: 2010, value: 91 },
      { region: 'Hokkaidō', year: 2015, value: 87 },
      { region: 'Hokkaidō', year: 2020, value: 82 },
      { region: 'Okinawa', year: 2000, value: 100 },
      { region: 'Okinawa', year: 2005, value: 104 },
      { region: 'Okinawa', year: 2010, value: 109 },
      { region: 'Okinawa', year: 2015, value: 113 },
      { region: 'Okinawa', year: 2020, value: 118 },
    ],
  },
};
// records: [{[timeField]: number, [entityField]: string, [valueField]: number}, ...]
// videoStart/videoEnd: elapsed milliseconds this data's full time range plays across.
// dataStart/dataEnd: optional — defaults to the min/max of the records' own time field.
function createTemporalDataSource(cfg) {
  const timeField = cfg.timeField || 'time', entityField = cfg.entityField || 'entity', valueField = cfg.valueField || 'value';
  const records = cfg.records || [];
  const observedTimes = Array.from(new Set(records.map(r => r[timeField]))).sort((a, b) => a - b);
  const dataStart = cfg.dataStart != null ? cfg.dataStart : observedTimes[0];
  const dataEnd = cfg.dataEnd != null ? cfg.dataEnd : observedTimes[observedTimes.length - 1];
  const videoStart = cfg.videoStart || 0, videoEnd = cfg.videoEnd != null ? cfg.videoEnd : videoStart + 1000;
  function videoTimeToDataTime(vt) {
    const span = videoEnd - videoStart;
    const frac = span ? clamp01((vt - videoStart) / span) : 0;
    return dataStart + frac * (dataEnd - dataStart);
  }
  function dataTimeToVideoTime(dt) {
    const span = dataEnd - dataStart;
    const frac = span ? (dt - dataStart) / span : 0;
    return videoStart + frac * (videoEnd - videoStart);
  }
  function entities() { return Array.from(new Set(records.map(r => r[entityField]))); }
  function rowsFor(entity) { return records.filter(r => r[entityField] === entity).sort((a, b) => a[timeField] - b[timeField]); }
  // Official observations often exist only at discrete times (every 5 years, here); the
  // animation may move smoothly between them, but the caller must be able to tell "this is
  // real row N" from "this is an interpolated in-between state" — `observed` is exactly that.
  function valueAt(entity, dataTime) {
    const rows = rowsFor(entity);
    if (!rows.length) return null;
    const first = rows[0], last = rows[rows.length - 1];
    if (dataTime <= first[timeField]) return { value: first[valueField], time: first[timeField], observed: dataTime === first[timeField] };
    if (dataTime >= last[timeField]) return { value: last[valueField], time: last[timeField], observed: dataTime === last[timeField] };
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      if (dataTime < a[timeField] || dataTime > b[timeField]) continue;
      if (dataTime === a[timeField]) return { value: a[valueField], time: a[timeField], observed: true };
      if (dataTime === b[timeField]) return { value: b[valueField], time: b[timeField], observed: true };
      const t = (dataTime - a[timeField]) / (b[timeField] - a[timeField]);
      return { value: lerp(a[valueField], b[valueField], t), time: dataTime, observed: false };
    }
    return null;
  }
  return { records, timeField, entityField, valueField, dataStart, dataEnd, videoStart, videoEnd, observedTimes, videoTimeToDataTime, dataTimeToVideoTime, valueAt, entities, rowsFor };
}
// Resolves a layer config's {sourceId, videoStart, videoEnd} into a live TemporalDataSource —
// the one place that knows how to turn a fixture/dataset id into records, so LineView and
// StatView below both go through it rather than each reaching into TEMPORAL_FIXTURES directly.
// Checks the built-in TEMPORAL_FIXTURES first, then the project's own user-pasted dataSources
// registry — both share the same {records, timeField, entityField, valueField} shape, so this
// needed no branch for "which kind of source", just a second place to look.
function temporalSourceFor(dataCfg) {
  const fixture = TEMPORAL_FIXTURES[dataCfg.sourceId] || dataSources[dataCfg.sourceId];
  if (!fixture) return null;
  return createTemporalDataSource(Object.assign({}, fixture, { videoStart: dataCfg.videoStart, videoEnd: dataCfg.videoEnd }));
}
// Every source a temporalLine/temporalStat layer's "Data source" control can pick from —
// built-ins first (clearly fixture-labeled), then whatever the user has pasted in this project.
function allTemporalSources() {
  const out = Object.keys(TEMPORAL_FIXTURES).map(id => ({ value: id, label: TEMPORAL_FIXTURES[id].label || id }));
  Object.keys(dataSources).forEach(id => out.push({ value: id, label: dataSources[id].name }));
  return out;
}

/* ================================================================================
   DATA SOURCE REGISTRY — paste-a-CSV data entry for temporalLine/temporalStat layers
   ================================================================================
   Deliberately NOT a spreadsheet editor, a database, or a formula/join engine — a project-
   level list of {name, records[], schema} entries, each built from a plain CSV paste plus
   three field-mapping choices (which column is time / entity / value). This is the ONLY way
   a creator gets their own data into a temporalLine/temporalStat layer beyond the built-in
   TEMPORAL_FIXTURES test data; no file-import pipeline, no automatic web/statistics-bureau
   lookup, no formulas. Validation never silently converts a malformed value to zero — a bad
   row is skipped with a warning the creator can see, not folded into the dataset as a false 0.
   ================================================================================ */
// Minimal CSV parser — handles quoted fields (with escaped "" and embedded commas/newlines)
// and both \n and \r\n line endings. No streaming, no dialect options: pasted text is always
// small enough (a few dozen to a few hundred rows) to parse in one pass.
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { headers: [], rows: [] };
  return { headers: rows[0].map(h => h.trim()), rows: rows.slice(1) };
}
// Guesses which headers are most likely time/entity/value, for pre-filling the field-mapping
// selects — a convenience only, the creator can always pick a different column. Matches by
// name pattern first; any field left unmatched gets whichever header pattern-matching hasn't
// already claimed, rather than every unmatched guess collapsing onto the same column.
function guessFields(headers) {
  const patterns = {
    time: /^(year|yr|date|time|period)$/i,
    entity: /^(region|entity|name|category|country|prefecture|pref|city|area|group)$/i,
    value: /^(value|val|amount|count|total|population|pop|index|idx)$/i,
  };
  const guess = {};
  ['time', 'entity', 'value'].forEach(kind => { guess[kind] = headers.find(h => patterns[kind].test(h)); });
  const used = new Set(Object.values(guess).filter(Boolean));
  const remaining = headers.filter(h => !used.has(h));
  guess.time = guess.time || remaining.shift() || headers[0];
  guess.entity = guess.entity || remaining.shift() || headers[0];
  guess.value = guess.value || remaining.shift() || headers[headers.length - 1];
  return guess;
}
// Builds a clean records[] from parsed CSV rows against the chosen field mapping. Never
// coerces a bad value to 0 — every row that fails a check is skipped and reported as a
// warning, not silently included as zero (see CLAUDE.md's "missing data" note). Also flags
// (informationally only — never blocks) duplicate entity+time rows and irregular intervals.
function validateAndBuildRecords(headers, rows, timeField, entityField, valueField) {
  const errors = [], warnings = [];
  const tIdx = headers.indexOf(timeField), eIdx = headers.indexOf(entityField), vIdx = headers.indexOf(valueField);
  if (tIdx === -1) errors.push(`Time field "${timeField}" was not found in the CSV's header row.`);
  if (eIdx === -1) errors.push(`Entity field "${entityField}" was not found in the CSV's header row.`);
  if (vIdx === -1) errors.push(`Value field "${valueField}" was not found in the CSV's header row.`);
  if (errors.length) return { errors, warnings, records: [] };
  const records = [];
  const seen = new Set();
  const timesByEntity = new Map();
  rows.forEach((r, i) => {
    const rowNum = i + 2; // 1-indexed data row, plus the header row above it
    if (r.every(c => (c || '').trim() === '')) return; // blank line — skip silently, not a warning
    const rawTime = (r[tIdx] || '').trim(), rawEntity = (r[eIdx] || '').trim(), rawValue = (r[vIdx] || '').trim();
    if (!rawEntity) { warnings.push(`Row ${rowNum}: missing entity — skipped.`); return; }
    if (rawTime === '' || isNaN(Number(rawTime))) { warnings.push(`Row ${rowNum}: time "${rawTime}" isn't a number — skipped.`); return; }
    if (rawValue === '' || isNaN(Number(rawValue))) { warnings.push(`Row ${rowNum}: value is missing or not a number — skipped (never treated as zero).`); return; }
    const time = Number(rawTime), value = Number(rawValue);
    const key = rawEntity + '|' + time;
    if (seen.has(key)) { warnings.push(`Row ${rowNum}: duplicate entry for ${rawEntity} at ${time} — kept the first, this one skipped.`); return; }
    seen.add(key);
    records.push({ [entityField]: rawEntity, [timeField]: time, [valueField]: value });
    if (!timesByEntity.has(rawEntity)) timesByEntity.set(rawEntity, []);
    timesByEntity.get(rawEntity).push(time);
  });
  timesByEntity.forEach((times, entity) => {
    times.sort((a, b) => a - b);
    if (times.length < 3) return;
    const gaps = []; for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    if (gaps.some(g => Math.abs(g - gaps[0]) > 1e-9)) {
      warnings.push(`${entity}: time intervals aren't evenly spaced (${gaps.join(', ')}) — interpolation still works, but the reveal won't move at a perfectly even pace between points.`);
    }
  });
  if (!records.length) errors.push('No usable rows found — check that the field mapping matches your columns.');
  return { errors, warnings, records };
}
function newDataSourceId() { return 'ds_' + Math.random().toString(36).slice(2, 9); }
// Returns {ok, id?, errors, warnings}. On failure (ok:false), errors explains why and nothing
// is added to the registry — warnings may still be present even on success (rows were
// skipped, but enough good data remained to build a usable source).
function addDataSourceFromForm(input) {
  const parsed = parseCSV(input.csvText);
  if (!parsed.headers.length) return { ok: false, errors: ['Could not read any data — paste CSV text with a header row first.'], warnings: [] };
  const { errors, warnings, records } = validateAndBuildRecords(parsed.headers, parsed.rows, input.timeField, input.entityField, input.valueField);
  if (errors.length) return { ok: false, errors, warnings };
  const id = newDataSourceId();
  dataSources[id] = {
    id, name: input.name || 'Untitled data source', type: 'csv',
    timeField: input.timeField, entityField: input.entityField, valueField: input.valueField,
    unit: input.unit || '', source: input.source || '', sourceUrl: input.sourceUrl || '',
    records,
  };
  return { ok: true, id, errors, warnings };
}
// ---- Data Sources panel UI ---------------------------------------------------------------
function renderDataSourceList() {
  const el = document.getElementById('dataSourceList');
  if (!el) return;
  el.innerHTML = '';
  const ids = Object.keys(dataSources);
  if (!ids.length) { el.innerHTML = '<div class="empty-note">No data sources yet — add one below, or use the built-in fixture data on any Temporal layer.</div>'; return; }
  ids.forEach(id => {
    const ds = dataSources[id];
    const entityCount = new Set(ds.records.map(r => r[ds.entityField])).size;
    const card = document.createElement('div'); card.className = 'source-box'; card.style.marginBottom = '8px'; el.appendChild(card);
    const head = document.createElement('div'); head.style.display = 'flex'; head.style.alignItems = 'center'; head.style.gap = '6px'; card.appendChild(head);
    const title = document.createElement('span'); title.style.flex = '1'; title.style.fontSize = '12px'; title.style.fontWeight = '700'; title.textContent = ds.name; head.appendChild(title);
    const rmBtn = document.createElement('button'); rmBtn.type = 'button'; rmBtn.className = 'small ghost'; rmBtn.textContent = '✕'; rmBtn.title = 'Remove data source';
    rmBtn.addEventListener('click', () => { delete dataSources[id]; renderDataSourceList(); });
    head.appendChild(rmBtn);
    const meta = document.createElement('div'); meta.className = 'empty-note'; meta.style.marginTop = '4px';
    meta.textContent = `${ds.records.length} rows · ${entityCount} entit${entityCount === 1 ? 'y' : 'ies'}${ds.unit ? ' · ' + ds.unit : ''}${ds.source ? ' · ' + ds.source : ''}`;
    card.appendChild(meta);
  });
}
function renderDataSourceForm() {
  const wrap = document.getElementById('dataSourceForm');
  const addBtn = document.getElementById('btnAddDataSource');
  if (!wrap) return;
  wrap.innerHTML = '';
  let parsedHeaders = [];

  const lblName = document.createElement('label'); lblName.textContent = 'Name'; wrap.appendChild(lblName);
  const inpName = document.createElement('input'); inpName.type = 'text'; inpName.placeholder = 'e.g. Prefecture population'; wrap.appendChild(inpName);

  const lblCsv = document.createElement('label'); lblCsv.textContent = 'Paste CSV (first row = column names)'; lblCsv.style.marginTop = '10px'; wrap.appendChild(lblCsv);
  const ta = document.createElement('textarea'); ta.style.minHeight = '110px'; ta.placeholder = 'region,year,value\nHokkaidō,2000,100\nHokkaidō,2010,91\nOkinawa,2000,100\nOkinawa,2010,109'; wrap.appendChild(ta);

  const mapWrap = document.createElement('div'); mapWrap.style.display = 'none'; mapWrap.style.marginTop = '10px'; wrap.appendChild(mapWrap);
  const rowFields = document.createElement('div'); rowFields.className = 'row2'; mapWrap.appendChild(rowFields);
  function fieldSelect(labelText, kind) {
    const col = document.createElement('div'); rowFields.appendChild(col);
    const lbl = document.createElement('label'); lbl.textContent = labelText; col.appendChild(lbl);
    const sel = document.createElement('select'); col.appendChild(sel);
    sel._kind = kind;
    return sel;
  }
  const selTime = fieldSelect('Time field', 'time');
  const selEntity = fieldSelect('Entity field', 'entity');
  const rowFields2 = document.createElement('div'); rowFields2.className = 'row2'; mapWrap.appendChild(rowFields2);
  const colValue = document.createElement('div'); rowFields2.appendChild(colValue);
  const lblValue = document.createElement('label'); lblValue.textContent = 'Value field'; colValue.appendChild(lblValue);
  const selValue = document.createElement('select'); colValue.appendChild(selValue);
  const colUnit = document.createElement('div'); rowFields2.appendChild(colUnit);
  const lblUnit = document.createElement('label'); lblUnit.textContent = 'Unit (optional)'; colUnit.appendChild(lblUnit);
  const inpUnit = document.createElement('input'); inpUnit.type = 'text'; inpUnit.placeholder = 'people'; colUnit.appendChild(inpUnit);

  const lblSource = document.createElement('label'); lblSource.textContent = 'Source (optional — provenance for this dataset)'; lblSource.style.marginTop = '8px'; mapWrap.appendChild(lblSource);
  const inpSource = document.createElement('input'); inpSource.type = 'text'; inpSource.placeholder = 'MIC Statistics Bureau, 2023'; mapWrap.appendChild(inpSource);
  const lblSourceUrl = document.createElement('label'); lblSourceUrl.textContent = 'Source URL (optional)'; mapWrap.appendChild(lblSourceUrl);
  const inpSourceUrl = document.createElement('input'); inpSourceUrl.type = 'text'; inpSourceUrl.placeholder = 'https://…'; mapWrap.appendChild(inpSourceUrl);

  const feedback = document.createElement('div'); feedback.style.marginTop = '8px'; wrap.appendChild(feedback);

  const parseBtn = document.createElement('button'); parseBtn.type = 'button'; parseBtn.className = 'small'; parseBtn.style.marginTop = '8px'; parseBtn.textContent = 'Read columns';
  parseBtn.addEventListener('click', () => {
    const parsed = parseCSV(ta.value);
    parsedHeaders = parsed.headers;
    feedback.innerHTML = '';
    if (!parsedHeaders.length) { feedback.innerHTML = '<div class="empty-note">Could not find a header row — paste CSV text above first.</div>'; mapWrap.style.display = 'none'; return; }
    [selTime, selEntity, selValue].forEach(sel => {
      sel.innerHTML = '';
      parsedHeaders.forEach(h => { const opt = document.createElement('option'); opt.value = h; opt.textContent = h; sel.appendChild(opt); });
    });
    const guessed = guessFields(parsedHeaders);
    selTime.value = guessed.time; selEntity.value = guessed.entity; selValue.value = guessed.value;
    mapWrap.style.display = '';
    feedback.innerHTML = `<div class="empty-note">${parsedHeaders.length} columns, ${parsed.rows.length} data rows found. Check the field mapping below, then add the source.</div>`;
  });
  wrap.appendChild(parseBtn);

  const btnRow = document.createElement('div'); btnRow.className = 'row2'; btnRow.style.marginTop = '10px'; wrap.appendChild(btnRow);
  const addOneBtn = document.createElement('button'); addOneBtn.type = 'button'; addOneBtn.className = 'primary'; addOneBtn.style.width = '100%'; addOneBtn.textContent = 'Add data source';
  addOneBtn.addEventListener('click', () => {
    if (!parsedHeaders.length) { feedback.innerHTML = '<div class="empty-note">Click "Read columns" first.</div>'; return; }
    const result = addDataSourceFromForm({
      name: inpName.value, csvText: ta.value,
      timeField: selTime.value, entityField: selEntity.value, valueField: selValue.value,
      unit: inpUnit.value, source: inpSource.value, sourceUrl: inpSourceUrl.value,
    });
    if (!result.ok) {
      feedback.innerHTML = '<div class="empty-note">' + result.errors.map(e => '⚠ ' + e).join('<br>') + '</div>';
      return;
    }
    renderDataSourceList();
    wrap.style.display = 'none';
    addBtn.style.display = '';
    const warnMsg = result.warnings.length ? ` (${result.warnings.length} row${result.warnings.length === 1 ? '' : 's'} skipped — see console for details)` : '';
    if (result.warnings.length) console.warn('Data source "' + (inpName.value || 'Untitled') + '" import warnings:\n' + result.warnings.join('\n'));
    setStatus(`Data source added ✓${warnMsg}`);
    // If a temporalLine/temporalStat layer is already selected, its "Data source" dropdown was
    // rendered before this source existed — refresh the props panel so the new option shows up
    // without the creator having to click away and back.
    const active = canvas.getActiveObject();
    if (active && active.data && (active.data.temporalLine || active.data.temporalStat)) selectProps(active);
  });
  btnRow.appendChild(addOneBtn);
  const cancelBtn = document.createElement('button'); cancelBtn.type = 'button'; cancelBtn.className = 'ghost'; cancelBtn.style.width = '100%'; cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => { wrap.style.display = 'none'; addBtn.style.display = ''; });
  btnRow.appendChild(cancelBtn);
}
document.getElementById('btnAddDataSource').addEventListener('click', () => {
  renderDataSourceForm();
  document.getElementById('dataSourceForm').style.display = '';
  document.getElementById('btnAddDataSource').style.display = 'none';
});
renderDataSourceList();

/* ---- LineView: a temporal line chart layer — first version deliberately minimal (axis-lite  */
/* ---- frame, one line, a moving cursor, current value) per the "prove architecture, don't    */
/* ---- build a chart library" scoping. Regenerate-in-place, same pattern as Dot-Grid/Map/Pin.  */
function buildLineChartGroup(cfg) {
  const src = temporalSourceFor(cfg);
  const w = cfg.width || 480, h = cfg.height || 200;
  const color = cfg.color || COLORS.tealLight;
  const shapes = [];
  const baseline = new fabric.Line([0, h, w, h], { stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1, selectable: false, evented: false });
  shapes.push(baseline);
  let linePath = null, pts = [], minV = 0, maxV = 1;
  const rows = src ? src.rowsFor(cfg.entity) : [];
  if (src && rows.length) {
    const vals = rows.map(r => r[src.valueField]);
    minV = Math.min(...vals); maxV = Math.max(...vals);
    const padV = (maxV - minV) * 0.15 || Math.abs(maxV) * 0.1 || 1;
    const yFor = (v) => h - ((v - (minV - padV)) / ((maxV + padV) - (minV - padV))) * h;
    const xFor = (t) => src.dataEnd > src.dataStart ? ((t - src.dataStart) / (src.dataEnd - src.dataStart)) * w : 0;
    pts = rows.map(r => ({ x: xFor(r[src.timeField]), y: yFor(r[src.valueField]) }));
    const d = 'M ' + pts.map(p => `${p.x} ${p.y}`).join(' L ');
    linePath = new fabric.Path(d, { fill: '', stroke: color, strokeWidth: 3, strokeLineJoin: 'round', strokeLineCap: 'round', opacity: 0.9, selectable: false, evented: false });
    shapes.push(linePath);
  }
  const minLabel = new fabric.Textbox(rows.length ? String(minV) : '', { left: 0, top: h + 6, width: 80, fontSize: 12, fill: 'rgba(255,255,255,0.55)', originX: 'left', originY: 'top', textAlign: 'left', selectable: false, evented: false, splitByGrapheme: false });
  const maxLabel = new fabric.Textbox(rows.length ? String(maxV) : '', { left: w - 80, top: -20, width: 80, fontSize: 12, fill: 'rgba(255,255,255,0.55)', originX: 'right', originY: 'top', textAlign: 'right', selectable: false, evented: false, splitByGrapheme: false });
  shapes.push(minLabel, maxLabel);
  const startPt = pts[0] || { x: 0, y: h };
  const cursor = new fabric.Circle({ left: startPt.x, top: startPt.y, radius: 6, fill: '#FFFFFF', stroke: color, strokeWidth: 2.5, originX: 'center', originY: 'center', selectable: false, evented: false });
  const valueLabel = new fabric.Textbox('', { left: startPt.x + 10, top: startPt.y - 24, width: 140, fontSize: 16, fontWeight: 800, fill: '#FFFFFF', originX: 'left', originY: 'top', textAlign: 'left', selectable: false, evented: false, splitByGrapheme: false });
  const entityLabel = new fabric.Textbox(cfg.entity || '', { left: 0, top: -20, width: 200, fontSize: 12.5, fontWeight: 700, fill: color, charSpacing: 40, originX: 'left', originY: 'top', textAlign: 'left', selectable: false, evented: false, splitByGrapheme: false });
  shapes.push(cursor, valueLabel, entityLabel);

  const refShape = shapes[0];
  const preGroupLeft = refShape.left, preGroupTop = refShape.top;
  const group = new fabric.Group(shapes, { subTargetCheck: false });
  const groupOffsetX = preGroupLeft - refShape.left, groupOffsetY = preGroupTop - refShape.top;
  return { group, runtime: { cursor, valueLabel, src, pts, minV, maxV, w, h, groupOffsetX, groupOffsetY } };
}
function rebuildLineChart(obj, patch) {
  const cfg = Object.assign({}, obj.data.temporalLine, patch);
  const idx = canvas.getObjects().indexOf(obj);
  const anim = obj.data.anim;
  const { group: newObj, runtime } = buildLineChartGroup(cfg);
  newObj.set({ left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle, opacity: obj.opacity, originX: obj.originX, originY: obj.originY });
  newObj.set('name', obj.get('name'));
  cfg._runtime = runtime;
  newObj.data = { role: null, isCounter: false, anim, temporalLine: cfg };
  canvas.remove(obj);
  canvas.insertAt(idx, newObj);
  canvas.setActiveObject(newObj);
  canvas.requestRenderAll();
  refreshLayerList();
  selectProps(newObj);
  updateScrubRange();
}
// Called as a second pass inside applyFrame(), same convention as applyMapTimeline().
function applyLineChartTimeline(obj, elapsed) {
  const cfg = obj.data.temporalLine;
  const rt = cfg && cfg._runtime;
  if (!rt || !rt.src || !rt.pts.length) return;
  const dataTime = rt.src.videoTimeToDataTime(elapsed);
  const result = rt.src.valueAt(cfg.entity, dataTime);
  if (!result) return;
  const frac = rt.src.dataEnd > rt.src.dataStart ? clamp01((dataTime - rt.src.dataStart) / (rt.src.dataEnd - rt.src.dataStart)) : 0;
  const x = frac * rt.w;
  const padV = (rt.maxV - rt.minV) * 0.15 || Math.abs(rt.maxV) * 0.1 || 1;
  const y = rt.h - ((result.value - (rt.minV - padV)) / ((rt.maxV + padV) - (rt.minV - padV))) * rt.h;
  const offX = rt.groupOffsetX || 0, offY = rt.groupOffsetY || 0;
  // Observed (a real source row) vs interpolated (a smoothly-animated in-between state) are
  // visually distinguished, not silently presented as the same thing — full opacity + a solid
  // fill for an observed instant, a hollow/dimmer cursor while gliding between two real rows.
  rt.cursor.set({ left: x - offX, top: y - offY, fill: result.observed ? '#FFFFFF' : 'transparent', opacity: result.observed ? 1 : 0.7 }); rt.cursor.setCoords();
  rt.valueLabel.set({ left: x + 10 - offX, top: y - 24 - offY, text: formatTemporalValue(result.value, cfg.unit, { compact: cfg.compactNumbers, percentage: cfg.percentage }), opacity: result.observed ? 1 : 0.75 });
  rt.valueLabel.setCoords();
}
// Minimal number formatting, per the "don't build an arbitrary formatting engine" scoping —
// two optional flags on top of the existing round-to-1-decimal default, never silently
// changing UNIT mid-animation (compact/percentage are picked once, at layer-config time, not
// derived per-frame from the value itself).
function formatTemporalValue(v, unit, opts) {
  opts = opts || {};
  if (opts.percentage) {
    const rounded = Math.abs(v - Math.round(v)) < 0.01 ? Math.round(v) : Math.round(v * 10) / 10;
    return rounded + '%';
  }
  if (opts.compact && Math.abs(v) >= 1000) {
    const tiers = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    const tier = tiers.find(([n]) => Math.abs(v) >= n);
    const scaled = v / tier[0];
    const str = (Math.abs(scaled - Math.round(scaled)) < 0.01 ? Math.round(scaled) : Math.round(scaled * 10) / 10) + tier[1];
    return str + (unit ? ' ' + unit : '');
  }
  const rounded = Math.abs(v - Math.round(v)) < 0.01 ? Math.round(v) : Math.round(v * 10) / 10;
  return rounded + (unit ? ' ' + unit : '');
}

/* ---- StatView: a temporal stat card — screen-space, reuses buildStatCard() (the SAME       */
/* ---- visual system a Map Graphic's stat event uses) rather than a second implementation.   */
/* ---- Deliberately its own layer, not fused into the map, per "TemporalDataSource -> MapView */
/* ---- / LineView / StatView", not one monolithic PopulationMapWithGraphComponent.            */
function buildTemporalStatGroup(cfg) {
  const src = temporalSourceFor(cfg);
  const anchor = { x: cfg.left || 0, y: cfg.top || 0 };
  const built = buildStatCard({ label: cfg.label || cfg.entity, value: '', unit: cfg.unit, source: cfg.source, countUp: false }, anchor);
  const group = new fabric.Group(built.shapes, { subTargetCheck: false });
  return { group, runtime: Object.assign({ src }, built) };
}
function rebuildTemporalStat(obj, patch) {
  const cfg = Object.assign({}, obj.data.temporalStat, patch);
  const idx = canvas.getObjects().indexOf(obj);
  const anim = obj.data.anim;
  const { group: newObj, runtime } = buildTemporalStatGroup(cfg);
  newObj.set({ left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle, opacity: obj.opacity, originX: obj.originX, originY: obj.originY });
  newObj.set('name', obj.get('name'));
  cfg._runtime = runtime;
  newObj.data = { role: null, isCounter: false, anim, temporalStat: cfg };
  canvas.remove(obj);
  canvas.insertAt(idx, newObj);
  canvas.setActiveObject(newObj);
  canvas.requestRenderAll();
  refreshLayerList();
  selectProps(newObj);
  updateScrubRange();
}
function applyTemporalStatTimeline(obj, elapsed) {
  const cfg = obj.data.temporalStat;
  const rt = cfg && cfg._runtime;
  if (!rt || !rt.src) return;
  const dataTime = rt.src.videoTimeToDataTime(elapsed);
  const result = rt.src.valueAt(cfg.entity, dataTime);
  if (!result) return;
  rt.valueText.set('text', formatTemporalValue(result.value, cfg.unit, { compact: cfg.compactNumbers, percentage: cfg.percentage }));
}

// ---- props-panel control manifests for temporalLine/temporalStat ------------------------
// Same declarative pattern as MAP_EVENT_CONTROLS (see renderControlList above, which both
// this and the map event editor share) — a plain field is a one-line manifest entry, not new
// UI code. `sourceId`/`entity` are the two genuinely dynamic ones (their choices depend on the
// current data source registry / the chosen source's own entities), which is what the
// `select` control type's `optionsFor(cfg)` escape hatch (added alongside this) is for.
function onSetTemporalSource(cfg, v) {
  cfg.sourceId = v;
  const src = temporalSourceFor(cfg);
  const entities = src ? src.entities() : [];
  if (entities.length && !entities.includes(cfg.entity)) cfg.entity = entities[0];
}
const TEMPORAL_SOURCE_ENTITY_CONTROLS = [
  { key: 'sourceId', label: 'Data source', type: 'select', optionsFor: () => allTemporalSources(), onSet: onSetTemporalSource },
  { key: 'entity', label: 'Entity', type: 'select', optionsFor: (cfg) => { const src = temporalSourceFor(cfg); return src ? src.entities().map(e => ({ value: e, label: e })) : []; } },
];
const TEMPORAL_LINE_CONTROLS = [
  ...TEMPORAL_SOURCE_ENTITY_CONTROLS,
  { key: 'color', label: 'Line color', type: 'color' },
  { key: 'unit', label: 'Unit (optional)', type: 'text', placeholder: 'people', pairWithNext: true },
  { key: 'compactNumbers', label: 'Abbreviate (12.4K instead of 12400)', type: 'checkbox', default: false },
  { key: 'source', label: 'Source caption (optional — shown small under the chart)', type: 'text', placeholder: 'MIC Statistics Bureau, 2023' },
  { key: 'sourceUrl', label: 'Source URL (optional — editor reference only, never shown in the video)', type: 'text', placeholder: 'https://…' },
  { key: 'videoStart', label: 'Data range start (sec)', type: 'time', timeKind: 'point', pairWithNext: true },
  { key: 'videoEnd', label: 'Data range end (sec)', type: 'time', timeKind: 'point' },
];
const TEMPORAL_STAT_CONTROLS = [
  ...TEMPORAL_SOURCE_ENTITY_CONTROLS,
  { key: 'label', label: 'Label (optional — defaults to the entity name)', type: 'text', placeholder: 'Population' },
  { key: 'unit', label: 'Unit (optional)', type: 'text', placeholder: 'people', pairWithNext: true },
  { key: 'compactNumbers', label: 'Abbreviate (12.4K instead of 12400)', type: 'checkbox', default: false },
  { key: 'source', label: 'Source caption (optional — shown small on the card)', type: 'text', placeholder: 'MIC Statistics Bureau, 2023' },
  { key: 'sourceUrl', label: 'Source URL (optional — editor reference only, never shown in the video)', type: 'text', placeholder: 'https://…' },
  { key: 'videoStart', label: 'Data range start (sec)', type: 'time', timeKind: 'point', pairWithNext: true },
  { key: 'videoEnd', label: 'Data range end (sec)', type: 'time', timeKind: 'point' },
];
// "Data range" (videoStart/videoEnd, above) is DATA TIME's own window — the two video moments
// across which the full dataset plays. It's a deliberately separate concept from "Animation
// Duration" (the generic delay/duration entrance-fade controls every layer already gets,
// rendered further down in selectProps) — a creator can make the chart's data sweep take 4
// seconds while the chart itself fades in over the first 0.5 of those, and the two number
// pairs are shown in visually separate places rather than merged into one, to keep that
// distinction legible rather than implicit.
function renderTemporalDataRangeNote(body) {
  const note = document.createElement('div'); note.className = 'empty-note'; note.style.marginTop = '8px';
  note.textContent = 'Data range start/end are video moments — when this layer starts and finishes sweeping through its data. That is separate from the entrance animation (further down), which is just this layer\'s own fade/pop-in.';
  body.appendChild(note);
}
function renderTemporalLinePropsPanel(body, obj) {
  const cfg = obj.data.temporalLine;
  function commit() { rebuildLineChart(obj, cfg); }
  renderControlList(body, TEMPORAL_LINE_CONTROLS, cfg, commit, null);
  renderTemporalDataRangeNote(body);
}
function renderTemporalStatPropsPanel(body, obj) {
  const cfg = obj.data.temporalStat;
  function commit() { rebuildTemporalStat(obj, cfg); }
  renderControlList(body, TEMPORAL_STAT_CONTROLS, cfg, commit, null);
  renderTemporalDataRangeNote(body);
}
/* ---- Org/Family Tree: parses a plain indented-text outline (2 spaces = one level     ---- */
/* ---- deeper) into a tree, lays it out with each parent centered above its children    ---- */
/* ---- (classic leaf-counting layout — not the most compact possible, but simple and    ---- */
/* ---- always correct), and connects them with straight lines. One regenerable group,   ---- */
/* ---- same pattern as Dot-Grid/Map Pin above — no drag-to-rearrange individual boxes,  ---- */
/* ---- just re-type the outline and the whole tree regenerates in place.                ---- */
function parseOrgTree(text) {
  const lines = (text || '').split('\n').map(l => l.replace(/\t/g, '  ')).filter(l => l.trim().length);
  if (!lines.length) return null;
  const root = { name:'', children:[] };
  const stack = [root];
  lines.forEach(line => {
    const indent = line.match(/^ */)[0].length;
    const level = Math.floor(indent / 2);
    const node = { name: line.trim(), children:[] };
    while (stack.length > level + 1) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });
  // A single top-level entry is the root; multiple top-level entries share an invisible
  // synthetic root purely for layout (no box/connector is drawn for it).
  return root.children.length === 1 ? root.children[0] : root;
}
function layoutOrgTree(root, boxW, boxH, hGap, vGap) {
  let nextSlot = 0;
  (function place(node, depth) {
    node.depth = depth;
    if (!node.children.length) {
      node.cx = nextSlot * (boxW + hGap) + boxW / 2;
      nextSlot++;
    } else {
      node.children.forEach(c => place(c, depth + 1));
      const first = node.children[0], last = node.children[node.children.length - 1];
      node.cx = (first.cx + last.cx) / 2;
    }
    node.cy = depth * (boxH + vGap) + boxH / 2;
  })(root, root.name ? 0 : -1); // synthetic root (no name) doesn't occupy a visible row
  return root;
}
function buildOrgChartGroup(text, color) {
  color = color || COLORS.tealLight;
  const boxW = 190, boxH = 56, hGap = 24, vGap = 46;
  const root = parseOrgTree(text) || { name:'Type names below, one per line', children:[] };
  layoutOrgTree(root, boxW, boxH, hGap, vGap);
  const parts = [];
  (function walk(node) {
    if (node.name) {
      parts.push(new fabric.Rect({
        left: node.cx, top: node.cy, width: boxW, height: boxH, rx: 8, ry: 8,
        fill: 'rgba(255,255,255,0.08)', stroke: color, strokeWidth: 2,
        originX: 'center', originY: 'center', selectable:false, evented:false,
      }));
      parts.push(new fabric.Textbox(node.name, {
        left: node.cx, top: node.cy, width: boxW - 20, fontSize: 18, fontWeight: 600,
        fill: '#FFFFFF', textAlign: 'center', originX: 'center', originY: 'center',
        selectable:false, evented:false, splitByGrapheme: false,
      }));
    }
    node.children.forEach(child => {
      if (node.name) {
        parts.push(new fabric.Line([node.cx, node.cy + boxH/2, child.cx, child.cy - boxH/2], {
          stroke: 'rgba(255,255,255,0.4)', strokeWidth: 2, selectable:false, evented:false,
        }));
      }
      walk(child);
    });
  })(root);
  const group = new fabric.Group(parts, { subTargetCheck:false });
  // Keep an initial reasonable footprint even for a wide tree — the user can still resize
  // freely afterward via the normal corner handles like any other layer.
  if (group.width > W * 0.9) group.scale((W * 0.9) / group.width);
  return group;
}
function rebuildOrgChart(obj, patch) {
  const cfg = Object.assign({}, obj.data.orgchart, patch);
  const idx = canvas.getObjects().indexOf(obj);
  const anim = obj.data.anim;
  const newObj = buildOrgChartGroup(cfg.text, cfg.color);
  newObj.set({ left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY, angle: obj.angle, opacity: obj.opacity, originX: obj.originX, originY: obj.originY });
  newObj.set('name', obj.get('name'));
  newObj.data = { role:null, isCounter:false, anim, orgchart: cfg };
  canvas.remove(obj);
  canvas.insertAt(idx, newObj);
  canvas.setActiveObject(newObj);
  canvas.requestRenderAll();
  refreshLayerList();
  selectProps(newObj);
  updateScrubRange();
}

const TEMPLATES = {
  blank: {
    label: 'Blank canvas',
    category: 'Basics',
    layers: () => [],
  },
  stat: {
    label: 'Stat Reveal',
    category: 'Stats & Data',
    layers: () => {
      const cx = W/2, rel = W/1920;
      const cardW = 560*rel, cardH = 340, gap = 90*rel;
      const c1x = cx - gap/2 - cardW, c2x = cx + gap/2;
      return [
        T("JAPAN'S NATIONAL TOURISM POLICY", { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:170, width:1300*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('By 2030, the Cabinet-approved plan targets:', { name:'Headline', role:'display', fontWeight:700, fontSize:46, fill:'#FFFFFF', left:cx, top:230, width:1500*rel, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
        R({ name:'Card 1', left:c1x, top:420, width:cardW, height:cardH, rx:18, ry:18, fill:'rgba(255,255,255,0.06)', stroke:'rgba(255,255,255,0.14)', strokeWidth:2, anim:{type:'pop',delay:1050,duration:600} }),
        T('60M', { name:'Card 1 number', role:'display', fontWeight:700, fontSize:104, fill:COLORS.tealLight, left:c1x+cardW/2, top:565, originX:'center', originY:'center', textAlign:'center', isCounter:true, anim:{type:'countup',delay:1600,duration:1400} }),
        T('international visitors', { name:'Card 1 label', role:'body', fontSize:26, fill:'rgba(255,255,255,0.82)', left:c1x+cardW/2, top:700, width:cardW-80, originX:'center', textAlign:'center', anim:{type:'fade',delay:1050,duration:600} }),
        R({ name:'Card 2', left:c2x, top:420, width:cardW, height:cardH, rx:18, ry:18, fill:'rgba(255,255,255,0.06)', stroke:'rgba(255,255,255,0.14)', strokeWidth:2, anim:{type:'pop',delay:1200,duration:600} }),
        T('¥15T', { name:'Card 2 number', role:'display', fontWeight:700, fontSize:104, fill:COLORS.greenLight, left:c2x+cardW/2, top:565, originX:'center', originY:'center', textAlign:'center', isCounter:true, anim:{type:'countup',delay:1750,duration:1400} }),
        T('in inbound spending', { name:'Card 2 label', role:'body', fontSize:26, fill:'rgba(255,255,255,0.82)', left:c2x+cardW/2, top:700, width:cardW-80, originX:'center', textAlign:'center', anim:{type:'fade',delay:1200,duration:600} }),
        T('Cabinet-approved national tourism plan · 27 March 2026', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:cx, top:800, width:1400*rel, originX:'center', textAlign:'center', anim:{type:'fade',delay:3300,duration:600} }),
        R({ name:'Tag pill', left:cx, top:855, width:420*rel, height:48, rx:24, ry:24, fill:COLORS.amber, originX:'center', anim:{type:'pop',delay:3550,duration:500} }),
        T('TARGET, NOT A FORECAST', { name:'Tag text', role:'body', fontWeight:700, fontSize:20, fill:'#FFFFFF', left:cx, top:879, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:3550,duration:500} }),
      ];
    },
  },
  cards: {
    label: 'Category Cards',
    category: 'Lists & Steps',
    layers: () => {
      const items = ['National government','Local government','Residents','Tourism business','Travellers'];
      const n = items.length, cx = W/2, rel = W/1920, portrait = H > W;
      const out = [
        T('WHO IS "JAPAN" IN THIS STORY?', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:190, width:1300*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('"Japan wants..." always means one of these:', { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:cx, top:250, width:1600*rel, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      ];
      let citationTop;
      if (portrait) {
        // Single stacked column: badge+number on the left of each row, label to the right —
        // a side-by-side card grid doesn't fit a 1080-wide frame for 5 items.
        const cardW = W*0.72, cardH = 130, gap = 24, startY = 380;
        const x = cx - cardW/2;
        items.forEach((label,i) => {
          const y = startY+i*(cardH+gap), delay = 1000+i*150, color = CARD_PALETTE[i%CARD_PALETTE.length];
          out.push(R({ name:`Card ${i+1}`, left:x, top:y, width:cardW, height:cardH, rx:16, ry:16, fill:'rgba(255,255,255,0.06)', stroke:'rgba(255,255,255,0.16)', strokeWidth:2, anim:{type:'pop',delay,duration:500} }));
          out.push(C({ name:`Card ${i+1} badge`, left:x+70, top:y+cardH/2, radius:34, fill:'rgba(255,255,255,0.1)', stroke:color, strokeWidth:3, originX:'center', originY:'center', anim:{type:'pop',delay:delay+50,duration:500} }));
          out.push(T(String(i+1), { name:`Card ${i+1} number`, role:'display', fontWeight:700, fontSize:30, fill:color, left:x+70, top:y+cardH/2, width:60, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:delay+150,duration:400} }));
          out.push(T(label, { name:`Card ${i+1} label`, role:'body', fontWeight:600, fontSize:24, fill:'#FFFFFF', left:x+140, top:y+cardH/2, width:cardW-160, originX:'left', originY:'center', textAlign:'left', anim:{type:'fade',delay:delay+100,duration:500} }));
        });
        citationTop = startY + n*(cardH+gap) - gap + 60;
      } else {
        const cardW=300*rel, cardH=280, gap=40*rel;
        const totalW = n*cardW+(n-1)*gap, startX = cx-totalW/2, top=420;
        items.forEach((label,i) => {
          const x = startX+i*(cardW+gap), delay = 1000+i*150, color = CARD_PALETTE[i%CARD_PALETTE.length];
          out.push(R({ name:`Card ${i+1}`, left:x, top, width:cardW, height:cardH, rx:16, ry:16, fill:'rgba(255,255,255,0.06)', stroke:'rgba(255,255,255,0.16)', strokeWidth:2, anim:{type:'pop',delay,duration:500} }));
          out.push(C({ name:`Card ${i+1} badge`, left:x+cardW/2, top:top+78, radius:40, fill:'rgba(255,255,255,0.1)', stroke:color, strokeWidth:3, originX:'center', originY:'center', anim:{type:'pop',delay:delay+50,duration:500} }));
          out.push(T(String(i+1), { name:`Card ${i+1} number`, role:'display', fontWeight:700, fontSize:32, fill:color, left:x+cardW/2, top:top+78, width:70, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:delay+150,duration:400} }));
          out.push(T(label, { name:`Card ${i+1} label`, role:'body', fontWeight:600, fontSize:22, fill:'#FFFFFF', left:x+cardW/2, top:top+165, width:cardW-30, originX:'center', textAlign:'center', anim:{type:'fade',delay:delay+100,duration:500} }));
        });
        citationTop = top+cardH+70;
      }
      out.push(T('Editorial framing — no single source', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:cx, top:citationTop, width:1400*rel, originX:'center', textAlign:'center', anim:{type:'fade',delay:1000+items.length*150+150,duration:500} }));
      return out;
    },
  },
  checklist: {
    label: 'Checklist Reveal',
    category: 'Lists & Steps',
    layers: () => {
      const items = [
        'Keep every receipt until you leave Japan',
        'Confirm the ¥5,000 minimum per store, per day',
        'Complete Customs at the airport before your refund',
        'Refund lands on your card, not in cash',
      ];
      const cx = W/2, rel = W/1920;
      const listW=1100*rel, itemH=92, startY=430, startX=cx-listW/2;
      const out = [
        T('BEFORE YOU FILM THIS BEAT', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:200, width:1300*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('Traveller checklist:', { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:cx, top:260, width:1400*rel, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      ];
      items.forEach((it,i) => {
        const y = startY+i*itemH, delay = 1000+i*220;
        out.push(R({ name:`Row ${i+1} bg`, left:startX, top:y, width:listW, height:itemH-14, rx:12, ry:12, fill:'rgba(255,255,255,0.05)', anim:{type:'fade',delay,duration:400} }));
        out.push(R({ name:`Row ${i+1} check`, left:startX+18, top:y+(itemH-14)/2-23, width:46, height:46, rx:9, ry:9, fill:COLORS.greenLight, anim:{type:'pop',delay:delay+150,duration:400} }));
        out.push(T(it, { name:`Row ${i+1} text`, role:'body', fontSize:26, fill:'#FFFFFF', left:startX+18+46+26, top:y+(itemH-14)/2, width:listW-46-70, originX:'left', originY:'center', textAlign:'left', anim:{type:'fade',delay,duration:400} }));
      });
      out.push(T('National Tax Agency guidance', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:cx, top:startY+items.length*itemH+50, width:1400*rel, originX:'center', textAlign:'center', anim:{type:'fade',delay:1000+items.length*220+250,duration:500} }));
      return out;
    },
  },
  dotgrid: {
    label: 'Dot-Grid Pictogram',
    category: 'Stats & Data',
    layers: () => {
      const cx = W/2, rel = W/1920;
      return [
        T('DIET SEAT REDUCTION BILL', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:190, width:1300*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T("Under the bill's fallback, the House would go from:", { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:cx, top:250, width:1500*rel, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
        D({ name:'Dot grid', left:cx, top:420, width:Math.min(1400,W*0.9), originX:'center', originY:'top', total:465, highlight:45, highlightColor:COLORS.amberLight, anim:{type:'fade',delay:900,duration:700} }),
        T('465 seats today', { name:'Total label', role:'body', fontSize:26, fill:'rgba(255,255,255,0.75)', left:cx, top:830, width:900*rel, textAlign:'center', originX:'center', anim:{type:'fade',delay:2200,duration:500} }),
        T('45 PR seats cut under the fallback', { name:'Highlight label', role:'body', fontWeight:700, fontSize:28, fill:COLORS.amberLight, left:cx, top:872, width:900*rel, textAlign:'center', originX:'center', anim:{type:'fade',delay:2350,duration:500} }),
        T('Bill under continued Diet examination as of 16 Aug 2026', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:cx, top:930, width:1400*rel, originX:'center', textAlign:'center', anim:{type:'fade',delay:2650,duration:600} }),
        R({ name:'Tag pill', left:cx, top:985, width:520*rel, height:48, rx:24, ry:24, fill:COLORS.red, originX:'center', anim:{type:'pop',delay:2850,duration:500} }),
        T('BILL ONLY — NOT ENACTED', { name:'Tag text', role:'body', fontWeight:700, fontSize:20, fill:'#FFFFFF', left:cx, top:1009, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:2850,duration:500} }),
      ];
    },
  },
  compare: {
    label: 'Before / After',
    category: 'Comparisons',
    layers: () => {
      const leftLines = ['Pay tax-free price at the shop', 'Show your passport at checkout'];
      const rightLines = ['Pay full price with tax', 'Customs confirms your export', 'Shop or provider refunds you'];
      const leftColor = COLORS.tealLight, rightColor = COLORS.amberLight;
      const cx = W/2, rel = W/1920, portrait = H > W;
      const panelH = 120 + Math.max(leftLines.length, rightLines.length) * 90 + 40;
      const LEFT_START = 950, RIGHT_START = 1500;

      // Builds one panel's full contents (frame, label pill, optional flag pill, bulleted
      // lines) at a given top-left — shared between the side-by-side and stacked layouts so
      // the panel design only lives in one place.
      function panelBlock(px, py, panelW, color, labelText, flagText, lines, delay, key) {
        const b = [
          R({ name:`${key} panel`, left:px, top:py, width:panelW, height:panelH, rx:16, ry:16, fill:'rgba(255,255,255,0.06)', stroke:color, strokeWidth:3, anim:{type:'pop',delay,duration:550} }),
          R({ name:`${key} label pill`, left:px+28, top:py+26, width:labelText.length*11+50, height:40, rx:20, ry:20, fill:color, anim:{type:'pop',delay,duration:550} }),
          T(labelText, { name:`${key} label text`, role:'body', fontWeight:700, fontSize:18, fill:'#12213B', left:px+28+(labelText.length*11+50)/2, top:py+26+20, width:labelText.length*11+50, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay,duration:550} }),
        ];
        if (flagText) {
          const flagW = flagText.length*11+40;
          b.push(R({ name:`${key} flag pill`, left:px+panelW-flagW-20, top:py+26, width:flagW, height:36, rx:18, ry:18, fill:'rgba(0,0,0,0.28)', stroke:color, strokeWidth:2, anim:{type:'pop',delay,duration:550} }));
          b.push(T(flagText, { name:`${key} flag text`, role:'body', fontWeight:700, fontSize:18, fill:color, left:px+panelW-flagW-20+flagW/2, top:py+26+18, width:flagW, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay,duration:550} }));
        }
        lines.forEach((line, i) => {
          const y = py+96+i*90, ld = delay+250+i*120;
          b.push(C({ name:`${key} bullet ${i+1}`, left:px+44, top:y, radius:6, fill:color, originX:'center', originY:'center', anim:{type:'fade',delay:ld,duration:400} }));
          b.push(T(line, { name:`${key} line ${i+1}`, role:'body', fontSize:24, fill:'#FFFFFF', left:px+44+26, top:y, width:panelW-100, originX:'left', originY:'center', textAlign:'left', anim:{type:'fade',delay:ld,duration:400} }));
        });
        return b;
      }

      const out = [
        T('TAX-FREE SHOPPING, BEFORE AND AFTER', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:190, width:1300*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('How the refund process changes:', { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:cx, top:250, width:1500*rel, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      ];
      let citationTop;
      if (portrait) {
        // Stack the two panels top/bottom with a downward arrow — side-by-side panels
        // (740px each) don't fit a 1080-wide frame.
        const panelW = W*0.8, px = cx-panelW/2, topY = 380, bottomY = topY+panelH+130;
        out.push(...panelBlock(px, topY, panelW, leftColor, 'CURRENT', null, leftLines, LEFT_START, 'Left'));
        out.push(...panelBlock(px, bottomY, panelW, rightColor, 'FROM 1 NOV 2026', 'FUTURE RULE', rightLines, RIGHT_START, 'Right'));
        out.push(T('↓', { name:'Arrow', role:'display', fontSize:60, fill:'rgba(255,255,255,0.55)', left:cx, top:topY+panelH+65, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:RIGHT_START-100,duration:400} }));
        citationTop = bottomY+panelH+66;
      } else {
        const panelW = 740*rel, gap = 140*rel, top = 420;
        const leftX = cx - gap/2 - panelW, rightX = cx + gap/2;
        out.push(...panelBlock(leftX, top, panelW, leftColor, 'CURRENT', null, leftLines, LEFT_START, 'Left'));
        out.push(...panelBlock(rightX, top, panelW, rightColor, 'FROM 1 NOV 2026', 'FUTURE RULE', rightLines, RIGHT_START, 'Right'));
        out.push(T('→', { name:'Arrow', role:'display', fontSize:60, fill:'rgba(255,255,255,0.55)', left:cx, top:top+panelH/2, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:RIGHT_START-100,duration:400} }));
        citationTop = top+panelH+66;
      }
      out.push(T('National Tax Agency guidance · effective 1 November 2026', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:cx, top:citationTop, width:1600*rel, originX:'center', textAlign:'center', anim:{type:'fade',delay:RIGHT_START+250+Math.max(leftLines.length,rightLines.length)*120+200,duration:500} }));
      return out;
    },
  },
  flow: {
    label: 'Process Flow',
    category: 'Lists & Steps',
    layers: () => {
      const steps = ['Buy at full price', 'Customs confirms export', 'Shop or provider refunds you', 'Refund reaches your card'];
      const n = steps.length, cx = W/2, rel = W/1920, portrait = H > W;
      const out = [
        T('HOW THE REFUND ACTUALLY WORKS', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:190, width:1300*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('One receipt moves through four steps:', { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:cx, top:250, width:1500*rel, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      ];
      let citationTop;
      if (portrait) {
        // Vertical stepped list with a downward arrow — a horizontal row of 4 boxes doesn't
        // fit a 1080-wide frame.
        const boxW = W*0.72, boxH = 150, gap = 40, startY = 380, x = cx-boxW/2;
        steps.forEach((s, i) => {
          const y = startY+i*(boxH+gap), delay = 1000+i*350, color = CARD_PALETTE[i % CARD_PALETTE.length];
          out.push(R({ name:`Step ${i+1} box`, left:x, top:y, width:boxW, height:boxH, rx:14, ry:14, fill:'rgba(255,255,255,0.07)', stroke:color, strokeWidth:2.5, anim:{type:'pop',delay,duration:500} }));
          out.push(T('0'+(i+1), { name:`Step ${i+1} number`, role:'display', fontWeight:700, fontSize:26, fill:color, left:x+24, top:y+18, width:60, originX:'left', originY:'top', textAlign:'left', anim:{type:'fade',delay,duration:400} }));
          out.push(T(s, { name:`Step ${i+1} label`, role:'body', fontSize:24, fill:'#FFFFFF', left:x+boxW/2, top:y+boxH/2+16, width:boxW-70, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay,duration:500} }));
          if (i > 0) {
            const prevBottom = startY+(i-1)*(boxH+gap)+boxH;
            out.push(T('↓', { name:`Arrow ${i}`, role:'display', fontSize:32, fill:'rgba(255,255,255,0.55)', left:cx, top:prevBottom+gap/2, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:delay-150,duration:350} }));
          }
        });
        citationTop = startY+(n-1)*(boxH+gap)+boxH+70;
      } else {
        const boxW = Math.min(300, Math.floor((1760*rel - (n-1)*90*rel) / n)), boxH = 190, gap = 90*rel;
        const totalW = n*boxW + (n-1)*gap, startX = cx - totalW/2, y = 450;
        steps.forEach((s, i) => {
          const x = startX + i*(boxW+gap), delay = 1000 + i*350, color = CARD_PALETTE[i % CARD_PALETTE.length];
          out.push(R({ name:`Step ${i+1} box`, left:x, top:y, width:boxW, height:boxH, rx:14, ry:14, fill:'rgba(255,255,255,0.07)', stroke:color, strokeWidth:2.5, anim:{type:'pop',delay,duration:500} }));
          out.push(T('0'+(i+1), { name:`Step ${i+1} number`, role:'display', fontWeight:700, fontSize:26, fill:color, left:x+20, top:y+16, width:60, originX:'left', originY:'top', textAlign:'left', anim:{type:'fade',delay,duration:400} }));
          out.push(T(s, { name:`Step ${i+1} label`, role:'body', fontSize:22, fill:'#FFFFFF', left:x+boxW/2, top:y+108, width:boxW-36, originX:'center', textAlign:'center', anim:{type:'fade',delay,duration:500} }));
          if (i > 0) {
            const prevRight = startX + (i-1)*(boxW+gap) + boxW;
            out.push(T('→', { name:`Arrow ${i}`, role:'display', fontSize:36, fill:'rgba(255,255,255,0.55)', left:prevRight+gap/2, top:y+boxH/2, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:delay-150,duration:350} }));
          }
        });
        citationTop = y+boxH+80;
      }
      const LAST = 1000 + (n-1)*350 + 500;
      out.push(T('National Tax Agency guidance', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:cx, top:citationTop, width:1600*rel, originX:'center', textAlign:'center', anim:{type:'fade',delay:LAST+150,duration:500} }));
      return out;
    },
  },
  lowerthird: {
    label: 'Lower-Third (Speaker ID)',
    category: 'People & Quotes',
    layers: () => {
      const barW = Math.min(700, W*0.55), barH = 110;
      const x = W*0.06, y = H*0.82;
      return [
        R({ name:'Accent bar', left:x, top:y, width:8, height:barH, fill:COLORS.tealLight, anim:{type:'slideFromLeft',delay:200,duration:500} }),
        R({ name:'Name bar', left:x+8, top:y, width:barW, height:barH, fill:'rgba(15,25,45,0.85)', anim:{type:'slideFromLeft',delay:150,duration:550} }),
        T('Speaker Name', { name:'Name', role:'display', fontWeight:700, fontSize:32, fill:'#FFFFFF', left:x+8+28, top:y+24, width:barW-56, originX:'left', originY:'top', textAlign:'left', anim:{type:'fade',delay:500,duration:450} }),
        T('Role or location', { name:'Subtitle', role:'body', fontSize:20, fill:COLORS.tealLight, left:x+8+28, top:y+68, width:barW-56, originX:'left', originY:'top', textAlign:'left', anim:{type:'fade',delay:600,duration:450} }),
      ];
    },
  },
  quote: {
    label: 'Quote / Testimonial',
    category: 'People & Quotes',
    layers: () => {
      const cx = W/2, boxW = Math.min(1300, W*0.8);
      return [
        T('“', { name:'Quote mark', role:'display', fontWeight:900, fontSize:150, fill:COLORS.tealLight, left:cx, top:210, width:200, originX:'center', originY:'center', textAlign:'center', anim:{type:'pop',delay:200,duration:500} }),
        T('The best trips leave room to be surprised.', { name:'Quote text', role:'display', fontWeight:700, fontSize:42, fill:'#FFFFFF', left:cx, top:420, width:boxW, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:550,duration:600} }),
        R({ name:'Rule', left:cx, top:610, width:80, height:4, fill:COLORS.amberLight, originX:'center', anim:{type:'pop',delay:1300,duration:400} }),
        T('Maya Tanaka', { name:'Attribution name', role:'body', fontWeight:700, fontSize:26, fill:'#FFFFFF', left:cx, top:660, width:boxW, originX:'center', originY:'top', textAlign:'center', anim:{type:'fade',delay:1500,duration:500} }),
        T('Tour guide, Kyoto', { name:'Attribution role', role:'body', fontSize:20, fill:'rgba(255,255,255,0.65)', left:cx, top:702, width:boxW, originX:'center', originY:'top', textAlign:'center', anim:{type:'fade',delay:1600,duration:500} }),
      ];
    },
  },
  timeline: {
    label: 'Timeline',
    category: 'Lists & Steps',
    layers: () => {
      const events = [
        { date:'2019', text:'Idea first proposed' },
        { date:'2022', text:'Pilot program launched' },
        { date:'2024', text:'National rollout begins' },
        { date:'2026', text:'Full implementation' },
      ];
      const n = events.length, cx = W/2, rel = W/1920, portrait = H > W;
      const out = [
        T('A TIMELINE OF THE POLICY', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:190, width:1300*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('How we got here:', { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:cx, top:250, width:1500*rel, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      ];
      let citationTop;
      if (portrait) {
        // Vertical line down the left with date + description to the right of each node —
        // a horizontal timeline doesn't fit a 1080-wide frame for 4+ events.
        const lineX = W*0.14, startY = 400, rowH = 280, textW = W-lineX-40-60;
        out.push(R({ name:'Timeline line', left:lineX, top:startY, width:4, height:(n-1)*rowH, fill:'rgba(255,255,255,0.25)', anim:{type:'fade',delay:700,duration:600} }));
        events.forEach((e,i) => {
          const y = startY+i*rowH, delay = 1000+i*300, color = CARD_PALETTE[i%CARD_PALETTE.length];
          out.push(C({ name:`Node ${i+1}`, left:lineX, top:y, radius:14, fill:color, originX:'center', originY:'center', anim:{type:'pop',delay,duration:400} }));
          out.push(T(e.date, { name:`Date ${i+1}`, role:'display', fontWeight:700, fontSize:30, fill:color, left:lineX+40, top:y-30, width:textW, originX:'left', originY:'top', textAlign:'left', anim:{type:'fade',delay:delay+100,duration:400} }));
          out.push(T(e.text, { name:`Event ${i+1}`, role:'body', fontSize:24, fill:'#FFFFFF', left:lineX+40, top:y+14, width:textW, originX:'left', originY:'top', textAlign:'left', anim:{type:'fade',delay:delay+200,duration:400} }));
        });
        citationTop = startY+(n-1)*rowH+120;
      } else {
        const lineY = 560, startX = W*0.14, endX = W-W*0.14, stepX = (endX-startX)/(n-1), textW = stepX-20;
        out.push(R({ name:'Timeline line', left:startX, top:lineY, width:endX-startX, height:4, fill:'rgba(255,255,255,0.25)', anim:{type:'fade',delay:700,duration:600} }));
        events.forEach((e,i) => {
          const x = startX+i*stepX, delay = 1000+i*300, color = CARD_PALETTE[i%CARD_PALETTE.length];
          out.push(C({ name:`Node ${i+1}`, left:x, top:lineY, radius:14, fill:color, originX:'center', originY:'center', anim:{type:'pop',delay,duration:400} }));
          out.push(T(e.date, { name:`Date ${i+1}`, role:'display', fontWeight:700, fontSize:28, fill:color, left:x, top:lineY-60, width:textW, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:delay+100,duration:400} }));
          out.push(T(e.text, { name:`Event ${i+1}`, role:'body', fontSize:22, fill:'#FFFFFF', left:x, top:lineY+60, width:textW, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:delay+200,duration:400} }));
        });
        citationTop = lineY+160;
      }
      out.push(T('Citation or source', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:cx, top:citationTop, width:1400*rel, originX:'center', textAlign:'center', anim:{type:'fade',delay:1000+n*300+300,duration:500} }));
      return out;
    },
  },
  listicle: {
    label: 'Listicle / Ranking',
    category: 'Lists & Steps',
    layers: () => {
      const items = [
        'Kyoto — historic temples and gardens',
        'Osaka — street food capital',
        'Hokkaido — powder snow and hot springs',
        'Okinawa — subtropical beaches',
        'Tokyo — neon and tradition side by side',
      ];
      const cx = W/2, rel = W/1920;
      const listW = 1200*rel, itemH = 110, startY = 400, startX = cx-listW/2;
      const out = [
        T('WHERE TO GO FIRST', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:200, width:1300*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('Top 5 regions for first-time visitors:', { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:cx, top:260, width:1500*rel, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      ];
      items.forEach((it,i) => {
        const y = startY+i*itemH, delay = 1000+i*200, color = CARD_PALETTE[i%CARD_PALETTE.length];
        out.push(R({ name:`Row ${i+1} bg`, left:startX, top:y, width:listW, height:itemH-16, rx:12, ry:12, fill:'rgba(255,255,255,0.05)', anim:{type:'fade',delay,duration:400} }));
        out.push(C({ name:`Row ${i+1} badge`, left:startX+45, top:y+(itemH-16)/2, radius:30, fill:'rgba(255,255,255,0.1)', stroke:color, strokeWidth:3, originX:'center', originY:'center', anim:{type:'pop',delay:delay+100,duration:400} }));
        out.push(T(String(i+1), { name:`Row ${i+1} number`, role:'display', fontWeight:700, fontSize:26, fill:color, left:startX+45, top:y+(itemH-16)/2, width:60, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:delay+150,duration:400} }));
        out.push(T(it, { name:`Row ${i+1} text`, role:'body', fontSize:24, fill:'#FFFFFF', left:startX+90, top:y+(itemH-16)/2, width:listW-90-40, originX:'left', originY:'center', textAlign:'left', anim:{type:'fade',delay,duration:400} }));
      });
      out.push(T('Editorial ranking — order simplified for pacing', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:cx, top:startY+items.length*itemH+50, width:1400*rel, originX:'center', textAlign:'center', anim:{type:'fade',delay:1000+items.length*200+250,duration:500} }));
      return out;
    },
  },
  mapCountry: {
    label: 'Map: Highlight Country',
    category: 'Maps',
    layers: () => {
      const cx = W/2, rel = W/1920;
      const mapScale = Math.min(W*0.8/960, H*0.55/500);
      return [
        T("WHERE THIS FITS ON THE MAP", { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:130, width:1500*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        M({ name:'World map', left:cx, top:H*0.58, originX:'center', originY:'center', scope:'world', scale:mapScale, anim:{type:'fade',delay:600,duration:900}, events:[
          { type:'highlight', id:'e1', region:'Japan', color:COLORS.tealLight, start:500, duration:700, dim:true },
        ] }),
        T('Japan', { name:'Caption', role:'display', fontWeight:700, fontSize:38, fill:'#FFFFFF', left:cx, top:H*0.9, width:1400*rel, originX:'center', textAlign:'center', anim:{type:'fade',delay:1400,duration:500} }),
      ];
    },
  },
  mapJapanRegion: {
    label: 'Map: Region Highlight + Zoom + Stat',
    category: 'Maps',
    layers: () => {
      const cx = W/2, rel = W/1920;
      const mapScale = Math.min(W*0.75/600, H*0.6/650);
      return [
        T('A CLOSER LOOK', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:130, width:1500*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        M({ name:'Japan map', left:cx, top:H*0.55, originX:'center', originY:'center', scope:'japan', scale:mapScale, anim:{type:'fade',delay:500,duration:800}, events:[
          { type:'highlight', id:'e1', region:'Kanagawa', color:COLORS.amberLight, start:400, duration:700, dim:true },
          { type:'zoom', id:'e2', region:'Kanagawa', padding:0.28, start:1300, duration:1400 },
          { type:'stat', id:'e3', region:'Kanagawa', label:'Population', value:'9.2', unit:'million', countUp:true, start:2900, duration:900 },
        ] }),
      ];
    },
  },
  mapFlight: {
    label: 'Map: Flight Route + Arrival Zoom',
    category: 'Maps',
    layers: () => {
      const cx = W/2, rel = W/1920;
      const mapScale = Math.min(W*0.75/600, H*0.6/650);
      return [
        T('WHERE WE ARE HEADED', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:130, width:1500*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        M({ name:'Japan flight map', left:cx, top:H*0.55, originX:'center', originY:'center', scope:'japan', scale:mapScale, anim:{type:'fade',delay:500,duration:800}, events:[
          { type:'highlight', id:'e0', region:'Tōkyō', color:COLORS.tealLight, start:300, duration:500, dim:false },
          { type:'route', id:'e1', from:'Tōkyō', to:'Hokkaidō', style:'flight', movingObject:'plane', curve:'medium', color:COLORS.amberLight, showTrail:true, start:1000, duration:2200 },
          { type:'highlight', id:'e2', region:'Hokkaidō', color:COLORS.tealLight, start:3200, duration:600, dim:true },
          { type:'zoom', id:'e3', region:'Hokkaidō', padding:0.28, start:3700, duration:1400 },
          { type:'stat', id:'e4', region:'Hokkaidō', label:'Population', value:'5.0', unit:'million', countUp:true, start:5300, duration:900 },
        ] }),
      ];
    },
  },
  mapHighlightRoute: {
    label: 'Map: Highlight Then Route Onward',
    category: 'Maps',
    layers: () => {
      const cx = W/2, rel = W/1920;
      const mapScale = Math.min(W*0.75/600, H*0.6/650);
      return [
        T('TWO PLACES, ONE STORY', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:cx, top:130, width:1500*rel, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        M({ name:'Japan route map', left:cx, top:H*0.58, originX:'center', originY:'center', scope:'japan', scale:mapScale, anim:{type:'fade',delay:500,duration:800}, events:[
          { type:'highlight', id:'e1', region:'Ōsaka', color:COLORS.tealLight, start:400, duration:700, dim:true },
          { type:'route', id:'e2', from:'Ōsaka', to:'Hiroshima', style:'arrow', movingObject:'arrow', curve:'medium', color:COLORS.amberLight, showTrail:true, start:1500, duration:1600 },
          { type:'highlight', id:'e3', region:'Hiroshima', color:COLORS.amberLight, start:3100, duration:600, dim:true },
        ] }),
      ];
    },
  },
  // Benchmark: TEMPORAL LINKED VIEW (Phase 8/10) — Map, Line, and Stat each independently
  // read the same TemporalDataSource (TEMPORAL_FIXTURES.fixtureIndex) across the same
  // 1000-5000ms window, proving synchronization by construction rather than by wiring one
  // component to another — see "Temporal data foundation" above. The map's job here is
  // deliberately just "show which entity" (a plain highlight spanning the whole window, not a
  // choropleth), per the phase spec's explicit "do not implement full choropleth yet" scoping.
  // TEMPORAL_FIXTURES data is clearly-labeled test fixture data, not real statistics.
  temporalLinkedView: {
    label: 'Temporal: Map + Line + Stat (fixture data)',
    category: 'Maps',
    layers: () => {
      const cx = W/2, rel = W/1920;
      const mapScale = Math.min(W*0.32/600, H*0.28/650);
      const mapTop = H*0.32;
      const mapBottom = mapTop + 650*mapScale/2;
      const chartW = Math.min(560, W*0.5), chartH = 170;
      const chartTop = mapBottom + 50;
      const statTop = chartTop + chartH + 60;
      const windowStart = 1000, windowEnd = 5000;
      return [
        T('A CHANGING REGION — 2000 TO 2020 (TEST FIXTURE DATA)', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:24, fill:COLORS.tealLight, left:cx, top:130, width:1600*rel, textAlign:'center', originX:'center', charSpacing:200, anim:{type:'fade',delay:300,duration:600} }),
        M({ name:'Japan map', left:cx, top:mapTop, originX:'center', originY:'center', scope:'japan', scale:mapScale, anim:{type:'fade',delay:500,duration:800}, events:[
          { type:'highlight', id:'e1', region:'Hokkaidō', color:COLORS.tealLight, start:200, duration:600, dim:true },
        ] }),
        LN({ name:'Hokkaidō trend line', left:cx - chartW/2, top:chartTop, originX:'left', originY:'top', sourceId:'fixtureIndex', entity:'Hokkaidō', color:COLORS.tealLight, unit:'idx', width:chartW, height:chartH, videoStart:windowStart, videoEnd:windowEnd, anim:{type:'fade',delay:700,duration:600} }),
        TS({ name:'Hokkaidō index stat', left:cx - 104, top:statTop, originX:'left', originY:'top', sourceId:'fixtureIndex', entity:'Hokkaidō', label:'Hokkaidō index', unit:'idx', source:'Fixture test data — not a real statistic', videoStart:windowStart, videoEnd:windowEnd, anim:{type:'fade',delay:900,duration:600} }),
      ];
    },
  },
};

/* ============ LAYER CREATION FROM SPEC ============ */
function specToObject(spec) {
  let obj;
  if (spec.kind === 'text') {
    obj = new fabric.Textbox(spec.text, {
      left: spec.left, top: spec.top, width: spec.width || 400,
      fontSize: spec.fontSize || 28, fontFamily: resolveFont(spec.role || 'body'),
      fontWeight: spec.fontWeight || 400, fill: spec.fill || '#FFFFFF',
      textAlign: spec.textAlign || 'center', originX: spec.originX || 'left', originY: spec.originY || 'top',
      charSpacing: spec.charSpacing || 0, splitByGrapheme: false,
    });
  } else if (spec.kind === 'rect') {
    obj = new fabric.Rect({
      left: spec.left, top: spec.top, width: spec.width, height: spec.height,
      rx: spec.rx || 0, ry: spec.ry || 0, fill: spec.fill || 'rgba(255,255,255,0.08)',
      stroke: spec.stroke || null, strokeWidth: spec.strokeWidth || 0,
      originX: spec.originX || 'left', originY: spec.originY || 'top',
    });
  } else if (spec.kind === 'circle') {
    obj = new fabric.Circle({
      left: spec.left, top: spec.top, radius: spec.radius || 60,
      fill: spec.fill || 'rgba(255,255,255,0.08)', stroke: spec.stroke || null, strokeWidth: spec.strokeWidth || 0,
      originX: spec.originX || 'left', originY: spec.originY || 'top',
    });
  } else if (spec.kind === 'dotgrid') {
    obj = buildDotGridGroup(spec.total, spec.highlight, spec.highlightColor);
    obj.set({ left: spec.left, top: spec.top, originX: spec.originX || 'left', originY: spec.originY || 'top' });
  } else if (spec.kind === 'pin') {
    obj = buildPinGroup(spec.label, spec.color, spec.style);
    obj.set({ left: spec.left, top: spec.top, originX: spec.originX || 'left', originY: spec.originY || 'top' });
  } else if (spec.kind === 'orgchart') {
    obj = buildOrgChartGroup(spec.text, spec.color);
    obj.set({ left: spec.left, top: spec.top, originX: spec.originX || 'left', originY: spec.originY || 'top' });
  } else if (spec.kind === 'map') {
    var mapCfg = migrateMapConfig({
      scope: normalizeMapScope(spec.scope),
      events: spec.events || null,
      highlights: spec.highlights, routeFrom: spec.routeFrom, routeTo: spec.routeTo, routeColor: spec.routeColor,
    });
    const built = buildMapGroup(mapCfg.scope, mapCfg.events);
    obj = built.group;
    obj.set({ left: spec.left, top: spec.top, originX: spec.originX || 'left', originY: spec.originY || 'top', scaleX: spec.scale || 1, scaleY: spec.scale || 1 });
    mapCfg._runtime = built.runtime;
    mapCfg.baseTransform = { left: obj.left, top: obj.top, scaleX: obj.scaleX, scaleY: obj.scaleY };
  } else if (spec.kind === 'temporalLine') {
    // No sourceId given (the "+ Temporal Line" quick-add button) -> default to the first
    // available source/entity so the layer renders something sensible immediately, rather
    // than a blank chart the creator has to configure before seeing anything at all.
    const lineDefaultSrc = spec.sourceId ? null : allTemporalSources()[0];
    const lineSourceId = spec.sourceId || (lineDefaultSrc && lineDefaultSrc.value) || 'fixtureIndex';
    const lineDefaultEntity = spec.entity || (temporalSourceFor({ sourceId: lineSourceId, videoStart: 0, videoEnd: 1000 }) || { entities: () => [] }).entities()[0];
    var temporalLineCfg = { sourceId: lineSourceId, entity: lineDefaultEntity, color: spec.color, videoStart: spec.videoStart || 0, videoEnd: spec.videoEnd || 4000, width: spec.width, height: spec.height, unit: spec.unit, source: spec.source, sourceUrl: spec.sourceUrl, compactNumbers: !!spec.compactNumbers, percentage: !!spec.percentage };
    const builtLine = buildLineChartGroup(temporalLineCfg);
    obj = builtLine.group;
    obj.set({ left: spec.left, top: spec.top, originX: spec.originX || 'left', originY: spec.originY || 'top' });
    temporalLineCfg._runtime = builtLine.runtime;
  } else if (spec.kind === 'temporalStat') {
    const statDefaultSrc = spec.sourceId ? null : allTemporalSources()[0];
    const statSourceId = spec.sourceId || (statDefaultSrc && statDefaultSrc.value) || 'fixtureIndex';
    const statDefaultEntity = spec.entity || (temporalSourceFor({ sourceId: statSourceId, videoStart: 0, videoEnd: 1000 }) || { entities: () => [] }).entities()[0];
    var temporalStatCfg = { sourceId: statSourceId, entity: statDefaultEntity, label: spec.label, unit: spec.unit, source: spec.source, sourceUrl: spec.sourceUrl, compactNumbers: !!spec.compactNumbers, percentage: !!spec.percentage, videoStart: spec.videoStart || 0, videoEnd: spec.videoEnd || 4000, left: 0, top: 0 };
    const builtStat = buildTemporalStatGroup(temporalStatCfg);
    obj = builtStat.group;
    obj.set({ left: spec.left, top: spec.top, originX: spec.originX || 'left', originY: spec.originY || 'top' });
    temporalStatCfg._runtime = builtStat.runtime;
  }
  obj.set('name', spec.name || spec.kind);
  obj.data = {
    role: spec.role || null,
    isCounter: !!spec.isCounter,
    anim: spec.anim || { type:'none', delay:0, duration:500 },
  };
  if (spec.kind === 'dotgrid') {
    obj.data.dotgrid = { total: spec.total, highlight: spec.highlight, highlightColor: spec.highlightColor };
  }
  if (spec.kind === 'pin') {
    obj.data.pin = { label: spec.label || 'Location', color: spec.color || COLORS.amberLight, style: spec.style === 'dot' ? 'dot' : 'pin' };
  }
  if (spec.kind === 'orgchart') {
    obj.data.orgchart = { text: spec.text || '', color: spec.color || COLORS.tealLight };
  }
  if (spec.kind === 'map') {
    obj.data.map = mapCfg;
  }
  if (spec.kind === 'temporalLine') {
    obj.data.temporalLine = temporalLineCfg;
  }
  if (spec.kind === 'temporalStat') {
    obj.data.temporalStat = temporalStatCfg;
  }
  return obj;
}

function loadTemplate(id) {
  activeTemplateId = id;
  canvas.getObjects().slice().forEach(o => { if (o !== bgMediaObj) canvas.remove(o); });
  const specs = TEMPLATES[id].layers();
  specs.forEach(spec => canvas.add(specToObject(spec)));
  fitLayersToSafeZone();
  canvas.requestRenderAll();
  refreshLayerList();
  selectProps(null);
  updateScrubRange();
}

/* ============ FONT PRESET SWITCHING ============ */
function applyFontPresetToCanvas() {
  canvas.getObjects().forEach(o => {
    if (o.data && o.data.role) {
      o.set('fontFamily', resolveFont(o.data.role));
    }
  });
  canvas.requestRenderAll();
}

/* ============ LAYER LIST / SELECTION UI ============ */
function refreshLayerList() {
  const list = document.getElementById('layerList');
  list.innerHTML = '';
  const objs = canvas.getObjects().filter(o => o !== bgMediaObj);
  if (!objs.length) { list.innerHTML = '<div class="empty-note">No layers yet — add one below or load a template.</div>'; return; }
  objs.forEach((o, i) => {
    const row = document.createElement('div');
    row.className = 'layer-row' + (canvas.getActiveObject() === o ? ' active' : '');
    const typeLabel = o.type === 'textbox' ? 'TEXT' : o.type === 'rect' ? 'RECT' : o.type === 'circle' ? 'CIRC' : (o.data && o.data.dotgrid) ? 'DOTS' : (o.data && o.data.pin) ? 'PIN' : (o.data && o.data.orgchart) ? 'TREE' : (o.data && o.data.map) ? 'MAP' : (o.data && o.data.userGroup) ? 'GROUP' : o.type.toUpperCase();
    row.innerHTML = `<span class="ltype">${typeLabel}</span><span class="lname">${o.get('name') || o.type}</span>
      <button class="layer-order-btn" data-dir="up" title="Bring forward"${i === objs.length-1 ? ' disabled' : ''}>&#9650;</button>
      <button class="layer-order-btn" data-dir="down" title="Send backward"${i === 0 ? ' disabled' : ''}>&#9660;</button>`;
    row.addEventListener('click', () => { canvas.setActiveObject(o); canvas.requestRenderAll(); });
    row.querySelectorAll('.layer-order-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.dataset.dir === 'up') canvas.bringObjectForward(o); else canvas.sendObjectBackwards(o);
        canvas.requestRenderAll();
        refreshLayerList();
      });
    });
    list.appendChild(row);
  });
}

const ANIM_OPTIONS = [
  { value:'none', label:'None (static)' },
  { value:'fade', label:'Fade in' },
  { value:'pop', label:'Pop / scale in' },
  { value:'slideFromLeft', label:'Slide in from left' },
  { value:'slideFromRight', label:'Slide in from right' },
  { value:'slideFromTop', label:'Slide in from top' },
  { value:'slideFromBottom', label:'Slide in from bottom' },
  { value:'countup', label:'Count up (numbers only)' },
];

/* ---- alignment helpers ---- */
function alignObjToCanvas(obj, where) {
  const r = obj.getBoundingRect(true, true);
  let dx = 0, dy = 0;
  if (where === 'left') dx = 0 - r.left;
  else if (where === 'centerH') dx = (W - r.width)/2 - r.left;
  else if (where === 'right') dx = W - r.width - r.left;
  else if (where === 'top') dy = 0 - r.top;
  else if (where === 'centerV') dy = (H - r.height)/2 - r.top;
  else if (where === 'bottom') dy = H - r.height - r.top;
  obj.set({ left: obj.left + dx, top: obj.top + dy });
  obj.setCoords();
  canvas.requestRenderAll();
}
function alignChildrenToEachOther(sel, where) {
  const children = sel.getObjects();
  const rects = children.map(c => c.getBoundingRect(true, true));
  let target;
  if (where === 'left') target = Math.min(...rects.map(r => r.left));
  else if (where === 'right') target = Math.max(...rects.map(r => r.left + r.width));
  else if (where === 'centerH') { const minL = Math.min(...rects.map(r=>r.left)), maxR = Math.max(...rects.map(r=>r.left+r.width)); target = (minL+maxR)/2; }
  else if (where === 'top') target = Math.min(...rects.map(r => r.top));
  else if (where === 'bottom') target = Math.max(...rects.map(r => r.top + r.height));
  else if (where === 'centerV') { const minT = Math.min(...rects.map(r=>r.top)), maxB = Math.max(...rects.map(r=>r.top+r.height)); target = (minT+maxB)/2; }
  children.forEach((c, i) => {
    const r = rects[i];
    let dx = 0, dy = 0;
    if (where === 'left') dx = target - r.left;
    else if (where === 'right') dx = target - (r.left + r.width);
    else if (where === 'centerH') dx = target - (r.left + r.width/2);
    else if (where === 'top') dy = target - r.top;
    else if (where === 'bottom') dy = target - (r.top + r.height);
    else if (where === 'centerV') dy = target - (r.top + r.height/2);
    c.set({ left: c.left + dx, top: c.top + dy });
    c.setCoords();
  });
  sel.dirty = true; sel.setCoords();
  canvas.requestRenderAll();
}
function appendAlignToolbar(body, obj, label) {
  const lbl = document.createElement('label'); lbl.textContent = label; body.appendChild(lbl);
  const row1 = document.createElement('div'); row1.className = 'row2'; body.appendChild(row1);
  const row2 = document.createElement('div'); row2.className = 'row2'; row2.style.marginTop = '6px'; body.appendChild(row2);
  const mk = (txt, fn) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'small ghost'; b.style.flex = '1'; b.textContent = txt;
    b.addEventListener('click', fn);
    return b;
  };
  row1.appendChild(mk('⟸ Left', () => alignObjToCanvas(obj,'left')));
  row1.appendChild(mk('↔ Center', () => alignObjToCanvas(obj,'centerH')));
  row1.appendChild(mk('Right ⟹', () => alignObjToCanvas(obj,'right')));
  row2.appendChild(mk('⟰ Top', () => alignObjToCanvas(obj,'top')));
  row2.appendChild(mk('↕ Middle', () => alignObjToCanvas(obj,'centerV')));
  row2.appendChild(mk('Bottom ⟱', () => alignObjToCanvas(obj,'bottom')));
}
function appendAlignToEachOtherToolbar(body, sel) {
  const lbl = document.createElement('label'); lbl.textContent = 'Align selected layers to each other'; body.appendChild(lbl);
  const row1 = document.createElement('div'); row1.className = 'row2'; body.appendChild(row1);
  const row2 = document.createElement('div'); row2.className = 'row2'; row2.style.marginTop = '6px'; body.appendChild(row2);
  const mk = (txt, where) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'small ghost'; b.style.flex = '1'; b.textContent = txt;
    b.addEventListener('click', () => alignChildrenToEachOther(sel, where));
    return b;
  };
  row1.appendChild(mk('Left edges','left')); row1.appendChild(mk('Centers ↔','centerH')); row1.appendChild(mk('Right edges','right'));
  row2.appendChild(mk('Top edges','top')); row2.appendChild(mk('Centers ↕','centerV')); row2.appendChild(mk('Bottom edges','bottom'));
}

/* ---- Group / Ungroup: locks several layers' positions relative to each other so they   ---- */
/* ---- move, resize, and align as one unit. A real fabric.Group, not a Dot-Grid-style     ---- */
/* ---- regenerated composite — the member objects are the same live objects before and    ---- */
/* ---- after, so ungrouping is fully reversible, including each member's own entrance      ---- */
/* ---- animation (which pauses while nested — the animation engine only walks top-level    ---- */
/* ---- canvas.getObjects(), not into group children — and resumes correctly on ungroup).   ---- */
/* ---- Tagged with data.userGroup so it's distinguishable from the Dot-Grid/Pin/Org-Chart   ---- */
/* ---- composite groups, which use `type==='group'` for the same reason but aren't meant   ---- */
/* ---- to be user-ungroupable.                                                              ---- */
function groupSelected() {
  const active = canvas.getActiveObject();
  if (!active || (active.type !== 'activeSelection' && active.type !== 'activeselection')) return;
  const objects = active.getObjects().slice();
  canvas.discardActiveObject();
  objects.forEach(o => canvas.remove(o));
  const group = new fabric.Group(objects);
  group.set('name', 'Group');
  group.data = { role:null, isCounter:false, anim:{type:'none',delay:0,duration:500}, userGroup:true };
  canvas.add(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  refreshLayerList();
  selectProps(group);
  updateScrubRange();
}
function ungroupSelected() {
  const active = canvas.getActiveObject();
  if (!active || active.type !== 'group' || !(active.data && active.data.userGroup)) return;
  const items = active.removeAll();
  canvas.remove(active);
  items.forEach(o => canvas.add(o));
  canvas.discardActiveObject();
  const sel = new fabric.ActiveSelection(items, { canvas });
  canvas.setActiveObject(sel);
  canvas.requestRenderAll();
  refreshLayerList();
  selectProps(sel);
  updateScrubRange();
}

function availableFontFamilies() {
  const set = new Set();
  Object.values(FONT_PRESETS).forEach(p => { set.add(p.display); set.add(p.body); });
  customFonts.forEach(f => set.add(f.family));
  return [...set];
}

function selectProps(obj) {
  const card = document.getElementById('propsCard');
  const body = document.getElementById('propsBody');
  document.getElementById('btnDelete').disabled = !obj;
  if (!obj || obj === bgMediaObj) { card.style.display = 'none'; return; }
  card.style.display = '';
  body.innerHTML = '';

  if (obj.type === 'activeSelection' || obj.type === 'activeselection') {
    const note = document.createElement('div'); note.className = 'empty-note';
    note.textContent = `${obj.getObjects().length} layers selected. Use the tools below, or click one layer in the Layers list to edit its own color, text, and animation.`;
    body.appendChild(note);
    const div = document.createElement('div'); div.className = 'divider'; body.appendChild(div);
    appendAlignToolbar(body, obj, 'Align selection to canvas');
    if (obj.getObjects().length >= 2) {
      const div2 = document.createElement('div'); div2.className = 'divider'; body.appendChild(div2);
      appendAlignToEachOtherToolbar(body, obj);
    }
    const div3 = document.createElement('div'); div3.className = 'divider'; body.appendChild(div3);
    const btnGroup = document.createElement('button'); btnGroup.type = 'button'; btnGroup.className = 'primary'; btnGroup.style.width = '100%';
    btnGroup.textContent = 'Group into one layer';
    btnGroup.addEventListener('click', groupSelected);
    body.appendChild(btnGroup);
    const groupNote = document.createElement('div'); groupNote.className = 'empty-note'; groupNote.style.marginTop='6px';
    groupNote.textContent = 'Locks these layers together as one — move, resize, or align the whole thing at once without them drifting apart. Ungroup any time to edit a piece on its own.';
    body.appendChild(groupNote);
    return;
  }
  if (!obj.data) { body.innerHTML = '<div class="empty-note">Nothing to edit for this layer.</div>'; return; }

  if (obj.type === 'textbox') {
    const lblT = document.createElement('label'); lblT.textContent = 'Text content'; body.appendChild(lblT);
    const ta = document.createElement('textarea'); ta.value = obj.text;
    ta.addEventListener('input', () => { obj.set('text', ta.value); canvas.requestRenderAll(); refreshLayerList(); });
    body.appendChild(ta);

    const row = document.createElement('div'); row.className = 'row2'; body.appendChild(row);
    const d1 = document.createElement('div'); row.appendChild(d1);
    const lblS = document.createElement('label'); lblS.textContent = 'Font size'; lblS.style.marginTop='10px'; d1.appendChild(lblS);
    const inpS = document.createElement('input'); inpS.type = 'number'; inpS.value = Math.round(obj.fontSize);
    inpS.addEventListener('input', () => { obj.set('fontSize', parseFloat(inpS.value)||28); canvas.requestRenderAll(); });
    d1.appendChild(inpS);

    const lblC = document.createElement('label'); lblC.textContent = 'Color'; body.appendChild(lblC);
    const sw = document.createElement('div'); sw.className='swatches'; body.appendChild(sw);
    SWATCH_OPTIONS.forEach(o => {
      const s = document.createElement('div'); s.className = 'swatch' + (obj.fill===o.val?' active':'');
      s.style.background = o.val; s.title = o.name;
      s.addEventListener('click', () => { obj.set('fill', o.val); canvas.requestRenderAll(); selectProps(obj); });
      sw.appendChild(s);
    });

    const lblF = document.createElement('label'); lblF.textContent = 'Font family'; body.appendChild(lblF);
    const selF = document.createElement('select');
    availableFontFamilies().forEach(fam => {
      const opt = document.createElement('option'); opt.value = fam; opt.textContent = fam;
      if (obj.fontFamily === fam) opt.selected = true;
      selF.appendChild(opt);
    });
    selF.addEventListener('change', () => { obj.set('fontFamily', selF.value); obj.data.fontFamilyOverride = true; canvas.requestRenderAll(); });
    body.appendChild(selF);

    const lblTA = document.createElement('label'); lblTA.textContent = 'Text align'; body.appendChild(lblTA);
    const taRow = document.createElement('div'); taRow.className = 'row2'; body.appendChild(taRow);
    ['left','center','right'].forEach(al => {
      const b = document.createElement('button'); b.type = 'button'; b.style.flex = '1';
      b.className = 'small' + (obj.textAlign === al ? ' primary' : ' ghost');
      b.textContent = al[0].toUpperCase() + al.slice(1);
      b.addEventListener('click', () => { obj.set('textAlign', al); canvas.requestRenderAll(); selectProps(obj); });
      taRow.appendChild(b);
    });
  } else if (obj.data.dotgrid) {
    const dg = obj.data.dotgrid;
    const row = document.createElement('div'); row.className = 'row2'; body.appendChild(row);
    const c1 = document.createElement('div'); row.appendChild(c1);
    const lblTot = document.createElement('label'); lblTot.textContent = 'Total dots'; c1.appendChild(lblTot);
    const inpTot = document.createElement('input'); inpTot.type='number'; inpTot.min=1; inpTot.max=1000; inpTot.value = dg.total;
    inpTot.addEventListener('change', () => rebuildDotGrid(obj, { total: Math.max(1, Math.min(1000, parseInt(inpTot.value)||dg.total)) }));
    c1.appendChild(inpTot);
    const c2 = document.createElement('div'); row.appendChild(c2);
    const lblHl = document.createElement('label'); lblHl.textContent = 'Highlighted subset'; c2.appendChild(lblHl);
    const inpHl = document.createElement('input'); inpHl.type='number'; inpHl.min=0; inpHl.value = dg.highlight;
    inpHl.addEventListener('change', () => rebuildDotGrid(obj, { highlight: Math.max(0, parseInt(inpHl.value)||0) }));
    c2.appendChild(inpHl);

    const lblHc = document.createElement('label'); lblHc.textContent = 'Highlight color'; body.appendChild(lblHc);
    const swHc = document.createElement('div'); swHc.className='swatches'; body.appendChild(swHc);
    SWATCH_OPTIONS.forEach(o => {
      const s = document.createElement('div'); s.className = 'swatch' + (dg.highlightColor===o.val?' active':'');
      s.style.background = o.val; s.title = o.name;
      s.addEventListener('click', () => rebuildDotGrid(obj, { highlightColor: o.val }));
      swHc.appendChild(s);
    });
    const note = document.createElement('div'); note.className = 'empty-note'; note.style.marginTop='8px';
    note.textContent = 'This is one resizable layer, not individual dots — drag/resize it like any other layer. Its own label/citation text nearby are separate text layers, editable as usual.';
    body.appendChild(note);
  } else if (obj.data.pin) {
    const pn = obj.data.pin;
    const lblL = document.createElement('label'); lblL.textContent = 'Label'; body.appendChild(lblL);
    const inpL = document.createElement('input'); inpL.type = 'text'; inpL.value = pn.label;
    inpL.addEventListener('change', () => rebuildPin(obj, { label: inpL.value || 'Location' }));
    body.appendChild(inpL);

    const lblSt = document.createElement('label'); lblSt.textContent = 'Marker shape'; body.appendChild(lblSt);
    const stRow = document.createElement('div'); stRow.className = 'row2'; body.appendChild(stRow);
    [{v:'pin',label:'Pin'},{v:'dot',label:'Dot'}].forEach(s => {
      const b = document.createElement('button'); b.type = 'button'; b.style.flex = '1';
      b.className = 'small' + (pn.style === s.v ? ' primary' : ' ghost');
      b.textContent = s.label;
      b.addEventListener('click', () => rebuildPin(obj, { style: s.v }));
      stRow.appendChild(b);
    });

    const lblC = document.createElement('label'); lblC.textContent = 'Marker color'; body.appendChild(lblC);
    const sw = document.createElement('div'); sw.className='swatches'; body.appendChild(sw);
    SWATCH_OPTIONS.forEach(o => {
      const s = document.createElement('div'); s.className = 'swatch' + (pn.color===o.val?' active':'');
      s.style.background = o.val; s.title = o.name;
      s.addEventListener('click', () => rebuildPin(obj, { color: o.val }));
      sw.appendChild(s);
    });
    const note = document.createElement('div'); note.className = 'empty-note'; note.style.marginTop='8px';
    note.textContent = 'A location marker for pointing at a spot on a map image or photo — drop your map in as background media, then drag this into place.';
    body.appendChild(note);
  } else if (obj.data.map) {
    renderMapPropsPanel(body, obj);
  } else if (obj.data.orgchart) {
    const oc = obj.data.orgchart;
    const lblT = document.createElement('label'); lblT.textContent = 'Names, one per line'; body.appendChild(lblT);
    const ta = document.createElement('textarea'); ta.value = oc.text; ta.style.minHeight = '140px';
    ta.addEventListener('change', () => rebuildOrgChart(obj, { text: ta.value }));
    body.appendChild(ta);
    const helpNote = document.createElement('div'); helpNote.className = 'empty-note'; helpNote.style.marginTop='6px';
    helpNote.textContent = 'Indent a line by 2 spaces to make it a child of the line above — indent twice for a grandchild, and so on. Several names at the same (no) indent become siblings.';
    body.appendChild(helpNote);

    const lblC = document.createElement('label'); lblC.textContent = 'Box / line color'; body.appendChild(lblC);
    const sw = document.createElement('div'); sw.className='swatches'; body.appendChild(sw);
    SWATCH_OPTIONS.forEach(o => {
      const s = document.createElement('div'); s.className = 'swatch' + (oc.color===o.val?' active':'');
      s.style.background = o.val; s.title = o.name;
      s.addEventListener('click', () => rebuildOrgChart(obj, { color: o.val }));
      sw.appendChild(s);
    });
    const note = document.createElement('div'); note.className = 'empty-note'; note.style.marginTop='8px';
    note.textContent = 'This is one resizable layer, not individual boxes — drag/resize it like any other layer. Edit the outline above and it regenerates in place.';
    body.appendChild(note);
  } else if (obj.data.temporalLine) {
    renderTemporalLinePropsPanel(body, obj);
  } else if (obj.data.temporalStat) {
    renderTemporalStatPropsPanel(body, obj);
  } else if (obj.type === 'group' && obj.data.userGroup) {
    const note = document.createElement('div'); note.className = 'empty-note';
    note.textContent = `A group of ${obj.getObjects().length} layers, locked together — move, resize, or align it like one layer. Ungroup to edit or reposition a piece on its own again.`;
    body.appendChild(note);
    const div = document.createElement('div'); div.className = 'divider'; body.appendChild(div);
    const btnUngroup = document.createElement('button'); btnUngroup.type = 'button'; btnUngroup.className = 'ghost'; btnUngroup.style.width = '100%';
    btnUngroup.textContent = 'Ungroup';
    btnUngroup.addEventListener('click', ungroupSelected);
    body.appendChild(btnUngroup);
  } else {
    const lblC = document.createElement('label'); lblC.textContent = 'Fill color'; body.appendChild(lblC);
    const sw = document.createElement('div'); sw.className='swatches'; body.appendChild(sw);
    [...SWATCH_OPTIONS, {name:'transparent-white', val:'rgba(255,255,255,0.08)'}].forEach(o => {
      const s = document.createElement('div'); s.className = 'swatch';
      s.style.background = o.val; s.title = o.name; s.style.border = o.val==='rgba(255,255,255,0.08)' ? '2px dashed #999' : '2px solid transparent';
      s.addEventListener('click', () => { obj.set('fill', o.val); canvas.requestRenderAll(); });
      sw.appendChild(s);
    });
  }

  const lblO = document.createElement('label'); lblO.textContent = 'Opacity / dim'; body.appendChild(lblO);
  const inpO = document.createElement('input'); inpO.type='range'; inpO.min=0; inpO.max=100; inpO.value=Math.round((obj.opacity??1)*100);
  inpO.addEventListener('input', () => { obj.set('opacity', inpO.value/100); canvas.requestRenderAll(); });
  body.appendChild(inpO);

  const div3 = document.createElement('div'); div3.className = 'divider'; body.appendChild(div3);
  appendAlignToolbar(body, obj, 'Align to canvas');
  const div4 = document.createElement('div'); div4.className = 'divider'; body.appendChild(div4);

  const lblA = document.createElement('label'); lblA.textContent = 'Entrance animation'; body.appendChild(lblA);
  const selA = document.createElement('select');
  ANIM_OPTIONS.forEach(o => {
    if (o.value === 'countup' && obj.type !== 'textbox') return;
    const opt = document.createElement('option'); opt.value = o.value; opt.textContent = o.label;
    if (obj.data.anim.type === o.value) opt.selected = true;
    selA.appendChild(opt);
  });
  selA.addEventListener('change', () => { obj.data.anim.type = selA.value; });
  body.appendChild(selA);

  const rowDD = document.createElement('div'); rowDD.className = 'row2'; body.appendChild(rowDD);
  const dCol = document.createElement('div'); rowDD.appendChild(dCol);
  const lblD = document.createElement('label'); lblD.textContent = 'Delay (ms)'; lblD.style.marginTop='10px'; dCol.appendChild(lblD);
  const inpD = document.createElement('input'); inpD.type='number'; inpD.step=50; inpD.min=0; inpD.value = obj.data.anim.delay;
  inpD.addEventListener('input', () => { obj.data.anim.delay = Math.max(0, parseFloat(inpD.value)||0); updateScrubRange(); });
  dCol.appendChild(inpD);

  const durCol = document.createElement('div'); rowDD.appendChild(durCol);
  const lblDur = document.createElement('label'); lblDur.textContent = 'Duration (ms)'; lblDur.style.marginTop='10px'; durCol.appendChild(lblDur);
  const inpDur = document.createElement('input'); inpDur.type='number'; inpDur.step=50; inpDur.min=50; inpDur.value = obj.data.anim.duration;
  inpDur.addEventListener('input', () => { obj.data.anim.duration = Math.max(50, parseFloat(inpDur.value)||500); updateScrubRange(); });
  durCol.appendChild(inpDur);
}

canvas.on('selection:created', (e) => { selectProps(canvas.getActiveObject()); refreshLayerList(); });
canvas.on('selection:updated', (e) => { selectProps(canvas.getActiveObject()); refreshLayerList(); });
canvas.on('selection:cleared', () => { selectProps(null); refreshLayerList(); });
canvas.on('object:modified', refreshLayerList);
canvas.on('object:added', () => { refreshLayerList(); updateScrubRange(); });
canvas.on('object:removed', () => { refreshLayerList(); updateScrubRange(); });

document.getElementById('btnDelete').addEventListener('click', () => {
  const o = canvas.getActiveObject();
  if (o && o !== bgMediaObj) { canvas.remove(o); canvas.discardActiveObject(); canvas.requestRenderAll(); }
});
window.addEventListener('keydown', (e) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    const o = canvas.getActiveObject();
    if (o && o !== bgMediaObj && !o.isEditing) { canvas.remove(o); canvas.discardActiveObject(); canvas.requestRenderAll(); }
  }
});

/* ============ ADD LAYER BUTTONS ============ */
document.getElementById('addText').addEventListener('click', () => {
  const obj = specToObject(T('New text', { name:'Text', role:'body', fontSize:32, fill:'#FFFFFF', left:760, top:500, width:400, textAlign:'center', originX:'left', originY:'top', anim:{type:'fade',delay:0,duration:500} }));
  canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll();
});
document.getElementById('addRect').addEventListener('click', () => {
  const obj = specToObject(R({ name:'Rectangle', left:660, top:400, width:400, height:220, rx:14, ry:14, fill:'rgba(255,255,255,0.08)', stroke:COLORS.tealLight, strokeWidth:2, anim:{type:'pop',delay:0,duration:500} }));
  canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll();
});
document.getElementById('addCircle').addEventListener('click', () => {
  const obj = specToObject(C({ name:'Circle', left:860, top:440, radius:100, fill:'rgba(255,255,255,0.08)', stroke:COLORS.tealLight, strokeWidth:2, anim:{type:'pop',delay:0,duration:500} }));
  canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll();
});
document.getElementById('addDotGrid').addEventListener('click', () => {
  const obj = specToObject(D({ name:'Dot grid', left:W/2, top:H/2, originX:'center', originY:'center', total:50, highlight:5, highlightColor:COLORS.amberLight, anim:{type:'fade',delay:0,duration:500} }));
  canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll();
});
document.getElementById('addPin').addEventListener('click', () => {
  const obj = specToObject(P({ name:'Map pin', left:W/2, top:H/2, originX:'center', originY:'center', label:'Location', color:COLORS.amberLight, style:'pin', anim:{type:'pop',delay:0,duration:400} }));
  canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll();
});
document.getElementById('addOrgChart').addEventListener('click', () => {
  const sample = 'Emperor Meiji\n  Emperor Taisho\n    Emperor Showa\n      Emperor Akihito\n        Emperor Naruhito';
  const obj = specToObject(O({ name:'Family tree', left:W/2, top:H/2, originX:'center', originY:'center', text:sample, color:COLORS.tealLight, anim:{type:'fade',delay:0,duration:500} }));
  canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll();
});
document.getElementById('addMap').addEventListener('click', () => {
  const obj = specToObject(M({ name:'Map', left:W/2, top:H/2, originX:'center', originY:'center', scope:'world', anim:{type:'fade',delay:0,duration:600}, events:[
    { type:'highlight', id:newMapEventId(), region:'Japan', color:COLORS.tealLight, start:300, duration:700, dim:true },
  ] }));
  canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll();
});
document.getElementById('addTemporalLine').addEventListener('click', () => {
  const obj = specToObject(LN({ name:'Temporal line', left:W/2 - 240, top:H/2 - 100, originX:'left', originY:'top', width:480, height:200, anim:{type:'fade',delay:0,duration:600} }));
  canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll();
});
document.getElementById('addTemporalStat').addEventListener('click', () => {
  const obj = specToObject(TS({ name:'Temporal stat', left:W/2 - 104, top:H/2 - 40, originX:'left', originY:'top', anim:{type:'fade',delay:0,duration:600} }));
  canvas.add(obj); canvas.setActiveObject(obj); canvas.requestRenderAll();
});

/* ============ TEMPLATE GRID ============ */
let currentCategory = 'All';
function renderCategoryChips() {
  const wrap = document.getElementById('categoryChips');
  if (!wrap) return;
  const categories = ['All', ...new Set(Object.values(TEMPLATES).map(t => t.category))];
  wrap.innerHTML = '';
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-chip' + (cat === currentCategory ? ' active' : '');
    btn.textContent = cat;
    btn.addEventListener('click', () => { currentCategory = cat; renderCategoryChips(); renderTemplateGrid(); });
    wrap.appendChild(btn);
  });
}
function renderTemplateGrid() {
  const grid = document.getElementById('templateGrid');
  grid.innerHTML = '';
  Object.keys(TEMPLATES)
    .filter(id => currentCategory === 'All' || TEMPLATES[id].category === currentCategory)
    .forEach(id => {
      const btn = document.createElement('button');
      btn.className = 'tpl-btn'; btn.textContent = TEMPLATES[id].label;
      btn.addEventListener('click', () => loadTemplate(id));
      grid.appendChild(btn);
    });
}

/* ============ FONT PRESET UI ============ */
function renderFontPresets() {
  const container = document.getElementById('fontPresets');
  container.innerHTML = '';
  Object.keys(FONT_PRESETS).forEach(key => {
    const p = FONT_PRESETS[key];
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'font-preset' + (key === currentFontPreset ? ' active' : '');
    btn.innerHTML = `<div class="fp-name">${p.name}</div><div class="fp-sample" style="font-family:'${p.display}';font-weight:${p.displayWeight};">Headline sample</div>`;
    btn.addEventListener('click', () => { currentFontPreset = key; renderFontPresets(); applyFontPresetToCanvas(); });
    container.appendChild(btn);
  });
}

/* ============ BACKGROUND COLOR ============ */
function renderBgColorSwatches() {
  const el = document.getElementById('bgColorSwatches');
  el.innerHTML = '';
  BG_COLOR_OPTIONS.forEach(o => {
    const s = document.createElement('div');
    const isTransparent = o.val === 'transparent';
    s.className = 'swatch' + (isTransparent ? ' checker' : '') + (canvas.backgroundColor === o.val ? ' active' : '');
    if (!isTransparent) s.style.background = o.val;
    s.title = o.name;
    s.addEventListener('click', () => {
      canvas.backgroundColor = o.val; canvas.requestRenderAll();
      [...el.children].forEach(c => c.classList.remove('active')); s.classList.add('active');
      document.getElementById('bgTransparentNote').style.display = isTransparent ? '' : 'none';
    });
    el.appendChild(s);
  });
  document.getElementById('bgTransparentNote').style.display = canvas.backgroundColor === 'transparent' ? '' : 'none';
}

/* ============ BACKGROUND MEDIA ============ */
document.getElementById('bgDrop').addEventListener('click', () => document.getElementById('bgFile').click());
document.getElementById('bgFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const isVideo = file.type.startsWith('video/');
  const url = URL.createObjectURL(file);
  if (bgMediaObj) { canvas.remove(bgMediaObj); bgMediaObj = null; }
  if (bgVideoEl) { bgVideoEl.pause(); bgVideoEl = null; }

  if (isVideo) {
    const videoEl = document.createElement('video');
    videoEl.src = url; videoEl.muted = true; videoEl.loop = true; videoEl.crossOrigin = 'anonymous'; videoEl.playsInline = true;
    videoEl.addEventListener('loadedmetadata', () => {
      bgVideoEl = videoEl;
      const img = new fabric.Image(videoEl, { left:0, top:0, originX:'left', originY:'top' });
      const scale = Math.max(W / videoEl.videoWidth, H / videoEl.videoHeight);
      img.set({ scaleX: scale, scaleY: scale, left: (W - videoEl.videoWidth*scale)/2, top: (H - videoEl.videoHeight*scale)/2, opacity: 0.6, selectable:false, evented:false });
      img.data = { isBackground: true };
      bgMediaObj = img;
      canvas.insertAt(0, img);
      canvas.requestRenderAll();
      document.getElementById('bgControls').style.display = '';
      videoEl.play().catch(()=>{});
    });
  } else {
    fabric.Image.fromURL(url, {}).then((img) => {
      const scale = Math.max(W / img.width, H / img.height);
      img.set({ left:(W - img.width*scale)/2, top:(H - img.height*scale)/2, scaleX:scale, scaleY:scale, opacity:0.6, selectable:false, evented:false, originX:'left', originY:'top' });
      img.data = { isBackground: true };
      bgMediaObj = img;
      canvas.insertAt(0, img);
      canvas.requestRenderAll();
      document.getElementById('bgControls').style.display = '';
    });
  }
});
document.getElementById('bgOpacity').addEventListener('input', (e) => {
  if (bgMediaObj) { bgMediaObj.set('opacity', e.target.value/100); canvas.requestRenderAll(); }
});
document.getElementById('bgRemove').addEventListener('click', () => {
  if (bgMediaObj) { canvas.remove(bgMediaObj); bgMediaObj = null; }
  if (bgVideoEl) { bgVideoEl.pause(); bgVideoEl = null; }
  document.getElementById('bgControls').style.display = 'none';
});

/* ============ CUSTOM FONT IMPORT ============ */
function sanitizeFamilyName(filename) {
  let base = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Custom Font';
  let name = base, i = 1;
  const existing = new Set(customFonts.map(f => f.family));
  while (existing.has(name)) { name = base + ' ' + (++i); }
  return name;
}
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function registerCustomFont(family, dataUrl) {
  const face = new FontFace(family, `url(${dataUrl})`);
  await face.load();
  document.fonts.add(face);
  return face;
}
function renderCustomFontList() {
  const el = document.getElementById('customFontList');
  if (!el) return;
  el.innerHTML = '';
  if (!customFonts.length) { el.innerHTML = '<div class="empty-note">No custom fonts imported yet.</div>'; return; }
  customFonts.forEach((f, i) => {
    const row = document.createElement('div'); row.className = 'font-row';
    const nameSpan = document.createElement('span'); nameSpan.className = 'lname'; nameSpan.style.fontFamily = `"${f.family}"`; nameSpan.textContent = f.family;
    row.appendChild(nameSpan);
    const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'small ghost'; rm.style.padding = '2px 9px'; rm.textContent = '✕';
    rm.addEventListener('click', () => { customFonts.splice(i, 1); renderCustomFontList(); });
    row.appendChild(rm);
    el.appendChild(row);
  });
}
document.getElementById('fontDrop').addEventListener('click', () => document.getElementById('fontFile').click());
document.getElementById('fontFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const dataUrl = await fileToDataURL(file);
    const family = sanitizeFamilyName(file.name);
    await registerCustomFont(family, dataUrl);
    customFonts.push({ family, dataUrl });
    renderCustomFontList();
    canvas.requestRenderAll();
    setStatus(`Font "${family}" imported ✓ — pick it from Font family on any text layer.`);
  } catch (err) {
    setStatus('Could not load that font file.');
  }
  e.target.value = '';
});
renderCustomFontList();

/* ============ PROJECT SAVE / LOAD ============ */
document.getElementById('btnSaveProject').addEventListener('click', () => {
  const objs = canvas.getObjects().filter(o => o !== bgMediaObj).map(o => o.toObject(['data','name']));
  const proj = { version:2, fontPreset: currentFontPreset, bgColor: canvas.backgroundColor, hold: parseFloat(document.getElementById('fHold').value)||2, objects: objs, customFonts: customFonts, dataSources: dataSources };
  const blob = new Blob([JSON.stringify(proj, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'belocal_scene.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url), 3000);
});
document.getElementById('btnLoadProject').addEventListener('click', () => document.getElementById('projectFile').click());
document.getElementById('projectFile').addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const proj = JSON.parse(reader.result);
    canvas.getObjects().slice().forEach(o => { if (o !== bgMediaObj) canvas.remove(o); });
    currentFontPreset = proj.fontPreset || 'modern'; renderFontPresets();
    canvas.backgroundColor = proj.bgColor || '#1F3864'; renderBgColorSwatches();
    document.getElementById('fHold').value = proj.hold || 2;
    customFonts = [];
    dataSources = proj.dataSources || {};
    renderDataSourceList();
    const fontLoads = (proj.customFonts || []).map(f =>
      registerCustomFont(f.family, f.dataUrl).then(() => customFonts.push(f)).catch(() => {})
    );
    Promise.all(fontLoads).then(() => {
      renderCustomFontList();
      fabric.util.enlivenObjects(proj.objects).then((objs) => {
        objs.forEach(o => canvas.add(o));
        // A JSON round-trip necessarily drops every "regenerate-in-place" layer's live,
        // non-serializable _runtime (Fabric object refs, JS Map instances like a map's
        // regionPaths, the TemporalDataSource's own functions) — Map/Set instances and
        // functions don't survive JSON.stringify at all, so a reloaded layer's _runtime is
        // either empty or a plain object masquerading as one. Every field each of these is
        // BUILT FROM (scope/events, total/highlight, sourceId/entity/videoStart/...) DID
        // survive the round trip intact, so rebuilding each one in place from that surviving
        // config reproduces the exact same runtime state, rather than leaving a scrub/Preview
        // crash waiting for the first frame that touches a reloaded layer's _runtime.
        objs.slice().forEach(o => {
          if (o.data && o.data.map) rebuildMap(o, {});
          if (o.data && o.data.dotgrid) rebuildDotGrid(o, {});
          if (o.data && o.data.pin) rebuildPin(o, {});
          if (o.data && o.data.orgchart) rebuildOrgChart(o, {});
          if (o.data && o.data.temporalLine) rebuildLineChart(o, {});
          if (o.data && o.data.temporalStat) rebuildTemporalStat(o, {});
        });
        canvas.discardActiveObject(); selectProps(null);
        canvas.requestRenderAll(); refreshLayerList(); updateScrubRange();
        setStatus('Project loaded ✓');
      });
    });
  };
  reader.readAsText(file);
});

/* ============ ANIMATION ENGINE ============ */
function ease(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1-t, 3); }
function parseCounterParts(str) {
  const m = String(str).match(/^([^\d.]*)([\d.]+)(.*)$/);
  if (!m) return null;
  return { prefix:m[1], num:parseFloat(m[2]), decimals: m[2].includes('.') ? (m[2].split('.')[1]||'').length : 0, suffix:m[3] };
}

let mode = 'edit'; // 'edit' | 'preview' | 'record'
let rafId = null, playStart = null;
let recorder = null, recordedChunks = [], isRecording = false;

function captureBaseState() {
  canvas.getObjects().forEach(o => {
    if (o === bgMediaObj) return;
    o.data = o.data || { anim:{type:'none',delay:0,duration:500} };
    o.data.baseLeft = o.left; o.data.baseTop = o.top;
    o.data.baseScaleX = o.scaleX; o.data.baseScaleY = o.scaleY;
    o.data.baseOpacity = o.opacity;
    if (o.type === 'textbox') {
      o.data.baseText = o.text;
      if (o.data.anim.type === 'countup') {
        const parts = parseCounterParts(o.text);
        o.data.counterParts = parts;
        if (!parts) o.data.anim.type = 'fade'; // fallback if not a parseable number
      }
    }
  });
}
function restoreBaseState() {
  canvas.getObjects().forEach(o => {
    // A layer that never went through captureBaseState() (e.g. the "Edit" tab clicked
    // redundantly on a freshly loaded template, with no preceding Play/scrub) has no
    // base* fields yet — applying them anyway would blank out left/top/scale/opacity.
    if (o === bgMediaObj || !o.data || o.data.baseLeft === undefined) return;
    o.set({ left:o.data.baseLeft, top:o.data.baseTop, scaleX:o.data.baseScaleX, scaleY:o.data.baseScaleY, opacity:o.data.baseOpacity });
    if (o.type === 'textbox' && o.data.baseText != null) o.set('text', o.data.baseText);
  });
  canvas.requestRenderAll();
}
function computeContentEnd() {
  let end = 800;
  canvas.getObjects().forEach(o => {
    if (o === bgMediaObj || !o.data || !o.data.anim || o.data.anim.type === 'none') return;
    end = Math.max(end, o.data.anim.delay + o.data.anim.duration);
    // A Map Graphic's own events (highlight/zoom/route/stat) run on a sub-timeline offset
    // by the map layer's own entrance delay (see applyMapTimeline's caller in applyFrame) —
    // without this, Preview/Record can cut off mid-sequence before a late stat/zoom plays.
    if (o.data.map && o.data.map.events && o.data.map.events.length) {
      o.data.map.events.forEach(e => { end = Math.max(end, o.data.anim.delay + e.start + e.duration); });
    }
    // videoEnd is scene-global data time, NOT offset by the layer's own entrance delay — see
    // the matching note beside applyLineChartTimeline/applyTemporalStatTimeline's callers.
    if (o.data.temporalLine) end = Math.max(end, o.data.temporalLine.videoEnd);
    if (o.data.temporalStat) end = Math.max(end, o.data.temporalStat.videoEnd);
  });
  return end + 300;
}
function applyFrame(elapsed) {
  canvas.getObjects().forEach(o => {
    if (o === bgMediaObj || !o.data) return;
    const a = o.data.anim;
    const base = o.data;
    if (!a || a.type === 'none') {
      o.set({ opacity: base.baseOpacity, left: base.baseLeft, top: base.baseTop, scaleX: base.baseScaleX, scaleY: base.baseScaleY });
      return;
    }
    const t = ease((elapsed - a.delay) / a.duration);
    const raw = (elapsed - a.delay) / a.duration;
    if (raw <= 0) {
      o.set({ opacity: 0, left: base.baseLeft, top: base.baseTop, scaleX: base.baseScaleX, scaleY: base.baseScaleY });
      if (a.type === 'countup' && base.counterParts) o.set('text', base.counterParts.prefix + '0' + base.counterParts.suffix);
      return;
    }
    switch (a.type) {
      case 'fade':
        o.set({ opacity: base.baseOpacity*t, left: base.baseLeft, top: base.baseTop, scaleX: base.baseScaleX, scaleY: base.baseScaleY });
        break;
      case 'pop': {
        const s = 0.85 + 0.15*t;
        o.set({ opacity: base.baseOpacity*t, left: base.baseLeft, top: base.baseTop, scaleX: base.baseScaleX*s, scaleY: base.baseScaleY*s });
        break;
      }
      case 'slideFromLeft':
        o.set({ opacity: base.baseOpacity*t, left: base.baseLeft - (1-t)*140, top: base.baseTop, scaleX: base.baseScaleX, scaleY: base.baseScaleY });
        break;
      case 'slideFromRight':
        o.set({ opacity: base.baseOpacity*t, left: base.baseLeft + (1-t)*140, top: base.baseTop, scaleX: base.baseScaleX, scaleY: base.baseScaleY });
        break;
      case 'slideFromTop':
        o.set({ opacity: base.baseOpacity*t, top: base.baseTop - (1-t)*100, left: base.baseLeft, scaleX: base.baseScaleX, scaleY: base.baseScaleY });
        break;
      case 'slideFromBottom':
        o.set({ opacity: base.baseOpacity*t, top: base.baseTop + (1-t)*100, left: base.baseLeft, scaleX: base.baseScaleX, scaleY: base.baseScaleY });
        break;
      case 'countup':
        o.set({ opacity: base.baseOpacity, left: base.baseLeft, top: base.baseTop, scaleX: base.baseScaleX, scaleY: base.baseScaleY });
        if (base.counterParts) {
          const val = t * base.counterParts.num;
          const txt = base.counterParts.prefix + (base.counterParts.decimals ? val.toFixed(base.counterParts.decimals) : Math.round(val)) + base.counterParts.suffix;
          o.set('text', txt);
        }
        break;
    }
    if (raw >= 1) {
      o.set({ opacity: base.baseOpacity, left: base.baseLeft, top: base.baseTop, scaleX: base.baseScaleX, scaleY: base.baseScaleY });
      if (a.type === 'countup' && base.counterParts) o.set('text', base.baseText);
    }
  });
  // Second pass, after every object has settled into its own base entrance state above: a
  // Map Graphic's internal events (highlight/zoom/route/stat) run on their own sub-timeline,
  // timed relative to the map's own entrance delay, layered on top rather than fused into
  // the whole-group fade/pop handled by the loop above.
  canvas.getObjects().forEach(o => {
    if (o === bgMediaObj || !o.data || !o.data.map) return;
    const delay = (o.data.anim && o.data.anim.delay) || 0;
    applyMapTimeline(o, elapsed - delay);
  });
  // Same second-pass convention for the two temporal-data layer kinds — each reads
  // TemporalDataSource independently (see "Temporal data foundation" above). Deliberately
  // NOT offset by each layer's own `data.anim.delay` the way applyMapTimeline's events are:
  // a map's sub-events are relative to that ONE layer's own entrance because they only ever
  // need to agree with themselves, but a temporal layer's videoStart/videoEnd is DATA time,
  // shared across however many separate MapView/LineView/StatView layers a scene has — if
  // each subtracted its own (possibly different) entrance delay first, two views with
  // different fade-in timings would silently read different data-time windows at the same
  // instant despite identical videoStart/videoEnd config. Passing raw `elapsed` to both keeps
  // "current data time" a pure function of scene-global time, independent of any one view's
  // own local entrance polish — which is what actually makes synchronization hold by
  // construction rather than by the template author keeping delays in sync by convention.
  canvas.getObjects().forEach(o => {
    if (o === bgMediaObj || !o.data) return;
    if (o.data.temporalLine) applyLineChartTimeline(o, elapsed);
    if (o.data.temporalStat) applyTemporalStatTimeline(o, elapsed);
  });
  updateScrubDataTimeReadout(elapsed);
  canvas.requestRenderAll();
}
// Video Time (the scrubber's own seconds readout, always shown) vs Data Time (this reads out
// alongside it, but only while scrubbing AND a temporalLine/temporalStat layer is selected) —
// two distinct clocks a creator can otherwise only infer indirectly. `scrubReferenceObj` is
// captured at the START of a scrub rather than read live via canvas.getActiveObject(), because
// beginScrub()'s setInteractive(false) discards the canvas selection for the duration of the
// drag (see setInteractive) — without capturing it first there would be no selection left to
// read from by the time a frame actually renders.
let scrubReferenceObj = null;
function updateScrubDataTimeReadout(elapsed) {
  const el = document.getElementById('scrubDataTime');
  if (!el) return;
  const cfg = scrubbing && scrubReferenceObj && scrubReferenceObj.data && (scrubReferenceObj.data.temporalLine || scrubReferenceObj.data.temporalStat);
  const src = cfg && temporalSourceFor(cfg);
  if (!src) { el.textContent = ''; return; }
  const dt = src.videoTimeToDataTime(elapsed);
  el.textContent = '· Data time: ' + (Number.isInteger(dt) ? dt : dt.toFixed(1));
}

/* ============ TIMELINE SCRUBBER (minor edits / fine-tuning without full playback) ============ */
let scrubbing = false;
function updateScrubRange() {
  const scrub = document.getElementById('timelineScrub');
  if (!scrub) return;
  const total = Math.round(computeContentEnd() + (parseFloat(document.getElementById('fHold').value)||2)*1000);
  scrub.max = total;
  if (parseFloat(scrub.value) > total) scrub.value = total;
}
function beginScrub() {
  if (mode !== 'edit' || scrubbing) return;
  scrubbing = true;
  scrubReferenceObj = canvas.getActiveObject();
  captureBaseState();
  setInteractive(false);
}
function endScrub() {
  if (!scrubbing) return;
  scrubbing = false;
  scrubReferenceObj = null;
  restoreBaseState();
  setInteractive(true);
  const el = document.getElementById('scrubDataTime'); if (el) el.textContent = '';
}

function setInteractive(on) {
  canvas.selection = on;
  canvas.getObjects().forEach(o => { if (o !== bgMediaObj) { o.selectable = on; o.evented = on; } });
  if (!on) canvas.discardActiveObject();
}

function stopPlayback() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null; playStart = null;
  document.getElementById('btnStop').disabled = true;
}
function loop(now) {
  const elapsed = now - playStart;
  const total = computeContentEnd() + parseFloat(document.getElementById('fHold').value)*1000;
  applyFrame(Math.min(elapsed, total));
  if (elapsed < total) rafId = requestAnimationFrame(loop);
  else { stopPlayback(); if (isRecording) finishRecording(); else backToEdit(); }
}
function backToEdit() {
  restoreBaseState();
  setInteractive(true);
  setMode('edit');
}
function startPlayback(recording) {
  captureBaseState();
  setInteractive(false);
  if (bgVideoEl) { bgVideoEl.currentTime = 0; bgVideoEl.play().catch(()=>{}); }
  playStart = performance.now();
  document.getElementById('btnStop').disabled = false;
  rafId = requestAnimationFrame(loop);
}

function setMode(m) {
  mode = m;
  document.getElementById('modeEdit').classList.toggle('active', m === 'edit');
  document.getElementById('modePreview').classList.toggle('active', m !== 'edit');
}
const timelineScrubEl = document.getElementById('timelineScrub');
timelineScrubEl.addEventListener('mousedown', beginScrub);
timelineScrubEl.addEventListener('touchstart', beginScrub);
timelineScrubEl.addEventListener('input', (e) => {
  if (mode !== 'edit') return;
  if (!scrubbing) beginScrub();
  const t = parseFloat(e.target.value)||0;
  applyFrame(t);
  document.getElementById('scrubTime').textContent = (t/1000).toFixed(1)+'s';
});
window.addEventListener('mouseup', endScrub);
window.addEventListener('touchend', endScrub);
document.getElementById('fHold').addEventListener('input', updateScrubRange);

document.getElementById('modeEdit').addEventListener('click', () => { stopPlayback(); backToEdit(); });
document.getElementById('modePreview').addEventListener('click', () => { setMode('preview'); isRecording = false; setStatus('Previewing…'); startPlayback(false); });
document.getElementById('btnPlay').addEventListener('click', () => { setMode('preview'); isRecording = false; setStatus('Previewing…'); startPlayback(false); });
document.getElementById('btnStop').addEventListener('click', () => { stopPlayback(); if (isRecording) finishRecording(); backToEdit(); setStatus('Stopped.'); });

document.getElementById('btnRecord').addEventListener('click', () => {
  if (isRecording) return;
  setMode('preview');
  const el = canvas.getSelectionElement ? canvas.getSelectionElement() : canvas.upperCanvasEl;
  const liveCanvas = canvas.lowerCanvasEl;
  const stream = liveCanvas.captureStream(30);
  recordedChunks = [];
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
  recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type:'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'belocal_scene.webm';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    setStatus('Downloaded belocal_scene.webm ✓');
    document.getElementById('btnRecord').disabled = false;
    backToEdit();
    sendDocHandoffAsset(blob);
  };
  recorder.start();
  isRecording = true;
  document.getElementById('btnRecord').disabled = true;
  setStatus('Recording…');
  startPlayback(true);
});
function finishRecording() { if (recorder && recorder.state !== 'inactive') recorder.stop(); isRecording = false; }
function setStatus(msg) { document.getElementById('status').textContent = msg; }

/* ============ INIT ============ */
renderAspectButtons();
renderSafeZoneButtons();
updateSafeZoneOverlay();
renderCategoryChips();
renderTemplateGrid();
renderFontPresets();
renderBgColorSwatches();
loadTemplate('stat');
updateScrubRange();

const loadPromises = FONT_FACE_LIST.map(([fam,w]) => document.fonts.load(`${w} 40px "${fam}"`).catch(()=>{}));
Promise.all(loadPromises).then(() => document.fonts.ready).then(() => { setStatus('Ready.'); canvas.requestRenderAll(); });
setTimeout(() => { if (document.getElementById('status').textContent === 'Loading…') { setStatus('Ready.'); canvas.requestRenderAll(); } }, 2500);

/* ============ DOCUMENTARY STUDIO HANDOFF ============
   Purely additive: when this tool is opened by Documentary Studio (production/) with
   docHandoff=1 in the URL, show which episode/beat this graphic is for, and — once the
   user clicks Record & Download — also postMessage the recorded WebM back to the opener so
   it can attach automatically as a Graphic asset. Standalone use (no query params) is
   completely unaffected. See production/integration.js for the opener side. */
const docParams = new URLSearchParams(window.location.search);
const docContext = docParams.get('docHandoff') === '1' ? {
  episodeId: docParams.get('episodeId') || '',
  beatId: docParams.get('beatId') || '',
  title: docParams.get('title') || '',
  notes: docParams.get('notes') || '',
  source: docParams.get('source') || '',
} : null;

if (docContext) {
  const banner = document.getElementById('docHandoffBanner');
  const bits = [`Creating a graphic for Documentary Studio${docContext.title ? `: <strong>${docContext.title}</strong>` : ''}`];
  if (docContext.notes) bits.push(`Visual instruction: ${docContext.notes}`);
  if (docContext.source) bits.push(`Source note: ${docContext.source}`);
  bits.push('When you click "Record &amp; Download" below, the result is sent back to that beat automatically.');
  banner.innerHTML = bits.join(' — ');
  banner.style.display = 'block';
}

function sendDocHandoffAsset(blob) {
  if (!docContext || !window.opener) return;
  try {
    window.opener.postMessage({
      type: 'doc-asset',
      kind: 'graphic',
      filename: 'belocal_scene.webm',
      mime: 'video/webm',
      blob,
      docContext,
    }, window.location.origin);
  } catch (err) {
    // Best-effort only — the user still has the file they just downloaded.
  }
}
