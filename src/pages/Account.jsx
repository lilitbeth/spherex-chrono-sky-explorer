import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { useAuth } from '../store/AuthProvider.jsx';
import { Icon, ProgressBar, Spinner } from '../components/ui.jsx';
import { downloadText } from '../lib/fits.js';

export const AVATARS = ['rocket_launch', 'satellite_alt', 'planet', 'star', 'flare', 'nightlight', 'pets', 'school'];

function errorText(e, L) {
  const m = String(e?.message || e);
  if (/Invalid login/i.test(m)) return L('Correo o contraseña incorrectos.', 'Wrong email or password.');
  if (/already registered/i.test(m)) return L('Ese correo ya tiene una cuenta. Inicia sesión.', 'That email already has an account. Sign in instead.');
  if (/Password should be/i.test(m)) return L('La contraseña debe tener al menos 6 caracteres.', 'Password must be at least 6 characters.');
  if (/Email not confirmed/i.test(m)) return L('Confirma tu correo primero (revisa tu bandeja de entrada).', 'Confirm your email first (check your inbox).');
  if (/rate limit/i.test(m)) return L('Demasiados intentos. Espera un momento.', 'Too many attempts. Please wait a moment.');
  return m;
}

export default function Account() {
  const { L, lang } = useI18n();
  const store = useStore();
  const auth = useAuth();
  const [tab, setTab] = useState('signup');
  const [form, setForm] = useState({ name: store.profile.name || '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [newPass, setNewPass] = useState('');
  const fileRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const run = async (fn, okMsg) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (okMsg) setMsg({ ok: true, text: typeof okMsg === 'function' ? okMsg(r) : okMsg });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, L) });
    } finally {
      setBusy(false);
    }
  };

  const exportProgress = () => {
    const { profile, simple, classifications, votes, quiz, acknowledged } = store;
    downloadText(JSON.stringify({ app: 'spherex-chrono-sky-explorer', version: 1, profile, simple, classifications, votes, quiz, acknowledged }, null, 2), 'my_spherex_progress.json', 'application/json');
  };
  const importProgress = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((t) => {
      try {
        const data = JSON.parse(t);
        if (data.app !== 'spherex-chrono-sky-explorer') throw new Error('bad file');
        store.mergeRemote(data);
        store.toast(L('Progreso importado', 'Progress imported'), 'upload');
      } catch {
        store.toast(L('Archivo no válido', 'Invalid file'), 'error', 'error');
      }
    });
    e.target.value = '';
  };

  const statusInfo = {
    idle: [L('Sin sincronizar', 'Not synced'), 'cloud_off', 'text-on-surface-variant'],
    loading: [L('Cargando tu progreso…', 'Loading your progress…'), 'cloud_sync', 'text-tertiary'],
    saving: [L('Guardando…', 'Saving…'), 'cloud_upload', 'text-tertiary'],
    saved: [L('Guardado en la nube', 'Saved to the cloud'), 'cloud_done', 'text-secondary'],
    error: [L('Error al sincronizar', 'Sync error'), 'cloud_off', 'text-error'],
  }[auth.sync.status];

  const input = 'w-full bg-surface-container-high text-on-surface text-base px-3 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary';

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6 max-w-5xl">
      <div>
        <div className="flex items-center gap-2 font-label text-xs tracking-widest text-secondary uppercase mb-1">
          <Icon name="account_circle" className="text-sm" /> {L('Tu espacio', 'Your space')}
        </div>
        <h1 className="font-headline font-bold text-2xl lg:text-3xl tracking-tight text-on-surface">{L('Mi cuenta y progreso', 'My account & progress')}</h1>
        <p className="text-sm text-on-surface-variant max-w-2xl mt-1">
          {L(
            'Crea una cuenta gratuita para guardar tus descubrimientos, tu nivel y tus clasificaciones en la nube y recuperarlos en cualquier dispositivo.',
            'Create a free account to save your discoveries, level and classifications in the cloud and get them back on any device.',
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Auth card */}
        <div className="rounded-xl bg-surface-container p-6 space-y-4">
          {!auth.cloudEnabled && (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 font-headline font-bold"><Icon name="cloud_off" className="text-tertiary" /> {L('Cuentas en la nube aún no activadas', 'Cloud accounts not enabled yet')}</div>
              <p className="text-on-surface-variant">
                {L('Mientras tanto tu progreso se guarda en este navegador. Puedes exportarlo e importarlo con los botones de abajo.', 'Meanwhile your progress is saved in this browser. You can export and import it with the buttons below.')}
              </p>
            </div>
          )}

          {auth.cloudEnabled && !auth.ready && <Spinner className="text-secondary text-2xl" />}

          {auth.cloudEnabled && auth.ready && !auth.user && (
            <>
              <div className="grid grid-cols-2 gap-1 bg-surface-container-high rounded-lg p-1">
                {[['signup', L('Crear cuenta', 'Create account')], ['signin', L('Iniciar sesión', 'Sign in')]].map(([id, lab]) => (
                  <button key={id} type="button" onClick={() => { setTab(id); setMsg(null); }} className={`py-2 rounded-md font-label text-sm ${tab === id ? 'bg-secondary text-on-secondary font-bold' : 'text-on-surface-variant'}`}>{lab}</button>
                ))}
              </div>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (tab === 'signup') {
                    run(() => auth.signUp(form), (r) => (r.needsConfirmation
                      ? L('¡Cuenta creada! Revisa tu correo y pulsa el enlace de confirmación; después inicia sesión.', 'Account created! Check your email and click the confirmation link, then sign in.')
                      : L('¡Bienvenido/a! Tu progreso ya se guarda en la nube.', 'Welcome! Your progress is now saved in the cloud.')));
                  } else if (tab === 'signin') {
                    run(() => auth.signIn(form), L('Sesión iniciada', 'Signed in'));
                  } else {
                    run(() => auth.resetPassword(form.email), L('Te enviamos un correo para cambiar la contraseña.', 'We sent you an email to reset your password.'));
                  }
                }}
              >
                {tab === 'signup' && (
                  <label className="block space-y-1">
                    <span className="text-sm font-label text-on-surface">{L('¿Cómo te llamamos?', 'What should we call you?')}</span>
                    <input value={form.name} onChange={set('name')} required maxLength={40} className={input} placeholder={L('Tu nombre o apodo', 'Your name or nickname')} autoComplete="nickname" />
                  </label>
                )}
                <label className="block space-y-1">
                  <span className="text-sm font-label text-on-surface">{L('Correo electrónico', 'Email')}</span>
                  <input type="email" value={form.email} onChange={set('email')} required className={input} placeholder="nombre@correo.com" autoComplete="email" />
                </label>
                {tab !== 'reset' && (
                  <label className="block space-y-1">
                    <span className="text-sm font-label text-on-surface">{L('Contraseña (mínimo 6 caracteres)', 'Password (at least 6 characters)')}</span>
                    <input type="password" value={form.password} onChange={set('password')} required minLength={6} className={input} autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} />
                  </label>
                )}
                <button type="submit" disabled={busy} className="w-full py-3 rounded-lg bg-primary text-on-primary font-headline font-bold text-base flex items-center justify-center gap-2 disabled:opacity-60">
                  {busy ? <Spinner /> : <Icon name={tab === 'signup' ? 'person_add' : tab === 'signin' ? 'login' : 'mail'} />}
                  {tab === 'signup' ? L('Crear mi cuenta', 'Create my account') : tab === 'signin' ? L('Entrar', 'Sign in') : L('Enviar correo', 'Send email')}
                </button>
                <div className="flex justify-between text-sm font-label">
                  {tab !== 'reset' ? (
                    <button type="button" onClick={() => { setTab('reset'); setMsg(null); }} className="text-secondary hover:underline">{L('¿Olvidaste tu contraseña?', 'Forgot your password?')}</button>
                  ) : (
                    <button type="button" onClick={() => setTab('signin')} className="text-secondary hover:underline">{L('Volver', 'Back')}</button>
                  )}
                </div>
                {tab === 'signup' && (
                  <p className="text-xs text-on-surface-variant">
                    {L('Si eres menor de edad, pide a un adulto que te ayude a crear la cuenta. Solo guardamos tu nombre, correo y progreso del juego.', 'If you are under age, ask an adult to help you create the account. We only store your name, email and game progress.')}
                  </p>
                )}
              </form>
            </>
          )}

          {auth.cloudEnabled && auth.user && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center"><Icon name={store.profile.avatar || 'rocket_launch'} className="text-on-primary text-3xl" /></div>
                <div className="min-w-0">
                  <div className="font-headline font-bold text-lg truncate">{store.profile.name || L('Explorador/a', 'Explorer')}</div>
                  <div className="text-sm text-on-surface-variant truncate">{auth.user.email}</div>
                </div>
              </div>
              <div className={`flex items-center gap-2 text-sm font-label ${statusInfo[2]}`}>
                <Icon name={statusInfo[1]} className={auth.sync.status === 'saving' || auth.sync.status === 'loading' ? 'animate-pulse' : ''} />
                {statusInfo[0]}
                {auth.sync.at && <span className="text-on-surface-variant">· {auth.sync.at.toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-US')}</span>}
              </div>
              {auth.sync.error && <div className="text-xs text-error">{errorText(auth.sync.error, L)}</div>}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => auth.updatePassword(newPass), L('Contraseña actualizada', 'Password updated')); setNewPass(''); }}>
                <input type="password" minLength={6} value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder={L('Nueva contraseña', 'New password')} className={input} autoComplete="new-password" />
                <button type="submit" disabled={!newPass || busy} className="px-4 rounded-lg bg-surface-container-high text-on-surface font-label text-sm disabled:opacity-40">{L('Cambiar', 'Change')}</button>
              </form>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => auth.signOut()} className="px-4 py-2.5 rounded-lg bg-surface-container-high text-on-surface font-label text-sm flex items-center gap-1.5"><Icon name="logout" /> {L('Cerrar sesión', 'Sign out')}</button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(L('¿Borrar tu progreso guardado en la nube? Tu progreso en este navegador se mantiene.', 'Delete your progress saved in the cloud? Progress in this browser is kept.'))) {
                      run(async () => { await auth.deleteCloudData(); await auth.signOut(); }, L('Datos en la nube borrados', 'Cloud data deleted'));
                    }
                  }}
                  className="px-4 py-2.5 rounded-lg bg-error-container/60 text-error font-label text-sm flex items-center gap-1.5"
                >
                  <Icon name="delete" /> {L('Borrar datos en la nube', 'Delete cloud data')}
                </button>
              </div>
            </div>
          )}
          {msg && <div className={`p-3 rounded-lg text-sm ${msg.ok ? 'bg-secondary/15 text-secondary' : 'bg-error-container/70 text-on-error-container'}`}>{msg.text}</div>}
        </div>

        {/* Profile & progress */}
        <div className="rounded-xl bg-surface-container p-6 space-y-4">
          <h2 className="font-headline font-bold text-lg flex items-center gap-2"><Icon name="badge" className="text-secondary" /> {L('Mi perfil', 'My profile')}</h2>
          <label className="block space-y-1">
            <span className="text-sm font-label">{L('Nombre visible', 'Display name')}</span>
            <input value={store.profile.name} onChange={(e) => store.setProfile({ name: e.target.value.slice(0, 40) })} className={input} placeholder={L('Tu nombre o apodo', 'Your name or nickname')} />
          </label>
          <div className="space-y-1">
            <span className="text-sm font-label">{L('Elige tu avatar', 'Pick your avatar')}</span>
            <div className="grid grid-cols-8 gap-2">
              {AVATARS.map((a) => (
                <button key={a} type="button" onClick={() => store.setProfile({ avatar: a })} aria-label={a} className={`aspect-square rounded-lg flex items-center justify-center ${store.profile.avatar === a ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'}`}>
                  <Icon name={a} className="text-2xl" />
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 rounded-lg bg-surface-container-low space-y-2">
            <div className="flex justify-between font-headline font-bold"><span>{L('Nivel', 'Level')} {store.level}</span><span className="text-secondary">{store.xp} XP</span></div>
            <ProgressBar value={(store.xp % 100) / 100} tone="primary" className="h-2" />
            <div className="grid grid-cols-2 gap-2 text-sm pt-1">
              <div>{L('Clasificaciones', 'Classifications')}: <strong>{store.classifications.length}</strong></div>
              <div>{L('Aciertos en el juego', 'Game answers right')}: <strong>{store.quiz.correct}/{store.quiz.answered}</strong></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportProgress} className="px-4 py-2.5 rounded-lg bg-surface-container-high text-on-surface font-label text-sm flex items-center gap-1.5"><Icon name="download" /> {L('Exportar progreso', 'Export progress')}</button>
            <button type="button" onClick={() => fileRef.current?.click()} className="px-4 py-2.5 rounded-lg bg-surface-container-high text-on-surface font-label text-sm flex items-center gap-1.5"><Icon name="upload" /> {L('Importar progreso', 'Import progress')}</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importProgress} />
            <Link to="/citizen" className="px-4 py-2.5 rounded-lg bg-secondary/15 text-secondary font-label text-sm flex items-center gap-1.5"><Icon name="emoji_events" /> {L('Ver mis logros', 'See my achievements')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
