import { useEffect, useMemo, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { readTable, pick, cell, norm } from '../../lib/excel';
import { BULAN_FULL, monthLabel } from '../../lib/period';
import { Page, Card, Button, Chip, Icon, Loading, Empty, Modal, useToast } from '../../components/ui';

const ymNow = () => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() + 1 }; };
const shiftYm = ({ year, month }, d) => { const x = new Date(year, month - 1 + d, 1); return { year: x.getFullYear(), month: x.getMonth() + 1 }; };
const toIsoDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const monthFromCell = (v) => {
  const s = norm(v);
  if (/^\d+$/.test(s)) return +s;
  const i = BULAN_FULL.findIndex((b) => norm(b) === s || norm(b).slice(0, 3) === s.slice(0, 3));
  return i >= 0 ? i + 1 : null;
};

// Admin: one surat tugas number per petugas per month.
export default function SuratNomor() {
  const toast = useToast();
  const [ym, setYm] = useState(ymNow());
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState({});          // user_id -> { nomor, tanggal }
  const [role, setRole] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState(null);          // auto-fill dialog
  const [imp, setImp] = useState(null);
  const [people, setPeople] = useState([]);

  async function load() {
    setRows(null); setEdit({});
    const [{ data: ps, error }, { data: nos }, { data: ups }] = await Promise.all([
      supabase.from('profiles').select('id, username, full_name, role, active').in('role', ['ppl', 'pml']).order('role', { ascending: false }).order('full_name'),
      supabase.from('surat_tugas_nomor').select('*').eq('tahun', ym.year).eq('bulan', ym.month),
      supabase.from('uploads').select('user_id, status').eq('kind', 'surat_tugas').eq('period_year', ym.year).eq('period_month', ym.month),
    ]);
    if (error) { toast(errMsg(error), 'err'); setRows([]); return; }
    const nm = Object.fromEntries((nos || []).map((n) => [n.user_id, n]));
    const um = Object.fromEntries((ups || []).map((u) => [u.user_id, u.status]));
    setPeople(ps || []);
    setRows((ps || []).filter((p) => p.active || nm[p.id]).map((p) => ({ ...p, no: nm[p.id] || null, up: um[p.id] || null })));
  }
  useEffect(() => { load(); }, [ym.year, ym.month]); // eslint-disable-line

  const list = useMemo(() => (rows || [])
    .filter((r) => role === 'all' || r.role === role)
    .filter((r) => !q || `${r.full_name} ${r.username} ${r.no?.nomor || ''}`.toLowerCase().includes(q.toLowerCase())), [rows, role, q]);
  const val = (r, k) => (edit[r.id]?.[k] ?? (k === 'nomor' ? r.no?.nomor : r.no?.tanggal) ?? '');
  const set = (r, k, v) => setEdit((e) => ({ ...e, [r.id]: { nomor: val(r, 'nomor'), tanggal: val(r, 'tanggal'), ...e[r.id], [k]: v } }));
  const dirty = Object.keys(edit).length;
  const filled = (rows || []).filter((r) => r.no).length;
  const uploaded = (rows || []).filter((r) => r.up).length;

  async function saveAll() {
    setBusy(true);
    const ups = [], dels = [];
    Object.entries(edit).forEach(([uid, e]) => {
      const nomor = (e.nomor || '').trim();
      if (nomor) ups.push({ user_id: uid, tahun: ym.year, bulan: ym.month, nomor, tanggal: e.tanggal || null });
      else dels.push(uid);
    });
    if (ups.length) {
      const { error } = await supabase.from('surat_tugas_nomor').upsert(ups, { onConflict: 'user_id,tahun,bulan' });
      if (error) { setBusy(false); return toast(errMsg(error), 'err'); }
    }
    if (dels.length) await supabase.from('surat_tugas_nomor').delete().eq('tahun', ym.year).eq('bulan', ym.month).in('user_id', dels);
    setBusy(false);
    toast(`${ups.length} nomor disimpan${dels.length ? `, ${dels.length} dihapus` : ''}`, 'ok');
    load();
  }

  function runGen() {
    const start = parseInt(gen.start, 10);
    if (!gen.pattern.includes('{n}') || Number.isNaN(start)) return toast('Pola harus memuat {n} dan nomor awal berupa angka', 'err');
    const targets = list.filter((r) => gen.overwrite || !val(r, 'nomor'));
    const width = gen.start.trim().length; // "001" keeps 3 digits; padStart never truncates
    const next = { ...edit };
    targets.forEach((r, i) => {
      const n = String(start + i).padStart(width, '0');
      next[r.id] = { nomor: gen.pattern.replaceAll('{n}', n).replaceAll('{mm}', String(ym.month).padStart(2, '0')).replaceAll('{yyyy}', String(ym.year)),
                     tanggal: gen.tanggal || val(r, 'tanggal') };
    });
    setEdit(next); setGen(null);
    toast(`${targets.length} nomor diisi — periksa lalu Simpan`, 'ok');
  }

  async function onImport(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const { rows: raw } = await readTable(f);
      const byU = Object.fromEntries(people.map((p) => [p.username, p]));
      const byN = Object.fromEntries(people.map((p) => [(p.full_name || '').toLowerCase().trim(), p]));
      const parsed = raw.map((r) => {
        const u = cell(pick(r, ['username', 'user'])).toLowerCase();
        const n = cell(pick(r, ['nama', 'namapetugas', 'namalengkap']));
        const p = (u && byU[u]) || byN[n.toLowerCase()];
        const tahun = parseInt(cell(pick(r, ['tahun'])) || ym.year, 10);
        const bulan = monthFromCell(pick(r, ['bulan']) ?? ym.month);
        const nomor = cell(pick(r, ['nomor', 'nomorsurat', 'nomorsurattugas', 'nosurat']));
        const tanggal = toIsoDate(pick(r, ['tanggal', 'tanggalsurat']));
        let error = '';
        if (!p) error = `Petugas "${u || n}" tidak ditemukan`;
        else if (!bulan || bulan < 1 || bulan > 12) error = 'Bulan tidak valid';
        else if (!nomor) error = 'Nomor kosong';
        return { p, tahun, bulan, nomor, tanggal, error, label: p ? p.full_name : u || n };
      });
      setImp({ file: f.name, rows: parsed });
    } catch (err) { toast(`Berkas tidak terbaca: ${errMsg(err)}`, 'err'); }
  }
  async function runImport() {
    const good = imp.rows.filter((r) => !r.error).map((r) => ({ user_id: r.p.id, tahun: r.tahun, bulan: r.bulan, nomor: r.nomor, tanggal: r.tanggal }));
    setBusy(true);
    const { error } = await supabase.from('surat_tugas_nomor').upsert(good, { onConflict: 'user_id,tahun,bulan' });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast(`${good.length} nomor diimpor`, 'ok'); setImp(null); load();
  }

  return (
    <Page title="Nomor Surat Tugas" subtitle={`${monthLabel(ym.year, ym.month)} · ${filled} bernomor · ${uploaded} sudah unggah`} wide
          actions={<>
            <div className="weekpick" style={{ margin: 0 }}>
              <button className="icon-btn soft" onClick={() => setYm(shiftYm(ym, -1))} aria-label="Bulan sebelumnya"><Icon name="left" /></button>
              <div className="weekpick-mid"><b>{monthLabel(ym.year, ym.month)}</b></div>
              <button className="icon-btn soft" onClick={() => setYm(shiftYm(ym, 1))} aria-label="Bulan berikutnya"><Icon name="right" /></button>
            </div>
            <label className="btn btn-ghost"><Icon name="upload" size={18} /><span>Impor Excel</span><input type="file" accept=".xlsx,.csv" hidden onChange={onImport} /></label>
          </>}>
      <div className="toolbar">
        <div className="seg">{[['all', 'Semua'], ['ppl', 'PPL'], ['pml', 'PML']].map(([k, l]) => <button key={k} className={role === k ? 'on' : ''} onClick={() => setRole(k)}>{l}</button>)}</div>
        <div className="search"><Icon name="search" size={18} /><input placeholder="Cari nama atau nomor…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button variant="ghost" icon="list" onClick={() => setGen({ pattern: `B-{n}/6405/KP.650/{mm}/{yyyy}`, start: '001', tanggal: '', overwrite: false })}>Isi berurutan</Button>
        <a className="linkish" href="./templates/template-nomor-surat.xlsx" download><Icon name="download" size={16} /> Template</a>
      </div>

      {!rows ? <Loading /> : !rows.length ? <Empty icon="users" title="Belum ada akun PPL/PML">Buat akun di menu Pengguna.</Empty> : (
        <Card className="table-card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nama</th><th>Peran</th><th style={{ width: '38%' }}>Nomor surat tugas</th><th>Tanggal</th><th>Unggahan</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className={edit[r.id] ? 'warn' : ''}>
                    <td><b>{r.full_name || r.username}</b><small className="block muted mono">{r.username}</small></td>
                    <td><span className={`role role-${r.role}`}>{r.role.toUpperCase()}</span></td>
                    <td><input className="cellin" value={val(r, 'nomor')} placeholder="belum ada" onChange={(e) => set(r, 'nomor', e.target.value)} /></td>
                    <td><input className="cellin" type="date" value={val(r, 'tanggal') || ''} onChange={(e) => set(r, 'tanggal', e.target.value)} /></td>
                    <td>{r.up ? <Chip status={r.up} /> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {dirty > 0 && (
        <div className="bulkbar" style={{ position: 'sticky', bottom: 80, top: 'auto', marginTop: 14 }}>
          <span><b>{dirty}</b> perubahan belum disimpan</span>
          <span className="grow" />
          <Button variant="ghost" onClick={() => setEdit({})}>Batal</Button>
          <Button busy={busy} icon="check" onClick={saveAll}>Simpan</Button>
        </div>
      )}

      <Modal open={!!gen} title={`Isi nomor berurutan · ${monthLabel(ym.year, ym.month)}`} onClose={() => setGen(null)}
             footer={<><Button variant="ghost" onClick={() => setGen(null)}>Batal</Button><Button onClick={runGen}>Isi {list.filter((r) => gen?.overwrite || !val(r, 'nomor')).length} baris</Button></>}>
        {gen && (
          <div className="form">
            <label>Pola nomor <small className="muted">{'{n}'} = urutan, {'{mm}'} = bulan, {'{yyyy}'} = tahun</small>
              <input value={gen.pattern} onChange={(e) => setGen((g) => ({ ...g, pattern: e.target.value }))} /></label>
            <div className="grid2 form">
              <label>Nomor awal<input value={gen.start} inputMode="numeric" onChange={(e) => setGen((g) => ({ ...g, start: e.target.value }))} /></label>
              <label>Tanggal surat<input type="date" value={gen.tanggal} onChange={(e) => setGen((g) => ({ ...g, tanggal: e.target.value }))} /></label>
            </div>
            <label className="toggle"><input type="checkbox" checked={gen.overwrite} onChange={(e) => setGen((g) => ({ ...g, overwrite: e.target.checked }))} /> Timpa nomor yang sudah ada</label>
            <p className="hint" style={{ margin: 0 }}>Urutan mengikuti daftar yang tampil (filter & pencarian berlaku). Contoh: <span className="mono">{gen.pattern.replaceAll('{n}', gen.start).replaceAll('{mm}', String(ym.month).padStart(2, '0')).replaceAll('{yyyy}', String(ym.year))}</span></p>
          </div>
        )}
      </Modal>

      <Modal open={!!imp} wide title={`Impor nomor — ${imp?.file || ''}`} onClose={() => !busy && setImp(null)}
             footer={<><Button variant="ghost" onClick={() => setImp(null)}>Batal</Button>
               <Button busy={busy} disabled={!imp?.rows.some((r) => !r.error)} onClick={runImport}>Simpan {imp?.rows.filter((r) => !r.error).length} nomor</Button></>}>
        {imp && (
          <>
            <p className="muted">Kolom: <b>Username</b> (atau Nama), <b>Tahun</b>, <b>Bulan</b> (angka atau nama), <b>Nomor</b>, Tanggal (opsional). Nomor yang sudah ada akan diperbarui.</p>
            <div className="table-wrap tall">
              <table className="table compact">
                <thead><tr><th>Petugas</th><th>Bulan</th><th>Nomor</th><th>Tanggal</th><th>Cek</th></tr></thead>
                <tbody>
                  {imp.rows.map((r, i) => (
                    <tr key={i} className={r.error ? 'bad' : ''}>
                      <td>{r.label}</td><td>{r.bulan ? monthLabel(r.tahun, r.bulan) : '?'}</td><td className="mono">{r.nomor}</td><td>{r.tanggal || ''}</td>
                      <td>{r.error ? <span className="t-err">{r.error}</span> : <span className="t-ok">OK</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </Page>
  );
}
