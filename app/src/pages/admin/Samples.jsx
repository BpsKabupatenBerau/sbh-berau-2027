import { useEffect, useMemo, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { readTable, pick, cell, padCode, hasAny } from '../../lib/excel';
import { Page, Card, Button, Icon, Loading, Empty, Modal, useToast } from '../../components/ui';

const A = {
  nks: ['nks', 'nksi'],
  kode_kec: ['kodekec', 'kdkec', 'kodekecamatan'],
  kecamatan: ['kecamatan', 'namakecamatan', 'kec'],
  kode_desa: ['kodedesa', 'kddesa', 'kodekelurahan', 'kodedesakelurahan'],
  desa: ['desa', 'kelurahan', 'kelurahani', 'desakelurahan', 'namadesa'],
  sls: ['sls', 'slsi'],
  sub: ['sub', 'subi', 'subsls'],
  pml_user: ['usernamepml'], pml_name: ['namapml', 'pml'],
  ppl_user: ['usernameppl'], ppl_name: ['namappl', 'ppl'],
  no_urut: ['nourut', 'nourutsampel', 'nus', 'noruta', 'nomorurut', 'nosampel', 'nourutruta'],
  nama_krt: ['namakrt', 'krt', 'namakepalarumahtangga', 'nama'],
  alamat: ['alamat'],
};
const EMPTY_NKS = { nks: '', kode_kec: '', kecamatan: '', kode_desa: '', desa: '', sls: '', sub: '', pml_id: '', ppl_id: '' };

export default function Samples() {
  const toast = useToast();
  const [nks, setNks] = useState(null);
  const [rutaCount, setRutaCount] = useState({});
  const [people, setPeople] = useState([]);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [rutaOf, setRutaOf] = useState(null);
  const [imp, setImp] = useState(null);   // {type, file, rows}
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: n, error }, { data: r }, { data: p }] = await Promise.all([
      supabase.from('nks').select('*').order('nks'),
      supabase.from('ruta').select('nks, active'),
      supabase.from('profiles').select('id, full_name, username, role, active').order('full_name'),
    ]);
    if (error) { toast(errMsg(error), 'err'); setNks([]); return; }
    const c = {};
    (r || []).forEach((x) => { if (x.active) c[x.nks] = (c[x.nks] || 0) + 1; });
    setNks(n); setRutaCount(c); setPeople(p || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  const name = (id) => { const p = people.find((x) => x.id === id); return p ? p.full_name || p.username : ''; };
  const byRole = (r) => people.filter((p) => p.role === r && p.active);
  const list = useMemo(() => (nks || []).filter((n) => !q ||
    `${n.nks} ${n.kecamatan} ${n.desa} ${name(n.pml_id)} ${name(n.ppl_id)}`.toLowerCase().includes(q.toLowerCase())), [nks, q, people]); // eslint-disable-line
  const totalRuta = Object.values(rutaCount).reduce((a, b) => a + b, 0);

  /* ---------- NKS add / edit ---------- */
  async function saveNks() {
    const row = { ...edit, nks: padCode(edit.nks, 5), pml_id: edit.pml_id || null, ppl_id: edit.ppl_id || null };
    delete row.created_at; delete row.isNew;
    if (!/^\d{5}$/.test(row.nks)) return toast('NKS harus 5 digit', 'err');
    setBusy(true);
    const { error } = edit.isNew ? await supabase.from('nks').insert(row) : await supabase.from('nks').update(row).eq('nks', row.nks);
    setBusy(false);
    if (error) return toast(/duplicate/i.test(error.message) ? 'NKS sudah ada' : errMsg(error), 'err');
    toast('NKS disimpan', 'ok'); setEdit(null); load();
  }
  async function delNks(n) {
    if ((rutaCount[n.nks] || 0) > 0) return toast('Hapus/nonaktifkan semua ruta dulu', 'err');
    if (!window.confirm(`Hapus NKS ${n.nks}?`)) return;
    const { error } = await supabase.from('nks').delete().eq('nks', n.nks);
    if (error) return toast(errMsg(error), 'err');
    setEdit(null); load();
  }

  /* ---------- import ---------- */
  function resolvePerson(row, userKeys, nameKeys, role) {
    const u = cell(pick(row, userKeys)).toLowerCase();
    const n = cell(pick(row, nameKeys));
    if (!u && !n) return { id: null };
    const p = u ? people.find((x) => x.username === u) : people.find((x) => (x.full_name || '').toLowerCase() === n.toLowerCase());
    if (!p) return { id: null, warn: `${role.toUpperCase()} "${u || n}" belum punya akun` };
    if (p.role !== role) return { id: null, warn: `"${u || n}" berperan ${p.role.toUpperCase()}, bukan ${role.toUpperCase()}` };
    return { id: p.id };
  }

  async function onImport(type, e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const { headers, rows } = await readTable(f);
      if (!hasAny(headers, A.nks)) return toast('Kolom NKS tidak ditemukan di baris pertama', 'err');
      let parsed;
      if (type === 'nks') {
        parsed = rows.map((r) => {
          const pml = resolvePerson(r, A.pml_user, A.pml_name, 'pml');
          const ppl = resolvePerson(r, A.ppl_user, A.ppl_name, 'ppl');
          const row = {
            nks: padCode(pick(r, A.nks), 5), kode_kec: padCode(pick(r, A.kode_kec), 3), kecamatan: cell(pick(r, A.kecamatan)),
            kode_desa: padCode(pick(r, A.kode_desa), 3), desa: cell(pick(r, A.desa)),
            sls: padCode(pick(r, A.sls), 4), sub: padCode(pick(r, A.sub), 2), pml_id: pml.id, ppl_id: ppl.id,
          };
          return { row, error: /^\d{5}$/.test(row.nks) ? '' : 'NKS harus 5 digit', warn: [pml.warn, ppl.warn].filter(Boolean).join('; '),
                   show: [row.nks, row.desa, row.sls, row.sub, name(pml.id) || '—', name(ppl.id) || '—'] };
        });
      } else {
        if (!hasAny(headers, A.no_urut)) return toast('Kolom No Urut tidak ditemukan', 'err');
        const known = new Set((nks || []).map((n) => n.nks));
        parsed = rows.map((r) => {
          const row = { nks: padCode(pick(r, A.nks), 5), no_urut: padCode(pick(r, A.no_urut), 3),
                        nama_krt: cell(pick(r, A.nama_krt)), alamat: cell(pick(r, A.alamat)) || null, active: true };
          let error = '';
          if (!known.has(row.nks)) error = `NKS ${row.nks} belum ada — impor NKS dulu`;
          else if (!/^\d{3}$/.test(row.no_urut)) error = 'No urut harus 3 digit';
          return { row, error, warn: row.nama_krt ? '' : 'Nama KRT kosong', show: [row.nks, row.no_urut, row.nama_krt, row.alamat || ''] };
        });
      }
      // duplicates inside the file
      const seen = new Set();
      parsed.forEach((p) => {
        const k = type === 'nks' ? p.row.nks : `${p.row.nks}-${p.row.no_urut}`;
        if (!p.error && seen.has(k)) p.error = 'Duplikat di berkas';
        seen.add(k);
      });
      setImp({ type, file: f.name, rows: parsed });
    } catch (err) { toast(`Berkas tidak terbaca: ${errMsg(err)}`, 'err'); }
  }

  async function runImport() {
    const good = imp.rows.filter((r) => !r.error).map((r) => r.row);
    setBusy(true);
    for (let i = 0; i < good.length; i += 500) {
      const chunk = good.slice(i, i + 500);
      const { error } = imp.type === 'nks'
        ? await supabase.from('nks').upsert(chunk, { onConflict: 'nks' })
        : await supabase.from('ruta').upsert(chunk, { onConflict: 'nks,no_urut' });
      if (error) { setBusy(false); return toast(errMsg(error), 'err'); }
    }
    setBusy(false);
    toast(`${good.length} ${imp.type === 'nks' ? 'NKS' : 'ruta'} disimpan`, 'ok');
    setImp(null); load();
  }

  return (
    <Page title="Sampel" subtitle={nks ? `${nks.length} NKS · ${totalRuta} ruta aktif` : ' '} wide
          actions={<>
            <label className="btn btn-ghost"><Icon name="upload" size={18} /><span>Impor NKS</span><input type="file" accept=".xlsx,.csv" hidden onChange={(e) => onImport('nks', e)} /></label>
            <label className="btn btn-ghost"><Icon name="upload" size={18} /><span>Impor Ruta</span><input type="file" accept=".xlsx,.csv" hidden onChange={(e) => onImport('ruta', e)} /></label>
            <Button icon="plus" onClick={() => setEdit({ ...EMPTY_NKS, isNew: true })}>Tambah NKS</Button>
          </>}>
      <div className="toolbar">
        <div className="search"><Icon name="search" size={18} /><input placeholder="Cari NKS, desa, PML, PPL…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <a className="linkish" href="./templates/template-nks.xlsx" download><Icon name="download" size={16} /> Template NKS</a>
        <a className="linkish" href="./templates/template-ruta.xlsx" download><Icon name="download" size={16} /> Template Ruta</a>
      </div>

      {!nks ? <Loading /> : !nks.length ? (
        <Empty icon="map" title="Belum ada NKS">
          Urutan: 1) buat akun PML & PPL di <b>Pengguna</b>, 2) <b>Impor NKS</b> (berkas Anda yang berkolom NKS-I, Kelurahan-I, SLS-I, Sub-I, Nama-PML, Nama-PPL juga bisa), 3) <b>Impor Ruta</b>.
        </Empty>
      ) : (
        <Card className="table-card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>NKS</th><th>Kecamatan</th><th>Desa</th><th>SLS/Sub</th><th>PML</th><th>PPL</th><th className="num">Ruta</th><th /></tr></thead>
              <tbody>
                {list.map((n) => (
                  <tr key={n.nks}>
                    <td className="mono">{n.nks}</td>
                    <td>{n.kecamatan}</td>
                    <td>{n.desa}</td>
                    <td className="mono">{n.sls}{n.sub ? `/${n.sub}` : ''}</td>
                    <td>{name(n.pml_id) || <span className="t-warn">belum</span>}</td>
                    <td>{name(n.ppl_id) || <span className="t-warn">belum</span>}</td>
                    <td className="num"><button className="linkish" onClick={() => setRutaOf(n)}>{rutaCount[n.nks] || 0}</button></td>
                    <td className="row-actions"><button className="icon-btn" title="Ubah" onClick={() => setEdit({ ...n, pml_id: n.pml_id || '', ppl_id: n.ppl_id || '' })}><Icon name="edit" size={18} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* NKS form */}
      <Modal open={!!edit} title={edit?.isNew ? 'Tambah NKS' : `NKS ${edit?.nks}`} onClose={() => setEdit(null)}
             footer={<>
               {!edit?.isNew && <Button variant="danger-ghost" onClick={() => delNks(edit)}>Hapus</Button>}
               <span className="grow" />
               <Button variant="ghost" onClick={() => setEdit(null)}>Batal</Button>
               <Button busy={busy} onClick={saveNks}>Simpan</Button>
             </>}>
        {edit && (
          <div className="form grid2">
            <label>NKS<input value={edit.nks} disabled={!edit.isNew} inputMode="numeric" maxLength={5} onChange={(e) => setEdit((x) => ({ ...x, nks: e.target.value }))} /></label>
            <label>SLS / Sub<div className="pair"><input value={edit.sls || ''} onChange={(e) => setEdit((x) => ({ ...x, sls: e.target.value }))} /><input value={edit.sub || ''} onChange={(e) => setEdit((x) => ({ ...x, sub: e.target.value }))} /></div></label>
            <label>Kode Kec.<input value={edit.kode_kec || ''} onChange={(e) => setEdit((x) => ({ ...x, kode_kec: e.target.value }))} /></label>
            <label>Kecamatan<input value={edit.kecamatan || ''} onChange={(e) => setEdit((x) => ({ ...x, kecamatan: e.target.value }))} /></label>
            <label>Kode Desa<input value={edit.kode_desa || ''} onChange={(e) => setEdit((x) => ({ ...x, kode_desa: e.target.value }))} /></label>
            <label>Desa/Kelurahan<input value={edit.desa || ''} onChange={(e) => setEdit((x) => ({ ...x, desa: e.target.value }))} /></label>
            <label>PML<select value={edit.pml_id} onChange={(e) => setEdit((x) => ({ ...x, pml_id: e.target.value }))}>
              <option value="">— belum —</option>{byRole('pml').map((p) => <option key={p.id} value={p.id}>{p.full_name || p.username}</option>)}</select></label>
            <label>PPL<select value={edit.ppl_id} onChange={(e) => setEdit((x) => ({ ...x, ppl_id: e.target.value }))}>
              <option value="">— belum —</option>{byRole('ppl').map((p) => <option key={p.id} value={p.id}>{p.full_name || p.username}</option>)}</select></label>
          </div>
        )}
      </Modal>

      {rutaOf && <RutaEditor nks={rutaOf} onClose={() => { setRutaOf(null); load(); }} />}

      {/* import preview */}
      <Modal open={!!imp} wide title={`Impor ${imp?.type === 'nks' ? 'NKS' : 'Ruta'} — ${imp?.file || ''}`} onClose={() => !busy && setImp(null)}
             footer={<><Button variant="ghost" onClick={() => setImp(null)}>Batal</Button>
               <Button busy={busy} disabled={!imp?.rows.some((r) => !r.error)} onClick={runImport}>Simpan {imp?.rows.filter((r) => !r.error).length} baris</Button></>}>
        {imp && (
          <>
            <p className="muted">
              {imp.rows.length} baris · <span className="t-err">{imp.rows.filter((r) => r.error).length} error (dilewati)</span> · <span className="t-warn">{imp.rows.filter((r) => !r.error && r.warn).length} peringatan</span>.
              {' '}Baris yang sudah ada akan <b>diperbarui</b>.
            </p>
            <div className="table-wrap tall">
              <table className="table compact">
                <thead><tr>{(imp.type === 'nks' ? ['NKS', 'Desa', 'SLS', 'Sub', 'PML', 'PPL'] : ['NKS', 'No Urut', 'Nama KRT', 'Alamat']).map((h) => <th key={h}>{h}</th>)}<th>Cek</th></tr></thead>
                <tbody>
                  {imp.rows.map((r, i) => (
                    <tr key={i} className={r.error ? 'bad' : r.warn ? 'warn' : ''}>
                      {r.show.map((v, j) => <td key={j} className={j < 2 ? 'mono' : ''}>{v}</td>)}
                      <td>{r.error ? <span className="t-err">{r.error}</span> : r.warn ? <span className="t-warn">{r.warn}</span> : <span className="t-ok">OK</span>}</td>
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

function RutaEditor({ nks, onClose }) {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [add, setAdd] = useState({ no_urut: '', nama_krt: '', alamat: '' });
  const [dirty, setDirty] = useState({});

  async function load() {
    const { data, error } = await supabase.from('ruta').select('*').eq('nks', nks.nks).order('no_urut');
    if (error) toast(errMsg(error), 'err');
    setRows(data || []); setDirty({});
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  const change = (id, k, v) => { setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [k]: v } : r))); setDirty((d) => ({ ...d, [id]: true })); };
  async function save(r) {
    const { error } = await supabase.from('ruta').update({ nama_krt: r.nama_krt, alamat: r.alamat || null, active: r.active }).eq('id', r.id);
    if (error) return toast(errMsg(error), 'err');
    setDirty((d) => ({ ...d, [r.id]: false })); toast('Disimpan', 'ok');
  }
  async function toggle(r) {
    const { error } = await supabase.from('ruta').update({ active: !r.active }).eq('id', r.id);
    if (error) return toast(errMsg(error), 'err');
    load();
  }
  async function create() {
    const no = padCode(add.no_urut, 3);
    if (!/^\d{3}$/.test(no)) return toast('No urut 3 digit', 'err');
    const { error } = await supabase.from('ruta').insert({ nks: nks.nks, no_urut: no, nama_krt: add.nama_krt.trim(), alamat: add.alamat.trim() || null });
    if (error) return toast(/duplicate/i.test(error.message) ? 'No urut sudah ada' : errMsg(error), 'err');
    setAdd({ no_urut: '', nama_krt: '', alamat: '' }); load();
  }

  return (
    <Modal open wide title={`Ruta · NKS ${nks.nks} ${nks.desa || ''}`} onClose={onClose} footer={<Button onClick={onClose}>Selesai</Button>}>
      <form className="addbar" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <input placeholder="No urut (002)" inputMode="numeric" maxLength={3} value={add.no_urut} onChange={(e) => setAdd((a) => ({ ...a, no_urut: e.target.value }))} />
        <input placeholder="Nama KRT" value={add.nama_krt} onChange={(e) => setAdd((a) => ({ ...a, nama_krt: e.target.value }))} />
        <input placeholder="Alamat (opsional)" value={add.alamat} onChange={(e) => setAdd((a) => ({ ...a, alamat: e.target.value }))} />
        <Button icon="plus">Tambah ruta</Button>
      </form>
      {!rows ? <Loading /> : (
        <div className="table-wrap tall">
          <table className="table compact">
            <thead><tr><th>No</th><th>Nama KRT</th><th>Alamat</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.active ? '' : 'dim'}>
                  <td className="mono">{r.no_urut}</td>
                  <td><input className="cellin" value={r.nama_krt} onChange={(e) => change(r.id, 'nama_krt', e.target.value)} /></td>
                  <td><input className="cellin" value={r.alamat || ''} onChange={(e) => change(r.id, 'alamat', e.target.value)} /></td>
                  <td>{r.active ? <span className="t-ok">Aktif</span> : <span className="muted">Nonaktif</span>}</td>
                  <td className="row-actions">
                    {dirty[r.id] && <Button variant="ok" onClick={() => save(r)}>Simpan</Button>}
                    <button className="linkish" onClick={() => toggle(r)}>{r.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">Ruta nonaktif tidak muncul di daftar PPL; foto lamanya tetap tersimpan.</p>
    </Modal>
  );
}
