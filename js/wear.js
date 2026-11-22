// Log / un-log a day's outfit and keep item counters in step.
import { getAll, put, del, getSettings } from './db.js';

// Shoes, accessories and layers aren't washed after one wear: they stay clean, only the counters move.
export const WASHABLE = ['top', 'bottom', 'ethnic'];

// Tops become 'worn' after one wear; bottoms after settings.bottomWears wears (jeans aren't washed daily).
export async function wear(date, set, dayType) {
  const { bottomWears = 3 } = await getSettings();
  for (const i of set) {
    const uses = (i.uses || 0) + 1, limit = i.category === 'bottom' ? bottomWears : 1;
    const status = WASHABLE.includes(i.category) && uses >= limit ? 'worn' : i.status;
    await put('items', { ...i, status, uses: WASHABLE.includes(i.category) ? uses : 0, wearCount: i.wearCount + 1, lastWorn: date, updated: Date.now() });
  }
  await put('log', { date, items: set.map((i) => i.id), dayType, prev: Object.fromEntries(set.map((i) => [i.id, i.status])), prevUses: Object.fromEntries(set.map((i) => [i.id, i.uses || 0])) });
}

export async function unwear(date) {
  const [items, log] = await Promise.all([getAll('items'), getAll('log')]);
  const e = log.find((x) => x.date === date);
  if (!e) return;
  for (const id of e.items) {
    const i = items.find((x) => x.id === id);
    if (!i) continue;
    const prev = log.filter((x) => x.date !== date && x.items.includes(id)).map((x) => x.date).sort().pop() ?? null;
    // Status from before this wear (older entries have no record: assume clean).
    await put('items', { ...i, status: e.prev?.[id] ?? 'clean', uses: e.prevUses?.[id] ?? 0, wearCount: Math.max(0, i.wearCount - 1), lastWorn: prev, updated: Date.now() });
  }
  await del('log', date);
}

// Washing resets the count of wears since the last wash.
export const setStatus = (item, status) => put('items', { ...item, status, ...(status === 'clean' ? { uses: 0 } : {}), updated: Date.now() });
