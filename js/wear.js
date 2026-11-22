// Log / un-log a day's outfit and keep item counters in step.
import { getAll, put, del } from './db.js';

// Shoes, accessories and layers aren't washed after one wear: they stay clean, only the counters move.
export const WASHABLE = ['top', 'bottom', 'ethnic'];

export async function wear(date, set, dayType) {
  for (const i of set) await put('items', { ...i, status: WASHABLE.includes(i.category) ? 'worn' : i.status, wearCount: i.wearCount + 1, lastWorn: date, updated: Date.now() });
  await put('log', { date, items: set.map((i) => i.id), dayType, prev: Object.fromEntries(set.map((i) => [i.id, i.status])) });
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
    await put('items', { ...i, status: e.prev?.[id] ?? 'clean', wearCount: Math.max(0, i.wearCount - 1), lastWorn: prev, updated: Date.now() });
  }
  await del('log', date);
}
