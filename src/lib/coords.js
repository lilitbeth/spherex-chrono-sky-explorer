// Astronomical coordinate helpers.
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function pad(n, w = 2, d = 0) {
  const s = Math.abs(n).toFixed(d);
  const [i, f] = s.split('.');
  return i.padStart(w, '0') + (f ? `.${f}` : '');
}

export function formatRA(raDeg, decimals = 1) {
  let h = (((raDeg % 360) + 360) % 360) / 15;
  let hh = Math.floor(h);
  let mm = Math.floor((h - hh) * 60);
  let ss = ((h - hh) * 60 - mm) * 60;
  if (Number(ss.toFixed(decimals)) >= 60) {
    ss = 0;
    mm += 1;
  }
  if (mm >= 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }
  return `${pad(hh)}h ${pad(mm)}m ${pad(ss, 2, decimals)}s`;
}

export function formatDec(decDeg, decimals = 0) {
  const sign = decDeg < 0 ? '-' : '+';
  const a = Math.abs(decDeg);
  let dd = Math.floor(a);
  let mm = Math.floor((a - dd) * 60);
  let ss = ((a - dd) * 60 - mm) * 60;
  if (Number(ss.toFixed(decimals)) >= 60) {
    ss = 0;
    mm += 1;
  }
  if (mm >= 60) {
    mm = 0;
    dd += 1;
  }
  return `${sign}${pad(dd)}° ${pad(mm)}′ ${pad(ss, 2, decimals)}″`;
}

/** Parse "RA Dec" in sexagesimal or decimal degrees. Returns {ra, dec} in degrees or null. */
export function parseCoords(text) {
  if (!text) return null;
  const t = text.trim().replace(/[hmsd:°′″'"]/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = t.split(' ');
  const nums = parts.map(Number);
  if (nums.some((n) => Number.isNaN(n))) return null;
  if (nums.length === 2) {
    const [ra, dec] = nums;
    if (ra < 0 || ra >= 360 || dec < -90 || dec > 90) return null;
    return { ra, dec };
  }
  if (nums.length === 6) {
    const ra = (nums[0] + nums[1] / 60 + nums[2] / 3600) * 15;
    const neg = parts[3].startsWith('-');
    const dec = (Math.abs(nums[3]) + nums[4] / 60 + nums[5] / 3600) * (neg ? -1 : 1);
    if (ra >= 360 || Math.abs(dec) > 90) return null;
    return { ra, dec };
  }
  return null;
}

// ---- Frames ----
const EPS = 23.4392911 * D2R; // obliquity J2000

function toVec(lon, lat) {
  const l = lon * D2R;
  const b = lat * D2R;
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
}
function fromVec([x, y, z]) {
  let lon = Math.atan2(y, x) * R2D;
  if (lon < 0) lon += 360;
  return [lon, Math.asin(Math.max(-1, Math.min(1, z))) * R2D];
}
function mul(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}
function transpose(m) {
  return m[0].map((_, i) => m.map((r) => r[i]));
}
// ICRS -> Galactic rotation matrix (Hipparcos definition).
const EQ2GAL = [
  [-0.0548755604162154, -0.873437090234885, -0.4838350155487132],
  [0.4941094278755837, -0.4448296299600112, 0.746982244497219],
  [-0.8676661490190047, -0.1980763734312015, 0.4559837761750669],
];
const GAL2EQ = transpose(EQ2GAL);
const EQ2ECL = [
  [1, 0, 0],
  [0, Math.cos(EPS), Math.sin(EPS)],
  [0, -Math.sin(EPS), Math.cos(EPS)],
];
const ECL2EQ = transpose(EQ2ECL);

export function eqToGal(ra, dec) {
  return fromVec(mul(EQ2GAL, toVec(ra, dec)));
}
export function galToEq(l, b) {
  return fromVec(mul(GAL2EQ, toVec(l, b)));
}
export function eqToEcl(ra, dec) {
  return fromVec(mul(EQ2ECL, toVec(ra, dec)));
}
export function eclToEq(l, b) {
  return fromVec(mul(ECL2EQ, toVec(l, b)));
}

/** Convert a frame position to equatorial. frame: 'equatorial' | 'ecliptic' | 'galactic' */
export function frameToEq(frame, lon, lat) {
  if (frame === 'galactic') return galToEq(lon, lat);
  if (frame === 'ecliptic') return eclToEq(lon, lat);
  return [lon, lat];
}
export function eqToFrame(frame, ra, dec) {
  if (frame === 'galactic') return eqToGal(ra, dec);
  if (frame === 'ecliptic') return eqToEcl(ra, dec);
  return [ra, dec];
}

// ---- Mollweide projection (unit: x in [-2√2, 2√2], y in [-√2, √2]) ----
export function mollweide(lonDeg, latDeg) {
  let lon = lonDeg;
  if (lon > 180) lon -= 360;
  const lambda = -lon * D2R; // astronomical convention: longitude increases to the left
  const phi = latDeg * D2R;
  let theta = phi;
  if (Math.abs(phi) < Math.PI / 2 - 1e-9) {
    for (let i = 0; i < 20; i += 1) {
      const d = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(phi)) / (2 + 2 * Math.cos(2 * theta));
      theta -= d;
      if (Math.abs(d) < 1e-7) break;
    }
  }
  return [((2 * Math.SQRT2) / Math.PI) * lambda * Math.cos(theta), Math.SQRT2 * Math.sin(theta)];
}

export function inverseMollweide(x, y) {
  const s = y / Math.SQRT2;
  if (Math.abs(s) > 1) return null;
  const theta = Math.asin(s);
  const c = Math.cos(theta);
  const lambda = c === 0 ? 0 : (Math.PI * x) / (2 * Math.SQRT2 * c);
  if (Math.abs(lambda) > Math.PI) return null;
  const phi = Math.asin((2 * theta + Math.sin(2 * theta)) / Math.PI);
  let lon = -lambda * R2D;
  if (lon < 0) lon += 360;
  return [lon, phi * R2D];
}

// ---- Time ----
export function dateToMJD(date) {
  return date.getTime() / 86400000 + 40587;
}
export function mjdToDate(mjd) {
  return new Date((mjd - 40587) * 86400000);
}
export function dateToYear(date) {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}
export function mjdToYear(mjd) {
  return dateToYear(mjdToDate(mjd));
}

/** Propagate a position with proper motion (mas/yr, pmRA includes cos δ) from epoch0 to epoch (years). */
export function propagate(ra, dec, pmRA, pmDec, epoch0, epoch) {
  const dt = epoch - epoch0;
  const dDec = (pmDec * dt) / 3.6e6;
  const dRa = (pmRA * dt) / 3.6e6 / Math.cos(dec * D2R);
  return [ra + dRa, dec + dDec];
}

/** Angular separation in degrees. */
export function separation(ra1, dec1, ra2, dec2) {
  const a = toVec(ra1, dec1);
  const b = toVec(ra2, dec2);
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.acos(Math.max(-1, Math.min(1, dot))) * R2D;
}
