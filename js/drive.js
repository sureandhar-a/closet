// Send photos to Google Drive "Closet".
// 1st choice: your own Apps Script (tools/drive-upload.gs); its link + secret arrive with the laptop bundle.
// Fallback: iOS share sheet (Drive app → folder Closet, needs HTTPS).
// Names p-<ts>[_b].<ext> let the laptop keep the same id; _b = beautify requested.
// Returns 'shared' | 'cancelled' | 'unsupported'.
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

export async function uploadBatchToDrive(files, ids, beautify) {
  if (!files?.length) return 'unsupported';
  let out = files.map((f, i) => named(f, ids[i], beautify));
  const { upload } = await getSettings();
  if (upload?.url) {
    try {
      while (out.length) { await viaScript(out[0], upload); out = out.slice(1); } // uploaded files leave the list
      return 'shared';
    } catch (e) {
      console.warn('Script upload failed, trying share sheet for the rest:', e); // no second copy of those already in Drive
    }
  }
  if (!navigator.canShare?.({ files: out })) return 'unsupported';
  try { await navigator.share({ files: out }); return 'shared'; }
  catch (e) { return e.name === 'AbortError' ? 'cancelled' : 'unsupported'; }
}

export const uploadToDrive = (file, id, beautify) => uploadBatchToDrive(file ? [file] : [], [id], beautify);
