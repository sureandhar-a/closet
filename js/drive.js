// Send photos to Google Drive "Closet".
// 1st choice: your own Apps Script (tools/drive-upload.gs); its link + secret arrive with the laptop bundle.
// Fallback: iOS share sheet (Drive app → folder Closet, needs HTTPS).
// Names p-<ts>[_b].<ext> let the laptop keep the same id; _b = beautify requested.
// Returns {status: 'shared' | 'cancelled' | 'unsupported', sent: ids that reached Drive}.
import { getSettings } from './db.js';

function named(file, id, beautify) {
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  return new File([file], `${id}${beautify ? '_b' : ''}.${ext}`, { type: file.type || 'image/jpeg' });
}

const b64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(file);
});

async function viaScript(f, up) {
  // text/plain body = "simple" request, so no CORS preflight (Apps Script can't answer one).
  const r = await fetch(up.url, { method: 'POST', body: JSON.stringify({ secret: up.secret, name: f.name, type: f.type, data: await b64(f) }) });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'upload failed');
}

// beautify: one flag per file (or one for all). shareFirst: skip the script (a fresh tap, so iOS allows the share sheet).
export async function uploadBatchToDrive(files, ids, beautify, { onProgress, shareFirst } = {}) {
  if (!files?.length) return { status: 'unsupported', sent: [] };
  const flag = (i) => (Array.isArray(beautify) ? beautify[i] : beautify);
  let todo = files.map((f, i) => ({ id: ids[i], file: named(f, ids[i], flag(i)) }));
  const sent = [];
  const { upload } = await getSettings();
  if (upload?.url && !shareFirst) {
    try {
      for (const t of [...todo]) { onProgress?.(sent.length + 1, files.length); await viaScript(t.file, upload); sent.push(t.id); todo = todo.slice(1); }
      return { status: 'shared', sent };
    } catch (e) {
      // iOS allows the share sheet only straight after a tap, and the upload took time: leave the rest pending
      // (item → ☁️ Upload, a fresh tap, opens the share sheet).
      console.warn('Script upload failed:', e);
      return { status: 'unsupported', sent };
    }
  }
  const out = todo.map((t) => t.file);
  if (!navigator.canShare?.({ files: out })) return { status: 'unsupported', sent };
  try { await navigator.share({ files: out }); return { status: 'shared', sent: ids }; }
  catch (e) { return { status: e.name === 'AbortError' ? 'cancelled' : 'unsupported', sent }; }
}

export const uploadToDrive = (file, id, beautify, o) => uploadBatchToDrive(file ? [file] : [], [id], beautify, o);
