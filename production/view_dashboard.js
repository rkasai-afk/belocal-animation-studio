import * as db from './db.js';
import { computeNextActions } from './progress.js';
import { escapeHtml, navigate, toast, debounce } from './util.js';
import { openSubtitlesForEpisode } from './integration.js';

function tierClass(pct) {
  if (pct === null) return '';
  if (pct >= 95) return 'ok';
  if (pct >= 60) return 'caution';
  return 'bad';
}

const ROW_LABEL = { script: 'Script', visuals: 'Visuals', sources: 'Sources', graphics: 'Graphics', factCheck: 'Fact Check' };

export async function renderDashboard(main, episodeId) {
  const ep = await db.getEpisode(episodeId);
  if (!ep) {
    main.innerHTML = `<div class="empty-state"><h3>Episode not found</h3><p>It may have been archived.</p><div class="actions"><button class="primary" onclick="location.hash='#episodes'">Back to Episodes</button></div></div>`;
    return;
  }

  const { actions, progress } = await computeNextActions(episodeId);
  const assets = await db.listAssets({ episodeId });
  const voiceover = assets.find((a) => a.type === 'Voiceover');
  const subtitle = assets.find((a) => a.type === 'Subtitle');

  main.innerHTML = `
    <div class="dash-head">
      <div class="dh-top">
        <div>
          <h2>EP${escapeHtml(ep.number || '—')} — ${escapeHtml(ep.title)}</h2>
          <div class="dh-sub">${escapeHtml(ep.runtimeTarget ? `Target runtime: ${ep.runtimeTarget}` : 'No runtime target set')}</div>
        </div>
        <div class="ready-banner ${progress.readyForResolve ? 'ready' : 'progress'}">
          ${progress.readyForResolve ? 'READY FOR RESOLVE' : 'IN PRODUCTION'}
        </div>
      </div>
      <div class="overall-row">
        <div class="bar"><div style="width:${progress.overallPct}%"></div></div>
        <div class="pct">${progress.overallPct}%</div>
      </div>
      <div class="progress-rows">
        ${Object.entries(progress.rows).map(([key, r]) => `
          <div class="prow ${tierClass(r.pct)}">
            <div class="prow-label">${ROW_LABEL[key]}</div>
            <div class="prow-val">${r.pct === null ? '—' : r.pct + '%'}</div>
            <div class="prow-frac">${r.total ? `${r.done} / ${r.total}` : 'none yet'}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="next-actions">
      <h3>Next Things To Do</h3>
      <span class="subtle">Derived automatically from what's missing — nothing to maintain by hand.</span>
      <div class="na-list" id="naList">
        ${actions.length === 0
          ? `<div class="na-done">Nothing outstanding — this episode is fully prepared.</div>`
          : actions.map((a, i) => `
            <div class="na-item" data-idx="${i}">
              <span class="na-num">${i + 1}</span>
              <span class="na-label">${escapeHtml(a.label)}</span>
              <span class="na-go">OPEN →</span>
            </div>
          `).join('')}
      </div>
    </div>

    <div class="next-actions" id="voiceoverCard">
      <h3>Voiceover &amp; Subtitles</h3>
      <p class="subtle" style="margin-bottom:12px;">Upload the finished voiceover, then generate subtitles from it directly.</p>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <span class="pill ${voiceover ? 'ok' : ''}">${voiceover ? '✓ Voiceover uploaded' : 'No voiceover yet'}</span>
        <button class="small" id="btnUploadVoiceover">${voiceover ? 'Replace voiceover' : 'Upload voiceover'}</button>
        <input type="file" id="voiceoverFile" accept="audio/*,video/*" style="display:none;">
        <span class="pill ${subtitle ? 'ok' : ''}">${subtitle ? '✓ Subtitles ready' : 'No subtitles yet'}</span>
        <button class="small primary" id="btnCreateSubtitles" ${voiceover ? '' : 'disabled'}>Create Subtitles</button>
      </div>
    </div>

    <div class="next-actions">
      <h3>Jump To</h3>
      <div class="quick-links">
        <button id="qlEdit">Open Edit Blueprint</button>
        <button id="qlAssets">Open Assets</button>
        <button id="qlFact">Open Fact Check</button>
        <button id="qlDetails">Episode Details &amp; Script</button>
      </div>
    </div>

    <div class="next-actions" id="detailsPanel" style="display:none;">
      <h3>Episode Details</h3>
      <span class="save-state" id="detailsSaveState"></span>
      <div style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
        <div><label class="field-label">Description</label><textarea id="fDesc" style="width:100%;">${escapeHtml(ep.description)}</textarea></div>
        <div><label class="field-label">Runtime target</label><input type="text" id="fRuntime" value="${escapeHtml(ep.runtimeTarget)}"></div>
        <div><label class="field-label">Long-form script</label><textarea id="fLong" style="width:100%;min-height:140px;">${escapeHtml(ep.longScript)}</textarea></div>
        <div><label class="field-label">Short-form script</label><textarea id="fShort" style="width:100%;min-height:80px;">${escapeHtml(ep.shortScript)}</textarea></div>
        <div><label class="field-label">Master caption</label><textarea id="fCaption" style="width:100%;">${escapeHtml(ep.masterCaption)}</textarea></div>
      </div>
    </div>
  `;

  main.querySelectorAll('#naList .na-item').forEach((el) => {
    el.addEventListener('click', () => {
      const a = actions[Number(el.dataset.idx)];
      handleAction(a, ep);
    });
  });

  document.getElementById('qlEdit').addEventListener('click', () => navigate(`#edit/${episodeId}`));
  document.getElementById('qlAssets').addEventListener('click', () => navigate(`#assets/${episodeId}`));
  document.getElementById('qlFact').addEventListener('click', () => navigate(`#factcheck/${episodeId}`));
  document.getElementById('qlDetails').addEventListener('click', () => {
    const p = document.getElementById('detailsPanel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
    if (p.style.display === 'block') p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const voFileInput = document.getElementById('voiceoverFile');
  document.getElementById('btnUploadVoiceover').addEventListener('click', () => voFileInput.click());
  voFileInput.addEventListener('change', async () => {
    const file = voFileInput.files[0];
    if (!file) return;
    await db.createAsset({ filename: file.name, type: 'Voiceover', episodeId }, file, null);
    toast('Voiceover uploaded.');
    renderDashboard(main, episodeId);
  });

  document.getElementById('btnCreateSubtitles').addEventListener('click', async () => {
    if (!voiceover) return;
    const rec = await db.getAssetBlobRecord(voiceover.id);
    if (!rec || !rec.file) { toast('Could not read the uploaded voiceover file.', 'error'); return; }
    openSubtitlesForEpisode(episodeId, ep.title, rec.file, voiceover.filename, () => {
      renderDashboard(main, episodeId);
    });
    toast('Opening Auto Subtitles with your voiceover…');
  });

  setupDetailsAutosave(ep);
}

function handleAction(a, ep) {
  if (a.view === 'edit') navigate(`#edit/${a.episodeId}${a.beatId ? '/' + a.beatId : ''}`);
  else if (a.view === 'assets') navigate(`#assets/${a.episodeId}`);
  else if (a.view === 'factcheck') navigate(`#factcheck/${a.episodeId}`);
  else if (a.view === 'dashboard' && a.action === 'voiceover') document.getElementById('voiceoverFile').click();
  else if (a.view === 'dashboard' && a.action === 'subtitles') document.getElementById('btnCreateSubtitles').click();
}

function setupDetailsAutosave(ep) {
  const stateEl = document.getElementById('detailsSaveState');
  const fields = ['fDesc', 'fRuntime', 'fLong', 'fShort', 'fCaption'];
  const keyMap = { fDesc: 'description', fRuntime: 'runtimeTarget', fLong: 'longScript', fShort: 'shortScript', fCaption: 'masterCaption' };
  const save = debounce(async () => {
    stateEl.textContent = 'SAVING…';
    stateEl.className = 'save-state saving';
    try {
      fields.forEach((id) => { ep[keyMap[id]] = document.getElementById(id).value; });
      await db.saveEpisode(ep);
      stateEl.textContent = 'SAVED';
      stateEl.className = 'save-state saved';
    } catch (err) {
      stateEl.textContent = 'ERROR — changes not saved';
      stateEl.className = 'save-state error';
    }
  }, 600);
  fields.forEach((id) => document.getElementById(id).addEventListener('input', save));
}
