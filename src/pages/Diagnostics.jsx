import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { Icon, ProgressBar, SourceBadge, Spinner } from '../components/ui.jsx';
import { fetchCutout } from '../components/Sky.jsx';
import { SPHEREX_WAVELENGTHS, SPHEREX_BLANK_FRAMES } from '../lib/hips.js';
import { LVF_BANDS, frameInfo } from '../lib/spectrum.js';
import { FIELDS } from '../lib/targets.js';
import { formatDec, formatRA } from '../lib/coords.js';
import { downloadText } from '../lib/fits.js';

function stats(values, bytes) {
  const v = [];
  let sat = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (bytes[i] === 0 && values[i] === 0) continue; // no coverage
    v.push(values[i]);
    if (bytes[i] >= 252) sat += 1;
  }
  if (!v.length) return { coverage: 0, median: NaN, mad: NaN, sat: 0 };
  v.sort((a, b) => a - b);
  const median = v[Math.floor(v.length / 2)];
  const dev = v.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  return { coverage: v.length / values.length, median, mad: 1.4826 * dev[Math.floor(dev.length / 2)], sat: sat / v.length, p99: v[Math.floor(v.length * 0.99)] };
}

/** Per-channel statistics over a field, computed from the SPHEREx DR1 cube. */
async function runDiagnostics(field, onProgress) {
  const out = new Array(102);
  let done = 0;
  const queue = SPHEREX_WAVELENGTHS.map((_, i) => i);
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const i = queue.shift();
      if (SPHEREX_BLANK_FRAMES.includes(i)) {
        out[i] = { frame: i, blank: true, coverage: 0 };
      } else {
        const img = await fetchCutout({ survey: 'spherex', ra: field.ra, dec: field.dec, fovDeg: 0.5, size: 32, frame: i });
        out[i] = { frame: i, ...stats(img.values, img.bytes) };
      }
      done += 1;
      onProgress(done / 102);
    }
  }));
  return out.map((s) => ({ ...s, lambda: SPHEREX_WAVELENGTHS[s.frame], ...frameInfo(s.frame) }));
}

export default function Diagnostics() {
  const { L, fmtNum } = useI18n();
  const store = useStore();
  const [fieldId, setFieldId] = useState('nep');
  const field = FIELDS.find((f) => f.id === fieldId);
  const [res, setRes] = useState(null);
  const [progress, setProgress] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  useEffect(() => {
    let alive = true;
    setRes(null);
    setProgress(0);
    runDiagnostics(field, (p) => alive && setProgress(p)).then((r) => {
      if (!alive) return;
      setRes(r);
      store.notify({ es: `Diagnóstico espectral completado: ${field.name}`, en: `Spectral diagnostics finished: ${field.name}` }, 'vital_signs');
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldId, nonce]);

  const flagged = (b) => b.blank || b.coverage < 0.95 || b.sat > 0.02 || (b.mad > 0 && res && b.mad > 3 * medianMad(res));
  const rows = (res || []).filter((b) => !onlyFlagged || flagged(b));
  const perBand = useMemo(() => {
    if (!res) return null;
    return LVF_BANDS.map((lb) => {
      const ch = res.filter((b) => b.band === lb.band);
      const ok = ch.filter((b) => !b.blank);
      return {
        ...lb,
        channels: ch,
        coverage: ok.reduce((s, b) => s + b.coverage, 0) / Math.max(1, ch.length),
        noise: ok.reduce((s, b) => s + (b.mad || 0), 0) / Math.max(1, ok.length),
        level: ok.reduce((s, b) => s + (b.median || 0), 0) / Math.max(1, ok.length),
        nFlag: ch.filter(flagged).length,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res]);
  const maxNoise = perBand ? Math.max(...perBand.flatMap((b) => b.channels.map((c) => c.mad || 0))) || 1 : 1;
  const nFlagged = res ? res.filter(flagged).length : 0;

  const exportCsv = () => {
    if (!res) return;
    const lines = res.map((b) => [b.frame, b.band, b.channel, b.lambda, b.R, b.blank ? 1 : 0, b.coverage?.toFixed(3), b.median?.toFixed(4), b.mad?.toFixed(4), b.sat?.toFixed(4), flagged(b) ? 1 : 0].join(','));
    downloadText([`# field=${field.name} ra=${field.ra} dec=${field.dec} fov=0.5deg source=SPHEREx DR1 HiPS`, 'frame,band,channel,wavelength_um,R,blank,coverage,median_MJy_sr,noise_MAD_MJy_sr,saturated_frac,flagged', ...lines].join('\n'), `spherex_diagnostics_${field.id}.csv`, 'text/csv');
  };

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-label text-xs tracking-widest text-secondary uppercase mb-1">
            <Icon name="vital_signs" className="text-sm" /> {L('Control de calidad por canal', 'Per-channel quality control')}
          </div>
          <h1 className="font-headline font-bold text-2xl lg:text-3xl tracking-tight text-on-surface">{L('Diagnóstico Espectral', 'Spectral Diagnostics')}</h1>
          <p className="text-xs text-on-surface-variant max-w-2xl mt-1">
            {L(
              'Estadísticas reales de los 102 canales del cubo SPHEREx DR1 sobre un campo de 0.5°: nivel de fondo (mediana), ruido robusto (MAD), cobertura y saturación de la visualización.',
              'Real statistics for the 102 channels of the SPHEREx DR1 cube over a 0.5° field: background level (median), robust noise (MAD), coverage and visualisation saturation.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} className="bg-surface-container-high text-on-surface text-xs font-label px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-secondary">
            {FIELDS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="px-3 py-2 rounded-lg bg-primary/20 text-primary text-xs font-label font-semibold flex items-center gap-1.5">
            <Icon name="refresh" className="text-sm" /> {L('Re-ejecutar', 'Re-run')}
          </button>
          <button type="button" onClick={exportCsv} disabled={!res} className="px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-xs font-label flex items-center gap-1.5 disabled:opacity-40">
            <Icon name="download" className="text-sm text-secondary" /> CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label={L('Campo', 'Field')} value={field.name.split(' (')[0]} sub={`${formatRA(field.ra, 0)} ${formatDec(field.dec, 0)}`} icon="center_focus_strong" />
        <Kpi label={L('Canales con datos', 'Channels with data')} value={res ? `${res.filter((b) => !b.blank && b.coverage > 0).length}/102` : '…'} sub={L('2 dicroicos vacíos por diseño', '2 dichroic channels blank by design')} icon="grain" />
        <Kpi label={L('Canales marcados', 'Flagged channels')} value={res ? nFlagged : '…'} sub={L('vacío, cobertura <95%, saturación o ruido >3×', 'blank, coverage <95%, saturation or noise >3×')} icon="flag" tone="text-tertiary" />
        <Kpi label={L('Estado', 'Status')} value={res ? L('Completado', 'Complete') : `${Math.round(progress * 100)}%`} sub={res ? L('Resultados en caché de sesión', 'Results cached for the session') : L('Descargando teselas…', 'Downloading tiles…')} icon={res ? 'check_circle' : 'progress_activity'} tone={res ? 'text-secondary' : 'text-primary'} />
      </div>
      {!res && <ProgressBar value={progress} tone="primary" />}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(perBand || LVF_BANDS).map((b) => (
          <div key={b.band} className="rounded-xl bg-surface-container p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className={`font-label text-[10px] tracking-wider ${b.band <= 3 ? 'text-secondary' : b.band === 4 ? 'text-tertiary' : 'text-primary'}`}>LVF-{b.band} · {b.detector}</div>
                <div className="font-headline font-bold text-sm">{b.min.toFixed(2)}–{b.max.toFixed(2)} µm · R ≈ {b.R}</div>
              </div>
              {b.nFlag != null && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-label ${b.nFlag ? 'bg-tertiary/15 text-tertiary' : 'bg-secondary/15 text-secondary'}`}>
                  {b.nFlag ? `${b.nFlag} ${L('marcados', 'flagged')}` : 'OK'}
                </span>
              )}
            </div>
            <div className="flex items-end gap-0.5 h-20 bg-surface-container-lowest rounded p-1.5">
              {(b.channels || Array.from({ length: 17 })).map((c, i) => {
                const h = c ? (c.blank ? 0 : Math.max(0.04, (c.mad || 0) / maxNoise)) : 0.1;
                const bad = c && flagged(c);
                return (
                  <div key={i} className="flex-1 flex flex-col justify-end h-full" title={c ? `${c.lambda.toFixed(3)} µm · MAD ${fmtNum(c.mad, 3)} MJy/sr` : ''}>
                    <div className={`rounded-sm ${!c ? 'bg-surface-container-high animate-pulse' : c.blank ? 'bg-outline-variant' : bad ? 'bg-tertiary' : b.band <= 3 ? 'bg-secondary' : b.band === 4 ? 'bg-tertiary/70' : 'bg-primary'}`} style={{ height: `${(c?.blank ? 0.08 : h) * 100}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px] font-label">
              <Mini label={L('Fondo', 'Background')} value={b.level != null ? `${fmtNum(b.level, 2)}` : '…'} unit="MJy/sr" />
              <Mini label={L('Ruido MAD', 'MAD noise')} value={b.noise != null ? `${fmtNum(b.noise, 3)}` : '…'} unit="MJy/sr" />
              <Mini label={L('Cobertura', 'Coverage')} value={b.coverage != null ? `${fmtNum(b.coverage * 100, 1)}%` : '…'} />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-surface-container overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-surface-container-low">
          <h2 className="font-headline font-bold text-sm">{L('Tabla de 102 canales', '102-channel table')}</h2>
          <label className="flex items-center gap-2 text-xs font-label text-on-surface-variant">
            <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} className="accent-secondary" />
            {L('Solo canales marcados', 'Flagged channels only')}
          </label>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-xs font-label">
            <thead className="sticky top-0 bg-surface-container-high text-[10px] uppercase text-on-surface-variant">
              <tr>
                {['#', 'LVF', L('Canal', 'Channel'), 'λ (µm)', 'R', L('Cobertura', 'Coverage'), L('Mediana', 'Median'), 'MAD', L('Saturación', 'Saturation'), L('Estado', 'Status')].map((h) => (
                  <th key={h} className="text-left py-2 px-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!res && (
                <tr><td colSpan={10} className="py-6 text-center text-on-surface-variant"><Spinner className="text-secondary mr-2" />{L('Calculando…', 'Computing…')}</td></tr>
              )}
              {rows.map((b, i) => (
                <tr key={b.frame} className={i % 2 ? 'bg-surface-container-low/40' : ''}>
                  <td className="py-1.5 px-3 text-on-surface-variant">{b.frame + 1}</td>
                  <td className="py-1.5 px-3">{b.band}</td>
                  <td className="py-1.5 px-3">{b.channel}</td>
                  <td className="py-1.5 px-3 font-mono text-on-surface">{b.lambda.toFixed(3)}</td>
                  <td className="py-1.5 px-3">{b.R}</td>
                  <td className="py-1.5 px-3">{b.blank ? '—' : `${fmtNum(b.coverage * 100, 1)}%`}</td>
                  <td className="py-1.5 px-3 font-mono">{b.blank ? '—' : fmtNum(b.median, 3)}</td>
                  <td className="py-1.5 px-3 font-mono">{b.blank ? '—' : fmtNum(b.mad, 3)}</td>
                  <td className="py-1.5 px-3">{b.blank ? '—' : `${fmtNum(b.sat * 100, 1)}%`}</td>
                  <td className="py-1.5 px-3">
                    {b.blank ? <span className="text-on-surface-variant">{L('Dicroico (vacío)', 'Dichroic (blank)')}</span> : flagged(b) ? <span className="text-tertiary">⚑ {L('Revisar', 'Review')}</span> : <span className="text-secondary">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <SourceBadge>SPHEREx DR1 spectral cube HiPS — NASA/IPAC IRSA</SourceBadge>
    </div>
  );
}

function medianMad(res) {
  const v = res.filter((b) => !b.blank && b.mad > 0).map((b) => b.mad).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
}

function Kpi({ label, value, sub, icon, tone = 'text-secondary' }) {
  return (
    <div className="p-4 rounded-xl bg-surface-container flex flex-col justify-between">
      <div className="flex items-center justify-between font-label text-[11px] text-on-surface-variant uppercase">
        <span>{label}</span>
        <Icon name={icon} className={`${tone} text-base ${icon === 'progress_activity' ? 'animate-spin' : ''}`} />
      </div>
      <div className="font-headline font-bold text-xl text-on-surface my-1 truncate">{value}</div>
      <div className="font-label text-[10px] text-on-surface-variant">{sub}</div>
    </div>
  );
}

function Mini({ label, value, unit }) {
  return (
    <div className="bg-surface-container-low rounded p-1.5">
      <div className="text-on-surface-variant">{label}</div>
      <div className="text-on-surface font-semibold">{value} {unit && <span className="text-on-surface-variant font-normal">{unit}</span>}</div>
    </div>
  );
}
