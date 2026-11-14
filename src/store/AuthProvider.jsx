import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cloudEnabled, deleteProgress, loadProgress, saveProgress, supabase } from '../lib/supabase.js';
import { useStore } from './AppStore.jsx';

// Supabase email/password accounts + automatic cloud sync of the user's progress.
const AuthContext = createContext(null);

const SYNC_KEYS = ['profile', 'simple', 'classifications', 'votes', 'quiz', 'acknowledged'];
const pick = (s) => Object.fromEntries(SYNC_KEYS.map((k) => [k, s[k]]));

export function AuthProvider({ children }) {
  const store = useStore();
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!cloudEnabled);
  const [sync, setSync] = useState({ status: 'idle', at: null, error: null }); // idle | loading | saving | saved | error
  const loadedFor = useRef(null);

  useEffect(() => {
    if (!cloudEnabled) return undefined;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const user = session?.user || null;

  // On login: pull remote progress and merge it with the local one.
  useEffect(() => {
    if (!user || loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    setSync({ status: 'loading', at: null, error: null });
    loadProgress(user.id)
      .then((row) => {
        if (row?.state) store.mergeRemote(row.state);
        const name = user.user_metadata?.display_name;
        if (name && !row?.state?.profile?.name) store.setProfile({ name });
        setSync({ status: 'saved', at: row?.updated_at ? new Date(row.updated_at) : null, error: null });
      })
      .catch((error) => setSync({ status: 'error', at: null, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Debounced save whenever the synced part of the state changes.
  const snapshot = JSON.stringify(pick(store.persistable));
  useEffect(() => {
    if (!user || loadedFor.current !== user.id || sync.status === 'loading') return undefined;
    const t = setTimeout(() => {
      setSync((s) => ({ ...s, status: 'saving' }));
      saveProgress(user.id, store.profile.name, JSON.parse(snapshot))
        .then(() => setSync({ status: 'saved', at: new Date(), error: null }))
        .catch((error) => setSync({ status: 'error', at: null, error }));
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, user, sync.status === 'loading']);

  const signUp = useCallback(async ({ email, password, name }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name }, emailRedirectTo: `${window.location.origin}${window.location.pathname}#/account` },
    });
    if (error) throw error;
    if (name) store.setProfile({ name });
    return { needsConfirmation: !data.session };
  }, [store]);

  const signIn = useCallback(async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    loadedFor.current = null;
    setSync({ status: 'idle', at: null, error: null });
  }, []);

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${window.location.pathname}#/account` });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const deleteCloudData = useCallback(async () => {
    if (user) await deleteProgress(user.id);
  }, [user]);

  const value = useMemo(
    () => ({ cloudEnabled, ready, user, sync, signUp, signIn, signOut, resetPassword, updatePassword, deleteCloudData }),
    [ready, user, sync, signUp, signIn, signOut, resetPassword, updatePassword, deleteCloudData],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
