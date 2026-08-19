import * as db from './db.js';
import { escapeHtml, toast, openModal, closeModal, confirmAction, navigate } from './util.js';

const RECHECK_WARN_DAYS = 90;

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return Infinity;
  return Math.floor((Date.now() - then) / 86400000);
}

export async function renderFactCheck(main, episodeId) {
  if (!episodeId) {
    const episodes = await db.listEpisodes();
    if (!episodes.length) {
      main.innerHTML = `<div class="empty-state"><h3>No episodes yet</h3><p>Create an episode first — Fact Lock tracks claims per documentary.</p></div>`;
      return;
    }
    const rows = await Promise.all(episodes.map(async (ep) => {
      const claims = await db.listClaims(ep.id);
      const needsReview = claims.filter((c) => db.FACT_STATUS_TIER[c.status] !== 'ok').length;
      return { ep, claims, needsReview };
    }));
    main.innerHTML = `
      <h2 class="section-title">Fact Check</h2>
      <p class="subtle" style="margin-top:-8px;margin-bottom:16px;">Pick an episode to open its Fact Lock.</p>
      <div class="episode-grid">
        ${rows.map(({ ep, claims, needsReview }) => `
          <div class="ep-card" data-id="${ep.id}">
            <div class="ep-num">EP${escapeHtml(ep.number || '—')}</div>
            <h3>${escapeHtml(ep.title)}</h3>
            <div class="ep-status-badge ${needsReview ? 'progress' : 'ready'}">
              ${claims.length === 0 ? 'No claims logged' : needsReview ? `⚠ ${needsReview} claim${needsReview > 1 ? 's' : ''} need review` : '✓ All current'}
            </div>
          </div>
        `).join('')}
      </div>
    `;
    main.querySelectorAll('.ep-card').forEach((c) => c.addEventListener('click', () => navigate(`#factcheck/${c.dataset.id}`)));
    return;
  }

  const ep = await db.getEpisode(episodeId);
  if (!ep) { main.innerHTML = `<div class="empty-state"><h3>Episode not found</h3></div>`; return; }

  await paint(main, ep);
}

async function paint(main, ep) {
  const [claims, sources] = await Promise.all([db.listClaims(ep.id), db.listSources(ep.id)]);
  const needsReview = claims.filter((c) => db.FACT_STATUS_TIER[c.status] !== 'ok').length;

  main.innerHTML = `
    <div class="toolbar">
      <div>
        <h2 class="section-title" style="margin:0;">Fact Lock — EP${escapeHtml(ep.number || '—')} ${escapeHtml(ep.title)}</h2>
        <span class="subtle">${claims.length === 0 ? 'No claims logged yet.' : needsReview ? `⚠ ${needsReview} claim(s) need review` : '✓ All claims current'}</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="btnNewSource">+ Source</button>
        <button id="btnNewClaim" class="primary">+ Claim</button>
      </div>
    </div>

    <div id="claimsWrap">
      ${claims.length === 0 ? `
        <div class="empty-state">
          <h3>No claims tracked for this episode</h3>
          <p>Log every factual claim in the script so it can be checked against a real source before final QC.</p>
          <div class="actions"><button class="primary" id="esNewClaim">+ Log First Claim</button></div>
        </div>` : claims.map((c) => claimCardHtml(c, sources)).join('')}
    </div>

    <h3 style="margin:28px 0 12px;color:var(--navy);font-size:14px;">Sources</h3>
    <div id="sourcesWrap">
      ${sources.length === 0
        ? `<p class="subtle">No sources recorded yet — add one from a claim, or with "+ Source" above.</p>`
        : sources.map(sourceRowHtml).join('')}
    </div>
  `;

  document.getElementById('btnNewClaim').addEventListener('click', () => openClaimModal(ep.id, null, sources, () => paint(main, ep)));
  const esNewClaim = document.getElementById('esNewClaim');
  if (esNewClaim) esNewClaim.addEventListener('click', () => openClaimModal(ep.id, null, sources, () => paint(main, ep)));
  document.getElementById('btnNewSource').addEventListener('click', () => openSourceOnlyModal(ep.id, () => paint(main, ep)));

  main.querySelectorAll('[data-claim-id]').forEach((card) => {
    const claim = claims.find((c) => c.id === card.dataset.claimId);
    card.querySelector('.claim-status-select').addEventListener('change', async (e) => {
      claim.status = e.target.value;
      if (db.FACT_STATUS_TIER[claim.status] === 'ok') claim.lastVerified = db.todayStr();
      await db.saveClaim(claim);
      toast('Fact status updated.');
      paint(main, ep);
    });
    const editBtn = card.querySelector('[data-edit-claim]');
    if (editBtn) editBtn.addEventListener('click', () => openClaimModal(ep.id, claim, sources, () => paint(main, ep)));
    const delBtn = card.querySelector('[data-delete-claim]');
    if (delBtn) delBtn.addEventListener('click', () => {
      confirmAction(`Delete claim ${claim.code}? This can't be undone.`, async () => {
        await db.deleteClaim(claim.id);
        toast('Claim deleted.');
        paint(main, ep);
      }, 'Delete');
    });
  });

  main.querySelectorAll('[data-recheck-source]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const src = sources.find((s) => s.id === btn.dataset.recheckSource);
      src.lastChecked = db.todayStr();
      await db.saveSource(src);
      toast('Marked as rechecked today.');
      paint(main, ep);
    });
  });
}

function claimCardHtml(c, sources) {
  const tier = db.FACT_STATUS_TIER[c.status] || 'caution';
  const src = sources.find((s) => s.id === c.sourceId);
  return `
    <div class="claim-card ${tier}" data-claim-id="${c.id}">
      <div class="claim-head">
        <div>
          <span class="claim-code">${escapeHtml(c.code)}</span>
          <div class="claim-text">${escapeHtml(c.claim || '(no claim text yet)')}</div>
        </div>
        <select class="claim-status-select" style="width:auto;">
          ${db.FACT_STATUSES.map((s) => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="claim-meta">
        <span>Risk: <strong>${escapeHtml(c.risk)}</strong></span>
        <span>Last verified: <strong>${escapeHtml(c.lastVerified || '—')}</strong></span>
        <span>${c.allowedInScript ? '✓ Allowed in final script' : '✗ Not cleared for final script'}</span>
        ${src ? `<a href="${escapeHtml(src.url)}" target="_blank" rel="noopener">${escapeHtml(src.publisher || src.title)}</a>` : '<span>No source linked</span>'}
        <a href="#" data-edit-claim style="margin-left:auto;">Edit</a>
        <a href="#" data-delete-claim style="color:var(--red);">Delete</a>
      </div>
    </div>
  `;
}

function sourceRowHtml(s) {
  const stale = daysSince(s.lastChecked) > RECHECK_WARN_DAYS;
  return `
    <div class="source-record">
      <div class="sr-pub">${escapeHtml(s.publisher || 'Unknown publisher')} — ${escapeHtml(s.title)}</div>
      <div class="sr-url">${s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.url)}</a>` : 'No URL recorded'}</div>
      <div class="subtle" style="margin-top:4px;">
        Last checked: ${escapeHtml(s.lastChecked || '—')} ${stale ? '<span class="pill caution">⚠ Recheck recommended</span>' : ''}
        ${s.supports ? ` · Supports: ${escapeHtml(s.supports)}` : ''}
      </div>
      <button class="small" style="margin-top:8px;" data-recheck-source="${s.id}">Recheck Source</button>
    </div>
  `;
}

function openClaimModal(episodeId, claim, sources, onDone) {
  const isNew = !claim;
  openModal(`
    <h3>${isNew ? 'New Claim' : `Edit ${escapeHtml(claim.code)}`}</h3>
    <label>Claim</label>
    <textarea id="clText" placeholder="Japan targets 60 million international visitors by 2030.">${escapeHtml(claim ? claim.claim : '')}</textarea>
    <label>Status</label>
    <select id="clStatus">${db.FACT_STATUSES.map((s) => `<option ${(claim ? claim.status : 'UNVERIFIED') === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <label>Source</label>
    <select id="clSource">
      <option value="">— none —</option>
      ${sources.map((s) => `<option value="${s.id}" ${claim && claim.sourceId === s.id ? 'selected' : ''}>${escapeHtml(s.publisher)} — ${escapeHtml(s.title)}</option>`).join('')}
    </select>
    <label>Risk</label>
    <select id="clRisk">
      ${['LOW', 'MEDIUM', 'HIGH'].map((r) => `<option ${claim && claim.risk === r ? 'selected' : ''}>${r}</option>`).join('')}
    </select>
    <label><input type="checkbox" id="clAllowed" ${!claim || claim.allowedInScript ? 'checked' : ''} style="width:auto;"> Allowed in final script</label>
    <div class="modal-actions">
      <button id="clCancel">Cancel</button>
      <button id="clSave" class="primary">${isNew ? 'Create Claim' : 'Save'}</button>
    </div>
  `, (root) => {
    root.querySelector('#clCancel').addEventListener('click', closeModal);
    root.querySelector('#clSave').addEventListener('click', async () => {
      const fields = {
        claim: root.querySelector('#clText').value.trim(),
        status: root.querySelector('#clStatus').value,
        sourceId: root.querySelector('#clSource').value || null,
        risk: root.querySelector('#clRisk').value,
        allowedInScript: root.querySelector('#clAllowed').checked,
      };
      if (isNew) {
        await db.createClaim(episodeId, fields);
        toast('Claim logged.');
      } else {
        Object.assign(claim, fields);
        if (db.FACT_STATUS_TIER[claim.status] === 'ok' && !claim.lastVerified) claim.lastVerified = db.todayStr();
        await db.saveClaim(claim);
        toast('Claim updated.');
      }
      closeModal();
      onDone();
    });
  });
}

function openSourceOnlyModal(episodeId, onDone) {
  openModal(`
    <h3>New Source</h3>
    <label>Publisher</label>
    <input type="text" id="srcPub" placeholder="Bain / Net Promoter System">
    <label>Document / page title</label>
    <input type="text" id="srcTitle" placeholder="What NPS Measures">
    <label>Full URL</label>
    <input type="text" id="srcUrl" placeholder="https://…">
    <label>Publication date</label>
    <input type="date" id="srcPubDate">
    <label>Notes</label>
    <textarea id="srcNotes"></textarea>
    <div class="modal-actions">
      <button id="srcCancel">Cancel</button>
      <button id="srcSave" class="primary">Add Source</button>
    </div>
  `, (root) => {
    root.querySelector('#srcCancel').addEventListener('click', closeModal);
    root.querySelector('#srcSave').addEventListener('click', async () => {
      const publisher = root.querySelector('#srcPub').value.trim();
      const title = root.querySelector('#srcTitle').value.trim();
      if (!publisher && !title) { toast('Add a publisher or title.', 'error'); return; }
      await db.createSource(episodeId, {
        publisher, title,
        url: root.querySelector('#srcUrl').value.trim(),
        pubDate: root.querySelector('#srcPubDate').value,
        notes: root.querySelector('#srcNotes').value.trim(),
      });
      closeModal();
      toast('Source added.');
      onDone();
    });
  });
}
