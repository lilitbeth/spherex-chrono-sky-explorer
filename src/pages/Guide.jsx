import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { ErrorNote, Icon, Modal, Spinner } from '../components/ui.jsx';
import { apiRoute, getApiKey, nasaImages, setApiKey } from '../lib/nasa.js';
import { useAsync } from '../lib/hooks.js';

// Simple mode: plain-language steps, same names as the simple-mode menu.
const STEPS_SIMPLE = [
  { icon: 'satellite_alt', to: '/explorer', es: ['Estrellas que se mueven', 'Mira fotos del mismo trozo de cielo tomadas en años distintos. Pulsa ▶ y verás cómo una estrella cambia de sitio.'], en: ['Moving stars', 'See photos of the same patch of sky taken in different years. Press ▶ and watch a star change place.'] },
  { icon: 'flare', to: '/candidates', es: ['Asteroides cercanos', 'Rocas espaciales que pasan cerca de la Tierra esta semana. Elige una y di si te parece real.'], en: ['Nearby asteroids', 'Space rocks passing near Earth this week. Pick one and say whether it looks real.'] },
  { icon: 'history_toggle_off', to: '/archive', es: ['Mapa de todo el cielo', 'El cielo entero visto por SPHEREx. Toca cualquier punto para verlo de cerca.'], en: ['Whole-sky map', 'The entire sky as seen by SPHEREx. Tap any spot to see it up close.'] },
  { icon: 'query_stats', to: '/spectra', es: ['Colores invisibles', 'SPHEREx ve 102 “colores” que nuestros ojos no ven. Descubre de qué está hecho un objeto (hielo, polvo…).'], en: ['Invisible colours', 'SPHEREx sees 102 “colours” our eyes cannot. Find out what an object is made of (ice, dust…).'] },
  { icon: 'groups', to: '/citizen', es: ['Juega y aprende', 'Clasifica imágenes, responde el quiz y gana puntos y niveles.'], en: ['Play & learn', 'Classify images, take the quiz and earn points and levels.'] },
  { icon: 'person', to: '/account', es: ['Guarda tu progreso', 'Crea una cuenta gratis para no perder tus puntos y seguir en otro dispositivo.'], en: ['Save your progress', 'Create a free account so you keep your points and continue on another device.'] },
];

// Expert mode: technical steps for the main modules…
const STEPS_EXPERT = [
  { icon: 'satellite_alt', to: '/explorer', es: ['Explorador del Cielo', 'Blink / split / diferencia / mosaico 2MASS (≈1999) → AllWISE (≈2010) → SPHEREx DR1, con propagación por movimiento propio y exportación FITS.'], en: ['Sky Explorer', 'Blink / split / difference / mosaic 2MASS (≈1999) → AllWISE (≈2010) → SPHEREx DR1, with proper-motion propagation and FITS export.'] },
  { icon: 'flare', to: '/candidates', es: ['Candidatos de Movimiento', 'NEOs de NASA NeoWs + estrellas HPM, efemérides de dos cuerpos, votación (teclas 1/2) y exportación CSV.'], en: ['Motion Candidates', 'NASA NeoWs NEOs + HPM stars, two-body ephemerides, voting (keys 1/2) and CSV export.'] },
  { icon: 'history_toggle_off', to: '/archive', es: ['Archivo de Épocas', 'Mollweide de todo el cielo (Allsky HiPS) en 102 canales, con rejillas ecuatorial, eclíptica y galáctica.'], en: ['Epoch Archive', 'All-sky Mollweide (Allsky HiPS) in 102 channels, with equatorial, ecliptic and galactic grids.'] },
  { icon: 'query_stats', to: '/spectra', es: ['Laboratorio de Espectros', 'Espectro 0.75–5 µm por píxel, ajuste Planck + plantillas H₂O/CO₂/CO/PAH (mínimos cuadrados ponderados) y FITS BINTABLE.'], en: ['Spectra Lab', '0.75–5 µm per-pixel spectrum, Planck + H₂O/CO₂/CO/PAH template fit (weighted least squares) and FITS BINTABLE.'] },
];

// …and for the expert-only tools.
const TOOLS_EXPERT = [
  { icon: 'vital_signs', to: '/diagnostics', es: ['Diagnóstico Espectral', 'Saturación (byte ≥252), canales vacíos y calidad por banda.'], en: ['Spectral Diagnostics', 'Saturation (byte ≥252), blank channels and per-band quality.'] },
  { icon: 'sensors', to: '/telemetry', es: ['Telemetría Orbital', 'Posición de SPHEREx en vivo (TLE CelesTrak + SGP4) sobre mapas GIBS.'], en: ['Orbital Telemetry', 'Live SPHEREx position (CelesTrak TLE + SGP4) over GIBS maps.'] },
  { icon: 'tune', to: '/queue', es: ['Cola de Calibración', 'Trabajos en segundo plano: reintentar, cancelar y ver progreso.'], en: ['Calibration Queue', 'Background jobs: retry, cancel and track progress.'] },
  { icon: 'warning', to: '/alerts', es: ['Alertas Transitorias', 'Clima espacial DONKI y avisos de NEOs potencialmente peligrosos.'], en: ['Transient Alerts', 'DONKI space weather and potentially hazardous NEO notices.'] },
];

const TIPS_SIMPLE = [
  ['touch_app', { es: 'En el celular: toca para elegir y junta o separa dos dedos para acercar o alejar.', en: 'On a phone: tap to choose, and pinch with two fingers to zoom in or out.' }],
  ['lightbulb', { es: 'Las cajas de colores con una bombilla explican cada pantalla. Puedes cerrarlas con la ✕.', en: 'The coloured boxes with a light bulb explain each screen. Close them with the ✕.' }],
  ['translate', { es: 'Cambia entre español e inglés con el botón ES / EN de arriba.', en: 'Switch between Spanish and English with the ES / EN button at the top.' }],
  ['science', { es: '¿Quieres más datos técnicos? Pulsa “Ver guía experta” o el botón de modo de arriba.', en: 'Want more technical data? Press “See expert guide” or the mode button at the top.' }],
];

const GLOSSARY = [
  [{ es: 'Infrarrojo', en: 'Infrared' }, { es: 'Luz que no podemos ver, como el calor que sientes de una estufa. SPHEREx la usa para ver a través del polvo.', en: 'Light we cannot see, like the heat you feel from a heater. SPHEREx uses it to see through dust.' }],
  [{ es: 'Asteroide', en: 'Asteroid' }, { es: 'Roca que viaja alrededor del Sol. Algunos pasan cerca de la Tierra (NEO).', en: 'A rock that travels around the Sun. Some pass close to Earth (NEOs).' }],
  [{ es: 'Espectro', en: 'Spectrum' }, { es: 'La “huella de colores” de un objeto. Cada material (agua, hielo, polvo) deja una marca distinta.', en: 'An object’s “colour fingerprint”. Each material (water, ice, dust) leaves a different mark.' }],
  [{ es: 'Época', en: 'Epoch' }, { es: 'El momento en que se tomó una foto del cielo.', en: 'The moment a photo of the sky was taken.' }],
];

const TIPS_EXPERT = [
  ['download', { es: 'Exporta FITS (imágenes y espectros) y CSV (candidatos) para analizarlos en DS9, Astropy o TOPCAT.', en: 'Export FITS (images and spectra) and CSV (candidates) for DS9, Astropy or TOPCAT.' }],
  ['open_in_new', { es: 'Los objetos enlazan a SIMBAD y VizieR para contrastar con catálogos.', en: 'Objects link to SIMBAD and VizieR for catalogue cross-checks.' }],
  ['speed', { es: 'Las respuestas de api.nasa.gov se guardan en caché local; vacíala en Ajustes si necesitas datos frescos.', en: 'api.nasa.gov responses are cached locally; clear the cache in Settings if you need fresh data.' }],
  ['sentiment_satisfied', { es: 'Pulsa “Ver guía sencilla” o el botón de modo de arriba para volver a las explicaciones paso a paso.', en: 'Press “See simple guide” or the mode button at the top to return to step-by-step explanations.' }],
];

function StepCard({ s, n, L }) {
  return (
    <Link to={s.to} className="p-4 rounded-xl bg-surface-container hover:bg-surface-container-high group space-y-2">
      <div className="flex items-center gap-2">
        {n != null && <span className="w-7 h-7 rounded-full bg-primary/20 text-primary font-label font-bold text-xs flex items-center justify-center">{n}</span>}
        <Icon name={s.icon} className="text-secondary" />
      </div>
      <div className="font-headline font-bold text-sm group-hover:text-secondary">{L(s.es[0], s.en[0])}</div>
      <p className="text-xs text-on-surface-variant">{L(s.es[1], s.en[1])}</p>
    </Link>
  );
}

const SHORTCUTS = [
  ['Space', { es: 'Reproducir / pausar blink · siguiente candidato', en: 'Play / pause blink · next candidate' }],
  ['← / →', { es: 'Época anterior / siguiente', en: 'Previous / next epoch' }],
  ['+ / −', { es: 'Zoom en el visor', en: 'Zoom the viewer' }],
  ['1 / 2', { es: 'Votar real / artefacto (Candidatos)', en: 'Vote real / artefact (Candidates)' }],
  ['Esc', { es: 'Cerrar diálogos', en: 'Close dialogs' }],
];

const SOURCES = [
  ['SPHEREx DR1 spectral cube (HiPS)', 'NASA/IPAC IRSA', 'https://irsa.ipac.caltech.edu/Missions/spherex.html', { es: 'Imágenes y espectros de 102 canales, mapa all-sky.', en: '102-channel images and spectra, all-sky map.' }],
  ['2MASS & AllWISE (HiPS)', 'NASA/IPAC IRSA', 'https://irsa.ipac.caltech.edu/', { es: 'Épocas de referencia ≈1999 y 2010 para el blink.', en: 'Reference epochs ≈1999 and 2010 for blinking.' }],
  ['NeoWs – Near Earth Object Web Service', 'api.nasa.gov', 'https://api.nasa.gov/', { es: 'NEOs de la semana, elementos orbitales y estadísticas.', en: 'This week’s NEOs, orbital elements and statistics.' }],
  ['DONKI – Space Weather', 'api.nasa.gov · CCMC', 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/', { es: 'Notificaciones de clima espacial.', en: 'Space-weather notifications.' }],
  ['NASA Image and Video Library', 'images.nasa.gov', 'https://images.nasa.gov/', { es: 'Imágenes oficiales de la misión.', en: 'Official mission imagery.' }],
  ['GIBS – Global Imagery Browse Services', 'NASA Earthdata (EOSDIS)', 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api', { es: 'Mapas de la Tierra (Blue Marble, VIIRS).', en: 'Earth maps (Blue Marble, VIIRS).' }],
  ['CelesTrak GP data', 'CelesTrak', 'https://celestrak.org/', { es: 'Elementos orbitales de SPHEREx (NORAD 63182).', en: 'SPHEREx orbital elements (NORAD 63182).' }],
];

export default function Guide() {
  const { L, lang, setLang } = useI18n();
  const store = useStore();
  const { simple, setSimple } = store;
  const imgs = useAsync(() => nasaImages('SPHEREx'), []);
  const [key, setKey] = useState(getApiKey);
  const [route, setRoute] = useState(apiRoute);
  const [zoom, setZoom] = useState(null);

  const saveKey = () => {
    setApiKey(key);
    setRoute(apiRoute());
    store.toast(key ? L('Clave personal guardada en este navegador', 'Personal key saved in this browser') : L('Clave personal eliminada', 'Personal key removed'), 'key');
  };
  const clearCache = () => {
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('spx.cache.')).forEach((k) => localStorage.removeItem(k));
      store.toast(L('Caché de API vaciada', 'API cache cleared'), 'delete_sweep');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div>
        <div className="flex items-center gap-2 font-label text-xs tracking-widest text-secondary uppercase mb-1">
          <Icon name="menu_book" className="text-sm" /> {L('Guía rápida', 'Quick guide')}
        </div>
        <h1 className="font-headline font-bold text-2xl lg:text-3xl tracking-tight text-on-surface">{L('Cómo usar SPHEREx Chrono-Sky Explorer', 'How to use SPHEREx Chrono-Sky Explorer')}</h1>
        <p className={`${simple ? 'text-sm' : 'text-xs'} text-on-surface-variant max-w-3xl mt-1`}>
          {simple
            ? L(
                'SPHEREx es un telescopio espacial de la NASA que fotografía todo el cielo cada seis meses. Aquí puedes usar sus fotos reales para encontrar estrellas que se mueven, asteroides y de qué están hechas las cosas del espacio.',
                'SPHEREx is a NASA space telescope that photographs the whole sky every six months. Here you can use its real photos to find moving stars, asteroids and what things in space are made of.',
              )
            : L(
                'SPHEREx (NASA, lanzado en marzo de 2025) cartografía todo el cielo cada seis meses en 102 colores infrarrojos (0.75–5 µm). Esta herramienta combina sus datos públicos con épocas anteriores para detectar objetos que se mueven y analizar su espectro.',
                'SPHEREx (NASA, launched March 2025) maps the whole sky every six months in 102 infrared colours (0.75–5 µm). This tool combines its public data with earlier epochs to spot moving objects and analyse their spectra.',
              )}
        </p>
      </div>

      <div className="rounded-xl bg-gradient-to-r from-secondary/15 to-primary/10 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <Icon name={simple ? 'sentiment_satisfied' : 'science'} className="text-3xl text-secondary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-headline font-bold text-base text-on-surface">
            {simple ? L('Estás en modo Sencillo', 'You are in Simple mode') : L('Estás en modo Experto', 'You are in Expert mode')}
          </div>
          <div className="text-sm text-on-surface-variant">
            {simple
              ? L('Textos fáciles y explicaciones en cada pantalla. Ideal para empezar o para cualquier edad.', 'Easy wording and explanations on every screen. Ideal to get started, for all ages.')
              : L('Todos los datos técnicos, herramientas avanzadas, exportación y atajos de teclado.', 'All technical data, advanced tools, exports and keyboard shortcuts.')}
          </div>
        </div>
        <button type="button" onClick={() => setSimple(!simple)} className="shrink-0 px-4 py-2 rounded-lg bg-surface-container-high text-on-surface text-sm font-label font-semibold hover:bg-surface-container-highest flex items-center justify-center gap-1.5">
          <Icon name={simple ? 'science' : 'sentiment_satisfied'} className="text-base" />
          {simple ? L('Ver guía experta', 'See expert guide') : L('Ver guía sencilla', 'See simple guide')}
        </button>
      </div>

      {simple ? (
        <>
          <h2 className="font-headline font-bold text-lg text-on-surface">{L('¿Qué puedo hacer?', 'What can I do?')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {STEPS_SIMPLE.map((s, i) => <StepCard key={s.to} s={s} n={i + 1} L={L} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl bg-surface-container p-5 space-y-3">
              <h2 className="font-headline font-bold text-base flex items-center gap-2"><Icon name="tips_and_updates" className="text-tertiary" /> {L('Consejos', 'Tips')}</h2>
              {TIPS_SIMPLE.map(([icon, d]) => (
                <div key={icon} className="flex gap-2 items-start text-sm text-on-surface">
                  <Icon name={icon} className="text-secondary shrink-0" /> <span>{L(d)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl bg-surface-container p-5 space-y-3">
              <h2 className="font-headline font-bold text-base flex items-center gap-2"><Icon name="menu_book" className="text-primary" /> {L('Palabras útiles', 'Useful words')}</h2>
              {GLOSSARY.map(([term, d]) => (
                <div key={term.en} className="text-sm">
                  <span className="font-semibold text-secondary">{L(term)}: </span>
                  <span className="text-on-surface">{L(d)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <h2 className="font-headline font-bold text-sm text-on-surface flex items-center gap-2"><Icon name="route" className="text-secondary" /> {L('Flujo de trabajo', 'Workflow')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {STEPS_EXPERT.map((s, i) => <StepCard key={s.to} s={s} n={i + 1} L={L} />)}
          </div>
          <h2 className="font-headline font-bold text-sm text-on-surface flex items-center gap-2"><Icon name="construction" className="text-tertiary" /> {L('Herramientas expertas', 'Expert tools')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {TOOLS_EXPERT.map((s) => <StepCard key={s.to} s={s} L={L} />)}
          </div>
          <div className="rounded-xl bg-surface-container p-5 space-y-2">
            <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="tips_and_updates" className="text-tertiary" /> {L('Consejos avanzados', 'Advanced tips')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {TIPS_EXPERT.map(([icon, d]) => (
                <div key={icon} className="flex gap-2 items-start text-xs text-on-surface-variant">
                  <Icon name={icon} className="text-secondary text-base shrink-0" /> <span>{L(d)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 rounded-xl bg-surface-container p-5 space-y-3">
          <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="photo_library" className="text-secondary" /> {L('Imágenes oficiales de SPHEREx — NASA Image Library', 'Official SPHEREx images — NASA Image Library')}</h2>
          <ErrorNote error={imgs.error} onRetry={imgs.reload} />
          {imgs.loading && <div className="py-8 text-center"><Spinner className="text-secondary text-2xl" /></div>}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {(imgs.data || []).slice(0, 12).map((im) => (
              <button key={im.id} type="button" onClick={() => setZoom(im)} className="group text-left">
                <div className="aspect-square rounded-lg overflow-hidden bg-surface-container-lowest">
                  <img src={im.thumb} alt={im.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </div>
                <div className="text-[10px] font-label text-on-surface-variant mt-1 line-clamp-2">{im.title}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="xl:col-span-4 space-y-4">
          <div className="rounded-xl bg-surface-container p-5 space-y-3">
            <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="settings" className="text-primary" /> {L('Ajustes', 'Settings')}</h2>
            <label className="block text-[11px] font-label text-on-surface-variant uppercase tracking-wider">{L('Idioma', 'Language')}</label>
            <div className="flex gap-2">
              {[['es', 'Español'], ['en', 'English']].map(([l, n]) => (
                <button key={l} type="button" onClick={() => setLang(l)} className={`flex-1 py-1.5 rounded-lg text-xs font-label ${lang === l ? 'bg-secondary/20 text-secondary font-semibold' : 'bg-surface-container-high text-on-surface-variant'}`}>{n}</button>
              ))}
            </div>
            {simple ? (
              <p className="text-sm text-on-surface-variant pt-1 flex gap-2 items-start">
                <Icon name="lock" className="text-secondary text-base shrink-0" />
                {L('No necesitas configurar nada: la conexión con la NASA ya está lista.', 'Nothing to set up: the connection to NASA is ready.')}
              </p>
            ) : (
            <>
            <label className="block text-[11px] font-label text-on-surface-variant uppercase tracking-wider pt-2">{L('Clave de api.nasa.gov', 'api.nasa.gov key')}</label>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={L('Opcional', 'Optional')} className="w-full bg-surface-container-high text-on-surface text-xs font-mono px-2 py-2 rounded focus:outline-none focus:ring-1 focus:ring-secondary" autoComplete="off" spellCheck="false" />
            <p className="text-[10px] text-on-surface-variant">
              <span className="flex items-center gap-1 text-secondary font-semibold">
                <Icon name={route === 'proxy' ? 'lock' : route === 'personal' ? 'key' : 'warning'} className="text-sm" />
                {route === 'proxy'
                  ? L('Conectado a NASA mediante el servidor del proyecto (clave oculta).', 'Connected to NASA through the project server (hidden key).')
                  : route === 'personal'
                    ? L('Usando tu clave personal.', 'Using your personal key.')
                    : L('Usando DEMO_KEY (~30 peticiones/hora).', 'Using DEMO_KEY (~30 requests/hour).')}
              </span>
              {L('Opcional: pega aquí tu propia clave gratuita de ', 'Optional: paste your own free key from ')}
              <a href="https://api.nasa.gov/" target="_blank" rel="noreferrer" className="text-secondary hover:underline">api.nasa.gov</a>.{' '}
              {L('Se guarda solo en este navegador.', 'It is stored only in this browser.')}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={saveKey} className="flex-1 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-label font-bold">{L('Guardar', 'Save')}</button>
              <button type="button" onClick={clearCache} className="flex-1 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-label">{L('Vaciar caché', 'Clear cache')}</button>
            </div>
            </>
            )}
          </div>
          {!simple && (
          <div className="rounded-xl bg-surface-container p-5 space-y-2">
            <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="keyboard" className="text-tertiary" /> {L('Atajos de teclado', 'Keyboard shortcuts')}</h2>
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex items-center justify-between text-xs font-label">
                <kbd className="px-2 py-0.5 rounded bg-surface-container-high text-secondary font-mono text-[11px]">{k}</kbd>
                <span className="text-on-surface-variant text-right">{L(d)}</span>
              </div>
            ))}
          </div>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-surface-container p-5 space-y-3">
        <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="database" className="text-secondary" /> {L('Datos abiertos utilizados', 'Open data used')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {SOURCES.map(([name, org, href, desc]) => (
            <a key={name} href={href} target="_blank" rel="noreferrer" className="p-3 rounded-lg bg-surface-container-low hover:bg-surface-container-high group">
              <div className="flex items-center justify-between">
                <span className="font-label text-xs font-semibold text-on-surface group-hover:text-secondary">{name}</span>
                <Icon name="open_in_new" className="text-xs text-on-surface-variant" />
              </div>
              <div className="text-[10px] font-label text-tertiary">{org}</div>
              <div className="text-[11px] text-on-surface-variant mt-1">{L(desc)}</div>
            </a>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl bg-surface-container-low p-5 space-y-2 text-xs text-on-surface-variant">
          {simple ? (
            <>
              <h2 className="font-headline font-bold text-base text-on-surface flex items-center gap-2"><Icon name="verified" className="text-primary" /> {L('¿Los datos son reales?', 'Is the data real?')}</h2>
              <p className="text-sm">
                {L(
                  'Sí. Todas las fotos y números vienen directamente de la NASA y de otros servicios científicos públicos (lista de arriba). Son versiones para ver en pantalla, así que algunas cifras son aproximadas.',
                  'Yes. All photos and numbers come straight from NASA and other public science services (list above). They are screen-viewing versions, so some figures are approximate.',
                )}
              </p>
            </>
          ) : (
          <>
          <h2 className="font-headline font-bold text-sm text-on-surface flex items-center gap-2"><Icon name="science" className="text-primary" /> {L('Notas científicas', 'Science notes')}</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{L('Las imágenes son productos HiPS de visualización (8 bits, estiramiento asinh); los valores físicos se reconstruyen y son aproximados.', 'Images are HiPS visualisation products (8-bit, asinh stretch); physical values are reconstructed and approximate.')}</li>
            <li>{L('El HiPS DR1 combina los surveys 1 y 2; la cadencia semestral se muestra a partir de su ventana temporal.', 'The DR1 HiPS combines surveys 1 and 2; the semi-annual cadence is derived from its time window.')}</li>
            <li>{L('Las posiciones de NEOs se calculan con un modelo de dos cuerpos a partir de los elementos de NeoWs (precisión de minutos de arco).', 'NEO positions use a two-body model from NeoWs elements (arc-minute accuracy).')}</li>
            <li>{L('Para ciencia publicable, descarga los productos L2/L3 oficiales desde IRSA.', 'For publishable science, download the official L2/L3 products from IRSA.')}</li>
          </ul>
          </>
          )}
        </div>
        <div className="rounded-xl bg-surface-container-low p-5 space-y-2 text-xs text-on-surface-variant">
          <h2 className="font-headline font-bold text-sm text-on-surface flex items-center gap-2"><Icon name="smart_toy" className="text-tertiary" /> {L('Uso de IA (declaración)', 'AI usage (disclosure)')}</h2>
          <p>
            {L(
              'Este proyecto se desarrolló con ayuda de un asistente de programación con IA (Claude, de Anthropic), tal como permite la política de NASA Space Apps, que exige declararlo en el formulario del proyecto. No se usó IA para generar datos científicos: todos los datos provienen de los servicios oficiales enumerados.',
              'This project was built with help from an AI coding assistant (Claude, by Anthropic), as allowed by the NASA Space Apps policy, which requires disclosing it in the project form. No AI was used to generate scientific data: all data comes from the official services listed.',
            )}
          </p>
          <p className="text-[10px]">{L('Proyecto comunitario para NASA Space Apps Challenge 2026. No es un sitio oficial de NASA.', 'Community project for the NASA Space Apps Challenge 2026. Not an official NASA website.')}</p>
        </div>
      </div>

      <Modal open={!!zoom} onClose={() => setZoom(null)} title={zoom?.title || ''} wide>
        {zoom && (
          <div className="space-y-3">
            <img src={zoom.thumb} alt={zoom.title} className="w-full max-h-[60vh] object-contain rounded-lg bg-surface-container-lowest" />
            <div className="text-[11px] font-label text-tertiary">{zoom.center} · {zoom.date?.slice(0, 10)} · NASA ID {zoom.id}</div>
            <p className="text-xs text-on-surface-variant whitespace-pre-line">{zoom.description}</p>
            <a href={`https://images.nasa.gov/details/${encodeURIComponent(zoom.id)}`} target="_blank" rel="noreferrer" className="text-xs font-label text-secondary hover:underline inline-flex items-center gap-1">images.nasa.gov <Icon name="open_in_new" className="text-xs" /></a>
          </div>
        )}
      </Modal>
    </div>
  );
}
