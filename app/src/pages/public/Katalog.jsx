import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase, errMsg } from '../../lib/supabase';
import { Icon, Spinner, Empty, useToast } from '../../components/ui';
import PublicTop from './PublicTop';
import './Public.css';

const PAGE = 50;

// Public, no login: browse/search the full komoditas + kualitas master.
export default function Katalog() {
  const toast = useToast();
  const [kelompok, setKelompok] = useState([]);
  const [kat, setKat] = useState('');       // '' = all
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const [total, setTotal] = useState(null);
  const timer = useRef();

  useEffect(() => { supabase.from('kelompok').select('*').order('kode').then(({ data }) => setKelompok(data || [])); }, []);

  const search = useCallback(async (append) => {
    const from = append ? rows.length : 0;
    let query = supabase.from('komoditas')
      .select('kode_kualitas, kode_komoditas, kelompok_kode, kelompok, nama_komoditas, nama_kualitas', { count: from ? undefined : 'exact' })
      .order('kode_kualitas').range(from, from + PAGE - 1);
    if (kat) query = query.eq('kelompok_kode', kat);
    const term = q.trim().replace(/[%*,()]/g, ' ').trim(); // PostgREST .or() uses * wildcards
    if (term) query = query.or(`nama_komoditas.ilike.*${term}*,nama_kualitas.ilike.*${term}*,kode_kualitas.ilike.${term}*`);
    const { data, error, count } = await query;
    if (error) { toast(errMsg(error), 'err'); setRows([]); return; }
    setRows(append ? [...rows, ...data] : data);
    setMore(data.length === PAGE);
    if (!append && count != null) setTotal(count);
  }, [kat, q, rows, toast]);

  useEffect(() => { setRows(null); timer.current = setTimeout(() => search(false), 250); return () => clearTimeout(timer.current); }, [kat, q]); // eslint-disable-line

  return (
    <div className="pub">
      <PublicTop other={{ to: '/usulan', label: 'Usulan' }} />
      <div className="pub-wrap wide">
        <h1>Katalog Komoditas &amp; Kualitas</h1>
        <p className="lead">Master kode SPKRT 2027 — {total != null ? total.toLocaleString('id-ID') : '40.998'} kualitas, 3.214 komoditas.</p>

        <div className="search" style={{ marginBottom: 12 }}>
          <Icon name="search" size={18} />
          <input placeholder="Cari komoditas, kualitas, atau kode…" value={q} onChange={(e) => setQ(e.target.value)} inputMode="search" />
        </div>
        <div className="kat-filter">
          <button className={!kat ? 'on' : ''} onClick={() => setKat('')}>Semua</button>
          {kelompok.map((k) => (
            <button key={k.kode} className={kat === k.kode ? 'on' : ''} onClick={() => setKat(k.kode)} title={k.nama}>
              {k.kode} · {k.nama.split(',')[0].split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>

        {rows == null ? <Spinner /> : !rows.length ? (
          <Empty icon="search" title="Tidak ditemukan">Coba kata kunci atau kategori lain.</Empty>
        ) : (
          <div className="card">
            {total != null && <div style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 13, borderBottom: '1px solid var(--line-2)' }}>{total.toLocaleString('id-ID')} hasil</div>}
            {rows.map((r) => (
              <div key={r.kode_kualitas} className="cat-item">
                <div className="ci-top">
                  <b>{r.nama_komoditas} — {r.nama_kualitas}</b>
                  <span className="kode">{r.kode_kualitas}</span>
                </div>
                <small><span className="tag">{r.kelompok_kode}</span> {r.kelompok}</small>
              </div>
            ))}
            {more && <button className="load-more" onClick={() => search(true)}>Muat lebih banyak</button>}
          </div>
        )}
        <div className="pub-foot">Sumber: Buku 5 Master Kode Komoditas &amp; Kualitas SPKRT 2027 · BPS</div>
      </div>
    </div>
  );
}
