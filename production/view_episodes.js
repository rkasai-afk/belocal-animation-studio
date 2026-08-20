import * as db from './db.js';
import { computeEpisodeProgress } from './progress.js';
import { escapeHtml, openModal, closeModal, navigate, toast } from './util.js';
import { parseProductionDocument, applyParsedEpisode } from './import.js';

export async function renderEpisodes(main) {
  main.innerHTML = `
    <div class="toolbar">
      <h2 class="section-title" style="margin:0;">Episodes</h2>
      <div style="display:flex;gap:8px;">
        <button id="btnImport">Import Production Document</button>
        <button id="btnNewEpisode" class="primary">+ New Episode</button>
      </div>
    </div>
    <div id="epGridWrap"><p class="subtle">Loading…</p></div>
  `;

  document.getElementById('btnNewEpisode').addEventListener('click', () => openNewEpisodeModal());
  document.getElementById('btnImport').addEventListener('click', () => openImportModal());

  const episodes = await db.listEpisodes();
  const wrap = document.getElementById('epGridWrap');

  if (!episodes.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <h3>No documentaries yet</h3>
        <p>Create your first episode to start building its Edit Blueprint, Assets and Fact Lock.</p>
        <div class="actions">
          <button id="esNew" class="primary">+ New Episode</button>
          <button id="esImport">Import Production Document</button>
        </div>
      </div>`;
    document.getElementById('esNew').addEventListener('click', () => openNewEpisodeModal());
    document.getElementById('esImport').addEventListener('click', () => openImportModal());
    return;
  }

  const cards = await Promise.all(episodes.map(async (ep) => {
    const progress = await computeEpisodeProgress(ep.id);
    return renderCard(ep, progress);
  }));

  wrap.innerHTML = `<div class="episode-grid">${cards.join('')}</div>`;
  wrap.querySelectorAll('.ep-card').forEach((card) => {
    card.addEventListener('click', () => navigate(`#dashboard/${card.dataset.id}`));
  });
}

function tierClass(pct) {
  if (pct === null) return '';
  if (pct >= 95) return 'ok';
  if (pct >= 60) return 'caution';
  return 'bad';
}

function renderCard(ep, progress) {
  const { rows, overallPct, readyForResolve } = progress;
  const rowChips = Object.entries(rows)
    .filter(([, r]) => r.total > 0)
    .map(([key, r]) => `<span class="pill ${tierClass(r.pct)}">${label(key)} ${r.pct}%</span>`)
    .join('');
  return `
    <div class="ep-card" data-id="${ep.id}">
      <div class="ep-num">EP${escapeHtml(ep.number || '—')}</div>
      <h3>${escapeHtml(ep.title)}</h3>
      <div class="ep-desc">${escapeHtml(ep.description || 'No description yet.')}</div>
      <div class="ep-overall">
        <div class="bar"><div style="width:${overallPct}%"></div></div>
        <div class="pct">${overallPct}%</div>
      </div>
      <div class="ep-rows">${rowChips || '<span class="pill">No beats yet</span>'}</div>
      <div class="ep-status-badge ${readyForResolve ? 'ready' : 'progress'}">
        ${readyForResolve ? 'READY FOR RESOLVE' : `${progress.beatsReady.done}/${progress.beatsReady.total || 0} beats ready`}
      </div>
    </div>
  `;
}

function label(key) {
  return { script: 'Script', visuals: 'Visuals', sources: 'Sources', graphics: 'Graphics', factCheck: 'Fact Check' }[key] || key;
}

function openNewEpisodeModal() {
  openModal(`
    <h3>New Episode</h3>
    <label>Episode number</label>
    <input type="text" id="neNumber" placeholder="14">
    <label>Title</label>
    <input type="text" id="neTitle" placeholder="Japanese Review Culture">
    <label>Short description</label>
    <textarea id="neDesc" placeholder="One or two sentences about what this episode covers."></textarea>
    <label>Runtime target</label>
    <input type="text" id="neRuntime" placeholder="8–10 min">
    <div class="modal-actions">
      <button id="neCancel">Cancel</button>
      <button id="neCreate" class="primary">Create Episode</button>
    </div>
  `, (root) => {
    root.querySelector('#neCancel').addEventListener('click', closeModal);
    root.querySelector('#neTitle').focus();
    root.querySelector('#neCreate').addEventListener('click', async () => {
      const title = root.querySelector('#neTitle').value.trim();
      if (!title) { toast('Give the episode a title first.', 'error'); return; }
      const ep = await db.createEpisode({
        number: root.querySelector('#neNumber').value.trim(),
        title,
        description: root.querySelector('#neDesc').value.trim(),
        runtimeTarget: root.querySelector('#neRuntime').value.trim(),
      });
      closeModal();
      toast('Episode created.');
      navigate(`#dashboard/${ep.id}`);
    });
  });
}

function openImportModal() {
  openModal(`
    <h3>Import Production Document</h3>
    <p style="font-size:13px;color:var(--text-gray);line-height:1.5;">
      Pick a standard BeLocal production document (.docx or .pdf). It's parsed entirely in
      your browser — nothing is uploaded anywhere.
    </p>
    <input type="file" id="imFile" accept=".docx,.pdf">
    <div id="imStatus" class="help-tip"></div>
    <div class="modal-actions">
      <button id="imCancel">Cancel</button>
    </div>
  `, (root) => {
    root.querySelector('#imCancel').addEventListener('click', closeModal);
    root.querySelector('#imFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const statusEl = root.querySelector('#imStatus');
      statusEl.textContent = 'Reading and parsing…';
      try {
        const parsed = await parseProductionDocument(file);
        showImportPreview(parsed);
      } catch (err) {
        statusEl.textContent = `Could not read this file: ${err.message}`;
      }
    });
  });
}

function showImportPreview(parsed) {
  const sourcesWithUrl = parsed.sources.filter((s) => s.url).length;
  const beatsWithSource = parsed.beats.filter((b) => b.sourceCode).length;
  openModal(`
    <h3>Review Before Importing</h3>
    <p style="font-size:13px;color:var(--text-gray);line-height:1.5;">
      Parsing is best-effort — check the numbers below look right, then review the episode
      itself afterward. Nothing here is final; every field stays editable.
    </p>
    <div class="source-box">
      <div class="src-title">EP${escapeHtml(parsed.number || '—')} — ${escapeHtml(parsed.title || 'Untitled')}</div>
      <div style="margin-top:8px;font-size:12.5px;color:var(--text-gray);line-height:1.7;">
        ${parsed.beats.length} story beats found (${beatsWithSource}/${parsed.beats.length} linked to a source)<br>
        ${parsed.sources.length} sources found (${sourcesWithUrl}/${parsed.sources.length} with a URL)<br>
        ${parsed.claims.length} fact-check claim${parsed.claims.length === 1 ? '' : 's'} drafted from the verdict${parsed.claims.length > 1 ? ' and research evaluation' : ''}<br>
        ${parsed.shortScript ? '✓' : '✗'} Short-form script &nbsp; ${parsed.masterCaption ? '✓' : '✗'} Publishing caption
      </div>
    </div>
    <div class="modal-actions">
      <button id="ipCancel">Cancel</button>
      <button id="ipCreate" class="primary">Create Episode from This</button>
    </div>
  `, (root) => {
    root.querySelector('#ipCancel').addEventListener('click', closeModal);
    root.querySelector('#ipCreate').addEventListener('click', async () => {
      const episode = await applyParsedEpisode(parsed);
      closeModal();
      toast('Episode imported — review it below.');
      navigate(`#dashboard/${episode.id}`);
    });
  });
}
