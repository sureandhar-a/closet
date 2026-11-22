// Add items: Camera (one photo per tap) or Gallery (multi-select) -> review queue -> save all.
// Phone does resize/trim/colour; the laptop does background removal, tags and Beautify (via Drive).
// The queue is kept in IndexedDB, so photos survive the app being closed before you tap Add.
import { put, getAll, getKV, setKV, getSettings, saveSettings } from './db.js';
import { prepareImage, colorName } from './image.js';
import { $, esc, toast } from './ui.js';
import { uploadBatchToDrive } from './drive.js';
import { guessTags } from './recognize.js';

const CATS = ['top', 'bottom', 'shoes', 'belt', 'layer', 'ethnic', 'accessory'];
const FORM = ['formal', 'smart-casual', 'casual'];
const PAT = ['solid', 'check', 'stripe', 'print'];
const SLEEVED = ['top', 'layer', 'ethnic'];
const TYPE = { top: 'shirt', bottom: 'trousers', shoes: 'shoes', layer: 'jacket', ethnic: 'kurta', belt: 'leather belt', accessory: 'watch' };

let q = null; // [{file, img, f, beautify, seen, guess, touched}], loaded from kv on first render
let cur = 0, closet = [], drive = true, connected = false;
const persist = () => setKV('addQueue', q.map(({ file, img, f, beautify, seen, touched, guess }) => ({ file, img, f, beautify, seen, touched, guess: guess === 'busy' ? 'none' : guess })));

export async function render(view) {
  q ??= await getKV('addQueue', []);
  closet = await getAll('items');
  connected = !!(await getSettings()).upload?.url;
  if (!q.length) return start(view);
  review(view);
}

function start(view) {
  view.innerHTML = `<h1>Add items</h1>
    <p class="muted">One item per photo, laid flat or on a hanger, front view, on a plain background (a bedsheet or the floor). Keep hands and people out of the shot.</p>
    <div class="add-opts">
      <label class="add-opt"><span class="ico">📷</span><b>Camera</b><span class="muted">One photo per tap</span>
        <input type="file" accept="image/*" capture="environment" hidden></label>
      <label class="add-opt"><span class="ico">🖼️</span><b>Gallery</b><span class="muted">Pick many at once</span>
        <input type="file" accept="image/*" multiple hidden></label>
    </div>
    <div class="card soft" style="margin-top:16px"><p class="muted">Tip: on iPhone, long-press the clothing in Photos → <b>Copy Subject</b>, save it, and pick that: the background is gone already.</p>
      <p class="muted" style="margin-top:8px">✨ <b>Beautify</b> turns a photo into a clean studio-style image on the laptop.${connected ? ' ☁️ Photos go to your Drive <b>Closet</b> folder.' : ' <a href="#settings">Connect Drive</a> to send photos to the laptop.'}</p></div>`;
  view.querySelectorAll('input[type=file]').forEach((inp) => (inp.onchange = (e) => addFiles(view, e.target.files)));
}

async function addFiles(view, files) {
  if (!files?.length) return;
  const s = await getSettings();
  if (s.recognize == null) { // ask once: the model is a one-time ~15 MB download
    s.recognize = confirm('Guess what each photo is on the phone? This downloads a ~15 MB model once (Wi-Fi recommended). Cancel = you pick the category yourself.');
    await saveSettings(s);
  }
  const before = q.length;
  for (const file of files) {
    try {
      const img = await prepareImage(file);
      const it = { file, img, guess: s.recognize ? 'busy' : 'off', beautify: !img.transparent, // a cut-out is already clean
        f: { category: 'top', type: 'shirt', formality: 'smart-casual', pattern: 'solid', sleeves: 'full', color: colorName(img.hex), hex: img.hex } };
      q.push(it);
      if (s.recognize) guessTags(img.dataUrl, img.ratio).then((g) => { // fills in only what you haven't changed yourself
        const showing = q[cur] === it && view.isConnected;
        if (showing) keepForm(view, it); // save typing first, so the guess can't be undone by a stale field
        it.guess = g ? g.label : 'none';
        if (g && !it.touched) Object.assign(it.f, { category: g.category, type: g.type, formality: g.formality });
        persist();
        if (showing) review(view);
      });
    } catch { toast(`Could not read ${file.name}`); }
  }
  await persist();
  if (!q.length) return start(view);
  cur = Math.min(before, q.length - 1);
  review(view);
}

function keepForm(view, it) { // copy the typed colour back before re-rendering
  const c = $('#color', view), h = $('#hex', view);
  if (c) { it.f.color = c.value.trim(); it.f.hex = h.value; }
  const t = $('#type', view);
  if (t && t.value.trim() && t.value.trim() !== it.f.type) { it.f.type = t.value.trim(); it.touched = true; }
}

// Same category and a close colour: maybe you already have it.
const dist = (a = '#808080', b = '#808080') => Math.hypot(...[1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)));
const lookalike = (f) => closet.find((i) => !i.archived && i.category === f.category && dist(i.colorHex, f.hex) < 40);

// Quarter turn of both the preview and the full-size original (the laptop cuts out and beautifies from the original).
const turn = (src, w, h) => { const c = document.createElement('canvas'); c.width = h; c.height = w; const g = c.getContext('2d'); g.translate(h, 0); g.rotate(Math.PI / 2); g.drawImage(src, 0, 0); return c; };
async function rotate(it) {
  const im = new Image(); im.src = it.img.dataUrl; await im.decode();
  it.img = { ...it.img, dataUrl: turn(im, im.width, im.height).toDataURL('image/png'), ratio: it.img.ratio && 1 / it.img.ratio };
  const bmp = await createImageBitmap(it.file), type = it.file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  it.file = await new Promise((r) => turn(bmp, bmp.width, bmp.height).toBlob((b) => r(new File([b], 'photo', { type })), type, 0.92));
}

function review(view) {
  const it = q[cur];
  it.seen = true;
  const f = it.f, dup = lookalike(f);
  const chips = (key, arr) => `<div class="chips" data-k="${key}">${arr.map((v) => `<button class="chip" data-v="${v}" aria-pressed="${f[key] === v}">${v}</button>`).join('')}</div>`;
  view.innerHTML = `<div class="head"><h1>Add ${q.length} item${q.length > 1 ? 's' : ''}</h1>
      <button class="icon-btn" id="discard" aria-label="Discard all"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="strip">${q.map((x, i) => `<button class="strip-t${i === cur ? ' on' : ''}${x.seen && x.f.color ? ' ok' : ''}" data-i="${i}" aria-label="Item ${i + 1}${x.seen ? ', checked' : ''}"><img src="${x.img.dataUrl}" alt=""></button>`).join('')}
      <label class="strip-t more" aria-label="Take another photo">📷<input type="file" accept="image/*" capture="environment" hidden></label>
      <label class="strip-t more" aria-label="Pick more from gallery">＋<input type="file" accept="image/*" multiple hidden></label></div>
    <div class="hero-img" style="height:240px;margin-top:8px"><img src="${it.img.dataUrl}" alt=""></div>
    <div class="row" style="margin-top:6px"><button class="btn" id="rot">↻ Rotate</button><button class="btn" id="rm">🗑 Remove</button></div>
    ${it.img.transparent ? '' : '<p class="muted" style="margin-top:6px">Background still in the photo: the laptop removes it at sync.</p>'}
    <p class="muted" style="margin-top:6px">${it.guess === 'busy' ? '🔎 Recognising…' : it.guess === 'off' ? 'Pick the category below. The laptop checks it at sync.' : it.guess === 'none' ? 'Couldn’t tell what this is — pick below. The laptop checks it at sync.' : `🔎 Looks like <b>${esc(it.guess)}</b>. Change anything below; the laptop double-checks at sync.`}</p>
    ${dup ? `<p class="note">Looks like your <b>${esc(dup.color)} ${esc(dup.type)}</b>. Already in the closet? Remove this photo.</p>` : ''}
    <div class="field"><label for="color">Colour name</label><div class="row"><input class="input" id="color" placeholder="e.g. navy blue" value="${esc(f.color)}">
      <input type="color" id="hex" value="${f.hex}" aria-label="Colour" style="flex:none;width:56px;height:44px;border:0;background:none"></div></div>
    <div class="field"><span class="lbl">Category</span>${chips('category', CATS)}</div>
    <div class="field"><label for="type">Type</label><input class="input" id="type" placeholder="e.g. shirt, loafers, watch" value="${esc(f.type || '')}"></div>
    <details class="field"><summary class="lbl">More details: ${esc(f.formality)} · ${esc(f.pattern)}${SLEEVED.includes(f.category) ? ' · ' + esc(f.sleeves) + ' sleeves' : ''}</summary>
      <span class="lbl">Formality</span>${chips('formality', FORM)}
      <span class="lbl">Pattern</span>${chips('pattern', PAT)}
      <div ${SLEEVED.includes(f.category) ? '' : 'hidden'} id="sl"><span class="lbl">Sleeves</span>${chips('sleeves', ['full', 'half'])}</div></details>
    <div class="field"><div class="chips"><button class="chip" id="beau" aria-pressed="${it.beautify}">${it.beautify ? '✓ ' : ''}✨ Beautify this one</button>
      ${connected ? `<button class="chip" id="drv" aria-pressed="${drive}">${drive ? '✓ ' : ''}☁️ Upload all to Drive</button>` : ''}</div>
      ${connected && drive ? '<p class="muted" style="margin-top:6px">Photos go straight to Drive → <b>Closet</b>.</p>' : connected ? '' : '<p class="muted" style="margin-top:6px"><a href="#settings">Connect Drive</a> to send photos to the laptop.</p>'}</div>
    <div class="row">${cur < q.length - 1 ? '<button class="btn" id="next">Next</button>' : ''}
      <button class="btn primary" id="save">Add ${q.length} to closet</button></div>`;

  const keep = () => { keepForm(view, it); persist(); };
  ['#color', '#hex', '#type'].forEach((s) => ($(s, view).oninput = () => keepForm(view, it)));
  ['#color', '#hex', '#type'].forEach((s) => ($(s, view).onchange = keep));
  view.querySelectorAll('.chips[data-k]').forEach((box) => box.querySelectorAll('.chip').forEach((b) => (b.onclick = () => {
    keepForm(view, it);
    f[box.dataset.k] = b.dataset.v; it.touched = true;
    if (box.dataset.k === 'category') f.type = TYPE[f.category];
    persist(); review(view);
    if (box.closest('details')) $('details', view).open = true;
  })));
  $('#beau', view).onclick = () => { keep(); it.beautify = !it.beautify; persist(); review(view); };
  const drv = $('#drv', view);
  if (drv) drv.onclick = () => { keep(); drive = !drive; review(view); };
  $('#rot', view).onclick = async () => { keep(); await rotate(it); persist(); review(view); };
  $('#rm', view).onclick = () => { q.splice(cur, 1); cur = Math.min(cur, q.length - 1); persist(); q.length ? review(view) : start(view); };
  view.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { keep(); cur = +b.dataset.i; review(view); }));
  view.querySelectorAll('.strip-t.more input').forEach((inp) => (inp.onchange = (e) => { keep(); addFiles(view, e.target.files); }));
  $('#discard', view).onclick = () => { if (confirm('Discard these photos?')) { q.length = 0; persist(); start(view); } };
  const next = $('#next', view);
  if (next) next.onclick = () => { keep(); cur++; review(view); };
  $('#save', view).onclick = (e) => { // one tap only: a second tap while uploading made duplicate Drive files
    keepForm(view, it); const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Saving…';
    saveAll(view, btn).catch((err) => { toast(err.message); review(view); });
  };
}

async function saveAll(view, btn) {
  const missing = q.findIndex((x) => !x.f.color);
  if (missing >= 0) { cur = missing; review(view); return toast('Give every item a colour name'); }
  const unseen = q.filter((x) => !x.seen).length;
  if (unseen && !confirm(`${unseen} photo${unseen > 1 ? 's' : ''} not checked yet (no ✓). Add anyway with the guessed tags?`)) { btn.disabled = false; btn.textContent = `Add ${q.length} to closet`; return; }
  const base = Date.now();
  const ids = q.map((_, i) => `p-${base + i}`);
  const send = connected && drive;
  const up = send ? await uploadBatchToDrive(q.map((x) => x.file), ids, q.map((x) => x.beautify), { onProgress: (i, n) => (btn.textContent = `Uploading ${i}/${n}…`) }) : { status: 'skipped', sent: [] };
  for (const [i, { file, img, f, touched, beautify }] of q.entries()) {
    const sent = up.status === 'shared' || up.sent.includes(ids[i]);
    const item = { id: ids[i], type: f.type || TYPE[f.category], tagSource: touched ? 'user' : 'auto', ...(touched ? { editedAt: Date.now() } : {}), color: f.color, colorHex: f.hex, category: f.category, formality: f.formality,
      pattern: f.pattern, photo: 'added', image: img.dataUrl, status: 'clean', wearCount: 0, lastWorn: null, neverWith: [],
      archived: false, updated: Date.now(), beautify: beautify ? 'requested' : 'none', needsPhoto: !img.transparent,
      driveUploaded: sent, pendingUpload: sent || !send ? undefined : file };
    if (beautify) item.requestedAt = Date.now();
    if (SLEEVED.includes(f.category)) item.sleeves = f.sleeves;
    await put('items', item);
  }
  const n = q.length, left = n - (up.status === 'shared' ? n : up.sent.length);
  q.length = 0; await persist();
  toast(!send ? `Added ${n}` : left ? `Added ${n} · ${left} upload${left > 1 ? 's' : ''} pending (open the item → ☁️ Upload)` : `Added ${n} · sent to Drive`);
  location.hash = '#closet';
}
