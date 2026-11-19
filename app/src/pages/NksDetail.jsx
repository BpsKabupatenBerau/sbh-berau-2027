import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, errMsg } from '../lib/supabase';
import { isoWeek, shiftWeek, weekRange, cmpWeek, fmtDateTime } from '../lib/week';
import { mapsLink } from '../lib/media';
import { Page, Card, Chip, Loading, Empty, WeekPicker, SignedImg, Lightbox, useToast } from '../components/ui';

// One NKS, one week: every ruta with its kunjungan photo. Used by PML and admin.
export default function NksDetail() {
  const { nks } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const now = isoWeek();
  const wk = sp.get('y') ? { year: +sp.get('y'), week: +sp.get('w') } : now;
  const [d, setD] = useState(null);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    setD(null);
    (async () => {
      const [{ data: info, error }, { data: ruta }, { data: ups }] = await Promise.all([
        supabase.from('nks').select('*').eq('nks', nks).maybeSingle(),
        supabase.from('ruta').select('*').eq('nks', nks).eq('active', true).order('no_urut'),
        supabase.from('uploads').select('*').eq('kind', 'kunjungan').eq('nks', nks)
          .eq('period_year', wk.year).eq('period_week', wk.week),
      ]);
      if (error || !info) { toast(error ? errMsg(error) : 'NKS tidak ditemukan', 'err'); nav('/'); return; }
      const ids = [info.ppl_id, info.pml_id].filter(Boolean);
      const { data: ppl } = ids.length ? await supabase.from('profiles').select('id, full_name, username').in('id', ids) : { data: [] };
      const pm = Object.fromEntries((ppl || []).map((p) => [p.id, p.full_name || p.username]));
      setD({ info, ppl: pm[info.ppl_id], pml: pm[info.pml_id], ruta: ruta || [],
             ups: Object.fromEntries((ups || []).map((u) => [u.ruta_id, u])) });
    })();
  }, [nks, wk.year, wk.week]); // eslint-disable-line

  const move = (delta) => {
    const n = shiftWeek(wk, delta);
    if (cmpWeek(n, now) > 0) return;
    setSp({ y: n.year, w: n.week }, { replace: true });
  };

  return (
    <Page title={`NKS ${nks}`} subtitle={d ? `${d.info.desa || ''} · PPL ${d.ppl || '—'}` : ' '} back={() => nav(-1)} wide>
      <WeekPicker value={wk} max={now} onChange={move} label={`Minggu ke-${wk.week}`} range={weekRange(wk)} />
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
