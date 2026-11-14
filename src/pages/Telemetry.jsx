import { useEffect, useMemo, useRef, useState } from 'react';
import * as satellite from 'satellite.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { Explain, Icon, SourceBadge, Spinner } from '../components/ui.jsx';
import { spherexOMM } from '../lib/nasa.js';
import { propagateAt } from '../lib/useOrbit.js';
import { sunPosition, dateToJD } from '../lib/orbit.js';
import { eclToEq } from '../lib/coords.js';

const MAPW = 1024;
const MAPH = 512;
const RE = 6378.137;

const LAYERS = {
  bluemarble: { es: 'Blue Marble (NASA)', en: 'Blue Marble (NASA)', layer: 'BlueMarble_NextGeneration' },
  viirs: { es: 'VIIRS color real (ayer)', en: 'VIIRS true colour (yesterday)', layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', daily: true },
};

function gibsUrl(key) {
  const l = LAYERS[key];
  const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${l.layer}${l.daily ? `&TIME=${y}` : ''}&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=${MAPW}&HEIGHT=${MAPH}&FORMAT=image/jpeg`;
}

/** Sub-solar point (lat, lon) in degrees. */
function subSolar(date) {
  const { lambda } = sunPosition(dateToJD(date));
  const [ra, dec] = eclToEq(lambda, 0);
  const gmst = (satellite.gstime(date) * 180) / Math.PI;
  let lon = ra - gmst;
  lon = ((lon + 540) % 360) - 180;
  return { lat: dec, lon, ra, dec };
}

function sunlit(eci, date) {
  const { ra, dec } = subSolar(date);
  const r = Math.PI / 180;
  const s = [Math.cos(dec * r) * Math.cos(ra * r), Math.cos(dec * r) * Math.sin(ra * r), Math.sin(dec * r)];
  const p = [eci.x, eci.y, eci.z];
  const dot = p[0] * s[0] + p[1] * s[1] + p[2] * s[2];
  if (dot > 0) return true;
  const perp = Math.sqrt(Math.max(0, p[0] ** 2 + p[1] ** 2 + p[2] ** 2 - dot * dot));
  return perp > RE;
}

const toXY = (lat, lon) => [((lon + 180) / 360) * MAPW, ((90 - lat) / 180) * MAPH];

export default function Telemetry() {
  const { L, lang, fmtNum } = useI18n();
  const [sat, setSat] = useState(null);
  const [layer, setLayer] = useState('bluemarble');
  const [warp, setWarp] = useState(1);
  const [paused, setPaused] = useState(false);
  const [simTime, setSimTime] = useState(() => new Date());
  const [history, setHistory] = useState([]);
  const [mapImg, setMapImg] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    spherexOMM().then(({ omm, live }) => setSat({ omm, live, satrec: satellite.twoline2satrec(omm.line1, omm.line2) }));
  }, []);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setMapImg(img);
    img.onerror = () => setMapImg(null);
    img.src = gibsUrl(layer);
  }, [layer]);

  useEffect(() => {
    if (paused) return undefined;
    const t = setInterval(() => setSimTime((d) => new Date(d.getTime() + 1000 * warp)), 1000);
    return () => clearInterval(t);
  }, [paused, warp]);

  const pos = sat ? propagateAt(sat.satrec, simTime) : null;
  useEffect(() => {
    if (pos) setHistory((h) => [...h.slice(-59), { t: simTime.getTime(), alt: pos.alt, speed: pos.speed }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simTime, sat]);

  const periodMin = sat ? 1440 / sat.omm.MEAN_MOTION : NaN;
  const track = useMemo(() => {
    if (!sat) return [];
    const pts = [];
    for (let m = -periodMin; m <= periodMin; m += 0.5) {
      const p = propagateAt(sat.satrec, new Date(simTime.getTime() + m * 60000));
      if (p) pts.push({ ...p, m });
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sat, Math.floor(simTime.getTime() / 30000)]);

  // Draw map + terminator + track.
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = MAPW;
    c.height = MAPH;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, MAPW, MAPH);
    if (mapImg) ctx.drawImage(mapImg, 0, 0, MAPW, MAPH);
    // Night shading: cos(zenith) < 0
    const ss = subSolar(simTime);
    const r = Math.PI / 180;
    const shade = ctx.createImageData(MAPW / 4, MAPH / 4);
    for (let j = 0; j < MAPH / 4; j += 1) {
      const lat = 90 - ((j + 0.5) / (MAPH / 4)) * 180;
      for (let i = 0; i < MAPW / 4; i += 1) {
        const lon = -180 + ((i + 0.5) / (MAPW / 4)) * 360;
        const cz = Math.sin(lat * r) * Math.sin(ss.lat * r) + Math.cos(lat * r) * Math.cos(ss.lat * r) * Math.cos((lon - ss.lon) * r);
        const a = cz < 0 ? Math.min(0.65, 0.25 + -cz * 1.2) : cz < 0.1 ? 0.25 * (1 - cz / 0.1) : 0;
        const k = (j * (MAPW / 4) + i) * 4;
        shade.data[k] = 5;
        shade.data[k + 1] = 5;
        shade.data[k + 2] = 20;
        shade.data[k + 3] = a * 255;
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = MAPW / 4;
    tmp.height = MAPH / 4;
    tmp.getContext('2d').putImageData(shade, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tmp, 0, 0, MAPW, MAPH);
    // graticule
    ctx.strokeStyle = 'rgba(232,224,240,0.12)';
    ctx.lineWidth = 1;
    for (let lon = -150; lon <= 150; lon += 30) {
      const [x] = toXY(0, lon);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, MAPH);
      ctx.stroke();
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const [, y] = toXY(lat, 0);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(MAPW, y);
      ctx.stroke();
    }
    // ground track
    const drawSeg = (pts, color, dash) => {
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = toXY(p.lat, p.lon);
        if (i === 0 || Math.abs(p.lon - pts[i - 1].lon) > 180) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawSeg(track.filter((p) => p.m <= 0), 'rgba(0,255,204,0.55)', []);
    drawSeg(track.filter((p) => p.m >= 0), 'rgba(255,45,120,0.9)', [6, 4]);
    // sun
    const [sx, sy] = toXY(ss.lat, ss.lon);
    ctx.fillStyle = '#ffe04a';
    ctx.beginPath();
    ctx.arc(sx, sy, 7, 0, Math.PI * 2);
    ctx.fill();
    if (pos) {
      const [x, y] = toXY(pos.lat, pos.lon);
      // footprint (horizon circle radius in degrees of arc)
      const rho = (Math.acos(RE / (RE + pos.alt)) * 180) / Math.PI;
      ctx.strokeStyle = 'rgba(56,189,248,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, (rho / 360) * MAPW / Math.max(0.2, Math.cos((pos.lat * Math.PI) / 180)), (rho / 180) * MAPH, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [mapImg, track, pos, simTime]);

  const lit = pos ? sunlit(pos.eci, simTime) : null;
  const tleAge = sat ? (simTime.getTime() - new Date(sat.omm.EPOCH).getTime()) / 86400000 : NaN;
  const revs = sat ? sat.omm.REV_AT_EPOCH + (simTime.getTime() - new Date(sat.omm.EPOCH).getTime()) / 60000 / periodMin : NaN;

  const spark = (key, color) => {
    if (history.length < 2) return null;
    const v = history.map((h) => h[key]);
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const d = v.map((x, i) => `${i ? 'L' : 'M'} ${(i / (v.length - 1)) * 200},${38 - ((x - lo) / (hi - lo || 1)) * 34}`).join(' ');
    return <svg viewBox="0 0 200 40" className="w-full h-10" preserveAspectRatio="none"><path d={d} fill="none" stroke={color} strokeWidth="1.5" /></svg>;
  };

  const legend = (
    <>
      <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-secondary" /> {L('Órbita previa', 'Previous orbit')}</span>
      <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary" /> {L('Próxima órbita', 'Next orbit')}</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-tertiary" /> {L('Punto subsolar', 'Sub-solar point')}</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky" /> SPHEREx</span>
    </>
  );
  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-label text-xs tracking-widest text-secondary uppercase mb-1">
            <span className={`w-2 h-2 rounded-full ${sat?.live === false ? 'bg-tertiary' : 'bg-secondary'} animate-pulse`} />
            {sat ? (sat.live ? L('TLE en vivo · CelesTrak · NORAD 63182', 'Live TLE · CelesTrak · NORAD 63182') : L('TLE de respaldo (sin conexión)', 'Fallback TLE (offline)')) : L('Cargando elementos orbitales…', 'Loading orbital elements…')}
          </div>
          <h1 className="font-headline font-bold text-2xl lg:text-3xl tracking-tight text-on-surface">{L('Telemetría Orbital & Métricas de Misión', 'Orbital Telemetry & Mission Metrics')}</h1>
          <p className="text-xs text-on-surface-variant max-w-2xl mt-1">
            {L(
              'Posición de SPHEREx propagada con SGP4 a partir de sus elementos orbitales públicos, sobre imágenes de la Tierra de NASA GIBS (Earthdata).',
              'SPHEREx position propagated with SGP4 from its public orbital elements, over Earth imagery from NASA GIBS (Earthdata).',
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-label text-xs">
          <button type="button" onClick={() => setPaused((p) => !p)} className="px-3 py-2 rounded-lg bg-surface-container-high text-on-surface flex items-center gap-1">
            <Icon name={paused ? 'play_arrow' : 'pause'} className="text-sm" /> {paused ? L('Reanudar', 'Resume') : L('Pausar', 'Pause')}
          </button>
          <div className="flex items-center gap-1 bg-surface-container-high rounded-lg p-0.5">
            {[1, 10, 60, 300].map((w) => (
              <button key={w} type="button" onClick={() => setWarp(w)} className={`px-2 py-1 rounded ${warp === w ? 'bg-secondary/20 text-secondary' : 'text-on-surface-variant'}`}>×{w}</button>
            ))}
          </div>
          <button type="button" onClick={() => { setSimTime(new Date()); setWarp(1); setHistory([]); }} className="px-3 py-2 rounded-lg bg-primary/20 text-primary flex items-center gap-1">
            <Icon name="schedule" className="text-sm" /> {L('Ahora', 'Now')}
          </button>
          <select value={layer} onChange={(e) => setLayer(e.target.value)} className="bg-surface-container-high text-on-surface px-2 py-2 rounded-lg focus:outline-none">
            {Object.entries(LAYERS).map(([k, v]) => <option key={k} value={k}>{L(v)}</option>)}
          </select>
        </div>
      </div>

      <Explain icon="travel_explore" title={L('¿Dónde está el telescopio ahora mismo?', 'Where is the telescope right now?')}>
        {L(
          'El punto azul es SPHEREx. Da una vuelta a la Tierra cada 98 minutos, a unos 650 km de altura, siempre en la frontera entre el día y la noche para que el Sol no le moleste. El punto amarillo marca dónde es mediodía.',
          'The blue dot is SPHEREx. It circles Earth every 98 minutes, about 650 km up, always along the line between day and night so the Sun does not get in its way. The yellow dot marks where it is noon.',
        )}
      </Explain>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 rounded-xl bg-surface-container p-4 space-y-3">
          <div className="relative w-full aspect-[2/1] rounded-lg overflow-hidden bg-surface-container-lowest">
            <canvas ref={canvasRef} className="w-full h-full" />
            {!sat && <div className="absolute inset-0 flex items-center justify-center"><Spinner className="text-secondary text-3xl" /></div>}
            <div className="hidden sm:flex absolute bottom-2 left-2 bg-surface-container-high/90 px-3 py-1.5 rounded font-label text-[11px] flex-wrap gap-3">{legend}</div>
            <div className="absolute top-2 right-2 bg-surface-container-high/90 px-3 py-1 rounded font-label text-[11px] text-on-surface">
              {simTime.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', { timeZone: 'UTC' })} UTC {warp > 1 && <span className="text-tertiary">· ×{warp}</span>}
            </div>
          </div>
          <div className="flex sm:hidden font-label text-[11px] flex-wrap gap-3">{legend}</div>
          <div className="flex flex-wrap gap-2">
            <SourceBadge>NASA GIBS · Earthdata (EOSDIS)</SourceBadge>
            <SourceBadge>CelesTrak GP · SGP4 (satellite.js)</SourceBadge>
          </div>
        </div>
        <div className="xl:col-span-4 space-y-4">
          <div className="rounded-xl bg-surface-container p-4 grid grid-cols-2 gap-2 font-label text-xs">
            <Tile label={L('Latitud', 'Latitude')} value={pos ? `${fmtNum(pos.lat, 2)}°` : '…'} />
            <Tile label={L('Longitud', 'Longitude')} value={pos ? `${fmtNum(pos.lon, 2)}°` : '…'} />
            <Tile label={L('Altitud', 'Altitude')} value={pos ? `${fmtNum(pos.alt, 1)} km` : '…'} cls="text-secondary" />
            <Tile label={L('Velocidad', 'Speed')} value={pos ? `${fmtNum(pos.speed, 3)} km/s` : '…'} cls="text-primary" />
            <Tile label={L('Periodo orbital', 'Orbital period')} value={sat ? `${fmtNum(periodMin, 2)} min` : '…'} />
            <Tile label={L('Órbitas/día', 'Orbits/day')} value={sat ? fmtNum(sat.omm.MEAN_MOTION, 3) : '…'} />
            <Tile label={L('Inclinación', 'Inclination')} value={sat ? `${fmtNum(sat.omm.INCLINATION, 3)}° (SSO)` : '…'} cls="text-tertiary" />
            <Tile label={L('Excentricidad', 'Eccentricity')} value={sat ? sat.omm.ECCENTRICITY.toFixed(5) : '…'} />
            <Tile label={L('Iluminación', 'Illumination')} value={lit == null ? '…' : lit ? L('Al sol', 'Sunlit') : L('Eclipse', 'Eclipse')} cls={lit ? 'text-tertiary' : 'text-on-surface-variant'} />
            <Tile label={L('Revolución nº', 'Revolution #')} value={sat ? fmtNum(Math.floor(revs)) : '…'} />
          </div>
          <div className="rounded-xl bg-surface-container p-4 space-y-3">
            <div>
              <div className="flex justify-between font-label text-[10px] text-on-surface-variant uppercase"><span>{L('Altitud (últimas muestras)', 'Altitude (recent samples)')}</span><span className="text-secondary">{pos ? `${fmtNum(pos.alt, 2)} km` : ''}</span></div>
              {spark('alt', '#00ffcc')}
            </div>
            <div>
              <div className="flex justify-between font-label text-[10px] text-on-surface-variant uppercase"><span>{L('Velocidad', 'Speed')}</span><span className="text-primary">{pos ? `${fmtNum(pos.speed, 4)} km/s` : ''}</span></div>
              {spark('speed', '#ff2d78')}
            </div>
          </div>
          <div className="rounded-xl bg-surface-container-low p-4 font-label text-[11px] text-on-surface-variant space-y-1">
            <div className="text-on-surface font-semibold flex items-center gap-1"><Icon name="description" className="text-sm text-secondary" /> TLE · {L('época', 'epoch')} {sat ? new Date(sat.omm.EPOCH).toISOString().slice(0, 19) : '…'}Z</div>
            <pre className="font-mono text-[10px] text-secondary bg-surface-container-lowest rounded p-2 overflow-x-auto">{sat ? `${sat.omm.line1}\n${sat.omm.line2}` : ''}</pre>
            <div>{L('Edad del TLE', 'TLE age')}: {fmtNum(tleAge, 2)} {L('días', 'days')} · {L('órbita heliosíncrona amanecer-anochecer', 'dawn–dusk sun-synchronous orbit')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, cls = 'text-on-surface' }) {
  return (
    <div className="bg-surface-container-high/60 rounded-lg p-2.5">
      <div className="text-[10px] text-on-surface-variant">{label}</div>
      <div className={`font-semibold mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}
