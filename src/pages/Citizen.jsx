import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { Icon, ProgressBar, Spinner } from '../components/ui.jsx';
import { CutoutCanvas, useCutout } from '../components/Sky.jsx';
import { MOVING_TARGETS, totalPM } from '../lib/targets.js';
import { propagate } from '../lib/coords.js';
import { SURVEYS, nearestFrame } from '../lib/hips.js';
import { downloadText } from '../lib/fits.js';

const CLASS_LABEL = {
  solar: { es: 'Sistema Solar', en: 'Solar System' },
  pm: { es: 'Movimiento propio', en: 'Proper motion' },
  variable: { es: 'Variable', en: 'Variable' },
  artifact: { es: 'Artefacto', en: 'Artefact' },
};

const ACHIEVEMENTS = [
  { id: 'first', icon: 'star', es: 'Primera clasificación', en: 'First classification', test: (s) => s.classifications.length >= 1 },
  { id: 'ten', icon: 'military_tech', es: '10 clasificaciones', en: '10 classifications', test: (s) => s.classifications.length >= 10 },
  { id: 'all', icon: 'workspace_premium', es: 'Todos los objetivos curados', en: 'All curated targets', test: (s) => MOVING_TARGETS.every((t) => s.classifications.some((c) => c.targetId === t.id)) },
  { id: 'neo', icon: 'near_me', es: 'Validaste un NEO real', en: 'Validated a real NEO', test: (s) => s.classifications.some((c) => c.targetId.startsWith('neo-') && c.cls === 'solar') },
  { id: 'quiz5', icon: 'local_fire_department', es: 'Racha de 5 en entrenamiento', en: '5-streak in training', test: (s) => s.quiz.bestStreak >= 5 },
  { id: 'acc', icon: 'verified', es: '≥90% de concordancia (≥5)', en: '≥90% agreement (≥5)', test: (s) => { const j = s.classifications.filter((c) => c.truth && !c.doubtful); return j.length >= 5 && j.filter((c) => c.cls === c.truth).length / j.length >= 0.9; } },
];

function randomField() {
  // Random high-latitude-ish position (uniform on the sphere, avoid the galactic plane crowding a bit).
  const ra = Math.random() * 360;
  const dec = (Math.asin(2 * Math.random() - 1) * 180) / Math.PI;
  return { ra, dec };
}

function makeQuestion() {
  if (Math.random() < 0.55) {
    const t = MOVING_TARGETS[Math.floor(Math.random() * MOVING_TARGETS.length)];
    const mid = propagate(t.ra, t.dec, t.pmRA, t.pmDec, t.epoch0, (SURVEYS.tmassK.epoch + SURVEYS.spherex.epoch) / 2);
    const span = (totalPM(t) * (SURVEYS.spherex.epoch - SURVEYS.tmassK.epoch)) / 1000;
    // Offset the centre slightly so the answer is not "always the centre".
    const jitter = (span / 3600) * 0.3;
    return { ra: mid[0] + (Math.random() - 0.5) * jitter, dec: mid[1] + (Math.random() - 0.5) * jitter, fov: Math.max(240, span * 3) / 3600, moves: true, target: t };
  }
  const { ra, dec } = randomField();
  return { ra, dec, fov: (240 + Math.random() * 400) / 3600, moves: false, target: null };
}

export default function Citizen() {
  const { L, lang, fmtNum } = useI18n();
  const store = useStore();
  const judged = store.classifications.filter((c) => c.truth && !c.doubtful);
  const accuracy = judged.length ? judged.filter((c) => c.cls === c.truth).length / judged.length : null;
  const byClass = Object.keys(CLASS_LABEL).map((k) => [k, store.classifications.filter((c) => c.cls === k).length]);
  const maxClass = Math.max(1, ...byClass.map(([, n]) => n));

  // ---- Training quiz with real images ----
  const [q, setQ] = useState(makeQuestion);
  const [answer, setAnswer] = useState(null);
  const [streak, setStreak] = useState(0);
  const [phase, setPhase] = useState(0);
  const A = useCutout({ survey: 'tmassK', ra: q.ra, dec: q.dec, fovDeg: q.fov, size: 200 });
  const B = useCutout({ survey: 'spherex', ra: q.ra, dec: q.dec, fovDeg: q.fov, size: 200, frame: nearestFrame(2.2) });
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => 1 - p), 700);
    return () => clearInterval(t);
  }, []);
  const respond = (moves) => {
    if (answer) return;
    const ok = moves === q.moves;
    const s = ok ? streak + 1 : 0;
    setStreak(s);
    setAnswer({ ok });
    store.recordQuiz(ok, s);
  };
  const next = useCallback(() => {
    setAnswer(null);
    setQ(makeQuestion());
  }, []);

  const exportHistory = (fmt) => {
    if (fmt === 'json') downloadText(JSON.stringify(store.classifications, null, 2), 'my_classifications.json', 'application/json');
    else {
      const rows = store.classifications.map((c) => [new Date(c.time).toISOString(), c.targetId, `"${c.targetName}"`, c.cls, c.truth || '', c.doubtful ? 1 : 0, `"${(c.notes || '').replace(/"/g, "'")}"`].join(','));
      downloadText(['time,target_id,target_name,class,catalogue_truth,doubtful,notes', ...rows].join('\n'), 'my_classifications.csv', 'text/csv');
    }
  };

  const unlocked = ACHIEVEMENTS.filter((a) => a.test(store));

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-label text-xs tracking-widest text-secondary uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            {L('Programa de validación colaborativa', 'Collaborative validation programme')}
          </div>
          <h1 className="font-headline font-bold text-2xl lg:text-3xl tracking-tight text-on-surface">{L('Ciencia Ciudadana', 'Citizen Science')}</h1>
          <p className="text-xs font-body text-on-surface-variant max-w-2xl mt-1">
            {L(
              'Entrena tu ojo con imágenes reales de 2MASS y SPHEREx, revisa tu historial y lleva tus habilidades a los proyectos oficiales de ciencia ciudadana de NASA.',
              'Train your eye with real 2MASS and SPHEREx images, review your history and take your skills to NASA’s official citizen-science projects.',
            )}
          </p>
        </div>
        <Link to="/explorer" className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label text-xs font-bold flex items-center gap-1.5 shadow-md w-fit">
          <Icon name="play_arrow" className="text-sm" /> {L('Empezar a clasificar', 'Start classifying')}
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface-container flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
            <Icon name="military_tech" className="text-3xl" />
          </div>
          <div className="flex-1">
            <div className="font-label text-[11px] text-on-surface-variant uppercase">{store.profile.name}</div>
            <div className="font-headline font-bold text-xl text-on-surface">{L('Nivel', 'Level')} {store.level}</div>
            <ProgressBar value={(store.xp % 100) / 100} tone="primary" className="mt-1" />
            <div className="font-label text-[10px] text-on-surface-variant mt-1">{store.xp} XP · {100 - (store.xp % 100)} {L('para el siguiente', 'to next')}</div>
          </div>
        </div>
        <Metric icon="task_alt" tone="text-secondary" label={L('Clasificaciones', 'Classifications')} value={fmtNum(store.classifications.length)} sub={L('guardadas en este navegador', 'stored in this browser')} />
        <Metric icon="verified" tone="text-tertiary" label={L('Concordancia con catálogo', 'Catalogue agreement')} value={accuracy == null ? '—' : `${fmtNum(accuracy * 100, 1)}%`} sub={`${judged.length} ${L('evaluables', 'scorable')}`} />
        <Metric icon="school" tone="text-primary" label={L('Entrenamiento', 'Training')} value={store.quiz.answered ? `${fmtNum((store.quiz.correct / store.quiz.answered) * 100, 0)}%` : '—'} sub={`${store.quiz.correct}/${store.quiz.answered} · ${L('mejor racha', 'best streak')} ${store.quiz.bestStreak}`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 rounded-xl bg-surface-container p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="school" className="text-secondary" /> {L('Entrenamiento: ¿hay movimiento?', 'Training: is anything moving?')}</h2>
            <span className="font-label text-[11px] text-tertiary flex items-center gap-1"><Icon name="local_fire_department" className="text-sm" /> {streak}</span>
          </div>
          <p className="text-xs text-on-surface-variant">
            {L('Blink entre 2MASS (≈1999) y SPHEREx (2025–26). ¿Algún objeto cambia de posición?', 'Blink between 2MASS (≈1999) and SPHEREx (2025–26). Does any object change position?')}
          </p>
          <div className="relative w-full aspect-square max-w-[420px] mx-auto rounded-lg overflow-hidden bg-surface-container-lowest">
            {A.img && <CutoutCanvas img={A.img} colormap="magma" stretch="auto" className="absolute inset-0 w-full h-full pixelated" style={{ opacity: phase ? 0 : 1 }} />}
            {B.img && <CutoutCanvas img={B.img} colormap="magma" stretch="auto" className="absolute inset-0 w-full h-full pixelated" style={{ opacity: phase ? 1 : 0 }} />}
            {(A.loading || B.loading) && <div className="absolute inset-0 flex items-center justify-center"><Spinner className="text-secondary text-3xl" /></div>}
            <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-surface/90 font-label text-[10px] text-secondary">{phase ? 'SPHEREx 2.2 µm' : '2MASS Ks'}</span>
            {answer && (
              <div className={`absolute inset-x-0 bottom-0 p-3 font-label text-xs ${answer.ok ? 'bg-secondary/90 text-on-secondary' : 'bg-error-container/95 text-on-error-container'}`}>
                <strong>{answer.ok ? L('¡Correcto!', 'Correct!') : L('No exactamente.', 'Not quite.')}</strong>{' '}
                {q.moves ? L(`Era ${q.target.name}, que se mueve ${(totalPM(q.target) / 1000).toFixed(2)}″/año.`, `It was ${q.target.name}, moving ${(totalPM(q.target) / 1000).toFixed(2)}″/yr.`) : L('Campo aleatorio: las estrellas de fondo no se desplazan apreciablemente.', 'Random field: background stars do not move noticeably.')}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {!answer ? (
              <>
                <button type="button" onClick={() => respond(true)} className="py-2.5 rounded-lg bg-secondary text-on-secondary font-label font-bold text-xs flex items-center justify-center gap-1.5"><Icon name="moving" className="text-base" /> {L('Sí, se mueve', 'Yes, it moves')}</button>
                <button type="button" onClick={() => respond(false)} className="py-2.5 rounded-lg bg-surface-container-high text-on-surface font-label font-semibold text-xs flex items-center justify-center gap-1.5"><Icon name="block" className="text-base" /> {L('No, todo estático', 'No, all static')}</button>
              </>
            ) : (
              <button type="button" onClick={next} className="col-span-2 py-2.5 rounded-lg bg-primary text-on-primary font-label font-bold text-xs flex items-center justify-center gap-1.5">{L('Siguiente campo', 'Next field')} <Icon name="arrow_forward" className="text-base" /></button>
            )}
          </div>
        </div>

        <div className="xl:col-span-7 rounded-xl bg-surface-container p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="history" className="text-primary" /> {L('Tu historial de clasificaciones', 'Your classification history')}</h2>
            <div className="flex items-center gap-2 text-xs font-label">
              <button type="button" onClick={() => exportHistory('csv')} className="px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center gap-1"><Icon name="table" className="text-sm" /> CSV</button>
              <button type="button" onClick={() => exportHistory('json')} className="px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center gap-1"><Icon name="data_object" className="text-sm" /> JSON</button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {byClass.map(([k, n]) => (
              <div key={k} className="bg-surface-container-low rounded-lg p-2">
                <div className="font-label text-[10px] text-on-surface-variant">{L(CLASS_LABEL[k])}</div>
                <div className="font-headline font-bold text-lg">{n}</div>
                <ProgressBar value={n / maxClass} tone={k === 'artifact' ? 'primary' : k === 'pm' ? 'tertiary' : 'secondary'} />
              </div>
            ))}
          </div>
          <div className="max-h-80 overflow-y-auto rounded-lg">
            {store.classifications.length === 0 ? (
              <div className="p-6 text-center text-xs font-label text-on-surface-variant">{L('Aún no has clasificado ningún objeto.', 'You have not classified any object yet.')}</div>
            ) : (
              <table className="w-full text-xs font-label">
                <thead className="sticky top-0 bg-surface-container-high text-[10px] uppercase text-on-surface-variant">
                  <tr>
                    <th className="text-left py-2 px-3">{L('Fecha', 'Date')}</th>
                    <th className="text-left py-2 px-3">{L('Objeto', 'Object')}</th>
                    <th className="text-left py-2 px-3">{L('Tu clase', 'Your class')}</th>
                    <th className="text-left py-2 px-3">{L('Catálogo', 'Catalogue')}</th>
                    <th className="py-2 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {store.classifications.map((c, i) => (
                    <tr key={c.id} className={i % 2 ? 'bg-surface-container-low/40' : ''}>
                      <td className="py-2 px-3 text-on-surface-variant whitespace-nowrap">{new Date(c.time).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="py-2 px-3 text-on-surface">{c.targetName}{c.notes ? <span className="block text-[10px] text-on-surface-variant">{c.notes}</span> : null}</td>
                      <td className="py-2 px-3">{c.doubtful ? <span className="text-tertiary">{L('Dudoso', 'Doubtful')}</span> : L(CLASS_LABEL[c.cls] || { es: c.cls, en: c.cls })}</td>
                      <td className="py-2 px-3">{c.truth ? (c.doubtful ? '—' : c.cls === c.truth ? <span className="text-secondary">✓</span> : <span className="text-error">✗ {L(CLASS_LABEL[c.truth])}</span>) : '—'}</td>
                      <td className="py-2 px-3 text-right">
                        <button type="button" onClick={() => store.removeClassification(c.id)} className="text-on-surface-variant hover:text-error" title={L('Eliminar', 'Delete')}><Icon name="delete" className="text-sm" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl bg-surface-container p-5 space-y-3">
          <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="emoji_events" className="text-tertiary" /> {L('Logros', 'Achievements')} ({unlocked.length}/{ACHIEVEMENTS.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ACHIEVEMENTS.map((a) => {
              const ok = unlocked.includes(a);
              return (
                <div key={a.id} className={`p-3 rounded-lg flex items-center gap-2 ${ok ? 'bg-tertiary/10 text-tertiary' : 'bg-surface-container-low text-on-surface-variant opacity-60'}`}>
                  <Icon name={ok ? a.icon : 'lock'} className="text-xl" />
                  <span className="font-label text-[11px]">{L(a.es, a.en)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-xl bg-surface-container p-5 space-y-3">
          <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="public" className="text-secondary" /> {L('Proyectos oficiales de NASA', 'Official NASA projects')}</h2>
          {[
            ['https://science.nasa.gov/citizen-science/', 'NASA Citizen Science', L('Catálogo oficial de proyectos de ciencia ciudadana de NASA.', 'Official catalogue of NASA citizen-science projects.')],
            ['https://backyardworlds.org/', 'Backyard Worlds: Planet 9', L('Busca enanas marrones y mundos fríos con blinks de WISE (proyecto financiado por NASA).', 'Hunt brown dwarfs and cold worlds by blinking WISE images (NASA-funded project).')],
            ['https://www.jpl.nasa.gov/asteroid-watch/', 'NASA/JPL Asteroid Watch', L('Seguimiento de asteroides y cometas cercanos a la Tierra.', 'Tracking of near-Earth asteroids and comets.')],
            ['https://spherex.caltech.edu/', 'SPHEREx (Caltech)', L('Página científica de la misión SPHEREx.', 'Science page of the SPHEREx mission.')],
          ].map(([href, name, desc]) => (
            <a key={href} href={href} target="_blank" rel="noreferrer" className="flex items-start gap-3 p-3 rounded-lg bg-surface-container-low hover:bg-surface-container-high group">
              <Icon name="open_in_new" className="text-secondary text-base mt-0.5" />
              <div>
                <div className="font-label text-xs font-semibold text-on-surface group-hover:text-secondary">{name}</div>
                <div className="text-[11px] text-on-surface-variant">{desc}</div>
              </div>
            </a>
          ))}
          <button
            type="button"
            onClick={() => {
              if (window.confirm(L('¿Borrar todas tus clasificaciones y progreso locales?', 'Delete all your local classifications and progress?'))) store.resetAll();
            }}
            className="text-[11px] font-label text-on-surface-variant hover:text-error flex items-center gap-1"
          >
            <Icon name="restart_alt" className="text-sm" /> {L('Reiniciar progreso local', 'Reset local progress')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, tone, label, value, sub }) {
  return (
    <div className="p-4 rounded-xl bg-surface-container flex flex-col justify-between">
      <div className="flex items-center justify-between font-label text-[11px] text-on-surface-variant uppercase">
        <span>{label}</span>
        <Icon name={icon} className={`${tone} text-base`} />
      </div>
      <div className="font-headline font-bold text-2xl text-on-surface my-1">{value}</div>
      <div className="font-label text-[10px] text-on-surface-variant">{sub}</div>
    </div>
  );
}
