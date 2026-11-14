import { useEffect, useState } from 'react';
import { useStore } from '../store/AppStore.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

export function Icon({ name, className = '', title }) {
  return (
    <span className={`material-symbols-outlined ${className}`} title={title} aria-hidden={title ? undefined : true}>
      {name}
    </span>
  );
}

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`bg-surface-container rounded-xl shadow-xl ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  const { L } = useI18n();
  return (
    <div className="fixed bottom-6 right-4 sm:right-8 z-[80] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="toast-enter bg-surface-container-highest text-on-surface px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 max-w-sm">
          <Icon name={t.icon} className={t.tone === 'error' ? 'text-error' : t.tone === 'primary' ? 'text-primary' : 'text-secondary'} />
          <span className="font-label text-xs">{typeof t.text === 'object' ? L(t.text) : t.text}</span>
        </div>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-surface-container rounded-xl shadow-2xl w-full ${wide ? 'max-w-5xl' : 'max-w-xl'} max-h-[90vh] flex flex-col`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 bg-surface-container-low rounded-t-xl">
          <h2 className="font-headline font-bold text-sm text-on-surface">{title}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant" aria-label="Close">
            <Icon name="close" className="text-base" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ className = '' }) {
  return <Icon name="progress_activity" className={`animate-spin ${className}`} />;
}

export function ProgressBar({ value, tone = 'secondary', className = '' }) {
  const bg = { secondary: 'bg-secondary', primary: 'bg-primary', tertiary: 'bg-tertiary', sky: 'bg-sky' }[tone];
  return (
    <div className={`w-full h-1 bg-surface-container-high rounded-full overflow-hidden ${className}`}>
      <div className={`h-full ${bg} rounded-full transition-all`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

export function ErrorNote({ error, onRetry }) {
  const { L } = useI18n();
  if (!error) return null;
  const rate = error.status === 429;
  return (
    <div className="p-3 rounded-lg bg-error-container/60 text-on-error-container text-xs font-label flex items-start gap-2">
      <Icon name="error" className="text-error text-base" />
      <div className="flex-1">
        <div>{rate ? L('Límite de peticiones de la API de NASA alcanzado (DEMO_KEY).', 'NASA API rate limit reached (DEMO_KEY).') : String(error.message || error)}</div>
        {rate && (
          <div className="opacity-80 mt-1">
            {L('Obtén una clave gratuita en api.nasa.gov y guárdala en Guía Rápida → Ajustes.', 'Get a free key at api.nasa.gov and save it in Quick Guide → Settings.')}
          </div>
        )}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="px-2 py-1 rounded bg-surface-container-high text-on-surface hover:text-secondary">
          {L('Reintentar', 'Retry')}
        </button>
      )}
    </div>
  );
}

/** Renders children only in expert mode. */
export function Advanced({ children }) {
  const { simple } = useStore();
  return simple ? null : children;
}

/** Plain-language explanation box shown in simple mode (title, text and numbered steps). */
export function Explain({ icon = 'lightbulb', title, children, steps = [] }) {
  const { simple } = useStore();
  const { L } = useI18n();
  const [hidden, setHidden] = useState(false);
  if (!simple || hidden) return null;
  return (
    <div className="rounded-xl bg-gradient-to-r from-secondary/15 to-primary/10 p-4 flex gap-3 items-start">
      <Icon name={icon} className="text-3xl text-secondary shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="font-headline font-bold text-base text-on-surface">{title}</div>
        <div className="text-sm text-on-surface leading-relaxed">{children}</div>
        {steps.length > 0 && (
          <ol className="flex flex-wrap gap-2 pt-1">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-1.5 text-sm bg-surface-container/80 rounded-full pl-1 pr-3 py-1">
                <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        )}
      </div>
      <button type="button" onClick={() => setHidden(true)} className="text-on-surface-variant hover:text-on-surface" aria-label={L('Ocultar ayuda', 'Hide help')} title={L('Ocultar ayuda', 'Hide help')}>
        <Icon name="close" />
      </button>
    </div>
  );
}

export function SourceBadge({ children }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-label bg-surface-container-high text-on-surface-variant">
      <Icon name="database" className="text-[12px] text-secondary" />
      {children}
    </span>
  );
}
