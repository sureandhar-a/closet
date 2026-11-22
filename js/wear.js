// Log / un-log a day's outfit and keep item counters in step.
import { getAll, put, del } from './db.js';

export async function wear(date, set, dayType) {
  for (const i of set) await put('items', { ...i, status: 'worn', wearCount: i.wearCount + 1, lastWorn: date, updated: Date.now() });
  await put('log', { date, items: set.map((i) => i.id), dayType });
}

export async function unwear(date) {
  const [items, log] = await Promise.all([getAll('items'), getAll('log')]);
  const e = log.find((x) => x.date === date);
  if (!e) return;
  for (const id of e.items) {
    const i = items.find((x) => x.id === id);
    if (!i) continue;
    const prev = log.filter((x) => x.date !== date && x.items.includes(id)).map((x) => x.date).sort().pop() ?? null;
    await put('items', { ...i, status: 'clean', wearCount: Math.max(0, i.wearCount - 1), lastWorn: prev, updated: Date.now() });
  }
  await del('log', date);
}
