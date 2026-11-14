import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { ErrorNote, Icon, Modal, Spinner } from '../components/ui.jsx';
import { getApiKey, nasaImages, setApiKey } from '../lib/nasa.js';
import { useAsync } from '../lib/hooks.js';

const STEPS = [
  { icon: 'satellite_alt', to: '/explorer', es: ['Explora el cielo', 'Elige un objeto de alto movimiento propio y alterna 2MASS → WISE → SPHEREx con el comparador blink.'], en: ['Explore the sky', 'Pick a high proper-motion object and blink 2MASS → WISE → SPHEREx.'] },
  { icon: 'flare', to: '/candidates', es: ['Valida candidatos', 'Revisa los NEOs de esta semana (NASA NeoWs) y vota si son reales.'], en: ['Validate candidates', 'Review this week’s NEOs (NASA NeoWs) and vote whether they are real.'] },
  { icon: 'history_toggle_off', to: '/archive', es: ['Recorre el archivo', 'Mapa real de todo el cielo SPHEREx en 102 longitudes de onda.'], en: ['Browse the archive', 'Real SPHEREx all-sky map in 102 wavelengths.'] },
  { icon: 'query_stats', to: '/spectra', es: ['Analiza espectros', 'Extrae espectros 0.75–5 µm reales y busca hielos de H₂O/CO₂ y PAH.'], en: ['Analyse spectra', 'Extract real 0.75–5 µm spectra and look for H₂O/CO₂ ices and PAHs.'] },
];

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
  const imgs = useAsync(() => nasaImages('SPHEREx'), []);
  const [key, setKey] = useState(() => (getApiKey() === 'DEMO_KEY' ? '' : getApiKey()));
  const [zoom, setZoom] = useState(null);

  const saveKey = () => {
    setApiKey(key);
    store.toast(key ? L('Clave de API guardada en este navegador', 'API key saved in this browser') : L('Usando DEMO_KEY', 'Using DEMO_KEY'), 'key');
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
        <p className="text-xs text-on-surface-variant max-w-3xl mt-1">
          {L(
            'SPHEREx (NASA, lanzado en marzo de 2025) cartografía todo el cielo cada seis meses en 102 colores infrarrojos. Esta herramienta combina sus datos públicos con épocas anteriores para detectar objetos que se mueven y analizar su espectro.',
            'SPHEREx (NASA, launched March 2025) maps the whole sky every six months in 102 infrared colours. This tool combines its public data with earlier epochs to spot moving objects and analyse their spectra.',
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {STEPS.map((s, i) => (
          <Link key={s.to} to={s.to} className="p-4 rounded-xl bg-surface-container hover:bg-surface-container-high group space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-primary/20 text-primary font-label font-bold text-xs flex items-center justify-center">{i + 1}</span>
              <Icon name={s.icon} className="text-secondary" />
            </div>
            <div className="font-headline font-bold text-sm group-hover:text-secondary">{L(s.es[0], s.en[0])}</div>
            <p className="text-[11px] text-on-surface-variant">{L(s.es[1], s.en[1])}</p>
          </Link>
        ))}
      </div>

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
            <label className="block text-[11px] font-label text-on-surface-variant uppercase tracking-wider pt-2">{L('Clave de api.nasa.gov', 'api.nasa.gov key')}</label>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="DEMO_KEY" className="w-full bg-surface-container-high text-on-surface text-xs font-mono px-2 py-2 rounded focus:outline-none focus:ring-1 focus:ring-secondary" autoComplete="off" spellCheck="false" />
            <p className="text-[10px] text-on-surface-variant">
              {L('DEMO_KEY permite ~30 peticiones/hora. Consigue una clave gratuita en ', 'DEMO_KEY allows ~30 requests/hour. Get a free key at ')}
              <a href="https://api.nasa.gov/" target="_blank" rel="noreferrer" className="text-secondary hover:underline">api.nasa.gov</a>.{' '}
              {L('Se guarda solo en este navegador.', 'It is stored only in this browser.')}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={saveKey} className="flex-1 py-1.5 rounded-lg bg-secondary text-on-secondary text-xs font-label font-bold">{L('Guardar', 'Save')}</button>
              <button type="button" onClick={clearCache} className="flex-1 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-label">{L('Vaciar caché', 'Clear cache')}</button>
            </div>
          </div>
          <div className="rounded-xl bg-surface-container p-5 space-y-2">
            <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="keyboard" className="text-tertiary" /> {L('Atajos de teclado', 'Keyboard shortcuts')}</h2>
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="flex items-center justify-between text-xs font-label">
                <kbd className="px-2 py-0.5 rounded bg-surface-container-high text-secondary font-mono text-[11px]">{k}</kbd>
                <span className="text-on-surface-variant text-right">{L(d)}</span>
              </div>
            ))}
          </div>
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
          <h2 className="font-headline font-bold text-sm text-on-surface flex items-center gap-2"><Icon name="science" className="text-primary" /> {L('Notas científicas', 'Science notes')}</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>{L('Las imágenes son productos HiPS de visualización (8 bits, estiramiento asinh); los valores físicos se reconstruyen y son aproximados.', 'Images are HiPS visualisation products (8-bit, asinh stretch); physical values are reconstructed and approximate.')}</li>
            <li>{L('El HiPS DR1 combina los surveys 1 y 2; la cadencia semestral se muestra a partir de su ventana temporal.', 'The DR1 HiPS combines surveys 1 and 2; the semi-annual cadence is derived from its time window.')}</li>
            <li>{L('Las posiciones de NEOs se calculan con un modelo de dos cuerpos a partir de los elementos de NeoWs (precisión de minutos de arco).', 'NEO positions use a two-body model from NeoWs elements (arc-minute accuracy).')}</li>
            <li>{L('Para ciencia publicable, descarga los productos L2/L3 oficiales desde IRSA.', 'For publishable science, download the official L2/L3 products from IRSA.')}</li>
          </ul>
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
