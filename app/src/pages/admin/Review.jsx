import { useEffect, useState, useCallback } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { isoWeek, shiftWeek, weekRange, weekStart, fmtDateTime } from '../../lib/week';
import { mapsLink } from '../../lib/media';
import { signedUrls } from '../../lib/uploads';
import { Page, Card, Chip, Button, Icon, Loading, Empty, Modal, SignedImg, Lightbox, useToast } from '../../components/ui';

const KINDS = [['kunjungan', 'Kunjungan'], ['surat_tugas', 'Surat Tugas'], ['supervisi', 'Supervisi']];
const STATUSES = [['pending', 'Menunggu'], ['rejected', 'Ditolak'], ['approved', 'Disetujui'], ['all', 'Semua']];
const REASONS = ['Foto buram / gelap', 'Rumah/ruta tidak terlihat', 'Bukan di lokasi ruta', 'Foto lama, bukan minggu ini', 'Berkas tidak terbaca'];
const PAGE = 48;

/** Things an admin should look at twice. */
function flags(u) {
  const f = [];
  if ((u.kind === 'kunjungan' || u.kind === 'supervisi') && u.lat == null) f.push('Tanpa lokasi');
  if (u.accuracy_m > 200) f.push(`GPS kasar ±${Math.round(u.accuracy_m)} m`);
  if (u.kind === 'kunjungan' && u.taken_at && u.period_year) {
    const s = weekStart(u.period_year, u.period_week), e = new Date(s); e.setDate(s.getDate() + 7);
    const t = new Date(u.taken_at);
    if (t < s || t >= e) f.push('Diambil di luar minggu ini');
  }
  return f;
}

export default function Review() {
  const toast = useToast();
  const [kind, setKind] = useState('kunjungan');
  const [status, setStatus] = useState('pending');
  const [wk, setWk] = useState(null); // null = all weeks
  const [nksQ, setNksQ] = useState('');
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [maps, setMaps] = useState({ people: {}, ruta: {} });
  const [sel, setSel] = useState(new Set());
  const [zoom, setZoom] = useState(null);
  const [reject, setReject] = useState(null); // {ids:[], note}
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (append = false) => {
    if (!append) { setItems(null); setSel(new Set()); }
    let q = supabase.from('uploads').select('*').eq('kind', kind)
      .order('created_at', { ascending: status === 'pending' })
      .range(append ? items.length : 0, (append ? items.length : 0) + PAGE - 1);
    if (status !== 'all') q = q.eq('status', status);
    if (wk && kind !== 'surat_tugas') q = q.eq('period_year', wk.year).eq('period_week', wk.week);
    if (nksQ.trim() && kind !== 'surat_tugas') q = q.ilike('nks', `${nksQ.trim()}%`);
    const { data, error } = await q;
    if (error) { toast(errMsg(error), 'err'); setItems([]); return; }
    const next = append ? [...items, ...data] : data;
    setItems(next);
    setMore(data.length === PAGE);
    signedUrls(data.map((u) => u.file_path)); // prefetch thumbnails in one batch

    const pIds = [...new Set(next.map((u) => u.user_id))].filter((id) => !maps.people[id]);
    const rIds = [...new Set(next.map((u) => u.ruta_id).filter(Boolean))].filter((id) => !maps.ruta[id]);
    const [{ data: ps }, { data: rs }] = await Promise.all([
      pIds.length ? supabase.from('profiles').select('id, full_name, username, role').in('id', pIds) : { data: [] },
      rIds.length ? supabase.from('ruta').select('id, no_urut, nama_krt').in('id', rIds) : { data: [] },
    ]);
    setMaps((m) => ({
      people: { ...m.people, ...Object.fromEntries((ps || []).map((p) => [p.id, p])) },
      ruta: { ...m.ruta, ...Object.fromEntries((rs || []).map((r) => [r.id, r])) },
    }));
  }, [kind, status, wk, nksQ, items, maps, toast]);

  useEffect(() => { load(false); }, [kind, status, wk?.year, wk?.week]); // eslint-disable-line

  async function decide(ids, st, note = null) {
    setBusy(true);
    const { data, error } = await supabase.rpc('review_uploads', { p_ids: ids, p_status: st, p_note: note });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast(`${data} unggahan ${st === 'approved' ? 'disetujui' : st === 'rejected' ? 'ditolak' : 'dikembalikan'}`, st === 'rejected' ? 'dark' : 'ok');
    setSel(new Set());
    setReject(null);
    setItems((cur) => status === 'all' || status === st
      ? cur.map((u) => ids.includes(u.id) ? { ...u, status: st, review_note: note } : u)
      : cur.filter((u) => !ids.includes(u.id)));
  }

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allIds = (items || []).filter((u) => u.status !== 'approved').map((u) => u.id);
  const who = (id) => maps.people[id]?.full_name || maps.people[id]?.username || '…';

  const title = (u) => {
    if (u.kind === 'surat_tugas') return `Surat tugas · ${who(u.user_id)}`;
    const r = maps.ruta[u.ruta_id];
    return `NKS ${u.nks}${r ? ` · Ruta ${r.no_urut} ${r.nama_krt}` : ''}`;
  };

  return (
    <Page title="Verifikasi" subtitle="Periksa foto & berkas dari lapangan" wide>
      <div className="filters">
        <div className="seg">{KINDS.map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
        <div className="seg">{STATUSES.map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
        {kind !== 'surat_tugas' && (
          <>
            <div className="seg">
              <button className={!wk ? 'on' : ''} onClick={() => setWk(null)}>Semua minggu</button>
              <button className={wk ? 'on' : ''} onClick={() => setWk(wk || isoWeek())}>{wk ? `Minggu ke-${wk.week}` : 'Per minggu'}</button>
              {wk && <>
                <button onClick={() => setWk(shiftWeek(wk, -1))} aria-label="Minggu sebelumnya"><Icon name="left" size={16} /></button>
                <button onClick={() => setWk(shiftWeek(wk, 1))} aria-label="Minggu berikutnya"><Icon name="right" size={16} /></button>
              </>}
            </div>
            <form className="search sm" onSubmit={(e) => { e.preventDefault(); load(false); }}>
              <Icon name="search" size={16} /><input placeholder="NKS…" value={nksQ} onChange={(e) => setNksQ(e.target.value)} inputMode="numeric" />
            </form>
          </>
        )}
      </div>
      {wk && kind !== 'surat_tugas' && <p className="hint">{weekRange(wk)}</p>}

      {items && items.length > 0 && status !== 'approved' && (
        <div className="bulkbar">
          <label className="toggle"><input type="checkbox" checked={sel.size > 0 && sel.size === allIds.length}
            onChange={(e) => setSel(e.target.checked ? new Set(allIds) : new Set())} /> Pilih semua ({allIds.length})</label>
          {sel.size > 0 && <>
            <span className="muted">{sel.size} dipilih</span>
            <Button variant="ok" icon="check" busy={busy} onClick={() => decide([...sel], 'approved')}>Setujui</Button>
            <Button variant="danger" icon="x" onClick={() => setReject({ ids: [...sel], note: '' })}>Tolak</Button>
          </>}
        </div>
      )}

      {!items ? <Loading /> : !items.length ? (
        <Empty icon="shield" title={status === 'pending' ? 'Semua sudah diperiksa 🎉' : 'Tidak ada data'}>Tidak ada unggahan untuk filter ini.</Empty>
      ) : (
        <div className="review-grid">
          {items.map((u) => {
            const f = flags(u);
            return (
              <Card key={u.id} className={`rcard ${sel.has(u.id) ? 'sel' : ''}`}>
                <div className="rimg-wrap">
                  <SignedImg path={u.file_path} className="rimg" onClick={() => setZoom(u)} />
                  {u.status !== 'approved' && (
                    <label className="rcheck" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} />
                    </label>
                  )}
                  {u.kind !== 'surat_tugas' && u.period_week && <span className="rweek">Mg {u.period_week}</span>}
                </div>
                <div className="rbody">
                  <div className="rtitle"><b>{title(u)}</b><Chip status={u.status} /></div>
                  <small>{u.kind !== 'surat_tugas' && <>oleh {who(u.user_id)} · </>}{fmtDateTime(u.taken_at || u.created_at)}</small>
                  {u.lat != null && <small><a href={mapsLink(u.lat, u.lng)} target="_blank" rel="noreferrer"><Icon name="map" size={13} /> {u.lat.toFixed(5)}, {u.lng.toFixed(5)}</a> ±{Math.round(u.accuracy_m || 0)} m</small>}
                  {f.length > 0 && <div className="rflags">{f.map((x) => <span key={x}>{x}</span>)}</div>}
                  {u.status === 'rejected' && u.review_note && <small className="t-err">“{u.review_note}”</small>}
                </div>
                <div className="ract">
                  {u.status !== 'approved' && <Button variant="ok" icon="check" busy={busy} onClick={() => decide([u.id], 'approved')}>Setujui</Button>}
                  {u.status !== 'rejected' && <Button variant="danger-ghost" icon="x" onClick={() => setReject({ ids: [u.id], note: '' })}>Tolak</Button>}
                  {u.status !== 'pending' && <Button variant="ghost" onClick={() => decide([u.id], 'pending')}>Batalkan</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {more && <Button variant="ghost" className="mt block" onClick={() => load(true)}>Muat lebih banyak</Button>}

      {zoom && <Lightbox path={zoom.file_path} onClose={() => setZoom(null)}
                         caption={`${title(zoom)} · ${fmtDateTime(zoom.taken_at || zoom.created_at)}`} />}

      <Modal open={!!reject} title={`Tolak ${reject?.ids.length || ''} unggahan`} onClose={() => setReject(null)}
             footer={<>
               <Button variant="ghost" onClick={() => setReject(null)}>Batal</Button>
               <Button variant="danger" busy={busy} disabled={!reject?.note.trim()} onClick={() => decide(reject.ids, 'rejected', reject.note.trim())}>Tolak</Button>
             </>}>
        <p className="muted">Catatan ini dilihat petugas, lalu mereka mengambil ulang foto.</p>
        <div className="reasons">{REASONS.map((r) => <button key={r} type="button" onClick={() => setReject((x) => ({ ...x, note: r }))}>{r}</button>)}</div>
        <textarea rows={3} value={reject?.note || ''} onChange={(e) => setReject((x) => ({ ...x, note: e.target.value }))}
                  placeholder="Tulis alasan penolakan…" autoFocus />
      </Modal>
    </Page>
  );
}
