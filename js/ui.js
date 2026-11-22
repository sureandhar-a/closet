// Small shared UI helpers.
export const $ = (sel, el = document) => el.querySelector(sel);

// Escape text for innerHTML templates.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2400);
}

// Bottom sheet. Returns the panel element; closes on backdrop tap.
export function openSheet(html) {
  const s = $('#sheet');
  s.innerHTML = `<div class="panel" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  s.hidden = false;
  s.onclick = (e) => { if (e.target === s) closeSheet(); };
  return s.firstElementChild;
}
export function closeSheet() {
  const s = $('#sheet');
  s.hidden = true;
  s.innerHTML = '';
}

// Local-date helpers (YYYY-MM-DD in the phone's timezone, not UTC).
export function ymd(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}
export function niceDate(dateStr, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', opts);
}

// Object URL cache for image Blobs/dataURLs stored on items.
const urls = new Map();
export function imgSrc(item) {
  if (!item?.image) return '';
  if (typeof item.image === 'string') return item.image;
  if (!urls.has(item.id + item.updated)) urls.set(item.id + item.updated, URL.createObjectURL(item.image));
  return urls.get(item.id + item.updated);
}
