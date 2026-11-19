import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider, Loading } from './components/ui';
import Shell from './components/Shell';
import Login from './pages/Login';
import Account from './pages/Account';
import SuratTugas from './pages/SuratTugas';
import PplHome from './pages/ppl/Home';
import Kunjungan from './pages/ppl/Kunjungan';
import Capture from './pages/ppl/Capture';
import Status from './pages/ppl/Status';

// PML and admin screens load only for those roles, so field phones download less.
const NksDetail = lazy(() => import('./pages/NksDetail'));
const PmlHome = lazy(() => import('./pages/pml/Home'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Review = lazy(() => import('./pages/admin/Review'));
const Samples = lazy(() => import('./pages/admin/Samples'));
const Users = lazy(() => import('./pages/admin/Users'));

const ROUTES = {
  ppl: (
    <>
      <Route path="/" element={<PplHome />} />
      <Route path="/kunjungan" element={<Kunjungan />} />
      <Route path="/kunjungan/:id" element={<Capture />} />
      <Route path="/status" element={<Status />} />
      <Route path="/surat-tugas" element={<SuratTugas />} />
    </>
  ),
  pml: (
    <>
      <Route path="/" element={<PmlHome />} />
      <Route path="/nks/:nks" element={<NksDetail />} />
      <Route path="/surat-tugas" element={<SuratTugas />} />
    </>
  ),
  admin: (
    <>
      <Route path="/" element={<Dashboard />} />
      <Route path="/nks/:nks" element={<NksDetail />} />
      <Route path="/verifikasi" element={<Review />} />
      <Route path="/sampel" element={<Samples />} />
      <Route path="/pengguna" element={<Users />} />
    </>
  ),
};

function Gate() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="boot"><div className="logo big">SBH</div><Loading /></div>;
  if (!session || !profile) return <Login />;
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes>
          {ROUTES[profile.role]}
          <Route path="/akun" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </HashRouter>
  );
}
