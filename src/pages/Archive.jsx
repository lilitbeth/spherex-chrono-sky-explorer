import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { Advanced, Explain, Icon, ProgressBar, SourceBadge, Spinner } from '../components/ui.jsx';
import { CutoutCanvas, useCutout } from '../components/Sky.jsx';
import { getAllsky, sampleAllsky, spherexByteToMJy, SPHEREX_WAVELENGTHS, nearestFrame, SURVEYS, SPHEREX_DR1_TMIN, SPHEREX_DR1_TMAX, getSpherexSpectrum } from '../lib/hips.js';
import { lut } from '../lib/colormap.js';
import { eqToFrame, frameToEq, formatDec, formatRA, inverseMollweide, mollweide, eqToGal, eclToEq, mjdToDate } from '../lib/coords.js';
import { FIELDS } from '../lib/targets.js';
import { surveys, fmtDate, fmtMonth, currentSurvey } from '../lib/mission.js';
import { sunPosition, dateToJD } from '../lib/orbit.js';
import { buildImageFits, downloadBlob } from '../lib/fits.js';

const MW = 720;
const MH = 360;
const SQ2 = Math.SQRT2;

// map pixel <-> Mollweide unit coordinates
const pixToMoll = (px, py) => [((px - MW / 2) / (MW / 2)) * 2 * SQ2, ((MH / 2 - py) / (MH / 2)) * SQ2];
const mollToPix = (x, y) => [MW / 2 + (x / (2 * SQ2)) * (MW / 2), MH / 2 - (y / SQ2) * (MH / 2)];

function projectEq(frame, ra, dec) {
  const [lon, lat] = eqToFrame(frame, ra, dec);
  return mollToPix(...mollweide(lon, lat));
}

export default function Archive() {
  const { L, lang, fmtNum } = useI18n();
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [frameSys, setFrameSys] = useState('ecliptic');
  const [lambda, setLambda] = useState(nearestFrame(3.3));
  const [highlight, setHighlight] = useState(null); // 'nep' | 'sep' | 'gal'
  const [showScan, setShowScan] = useState(true);
  const [hover, setHover] = useState(null);
  const [allsky, setAllsky] = useState(null);
  const [loadingSky, setLoadingSky] = useState(true);
  const mapValues = useRef(null);
  const canvasRef = useRef(null);

  const initial = FIELDS.find((f) => f.id === params.get('target')) || FIELDS.find((f) => f.id === 'horsehead');
  const [sel, setSel] = useState(initial);

  useEffect(() => {
    let alive = true;
    setLoadingSky(true);
    getAllsky(lambda).then((a) => {
      if (alive) {
        setAllsky(a);
        setLoadingSky(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [lambda]);

  // Render the all-sky Mollweide map from the real SPHEREx Allsky mosaic.
  useEffect(() => {
    if (!allsky || !canvasRef.current) return;
    const c = canvasRef.current;
    c.width = MW;
    c.height = MH;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(MW, MH);
    const table = lut('neon');
    const vals = new Float32Array(MW * MH).fill(NaN);
    for (let j = 0; j < MH; j += 1) {
      for (let i = 0; i < MW; i += 1) {
        const inv = inverseMollweide(...pixToMoll(i + 0.5, j + 0.5));
        const k = (j * MW + i) * 4;
        if (!inv) continue;
        const [ra, dec] = frameToEq(frameSys, inv[0], inv[1]);
        const v = sampleAllsky(allsky, ra, dec);
        if (v < 0) {
          img.data[k + 3] = 255;
          continue;
        }
        vals[j * MW + i] = spherexByteToMJy(v);
        img.data[k] = table[v * 3];
        img.data[k + 1] = table[v * 3 + 1];
        img.data[k + 2] = table[v * 3 + 2];
        img.data[k + 3] = 255;
      }
    }
    mapValues.current = vals;
    ctx.putImageData(img, 0, 0);
  }, [allsky, frameSys]);

  // Overlays: graticule, reference circles, fields.
  const overlay = useMemo(() => {
    const lines = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      lines.push(Array.from({ length: 73 }, (_, k) => mollToPix(...mollweide(k * 5, lat))));
    }
    for (let lon = 0; lon < 360; lon += 60) {
      lines.push(Array.from({ length: 37 }, (_, k) => mollToPix(...mollweide(lon + 0.0001, -90 + k * 5))));
    }
    const curve = (fn) => {
      const pts = [];
      for (let k = 0; k <= 360; k += 2) pts.push(projectEq(frameSys, ...fn(k)));
      // split where the curve wraps around the map edge
      const segs = [[]];
      pts.forEach((p, i) => {
        if (i > 0 && Math.abs(p[0] - pts[i - 1][0]) > MW / 3) segs.push([]);
        segs[segs.length - 1].push(p);
      });
      return segs;
    };
    const galPlane = curve((l) => {
      // galactic (l, 0) -> equatorial
      const [ra, dec] = frameToEq('galactic', l, 0);
      return [ra, dec];
    });
    const ecliptic = curve((l) => eclToEq(l, 0));
    // Current SPHEREx scan circle: ecliptic meridians at λ☉ ± 90°.
    const sun = sunPosition(dateToJD(new Date())).lambda;
    const scan = [90, -90].flatMap((off) => curve((k) => eclToEq((sun + off + 360) % 360, -90 + k / 2)));
    return { lines, galPlane, ecliptic, scan, sun };
  }, [frameSys]);

  const fieldsPx = FIELDS.map((f) => ({ ...f, p: projectEq(frameSys, f.ra, f.dec) }));

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * MW;
    const py = ((e.clientY - r.top) / r.height) * MH;
    const inv = inverseMollweide(...pixToMoll(px, py));
    if (!inv) {
      setHover(null);
      return;
    }
    const [ra, dec] = frameToEq(frameSys, inv[0], inv[1]);
    const v = mapValues.current?.[Math.floor(py) * MW + Math.floor(px)];
    setHover({ ra, dec, v, gal: eqToGal(ra, dec) });
  };
  const onClick = () => {
    if (!hover) return;
    // Select nearest named field if close, otherwise a custom sector.
    const near = fieldsPx.find((f) => {
      const [x, y] = projectEq(frameSys, hover.ra, hover.dec);
      return Math.hypot(f.p[0] - x, f.p[1] - y) < 10;
    });
    if (near) setSel(near);
    else setSel({ id: 'custom', name: `${formatRA(hover.ra, 0)} ${formatDec(hover.dec, 0)}`, ra: hover.ra, dec: hover.dec, fov: 1.0, desc: { es: 'Sector elegido en el mapa', en: 'Sector picked on the map' } });
  };

  const applyHighlight = (h) => {
    setHighlight(h);
    if (h === 'nep') setSel(FIELDS.find((f) => f.id === 'nep'));
    if (h === 'sep') setSel(FIELDS.find((f) => f.id === 'sep'));
    if (h === 'gal') setSel(FIELDS.find((f) => f.id === 'gc'));
  };

  const exportFits = () => {
    if (!mapValues.current) return;
    const ctype = frameSys === 'galactic' ? ['GLON-MOL', 'GLAT-MOL'] : frameSys === 'ecliptic' ? ['ELON-MOL', 'ELAT-MOL'] : ['RA---MOL', 'DEC--MOL'];
    const k = 180 / Math.PI;
    const blob = buildImageFits({
      w: MW, h: MH,
      planes: [{
        values: mapValues.current,
        extra: [
          ['CTYPE1', ctype[0]], ['CTYPE2', ctype[1]], ['CRPIX1', MW / 2 + 0.5], ['CRPIX2', MH / 2 + 0.5],
          ['CRVAL1', 0.0], ['CRVAL2', 0.0], ['CDELT1', -(4 * SQ2 * k) / MW], ['CDELT2', (2 * SQ2 * k) / MH],
          ['BUNIT', 'MJy/sr'], ['WAVELEN', SPHEREX_WAVELENGTHS[lambda], 'um'],
          ['ORIGIN', 'SPHEREx DR1 HiPS Allsky (NASA/IPAC IRSA)'],
        ],
      }],
    });
    downloadBlob(blob, `spherex_dr1_allsky_${SPHEREX_WAVELENGTHS[lambda].toFixed(2)}um_${frameSys}.fits`);
    store.toast(L('Mapa de cobertura exportado (FITS Mollweide)', 'Coverage map exported (Mollweide FITS)'), 'download');
  };

  const sv = surveys();
  const cur = currentSurvey();
  const dr1Start = mjdToDate(SPHEREX_DR1_TMIN);
  const dr1End = mjdToDate(SPHEREX_DR1_TMAX);

  return (
    <div className="relative w-full overflow-hidden px-4 lg:px-8 py-6 space-y-6">
      <div className="pointer-events-none absolute -top-40 -left-20 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -right-20 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl" />

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 relative">
        <div>
          <div className="flex items-center gap-2 font-label text-xs tracking-widest text-secondary uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-secondary animate-ping" />
            SPHEREx All-Sky Spectral Archive // 2025–2027 Survey
          </div>
          <h1 className="font-headline font-bold text-2xl lg:text-3xl tracking-tight text-on-surface flex flex-wrap items-baseline gap-3">
            {L('Archivo de Épocas & Cobertura Global', 'Epoch Archive & Global Coverage')}
            <span className="font-label text-xs font-normal text-on-surface-variant px-2.5 py-0.5 rounded bg-surface-container-high">
              {L('4 SURVEYS SEMESTRALES • 102 BANDAS', '4 SEMI-ANNUAL SURVEYS • 102 BANDS')}
            </span>
          </h1>
          <p className="text-xs font-body text-on-surface-variant max-w-2xl mt-1">
            {L(
              'Mapa real del cielo completo a partir del mosaico SPHEREx DR1 (IRSA). Pasa el cursor para leer coordenadas y brillo superficial; haz clic para abrir un sector en el visor A/B.',
              'Real full-sky map built from the SPHEREx DR1 mosaic (IRSA). Hover to read coordinates and surface brightness; click to open a sector in the A/B viewer.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container rounded-lg font-label text-xs">
            <span className="text-on-surface-variant">{L('Coordenadas', 'Coordinates')}:</span>
            {[['ecliptic', L('Eclíptica', 'Ecliptic')], ['galactic', L('Galáctica', 'Galactic')], ['equatorial', L('Ecuatorial', 'Equatorial')]].map(([id, lab]) => (
              <button key={id} type="button" onClick={() => setFrameSys(id)} className={`px-2 py-0.5 rounded transition-all ${frameSys === id ? 'bg-secondary/20 text-secondary font-medium' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}>
                {lab}
              </button>
            ))}
          </div>
          <button type="button" onClick={exportFits} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 font-label text-xs font-semibold">
            <Icon name="download" className="text-sm" />
            {L('Exportar cobertura FITS', 'Export coverage FITS')}
          </button>
        </div>
      </div>

      <Explain icon="public" title={L('El cielo entero en una sola imagen', 'The whole sky in one picture')} steps={[L('Mueve el ratón por el mapa', 'Move the mouse over the map'), L('Haz clic en un cuadrado', 'Click a square'), L('Compara las fotos a la derecha', 'Compare the photos on the right')]}>
        {L(
          'Este óvalo es todo el cielo “aplanado”, como un mapa del mundo. La banda brillante es nuestra galaxia, la Vía Láctea. Los cuadrados marcan lugares interesantes, como nubes donde nacen estrellas.',
          'This oval is the whole sky “flattened”, like a world map. The bright band is our galaxy, the Milky Way. The squares mark interesting places, like clouds where stars are born.',
        )}
      </Explain>
      <Advanced>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative">
        <Kpi icon="public" tone="text-secondary" label={L('Área cartografiada', 'Mapped area')} value="41,253" unit={L('grados²', 'deg²')} sub={L('100% del cielo en DR1 (MOC)', '100% of the sky in DR1 (MOC)')} bar={1} barTone="secondary" />
        <Kpi icon="grain" tone="text-tertiary" label={L('Canales espectrales', 'Spectral channels')} value="102" unit="λ" sub="0.75 – 5.00 µm (R = 35–128)" bar={100 / 102} barTone="tertiary" />
        <Kpi icon="reorder" tone="text-secondary" label={L('Ventana DR1', 'DR1 window')} value={fmtMonth(dr1Start, lang)} unit={`→ ${fmtMonth(dr1End, lang)}`} sub={L('Surveys 1 y 2 publicados', 'Surveys 1 and 2 released')} />
        <Kpi icon="sync" tone="text-primary" label={L(`Progreso survey ${cur.k} (actual)`, `Survey ${cur.k} progress (current)`)} value={`${fmtNum(cur.progress * 100, 1)}%`} unit={L('completado', 'complete')} sub={`${L('Cierre', 'Ends')}: ${fmtDate(cur.end, lang)}`} bar={cur.progress} barTone="primary" valueCls="text-primary" />
      </div>
      </Advanced>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 relative">
        <div className="xl:col-span-8 flex flex-col rounded-xl bg-surface-container/80 backdrop-blur-lg p-5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2">
              <Icon name="explore" className="text-secondary text-lg" />
              <span className="font-headline font-semibold text-sm">{L('Proyección Mollweide · SPHEREx DR1', 'Mollweide projection · SPHEREx DR1')}</span>
              <span className="font-label text-[10px] px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">λ = {SPHEREX_WAVELENGTHS[lambda].toFixed(3)} µm</span>
              {loadingSky && <Spinner className="text-secondary text-sm" />}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 font-label text-xs">
              <button type="button" onClick={() => applyHighlight('nep')} className={`px-2.5 py-1 rounded transition-colors ${highlight === 'nep' ? 'bg-secondary/20 text-secondary' : 'bg-surface-container-high text-on-surface-variant hover:text-secondary'}`}>NEP</button>
              <button type="button" onClick={() => applyHighlight('sep')} className={`px-2.5 py-1 rounded transition-colors ${highlight === 'sep' ? 'bg-secondary/20 text-secondary' : 'bg-surface-container-high text-on-surface-variant hover:text-secondary'}`}>SEP</button>
              <button type="button" onClick={() => applyHighlight('gal')} className={`px-2.5 py-1 rounded transition-colors ${highlight === 'gal' ? 'bg-tertiary/20 text-tertiary' : 'bg-surface-container-high text-on-surface-variant hover:text-tertiary'}`}>{L('Plano galáctico', 'Galactic plane')}</button>
              <button type="button" onClick={() => setShowScan((s) => !s)} className={`px-2.5 py-1 rounded transition-colors ${showScan ? 'bg-primary/20 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>{L('Barrido actual', 'Current scan')}</button>
              <button type="button" onClick={() => setHighlight(null)} className="px-2 py-1 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface" title={L('Reiniciar vista', 'Reset view')}>
                <Icon name="refresh" className="text-xs" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 pb-3 font-label text-[11px] text-on-surface-variant">
            <span className="shrink-0">λ</span>
            <input type="range" min="0" max="101" value={lambda} onChange={(e) => setLambda(Number(e.target.value))} className="flex-1 accent-secondary" aria-label={L('Longitud de onda del mapa', 'Map wavelength')} />
            <select value={lambda} onChange={(e) => setLambda(Number(e.target.value))} className="bg-surface-container-high rounded px-2 py-1 text-on-surface focus:outline-none">
              {[1.0, 1.65, 2.2, 3.05, 3.3, 4.27, 4.6].map((l) => (
                <option key={l} value={nearestFrame(l)}>{l.toFixed(2)} µm</option>
              ))}
              {![1.0, 1.65, 2.2, 3.05, 3.3, 4.27, 4.6].map(nearestFrame).includes(lambda) && <option value={lambda}>{SPHEREX_WAVELENGTHS[lambda].toFixed(3)} µm</option>}
            </select>
          </div>

          <div className="relative w-full aspect-[2/1] rounded-lg bg-surface-container-lowest overflow-hidden cursor-crosshair" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick}>
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${MW} ${MH}`}>
              <ellipse cx={MW / 2} cy={MH / 2} rx={MW / 2 - 1} ry={MH / 2 - 1} fill="none" stroke="#5a5068" strokeDasharray="3 3" strokeWidth="1.2" />
              {overlay.lines.map((pts, i) => (
                <polyline key={i} points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#e8e0f0" strokeOpacity="0.12" strokeDasharray="2 4" strokeWidth="0.8" />
              ))}
              {frameSys !== 'galactic' && overlay.galPlane.map((s, i) => (
                <polyline key={`g${i}`} points={s.map((p) => p.join(',')).join(' ')} fill="none" stroke="#ffe04a" strokeWidth={highlight === 'gal' ? 3 : 1.2} strokeOpacity={highlight === 'gal' ? 0.9 : 0.5} />
              ))}
              {frameSys !== 'ecliptic' && overlay.ecliptic.map((s, i) => (
                <polyline key={`e${i}`} points={s.map((p) => p.join(',')).join(' ')} fill="none" stroke="#00ffcc" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="5 3" />
              ))}
              {showScan && overlay.scan.map((s, i) => (
                <polyline key={`s${i}`} points={s.map((p) => p.join(',')).join(' ')} fill="none" stroke="#ff2d78" strokeWidth="2.5" strokeDasharray="4 2" className="animate-pulse" />
              ))}
              {fieldsPx.map((f) => {
                const isPole = f.id === 'nep' || f.id === 'sep';
                const dim = highlight && !(highlight === f.id || (highlight === 'gal' && f.id === 'gc'));
                const active = sel?.id === f.id;
                const color = isPole ? '#00ffcc' : f.id === 'gc' ? '#ffe04a' : '#ff2d78';
                return (
                  <g key={f.id} opacity={dim ? 0.3 : 1}>
                    {active && <circle cx={f.p[0]} cy={f.p[1]} r="12" fill="none" stroke={color} strokeWidth="1.5" className="animate-ping" style={{ transformOrigin: `${f.p[0]}px ${f.p[1]}px` }} />}
                    <rect x={f.p[0] - 6} y={f.p[1] - 6} width="12" height="12" rx="2" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.5" />
                    <text x={f.p[0]} y={f.p[1] + 18} fill={color} fontFamily="Space Grotesk" fontSize="9" textAnchor="middle">{f.name.split(' (')[0]}</text>
                  </g>
                );
              })}
              {sel?.id === 'custom' && (() => {
                const p = projectEq(frameSys, sel.ra, sel.dec);
                return (
                  <g transform={`translate(${p[0]} ${p[1]})`}>
                    <line x1="-8" x2="8" stroke="#ff2d78" strokeWidth="1.5" />
                    <line y1="-8" y2="8" stroke="#ff2d78" strokeWidth="1.5" />
                    <circle r="10" fill="none" stroke="#ff2d78" strokeDasharray="2 2" />
                  </g>
                );
              })()}
              <text x={MW - 8} y={MH / 2 + 4} fill="#a098b0" fontFamily="Space Grotesk" fontSize="9" textAnchor="end">{frameSys === 'equatorial' ? '0h' : '0°'}</text>
              <text x={MW / 2 + 4} y="14" fill="#a098b0" fontFamily="Space Grotesk" fontSize="9">+90°</text>
              <text x={MW / 2 + 4} y={MH - 6} fill="#a098b0" fontFamily="Space Grotesk" fontSize="9">-90°</text>
              <text x="8" y={MH / 2 + 4} fill="#a098b0" fontFamily="Space Grotesk" fontSize="9">{frameSys === 'equatorial' ? '24h' : '360°'}</text>
            </svg>
            <div className="absolute bottom-3 left-4 bg-surface-container-high/90 backdrop-blur px-3 py-1.5 rounded font-label text-[11px] text-on-surface flex flex-wrap items-center gap-3 pointer-events-none">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                {hover ? (
                  <strong className="text-secondary font-semibold">RA {formatRA(hover.ra, 0)} / Dec {formatDec(hover.dec, 0)}</strong>
                ) : (
                  <span>{L('Barrido actual: λ☉ ± 90°', 'Current scan: λ☉ ± 90°')} (λ☉ = {fmtNum(overlay.sun, 1)}°)</span>
                )}
              </span>
              {hover && (
                <>
                  <span className="text-on-surface-variant">|</span>
                  <span className="text-on-surface-variant">l/b: <strong>{fmtNum(hover.gal[0], 1)}°, {fmtNum(hover.gal[1], 1)}°</strong></span>
                  <span className="text-on-surface-variant">|</span>
                  <span className="text-tertiary">{Number.isFinite(hover.v) ? `${fmtNum(hover.v, 2)} MJy/sr` : '—'}</span>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-label">
              <span className="text-on-surface-variant tracking-wider uppercase font-semibold">{L('Surveys semestrales (2025 – 2027)', 'Semi-annual surveys (2025 – 2027)')}</span>
              <span className="text-secondary font-semibold">{L(`Survey ${cur.k} en adquisición`, `Survey ${cur.k} in acquisition`)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              {sv.map((s) => (
                <div key={s.k} className={`p-2.5 rounded flex flex-col gap-1 ${s.status === 'active' ? 'bg-surface-container-high/90 ring-1 ring-primary/40' : s.status === 'planned' ? 'bg-surface-container-high/40 opacity-70' : 'bg-surface-container-high/60'}`}>
                  <div className="flex items-center justify-between text-[11px] font-label">
                    <span className={`font-semibold flex items-center gap-1 ${s.status === 'active' ? 'text-primary' : s.status === 'done' ? 'text-secondary' : 'text-on-surface-variant'}`}>
                      {s.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                      Survey {s.k}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] ${s.status === 'active' ? 'bg-primary/20 text-primary font-bold' : s.status === 'done' ? 'bg-secondary/15 text-secondary' : 'bg-surface-container text-on-surface-variant'}`}>
                      {s.status === 'done' ? (s.inDR1 ? 'DR1 ✓' : '100%') : s.status === 'active' ? `${fmtNum(s.progress * 100, 1)}%` : L('PROGRAMADO', 'SCHEDULED')}
                    </span>
                  </div>
                  <div className="text-[10px] text-on-surface-variant font-label">{fmtMonth(s.start, lang)} – {fmtMonth(s.end, lang)}</div>
                  <ProgressBar value={s.progress} tone={s.status === 'active' ? 'primary' : 'secondary'} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <ABPanel sel={sel} onAnalyze={() => navigate(sel.id === 'custom' ? `/spectra?ra=${sel.ra}&dec=${sel.dec}` : `/spectra?target=${sel.id}`)} onFits={() => navigate(`/explorer?ra=${sel.ra.toFixed(5)}&dec=${sel.dec.toFixed(5)}`)} />
      </div>

      <TilesList onSelect={(f) => setSel(f)} selected={sel} />
      <div className="flex flex-wrap gap-2 relative">
        <SourceBadge>SPHEREx DR1 HiPS Allsky · NASA/IPAC IRSA</SourceBadge>
        <SourceBadge>2MASS · AllWISE (IRSA)</SourceBadge>
      </div>
    </div>
  );
}

function Kpi({ icon, tone, label, value, unit, sub, bar, barTone, valueCls = 'text-on-surface' }) {
  return (
    <div className="p-4 rounded-xl bg-surface-container/70 backdrop-blur-md shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between font-label text-[11px] text-on-surface-variant uppercase">
        <span>{label}</span>
        <Icon name={icon} className={`${tone} text-base`} />
      </div>
      <div className="my-2">
        <div className={`font-headline font-bold text-2xl ${valueCls}`}>
          {value} <span className={`text-xs font-label font-normal ${tone}`}>{unit}</span>
        </div>
        <div className="font-label text-[10px] text-on-surface-variant">{sub}</div>
      </div>
      {bar != null && <ProgressBar value={bar} tone={barTone} />}
    </div>
  );
}

const AB_SURVEYS = [
  ['tmassK', '2MASS Ks (≈1999)'],
  ['wiseW1', 'AllWISE W1 (2010)'],
  ['spherex', 'SPHEREx DR1 (2025–26)'],
];

function ABPanel({ sel, onAnalyze, onFits }) {
  const { L, fmtNum } = useI18n();
  const [a, setA] = useState('tmassK');
  const [b, setB] = useState('spherex');
  const [mix, setMix] = useState(0.5);
  const [auto, setAuto] = useState(false);
  const [spec, setSpec] = useState(null);
  const fov = Math.min(1.0, sel.fov || 0.5) * 0.5;
  const frame = nearestFrame(3.3);
  const A = useCutout({ survey: a, ra: sel.ra, dec: sel.dec, fovDeg: fov, size: 256, frame });
  const B = useCutout({ survey: b, ra: sel.ra, dec: sel.dec, fovDeg: fov, size: 256, frame });

  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(() => setMix((m) => (m > 0.5 ? 0 : 1)), 600);
    return () => clearInterval(t);
  }, [auto]);

  useEffect(() => {
    let alive = true;
    setSpec(null);
    getSpherexSpectrum(sel.ra, sel.dec, { apertureArcsec: 40 }).then((s) => alive && setSpec(s));
    return () => {
      alive = false;
    };
  }, [sel.ra, sel.dec]);

  const dt = Math.abs(SURVEYS[b].epoch - SURVEYS[a].epoch) * 365.25;
  const valid = spec?.bands.filter((x) => !x.blank && Number.isFinite(x.surface)) || [];
  const vmin = Math.min(...valid.map((x) => x.surface));
  const vmax = Math.max(...valid.map((x) => x.surface));
  const path = valid.map((x, i) => `${i ? 'L' : 'M'} ${((x.lambda - 0.75) / 4.25) * 300},${36 - ((x.surface - vmin) / (vmax - vmin || 1)) * 32}`).join(' ');
  const pah = valid.reduce((best, x) => (Math.abs(x.lambda - 3.3) < Math.abs(best.lambda - 3.3) ? x : best), valid[0] || { lambda: 0 });

  return (
    <div className="xl:col-span-4 flex flex-col rounded-xl bg-surface-container/80 backdrop-blur-lg p-5 shadow-md justify-between gap-3">
      <div>
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Icon name="compare" className="text-primary text-xl" />
            <div>
              <h2 className="font-headline font-semibold text-sm">{L('Visor de calibración temporal', 'Temporal calibration viewer')}</h2>
              <span className="font-label text-[10px] text-on-surface-variant">{L('Variabilidad y movimiento propio', 'Variability and proper motion')}</span>
            </div>
          </div>
          <button type="button" onClick={() => setAuto((x) => !x)} className={`px-2 py-0.5 rounded text-[10px] font-label ${auto ? 'bg-secondary/20 text-secondary' : 'bg-surface-container-high text-on-surface-variant'}`}>
            A/B BLINK {auto ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="p-3 rounded-lg bg-surface-container-lowest/80 space-y-3 mb-3">
          <div className="flex items-center justify-between gap-3 text-xs font-label">
            <div className="flex-1">
              <label className="text-[10px] text-on-surface-variant block mb-1">{L('Referencia A', 'Reference A')}</label>
              <select value={a} onChange={(e) => setA(e.target.value)} className="w-full bg-surface-container-high text-on-surface text-xs py-1.5 px-2 rounded focus:outline-none focus:ring-1 focus:ring-secondary">
                {AB_SURVEYS.map(([id, lab]) => <option key={id} value={id}>{lab}</option>)}
              </select>
            </div>
            <Icon name="compare_arrows" className="text-on-surface-variant text-base pt-4" />
            <div className="flex-1">
              <label className="text-[10px] text-on-surface-variant block mb-1">{L('Cotejo B', 'Comparison B')}</label>
              <select value={b} onChange={(e) => setB(e.target.value)} className="w-full bg-surface-container-high text-on-surface text-xs py-1.5 px-2 rounded focus:outline-none focus:ring-1 focus:ring-primary">
                {AB_SURVEYS.map(([id, lab]) => <option key={id} value={id}>{lab}</option>)}
              </select>
            </div>
          </div>
          <div className="p-2.5 rounded bg-surface-container-high/50 flex flex-col gap-1 text-[11px] font-label">
            <div className="flex justify-between items-center">
              <span className="text-on-surface-variant">{L('Sector activo', 'Active sector')}:</span>
              <span className="font-semibold text-secondary truncate ml-2">{sel.name}</span>
            </div>
            <div className="flex justify-between items-center text-[10px] text-on-surface-variant">
              <span>{L('Coordenadas', 'Coordinates')}:</span>
              <span className="font-mono text-on-surface">{formatRA(sel.ra, 0)} / {formatDec(sel.dec, 0)}</span>
            </div>
            <div className="text-[10px] text-on-surface-variant">{L(sel.desc)}</div>
          </div>
        </div>
        <div className="relative w-full aspect-square rounded-lg bg-surface-container-lowest overflow-hidden shadow-inner">
          {A.img && <CutoutCanvas img={A.img} colormap="sky" stretch="auto" className="absolute inset-0 w-full h-full" />}
          {B.img && <CutoutCanvas img={B.img} colormap="neon" stretch="auto" className="absolute inset-0 w-full h-full transition-opacity duration-200" style={{ opacity: mix }} />}
          {(A.loading || B.loading) && <div className="absolute inset-0 flex items-center justify-center"><Spinner className="text-secondary text-2xl" /></div>}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full border border-dashed border-primary/60 animate-spin" style={{ animationDuration: '20s' }} />
            <div className="absolute w-2 h-2 rounded-full bg-primary" />
          </div>
          <div className="absolute top-2.5 left-2.5 px-2 py-1 rounded bg-surface/90 font-label text-[10px] text-secondary">{mix < 0.5 ? 'A' : 'B'} · {AB_SURVEYS.find(([id]) => id === (mix < 0.5 ? a : b))[1]}</div>
          <div className="absolute bottom-2.5 right-2.5 px-2 py-1 rounded bg-surface/90 font-label text-[10px] text-primary">Δt: {fmtNum(dt, 0)} {L('días', 'days')}</div>
        </div>
        <input type="range" min="0" max="1" step="0.01" value={mix} onChange={(e) => { setAuto(false); setMix(Number(e.target.value)); }} className="w-full accent-primary mt-2" aria-label="A/B" />
        <div className="mt-2 p-3 rounded-lg bg-surface-container-lowest/60">
          <div className="flex items-center justify-between text-[10px] font-label text-on-surface-variant mb-1">
            <span>{L('Firma espectral SPHEREx (102 canales, real)', 'SPHEREx spectral signature (102 channels, real)')}</span>
            <span className="text-tertiary">{spec ? `${fmtNum(vmin, 1)}–${fmtNum(vmax, 1)} MJy/sr` : <Spinner className="text-[12px]" />}</span>
          </div>
          <svg className="w-full h-10" viewBox="0 0 300 40" preserveAspectRatio="none">
            <line stroke="#302840" strokeDasharray="2 2" x1="0" x2="300" y1="20" y2="20" />
            {spec && <path d={path} fill="none" stroke="#00ffcc" strokeWidth="1.5" />}
            {spec && pah && <circle cx={((pah.lambda - 0.75) / 4.25) * 300} cy={36 - ((pah.surface - vmin) / (vmax - vmin || 1)) * 32} r="3" fill="#ff2d78" stroke="#fff" strokeWidth="1" />}
          </svg>
          <div className="flex justify-between text-[9px] font-label text-on-surface-variant mt-0.5">
            <span>0.75 µm</span>
            <span>3.3 µm (PAH)</span>
            <span>5.0 µm</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onAnalyze} className="flex-1 py-2 rounded-lg bg-surface-container-high hover:bg-secondary/20 hover:text-secondary text-xs font-label text-on-surface font-semibold flex items-center justify-center gap-1.5">
          <Icon name="filter_alt" className="text-sm" />
          {L('Analizar 102 bandas', 'Analyse 102 bands')}
        </button>
        <button type="button" onClick={onFits} className="py-2 px-3 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-label font-bold shadow-md flex items-center justify-center gap-1">
          <Icon name="open_in_new" className="text-sm" />
          {L('Visor FITS', 'FITS viewer')}
        </button>
      </div>
    </div>
  );
}

function TilesList({ onSelect, selected }) {
  const { L } = useI18n();
  const [q, setQ] = useState('');
  const list = FIELDS.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()) || formatRA(f.ra).includes(q) || L(f.desc).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="rounded-xl bg-surface-container/70 backdrop-blur-md p-5 shadow-sm space-y-4 relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-headline font-bold text-base text-on-surface flex items-center gap-2">
            <Icon name="star" className="text-tertiary text-lg" />
            {L('Teselas & sectores de calibración destacados', 'Featured tiles & calibration sectors')}
          </h2>
          <p className="font-body text-xs text-on-surface-variant">{L('Campos profundos y regiones con rasgos espectrales (hielos, PAH) clave para SPHEREx.', 'Deep fields and regions with spectral features (ices, PAHs) key for SPHEREx.')}</p>
        </div>
        <div className="relative">
          <Icon name="search" className="absolute left-2.5 top-2 text-on-surface-variant text-sm pointer-events-none" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="bg-surface-container-high text-xs font-label text-on-surface pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-secondary w-56 placeholder:text-on-surface-variant/60" placeholder={L('Filtrar tesela o coordenada…', 'Filter tile or coordinate…')} />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {list.map((f) => {
          const active = selected?.id === f.id;
          return (
            <button key={f.id} type="button" onClick={() => onSelect(f)} className={`p-4 rounded-xl text-left transition-all group flex flex-col justify-between gap-3 ${active ? 'bg-surface-container-high/90 ring-1 ring-primary/40' : 'bg-surface-container-high/60 hover:bg-surface-container-high'}`}>
              <div>
                <span className={`font-label text-[10px] font-semibold uppercase tracking-wider ${active ? 'text-primary' : 'text-secondary'}`}>{f.id.toUpperCase()}</span>
                <h3 className="font-headline font-bold text-sm text-on-surface group-hover:text-secondary transition-colors">{f.name}</h3>
              </div>
              <div className="font-label text-[11px] text-on-surface-variant space-y-1">
                <div className="flex justify-between"><span>RA/Dec:</span><span className="text-on-surface">{formatRA(f.ra, 0).slice(0, 7)} / {formatDec(f.dec, 0).slice(0, 8)}</span></div>
                <p className="text-[10px]">{L(f.desc)}</p>
              </div>
              <div className={`pt-1 flex items-center justify-between text-xs font-label font-medium ${active ? 'text-primary' : 'text-secondary'}`}>
                <span>{active ? L('Cargado', 'Loaded') : L('Cargar en visor', 'Load in viewer')}</span>
                <Icon name="arrow_forward" className="text-sm group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
