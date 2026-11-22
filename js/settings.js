// Settings tab (minimal for now): name + bundle import. Weather/place, export, backup come in later steps.
import { getSettings, saveSettings } from './db.js';
import { importBundle, buildLog, buildBackup, restoreBackup, shareJson, syncWithDrive, connectWithCode } from './sync.js';
import { searchPlaces } from './weather.js';
import { SKINS, HAIRS, DEFAULT_AVATAR } from './avatar.js';
import { $, esc, toast } from './ui.js';

export async function render(view) {
  const s = await getSettings();
  view.innerHTML = `
    <h1>Settings</h1>
    <div class="field"><label for="name">Your name</label><input class="input" id="name" value="${esc(s.name)}"></div>
    <div class="field"><label for="city">City (for weather)</label>
      <div class="row"><input class="input" id="city" placeholder="Search city" value="${esc(s.place?.name || '')}"><button class="btn" id="geo" style="flex:none">Use location</button></div>
      <div class="chips" id="hits" style="margin-top:8px"></div></div>
    <h2>Avatar</h2>
    <div class="field"><span class="lbl">Skin tone</span><div class="chips" id="skin">${SKINS.map((c) => `<button class="chip" data-c="${c}" aria-pressed="${(s.avatar?.skin ?? DEFAULT_AVATAR.skin) === c}" aria-label="skin ${c}" style="background:${c};width:44px"></button>`).join('')}</div></div>
    <div class="field"><span class="lbl">Hair colour</span><div class="chips" id="hair">${HAIRS.map((c) => `<button class="chip" data-c="${c}" aria-pressed="${(s.avatar?.hair ?? DEFAULT_AVATAR.hair) === c}" aria-label="hair ${c}" style="background:${c};width:44px"></button>`).join('')}</div></div>
    <h2>Google Drive</h2>
    ${s.upload?.url ? `<button class="btn primary block" id="dsync">⟳ Sync with Drive</button>
      <p class="muted" style="margin-top:8px">Sends your wear log and gets the latest closet from the laptop. ${s.lastSync ? 'Last sync: ' + new Date(s.lastSync).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) + '.' : ''} New photos upload straight to Drive → <b>Closet</b>.</p>`
    : `<p class="muted">Connect once: on the laptop, run the setup-code command (README) or ask Claude for your setup code. It lands on your clipboard; then paste it here.</p>
      <div class="row" style="margin-top:8px"><input class="input" id="dcode" placeholder="Paste setup code" autocomplete="off"><button class="btn primary" id="dconnect" style="flex:none">Connect</button></div>`}
    <h2>Sync</h2>
    <div class="list"><label class="btn" style="border-radius:0;justify-content:space-between;cursor:pointer">Import from file (backup way)
      <input type="file" id="bundle" accept=".json,application/json" hidden></label></div>
    <div class="list" style="margin-top:8px"><button id="exlog">Export wear log → Drive</button>
      <button id="exbak">Full backup (with photos)</button>
      <label class="btn" style="border-radius:0;justify-content:space-between;cursor:pointer;min-height:52px">Restore backup<input type="file" id="restore" accept=".json" hidden></label></div>
    <p class="muted" style="margin-top:8px">Pick <b>closet-bundle.json</b> from Drive → Closet → sync. Wear history is kept on re-import.</p>`;
  for (const k of ['skin', 'hair']) $('#' + k).querySelectorAll('[data-c]').forEach((b) => (b.onclick = async () => {
    s.avatar = { ...DEFAULT_AVATAR, ...s.avatar, [k]: b.dataset.c };
    await saveSettings(s);
    $('#' + k).querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  }));
  $('#name').onchange = async (e) => { s.name = e.target.value.trim(); await saveSettings(s); toast('Saved'); };
  const setPlace = async (p) => { s.place = p; await saveSettings(s); $('#city').value = p.name; $('#hits').innerHTML = ''; toast('Place saved'); };
  $('#city').onchange = async (e) => {
    try {
      const r = await searchPlaces(e.target.value);
      $('#hits').innerHTML = r.map((p, i) => `<button class="chip" data-i="${i}">${esc(p.name)}</button>`).join('') || '<span class="muted">No match</span>';
      $('#hits').querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => setPlace(r[b.dataset.i])));
    } catch { toast('Search needs internet'); }
  };
  $('#geo').onclick = () => navigator.geolocation?.getCurrentPosition(
    (g) => setPlace({ name: 'My location', lat: +g.coords.latitude.toFixed(3), lon: +g.coords.longitude.toFixed(3) }),
    () => toast('Location blocked. Search a city instead.'));
  const ds = $('#dsync');
  if (ds) ds.onclick = async () => {
    ds.disabled = true; ds.textContent = 'Syncing…';
    try { const r = await syncWithDrive(); toast(`Synced · ${r.updated} items updated, ${r.added} new`); render(view); }
    catch (e) { toast(e.message); ds.disabled = false; ds.textContent = '⟳ Sync with Drive'; }
  };
  const dc = $('#dconnect');
  if (dc) dc.onclick = async () => {
    try { await connectWithCode($('#dcode').value); toast('Connected. Syncing…'); const r = await syncWithDrive(); toast(`Synced · ${r.added + r.updated} items`); render(view); }
    catch (e) { toast(e.message); }
  };
  $('#exlog').onclick = async () => toast(await shareJson(await buildLog(), 'closet-log.json'));
  $('#exbak').onclick = async () => toast(await shareJson(await buildBackup(), 'closet-backup.json'));
  $('#restore').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f || !confirm('Replace everything on this phone with the backup?')) return;
    try { const r = await restoreBackup(JSON.parse(await f.text())); toast(`Restored ${r.items} items`); } catch (err) { toast(err.message); }
  };
  $('#bundle').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const r = await importBundle(JSON.parse(await f.text()));
      toast(`Imported: ${r.added} new, ${r.updated} updated`);
    } catch (err) { toast(err.message); }
  };
}
