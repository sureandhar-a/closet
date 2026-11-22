// Bundle import (laptop -> phone). Bundle owns tags + image; phone keeps wear state.
import { getAll, putMany, getKV, setKV, clear, getSettings, saveSettings } from './db.js';

const WEAR_FIELDS = ['status', 'wearCount', 'lastWorn', 'neverWith', 'archived'];
const TAG_FIELDS = ['category', 'type', 'color', 'colorHex', 'formality', 'pattern', 'sleeves', 'tagSource', 'editedAt'];
const FRESH = { status: 'clean', wearCount: 0, lastWorn: null, neverWith: [], archived: false };

export async function importBundle(b) {
  if (b?.kind !== 'closet-bundle' || !Array.isArray(b.items)) throw new Error('Not a closet bundle file');
  const have = new Map((await getAll('items')).map((i) => [i.id, i]));
  const items = b.items.map((n) => {
    const old = have.get(n.id);
    const keep = old ? Object.fromEntries(WEAR_FIELDS.map((k) => [k, old[k]])) : {};
    // Laptop's 'done' wins only if it is newer work; a pending phone request survives an import that didn't process it.
    if (old?.editedAt > (n.editedAt || 0)) for (const k of TAG_FIELDS) keep[k] = old[k]; // phone edit not on the laptop yet
    if (old?.beautify === 'requested' && !(n.beautify === 'done' && n.beautifiedAt && n.beautifiedAt > (old.requestedAt || 0))) keep.beautify = 'requested';
    return { ...FRESH, ...n, ...keep, updated: Date.now() };
  });
  await putMany('items', items);
  if (b.plan) await setKV('plan', b.plan);
  if (b.upload?.url) await saveSettings({ ...(await getSettings()), upload: b.upload });
  return { added: items.filter((i) => !have.has(i.id)).length, updated: items.filter((i) => have.has(i.id)).length };
}

// Phone -> laptop: small log file (no images). Full backup includes images.
export async function buildLog() {
  const [items, log, settings] = await Promise.all([getAll('items'), getAll('log'), getSettings()]);
  const { upload, ...safe } = settings; // the Drive link + secret never go into exported files
  return { kind: 'closet-log', exported: new Date().toISOString(), settings: safe, log,
    // Tags go along so the laptop can keep your edits and see the phone's first guess for new photos.
    items: items.map((i) => ({ id: i.id, status: i.status, wearCount: i.wearCount, lastWorn: i.lastWorn, archived: i.archived, beautify: i.beautify,
      ...Object.fromEntries(TAG_FIELDS.map((k) => [k, i[k]]).filter(([, v]) => v !== undefined)) })) };
}
export async function buildBackup() {
  const [items, log, settings, plan] = await Promise.all([getAll('items'), getAll('log'), getSettings(), getKV('plan', null)]);
  const { upload, ...safe } = settings;
  // A pending upload is a File, which JSON can't hold ({} after restore would break the Upload button): leave it out.
  return { kind: 'closet-backup', exported: new Date().toISOString(), items: items.map(({ pendingUpload, ...i }) => i), log, settings: safe, plan };
}
// Replaces everything on the phone with the backup.
export async function restoreBackup(b) {
  if (b?.kind !== 'closet-backup' || !Array.isArray(b.items) || !Array.isArray(b.log)) throw new Error('Not a closet backup file');
  await clear('items'); await clear('log');
  await putMany('items', b.items); await putMany('log', b.log);
  await saveSettings({ ...b.settings, upload: (await getSettings()).upload }); // keep this phone's Drive connection
  if (b.plan) await setKV('plan', b.plan);
  return { items: b.items.length, log: b.log.length };
}

// Share sheet with a file (Save to Files -> Drive); falls back to a download.
export async function shareJson(obj, name) {
  const file = new File([JSON.stringify(obj)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return 'downloaded';
}

// One-tap sync through your Apps Script (tools/drive-upload.gs): send wear log, then fetch the latest bundle.
export async function syncWithDrive() {
  const s = await getSettings();
  if (!s.upload?.url) throw new Error('Connect to Drive first');
  const call = async (body) => {
    const r = await fetch(s.upload.url, { method: 'POST', body: JSON.stringify({ secret: s.upload.secret, ...body }) });
    return r.json();
  };
  const sent = await call({ action: 'putLog', log: await buildLog() });
  if (!sent.ok) throw new Error(sent.error === 'bad name' ? 'Drive script is old: paste the new one and redeploy' : sent.error || 'Could not send log');
  const b = await call({ action: 'getBundle' });
  if (b.ok === false) throw new Error(b.error);
  const res = await importBundle(b);
  await saveSettings({ ...(await getSettings()), lastSync: new Date().toISOString() });
  return res;
}

// Setup code = base64 of {url, secret}; made on the laptop (see README).
export async function connectWithCode(code) {
  let c;
  try { c = JSON.parse(atob(code.trim())); } catch { throw new Error('That is not a setup code'); }
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(c.url || '') || !c.secret) throw new Error('That is not a setup code');
  await saveSettings({ ...(await getSettings()), upload: { url: c.url, secret: c.secret } });
}
