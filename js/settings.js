// Settings: name, city, Drive connect/sync, outfit rules, reminder, and files (import/export/backup) under Advanced.
import { getSettings, saveSettings } from './db.js';
import { importBundle, buildLog, buildBackup, restoreBackup, shareJson, syncWithDrive, connectWithCode } from './sync.js';
import { searchPlaces } from './weather.js';
import { DAY_TYPES } from './picker.js';
import { $, esc, toast } from './ui.js';

const DOW = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];

export async function render(view) {
  const s = await getSettings();
  const num = (k, label, min, max) => `<div class="field"><label for="n-${k}">${label}</label><input class="input" id="n-${k}" data-n="${k}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${s[k]}"></div>`;
  view.innerHTML = `
    <h1>Settings</h1>
    <div class="field"><label for="name">Your name</label><input class="input" id="name" value="${esc(s.name)}"></div>
    <div class="field"><label for="city">City (for weather)</label>
      <div class="row"><input class="input" id="city" type="search" placeholder="Search city" value="${esc(s.place?.name || '')}"><button class="btn" id="geo" style="flex:none">Use location</button></div>
      <div class="chips" id="hits" style="margin-top:8px"></div></div>
    <h2>Google Drive</h2>
    ${s.upload?.url ? `<button class="btn primary block" id="dsync">↻ Sync with Drive</button>
      <p class="muted" style="margin-top:8px">Sends your wear log and gets the latest closet from the laptop. ${s.lastSync ? 'Last sync: ' + new Date(s.lastSync).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) + '.' : ''} New photos upload straight to Drive → <b>Closet</b>.</p>
      <button class="btn block" id="dout" style="margin-top:8px">Disconnect Drive</button>`
    : `<p class="muted">Connect once: copy the setup code on the laptop (it reaches this phone's clipboard), then tap the button.</p>
      <button class="btn primary block" id="dpaste" style="margin-top:8px">📋 Paste setup code &amp; connect</button>
      <div class="row" style="margin-top:8px"><input class="input" id="dcode" placeholder="…or paste it here" autocomplete="off"><button class="btn" id="dconnect" style="flex:none">Connect</button></div>`}
    <h2>Outfit rules</h2>
    <div class="field"><span class="lbl">Usual day type</span><div class="list">${DOW.map(([d, l]) => `<div><span style="flex:1">${l}</span>
      <select class="input" data-dow="${d}" style="width:auto">${DAY_TYPES.map((t) => `<option ${s.dayTypes[d] === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`).join('')}</div></div>
    ${num('noRepeatDays', 'Days before a top repeats', 0, 60)}
    ${num('comboNoRepeatDays', 'Days before the same top + bottom repeats', 0, 60)}
    ${num('bottomWears', 'Wears before trousers/jeans need a wash', 1, 10)}
    ${num('eveningHour', 'Show tomorrow from (hour, 24h)', 12, 23)}
    <label class="field row" style="align-items:center"><input type="checkbox" id="cold" ${s.coldOffice ? 'checked' : ''} style="width:22px;height:22px;flex:none"><span>Cold office: always suggest a layer</span></label>
    <h2>App</h2>
    <div class="list"><div><span style="flex:1">Version</span><b id="ver">…</b></div></div>
    <button class="btn block" id="upd" style="margin-top:8px">↻ Update app now</button>
    <p class="muted" style="margin-top:6px">Gets the newest version without removing the Home Screen app. Your clothes and history stay.</p>
    <h2>Reminder</h2>
    <p class="muted">Add a daily calendar alert that opens the app. Pick the time, then open the file and tap <b>Add to Calendar</b>.</p>
    <div class="row" style="margin-top:8px"><input class="input" id="rtime" type="time" value="07:30"><button class="btn" id="rics" style="flex:none">📅 Daily reminder</button></div>
    <details style="margin-top:16px"><summary><h2 style="display:inline">Advanced: files &amp; backup</h2></summary>
      <div class="list" style="margin-top:8px"><label class="btn" style="border-radius:0;justify-content:space-between;cursor:pointer">Import bundle from file
        <input type="file" id="bundle" accept=".json,application/json" hidden></label>
        <button id="exlog">Export wear log</button>
        <button id="exbak">Full backup (with photos)</button>
        <label class="btn" style="border-radius:0;justify-content:space-between;cursor:pointer;min-height:52px">Restore backup<input type="file" id="restore" accept=".json" hidden></label></div>
      <p class="muted" style="margin-top:8px">Only needed without Drive sync: pick <b>closet-bundle.json</b> from Drive → Closet → sync. Wear history is kept on re-import.</p></details>`;

  const save = async () => { await saveSettings(s); toast('Saved'); };
  $('#name').onchange = (e) => { s.name = e.target.value.trim(); save(); };
  view.querySelectorAll('[data-dow]').forEach((el) => (el.onchange = () => { s.dayTypes = { ...s.dayTypes, [el.dataset.dow]: el.value }; save(); }));
  view.querySelectorAll('[data-n]').forEach((el) => (el.onchange = () => {
    const v = Math.max(+el.min, Math.min(+el.max, Math.round(+el.value)));
    if (Number.isNaN(v)) return; el.value = v; s[el.dataset.n] = v; save();
  }));
  $('#cold').onchange = (e) => { s.coldOffice = e.target.checked; save(); };

  const setPlace = async (p) => { s.place = p; await saveSettings(s); $('#city').value = p.name; $('#hits').innerHTML = ''; toast('Place saved'); };
  let t;
  $('#city').oninput = (e) => { // search as you type
    clearTimeout(t);
    const v = e.target.value.trim();
    if (v.length < 2) return ($('#hits').innerHTML = '');
    t = setTimeout(async () => {
      try {
        const r = await searchPlaces(v);
        $('#hits').innerHTML = r.map((p, i) => `<button class="chip" data-i="${i}">${esc(p.name)}</button>`).join('') || '<span class="muted">No match</span>';
        $('#hits').querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => setPlace(r[b.dataset.i])));
      } catch { $('#hits').innerHTML = '<span class="muted">Search needs internet</span>'; }
    }, 350);
  };
  $('#geo').onclick = () => navigator.geolocation?.getCurrentPosition(async (g) => {
    const lat = +g.coords.latitude.toFixed(3), lon = +g.coords.longitude.toFixed(3);
    let name = 'My location';
    try { // free, no key; coordinates only
      const j = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`)).json();
      name = j.city || j.locality || name;
    } catch {}
    setPlace({ name, lat, lon });
  }, () => toast('Location blocked. Search a city instead.'));

  // Installed version = the cache name; latest = what sw.js on the server says.
  const cur = (await caches?.keys?.().catch(() => []))?.find((k) => k.startsWith('closet-')) || '';
  fetch('sw.js', { cache: 'no-store' }).then((r) => r.text()).then((t) => {
    const latest = t.match(/closet-v\d+/)?.[0] || '';
    $('#ver').textContent = (cur ? cur.replace('closet-', '') : 'not installed') + (latest && latest !== cur ? ` → ${latest.replace('closet-', '')} available` : ' (latest)');
  }).catch(() => ($('#ver').textContent = cur.replace('closet-', '') + ' (offline)'));
  $('#upd').onclick = async () => {
    $('#upd').disabled = true; $('#upd').textContent = 'Updating…';
    try {
      for (const k of await caches.keys()) await caches.delete(k); // next load comes from the network
      await (await navigator.serviceWorker?.getRegistration())?.update();
    } catch {}
    location.reload();
  };
  $('#rics').onclick = async () => {
    const [h, m] = ($('#rtime').value || '07:30').split(':'), d = new Date(), p = (n) => String(n).padStart(2, '0');
    const start = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${h}${m}00`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//closet//EN', 'BEGIN:VEVENT', `UID:closet-daily-${Date.now()}@closet`, `DTSTAMP:${start}`,
      `DTSTART:${start}`, 'DURATION:PT5M', 'RRULE:FREQ=DAILY', "SUMMARY:What to wear today", `URL:${location.origin + location.pathname}`, `DESCRIPTION:Open Closet: ${location.origin + location.pathname}`,
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:What to wear today', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const f = new File([ics], 'closet-reminder.ics', { type: 'text/calendar' });
    if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click();
  };

  const ds = $('#dsync');
  if (ds) ds.onclick = async () => {
    ds.disabled = true; ds.textContent = 'Syncing…';
    try { const r = await syncWithDrive(); toast(`Synced · ${r.updated} updated, ${r.added} new · ${Math.round(r.bytes / 1024)} KB`); render(view); }
    catch (e) { toast(e.message); ds.disabled = false; ds.textContent = '↻ Sync with Drive'; }
  };
  const dout = $('#dout');
  if (dout) dout.onclick = async () => { if (!confirm('Disconnect Drive on this phone? Your clothes stay.')) return; delete s.upload; await saveSettings(s); render(view); };
  const connect = async (code) => {
    try { await connectWithCode(code); toast('Connected. Syncing…'); const r = await syncWithDrive(); toast(`Synced · ${r.added + r.updated} items`); render(view); }
    catch (e) { toast(e.message); }
  };
  const dc = $('#dconnect');
  if (dc) dc.onclick = () => connect($('#dcode').value);
  const dp = $('#dpaste');
  if (dp) dp.onclick = async () => {
    let code = '';
    try { code = await navigator.clipboard.readText(); } catch { return toast('Allow Paste, or paste into the box below'); }
    connect(code);
  };
  const said = { shared: 'Shared', cancelled: 'Cancelled', downloaded: 'Saved to Downloads' };
  $('#exlog').onclick = async () => toast(said[await shareJson(await buildLog(), 'closet-log.json')]);
  $('#exbak').onclick = async () => toast(said[await shareJson(await buildBackup(), 'closet-backup.json')]);
  $('#restore').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f || !confirm('Replace everything on this phone with the backup?')) return;
    try { const r = await restoreBackup(JSON.parse(await f.text())); toast(`Restored ${r.items} items`); } catch (err) { toast(err.message); }
  };
  $('#bundle').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { const r = await importBundle(JSON.parse(await f.text())); toast(`Imported: ${r.added} new, ${r.updated} updated`); } catch (err) { toast(err.message); }
  };
}
