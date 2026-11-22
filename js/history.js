// History: month calendar of logged outfits (tap an empty past day to log it) + wear stats.
import { getAll, put } from './db.js';
import { wear, unwear } from './wear.js';
import { collage } from './home.js';
import { $, esc, imgSrc, openSheet, closeSheet, ymd, niceDate, toast } from './ui.js';

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
  // Last 30 days: how much of the closet gets used, and where the wears go.
  const from = ymd(new Date(Date.now() - 30 * 864e5)), recent = log.filter((e) => e.date >= from && e.date <= today);
  const used = new Set(recent.flatMap((e) => e.items)), live = items.filter((i) => !i.archived);
  const pct = live.length ? Math.round((live.filter((i) => used.has(i.id)).length / live.length) * 100) : 0;
  const byCat = {};
  for (const i of live) { byCat[i.category] ??= { n: 0, w: 0 }; byCat[i.category].n++; byCat[i.category].w += recent.filter((e) => e.items.includes(i.id)).length; }
  const priced = live.filter((i) => i.price && i.wearCount).sort((a, b) => a.price / a.wearCount - b.price / b.wearCount);
  const topsUsed = live.filter((i) => i.category === 'top' && used.has(i.id)).length, tops = live.filter((i) => i.category === 'top').length;
  const hint = recent.length >= 8 && tops >= 6 && topsUsed / tops < 0.5 ? `You wore ${topsUsed} of ${tops} tops this month: the rest could go, or get a turn.` : '';
  const row = (i, txt) => `<div><span class="thumb"><img src="${imgSrc(i)}" alt=""></span><span style="flex:1">${esc(i.color)} ${esc(i.type)}</span><b>${txt}</b></div>`;

  view.innerHTML = `<h1>History</h1>
    <div class="head" style="margin:8px 0"><button class="icon-btn" id="prev" aria-label="Previous month">‹</button>
      <b>${first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b>
      <button class="icon-btn" id="next" aria-label="Next month">›</button></div>
    <div class="cal">${'MTWTFSS'.split('').map((c) => `<div class="dow">${c}</div>`).join('')}${cells.join('')}</div>
    <h2>Last 30 days</h2><div class="kv"><div><b>${recent.length}</b><span>days logged</span></div><div><b>${pct}%</b><span>of closet used</span></div>
      <div><b>${used.size}</b><span>pieces worn</span></div></div>
    <div class="list">${Object.entries(byCat).map(([c, v]) => `<div><span style="flex:1">${esc(c)} (${v.n})</span><b>${v.w} wear${v.w === 1 ? '' : 's'}</b></div>`).join('')}</div>
    ${hint ? `<p class="note" style="margin-top:8px">${hint}</p>` : ''}
    ${priced.length ? `<h2>Cost per wear</h2><div class="list">${priced.slice(0, 5).map((i) => row(i, '₹' + Math.round(i.price / i.wearCount))).join('')}</div>` : ''}
    <h2>Most worn</h2><div class="list">${sorted.filter((i) => i.wearCount).slice(0, 5).map((i) => row(i, i.wearCount + '×')).join('') || '<div class="muted">Nothing logged yet</div>'}</div>
    <h2>Not worn in 30+ days</h2><div class="list">${stale.slice(0, 8).map((i) => row(i, i.lastWorn ? niceDate(i.lastWorn) : 'never')).join('') || '<div class="muted">All worn recently</div>'}</div>`;

  const shift = (d) => { const t = new Date(month.y, month.m + d, 1); month = { y: t.getFullYear(), m: t.getMonth() }; render(view); };
  $('#prev', view).onclick = () => shift(-1);
  $('#next', view).onclick = () => shift(1);
  view.querySelectorAll('.day[data-date]').forEach((b) => (b.onclick = () => {
    const e = logOf.get(b.dataset.date);
    if (!e) return b.dataset.date <= today && logDay(b.dataset.date, items, () => render(view));
    const set = e.items.map((id) => byId.get(id)).filter(Boolean);
    const p = openSheet(`<h2 style="margin-top:4px">${niceDate(e.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
      <div style="margin-top:8px">${collage(set)}</div><p class="outfit-names">${set.map((i) => `${esc(i.color)} ${esc(i.type)}`).join(' · ')}</p>
      <p class="muted" style="margin:12px 0">${esc(e.dayType)} day</p><button class="btn block" id="rm">Remove this entry</button>`);
    $('#rm', p).onclick = async () => { if (!confirm('Remove this outfit from the log?')) return; await unwear(e.date); closeSheet(); render(view); };
  }));
}

// Log a day you forgot: pick a top, bottom and (optionally) shoes.
function logDay(date, items, done) {
  const live = items.filter((i) => !i.archived);
  const pick = (cat, label, need) => `<span class="lbl">${label}</span><div class="pick" data-c="${cat}" data-need="${need}">${live.filter((i) => cat.split(',').includes(i.category))
    .map((i) => `<button class="thumb-btn" data-id="${i.id}" aria-pressed="false" aria-label="${esc(i.color)} ${esc(i.type)}"><img src="${imgSrc(i)}" alt=""></button>`).join('') || '<span class="muted">None</span>'}</div>`;
  const p = openSheet(`<h2 style="margin-top:4px">What did you wear on ${niceDate(date)}?</h2>
    ${pick('top,ethnic', 'Top', 1)}${pick('bottom', 'Bottom', 1)}${pick('shoes', 'Shoes (optional)', 0)}
    <button class="btn primary block" id="lg" style="margin-top:12px">Log it</button>`);
  p.querySelectorAll('.pick').forEach((row) => row.querySelectorAll('button').forEach((b) => (b.onclick = () =>
    row.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b && x.getAttribute('aria-pressed') !== 'true')))));
  $('#lg', p).onclick = async () => {
    const rows = [...p.querySelectorAll('.pick')], sel = rows.map((r) => r.querySelector('[aria-pressed=true]')?.dataset.id);
    if (rows.some((r, k) => r.dataset.need === '1' && !sel[k])) return toast('Pick a top and a bottom');
    // Wearing a past day shouldn't mark today's clean clothes as worn: keep their status.
    const set = sel.filter(Boolean).map((id) => items.find((i) => i.id === id));
    await wear(date, set, 'normal');
    for (const i of set) { const now = (await getAll('items')).find((x) => x.id === i.id); await put('items', { ...now, status: i.status, uses: i.uses || 0, lastWorn: [now.lastWorn, i.lastWorn].filter(Boolean).sort().pop() }); }
    closeSheet(); toast('Logged'); done();
  };
}
