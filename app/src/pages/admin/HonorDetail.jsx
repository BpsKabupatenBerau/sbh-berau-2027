import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { BULAN_FULL, fmtDate } from '../../lib/period';
import { bruto, neto, terbilangRupiah, exportNominatif, saveTtd } from '../../lib/honorExport';
import { Page, Card, Button, Icon, Loading, Empty, Modal, useToast } from '../../components/ui';
import { rp, maskRek } from './Honor';

const HEAD = [['judul', 'Judul'], ['sk', 'Baris SK'], ['program', 'PROGRAM'], ['kegiatan', 'KEGIATAN'], ['kro', 'KRO'], ['ro', 'RO'], ['komponen', 'KOMPONEN'],
  ['akun', 'AKUN'], ['bulan_label', 'BULAN (teks)'], ['tempat', 'Tempat'], ['tanggal', 'Tanggal tanda tangan'], ['bendahara_nama', 'Bendahara'], ['bendahara_nip', 'NIP Bendahara'],
  ['ppk_nama', 'PPK'], ['ppk_nip', 'NIP PPK']];

/**
 * Suggest who can be paid: for a linked PPL, every ruta photographed in all 3 periods of the month and approved,
 * plus the month's surat tugas approved. For a PML, pengawasan of every ruta approved + surat tugas approved.
 */
async function suggest(k, items, petugas) {
  if (!k.tahun || !k.bulan) return {};
  const uids = items.map((it) => petugas[it.petugas_id]?.user_id).filter(Boolean);
  if (!uids.length) return {};
  const [nks, up] = await Promise.all([
    supabase.from('nks').select('nks, ppl_id, pml_id'),
    supabase.from('uploads').select('user_id, kind, status, nks, ruta_id, period_part').in('user_id', uids)
      .eq('period_year', k.tahun).eq('period_month', k.bulan).in('kind', ['kunjungan', 'pengawasan', 'surat_tugas']).limit(20000),
  ]);
  const ruta = await supabase.from('ruta').select('id, nks, active').limit(10000);
  const rutaPerNks = {};
  (ruta.data || []).filter((r) => r.active !== false).forEach((r) => { rutaPerNks[r.nks] = (rutaPerNks[r.nks] || 0) + 1; });
  const out = {};
  for (const it of items) {
    const uid = petugas[it.petugas_id]?.user_id;
    if (!uid) continue;
    const mine = (up.data || []).filter((u) => u.user_id === uid);
    const st = mine.find((u) => u.kind === 'surat_tugas');
    const asPpl = (nks.data || []).filter((n) => n.ppl_id === uid).map((n) => n.nks);
    const asPml = (nks.data || []).filter((n) => n.pml_id === uid).map((n) => n.nks);
    let need = 0, ok = 0, label;
    if (asPpl.length) {
      need = asPpl.reduce((a, n) => a + (rutaPerNks[n] || 0) * 3, 0);
      ok = mine.filter((u) => u.kind === 'kunjungan' && u.status === 'approved').length;
      label = 'foto pendataan';
    } else {
      need = asPml.reduce((a, n) => a + (rutaPerNks[n] || 0), 0);
      ok = mine.filter((u) => u.kind === 'pengawasan' && u.status === 'approved').length;
      label = 'foto pengawasan';
    }
    const pct = need ? Math.min(100, Math.round((ok / need) * 100)) : 0;
    out[it.id] = { pct, ok, need, label, st: st?.status || 'none', layak: need > 0 && ok >= need && st?.status === 'approved' };
  }
  return out;
}

// Admin: one honor kegiatan — petugas rows, eligibility, and the Excel nominatif.
export default function HonorDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [k, setK] = useState(null);
  const [items, setItems] = useState(null);
  const [petugas, setPetugas] = useState({});
  const [people, setPeople] = useState({});
  const [nksList, setNksList] = useState([]);
  const [head, setHead] = useState(null);
  const [add, setAdd] = useState(null);
  const [exp, setExp] = useState(null);
  const [sug, setSug] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [pph, setPph] = useState('');
  const [delK, setDelK] = useState(false);

  async function load() {
    const [a, b, c, d, e] = await Promise.all([
      supabase.from('honor_kegiatan').select('*').eq('id', id).single(),
      supabase.from('honor_item').select('*').eq('kegiatan_id', id).order('urut').order('id'),
      supabase.from('honor_petugas').select('*').order('nama'),
      supabase.from('profiles').select('id, full_name, username, role'),
      supabase.from('nks').select('nks, ppl_id, pml_id'),
    ]);
    if (a.error) { toast(errMsg(a.error), 'err'); return; }
    setK(a.data); setItems(b.data || []);
    setPetugas(Object.fromEntries((c.data || []).map((p) => [p.id, p])));
    setPeople(Object.fromEntries((d.data || []).map((p) => [p.id, p])));
    setNksList(e.data || []);
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  const rows = useMemo(() => (items || []).map((it) => ({ ...it, p: petugas[it.petugas_id] || {} }))
    .filter((it) => !q || `${it.p.nama} ${it.pml} ${it.korwil} ${it.kelompok} ${it.p.bank}`.toLowerCase().includes(q.toLowerCase())), [items, petugas, q]);
  const tot = useMemo(() => (items || []).reduce((a, it) => ({ n: a.n + 1, ok: a.ok + (it.eligible ? 1 : 0), b: a.b + bruto(it), p: a.p + (Number(it.pph21) || 0), t: a.t + neto(it), te: a.te + (it.eligible ? neto(it) : 0) }),
    { n: 0, ok: 0, b: 0, p: 0, t: 0, te: 0 }), [items]);

  async function patch(it, change) {
    setItems((x) => x.map((y) => (y.id === it.id ? { ...y, ...change } : y)));
    const { error } = await supabase.from('honor_item').update(change).eq('id', it.id);
    if (error) { toast(errMsg(error), 'err'); load(); }
  }
  async function patchMany(list, change) {
    if (!list.length) return;
    const ids = new Set(list.map((x) => x.id));
    setItems((x) => x.map((y) => (ids.has(y.id) ? { ...y, ...(typeof change === 'function' ? change(y) : change) } : y)));
    if (typeof change === 'function') {
      const res = await Promise.all(list.map((it) => supabase.from('honor_item').update(change(it)).eq('id', it.id)));
      const err = res.find((r) => r.error)?.error; if (err) { toast(errMsg(err), 'err'); load(); }
    } else {
      const { error } = await supabase.from('honor_item').update(change).in('id', [...ids]);
      if (error) { toast(errMsg(error), 'err'); load(); }
    }
  }
  async function remove(it) {
    const { error } = await supabase.from('honor_item').delete().eq('id', it.id);
    if (error) return toast(errMsg(error), 'err');
    setItems((x) => x.filter((y) => y.id !== it.id));
  }

  // ---------- add petugas ----------
  const inKeg = new Set((items || []).map((it) => it.petugas_id));
  function openAdd() {
    const want = (k.jabatan || '').toLowerCase();
    const cand = Object.values(petugas).filter((p) => !inKeg.has(p.id));
    setAdd({ cand, sel: new Set(cand.filter((p) => !want || String(p.jabatan || '').toLowerCase() === want).map((p) => p.id)), q: '' });
  }
  function pmlFor(p) {
    if (!p.user_id) return '';
    const n = nksList.find((x) => x.ppl_id === p.user_id);
    return n ? (people[n.pml_id]?.full_name || '') : '';
  }
  async function runAdd() {
    setBusy(true);
    const start = (items || []).reduce((a, it) => Math.max(a, it.urut || 0), 0);
    const list = add.cand.filter((p) => add.sel.has(p.id)).map((p, i) => ({
      kegiatan_id: Number(id), petugas_id: p.id, urut: start + i + 1, honor_ob: Number(k.honor_ob) || 0, volume: 1, pph21: 0,
      pml: pmlFor(p) || null, korwil: p.korwil || null,
    }));
    const { error } = await supabase.from('honor_item').insert(list);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setAdd(null); toast(`${list.length} petugas ditambahkan`, 'ok'); load();
  }

  async function saveHead() {
    setBusy(true);
    const row = { ...head, honor_ob: Number(head.honor_ob) || 0, tahun: Number(head.tahun) || null, bulan: Number(head.bulan) || null, tanggal: head.tanggal || null };
    delete row.id; delete row.created_at;
    const { error } = await supabase.from('honor_kegiatan').update(row).eq('id', id);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    saveTtd(row);  // remember bendahara/PPK/tempat for the next kegiatan
    setHead(null); load();
  }
  async function deleteKegiatan() {
    const { error } = await supabase.from('honor_kegiatan').delete().eq('id', id);
    if (error) return toast(errMsg(error), 'err');
    nav('/honor', { replace: true });
  }
  async function runSuggest() {
    setBusy(true);
    try { setSug(await suggest(k, items, petugas)); } catch (e) { toast(errMsg(e), 'err'); }
    setBusy(false);
  }
  async function doExport() {
    setBusy(true);
    try {
      const list = (items || []).map((it) => { const p = petugas[it.petugas_id] || {}; return { ...it, nama: p.nama, bank: p.bank, norek: p.norek }; });
      const r = await exportNominatif(k, list, exp);
      toast(`Excel dibuat: ${r.rows} petugas, ${r.sheets} sheet`, 'ok'); setExp(null);
    } catch (e) { toast(`Gagal membuat Excel: ${errMsg(e)}`, 'err'); }
    setBusy(false);
  }

  if (!k || !items) return <Page title="Honor" back={() => nav('/honor')}><Loading /></Page>;
  const missingBank = (items || []).filter((it) => !petugas[it.petugas_id]?.bank || !petugas[it.petugas_id]?.norek).length;
  return (
    <Page title={k.judul} back={() => nav('/honor')} wide
          subtitle={`${k.jabatan || 'Semua petugas'} · bulan kerja ${k.bulan ? BULAN_FULL[k.bulan - 1] : '—'} ${k.tahun || ''}${k.tanggal ? ` · ttd ${fmtDate(k.tanggal)}` : ''}`}
          actions={<>
            <Button variant="ghost" icon="edit" onClick={() => setHead({ ...k })}>Kepala surat</Button>
            <Button icon="download" disabled={!items.length} onClick={() => setExp({ onlyEligible: false, byBank: true, byKelompok: false })}>Excel nominatif</Button></>}>
      <div className="kpis">
        <Card className="kpi"><span>Petugas</span><b>{tot.n}</b><em>{tot.ok} ditandai layak dicairkan</em></Card>
        <Card className="kpi"><span>Jumlah bruto</span><b className="kpi-sm">{rp(tot.b)}</b><em>PPh 21 {rp(tot.p)}</em></Card>
        <Card className="kpi"><span>Jumlah diterima</span><b className="kpi-sm">{rp(tot.t)}</b><em>{terbilangRupiah(tot.t)}</em></Card>
        <Card className={`kpi ${missingBank ? 'kpi-alert' : ''}`}><span>Yang layak saja</span><b className="kpi-sm">{rp(tot.te)}</b>
          <em>{missingBank ? <span className="t-err">{missingBank} petugas tanpa rekening</span> : 'Rekening lengkap'}</em></Card>
      </div>

      <div className="toolbar">
        <Button variant="ghost" icon="plus" onClick={openAdd}>Tambah petugas</Button>
        <Button variant="ghost" icon="shield" busy={busy && !exp} onClick={runSuggest} disabled={!items.length}>Saran kelayakan</Button>
        {sug && <Button variant="ghost" icon="check" onClick={() => patchMany(items.filter((it) => sug[it.id]), (it) => ({ eligible: !!sug[it.id]?.layak }))}>Terapkan saran</Button>}
        <span className="inline-field">PPh 21 <input value={pph} onChange={(e) => setPph(e.target.value)} placeholder="%" inputMode="decimal" />%
          <Button variant="ghost" disabled={pph === ''} onClick={() => patchMany(items, (it) => ({ pph21: Math.round(bruto(it) * (Number(pph.replace(',', '.')) || 0) / 100) }))}>Terapkan</Button></span>
        <div className="search"><Icon name="search" size={18} /><input placeholder="Cari nama, PML, korwil, bank…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {sug && <p className="hint" style={{ justifyContent: 'flex-start' }}>Saran: layak bila semua foto {k.jabatan === 'PML' ? 'pengawasan' : 'pendataan'} bulan {BULAN_FULL[(k.bulan || 1) - 1]} disetujui dan surat tugas bulan itu disetujui. Petugas yang belum terhubung ke akun aplikasi tidak bisa dinilai.</p>}

      {!items.length ? <Empty icon="users" title="Belum ada petugas">Klik “Tambah petugas” untuk mengambil dari database rekening.</Empty> : (
        <Card className="table-card">
          <div className="table-wrap tall honor-wrap">
            <table className="table compact honor-table">
              <thead><tr><th>No</th><th>Nama</th><th className="num">Honor OB</th><th className="num">Vol</th><th className="num">Bruto</th><th className="num">PPh 21</th>
                <th className="num">Diterima</th><th>Bank / rekening</th><th>PML</th><th>Korwil</th><th>Kelompok</th><th>{sug ? 'Layak · saran' : 'Layak'}</th><th /></tr></thead>
              <tbody>
                {rows.map((it, i) => (
                  <tr key={it.id} className={!it.p.norek ? 'bad' : ''}>
                    <td className="num">{i + 1}</td>
                    <td><b>{it.p.nama}</b><small className="block muted">{it.p.jabatan}</small></td>
                    <td><input className="cellin num" defaultValue={it.honor_ob} key={`h${it.id}${it.honor_ob}`} inputMode="numeric"
                               onBlur={(e) => Number(e.target.value) !== Number(it.honor_ob) && patch(it, { honor_ob: Number(e.target.value) || 0 })} /></td>
                    <td><input className="cellin num sm" defaultValue={it.volume} key={`v${it.id}${it.volume}`} inputMode="decimal"
                               onBlur={(e) => Number(e.target.value.replace(',', '.')) !== Number(it.volume) && patch(it, { volume: Number(e.target.value.replace(',', '.')) || 0 })} /></td>
                    <td className="num">{bruto(it).toLocaleString('id-ID')}</td>
                    <td><input className="cellin num" defaultValue={it.pph21} key={`p${it.id}${it.pph21}`} inputMode="numeric"
                               onBlur={(e) => Number(e.target.value) !== Number(it.pph21) && patch(it, { pph21: Number(e.target.value) || 0 })} /></td>
                    <td className="num"><b>{neto(it).toLocaleString('id-ID')}</b></td>
                    <td>{it.p.bank || <span className="t-err">tanpa bank</span>}<small className="block mono muted">{maskRek(it.p.norek)}</small></td>
                    <td><input className="cellin" defaultValue={it.pml || ''} key={`m${it.id}${it.pml}`} onBlur={(e) => e.target.value !== (it.pml || '') && patch(it, { pml: e.target.value || null })} /></td>
                    <td><input className="cellin sm" defaultValue={it.korwil || ''} key={`k${it.id}${it.korwil}`} onBlur={(e) => e.target.value !== (it.korwil || '') && patch(it, { korwil: e.target.value || null })} /></td>
                    <td><input className="cellin sm" defaultValue={it.kelompok || ''} key={`g${it.id}${it.kelompok}`} placeholder="mis. 17 pagi" onBlur={(e) => e.target.value !== (it.kelompok || '') && patch(it, { kelompok: e.target.value || null })} /></td>
                    <td><div className="layak-cell"><input type="checkbox" className="bigcheck" checked={it.eligible} onChange={(e) => patch(it, { eligible: e.target.checked })} />
                      {sug && (sug[it.id] ? <span className={`chip chip-${sug[it.id].layak ? 'ok' : sug[it.id].pct >= 80 ? 'warn' : 'err'}`}
                                                title={`${sug[it.id].ok}/${sug[it.id].need} ${sug[it.id].label} disetujui · surat tugas: ${sug[it.id].st}`}>{sug[it.id].pct}%{sug[it.id].st === 'approved' ? '' : ' · ST'}</span>
                        : <small className="muted">tanpa akun</small>)}</div></td>
                    <td className="row-actions"><button className="icon-btn" title="Keluarkan" onClick={() => remove(it)}><Icon name="x" size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <div className="btn-row mt" style={{ maxWidth: 260 }}><Button variant="danger-ghost" onClick={() => setDelK(true)}>Hapus kegiatan ini</Button></div>

      <Modal open={!!add} title="Tambah petugas dari database" wide onClose={() => setAdd(null)}
             footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setAdd(null)}>Batal</Button>
               <Button busy={busy} disabled={!add?.sel.size} onClick={runAdd}>Tambah {add?.sel.size || 0} petugas</Button></div>}>
        {add && (!add.cand.length ? <Empty icon="users" title="Semua petugas sudah masuk">Tambah petugas baru di Database rekening.</Empty> : (
          <>
            <div className="toolbar">
              {['PPL', 'PML'].map((j) => <Button key={j} variant="ghost" onClick={() => setAdd((a) => ({ ...a, sel: new Set(a.cand.filter((p) => String(p.jabatan || '').toUpperCase() === j).map((p) => p.id)) }))}>Pilih semua {j}</Button>)}
              <Button variant="ghost" onClick={() => setAdd((a) => ({ ...a, sel: new Set() }))}>Kosongkan</Button>
              <div className="search"><Icon name="search" size={18} /><input value={add.q} placeholder="Cari…" onChange={(e) => setAdd((a) => ({ ...a, q: e.target.value }))} /></div>
            </div>
            <div className="table-wrap tall">
              <table className="table compact">
                <thead><tr><th /><th>Nama</th><th>Jabatan</th><th>Bank</th><th>Korwil</th></tr></thead>
                <tbody>{add.cand.filter((p) => !add.q || p.nama.toLowerCase().includes(add.q.toLowerCase())).map((p) => (
                  <tr key={p.id} className="click" onClick={() => setAdd((a) => { const s = new Set(a.sel); s.has(p.id) ? s.delete(p.id) : s.add(p.id); return { ...a, sel: s }; })}>
                    <td><input type="checkbox" readOnly checked={add.sel.has(p.id)} /></td><td>{p.nama}</td><td>{p.jabatan}</td><td>{p.bank || <span className="t-err">kosong</span>}</td><td>{p.korwil}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </>
        ))}
      </Modal>

      <Modal open={!!exp} title="Unduh Excel nominatif" onClose={() => setExp(null)}
             footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setExp(null)}>Batal</Button>
               <Button icon="download" busy={busy} onClick={doExport}>Unduh .xlsx</Button></div>}>
        {exp && (
          <div className="form">
            <label className="check"><input type="checkbox" checked={exp.onlyEligible} onChange={(e) => setExp((x) => ({ ...x, onlyEligible: e.target.checked }))} /> Hanya petugas yang ditandai layak ({tot.ok})</label>
            <label className="check"><input type="checkbox" checked={exp.byBank} onChange={(e) => setExp((x) => ({ ...x, byBank: e.target.checked }))} /> Sheet terpisah per bank</label>
            <label className="check"><input type="checkbox" checked={exp.byKelompok} onChange={(e) => setExp((x) => ({ ...x, byKelompok: e.target.checked }))} /> Sheet terpisah per kelompok pencairan (mis. “17 pagi-BRI”)</label>
            <p className="hint" style={{ justifyContent: 'flex-start' }}>Sheet “Master” memuat semua baris + kolom PML, Korwil, Kelompok, Layak. Rumus bruto, diterima, dan jumlah tetap aktif di Excel.</p>
          </div>
        )}
      </Modal>

      <Modal open={!!head} title="Kepala surat & tanda tangan" wide onClose={() => setHead(null)}
             footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setHead(null)}>Batal</Button><Button busy={busy} onClick={saveHead}>Simpan</Button></div>}>
        {head && (
          <div className="form grid2">
            {HEAD.map(([key, l]) => <label key={key} className={key === 'judul' || key === 'sk' ? 'span2' : ''}>{l}
              <input type={key === 'tanggal' ? 'date' : 'text'} value={head[key] || ''} onChange={(e) => setHead((h) => ({ ...h, [key]: e.target.value }))} /></label>)}
            <label>Petugas<select value={head.jabatan || ''} onChange={(e) => setHead((h) => ({ ...h, jabatan: e.target.value || null }))}>
              <option value="PPL">PPL</option><option value="PML">PML</option><option value="">Semua</option></select></label>
            <label>Honor per OB (default)<input value={head.honor_ob || ''} inputMode="numeric" onChange={(e) => setHead((h) => ({ ...h, honor_ob: e.target.value }))} /></label>
            <label>Bulan kerja<select value={head.bulan || ''} onChange={(e) => setHead((h) => ({ ...h, bulan: e.target.value }))}>
              {BULAN_FULL.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}</select></label>
            <label>Tahun<input value={head.tahun || ''} inputMode="numeric" onChange={(e) => setHead((h) => ({ ...h, tahun: e.target.value }))} /></label>
          </div>
        )}
      </Modal>
      <Modal open={delK} title="Hapus kegiatan honor?" onClose={() => setDelK(false)}
             footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setDelK(false)}>Batal</Button><Button variant="danger" onClick={deleteKegiatan}>Hapus</Button></div>}>
        <p>Kegiatan <b>{k.judul}</b> dan {items.length} baris petugasnya akan dihapus. Database rekening tidak terpengaruh.</p>
      </Modal>
    </Page>
  );
}
