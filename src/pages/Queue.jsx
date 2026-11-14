import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { Icon, ProgressBar, SourceBadge } from '../components/ui.jsx';
import { fetchCutout } from '../components/Sky.jsx';
import { ALL_TARGETS, findTarget } from '../lib/targets.js';
import { getSpherexSpectrum, getAllsky, sampleAllsky, spherexByteToMJy, SURVEYS, SPHEREX_WAVELENGTHS, nearestFrame } from '../lib/hips.js';
import { propagate, inverseMollweide } from '../lib/coords.js';
import { buildImageFits, buildTableFits, downloadBlob } from '../lib/fits.js';

const JOB_TYPES = {
  spectrum: { icon: 'query_stats', es: 'Extracción espectral (102 canales)', en: 'Spectral extraction (102 channels)' },
  cutout: { icon: 'filter_frames', es: 'Recorte FITS multiépoca', en: 'Multi-epoch FITS cut-out' },
  allsky: { icon: 'public', es: 'Mapa all-sky Mollweide (FITS)', en: 'All-sky Mollweide map (FITS)' },
  flat: { icon: 'blur_on', es: 'Campo plano / fondo por banda', en: 'Flat field / background per band' },
};

function targetPos(t) {
  return t.pmRA ? propagate(t.ra, t.dec, t.pmRA, t.pmDec, t.epoch0, SURVEYS.spherex.epoch) : [t.ra, t.dec];
}

function buildJob(type, targetId, lambda) {
  const t = findTarget(targetId);
  const [ra, dec] = targetPos(t);
  if (type === 'spectrum') {
    return {
      type, title: { es: `Espectro · ${t.name}`, en: `Spectrum · ${t.name}` },
      run: async (p) => {
        const s = await getSpherexSpectrum(ra, dec, { apertureArcsec: t.type === 'field' ? 40 : 15, onProgress: p });
        const blob = buildTableFits({
          columns: [
            { name: 'WAVELENGTH', unit: 'um', values: s.bands.map((b) => b.lambda) },
            { name: 'SURFACE', unit: 'MJy/sr', values: s.bands.map((b) => (b.blank ? NaN : b.surface)) },
            { name: 'NET', unit: 'MJy/sr', values: s.bands.map((b) => (b.blank ? NaN : b.net)) },
            { name: 'ERROR', unit: 'MJy/sr', values: s.bands.map((b) => (b.blank ? NaN : b.err)) },
          ],
          meta: [['OBJECT', t.name.slice(0, 60)], ['RA', ra, 'deg'], ['DEC', dec, 'deg']],
        });
        return { blob, filename: `spectrum_${t.id}.fits`, summary: `${s.bands.filter((b) => !b.blank).length} ch` };
      },
    };
  }
  if (type === 'cutout') {
    return {
      type, title: { es: `Recorte · ${t.name}`, en: `Cut-out · ${t.name}` },
      run: async (p) => {
        const list = [['tmassK', 0], ['wiseW1', 0], ['spherex', nearestFrame(lambda)]];
        const planes = [];
        for (let k = 0; k < list.length; k += 1) {
          const [sv, fr] = list[k];
          const img = await fetchCutout({ survey: sv, ra, dec, fovDeg: 0.2, size: 128, frame: fr });
          planes.push({ name: SURVEYS[sv].label.replace(/\s+/g, '_').toUpperCase(), values: img.values, extra: [['EPOCH', SURVEYS[sv].epoch]] });
          p((k + 1) / list.length);
        }
        const blob = buildImageFits({ w: 128, h: 128, planes, wcs: { ra, dec, scaleDeg: 0.2 / 128 }, meta: [['OBJECT', t.name.slice(0, 60)]] });
        return { blob, filename: `cutout_${t.id}.fits`, summary: '3 HDU' };
      },
    };
  }
  if (type === 'allsky') {
    const frame = nearestFrame(lambda);
    return {
      type, title: { es: `All-sky · ${SPHEREX_WAVELENGTHS[frame].toFixed(2)} µm`, en: `All-sky · ${SPHEREX_WAVELENGTHS[frame].toFixed(2)} µm` },
      run: async (p) => {
        const sky = await getAllsky(frame);
        if (!sky) throw new Error('Allsky not available');
        const W = 720;
        const H = 360;
        const vals = new Float32Array(W * H).fill(NaN);
        for (let j = 0; j < H; j += 1) {
          for (let i = 0; i < W; i += 1) {
            const inv = inverseMollweide(((i + 0.5 - W / 2) / (W / 2)) * 2 * Math.SQRT2, ((H / 2 - j - 0.5) / (H / 2)) * Math.SQRT2);
            if (!inv) continue;
            const v = sampleAllsky(sky, inv[0], inv[1]);
            if (v >= 0) vals[j * W + i] = spherexByteToMJy(v);
          }
          if (j % 30 === 0) {
            p(j / H);
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        const k = 180 / Math.PI;
        const blob = buildImageFits({
          w: W, h: H,
          planes: [{ values: vals, extra: [['CTYPE1', 'RA---MOL'], ['CTYPE2', 'DEC--MOL'], ['CRPIX1', W / 2 + 0.5], ['CRPIX2', H / 2 + 0.5], ['CRVAL1', 0.0], ['CRVAL2', 0.0], ['CDELT1', -(4 * Math.SQRT2 * k) / W], ['CDELT2', (2 * Math.SQRT2 * k) / H], ['BUNIT', 'MJy/sr'], ['WAVELEN', SPHEREX_WAVELENGTHS[frame], 'um']] }],
        });
        return { blob, filename: `allsky_${SPHEREX_WAVELENGTHS[frame].toFixed(2)}um.fits`, summary: `${W}×${H}` };
      },
    };
  }
  // flat: median background per band over a 1° field
  return {
    type, title: { es: `Fondo por banda · ${t.name}`, en: `Background per band · ${t.name}` },
    run: async (p) => {
      const med = [];
      for (let i = 0; i < 102; i += 1) {
        if (i === 50 || i === 51) {
          med.push(NaN);
        } else {
          const img = await fetchCutout({ survey: 'spherex', ra, dec, fovDeg: 1.0, size: 32, frame: i });
          const v = Array.from(img.values).filter((x) => x > 0).sort((a, b) => a - b);
          med.push(v.length ? v[Math.floor(v.length / 2)] : NaN);
        }
        p((i + 1) / 102);
      }
      const blob = buildTableFits({
        columns: [{ name: 'WAVELENGTH', unit: 'um', values: SPHEREX_WAVELENGTHS }, { name: 'BKG_MEDIAN', unit: 'MJy/sr', values: med }],
        meta: [['OBJECT', t.name.slice(0, 60)], ['FIELD', 1.0, 'deg']],
        extname: 'BACKGROUND',
      });
      return { blob, filename: `background_${t.id}.fits`, summary: '102 ch' };
    },
  };
}

export default function Queue() {
  const { L, lang, fmtNum } = useI18n();
  const store = useStore();
  const [type, setType] = useState('spectrum');
  const [targetId, setTargetId] = useState('orion');
  const [lambda, setLambda] = useState(3.3);
  const [filter, setFilter] = useState('all');

  const add = (ty = type, tid = targetId) => {
    store.enqueue(buildJob(ty, tid, lambda));
    store.toast(L('Trabajo añadido a la cola', 'Job added to the queue'), 'playlist_add');
  };
  const quickCal = () => {
    add('flat', 'nep');
    add('flat', 'sep');
    add('spectrum', 'nep');
    add('allsky', 'nep');
  };

  const jobs = store.jobs.filter((j) => filter === 'all' || j.status === filter);
  const counts = ['queued', 'running', 'done', 'error'].reduce((o, s) => ({ ...o, [s]: store.jobs.filter((j) => j.status === s).length }), {});

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-label text-xs tracking-widest text-secondary uppercase mb-1">
            <Icon name="tune" className="text-sm" /> {L('Procesamiento local de productos SPHEREx', 'Local processing of SPHEREx products')}
          </div>
          <h1 className="font-headline font-bold text-2xl lg:text-3xl tracking-tight text-on-surface">{L('Cola de Calibración', 'Calibration Queue')}</h1>
          <p className="text-xs text-on-surface-variant max-w-2xl mt-1">
            {L(
              'Encola trabajos que se ejecutan en tu navegador sobre datos reales de IRSA (uno a la vez, continúan aunque cambies de página). Al terminar, descarga el producto FITS.',
              'Queue jobs that run in your browser on real IRSA data (one at a time, they keep running while you browse). When done, download the FITS product.',
            )}
          </p>
        </div>
        <button type="button" onClick={quickCal} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label text-xs font-bold flex items-center gap-1.5 w-fit">
          <Icon name="bolt" className="text-sm" /> {L('Calibración rápida (NEP/SEP)', 'Quick calibration (NEP/SEP)')}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ['queued', 'hourglass_top', L('En cola', 'Queued'), 'text-on-surface-variant'],
          ['running', 'progress_activity', L('Ejecutando', 'Running'), 'text-primary'],
          ['done', 'task_alt', L('Completados', 'Completed'), 'text-secondary'],
          ['error', 'error', L('Errores', 'Errors'), 'text-error'],
        ].map(([k, icon, lab, tone]) => (
          <button key={k} type="button" onClick={() => setFilter(filter === k ? 'all' : k)} className={`p-4 rounded-xl text-left ${filter === k ? 'bg-surface-container-high ring-1 ring-secondary/40' : 'bg-surface-container'}`}>
            <div className="flex items-center justify-between font-label text-[11px] text-on-surface-variant uppercase">
              <span>{lab}</span>
              <Icon name={icon} className={`${tone} text-base ${k === 'running' && counts.running ? 'animate-spin' : ''}`} />
            </div>
            <div className="font-headline font-bold text-2xl mt-1">{counts[k]}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-4 rounded-xl bg-surface-container p-5 space-y-3 h-fit">
          <h2 className="font-headline font-bold text-sm flex items-center gap-2"><Icon name="playlist_add" className="text-secondary" /> {L('Nuevo trabajo', 'New job')}</h2>
          <label className="block text-[11px] font-label text-on-surface-variant uppercase tracking-wider">{L('Tipo', 'Type')}</label>
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(JOB_TYPES).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setType(k)} className={`flex items-center gap-2 p-2 rounded-lg text-xs font-label text-left ${type === k ? 'bg-surface-container-high ring-1 ring-secondary/50 text-secondary' : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'}`}>
                <Icon name={v.icon} className="text-base" /> {L(v.es, v.en)}
              </button>
            ))}
          </div>
          {type !== 'allsky' && (
            <>
              <label className="block text-[11px] font-label text-on-surface-variant uppercase tracking-wider">{L('Objetivo', 'Target')}</label>
              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="w-full bg-surface-container-high text-on-surface text-xs font-label px-2 py-2 rounded focus:outline-none">
                {ALL_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </>
          )}
          {(type === 'allsky' || type === 'cutout') && (
            <>
              <label className="block text-[11px] font-label text-on-surface-variant uppercase tracking-wider">λ SPHEREx: {SPHEREX_WAVELENGTHS[nearestFrame(lambda)].toFixed(3)} µm</label>
              <input type="range" min="0.75" max="5" step="0.01" value={lambda} onChange={(e) => setLambda(Number(e.target.value))} className="w-full accent-secondary" />
            </>
          )}
          <button type="button" onClick={() => add()} className="w-full py-2.5 rounded-lg bg-secondary text-on-secondary font-label font-bold text-xs flex items-center justify-center gap-1.5">
            <Icon name="add" className="text-base" /> {L('Añadir a la cola', 'Add to queue')}
          </button>
        </div>

        <div className="xl:col-span-8 rounded-xl bg-surface-container overflow-hidden">
          <div className="px-4 py-3 bg-surface-container-low flex items-center justify-between">
            <h2 className="font-headline font-bold text-sm">{L('Trabajos', 'Jobs')} ({jobs.length})</h2>
            <span className="text-[11px] font-label text-on-surface-variant">{L('Se conservan durante la sesión del navegador', 'Kept for the browser session')}</span>
          </div>
          {jobs.length === 0 ? (
            <div className="p-10 text-center text-xs font-label text-on-surface-variant">
              <Icon name="inbox" className="text-3xl block mx-auto mb-2" />
              {L('La cola está vacía. Añade un trabajo o lanza una calibración rápida.', 'The queue is empty. Add a job or launch a quick calibration.')}
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/40">
              {jobs.map((j) => (
                <div key={j.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={`p-2 rounded-lg bg-surface-container-high ${j.status === 'done' ? 'text-secondary' : j.status === 'error' ? 'text-error' : j.status === 'running' ? 'text-primary' : 'text-on-surface-variant'}`}>
                      <Icon name={JOB_TYPES[j.type].icon} className="text-lg" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-label text-sm text-on-surface font-semibold truncate">{L(j.title)}</div>
                      <div className="font-label text-[10px] text-on-surface-variant">
                        {new Date(j.created).toLocaleTimeString(lang === 'es' ? 'es-ES' : 'en-US')}
                        {j.finished && j.started ? ` · ${fmtNum((j.finished - j.started) / 1000, 1)} s` : ''}
                        {j.result?.summary ? ` · ${j.result.summary}` : ''}
                        {j.error ? <span className="text-error"> · {j.error}</span> : null}
                      </div>
                      {(j.status === 'running' || j.status === 'queued') && <ProgressBar value={j.progress} tone="primary" className="mt-1.5" />}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-label font-semibold ${j.status === 'done' ? 'bg-secondary/15 text-secondary' : j.status === 'error' ? 'bg-error-container text-error' : j.status === 'running' ? 'bg-primary/20 text-primary' : 'bg-surface-container-highest text-on-surface-variant'}`}>
                      {{ queued: L('En cola', 'Queued'), running: `${Math.round(j.progress * 100)}%`, done: L('Listo', 'Done'), error: 'Error' }[j.status]}
                    </span>
                    {j.status === 'done' && (
                      <button type="button" onClick={() => downloadBlob(j.result.blob, j.result.filename)} className="p-1.5 rounded-lg bg-secondary/15 text-secondary hover:bg-secondary/30" title={L('Descargar', 'Download')}>
                        <Icon name="download" className="text-base" />
                      </button>
                    )}
                    {j.status === 'error' && (
                      <button type="button" onClick={() => store.retryJob(j.id)} className="p-1.5 rounded-lg bg-surface-container-high text-on-surface hover:text-secondary" title={L('Reintentar', 'Retry')}>
                        <Icon name="replay" className="text-base" />
                      </button>
                    )}
                    {j.status !== 'running' && (
                      <button type="button" onClick={() => store.removeJob(j.id)} className="p-1.5 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-error" title={L('Quitar', 'Remove')}>
                        <Icon name="close" className="text-base" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <SourceBadge>SPHEREx DR1 · 2MASS · AllWISE — NASA/IPAC IRSA HiPS</SourceBadge>
    </div>
  );
}
