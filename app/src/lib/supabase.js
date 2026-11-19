import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
export const EMAIL_DOMAIN = import.meta.env.VITE_EMAIL_DOMAIN || 'sbh.bpsberau.id';

// Fail loudly, not blank: if the build had no Supabase env vars, say so on screen.
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Konfigurasi Supabase belum ada. Setel VITE_SUPABASE_URL dan VITE_SUPABASE_KEY di ' +
    'Vercel → Project → Settings → Environment Variables, lalu Redeploy.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sbh2027-auth' },
});

export const usernameToEmail = (u) => `${String(u).trim().toLowerCase()}@${EMAIL_DOMAIN}`;

/** Turn Supabase / Postgres errors into short Indonesian messages. */
export function errMsg(e) {
  const m = e?.message || String(e || 'Terjadi kesalahan');
  if (/Invalid login credentials/i.test(m)) return 'Username atau kata sandi salah';
  if (/banned/i.test(m)) return 'Akun dinonaktifkan. Hubungi admin.';
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'Tidak ada koneksi internet';
  if (/JWT|session|token/i.test(m) && /expired|invalid/i.test(m)) return 'Sesi berakhir, silakan login ulang';
  if (/row-level security|permission denied/i.test(m)) return 'Anda tidak punya akses untuk tindakan ini';
  return m;
}

/** Call the admin-users Edge Function and surface its error text. */
export async function adminUsers(body) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    let msg = error.message;
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  return data;
}
