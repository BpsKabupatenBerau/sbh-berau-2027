import { useEffect, useState, useCallback } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { currentPeriod, shiftPeriod, periodTitle, periodRangeLabel, inPeriod, monthLabel, fmtDateTime, fmtDate, TRIWULAN } from '../../lib/period';
import { mapsLink } from '../../lib/media';
import { signedUrls, KIND_LABEL } from '../../lib/uploads';
import { Page, Card, Chip, Button, Icon, Loading, Empty, Modal, SignedImg, Lightbox, useToast } from '../../components/ui';

const KINDS = ['kunjungan', 'pengawasan', 'bl', 'hr', 'surat_tugas', 'stnk', 'kendaraan'];
const STATUSES = [['pending', 'Menunggu'], ['rejected', 'Ditolak'], ['approved', 'Disetujui'], ['di_kantor', 'Di kantor'], ['all', 'Semua']];
const TERMINAL = (s) => s === 'approved' || s === 'di_kantor';
const REASONS = {
  kunjungan: ['Foto buram / gelap', 'Rumah/ruta tidak terlihat', 'Bukan di lokasi ruta', 'Foto bukan periode ini'],
  pengawasan: ['Foto buram / gelap', 'PML tidak terlihat di lokasi', 'Bukan di lokasi ruta', 'Foto bukan bulan ini'],
  surat_tugas: ['Berkas tidak terbaca', 'Belum ditandatangani', 'Halaman tidak lengkap', 'Bukan surat tugas bulan ini'],
  stnk: ['STNK tidak terbaca', 'STNK sudah habis masa berlaku', 'Nomor polisi tidak sama', 'Halaman tidak lengkap'],
  kendaraan: ['Pelat nomor tidak terlihat', 'Kendaraan tidak sesuai STNK', 'Foto buram / gelap'],
  bl: ['Berkas tidak terbaca', 'Halaman tidak lengkap', 'Bukan BL ruta ini', 'Bukan bulan ini'],
  hr: ['Berkas tidak terbaca', 'Halaman tidak lengkap', 'Bukan HR ruta ini', 'Bukan triwulan ini'],
};
const PAGE = 48;
const hasPeriod = (k) => k === 'kunjungan' || k === 'pengawasan' || k === 'surat_tugas';

function flags(u) {
  const f = [];
  if ((u.kind === 'kunjungan' || u.kind === 'pengawasan' || u.kind === 'kendaraan') && u.lat == null) f.push('Tanpa lokasi');
  if (u.accuracy_m > 200) f.push(`GPS kasar ±${Math.round(u.accuracy_m)} m`);
  if ((u.kind === 'kunjungan' || u.kind === 'pengawasan') && u.taken_at && u.period_month) {
    const p = { year: u.period_year, month: u.period_month, part: u.kind === 'kunjungan' ? u.period_part : 0 };
    if (!inPeriod(u.taken_at, p)) f.push('Diambil di luar periode');
  }
  if (u.kind === 'stnk' && u.meta?.berlaku && new Date(u.meta.berlaku) < new Date()) f.push('STNK habis masa berlaku');
  return f;
}

export default function Review() {
  const toast = useToast();
  const [kind, setKind] = useState('kunjungan');
  const [status, setStatus] = useState('pending');
  const [per, setPer] = useState(null);           // null = all periods
  const [nksQ, setNksQ] = useState('');
  const [items, setItems] = useState(null);
  const [more, setMore] = useState(false);
  const [maps, setMaps] = useState({ people: {}, ruta: {} });
  const [sel, setSel] = useState(new Set());
  const [zoom, setZoom] = useState(null);
  const [reject, setReject] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (append = false) => {
    if (!append) { setItems(null); setSel(new Set()); }
    const from = append ? items.length : 0;
    let q = supabase.from('uploads').select('*').eq('kind', kind)
      .order('created_at', { ascending: status === 'pending' }).range(from, from + PAGE - 1);
    if (status !== 'all') q = q.eq('status', status);
    if (per && hasPeriod(kind)) {
      q = q.eq('period_year', per.year).eq('period_month', per.month);
      if (kind === 'kunjungan') q = q.eq('period_part', per.part);
    }
    if (nksQ.trim() && ['kunjungan', 'pengawasan', 'bl', 'hr'].includes(kind)) q = q.ilike('nks', `${nksQ.trim()}%`);
    const { data, error } = await q;
    if (error) { toast(errMsg(error), 'err'); setItems([]); return; }
    const next = append ? [...items, ...data] : data;
    setItems(next); setMore(data.length === PAGE);
    signedUrls(data.map((u) => u.file_path));
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
  }, [kind, status, per, nksQ, items, maps, toast]);

  useEffect(() => { load(false); }, [kind, status, per?.year, per?.month, per?.part]); // eslint-disable-line

  function pickKind(k) {
    setKind(k);
    setPer((p) => (p && hasPeriod(k) ? { ...p, part: k === 'kunjungan' ? (p.part || currentPeriod('kunjungan').part) : 0 } : null));
  }

  async function decide(ids, st, note = null) {
    setBusy(true);
    const { data, error } = await supabase.rpc('review_uploads', { p_ids: ids, p_status: st, p_note: note });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    const verb = { approved: 'disetujui', rejected: 'ditolak', di_kantor: 'ditandai sudah di kantor', pending: 'dikembalikan' }[st] || 'diperbarui';
    toast(`${data} berkas ${verb}`, st === 'rejected' ? 'dark' : 'ok');
    setSel(new Set()); setReject(null);
    setItems((cur) => (status === 'all' || status === st
      ? cur.map((u) => (ids.includes(u.id) ? { ...u, status: st, review_note: note } : u))
      : cur.filter((u) => !ids.includes(u.id))));
  }

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allIds = (items || []).filter((u) => !TERMINAL(u.status)).map((u) => u.id);
  const who = (id) => maps.people[id]?.full_name || maps.people[id]?.username || '…';
  const role = (id) => maps.people[id]?.role?.toUpperCase() || '';

  const title = (u) => {
    if (['kunjungan', 'pengawasan', 'bl', 'hr'].includes(u.kind)) {
      const r = maps.ruta[u.ruta_id];
      return `NKS ${u.nks}${r ? ` · Ruta ${r.no_urut} ${r.nama_krt}` : ''}`;
    }
    return `${who(u.user_id)} · ${role(u.user_id)}`;
  };
  const subline = (u) => {
    if (u.kind === 'kunjungan') return `${periodTitle({ year: u.period_year, month: u.period_month, part: u.period_part })} · oleh ${who(u.user_id)}`;
    if (u.kind === 'pengawasan') return `${monthLabel(u.period_year, u.period_month)} · oleh ${who(u.user_id)}`;
    if (u.kind === 'bl') return `BL ${monthLabel(u.period_year, u.period_month)} · oleh ${who(u.user_id)}`;
    if (u.kind === 'hr') return `HR Triwulan ${TRIWULAN[(u.period_part || 1) - 1]} ${u.period_year} · oleh ${who(u.user_id)}`;
    if (u.kind === 'surat_tugas') return `${monthLabel(u.period_year, u.period_month)} · No. ${u.meta?.nomor || '—'}`;
    const m = u.meta || {};
    return [m.nomor_polisi, m.jenis, m.berlaku && `berlaku s.d. ${fmtDate(m.berlaku)}`].filter(Boolean).join(' · ');
  };

  return (
    <Page title="Verifikasi" subtitle="Periksa foto & berkas dari lapangan" wide>
      <div className="filters">
        <div className="seg">{KINDS.map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => pickKind(k)}>{KIND_LABEL[k]}</button>)}</div>
        <div className="seg">{STATUSES.map(([k, l]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
        {hasPeriod(kind) && (
          <div className="seg">
            <button className={!per ? 'on' : ''} onClick={() => setPer(null)}>Semua periode</button>
            <button className={per ? 'on' : ''} onClick={() => setPer(per || currentPeriod(kind))}>{per ? periodTitle(per) : 'Pilih periode'}</button>
            {per && <>
              <button onClick={() => setPer(shiftPeriod(per, -1))} aria-label="Sebelumnya"><Icon name="left" size={16} /></button>
              <button onClick={() => setPer(shiftPeriod(per, 1))} aria-label="Berikutnya"><Icon name="right" size={16} /></button>
            </>}
          </div>
        )}
        {(kind === 'kunjungan' || kind === 'pengawasan') && (
          <form className="search sm" onSubmit={(e) => { e.preventDefault(); load(false); }}>
            <Icon name="search" size={16} /><input placeholder="NKS…" value={nksQ} onChange={(e) => setNksQ(e.target.value)} inputMode="numeric" />
          </form>
        )}
      </div>
      {per && kind === 'kunjungan' && <p className="hint">{periodRangeLabel(per)}</p>}

      {items && items.length > 0 && !TERMINAL(status) && (
        <div className="bulkbar">
          <label className="toggle"><input type="checkbox" checked={sel.size > 0 && sel.size === allIds.length}
            onChange={(e) => setSel(e.target.checked ? new Set(allIds) : new Set())} /> Pilih semua ({allIds.length})</label>
          {sel.size > 0 && <>
            <span className="muted">{sel.size} dipilih</span>
            <Button variant="ok" icon="check" busy={busy} onClick={() => decide([...sel], 'approved')}>Setujui</Button>
            <Button variant="danger" icon="x" onClick={() => setReject({ ids: [...sel], note: '' })}>Tolak</Button>
            <Button variant="ghost" icon="inbox" busy={busy} onClick={() => decide([...sel], 'di_kantor')}>Sudah di kantor</Button>
          </>}
        </div>
      )}

      {!items ? <Loading /> : !items.length ? (
        <Empty icon="shield" title={status === 'pending' ? 'Semua sudah diperiksa 🎉' : 'Tidak ada data'}>Tidak ada berkas untuk filter ini.</Empty>
      ) : (
        <div className="review-grid">
          {items.map((u) => {
            const f = flags(u);
            return (
              <Card key={u.id} className={`rcard ${sel.has(u.id) ? 'sel' : ''}`}>
                <div className="rimg-wrap">
                  <SignedImg path={u.file_path} className="rimg" onClick={() => !u.file_path.endsWith('.pdf') && setZoom(u)} />
                  {u.status !== 'approved' && (
                    <label className="rcheck" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel.has(u.id)} onChange={() => toggle(u.id)} />
                    </label>
                  )}
                  {u.kind === 'kunjungan' && u.period_part ? <span className="rweek">P{u.period_part}</span> : null}
                </div>
                <div className="rbody">
                  <div className="rtitle"><b>{title(u)}</b><Chip status={u.status} /></div>
                  <small>{subline(u)}</small>
                  <small>{fmtDateTime(u.taken_at || u.created_at)}</small>
                  {u.lat != null && <small><a href={mapsLink(u.lat, u.lng)} target="_blank" rel="noreferrer"><Icon name="map" size={13} /> {u.lat.toFixed(5)}, {u.lng.toFixed(5)}</a> ±{Math.round(u.accuracy_m || 0)} m</small>}
                  {f.length > 0 && <div className="rflags">{f.map((x) => <span key={x}>{x}</span>)}</div>}
                  {u.status === 'rejected' && u.review_note && <small className="t-err">“{u.review_note}”</small>}
                </div>
                <div className="ract">
                  {!TERMINAL(u.status) && <Button variant="ok" icon="check" busy={busy} onClick={() => decide([u.id], 'approved')}>Setujui</Button>}
                  {u.status !== 'rejected' && u.status !== 'di_kantor' && <Button variant="danger-ghost" icon="x" onClick={() => setReject({ ids: [u.id], note: '' })}>Tolak</Button>}
                  {u.status !== 'di_kantor' && <Button variant="ghost" icon="inbox" busy={busy} onClick={() => decide([u.id], 'di_kantor')}>Di kantor</Button>}
                  {u.status !== 'pending' && <Button variant="ghost" onClick={() => decide([u.id], 'pending')}>Batalkan</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {more && <Button variant="ghost" className="mt block" onClick={() => load(true)}>Muat lebih banyak</Button>}

      {zoom && <Lightbox path={zoom.file_path} onClose={() => setZoom(null)} caption={`${title(zoom)} · ${subline(zoom)}`} />}

      <Modal open={!!reject} title={`Tolak ${reject?.ids.length || ''} berkas`} onClose={() => setReject(null)}
             footer={<>
               <Button variant="ghost" onClick={() => setReject(null)}>Batal</Button>
               <Button variant="danger" busy={busy} disabled={!reject?.note.trim()} onClick={() => decide(reject.ids, 'rejected', reject.note.trim())}>Tolak</Button>
             </>}>
        <p className="muted">Catatan ini dilihat petugas, lalu mereka mengunggah ulang.</p>
        <div className="reasons">{(REASONS[kind] || []).map((r) => <button key={r} type="button" onClick={() => setReject((x) => ({ ...x, note: r }))}>{r}</button>)}</div>
        <textarea rows={3} value={reject?.note || ''} onChange={(e) => setReject((x) => ({ ...x, note: e.target.value }))} placeholder="Tulis alasan penolakan…" autoFocus />
      </Modal>
    </Page>
  );
}
