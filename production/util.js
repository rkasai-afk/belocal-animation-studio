// Small shared helpers used across every view module.

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let toastTimer = null;
export function toast(message, kind = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

export function openModal(html, onMount) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-backdrop" id="modalBackdrop"><div class="modal">${html}</div></div>`;
  const backdrop = document.getElementById('modalBackdrop');
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.addEventListener('keydown', escCloseHandler);
  if (onMount) onMount(root);
  return root;
}

function escCloseHandler(e) {
  if (e.key === 'Escape') closeModal();
}

export function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
  document.removeEventListener('keydown', escCloseHandler);
}

export function confirmAction(message, onConfirm, confirmLabel = 'Confirm') {
  openModal(`
    <h3>Are you sure?</h3>
    <p style="font-size:13px;color:var(--text-gray);">${escapeHtml(message)}</p>
    <div class="modal-actions">
      <button id="cfCancel">Cancel</button>
      <button id="cfOk" class="primary danger">${escapeHtml(confirmLabel)}</button>
    </div>
  `, (root) => {
    root.querySelector('#cfCancel').addEventListener('click', closeModal);
    root.querySelector('#cfOk').addEventListener('click', () => {
      closeModal();
      onConfirm();
    });
  });
}

export function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function fmtDate(d) {
  if (!d) return '—';
  return d;
}

export function navigate(hash) {
  window.location.hash = hash;
}

export const VISUAL_TYPE_ORDER = ['OWN', 'SOURCE', 'GRAPHIC', 'FREE', 'STOCK', 'ARCHIVE', 'PHOTO'];
