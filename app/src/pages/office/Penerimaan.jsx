import { useEffect, useMemo, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { ymNow, fmtDateTime } from '../../lib/period';
import { Page, Card, Button, Icon, Loading, Empty, MonthPicker, Progress, useToast } from '../../components/ui';
import { loadSample, loadDokumen, KONDISI, personName } from './data';

// Admin & pengolahan: record which ruta documents arrived at the office, per month.
export default function Penerimaan() {
  const toast = useToast();
  const [ym, setYm] = useState(ymNow());
  const [s, setS] = useState(null);
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => { loadSample().then(setS).catch((e) => toast(errMsg(e), 'err')); }, []); // eslint-disable-line
  async function load() {
    setDocs(null);
    try { setDocs(await loadDokumen(ym.year, ym.month)); } catch (e) { toast(errMsg(e), 'err'); setDocs([]); }
  }
  useEffect(() => { load(); }, [ym.year, ym.month]); // eslint-disable-line

  const byRuta = useMemo(() => new Map((docs || []).map((d) => [d.ruta_id, d])), [docs]);
  const groups = useMemo(() => {
    if (!s) return [];
    return s.nks.map((n) => {
      const rs = s.ruta.filter((r) => r.nks === n.nks);
      const got = rs.filter((r) => byRuta.has(r.id)).length;
      return { n, rs, got };
    }).filter((g) => g.rs.length)
      .filter((g) => !only || g.got < g.rs.length)
      .filter((g) => !q || `${g.n.nks} ${g.n.desa} ${g.n.kecamatan} ${personName(s.people, g.n.ppl_id)}`.toLowerCase().includes(q.toLowerCase()));
  }, [s, byRuta, q, only]);

  const tot = useMemo(() => {
    const t = (s?.ruta || []).length, got = (docs || []).length;
    const bad = (docs || []).filter((d) => d.kondisi !== 'lengkap').length;
    const full = s ? s.nks.filter((n) => { const rs = s.ruta.filter((r) => r.nks === n.nks); return rs.length && rs.every((r) => byRuta.has(r.id)); }).length : 0;
    return { t, got, bad, full };
  }, [s, docs, byRuta]);

  async function receive(rs) {
    const add = rs.filter((r) => !byRuta.has(r.id)).map((r) => ({ ruta_id: r.id, nks: r.nks, tahun: ym.year, bulan: ym.month }));
    if (!add.length) return;
    setBusy(rs[0].nks);
    const { data, error } = await supabase.from('dokumen').insert(add).select();
    setBusy('');
    if (error) return toast(errMsg(error), 'err');
    setDocs((d) => [...d, ...(data || add)]);
    toast(`${add.length} dokumen diterima`, 'ok');
  }
  async function unreceive(d) {
    if (d.batch_id) return toast('Dokumen sudah masuk batch. Keluarkan dari batch dulu.', 'err');
    const { error } = await supabase.from('dokumen').delete().eq('id', d.id);
    if (error) return toast(errMsg(error), 'err');
    setDocs((x) => x.filter((y) => y.id !== d.id));
  }
  async function patch(d, change) {
    const { error } = await supabase.from('dokumen').update(change).eq('id', d.id);
    if (error) return toast(errMsg(error), 'err');
    setDocs((x) => x.map((y) => (y.id === d.id ? { ...y, ...change } : y)));
  }

  return (
    <Page title="Penerimaan Dokumen" subtitle="Dokumen ruta yang sudah diterima kantor, per bulan" wide
          actions={<MonthPicker value={ym} onChange={setYm} label={docs ? `${tot.got} / ${tot.t} dokumen` : ' '} />}>
      <div className="kpis">
        <Card className="kpi"><span>Dokumen diterima</span><b>{tot.got}<small> / {tot.t}</small></b><Progress value={tot.got} total={tot.t} /></Card>
        <Card className="kpi"><span>NKS lengkap</span><b>{tot.full}<small> / {s?.nks.length ?? 0}</small></b></Card>
        <Card className="kpi"><span>Belum diterima</span><b className="t-warn">{Math.max(tot.t - tot.got, 0)}</b></Card>
        <Card className={`kpi ${tot.bad ? 'kpi-alert' : ''}`}><span>Tidak lengkap / rusak</span><b className="t-err">{tot.bad}</b></Card>
      </div>
      <div className="toolbar">
        <div className="search"><Icon name="search" size={18} /><input placeholder="Cari NKS, desa, kecamatan, PPL…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="check"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Hanya yang belum lengkap</label>
      </div>

      {!s || !docs ? <Loading /> : !groups.length ? <Empty icon="inbox" title="Tidak ada NKS">Ubah pencarian atau filter.</Empty> : (
        <Card className="list">
          {groups.map(({ n, rs, got }) => (
            <div key={n.nks} className={`recv ${open === n.nks ? 'open' : ''}`}>
              <button className="row" onClick={() => setOpen(open === n.nks ? null : n.nks)}>
                <span className={`num ${got === rs.length ? 'num-approved' : got ? 'num-pending' : ''}`}>{got}</span>
                <span className="row-tx"><b>NKS {n.nks} · {n.desa}</b>
                  <small>{n.kecamatan} · PPL {personName(s.people, n.ppl_id)} · {got}/{rs.length} diterima</small>
                  <Progress value={got} total={rs.length} /></span>
                <Icon name={open === n.nks ? 'left' : 'right'} className="row-arw" />
              </button>
              {open === n.nks && (
                <div className="recv-body">
                  <div className="recv-bar">
                    <Button icon="inbox" busy={busy === n.nks} disabled={got === rs.length} onClick={() => receive(rs)}>Terima semua ({rs.length - got})</Button>
                  </div>
                  <div className="table-wrap">
                    <table className="table compact">
                      <thead><tr><th>Diterima</th><th>No.</th><th>Nama KRT</th><th>Kondisi</th><th>Catatan</th><th>Waktu</th></tr></thead>
                      <tbody>
                        {rs.map((r) => {
                          const d = byRuta.get(r.id);
                          return (
                            <tr key={r.id} className={d && d.kondisi !== 'lengkap' ? 'warn' : !d ? 'dim-soft' : ''}>
                              <td><input type="checkbox" className="bigcheck" checked={!!d} onChange={() => (d ? unreceive(d) : receive([r]))} /></td>
                              <td className="mono">{r.no_urut}</td>
                              <td>{r.nama_krt}</td>
                              <td>{d && <select className="cellin" value={d.kondisi} onChange={(e) => patch(d, { kondisi: e.target.value })}>
                                {Object.entries(KONDISI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</td>
                              <td>{d && <input className="cellin" defaultValue={d.catatan || ''} placeholder="—"
                                              onBlur={(e) => e.target.value !== (d.catatan || '') && patch(d, { catatan: e.target.value || null })} />}</td>
                              <td><small className="muted">{d ? `${fmtDateTime(d.received_at)} · ${personName(s.people, d.received_by)}` : ''}</small>
                                {d?.batch_id && <small className="block t-ok">dalam batch</small>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}
