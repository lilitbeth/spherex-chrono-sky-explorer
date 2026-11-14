// 256-entry color lookup tables and image rendering helpers.

const STOPS = {
  magma: ['#000004', '#2c115f', '#721f81', '#b73779', '#f1605d', '#feb078', '#fcfdbf'],
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  sky: ['#020617', '#0c2340', '#0369a1', '#38bdf8', '#00ffcc', '#e0fffa'],
  neon: ['#0a0a12', '#3d0020', '#b3004e', '#ff2d78', '#ffe04a', '#ffffff'],
  mono: ['#000000', '#ffffff'],
  monoInv: ['#ffffff', '#000000'],
  diverging: ['#ff2d78', '#3d0020', '#0a0a12', '#003d33', '#00ffcc'],
};

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const LUTS = {};

export function lut(name) {
  if (LUTS[name]) return LUTS[name];
  const stops = (STOPS[name] || STOPS.mono).map(hex);
  const out = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t));
    const f = t - k;
    for (let c = 0; c < 3; c += 1) out[i * 3 + c] = stops[k][c] + (stops[k + 1][c] - stops[k][c]) * f;
  }
  LUTS[name] = out;
  return out;
}

export const COLORMAPS = ['magma', 'viridis', 'sky', 'neon', 'mono', 'monoInv'];

function percentile(arr, p) {
  const s = Array.from(arr).filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.max(0, Math.floor((p / 100) * s.length)))];
}

/**
 * Render byte image (0-255) into a canvas with a colormap.
 * opts: { colormap, invert, stretch: 'linear' | 'auto', smooth }
 */
export function renderBytes(canvas, img, { colormap = 'magma', invert = false, stretch = 'linear', smooth = false } = {}) {
  const { w, h } = img;
  let src = img.bytes;
  if (smooth) {
    const out = new Uint8ClampedArray(w * h);
    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        let s = 0;
        let n = 0;
        for (let dj = -1; dj <= 1; dj += 1) {
          for (let di = -1; di <= 1; di += 1) {
            const x = i + di;
            const y = j + dj;
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const wt = di === 0 && dj === 0 ? 4 : di === 0 || dj === 0 ? 2 : 1;
            s += src[y * w + x] * wt;
            n += wt;
          }
        }
        out[j * w + i] = s / n;
      }
    }
    src = out;
  }
  let lo = 0;
  let hi = 255;
  if (stretch === 'auto') {
    lo = percentile(src, 1);
    hi = Math.max(lo + 1, percentile(src, 99.7));
  }
  const table = lut(colormap);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(w, h);
  for (let k = 0; k < w * h; k += 1) {
    let v = Math.round(((src[k] - lo) / (hi - lo)) * 255);
    v = Math.max(0, Math.min(255, v));
    if (invert) v = 255 - v;
    data.data[k * 4] = table[v * 3];
    data.data[k * 4 + 1] = table[v * 3 + 1];
    data.data[k * 4 + 2] = table[v * 3 + 2];
    data.data[k * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}

/** False-colour composite from three cutouts (each auto-stretched). */
export function renderRGB(canvas, r, g, b) {
  const { w, h } = r;
  const chans = [r, g, b].map((img) => {
    const lo = percentile(img.bytes, 1);
    const hi = Math.max(lo + 1, percentile(img.bytes, 99.7));
    return { img, lo, hi };
  });
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(w, h);
  for (let k = 0; k < w * h; k += 1) {
    chans.forEach((c, i) => {
      data.data[k * 4 + i] = Math.max(0, Math.min(255, ((c.img.bytes[k] - c.lo) / (c.hi - c.lo)) * 255));
    });
    data.data[k * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}

/** Normalised difference image A − B rendered with a diverging map. */
export function renderDifference(canvas, a, b) {
  const { w, h } = a;
  const norm = (img) => {
    const med = percentile(img.bytes, 50);
    const top = Math.max(med + 1, percentile(img.bytes, 99.5));
    return Float32Array.from(img.bytes, (v) => (v - med) / (top - med));
  };
  const na = norm(a);
  const nb = norm(b);
  const table = lut('diverging');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(w, h);
  for (let k = 0; k < w * h; k += 1) {
    const d = Math.max(-1, Math.min(1, na[k] - nb[k]));
    const v = Math.round((d + 1) * 127.5);
    data.data[k * 4] = table[v * 3];
    data.data[k * 4 + 1] = table[v * 3 + 1];
    data.data[k * 4 + 2] = table[v * 3 + 2];
    data.data[k * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}
