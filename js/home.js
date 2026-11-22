// Home: weather line, day-type chips, outfit card, Wear this / Another.
import { getAll, getKV, getSettings } from './db.js';
import { wear, unwear } from './wear.js';
import { pickOutfit, DAY_TYPES } from './picker.js';
import { getForecast } from './weather.js';
import { $, esc, imgSrc, toast, ymd, addDays, niceDate } from './ui.js';

const st = { day: null, type: null, seen: [] };
const LABEL = { normal: 'Normal', meeting: 'Meeting', casual: 'Casual', ethnic: 'Ethnic' };

export async function render(view) {
  const s = await getSettings();
  const now = new Date(), today = ymd(now);
  if (st.loaded !== today) { st.day = null; st.type = null; st.seen = []; st.loaded = today; }
  st.day ??= now.getHours() >= s.eveningHour ? addDays(today, 1) : today;
  const date = st.day;
  const type = st.type ?? s.dayTypes[new Date(date + 'T00:00').getDay()] ?? 'normal';
  const [items, log, plan, wx] = await Promise.all([getAll('items'), getAll('log'), getKV('plan', null), getForecast(s.place).catch(() => null)]);
  const w = wx?.days?.[date];
  const hello = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const head = `
    <div class="head"><div><h1>${hello}${s.name ? ', ' + esc(s.name) : ''}</h1>
      <div class="meta"><span>${niceDate(date)}</span>${s.place ? `<span>${esc(s.place.name)}</span>` : '<a href="#settings">Set your city</a>'}
      ${w ? `<span>${w.max}°/${w.min}° · rain ${w.rain}%</span>` : ''}${wx?.stale ? '<span>(offline)</span>' : ''}</div></div></div>
    <div class="chips" style="margin-top:12px">
      <button class="chip" data-day="${today}" aria-pressed="${date === today}">Today</button>
      <button class="chip" data-day="${addDays(today, 1)}" aria-pressed="${date !== today}">Tomorrow</button>
      <span style="width:8px;flex:none"></span>
      ${DAY_TYPES.map((t) => `<button class="chip" data-type="${t}" aria-pressed="${type === t}">${LABEL[t]}</button>`).join('')}</div>`;

  const logged = log.find((e) => e.date === date);
  let body;
  if (logged) {
    const worn = logged.items.map((id) => items.find((i) => i.id === id)).filter(Boolean);
    body = `${card(worn, ['Logged for this day'], 'Worn')}<div class="row" style="margin-top:12px"><button class="btn" id="undo">Undo</button></div>`;
  } else {
    const ask = (exclude) => pickOutfit({ items, log, date, weather: w || {}, dayType: type, settings: s, exclude });
    let picks = [];
    const p = plan?.days?.[date];
    if (p && !st.seen.length) {
      const set = [p.top, p.bottom, p.shoes].filter(Boolean).map((id) => items.find((i) => i.id === id));
      if (set.every((i) => i && !i.archived && (i.category === 'top' || i.category === 'ethnic' ? i.status === 'clean' : i.status !== 'laundry'))) picks.push({ top: set[0], bottom: set[1], shoes: set[2], reasons: ['Planned on the laptop'], planned: true });
    }
    // Up to two suggestions with different tops; cycle through everything before repeating.
    for (let n = picks.length; n < 2; n++) {
      let r = ask([...st.seen, ...picks.map((x) => x.top.id)]);
      if (r.missing && st.seen.length && !picks.length) { st.seen = []; r = ask([]); }
      if (r.missing) { if (!picks.length) picks.push(r); break; }
      picks.push(r);
    }
    if (picks[0].missing) {
      const m = picks[0].missing;
      body = `<div class="empty-state"><p><b>No ${m} to pick</b></p><p>${items.length ? 'Mark some clothes clean, or add more.' : 'Connect Google Drive in Settings to load your closet.'}</p><a class="btn primary" href="#${items.length ? 'closet' : 'settings'}">${items.length ? 'Open Closet' : 'Connect Drive'}</a></div>`;
    } else {
      view.picks = picks.map((x) => ({ set: [x.top, x.bottom, x.layer, x.shoes, x.accessory].filter(Boolean), type }));
      body = picks.map((x, n) => `<h2 style="margin:${n ? 20 : 4}px 0 8px">Option ${n + 1}</h2>${card(view.picks[n].set, x.reasons, x.planned ? 'Planned' : '')}
        <button class="btn primary block" style="margin-top:10px" data-wear="${n}">Wear this</button>`).join('')
        + `<button class="btn block" id="another" style="margin-top:16px">Show different options</button>`;
    }
  }
  view.innerHTML = head + `<div style="margin-top:12px">${body}</div>`;

  const redo = () => render(view);
  view.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { st.day = b.dataset.day; st.type = null; st.seen = []; redo(); }));
  view.querySelectorAll('[data-type]').forEach((b) => (b.onclick = () => { st.type = b.dataset.type; st.seen = []; redo(); }));
  $('#another', view)?.addEventListener('click', () => { st.seen.push(...view.picks.map((x) => x.set[0].id)); redo(); });
  view.querySelectorAll('[data-wear]').forEach((b) => b.addEventListener('click', async () => {
    const { set, type: dt } = view.picks[b.dataset.wear];
    await wear(date, set, dt);
    st.seen = []; toast('Logged'); redo();
  }));
  $('#undo', view)?.addEventListener('click', async () => { await unwear(date); redo(); });
}

const ROLE = { top: 'top', ethnic: 'top', layer: 'layer', bottom: 'bottom', shoes: 'shoes', accessory: 'accessory' };
// Flat-lay canvas, one slot per role (also used by History).
export const collage = (set) => `<div class="outfit${set.some((i) => i.category === 'layer') ? ' has-layer' : ''}">${
  set.map((i) => `<img class="${ROLE[i.category] || 'top'}" src="${imgSrc(i)}" alt="${esc(i.color)} ${esc(i.type)}">`).join('')}</div>`;
function card(set, reasons, badge) {
  return `<div class="card">${collage(set)}
    <p class="outfit-names">${set.map((i) => `${esc(i.color)} ${esc(i.type)}`).join(' · ')}</p>
    ${badge ? `<p style="margin-top:12px"><span class="badge">${badge}</span></p>` : ''}
    <ul class="reasons">${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`;
}
