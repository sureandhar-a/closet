// IndexedDB storage. Stores: items (id), log (date), kv (key) for settings/plan.
const DB = 'closet';
let dbp;

function open() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('items', { keyPath: 'id' });
      db.createObjectStore('log', { keyPath: 'date' });
      db.createObjectStore('kv', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = t.onabort = () => rej(t.error);
  });
}

export const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
export const put = (store, val) => tx(store, 'readwrite', (s) => s.put(val));
export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key));
export const clear = (store) => tx(store, 'readwrite', (s) => s.clear());
export const putMany = (store, vals) => tx(store, 'readwrite', (s) => vals.forEach((v) => s.put(v)));

export async function getKV(key, fallback) {
  const r = await tx('kv', 'readonly', (s) => s.get(key));
  return r ? r.value : fallback;
}
export const setKV = (key, value) => put('kv', { key, value });

export const DEFAULT_SETTINGS = {
  name: '',
  place: null, // {name, lat, lon}
  dayTypes: { 1: 'normal', 2: 'normal', 3: 'normal', 4: 'normal', 5: 'casual', 6: 'casual', 0: 'casual' },
  noRepeatDays: 10,
  comboNoRepeatDays: 7,
  eveningHour: 18,
  avatar: null, // {skin, hair}; null = defaults
};
export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...(await getKV('settings', {})) };
}
export const saveSettings = (s) => setKV('settings', s);

// Ask Safari not to evict our data (best effort).
navigator.storage?.persist?.();
