import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { useStore } from '../store/AppStore.jsx';
import { ErrorNote, Icon, SourceBadge, Spinner } from '../components/ui.jsx';
import { donkiNotifications, neoFeed } from '../lib/nasa.js';
import { useAsync } from '../lib/hooks.js';

const TYPE_INFO = {
  FLR: { icon: 'flare', es: 'Fulguración solar', en: 'Solar flare', sev: 2 },
  SEP: { icon: 'bolt', es: 'Partículas energéticas solares', en: 'Solar energetic particles', sev: 3 },
  CME: { icon: 'cyclone', es: 'Eyección de masa coronal', en: 'Coronal mass ejection', sev: 2 },
  IPS: { icon: 'waves', es: 'Choque interplanetario', en: 'Interplanetary shock', sev: 2 },
  MPC: { icon: 'shield', es: 'Cruce de magnetopausa', en: 'Magnetopause crossing', sev: 2 },
  GST: { icon: 'public', es: 'Tormenta geomagnética', en: 'Geomagnetic storm', sev: 3 },
  RBE: { icon: 'radar', es: 'Realce del cinturón de radiación', en: 'Radiation belt enhancement', sev: 3 },
  Report: { icon: 'summarize', es: 'Informe semanal', en: 'Weekly report', sev: 1 },
  NEO: { icon: 'near_me', es: 'Acercamiento de NEO', en: 'NEO close approach', sev: 2 },
};

const SEV = {
  1: { es: 'Info', en: 'Info', cls: 'bg-surface-container-highest text-on-surface-variant' },
  2: { es: 'Aviso', en: 'Watch', cls: 'bg-tertiary/15 text-tertiary' },
  3: { es: 'Alerta', en: 'Alert', cls: 'bg-error-container text-error' },
};

function impactText(type, L) {
  const map = {
    FLR: L('Posible aumento de ruido de fondo; sin impacto directo en el plano focal criogénico.', 'Possible background increase; no direct impact on the cryogenic focal plane.'),
    SEP: L('Las partículas energéticas generan impactos de rayos cósmicos: revisa artefactos en las épocas afectadas.', 'Energetic particles cause cosmic-ray hits: check artefacts in the affected epochs.'),
    CME: L('Puede provocar tormentas geomagnéticas en 1–3 días.', 'May trigger geomagnetic storms within 1–3 days.'),
    GST: L('Mayor arrastre atmosférico y flujo de partículas en LEO (~650 km): vigila la órbita.', 'Higher atmospheric drag and particle flux in LEO (~650 km): watch the orbit.'),
    RBE: L('Aumento de electrones en cinturones de radiación: más falsos positivos en la Anomalía del Atlántico Sur.', 'More radiation-belt electrons: more false positives over the South Atlantic Anomaly.'),
    IPS: L('Llegada de un choque del viento solar.', 'Arrival of a solar-wind shock.'),
    MPC: L('Compresión de la magnetosfera.', 'Magnetosphere compression.'),
    NEO: L('Objeto cercano a la Tierra en aproximación esta semana.', 'Near-Earth object approaching this week.'),
    Report: L('Resumen de actividad del clima espacial.', 'Space-weather activity summary.'),
  };
  return map[type] || '';
}

export default function Alerts() {
  const { L, lang, fmtNum } = useI18n();
  const store = useStore();
  const end = useMemo(() => new Date(), []);
  const start = useMemo(() => new Date(end.getTime() - 30 * 86400000), [end]);
  const weekStart = useMemo(() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, []);
  const donki = useAsync((force) => donkiNotifications(start, end, { force }), [start, end]);
  const neos = useAsync(() => neoFeed(weekStart, new Date(weekStart.getTime() + 6 * 86400000)), [weekStart]);

  const [types, setTypes] = useState(() => new Set(Object.keys(TYPE_INFO)));
  const [minSev, setMinSev] = useState(1);
  const [showAck, setShowAck] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  const alerts = useMemo(() => {
    const a = (donki.data?.list || []).map((n) => ({
      id: n.messageID, type: n.messageType in TYPE_INFO ? n.messageType : 'Report', time: new Date(n.messageIssueTime),
      title: n.messageID, body: n.messageBody, url: n.messageURL, source: 'DONKI',
    }));
    const b = (neos.data?.list || [])
      .filter((o) => o.is_potentially_hazardous_asteroid || Number(o.close_approach_data?.[0]?.miss_distance?.lunar) < 10)
      .map((o) => {
        const ca = o.close_approach_data[0];
        return {
          id: `neo-${o.id}`, type: 'NEO', time: new Date(ca.epoch_date_close_approach), title: o.name,
          body: `${o.name}: ${Number(ca.miss_distance.lunar).toFixed(2)} LD (${Number(ca.miss_distance.kilometers).toLocaleString()} km), ${Number(ca.relative_velocity.kilometers_per_second).toFixed(2)} km/s, H=${o.absolute_magnitude_h}${o.is_potentially_hazardous_asteroid ? ' — PHA' : ''}`,
          url: o.nasa_jpl_url, source: 'NeoWs', sevOverride: o.is_potentially_hazardous_asteroid ? 3 : 2,
        };
      });
    return [...a, ...b].sort((x, y) => y.time - x.time);
  }, [donki.data, neos.data]);

  const sevOf = (a) => a.sevOverride || TYPE_INFO[a.type].sev;
  const visible = alerts.filter((a) =>
    types.has(a.type) && sevOf(a) >= minSev && (showAck || !store.acknowledged[a.id])
    && (!q || `${a.title} ${a.body}`.toLowerCase().includes(q.toLowerCase())));
  const unacked = alerts.filter((a) => !store.acknowledged[a.id]).length;

  const toggleType = (t) => setTypes((s) => {
    const n = new Set(s);
    if (n.has(t)) n.delete(t);
    else n.add(t);
    return n;
  });

  const ackAll = () => {
    visible.forEach((a) => store.acknowledge(a.id));
    store.toast(L(`${visible.length} alertas reconocidas`, `${visible.length} alerts acknowledged`), 'done_all');
  };

  return (
    <div className="px-4 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-label text-xs tracking-widest text-secondary uppercase mb-1">
            <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
            {L('Centro de alertas · últimos 30 días', 'Alert centre · last 30 days')}
          </div>
          <h1 className="font-headline font-bold text-2xl lg:text-3xl tracking-tight text-on-surface">{L('Alertas Transitorias', 'Transient Alerts')}</h1>
          <p className="text-xs text-on-surface-variant max-w-2xl mt-1">
            {L(
              'Notificaciones de clima espacial de NASA DONKI (afectan a la calidad de datos y a la órbita de SPHEREx) y acercamientos de NEOs de esta semana desde NASA NeoWs.',
              'Space-weather notifications from NASA DONKI (they affect SPHEREx data quality and orbit) and this week’s NEO close approaches from NASA NeoWs.',
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { donki.reload(); }} className="px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-xs font-label flex items-center gap-1.5">
            <Icon name="refresh" className="text-sm" /> {L('Actualizar', 'Refresh')}
          </button>
          <button type="button" onClick={ackAll} disabled={!visible.length} className="px-3 py-2 rounded-lg bg-primary/20 text-primary text-xs font-label font-semibold flex items-center gap-1.5 disabled:opacity-40">
            <Icon name="done_all" className="text-sm" /> {L('Reconocer visibles', 'Acknowledge visible')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Count label={L('Notificaciones DONKI', 'DONKI notifications')} value={donki.data ? donki.data.list.length : donki.loading ? '…' : '—'} icon="satellite" />
        <Count label={L('NEOs < 10 LD o PHA', 'NEOs < 10 LD or PHA')} value={neos.data ? alerts.filter((a) => a.type === 'NEO').length : neos.loading ? '…' : '—'} icon="near_me" tone="text-tertiary" />
        <Count label={L('Alertas severas', 'Severe alerts')} value={alerts.filter((a) => sevOf(a) === 3).length} icon="warning" tone="text-error" />
        <Count label={L('Sin reconocer', 'Unacknowledged')} value={unacked} icon="notifications_active" tone="text-primary" />
      </div>

      <ErrorNote error={donki.error} onRetry={donki.reload} />
      <ErrorNote error={neos.error} onRetry={neos.reload} />

      <div className="rounded-xl bg-surface-container p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(TYPE_INFO).map(([k, v]) => {
            const n = alerts.filter((a) => a.type === k).length;
            return (
              <button key={k} type="button" onClick={() => toggleType(k)} className={`px-2.5 py-1 rounded-lg text-[11px] font-label flex items-center gap-1 ${types.has(k) ? 'bg-surface-container-high text-on-surface' : 'text-on-surface-variant/60 line-through'}`}>
                <Icon name={v.icon} className="text-sm text-secondary" /> {k} <span className="text-on-surface-variant">({n})</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-label">
          <div className="relative">
            <Icon name="search" className="absolute left-2.5 top-2 text-on-surface-variant text-sm pointer-events-none" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Buscar en alertas…', 'Search alerts…')} className="bg-surface-container-high text-on-surface pl-8 pr-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-secondary w-56" />
          </div>
          <div className="flex items-center gap-1 bg-surface-container-high rounded-lg p-0.5">
            {[1, 2, 3].map((s) => (
              <button key={s} type="button" onClick={() => setMinSev(s)} className={`px-2 py-1 rounded ${minSev === s ? 'bg-secondary/20 text-secondary' : 'text-on-surface-variant'}`}>≥ {L(SEV[s].es, SEV[s].en)}</button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-on-surface-variant">
            <input type="checkbox" checked={showAck} onChange={(e) => setShowAck(e.target.checked)} className="accent-secondary" /> {L('Mostrar reconocidas', 'Show acknowledged')}
          </label>
        </div>
      </div>

      <div className="space-y-2">
        {(donki.loading || neos.loading) && !alerts.length && (
          <div className="p-6 text-center text-xs font-label text-on-surface-variant"><Spinner className="text-secondary mr-2" />{L('Consultando NASA DONKI y NeoWs…', 'Querying NASA DONKI and NeoWs…')}</div>
        )}
        {!donki.loading && !neos.loading && !visible.length && (
          <div className="p-6 text-center text-xs font-label text-on-surface-variant rounded-xl bg-surface-container">{L('No hay alertas con estos filtros.', 'No alerts with these filters.')}</div>
        )}
        {visible.map((a) => {
          const info = TYPE_INFO[a.type];
          const sev = sevOf(a);
          const acked = store.acknowledged[a.id];
          const isOpen = open === a.id;
          return (
            <div key={a.id} className={`rounded-xl bg-surface-container ${acked ? 'opacity-60' : ''}`}>
              <button type="button" onClick={() => setOpen(isOpen ? null : a.id)} className="w-full p-4 flex items-center gap-3 text-left">
                <span className={`p-2 rounded-lg bg-surface-container-high ${sev === 3 ? 'text-error' : sev === 2 ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                  <Icon name={info.icon} className="text-lg" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-label text-sm font-semibold text-on-surface">{L(info.es, info.en)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-label font-semibold ${SEV[sev].cls}`}>{L(SEV[sev].es, SEV[sev].en)}</span>
                    <span className="text-[10px] font-label text-on-surface-variant">{a.source}</span>
                  </div>
                  <div className="text-[11px] font-label text-on-surface-variant truncate">{a.title} · {a.time.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                </div>
                <Icon name={isOpen ? 'expand_less' : 'expand_more'} className="text-on-surface-variant" />
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="p-3 rounded-lg bg-surface-container-low text-xs font-label text-secondary flex gap-2">
                    <Icon name="satellite_alt" className="text-sm" /> {L('Impacto en SPHEREx', 'Impact on SPHEREx')}: <span className="text-on-surface">{impactText(a.type, L)}</span>
                  </div>
                  <pre className="whitespace-pre-wrap text-[11px] font-mono text-on-surface-variant bg-surface-container-lowest rounded-lg p-3 max-h-72 overflow-y-auto">{a.body}</pre>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => store.acknowledge(a.id, !acked)} className="px-3 py-1.5 rounded-lg bg-secondary/15 text-secondary text-xs font-label flex items-center gap-1">
                      <Icon name={acked ? 'undo' : 'check'} className="text-sm" /> {acked ? L('Marcar como no reconocida', 'Mark unacknowledged') : L('Reconocer', 'Acknowledge')}
                    </button>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-label flex items-center gap-1">
                        <Icon name="open_in_new" className="text-sm" /> {a.source === 'NeoWs' ? 'JPL SBDB' : 'NASA DONKI'}
                      </a>
                    )}
                    {a.type === 'NEO' && (
                      <Link to="/candidates" className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface text-xs font-label flex items-center gap-1">
                        <Icon name="flare" className="text-sm" /> {L('Ver en candidatos', 'View in candidates')}
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <SourceBadge>NASA DONKI (CCMC) · api.nasa.gov</SourceBadge>
        <SourceBadge>NASA NeoWs · api.nasa.gov</SourceBadge>
        <span className="text-[10px] font-label text-on-surface-variant">{L('Ventana', 'Window')}: {start.toISOString().slice(0, 10)} → {end.toISOString().slice(0, 10)} · {fmtNum(alerts.length)} {L('elementos', 'items')}</span>
      </div>
    </div>
  );
}

function Count({ label, value, icon, tone = 'text-secondary' }) {
  return (
    <div className="p-4 rounded-xl bg-surface-container">
      <div className="flex items-center justify-between font-label text-[11px] text-on-surface-variant uppercase">
        <span>{label}</span>
        <Icon name={icon} className={`${tone} text-base`} />
      </div>
      <div className="font-headline font-bold text-2xl mt-1">{value}</div>
    </div>
  );
}
