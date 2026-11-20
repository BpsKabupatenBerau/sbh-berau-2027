import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { monthLabel, fmtDateTime } from '../../lib/period';
import { Page, Card, Button, Icon, Loading, Empty, Modal, Progress, useToast } from '../../components/ui';
import { loadSample, ENTRY, KONDISI, personName } from './data';

// Admin & pengolahan: entry progress per document, batch by batch.
export default function Entri() {
  const { uid, profile } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const batchId = sp.get('batch');
  const [s, setS] = useState(null);
  const [batches, setBatches] = useState(null);
  const [docs, setDocs] = useState(null);
  const [mine, setMine] = useState(profile.role !== 'admin');
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { loadSample().then(setS).catch((e) => toast(errMsg(e), 'err')); }, []); // eslint-disable-line
  async function load() {
    setDocs(null);
    if (batchId) {
      const [b, d] = await Promise.all([
        supabase.from('batch').select('*').eq('id', batchId),
        supabase.from('dokumen').select('*').eq('batch_id', batchId).order('nks').limit(5000),
      ]);
      if (b.error || d.error) toast(errMsg(b.error || d.error), 'err');
      setBatches(b.data || []); setDocs(d.data || []);
    } else {
      let q = supabase.from('batch').select('*').order('created_at', { ascending: false }).limit(300);
      if (mine) q = q.eq('operator_id', uid);
      const b = await q;
      if (b.error) { toast(errMsg(b.error), 'err'); setBatches([]); setDocs([]); return; }
      const ids = (b.data || []).map((x) => x.id);
      const d = ids.length ? await supabase.from('dokumen').select('id, batch_id, entry_status').in('batch_id', ids).limit(20000) : { data: [] };
      setBatches(b.data || []); setDocs(d.data || []);
    }
  }
  useEffect(() => { load(); }, [batchId, mine]); // eslint-disable-line

  const ruta = useMemo(() => new Map((s?.ruta || []).map((r) => [r.id, r])), [s]);
  const stat = useMemo(() => {
    const m = {};
    (docs || []).forEach((d) => { const x = (m[d.batch_id] ||= { n: 0, selesai: 0, masalah: 0, proses: 0 }); x.n++; if (x[d.entry_status] !== undefined) x[d.entry_status]++; });
    return m;
  }, [docs]);

  async function setStatus(list, status, entry_note = null) {
    setBusy(true);
    const { error } = await supabase.from('dokumen').update({ entry_status: status, entry_note: status === 'masalah' ? entry_note : null })
      .in('id', list.map((d) => d.id));
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    const ids = new Set(list.map((d) => d.id));
    setDocs((x) => x.map((d) => (ids.has(d.id) ? { ...d, entry_status: status, entry_note: status === 'masalah' ? entry_note : null, entry_by: uid, entry_at: new Date().toISOString() } : d)));
    setNote(null);
  }

  // ---------- one batch ----------
  if (batchId) {
    const b = batches?.[0];
    const x = stat[batchId] || { n: 0, selesai: 0 };
    const left = (docs || []).filter((d) => d.entry_status !== 'selesai' && d.entry_status !== 'masalah');
    return (
      <Page title={b ? `Batch ${b.kode}` : 'Batch'} back={() => nav(-1)} wide
            subtitle={b ? `${monthLabel(b.tahun, b.bulan)} · operator ${personName(s?.people || {}, b.operator_id)} · ${x.selesai}/${x.n} selesai` : ' '}>
        {!docs || !s ? <Loading /> : !docs.length ? <Empty icon="list" title="Batch kosong" /> : (
          <>
            <Card className="pad mb"><Progress value={x.selesai} total={x.n} />
              <div className="btn-row mt" style={{ maxWidth: 420 }}>
                <Button variant="ghost" icon="check" busy={busy} disabled={!left.length} onClick={() => setStatus(left, 'selesai')}>Tandai {left.length} sisanya selesai</Button>
              </div></Card>
            <Card className="table-card">
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>NKS</th><th>No.</th><th>Nama KRT</th><th>Kondisi</th><th>Status entri</th><th>Oleh</th></tr></thead>
                  <tbody>
                    {docs.map((d) => {
                      const r = ruta.get(d.ruta_id) || {};
                      return (
                        <tr key={d.id} className={d.entry_status === 'masalah' ? 'bad' : d.entry_status === 'selesai' ? 'dim-soft' : ''}>
                          <td className="mono">{d.nks}</td>
                          <td className="mono">{r.no_urut}</td>
                          <td>{r.nama_krt}{d.catatan && <small className="block muted">{d.catatan}</small>}</td>
                          <td>{d.kondisi === 'lengkap' ? KONDISI.lengkap : <span className="t-warn">{KONDISI[d.kondisi]}</span>}</td>
                          <td>
                            <div className="seg seg-sm">{Object.entries(ENTRY).map(([k, [l]]) => (
                              <button key={k} className={d.entry_status === k ? `on on-${k}` : ''}
                                      onClick={() => (k === 'masalah' ? setNote({ d, text: d.entry_note || '' }) : setStatus([d], k))}>{l}</button>))}</div>
                            {d.entry_note && <small className="block t-err">{d.entry_note}</small>}
                          </td>
                          <td><small className="muted">{d.entry_by ? `${personName(s.people, d.entry_by)} · ${fmtDateTime(d.entry_at)}` : ''}</small></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
        <Modal open={!!note} title="Masalah entri" onClose={() => setNote(null)}
               footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setNote(null)}>Batal</Button>
                 <Button variant="danger" busy={busy} disabled={!note?.text.trim()} onClick={() => setStatus([note.d], 'masalah', note.text.trim())}>Simpan</Button></div>}>
          <div className="form"><label>Catatan
            <textarea rows={3} value={note?.text || ''} placeholder="mis. Blok IV tidak terisi, perlu konfirmasi PPL" onChange={(e) => setNote((n) => ({ ...n, text: e.target.value }))} /></label></div>
        </Modal>
      </Page>
    );
  }

  // ---------- batch list ----------
  return (
    <Page title="Entri Dokumen" subtitle={mine ? 'Batch yang ditugaskan ke Anda' : 'Semua batch'} wide>
      <div className="toolbar">
        <div className="seg">
          <button className={mine ? 'on' : ''} onClick={() => setMine(true)}>Batch saya</button>
          <button className={!mine ? 'on' : ''} onClick={() => setMine(false)}>Semua batch</button>
        </div>
      </div>
      {!batches || !s ? <Loading /> : !batches.length ? (
        <Empty icon="list" title={mine ? 'Belum ada batch untuk Anda' : 'Belum ada batch'}>Batch dibuat di menu Batching.</Empty>
      ) : (
        <Card className="list">
          {batches.map((b) => {
            const x = stat[b.id] || { n: 0, selesai: 0, masalah: 0 };
            const done = x.n && x.selesai + x.masalah === x.n;
            return (
              <button key={b.id} className="row" onClick={() => nav(`/entri?batch=${b.id}`)}>
                <span className={`num ${done ? 'num-approved' : x.selesai ? 'num-pending' : ''}`}><Icon name="list" size={18} /></span>
                <span className="row-tx"><b><span className="mono">{b.kode}</span> · {monthLabel(b.tahun, b.bulan)}</b>
                  <small>{x.selesai}/{x.n} selesai{x.masalah ? ` · ${x.masalah} masalah` : ''} · {personName(s.people, b.operator_id)}</small>
                  <Progress value={x.selesai} total={x.n} /></span>
                <Icon name="right" className="row-arw" />
              </button>
            );
          })}
        </Card>
      )}
    </Page>
  );
}
