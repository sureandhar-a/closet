// Home: weather line, day/day-type chips, outfit options (swipe), swap/lock a piece, Wear this.
import { getAll, getKV, getSettings, put } from './db.js';
import { wear, unwear } from './wear.js';
import { pickOutfit, DAY_TYPES, tuck } from './picker.js';
import { getForecast } from './weather.js';
import { $, esc, imgSrc, toast, ymd, addDays, niceDate, openSheet } from './ui.js';

// picks: [{o: {top, bottom, layer, shoes, accessory}, reasons, planned}] kept across re-renders until day/type changes.
const st = { day: null, type: null, seen: [], lock: {}, picks: null };
const LABEL = { normal: 'Normal', meeting: 'Meeting', casual: 'Casual', ethnic: 'Ethnic' };
const NEED = { meeting: 'formal', normal: 'formal or smart-casual', casual: 'smart-casual or casual', ethnic: 'ethnic' };
const SLOTS = ['top', 'bottom', 'layer', 'shoes', 'belt', 'accessory'];
const NAME = { top: 'top', bottom: 'bottom', layer: 'layer', shoes: 'shoes', belt: 'belt', accessory: 'watch' };
const setOf = (o) => SLOTS.map((k) => o[k]).filter(Boolean);
const reset = () => { st.seen = []; st.lock = {}; st.picks = null; };

export async function render(view) {
  const s = await getSettings();
  const now = new Date(), today = ymd(now);
  if (st.loaded !== today) { st.day = null; st.type = null; reset(); st.loaded = today; }
  st.day ??= now.getHours() >= s.eveningHour ? addDays(today, 1) : today;
  const date = st.day;
  const type = st.type ?? s.dayTypes[new Date(date + 'T00:00').getDay()] ?? 'normal';
  const [items, log, plan, wx] = await Promise.all([getAll('items'), getAll('log'), getKV('plan', null), getForecast(s.place).catch(() => null)]);
  const w = wx?.days?.[date];
  const hello = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const stale = s.upload?.url && (!s.lastSync || Date.now() - new Date(s.lastSync) > 14 * 864e5);

  const head = `
    <div class="head"><div><h1>${hello}${s.name ? ', ' + esc(s.name) : ''}</h1>
      <div class="meta"><span>${niceDate(date)}</span>${s.place ? `<span>${esc(s.place.name)}</span>` : '<a href="#settings">Set your city</a>'}
      ${w ? `<span>${w.max}°/${w.min}° · rain ${w.rain}%</span>` : ''}${wx?.stale ? '<span>(offline)</span>' : ''}</div></div></div>
    ${stale ? `<a class="note" style="display:block" href="#settings">⟳ Last Drive sync ${s.lastSync ? Math.round((Date.now() - new Date(s.lastSync)) / 864e5) + ' days ago' : 'never'}. Sync now: it's also your backup.</a>` : ''}
    <div class="chips" style="margin-top:12px">
      <button class="chip" data-day="${today}" aria-pressed="${date === today}">Today</button>
      <button class="chip" data-day="${addDays(today, 1)}" aria-pressed="${date !== today}">Tomorrow</button></div>
    <div class="chips">${DAY_TYPES.map((t) => `<button class="chip" data-type="${t}" aria-pressed="${type === t}">${LABEL[t]}</button>`).join('')}</div>`;

  if (!items.length) {
    view.innerHTML = head + `<div class="card soft" style="margin-top:12px"><h2 style="margin-top:0">Welcome 👋</h2>
      <p>Let's load your closet:</p><ol style="margin:8px 0 0;padding-left:20px;line-height:1.9"><li><a href="#settings">Connect Google Drive</a> (one tap with the setup code)</li><li><a href="#settings">Set your city</a> for weather</li><li>Or add clothes yourself with <b>＋</b></li></ol></div>`;
    return bindHead(view, today);
  }

  const logged = log.find((e) => e.date === date);
  let body;
  if (logged) {
    const worn = logged.items.map((id) => items.find((i) => i.id === id)).filter(Boolean);
    body = `${card(worn, ['Logged for this day'], 'Worn', null, logged.dayType)}<div class="row" style="margin-top:12px"><button class="btn" id="undo">Undo</button>
      ${date === today ? '<button class="btn primary" id="tmrw">Plan tomorrow →</button>' : ''}</div>`;
  } else {
    const ask = (exclude, lock = st.lock) => pickOutfit({ items, log, date, weather: w || {}, dayType: type, settings: s, exclude, lock });
    // Kept suggestions hold item copies: refresh them (a sync brings new photos/tags); start over if a piece is gone.
    if (st.picks && !st.picks[0].missing) {
      const fresh = (i) => items.find((x) => x.id === i.id && !x.archived && x.status !== 'laundry');
      if (st.picks.every((x) => setOf(x.o).every(fresh))) for (const x of st.picks) for (const k of SLOTS) { if (x.o[k]) x.o[k] = fresh(x.o[k]); }
      else st.picks = null;
    } else st.picks = null;
    if (!st.picks) {
      const picks = [];
      const p = plan?.days?.[date];
      if (p && st.type == null && !st.seen.length && !Object.keys(st.lock).length) { // the plan is for the usual day type
        const o = { top: p.top, bottom: p.bottom, shoes: p.shoes };
        for (const k in o) o[k] = items.find((i) => i.id === o[k]);
        if (o.top && o.bottom && !o.top.neverWith?.includes(o.bottom.id) && setOf(o).every((i) => !i.archived && (i.category === 'top' || i.category === 'ethnic' ? i.status === 'clean' : i.status !== 'laundry'))) {
          // Through the picker with the planned pieces kept, so the watch/layer fit and weather reasons apply too.
          const r = ask([], Object.fromEntries(Object.entries(o).filter(([, i]) => i).map(([k, i]) => [k, i.id])));
          if (!r.missing) picks.push({ o: { top: r.top, bottom: r.bottom, layer: r.layer, shoes: r.shoes, belt: r.belt, accessory: r.accessory }, reasons: ['Planned on the laptop', ...r.reasons.filter((x) => !/^Top not worn/.test(x))], planned: true });
        }
      }
      // Up to two suggestions with different tops (and other pieces where possible); cycle through everything before repeating.
      for (let n = picks.length; n < 2; n++) {
        const used = picks.flatMap((x) => setOf(x.o).map((i) => i.id));
        let r = ask([...st.seen, ...used]);
        if (r.missing && st.seen.length && !picks.length) { st.seen = []; r = ask([]); }
        if (r.missing) { if (!picks.length) picks.push(r); break; }
        if (picks.length && r.top.id === picks[0].o.top.id) break; // locked top: one option only
        picks.push({ o: { top: r.top, bottom: r.bottom, layer: r.layer, shoes: r.shoes, belt: r.belt, accessory: r.accessory }, reasons: r.reasons });
      }
      st.picks = picks;
    }
    const picks = st.picks;
    if (picks[0].missing) {
      const m = picks[0].missing, clean = items.filter((i) => i.category === m && !i.archived);
      body = `<div class="empty-state"><p><b>${clean.length ? `No ${m === 'top' ? NEED[type] + ' tops' : 'bottoms'} clean for a ${LABEL[type]} day` : `No ${m}s in your closet yet`}</b></p>
        <p>${clean.length ? 'Try another day type, or mark some clothes clean.' : 'Add some with ＋ or sync from Drive.'}</p>
        <a class="btn primary" href="#closet">Open Closet</a></div>`;
    } else {
      view.picks = picks;
      body = `<div class="carousel">${picks.map((x, n) => `<section class="slide"><h2 style="margin:4px 0 8px">Option ${n + 1}${picks.length > 1 ? `<span class="muted" style="font-weight:400"> of ${picks.length} · swipe</span>` : ''}</h2>
        ${card(setOf(x.o), x.reasons, x.planned ? 'Planned' : '', n, type)}
        <button class="btn primary block" style="margin-top:10px" data-wear="${n}">Wear this</button></section>`).join('')}</div>
        <div class="row" style="margin-top:12px"><button class="btn" id="another">Show different options</button><button class="btn" id="pack">🧳 Pack for a trip</button></div>`;
    }
    var swap = (n, k) => { // replace one piece, keep the others
      const o = picks[n].o, lock = Object.fromEntries(SLOTS.filter((x) => x !== k && o[x]).map((x) => [x, o[x].id]));
      picks[n].ex = [...(picks[n].ex || []), o[k].id];
      const r = ask(picks[n].ex, lock);
      if (r.missing || !r[k] || picks[n].ex.includes(r[k].id)) { picks[n].ex = []; return toast(`No other ${NAME[k]} fits`); }
      o[k] = r[k];
      render(view);
    };
  }
  view.innerHTML = head + `<div style="margin-top:12px">${body}</div>`;
  bindHead(view, today);

  const redo = () => render(view);
  $('#another', view)?.addEventListener('click', () => { st.seen.push(...view.picks.flatMap((x) => setOf(x.o)).map((i) => i.id).filter((id) => !Object.values(st.lock).includes(id))); st.picks = null; redo(); });
  $('#pack', view)?.addEventListener('click', () => pack(items, log, s, date));
  view.querySelectorAll('[data-wear]').forEach((b) => b.addEventListener('click', async () => {
    await wear(date, setOf(view.picks[b.dataset.wear].o), type);
    reset(); toast('Logged'); redo();
  }));
  view.querySelectorAll('[data-swap]').forEach((b) => (b.onclick = () => { const [n, k] = b.dataset.swap.split(':'); swap(+n, k); }));
  view.querySelectorAll('[data-lock]').forEach((b) => (b.onclick = () => {
    const [n, k] = b.dataset.lock.split(':'), id = view.picks[n].o[k].id;
    if (st.lock[k] === id) delete st.lock[k]; else st.lock[k] = id;
    toast(st.lock[k] ? `${NAME[k]} kept for new options` : 'Unlocked'); redo();
  }));
  view.querySelectorAll('[data-never]').forEach((b) => (b.onclick = async () => {
    const { top, bottom } = view.picks[b.dataset.never].o;
    if (!confirm(`Never suggest ${top.color} ${top.type} with ${bottom.color} ${bottom.type}?`)) return;
    await put('items', { ...top, neverWith: [...new Set([...(top.neverWith || []), bottom.id])], updated: Date.now() });
    await put('items', { ...bottom, neverWith: [...new Set([...(bottom.neverWith || []), top.id])], updated: Date.now() });
    st.picks = null; toast('Won’t pair those again'); redo();
  }));
  $('#undo', view)?.addEventListener('click', async () => { await unwear(date); redo(); });
  $('#tmrw', view)?.addEventListener('click', () => { st.day = addDays(today, 1); st.type = null; reset(); redo(); });
}

function bindHead(view, today) {
  view.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { st.day = b.dataset.day; st.type = null; reset(); render(view); }));
  view.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { st.type = b.dataset.type; reset(); render(view); }));
}

// Packing list: one outfit per day with a different top each day (bottoms and shoes can repeat).
function pack(items, log, s, from) {
  const p = openSheet(`<h2 style="margin-top:4px">Pack for a trip</h2>
    <div class="field"><label for="pd">Days</label><input class="input" id="pd" type="number" min="1" max="14" value="3"></div>
    <button class="btn primary block" id="pgo">Make the list</button><div id="pout" style="margin-top:12px"></div>`);
  $('#pgo', p).onclick = () => {
    const n = Math.max(1, Math.min(14, +$('#pd', p).value || 3)), used = [], days = [];
    for (let d = 0; d < n; d++) {
      const date = addDays(from, d), dt = s.dayTypes[new Date(date + 'T00:00').getDay()] ?? 'normal';
      const r = pickOutfit({ items, log, date, dayType: dt, settings: s, exclude: used });
      if (r.missing) break;
      used.push(r.top.id); days.push({ date, set: setOf(r) });
    }
    const all = [...new Map(days.flatMap((x) => x.set).map((i) => [i.id, i])).values()];
    $('#pout', p).innerHTML = days.length ? `<div class="list">${days.map((x) => `<div><b style="flex:none">${niceDate(x.date)}</b><span style="flex:1;text-align:right" class="muted">${x.set.map((i) => esc(i.color) + ' ' + esc(i.type)).join(' · ')}</span></div>`).join('')}</div>
      <h2>Pack these ${all.length}</h2><div class="list">${all.map((i) => `<div><span class="thumb"><img src="${imgSrc(i)}" alt=""></span><span style="flex:1">${esc(i.color)} ${esc(i.type)}</span></div>`).join('')}</div>`
      : '<p class="muted">Not enough clean clothes for that.</p>';
  };
}

const ROLE = { top: 'top', ethnic: 'top', layer: 'layer', bottom: 'bottom', shoes: 'shoes', belt: 'belt', accessory: 'accessory' };
// Flat-lay canvas, one slot per role (also used by History).
export const collage = (set) => `<div class="outfit${set.some((i) => i.category === 'layer') ? ' has-layer' : ''}">${
  set.map((i) => `<img class="${ROLE[i.category] || 'top'}" src="${imgSrc(i)}" alt="${esc(i.color)} ${esc(i.type)}">`).join('')}</div>`;
// n = option index: adds swap ↻ / keep 🔒 per piece and "Don't pair".
function card(set, reasons, badge, n, dayType) {
  const slot = (i) => (i.category === 'ethnic' ? 'top' : i.category);
  const pieces = n == null ? `<p class="outfit-names">${set.map((i) => `${esc(i.color)} ${esc(i.type)}`).join(' · ')}</p>`
    : `<div class="pieces">${set.map((i) => `<div class="piece"><span>${esc(i.color)} ${esc(i.type)}</span>
        <button class="mini" data-swap="${n}:${slot(i)}" aria-label="Swap ${esc(i.type)}">↻</button>
        <button class="mini" data-lock="${n}:${slot(i)}" aria-pressed="${st.lock[slot(i)] === i.id}" aria-label="Keep ${esc(i.type)}">${st.lock[slot(i)] === i.id ? '🔒' : '🔓'}</button></div>`).join('')}
        <button class="mini wide" data-never="${n}">🚫 Don't pair this top &amp; bottom</button></div>`;
  const T = set.find((i) => i.category === 'top'), B = set.find((i) => i.category === 'bottom');
  const tk = T && B && dayType ? tuck(T, B, dayType) : null; // from the current pieces, so it follows a swap
  return `<div class="card">${collage(set)}${pieces}
    ${tk ? `<p class="tuck">${tk.tucked ? '👔 <b>Tuck it in</b>' : '👕 <b>Wear it out</b> (untucked)'}<span class="muted"> · ${esc(tk.why)}</span></p>` : ''}
    ${badge ? `<p style="margin-top:12px"><span class="badge">${badge}</span></p>` : ''}
    <ul class="reasons">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
}
