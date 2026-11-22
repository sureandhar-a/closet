// Closet tab: search, category/status filters, sort, grid with status dots + badges, laundry mode, item sheet.
import { getAll, put, del, getKV, setKV } from './db.js';
import { $, esc, imgSrc, openSheet, closeSheet, niceDate, toast } from './ui.js';
import { uploadToDrive } from './drive.js';
import { setStatus } from './wear.js';
import { lum } from './picker.js';

const NEXT = { clean: 'worn', worn: 'laundry', laundry: 'clean' };
const CATS = [['all', 'All'], ['top', 'Tops'], ['bottom', 'Bottoms'], ['shoes', 'Shoes'], ['layer', 'Layers'], ['ethnic', 'Ethnic'], ['accessory', 'Accessories']];
const FORMALITY = ['formal', 'smart-casual', 'casual'];
const st = { cat: 'all', status: 'all', sort: 'color', laundry: false, archived: false, q: '' };

const sorters = {
  color: (a, b) => lum(b.colorHex) - lum(a.colorHex), // light -> dark
  worn: (a, b) => (a.lastWorn || '').localeCompare(b.lastWorn || ''), // longest unworn first
};
const badge = (i) => (i.pendingUpload ? '☁️' : i.beautify === 'requested' ? '✨' : i.needsPhoto || i.tagSource === 'auto' ? 'New' : '');

export async function render(view) {
  const all = await getAll('items');
  if (!all.length) {
    view.innerHTML = `<div class="empty-state"><p><b>Your closet is empty</b></p><p>Connect Drive in Settings and tap Sync, or add clothes with ＋.</p><a class="btn primary" href="#settings">Open Settings</a></div>`;
    return;
  }
  const live = all.filter((i) => !i.archived);
  const q = st.q.toLowerCase();
  const items = (st.archived ? all.filter((i) => i.archived) : live)
    .filter((i) => st.cat === 'all' || i.category === st.cat)
    .filter((i) => st.status === 'all' || i.status === st.status)
    .filter((i) => !q || `${i.color} ${i.type} ${i.category} ${i.formality} ${i.pattern}`.toLowerCase().includes(q))
    .sort(sorters[st.sort]);
  const n = (s) => live.filter((i) => i.status === s).length;

  view.innerHTML = `
    <div class="head"><h1>Closet</h1>
      <button class="chip" id="lm" aria-pressed="${st.laundry}">Laundry mode</button></div>
    ${st.laundry ? `<p class="note">Tap a photo to move it clean → worn → laundry → clean.</p>
      <div class="row" style="margin-bottom:8px"><button class="btn" id="wash">🧺 Laundry done: all clean</button><button class="btn" id="tolaundry">All worn → laundry</button></div>` : ''}
    <div class="counts legend">${['clean', 'worn', 'laundry'].map((s) => `<button class="${s[0]}" data-status="${s}" aria-pressed="${st.status === s}">${n(s)} ${s}</button>`).join('')}</div>
    <input class="input" id="q" type="search" placeholder="Search: navy, shirt, formal…" value="${esc(st.q)}" style="margin:8px 0">
    <div class="chips">${CATS.filter(([k]) => k === 'all' || all.some((i) => i.category === k))
      .map(([k, l]) => `<button class="chip" data-cat="${k}" aria-pressed="${st.cat === k}">${l}</button>`).join('')}</div>
    <div class="chips">
      <button class="chip" data-sort="color" aria-pressed="${st.sort === 'color'}">Light → dark</button>
      <button class="chip" data-sort="worn" aria-pressed="${st.sort === 'worn'}">Longest unworn</button>
      <button class="chip" id="arch" aria-pressed="${st.archived}">Archived</button></div>
    <div class="grid" style="margin-top:8px">${items.map((i) => `
      <button class="tile" data-id="${i.id}" aria-label="${esc(i.color)} ${esc(i.type)}, ${i.status}">
        <img src="${imgSrc(i)}" alt="" loading="lazy"><i class="dot ${i.status}"></i>${badge(i) ? `<b class="tb">${badge(i)}</b>` : ''}</button>`).join('')
      || '<p class="muted">Nothing here.</p>'}</div>`;

  const redo = () => render(view);
  view.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { st.cat = b.dataset.cat; redo(); }));
  view.querySelectorAll('[data-sort]').forEach((b) => (b.onclick = () => { st.sort = b.dataset.sort; redo(); }));
  view.querySelectorAll('[data-status]').forEach((b) => (b.onclick = () => { st.status = st.status === b.dataset.status ? 'all' : b.dataset.status; redo(); }));
  const qi = $('#q', view);
  qi.oninput = () => { st.q = qi.value; clearTimeout(qi.t); qi.t = setTimeout(() => { redo().then(() => { const x = $('#q', view); x.focus(); x.setSelectionRange(99, 99); }); }, 250); };
  $('#lm').onclick = () => { st.laundry = !st.laundry; redo(); };
  $('#arch').onclick = () => { st.archived = !st.archived; redo(); };
  const bulk = async (from, to, msg) => { const l = live.filter((i) => from.includes(i.status)); for (const i of l) await setStatus(i, to); toast(`${l.length} ${msg}`); redo(); };
  $('#wash', view)?.addEventListener('click', () => bulk(['laundry', 'worn'], 'clean', 'items clean'));
  $('#tolaundry', view)?.addEventListener('click', () => bulk(['worn'], 'laundry', 'items in laundry'));
  view.querySelectorAll('.tile').forEach((t) => (t.onclick = async () => {
    const item = all.find((i) => i.id === t.dataset.id);
    if (st.laundry) { // quick cycle; update the tile in place so scroll position holds
      item.status = NEXT[item.status];
      if (item.status === 'clean') item.uses = 0;
      await setStatus(item, item.status);
      t.querySelector('.dot').className = `dot ${item.status}`;
      view.querySelectorAll('[data-status]').forEach((b) => (b.textContent = `${n(b.dataset.status)} ${b.dataset.status}`));
    } else sheet(item, redo);
  }));
}

function sheet(item, done) {
  const opt = (arr, cur) => [...new Set([...arr, cur].filter(Boolean))].map((v) => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const cpw = item.price && item.wearCount ? `₹${Math.round(item.price / item.wearCount)}` : '—';
  const p = openSheet(`
    <div class="hero-img"><img src="${imgSrc(item)}" alt=""></div>
    <div class="kv"><div><b>${item.wearCount}</b><span>wears</span></div>
      <div><b>${item.lastWorn ? niceDate(item.lastWorn) : '—'}</b><span>last worn</span></div>
      <div><b>${cpw}</b><span>per wear</span></div></div>
    <div class="field"><span class="lbl">Beautify (studio photo, made on the laptop)</span>
      <button class="chip" id="f-beau" aria-pressed="${item.beautify === 'requested'}">${
        item.beautify === 'requested' ? '✨ Requested · tap to cancel' : item.beautify === 'done' ? '✨ Beautified · tap to redo' : '✨ Beautify this item'}</button>
      ${item.beautify === 'requested' ? '<p class="muted" style="margin-top:6px">Runs at the next laptop sync (Settings → Sync, then /closet-sync on the laptop).</p>' : ''}</div>
    <div class="field"><span class="lbl">Status</span><div class="chips">${['clean', 'worn', 'laundry']
      .map((s) => `<button class="chip" data-s="${s}" aria-pressed="${item.status === s}">${s}</button>`).join('')}</div></div>
    <div class="field"><label for="f-color">Colour name</label><input class="input" id="f-color" value="${esc(item.color)}"></div>
    <div class="field"><label for="f-cat">Category</label><select class="input" id="f-cat">${opt(CATS.slice(1).map(([k]) => k), item.category)}</select></div>
    <div class="field"><label for="f-type">Type</label><input class="input" id="f-type" value="${esc(item.type || '')}" placeholder="e.g. shirt, loafers, watch"></div>
    <div class="field"><label for="f-form">Formality</label><select class="input" id="f-form">${opt(FORMALITY, item.formality)}</select></div>
    <div class="field"><label for="f-pat">Pattern</label><select class="input" id="f-pat">${opt(['solid', 'check', 'stripe', 'print'], item.pattern)}</select></div>
    <div class="field"><label for="f-price">Price (₹, optional: shows cost per wear)</label><input class="input" id="f-price" type="number" inputmode="numeric" min="0" value="${item.price ?? ''}"></div>
    ${item.pendingUpload ? '<button class="btn block" id="f-up" style="margin-bottom:10px">☁️ Upload photo to Drive</button>' : ''}
    <div class="row"><button class="btn" id="f-arch">${item.archived ? 'Restore' : 'Archive'}</button>
      <button class="btn primary" id="f-save">Save</button></div>
    <button class="btn block danger" id="f-del" style="margin-top:10px">Delete for good</button>`);
  let status = item.status;
  p.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => {
    status = b.dataset.s;
    p.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  const save = async (extra = {}) => {
    const tags = { color: $('#f-color', p).value.trim() || item.color, category: $('#f-cat', p).value, type: $('#f-type', p).value.trim() || item.type,
      formality: $('#f-form', p).value, pattern: $('#f-pat', p).value };
    // Your edits win over the laptop's tags until the laptop has seen them (sent with the next sync).
    if (Object.entries(tags).some(([k, v]) => item[k] !== v)) Object.assign(item, tags, { tagSource: 'user', editedAt: Date.now() });
    const price = $('#f-price', p).value;
    Object.assign(item, { price: price === '' ? undefined : +price, ...(status === 'clean' && item.status !== 'clean' ? { uses: 0 } : {}), status, updated: Date.now(), ...extra });
    await put('items', item);
    closeSheet(); done();
  };
  $('#f-save', p).onclick = () => save();
  $('#f-arch', p).onclick = () => save({ archived: !item.archived });
  $('#f-del', p).onclick = async () => {
    if (!confirm(`Delete ${item.color} ${item.type} and its wear history? Archive keeps it instead.`)) return;
    await del('items', item.id);
    await setKV('deleted', [...new Set([...(await getKV('deleted', [])), item.id])]); // tells the laptop at the next sync
    closeSheet(); toast('Deleted'); done();
  };
  const up = $('#f-up', p);
  if (up) up.onclick = async () => {
    const r = await uploadToDrive(item.pendingUpload, item.id, item.beautify === 'requested');
    if (r.status === 'shared') { delete item.pendingUpload; item.driveUploaded = true; await put('items', item); toast('Sent to Drive'); closeSheet(); done(); }
    else toast(r.status === 'cancelled' ? 'Upload cancelled' : 'Upload failed: check Drive in Settings, or use the installed (HTTPS) app');
  };
  $('#f-beau', p).onclick = () => (item.beautify === 'requested'
    ? save({ beautify: item.prevBeautify || 'none', cancelledAt: Date.now() })
    : save({ beautify: 'requested', prevBeautify: item.beautify || 'none', requestedAt: Date.now(), cancelledAt: undefined }));
}
