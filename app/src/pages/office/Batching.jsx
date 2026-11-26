import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { ymNow, fmtDateTime } from '../../lib/period';
import { Page, Card, Button, Icon, Loading, Empty, Modal, MonthPicker, Progress, useToast } from '../../components/ui';
import { loadSample, loadDokumen, personName } from './data';

const pad = (n, w = 2) => String(n).padStart(w, '0');

// Admin & pengolahan: group received documents into batches and assign an entry operator.
export default function Batching() {
  const toast = useToast();
  const nav = useNavigate();
  const [ym, setYm] = useState(ymNow());
  const [s, setS] = useState(null);
  const [docs, setDocs] = useState(null);
  const [batches, setBatches] = useState(null);
  const [sel, setSel] = useState(new Set());     // selected NKS
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(null);

  useEffect(() => { loadSample().then(setS).catch((e) => toast(errMsg(e), 'err')); }, []); // eslint-disable-line
  async function load() {
    setDocs(null); setBatches(null); setSel(new Set());
    try {
      const [d, b] = await Promise.all([
        loadDokumen(ym.year, ym.month),
        supabase.from('batch').select('*').eq('tahun', ym.year).eq('bulan', ym.month).order('kode'),
      ]);
      if (b.error) throw b.error;
      setDocs(d); setBatches(b.data || []);
    } catch (e) { toast(errMsg(e), 'err'); setDocs([]); setBatches([]); }
  }
  useEffect(() => { load(); }, [ym.year, ym.month]); // eslint-disable-line

  const operators = useMemo(() => (s?.peopleList || []).filter((p) => p.active && (p.role === 'pengolahan' || p.role === 'admin')), [s]);
  const free = useMemo(() => {
    const g = new Map();
    (docs || []).filter((d) => !d.batch_id).forEach((d) => { if (!g.has(d.nks)) g.set(d.nks, []); g.get(d.nks).push(d); });
    return [...g.entries()].sort();
  }, [docs]);
  const desa = useMemo(() => Object.fromEntries((s?.nks || []).map((n) => [n.nks, n.desa])), [s]);
  const total = useMemo(() => Object.fromEntries((s?.nks || []).map((n) => [n.nks, s.ruta.filter((r) => r.nks === n.nks).length])), [s]);
  const stat = useMemo(() => {
    const m = {};
    (docs || []).forEach((d) => {
      if (!d.batch_id) return;
      const x = (m[d.batch_id] ||= { n: 0, clean: 0, error: 0, nks: new Set() });
      x.n++; x.nks.add(d.nks); if (x[d.entry_status] !== undefined) x[d.entry_status]++;
    });
    return m;
  }, [docs]);
  const selDocs = free.filter(([n]) => sel.has(n)).flatMap(([, ds]) => ds);

  function nextKode() {
    const prefix = `B${ym.year}${pad(ym.month)}-`;
    const used = (batches || []).map((b) => parseInt(String(b.kode).replace(prefix, ''), 10)).filter((n) => !Number.isNaN(n));
    return `${prefix}${pad((used.length ? Math.max(...used) : 0) + 1, 3)}`;
  }
  async function create() {
    setBusy(true);
    const { data: b, error } = await supabase.from('batch')
      .insert({ kode: form.kode.trim(), tahun: ym.year, bulan: ym.month, operator_id: form.operator_id || null, catatan: form.catatan || null }).select().single();
    if (error) { setBusy(false); return toast(errMsg(error), 'err'); }
    const { error: e2 } = await supabase.from('dokumen').update({ batch_id: b.id }).in('id', selDocs.map((d) => d.id));
    setBusy(false);
    if (e2) toast(errMsg(e2), 'err'); else toast(`Batch ${b.kode} dibuat · ${selDocs.length} dokumen`, 'ok');
    setForm(null); load();
  }
  async function setOperator(b, operator_id) {
    const { error } = await supabase.from('batch').update({ operator_id: operator_id || null }).eq('id', b.id);
    if (error) return toast(errMsg(error), 'err');
    setBatches((x) => x.map((y) => (y.id === b.id ? { ...y, operator_id } : y)));
  }
  async function addToBatch(b) {
    const { error } = await supabase.from('dokumen').update({ batch_id: b.id }).in('id', selDocs.map((d) => d.id));
    if (error) return toast(errMsg(error), 'err');
    toast(`${selDocs.length} dokumen ditambahkan ke ${b.kode}`, 'ok'); load();
  }
  async function remove() {
    const { error } = await supabase.from('batch').delete().eq('id', del.id);
    if (error) return toast(errMsg(error), 'err');
    setDel(null); toast('Batch dihapus; dokumennya kembali ke daftar belum ber-batch', 'ok'); load();
  }

  return (
    <Page title="Batching" subtitle="Kelompokkan dokumen yang sudah diterima untuk dientri" wide
          actions={<MonthPicker value={ym} onChange={setYm} label={batches ? `${batches.length} batch` : ' '} />}>
      {!s || !docs ? <Loading /> : (
        <div className="split">
          <section>
            <h2 className="sec">Belum masuk batch · {free.reduce((a, [, d]) => a + d.length, 0)} dokumen</h2>
            {!free.length ? <Empty icon="inbox" title="Semua dokumen sudah ber-batch">Terima dokumen dulu di menu Penerimaan.</Empty> : (
              <Card className="list">
                <label className="row static selall">
                  <input type="checkbox" className="bigcheck" checked={sel.size === free.length}
                         onChange={(e) => setSel(e.target.checked ? new Set(free.map(([n]) => n)) : new Set())} />
                  <span className="row-tx"><b>Pilih semua NKS</b></span>
                </label>
                {free.map(([n, ds]) => (
                  <label key={n} className="row static">
                    <input type="checkbox" className="bigcheck" checked={sel.has(n)}
                           onChange={() => setSel((x) => { const y = new Set(x); y.has(n) ? y.delete(n) : y.add(n); return y; })} />
                    <span className="row-tx"><b>NKS {n} · {desa[n]}</b><small>{ds.length} dokumen siap · {total[n] || 0} ruta sampel</small></span>
                  </label>
                ))}
              </Card>
            )}
            {sel.size > 0 && (
              <div className="bulkbar mt">
                <b>{selDocs.length} dokumen dari {sel.size} NKS</b>
                <span className="grow" />
                <Button icon="plus" onClick={() => setForm({ kode: nextKode(), operator_id: '', catatan: '' })}>Batch baru</Button>
              </div>
            )}
          </section>

          <section>
            <h2 className="sec">Batch {batches?.length ? `· ${batches.length}` : ''}</h2>
            {!batches?.length ? <Empty icon="layers" title="Belum ada batch bulan ini" /> : batches.map((b) => {
              const x = stat[b.id] || { n: 0, clean: 0, error: 0, nks: new Set() };
              const done = x.n && x.clean + x.error === x.n;
              return (
                <Card key={b.id} className="batch-card">
                  <div className="batch-top">
                    <div><b className="mono">{b.kode}</b><small className="block muted">{x.n} dokumen · NKS {[...x.nks].sort().join(', ') || '—'}</small></div>
                    <span className={`chip chip-${done ? 'ok' : x.error ? 'err' : x.clean ? 'info' : 'idle'}`}>
                      {done ? 'Selesai' : `${x.clean}/${x.n} clean`}</span>
                  </div>
                  <Progress value={x.clean} total={x.n} />
                  {x.error > 0 && <small className="t-err">{x.error} dokumen error</small>}
                  <div className="batch-act">
                    <label className="inline">Operator
                      <select value={b.operator_id || ''} onChange={(e) => setOperator(b, e.target.value)}>
                        <option value="">— belum ditentukan —</option>
                        {operators.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.username}</option>)}
                      </select></label>
                    <span className="grow" />
                    {sel.size > 0 && <Button variant="ghost" icon="plus" onClick={() => addToBatch(b)}>Tambah terpilih</Button>}
                    <Button variant="ghost" icon="list" onClick={() => nav(`/entri?batch=${b.id}`)}>Buka</Button>
                    <button className="icon-btn" title="Hapus batch" onClick={() => setDel(b)}><Icon name="x" size={18} /></button>
                  </div>
                  <small className="muted">Dibuat {fmtDateTime(b.created_at)} oleh {personName(s.people, b.created_by)}{b.catatan ? ` · ${b.catatan}` : ''}</small>
                </Card>
              );
            })}
          </section>
        </div>
      )}

      <Modal open={!!form} title="Batch baru" onClose={() => setForm(null)}
             footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setForm(null)}>Batal</Button>
               <Button busy={busy} disabled={!form?.kode.trim()} onClick={create}>Buat batch ({selDocs.length} dokumen)</Button></div>}>
        {form && (
          <div className="form">
            <label>Kode batch <input value={form.kode} onChange={(e) => setForm((f) => ({ ...f, kode: e.target.value }))} /></label>
            <label>Operator entri
              <select value={form.operator_id} onChange={(e) => setForm((f) => ({ ...f, operator_id: e.target.value }))}>
                <option value="">— tentukan nanti —</option>
                {operators.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.username} ({p.role === 'admin' ? 'Admin' : 'Pengolahan'})</option>)}
              </select></label>
            <label>Catatan <small className="muted">(opsional)</small><input value={form.catatan} onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))} /></label>
          </div>
        )}
      </Modal>
      <Modal open={!!del} title={`Hapus batch ${del?.kode}?`} onClose={() => setDel(null)}
             footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setDel(null)}>Batal</Button><Button variant="danger" onClick={remove}>Hapus</Button></div>}>
        <p>Dokumen di dalamnya kembali ke daftar “belum masuk batch”. Batch yang sudah ada dokumen dientri hanya bisa dihapus admin.</p>
      </Modal>
    </Page>
  );
}
