import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [profile, setProfile] = useState(null);
  const [problem, setProblem] = useState('');

  const loadProfile = useCallback(async (s) => {
    if (!s) { setProfile(null); return; }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
    if (error || !data) {
      setProblem(error ? error.message : 'Profil akun tidak ditemukan atau nonaktif. Hubungi admin.');
      setProfile(null);
      return;
    }
    if (!data.active) { setProblem('Akun Anda dinonaktifkan. Hubungi admin.'); setProfile(null); return; }
    setProblem('');
    setProfile(data);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); loadProfile(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT' || evt === 'USER_UPDATED') loadProfile(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setProblem('');
  }, []);

  const value = {
    session, profile, problem, signOut,
    uid: session?.user?.id,
    loading: session === undefined || (session && !profile && !problem),
    refreshProfile: () => loadProfile(session),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
