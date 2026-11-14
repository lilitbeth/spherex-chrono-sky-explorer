import { earthHelio, dateToJD, helioPosition, orbitPath } from '../lib/orbit.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

/** Top-down (ecliptic plane) view of a NEO orbit with Earth, from NeoWs elements. */
export default function OrbitDiagram({ el, date = new Date() }) {
  const { L } = useI18n();
  if (!el) return null;
  const jd = dateToJD(date);
  const path = orbitPath(el, 200);
  const ext = Math.max(1.2, Math.min(6, el.Q || el.a * (1 + el.e)) * 1.08);
  const S = 90 / ext;
  const tx = (p) => [160 + p[0] * S, 100 - p[1] * S];
  const earthPath = Array.from({ length: 101 }, (_, k) => tx([Math.cos((k / 100) * 2 * Math.PI), Math.sin((k / 100) * 2 * Math.PI)]));
  const pE = tx(earthHelio(jd));
  const pA = tx(helioPosition(el, jd));
  const peri = path.reduce((best, p) => (Math.hypot(...p) < Math.hypot(...best) ? p : best), path[0]);
  const pP = tx(peri);
  return (
    <svg className="w-full h-full" viewBox="0 0 320 200" role="img" aria-label="Orbit diagram">
      <line x1="160" x2="160" y1="5" y2="195" stroke="#302840" strokeWidth="0.5" opacity="0.5" />
      <line x1="5" x2="315" y1="100" y2="100" stroke="#302840" strokeWidth="0.5" opacity="0.5" />
      <polyline points={earthPath.map((p) => p.join(',')).join(' ')} fill="none" stroke="#38bdf8" strokeWidth="1.2" opacity="0.6" />
      <polyline points={path.map((p) => tx(p).join(',')).join(' ')} fill="none" stroke="#ff2d78" strokeDasharray="4 2" strokeWidth="1.6" />
      <circle cx="160" cy="100" r="6" fill="#ffe04a" />
      <circle cx="160" cy="100" r="10" fill="#ffe04a" opacity="0.25" />
      <circle cx={pE[0]} cy={pE[1]} r="3.5" fill="#38bdf8" />
      <text x={pE[0] + 5} y={pE[1] - 5} fill="#38bdf8" fontFamily="Space Grotesk" fontSize="8">{L('Tierra', 'Earth')}</text>
      <circle cx={pA[0]} cy={pA[1]} r="4" fill="#00ffcc" className="animate-pulse" />
      <circle cx={pA[0]} cy={pA[1]} r="8" fill="none" stroke="#00ffcc" strokeWidth="0.8" opacity="0.6" />
      <circle cx={pP[0]} cy={pP[1]} r="2" fill="#ff2d78" />
      <text x="8" y="190" fill="#a098b0" fontFamily="Space Grotesk" fontSize="9">
        {L('Perihelio', 'Perihelion')}: {(el.q || el.a * (1 - el.e)).toFixed(3)} UA
      </text>
      <text x="200" y="16" fill="#ff2d78" fontFamily="Space Grotesk" fontSize="9">
        {L('Inclinación', 'Inclination')}: {el.i.toFixed(2)}°
      </text>
      <text x="8" y="16" fill="#a098b0" fontFamily="Space Grotesk" fontSize="8">
        {L('Escala', 'Scale')}: {ext.toFixed(1)} UA
      </text>
    </svg>
  );
}

/** Proper-motion vector diagram for stars (tangent-plane offsets per epoch). */
export function PMDiagram({ target, epochs }) {
  const { L } = useI18n();
  const pts = epochs.map((y) => [((target.pmRA || 0) * (y - 2000)) / 1000, ((target.pmDec || 0) * (y - 2000)) / 1000]);
  const ext = Math.max(...pts.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1]))), 1) * 1.25;
  const S = 85 / ext;
  const tx = ([x, y]) => [160 - x * S, 100 - y * S];
  return (
    <svg className="w-full h-full" viewBox="0 0 320 200" role="img" aria-label="Proper motion diagram">
      <defs>
        <marker id="pmArrow" markerHeight="6" markerWidth="6" orient="auto" refX="3" refY="3">
          <path d="M0 0 L6 3 L0 6 z" fill="#00ffcc" />
        </marker>
      </defs>
      <line x1="160" x2="160" y1="5" y2="195" stroke="#302840" strokeWidth="0.6" />
      <line x1="5" x2="315" y1="100" y2="100" stroke="#302840" strokeWidth="0.6" />
      <text x="164" y="14" fill="#38bdf8" fontFamily="Space Grotesk" fontSize="9">N</text>
      <text x="8" y="96" fill="#00ffcc" fontFamily="Space Grotesk" fontSize="9">E</text>
      <polyline points={pts.map((p) => tx(p).join(',')).join(' ')} fill="none" stroke="#00ffcc" strokeWidth="1.4" markerEnd="url(#pmArrow)" />
      {pts.map((p, i) => {
        const [x, y] = tx(p);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="3.5" fill={i === pts.length - 1 ? '#38bdf8' : '#ff2d78'} />
            <text x={x + 6} y={y + 3} fill="#e8e0f0" fontFamily="Space Grotesk" fontSize="8">{Math.round(epochs[i])}</text>
          </g>
        );
      })}
      <text x="8" y="190" fill="#a098b0" fontFamily="Space Grotesk" fontSize="9">
        {L('Desplazamiento respecto a J2000 (″)', 'Offset from J2000 (″)')} · ±{ext.toFixed(0)}″
      </text>
    </svg>
  );
}
