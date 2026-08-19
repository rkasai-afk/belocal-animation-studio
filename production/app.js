import * as db from './db.js';
import { renderEpisodes } from './view_episodes.js';
import { renderDashboard } from './view_dashboard.js';
import { renderEdit } from './view_edit.js';
import { renderAssets } from './view_assets.js';
import { renderFactCheck } from './view_factcheck.js';
import { escapeHtml, navigate, debounce } from './util.js';

const main = document.getElementById('main');
let lastEpisodeId = null;

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || 'episodes';
  const [path, queryStr] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const view = parts[0] || 'episodes';
  const query = Object.fromEntries(new URLSearchParams(queryStr || ''));
  return { view, a: parts[1], b: parts[2], query };
}

function setActiveNav(view) {
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.nav === view));
}

async function route() {
  const { view, a, b, query } = parseHash();
  setActiveNav(view === 'dashboard' ? 'episodes' : view);

  if (view === 'episodes') {
    await renderEpisodes(main);
  } else if (view === 'dashboard') {
    lastEpisodeId = a;
    await renderDashboard(main, a);
  } else if (view === 'edit') {
    lastEpisodeId = a || lastEpisodeId;
    await renderEdit(main, a || null, { beatId: b, focus: query.focus, action: query.action });
  } else if (view === 'assets') {
    lastEpisodeId = a || lastEpisodeId;
    await renderAssets(main, a || null);
  } else if (view === 'factcheck') {
    lastEpisodeId = a || lastEpisodeId;
    await renderFactCheck(main, a || null);
  } else {
    await renderEpisodes(main);
  }
}

window.addEventListener('hashchange', route);

document.getElementById('mainNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  const nav = btn.dataset.nav;
  if (nav === 'episodes') navigate('#episodes');
  else if (nav === 'edit') navigate(lastEpisodeId ? `#edit/${lastEpisodeId}` : '#edit');
  else if (nav === 'assets') navigate(lastEpisodeId ? `#assets/${lastEpisodeId}` : '#assets');
  else if (nav === 'factcheck') navigate(lastEpisodeId ? `#factcheck/${lastEpisodeId}` : '#factcheck');
});

// --- Global search -----------------------------------------------------

const searchInput = document.getElementById('globalSearch');
const searchResults = document.getElementById('searchResults');

async function runSearch(q) {
  if (!q || q.trim().length < 2) { searchResults.classList.remove('open'); return; }
  const needle = q.trim().toLowerCase();
  const [episodes, allAssets] = await Promise.all([db.listEpisodes(), db.listAssets({})]);

  const epMatches = episodes.filter((e) => `${e.number} ${e.title} ${e.description}`.toLowerCase().includes(needle)).slice(0, 5);

  const beatMatches = [];
  for (const ep of episodes) {
    // eslint-disable-next-line no-await-in-loop
    const beats = await db.listBeats(ep.id);
    beats.forEach((b) => {
      if (`${b.title} ${b.narration} ${b.visualInstruction}`.toLowerCase().includes(needle)) {
        beatMatches.push({ ep, beat: b });
      }
    });
  }

  const assetMatches = allAssets.filter((a) => `${a.filename} ${a.location} ${(a.tags || []).join(' ')}`.toLowerCase().includes(needle)).slice(0, 6);

  const sourceMatches = [];
  for (const ep of episodes) {
    // eslint-disable-next-line no-await-in-loop
    const sources = await db.listSources(ep.id);
    sources.forEach((s) => {
      if (`${s.publisher} ${s.title} ${s.url}`.toLowerCase().includes(needle)) sourceMatches.push({ ep, source: s });
    });
  }

  const groups = [];
  if (epMatches.length) groups.push({ label: 'Episodes', items: epMatches.map((e) => ({ text: `EP${e.number || '—'} ${e.title}`, sub: '', go: `#dashboard/${e.id}` })) });
  if (beatMatches.length) groups.push({ label: 'Story Beats', items: beatMatches.slice(0, 8).map(({ ep, beat }) => ({ text: beat.title, sub: `EP${ep.number || '—'} ${ep.title}`, go: `#edit/${ep.id}/${beat.id}` })) });
  if (assetMatches.length) groups.push({ label: 'Assets', items: assetMatches.map((a) => ({ text: a.filename, sub: a.type, go: `#assets/${a.episodeId || ''}` })) });
  if (sourceMatches.length) groups.push({ label: 'Sources', items: sourceMatches.slice(0, 8).map(({ ep, source }) => ({ text: source.title || source.publisher, sub: `EP${ep.number || '—'} ${ep.title}`, go: `#factcheck/${ep.id}` })) });

  if (!groups.length) {
    searchResults.innerHTML = `<div class="sr-empty">No matches for "${escapeHtml(q)}".</div>`;
  } else {
    searchResults.innerHTML = groups.map((g) => `
      <div class="sr-group-label">${g.label}</div>
      ${g.items.map((it) => `<div class="sr-item" data-go="${it.go}"><span>${escapeHtml(it.text)}</span><span class="sr-sub">${escapeHtml(it.sub)}</span></div>`).join('')}
    `).join('');
    searchResults.querySelectorAll('.sr-item').forEach((el) => {
      el.addEventListener('click', () => {
        navigate(el.dataset.go);
        searchResults.classList.remove('open');
        searchInput.value = '';
      });
    });
  }
  searchResults.classList.add('open');
}

const debouncedSearch = debounce((q) => runSearch(q), 200);
searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));
searchInput.addEventListener('focus', (e) => { if (e.target.value.trim().length >= 2) searchResults.classList.add('open'); });
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) searchResults.classList.remove('open');
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

route();
