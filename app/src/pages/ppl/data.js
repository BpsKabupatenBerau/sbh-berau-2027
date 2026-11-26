import { supabase } from '../../lib/supabase';
import { queuedFor } from '../../lib/uploads';

/** Active ruta the signed-in PPL/PML is assigned to (RLS limits rows), with NKS info. */
export async function loadMyRuta() {
  const [{ data: nks, error: e1 }, { data: ruta, error: e2 }] = await Promise.all([
    supabase.from('nks').select('nks, kecamatan, desa, sls, sub, ppl_id, pml_id').order('nks'),
    supabase.from('ruta').select('id, nks, no_urut, nama_krt, alamat').eq('active', true).order('nks').order('no_urut'),
  ]);
  if (e1 || e2) throw e1 || e2;
  const info = Object.fromEntries((nks || []).map((n) => [n.nks, n]));
  return { nks: nks || [], ruta: (ruta || []).map((r) => ({ ...r, info: info[r.nks] })) };
}

/** Map ruta_id -> upload for one kind in one period. */
export async function loadPeriodUploads(kind, { year, month, part }, userId) {
  let q = supabase.from('uploads')
    .select('id, ruta_id, user_id, status, review_note, file_path, taken_at, updated_at, lat, lng, accuracy_m')
    .eq('kind', kind).eq('period_year', year).eq('period_month', month);
  if (kind === 'kunjungan') q = q.eq('period_part', part);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  return Object.fromEntries((data || []).map((u) => [u.ruta_id, u]));
}

/** Map ruta_id -> true for files of this kind/period still waiting on the phone. */
export async function loadQueuedKeys(uid, kind, { year, month, part }) {
  const q = await queuedFor(uid);
  const out = {};
  q.filter((j) => j.kind === kind && j.args.p_year === year && j.args.p_month === month
              && (kind !== 'kunjungan' || j.args.p_part === part))
   .forEach((j) => { out[j.args.p_ruta_id] = true; });
  return out;
}

/**
 * For kunjungan (dasarian): how many ruta are APPROVED in each part of the month,
 * so the UI can lock the next period until the current one is fully approved.
 * Returns { total, approved: { 1: n, 2: n, 3: n } }. Null for monthly kinds.
 */
export async function loadMonthApproval(kind, { year, month }, userId) {
  if (kind !== 'kunjungan') return null;
  const { ruta } = await loadMyRuta();
  let q = supabase.from('uploads').select('period_part, status')
    .eq('kind', 'kunjungan').eq('period_year', year).eq('period_month', month).eq('status', 'approved');
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) throw error;
  const approved = {};
  (data || []).forEach((u) => { approved[u.period_part] = (approved[u.period_part] || 0) + 1; });
  return { total: ruta.length, approved };
}

export function statusOf(ruta, uploads, queued) {
  if (queued[ruta.id]) return 'queued';
  return uploads[ruta.id]?.status || 'none';
}

/** This month's surat tugas (upload + nomor) for the signed-in user. */
export async function loadSuratMonth(uid, year, month) {
  const [{ data: up }, { data: no }] = await Promise.all([
    supabase.from('uploads').select('*').eq('kind', 'surat_tugas').eq('user_id', uid)
      .eq('period_year', year).eq('period_month', month).maybeSingle(),
    supabase.from('surat_tugas_nomor').select('*').eq('user_id', uid).eq('tahun', year).eq('bulan', month).maybeSingle(),
  ]);
  return { upload: up || null, nomor: no || null };
}

/** STNK + foto kendaraan of the signed-in user. */
export async function loadVehicle(uid) {
  const { data } = await supabase.from('uploads').select('*').eq('user_id', uid).in('kind', ['stnk', 'kendaraan']);
  const by = Object.fromEntries((data || []).map((u) => [u.kind, u]));
  return { stnk: by.stnk || null, kendaraan: by.kendaraan || null };
}

/** One summary status for a pair of uploads (worst wins). */
export function pairStatus(a, b) {
  const s = [a?.status || 'none', b?.status || 'none'];
  if (s.includes('rejected')) return 'rejected';
  if (s.includes('none')) return 'none';
  if (s.includes('pending')) return 'pending';
  return 'approved';
}
