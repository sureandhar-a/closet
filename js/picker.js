// Pure outfit rules. No DOM/db imports so it runs in the browser and in Node.
const DAY = 864e5;
const FORMALITY = { meeting: ['formal'], normal: ['formal', 'smart-casual'], casual: ['smart-casual', 'casual'] };
// Bottoms are looser (few formal pairs): office days just skip casual ones like joggers.
const BOTTOM_FORMALITY = { meeting: ['formal', 'smart-casual'], normal: ['formal', 'smart-casual'], casual: ['formal', 'smart-casual', 'casual'] };
export const DAY_TYPES = ['normal', 'meeting', 'casual', 'ethnic'];

const days = (a, b) => Math.round((Date.UTC(...a.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) - Date.UTC(...b.split('-').map((n, i) => (i === 1 ? n - 1 : +n)))) / DAY);
const lum = (hex = '#888888') => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const comboKey = (t, b) => `${t.id}+${b.id}`;

export function pickOutfit({ items, log = [], date, weather = {}, dayType = 'normal', settings = {}, skip = [], exclude = [] }) {
  const N = settings.noRepeatDays ?? 10, C = settings.comboNoRepeatDays ?? 7;
  const live = items.filter((i) => !i.archived && i.status !== 'laundry');

  // Last-worn per item from the log (item.lastWorn as fallback); only days before `date` count as history.
  const last = new Map();
  for (const i of items) if (i.lastWorn) last.set(i.id, i.lastWorn);
  for (const e of log) for (const id of e.items) if (e.date <= date && (!last.has(id) || e.date > last.get(id))) last.set(id, e.date);
  const since = (i) => (last.has(i.id) ? days(date, last.get(i.id)) : 999);
  const comboSince = (t, b) => Math.min(...log.filter((e) => e.date <= date && e.items.includes(t.id) && e.items.includes(b.id)).map((e) => days(date, e.date)), 999);

  // Tops and bottoms filter by formality. Ethnic falls back to normal if none exist.
  let type = dayType, reasons = [];
  let tops = type === 'ethnic' ? live.filter((i) => i.category === 'ethnic') : [];
  if (!tops.length) {
    if (type === 'ethnic') { reasons.push('No ethnic wear yet, using a normal outfit'); type = 'normal'; }
    tops = live.filter((i) => i.category === 'top' && FORMALITY[type].includes(i.formality));
  }
  tops = tops.filter((t) => !exclude.includes(t.id)); // ids already offered (e.g. suggestion #1)
  const allBottoms = live.filter((i) => i.category === 'bottom');
  let bottoms = allBottoms.filter((i) => BOTTOM_FORMALITY[type].includes(i.formality));
  if (!bottoms.length && allBottoms.length) { bottoms = allBottoms; reasons.push('No office-ready bottoms clean, using a casual pair'); }
  const max = weather.max, rain = weather.rain;
  const hot = max >= 32, wet = rain >= 60, cold = max <= 15;

  const bonus = (i) => {
    let s = i.status === 'worn' ? -100 : 0; // prefer clean; worn is a fallback
    if (hot && i.category !== 'bottom') s += (i.sleeves === 'half' ? 30 : 0) + (lum(i.colorHex) > 150 ? 20 : 0);
    if (wet && i.category === 'bottom') s += lum(i.colorHex) < 60 ? 30 : 0;
    return s;
  };
  const score = (i) => since(i) + bonus(i) + (hash(date + i.id) % 100) / 1000; // hash = stable tie-break

  // Relaxation ladder. Worn tops only at the last rung; worn bottoms are always allowed (penalised).
  const levels = [
    { combo: C, rep: N, wornTop: false },
    { combo: 0, rep: N, wornTop: false, note: 'Dropped the combo-repeat rule' },
    { combo: 0, rep: Math.floor(N / 2), wornTop: false, note: 'Shorter no-repeat window' },
    { combo: 0, rep: 0, wornTop: true, note: 'Reusing recently worn items' },
  ];
  for (const L of levels) {
    const T = tops.filter((t) => (t.status === 'clean' || L.wornTop) && since(t) >= L.rep);
    let best = null;
    for (const t of T) for (const b of bottoms) {
      if (t.neverWith?.includes(b.id) || b.neverWith?.includes(t.id)) continue;
      if (skip.includes(comboKey(t, b))) continue;
      if (L.combo && comboSince(t, b) < L.combo) continue;
      const s = score(t) + score(b);
      if (!best || s > best.s) best = { t, b, s };
    }
    if (!best) continue;
    const { t, b } = best;
    const out = { top: t, bottom: b, reasons: [...reasons] };
    if (L.note) out.reasons.push(L.note);
    if (b.status === 'worn') out.reasons.push('No clean bottoms, reusing a worn pair');
    if (wet && lum(b.colorHex) < 60) out.reasons.push(`Rain ${rain}%: dark bottoms`);
    if (hot && t.sleeves === 'half') out.reasons.push(`${max}°C: half sleeves`);
    out.reasons.push(since(t) >= 999 ? 'Top not worn yet' : `Top not worn for ${since(t)} days`);
    if (cold) { const l = live.filter((i) => i.category === 'layer').sort((x, y) => score(y) - score(x))[0]; if (l) { out.layer = l; out.reasons.push(`${max}°C: add a layer`); } }
    const sh = live.filter((i) => i.category === 'shoes' && !t.neverWith?.includes(i.id)).sort((x, y) => score(y) - score(x))[0];
    if (sh) out.shoes = sh;
    const ac = live.filter((i) => i.category === 'accessory').sort((x, y) => score(y) - score(x))[0];
    if (ac) out.accessory = ac; // one accessory; the longest-unworn one
    return out;
  }
  return { missing: tops.length ? 'bottom' : 'top', reasons };
}
