import * as db from './db.js';
import { beatStatus, beatNeedsSource, STATUS_TIER } from './progress.js';
import { escapeHtml, navigate, toast, debounce, openModal, closeModal, confirmAction, VISUAL_TYPE_ORDER } from './util.js';
import { openAnimationMakerForBeat } from './integration.js';

let saveStateEl = null;
function setSaveState(state) {
  if (!saveStateEl) return;
  saveStateEl.textContent = state;
  saveStateEl.className = `save-state ${state.toLowerCase().includes('saving') ? 'saving' : state.toLowerCase().includes('error') ? 'error' : state.toLowerCase().includes('saved') ? 'saved' : ''}`;
}

export async function renderEdit(main, episodeId, opts = {}) {
  if (!episodeId) {
    const episodes = await db.listEpisodes();
    if (!episodes.length) {
      main.innerHTML = `<div class="empty-state"><h3>No episodes yet</h3><p>Create an episode first — the Edit Blueprint belongs to one documentary.</p></div>`;
      return;
    }
    main.innerHTML = `
      <h2 class="section-title">Edit Blueprint</h2>
      <p class="subtle" style="margin-top:-8px;margin-bottom:16px;">Pick an episode to open its blueprint.</p>
      <div class="episode-grid">
        ${episodes.map((ep) => `
          <div class="ep-card" data-id="${ep.id}">
            <div class="ep-num">EP${escapeHtml(ep.number || '—')}</div>
            <h3>${escapeHtml(ep.title)}</h3>
          </div>
        `).join('')}
      </div>
    `;
    main.querySelectorAll('.ep-card').forEach((c) => c.addEventListener('click', () => navigate(`#edit/${c.dataset.id}`)));
    return;
  }
  const ep = await db.getEpisode(episodeId);
  if (!ep) {
    main.innerHTML = `<div class="empty-state"><h3>Episode not found</h3><div class="actions"><button class="primary" onclick="location.hash='#episodes'">Back to Episodes</button></div></div>`;
    return;
  }

  const [beats, sources, claims] = await Promise.all([
    db.listBeats(episodeId),
    db.listSources(episodeId),
    db.listClaims(episodeId),
  ]);
  const claimsByBeat = new Map();
  claims.forEach((c) => { if (c.beatId) { if (!claimsByBeat.has(c.beatId)) claimsByBeat.set(c.beatId, []); claimsByBeat.get(c.beatId).push(c); } });

  main.innerHTML = `
    <div class="beat-toolbar">
      <div>
        <h2 class="section-title" style="margin:0;">Edit Blueprint — EP${escapeHtml(ep.number || '—')} ${escapeHtml(ep.title)}</h2>
        <span class="subtle">Narration | Visual / Source, beat by beat. Drag the handle to reorder.</span>
      </div>
      <div style="display:flex; align-items:center; gap:14px;">
        <span class="save-state" id="editSaveState"></span>
        <button class="primary" id="btnAddBeat">+ New Beat</button>
      </div>
    </div>
    <div id="beatList"></div>
  `;
  saveStateEl = document.getElementById('editSaveState');

  document.getElementById('btnAddBeat').addEventListener('click', async () => {
    await db.createBeat(episodeId);
    renderEdit(main, episodeId, opts);
  });

  const listEl = document.getElementById('beatList');
  if (!beats.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <h3>This episode does not have an Edit Blueprint yet</h3>
        <p>Create the first story beat, or import the production package once that's available.</p>
        <div class="actions"><button class="primary" id="esNewBeat">+ Create First Beat</button></div>
      </div>`;
    document.getElementById('esNewBeat').addEventListener('click', async () => {
      await db.createBeat(episodeId);
      renderEdit(main, episodeId, opts);
    });
    return;
  }

  listEl.innerHTML = beats.map((b) => beatCardHtml(b, claimsByBeat.get(b.id))).join('');

  beats.forEach((beat) => wireBeatCard(main, episodeId, beat, sources, claimsByBeat.get(beat.id)));
  wireDragReorder(listEl, episodeId, beats);

  if (opts.beatId) {
    const target = main.querySelector(`.beat-card[data-id="${opts.beatId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.style.borderColor = 'var(--teal)';
      if (opts.focus === 'source') {
        const btn = target.querySelector('.btn-attach-source');
        if (btn) setTimeout(() => btn.click(), 300);
      }
      if (opts.action === 'create-graphic') {
        const btn = target.querySelector('.btn-create-graphic');
        if (btn) setTimeout(() => btn.click(), 300);
      }
    }
  }
}

function beatCardHtml(beat, claimsForBeat) {
  const status = beatStatus(beat, claimsForBeat);
  const tier = STATUS_TIER[status] || 'caution';
  return `
    <div class="beat-card" data-id="${beat.id}" draggable="false">
      <div class="beat-head">
        <span class="drag-handle" draggable="true" title="Drag to reorder">⠿</span>
        <input type="text" class="time-field f-start" value="${escapeHtml(beat.timeStart)}" placeholder="00:00">
        <span class="subtle">–</span>
        <input type="text" class="time-field f-end" value="${escapeHtml(beat.timeEnd)}" placeholder="00:00">
        <input type="text" class="title-field f-title" value="${escapeHtml(beat.title)}">
        <span class="status-badge ${tier}">${status}</span>
      </div>
      <div class="beat-body">
        <div class="beat-col">
          <label class="field-label">Narration</label>
          <textarea class="f-narration" placeholder="What the presenter/voiceover says…">${escapeHtml(beat.narration)}</textarea>
          <label class="field-label">Notes</label>
          <textarea class="f-notes" placeholder="Anything the editor should know…">${escapeHtml(beat.notes)}</textarea>
        </div>
        <div class="beat-col">
          <label class="field-label">Visual type</label>
          <div class="vtype-row">
            ${VISUAL_TYPE_ORDER.map((t) => `<button type="button" class="vtype-btn ${beat.visualType === t ? 'active' : ''}" data-vt="${t}">${t}</button>`).join('')}
          </div>
          <label class="field-label">Visual instruction</label>
          <textarea class="f-visual" placeholder="What should appear on screen…">${escapeHtml(beat.visualInstruction)}</textarea>
          <label class="field-label">Source</label>
          <div class="source-slot"></div>
          <label class="field-label">Assets</label>
          <div class="asset-slot"></div>
        </div>
      </div>
      <div class="beat-footer">
        <button type="button" class="small btn-attach-source">Attach Source</button>
        <button type="button" class="small btn-attach-asset">Attach Asset</button>
        ${beat.visualType === 'GRAPHIC' ? `<button type="button" class="small primary btn-create-graphic">Create Graphic</button>` : ''}
        <span style="flex:1;"></span>
        <label class="subtle" style="margin:0;">Status:</label>
        <select class="f-status-override" style="width:auto;padding:4px 8px;font-size:11.5px;">
          <option value="" ${!beat.statusOverride ? 'selected' : ''}>Auto</option>
          <option value="READY" ${beat.statusOverride === 'READY' ? 'selected' : ''}>Mark Ready</option>
          <option value="MISSING ASSET" ${beat.statusOverride === 'MISSING ASSET' ? 'selected' : ''}>Mark Missing Asset</option>
          <option value="NEEDS GRAPHIC" ${beat.statusOverride === 'NEEDS GRAPHIC' ? 'selected' : ''}>Mark Needs Graphic</option>
          <option value="NEEDS SOURCE" ${beat.statusOverride === 'NEEDS SOURCE' ? 'selected' : ''}>Mark Needs Source</option>
        </select>
        <button type="button" class="small danger" data-archive="1">Remove Beat</button>
      </div>
    </div>
  `;
}

function wireBeatCard(main, episodeId, beat, sources, claimsForBeat) {
  const card = main.querySelector(`.beat-card[data-id="${beat.id}"]`);
  if (!card) return;

  const save = debounce(async () => {
    setSaveState('SAVING…');
    try {
      await db.saveBeat(beat);
      setSaveState('SAVED');
      refreshStatusBadge(card, beat, claimsForBeat);
    } catch {
      setSaveState('ERROR');
    }
  }, 500);

  card.querySelector('.f-start').addEventListener('input', (e) => { beat.timeStart = e.target.value; save(); });
  card.querySelector('.f-end').addEventListener('input', (e) => { beat.timeEnd = e.target.value; save(); });
  card.querySelector('.f-title').addEventListener('input', (e) => { beat.title = e.target.value; save(); });
  card.querySelector('.f-narration').addEventListener('input', (e) => { beat.narration = e.target.value; save(); });
  card.querySelector('.f-notes').addEventListener('input', (e) => { beat.notes = e.target.value; save(); });
  card.querySelector('.f-visual').addEventListener('input', (e) => { beat.visualInstruction = e.target.value; save(); });

  card.querySelectorAll('.vtype-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      beat.visualType = btn.dataset.vt;
      card.querySelectorAll('.vtype-btn').forEach((b) => b.classList.toggle('active', b === btn));
      const footerGraphicBtn = card.querySelector('.btn-create-graphic');
      if (beat.visualType === 'GRAPHIC' && !footerGraphicBtn) {
        const footer = card.querySelector('.beat-footer');
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'small primary btn-create-graphic'; b.textContent = 'Create Graphic';
        footer.insertBefore(b, footer.querySelector('span'));
        wireCreateGraphic(b, episodeId, beat);
      } else if (beat.visualType !== 'GRAPHIC' && footerGraphicBtn) {
        footerGraphicBtn.remove();
      }
      save();
    });
  });

  card.querySelector('.f-status-override').addEventListener('change', (e) => {
    beat.statusOverride = e.target.value || null;
    save();
  });

  card.querySelector('[data-archive]').addEventListener('click', () => {
    confirmAction(`Remove "${beat.title}" from the blueprint? It can't be undone from here.`, async () => {
      await db.archiveBeat(beat.id);
      toast('Beat removed.');
      renderEdit(main, episodeId, {});
    }, 'Remove Beat');
  });

  renderSourceSlot(card, episodeId, beat, sources, save);
  renderAssetSlot(card, episodeId, beat, save);

  const createGraphicBtn = card.querySelector('.btn-create-graphic');
  if (createGraphicBtn) wireCreateGraphic(createGraphicBtn, episodeId, beat);

  card.querySelector('.btn-attach-source').addEventListener('click', () => openSourceModal(episodeId, beat, sources, () => {
    renderSourceSlot(card, episodeId, beat, sources, save);
    save();
  }));
  card.querySelector('.btn-attach-asset').addEventListener('click', () => openAssetPickerModal(episodeId, beat, () => {
    renderAssetSlot(card, episodeId, beat, save);
    save();
  }));
}

function wireCreateGraphic(btn, episodeId, beat) {
  btn.addEventListener('click', () => {
    openAnimationMakerForBeat(episodeId, beat, () => {
      // Re-render the whole edit view so the new asset chip + status show up.
      const main = document.getElementById('main');
      renderEdit(main, episodeId, { beatId: beat.id });
    });
    toast('Opening Animation Maker with this beat\'s context…');
  });
}

function refreshStatusBadge(card, beat, claimsForBeat) {
  const status = beatStatus(beat, claimsForBeat);
  const tier = STATUS_TIER[status] || 'caution';
  const badge = card.querySelector('.status-badge');
  badge.textContent = status;
  badge.className = `status-badge ${tier}`;
}

async function renderSourceSlot(card, episodeId, beat, sources, save) {
  const slot = card.querySelector('.source-slot');
  if (!beat.sourceId) {
    slot.innerHTML = `<span class="subtle">${beatNeedsSource(beat, null) ? 'No source attached yet.' : 'Not required for this visual type.'}</span>`;
    return;
  }
  const src = sources.find((s) => s.id === beat.sourceId) || await db.getSource(beat.sourceId);
  if (!src) { slot.innerHTML = `<span class="subtle">Source missing.</span>`; return; }
  slot.innerHTML = `
    <div class="source-box">
      <div class="src-title">${escapeHtml(src.publisher || 'Untitled publisher')} — ${escapeHtml(src.title)}</div>
      <div class="src-url">${escapeHtml(src.url || 'No URL recorded')}</div>
      <button type="button" class="small ghost" style="margin-top:6px;padding-left:0;" data-remove-source>Remove</button>
    </div>
  `;
  slot.querySelector('[data-remove-source]').addEventListener('click', () => {
    beat.sourceId = null;
    renderSourceSlot(card, episodeId, beat, sources, save);
    save();
    refreshStatusBadge(card, beat, null);
  });
}

async function renderAssetSlot(card, episodeId, beat, save) {
  const slot = card.querySelector('.asset-slot');
  if (!beat.assetIds || !beat.assetIds.length) {
    slot.innerHTML = `<span class="subtle">No assets attached yet.</span>`;
    return;
  }
  const assets = await Promise.all(beat.assetIds.map((id) => db.getAsset(id)));
  slot.innerHTML = assets.filter(Boolean).map((a) => `
    <span class="asset-chip" data-asset-id="${a.id}">
      <span class="badge-visual" style="background:var(--teal);">${escapeHtml(a.type)}</span>
      ${escapeHtml(a.filename)}
      <button type="button" data-remove-asset="${a.id}" title="Detach">✕</button>
    </span>
  `).join('');
  slot.querySelectorAll('[data-remove-asset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      beat.assetIds = beat.assetIds.filter((id) => id !== btn.dataset.removeAsset);
      renderAssetSlot(card, episodeId, beat, save);
      save();
      refreshStatusBadge(card, beat, null);
    });
  });
}

function openSourceModal(episodeId, beat, sources, onDone) {
  openModal(`
    <h3>Attach Source</h3>
    ${sources.length ? `
      <label>Existing sources for this episode</label>
      <select id="srcExisting">
        <option value="">— choose —</option>
        ${sources.map((s) => `<option value="${s.id}">${escapeHtml(s.publisher)} — ${escapeHtml(s.title)}</option>`).join('')}
      </select>
      <div style="margin:12px 0;text-align:center;color:var(--text-gray);font-size:11.5px;">— or add a new one —</div>
    ` : ''}
    <label>Publisher</label>
    <input type="text" id="srcPub" placeholder="Japan Tourism Agency">
    <label>Document / page title</label>
    <input type="text" id="srcTitle" placeholder="Tourism Vision 2030">
    <label>Full URL</label>
    <input type="text" id="srcUrl" placeholder="https://…">
    <label>What it supports</label>
    <textarea id="srcSupports" placeholder="Which claim/number this backs up"></textarea>
    <div class="modal-actions">
      <button id="srcCancel">Cancel</button>
      <button id="srcSave" class="primary">Attach</button>
    </div>
  `, (root) => {
    root.querySelector('#srcCancel').addEventListener('click', closeModal);
    root.querySelector('#srcSave').addEventListener('click', async () => {
      const existing = root.querySelector('#srcExisting');
      if (existing && existing.value) {
        beat.sourceId = existing.value;
      } else {
        const pub = root.querySelector('#srcPub').value.trim();
        const title = root.querySelector('#srcTitle').value.trim();
        if (!pub && !title) { toast('Add a publisher or title, or pick an existing source.', 'error'); return; }
        const src = await db.createSource(episodeId, {
          publisher: pub,
          title,
          url: root.querySelector('#srcUrl').value.trim(),
          supports: root.querySelector('#srcSupports').value.trim(),
        });
        sources.push(src);
        beat.sourceId = src.id;
      }
      closeModal();
      toast('Source attached.');
      onDone();
    });
  });
}

async function openAssetPickerModal(episodeId, beat, onDone) {
  const episodeAssets = await db.listAssets({ episodeId });
  const available = episodeAssets.filter((a) => !beat.assetIds.includes(a.id));
  openModal(`
    <h3>Attach Asset</h3>
    ${available.length ? `
      <label>Existing assets in this episode</label>
      <select id="assetExisting" size="6" style="height:auto;">
        ${available.map((a) => `<option value="${a.id}">[${escapeHtml(a.type)}] ${escapeHtml(a.filename)}</option>`).join('')}
      </select>
    ` : `<p class="subtle">No unattached assets yet in this episode — upload one from the Assets library, or drop a file below.</p>`}
    <div style="margin:14px 0;text-align:center;color:var(--text-gray);font-size:11.5px;">— or upload a new file —</div>
    <input type="file" id="assetUpload">
    <div class="modal-actions">
      <button id="apCancel">Cancel</button>
      <button id="apSave" class="primary">Attach</button>
    </div>
  `, (root) => {
    root.querySelector('#apCancel').addEventListener('click', closeModal);
    root.querySelector('#apSave').addEventListener('click', async () => {
      const sel = root.querySelector('#assetExisting');
      const fileInput = root.querySelector('#assetUpload');
      if (fileInput.files[0]) {
        const file = fileInput.files[0];
        const asset = await db.createAsset({ filename: file.name, type: guessAssetType(beat.visualType), episodeId, beatId: beat.id }, file, null);
        beat.assetIds.push(asset.id);
      } else if (sel && sel.value) {
        await db.attachAssetToBeat(sel.value, episodeId, beat.id);
        if (!beat.assetIds.includes(sel.value)) beat.assetIds.push(sel.value);
      } else {
        toast('Choose an asset or a file to upload.', 'error');
        return;
      }
      closeModal();
      toast('Asset attached.');
      onDone();
    });
  });
}

function guessAssetType(visualType) {
  return { OWN: 'Own footage', SOURCE: 'Source capture', GRAPHIC: 'Graphic', FREE: 'Other', STOCK: 'Stock', ARCHIVE: 'Archive', PHOTO: 'Photo' }[visualType] || 'Other';
}

function wireDragReorder(listEl, episodeId, beats) {
  let dragId = null;
  listEl.querySelectorAll('.drag-handle').forEach((handle) => {
    handle.addEventListener('dragstart', (e) => {
      dragId = handle.closest('.beat-card').dataset.id;
      handle.closest('.beat-card').classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    handle.addEventListener('dragend', () => {
      listEl.querySelectorAll('.beat-card').forEach((c) => c.classList.remove('dragging'));
    });
  });
  listEl.querySelectorAll('.beat-card').forEach((card) => {
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragId || card.dataset.id === dragId) return;
      const rect = card.getBoundingClientRect();
      const before = e.clientY < rect.top + rect.height / 2;
      card.parentNode.insertBefore(document.querySelector(`.beat-card[data-id="${dragId}"]`), before ? card : card.nextSibling);
    });
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      const orderedIds = Array.from(listEl.querySelectorAll('.beat-card')).map((c) => c.dataset.id);
      await db.reorderBeats(episodeId, orderedIds);
      toast('Order saved.');
    });
  });
}
