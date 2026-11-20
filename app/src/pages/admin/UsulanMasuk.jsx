import { useEffect, useMemo, useState } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { downloadCsv } from '../../lib/excel';
import { fmtDateTime } from '../../lib/period';
import { Page, Card, Button, Icon, Loading, Empty, Modal, useToast } from '../../components/ui';

// Admin: every usulan from the PMLs, filterable, exportable, deletable (spam/duplicates).
export default function UsulanMasuk() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [jenis, setJenis] = useState('all');
  const [q, setQ] = useState('');
  const [del, setDel] = useState(null);

  async function load() {
    const { data, error } = await supabase.from('usulan').select('*').order('created_at', { ascending: false }).limit(5000);
    if (error) { toast(errMsg(error), 'err'); setRows([]); return; }
    setRows(data);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  const list = useMemo(() => (rows || [])
    .filter((r) => jenis === 'all' || r.jenis === jenis)
    .filter((r) => !q || `${r.usulan} ${r.nama_komoditas} ${r.kelompok} ${r.nks} ${r.nama_pml}`.toLowerCase().includes(q.toLowerCase())), [rows, jenis, q]);

  function exportCsv() {
    downloadCsv(`usulan-komoditas-${new Date().toISOString().slice(0, 10)}.csv`, list.map((r) => ({
      Tanggal: fmtDateTime(r.created_at), Triwulan: r.triwulan, NKS: r.nks, Kelurahan: r.kelurahan, SLS: r.sls, Sub: r.sub,
      PML: r.nama_pml, PPL: r.nama_ppl, Jenis: r.jenis === 'kualitas_baru' ? 'Kualitas baru' : 'Komoditas baru',
      'Kode Kelompok': r.kelompok_kode, Kelompok: r.kelompok, 'Kode Komoditas': r.kode_komoditas || '', 'Nama Komoditas': r.nama_komoditas || '',
      Usulan: r.usulan,
    })));
  }
  async function remove() {
    const { error } = await supabase.from('usulan').delete().eq('id', del.id);
    if (error) return toast(errMsg(error), 'err');
    setRows((r) => r.filter((x) => x.id !== del.id)); setDel(null); toast('Usulan dihapus', 'ok');
  }

  return (
    <Page title="Usulan Komoditas" subtitle={rows ? `${rows.length} usulan dari PML` : ' '} wide
          actions={<Button variant="ghost" icon="download" onClick={exportCsv} disabled={!list.length}>Unduh CSV</Button>}>
      <div className="toolbar">
        <div className="seg">{[['all', 'Semua'], ['komoditas_baru', 'Komoditas baru'], ['kualitas_baru', 'Kualitas baru']].map(([k, l]) =>
          <button key={k} className={jenis === k ? 'on' : ''} onClick={() => setJenis(k)}>{l}</button>)}</div>
        <div className="search"><Icon name="search" size={18} /><input placeholder="Cari usulan, komoditas, NKS, PML…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {!rows ? <Loading /> : !list.length ? <Empty icon="send" title="Belum ada usulan" /> : (
        <Card className="table-card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Usulan</th><th>Jenis</th><th>Komoditas / Kelompok</th><th>NKS</th><th>PML</th><th>Waktu</th><th /></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.usulan}</b></td>
                    <td>{r.jenis === 'kualitas_baru' ? 'Kualitas' : 'Komoditas'}</td>
                    <td>{r.jenis === 'kualitas_baru' ? <>{r.nama_komoditas}<small className="block muted mono">{r.kode_komoditas}</small></> : <>{r.kelompok}<small className="block muted mono">{r.kelompok_kode}</small></>}</td>
                    <td className="mono">{r.nks}<small className="block muted">{r.kelurahan}</small></td>
                    <td>{r.nama_pml}</td>
                    <td>{fmtDateTime(r.created_at)}<small className="block muted">TW {r.triwulan}</small></td>
                    <td className="row-actions"><button className="icon-btn danger" title="Hapus" onClick={() => setDel(r)}><Icon name="x" size={18} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Modal open={!!del} title="Hapus usulan?" onClose={() => setDel(null)}
             footer={<><Button variant="ghost" onClick={() => setDel(null)}>Batal</Button><Button variant="danger" onClick={remove}>Hapus</Button></>}>
        <p>“{del?.usulan}” dari {del?.nama_pml} akan dihapus.</p>
      </Modal>
    </Page>
  );
}
