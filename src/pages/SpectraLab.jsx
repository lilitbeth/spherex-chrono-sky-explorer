import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { Explain, Icon, Modal, ProgressBar, SourceBadge, Spinner } from '../components/ui.jsx';
import { SkyThumb } from '../components/Sky.jsx';
import { getSpherexSpectrum, SPHEREX_WAVELENGTHS, SPHEREX_BLANK_FRAMES, SURVEYS } from '../lib/hips.js';
import { FEATURES, LVF_BANDS, fitSpectrum, bestTemperature, synthColor, integratedIntensity, frameInfo } from '../lib/spectrum.js';
import { ALL_TARGETS, findTarget, simbadUrl, vizierUrl } from '../lib/targets.js';
import { formatDec, formatRA, propagate } from '../lib/coords.js';
import { buildTableFits, downloadBlob, downloadText } from '../lib/fits.js';

const CW = 900;
const CH = 350;
const X0 = 60;
const X1 = 880;
const Y0 = 40;
const Y1 = 300;

const lamToX = (l) => X0 + ((l - 0.75) / (5.0 - 0.75)) * (X1 - X0);

export default function SpectraLab() {
  const { L, fmtNum } = useI18n();
  const store = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const target = useMemo(() => {
    const ra = parseFloat(params.get('ra'));
    const dec = parseFloat(params.get('dec'));
    if (Number.isFinite(ra) && Number.isFinite(dec)) return { id: 'custom', name: `${formatRA(ra, 0)} ${formatDec(dec, 0)}`, ra, dec, type: 'custom', desc: { es: 'Posición personalizada', en: 'Custom position' } };
    return findTarget(params.get('target')) || findTarget('rho-oph');
  }, [params]);

  // Position at the SPHEREx epoch (moving stars are propagated).
  const pos = useMemo(() => (target.pmRA ? propagate(target.ra, target.dec, target.pmRA, target.pmDec, target.epoch0, SURVEYS.spherex.epoch) : [target.ra, target.dec]), [target]);

  const isPoint = target.type === 'hpm' || target.type === 'bd';
  const [aperture, setAperture] = useState(isPoint ? 15 : 40);
  const [quantity, setQuantity] = useState(isPoint ? 'net' : 'surface');
  useEffect(() => {
    setAperture(isPoint ? 15 : 40);
    setQuantity(isPoint ? 'net' : 'surface');
  }, [isPoint, target.id]);

  const [spec, setSpec] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    setSpec(null);
    setError(null);
    setProgress(0);
    getSpherexSpectrum(pos[0], pos[1], { apertureArcsec: aperture, onProgress: (p) => alive && setProgress(p) })
      .then((s) => alive && setSpec(s))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [pos, aperture]);

  const bands = useMemo(() => (spec ? spec.bands.map((b) => ({ ...b, net: quantity === 'surface' ? b.surface : b.net })) : null), [spec, quantity]);

  const [showModel, setShowModel] = useState(true);
  const [showErr, setShowErr] = useState(true);
  const [withFeatures, setWithFeatures] = useState(true);
  const [T, setT] = useState(1200);
  const fit = useMemo(() => (bands ? fitSpectrum(bands, T, { withFeatures }) : null), [bands, T, withFeatures]);
  const autoFit = () => {
    if (!bands) return;
    const best = bestTemperature(bands, { withFeatures });
    if (best) {
      setT(best.T);
      store.toast(L(`Mejor ajuste: T = ${best.T} K (χ²ᵣ = ${best.chi2r.toFixed(2)})`, `Best fit: T = ${best.T} K (χ²ᵣ = ${best.chi2r.toFixed(2)})`), 'model_training');
    }
  };

  // Axis scaling
  const valid = (bands || []).filter((b) => !b.blank && Number.isFinite(b.net));
  const vmin = valid.length ? Math.min(0, ...valid.map((b) => b.net - (showErr ? b.err : 0))) : 0;
  const vmax = valid.length ? Math.max(...valid.map((b) => b.net + (showErr ? b.err : 0))) * 1.08 || 1 : 1;
  const yOf = (v) => Y1 - ((v - vmin) / (vmax - vmin)) * (Y1 - Y0);
  const obsPath = valid.map((b, i) => `${i ? 'L' : 'M'} ${lamToX(b.lambda).toFixed(1)},${yOf(b.net).toFixed(1)}`).join(' ');
  const areaPath = valid.length ? `${obsPath} L ${lamToX(valid[valid.length - 1].lambda)},${Y1} L ${lamToX(valid[0].lambda)},${Y1} Z` : '';
  const modelPath = fit
    ? Array.from({ length: 200 }, (_, k) => {
        const l = 0.75 + (k / 199) * 4.25;
        return `${k ? 'L' : 'M'} ${lamToX(l).toFixed(1)},${yOf(fit.evalAt(l)).toFixed(1)}`;
      }).join(' ')
    : '';

  const [cursor, setCursor] = useState(null);
  const onMove = (e) => {
    if (!valid.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * CW;
    const l = 0.75 + ((x - X0) / (X1 - X0)) * 4.25;
    const b = valid.reduce((best, c) => (Math.abs(c.lambda - l) < Math.abs(best.lambda - l) ? c : best), valid[0]);
    setCursor(b);
  };
  const feature = cursor && FEATURES.find((f) => Math.abs(f.lambda - cursor.lambda) < f.width * 1.5);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => vmin + f * (vmax - vmin));
  const xticks = [0.75, 1.2, 1.8, 2.5, 3.4, 4.3, 5.0];

  const exportCsv = () => {
    if (!spec) return;
    const head = 'frame,band,channel,wavelength_um,surface_MJy_sr,background_MJy_sr,net_MJy_sr,err_MJy_sr,saturated,blank,model_MJy_sr';
    const lines = spec.bands.map((b) => {
      const fi = frameInfo(b.frame);
      return [b.frame, fi.band, fi.channel, b.lambda, b.surface?.toFixed(4), b.background?.toFixed(4), (b.surface - b.background).toFixed(4), b.err?.toFixed(4), b.saturated, b.blank, fit ? fit.evalAt(b.lambda).toFixed(4) : ''].join(',');
    });
    downloadText([`# ${target.name} RA=${pos[0].toFixed(5)} Dec=${pos[1].toFixed(5)} aperture=${aperture}arcsec source=SPHEREx DR1 HiPS (IRSA)`, head, ...lines].join('\n'), `spherex_spectrum_${target.id}.csv`, 'text/csv');
    store.toast(L('CSV de 102 bandas descargado', '102-band CSV downloaded'), 'download');
  };
  const exportFits = () => {
    if (!spec) return;
    const blob = buildTableFits({
      columns: [
        { name: 'WAVELENGTH', unit: 'um', values: spec.bands.map((b) => b.lambda) },
        { name: 'SURFACE', unit: 'MJy/sr', values: spec.bands.map((b) => (b.blank ? NaN : b.surface)) },
        { name: 'BACKGROUND', unit: 'MJy/sr', values: spec.bands.map((b) => (b.blank ? NaN : b.background)) },
        { name: 'ERROR', unit: 'MJy/sr', values: spec.bands.map((b) => (b.blank ? NaN : b.err)) },
      ],
      meta: [['OBJECT', target.name.slice(0, 60)], ['RA', pos[0], 'deg'], ['DEC', pos[1], 'deg'], ['APERTURE', aperture, 'arcsec'], ['ORIGIN', 'SPHEREx DR1 HiPS (NASA/IPAC IRSA)']],
    });
    downloadBlob(blob, `spherex_spectrum_${target.id}.fits`);
    store.toast(L('FITS (BINTABLE) exportado', 'FITS (BINTABLE) exported'), 'sim_card_download');
  };

  const [matrix, setMatrix] = useState(false);
  const channels = [nearestIdx(0.98), nearestIdx(1.66), nearestIdx(2.15), nearestIdx(3.05), nearestIdx(4.27), nearestIdx(4.85)];

  const nValid = spec ? spec.bands.filter((b) => !b.blank).length : 0;
  const nSat = spec ? spec.bands.filter((b) => b.saturated).length : 0;
  const colorJK = bands ? synthColor(bands, [1.1, 1.4], [2.0, 2.3]) : NaN;
  const colorW = bands ? synthColor(bands, [3.0, 3.8], [4.4, 5.0]) : NaN;
  const intI = bands ? integratedIntensity(bands) : NaN;

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-6">
      <Explain icon="palette" title={L('Los colores que no podemos ver', 'The colours we cannot see')} steps={[L('Elige un objeto arriba', 'Pick an object above'), L('Toca o pasa el cursor por la línea', 'Tap or hover over the line'), L('Busca picos y valles', 'Look for peaks and dips')]}>
        {L(
          'Igual que un arcoíris separa la luz en colores, SPHEREx separa la luz infrarroja en 102 “colores”. La línea verde muestra cuánta luz llega en cada uno. Un valle en la franja amarilla “H₂O” significa que hay hielo de agua; un pico en “PAH” indica moléculas de carbono parecidas al hollín.',
          'Just as a rainbow splits light into colours, SPHEREx splits infrared light into 102 “colours”. The green line shows how much light arrives in each one. A dip in the yellow “H₂O” stripe means there is water ice; a peak at “PAH” points to soot-like carbon molecules.',
        )}
      </Explain>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-surface-container-low p-3 sm:p-4 rounded-xl shadow-lg relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-48 h-48 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-lg bg-surface-container-high text-secondary flex items-center justify-center shadow-inner">
            <Icon name="query_stats" className="text-2xl" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-label text-[10px] tracking-widest uppercase text-on-surface-variant">{L('Espectrofotometría multibanda', 'Multi-band spectrophotometry')}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-label font-semibold bg-secondary-container text-on-secondary-container">SPHEREx DR1 · IRSA</span>
            </div>
            <h1 className="text-xl font-headline font-bold text-on-surface tracking-tight flex flex-wrap items-center gap-3">
              {store.simple ? L('Colores invisibles', 'Invisible colours') : L('Laboratorio de Espectros & SED', 'Spectra & SED Lab')}
              <span className="text-xs font-label text-tertiary font-normal px-2 py-0.5 rounded bg-surface-container-high">
                {spec ? L(`${nValid} de 102 bandas con datos`, `${nValid} of 102 bands with data`) : L('Cargando bandas…', 'Loading bands…')}
              </span>
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-label text-on-surface-variant uppercase tracking-wider mb-1">{L('Objeto seleccionado', 'Selected object')}</span>
            <select
              value={target.type === 'custom' ? '' : target.id}
              onChange={(e) => setParams({ target: e.target.value })}
              className="bg-surface-container-high text-on-surface text-xs font-label font-medium pl-3 pr-8 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer max-w-[320px]"
            >
              {target.type === 'custom' && <option value="">{target.name}</option>}
              <optgroup label={L('Campos extendidos', 'Extended fields')}>
                {ALL_TARGETS.filter((t) => t.type === 'field').map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </optgroup>
              <optgroup label={L('Estrellas y enanas marrones', 'Stars and brown dwarfs')}>
                {ALL_TARGETS.filter((t) => t.type !== 'field').map((t) => <option key={t.id} value={t.id}>{t.name} [{t.spt}]</option>)}
              </optgroup>
            </select>
          </div>
          <button type="button" onClick={() => setShowModel((m) => !m)} className={`px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-xs font-label flex items-center gap-1.5 ${showModel ? 'text-secondary' : 'text-on-surface-variant'}`}>
            <Icon name="model_training" className="text-sm" />
            {L('Modelo', 'Model')}
          </button>
          <button type="button" onClick={() => setShowErr((m) => !m)} className={`px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-xs font-label flex items-center gap-1.5 ${showErr ? 'text-tertiary' : 'text-on-surface-variant'}`}>
            <Icon name="error" className="text-sm" />
            {L('Barras 1-σ', '1-σ bars')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 flex flex-col bg-surface-container p-3 sm:p-5 rounded-xl shadow-xl space-y-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-label">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_currentColor]" />
              <span className="text-on-surface font-semibold uppercase tracking-wider">{target.name}</span>
              <span className="text-on-surface-variant text-[11px] font-mono">RA: {formatRA(pos[0], 1)} | DEC: {formatDec(pos[1], 0)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-on-surface-variant">
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-secondary" /> {quantity === 'surface' ? L('Brillo superficial', 'Surface brightness') : L('Flujo neto (sin fondo)', 'Net (background-subtracted)')}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-primary" /> {L('Ajuste Planck', 'Planck fit')}{withFeatures ? ' + ' + L('rasgos', 'features') : ''}</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-tertiary/40" /> {L('Bandas moleculares', 'Molecular bands')}</span>
            </div>
          </div>

          <div className="relative w-full h-[320px] sm:h-[430px] bg-surface-container-lowest rounded-lg p-1 sm:p-2 overflow-hidden flex flex-col">
            <div className="hidden sm:grid grid-cols-6 gap-1 px-10 pt-1 pb-1 text-center">
              {LVF_BANDS.map((b) => (
                <div key={b.band} className={`bg-surface-container-high/50 py-0.5 rounded text-[9px] font-label ${b.band <= 3 ? 'text-secondary' : b.band === 4 ? 'text-tertiary' : 'text-primary'}`}>
                  LVF{b.band} ({b.min.toFixed(2)}-{b.max.toFixed(2)}µm)
                </div>
              ))}
            </div>
            <div className="relative flex-1 w-full">
              <svg className="w-full h-full" viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" onPointerMove={onMove} onPointerDown={onMove} onMouseLeave={() => setCursor(null)} style={{ touchAction: 'pan-y' }}>
                <defs>
                  <linearGradient id="spectrumGlow" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#00ffcc" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#00ffcc" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <g stroke="#a098b0" strokeOpacity="0.15" strokeDasharray="2,3" strokeWidth="0.8">
                  {ticks.map((v, i) => <line key={i} x1={X0} x2={X1} y1={yOf(v)} y2={yOf(v)} />)}
                  {xticks.map((l) => <line key={l} x1={lamToX(l)} x2={lamToX(l)} y1={30} y2={Y1} />)}
                </g>
                {FEATURES.map((f) => (
                  <g key={f.id}>
                    <rect x={lamToX(f.lambda - f.width)} y="30" width={lamToX(f.lambda + f.width) - lamToX(f.lambda - f.width)} height={Y1 - 30} fill={f.color} fillOpacity="0.08" />
                    <text x={lamToX(f.lambda)} y={f.id === 'pah' || f.id === 'co' ? 60 : 45} fill={f.color} fontFamily="Space Grotesk" fontSize="9" textAnchor="middle">{f.label}µm</text>
                  </g>
                ))}
                {SPHEREX_BLANK_FRAMES.map((i) => (
                  <line key={i} x1={lamToX(SPHEREX_WAVELENGTHS[i])} x2={lamToX(SPHEREX_WAVELENGTHS[i])} y1={30} y2={Y1} stroke="#5a5068" strokeDasharray="1 2" />
                ))}
                {showModel && fit && <path d={modelPath} fill="none" stroke="#ff2d78" strokeDasharray="4,3" strokeWidth="1.8" opacity="0.85" />}
                {areaPath && <path d={areaPath} fill="url(#spectrumGlow)" />}
                {obsPath && <path d={obsPath} fill="none" stroke="#00ffcc" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />}
                {showErr && (
                  <g stroke="#00ffcc" strokeWidth="1" opacity="0.65">
                    {valid.map((b) => (
                      <g key={b.frame}>
                        <line x1={lamToX(b.lambda)} x2={lamToX(b.lambda)} y1={yOf(b.net - b.err)} y2={yOf(b.net + b.err)} />
                        <circle cx={lamToX(b.lambda)} cy={yOf(b.net)} r={b.saturated ? 3 : 1.8} fill={b.saturated ? '#ffe04a' : '#00ffcc'} />
                      </g>
                    ))}
                  </g>
                )}
                {cursor && <line x1={lamToX(cursor.lambda)} x2={lamToX(cursor.lambda)} y1={30} y2={Y1} stroke="#e8e0f0" strokeOpacity="0.5" />}
                {ticks.map((v, i) => (
                  <text key={i} x="52" y={yOf(v) + 4} fill="#a098b0" fontFamily="Space Grotesk" fontSize="10" textAnchor="end">{v.toFixed(Math.abs(vmax) < 5 ? 2 : 1)}</text>
                ))}
                <text x="-170" y="16" transform="rotate(-90)" fill="#a098b0" fontFamily="Space Grotesk" fontSize="10" letterSpacing="1" textAnchor="middle">{quantity === 'surface' ? 'Iν (MJy/sr)' : 'ΔIν (MJy/sr)'}</text>
                {xticks.map((l) => (
                  <text key={l} x={lamToX(l)} y="322" fill="#a098b0" fontFamily="Space Grotesk" fontSize="10" textAnchor="middle">{l.toFixed(2)}</text>
                ))}
                <text x={(X0 + X1) / 2} y="342" fill="#a098b0" fontFamily="Space Grotesk" fontSize="11" letterSpacing="1" textAnchor="middle">{L('LONGITUD DE ONDA OBSERVADA λ (µm)', 'OBSERVED WAVELENGTH λ (µm)')}</text>
              </svg>
              {!spec && !error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 font-label text-xs text-on-surface-variant">
                  <Spinner className="text-secondary text-2xl" />
                  {L('Extrayendo 102 canales del cubo SPHEREx…', 'Extracting 102 channels from the SPHEREx cube…')} {Math.round(progress * 100)}%
                  <div className="w-48"><ProgressBar value={progress} /></div>
                </div>
              )}
              {error && <div className="absolute inset-0 flex items-center justify-center text-error text-xs font-label">{String(error.message || error)}</div>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-surface-container-high/60 rounded text-[11px] font-label text-on-surface-variant">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1">
                  <Icon name="adjust" className="text-xs text-secondary" /> {L('Cursor', 'Cursor')}:{' '}
                  <strong className="text-on-surface font-mono">{cursor ? `λ = ${cursor.lambda.toFixed(3)} µm${feature ? ` (${feature.label.split(' ')[0]})` : ''}` : '—'}</strong>
                </span>
                <span className="text-outline">|</span>
                <span>{L('Valor', 'Value')}: <strong className="text-secondary font-mono">{cursor ? `${fmtNum(cursor.net, 3)} ± ${fmtNum(cursor.err, 3)}` : '—'}</strong></span>
                <span className="text-outline">|</span>
                <span>S/N: <strong className="text-tertiary font-mono">{cursor && cursor.err > 0 ? fmtNum(Math.abs(cursor.net) / cursor.err, 1) : '—'}</strong></span>
              </div>
              <span className="text-[10px]">{cursor ? `LVF-${frameInfo(cursor.frame).band} · R ≈ ${frameInfo(cursor.frame).R}` : 'R = λ/Δλ ≈ 35–128'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between pt-2 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={exportCsv} disabled={!spec} className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-xs font-label text-on-surface flex items-center gap-1.5 disabled:opacity-40">
                <Icon name="download" className="text-xs text-secondary" />
                {L('Descargar CSV (102 bandas)', 'Download CSV (102 bands)')}
              </button>
              <button type="button" onClick={exportFits} disabled={!spec} className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-xs font-label text-on-surface flex items-center gap-1.5 disabled:opacity-40">
                <Icon name="sim_card_download" className="text-xs text-primary" />
                {L('Exportar FITS multiespectral', 'Export multispectral FITS')}
              </button>
              <div className="flex items-center gap-1 bg-surface-container-high rounded-lg p-0.5 text-[11px] font-label">
                {[['surface', L('Brillo sup.', 'Surface')], ['net', L('Neto', 'Net')]].map(([id, lab]) => (
                  <button key={id} type="button" onClick={() => setQuantity(id)} className={`px-2 py-1 rounded ${quantity === id ? 'bg-secondary/20 text-secondary' : 'text-on-surface-variant'}`}>{lab}</button>
                ))}
              </div>
              <label className="flex items-center gap-1 text-[11px] font-label text-on-surface-variant">
                {L('Apertura', 'Aperture')}
                <select value={aperture} onChange={(e) => setAperture(Number(e.target.value))} className="bg-surface-container-high rounded px-1.5 py-1 text-on-surface focus:outline-none">
                  {[10, 15, 20, 30, 40, 60, 90].map((a) => <option key={a} value={a}>{a}″</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-label text-on-surface-variant">{L('Consultar', 'Look up')}:</span>
              <a className="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-[11px] font-label text-secondary flex items-center gap-1" href={simbadUrl(pos[0], pos[1])} target="_blank" rel="noreferrer">SIMBAD <Icon name="open_in_new" className="text-xs" /></a>
              <a className="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-[11px] font-label text-secondary flex items-center gap-1" href={vizierUrl(pos[0], pos[1])} target="_blank" rel="noreferrer">VizieR CDS <Icon name="open_in_new" className="text-xs" /></a>
            </div>
          </div>
        </div>

        <div className="xl:col-span-4 flex flex-col space-y-4">
          <div className="bg-surface-container p-5 rounded-xl shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="thermostat" className="text-primary text-xl" />
                <h2 className="font-headline font-bold text-sm text-on-surface">{L('Ajuste astrofísico de SED', 'Astrophysical SED fit')}</h2>
              </div>
              <span className="font-label text-[10px] text-tertiary px-2 py-0.5 rounded bg-surface-container-high">χ² {L('reducido', 'reduced')}: {fit ? fit.chi2r.toFixed(2) : '—'}</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-label">
                <span className="text-on-surface-variant">{L('Temperatura del continuo (T)', 'Continuum temperature (T)')}:</span>
                <span className="font-mono font-bold text-primary text-sm">{T} K</span>
              </div>
              <input type="range" min="200" max="6000" step="20" value={T} onChange={(e) => setT(Number(e.target.value))} className="w-full accent-primary" aria-label="T" />
              <div className="flex justify-between text-[10px] font-mono text-on-surface-variant">
                <span>200 K ({L('polvo/Y', 'dust/Y')})</span>
                <span>1200 K (L/T)</span>
                <span>6000 K (G)</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[11px] font-label text-on-surface-variant uppercase tracking-wider">{L('Modelo de referencia', 'Reference model')}</span>
              <div className="grid grid-cols-2 gap-2">
                {[[false, L('Planck puro', 'Pure Planck')], [true, L('Planck + rasgos', 'Planck + features')]].map(([v, lab]) => (
                  <button key={String(v)} type="button" onClick={() => setWithFeatures(v)} className={`py-1.5 px-2.5 rounded-lg text-xs font-label font-medium text-left flex items-center justify-between ${withFeatures === v ? 'bg-surface-container-high text-secondary' : 'bg-surface-container-high/50 text-on-surface-variant hover:bg-surface-bright'}`}>
                    <span>{lab}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${withFeatures === v ? 'bg-secondary' : 'bg-surface-container-highest'}`} />
                  </button>
                ))}
              </div>
              <button type="button" onClick={autoFit} disabled={!bands} className="w-full py-1.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 text-xs font-label font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40">
                <Icon name="auto_fix_high" className="text-sm" /> {L('Ajuste automático de T', 'Auto-fit T')}
              </button>
            </div>
            <div className="p-3 bg-surface-container-low rounded-lg space-y-2 text-xs font-label">
              <span className="text-[10px] text-on-surface-variant uppercase tracking-wider block">{L('Amplitud relativa de rasgos (ajuste)', 'Relative feature amplitude (fit)')}</span>
              {FEATURES.map((f) => {
                const a = fit?.featureAmp?.[f.id];
                return (
                  <div key={f.id} className="flex justify-between items-center py-1 bg-surface-container/70 px-2 rounded">
                    <span className="text-on-surface-variant">{f.label} µm</span>
                    <span className={`font-mono font-semibold ${a == null ? 'text-on-surface-variant' : a < -0.02 ? 'text-tertiary' : a > 0.02 ? 'text-secondary' : 'text-on-surface'}`}>
                      {a == null || !withFeatures || Math.abs(a) > 5 ? '—' : `${a > 0 ? '+' : ''}${(a * 100).toFixed(1)}% ${a < -0.02 ? L('(absorción)', '(absorption)') : a > 0.02 ? L('(emisión)', '(emission)') : ''}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-surface-container p-5 rounded-xl shadow-xl space-y-3">
            <div className="flex items-center gap-2">
              <Icon name="palette" className="text-secondary text-xl" />
              <h2 className="font-headline font-bold text-sm text-on-surface">{L('Fotometría sintética & índices', 'Synthetic photometry & indices')}</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs font-label">
              <div className="bg-surface-container-low p-2.5 rounded-lg flex flex-col gap-0.5">
                <span className="text-[10px] text-on-surface-variant uppercase">SPHEREx [W1 − W2]</span>
                <span className="text-base font-bold font-mono text-secondary">{Number.isFinite(colorW) ? `${colorW >= 0 ? '+' : ''}${colorW.toFixed(2)} mag` : '—'}</span>
                <span className="text-[10px] text-on-surface-variant">3.0–3.8 / 4.4–5.0 µm (AB)</span>
              </div>
              <div className="bg-surface-container-low p-2.5 rounded-lg flex flex-col gap-0.5">
                <span className="text-[10px] text-on-surface-variant uppercase">SPHEREx [J − Ks]</span>
                <span className="text-base font-bold font-mono text-tertiary">{Number.isFinite(colorJK) ? `${colorJK >= 0 ? '+' : ''}${colorJK.toFixed(2)} mag` : '—'}</span>
                <span className="text-[10px] text-on-surface-variant">1.1–1.4 / 2.0–2.3 µm (AB)</span>
              </div>
            </div>
            <div className="bg-surface-container-high/40 p-2.5 rounded-lg flex items-center justify-between text-xs font-label">
              <div className="flex items-center gap-2">
                <Icon name="flare" className="text-sm text-secondary" />
                <span className="text-on-surface-variant">{L('Intensidad integrada 0.75–5 µm', 'Integrated intensity 0.75–5 µm')}:</span>
              </div>
              <span className="font-mono text-on-surface font-semibold">{Number.isFinite(intI) ? `${fmtNum(intI, 1)} nW m⁻² sr⁻¹` : '—'}</span>
            </div>
          </div>
          <div className="bg-surface-container-low p-4 rounded-xl flex items-center gap-3">
            <span className="p-2 rounded-lg bg-surface-container-high text-secondary flex items-center justify-center">
              <Icon name={nSat ? 'warning' : 'ac_unit'} className={`text-xl ${nSat ? 'text-tertiary' : ''}`} />
            </span>
            <div className="flex flex-col text-xs font-label">
              <span className="font-semibold text-on-surface">{nSat ? L(`${nSat} canales saturados en la visualización`, `${nSat} channels saturated in the visualisation`) : L('Muestreo sin saturación', 'Unsaturated sampling')}</span>
              <span className="text-[11px] text-on-surface-variant">
                {L(
                  `Píxel HiPS ${spec ? spec.pixelArcsec.toFixed(1) : '12.9'}″ (nativo 6.15″). Valores reconstruidos desde la escala asinh (corte 0–40 MJy/sr) del producto de visualización.`,
                  `HiPS pixel ${spec ? spec.pixelArcsec.toFixed(1) : '12.9'}″ (native 6.15″). Values reconstructed from the asinh scale (0–40 MJy/sr cut) of the visualisation product.`,
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-surface-container p-5 rounded-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="font-headline font-bold text-sm text-on-surface flex flex-wrap items-center gap-2">
            <span>{L('Recortes por arreglo detector', 'Cut-outs per detector array')}</span>
            <span className="text-xs font-label font-normal text-on-surface-variant">(6 H2RG HgCdTe · LVF 1–6)</span>
          </h2>
          <div className="flex items-center gap-2 text-xs font-label text-on-surface-variant">
            <span>{L('Mostrando 6 de 102 canales', 'Showing 6 of 102 channels')}</span>
            <button type="button" onClick={() => setMatrix(true)} className="text-secondary hover:underline flex items-center gap-0.5">
              {L('Ver matriz completa', 'View full matrix')} <Icon name="arrow_forward" className="text-xs" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {channels.map((fr) => {
            const fi = frameInfo(fr);
            const b = spec?.bands[fr];
            const color = fi.band <= 3 ? 'text-secondary' : fi.band === 4 ? 'text-tertiary' : 'text-primary';
            const feat = FEATURES.find((f) => Math.abs(f.lambda - fi.lambda) < f.width * 1.5);
            return (
              <div key={fr} className="bg-surface-container-low p-3 rounded-xl flex flex-col space-y-2 hover:bg-surface-container-high transition-colors">
                <div className="flex items-center justify-between text-[11px] font-label">
                  <span className={`font-bold ${color}`}>LVF{fi.band} • CH#{fr + 1}</span>
                  <span className="text-[10px] text-on-surface-variant font-mono">{fi.lambda.toFixed(2)} µm{feat ? ` [${feat.label.split(' ')[0]}]` : ''}</span>
                </div>
                <SkyThumb survey="spherex" ra={pos[0]} dec={pos[1]} fovDeg={isPoint ? 0.1 : 0.4} size={96} frame={fr} colormap={fi.band <= 3 ? 'sky' : fi.band === 4 ? 'magma' : 'neon'} className="w-full aspect-square rounded-lg">
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="w-4 h-4 border border-secondary/60 rounded-full" />
                  </span>
                </SkyThumb>
                <div className="flex justify-between items-center text-[10px] font-mono text-on-surface-variant">
                  <span>S/N: <strong className="text-on-surface">{b && b.err > 0 ? fmtNum(Math.abs(b[quantity === 'surface' ? 'surface' : 'net']) / b.err, 1) : '—'}</strong></span>
                  <span className={color}>{b ? `${fmtNum(quantity === 'surface' ? b.surface : b.net, 2)}` : '…'}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <SourceBadge>SPHEREx DR1 spectral cube HiPS — NASA/IPAC IRSA</SourceBadge>
          {target.type !== 'field' && target.type !== 'custom' && (
            <button type="button" onClick={() => navigate(`/explorer?target=${target.id}`)} className="text-[11px] font-label text-secondary hover:underline">{L('Ver en el comparador blink →', 'Open in blink comparator →')}</button>
          )}
        </div>
      </div>

      <Modal open={matrix} onClose={() => setMatrix(false)} title={L('Matriz completa de 102 canales SPHEREx', 'Full matrix of 102 SPHEREx channels')} wide>
        <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-12 lg:grid-cols-17 gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}>
          {SPHEREX_WAVELENGTHS.map((l, i) => (
            <div key={i} className="flex flex-col items-center">
              {SPHEREX_BLANK_FRAMES.includes(i) ? (
                <div className="w-full aspect-square rounded bg-surface-container-high/40 flex items-center justify-center text-[9px] text-on-surface-variant font-label">{L('vacío', 'blank')}</div>
              ) : (
                <SkyThumb survey="spherex" ra={pos[0]} dec={pos[1]} fovDeg={isPoint ? 0.1 : 0.4} size={48} frame={i} colormap="magma" className="w-full aspect-square rounded" />
              )}
              <span className="text-[9px] font-label text-on-surface-variant">{l.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function nearestIdx(l) {
  let best = 0;
  SPHEREX_WAVELENGTHS.forEach((w, i) => {
    if (!SPHEREX_BLANK_FRAMES.includes(i) && Math.abs(w - l) < Math.abs(SPHEREX_WAVELENGTHS[best] - l)) best = i;
  });
  return best;
}
