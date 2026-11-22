// Pure outfit rules. No DOM/db imports so it runs in the browser and in Node.
const DAY = 864e5;
const FORMALITY = { meeting: ['formal'], normal: ['formal', 'smart-casual'], casual: ['smart-casual', 'casual'] };
// Bottoms, shoes, layers and accessories are looser (few formal ones): office days just skip casual ones like joggers or sandals.
const LOOSE = { meeting: ['formal', 'smart-casual'], normal: ['formal', 'smart-casual'], casual: ['formal', 'smart-casual', 'casual'] };
export const DAY_TYPES = ['normal', 'meeting', 'casual', 'ethnic'];
const RANK = { formal: 0, 'smart-casual': 1, casual: 2 };
const gap = (a, b) => Math.abs((RANK[a?.formality] ?? 1) - (RANK[b?.formality] ?? 1)); // formality steps apart
// Leather family from the colour name (multi-colour hexes average to grey, so names are more reliable).
const fam = (i) => (/brown|tan/.test(i?.color || '') ? 'brown' : /^black/.test(i?.color || '') ? 'black' : '');
const AGE_CAP = 30; // "not worn for 30+ days" all count the same, so weather and colour can still matter

const days = (a, b) => Math.round((Date.UTC(...a.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) - Date.UTC(...b.split('-').map((n, i) => (i === 1 ? n - 1 : +n)))) / DAY);
export const lum = (hex = '#888888') => { const n = parseInt(hex.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const comboKey = (t, b) => `${t.id}+${b.id}`;
const prefer = (list, keep) => { const k = list.filter(keep); return k.length ? k : list; }; // filter, unless it empties the list

// lock = {top|bottom|shoes|layer|accessory: id}: keep that piece. exclude = ids to avoid when there is another choice.
export function pickOutfit({ items, log = [], date, weather = {}, dayType = 'normal', settings = {}, skip = [], exclude = [], lock = {} }) {
  const N = settings.noRepeatDays ?? 10, C = settings.comboNoRepeatDays ?? 7;
  const live = items.filter((i) => !i.archived && i.status !== 'laundry');
  const byId = (id) => items.find((i) => i.id === id);

  // Last-worn per item from the log (item.lastWorn as fallback); only days before `date` count as history.
  const last = new Map();
  for (const i of items) if (i.lastWorn) last.set(i.id, i.lastWorn);
  for (const e of log) for (const id of e.items) if (e.date <= date && (!last.has(id) || e.date > last.get(id))) last.set(id, e.date);
  const since = (i) => (last.has(i.id) ? days(date, last.get(i.id)) : 999);
  const comboSince = (t, b) => Math.min(...log.filter((e) => e.date <= date && e.items.includes(t.id) && e.items.includes(b.id)).map((e) => days(date, e.date)), 999);

  // Tops filter strictly by formality; the rest loosely. Ethnic falls back to normal if none exist.
  let type = dayType, reasons = [];
  let tops = type === 'ethnic' ? live.filter((i) => i.category === 'ethnic') : [];
  if (!tops.length) {
    if (type === 'ethnic') { reasons.push('No ethnic wear yet, using a normal outfit'); type = 'normal'; }
    tops = live.filter((i) => i.category === 'top' && FORMALITY[type].includes(i.formality));
  }
  tops = lock.top ? [byId(lock.top)].filter(Boolean) : tops.filter((t) => !exclude.includes(t.id)); // ids already offered (e.g. suggestion #1)
  const allBottoms = live.filter((i) => i.category === 'bottom');
  let bottoms = allBottoms.filter((i) => LOOSE[type].includes(i.formality));
  if (!bottoms.length && allBottoms.length) { bottoms = allBottoms; reasons.push('No office-ready bottoms clean, using a casual pair'); }
  bottoms = lock.bottom ? [byId(lock.bottom)].filter(Boolean) : prefer(bottoms, (b) => !exclude.includes(b.id));
  const max = weather.max, rain = weather.rain;
  const hot = max >= 32, wet = rain >= 60, cold = max <= 15;

  const bonus = (i) => {
    let s = i.status === 'worn' ? -100 : 0; // prefer clean; worn is a fallback
    if (i.needsPhoto) s -= 20; // raw phone photo not cleaned on the laptop yet
    if (hot && i.category !== 'bottom') s += (i.sleeves === 'half' ? 30 : 0) + (lum(i.colorHex) > 150 ? 20 : 0);
    if (wet && i.category === 'bottom') s += lum(i.colorHex) < 60 ? 30 : 0;
    return s;
  };
  const score = (i) => Math.min(since(i), AGE_CAP) + bonus(i) + (hash(date + i.id) % 100) / 1000; // hash = stable tie-break
  // Colour: a top and bottom of about the same lightness (navy on black) look flat.
  const clash = (t, b) => (Math.abs(lum(t.colorHex) - lum(b.colorHex)) < 40 ? 25 : 0);

  // Relaxation ladder. Worn tops only at the last rung; worn bottoms are always allowed (penalised).
  const levels = [
    { combo: C, rep: N, wornTop: false },
    { combo: 0, rep: N, wornTop: false, note: 'Dropped the combo-repeat rule' },
    { combo: 0, rep: Math.floor(N / 2), wornTop: false, note: 'Shorter no-repeat window' },
    { combo: 0, rep: 0, wornTop: true, note: 'Reusing recently worn items' },
  ];
  for (const L of levels) {
    const T = tops.filter((t) => lock.top || ((t.status === 'clean' || L.wornTop) && since(t) >= L.rep));
    let best = null;
    for (const t of T) for (const b of bottoms) {
      if (t.neverWith?.includes(b.id) || b.neverWith?.includes(t.id)) continue;
      if (skip.includes(comboKey(t, b))) continue;
      if (L.combo && comboSince(t, b) < L.combo) continue;
      const s = score(t) + score(b) - clash(t, b); // no formality term here: it made the same pairs repeat (simulate.mjs)
      if (!best || s > best.s) best = { t, b, s };
    }
    if (!best) continue;
    const { t, b } = best;
    const out = { top: t, bottom: b, reasons: [...reasons] };
    if (L.note && !lock.top) out.reasons.push(L.note);
    if (b.status === 'worn') out.reasons.push('No clean bottoms, reusing a worn pair');
    if (wet && lum(b.colorHex) < 60 && bottoms.some((x) => lum(x.colorHex) >= 60)) out.reasons.push(`Rain ${rain}%: dark bottoms`);
    if (hot && t.sleeves === 'half') out.reasons.push(`${max}°C: half sleeves`);
    if (max != null && !hot && !wet && !cold) out.reasons.push(`${max}°, rain ${rain ?? 0}%: no weather change needed`);
    out.reasons.push(since(t) >= 999 ? 'Top not worn yet' : `Top not worn for ${since(t)} days`);
    // One of each extra, the longest-unworn that fits the day; a different one from `exclude` when possible.
    // fit(i) = how well it goes with the rest; rotation (score) still dominates. Returns [best, best ignoring fit].
    const extra = (cat, fit = () => 0) => {
      if (lock[cat]) return [byId(lock[cat]), byId(lock[cat])];
      let l = live.filter((i) => i.category === cat && !t.neverWith?.includes(i.id) && !b.neverWith?.includes(i.id));
      l = prefer(prefer(l, (i) => LOOSE[type].includes(i.formality)), (i) => !exclude.includes(i.id));
      const best = (f) => [...l].sort((x, y) => score(y) + f(y) - score(x) - f(x))[0];
      return [best(fit), best(() => 0)];
    };
    // Shoes: same formality as the top; no light shoes in rain; not the same leather shade as the trousers.
    const rainShoe = (i) => (wet && lum(i.colorHex) > 150 ? -20 : 0);
    const shoeFit = (i) => -5 * (gap(i, t) + gap(i, b)) + rainShoe(i) - (fam(i) && fam(i) === fam(b) && Math.abs(lum(i.colorHex) - lum(b.colorHex)) < 30 ? 10 : 0);
    if (cold || settings.coldOffice || lock.layer) {
      const [l] = extra('layer', (i) => -4 * gap(i, t));
      if (l) { out.layer = l; if (!lock.layer) out.reasons.push(cold ? `${max}°C: add a layer` : 'Cold office: add a layer'); }
    }
    const [sh, sh0] = extra('shoes', shoeFit);
    if (sh) out.shoes = sh;
    if (sh && sh0 && sh !== sh0 && rainShoe(sh0) && !rainShoe(sh)) out.reasons.push(`Rain ${rain}%: darker shoes`);
    // Watch: a leather strap should be the same family as the shoes (brown with brown, black with black).
    const strap = (i) => (/brown strap/.test(i.color) ? 'brown' : /black strap/.test(i.color) ? 'black' : '');
    const [ac] = extra('accessory', (i) => (!strap(i) || !fam(sh) ? 0 : strap(i) === fam(sh) ? 8 : -15) - 4 * gap(i, t));
    if (ac) out.accessory = ac;
    return out;
  }
  return { missing: tops.length ? 'bottom' : 'top', reasons, type };
}
