// Upload pipeline: storage file + submit_upload RPC, with an offline queue.
// When there is no signal the photo is kept on the phone (IndexedDB) and sent
// automatically when the connection comes back.
//
// PHASE 2: photos move to their permanent store. Only putFile/removeFiles/signedUrl(s) change.
import { get, set } from 'idb-keyval';
import { supabase } from './supabase';

const BUCKET = 'uploads';
const QKEY = 'sbh-queue-v1';
const EVT = 'sbh-queue';

const rid = () => (crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 10);
const pad2 = (n) => String(n).padStart(2, '0');
export const isNetErr = (e) =>
  !navigator.onLine || /Failed to fetch|NetworkError|Load failed|network|timed? ?out|fetch/i.test(e?.message || '');

export function buildPath(uid, kind, meta, mime) {
  const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
  if (kind === 'kunjungan') return `${uid}/kunjungan/${meta.year}-w${pad2(meta.week)}/${meta.nks}_${meta.no_urut}_${rid()}.${ext}`;
  if (kind === 'supervisi') return `${uid}/supervisi/${meta.year}-w${pad2(meta.week)}/${meta.nks}_${rid()}.${ext}`;
  return `${uid}/${kind}/${rid()}.${ext}`;
}

// ---------- storage primitives (swap these for the VPS in phase 2) ----------
async function putFile(path, blob, mime) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mime, upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) throw error; // already there = earlier partial retry
}
export async function removeFiles(paths) {
  const list = paths.filter(Boolean);
  if (list.length) await supabase.storage.from(BUCKET).remove(list);
}
const urlCache = new Map(); // path -> {url, exp}
export async function signedUrl(path) {
  if (!path) return null;
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60000 });
  return data.signedUrl;
}
export async function signedUrls(paths) {
  const need = [...new Set(paths.filter((p) => p && !(urlCache.get(p)?.exp > Date.now())))];
  for (let i = 0; i < need.length; i += 100) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(need.slice(i, i + 100), 3600);
    (data || []).forEach((d) => d.signedUrl && urlCache.set(d.path, { url: d.signedUrl, exp: Date.now() + 50 * 60000 }));
  }
  const out = {};
  paths.forEach((p) => { if (p) out[p] = urlCache.get(p)?.url || null; });
  return out;
}

// ---------- one send attempt ----------
async function sendJob(job) {
  await putFile(job.path, job.blob, job.mime);
  const { data, error } = await supabase.rpc('submit_upload', job.args);
  if (error) {
    if (!isNetErr(error)) await removeFiles([job.path]); // rejected by the server: clean up the orphan file
    throw error;
  }
  if (data?.replaced_path) removeFiles([data.replaced_path]).catch(() => {});
  return data.upload;
}

/**
 * Submit a photo/scan.
 * kind: 'kunjungan' | 'surat_tugas' | 'supervisi'
 * meta: { ruta_id, nks, no_urut, year, week, lat, lng, acc, taken_at, label }
 * Returns { upload } on success, { queued: true } when saved for later. Throws on server refusal.
 */
export async function submitUpload({ uid, kind, blob, mime, meta = {} }) {
  const path = buildPath(uid, kind, meta, mime);
  const job = {
    id: rid(), uid, kind, path, blob, mime, label: meta.label || '', createdAt: Date.now(),
    key: kind === 'kunjungan' ? `${meta.ruta_id}:${meta.year}:${meta.week}` : kind,
    args: {
      p_kind: kind, p_file_path: path,
      p_ruta_id: meta.ruta_id ?? null, p_nks: meta.nks ?? null,
      p_year: meta.year ?? null, p_week: meta.week ?? null,
      p_lat: meta.lat ?? null, p_lng: meta.lng ?? null, p_acc: meta.acc ?? null,
      p_taken_at: meta.taken_at ?? new Date().toISOString(), p_size: blob.size, p_mime: mime,
    },
  };
  if (!navigator.onLine) { await enqueue(job); return { queued: true }; }
  try {
    return { upload: await sendJob(job) };
  } catch (e) {
    if (isNetErr(e)) { await enqueue(job); return { queued: true }; }
    throw e;
  }
}

// ---------- offline queue ----------
async function readQ() { return (await get(QKEY)) || []; }
async function writeQ(q) { await set(QKEY, q); window.dispatchEvent(new Event(EVT)); }

async function enqueue(job) {
  const q = (await readQ()).filter((j) => !(j.uid === job.uid && j.key === job.key && job.kind !== 'supervisi'));
  q.push(job);
  await writeQ(q);
}

export async function queuedFor(uid) { return (await readQ()).filter((j) => j.uid === uid); }

let flushing = false;
/** Try to send everything queued for this user. Returns {sent, failed:[{label,error}]}. */
export async function flushQueue(uid) {
  if (flushing || !navigator.onLine) return { sent: 0, failed: [] };
  flushing = true;
  let sent = 0; const failed = [];
  try {
    for (const job of await queuedFor(uid)) {
      try {
        await sendJob(job);
        sent++;
        await writeQ((await readQ()).filter((j) => j.id !== job.id));
      } catch (e) {
        if (isNetErr(e)) break; // still offline: stop, keep the rest
        failed.push({ label: job.label, error: e.message });
        await writeQ((await readQ()).filter((j) => j.id !== job.id)); // server said no: drop it
      }
    }
  } finally { flushing = false; }
  return { sent, failed };
}

export function onQueueChange(fn) {
  window.addEventListener(EVT, fn);
  return () => window.removeEventListener(EVT, fn);
}
