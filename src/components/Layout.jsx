import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { useAuth } from '../store/AuthProvider.jsx';
import { Icon, Toasts } from './ui.jsx';
import { useSpherexOrbit } from '../lib/useOrbit.js';
import { currentSurvey, fmtMonth } from '../lib/mission.js';
import { ALL_TARGETS } from '../lib/targets.js';
import { formatDec, formatRA, parseCoords } from '../lib/coords.js';

// `s*` labels are the plain-language names shown in simple mode.
export const MAIN_NAV = [
  { to: '/home', icon: 'home', es: 'Inicio', en: 'Home', sEs: 'Inicio', sEn: 'Home', simpleOnly: true },
  { to: '/explorer', icon: 'satellite_alt', es: 'Explorador del Cielo', en: 'Sky Explorer', sEs: 'Estrellas que se mueven', sEn: 'Moving stars' },
  { to: '/candidates', icon: 'flare', es: 'Candidatos de Movimiento', en: 'Motion Candidates', sEs: 'Asteroides cercanos', sEn: 'Nearby asteroids' },
  { to: '/archive', icon: 'history_toggle_off', es: 'Archivo de Épocas (2025-2027)', en: 'Epoch Archive (2025-2027)', sEs: 'Mapa de todo el cielo', sEn: 'Whole-sky map' },
  { to: '/spectra', icon: 'query_stats', es: 'Laboratorio de Espectros', en: 'Spectra Lab', sEs: 'Colores invisibles', sEn: 'Invisible colours' },
  { to: '/citizen', icon: 'groups', es: 'Ciencia Ciudadana', en: 'Citizen Science', sEs: 'Juega y aprende', sEn: 'Play & learn' },
];

export function navLabel(n, simple, L) {
  return simple ? L(n.sEs || n.es, n.sEn || n.en) : L(n.es, n.en);
}

export const DIAG_NAV = [
  { to: '/diagnostics', icon: 'vital_signs', es: 'Diagnóstico Espectral', en: 'Spectral Diagnostics' },
  { to: '/telemetry', icon: 'sensors', es: 'Telemetría Orbital', en: 'Orbital Telemetry' },
  { to: '/queue', icon: 'tune', es: 'Cola de Calibración', en: 'Calibration Queue' },
  { to: '/alerts', icon: 'warning', es: 'Alertas Transitorias', en: 'Transient Alerts' },
];

function Sidebar({ open, onClose }) {
  const { L, lang, fmtNum } = useI18n();
  const { simple } = useStore();
  const [showTools, setShowTools] = useState(false);
  const orbit = useSpherexOrbit(2000);
  const survey = currentSurvey();
  const linkCls = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-label transition-colors ${
      isActive ? 'bg-surface-container-high text-secondary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
    }`;
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed left-0 top-0 h-full w-64 bg-surface-container-low z-50 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.4)] transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col overflow-y-auto">
          <div className="h-16 shrink-0 flex items-center px-5 gap-3 bg-surface-container-lowest">
            <Icon name="satellite_alt" className="text-secondary text-2xl" />
            <div className="flex flex-col">
              <span className="font-headline font-bold text-xs tracking-wider uppercase text-on-surface">SPHEREx · Open Data</span>
              <span className="font-label text-[10px] text-secondary tracking-widest">OBSERVATORY SYS</span>
            </div>
            <button type="button" className="ml-auto lg:hidden text-on-surface-variant" onClick={onClose} aria-label="Close menu">
              <Icon name="close" />
            </button>
          </div>
          <div className={`px-4 py-3 bg-surface-container/60 ${simple ? 'hidden' : ''}`}>
            <div className="flex items-center justify-between text-[11px] font-label text-on-surface-variant uppercase tracking-wider mb-2">
              <span>{L('Telemetría de misión', 'Mission telemetry')}</span>
              <span className={`flex items-center gap-1 ${orbit?.live === false ? 'text-tertiary' : 'text-secondary'}`}>
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${orbit?.live === false ? 'bg-tertiary' : 'bg-secondary'}`} />
                {orbit ? (orbit.live ? L('EN LÍNEA', 'LIVE') : 'CACHE') : '…'}
              </span>
            </div>
            <div className="space-y-1.5 font-label text-[10px] text-on-surface-variant">
              <div className="flex justify-between py-1 px-2 rounded bg-surface-container-high/60">
                <span>{L('ÓRBITA LEO', 'LEO ORBIT')}</span>
                <span className="text-on-surface font-semibold">{orbit?.pos ? `${fmtNum(orbit.pos.alt, 0)} KM SSO` : '—'}</span>
              </div>
              <div className="flex justify-between py-1 px-2 rounded bg-surface-container-high/60">
                <span>{L('INCLINACIÓN', 'INCLINATION')}</span>
                <span className="text-secondary font-semibold">{orbit ? `${fmtNum(orbit.omm.INCLINATION, 2)}°` : '—'}</span>
              </div>
              <div className="flex justify-between py-1 px-2 rounded bg-surface-container-high/60">
                <span>{L('BANDAS 0.75-5.0µm', 'BANDS 0.75-5.0µm')}</span>
                <span className="text-tertiary font-semibold">102 CHAN</span>
              </div>
            </div>
          </div>
          <div className="px-3 pt-4">
            <span className="px-2 text-[10px] font-label uppercase text-on-surface-variant tracking-wider">{L('Espacios de trabajo', 'Workspaces')}</span>
            <nav className="mt-2 space-y-1">
              {MAIN_NAV.filter((n) => simple || !n.simpleOnly).map((n) => (
                <NavLink key={n.to} to={n.to} className={linkCls} onClick={onClose}>
                  <Icon name={n.icon} className="text-base" />
                  {navLabel(n, simple, L)}
                </NavLink>
              ))}
              <NavLink to="/account" className={linkCls} onClick={onClose}>
                <Icon name="account_circle" className="text-base" />
                {L('Mi cuenta', 'My account')}
              </NavLink>
            </nav>
          </div>
          <div className="px-3 pt-4 pb-4">
            {simple ? (
              <button type="button" onClick={() => setShowTools((s) => !s)} className="w-full flex items-center justify-between px-2 text-[10px] font-label uppercase text-on-surface-variant tracking-wider hover:text-on-surface">
                {L('Herramientas para expertos', 'Expert tools')}
                <Icon name={showTools ? 'expand_less' : 'expand_more'} className="text-sm" />
              </button>
            ) : (
              <span className="px-2 text-[10px] font-label uppercase text-on-surface-variant tracking-wider">{L('Diagnóstico & Accesos', 'Diagnostics & Access')}</span>
            )}
            {(!simple || showTools) && (
              <nav className="mt-2 space-y-1">
                {DIAG_NAV.map((n) => (
                  <NavLink key={n.to} to={n.to} className={linkCls} onClick={onClose}>
                    <Icon name={n.icon} className="text-base" />
                    {L(n.es, n.en)}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
        </div>
        <div className="p-4 bg-surface-container-lowest/80 shrink-0">
          <div className="p-3 rounded-lg bg-surface-container-high/50 flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs font-label text-on-surface-variant">
              <Icon name="timer" className="text-sm text-tertiary" />
              <span>{L('Ventana de época activa', 'Active epoch window')}</span>
            </div>
            <div className="font-label text-xs text-on-surface font-semibold pl-6">
              {L('Survey', 'Survey')} {survey.k} // {fmtMonth(survey.start, lang)} – {fmtMonth(survey.end, lang)}
            </div>
            <div className="pl-6 pt-1">
              <div className="w-full h-1 bg-surface-container rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${survey.progress * 100}%` }} />
              </div>
              <span className="text-[10px] font-label text-primary">{fmtNum(survey.progress * 100, 1)}%</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function SearchBox() {
  const { L } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const coords = parseCoords(q);
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const s = q.toLowerCase();
    return ALL_TARGETS.filter((t) => t.name.toLowerCase().includes(s) || t.id.includes(s)).slice(0, 6);
  }, [q]);

  const go = (t) => {
    if (t.type === 'field') navigate(`/spectra?target=${t.id}`);
    else navigate(`/explorer?target=${t.id}`);
    setQ('');
    setFocus(false);
  };
  const submit = (e) => {
    e.preventDefault();
    if (coords) {
      navigate(`/explorer?ra=${coords.ra.toFixed(5)}&dec=${coords.dec.toFixed(5)}`);
      setQ('');
      setFocus(false);
    } else if (matches[0]) go(matches[0]);
  };
  return (
    <form onSubmit={submit} className="relative flex items-center">
      <Icon name="travel_explore" className="absolute left-2.5 text-on-surface-variant text-sm pointer-events-none" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setTimeout(() => setFocus(false), 150)}
        className="bg-surface-container-high/80 text-on-surface placeholder:text-on-surface-variant/70 text-xs font-label pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-secondary w-40 sm:w-48 lg:w-56 transition-all"
        placeholder={L('RA/Dec u objeto (p.ej. Barnard)…', 'RA/Dec or object (e.g. Barnard)…')}
        type="text"
        aria-label={L('Buscar', 'Search')}
      />
      {focus && (coords || matches.length > 0) && (
        <div className="absolute top-9 right-0 w-72 bg-surface-container-high rounded-lg shadow-2xl py-1 z-50">
          {coords && (
            <button type="submit" className="w-full text-left px-3 py-2 text-xs font-label hover:bg-surface-container-highest flex items-center gap-2">
              <Icon name="my_location" className="text-secondary text-sm" />
              <span>
                {L('Ir a', 'Go to')} {formatRA(coords.ra)} {formatDec(coords.dec)}
              </span>
            </button>
          )}
          {matches.map((t) => (
            <button key={t.id} type="button" onMouseDown={() => go(t)} className="w-full text-left px-3 py-2 text-xs font-label hover:bg-surface-container-highest flex items-center gap-2">
              <Icon name={t.type === 'field' ? 'blur_on' : 'flare'} className={`text-sm ${t.type === 'field' ? 'text-tertiary' : 'text-primary'}`} />
              <span className="flex-1 text-on-surface">{t.name}</span>
              <span className="text-[10px] text-on-surface-variant">{t.type === 'field' ? L('Espectro', 'Spectrum') : 'Blink'}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

function Notifications() {
  const { notifications, markNotificationsRead } = useStore();
  const { L, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = notifications.filter((n) => !n.read).length;
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) markNotificationsRead();
        }}
        className="w-8 h-8 rounded-lg bg-surface-container-high/80 flex items-center justify-center text-on-surface-variant hover:text-secondary"
        title={L('Notificaciones', 'Notifications')}
      >
        <Icon name="notifications" className="text-[18px]" />
      </button>
      {unread > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary ring-2 ring-surface" />}
      {open && (
        <div className="absolute right-0 top-10 w-80 bg-surface-container-high rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-label uppercase tracking-wider text-on-surface-variant">{L('Actividad reciente', 'Recent activity')}</div>
          {notifications.length === 0 && <div className="px-3 pb-3 text-xs text-on-surface-variant">{L('Sin notificaciones todavía.', 'No notifications yet.')}</div>}
          {notifications.map((n) => (
            <div key={n.id} className="px-3 py-2 flex gap-2 text-xs font-label hover:bg-surface-container-highest">
              <Icon name={n.icon} className="text-secondary text-sm" />
              <div className="flex-1">
                <div className="text-on-surface">{typeof n.text === 'object' ? L(n.text) : n.text}</div>
                <div className="text-[10px] text-on-surface-variant">{new Date(n.time).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Profile() {
  const { profile, setProfile, level, xp, classifications } = useStore();
  const { user } = useAuth();
  const { L } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 pl-2">
        <div className="flex-col text-right hidden md:flex">
          <span className="text-xs font-label font-medium text-on-surface">{profile.name || L('Invitado/a', 'Guest')}</span>
          <span className="text-[10px] font-label text-secondary">{user ? L('En la nube', 'Cloud') : L('Local', 'Local')} · {L('Nivel', 'Lv')} {level}</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <Icon name={profile.avatar || 'person'} className="text-on-primary text-[18px]" />
        </div>
      </button>
      {open && (
        <div className="absolute right-0 top-10 w-64 bg-surface-container-high rounded-lg shadow-2xl z-50 p-3 space-y-2 text-xs font-label">
          <label className="block text-[10px] text-on-surface-variant uppercase tracking-wider">{L('Nombre visible', 'Display name')}</label>
          <input
            value={profile.name}
            onChange={(e) => setProfile({ name: e.target.value.slice(0, 40) })}
            className="w-full bg-surface-container text-on-surface px-2 py-1.5 rounded focus:outline-none focus:ring-1 focus:ring-secondary"
          />
          <div className="flex justify-between text-on-surface-variant">
            <span>XP</span>
            <span className="text-secondary font-semibold">{xp}</span>
          </div>
          <div className="flex justify-between text-on-surface-variant">
            <span>{L('Clasificaciones', 'Classifications')}</span>
            <span className="text-on-surface font-semibold">{classifications.length}</span>
          </div>
          <NavLink to="/account" onClick={() => setOpen(false)} className="block text-center py-1.5 rounded bg-primary text-on-primary font-semibold">
            {user ? L('Mi cuenta', 'My account') : L('Crear cuenta / Entrar', 'Sign up / Sign in')}
          </NavLink>
          <NavLink to="/citizen" onClick={() => setOpen(false)} className="block text-center py-1.5 rounded bg-surface-container hover:text-secondary">
            {L('Ver mis logros', 'See my achievements')}
          </NavLink>
        </div>
      )}
    </div>
  );
}

function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center bg-surface-container-high/80 rounded-lg p-0.5 font-label text-[11px]" role="group" aria-label="Language">
      {['es', 'en'].map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`px-2 py-1 rounded uppercase transition-colors ${lang === l ? 'bg-secondary/20 text-secondary font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}
          aria-pressed={lang === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function ModeToggle() {
  const { simple, setSimple } = useStore();
  const { L } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setSimple(!simple)}
      className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-surface-container-high/80 text-[11px] font-label text-on-surface-variant hover:text-secondary"
      title={simple ? L('Cambiar a modo experto (más datos técnicos)', 'Switch to expert mode (more technical data)') : L('Cambiar a modo sencillo (más fácil)', 'Switch to simple mode (easier)')}
    >
      <Icon name={simple ? 'sentiment_satisfied' : 'science'} className="text-base" />
      <span className="hidden sm:inline">{simple ? L('Sencillo', 'Simple') : L('Experto', 'Expert')}</span>
    </button>
  );
}

function Welcome() {
  const { welcomed, setWelcomed, setSimple, simple, profile, setProfile } = useStore();
  const { L, lang, setLang } = useI18n();
  const navigate = useNavigate();
  if (welcomed) return null;
  const choice = (s) => `flex-1 p-4 rounded-xl text-left border-2 ${s ? 'border-secondary bg-secondary/10' : 'border-transparent bg-surface-container-high'}`;
  return (
    <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5" role="dialog" aria-modal="true">
        <div className="text-center space-y-1">
          <Icon name="rocket_launch" className="text-5xl text-primary" />
          <h2 className="font-headline font-bold text-2xl">{L('¡Bienvenido/a a bordo!', 'Welcome aboard!')}</h2>
          <p className="text-sm text-on-surface-variant">
            {L('Explora el cielo con imágenes reales del telescopio espacial SPHEREx de NASA y descubre estrellas que se mueven.', 'Explore the sky with real images from NASA’s SPHEREx space telescope and discover stars that move.')}
          </p>
        </div>
        <div className="flex gap-2 justify-center">
          {[['es', 'Español'], ['en', 'English']].map(([l, n]) => (
            <button key={l} type="button" onClick={() => setLang(l)} className={`px-4 py-2 rounded-lg text-sm font-label ${lang === l ? 'bg-secondary text-on-secondary font-bold' : 'bg-surface-container-high text-on-surface-variant'}`}>{n}</button>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-label">{L('¿Cómo te llamas? (opcional)', 'What is your name? (optional)')}</span>
          <input value={profile.name} onChange={(e) => setProfile({ name: e.target.value.slice(0, 40) })} className="w-full bg-surface-container-high text-on-surface text-base px-3 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary" placeholder={L('Tu nombre o apodo', 'Your name or nickname')} />
        </label>
        <div className="space-y-2">
          <span className="text-sm font-label">{L('¿Cómo quieres ver la página?', 'How do you want to see the site?')}</span>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" onClick={() => setSimple(true)} className={choice(simple)}>
              <Icon name="sentiment_satisfied" className="text-2xl text-secondary" />
              <div className="font-headline font-bold">{L('Sencillo', 'Simple')}</div>
              <div className="text-xs text-on-surface-variant">{L('Letra grande y explicaciones fáciles. Para todas las edades.', 'Larger text and easy explanations. For all ages.')}</div>
            </button>
            <button type="button" onClick={() => setSimple(false)} className={choice(!simple)}>
              <Icon name="science" className="text-2xl text-primary" />
              <div className="font-headline font-bold">{L('Experto', 'Expert')}</div>
              <div className="text-xs text-on-surface-variant">{L('Todos los datos y herramientas científicas.', 'All the scientific data and tools.')}</div>
            </button>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={() => { setWelcomed(); navigate(simple ? '/home' : '/explorer'); }} className="flex-1 py-3 rounded-lg bg-primary text-on-primary font-headline font-bold">{L('¡Empezar!', 'Let’s go!')}</button>
          <button type="button" onClick={() => { setWelcomed(); navigate('/account'); }} className="flex-1 py-3 rounded-lg bg-surface-container-high text-on-surface font-label">{L('Crear cuenta para guardar', 'Create an account to save')}</button>
        </div>
        <p className="text-[11px] text-center text-on-surface-variant">{L('Puedes cambiar el modo en cualquier momento con el botón de la parte superior.', 'You can change the mode anytime with the button at the top.')}</p>
      </div>
    </div>
  );
}

function Header({ onMenu }) {
  const { L } = useI18n();
  const { simple } = useStore();
  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-16 bg-surface/90 backdrop-blur-xl z-30 shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
      <div className="h-16 w-full px-3 sm:px-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button type="button" onClick={onMenu} className="lg:hidden text-on-surface-variant p-1" aria-label="Menu">
            <Icon name="menu" />
          </button>
          <span className="font-headline font-bold text-sm tracking-tight text-on-surface hidden sm:flex items-center gap-2 truncate">
            <span className="text-primary text-base">✦</span>SPHEREx Chrono-Sky Explorer
          </span>
        </div>
        <nav className="hidden 2xl:flex items-center gap-1 text-xs font-label">
          {MAIN_NAV.filter((n) => !n.simpleOnly).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg transition-colors ${isActive ? 'bg-surface-container-high text-secondary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}`
              }
            >
              {navLabel(n, simple, L)}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:block">
            <SearchBox />
          </div>
          <NavLink to="/guide" className="flex items-center gap-1 text-xs font-label text-on-surface-variant hover:text-secondary px-1 py-1.5" title={L('Guía Rápida', 'Quick Guide')}>
            <Icon name="help" className="text-base" />
            <span className="hidden xl:inline">{L('Guía Rápida', 'Quick Guide')}</span>
          </NavLink>
          <ModeToggle />
          <LangToggle />
          <Notifications />
          <Profile />
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }) {
  const [menu, setMenu] = useState(false);
  const { simple } = useStore();
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  // Simple mode scales every rem-based size (text, spacing) up ~10% for readability.
  useEffect(() => {
    document.documentElement.style.fontSize = simple ? '17.5px' : '16px';
  }, [simple]);
  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="lg:pl-64">
        <Header onMenu={() => setMenu(true)} />
        <main className="w-full pt-16 bg-background relative min-h-screen">
          <div className="md:hidden px-4 pt-3">
            <SearchBox />
          </div>
          {children}
          <footer className="px-6 py-6 text-[10px] font-label text-on-surface-variant/70 flex flex-wrap gap-x-4 gap-y-1 justify-between">
            <span>
              Data: NASA/IPAC IRSA (SPHEREx DR1, 2MASS, AllWISE) · NASA NeoWs · NASA DONKI · NASA Image Library · CelesTrak
            </span>
            <span>NASA Space Apps Challenge 2026 — community project, not an official NASA website.</span>
          </footer>
        </main>
      </div>
      <Toasts />
      <Welcome />
    </div>
  );
}
