import { useEffect, useMemo, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { fmtDateTime, ymNow, triwulanOf, TRIWULAN } from '../../lib/period';
import { Page, Card, Button, Icon, Loading, Empty, Modal, useToast } from '../../components/ui';
import { RekapChip, openPdf } from '../admin/RekapBL';

// PML: check the Rekap BL PDF of every ruta in their NKS, per triwulan.
export default function PmlRekapBL() {
  const { uid } = useAuth();
  const toast = useToast();
  const now = ymNow();
  const [tahun, setTahun] = useState(now.year);
  const [tw, setTw] = useState(triwulanOf(now.month));
  const [ruta, setRuta] = useState(null);
  const [rows, setRows] = useState(null);
  const [note, setNote] = useState(null);   // { ids, text }
  const [busy, setBusy] = useState(false);

  async function load() {
    setRows(null);
    const nks = (await supabase.from('nks').select('nks').eq('pml_id', uid)).data?.map((n) => n.nks) || [];
    const [r, b] = await Promise.all([
      nks.length ? supabase.from('ruta').select('id, nks, no_urut, nama_krt, active').in('nks', nks).order('nks').order('no_urut') : { data: [] },
      supabase.from('rekap_bl').select('*').eq('tahun', tahun).eq('triwulan', tw),
    ]);
    if (b.error) toast(errMsg(b.error), 'err');
    setRuta((r.data || []).filter((x) => x.active !== false)); setRows(b.data || []);
  }
  useEffect(() => { load(); }, [tahun, tw]); // eslint-disable-line

  const byRuta = useMemo(() => new Map((rows || []).map((x) => [x.ruta_id, x])), [rows]);
  const groups = useMemo(() => {
    const g = new Map();
    (ruta || []).forEach((r) => { if (!g.has(r.nks)) g.set(r.nks, []); g.get(r.nks).push(r); });
    return [...g.entries()];
  }, [ruta]);
  const unchecked = (rows || []).filter((b) => !b.pml_checked);

  async function mark(ids, status, text) {
    setBusy(true);
    const { data, error } = await supabase.rpc('check_rekap_bl', { p_ids: ids, p_status: status, p_note: text || null });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast(`${data} rekap ditandai ${status === 'ok' ? 'sesuai' : 'bermasalah'}`, 'ok');
    setNote(null); load();
  }

  return (
    <Page title="Rekap BL" subtitle={`Triwulan ${TRIWULAN[tw - 1]} ${tahun} · ${rows?.length ?? '…'} berkas`}>
      <div className="mchips">
        {[now.year - 1, now.year].map((y) => [1, 2, 3, 4].map((t) => (
          (y < now.year || t <= triwulanOf(now.month)) && (
            <button key={`${y}-${t}`} className={`mchip ${tahun === y && tw === t ? 'on' : ''}`} onClick={() => { setTahun(y); setTw(t); }}>
              <b>TW {TRIWULAN[t - 1]}</b><small>{y}</small>
            </button>)
        ))).flat().filter(Boolean).reverse()}
      </div>

      {!rows ? <Loading /> : !rows.length ? (
        <Empty icon="layers" title="Belum ada rekap BL">Admin belum mengunggah rekap BL triwulan ini untuk NKS Anda.</Empty>
      ) : (
        <>
          {unchecked.length > 1 && (
            <Button variant="ghost" icon="check" className="block mb" busy={busy}
                    onClick={() => mark(unchecked.map((b) => b.id), 'ok')}>Tandai {unchecked.length} rekap belum dicek: Sesuai</Button>
          )}
          {groups.map(([nks, list]) => (
            <div key={nks}>
              <h2 className="sec">NKS {nks}</h2>
              <Card className="list">
                {list.map((r) => {
                  const b = byRuta.get(r.id);
                  return (
                    <div key={r.id} className="rekap-row">
                      <div className="rekap-top">
                        <span className="num">{r.no_urut}</span>
                        <span className="row-tx"><b>{r.nama_krt}</b>
                          <small>{b ? (b.pml_checked ? `Dicek ${fmtDateTime(b.pml_checked_at)}` : `Diunggah ${fmtDateTime(b.uploaded_at)}`) : 'Belum diunggah admin'}</small></span>
                        <RekapChip r={b} />
                      </div>
                      {b?.pml_note && <div className="rekap-note"><Icon name="alert" size={16} /> {b.pml_note}</div>}
                      {b && (
                        <div className="rekap-act">
                          <button className="linkish" onClick={() => openPdf(b.file_path, toast)}><Icon name="file" size={16} /> Buka PDF</button>
                          <span className="grow" />
                          <Button variant="ghost" icon="alert" onClick={() => setNote({ ids: [b.id], text: b.pml_note || '' })}>Masalah</Button>
                          <Button icon="check" variant={b.pml_status === 'ok' ? 'ghost' : 'primary'} busy={busy} onClick={() => mark([b.id], 'ok')}>Sesuai</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Card>
            </div>
          ))}
        </>
      )}

      <Modal open={!!note} title="Catatan masalah" onClose={() => setNote(null)}
             footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setNote(null)}>Batal</Button>
               <Button variant="danger" busy={busy} disabled={!note?.text.trim()} onClick={() => mark(note.ids, 'masalah', note.text)}>Simpan</Button></div>}>
        <div className="form">
          <label>Apa yang tidak sesuai?
            <textarea rows={4} value={note?.text || ''} placeholder="mis. Total pengeluaran BL2 berbeda dengan dokumen, halaman 3 tidak terbaca"
                      onChange={(e) => setNote((n) => ({ ...n, text: e.target.value }))} /></label>
        </div>
      </Modal>
    </Page>
  );
}
