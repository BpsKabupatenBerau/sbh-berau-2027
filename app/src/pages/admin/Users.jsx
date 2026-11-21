import { useEffect, useMemo, useState } from 'react';
import { supabase, adminUsers, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { readTable, pick, cell, downloadCsv } from '../../lib/excel';
import { Page, Card, Button, Icon, Loading, Empty, Modal, useToast } from '../../components/ui';
import { roleLabel } from '../../components/Shell';

const WORDS = ['kopi', 'sagu', 'padi', 'biru', 'pena', 'kota', 'sawi', 'labu', 'tebu', 'nila', 'duku', 'kayu', 'pari', 'teri', 'jati', 'bumi'];
export const genPassword = () => {
  const r = (n) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  return `${WORDS[r(WORDS.length)]}${WORDS[r(WORDS.length)]}${String(r(90) + 10)}`;
};
export const suggestUsername = (name) => {
  const w = String(name || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  return (w.length > 1 ? `${w[0]}.${w[1]}` : w[0] || '').slice(0, 32);
};
const ROLE_ALIASES = { ppl: 'ppl', pendata: 'ppl', pml: 'pml', pemeriksa: 'pml', pengawas: 'pml', admin: 'admin', pengolahan: 'pengolahan', operator: 'pengolahan', entri: 'pengolahan' };

function uniq(base, taken) {
  let u = base || 'user', i = 2;
  while (taken.has(u)) u = `${base}${i++}`;
  taken.add(u);
  return u;
}

export default function Users() {
  const { uid } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [nksCount, setNksCount] = useState({});
  const [role, setRole] = useState('all');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);       // add / edit
  const [pwReset, setPwReset] = useState(null); // { p, password }
  const [cred, setCred] = useState(null);       // credentials to show once
  const [imp, setImp] = useState(null);         // bulk import state
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data, error }, { data: nks }] = await Promise.all([
      supabase.from('profiles').select('*').order('role').order('full_name'),
      supabase.from('nks').select('pml_id, ppl_id'),
    ]);
    if (error) { toast(errMsg(error), 'err'); setRows([]); return; }
    const c = {};
    (nks || []).forEach((n) => { [n.pml_id, n.ppl_id].forEach((id) => { if (id) c[id] = (c[id] || 0) + 1; }); });
    setRows(data); setNksCount(c);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  const list = useMemo(() => (rows || [])
    .filter((r) => role === 'all' || r.role === role)
    .filter((r) => !q || `${r.full_name} ${r.username} ${r.phone || ''}`.toLowerCase().includes(q.toLowerCase())), [rows, role, q]);
  const counts = useMemo(() => (rows || []).reduce((a, r) => ({ ...a, [r.role]: (a[r.role] || 0) + 1 }), {}), [rows]);

  /* ---------- add / edit ---------- */
  async function save() {
    setBusy(true);
    try {
      if (form.id) {
        await adminUsers({ action: 'update', user_id: form.id, full_name: form.full_name, role: form.role, phone: form.phone });
        toast('Perubahan disimpan', 'ok');
      } else {
        const r = await adminUsers({ action: 'create', user: { username: form.username, full_name: form.full_name, role: form.role, phone: form.phone, password: form.password } });
        if (!r.ok) throw new Error(r.error);
        setCred([{ nama: form.full_name, username: form.username, kata_sandi: form.password, peran: form.role }]);
      }
      setForm(null); load();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }
  async function doReset() {
    const { p, password } = pwReset;
    const pw = password.trim();
    if (pw.length < 8) return toast('Kata sandi minimal 8 karakter', 'err');
    setBusy(true);
    try {
      await adminUsers({ action: 'set_password', user_id: p.id, password: pw });
      setPwReset(null);
      setCred([{ nama: p.full_name, username: p.username, kata_sandi: pw, peran: p.role }]);
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }
  async function setActive(p, active) {
    if (!active && !window.confirm(`Nonaktifkan ${p.full_name || p.username}? Akun tidak bisa login dan kehilangan akses data.`)) return;
    try { await adminUsers({ action: 'set_active', user_id: p.id, active }); toast(active ? 'Akun diaktifkan' : 'Akun dinonaktifkan', 'ok'); load(); }
    catch (e) { toast(errMsg(e), 'err'); }
  }

  /* ---------- bulk import ---------- */
  async function onImportFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const { rows: raw } = await readTable(f);
      const taken = new Set((rows || []).map((r) => r.username));
      const parsed = raw.map((r) => {
        const full_name = cell(pick(r, ['namalengkap', 'nama', 'namapetugas']));
        const roleRaw = cell(pick(r, ['peran', 'role', 'jabatan'])).toLowerCase();
        const role = ROLE_ALIASES[roleRaw];
        const uname = cell(pick(r, ['username', 'user'])).toLowerCase();
        const username = uniq(uname || suggestUsername(full_name), taken);
        const password = cell(pick(r, ['katasandi', 'password', 'sandi'])) || genPassword();
        const phone = cell(pick(r, ['nohp', 'hp', 'telepon', 'nomorhp']));
        let error = '';
        if (!full_name) error = 'Nama kosong';
        else if (!role) error = `Peran "${roleRaw || '(kosong)'}" tidak dikenal (pakai PPL/PML/Pengolahan/Admin)`;
        else if (!/^[a-z0-9._-]{3,32}$/.test(username)) error = 'Username tidak valid';
        else if (password.length < 8) error = 'Kata sandi < 8 karakter';
        return { full_name, role, username, password, phone, error };
      });
      setImp({ file: f.name, rows: parsed, results: null });
    } catch (err) { toast(`Berkas tidak terbaca: ${errMsg(err)}`, 'err'); }
  }
  async function runImport() {
    const good = imp.rows.filter((r) => !r.error);
    setBusy(true);
    try {
      const results = [];
      for (let i = 0; i < good.length; i += 25) {
        const r = await adminUsers({ action: 'bulk_create', users: good.slice(i, i + 25) });
        results.push(...r.results);
      }
      const byU = Object.fromEntries(results.map((r) => [r.username, r]));
      setImp((x) => ({ ...x, results: x.rows.map((r) => ({ ...r, result: r.error ? { ok: false, error: r.error } : byU[r.username] })) }));
      toast(`${results.filter((r) => r.ok).length} akun dibuat`, 'ok');
      load();
    } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }
  const exportCreds = (list) => downloadCsv(`akun-spkrt-${new Date().toISOString().slice(0, 10)}.csv`,
    list.map((r) => ({ Nama: r.full_name ?? r.nama, Peran: (r.role ?? r.peran).toUpperCase(), Username: r.username, 'Kata Sandi': r.password ?? r.kata_sandi, Login: location.origin + location.pathname })));

  return (
    <Page title="Pengguna" subtitle={`${rows?.length ?? '…'} akun · 1 akun = 1 peran`} wide
          actions={<>
            <label className="btn btn-ghost"><Icon name="upload" size={18} /><span>Impor Excel</span><input type="file" accept=".xlsx,.csv" hidden onChange={onImportFile} /></label>
            <Button icon="plus" onClick={() => setForm({ full_name: '', username: '', role: 'ppl', phone: '', password: genPassword() })}>Tambah</Button>
          </>}>
      <div className="toolbar">
        <div className="seg">
          {[['all', 'Semua'], ['ppl', 'PPL'], ['pml', 'PML'], ['pengolahan', 'Pengolahan'], ['admin', 'Admin']].map(([k, l]) => (
            <button key={k} className={role === k ? 'on' : ''} onClick={() => setRole(k)}>{l} <small>{k === 'all' ? rows?.length ?? '' : counts[k] || 0}</small></button>
          ))}
        </div>
        <div className="search"><Icon name="search" size={18} /><input placeholder="Cari nama, username, HP…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <a className="linkish" href="./templates/template-pengguna.xlsx" download><Icon name="download" size={16} /> Template</a>
      </div>

      {!rows ? <Loading /> : !list.length ? <Empty icon="users" title="Belum ada pengguna" /> : (
        <Card className="table-card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th>No. HP</th><th className="num">NKS</th><th>Status</th><th /></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className={p.active ? '' : 'dim'}>
                    <td><b>{p.full_name || '—'}</b>{p.id === uid && <small className="muted"> (Anda)</small>}</td>
                    <td className="mono">{p.username}</td>
                    <td><span className={`role role-${p.role}`}>{p.role.toUpperCase()}</span></td>
                    <td>{p.phone || <span className="muted">—</span>}</td>
                    <td className="num">{nksCount[p.id] || (p.role === 'admin' ? '' : <span className="t-warn">0</span>)}</td>
                    <td>{p.active ? <span className="t-ok">Aktif</span> : <span className="muted">Nonaktif</span>}</td>
                    <td className="row-actions">
                      <button className="icon-btn" title="Ubah" onClick={() => setForm({ ...p, phone: p.phone || '' })}><Icon name="edit" size={18} /></button>
                      <button className="icon-btn" title="Atur ulang kata sandi" onClick={() => setPwReset({ p, password: genPassword() })}><Icon name="key" size={18} /></button>
                      {p.id !== uid && (p.active
                        ? <button className="icon-btn danger" title="Nonaktifkan" onClick={() => setActive(p, false)}><Icon name="x" size={18} /></button>
                        : <button className="icon-btn" title="Aktifkan" onClick={() => setActive(p, true)}><Icon name="refresh" size={18} /></button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* add / edit */}
      <Modal open={!!form} title={form?.id ? 'Ubah pengguna' : 'Tambah pengguna'} onClose={() => setForm(null)}
             footer={<><Button variant="ghost" onClick={() => setForm(null)}>Batal</Button><Button busy={busy} onClick={save}>{form?.id ? 'Simpan' : 'Buat akun'}</Button></>}>
        {form && (
          <div className="form">
            <label>Nama lengkap<input value={form.full_name} autoFocus
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value, ...(f.id || f.touched ? {} : { username: suggestUsername(e.target.value) }) }))} /></label>
            <label>Username {form.id && <small className="muted">(tidak bisa diubah)</small>}
              <input value={form.username} disabled={!!form.id} autoCapitalize="none"
                     onChange={(e) => setForm((f) => ({ ...f, touched: true, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }))} /></label>
            <label>Peran
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} disabled={form.id === uid}>
                <option value="ppl">PPL — Petugas Pendata Lapangan</option>
                <option value="pml">PML — Petugas Pemeriksa Lapangan</option>
                <option value="pengolahan">Pengolahan — penerimaan, batching & entri dokumen</option>
                <option value="admin">Admin</option>
              </select></label>
            <label>No. HP <input value={form.phone} inputMode="tel" onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></label>
            {!form.id && (
              <label>Kata sandi awal
                <div className="pw"><input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, password: genPassword() }))}>Acak</button></div>
                <small className="muted">Petugas bisa menggantinya sendiri di menu Akun.</small>
              </label>
            )}
          </div>
        )}
      </Modal>

      {/* reset password: auto or manual */}
      <Modal open={!!pwReset} title="Atur ulang kata sandi" onClose={() => setPwReset(null)}
             footer={<><Button variant="ghost" onClick={() => setPwReset(null)}>Batal</Button><Button busy={busy} onClick={doReset}>Simpan kata sandi</Button></>}>
        {pwReset && (
          <div className="form">
            <div className="kv"><span>Akun</span><b>{pwReset.p.full_name || pwReset.p.username} <span className="mono muted">({pwReset.p.username})</span></b></div>
            <label>Kata sandi baru
              <div className="pw">
                <input value={pwReset.password} autoFocus autoCapitalize="none"
                       onChange={(e) => setPwReset((x) => ({ ...x, password: e.target.value }))} />
                <button type="button" onClick={() => setPwReset((x) => ({ ...x, password: genPassword() }))}>Acak</button>
              </div>
              <small className="muted">Ketik manual, atau tekan <b>Acak</b> untuk kata sandi otomatis. Minimal 8 karakter.</small>
            </label>
          </div>
        )}
      </Modal>

      {/* credentials shown once */}
      <Modal open={!!cred} title="Akun siap dibagikan" onClose={() => setCred(null)}
             footer={<><Button variant="ghost" icon="download" onClick={() => exportCreds(cred)}>Unduh CSV</Button><Button onClick={() => setCred(null)}>Selesai</Button></>}>
        <p className="muted">Kata sandi hanya ditampilkan sekali ini. Kirim ke petugas lewat jalur pribadi.</p>
        {cred?.map((c) => (
          <Card key={c.username} className="pad cred">
            <div className="kv"><span>Nama</span><b>{c.nama}</b></div>
            <div className="kv"><span>Username</span><b className="mono">{c.username}</b></div>
            <div className="kv"><span>Kata sandi</span><b className="mono">{c.kata_sandi}</b></div>
            <Button variant="ghost" icon="layers" className="mt" onClick={() => {
              navigator.clipboard?.writeText(`Login SPKRT 2027\n${location.origin + location.pathname}\nUsername: ${c.username}\nKata sandi: ${c.kata_sandi}`);
              toast('Disalin', 'ok');
            }}>Salin pesan login</Button>
          </Card>
        ))}
      </Modal>

      {/* bulk import */}
      <Modal open={!!imp} wide title={`Impor pengguna — ${imp?.file || ''}`} onClose={() => !busy && setImp(null)}
             footer={imp?.results
               ? <><Button variant="ghost" icon="download" onClick={() => exportCreds(imp.results.filter((r) => r.result?.ok))}>Unduh akun (CSV)</Button><Button onClick={() => setImp(null)}>Selesai</Button></>
               : <><Button variant="ghost" onClick={() => setImp(null)}>Batal</Button>
                   <Button busy={busy} disabled={!imp?.rows.some((r) => !r.error)} onClick={runImport}>Buat {imp?.rows.filter((r) => !r.error).length} akun</Button></>}>
        {imp && (
          <>
            <p className="muted">{imp.rows.length} baris · {imp.rows.filter((r) => r.error).length} bermasalah (dilewati). Username kosong dibuat dari nama; kata sandi kosong diacak.</p>
            <div className="table-wrap tall">
              <table className="table compact">
                <thead><tr><th>Nama</th><th>Peran</th><th>Username</th><th>Kata sandi</th><th>HP</th><th>Hasil</th></tr></thead>
                <tbody>
                  {(imp.results || imp.rows).map((r, i) => {
                    const res = r.result;
                    return (
                      <tr key={i} className={r.error || (res && !res.ok) ? 'bad' : ''}>
                        <td>{r.full_name}</td><td>{r.role?.toUpperCase() || '?'}</td><td className="mono">{r.username}</td>
                        <td className="mono">{r.password}</td><td>{r.phone}</td>
                        <td>{r.error ? <span className="t-err">{r.error}</span> : res ? (res.ok ? <span className="t-ok">Dibuat</span> : <span className="t-err">{res.error}</span>) : <span className="muted">Siap</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </Page>
  );
}
