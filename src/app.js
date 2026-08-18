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
  const scale = Math.min(availW / W, availH / H);
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

let bgMediaObj = null;   // fabric.Image for background (image or video-backed)
let bgVideoEl = null;    // underlying <video> element if background is a video
let customFonts = [];    // {family, dataUrl, mime} — imported by the user

/* ============ TEMPLATE PRESETS ============ */
function T(text, opts) {
  return Object.assign({ kind:'text', text }, opts);
}
function R(opts) { return Object.assign({ kind:'rect' }, opts); }
function C(opts) { return Object.assign({ kind:'circle' }, opts); }
function D(opts) { return Object.assign({ kind:'dotgrid' }, opts); }

/* ---- Dot-Grid Pictogram: built as one resizable "generated group" layer, not      ---- */
/* ---- hundreds of individually-draggable dots. Total/highlight are edited via      ---- */
/* ---- number fields in the properties panel, which regenerate the group in place.  ---- */
function buildDotGridGroup(total, highlight, highlightColor) {
  total = Math.max(1, Math.round(total));
  highlight = Math.min(total, Math.max(0, Math.round(highlight)));
  const boxW = 1400, maxH = 380;
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

const TEMPLATES = {
  blank: {
    label: 'Blank canvas',
    layers: () => [],
  },
  stat: {
    label: 'Stat Reveal',
    layers: () => [
      T("JAPAN'S NATIONAL TOURISM POLICY", { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:960, top:170, width:1300, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
      T('By 2030, the Cabinet-approved plan targets:', { name:'Headline', role:'display', fontWeight:700, fontSize:46, fill:'#FFFFFF', left:960, top:230, width:1500, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      R({ name:'Card 1', left:355, top:420, width:560, height:340, rx:18, ry:18, fill:'rgba(255,255,255,0.06)', stroke:'rgba(255,255,255,0.14)', strokeWidth:2, anim:{type:'pop',delay:1050,duration:600} }),
      T('60M', { name:'Card 1 number', role:'display', fontWeight:700, fontSize:104, fill:COLORS.tealLight, left:635, top:565, originX:'center', originY:'center', textAlign:'center', isCounter:true, anim:{type:'countup',delay:1600,duration:1400} }),
      T('international visitors', { name:'Card 1 label', role:'body', fontSize:26, fill:'rgba(255,255,255,0.82)', left:635, top:700, width:480, originX:'center', textAlign:'center', anim:{type:'fade',delay:1050,duration:600} }),
      R({ name:'Card 2', left:1005, top:420, width:560, height:340, rx:18, ry:18, fill:'rgba(255,255,255,0.06)', stroke:'rgba(255,255,255,0.14)', strokeWidth:2, anim:{type:'pop',delay:1200,duration:600} }),
      T('¥15T', { name:'Card 2 number', role:'display', fontWeight:700, fontSize:104, fill:COLORS.greenLight, left:1285, top:565, originX:'center', originY:'center', textAlign:'center', isCounter:true, anim:{type:'countup',delay:1750,duration:1400} }),
      T('in inbound spending', { name:'Card 2 label', role:'body', fontSize:26, fill:'rgba(255,255,255,0.82)', left:1285, top:700, width:480, originX:'center', textAlign:'center', anim:{type:'fade',delay:1200,duration:600} }),
      T('Cabinet-approved national tourism plan · 27 March 2026', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:960, top:800, width:1400, originX:'center', textAlign:'center', anim:{type:'fade',delay:3300,duration:600} }),
      R({ name:'Tag pill', left:960, top:855, width:420, height:48, rx:24, ry:24, fill:COLORS.amber, originX:'center', anim:{type:'pop',delay:3550,duration:500} }),
      T('TARGET, NOT A FORECAST', { name:'Tag text', role:'body', fontWeight:700, fontSize:20, fill:'#FFFFFF', left:960, top:879, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:3550,duration:500} }),
    ],
  },
  cards: {
    label: 'Category Cards',
    layers: () => {
      const items = ['National government','Local government','Residents','Tourism business','Travellers'];
      const n = items.length, cardW=300, cardH=280, gap=40;
      const totalW = n*cardW+(n-1)*gap, startX = 960-totalW/2, top=420;
      const out = [
        T('WHO IS "JAPAN" IN THIS STORY?', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:960, top:190, width:1300, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('"Japan wants..." always means one of these:', { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:960, top:250, width:1600, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      ];
      items.forEach((label,i) => {
        const x = startX+i*(cardW+gap), delay = 1000+i*150, color = CARD_PALETTE[i%CARD_PALETTE.length];
        out.push(R({ name:`Card ${i+1}`, left:x, top, width:cardW, height:cardH, rx:16, ry:16, fill:'rgba(255,255,255,0.06)', stroke:'rgba(255,255,255,0.16)', strokeWidth:2, anim:{type:'pop',delay,duration:500} }));
        out.push(C({ name:`Card ${i+1} badge`, left:x+cardW/2, top:top+78, radius:40, fill:'rgba(255,255,255,0.1)', stroke:color, strokeWidth:3, originX:'center', originY:'center', anim:{type:'pop',delay:delay+50,duration:500} }));
        out.push(T(String(i+1), { name:`Card ${i+1} number`, role:'display', fontWeight:700, fontSize:32, fill:color, left:x+cardW/2, top:top+78, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:delay+150,duration:400} }));
        out.push(T(label, { name:`Card ${i+1} label`, role:'body', fontWeight:600, fontSize:22, fill:'#FFFFFF', left:x+cardW/2, top:top+165, width:cardW-30, originX:'center', textAlign:'center', anim:{type:'fade',delay:delay+100,duration:500} }));
      });
      out.push(T('Editorial framing — no single source', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:960, top:top+cardH+70, width:1400, originX:'center', textAlign:'center', anim:{type:'fade',delay:1000+items.length*150+150,duration:500} }));
      return out;
    },
  },
  checklist: {
    label: 'Checklist Reveal',
    layers: () => {
      const items = [
        'Keep every receipt until you leave Japan',
        'Confirm the ¥5,000 minimum per store, per day',
        'Complete Customs at the airport before your refund',
        'Refund lands on your card, not in cash',
      ];
      const listW=1100, itemH=92, startY=430, startX=960-listW/2;
      const out = [
        T('BEFORE YOU FILM THIS BEAT', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:960, top:200, width:1300, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('Traveller checklist:', { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:960, top:260, width:1400, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      ];
      items.forEach((it,i) => {
        const y = startY+i*itemH, delay = 1000+i*220;
        out.push(R({ name:`Row ${i+1} bg`, left:startX, top:y, width:listW, height:itemH-14, rx:12, ry:12, fill:'rgba(255,255,255,0.05)', anim:{type:'fade',delay,duration:400} }));
        out.push(R({ name:`Row ${i+1} check`, left:startX+18, top:y+(itemH-14)/2-23, width:46, height:46, rx:9, ry:9, fill:COLORS.greenLight, anim:{type:'pop',delay:delay+150,duration:400} }));
        out.push(T(it, { name:`Row ${i+1} text`, role:'body', fontSize:26, fill:'#FFFFFF', left:startX+18+46+26, top:y+(itemH-14)/2, width:listW-46-70, originX:'left', originY:'center', textAlign:'left', anim:{type:'fade',delay,duration:400} }));
      });
      out.push(T('National Tax Agency guidance', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:960, top:startY+items.length*itemH+50, width:1400, originX:'center', textAlign:'center', anim:{type:'fade',delay:1000+items.length*220+250,duration:500} }));
      return out;
    },
  },
  dotgrid: {
    label: 'Dot-Grid Pictogram',
    layers: () => [
      T('DIET SEAT REDUCTION BILL', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:960, top:190, width:1300, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
      T("Under the bill's fallback, the House would go from:", { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:960, top:250, width:1500, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      D({ name:'Dot grid', left:960, top:420, width:1400, originX:'center', originY:'top', total:465, highlight:45, highlightColor:COLORS.amberLight, anim:{type:'fade',delay:900,duration:700} }),
      T('465 seats today', { name:'Total label', role:'body', fontSize:26, fill:'rgba(255,255,255,0.75)', left:960, top:830, width:900, textAlign:'center', originX:'center', anim:{type:'fade',delay:2200,duration:500} }),
      T('45 PR seats cut under the fallback', { name:'Highlight label', role:'body', fontWeight:700, fontSize:28, fill:COLORS.amberLight, left:960, top:872, width:900, textAlign:'center', originX:'center', anim:{type:'fade',delay:2350,duration:500} }),
      T('Bill under continued Diet examination as of 16 Aug 2026', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:960, top:930, width:1400, originX:'center', textAlign:'center', anim:{type:'fade',delay:2650,duration:600} }),
      R({ name:'Tag pill', left:960, top:985, width:520, height:48, rx:24, ry:24, fill:COLORS.red, originX:'center', anim:{type:'pop',delay:2850,duration:500} }),
      T('BILL ONLY — NOT ENACTED', { name:'Tag text', role:'body', fontWeight:700, fontSize:20, fill:'#FFFFFF', left:960, top:1009, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:2850,duration:500} }),
    ],
  },
  compare: {
    label: 'Before / After',
    layers: () => {
      const leftLines = ['Pay tax-free price at the shop', 'Show your passport at checkout'];
      const rightLines = ['Pay full price with tax', 'Customs confirms your export', 'Shop or provider refunds you'];
      const leftColor = COLORS.tealLight, rightColor = COLORS.amberLight;
      const panelW = 740, gap = 140, top = 420;
      const leftX = 960 - gap/2 - panelW, rightX = 960 + gap/2;
      const panelH = 120 + Math.max(leftLines.length, rightLines.length) * 90 + 40;
      const LEFT_START = 950, RIGHT_START = 1500;
      const out = [
        T('TAX-FREE SHOPPING, BEFORE AND AFTER', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:960, top:190, width:1300, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('How the refund process changes:', { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:960, top:250, width:1500, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
        R({ name:'Left panel', left:leftX, top, width:panelW, height:panelH, rx:16, ry:16, fill:'rgba(255,255,255,0.06)', stroke:leftColor, strokeWidth:3, anim:{type:'pop',delay:LEFT_START,duration:550} }),
        R({ name:'Left label pill', left:leftX+28, top:top+26, width:150, height:40, rx:20, ry:20, fill:leftColor, anim:{type:'pop',delay:LEFT_START,duration:550} }),
        T('CURRENT', { name:'Left label text', role:'body', fontWeight:700, fontSize:18, fill:'#12213B', left:leftX+28+75, top:top+26+20, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:LEFT_START,duration:550} }),
        R({ name:'Right panel', left:rightX, top, width:panelW, height:panelH, rx:16, ry:16, fill:'rgba(255,255,255,0.06)', stroke:rightColor, strokeWidth:3, anim:{type:'pop',delay:RIGHT_START,duration:550} }),
        R({ name:'Right label pill', left:rightX+28, top:top+26, width:200, height:40, rx:20, ry:20, fill:rightColor, anim:{type:'pop',delay:RIGHT_START,duration:550} }),
        T('FROM 1 NOV 2026', { name:'Right label text', role:'body', fontWeight:700, fontSize:18, fill:'#12213B', left:rightX+28+100, top:top+26+20, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:RIGHT_START,duration:550} }),
        R({ name:'Right flag pill', left:rightX+panelW-190, top:top+26, width:170, height:36, rx:18, ry:18, fill:'rgba(0,0,0,0.28)', stroke:rightColor, strokeWidth:2, anim:{type:'pop',delay:RIGHT_START,duration:550} }),
        T('FUTURE RULE', { name:'Right flag text', role:'body', fontWeight:700, fontSize:18, fill:rightColor, left:rightX+panelW-190+85, top:top+26+18, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:RIGHT_START,duration:550} }),
        T('→', { name:'Arrow', role:'display', fontSize:60, fill:'rgba(255,255,255,0.55)', left:960, top:top+panelH/2, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:RIGHT_START-100,duration:400} }),
        T('National Tax Agency guidance · effective 1 November 2026', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:960, top:top+panelH+66, width:1600, originX:'center', textAlign:'center', anim:{type:'fade',delay:RIGHT_START+250+Math.max(leftLines.length,rightLines.length)*120+200,duration:500} }),
      ];
      leftLines.forEach((line, i) => {
        const y = top+96+i*90, delay = LEFT_START+250+i*120;
        out.push(C({ name:`Left bullet ${i+1}`, left:leftX+44, top:y, radius:6, fill:leftColor, originX:'center', originY:'center', anim:{type:'fade',delay,duration:400} }));
        out.push(T(line, { name:`Left line ${i+1}`, role:'body', fontSize:24, fill:'#FFFFFF', left:leftX+44+26, top:y, width:panelW-100, originX:'left', originY:'center', textAlign:'left', anim:{type:'fade',delay,duration:400} }));
      });
      rightLines.forEach((line, i) => {
        const y = top+96+i*90, delay = RIGHT_START+250+i*120;
        out.push(C({ name:`Right bullet ${i+1}`, left:rightX+44, top:y, radius:6, fill:rightColor, originX:'center', originY:'center', anim:{type:'fade',delay,duration:400} }));
        out.push(T(line, { name:`Right line ${i+1}`, role:'body', fontSize:24, fill:'#FFFFFF', left:rightX+44+26, top:y, width:panelW-100, originX:'left', originY:'center', textAlign:'left', anim:{type:'fade',delay,duration:400} }));
      });
      return out;
    },
  },
  flow: {
    label: 'Process Flow',
    layers: () => {
      const steps = ['Buy at full price', 'Customs confirms export', 'Shop or provider refunds you', 'Refund reaches your card'];
      const n = steps.length, top = 420;
      const boxW = Math.min(300, Math.floor((1760 - (n-1)*90) / n)), boxH = 190, gap = 90;
      const totalW = n*boxW + (n-1)*gap, startX = 960 - totalW/2, y = top + 30;
      const out = [
        T('HOW THE REFUND ACTUALLY WORKS', { name:'Eyebrow', role:'body', fontWeight:700, fontSize:28, fill:COLORS.tealLight, left:960, top:190, width:1300, textAlign:'center', originX:'center', charSpacing:280, anim:{type:'fade',delay:300,duration:600} }),
        T('One receipt moves through four steps:', { name:'Headline', role:'display', fontWeight:700, fontSize:44, fill:'#FFFFFF', left:960, top:250, width:1500, textAlign:'center', originX:'center', anim:{type:'fade',delay:550,duration:600} }),
      ];
      steps.forEach((s, i) => {
        const x = startX + i*(boxW+gap), delay = 1000 + i*350, color = CARD_PALETTE[i % CARD_PALETTE.length];
        out.push(R({ name:`Step ${i+1} box`, left:x, top:y, width:boxW, height:boxH, rx:14, ry:14, fill:'rgba(255,255,255,0.07)', stroke:color, strokeWidth:2.5, anim:{type:'pop',delay,duration:500} }));
        out.push(T('0'+(i+1), { name:`Step ${i+1} number`, role:'display', fontWeight:700, fontSize:26, fill:color, left:x+20, top:y+16, originX:'left', originY:'top', textAlign:'left', anim:{type:'fade',delay,duration:400} }));
        out.push(T(s, { name:`Step ${i+1} label`, role:'body', fontSize:22, fill:'#FFFFFF', left:x+boxW/2, top:y+108, width:boxW-36, originX:'center', textAlign:'center', anim:{type:'fade',delay,duration:500} }));
        if (i > 0) {
          const prevRight = startX + (i-1)*(boxW+gap) + boxW;
          out.push(T('→', { name:`Arrow ${i}`, role:'display', fontSize:36, fill:'rgba(255,255,255,0.55)', left:prevRight+gap/2, top:y+boxH/2, originX:'center', originY:'center', textAlign:'center', anim:{type:'fade',delay:delay-150,duration:350} }));
        }
      });
      const LAST = 1000 + (n-1)*350 + 500;
      out.push(T('National Tax Agency guidance', { name:'Citation', role:'body', fontSize:24, fill:'rgba(255,255,255,0.65)', left:960, top:y+boxH+80, width:1600, originX:'center', textAlign:'center', anim:{type:'fade',delay:LAST+150,duration:500} }));
      return out;
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
  return obj;
}

function loadTemplate(id) {
  activeTemplateId = id;
  canvas.getObjects().slice().forEach(o => { if (o !== bgMediaObj) canvas.remove(o); });
  const specs = TEMPLATES[id].layers();
  specs.forEach(spec => canvas.add(specToObject(spec)));
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
  objs.forEach(o => {
    const row = document.createElement('div');
    row.className = 'layer-row' + (canvas.getActiveObject() === o ? ' active' : '');
    const typeLabel = o.type === 'textbox' ? 'TEXT' : o.type === 'rect' ? 'RECT' : o.type === 'circle' ? 'CIRC' : (o.data && o.data.dotgrid) ? 'DOTS' : o.type.toUpperCase();
    row.innerHTML = `<span class="ltype">${typeLabel}</span><span class="lname">${o.get('name') || o.type}</span>`;
    row.addEventListener('click', () => { canvas.setActiveObject(o); canvas.requestRenderAll(); });
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

/* ============ TEMPLATE GRID ============ */
function renderTemplateGrid() {
  const grid = document.getElementById('templateGrid');
  grid.innerHTML = '';
  Object.keys(TEMPLATES).forEach(id => {
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
    s.className = 'swatch' + (canvas.backgroundColor === o.val ? ' active' : '');
    s.style.background = o.val; s.title = o.name;
    s.addEventListener('click', () => {
      canvas.backgroundColor = o.val; canvas.requestRenderAll();
      [...el.children].forEach(c => c.classList.remove('active')); s.classList.add('active');
    });
    el.appendChild(s);
  });
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
  const proj = { version:2, fontPreset: currentFontPreset, bgColor: canvas.backgroundColor, hold: parseFloat(document.getElementById('fHold').value)||2, objects: objs, customFonts: customFonts };
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
    const fontLoads = (proj.customFonts || []).map(f =>
      registerCustomFont(f.family, f.dataUrl).then(() => customFonts.push(f)).catch(() => {})
    );
    Promise.all(fontLoads).then(() => {
      renderCustomFontList();
      fabric.util.enlivenObjects(proj.objects).then((objs) => {
        objs.forEach(o => canvas.add(o));
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
    if (o === bgMediaObj || !o.data) return;
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
  canvas.requestRenderAll();
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
  captureBaseState();
  setInteractive(false);
}
function endScrub() {
  if (!scrubbing) return;
  scrubbing = false;
  restoreBaseState();
  setInteractive(true);
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
renderTemplateGrid();
renderFontPresets();
renderBgColorSwatches();
loadTemplate('stat');
updateScrubRange();

const loadPromises = FONT_FACE_LIST.map(([fam,w]) => document.fonts.load(`${w} 40px "${fam}"`).catch(()=>{}));
Promise.all(loadPromises).then(() => document.fonts.ready).then(() => { setStatus('Ready.'); canvas.requestRenderAll(); });
setTimeout(() => { if (document.getElementById('status').textContent === 'Loading…') { setStatus('Ready.'); canvas.requestRenderAll(); } }, 2500);
