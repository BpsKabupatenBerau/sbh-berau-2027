import { useEffect, useMemo, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { putRaw, removeFiles, signedUrl } from '../../lib/uploads';
import { fmtDateTime, ymNow, triwulanOf, TRIWULAN } from '../../lib/period';
import { Page, Card, Button, Icon, Loading, Empty, Modal, useToast } from '../../components/ui';

/** "6405_00059_002_LAZUARDY MASRUR.pdf" -> { nks:'00059', nus:'002' } (lenient about separators). */
export function parseRekapName(name) {
  const base = name.replace(/\.pdf$/i, '');
  const m = base.match(/(?:^|[_\-\s])(\d{5})[_\-\s]+(\d{1,4})(?=$|[_\-\s])/) || base.match(/^(?:6405)?[_\-\s]*(\d{5})[_\-\s]*(\d{3})/);
  if (!m) return null;
  return { nks: m[1], nus: m[2].replace(/^0+(?=\d{3})/, '').padStart(3, '0') };
}

const PML_STATUS = { ok: ['Sesuai', 'ok'], masalah: ['Ada masalah', 'err'] };
export function RekapChip({ r }) {
  if (!r) return <span className="chip chip-idle">Belum ada berkas</span>;
  if (!r.pml_checked) return <span className="chip chip-warn">Belum dicek PML</span>;
  const [l, t] = PML_STATUS[r.pml_status] || ['Dicek', 'ok'];
  return <span className={`chip chip-${t}`}>{l}</span>;
}
export async function openPdf(path, toast) {
  const w = window.open('', '_blank');
  const u = await signedUrl(path);
  if (!u) { w?.close(); toast?.('Berkas tidak bisa dibuka', 'err'); return; }
  if (w) w.location.href = u; else window.location.href = u;
}

// Admin: bulk-upload Rekap BL PDFs (one per ruta per triwulan) and follow the PML checks.
export default function RekapBL() {
  const { uid } = useAuth();
  const toast = useToast();
  const now = ymNow();
  const [per, setPer] = useState({ tahun: now.year, tw: triwulanOf(now.month) });
  const [ruta, setRuta] = useState(null);
  const [nks, setNks] = useState([]);
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState(null);   // pending bulk upload
  const [prog, setProg] = useState(null);
  const [del, setDel] = useState(null);

  async function load() {
    setRows(null);
    const [r, n, b] = await Promise.all([
      ruta ? { data: ruta } : supabase.from('ruta').select('id, nks, no_urut, nama_krt, active').order('nks').order('no_urut').limit(5000),
      nks.length ? { data: nks } : supabase.from('nks').select('nks, desa, kecamatan, pml_id').order('nks'),
      supabase.from('rekap_bl').select('*').eq('tahun', per.tahun).eq('triwulan', per.tw).limit(5000),
    ]);
    if (b.error) toast(errMsg(b.error), 'err');
    setRuta(r.data || []); setNks(n.data || []); setRows(b.data || []);
  }
  useEffect(() => { load(); }, [per.tahun, per.tw]); // eslint-disable-line

  const byRuta = useMemo(() => new Map((rows || []).map((x) => [x.ruta_id, x])), [rows]);
  const rutaKey = useMemo(() => new Map((ruta || []).map((r) => [`${r.nks}|${r.no_urut}`, r])), [ruta]);
  const desa = useMemo(() => Object.fromEntries(nks.map((n) => [n.nks, n.desa])), [nks]);

  const list = useMemo(() => (ruta || []).filter((r) => r.active !== false).map((r) => ({ r, b: byRuta.get(r.id) }))
    .filter(({ b }) => filter === 'all' || (filter === 'none' ? !b : filter === 'unchecked' ? b && !b.pml_checked : b?.pml_status === filter))
    .filter(({ r }) => !q || `${r.nks} ${r.nama_krt} ${desa[r.nks] || ''}`.toLowerCase().includes(q.toLowerCase())), [ruta, byRuta, filter, q, desa]);

  const count = useMemo(() => {
    const c = { total: (ruta || []).filter((r) => r.active !== false).length, have: 0, unchecked: 0, ok: 0, masalah: 0 };
    (rows || []).forEach((b) => { c.have++; if (!b.pml_checked) c.unchecked++; else c[b.pml_status] = (c[b.pml_status] || 0) + 1; });
    return c;
  }, [rows, ruta]);

  function onFiles(e) {
    const files = [...(e.target.files || [])]; e.target.value = '';
    if (!files.length) return;
    const seen = new Set();
    const items = files.map((f) => {
      const p = parseRekapName(f.name);
      let error = '', r = null;
      if (!/\.pdf$/i.test(f.name)) error = 'Bukan PDF';
      else if (f.size > 5 * 1024 * 1024) error = 'Lebih dari 5 MB';
      else if (!p) error = 'Nama berkas tidak sesuai pola 6405_NKS_NUS_NAMA.pdf';
      else if (!(r = rutaKey.get(`${p.nks}|${p.nus}`))) error = `Ruta NKS ${p.nks} no. ${p.nus} tidak ada di sampel`;
      else if (seen.has(r.id)) error = 'Ruta ini muncul dua kali';
      if (r && !error) seen.add(r.id);
      return { f, p, r, error, replace: r && byRuta.has(r.id) };
    });
    setPlan(items);
  }

  async function run() {
    const good = plan.filter((x) => !x.error);
    setProg({ done: 0, total: good.length, failed: [] });
    const failed = [];
    let i = 0;
    const worker = async () => {
      while (i < good.length) {
        const x = good[i++];
        const path = `${uid}/rekap_bl/${per.tahun}-T${per.tw}/${x.r.nks}_${x.r.no_urut}_${Date.now().toString(36)}.pdf`;
        try {
          await putRaw(path, x.f, 'application/pdf', false);
          const old = byRuta.get(x.r.id)?.file_path;
          const { error } = await supabase.from('rekap_bl').upsert({
            ruta_id: x.r.id, tahun: per.tahun, triwulan: per.tw, file_path: path, file_name: x.f.name, uploaded_by: uid,
          }, { onConflict: 'ruta_id,tahun,triwulan' });
          if (error) { await removeFiles([path]); throw error; }
          if (old && old !== path) removeFiles([old]).catch(() => {});
        } catch (err) { failed.push(`${x.f.name}: ${errMsg(err)}`); }
        setProg((p) => ({ ...p, done: p.done + 1 }));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setProg(null); setPlan(null);
    if (failed.length) toast(`${failed.length} berkas gagal: ${failed[0]}`, 'err');
    else toast(`${good.length} rekap BL terunggah`, 'ok');
    load();
  }

  async function remove() {
    const { error } = await supabase.from('rekap_bl').delete().eq('id', del.id);
    if (error) return toast(errMsg(error), 'err');
    removeFiles([del.file_path]).catch(() => {});
    setDel(null); toast('Rekap BL dihapus', 'ok'); load();
  }

  const years = [now.year - 1, now.year, now.year + 1];
  return (
    <Page title="Rekap BL" subtitle={`Triwulan ${TRIWULAN[per.tw - 1]} ${per.tahun} · ${count.have}/${count.total} ruta berberkas`} wide
          actions={<label className="btn btn-primary"><Icon name="upload" size={18} /><span>Unggah PDF</span>
            <input type="file" accept="application/pdf,.pdf" multiple hidden onChange={onFiles} /></label>}>
      <div className="toolbar">
        <div className="seg">{years.map((y) => <button key={y} className={per.tahun === y ? 'on' : ''} onClick={() => setPer((p) => ({ ...p, tahun: y }))}>{y}</button>)}</div>
        <div className="seg">{[1, 2, 3, 4].map((t) => <button key={t} className={per.tw === t ? 'on' : ''} onClick={() => setPer((p) => ({ ...p, tw: t }))}>TW {TRIWULAN[t - 1]}</button>)}</div>
      </div>
      <div className="kpis kpis-4">
        <Card className="kpi"><span>Berkas terunggah</span><b>{count.have}<small> / {count.total}</small></b></Card>
        <Card className="kpi"><span>Belum dicek PML</span><b className="t-warn">{count.unchecked}</b></Card>
        <Card className="kpi"><span>Sesuai</span><b className="t-ok">{count.ok || 0}</b></Card>
        <Card className={`kpi ${count.masalah ? 'kpi-alert' : ''}`}><span>Ada masalah</span><b className="t-err">{count.masalah || 0}</b></Card>
      </div>
      <div className="toolbar">
        <div className="seg">{[['all', 'Semua'], ['none', 'Belum ada berkas'], ['unchecked', 'Belum dicek'], ['ok', 'Sesuai'], ['masalah', 'Masalah']].map(([k, l]) =>
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <div className="search"><Icon name="search" size={18} /><input placeholder="Cari NKS, nama KRT, desa…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <p className="hint" style={{ justifyContent: 'flex-start' }}>Nama berkas: <span className="mono">6405_NKS_NUS_NAMA.pdf</span>, mis. <span className="mono">6405_00059_002_LAZUARDY.pdf</span>. Pilih banyak berkas sekaligus.</p>

      {!rows ? <Loading /> : !list.length ? <Empty icon="layers" title="Tidak ada data">Unggah PDF rekap BL atau ubah filter.</Empty> : (
        <Card className="table-card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>NKS</th><th>No.</th><th>Nama KRT</th><th>Berkas</th><th>Pemeriksaan PML</th><th>Catatan</th><th /></tr></thead>
              <tbody>
                {list.map(({ r, b }) => (
                  <tr key={r.id} className={b?.pml_status === 'masalah' ? 'bad' : ''}>
                    <td className="mono">{r.nks}<small className="block muted">{desa[r.nks]}</small></td>
                    <td className="mono">{r.no_urut}</td>
                    <td>{r.nama_krt}</td>
                    <td>{b ? <button className="linkish" onClick={() => openPdf(b.file_path, toast)}><Icon name="file" size={16} /> Buka PDF</button> : <span className="muted">—</span>}
                      {b && <small className="block muted">{fmtDateTime(b.uploaded_at)}</small>}</td>
                    <td><RekapChip r={b} />{b?.pml_checked_at && <small className="block muted">{fmtDateTime(b.pml_checked_at)}</small>}</td>
                    <td style={{ maxWidth: 260 }}>{b?.pml_note || ''}</td>
                    <td className="row-actions">{b && <button className="icon-btn" title="Hapus" onClick={() => setDel(b)}><Icon name="x" size={18} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={!!plan} title={`Unggah Rekap BL · TW ${TRIWULAN[per.tw - 1]} ${per.tahun}`} wide onClose={() => !prog && setPlan(null)}
             footer={prog ? <div style={{ flex: 1 }}><div className="progressbar-lg"><i style={{ width: `${(prog.done / prog.total) * 100}%` }} /></div><small className="muted">{prog.done} / {prog.total} berkas…</small></div> : (
               <div className="btn-row" style={{ flex: 1 }}>
                 <Button variant="ghost" onClick={() => setPlan(null)}>Batal</Button>
                 <Button icon="upload" disabled={!plan?.some((x) => !x.error)} onClick={run}>Unggah {plan?.filter((x) => !x.error).length || 0} berkas</Button>
               </div>)}>
        {plan && (
          <div className="table-wrap tall">
            <table className="table compact">
              <thead><tr><th>Berkas</th><th>Ruta</th><th>Keterangan</th></tr></thead>
              <tbody>
                {plan.map((x, i) => (
                  <tr key={i} className={x.error ? 'bad' : x.replace ? 'warn' : ''}>
                    <td className="mono" style={{ wordBreak: 'break-all' }}>{x.f.name}</td>
                    <td>{x.r ? `${x.r.nks} · ${x.r.no_urut} · ${x.r.nama_krt}` : '—'}</td>
                    <td>{x.error ? <span className="t-err">{x.error}</span> : x.replace ? 'Mengganti berkas lama (cek PML diulang)' : 'Baru'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
      <Modal open={!!del} title="Hapus rekap BL?" onClose={() => setDel(null)}
             footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setDel(null)}>Batal</Button><Button variant="danger" onClick={remove}>Hapus</Button></div>}>
        <p>Berkas <b>{del?.file_name}</b> dan hasil pemeriksaan PML-nya akan dihapus.</p>
      </Modal>
    </Page>
  );
}
