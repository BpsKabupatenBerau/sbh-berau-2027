import { useEffect, useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon, useToast, Spinner } from './ui';
import { useAuth } from '../lib/auth';
import { queuedFor, flushQueue, onQueueChange } from '../lib/uploads';

export const NAV = {
  ppl: [
    { to: '/', icon: 'home', label: 'Beranda', end: true },
    { to: '/kunjungan', icon: 'check', label: 'Kunjungan' },
    { to: '/status', icon: 'clock', label: 'Status' },
    { to: '/akun', icon: 'user', label: 'Akun' },
  ],
  pml: [
    { to: '/', icon: 'home', label: 'Beranda', end: true },
    { to: '/surat-tugas', icon: 'file', label: 'Surat Tugas' },
    { to: '/akun', icon: 'user', label: 'Akun' },
  ],
  admin: [
    { to: '/', icon: 'grid', label: 'Dashboard', end: true },
    { to: '/verifikasi', icon: 'shield', label: 'Verifikasi' },
    { to: '/sampel', icon: 'map', label: 'Sampel' },
    { to: '/pengguna', icon: 'users', label: 'Pengguna' },
    { to: '/akun', icon: 'user', label: 'Akun' },
  ],
};
const ROLE_LABEL = { ppl: 'PPL · Pendata', pml: 'PML · Pemeriksa', admin: 'Admin' };
export const roleLabel = (r) => ROLE_LABEL[r] || r;

/** Count + auto-send of photos waiting for signal. */
export function useQueue() {
  const { uid } = useAuth();
  const toast = useToast();
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => { if (uid) setCount((await queuedFor(uid)).length); }, [uid]);
  const flush = useCallback(async (manual) => {
    if (!uid) return;
    if (!navigator.onLine) { if (manual) toast('Masih belum ada sinyal internet', 'err'); return; }
    setBusy(true);
    const { sent, failed } = await flushQueue(uid);
    setBusy(false);
    if (sent) toast(`${sent} foto antrian berhasil terkirim`, 'ok');
    failed.forEach((f) => toast(`${f.label || 'Unggahan'} ditolak server: ${f.error}`, 'err'));
    refresh();
  }, [uid, toast, refresh]);

  useEffect(() => {
    refresh();
    flush(false);
    const off = onQueueChange(refresh);
    const online = () => flush(false);
    window.addEventListener('online', online);
    const t = setInterval(() => flush(false), 60000);
    return () => { off(); window.removeEventListener('online', online); clearInterval(t); };
  }, [refresh, flush]);

  return { count, busy, flush };
}

function QueueBanner() {
  const { count, busy, flush } = useQueue();
  if (!count) return null;
  return (
    <div className="qbanner">
      <Icon name="wifi" />
      <span><b>{count} foto</b> tersimpan di HP, menunggu sinyal untuk dikirim.</span>
      <button onClick={() => flush(true)} disabled={busy}>{busy ? <Spinner small /> : 'Kirim sekarang'}</button>
    </div>
  );
}

export default function Shell({ children }) {
  const { profile } = useAuth();
  const items = NAV[profile.role] || [];
  const initials = (profile.full_name || profile.username).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={`shell shell-${profile.role}`}>
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="logo">SBH</div>
          <div><b>SBH 2027</b><small>BPS Kabupaten Berau</small></div>
        </div>
        <nav className="sb-nav">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'on' : '')}>
              <Icon name={it.icon} /> {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="sb-user">
          <div className="avatar">{initials}</div>
          <div><b>{profile.full_name || profile.username}</b><small>{roleLabel(profile.role)}</small></div>
        </div>
      </aside>

      <main className="main">
        <QueueBanner />
        {children}
      </main>

      <nav className="bottomnav" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'on' : '')}>
            <Icon name={it.icon} size={23} />
            <span>{it.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
