import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { ErrorNote, Icon, SourceBadge, Spinner } from '../components/ui.jsx';
import { SkyThumb, fetchCutout } from '../components/Sky.jsx';
import OrbitDiagram, { PMDiagram } from '../components/OrbitDiagram.jsx';
import { neoFeed, neoLookup } from '../lib/nasa.js';
import { elementsFromNeoWs, geocentricRADec, motionRate } from '../lib/orbit.js';
import { MOVING_TARGETS, totalPM, pmPA, simbadUrl } from '../lib/targets.js';
import { formatDec, formatRA, propagate } from '../lib/coords.js';
import { SURVEYS, nearestFrame } from '../lib/hips.js';
import { buildImageFits, downloadBlob, downloadText } from '../lib/fits.js';
import { isTyping, useAsync } from '../lib/hooks.js';

const PAGE = 8;

function starRow(t) {
  return {
    key: t.id, kind: t.type, name: t.name, target: t, ra: t.ra, dec: t.dec,
    motion: totalPM(t), pa: pmPA(t), mag: t.kmag, dist: t.dist,
    subEs: t.type === 'bd' ? `Enana marrón ${t.spt}` : `Estrella cercana ${t.spt}`,
    subEn: t.type === 'bd' ? `Brown dwarf ${t.spt}` : `Nearby star ${t.spt}`,
  };
}

function neoRow(o) {
  const ca = o.close_approach_data?.[0];
  const d = o.estimated_diameter?.meters;
  return {
    key: `neo-${o.id}`, kind: 'neo', neoId: o.id, name: o.name.replace(/[()]/g, ''), hazardous: o.is_potentially_hazardous_asteroid,
    sentry: o.is_sentry_object, H: o.absolute_magnitude_h, diam: d ? [d.estimated_diameter_min, d.estimated_diameter_max] : null,
    caDate: ca?.close_approach_date_full || ca?.close_approach_date, caEpoch: ca?.epoch_date_close_approach,
    missLD: ca ? Number(ca.miss_distance.lunar) : NaN, missKm: ca ? Number(ca.miss_distance.kilometers) : NaN,
    vRel: ca ? Number(ca.relative_velocity.kilometers_per_second) : NaN,
    subEs: o.is_potentially_hazardous_asteroid ? 'NEO potencialmente peligroso (PHA)' : 'Objeto cercano a la Tierra (NEO)',
    subEn: o.is_potentially_hazardous_asteroid ? 'Potentially hazardous NEO (PHA)' : 'Near-Earth object (NEO)',
  };
}

export default function Candidates() {
  const { L, lang, fmtNum } = useI18n();
  const store = useStore();
  const navigate = useNavigate();

  const today = useMemo(() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, []);
  const feed = useAsync((force) => neoFeed(today, new Date(today.getTime() + 6 * 86400000), { force }), [today]);

  const rows = useMemo(() => {
    const stars = MOVING_TARGETS.map(starRow);
    const neos = (feed.data?.list || []).map(neoRow);
    return [...neos, ...stars];
  }, [feed.data]);

  const [tab, setTab] = useState('all');
  const [minPM, setMinPM] = useState(0);
  const [maxLD, setMaxLD] = useState(Infinity);
  const [sortBy, setSortBy] = useState('motion');
  const [desc, setDesc] = useState(true);
  const [thumbSurvey, setThumbSurvey] = useState('spherex');
  const [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState(null);

  const counts = useMemo(() => ({
    all: rows.length,
    neo: rows.filter((r) => r.kind === 'neo').length,
    pha: rows.filter((r) => r.hazardous).length,
    hpm: rows.filter((r) => r.kind === 'hpm').length,
    bd: rows.filter((r) => r.kind === 'bd').length,
  }), [rows]);

  const filtered = useMemo(() => {
    const r = rows.filter((x) => {
      if (tab === 'neo' && x.kind !== 'neo') return false;
      if (tab === 'pha' && !x.hazardous) return false;
      if (tab === 'hpm' && x.kind !== 'hpm') return false;
      if (tab === 'bd' && x.kind !== 'bd') return false;
      if (x.kind !== 'neo' && x.motion < minPM) return false;
      if (x.kind === 'neo' && x.missLD > maxLD) return false;
      return true;
    });
    const key = {
      motion: (x) => (x.kind === 'neo' ? x.vRel * 100 : x.motion),
      miss: (x) => (x.kind === 'neo' ? x.missLD : 1e9),
      date: (x) => (x.kind === 'neo' ? x.caEpoch : 0),
      mag: (x) => (x.kind === 'neo' ? x.H : x.mag ?? 99),
      name: (x) => x.name,
    }[sortBy];
    return [...r].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      const c = typeof ka === 'string' ? ka.localeCompare(kb) : ka - kb;
      return desc ? -c : c;
    });
  }, [rows, tab, minPM, maxLD, sortBy, desc]);

  useEffect(() => setPage(0), [tab, minPM, maxLD, sortBy, desc]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const selected = rows.find((r) => r.key === selectedKey) || pageRows[0] || null;

  // NeoWs lookup for the selected NEO (orbital elements) — one API call, cached 72 h.
  const lookup = useAsync(() => (selected?.kind === 'neo' ? neoLookup(selected.neoId) : Promise.resolve(null)), [selected?.key]);
  const el = useMemo(() => elementsFromNeoWs(lookup.data?.orbital_data), [lookup.data]);
  const ephem = useMemo(() => {
    if (!el) return null;
    const now = new Date();
    return { ...geocentricRADec(el, now), ...motionRate(el, now) };
  }, [el]);

  const select = (r, quiet) => {
    setSelectedKey(r.key);
    if (!quiet) store.toast(`${L('Seleccionado', 'Selected')}: ${r.name}`, 'pageview');
  };

  const voteFor = (r, v) => {
    store.vote(r.key, v);
    store.addClassification({
      targetId: r.key, targetName: r.name, cls: v === 'real' ? (r.kind === 'neo' ? 'solar' : 'pm') : 'artifact',
      truth: r.kind === 'neo' ? 'solar' : 'pm', source: 'candidates',
    });
    store.toast(
      v === 'real' ? L('Confirmado como objeto real', 'Confirmed as real object') : L('Marcado como artefacto', 'Marked as artefact'),
      v === 'real' ? 'verified' : 'cancel',
      v === 'real' ? 'secondary' : 'error',
    );
  };

  // Keyboard shortcuts: 1 = real, 2 = artefact, space = next.
  useEffect(() => {
    const onKey = (e) => {
      if (isTyping(e) || !selected) return;
      if (e.key === '1') voteFor(selected, 'real');
      else if (e.key === '2') voteFor(selected, 'artifact');
      else if (e.code === 'Space') {
        e.preventDefault();
        const idx = filtered.findIndex((r) => r.key === selected.key);
        const n = (idx + 1) % filtered.length;
        if (filtered[n]) {
          select(filtered[n], true);
          setPage(Math.floor(n / PAGE));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const exportCsv = () => {
    const head = 'id,name,kind,ra_deg,dec_deg,pm_mas_yr,pa_deg,ks_mag,dist_pc,H_mag,close_approach,miss_LD,v_rel_km_s,hazardous,your_vote';
    const lines = filtered.map((r) => [
      r.key, `"${r.name}"`, r.kind, r.ra?.toFixed(6) ?? '', r.dec?.toFixed(6) ?? '', r.motion?.toFixed(1) ?? '', r.pa?.toFixed(1) ?? '',
      r.mag ?? '', r.dist ?? '', r.H ?? '', r.caDate ?? '', Number.isFinite(r.missLD) ? r.missLD.toFixed(2) : '',
      Number.isFinite(r.vRel) ? r.vRel.toFixed(3) : '', r.hazardous ?? '', store.votes[r.key] || '',
    ].join(','));
    downloadText([head, ...lines].join('\n'), 'spherex_motion_candidates.csv', 'text/csv');
    store.toast(L('CSV exportado', 'CSV exported'), 'table');
  };

  const [batching, setBatching] = useState(false);
  const batchFits = async () => {
    const stars = filtered.filter((r) => r.kind !== 'neo');
    if (!stars.length) {
      store.toast(L('No hay objetos estelares en el filtro', 'No stellar objects in the filter'), 'info', 'error');
      return;
    }
    setBatching(true);
    try {
      const planes = [];
      for (const r of stars) {
        const [ra, dec] = propagate(r.ra, r.dec, r.target.pmRA, r.target.pmDec, r.target.epoch0, SURVEYS.spherex.epoch);
        const img = await fetchCutout({ survey: 'spherex', ra, dec, fovDeg: 0.1, size: 64, frame: nearestFrame(2.15) });
        planes.push({ name: r.key.toUpperCase().slice(0, 16), values: img.values, extra: [['OBJECT', r.name.slice(0, 60)], ['OBJ_RA', ra, 'deg'], ['OBJ_DEC', dec, 'deg'], ['BUNIT', 'MJy/sr']] });
      }
      downloadBlob(buildImageFits({ w: 64, h: 64, planes, meta: [['ORIGIN', 'NASA/IPAC IRSA SPHEREx DR1 HiPS'], ['WAVELEN', 2.139, 'um']] }), 'spherex_candidates_batch.fits');
      store.toast(L(`Lote FITS con ${planes.length} recortes`, `FITS batch with ${planes.length} stamps`), 'download');
    } finally {
      setBatching(false);
    }
  };

  const downloadRow = async (r) => {
    try {
      if (r.kind === 'neo') {
        const data = await neoLookup(r.neoId);
        downloadText(JSON.stringify(data, null, 2), `neows_${r.neoId}.json`, 'application/json');
        return;
      }
      const t = r.target;
      const planes = [];
      for (const [sv, label] of [['tmassK', '2MASS_KS'], ['wiseW1', 'ALLWISE_W1'], ['spherex', 'SPHEREX']]) {
        const [ra, dec] = propagate(t.ra, t.dec, t.pmRA, t.pmDec, t.epoch0, SURVEYS[sv].epoch);
        const img = await fetchCutout({ survey: sv, ra, dec, fovDeg: 0.1, size: 96, frame: nearestFrame(2.15) });
        planes.push({ name: label, values: img.values, extra: [['OBJ_RA', ra, 'deg'], ['OBJ_DEC', dec, 'deg'], ['EPOCH', SURVEYS[sv].epoch]] });
      }
      downloadBlob(buildImageFits({ w: 96, h: 96, planes, meta: [['OBJECT', t.name.slice(0, 60)]] }), `${t.id}_triptych.fits`);
    } catch (e) {
      store.toast(String(e.message || e), 'error', 'error');
    }
  };

  const validatedToday = store.classifications.filter((c) => new Date(c.time).toDateString() === new Date().toDateString()).length;
  const judged = store.classifications.filter((c) => c.truth && !c.doubtful);
  const agreement = judged.length ? judged.filter((c) => c.cls === c.truth).length / judged.length : null;

  const tabs = [
    ['all', null, L('Todos los candidatos', 'All candidates'), counts.all],
    ['neo', 'near_me', L('NEO / Cercanos', 'NEO / Near-Earth'), counts.neo],
    ['pha', 'warning', L('Potencialmente peligrosos', 'Potentially hazardous'), counts.pha],
    ['hpm', 'flare', L('Estrellas de alto µ', 'High-µ stars'), counts.hpm],
    ['bd', 'ac_unit', L('Enanas marrones T/Y', 'T/Y brown dwarfs'), counts.bd],
  ];

  return (
    <div className="flex flex-col w-full">
      <div className="px-4 lg:px-8 py-6 w-full bg-surface-container-lowest/80">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-secondary shadow-[0_0_10px_#00ffcc] animate-pulse" />
              <span className="text-[11px] font-label tracking-widest text-secondary uppercase font-semibold">
                {L('Datos en vivo · NASA NeoWs + catálogo de movimiento propio', 'Live data · NASA NeoWs + proper-motion catalogue')}
              </span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-headline font-bold text-on-surface tracking-tight flex flex-wrap items-center gap-3">
              {L('Candidatos de Movimiento & Cola de Validación', 'Motion Candidates & Validation Queue')}
              <span className="text-xs px-2.5 py-0.5 rounded-full font-label font-medium bg-secondary-container/80 text-secondary">
                {today.toISOString().slice(0, 10)} → +7 {L('días', 'days')}
              </span>
            </h1>
            <p className="text-xs font-body text-on-surface-variant max-w-2xl">
              {L(
                'Asteroides que se acercan a la Tierra esta semana (NASA NeoWs) y estrellas/enanas marrones de alto movimiento propio verificables con 2MASS, AllWISE y SPHEREx.',
                'Asteroids approaching Earth this week (NASA NeoWs) plus high proper-motion stars / brown dwarfs you can verify with 2MASS, AllWISE and SPHEREx.',
              )}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 w-full lg:w-auto">
            <Ticker icon="hourglass_top" tone="text-secondary" label={L('NEOs esta semana', 'NEOs this week')} value={feed.data ? fmtNum(feed.data.count) : feed.loading ? '…' : '—'} sub={`${fmtNum(counts.pha)} PHA`} />
            <Ticker icon="verified" tone="text-primary" label={L('Validados hoy', 'Validated today')} value={fmtNum(validatedToday)} sub={L(`${store.classifications.length} en total`, `${store.classifications.length} in total`)} />
            <Ticker icon="neurology" tone="text-tertiary" label={L('Concordancia', 'Agreement')} value={agreement == null ? '—' : `${fmtNum(agreement * 100, 1)}%`} sub={L('vs. catálogo', 'vs. catalogue')} valueCls="text-tertiary" />
          </div>
        </div>
      </div>

      <div className="px-4 lg:px-8 py-6 w-full flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 w-full space-y-4 min-w-0">
          <ErrorNote error={feed.error} onRetry={feed.reload} />
          <div className="bg-surface-container/90 rounded-xl p-4 shadow-md space-y-3">
            <div className="flex items-center justify-between gap-4 flex-wrap bg-surface-container-low/50 p-2 rounded-lg">
              <div className="flex items-center gap-1.5 flex-wrap">
                {tabs.map(([id, icon, label, n]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-label flex items-center gap-1.5 transition-all ${tab === id ? 'bg-primary text-on-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'}`}
                  >
                    {icon && <Icon name={icon} className="text-xs" />}
                    <span>{label}</span>
                    <span className={`text-[10px] px-1.5 rounded-full ${tab === id ? 'bg-on-primary/20' : 'text-on-surface-variant/70'}`}>{n}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setDesc((d) => !d)} className="text-xs font-label text-secondary flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high">
                  <Icon name={desc ? 'arrow_downward' : 'arrow_upward'} className="text-sm" /> {L('Re-ordenar', 'Re-sort')}
                </button>
                <button type="button" onClick={exportCsv} className="text-xs font-label text-on-surface-variant hover:text-on-surface flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high">
                  <Icon name="table" className="text-sm" /> CSV
                </button>
                <button type="button" onClick={batchFits} disabled={batching} className="text-xs font-label text-on-surface-variant hover:text-on-surface flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high">
                  {batching ? <Spinner className="text-sm" /> : <Icon name="download" className="text-sm" />} {L('Lote FITS', 'FITS batch')}
                </button>
                <button type="button" onClick={() => feed.reload()} className="text-xs font-label text-on-surface-variant hover:text-on-surface flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-high" title={L('Volver a consultar NeoWs', 'Query NeoWs again')}>
                  <Icon name="refresh" className="text-sm" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="bg-surface-container-high/60 p-2.5 rounded-lg flex flex-col justify-between">
                <div className="flex justify-between items-center text-[10px] font-label text-on-surface-variant mb-1">
                  <span>{L('µ MÍNIMO (ESTRELLAS)', 'MIN µ (STARS)')}</span>
                  <span className="text-secondary font-semibold">&gt; {fmtNum(minPM)} mas/{L('año', 'yr')}</span>
                </div>
                <input type="range" min="0" max="8000" step="100" value={minPM} onChange={(e) => setMinPM(Number(e.target.value))} className="w-full accent-secondary" />
                <div className="flex justify-between text-[9px] font-label text-on-surface-variant/70 mt-1">
                  <span>0</span>
                  <span>8″/{L('año', 'yr')}</span>
                </div>
              </div>
              <div className="bg-surface-container-high/60 p-2.5 rounded-lg flex flex-col justify-between">
                <div className="flex justify-between items-center text-[10px] font-label text-on-surface-variant mb-1">
                  <span>{L('MINIATURAS', 'THUMBNAILS')}</span>
                  <span className="text-tertiary font-semibold">{thumbSurvey === 'spherex' ? L('Por época', 'Per epoch') : SURVEYS[thumbSurvey].label}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-label">
                  {[['spherex', L('Por época', 'Per epoch')], ['tmassK', '2MASS'], ['wiseW1', 'WISE']].map(([id, lab]) => (
                    <button key={id} type="button" onClick={() => setThumbSurvey(id)} className={`px-2 py-0.5 rounded ${thumbSurvey === id ? 'bg-surface-container-highest text-secondary' : 'text-on-surface-variant hover:text-on-surface'}`}>
                      {lab}
                    </button>
                  ))}
                </div>
                <div className="text-[9px] font-label text-on-surface-variant/70 mt-1">2MASS → AllWISE → SPHEREx 2.14 µm</div>
              </div>
              <div className="bg-surface-container-high/60 p-2.5 rounded-lg flex flex-col justify-between">
                <div className="flex justify-between items-center text-[10px] font-label text-on-surface-variant mb-1">
                  <span>{L('DISTANCIA DE PASO NEO', 'NEO MISS DISTANCE')}</span>
                  <span className="text-primary font-semibold">{Number.isFinite(maxLD) ? `≤ ${maxLD} LD` : L('Todas', 'All')}</span>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {[Infinity, 20, 10, 5].map((v) => (
                    <button key={String(v)} type="button" onClick={() => setMaxLD(v)} className={`py-1 text-[10px] font-label rounded text-center ${maxLD === v ? 'bg-primary-container/80 text-on-primary-container font-semibold' : 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface'}`}>
                      {Number.isFinite(v) ? `${v} LD` : L('Todas', 'All')}
                    </button>
                  ))}
                </div>
                <div className="text-[9px] font-label text-on-surface-variant/70 mt-1">1 LD = 384 400 km</div>
              </div>
              <div className="bg-surface-container-high/60 p-2.5 rounded-lg flex flex-col justify-between">
                <div className="text-[10px] font-label text-on-surface-variant mb-1">{L('PRIORIDAD DE COLA', 'QUEUE PRIORITY')}</div>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full bg-surface-container-highest text-on-surface text-xs font-label rounded px-2 py-1 focus:outline-none">
                  <option value="motion">{L('Mayor movimiento', 'Largest motion')}</option>
                  <option value="miss">{L('Distancia de paso (NEO)', 'Miss distance (NEO)')}</option>
                  <option value="date">{L('Fecha de acercamiento', 'Close-approach date')}</option>
                  <option value="mag">{L('Magnitud (H / Ks)', 'Magnitude (H / Ks)')}</option>
                  <option value="name">{L('Nombre', 'Name')}</option>
                </select>
                <div className="text-[9px] font-label text-on-surface-variant/70 mt-1">{desc ? L('Descendente', 'Descending') : L('Ascendente', 'Ascending')}</div>
              </div>
            </div>
          </div>

          <div className="bg-surface-container rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-high/70 text-[10px] font-label uppercase tracking-wider text-on-surface-variant">
                    <th className="py-3 px-4">{L('Candidato / Identificador', 'Candidate / Identifier')}</th>
                    <th className="py-3 px-4">{L('Coord. J2000 (RA / Dec)', 'J2000 coords (RA / Dec)')}</th>
                    <th className="py-3 px-4">{L('Movimiento', 'Motion')}</th>
                    <th className="py-3 px-4 min-w-[220px]">{L('Tríptico de épocas / Acercamiento', 'Epoch triptych / Approach')}</th>
                    <th className="py-3 px-4">{L('Métrica clave', 'Key metric')}</th>
                    <th className="py-3 px-4">{L('Estado', 'Status')}</th>
                    <th className="py-3 px-4 text-right">{L('Acciones rápidas', 'Quick actions')}</th>
                  </tr>
                </thead>
                <tbody className="text-xs font-body">
                  {feed.loading && !feed.data && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-on-surface-variant font-label">
                        <Spinner className="text-secondary mr-2" />
                        {L('Consultando NASA NeoWs…', 'Querying NASA NeoWs…')}
                      </td>
                    </tr>
                  )}
                  {pageRows.map((r, i) => (
                    <CandidateRow
                      key={r.key}
                      r={r}
                      striped={i % 2 === 0}
                      selected={selected?.key === r.key}
                      thumbSurvey={thumbSurvey}
                      vote={store.votes[r.key]}
                      onSelect={() => select(r)}
                      onVote={(v) => voteFor(r, v)}
                      onInspect={() => (r.kind === 'neo' ? select(r) : navigate(`/explorer?target=${r.target.id}`))}
                      onDownload={() => downloadRow(r)}
                    />
                  ))}
                  {!feed.loading && pageRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-on-surface-variant font-label">{L('Ningún candidato coincide con los filtros.', 'No candidates match the filters.')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-surface-container-low/80 flex flex-wrap gap-2 items-center justify-between text-xs font-label text-on-surface-variant">
              <div className="flex flex-wrap items-center gap-2">
                <span>
                  {L('Mostrando', 'Showing')} <strong className="text-on-surface">{filtered.length ? page * PAGE + 1 : 0} - {Math.min(filtered.length, (page + 1) * PAGE)}</strong> {L('de', 'of')} {filtered.length}
                </span>
                <span className="text-outline-variant">•</span>
                <span className="text-secondary font-medium">{L('Atajos: [1: Real, 2: Artefacto, ESPACIO: Siguiente]', 'Shortcuts: [1: Real, 2: Artefact, SPACE: Next]')}</span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded bg-surface-container-high text-on-surface disabled:opacity-30">{L('Anterior', 'Previous')}</button>
                {Array.from({ length: pages }, (_, k) => k)
                  .filter((k) => k < 3 || k === pages - 1 || Math.abs(k - page) <= 1)
                  .map((k, idx, arr) => (
                    <span key={k} className="flex items-center">
                      {idx > 0 && k - arr[idx - 1] > 1 && <span className="px-1 text-on-surface-variant/50">…</span>}
                      <button type="button" onClick={() => setPage(k)} className={`px-2 py-1 rounded ${k === page ? 'bg-primary/20 text-primary font-bold' : 'hover:bg-surface-container-high'}`}>{k + 1}</button>
                    </span>
                  ))}
                <button type="button" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded bg-surface-container-high text-on-surface disabled:opacity-30">{L('Siguiente', 'Next')}</button>
              </div>
            </div>
          </div>

          <div className="bg-surface-container-high/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-4 text-xs font-label">
            <div className="flex flex-wrap items-center gap-4 text-on-surface-variant">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-secondary" /> NEO</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-error" /> PHA</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-tertiary" /> {L('Enana marrón', 'Brown dwarf')}</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary" /> {L('Estrella de alto µ', 'High-µ star')}</span>
            </div>
            <div className="text-[11px] text-on-surface-variant flex items-center gap-2">
              <Icon name="sync" className="text-sm text-secondary" />
              NeoWs: <strong className="text-on-surface">{feed.data ? (feed.data.cached ? L('caché local (≤6 h)', 'local cache (≤6 h)') : L('consultado ahora', 'queried now')) : '—'}</strong>
            </div>
          </div>
        </div>

        <div className="w-full xl:w-[410px] shrink-0 space-y-4 xl:sticky xl:top-20">
          {selected && (
            <div className="bg-surface-container rounded-xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between bg-surface-container-low/60 -mx-5 -mt-5 p-5 rounded-t-xl">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon name="travel_explore" className="text-secondary text-lg" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-label text-on-surface-variant uppercase tracking-wider">{selected.kind === 'neo' ? L('Inspección de órbita', 'Orbit inspection') : L('Inspección astrométrica', 'Astrometric inspection')}</div>
                    <div className="text-base font-headline font-bold text-on-surface truncate">{selected.name}</div>
                  </div>
                </div>
                <span className="text-[9px] font-label px-2 py-0.5 rounded bg-secondary-container/80 text-secondary uppercase font-semibold flex items-center gap-1 shrink-0">
                  {lookup.loading && selected.kind === 'neo' ? <Spinner className="text-[10px]" /> : <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />}
                  {selected.kind === 'neo' ? 'NeoWs' : 'SIMBAD'}
                </span>
              </div>
              {selected.kind === 'neo' ? <NeoDetail r={selected} lookup={lookup} el={el} ephem={ephem} /> : <StarDetail r={selected} />}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => voteFor(selected, 'real')} className="w-full py-2.5 px-3 rounded-lg bg-secondary text-on-secondary font-label font-bold text-xs hover:shadow-[0_0_16px_rgba(0,255,204,0.4)] flex items-center justify-center gap-1.5">
                    <Icon name="check_circle" className="text-base" />
                    {L('Validar candidato', 'Validate candidate')}
                  </button>
                  <button type="button" onClick={() => voteFor(selected, 'artifact')} className="w-full py-2.5 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-error font-label font-semibold text-xs flex items-center justify-center gap-1.5">
                    <Icon name="cancel" className="text-base" />
                    {L('Descartar ruido', 'Discard noise')}
                  </button>
                </div>
                {selected.kind === 'neo' ? (
                  <a href={`https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${selected.neoId}`} target="_blank" rel="noreferrer" className="w-full py-2 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label text-xs flex items-center justify-center gap-1.5">
                    <Icon name="share_location" className="text-base text-secondary" />
                    {L('Abrir en JPL Small-Body Database', 'Open in JPL Small-Body Database')}
                  </a>
                ) : (
                  <button type="button" onClick={() => navigate(`/explorer?target=${selected.target.id}`)} className="w-full py-2 px-3 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label text-xs flex items-center justify-center gap-1.5">
                    <Icon name="satellite_alt" className="text-base text-secondary" />
                    {L('Abrir en el comparador blink', 'Open in the blink comparator')}
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="bg-surface-container-low/70 rounded-xl p-4 text-xs font-body text-on-surface-variant space-y-1.5">
            <div className="font-label font-bold text-on-surface text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Icon name="lightbulb" className="text-tertiary text-sm" /> {L('Clave de validación dipolar', 'Dipole validation key')}
            </div>
            <p className="text-[11px] leading-relaxed">
              {L(
                'Un objeto real en movimiento deja una firma positivo/negativo (dipolo) nítida al restar épocas, con el mismo perfil en todas las bandas. Un artefacto aparece en una sola época o banda.',
                'A real moving object leaves a sharp positive/negative signature (dipole) when subtracting epochs, with the same profile in all bands. An artefact appears in a single epoch or band.',
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[10px] font-label text-on-surface-variant items-center">
            {lang === 'es' ? 'Fuentes:' : 'Sources:'} <SourceBadge>api.nasa.gov NeoWs</SourceBadge> <SourceBadge>IRSA HiPS</SourceBadge>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ticker({ icon, tone, label, value, sub, valueCls = 'text-on-surface' }) {
  return (
    <div className="bg-surface-container-high/90 px-4 py-3 rounded-xl shadow-md flex flex-col justify-between min-w-[110px]">
      <span className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
        <Icon name={icon} className={`text-xs ${tone}`} /> {label}
      </span>
      <span className={`mt-1 text-xl font-headline font-bold ${valueCls}`}>{value}</span>
      <span className="text-[9px] font-label text-on-surface-variant/80 truncate">{sub}</span>
    </div>
  );
}

function CandidateRow({ r, striped, selected, thumbSurvey, vote, onSelect, onVote, onInspect, onDownload }) {
  const { L, fmtNum } = useI18n();
  const dot = r.kind === 'neo' ? (r.hazardous ? 'bg-error' : 'bg-secondary') : r.kind === 'bd' ? 'bg-tertiary' : 'bg-primary';
  const txt = r.kind === 'neo' ? (r.hazardous ? 'text-error' : 'text-secondary') : r.kind === 'bd' ? 'text-tertiary' : 'text-primary';
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  return (
    <tr onClick={onSelect} className={`${selected ? 'bg-surface-container-highest' : striped ? 'bg-surface-container-high/40' : 'bg-surface-container/30'} hover:bg-surface-container-highest transition-colors group cursor-pointer`}>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
          <div>
            <div className="font-label font-bold text-on-surface text-sm group-hover:text-secondary transition-colors">{r.name}</div>
            <div className={`text-[10px] font-label uppercase tracking-tight ${txt}`}>{L(r.subEs, r.subEn)}</div>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 font-label">
        {r.kind === 'neo' ? (
          <span className="text-[11px] text-on-surface-variant">{L('Efeméride al seleccionar', 'Ephemeris on select')}</span>
        ) : (
          <>
            <div className="text-on-surface font-medium whitespace-nowrap">{formatRA(r.ra, 2)}</div>
            <div className="text-[11px] text-on-surface-variant whitespace-nowrap">{formatDec(r.dec, 1)}</div>
          </>
        )}
      </td>
      <td className="py-3 px-4 font-label whitespace-nowrap">
        {r.kind === 'neo' ? (
          <>
            <div className={`${txt} font-bold text-sm`}>{fmtNum(r.vRel, 2)} <span className="text-[10px] font-normal text-on-surface-variant">km/s</span></div>
            <div className="text-[10px] text-on-surface-variant">{L('velocidad relativa', 'relative velocity')}</div>
          </>
        ) : (
          <>
            <div className={`${txt} font-bold text-sm`}>{fmtNum(r.motion, 1)} <span className="text-[10px] font-normal text-on-surface-variant">mas/{L('año', 'yr')}</span></div>
            <div className="text-[10px] text-on-surface-variant">{fmtNum(r.motion / 1000, 3)} ″/{L('a', 'yr')} (PA {fmtNum(r.pa, 1)}°)</div>
          </>
        )}
      </td>
      <td className="py-3 px-4">
        {r.kind === 'neo' ? (
          <div className="w-52">
            <div className="flex justify-between text-[10px] font-label text-on-surface-variant mb-1">
              <span>{L('Tierra', 'Earth')}</span>
              <span>{r.caDate}</span>
            </div>
            <div className="relative h-2 bg-surface-container-lowest rounded-full">
              <span className="absolute -top-0.5 w-3 h-3 rounded-full bg-sky left-0" />
              <span className="absolute -top-0.5 w-2 h-3 rounded-full bg-on-surface-variant" style={{ left: `${(1 / 60) * 100}%` }} title={L('Luna', 'Moon')} />
              <span className={`absolute -top-0.5 w-3 h-3 rounded-full ${r.hazardous ? 'bg-error' : 'bg-secondary'}`} style={{ left: `${Math.min(96, (r.missLD / 60) * 100)}%` }} />
            </div>
            <div className="text-[9px] font-label text-on-surface-variant mt-1">{L('Escala 0–60 distancias lunares', 'Scale 0–60 lunar distances')}</div>
          </div>
        ) : (
          <Triptych t={r.target} thumbSurvey={thumbSurvey} />
        )}
      </td>
      <td className="py-3 px-4 font-label whitespace-nowrap">
        {r.kind === 'neo' ? (
          <>
            <div className={`font-bold text-sm ${txt}`}>{fmtNum(r.missLD, 1)} LD</div>
            <div className="text-[10px] text-on-surface-variant">{fmtNum(r.missKm / 1e6, 2)} M km · H {fmtNum(r.H, 1)}</div>
            {r.diam && <div className="text-[9px] text-on-surface-variant">Ø {fmtNum(r.diam[0], 0)}–{fmtNum(r.diam[1], 0)} m</div>}
          </>
        ) : (
          <>
            <div className={`font-bold text-sm ${txt}`}>{r.dist ? `${fmtNum(r.dist, 2)} pc` : '—'}</div>
            <div className="text-[10px] text-on-surface-variant">Ks {r.mag ?? '—'} · vₜ {r.dist ? fmtNum(4.74 * (r.motion / 1000) * r.dist, 0) : '—'} km/s</div>
          </>
        )}
      </td>
      <td className="py-3 px-4">
        <StatusBadge r={r} vote={vote} />
      </td>
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button type="button" onClick={stop(onInspect)} className="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface hover:text-secondary" title={L('Inspección detallada', 'Detailed inspection')}>
            <Icon name="pageview" className="text-base" />
          </button>
          <button type="button" onClick={stop(() => onVote('real'))} className="p-1.5 rounded-lg bg-secondary/15 hover:bg-secondary/30 text-secondary" title={L('Votar: objeto real', 'Vote: real object')}>
            <Icon name="thumb_up" className="text-base" />
          </button>
          <button type="button" onClick={stop(() => onVote('artifact'))} className="p-1.5 rounded-lg bg-error-container/60 hover:bg-error-container text-error" title={L('Descartar / artefacto', 'Discard / artefact')}>
            <Icon name="thumb_down" className="text-base" />
          </button>
          <button type="button" onClick={stop(onDownload)} className="p-1.5 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface-variant hover:text-on-surface" title={r.kind === 'neo' ? L('Descargar JSON NeoWs', 'Download NeoWs JSON') : L('Exportar FITS', 'Export FITS')}>
            <Icon name="download" className="text-base" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({ r, vote }) {
  const { L } = useI18n();
  if (vote === 'real') return <Badge cls="bg-secondary/10 text-secondary" dot="bg-secondary" text={L('Validado por ti', 'Validated by you')} />;
  if (vote === 'artifact') return <Badge cls="bg-error-container/60 text-error" dot="bg-error" text={L('Descartado', 'Discarded')} />;
  if (vote === 'doubtful') return <Badge cls="bg-tertiary-container/50 text-tertiary" dot="bg-tertiary" text={L('Dudoso', 'Doubtful')} />;
  if (r.kind === 'neo' && r.sentry) return <Badge cls="bg-error-container/60 text-error" dot="bg-error animate-pulse" text="Sentry" />;
  if (r.kind === 'neo') return <Badge cls="bg-surface-container-highest text-on-surface-variant" dot="bg-on-surface-variant" text={L('Pendiente', 'Pending')} />;
  return <Badge cls="bg-tertiary-container/50 text-tertiary" dot="bg-tertiary" text={L('Catalogado', 'Catalogued')} />;
}

function Badge({ cls, dot, text }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-label font-semibold whitespace-nowrap ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} /> {text}
    </span>
  );
}

function Triptych({ t, thumbSurvey }) {
  const { L } = useI18n();
  const epochs = [['tmassK', SURVEYS.tmassK.epoch], ['wiseW1', SURVEYS.wiseW1.epoch], ['spherex', SURVEYS.spherex.epoch]];
  const mid = propagate(t.ra, t.dec, t.pmRA, t.pmDec, t.epoch0, (SURVEYS.tmassK.epoch + SURVEYS.spherex.epoch) / 2);
  const span = (totalPM(t) * (SURVEYS.spherex.epoch - SURVEYS.tmassK.epoch)) / 1000;
  const fov = Math.max(120, span * 1.8) / 3600;
  const cosd = Math.cos((mid[1] * Math.PI) / 180);
  return (
    <div className="flex items-center gap-1.5">
      {epochs.map(([sv, ep], i) => {
        const survey = thumbSurvey === 'spherex' ? sv : thumbSurvey;
        const [ra, dec] = propagate(t.ra, t.dec, t.pmRA, t.pmDec, t.epoch0, ep);
        const x = (ra - mid[0]) * cosd;
        const y = dec - mid[1];
        return (
          <div key={sv} className="flex items-center gap-1.5">
            <div className="flex flex-col items-center">
              <SkyThumb survey={survey} ra={mid[0]} dec={mid[1]} fovDeg={fov} size={48} frame={nearestFrame(2.15)} className="w-10 h-10 rounded">
                <span className="absolute w-2 h-2 rounded-full border border-secondary" style={{ left: `${50 - (x / fov) * 100}%`, top: `${50 - (y / fov) * 100}%`, transform: 'translate(-50%,-50%)' }} />
              </SkyThumb>
              <span className="text-[8px] font-label text-on-surface-variant mt-0.5">{Math.round(ep)}</span>
            </div>
            {i < 2 && <div className="text-on-surface-variant/40 text-xs">→</div>}
          </div>
        );
      })}
      <div className="text-on-surface-variant/40 text-xs">=</div>
      <div className="flex flex-col items-center ml-1">
        <svg className="w-10 h-10 rounded" viewBox="0 0 40 40">
          <rect fill="#0a0a12" height="40" width="40" />
          {(() => {
            const a = (pmPA(t) * Math.PI) / 180;
            const dx = -Math.sin(a) * 7;
            const dy = -Math.cos(a) * 7;
            return (
              <>
                <circle cx={20 - dx} cy={20 - dy} r="4.5" fill="#ff2d78" opacity="0.85" />
                <circle cx={20 + dx} cy={20 + dy} r="4.5" fill="#00ffcc" opacity="0.85" />
                <line x1={20 - dx} y1={20 - dy} x2={20 + dx} y2={20 + dy} stroke="#fff" strokeDasharray="1 1" strokeWidth="0.8" opacity="0.6" />
              </>
            );
          })()}
        </svg>
        <span className="text-[8px] font-label text-primary font-bold mt-0.5">{L('DIPOLO', 'DIPOLE')}</span>
      </div>
    </div>
  );
}

function NeoDetail({ r, lookup, el, ephem }) {
  const { L, fmtNum } = useI18n();
  const next = (lookup.data?.close_approach_data || [])
    .filter((c) => c.orbiting_body === 'Earth' && Number(c.epoch_date_close_approach) > Date.now())
    .sort((a, b) => a.epoch_date_close_approach - b.epoch_date_close_approach)[0];
  return (
    <>
      <ErrorNote error={lookup.error} onRetry={lookup.reload} />
      <div className="grid grid-cols-2 gap-2 text-xs font-label">
        <Cell label={L('Ascensión recta (ahora)', 'Right ascension (now)')} value={ephem ? formatRA(ephem.ra, 1) : '…'} />
        <Cell label={L('Declinación (ahora)', 'Declination (now)')} value={ephem ? formatDec(ephem.dec, 0) : '…'} />
        <Cell label={L('Movimiento aparente', 'Apparent motion')} value={ephem ? `${fmtNum(ephem.rate, 1)} ″/h` : '…'} cls="text-secondary font-bold" />
        <Cell label={L('Distancia geocéntrica', 'Geocentric distance')} value={ephem ? `${fmtNum(ephem.dist, 4)} UA` : '…'} cls="text-primary font-bold" />
      </div>
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-inner space-y-2">
        <div className="flex items-center justify-between text-xs font-label">
          <span className="text-[10px] text-on-surface-variant tracking-wider uppercase flex items-center gap-1">
            <Icon name="orbit" className="text-xs text-secondary" /> {L('Órbita kepleriana (NeoWs)', 'Keplerian orbit (NeoWs)')}
          </span>
          {el && <span className="text-[10px] text-secondary font-semibold">e = {el.e.toFixed(3)} | a = {el.a.toFixed(3)} UA</span>}
        </div>
        <div className="h-48 w-full flex items-center justify-center">{el ? <OrbitDiagram el={el} /> : lookup.loading ? <Spinner className="text-secondary text-2xl" /> : null}</div>
        {el && (
          <div className="flex items-center justify-between text-[10px] font-label text-on-surface-variant bg-surface-container-high/60 px-2.5 py-1.5 rounded">
            <span>Ω: <strong className="text-on-surface">{el.node.toFixed(2)}°</strong></span>
            <span>ω: <strong className="text-on-surface">{el.peri.toFixed(2)}°</strong></span>
            <span>MOID: <strong className="text-on-surface">{el.moid.toFixed(4)} UA</strong></span>
          </div>
        )}
      </div>
      <div className="bg-surface-container-high/70 p-3 rounded-lg space-y-2">
        <div className="flex items-center justify-between text-xs font-label">
          <span className="text-on-surface font-semibold flex items-center gap-1.5">
            <Icon name="database" className="text-sm text-secondary" /> NASA NeoWs / JPL
          </span>
          <span className="text-[10px] text-secondary">ID #{r.neoId}</span>
        </div>
        <div className="space-y-1 font-label text-[11px] text-on-surface-variant bg-surface-container-lowest p-2 rounded">
          <Line k={L('Acercamiento (esta semana)', 'Approach (this week)')} v={`${r.caDate} · ${fmtNum(r.missLD, 2)} LD`} />
          <Line k={L('Próximo acercamiento', 'Next approach')} v={next ? `${next.close_approach_date} · ${fmtNum(Number(next.miss_distance.lunar), 1)} LD` : '—'} />
          <Line k={L('Incertidumbre orbital (U)', 'Orbit uncertainty (U)')} v={el ? `${el.uncertainty} (0 = ${L('mejor', 'best')})` : '…'} cls="text-secondary font-semibold" />
          <Line k={L('Arco / observaciones', 'Arc / observations')} v={el ? `${fmtNum(el.arcDays)} d · ${fmtNum(el.nObs)}` : '…'} />
          <Line k={L('Clase orbital', 'Orbit class')} v={el?.orbitClass?.orbit_class_type ?? '…'} cls="text-tertiary font-semibold" />
          <Line k={L('Diámetro estimado', 'Estimated diameter')} v={r.diam ? `${fmtNum(r.diam[0], 0)}–${fmtNum(r.diam[1], 0)} m` : '—'} />
        </div>
        {el?.orbitClass?.orbit_class_description && <p className="text-[10px] text-on-surface-variant">{el.orbitClass.orbit_class_description}</p>}
      </div>
    </>
  );
}

function StarDetail({ r }) {
  const { L, fmtNum } = useI18n();
  const t = r.target;
  const ep = [SURVEYS.tmassK.epoch, SURVEYS.wiseW1.epoch, SURVEYS.spherex.epoch];
  const now = propagate(t.ra, t.dec, t.pmRA, t.pmDec, t.epoch0, SURVEYS.spherex.epoch);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 text-xs font-label">
        <Cell label={L('RA (época SPHEREx)', 'RA (SPHEREx epoch)')} value={formatRA(now[0], 1)} />
        <Cell label={L('Dec (época SPHEREx)', 'Dec (SPHEREx epoch)')} value={formatDec(now[1], 0)} />
        <Cell label={L('Movimiento total (µ)', 'Total motion (µ)')} value={`${fmtNum(r.motion, 1)} mas/${L('año', 'yr')}`} cls="text-secondary font-bold" />
        <Cell label={L('Velocidad tangencial', 'Tangential velocity')} value={t.dist ? `${fmtNum(4.74 * (r.motion / 1000) * t.dist, 1)} km/s` : '—'} cls="text-primary font-bold" />
      </div>
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-inner space-y-2">
        <div className="text-[10px] font-label text-on-surface-variant tracking-wider uppercase flex items-center gap-1">
          <Icon name="moving" className="text-xs text-secondary" /> {L('Vector de movimiento propio', 'Proper-motion vector')}
        </div>
        <div className="h-48">
          <PMDiagram target={t} epochs={ep} />
        </div>
      </div>
      <div className="bg-surface-container-high/70 p-3 rounded-lg space-y-1 font-label text-[11px] text-on-surface-variant">
        <p className="text-on-surface text-xs">{L(t.desc)}</p>
        <Line k={L('Tipo espectral', 'Spectral type')} v={t.spt} cls="text-tertiary font-semibold" />
        <Line k="Ks (2MASS)" v={t.kmag ?? '—'} />
        <Line k={L('Distancia', 'Distance')} v={t.dist ? `${t.dist} pc` : '—'} />
        <a className="text-secondary hover:underline inline-flex items-center gap-1" href={simbadUrl(t.ra, t.dec)} target="_blank" rel="noreferrer">
          SIMBAD <Icon name="open_in_new" className="text-xs" />
        </a>
      </div>
    </>
  );
}

function Cell({ label, value, cls = 'text-on-surface font-semibold' }) {
  return (
    <div className="bg-surface-container-high/70 p-2.5 rounded-lg">
      <div className="text-[10px] text-on-surface-variant">{label}</div>
      <div className={`mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

function Line({ k, v, cls = 'text-on-surface font-semibold' }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{k}:</span>
      <span className={`${cls} text-right`}>{v}</span>
    </div>
  );
}
