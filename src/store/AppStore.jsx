import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Local-first app state (classifications, votes, notifications, processing jobs), persisted to localStorage.
const StoreContext = createContext(null);
const KEY = 'spx.state.v1';

const DEFAULT = {
  profile: { name: '', id: String(Math.floor(1000 + Math.random() * 9000)), avatar: 'rocket_launch' },
  simple: true, // "Modo sencillo": friendlier UI for all ages
  welcomed: false,
  classifications: [], // { id, targetId, targetName, cls, notes, time, truth }
  votes: {}, // targetId -> 'real' | 'artifact' | 'doubtful'
  notifications: [], // { id, text: {es,en}, icon, time, read }
  quiz: { answered: 0, correct: 0, bestStreak: 0 },
  acknowledged: {}, // alert id -> true
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

let uid = 0;
const newId = (p) => `${p}-${Date.now().toString(36)}-${(uid += 1)}`;

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);
  const [toasts, setToasts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const toast = useCallback((text, icon = 'check_circle', tone = 'secondary') => {
    const id = newId('t');
    setToasts((t) => [...t, { id, text, icon, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const notify = useCallback((text, icon = 'notifications') => {
    setState((s) => ({
      ...s,
      notifications: [{ id: newId('n'), text, icon, time: Date.now(), read: false }, ...s.notifications].slice(0, 40),
    }));
  }, []);

  const markNotificationsRead = useCallback(() => {
    setState((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
  }, []);

  const addClassification = useCallback((c) => {
    const entry = { id: newId('c'), time: Date.now(), ...c };
    setState((s) => ({ ...s, classifications: [entry, ...s.classifications] }));
    return entry;
  }, []);

  const removeClassification = useCallback((id) => {
    setState((s) => ({ ...s, classifications: s.classifications.filter((c) => c.id !== id) }));
  }, []);

  const vote = useCallback((targetId, value) => {
    setState((s) => {
      const votes = { ...s.votes };
      if (value) votes[targetId] = value;
      else delete votes[targetId];
      return { ...s, votes };
    });
  }, []);

  const recordQuiz = useCallback((correct, streak) => {
    setState((s) => ({
      ...s,
      quiz: {
        answered: s.quiz.answered + 1,
        correct: s.quiz.correct + (correct ? 1 : 0),
        bestStreak: Math.max(s.quiz.bestStreak, streak),
      },
    }));
  }, []);

  const acknowledge = useCallback((id, value = true) => {
    setState((s) => ({ ...s, acknowledged: { ...s.acknowledged, [id]: value } }));
  }, []);

  const setProfile = useCallback((p) => setState((s) => ({ ...s, profile: { ...s.profile, ...p } })), []);

  const resetAll = useCallback(() => setState((s) => ({ ...DEFAULT, simple: s.simple, welcomed: true })), []);
  const setSimple = useCallback((v) => setState((s) => ({ ...s, simple: v })), []);
  const setWelcomed = useCallback(() => setState((s) => ({ ...s, welcomed: true })), []);

  // Cloud sync helpers: merge remote progress with local (union of classifications, max of counters).
  const mergeRemote = useCallback((remote) => {
    if (!remote) return;
    setState((s) => {
      const byId = new Map([...(remote.classifications || []), ...s.classifications].map((c) => [c.id, c]));
      return {
        ...s,
        profile: { ...s.profile, ...(remote.profile || {}), name: remote.profile?.name || s.profile.name },
        classifications: [...byId.values()].sort((a, b) => b.time - a.time),
        votes: { ...(remote.votes || {}), ...s.votes },
        acknowledged: { ...(remote.acknowledged || {}), ...s.acknowledged },
        quiz: {
          answered: Math.max(s.quiz.answered, remote.quiz?.answered || 0),
          correct: Math.max(s.quiz.correct, remote.quiz?.correct || 0),
          bestStreak: Math.max(s.quiz.bestStreak, remote.quiz?.bestStreak || 0),
        },
        simple: remote.simple ?? s.simple,
      };
    });
  }, []);

  // ---- Processing queue (runs async tasks one at a time, survives page navigation) ----
  const runningRef = useRef(false);
  const updateJob = useCallback((id, patch) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    const next = jobsRef.current.find((j) => j.status === 'queued');
    if (!next) return;
    runningRef.current = true;
    updateJob(next.id, { status: 'running', progress: 0, started: Date.now() });
    try {
      const result = await next.run((p) => updateJob(next.id, { progress: p }));
      updateJob(next.id, { status: 'done', progress: 1, result, finished: Date.now() });
      notify(next.doneText || { es: `Trabajo completado: ${next.title.es}`, en: `Job finished: ${next.title.en}` }, 'task_alt');
    } catch (e) {
      updateJob(next.id, { status: 'error', error: String(e?.message || e), finished: Date.now() });
    }
    runningRef.current = false;
    setTimeout(() => pump(), 50);
  }, [notify, updateJob]);

  const enqueue = useCallback((job) => {
    const j = { id: newId('job'), status: 'queued', progress: 0, created: Date.now(), ...job };
    setJobs((js) => [...js, j]);
    setTimeout(() => pump(), 50);
    return j.id;
  }, [pump]);

  const removeJob = useCallback((id) => setJobs((js) => js.filter((j) => j.id !== id || j.status === 'running')), []);
  const retryJob = useCallback((id) => {
    updateJob(id, { status: 'queued', progress: 0, error: null });
    setTimeout(() => pump(), 50);
  }, [pump, updateJob]);

  const xp = state.classifications.length * 10 + state.quiz.correct * 5;
  const level = Math.floor(xp / 100) + 1;

  const value = useMemo(
    () => ({
      ...state, toasts, toast, notify, markNotificationsRead, addClassification, removeClassification, vote,
      recordQuiz, acknowledge, setProfile, resetAll, jobs, enqueue, removeJob, retryJob, xp, level,
      setSimple, setWelcomed, mergeRemote, persistable: state,
    }),
    [state, toasts, toast, notify, markNotificationsRead, addClassification, removeClassification, vote, recordQuiz,
      acknowledge, setProfile, resetAll, jobs, enqueue, removeJob, retryJob, xp, level, setSimple, setWelcomed, mergeRemote],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
