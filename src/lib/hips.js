// HiPS access for official NASA/IPAC IRSA surveys (SPHEREx DR1 cube, 2MASS, AllWISE).
// All services below send `Access-Control-Allow-Origin: *`, so pixels can be read in the browser.
import { locateInTile, tilePixelSizeDeg } from './healpix.js';

const IRSA = 'https://irsa.ipac.caltech.edu/data/hips';

// Wavelength (µm) of each of the 102 SPHEREx DR1 cube frames (from the HiPS `properties` file).
export const SPHEREX_WAVELENGTHS = [
  0.753, 0.771, 0.79, 0.809, 0.828, 0.848, 0.868, 0.889, 0.91, 0.932, 0.955, 0.978, 1.001, 1.025, 1.05, 1.075, 1.102,
  1.113, 1.139, 1.167, 1.195, 1.224, 1.254, 1.284, 1.315, 1.346, 1.378, 1.412, 1.446, 1.481, 1.517, 1.554, 1.592,
  1.631, 1.656, 1.695, 1.735, 1.775, 1.818, 1.861, 1.905, 1.949, 1.995, 2.041, 2.089, 2.139, 2.189, 2.24, 2.292,
  2.345, 2.399, 2.445, 2.506, 2.575, 2.646, 2.719, 2.794, 2.871, 2.951, 3.033, 3.118, 3.204, 3.293, 3.383, 3.476,
  3.57, 3.667, 3.768, 3.833, 3.867, 3.901, 3.935, 3.97, 4.005, 4.04, 4.076, 4.112, 4.148, 4.184, 4.22, 4.257, 4.294,
  4.331, 4.368, 4.405, 4.435, 4.467, 4.5, 4.533, 4.566, 4.6, 4.635, 4.669, 4.704, 4.739, 4.773, 4.808, 4.843, 4.879,
  4.915, 4.951, 4.988,
];
// Frames 50 and 51 are the dichroic channels (blank in DR1).
export const SPHEREX_BLANK_FRAMES = [50, 51];
// DR1 observation window (MJD) from the HiPS properties.
export const SPHEREX_DR1_TMIN = 60789.75076;
export const SPHEREX_DR1_TMAX = 61174.49276;

export const SURVEYS = {
  spherex: {
    id: 'spherex',
    url: `${IRSA}/SPHEREx/spherex_allsky_cube`,
    maxOrder: 5,
    format: 'png',
    cube: true,
    cut: [0, 40], // MJy/sr, asinh stretch
    stretch: 'asinh',
    epoch: 2025.84,
    label: 'SPHEREx DR1',
    provider: 'NASA/IPAC IRSA · SPHEREx Science Data Center',
  },
  tmassK: {
    id: 'tmassK',
    url: `${IRSA}/CDS/2MASS/K`,
    maxOrder: 9,
    format: 'jpg',
    epoch: 1999.3,
    lambda: 2.16,
    label: '2MASS Ks',
    provider: 'NASA/IPAC IRSA · 2MASS (UMass/IPAC)',
  },
  tmassJ: {
    id: 'tmassJ',
    url: `${IRSA}/CDS/2MASS/J`,
    maxOrder: 9,
    format: 'jpg',
    epoch: 1999.3,
    lambda: 1.23,
    label: '2MASS J',
    provider: 'NASA/IPAC IRSA · 2MASS',
  },
  wiseW1: {
    id: 'wiseW1',
    url: `${IRSA}/CDS/AllWISE/W1`,
    maxOrder: 8,
    format: 'jpg',
    epoch: 2010.5,
    lambda: 3.4,
    label: 'AllWISE W1',
    provider: 'NASA/IPAC IRSA · WISE (NASA/JPL)',
  },
  wiseW2: {
    id: 'wiseW2',
    url: `${IRSA}/CDS/AllWISE/W2`,
    maxOrder: 8,
    format: 'jpg',
    epoch: 2010.5,
    lambda: 4.6,
    label: 'AllWISE W2',
    provider: 'NASA/IPAC IRSA · WISE (NASA/JPL)',
  },
};

// The visualisation tiles top out around byte 253 (~39 MJy/sr): treat that as saturated.
export const SATURATION_BYTE = 252;

/** Convert an 8-bit SPHEREx HiPS value back to surface brightness (MJy/sr). */
export function spherexByteToMJy(v) {
  // Aladin asinh transfer: y = asinh(10 x) / 3, x in [0,1] between cuts [0, 40].
  const x = Math.sinh((3 * v) / 255) / 10;
  return 40 * x;
}

export function nearestFrame(lambda) {
  let best = 0;
  let bestD = Infinity;
  SPHEREX_WAVELENGTHS.forEach((w, i) => {
    if (SPHEREX_BLANK_FRAMES.includes(i)) return;
    const d = Math.abs(w - lambda);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

function tileUrl(survey, order, npix, frame) {
  const dir = Math.floor(npix / 10000) * 10000;
  const suffix = survey.cube && frame > 0 ? `_${frame}` : '';
  return `${survey.url}/Norder${order}/Dir${dir}/Npix${npix}${suffix}.${survey.format}`;
}

// ---- Tile cache (LRU) ----
const cache = new Map();
const pending = new Map();
const MAX_TILES = 260;

function loadImageData(url) {
  if (cache.has(url)) {
    const v = cache.get(url);
    cache.delete(url);
    cache.set(url, v);
    return Promise.resolve(v);
  }
  if (pending.has(url)) return pending.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      img.src = '';
      pending.delete(url);
      resolve(null);
    }, 25000);
    img.onload = () => {
      clearTimeout(timer);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const data = { w: c.width, h: c.height, px: d.data };
      cache.set(url, data);
      if (cache.size > MAX_TILES) cache.delete(cache.keys().next().value);
      pending.delete(url);
      resolve(data);
    };
    img.onerror = () => {
      clearTimeout(timer);
      pending.delete(url);
      cache.set(url, null); // negative cache: missing tile (no coverage / blank frame)
      resolve(null);
    };
    img.src = url;
  });
  pending.set(url, p);
  return p;
}

function chooseOrder(survey, scaleDeg) {
  let order = 3;
  while (order < survey.maxOrder && tilePixelSizeDeg(order) > scaleDeg * 0.9) order += 1;
  return order;
}

/** Inverse gnomonic projection: pixel offsets (deg, x to the east, y to the north) -> RA/Dec (deg). */
export function tanToSky(ra0, dec0, xDeg, yDeg) {
  const d2r = Math.PI / 180;
  const x = xDeg * d2r;
  const y = yDeg * d2r;
  const rho = Math.hypot(x, y);
  const dec0r = dec0 * d2r;
  if (rho === 0) return [ra0, dec0];
  const c = Math.atan(rho);
  const sinc = Math.sin(c);
  const cosc = Math.cos(c);
  const dec = Math.asin(cosc * Math.sin(dec0r) + (y * sinc * Math.cos(dec0r)) / rho);
  const ra = ra0 * d2r + Math.atan2(x * sinc, rho * Math.cos(dec0r) * cosc - y * Math.sin(dec0r) * sinc);
  let raDeg = ra / d2r;
  raDeg = ((raDeg % 360) + 360) % 360;
  return [raDeg, dec / d2r];
}

/** Gnomonic projection RA/Dec -> offsets in degrees (x east, y north) around (ra0, dec0). */
export function skyToTan(ra0, dec0, ra, dec) {
  const d2r = Math.PI / 180;
  const a = (ra - ra0) * d2r;
  const d = dec * d2r;
  const d0 = dec0 * d2r;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a);
  const x = (Math.cos(d) * Math.sin(a)) / cosc;
  const y = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a)) / cosc;
  return [x / d2r, y / d2r];
}

/**
 * Build a north-up / east-left cutout from a HiPS survey.
 * Returns { w, h, bytes: Uint8ClampedArray (0..255), values: Float32Array (physical or byte), scale, order, coverage }.
 */
export async function getCutout({ survey: surveyId, ra, dec, fovDeg, size = 256, width, height, frame = 0 }) {
  const survey = SURVEYS[surveyId];
  const w = width || size;
  const h = height || size;
  const scale = fovDeg / w; // fovDeg is the horizontal field of view
  const order = chooseOrder(survey, scale);
  const locs = new Array(w * h);
  const urls = new Set();
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const xDeg = -(i - w / 2 + 0.5) * scale; // east to the left
      const yDeg = (h / 2 - j - 0.5) * scale;
      const [r, d] = tanToSky(ra, dec, xDeg, yDeg);
      const loc = locateInTile(order, 9, r, d);
      const url = tileUrl(survey, order, loc.npix, frame);
      loc.url = url;
      locs[j * w + i] = loc;
      urls.add(url);
    }
  }
  const tiles = new Map();
  await Promise.all([...urls].map(async (u) => tiles.set(u, await loadImageData(u))));
  const bytes = new Uint8ClampedArray(w * h);
  const values = new Float32Array(w * h);
  let covered = 0;
  for (let k = 0; k < locs.length; k += 1) {
    const loc = locs[k];
    const t = tiles.get(loc.url);
    if (!t) continue;
    const idx = (loc.y * t.w + loc.x) * 4;
    // luminance (tiles are grayscale for these surveys)
    const v = Math.round((t.px[idx] + t.px[idx + 1] + t.px[idx + 2]) / 3);
    const alpha = t.px[idx + 3];
    if (alpha === 0) continue;
    covered += 1;
    bytes[k] = v;
    values[k] = survey.cube ? spherexByteToMJy(v) : v;
  }
  return { w, h, bytes, values, scale, order, coverage: covered / locs.length, survey: surveyId, frame, ra, dec };
}

/** Sample the SPHEREx surface brightness spectrum (102 frames) with a circular aperture. */
export async function getSpherexSpectrum(ra, dec, { apertureArcsec = 20, onProgress } = {}) {
  const order = SURVEYS.spherex.maxOrder;
  const pixDeg = tilePixelSizeDeg(order);
  const rPix = Math.max(1, apertureArcsec / 3600 / pixDeg);
  const samples = [];
  // Sample points inside aperture and in a background annulus (2.5r..4r).
  const step = pixDeg * 0.9;
  const rIn = rPix * pixDeg;
  for (let y = -4 * rIn; y <= 4 * rIn; y += step) {
    for (let x = -4 * rIn; x <= 4 * rIn; x += step) {
      const r = Math.hypot(x, y);
      let kind = null;
      if (r <= rIn) kind = 'src';
      else if (r >= 2.5 * rIn && r <= 4 * rIn) kind = 'bkg';
      if (!kind) continue;
      const [sr, sd] = tanToSky(ra, dec, x, y);
      samples.push({ kind, ...locateInTile(order, 9, sr, sd) });
    }
  }
  const result = [];
  let done = 0;
  const frames = SPHEREX_WAVELENGTHS.map((_, i) => i);
  const worker = async (i) => {
    const vals = { src: [], bkg: [] };
    let saturated = false;
    const tiles = new Map();
    if (!SPHEREX_BLANK_FRAMES.includes(i)) {
      const npixes = [...new Set(samples.map((s) => s.npix))];
      await Promise.all(npixes.map(async (np) => tiles.set(np, await loadImageData(tileUrl(SURVEYS.spherex, order, np, i)))));
    }
    for (const s of samples) {
      const t = tiles.get(s.npix);
      if (!t) continue;
      const idx = (s.y * t.w + s.x) * 4;
      if (t.px[idx + 3] === 0) continue;
      const b = t.px[idx];
      if (b >= SATURATION_BYTE && s.kind === 'src') saturated = true;
      vals[s.kind].push(spherexByteToMJy(b));
    }
    const mean = (a) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : NaN);
    const median = (a) => {
      if (!a.length) return NaN;
      const s = [...a].sort((p, q) => p - q);
      return s[Math.floor(s.length / 2)];
    };
    const src = mean(vals.src);
    const bkg = median(vals.bkg);
    const sd = vals.bkg.length > 2
      ? Math.sqrt(vals.bkg.reduce((p, c) => p + (c - bkg) ** 2, 0) / (vals.bkg.length - 1))
      : NaN;
    result[i] = {
      frame: i,
      lambda: SPHEREX_WAVELENGTHS[i],
      surface: src, // MJy/sr mean inside aperture
      background: bkg,
      net: src - bkg,
      err: sd / Math.sqrt(Math.max(1, vals.src.length)) + 0.157 / 2, // noise + half quantization step at zero
      saturated,
      blank: SPHEREX_BLANK_FRAMES.includes(i) || !vals.src.length,
      nPix: vals.src.length,
    };
    done += 1;
    if (onProgress) onProgress(done / frames.length);
  };
  // Limited concurrency.
  const queue = [...frames];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (queue.length) await worker(queue.shift());
    }),
  );
  return { bands: result, apertureArcsec, pixelArcsec: pixDeg * 3600 };
}

/** Load the SPHEREx order-3 Allsky preview mosaic for a frame (each tile 64x64 px). */
export async function getAllsky(frame = 0) {
  const suffix = frame > 0 ? `_${frame}` : '';
  return loadImageData(`${SURVEYS.spherex.url}/Norder3/Allsky${suffix}.png`);
}

/** Read an Allsky value at a sky position. Returns byte (0-255) or -1 if no data. */
export function sampleAllsky(allsky, ra, dec) {
  const loc = locateInTile(3, 6, ra, dec);
  const perRow = Math.floor(allsky.w / 64);
  const col = loc.npix % perRow;
  const row = Math.floor(loc.npix / perRow);
  const x = col * 64 + loc.x;
  const y = row * 64 + loc.y;
  const idx = (y * allsky.w + x) * 4;
  if (allsky.px[idx + 3] === 0) return -1;
  return allsky.px[idx];
}

export const IRSA_SPHEREX_DOCS = 'https://irsa.ipac.caltech.edu/Missions/spherex.html';
