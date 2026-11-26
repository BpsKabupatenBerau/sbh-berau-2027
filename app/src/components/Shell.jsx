import { useEffect, useState, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Icon, useToast, Spinner, Modal } from './ui';
import { useAuth } from '../lib/auth';
import { queuedFor, flushQueue, onQueueChange } from '../lib/uploads';

export const APP_NAME = 'SPKRT 2027';

export const NAV = {
  ppl: [
    { to: '/', icon: 'home', label: 'Beranda', end: true },
    { to: '/pendataan', icon: 'check', label: 'Pendataan' },
    { to: '/status', icon: 'clock', label: 'Status' },
    { to: '/akun', icon: 'user', label: 'Akun' },
  ],
  pml: [
    { to: '/', icon: 'home', label: 'Beranda', end: true },
    { to: '/pengawasan', icon: 'shield', label: 'Pengawasan' },
    { to: '/bl', icon: 'file', label: 'BL' },
    { to: '/hr', icon: 'inbox', label: 'HR' },
    { to: '/usulan', icon: 'send', label: 'Usulan' },
    { to: '/rekap-bl', icon: 'layers', label: 'Rekap BL' },
    { to: '/akun', icon: 'user', label: 'Akun' },
  ],
  pengolahan: [
    { to: '/entri', icon: 'list', label: 'Entri', end: true },
    { to: '/akun', icon: 'user', label: 'Akun' },
  ],
  admin: [
    { to: '/', icon: 'grid', label: 'Dashboard', end: true, sec: 'Lapangan' },
    { to: '/verifikasi', icon: 'shield', label: 'Verifikasi' },
    { to: '/sampel', icon: 'map', label: 'Sampel' },
    { to: '/pengguna', icon: 'users', label: 'Pengguna' },
    { to: '/surat-nomor', icon: 'file', label: 'Nomor Surat' },
    { to: '/rekap-bl', icon: 'layers', label: 'Rekap BL' },
    { to: '/usulan-masuk', icon: 'send', label: 'Usulan' },
    { to: '/master', icon: 'db', label: 'Master Komoditas' },
    { to: '/penerimaan', icon: 'inbox', label: 'Penerimaan', sec: 'Pengolahan' },
    { to: '/batching', icon: 'layers', label: 'Batching' },
    { to: '/entri', icon: 'list', label: 'Entri' },
    { to: '/fasih', icon: 'db', label: 'FASIH' },
    { to: '/honor', icon: 'coins', label: 'Honor', sec: 'Keuangan' },
    { to: '/akun', icon: 'user', label: 'Akun', sec: ' ' },
  ],
};
const ROLE_LABEL = { ppl: 'PPL · Pendata', pml: 'PML · Pengawas', admin: 'Admin', pengolahan: 'Pengolahan' };
export const roleLabel = (r) => ROLE_LABEL[r] || r;
const BOTTOM_MAX = 5;

/** Count + auto-send of files waiting for signal. */
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
    if (sent) toast(`${sent} berkas antrian berhasil terkirim`, 'ok');
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
      <span><b>{count} berkas</b> tersimpan di HP, menunggu sinyal untuk dikirim.</span>
      <button onClick={() => flush(true)} disabled={busy}>{busy ? <Spinner small /> : 'Kirim sekarang'}</button>
    </div>
  );
}

export default function Shell({ children }) {
  const { profile } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const items = NAV[profile.role] || [];
  const initials = (profile.full_name || profile.username).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  const overflow = items.length > BOTTOM_MAX;
  const bottom = overflow ? items.slice(0, BOTTOM_MAX - 1) : items;
  const rest = overflow ? items.slice(BOTTOM_MAX - 1) : [];
  const restActive = rest.some((it) => (it.end ? loc.pathname === it.to : loc.pathname.startsWith(it.to)));

  return (
    <div className={`shell shell-${profile.role}`}>
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="logo">SPKRT</div>
          <div><b>{APP_NAME}</b><small>BPS Kabupaten Berau</small></div>
        </div>
        <nav className="sb-nav">
          {items.map((it) => [
            it.sec && <div key={`s-${it.to}`} className="sb-sec">{it.sec}</div>,
            <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'on' : '')}>
              <Icon name={it.icon} /> {it.label}
            </NavLink>,
          ])}
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

      <nav className="bottomnav" style={{ gridTemplateColumns: `repeat(${bottom.length + (overflow ? 1 : 0)}, 1fr)` }}>
        {bottom.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => (isActive ? 'on' : '')}>
            <Icon name={it.icon} size={23} />
            <span>{it.label}</span>
          </NavLink>
        ))}
        {overflow && (
          <a href="#menu" className={restActive ? 'on' : ''} onClick={(e) => { e.preventDefault(); setMenu(true); }}>
            <Icon name="menu" size={23} />
            <span>Menu</span>
          </a>
        )}
      </nav>

      <Modal open={menu} title="Menu" onClose={() => setMenu(false)}>
        <div className="card list menu-sheet">
          {rest.map((it) => (
            <button key={it.to} className="row" onClick={() => { setMenu(false); nav(it.to); }}>
              <span className="num"><Icon name={it.icon} size={18} /></span>
              <span className="row-tx"><b>{it.label}</b></span>
              <Icon name="right" className="row-arw" />
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
