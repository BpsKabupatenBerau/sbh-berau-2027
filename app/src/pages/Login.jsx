import { useState } from 'react';
import { supabase, usernameToEmail, errMsg } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Spinner } from '../components/ui';

export default function Login() {
  const { problem, signOut, session } = useAuth();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!u.trim() || !p) { setErr('Isi username dan kata sandi'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(u), password: p });
    setBusy(false);
    if (error) setErr(errMsg(error));
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit} autoComplete="on">
        <div className="login-mark">SBH</div>
        <h1>Survei Biaya Hidup 2027</h1>
        <p className="login-sub">BPS Kabupaten Berau</p>

        {(problem && session) ? (
          <div className="login-err">
            {problem}
            <button type="button" className="linkish" onClick={signOut}>Keluar</button>
          </div>
        ) : err ? <div className="login-err">{err}</div> : null}

        <label htmlFor="u">Username</label>
        <input id="u" value={u} onChange={(e) => setU(e.target.value)} autoCapitalize="none" autoCorrect="off"
               spellCheck="false" autoComplete="username" placeholder="mis. siti.ngaisah" inputMode="text" />

        <label htmlFor="p">Kata sandi</label>
        <div className="pw">
          <input id="p" type={show ? 'text' : 'password'} value={p} onChange={(e) => setP(e.target.value)}
                 autoComplete="current-password" />
          <button type="button" onClick={() => setShow(!show)}>{show ? 'Sembunyi' : 'Lihat'}</button>
        </div>

        <button className="login-go" disabled={busy}>{busy ? <Spinner small /> : 'Masuk'}</button>
        <div className="login-foot">Akun dibuat oleh admin. Lupa kata sandi? Hubungi admin SBH.</div>
      </form>
    </div>
  );
}
