import { supabase } from '../../lib/supabase';

/** NKS, active ruta, and people — loaded once per office page. */
export async function loadSample() {
  const [n, r, p] = await Promise.all([
    supabase.from('nks').select('nks, desa, kecamatan, ppl_id, pml_id').order('nks'),
    supabase.from('ruta').select('id, nks, no_urut, nama_krt, active').order('nks').order('no_urut').limit(10000),
    supabase.from('profiles').select('id, full_name, username, role, active').order('full_name'),
  ]);
  const err = n.error || r.error || p.error;
  if (err) throw err;
  const people = Object.fromEntries((p.data || []).map((x) => [x.id, x]));
  return { nks: n.data || [], ruta: (r.data || []).filter((x) => x.active !== false), people, peopleList: p.data || [] };
}

export async function loadDokumen(year, month, extra = (q) => q) {
  const { data, error } = await extra(supabase.from('dokumen').select('*').eq('tahun', year).eq('bulan', month)).limit(10000);
  if (error) throw error;
  return data || [];
}

export const ENTRY = {
  belum: ['Belum', 'idle'],
  clean: ['Clean', 'ok'],
  error: ['Error', 'err'],
};
export const KONDISI = { lengkap: 'Lengkap', tidak_lengkap: 'Tidak lengkap', rusak: 'Rusak' };
export const personName = (people, id) => (id && (people[id]?.full_name || people[id]?.username)) || '—';
