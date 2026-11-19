import { supabase } from '../../lib/supabase';
import { queuedFor } from '../../lib/uploads';

/** All active ruta the signed-in PPL is assigned to, with NKS info. RLS limits the rows. */
export async function loadMyRuta() {
  const [{ data: nks, error: e1 }, { data: ruta, error: e2 }] = await Promise.all([
    supabase.from('nks').select('nks, kecamatan, desa, sls, sub').order('nks'),
    supabase.from('ruta').select('id, nks, no_urut, nama_krt, alamat').eq('active', true).order('nks').order('no_urut'),
  ]);
  if (e1 || e2) throw e1 || e2;
  const info = Object.fromEntries((nks || []).map((n) => [n.nks, n]));
  return { nks: nks || [], ruta: (ruta || []).map((r) => ({ ...r, info: info[r.nks] })) };
}

export async function loadWeekUploads({ year, week }) {
  const { data, error } = await supabase.from('uploads')
    .select('id, ruta_id, status, review_note, file_path, taken_at, updated_at, lat, lng, accuracy_m')
    .eq('kind', 'kunjungan').eq('period_year', year).eq('period_week', week);
  if (error) throw error;
  return Object.fromEntries((data || []).map((u) => [u.ruta_id, u]));
}

/** Map ruta_id -> true for photos of this week still waiting on the phone. */
export async function loadQueuedKeys(uid, { year, week }) {
  const q = await queuedFor(uid);
  const out = {};
  q.filter((j) => j.kind === 'kunjungan' && j.args.p_year === year && j.args.p_week === week)
   .forEach((j) => { out[j.args.p_ruta_id] = true; });
  return out;
}

export function statusOf(ruta, uploads, queued) {
  if (queued[ruta.id]) return 'queued';
  return uploads[ruta.id]?.status || 'none';
}

export async function loadMySurat(uid) {
  const { data, error } = await supabase.from('uploads').select('*')
    .eq('kind', 'surat_tugas').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  return data;
}
