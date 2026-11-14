import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { Advanced, Explain, Icon, ProgressBar, SourceBadge, Spinner } from '../components/ui.jsx';
import { CutoutCanvas, fetchCutout, SkyThumb, useCutout } from '../components/Sky.jsx';
import { SPHEREX_WAVELENGTHS, SURVEYS, nearestFrame, tanToSky, skyToTan, SPHEREX_BLANK_FRAMES } from '../lib/hips.js';
import { renderDifference, renderRGB, COLORMAPS } from '../lib/colormap.js';
import { formatDec, formatRA, propagate, dateToYear } from '../lib/coords.js';
import { MOVING_TARGETS, findTarget, totalPM, pmPA, simbadUrl, vizierUrl, irsaFinderUrl } from '../lib/targets.js';
import { frameInfo } from '../lib/spectrum.js';
import { buildImageFits, downloadBlob } from '../lib/fits.js';
import { currentSurvey } from '../lib/mission.js';
import { neoStats } from '../lib/nasa.js';
import { isTyping, useDebounced, useAsync, useIsMobile } from '../lib/hooks.js';


const CMAP_LABELS = {
  magma: { es: 'Infrarrojo térmico (Magma)', en: 'Thermal infrared (Magma)' },
  viridis: { es: 'Viridis', en: 'Viridis' },
  sky: { es: 'Falso color (Azul cielo / Cian)', en: 'False colour (Sky blue / Cyan)' },
  neon: { es: 'Neón SPHEREx', en: 'SPHEREx neon' },
  mono: { es: 'Monocromo', en: 'Monochrome' },
  monoInv: { es: 'Monocromo inverso (astrometría)', en: 'Inverted mono (astrometry)' },
};

const TRACERS = [
  { id: 'rgb', es: 'Compuesto RGB IR', en: 'IR RGB composite' },
  { id: 'h2o', lambda: 3.05, es: 'Hielo H₂O (3.05 µm)', en: 'H₂O ice (3.05 µm)' },
  { id: 'co2', lambda: 4.27, es: 'CO₂ volátil (4.27 µm)', en: 'CO₂ volatile (4.27 µm)' },
  { id: 'cont', lambda: 1.25, es: 'Continuo estelar (1.25 µm)', en: 'Stellar continuum (1.25 µm)' },
  { id: 'pah', lambda: 3.3, es: 'PAH / CH₄ (3.3 µm)', en: 'PAH / CH₄ (3.3 µm)' },
];

const CLASSES = [
  { id: 'solar', icon: 'flare', es: 'Objeto del Sistema Solar', en: 'Solar System object', subEs: 'Asteroide NEO / Cinturón de Kuiper / Cometa', subEn: 'NEO asteroid / Kuiper Belt / Comet', sEs: 'Algo de nuestro Sistema Solar', sEn: 'Something in our Solar System', sSubEs: 'Un asteroide o un cometa', sSubEn: 'An asteroid or a comet' },
  { id: 'pm', icon: 'wb_twilight', es: 'Movimiento propio estelar', en: 'Stellar proper motion', subEs: 'Estrella cercana o enana marrón fría (T/Y)', subEn: 'Nearby star or cold brown dwarf (T/Y)', sEs: 'Una estrella que se mueve', sEn: 'A moving star', sSubEs: 'Una estrella cercana a nosotros', sSubEn: 'A star close to us' },
  { id: 'variable', icon: 'stars', es: 'Estrella variable o transitorio', en: 'Variable star or transient', subEs: 'Cambio de brillo sin desplazamiento angular', subEn: 'Brightness change without angular shift', sEs: 'Una estrella que cambia de brillo', sEn: 'A star that changes brightness', sSubEs: 'Brilla más o menos, pero no se mueve', sSubEn: 'It gets brighter or dimmer but stays put' },
  { id: 'artifact', icon: 'grain', es: 'Artefacto óptico o rayo cósmico', en: 'Optical artefact or cosmic ray', subEs: 'Píxel caliente, persistencia o difracción', subEn: 'Hot pixel, persistence or diffraction', sEs: 'Un fallo de la imagen', sEn: 'A glitch in the image', sSubEs: 'Un punto que solo sale en una foto', sSubEn: 'A dot that shows up in only one photo' },
];

function defaultFov(t) {
  const d = (totalPM(t) * (SURVEYS.spherex.epoch - SURVEYS.tmassK.epoch)) / 1000; // arcsec
  return Math.min(1800, Math.max(380, 4 * d)) / 3600;
}

export default function Explorer() {
  const { L, lang, fmtNum } = useI18n();
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Image frame: wide on desktop, square on phones so the sky is bigger on small screens.
  const isMobile = useIsMobile();
  const W = isMobile ? 400 : 480;
  const H = isMobile ? 400 : 300;

  // ---------- Target ----------
  const target = useMemo(() => {
    const ra = parseFloat(params.get('ra'));
    const dec = parseFloat(params.get('dec'));
    if (Number.isFinite(ra) && Number.isFinite(dec)) {
      return { id: `custom-${ra.toFixed(4)}${dec.toFixed(4)}`, name: `${formatRA(ra, 1)} ${formatDec(dec, 0)}`, type: 'custom', ra, dec, epoch0: 2000, pmRA: 0, pmDec: 0, desc: { es: 'Campo personalizado', en: 'Custom field' } };
    }
    return findTarget(params.get('target')) || MOVING_TARGETS[0];
  }, [params]);

  const epochs = useMemo(() => {
    const now = dateToYear(new Date());
    return [
      { key: '2mass', label: '2MASS', year: SURVEYS.tmassK.epoch, dateEs: '1997–2001', dateEn: '1997–2001' },
      { key: 'wise', label: 'AllWISE', year: SURVEYS.wiseW1.epoch, dateEs: '2010–2011', dateEn: '2010–2011' },
      { key: 'spherex', label: 'SPHEREx DR1', year: SURVEYS.spherex.epoch, dateEs: 'May 2025 – May 2026', dateEn: 'May 2025 – May 2026' },
      { key: 'future', label: L('Proyección', 'Projection'), year: Math.floor(now) + 2, projected: true, dateEs: `Ene ${Math.floor(now) + 2}`, dateEn: `Jan ${Math.floor(now) + 2}` },
    ];
  }, [L]);

  const posAt = useCallback((year) => propagate(target.ra, target.dec, target.pmRA || 0, target.pmDec || 0, target.epoch0 || 2000, year), [target]);

  const [center, setCenter] = useState(() => posAt((SURVEYS.tmassK.epoch + SURVEYS.spherex.epoch) / 2));
  const [fov, setFov] = useState(() => defaultFov(target));
  useEffect(() => {
    setCenter(posAt((SURVEYS.tmassK.epoch + SURVEYS.spherex.epoch) / 2));
    setFov(defaultFov(target));
    setSubmitted(null);
    setNotes('');
    setCls('pm');
    setApertures([]);
  }, [target, posAt]);

  // ---------- Controls ----------
  const [refBands, setRefBands] = useState('KW1'); // KW1 | JW2
  const [frame, setFrame] = useState(nearestFrame(2.15));
  const dFrame = useDebounced(frame, 300);
  const [tracer, setTracer] = useState(null);
  const [colormap, setColormap] = useState('magma');
  const [invert, setInvert] = useState(false);
  const [optimize, setOptimize] = useState(false);
  const [grid, setGrid] = useState(true);
  const [apertureMode, setApertureMode] = useState(false);
  const [apertures, setApertures] = useState([]);
  const [mode, setMode] = useState('blink');
  const [epochIdx, setEpochIdx] = useState(2);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(500);
  const [split, setSplit] = useState(0.5);
  const [cursor, setCursor] = useState(null);

  const base = { ra: center[0], dec: center[1], fovDeg: fov, width: W, height: H };
  const s2mass = useCutout({ ...base, survey: refBands === 'KW1' ? 'tmassK' : 'tmassJ' });
  const swise = useCutout({ ...base, survey: refBands === 'KW1' ? 'wiseW1' : 'wiseW2' });
  const sspx = useCutout({ ...base, survey: 'spherex', frame: dFrame });
  const imgs = { '2mass': s2mass.img, wise: swise.img, spherex: sspx.img, future: sspx.img };
  const loading = s2mass.loading || swise.loading || sspx.loading;

  // RGB composite (three SPHEREx frames)
  const [rgbImgs, setRgbImgs] = useState(null);
  useEffect(() => {
    if (tracer !== 'rgb') return undefined;
    let alive = true;
    Promise.all([4.5, 2.2, 1.25].map((l) => fetchCutout({ ...base, survey: 'spherex', frame: nearestFrame(l) }))).then((r) => alive && setRgbImgs(r));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracer, center[0], center[1], fov]);
  const rgbRef = useRef(null);
  useEffect(() => {
    if (tracer === 'rgb' && rgbImgs && rgbRef.current) renderRGB(rgbRef.current, ...rgbImgs);
  }, [tracer, rgbImgs, mode]);

  // Blink loop over the three real epochs.
  useEffect(() => {
    if (!playing || mode !== 'blink') return undefined;
    const t = setInterval(() => setEpochIdx((i) => (i >= 2 ? 0 : i + 1)), speed);
    return () => clearInterval(t);
  }, [playing, speed, mode]);

  // Difference canvas
  const diffRef = useRef(null);
  const diffSmallRef = useRef(null);
  useEffect(() => {
    if (s2mass.img && sspx.img) {
      if (diffRef.current) renderDifference(diffRef.current, sspx.img, s2mass.img);
      if (diffSmallRef.current) renderDifference(diffSmallRef.current, sspx.img, s2mass.img);
    }
  }, [s2mass.img, sspx.img, mode]);

  // ---------- Geometry ----------
  const scale = fov / W; // deg per image pixel
  const toPix = useCallback((ra, dec) => {
    const [x, y] = skyToTan(center[0], center[1], ra, dec);
    return [W / 2 - x / scale, H / 2 - y / scale];
  }, [center, scale, W, H]);
  const fromPix = useCallback((px, py) => tanToSky(center[0], center[1], -(px - W / 2) * scale, (H / 2 - py) * scale), [center, scale, W, H]);

  const ep = epochs[epochIdx];
  const positions = epochs.map((e) => toPix(...posAt(e.year)));
  const arrowEnd = toPix(...posAt(epochs[3].year + 8));
  const moving = totalPM(target) > 0;

  // Celestial grid lines (constant RA / Dec)
  const gridLines = useMemo(() => {
    if (!grid) return [];
    const lines = [];
    const stepArcmin = fov * 60 > 20 ? 5 : fov * 60 > 8 ? 2 : 1;
    const step = stepArcmin / 60;
    const decStart = Math.floor((center[1] - fov) / step) * step;
    for (let d = decStart; d <= center[1] + fov; d += step) {
      const pts = [];
      for (let k = -20; k <= 20; k += 1) pts.push(toPix(center[0] + (k / 20) * (fov * 1.5) / Math.cos((center[1] * Math.PI) / 180), d));
      lines.push(pts);
    }
    const raStep = step / Math.max(0.05, Math.cos((center[1] * Math.PI) / 180));
    const raStart = Math.floor((center[0] - fov * 2) / raStep) * raStep;
    for (let r = raStart; r <= center[0] + fov * 2; r += raStep) {
      const pts = [];
      for (let k = -20; k <= 20; k += 1) pts.push(toPix(r, center[1] + (k / 20) * fov));
      lines.push(pts);
    }
    return lines;
  }, [grid, fov, center, toPix]);

  // ---------- Pointer interaction ----------
  const stageRef = useRef(null);
  const drag = useRef(null);
  const [dragOffset, setDragOffset] = useState([0, 0]);
  // Two-finger pinch zoom on touch screens (scaled preview while pinching, real zoom on release).
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const [pinchScale, setPinchScale] = useState(1);
  const pointerDist = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const resetPointers = () => {
    pointers.current.clear();
    pinch.current = null;
    drag.current = null;
    setPinchScale(1);
    setDragOffset([0, 0]);
  };
  const evToPix = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H, r.width / W];
  };
  const onPointerDown = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinch.current = { d0: pointerDist(), scale: 1 };
      drag.current = null;
      setDragOffset([0, 0]);
      return;
    }
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e) => {
    if (!stageRef.current) return;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const sc = Math.max(0.3, Math.min(5, pointerDist() / pinch.current.d0));
      pinch.current.scale = sc;
      setPinchScale(sc);
      return;
    }
    const [px, py] = evToPix(e);
    setCursor(fromPix(px, py));
    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      if (Math.hypot(dx, dy) > 3) drag.current.moved = true;
      if (drag.current.moved) setDragOffset([dx, dy]);
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size < 2) {
        const sc = pinch.current.scale;
        pinch.current = null;
        drag.current = null;
        setPinchScale(1);
        setFov((f) => Math.max(0.03, Math.min(2, f / sc)));
      }
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      const [, , k] = evToPix(e);
      const dxImg = (e.clientX - d.x) / k;
      const dyImg = (e.clientY - d.y) / k;
      setCenter(fromPix(W / 2 - dxImg, H / 2 - dyImg));
      setDragOffset([0, 0]);
      return;
    }
    if (apertureMode) measure(e);
  };

  const activeImg = () => {
    if (mode === 'blink') return imgs[ep.key];
    return imgs.spherex;
  };
  const measure = (e) => {
    const img = activeImg();
    if (!img) return;
    const [px, py] = evToPix(e);
    const rPix = Math.max(3, 15 / 3600 / scale);
    const inner = [];
    const ann = [];
    for (let j = Math.floor(py - 3 * rPix); j <= py + 3 * rPix; j += 1) {
      for (let i = Math.floor(px - 3 * rPix); i <= px + 3 * rPix; i += 1) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const r = Math.hypot(i + 0.5 - px, j + 0.5 - py);
        const v = img.values[j * W + i];
        if (r <= rPix) inner.push(v);
        else if (r >= 2 * rPix && r <= 3 * rPix) ann.push(v);
      }
    }
    const sorted = [...ann].sort((a, b) => a - b);
    const bkg = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const net = inner.reduce((s, v) => s + (v - bkg), 0);
    const isSpx = img.survey === 'spherex';
    const pixSr = (scale * Math.PI / 180) ** 2;
    const value = isSpx ? net * pixSr * 1e9 : net; // mJy for SPHEREx
    const sky = fromPix(px, py);
    setApertures((a) => [{ px, py, r: rPix, value, isSpx, survey: img.survey, sky, bkg }, ...a].slice(0, 4));
  };

  // ---------- Keyboard ----------
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') {
        setPlaying(false);
        setEpochIdx((i) => (i >= 2 ? 0 : i + 1));
      } else if (e.key === 'ArrowLeft') {
        setPlaying(false);
        setEpochIdx((i) => (i <= 0 ? 2 : i - 1));
      } else if (e.key === '+' || e.key === '=') setFov((f) => Math.max(0.03, f / 1.5));
      else if (e.key === '-') setFov((f) => Math.min(2, f * 1.5));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- Actions ----------
  const applyTracer = (t) => {
    if (t.id === 'rgb') {
      setTracer(tracer === 'rgb' ? null : 'rgb');
      return;
    }
    setTracer(t.id);
    setFrame(nearestFrame(t.lambda));
  };

  const downloadFits = () => {
    const planes = [
      ['2MASS', s2mass.img],
      ['ALLWISE', swise.img],
      ['SPHEREX', sspx.img],
    ]
      .filter(([, im]) => im)
      .map(([name, im]) => ({
        name,
        values: im.values,
        extra: [
          ['SURVEY', SURVEYS[im.survey].label],
          ['ORIGIN', 'NASA/IPAC IRSA HiPS'],
          ['EPOCH', SURVEYS[im.survey].epoch, 'approx. mean observation epoch (yr)'],
          ...(im.survey === 'spherex' ? [['WAVELEN', SPHEREX_WAVELENGTHS[im.frame], 'um'], ['BUNIT', 'MJy/sr']] : [['BUNIT', 'HiPS 8-bit']]),
        ],
      }));
    if (!planes.length) return;
    const blob = buildImageFits({
      w: W, h: H, planes,
      wcs: { ra: center[0], dec: center[1], scaleDeg: scale },
      meta: [['OBJECT', target.name.slice(0, 60)], ['CREATOR', 'SPHEREx Chrono-Sky Explorer']],
    });
    downloadBlob(blob, `${target.id}_multiepoch.fits`);
    store.toast(L('FITS multiépoca descargado', 'Multi-epoch FITS downloaded'), 'download');
  };

  const [cls, setCls] = useState('pm');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const truth = target.type === 'hpm' || target.type === 'bd' ? 'pm' : null;

  const submit = (value = cls, doubtful = false) => {
    setSending(true);
    setTimeout(() => {
      const entry = store.addClassification({ targetId: target.id, targetName: target.name, cls: value, notes, truth, doubtful, source: 'explorer' });
      store.vote(target.id, doubtful ? 'doubtful' : value === 'artifact' ? 'artifact' : 'real');
      store.notify({ es: `Clasificaste ${target.name}`, en: `You classified ${target.name}` }, doubtful ? 'help' : 'verified');
      setSending(false);
      setSubmitted(entry);
      store.toast(doubtful ? L('Marcado como dudoso', 'Marked as doubtful') : L('Clasificación registrada', 'Classification recorded'), doubtful ? 'help' : 'verified');
    }, 500);
  };

  const pending = MOVING_TARGETS.filter((t) => !store.classifications.some((c) => c.targetId === t.id));
  const nextObject = () => {
    const list = MOVING_TARGETS;
    const i = list.findIndex((t) => t.id === target.id);
    const nxt = pending.find((t) => t.id !== target.id) || list[(i + 1) % list.length];
    navigate(`/explorer?target=${nxt.id}`);
  };

  const today = store.classifications.filter((c) => new Date(c.time).toDateString() === new Date().toDateString()).length;
  const judged = store.classifications.filter((c) => c.truth && !c.doubtful);
  const accuracy = judged.length ? judged.filter((c) => c.cls === c.truth).length / judged.length : null;
  const stats = useAsync(() => neoStats(), []);
  const survey = currentSurvey();

  const fi = frameInfo(frame);
  const disp = (totalPM(target) * (SURVEYS.spherex.epoch - SURVEYS.tmassK.epoch)) / 1000;
  const stampFov = Math.max(90, disp * 1.6) / 3600;

  // ---------- Rendering helpers ----------
  const canvasCls = 'absolute inset-0 w-full h-full pixelated';
  const renderEpochCanvas = (key, extraStyle) => {
    const im = imgs[key];
    if (!im) return null;
    if (key !== '2mass' && key !== 'wise' && tracer === 'rgb' && rgbImgs) {
      return <canvas ref={rgbRef} className={canvasCls} style={extraStyle} />;
    }
    return <CutoutCanvas img={im} colormap={colormap} invert={invert} stretch={optimize ? 'auto' : 'linear'} smooth={optimize} className={canvasCls} style={extraStyle} />;
  };

  const surveyName = (key) => {
    if (key === '2mass') return refBands === 'KW1' ? '2MASS Ks 2.16 µm' : '2MASS J 1.23 µm';
    if (key === 'wise') return refBands === 'KW1' ? 'AllWISE W1 3.4 µm' : 'AllWISE W2 4.6 µm';
    return `SPHEREx DR1 λ=${SPHEREX_WAVELENGTHS[dFrame].toFixed(3)} µm`;
  };

  return (
    <div className="p-4 lg:p-6 flex flex-col gap-4 max-w-[1720px] mx-auto w-full">
      <Explain
        icon="satellite_alt"
        title={L('¿Qué estoy viendo?', 'What am I looking at?')}
        steps={[L('Mira cómo parpadea la imagen', 'Watch the image blink'), L('Fíjate en el círculo azul', 'Look at the blue circle'), L('Elige qué crees que es', 'Choose what you think it is')]}
      >
        {L(
          'Son fotos reales del mismo trozo de cielo tomadas en 1999, 2010 y 2025. La imagen cambia sola entre las tres fechas: si un punto “salta” de sitio, ¡es una estrella que se mueve! La línea de puntos muestra su camino.',
          'These are real photos of the same patch of sky taken in 1999, 2010 and 2025. The picture switches between the three dates by itself: if a dot “jumps”, it is a moving star! The dotted line shows its path.',
        )}
      </Explain>
      {/* HUD */}
      <section className="bg-surface-container-low rounded-xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.6)] flex flex-col gap-3 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-sky/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-wrap items-center justify-between gap-3 relative">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-surface-container px-3 py-1 rounded">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-ping" />
              <select
                value={target.type === 'custom' ? '' : target.id}
                onChange={(e) => navigate(`/explorer?target=${e.target.value}`)}
                className="bg-transparent font-headline text-headline-sm text-on-surface focus:outline-none cursor-pointer max-w-[260px]"
                aria-label={L('Objetivo', 'Target')}
              >
                {target.type === 'custom' && <option value="">{L('CAMPO', 'FIELD')}: {target.name}</option>}
                {MOVING_TARGETS.map((t) => (
                  <option key={t.id} value={t.id}>{L('CAMPO', 'FIELD')}: {t.name}</option>
                ))}
              </select>
            </div>
            <Advanced>
            <span className="font-label text-telemetry text-secondary uppercase bg-surface-container-high px-2 py-1 rounded">RA: {formatRA(center[0], 2)}</span>
            <span className="font-label text-telemetry text-secondary uppercase bg-surface-container-high px-2 py-1 rounded">Dec: {formatDec(center[1], 1)}</span>
            <span className="font-label text-telemetry text-on-surface-variant bg-surface-container px-2 py-1 rounded">FOV: {fmtNum(fov * 60, 1)}′ × {fmtNum((fov * 60 * H) / W, 1)}′</span>
            <span className="font-label text-telemetry text-outline bg-surface-container px-2 py-1 rounded">{L('Escala', 'Scale')}: {fmtNum(scale * 3600, 2)}″/px</span>
            </Advanced>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-surface-container px-2 py-1 rounded max-w-full min-w-0">
              <Icon name="palette" className="text-[18px] text-sky" />
              <span className="hidden sm:inline font-label text-label-sm text-outline">{L('Paleta', 'Palette')}:</span>
              <select value={colormap} onChange={(e) => setColormap(e.target.value)} className="min-w-0 flex-1 truncate bg-transparent text-secondary font-label text-label-sm focus:outline-none cursor-pointer" aria-label={L('Paleta', 'Palette')}>
                {COLORMAPS.map((c) => (
                  <option key={c} value={c}>{L(CMAP_LABELS[c])}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5 bg-surface-container px-2 py-1 rounded">
              <Icon name="layers" className="text-[18px] text-sky" />
              <select value={refBands} onChange={(e) => setRefBands(e.target.value)} className="bg-transparent text-secondary font-label text-label-sm focus:outline-none cursor-pointer" aria-label={L('Bandas de referencia', 'Reference bands')}>
                <option value="KW1">2MASS Ks + WISE W1</option>
                <option value="JW2">2MASS J + WISE W2</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setOptimize((o) => !o)}
              className={`flex items-center gap-1 px-2 py-1 rounded transition-colors font-label text-label-sm ${optimize ? 'bg-sky text-on-sky font-semibold' : 'bg-surface-container hover:bg-surface-container-high text-on-surface hover:text-secondary'}`}
            >
              <Icon name="auto_fix_high" className="text-[16px]" />
              {L('Optimizar S/N', 'Optimise S/N')}
            </button>
          </div>
        </div>
        <Advanced>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-center relative">
          <div className="xl:col-span-5 flex items-center gap-3">
            <div className="flex flex-col shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-headline text-headline-sm text-sky">λ = {SPHEREX_WAVELENGTHS[frame].toFixed(3)} µm</span>
                <span className="bg-sky text-on-sky font-label text-telemetry px-2 py-0.5 rounded font-bold">
                  {L('BANDA', 'BAND')} {frame + 1} / 102
                </span>
              </div>
              <span className="font-label text-telemetry text-outline">
                LVF-{fi.band} · {L('canal', 'channel')} {fi.channel} · R ≈ {fi.R}
                {SPHEREX_BLANK_FRAMES.includes(frame) && <span className="text-tertiary"> · {L('dicroico (vacío)', 'dichroic (blank)')}</span>}
              </span>
            </div>
            <div className="flex-1 px-2">
              <input type="range" min="0" max="101" value={frame} onChange={(e) => { setFrame(Number(e.target.value)); setTracer(null); }} className="w-full accent-sky" aria-label={L('Canal espectral', 'Spectral channel')} />
              <div className="flex justify-between font-label text-telemetry text-outline pt-1">
                <span>0.75 µm</span>
                <span className="text-secondary">2.50 µm</span>
                <span>5.00 µm</span>
              </div>
            </div>
          </div>
          <div className="xl:col-span-7 flex flex-wrap items-center gap-1.5 justify-start xl:justify-end">
            <span className="font-label text-label-sm text-outline mr-1">{L('Trazadores espectrales', 'Spectral tracers')}:</span>
            {TRACERS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTracer(t)}
                className={`px-2.5 py-1 rounded font-label text-label-sm transition-colors ${tracer === t.id ? 'bg-sky text-on-sky font-semibold shadow-[0_0_12px_rgba(56,189,248,0.5)]' : 'bg-surface-container hover:bg-surface-container-high hover:text-secondary text-on-surface'}`}
              >
                {L(t.es, t.en)}
              </button>
            ))}
          </div>
        </div>
        </Advanced>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* VIEWPORT */}
        <section className="lg:col-span-8 flex flex-col">
          <div className="bg-surface-container-low px-4 py-2.5 rounded-t-xl flex flex-wrap items-center justify-between gap-2">
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1 bg-surface-container p-1 rounded w-full sm:w-auto">
              {[
                ['blink', 'visibility', 'Blink rápido', 'Fast blink'],
                ['split', 'vertical_split', 'Deslizador split', 'Split slider'],
                ['diff', 'difference', 'Resta (SPHEREx − 2MASS)', 'Subtract (SPHEREx − 2MASS)'],
                ['mosaic', 'grid_view', 'Mosaico de épocas', 'Epoch mosaic'],
              ].map(([id, icon, es, en]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-1 font-label text-label-md text-left rounded transition-all ${mode === id ? 'bg-sky text-on-sky font-semibold shadow-[0_0_12px_rgba(56,189,248,0.5)]' : 'text-on-surface-variant hover:text-secondary'}`}
                >
                  <Icon name={icon} className="text-[16px]" />
                  <span>{L(es, en)}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-surface-container px-2.5 py-1 rounded">
                {loading ? <Spinner className="text-[14px] text-sky" /> : <span className="w-2 h-2 rounded-full bg-sky animate-pulse" />}
                <span className="font-label text-telemetry text-on-surface uppercase font-semibold">
                  {mode === 'blink' ? `${ep.label} (${Math.floor(ep.year)})` : mode === 'split' ? '2MASS | SPHEREx' : mode === 'diff' ? 'Δ SPHEREx − 2MASS' : L('4 paneles', '4 panels')}
                </span>
              </div>
              <div className="hidden sm:flex items-center gap-1 text-outline font-label text-telemetry">
                <span>{L('Cadencia', 'Cadence')}:</span>
                <span className="text-secondary font-semibold">{(speed / 1000).toFixed(2)} s</span>
              </div>
            </div>
          </div>

          <div
            ref={stageRef}
            style={{ aspectRatio: `${W} / ${H}` }}
            className={`relative w-full bg-surface-container-lowest overflow-hidden select-none touch-none ${apertureMode ? 'cursor-cell' : 'cursor-crosshair'} active:cursor-grabbing`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => {
              resetPointers();
              setCursor(null);
            }}
            onPointerCancel={resetPointers}
            onWheel={(e) => setFov((f) => Math.max(0.03, Math.min(2, f * (e.deltaY > 0 ? 1.2 : 1 / 1.2))))}
          >
            <div className="absolute inset-0" style={{ transform: `translate(${dragOffset[0]}px, ${dragOffset[1]}px) scale(${pinchScale})` }}>
              {mode === 'blink' && (
                <>
                  {['2mass', 'wise', 'spherex'].map((k, i) => (
                    <div key={k} className="absolute inset-0" style={{ opacity: (epochIdx === 3 ? 2 : epochIdx) === i ? 1 : 0 }}>
                      {renderEpochCanvas(k)}
                    </div>
                  ))}
                </>
              )}
              {mode === 'split' && (
                <>
                  {renderEpochCanvas('spherex')}
                  <div className="absolute inset-0" style={{ clipPath: `inset(0 ${(1 - split) * 100}% 0 0)` }}>
                    {renderEpochCanvas('2mass')}
                  </div>
                  <div className="absolute top-0 bottom-0 w-0.5 bg-sky shadow-[0_0_8px_#38bdf8]" style={{ left: `${split * 100}%` }} />
                </>
              )}
              {mode === 'diff' && <canvas ref={diffRef} className={canvasCls} />}
              {mode === 'mosaic' && (
                <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5 bg-outline-variant">
                  {['2mass', 'wise', 'spherex'].map((k) => (
                    <div key={k} className="relative overflow-hidden bg-surface-container-lowest">
                      {renderEpochCanvas(k)}
                      <span className="absolute top-1 left-1 bg-surface-container-lowest/85 px-1.5 py-0.5 rounded font-label text-[10px] text-sky">{surveyName(k)}</span>
                    </div>
                  ))}
                  <div className="relative overflow-hidden bg-surface-container-lowest">
                    <canvas ref={diffSmallRef} className={canvasCls} />
                    <span className="absolute top-1 left-1 bg-surface-container-lowest/85 px-1.5 py-0.5 rounded font-label text-[10px] text-secondary">Δ SPHEREx − 2MASS</span>
                  </div>
                </div>
              )}

              {/* Overlay (shares the image pixel frame) */}
              {mode !== 'mosaic' && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                  {gridLines.map((pts, i) => (
                    <polyline key={i} points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#00ffcc" strokeOpacity="0.18" strokeWidth="0.6" />
                  ))}
                  {moving && (
                    <>
                      <polyline points={positions.slice(0, 3).map((p) => p.join(',')).join(' ')} fill="none" stroke="#00ffcc" strokeDasharray="3 2" strokeWidth="1.2" />
                      <line x1={positions[2][0]} y1={positions[2][1]} x2={arrowEnd[0]} y2={arrowEnd[1]} stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="5 3" />
                      {positions.slice(0, 4).map((p, i) => (
                        <circle key={i} cx={p[0]} cy={p[1]} r={i === 3 ? 2 : 2.5} fill={i === 3 ? 'none' : '#00ffcc'} stroke={i === 3 ? '#38bdf8' : 'none'} opacity={i === (mode === 'blink' ? epochIdx : 2) ? 0 : 0.7} />
                      ))}
                    </>
                  )}
                  {(() => {
                    const p = positions[mode === 'blink' ? epochIdx : 2];
                    return (
                      <g transform={`translate(${p[0]} ${p[1]})`}>
                        <circle r="14" fill="none" stroke="#38bdf8" strokeDasharray="3 3" strokeWidth="1">
                          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="12s" repeatCount="indefinite" />
                        </circle>
                        <circle r="6" fill="none" stroke="#38bdf8" strokeWidth="1" />
                        <line x1="-18" x2="-11" y1="0" y2="0" stroke="#38bdf8" strokeWidth="1.2" />
                        <line x1="11" x2="18" y1="0" y2="0" stroke="#38bdf8" strokeWidth="1.2" />
                        <line y1="-18" y2="-11" x1="0" x2="0" stroke="#38bdf8" strokeWidth="1.2" />
                        <line y1="11" y2="18" x1="0" x2="0" stroke="#38bdf8" strokeWidth="1.2" />
                      </g>
                    );
                  })()}
                  {apertures.map((a, i) => (
                    <g key={i} opacity={1 - i * 0.2}>
                      <circle cx={a.px} cy={a.py} r={a.r} fill="none" stroke="#ffe04a" strokeWidth="1" />
                      <circle cx={a.px} cy={a.py} r={a.r * 2} fill="none" stroke="#ffe04a" strokeDasharray="2 2" strokeWidth="0.6" />
                      <circle cx={a.px} cy={a.py} r={a.r * 3} fill="none" stroke="#ffe04a" strokeDasharray="2 2" strokeWidth="0.6" />
                    </g>
                  ))}
                </svg>
              )}
            </div>

            {/* HUD badges */}
            <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex flex-col gap-1.5 pointer-events-none">
              <div className="flex items-center gap-2 bg-surface-container-lowest/85 backdrop-blur-md px-2.5 py-1 rounded font-label text-telemetry text-on-surface">
                <span className="text-secondary">{mode === 'blink' ? surveyName(ep.key) : surveyName('spherex')}</span>
                <span className="hidden sm:inline">|</span>
                <span className="hidden sm:inline">{W} × {H} px</span>
              </div>
              <div className="hidden sm:block bg-surface-container-lowest/85 backdrop-blur-md px-2.5 py-0.5 rounded font-label text-telemetry text-outline w-fit">
                {L('Cursor', 'Cursor')}: <span className="text-secondary">{cursor ? `${formatRA(cursor[0], 1)}, ${formatDec(cursor[1], 0)}` : '—'}</span>
              </div>
            </div>

            {moving && mode !== 'mosaic' && (
              <div className="absolute top-3 right-14 hidden md:flex flex-col bg-surface-container-lowest/95 backdrop-blur-md px-2.5 py-1.5 rounded shadow-[0_0_20px_rgba(56,189,248,0.3)] pointer-events-none">
                <div className="flex items-center gap-1.5">
                  <span className="font-headline text-headline-sm text-sky font-bold">{target.name}</span>
                  <span className="px-1.5 rounded bg-sky text-on-sky font-label text-telemetry font-bold">{L('MOVIMIENTO', 'MOTION')}</span>
                </div>
                <div className="flex items-center gap-2 font-label text-telemetry text-secondary">
                  <span>µ: {fmtNum(totalPM(target) / 1000, 2)}″/{L('año', 'yr')}</span>
                  <span>•</span>
                  <span>PA: {fmtNum(pmPA(target), 1)}°</span>
                  {target.kmag && (
                    <>
                      <span>•</span>
                      <span>Ks: {target.kmag}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="absolute z-20 flex flex-wrap justify-center gap-1 bottom-2 left-1 right-1 sm:bottom-auto sm:left-auto sm:top-3 sm:right-3 sm:flex-col sm:gap-1" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
              {[
                ['zoom_in', L('Aumentar zoom (+)', 'Zoom in (+)'), () => setFov((f) => Math.max(0.03, f / 1.5)), false],
                ['zoom_out', L('Reducir zoom (−)', 'Zoom out (−)'), () => setFov((f) => Math.min(2, f * 1.5)), false],
                ['grid_4x4', L('Retícula de coordenadas', 'Coordinate grid'), () => setGrid((g) => !g), grid],
                ['album', L('Apertura fotométrica circular', 'Circular photometric aperture'), () => setApertureMode((a) => !a), apertureMode],
                ['tonality', L('Invertir contraste', 'Invert contrast'), () => setInvert((v) => !v), invert],
                ['center_focus_strong', L('Recentrar en el objetivo', 'Recenter on target'), () => { setCenter(posAt((SURVEYS.tmassK.epoch + SURVEYS.spherex.epoch) / 2)); setFov(defaultFov(target)); }, false],
                ['download', L('Descargar FITS científico (3 épocas)', 'Download science FITS (3 epochs)'), downloadFits, false],
              ].map(([icon, title, fn, active]) => (
                <button
                  key={icon}
                  type="button"
                  title={title}
                  aria-label={title}
                  onClick={fn}
                  className={`w-9 h-9 sm:w-8 sm:h-8 rounded backdrop-blur-md flex items-center justify-center transition-colors ${active ? 'bg-sky/25 text-sky shadow-[0_0_8px_rgba(56,189,248,0.4)]' : 'bg-surface-container-lowest/85 hover:text-sky text-on-surface'}`}
                >
                  <Icon name={icon} className="text-[18px]" />
                </button>
              ))}
            </div>

            {mode === 'split' && (
              <input
                type="range"
                min="0"
                max="1"
                step="0.005"
                value={split}
                onChange={(e) => setSplit(Number(e.target.value))}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                className="absolute bottom-16 sm:bottom-12 left-1/2 -translate-x-1/2 w-2/3 sm:w-1/2 accent-sky z-20"
                aria-label="Split"
              />
            )}

            <div className="absolute bottom-3 left-3 bg-surface-container-lowest/85 backdrop-blur-md p-2 rounded pointer-events-none hidden sm:flex items-center gap-3">
              <div className="relative w-8 h-8 flex items-center justify-center">
                <Icon name="explore" className="text-[24px] text-outline" />
                <span className="absolute -top-1 text-sky font-label text-telemetry font-bold">N</span>
                <span className="absolute -left-1 text-secondary font-label text-telemetry font-bold">E</span>
              </div>
              <div className="flex flex-col font-label text-telemetry">
                <span className="text-on-surface">{L('Centro', 'Centre')}: {target.name.length > 22 ? `${target.name.slice(0, 22)}…` : target.name}</span>
                <span className="text-outline">{L('Arrastra para desplazar · rueda = zoom', 'Drag to pan · wheel = zoom')}</span>
              </div>
            </div>
            <div className="absolute bottom-3 right-3 bg-surface-container-lowest/85 backdrop-blur-md px-3 py-1 rounded hidden sm:flex items-center gap-2 pointer-events-none">
              <span className="text-outline font-label text-telemetry">HiPS:</span>
              <span className="text-sky font-label text-telemetry font-bold">
                {mode === 'blink' ? SURVEYS[imgs[ep.key]?.survey || 'spherex'].label : 'SPHEREx DR1'} · Norder{(mode === 'blink' ? imgs[ep.key] : sspx.img)?.order ?? '–'}
              </span>
            </div>
          </div>

          {/* Timeline dock */}
          <div className="bg-surface-container-low p-4 rounded-b-xl flex flex-col gap-3 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={() => setPlaying((p) => !p)} className="w-10 h-10 rounded bg-sky text-on-sky flex items-center justify-center shadow-[0_0_16px_rgba(56,189,248,0.6)]" aria-label={playing ? 'Pause' : 'Play'}>
                  <Icon name={playing ? 'pause' : 'play_arrow'} className="text-[22px]" />
                </button>
                <button type="button" onClick={() => { setPlaying(false); setEpochIdx((i) => (i <= 0 ? 2 : i - 1)); }} className="w-8 h-8 rounded bg-surface-container hover:bg-surface-container-high text-on-surface hover:text-secondary flex items-center justify-center" aria-label="Previous epoch">
                  <Icon name="skip_previous" className="text-[18px]" />
                </button>
                <button type="button" onClick={() => { setPlaying(false); setEpochIdx((i) => (i >= 2 ? 0 : i + 1)); }} className="w-8 h-8 rounded bg-surface-container hover:bg-surface-container-high text-on-surface hover:text-secondary flex items-center justify-center" aria-label="Next epoch">
                  <Icon name="skip_next" className="text-[18px]" />
                </button>
                <div className="flex items-center gap-1 bg-surface-container p-0.5 rounded ml-2">
                  {[250, 500, 1000, 2000].map((s) => (
                    <button key={s} type="button" onClick={() => setSpeed(s)} className={`px-2 py-0.5 rounded font-label text-telemetry transition-colors ${speed === s ? 'bg-sky/20 text-sky font-semibold' : 'text-outline hover:text-secondary'}`}>
                      {s >= 1000 ? `${s / 1000}.0s` : `${(s / 1000).toFixed(2)}s`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 font-label text-telemetry text-outline">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-secondary" />
                  {L('Proyección TAN común (alineación WCS exacta)', 'Common TAN projection (exact WCS alignment)')}
                </span>
                <span>•</span>
                <span>Δt = {fmtNum(SURVEYS.spherex.epoch - SURVEYS.tmassK.epoch, 1)} {L('años', 'yr')}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
              {epochs.map((e, i) => {
                const active = epochIdx === i;
                return (
                  <button
                    key={e.key}
                    type="button"
                    onClick={() => { setPlaying(false); setMode('blink'); setEpochIdx(i); }}
                    className={`p-2 rounded flex flex-col text-left transition-all relative overflow-hidden ${active ? 'bg-surface-container-high ring-1 ring-sky shadow-[0_0_18px_rgba(56,189,248,0.35)]' : 'bg-surface-container hover:ring-1 hover:ring-secondary/50'} ${e.projected ? 'opacity-80' : ''}`}
                  >
                    {active && <div className="absolute top-0 left-0 w-full h-1 bg-sky" />}
                    <div className="flex items-center justify-between">
                      <span className={`font-headline text-headline-sm ${active ? 'text-sky' : 'text-outline'}`}>{e.label}</span>
                      <span className={`font-label text-telemetry ${active ? 'text-sky font-bold' : 'text-secondary'}`}>{i === 0 ? 't₀' : `+${fmtNum(e.year - epochs[0].year, 0)} ${L('a', 'yr')}`}</span>
                    </div>
                    <span className="font-body text-sm text-on-surface font-semibold">{L(e.dateEs, e.dateEn)}</span>
                    <span className="font-label text-telemetry text-outline">
                      {e.projected ? L('Posición predicha por µ', 'Position predicted from µ') : surveyName(e.key)}
                    </span>
                  </button>
                );
              })}
            </div>
            {apertures.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {apertures.map((a, i) => (
                  <div key={i} className="px-2.5 py-1.5 rounded bg-surface-container font-label text-telemetry text-on-surface-variant flex items-center gap-2">
                    <Icon name="album" className="text-tertiary text-[14px]" />
                    <span>{formatRA(a.sky[0], 1)} {formatDec(a.sky[1], 0)}</span>
                    <span className="text-tertiary font-semibold">
                      {a.isSpx ? `${fmtNum(a.value, 3)} mJy` : `${fmtNum(a.value, 0)} ADU (8-bit)`}
                    </span>
                    <span className="text-outline">{SURVEYS[a.survey].label}</span>
                  </div>
                ))}
                <button type="button" className="text-[11px] font-label text-on-surface-variant hover:text-error" onClick={() => setApertures([])}>
                  {L('Limpiar aperturas', 'Clear apertures')}
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <SourceBadge>SPHEREx DR1 · 2MASS · AllWISE — NASA/IPAC IRSA HiPS</SourceBadge>
              {target.type !== 'custom' && (
                <>
                  <a className="text-[11px] font-label text-secondary hover:underline flex items-center gap-1" href={simbadUrl(target.ra, target.dec)} target="_blank" rel="noreferrer">SIMBAD <Icon name="open_in_new" className="text-xs" /></a>
                  <a className="text-[11px] font-label text-secondary hover:underline flex items-center gap-1" href={vizierUrl(target.ra, target.dec)} target="_blank" rel="noreferrer">VizieR <Icon name="open_in_new" className="text-xs" /></a>
                </>
              )}
              <a className="text-[11px] font-label text-secondary hover:underline flex items-center gap-1" href={irsaFinderUrl(center[0], center[1])} target="_blank" rel="noreferrer">IRSA Finder Chart <Icon name="open_in_new" className="text-xs" /></a>
            </div>
          </div>
        </section>

        {/* VALIDATION PANEL */}
        <section className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-surface-container-low p-4 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.6)] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="diversity_3" className="text-sky text-[22px]" />
                <h2 className="font-headline text-headline-md text-on-surface">
                  {store.simple ? L('Tu turno: ¿qué ves?', 'Your turn: what do you see?') : L('Validación ciudadana', 'Citizen validation')}
                </h2>
              </div>
              <Advanced>
                <span className="px-2 py-0.5 rounded bg-surface-container text-secondary font-label text-telemetry">{L('MODO INVESTIGADOR', 'RESEARCHER MODE')}</span>
              </Advanced>
            </div>
            <p className="font-body text-xs text-on-surface-variant">
              {store.simple
                ? L(
                    'Mira las fotos de cada fecha: ¿el punto del centro cambia de lugar, cambia de brillo o parece un fallo de la imagen?',
                    'Look at the photo from each date: does the dot in the middle change place, change brightness, or look like a glitch in the image?',
                  )
                : L(
                    'Compara las épocas para decidir si el objeto marcado se desplaza (movimiento propio o Sistema Solar), cambia de brillo o es un artefacto.',
                    'Compare the epochs to decide whether the marked object moves (proper motion or Solar System), changes brightness, or is an artefact.',
                  )}
            </p>
            <div className="bg-surface-container p-3 rounded flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-headline text-headline-sm text-sky truncate">{target.name}</span>
                {target.spt && <span className="bg-sky/20 text-sky px-2 py-0.5 rounded font-label text-telemetry font-bold shrink-0">{target.spt}</span>}
              </div>
              <p className="text-[11px] text-on-surface-variant">{L(target.desc)}</p>
              {store.simple ? (
                <div className="grid grid-cols-2 gap-2 font-label text-telemetry">
                  <div className="bg-surface-container-high p-2 rounded">
                    <span className="text-outline block">{L('Cuánto se movió desde 1999', 'How far it moved since 1999')}</span>
                    <span className="text-secondary font-semibold text-sm">{fmtNum(disp, 1)}″</span>
                  </div>
                  <div className="bg-surface-container-high p-2 rounded">
                    <span className="text-outline block">{L('Distancia', 'Distance')}</span>
                    <span className="text-sky font-semibold text-sm">{target.dist ? `${fmtNum(target.dist * 3.2616, 1)} ${L('años luz', 'light-years')}` : '—'}</span>
                  </div>
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-2 font-label text-telemetry">
                <div className="bg-surface-container-high p-2 rounded">
                  <span className="text-outline block">{L('Desplazamiento 2MASS→SPHEREx', 'Shift 2MASS→SPHEREx')}</span>
                  <span className="text-on-surface font-semibold text-sm">{fmtNum(disp, 1)}″ ({fmtNum(disp / 6.15, 1)} px SPHEREx)</span>
                </div>
                <div className="bg-surface-container-high p-2 rounded">
                  <span className="text-outline block">{L('Movimiento propio (µ)', 'Proper motion (µ)')}</span>
                  <span className="text-secondary font-semibold text-sm">{fmtNum(totalPM(target), 1)} mas/{L('año', 'yr')}</span>
                </div>
                <div className="bg-surface-container-high p-2 rounded">
                  <span className="text-outline block">µα* / µδ</span>
                  <span className="text-on-surface font-semibold">{fmtNum(target.pmRA || 0, 1)} / {fmtNum(target.pmDec || 0, 1)}</span>
                </div>
                <div className="bg-surface-container-high p-2 rounded">
                  <span className="text-outline block">{L('Distancia', 'Distance')}</span>
                  <span className="text-sky font-semibold text-sm">{target.dist ? `${fmtNum(target.dist, 2)} pc` : '—'}</span>
                </div>
              </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-label text-label-sm text-outline">
                <span>{L('Recortes centrados por época', 'Per-epoch centred stamps')}</span>
                <span className="text-secondary">{fmtNum(stampFov * 3600, 0)}″</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {epochs.slice(0, 3).map((e, i) => {
                  const [ra, dec] = posAt(e.year);
                  const sv = i === 0 ? (refBands === 'KW1' ? 'tmassK' : 'tmassJ') : i === 1 ? (refBands === 'KW1' ? 'wiseW1' : 'wiseW2') : 'spherex';
                  return (
                    <div key={e.key} className={`flex flex-col items-center gap-1 bg-surface-container p-1 rounded ${i === 2 ? 'ring-1 ring-sky' : ''}`}>
                      <SkyThumb survey={sv} ra={ra} dec={dec} fovDeg={stampFov} size={64} frame={dFrame} colormap={colormap} className="w-full aspect-square rounded">
                        <span className="absolute top-1/2 left-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-secondary" />
                      </SkyThumb>
                      <span className={`font-label text-telemetry ${i === 2 ? 'text-sky font-bold' : 'text-outline'}`}>{e.label}</span>
                      <span className="font-label text-[10px] text-on-surface-variant">{Math.floor(e.year)}</span>
                    </div>
                  );
                })}
                <DiffStamp target={target} posAt={posAt} fovDeg={stampFov} frame={dFrame} refBands={refBands} label={L('Resta', 'Diff')} sub={L('dipolo', 'dipole')} />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <span className="font-headline text-headline-sm text-on-surface">{store.simple ? L('¿Qué crees que es?', 'What do you think it is?') : L('¿Qué tipo de evento astrométrico observas?', 'What kind of astrometric event do you see?')}</span>
              <div className="flex flex-col gap-1.5" role="radiogroup">
                {CLASSES.map((c) => (
                  <label key={c.id} className={`flex items-center justify-between p-2 rounded cursor-pointer transition-all ${cls === c.id ? 'bg-surface-container-high ring-1 ring-sky/60' : 'bg-surface-container hover:bg-surface-container-high'}`}>
                    <div className="flex items-center gap-2.5">
                      <input type="radio" name="cls" className="accent-sky w-4 h-4" checked={cls === c.id} onChange={() => setCls(c.id)} />
                      <div className="flex flex-col">
                        <span className="font-label text-label-md text-on-surface font-semibold">{store.simple ? L(c.sEs, c.sEn) : L(c.es, c.en)}</span>
                        <span className="font-label text-telemetry text-outline">{store.simple ? L(c.sSubEs, c.sSubEn) : L(c.subEs, c.subEn)}</span>
                      </div>
                    </div>
                    <Icon name={c.icon} className={`text-[20px] ${cls === c.id ? 'text-sky' : 'text-outline'}`} />
                  </label>
                ))}
              </div>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-surface-container text-on-surface px-2 py-2 rounded font-body text-xs placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-secondary"
                placeholder={L('Notas astrométricas voluntarias (p.ej. morfología difusa)…', 'Optional astrometric notes (e.g. diffuse morphology)…')}
              />
              <button
                type="button"
                disabled={sending}
                onClick={() => submit()}
                className={`w-full py-2.5 px-4 font-headline text-headline-sm font-bold rounded flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${submitted ? 'bg-secondary text-on-secondary shadow-[0_0_24px_rgba(0,255,204,0.6)]' : 'bg-sky text-on-sky shadow-[0_0_24px_rgba(56,189,248,0.65)] hover:bg-sky/90'}`}
              >
                {sending ? <Spinner className="text-[20px]" /> : <Icon name={submitted ? 'check_circle' : 'verified'} className="text-[20px]" />}
                <span>
                  {sending
                    ? L('Registrando clasificación…', 'Recording classification…')
                    : submitted
                      ? `${L('¡Registrado!', 'Recorded!')} ${submitted.truth ? (submitted.cls === submitted.truth ? L('· coincide con el catálogo', '· matches catalogue') : L('· no coincide con el catálogo', '· differs from catalogue')) : ''}`
                      : L('Confirmar clasificación', 'Confirm classification')}
                </span>
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => submit(cls, true)} className="py-2 px-2 bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface rounded font-label text-label-md flex items-center justify-center gap-1">
                  <Icon name="help" className="text-[16px]" />
                  {L('Marcar dudoso', 'Mark doubtful')}
                </button>
                <button type="button" onClick={nextObject} className="py-2 px-2 bg-surface-container hover:bg-surface-container-high text-secondary rounded font-label text-label-md flex items-center justify-center gap-1">
                  {L('Siguiente objeto', 'Next object')}
                  <Icon name="arrow_forward" className="text-[16px]" />
                </button>
              </div>
              <div className="text-center font-label text-telemetry text-outline pt-1">
                {L('Cola de validación', 'Validation queue')}: <span className="text-secondary font-semibold">{pending.length} {L('objetos pendientes', 'objects pending')}</span>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-low p-4 rounded-xl shadow-md flex items-center gap-4">
            <div className="w-12 h-12 rounded bg-sky/20 flex items-center justify-center text-sky shrink-0">
              <Icon name="military_tech" className="text-[26px]" />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-headline text-headline-sm text-on-surface truncate">{L('Analista espectral nivel', 'Spectral analyst level')} {store.level}</span>
                <span className="font-label text-telemetry text-sky font-bold">{today} {L('hoy', 'today')}</span>
              </div>
              <ProgressBar value={(store.xp % 100) / 100} tone="sky" className="my-1 h-1.5" />
              <span className="font-label text-telemetry text-outline">
                {L('Concordancia con catálogo', 'Catalogue agreement')}: <span className="text-secondary font-semibold">{accuracy == null ? '—' : `${fmtNum(accuracy * 100, 1)}%`}</span> ({judged.length})
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Bottom stats */}
      <Advanced>
      <section className="bg-surface-container-low rounded-xl p-4 shadow-lg grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat icon="task_alt" tone="sky" value={fmtNum(store.classifications.length)} label={L('Tus clasificaciones guardadas', 'Your saved classifications')} />
        <Stat icon="rocket_launch" tone="secondary" value={stats.data ? fmtNum(stats.data.near_earth_object_count) : stats.loading ? '…' : '—'} label={L('Objetos cercanos a la Tierra en NASA NeoWs', 'Near-Earth objects in NASA NeoWs')} />
        <Stat icon="wb_iridescent" tone="tertiary" value={fmtNum(MOVING_TARGETS.length)} label={L('Objetivos de alto movimiento propio (curados)', 'High proper-motion targets (curated)')} />
        <div className="flex items-center gap-4 bg-surface-container p-4 rounded">
          <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#1a1a2e" strokeWidth="3.5" />
              <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#38bdf8" strokeWidth="3.5" strokeDasharray={`${survey.progress * 100}, 100`} />
            </svg>
            <span className="absolute font-label text-telemetry text-on-surface font-bold">{Math.round(survey.progress * 100)}%</span>
          </div>
          <div className="flex flex-col">
            <span className="font-headline text-headline-sm text-on-surface">{L('Cielo completo · Survey', 'All-sky · Survey')} {survey.k}</span>
            <span className="font-label text-telemetry text-secondary">{L('102 canales · 0.75–5.0 µm · DR1 público', '102 channels · 0.75–5.0 µm · public DR1')}</span>
          </div>
        </div>
      </section>
      <p className="text-[11px] font-label text-on-surface-variant">
        {L(
          `Nota: las épocas 2MASS y AllWISE son épocas medias aproximadas; los movimientos propios son valores de literatura (SIMBAD/Gaia DR3). Idioma: ${lang.toUpperCase()}.`,
          `Note: 2MASS and AllWISE epochs are approximate mean epochs; proper motions are literature values (SIMBAD/Gaia DR3). Language: ${lang.toUpperCase()}.`,
        )}
      </p>
      </Advanced>
    </div>
  );
}

function Stat({ icon, tone, value, label }) {
  const toneCls = { sky: 'bg-sky/20 text-sky', secondary: 'bg-secondary/20 text-secondary', tertiary: 'bg-tertiary/20 text-tertiary' }[tone];
  const valCls = { sky: 'text-on-surface', secondary: 'text-secondary', tertiary: 'text-tertiary' }[tone];
  return (
    <div className="flex items-center gap-4 bg-surface-container p-4 rounded">
      <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${toneCls}`}>
        <Icon name={icon} className="text-[24px]" />
      </div>
      <div className="flex flex-col">
        <span className={`font-headline text-headline-lg font-bold ${valCls}`}>{value}</span>
        <span className="font-label text-label-md text-on-surface-variant">{label}</span>
      </div>
    </div>
  );
}

function DiffStamp({ target, posAt, fovDeg, frame, refBands, label, sub }) {
  const mid = posAt((SURVEYS.tmassK.epoch + SURVEYS.spherex.epoch) / 2);
  const p = { ra: mid[0], dec: mid[1], fovDeg, size: 64 };
  const a = useCutout({ ...p, survey: 'spherex', frame });
  const b = useCutout({ ...p, survey: refBands === 'KW1' ? 'tmassK' : 'tmassJ' });
  const ref = useRef(null);
  useEffect(() => {
    if (a.img && b.img && ref.current) renderDifference(ref.current, a.img, b.img);
  }, [a.img, b.img]);
  return (
    <div className="flex flex-col items-center gap-1 bg-surface-container p-1 rounded">
      <div className="w-full aspect-square rounded overflow-hidden bg-surface-container-lowest relative">
        <canvas ref={ref} className="w-full h-full pixelated" />
        {!(a.img && b.img) && <div className="absolute inset-0 animate-pulse bg-surface-container-high/40" />}
      </div>
      <span className="font-label text-telemetry text-secondary">{label}</span>
      <span className="font-label text-[10px] text-on-surface-variant">{target.type === 'custom' ? '—' : sub}</span>
    </div>
  );
}
