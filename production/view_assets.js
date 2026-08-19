import * as db from './db.js';
import { escapeHtml, toast, openModal, closeModal, confirmAction } from './util.js';
import { videoThumbnail } from './integration.js';

const PAGE_SIZE = 60;
let pageLimit = PAGE_SIZE;

function imageThumbnail(file) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = Math.round((img.height / img.width) * 320) || 240;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((thumb) => { URL.revokeObjectURL(url); resolve(thumb); }, 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch { resolve(null); }
  });
}

// Cheap, local, non-AI "suggested tags": split the filename on separators/case changes
// and drop pure numbers/short noise — good enough for footage named like most cameras
// and file systems already produce (Kamakura_034.mov -> "Kamakura").
function suggestTagsFromFilename(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const parts = base
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[_\-\s.]+/)
    .filter((p) => p.length > 2 && !/^\d+$/.test(p));
  return [...new Set(parts.map((p) => p.trim()))].slice(0, 5);
}

export async function renderAssets(main, episodeId) {
  const episodes = await db.listEpisodes();
  main.innerHTML = `
    <div class="toolbar">
      <h2 class="section-title" style="margin:0;">Assets</h2>
      <span class="subtle">The searchable library for footage, graphics, source captures and more.</span>
    </div>

    <div class="dropzone" id="dropzone">
      <div>Drag footage or files here, or</div>
      <div class="dz-actions">
        <button class="primary" id="btnAddFiles">Add Files</button>
        <button id="btnLogAsset">Log Asset (no file yet)</button>
      </div>
      <input type="file" id="fileInput" multiple style="display:none;">
    </div>

    <div class="asset-filters">
      <input type="text" id="fSearch" placeholder="Search filename, tags, description…">
      <select id="fType"><option value="">All types</option>${db.ASSET_TYPES.map((t) => `<option>${t}</option>`).join('')}</select>
      <select id="fEpisode"><option value="">All episodes</option>${episodes.map((e) => `<option value="${e.id}" ${e.id === episodeId ? 'selected' : ''}>EP${escapeHtml(e.number || '—')} ${escapeHtml(e.title)}</option>`).join('')}</select>
      <select id="fUsage"><option value="">Used + unused</option><option value="used">Used only</option><option value="unused">Unused only</option></select>
    </div>

    <div id="assetGridWrap"></div>
  `;

  const dropzone = document.getElementById('dropzone');
  ['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
  dropzone.addEventListener('drop', (e) => handleFiles(Array.from(e.dataTransfer.files), episodeId, main, episodeId));

  const fileInput = document.getElementById('fileInput');
  document.getElementById('btnAddFiles').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFiles(Array.from(fileInput.files), episodeId, main, episodeId));
  document.getElementById('btnLogAsset').addEventListener('click', () => openLogAssetModal(episodeId, () => refreshGrid(main, episodeId)));

  ['fSearch', 'fType', 'fEpisode', 'fUsage'].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { pageLimit = PAGE_SIZE; refreshGrid(main, episodeId); });
    el.addEventListener('change', () => { pageLimit = PAGE_SIZE; refreshGrid(main, episodeId); });
  });

  pageLimit = PAGE_SIZE;
  await refreshGrid(main, episodeId);
}

async function handleFiles(files, contextEpisodeId, main, episodeId) {
  if (!files.length) return;
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await openUploadPanel(file, contextEpisodeId);
  }
  refreshGrid(main, episodeId);
}

function openUploadPanel(file, contextEpisodeId) {
  return new Promise(async (resolve) => {
    const guessedType = file.type.startsWith('video/') ? 'Own footage'
      : file.type.startsWith('image/') ? 'Photo'
      : file.type.startsWith('audio/') ? 'Audio' : 'Other';
    const tags = suggestTagsFromFilename(file.name);
    openModal(`
      <h3>New Asset</h3>
      <p class="subtle" style="margin:0 0 10px;">File: <strong>${escapeHtml(file.name)}</strong></p>
      <label>Type</label>
      <select id="uaType">${db.ASSET_TYPES.map((t) => `<option ${t === guessedType ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label>Suggested tags <span class="subtle">(edit freely, comma separated)</span></label>
      <input type="text" id="uaTags" value="${escapeHtml(tags.join(', '))}">
      <label>Location</label>
      <input type="text" id="uaLocation" placeholder="Kamakura Station">
      <p class="help-tip">Everything below is optional — you can fill it in later. Only the file matters right now.</p>
      <div class="modal-actions">
        <button id="uaSkip">Skip metadata, just save</button>
        <button id="uaSave" class="primary">Save</button>
      </div>
    `, (root) => {
      const doSave = async () => {
        const type = root.querySelector('#uaType').value;
        const tagList = root.querySelector('#uaTags').value.split(',').map((t) => t.trim()).filter(Boolean);
        const location = root.querySelector('#uaLocation').value.trim();
        let thumb = null;
        if (file.type.startsWith('image/')) thumb = await imageThumbnail(file);
        else if (file.type.startsWith('video/')) thumb = await videoThumbnail(file);
        await db.createAsset({ filename: file.name, type, tags: tagList, location, episodeId: contextEpisodeId || null }, file, thumb);
        closeModal();
        resolve();
      };
      root.querySelector('#uaSkip').addEventListener('click', async () => {
        await db.createAsset({ filename: file.name, type: guessedType, episodeId: contextEpisodeId || null }, file, null);
        closeModal();
        resolve();
      });
      root.querySelector('#uaSave').addEventListener('click', doSave);
    });
  });
}

function openLogAssetModal(contextEpisodeId, onDone) {
  openModal(`
    <h3>Log Asset</h3>
    <p class="subtle" style="margin:0 0 10px;">For footage/files that live on disk or NAS — track that it exists without uploading it here.</p>
    <label>Filename / description</label>
    <input type="text" id="laName" placeholder="Kamakura_034.mov">
    <label>Type</label>
    <select id="laType">${db.ASSET_TYPES.map((t) => `<option>${t}</option>`).join('')}</select>
    <label>Location</label>
    <input type="text" id="laLocation" placeholder="Kamakura Station, or NAS path">
    <label>Tags</label>
    <input type="text" id="laTags" placeholder="kamakura, station, crowd">
    <div class="modal-actions">
      <button id="laCancel">Cancel</button>
      <button id="laSave" class="primary">Log Asset</button>
    </div>
  `, (root) => {
    root.querySelector('#laCancel').addEventListener('click', closeModal);
    root.querySelector('#laSave').addEventListener('click', async () => {
      const filename = root.querySelector('#laName').value.trim();
      if (!filename) { toast('Give it a name first.', 'error'); return; }
      await db.createAsset({
        filename,
        type: root.querySelector('#laType').value,
        location: root.querySelector('#laLocation').value.trim(),
        tags: root.querySelector('#laTags').value.split(',').map((t) => t.trim()).filter(Boolean),
        episodeId: contextEpisodeId || null,
      }, null, null);
      closeModal();
      toast('Asset logged.');
      onDone();
    });
  });
}

async function refreshGrid(main, episodeId) {
  const wrap = document.getElementById('assetGridWrap');
  if (!wrap) return;
  const search = document.getElementById('fSearch').value.trim().toLowerCase();
  const type = document.getElementById('fType').value;
  const filterEpisode = document.getElementById('fEpisode').value;
  const usage = document.getElementById('fUsage').value;

  let assets = await db.listAssets({ type: type || undefined, episodeId: filterEpisode || undefined });
  if (search) {
    assets = assets.filter((a) => [a.filename, a.location, a.description, ...(a.tags || [])].join(' ').toLowerCase().includes(search));
  }
  if (usage === 'used') assets = assets.filter((a) => a.beatId);
  if (usage === 'unused') assets = assets.filter((a) => !a.beatId);

  if (!assets.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <h3>No footage has been added yet</h3>
        <p>Drag footage here or choose files. You can add tags and details later.</p>
      </div>`;
    return;
  }

  const shown = assets.slice(0, pageLimit);
  const cards = await Promise.all(shown.map(renderAssetCard));
  wrap.innerHTML = `
    <div class="asset-grid">${cards.join('')}</div>
    ${assets.length > shown.length ? `<div style="text-align:center;margin-top:16px;"><button id="btnLoadMore">Load more (${assets.length - shown.length} remaining)</button></div>` : ''}
  `;
  wrap.querySelectorAll('.asset-card').forEach((card) => {
    card.addEventListener('click', () => openAssetDetailModal(card.dataset.id, () => refreshGrid(main, episodeId)));
  });
  const loadMore = document.getElementById('btnLoadMore');
  if (loadMore) loadMore.addEventListener('click', () => { pageLimit += PAGE_SIZE; refreshGrid(main, episodeId); });
}

async function renderAssetCard(a) {
  let thumbStyle = '';
  if (a.hasThumb) {
    const rec = await db.getAssetBlobRecord(a.id);
    if (rec && rec.thumb) thumbStyle = `background-image:url(${URL.createObjectURL(rec.thumb)});`;
  }
  return `
    <div class="asset-card" data-id="${a.id}">
      <div class="asset-thumb" style="${thumbStyle}">${thumbStyle ? '' : escapeHtml(a.type)}</div>
      <div class="asset-info">
        <div class="a-name" title="${escapeHtml(a.filename)}">${escapeHtml(a.filename)}</div>
        <div class="a-meta"><span>${escapeHtml(a.type)}</span><span>${a.beatId ? 'Used' : 'Unused'}</span></div>
      </div>
    </div>
  `;
}

async function openAssetDetailModal(id, onChange) {
  const asset = await db.getAsset(id);
  if (!asset) return;
  const usedInEpisode = asset.episodeId ? await db.getEpisode(asset.episodeId) : null;
  const usedInBeat = asset.beatId ? await db.getBeat(asset.beatId) : null;

  openModal(`
    <h3>${escapeHtml(asset.filename)}</h3>
    <label>Type</label>
    <select id="adType">${db.ASSET_TYPES.map((t) => `<option ${t === asset.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <label>Tags</label>
    <input type="text" id="adTags" value="${escapeHtml((asset.tags || []).join(', '))}">
    <label>Location</label>
    <input type="text" id="adLocation" value="${escapeHtml(asset.location)}">
    <label>Description</label>
    <textarea id="adDesc">${escapeHtml(asset.description)}</textarea>
    <label>License / source info</label>
    <input type="text" id="adLicense" value="${escapeHtml(asset.license)}">
    <label>Notes</label>
    <textarea id="adNotes">${escapeHtml(asset.notes)}</textarea>
    <p class="help-tip">
      ${usedInEpisode ? `Used in: EP${escapeHtml(usedInEpisode.number || '—')} ${escapeHtml(usedInEpisode.title)}${usedInBeat ? ` — "${escapeHtml(usedInBeat.title)}"` : ''}` : 'Not currently linked to a beat.'}
      ${asset.hasFile ? '' : ' · Logged only — no file uploaded.'}
    </p>
    <div class="modal-actions">
      <button id="adDelete" class="danger">Delete</button>
      <span style="flex:1;"></span>
      <button id="adCancel">Cancel</button>
      <button id="adSave" class="primary">Save</button>
    </div>
  `, (root) => {
    root.querySelector('#adCancel').addEventListener('click', closeModal);
    root.querySelector('#adSave').addEventListener('click', async () => {
      asset.type = root.querySelector('#adType').value;
      asset.tags = root.querySelector('#adTags').value.split(',').map((t) => t.trim()).filter(Boolean);
      asset.location = root.querySelector('#adLocation').value.trim();
      asset.description = root.querySelector('#adDesc').value.trim();
      asset.license = root.querySelector('#adLicense').value.trim();
      asset.notes = root.querySelector('#adNotes').value.trim();
      await db.saveAsset(asset);
      closeModal();
      toast('Asset updated.');
      onChange();
    });
    root.querySelector('#adDelete').addEventListener('click', () => {
      confirmAction(`Delete "${asset.filename}"? This removes it from the library and any beat it's attached to.`, async () => {
        await db.deleteAsset(asset.id);
        closeModal();
        toast('Asset deleted.');
        onChange();
      }, 'Delete');
    });
  });
}
