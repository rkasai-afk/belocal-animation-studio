import * as db from './db.js';
import { computeEpisodeProgress } from './progress.js';
import { escapeHtml, openModal, closeModal, navigate, toast } from './util.js';

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
  document.getElementById('btnImport').addEventListener('click', () => openImportStubModal());

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
    document.getElementById('esImport').addEventListener('click', () => openImportStubModal());
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

function openImportStubModal() {
  openModal(`
    <h3>Import Production Document</h3>
    <p style="font-size:13px;color:var(--text-gray);line-height:1.5;">
      Automatic import from the standardized BeLocal production .docx isn't built yet —
      parsing a real document reliably needs more source examples to get right.
    </p>
    <p style="font-size:13px;color:var(--text-gray);line-height:1.5;">
      For now: create the episode with <strong>+ New Episode</strong>, then paste the
      long-form script into the episode's Script field and add story beats in the Edit
      Blueprint. This button stays here as the future home for real .docx import — it
      won't move once it's built.
    </p>
    <div class="modal-actions">
      <button id="imOk" class="primary">Got it</button>
    </div>
  `, (root) => {
    root.querySelector('#imOk').addEventListener('click', closeModal);
  });
}
