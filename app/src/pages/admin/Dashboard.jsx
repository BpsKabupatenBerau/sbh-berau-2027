import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { isoWeek, shiftWeek, weekRange, cmpWeek } from '../../lib/week';
import { Page, Card, Loading, Empty, WeekPicker, Progress, Icon, useToast } from '../../components/ui';

const pendingCount = (kind) =>
  supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('kind', kind);

export default function Dashboard() {
  const nav = useNavigate();
  const toast = useToast();
  const now = isoWeek();
  const [wk, setWk] = useState(now);
  const [rows, setRows] = useState(null);
  const [pend, setPend] = useState({});
  const [onlyGap, setOnlyGap] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    setRows(null);
    supabase.rpc('week_progress', { p_year: wk.year, p_week: wk.week }).then(({ data, error }) => {
      if (error) toast(errMsg(error), 'err');
      setRows(data || []);
    });
  }, [wk.year, wk.week]); // eslint-disable-line
  useEffect(() => {
    Promise.all(['kunjungan', 'surat_tugas', 'supervisi'].map(pendingCount)).then(([a, b, c]) =>
      setPend({ kunjungan: a.count || 0, surat_tugas: b.count || 0, supervisi: c.count || 0 }));
  }, []);

  const k = useMemo(() => {
    const r = rows || [];
    const sum = (f) => r.reduce((a, x) => a + x[f], 0);
    return { total: sum('total'), up: sum('uploaded'), ok: sum('approved'), wait: sum('pending'), bad: sum('rejected'),
             zero: r.filter((x) => x.total && !x.uploaded).length, nks: r.length };
  }, [rows]);

  const list = (rows || [])
    .filter((r) => !onlyGap || r.uploaded < r.total)
    .filter((r) => !q || `${r.nks} ${r.desa} ${r.kecamatan} ${r.ppl_name} ${r.pml_name}`.toLowerCase().includes(q.toLowerCase()));

  const move = (d) => { const n = shiftWeek(wk, d); if (cmpWeek(n, now) <= 0) setWk(n); };
  const pct = k.total ? Math.round((k.up / k.total) * 100) : 0;

  return (
    <Page title="Dashboard" subtitle={`Minggu ke-${wk.week} · ${weekRange(wk)}`} wide
          actions={<WeekPicker value={wk} max={now} onChange={move} label={`Minggu ke-${wk.week}`} range={weekRange(wk)} />}>
      <div className="kpis">
        <Card className="kpi"><span>Kunjungan terunggah</span><b>{k.up}<small> / {k.total}</small></b><Progress value={k.up} total={k.total} /><em>{pct}% ruta minggu ini</em></Card>
        <Card className="kpi click" onClick={() => nav('/verifikasi')}><span>Menunggu verifikasi</span><b className="t-warn">{(pend.kunjungan ?? 0) + (pend.surat_tugas ?? 0) + (pend.supervisi ?? 0)}</b><em>{pend.kunjungan ?? 0} kunjungan · {pend.surat_tugas ?? 0} surat tugas</em></Card>
        <Card className="kpi"><span>Disetujui / Ditolak</span><b><span className="t-ok">{k.ok}</span> <small>/</small> <span className="t-err">{k.bad}</span></b><em>minggu ini</em></Card>
        <Card className={`kpi click ${k.zero ? 'kpi-alert' : ''}`} onClick={() => setOnlyGap(true)}><span>NKS belum unggah sama sekali</span><b className={k.zero ? 't-err' : ''}>{k.zero}</b><em>dari {k.nks} NKS</em></Card>
      </div>

      <div className="toolbar">
        <div className="search"><Icon name="search" size={18} /><input placeholder="Cari NKS, desa, PPL, PML…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="toggle"><input type="checkbox" checked={onlyGap} onChange={(e) => setOnlyGap(e.target.checked)} /> Hanya yang belum lengkap</label>
      </div>

      {!rows ? <Loading /> : !rows.length ? (
        <Empty icon="map" title="Belum ada sampel">Tambahkan NKS dan ruta di menu <b>Sampel</b>.</Empty>
      ) : (
        <Card className="table-card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>NKS</th><th>Desa / Kecamatan</th><th>PPL</th><th>PML</th><th style={{ width: '22%' }}>Kunjungan</th><th className="num">Menunggu</th><th className="num">Ditolak</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.nks} className="click" onClick={() => nav(`/nks/${r.nks}?y=${wk.year}&w=${wk.week}`)}>
                    <td className="mono">{r.nks}</td>
                    <td>{r.desa}<small className="block muted">{r.kecamatan}</small></td>
                    <td>{r.ppl_name || <span className="muted">—</span>}</td>
                    <td>{r.pml_name || <span className="muted">—</span>}</td>
                    <td><div className="prog-cell"><Progress value={r.uploaded} total={r.total} tone={!r.uploaded ? 'err' : r.uploaded < r.total ? 'warn' : 'ok'} /><span>{r.uploaded}/{r.total}</span></div></td>
                    <td className="num">{r.pending || ''}</td>
                    <td className="num t-err">{r.rejected || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!list.length && <Empty title="Tidak ada yang cocok" />}
        </Card>
      )}
    </Page>
  );
}
