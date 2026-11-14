// SPHEREx band metadata and simple spectral modelling (Planck continuum + feature templates).
import { SPHEREX_WAVELENGTHS } from './hips.js';

// Six linear-variable-filter detector bands, 17 channels each.
export const LVF_BANDS = [
  { band: 1, min: 0.75, max: 1.09, R: 39, detector: 'H2RG HgCdTe (2.5 µm)' },
  { band: 2, min: 1.1, max: 1.62, R: 41, detector: 'H2RG HgCdTe (2.5 µm)' },
  { band: 3, min: 1.63, max: 2.42, R: 41, detector: 'H2RG HgCdTe (2.5 µm)' },
  { band: 4, min: 2.42, max: 3.82, R: 35, detector: 'H2RG HgCdTe (5.3 µm)' },
  { band: 5, min: 3.83, max: 4.42, R: 112, detector: 'H2RG HgCdTe (5.3 µm)' },
  { band: 6, min: 4.42, max: 5.0, R: 128, detector: 'H2RG HgCdTe (5.3 µm)' },
];

export function frameInfo(frame) {
  const band = Math.floor(frame / 17) + 1;
  const channel = (frame % 17) + 1;
  return { band, channel, lambda: SPHEREX_WAVELENGTHS[frame], R: LVF_BANDS[band - 1].R };
}

// Diagnostic spectral features in the SPHEREx range.
export const FEATURES = [
  { id: 'ch4a', lambda: 1.66, width: 0.06, label: 'CH₄ 1.66', color: '#ffe04a', kind: 'abs' },
  { id: 'h2o', lambda: 3.05, width: 0.12, label: 'H₂O ice 3.05', color: '#ffe04a', kind: 'abs' },
  { id: 'pah', lambda: 3.3, width: 0.05, label: 'PAH / CH₄ 3.3', color: '#00ffcc', kind: 'any' },
  { id: 'co2', lambda: 4.27, width: 0.05, label: 'CO₂ ice 4.27', color: '#ff2d78', kind: 'abs' },
  { id: 'co', lambda: 4.67, width: 0.06, label: 'CO 4.67', color: '#00ffcc', kind: 'abs' },
];

/** Planck B_nu shape with λ in µm (arbitrary normalisation). */
export function planckNu(lambda, T) {
  const x = 14387.77 / (lambda * T);
  if (x > 700) return 0;
  return 1 / (lambda ** 3 * (Math.exp(x) - 1));
}

const gauss = (l, c, w) => Math.exp(-0.5 * ((l - c) / w) ** 2);

function solve(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-300) return null;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / M[i][i]);
}

/**
 * Weighted linear least squares of the data on [Planck(T), (features…)].
 * Returns { model: number[], chi2r, coeffs, featureAmp: {id: relative amplitude} }
 */
export function fitSpectrum(bands, T, { withFeatures = true } = {}) {
  const pts = bands.filter((b) => !b.blank && !b.saturated && Number.isFinite(b.net) && Number.isFinite(b.err) && b.err > 0);
  if (pts.length < 8) return null;
  const basis = [(l) => planckNu(l, T)];
  // Feature templates need good spectral coverage around each band to be constrained.
  const covered = (f) => pts.filter((p) => Math.abs(p.lambda - f.lambda) < 3 * f.width).length >= 3;
  const feats = withFeatures && pts.length >= 30 ? FEATURES.filter(covered) : [];
  feats.forEach((f) => basis.push((l) => gauss(l, f.lambda, f.width)));
  // Normalise Planck so coefficients are well conditioned.
  const pMax = Math.max(...pts.map((p) => planckNu(p.lambda, T))) || 1;
  const B = (k, l) => (k === 0 ? basis[0](l) / pMax : basis[k](l));
  const n = basis.length;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const y = new Array(n).fill(0);
  pts.forEach((p) => {
    const w = 1 / p.err ** 2;
    for (let i = 0; i < n; i += 1) {
      y[i] += w * B(i, p.lambda) * p.net;
      for (let j = 0; j < n; j += 1) A[i][j] += w * B(i, p.lambda) * B(j, p.lambda);
    }
  });
  const c = solve(A, y);
  if (!c) return null;
  const evalAt = (l) => c.reduce((s, ck, k) => s + ck * B(k, l), 0);
  let chi2 = 0;
  pts.forEach((p) => {
    chi2 += ((p.net - evalAt(p.lambda)) / p.err) ** 2;
  });
  const featureAmp = {};
  feats.forEach((f, k) => {
    const cont = c[0] * B(0, f.lambda);
    featureAmp[f.id] = cont !== 0 ? c[k + 1] / Math.abs(cont) : 0;
  });
  return {
    evalAt,
    chi2r: chi2 / Math.max(1, pts.length - n),
    coeffs: c,
    featureAmp,
    nUsed: pts.length,
  };
}

/** Grid search of the best Planck temperature. */
export function bestTemperature(bands, opts) {
  let best = null;
  for (let T = 200; T <= 6000; T += T < 1000 ? 20 : 100) {
    const f = fitSpectrum(bands, T, opts);
    if (f && (!best || f.chi2r < best.chi2r)) best = { T, ...f };
  }
  return best;
}

/** Mean net surface brightness in a wavelength window. */
export function windowMean(bands, lo, hi) {
  const v = bands.filter((b) => !b.blank && !b.saturated && b.lambda >= lo && b.lambda <= hi && Number.isFinite(b.net));
  if (!v.length) return NaN;
  return v.reduce((s, b) => s + b.net, 0) / v.length;
}

export function synthColor(bands, [l1, h1], [l2, h2]) {
  const a = windowMean(bands, l1, h1);
  const b = windowMean(bands, l2, h2);
  if (!(a > 0) || !(b > 0)) return NaN;
  return -2.5 * Math.log10(a / b);
}

/** ∫ I_ν dν over the band (nW m⁻² sr⁻¹); I_ν in MJy/sr. */
export function integratedIntensity(bands) {
  const v = bands.filter((b) => !b.blank && !b.saturated && Number.isFinite(b.net)).sort((a, b) => a.lambda - b.lambda);
  let s = 0;
  for (let k = 1; k < v.length; k += 1) {
    const nu1 = 2.998e14 / v[k - 1].lambda;
    const nu2 = 2.998e14 / v[k].lambda;
    s += ((v[k - 1].net + v[k].net) / 2) * 1e-20 * (nu1 - nu2);
  }
  return s * 1e9;
}
