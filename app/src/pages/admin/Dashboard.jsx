import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { currentPeriod, shiftPeriod, cmpPeriod, periodTitle, periodRangeLabel, periodQuery } from '../../lib/period';
import { KIND_LABEL } from '../../lib/uploads';
import { Page, Card, Loading, Empty, PeriodPicker, Progress, Icon, useToast } from '../../components/ui';

const KINDS = ['kunjungan', 'pengawasan', 'surat_tugas', 'stnk', 'kendaraan'];
const pendingCount = (kind) =>
  supabase.from('uploads').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('kind', kind);

export default function Dashboard() {
  const nav = useNavigate();
  const toast = useToast();
  const now = currentPeriod('kunjungan');
  const [per, setPer] = useState(now);
  const [rows, setRows] = useState(null);
  const [pend, setPend] = useState({});
  const [onlyGap, setOnlyGap] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    setRows(null);
    supabase.rpc('period_progress', { p_year: per.year, p_month: per.month, p_part: per.part }).then(({ data, error }) => {
      if (error) toast(errMsg(error), 'err');
      setRows(data || []);
    });
  }, [per.year, per.month, per.part]); // eslint-disable-line
  useEffect(() => {
    Promise.all(KINDS.map(pendingCount)).then((res) => setPend(Object.fromEntries(KINDS.map((k, i) => [k, res[i].count || 0]))));
  }, []);

  const k = useMemo(() => {
    const r = rows || [];
    const sum = (f) => r.reduce((a, x) => a + x[f], 0);
    return { total: sum('total'), up: sum('uploaded'), ok: sum('approved'), bad: sum('rejected'), awas: sum('awas_uploaded'),
             zero: r.filter((x) => x.total && !x.uploaded).length, nks: r.length };
  }, [rows]);
  const pendTotal = Object.values(pend).reduce((a, b) => a + b, 0);

  const list = (rows || [])
    .filter((r) => !onlyGap || r.uploaded < r.total)
    .filter((r) => !q || `${r.nks} ${r.desa} ${r.kecamatan} ${r.ppl_name} ${r.pml_name}`.toLowerCase().includes(q.toLowerCase()));
  const move = (d) => { const n = shiftPeriod(per, d); if (cmpPeriod(n, now) <= 0) setPer(n); };
  const pct = k.total ? Math.round((k.up / k.total) * 100) : 0;

  return (
    <Page title="Dashboard" subtitle={`${periodTitle(per)} · ${periodRangeLabel(per)}`} wide
          actions={<PeriodPicker value={per} max={now} onChange={move} label={periodTitle(per)} range={periodRangeLabel(per)} />}>
      <div className="kpis">
        <Card className="kpi"><span>Foto pendataan (PPL)</span><b>{k.up}<small> / {k.total}</small></b><Progress value={k.up} total={k.total} /><em>{pct}% ruta periode ini</em></Card>
        <Card className="kpi"><span>Foto pengawasan (PML) bulan ini</span><b>{k.awas}<small> / {k.total}</small></b><Progress value={k.awas} total={k.total} tone="ok" /><em>1 foto per ruta per bulan</em></Card>
        <Card className="kpi click" onClick={() => nav('/verifikasi')}><span>Menunggu verifikasi</span><b className="t-warn">{pendTotal}</b>
          <em>{KINDS.filter((x) => pend[x]).map((x) => `${pend[x]} ${KIND_LABEL[x].toLowerCase()}`).join(' · ') || 'semua sudah diperiksa'}</em></Card>
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
              <thead><tr><th>NKS</th><th>Desa / Kecamatan</th><th>PPL</th><th>PML</th><th style={{ width: '20%' }}>Pendataan</th><th style={{ width: '16%' }}>Pengawasan</th><th className="num">Ditolak</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.nks} className="click" onClick={() => nav(`/nks/${r.nks}?${periodQuery(per)}`)}>
                    <td className="mono">{r.nks}</td>
                    <td>{r.desa}<small className="block muted">{r.kecamatan}</small></td>
                    <td>{r.ppl_name || <span className="muted">—</span>}</td>
                    <td>{r.pml_name || <span className="muted">—</span>}</td>
                    <td><div className="prog-cell"><Progress value={r.uploaded} total={r.total} tone={!r.uploaded ? 'err' : r.uploaded < r.total ? 'warn' : 'ok'} /><span>{r.uploaded}/{r.total}</span></div></td>
                    <td><div className="prog-cell"><Progress value={r.awas_uploaded} total={r.total} tone="ok" /><span>{r.awas_uploaded}/{r.total}</span></div></td>
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
