// History: month calendar of logged outfits + simple wear stats.
import { getAll } from './db.js';
import { unwear } from './wear.js';
import { $, esc, imgSrc, openSheet, closeSheet, ymd, niceDate } from './ui.js';

let month = null; // {y, m}

export async function render(view) {
  const [items, log] = await Promise.all([getAll('items'), getAll('log')]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const now = new Date();
  month ??= { y: now.getFullYear(), m: now.getMonth() };
  const first = new Date(month.y, month.m, 1), n = new Date(month.y, month.m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday-first
  const logOf = new Map(log.map((e) => [e.date, e]));
  const today = ymd();
  const cells = [...Array(lead).fill('<div class="day empty"></div>')];
  for (let d = 1; d <= n; d++) {
    const date = ymd(new Date(month.y, month.m, d)), e = logOf.get(date);
    const top = e && byId.get(e.items[0]);
    cells.push(`<button class="day ${date === today ? 'today' : ''}" data-date="${date}"><span>${d}</span>${top ? `<img src="${imgSrc(top)}" alt="">` : ''}</button>`);
  }
  const sorted = [...items].filter((i) => !i.archived).sort((a, b) => b.wearCount - a.wearCount);
  const stale = sorted.filter((i) => !i.lastWorn || (new Date() - new Date(i.lastWorn + 'T00:00')) / 864e5 >= 30);
  const row = (i, txt) => `<div><span class="thumb"><img src="${imgSrc(i)}" alt=""></span><span style="flex:1">${esc(i.color)} ${esc(i.type)}</span><b>${txt}</b></div>`;

  view.innerHTML = `<h1>History</h1>
    <div class="head" style="margin:8px 0"><button class="icon-btn" id="prev" aria-label="Previous month">‹</button>
      <b>${first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b>
      <button class="icon-btn" id="next" aria-label="Next month">›</button></div>
    <div class="cal">${'MTWTFSS'.split('').map((c) => `<div class="dow">${c}</div>`).join('')}${cells.join('')}</div>
    <h2>Most worn</h2><div class="list">${sorted.filter((i) => i.wearCount).slice(0, 5).map((i) => row(i, i.wearCount + '×')).join('') || '<div class="muted">Nothing logged yet</div>'}</div>
    <h2>Not worn in 30+ days</h2><div class="list">${stale.slice(0, 8).map((i) => row(i, i.lastWorn ? niceDate(i.lastWorn) : 'never')).join('') || '<div class="muted">All worn recently</div>'}</div>`;

  const shift = (d) => { const t = new Date(month.y, month.m + d, 1); month = { y: t.getFullYear(), m: t.getMonth() }; render(view); };
  $('#prev', view).onclick = () => shift(-1);
  $('#next', view).onclick = () => shift(1);
  view.querySelectorAll('.day[data-date]').forEach((b) => (b.onclick = () => {
    const e = logOf.get(b.dataset.date);
    if (!e) return;
    const p = openSheet(`<h2 style="margin-top:4px">${niceDate(e.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
      <div class="outfit" style="margin-top:8px">${e.items.map((id) => byId.get(id)).filter(Boolean).map((i) => `<div class="piece"><img src="${imgSrc(i)}" alt=""><span class="label">${esc(i.color)}</span></div>`).join('')}</div>
      <p class="muted" style="margin:12px 0">${esc(e.dayType)} day</p><button class="btn block" id="rm">Remove this entry</button>`);
    $('#rm', p).onclick = async () => { await unwear(e.date); closeSheet(); render(view); };
  }));
}
