// Two-body ephemerides from NASA NeoWs orbital elements (heliocentric ecliptic J2000).
import { eclToEq } from './coords.js';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function dateToJD(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Low-precision geocentric Sun (ecliptic longitude deg, distance AU). */
export function sunPosition(jd) {
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * D2R;
  const lambda = L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g);
  const R = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  return { lambda: ((lambda % 360) + 360) % 360, R };
}

export function earthHelio(jd) {
  const { lambda, R } = sunPosition(jd);
  const l = (lambda + 180) * D2R;
  return [R * Math.cos(l), R * Math.sin(l), 0];
}

function solveKepler(M, e) {
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 50; i += 1) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}

/**
 * elements: { a, e, i, node, peri, M0, n, epochJD } (deg, AU, deg/day)
 */
export function helioPosition(el, jd) {
  const M = ((el.M0 + el.n * (jd - el.epochJD)) % 360) * D2R;
  const E = solveKepler(M, el.e);
  const xv = el.a * (Math.cos(E) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const i = el.i * D2R;
  const O = el.node * D2R;
  const w = el.peri * D2R;
  const cosO = Math.cos(O);
  const sinO = Math.sin(O);
  const cosw = Math.cos(w);
  const sinw = Math.sin(w);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);
  const x = (cosO * cosw - sinO * sinw * cosi) * xv + (-cosO * sinw - sinO * cosw * cosi) * yv;
  const y = (sinO * cosw + cosO * sinw * cosi) * xv + (-sinO * sinw + cosO * cosw * cosi) * yv;
  const z = sinw * sini * xv + cosw * sini * yv;
  return [x, y, z];
}

/** Geocentric RA/Dec (deg) and distance (AU) of a body at a date. */
export function geocentricRADec(el, date) {
  const jd = dateToJD(date);
  const p = helioPosition(el, jd);
  const e = earthHelio(jd);
  const g = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
  const dist = Math.hypot(...g);
  const lon = Math.atan2(g[1], g[0]) * R2D;
  const lat = Math.asin(g[2] / dist) * R2D;
  const [ra, dec] = eclToEq((lon + 360) % 360, lat);
  return { ra, dec, dist };
}

/** Apparent sky motion rate ("/hour) and PA from finite differences. */
export function motionRate(el, date) {
  const a = geocentricRADec(el, date);
  const b = geocentricRADec(el, new Date(date.getTime() + 3600e3));
  const dRa = (b.ra - a.ra) * Math.cos(a.dec * D2R) * 3600;
  const dDec = (b.dec - a.dec) * 3600;
  let pa = Math.atan2(dRa, dDec) * R2D;
  if (pa < 0) pa += 360;
  return { rate: Math.hypot(dRa, dDec), pa };
}

/** Convert NeoWs `orbital_data` to our element object. */
export function elementsFromNeoWs(od) {
  if (!od) return null;
  return {
    a: Number(od.semi_major_axis),
    e: Number(od.eccentricity),
    i: Number(od.inclination),
    node: Number(od.ascending_node_longitude),
    peri: Number(od.perihelion_argument),
    M0: Number(od.mean_anomaly),
    n: Number(od.mean_motion),
    epochJD: Number(od.epoch_osculation),
    q: Number(od.perihelion_distance),
    Q: Number(od.aphelion_distance),
    period: Number(od.orbital_period),
    moid: Number(od.minimum_orbit_intersection),
    uncertainty: od.orbit_uncertainty,
    arcDays: Number(od.data_arc_in_days),
    nObs: Number(od.observations_used),
    orbitClass: od.orbit_class,
    firstObs: od.first_observation_date,
    lastObs: od.last_observation_date,
  };
}

/** Points of the orbit projected on the ecliptic plane (AU) for drawing. */
export function orbitPath(el, steps = 180) {
  const pts = [];
  for (let k = 0; k <= steps; k += 1) {
    const E = (k / steps) * 2 * Math.PI;
    const xv = el.a * (Math.cos(E) - el.e);
    const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    const i = el.i * D2R;
    const O = el.node * D2R;
    const w = el.peri * D2R;
    const x = (Math.cos(O) * Math.cos(w) - Math.sin(O) * Math.sin(w) * Math.cos(i)) * xv
      + (-Math.cos(O) * Math.sin(w) - Math.sin(O) * Math.cos(w) * Math.cos(i)) * yv;
    const y = (Math.sin(O) * Math.cos(w) + Math.cos(O) * Math.sin(w) * Math.cos(i)) * xv
      + (-Math.sin(O) * Math.sin(w) + Math.cos(O) * Math.cos(w) * Math.cos(i)) * yv;
    pts.push([x, y]);
  }
  return pts;
}
