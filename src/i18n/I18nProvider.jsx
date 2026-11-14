import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const I18nContext = createContext(null);
const STORAGE_KEY = 'spx.lang';

function initialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang);

  const setLang = useCallback((l) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // L('texto', 'text') picks the active language; L({es, en}) also works.
  const L = useCallback((es, en) => {
    if (es && typeof es === 'object') return es[lang] ?? es.en ?? '';
    return lang === 'es' ? es : en;
  }, [lang]);

  const fmtNum = useCallback(
    (n, digits = 0) =>
      Number.isFinite(n)
        ? n.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
        : '—',
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, L, fmtNum }), [lang, setLang, L, fmtNum]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
