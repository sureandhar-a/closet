// Add items, Acloset-style: Camera (several in a row) or Gallery (multi-select) -> review queue -> save all.
// Phone does resize/trim/colour; the laptop does background removal, tags and Beautify (via Drive).
import { put } from './db.js';
import { prepareImage, colorName } from './image.js';
import { $, esc, toast } from './ui.js';
import { uploadBatchToDrive } from './drive.js';

const CATS = ['top', 'bottom', 'shoes', 'layer', 'ethnic', 'accessory'];
const FORM = ['formal', 'smart-casual', 'casual'];
const PAT = ['solid', 'check', 'stripe', 'print'];
const SLEEVED = ['top', 'layer', 'ethnic'];
const TYPE = { top: 'shirt', bottom: 'trousers', shoes: 'shoes', layer: 'jacket', ethnic: 'kurta', accessory: 'accessory' };

const q = []; // queue survives tab switches until saved: {file, img, f:{...}}
let cur = 0;
const opts = { beautify: true, drive: true };

export function render(view) {
  if (!q.length) return start(view);
  review(view);
}

function start(view) {
  view.innerHTML = `<h1>Add items</h1>
    <p class="muted">Photograph clothes flat or on a hanger, front view, plain background.</p>
    <div class="add-opts">
      <label class="add-opt"><span class="ico">📷</span><b>Camera</b><span class="muted">Snap several in a row</span>
        <input type="file" accept="image/*" capture="environment" hidden></label>
      <label class="add-opt"><span class="ico">🖼️</span><b>Gallery</b><span class="muted">Pick many at once</span>
        <input type="file" accept="image/*" multiple hidden></label>
    </div>
    <div class="card soft" style="margin-top:16px"><p class="muted">✨ <b>Beautify</b> turns each photo into a clean studio-style product image. ☁️ <b>Drive</b> sends the photo to your <b>Closet</b> folder. The laptop does the rest at the next sync.</p></div>`;
  view.querySelectorAll('input[type=file]').forEach((inp) => (inp.onchange = (e) => addFiles(view, e.target.files)));
}

async function addFiles(view, files) {
  if (!files?.length) return;
  const before = q.length;
  for (const file of files) {
    try {
      const img = await prepareImage(file);
      q.push({ file, img, f: { category: 'top', formality: 'smart-casual', pattern: 'solid', sleeves: 'full', color: colorName(img.hex), hex: img.hex } });
    } catch { toast(`Could not read ${file.name}`); }
  }
  if (!q.length) return start(view);
  cur = Math.min(before, q.length - 1);
  review(view);
}

function review(view) {
  const it = q[cur];
  const f = it.f;
  const chips = (key, arr) => `<div class="chips" data-k="${key}">${arr.map((v) => `<button class="chip" data-v="${v}" aria-pressed="${f[key] === v}">${v}</button>`).join('')}</div>`;
  const tog = (k, label) => `<button class="chip" data-o="${k}" aria-pressed="${opts[k]}">${label}</button>`;
  view.innerHTML = `<div class="head"><h1>Add ${q.length} item${q.length > 1 ? 's' : ''}</h1>
      <button class="icon-btn" id="discard" aria-label="Discard all"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="strip">${q.map((x, i) => `<button class="strip-t${i === cur ? ' on' : ''}${x.f.color ? ' ok' : ''}" data-i="${i}" aria-label="Item ${i + 1}"><img src="${x.img.dataUrl}" alt=""></button>`).join('')}
      <label class="strip-t more" aria-label="Take another photo">📷<input type="file" accept="image/*" capture="environment" hidden></label>
      <label class="strip-t more" aria-label="Pick more from gallery">＋<input type="file" accept="image/*" multiple hidden></label></div>
    <div class="hero-img" style="height:240px;margin-top:8px"><img src="${it.img.dataUrl}" alt=""></div>
    ${it.img.transparent ? '' : '<p class="muted" style="margin-top:6px">Background will be removed on the laptop.</p>'}
    <div class="field"><label for="color">Colour name</label><div class="row"><input class="input" id="color" placeholder="e.g. navy blue" value="${esc(f.color)}">
      <input type="color" id="hex" value="${f.hex}" aria-label="Colour" style="flex:none;width:56px;height:44px;border:0;background:none"></div></div>
    <div class="field"><span class="lbl">Category</span>${chips('category', CATS)}</div>
    <div class="field"><span class="lbl">Formality</span>${chips('formality', FORM)}</div>
    <div class="field"><span class="lbl">Pattern</span>${chips('pattern', PAT)}</div>
    <div class="field" ${SLEEVED.includes(f.category) ? '' : 'hidden'} id="sl"><span class="lbl">Sleeves</span>${chips('sleeves', ['full', 'half'])}</div>
    <div class="field"><span class="lbl">For all items</span><div class="chips">${tog('beautify', '✨ Beautify on laptop')}${tog('drive', '☁️ Upload to Drive')}</div>
      ${opts.drive ? '<p class="muted" style="margin-top:6px">Photos go straight to Drive → <b>Closet</b>.</p>' : ''}</div>
    <div class="row">${cur < q.length - 1 ? '<button class="btn" id="next">Next</button>' : ''}
      <button class="btn primary" id="save">Add ${q.length} to closet</button></div>`;

  const keep = () => { f.color = $('#color', view).value.trim(); f.hex = $('#hex', view).value; };
  view.querySelectorAll('.chips[data-k]').forEach((box) => box.querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
    f[box.dataset.k] = b.dataset.v;
    box.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', x === b));
    $('#sl', view).hidden = !SLEEVED.includes(f.category);
  })));
  view.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => { keep(); opts[b.dataset.o] = !opts[b.dataset.o]; review(view); }));
  view.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { keep(); cur = +b.dataset.i; review(view); }));
  view.querySelectorAll('.strip-t.more input').forEach((inp) => (inp.onchange = (e) => { keep(); addFiles(view, e.target.files); }));
  $('#discard', view).onclick = () => { if (confirm('Discard these photos?')) { q.length = 0; start(view); } };
  const next = $('#next', view);
  if (next) next.onclick = () => { keep(); cur++; review(view); };
  $('#save', view).onclick = () => { keep(); saveAll(view); };
}

async function saveAll(view) {
  const missing = q.findIndex((x) => !x.f.color);
  if (missing >= 0) { cur = missing; review(view); return toast('Give every item a colour name'); }
  const base = Date.now();
  const ids = q.map((_, i) => `p-${base + i}`);
  // Share first: Safari allows the share sheet only straight after the tap.
  const up = opts.drive ? await uploadBatchToDrive(q.map((x) => x.file), ids, opts.beautify) : 'skipped';
  for (const [i, { file, img, f }] of q.entries()) {
    const item = { id: ids[i], type: TYPE[f.category], color: f.color, colorHex: f.hex, category: f.category, formality: f.formality,
      pattern: f.pattern, photo: 'added', image: img.dataUrl, status: 'clean', wearCount: 0, lastWorn: null, neverWith: [],
      archived: false, updated: Date.now(), beautify: opts.beautify ? 'requested' : 'none',
      driveUploaded: up === 'shared', pendingUpload: up === 'shared' || up === 'skipped' ? undefined : file };
    if (opts.beautify) item.requestedAt = Date.now();
    if (SLEEVED.includes(f.category)) item.sleeves = f.sleeves;
    await put('items', item);
  }
  const n = q.length;
  q.length = 0;
  toast(up === 'shared' ? `Added ${n} · sent to Drive` : up === 'skipped' ? `Added ${n}` : `Added ${n} · Drive upload pending (open the item → Upload)`);
  location.hash = '#closet';
}
