// Closet tab: category filter, sort, grid with status dots, laundry mode, item sheet.
import { getAll, put } from './db.js';
import { $, esc, imgSrc, openSheet, closeSheet, niceDate, toast } from './ui.js';
import { uploadToDrive } from './drive.js';

const NEXT = { clean: 'worn', worn: 'laundry', laundry: 'clean' };
const CATS = [['all', 'All'], ['top', 'Tops'], ['bottom', 'Bottoms'], ['shoes', 'Shoes'], ['layer', 'Layers'], ['ethnic', 'Ethnic'], ['accessory', 'Accessories']];
const FORMALITY = ['formal', 'smart-casual', 'casual'];
const st = { cat: 'all', sort: 'color', laundry: false, archived: false };

const lum = (hex = '#888888') => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const sorters = {
  color: (a, b) => lum(b.colorHex) - lum(a.colorHex), // light -> dark
  worn: (a, b) => (a.lastWorn || '').localeCompare(b.lastWorn || ''), // longest unworn first
};

export async function render(view) {
  const all = await getAll('items');
  if (!all.length) {
    view.innerHTML = `<div class="empty-state"><p><b>Your closet is empty</b></p><p>Import the bundle from the laptop in Settings.</p><a class="btn primary" href="#settings">Open Settings</a></div>`;
    return;
  }
  const live = all.filter((i) => !i.archived);
  const items = (st.archived ? all.filter((i) => i.archived) : live)
    .filter((i) => st.cat === 'all' || i.category === st.cat)
    .sort(sorters[st.sort]);
  const n = (s) => live.filter((i) => i.status === s).length;

  view.innerHTML = `
    <div class="head"><h1>Closet</h1>
      <button class="chip" id="lm" aria-pressed="${st.laundry}">Laundry mode</button></div>
    <div class="counts legend"><span class="c">${n('clean')} clean</span><span class="w">${n('worn')} worn</span><span class="l">${n('laundry')} laundry</span></div>
    <div class="chips">${CATS.filter(([k]) => k === 'all' || all.some((i) => i.category === k))
      .map(([k, l]) => `<button class="chip" data-cat="${k}" aria-pressed="${st.cat === k}">${l}</button>`).join('')}</div>
    <div class="chips">
      <button class="chip" data-sort="color" aria-pressed="${st.sort === 'color'}">Light → dark</button>
      <button class="chip" data-sort="worn" aria-pressed="${st.sort === 'worn'}">Longest unworn</button>
      <button class="chip" id="arch" aria-pressed="${st.archived}">Archived</button></div>
    <div class="grid" style="margin-top:8px">${items.map((i) => `
      <button class="tile" data-id="${i.id}" aria-label="${esc(i.color)} ${esc(i.type)}, ${i.status}">
        <img src="${imgSrc(i)}" alt="" loading="lazy"><i class="dot ${i.status}"></i></button>`).join('')
      || '<p class="muted">Nothing here.</p>'}</div>`;

  const redo = () => render(view);
  view.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { st.cat = b.dataset.cat; redo(); }));
  view.querySelectorAll('[data-sort]').forEach((b) => (b.onclick = () => { st.sort = b.dataset.sort; redo(); }));
  $('#lm').onclick = () => { st.laundry = !st.laundry; redo(); };
  $('#arch').onclick = () => { st.archived = !st.archived; redo(); };
  view.querySelectorAll('.tile').forEach((t) => (t.onclick = async () => {
    const item = all.find((i) => i.id === t.dataset.id);
    if (st.laundry) { // quick cycle; update the tile in place so scroll position holds
      item.status = NEXT[item.status];
      await put('items', item);
      t.querySelector('.dot').className = `dot ${item.status}`;
    } else sheet(item, redo);
  }));
}

function sheet(item, done) {
  const opt = (arr, cur) => arr.map((v) => `<option ${v === cur ? 'selected' : ''}>${v}</option>`).join('');
  const p = openSheet(`
    <div class="hero-img"><img src="${imgSrc(item)}" alt=""></div>
    <div class="kv"><div><b>${item.wearCount}</b><span>wears</span></div>
      <div><b>${item.lastWorn ? niceDate(item.lastWorn) : '—'}</b><span>last worn</span></div>
      <div><b>${esc(item.category)}</b><span>type</span></div></div>
    <div class="field"><span class="lbl">Beautify (studio photo, made on the laptop)</span>
      <button class="chip" id="f-beau" aria-pressed="${item.beautify === 'requested'}">${
        item.beautify === 'requested' ? '✨ Requested · tap to cancel' : item.beautify === 'done' ? '✨ Beautified · tap to redo' : '✨ Beautify this item'}</button>
      ${item.beautify === 'requested' ? '<p class="muted" style="margin-top:6px">Runs at the next laptop sync (Settings → Export log, then /closet-sync).</p>' : ''}</div>
    <div class="field"><span class="lbl">Status</span><div class="chips">${['clean', 'worn', 'laundry']
      .map((s) => `<button class="chip" data-s="${s}" aria-pressed="${item.status === s}">${s}</button>`).join('')}</div></div>
    <div class="field"><label>Colour name</label><input class="input" id="f-color" value="${esc(item.color)}"></div>
    <div class="field"><label>Formality</label><select class="input" id="f-form">${opt(FORMALITY, item.formality)}</select></div>
    ${item.pendingUpload ? '<button class="btn block" id="f-up" style="margin-bottom:10px">☁️ Upload photo to Drive</button>' : ''}
    <div class="row"><button class="btn" id="f-arch">${item.archived ? 'Restore' : 'Archive'}</button>
      <button class="btn primary" id="f-save">Save</button></div>`);
  let status = item.status;
  p.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => {
    status = b.dataset.s;
    p.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  const save = async (extra = {}) => {
    Object.assign(item, { status, color: $('#f-color', p).value.trim() || item.color, formality: $('#f-form', p).value, updated: Date.now(), ...extra });
    await put('items', item);
    closeSheet(); done();
  };
  $('#f-save', p).onclick = () => save();
  $('#f-arch', p).onclick = () => save({ archived: !item.archived });
  const up = $('#f-up', p);
  if (up) up.onclick = async () => {
    const r = await uploadToDrive(item.pendingUpload, item.id, item.beautify === 'requested');
    if (r === 'shared') { delete item.pendingUpload; item.driveUploaded = true; await put('items', item); toast('Sent to Drive'); closeSheet(); done(); }
    else toast(r === 'cancelled' ? 'Upload cancelled' : 'Sharing needs the installed (HTTPS) app');
  };
  $('#f-beau', p).onclick = () => (item.beautify === 'requested'
    ? save({ beautify: item.prevBeautify || 'none' })
    : save({ beautify: 'requested', prevBeautify: item.beautify || 'none', requestedAt: Date.now() }));
}
