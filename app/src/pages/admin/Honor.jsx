import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errMsg } from '../../lib/supabase';
import { readTableFind, pick, cell } from '../../lib/excel';
import { ymNow, BULAN_FULL, fmtDate } from '../../lib/period';
import { neto } from '../../lib/honorExport';
import { Page, Card, Button, Icon, Loading, Empty, Modal, useToast } from '../../components/ui';

export const rp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
export const maskRek = (s) => (s ? `${'•'.repeat(Math.max(String(s).length - 4, 0))}${String(s).slice(-4)}` : '');

const HEADER_KEYS = ['sk', 'program', 'kegiatan', 'kro', 'ro', 'komponen', 'akun', 'tempat', 'bendahara_nama', 'bendahara_nip', 'ppk_nama', 'ppk_nip'];

// Admin: honor petugas — kegiatan (daftar nominatif) and the bank-account database.
export default function Honor() {
  const toast = useToast();
  const nav = useNavigate();
  const [tab, setTab] = useState('kegiatan');
  const [keg, setKeg] = useState(null);
  const [sums, setSums] = useState({});
  const [pet, setPet] = useState(null);
  const [people, setPeople] = useState([]);
  const [form, setForm] = useState(null);
  const [pform, setPform] = useState(null);
  const [imp, setImp] = useState(null);
  const [q, setQ] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [k, it, p, pr] = await Promise.all([
      supabase.from('honor_kegiatan').select('*').order('created_at', { ascending: false }),
      supabase.from('honor_item').select('kegiatan_id, honor_ob, volume, pph21, eligible').limit(20000),
      supabase.from('honor_petugas').select('*').order('nama'),
      supabase.from('profiles').select('id, full_name, username, role, active'),
    ]);
    const err = k.error || it.error || p.error;
    if (err) toast(errMsg(err), 'err');
    const s = {};
    (it.data || []).forEach((x) => { const a = (s[x.kegiatan_id] ||= { n: 0, ok: 0, total: 0 }); a.n++; if (x.eligible) a.ok++; a.total += neto(x); });
    setKeg(k.data || []); setSums(s); setPet(p.data || []); setPeople(pr.data || []);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  const byName = useMemo(() => new Map(people.map((p) => [normName(p.full_name), p])), [people]);
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const petList = useMemo(() => (pet || []).filter((p) => !q || `${p.nama} ${p.jabatan} ${p.bank} ${p.korwil} ${p.asal_kec}`.toLowerCase().includes(q.toLowerCase())), [pet, q]);

  // ---------- kegiatan ----------
  function newKegiatan() {
    const last = keg?.[0] || {};
    const now = ymNow();
    setForm({
      ...Object.fromEntries(HEADER_KEYS.map((k) => [k, last[k] || ''])),
      tempat: last.tempat || 'Tanjung Redeb',
      tahun: now.year, bulan: now.month, jabatan: 'PPL', honor_ob: last.honor_ob || '',
      judul: `HONOR PETUGAS PENDATAAN SPKRT BULAN ${BULAN_FULL[now.month - 1].toUpperCase()} ${now.year}`,
      bulan_label: BULAN_FULL[now.month - 1].toUpperCase(), tanggal: '',
    });
  }
  async function saveKegiatan() {
    setBusy(true);
    const row = { ...form, honor_ob: Number(form.honor_ob) || 0, tahun: Number(form.tahun) || null, bulan: Number(form.bulan) || null, tanggal: form.tanggal || null, jabatan: form.jabatan || null };
    const { data, error } = await supabase.from('honor_kegiatan').insert(row).select().single();
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setForm(null); nav(`/honor/${data.id}`);
  }

  // ---------- petugas database ----------
  async function savePetugas() {
    setBusy(true);
    const row = { nama: pform.nama.trim(), jabatan: pform.jabatan || null, asal_kel: pform.asal_kel || null, asal_kec: pform.asal_kec || null,
                  bank: pform.bank || null, norek: String(pform.norek || '').replace(/\s+/g, '') || null, korwil: pform.korwil || null,
                  user_id: pform.user_id || null, updated_at: new Date().toISOString() };
    const { error } = pform.id ? await supabase.from('honor_petugas').update(row).eq('id', pform.id) : await supabase.from('honor_petugas').insert(row);
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    setPform(null); toast('Tersimpan', 'ok'); load();
  }
  async function deletePetugas() {
    const { error } = await supabase.from('honor_petugas').delete().eq('id', pform.id);
    if (error) return toast(/foreign key|violates/i.test(error.message) ? 'Petugas ini sudah dipakai di kegiatan honor; tidak bisa dihapus.' : errMsg(error), 'err');
    setPform(null); load();
  }
  async function onImport(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const { rows, sheet } = await readTableFind(f, ['nama', 'jabatan', 'bank', 'norek', 'korwil']);
      const seen = new Set();
      const list = rows.map((r) => {
        const nama = cell(pick(r, ['nama', 'namapetugas', 'namalengkap']));
        const norek = cell(pick(r, ['norek', 'norekening', 'nomorrekening', 'rekening'])).replace(/\s+/g, '').replace(/\.0+$/, '');
        const x = { nama, jabatan: cell(pick(r, ['jabatan', 'peran'])) || null, asal_kel: cell(pick(r, ['asalkelkampung', 'asalkel', 'asalkelurahan', 'kelurahan', 'desa'])) || null,
                    asal_kec: cell(pick(r, ['asalkec', 'asalkecamatan', 'kecamatan'])) || null, bank: cell(pick(r, ['bank', 'namabank'])) || null,
                    norek: norek || null, korwil: cell(pick(r, ['korwil'])) || null };
        x.user_id = byName.get(normName(nama))?.id || null;
        x.error = !nama ? 'Nama kosong' : seen.has(normName(nama)) ? 'Nama ganda' : (!x.bank || !x.norek) ? 'Bank/no. rekening kosong' : '';
        x.warnOnly = x.error === 'Bank/no. rekening kosong';
        if (nama) seen.add(normName(nama));
        return x;
      });
      setImp({ sheet, list });
    } catch (err) { toast(`Berkas tidak terbaca: ${errMsg(err)}`, 'err'); }
  }
  async function runImport() {
    setBusy(true);
    const good = imp.list.filter((x) => !x.error || x.warnOnly).map(({ error, warnOnly, ...x }) => ({ ...x, updated_at: new Date().toISOString() })); // eslint-disable-line no-unused-vars
    const { error } = await supabase.from('honor_petugas').upsert(good, { onConflict: 'nama' });
    setBusy(false);
    if (error) return toast(errMsg(error), 'err');
    toast(`${good.length} petugas tersimpan`, 'ok'); setImp(null); load();
  }

  const F = (k, label, extra = {}) => (
    <label key={k}>{label}<input value={form[k] ?? ''} {...extra} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} /></label>
  );
  return (
    <Page title="Honor" subtitle="Daftar nominatif & database rekening petugas (hanya admin)" wide
          actions={tab === 'kegiatan' ? <Button icon="plus" onClick={newKegiatan}>Kegiatan baru</Button> : <>
            <label className="btn btn-ghost"><Icon name="upload" size={18} /><span>Impor Excel</span><input type="file" accept=".xlsx,.csv" hidden onChange={onImport} /></label>
            <Button icon="plus" onClick={() => setPform({ nama: '', jabatan: 'PPL' })}>Tambah</Button></>}>
      <div className="toolbar">
        <div className="seg">
          <button className={tab === 'kegiatan' ? 'on' : ''} onClick={() => setTab('kegiatan')}>Kegiatan <small>{keg?.length ?? ''}</small></button>
          <button className={tab === 'petugas' ? 'on' : ''} onClick={() => setTab('petugas')}>Database rekening <small>{pet?.length ?? ''}</small></button>
        </div>
        {tab === 'petugas' && <>
          <div className="search"><Icon name="search" size={18} /><input placeholder="Cari nama, bank, korwil…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <label className="check"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Tampilkan no. rekening</label>
        </>}
      </div>

      {!keg ? <Loading /> : tab === 'kegiatan' ? (
        !keg.length ? <Empty icon="coins" title="Belum ada kegiatan honor">Isi dulu database rekening, lalu buat kegiatan baru.</Empty> : (
          <Card className="list">
            {keg.map((k) => {
              const s = sums[k.id] || { n: 0, ok: 0, total: 0 };
              return (
                <button key={k.id} className="row" onClick={() => nav(`/honor/${k.id}`)}>
                  <span className="num"><Icon name="coins" size={18} /></span>
                  <span className="row-tx"><b>{k.judul}</b>
                    <small>{k.jabatan || 'Semua'} · {s.n} petugas · {s.ok} ditandai layak · {rp(s.total)}{k.tanggal ? ` · ${fmtDate(k.tanggal)}` : ''}</small></span>
                  <Icon name="right" className="row-arw" />
                </button>
              );
            })}
          </Card>
        )
      ) : !petList.length ? <Empty icon="users" title="Database rekening kosong">Impor Excel berkolom Nama, Jabatan, Asal Kel, Asal Kec, Bank, Norek, Korwil.</Empty> : (
        <Card className="table-card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Nama</th><th>Jabatan</th><th>Asal</th><th>Bank</th><th>No. rekening</th><th>Korwil</th><th>Akun aplikasi</th></tr></thead>
              <tbody>
                {petList.map((p) => (
                  <tr key={p.id} className="click" onClick={() => setPform({ ...p })}>
                    <td><b>{p.nama}</b></td><td>{p.jabatan}</td>
                    <td>{[p.asal_kel, p.asal_kec].filter(Boolean).join(', ')}</td>
                    <td>{p.bank || <span className="t-err">kosong</span>}</td>
                    <td className="mono">{show ? p.norek : maskRek(p.norek)}</td>
                    <td>{p.korwil}</td>
                    <td>{p.user_id ? <span className="mono">{byId[p.user_id]?.username}</span> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="hint">Nomor rekening hanya tersimpan di Supabase dan hanya bisa dibaca admin — tidak ada di repo GitHub.</p>

      <Modal open={!!form} title="Kegiatan honor baru" wide onClose={() => setForm(null)}
             footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setForm(null)}>Batal</Button>
               <Button busy={busy} disabled={!form?.judul?.trim()} onClick={saveKegiatan}>Buat & isi petugas</Button></div>}>
        {form && (
          <div className="form">
            {F('judul', 'Judul (baris 2)')}
            {F('sk', 'Baris SK', { placeholder: 'SESUAI SK KEPALA BPS KAB.BERAU NOMOR …' })}
            <div className="form grid2">
              <label>Petugas
                <select value={form.jabatan} onChange={(e) => setForm((f) => ({ ...f, jabatan: e.target.value }))}>
                  <option value="PPL">PPL</option><option value="PML">PML</option><option value="">Semua</option></select></label>
              {F('honor_ob', 'Honor per OB (Rp)', { inputMode: 'numeric' })}
              <label>Bulan kerja <small className="muted">(untuk saran kelayakan)</small>
                <select value={form.bulan} onChange={(e) => setForm((f) => ({ ...f, bulan: e.target.value }))}>
                  {BULAN_FULL.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}</select></label>
              {F('tahun', 'Tahun', { inputMode: 'numeric' })}
              {F('program', 'PROGRAM')}{F('kegiatan', 'KEGIATAN')}{F('kro', 'KRO')}{F('ro', 'RO')}
              {F('komponen', 'KOMPONEN')}{F('akun', 'AKUN')}{F('bulan_label', 'BULAN (teks)')}{F('tempat', 'Tempat')}
              {F('tanggal', 'Tanggal tanda tangan', { type: 'date' })}<span />
              {F('bendahara_nama', 'Bendahara Pengeluaran')}{F('bendahara_nip', 'NIP Bendahara')}
              {F('ppk_nama', 'Pejabat Pembuat Komitmen')}{F('ppk_nip', 'NIP PPK')}
            </div>
            <p className="hint">Isian kepala surat disalin dari kegiatan terakhir.</p>
          </div>
        )}
      </Modal>

      <Modal open={!!pform} title={pform?.id ? 'Ubah petugas' : 'Tambah petugas'} onClose={() => setPform(null)}
             footer={<div className="btn-row" style={{ flex: 1 }}>
               {pform?.id && <Button variant="danger-ghost" onClick={deletePetugas}>Hapus</Button>}
               <Button variant="ghost" onClick={() => setPform(null)}>Batal</Button>
               <Button busy={busy} disabled={!pform?.nama?.trim()} onClick={savePetugas}>Simpan</Button></div>}>
        {pform && (
          <div className="form grid2">
            {[['nama', 'Nama'], ['jabatan', 'Jabatan'], ['asal_kel', 'Asal kel/kampung'], ['asal_kec', 'Asal kecamatan'], ['bank', 'Bank'], ['norek', 'No. rekening'], ['korwil', 'Korwil']].map(([k, l]) => (
              <label key={k}>{l}<input value={pform[k] || ''} inputMode={k === 'norek' ? 'numeric' : undefined} onChange={(e) => setPform((f) => ({ ...f, [k]: e.target.value }))} /></label>
            ))}
            <label>Akun aplikasi
              <select value={pform.user_id || ''} onChange={(e) => setPform((f) => ({ ...f, user_id: e.target.value }))}>
                <option value="">— tidak terhubung —</option>
                {people.filter((p) => p.role === 'ppl' || p.role === 'pml').map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.username})</option>)}
              </select></label>
          </div>
        )}
      </Modal>

      <Modal open={!!imp} title={`Impor database rekening${imp?.sheet ? ` · sheet "${imp.sheet}"` : ''}`} wide onClose={() => setImp(null)}
             footer={<div className="btn-row" style={{ flex: 1 }}><Button variant="ghost" onClick={() => setImp(null)}>Batal</Button>
               <Button busy={busy} onClick={runImport}>Simpan {imp?.list.filter((x) => !x.error || x.warnOnly).length} petugas</Button></div>}>
        {imp && (
          <>
            <p className="hint" style={{ justifyContent: 'flex-start' }}>Nama yang sudah ada akan diperbarui. Akun aplikasi dicocokkan otomatis dari nama lengkap.</p>
            <div className="table-wrap tall">
              <table className="table compact">
                <thead><tr><th>Nama</th><th>Jabatan</th><th>Bank</th><th>No. rek</th><th>Korwil</th><th>Akun</th><th>Cek</th></tr></thead>
                <tbody>{imp.list.map((x, i) => (
                  <tr key={i} className={x.error && !x.warnOnly ? 'bad' : x.error ? 'warn' : ''}>
                    <td>{x.nama}</td><td>{x.jabatan}</td><td>{x.bank}</td><td className="mono">{maskRek(x.norek)}</td><td>{x.korwil}</td>
                    <td>{x.user_id ? byId[x.user_id]?.username : '—'}</td><td>{x.error || 'OK'}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </Page>
  );
}
