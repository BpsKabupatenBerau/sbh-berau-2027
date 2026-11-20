import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, errMsg } from '../lib/supabase';
import { currentPeriod, shiftPeriod, cmpPeriod, periodTitle, periodRangeLabel, periodFromParams, periodQuery, fmtDateTime } from '../lib/period';
import { mapsLink } from '../lib/media';
import { Page, Card, Chip, Loading, Empty, PeriodPicker, SignedImg, Lightbox, useToast } from '../components/ui';

// One NKS, one pendataan period: every ruta with its PPL photo, plus the PML pengawasan status for that month.
export default function NksDetail() {
  const { nks } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const now = currentPeriod('kunjungan');
  const per = periodFromParams(sp, 'kunjungan');
  const [d, setD] = useState(null);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    setD(null);
    (async () => {
      const [{ data: info, error }, { data: ruta }, { data: ups }, { data: awas }] = await Promise.all([
        supabase.from('nks').select('*').eq('nks', nks).maybeSingle(),
        supabase.from('ruta').select('*').eq('nks', nks).eq('active', true).order('no_urut'),
        supabase.from('uploads').select('*').eq('kind', 'kunjungan').eq('nks', nks)
          .eq('period_year', per.year).eq('period_month', per.month).eq('period_part', per.part),
        supabase.from('uploads').select('ruta_id, status').eq('kind', 'pengawasan').eq('nks', nks)
          .eq('period_year', per.year).eq('period_month', per.month),
      ]);
      if (error || !info) { toast(error ? errMsg(error) : 'NKS tidak ditemukan', 'err'); nav('/'); return; }
      const ids = [info.ppl_id, info.pml_id].filter(Boolean);
      const { data: ppl } = ids.length ? await supabase.from('profiles').select('id, full_name, username').in('id', ids) : { data: [] };
      const pm = Object.fromEntries((ppl || []).map((p) => [p.id, p.full_name || p.username]));
      setD({ info, ppl: pm[info.ppl_id], ruta: ruta || [],
             ups: Object.fromEntries((ups || []).map((u) => [u.ruta_id, u])),
             awas: Object.fromEntries((awas || []).map((u) => [u.ruta_id, u.status])) });
    })();
  }, [nks, per.year, per.month, per.part]); // eslint-disable-line

  const move = (delta) => {
    const n = shiftPeriod(per, delta);
    if (cmpPeriod(n, now) > 0) return;
    setSp(Object.fromEntries(new URLSearchParams(periodQuery(n))), { replace: true });
  };

  return (
    <Page title={`NKS ${nks}`} subtitle={d ? `${d.info.desa || ''} · PPL ${d.ppl || '—'}` : ' '} back={() => nav(-1)} wide>
      <PeriodPicker value={per} max={now} onChange={move} label={periodTitle(per)} range={periodRangeLabel(per)} />
      {!d ? <Loading /> : !d.ruta.length ? <Empty title="Belum ada ruta di NKS ini" /> : (
        <div className="gallery">
          {d.ruta.map((r) => {
            const u = d.ups[r.id];
            return (
              <Card key={r.id} className="gcard">
                {u ? <SignedImg path={u.file_path} className="gimg" onClick={() => setZoom({ u, r })} />
                   : <div className="gimg gimg-empty">Belum ada foto</div>}
                <div className="gbody">
                  <div className="gtop"><b>{r.no_urut} · {r.nama_krt}</b><Chip status={u?.status || 'none'} /></div>
                  {u && <small>{fmtDateTime(u.taken_at)}{u.lat ? <> · <a href={mapsLink(u.lat, u.lng)} target="_blank" rel="noreferrer">lokasi</a></> : ' · tanpa lokasi'}</small>}
                  {u?.status === 'rejected' && <small className="t-err">{u.review_note}</small>}
                  <small>Pengawasan bulan ini: <Chip status={d.awas[r.id] || 'none'} /></small>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {zoom && <Lightbox path={zoom.u.file_path} onClose={() => setZoom(null)}
                         caption={`Ruta ${zoom.r.no_urut} · ${zoom.r.nama_krt} · ${fmtDateTime(zoom.u.taken_at)}`} />}
    </Page>
  );
}
