import { useState } from 'react';
import { supabase, errMsg } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { queuedFor } from '../lib/uploads';
import { Page, Card, Button, useToast, Icon } from '../components/ui';
import { roleLabel } from '../components/Shell';

export default function Account() {
  const { profile, signOut, uid } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  async function changePw(e) {
    e.preventDefault();
    if (pw.length < 8) return toast('Kata sandi minimal 8 karakter', 'err');
    if (pw !== pw2) return toast('Konfirmasi kata sandi tidak sama', 'err');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setPw(''); setPw2('');
    toast('Kata sandi diganti', 'ok');
  }

  async function logout() {
    const q = await queuedFor(uid);
    if (q.length && !window.confirm(`${q.length} foto belum terkirim dan tersimpan di HP ini. Tetap keluar? Foto akan dikirim saat Anda login lagi di HP ini.`)) return;
    signOut();
  }

  return (
    <Page title="Akun" subtitle={roleLabel(profile.role)}>
      <Card className="pad">
        <div className="kv"><span>Nama</span><b>{profile.full_name || '—'}</b></div>
        <div className="kv"><span>Username</span><b>{profile.username}</b></div>
        <div className="kv"><span>Peran</span><b>{roleLabel(profile.role)}</b></div>
        <div className="kv"><span>No. HP</span><b>{profile.phone || '—'}</b></div>
      </Card>

      <h2 className="sec">Ganti kata sandi</h2>
      <Card className="pad">
        <form onSubmit={changePw} className="form">
          <label>Kata sandi baru<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
          <label>Ulangi kata sandi<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></label>
          <Button busy={busy} icon="key">Simpan kata sandi</Button>
        </form>
      </Card>

      <Button variant="ghost" icon="logout" className="mt" onClick={logout}>Keluar</Button>
      <p className="hint center"><Icon name="shield" size={14} /> SBH 2027 · BPS Kabupaten Berau</p>
    </Page>
  );
}
