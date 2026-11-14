import { useEffect, useRef, useState } from 'react';
import { getCutout } from '../lib/hips.js';
import { renderBytes } from '../lib/colormap.js';

const memo = new Map();

export function cutoutKey(p) {
  return [p.survey, p.ra.toFixed(5), p.dec.toFixed(5), p.fovDeg.toFixed(5), p.width || p.size, p.height || p.size, p.frame || 0].join('|');
}

export function fetchCutout(p) {
  const k = cutoutKey(p);
  if (!memo.has(k)) {
    const prom = getCutout(p).catch((e) => {
      memo.delete(k);
      throw e;
    });
    memo.set(k, prom);
    if (memo.size > 120) memo.delete(memo.keys().next().value);
  }
  return memo.get(k);
}

/** Loads a HiPS cutout; keeps the previous image while a new one loads. */
export function useCutout(params, enabled = true) {
  const [state, setState] = useState({ img: null, loading: false, error: null });
  const key = params && enabled ? cutoutKey(params) : null;
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchCutout(params)
      .then((img) => alive && setState({ img, loading: false, error: null }))
      .catch((error) => alive && setState((s) => ({ ...s, loading: false, error })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function CutoutCanvas({ img, colormap = 'magma', invert = false, stretch = 'linear', smooth = false, className = '', style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (img && ref.current) renderBytes(ref.current, img, { colormap, invert, stretch, smooth });
  }, [img, colormap, invert, stretch, smooth]);
  return <canvas ref={ref} className={className} style={style} />;
}

/** Lazily loaded small sky thumbnail. */
export function SkyThumb({ survey, ra, dec, fovDeg, size = 64, frame = 0, colormap = 'magma', stretch = 'auto', className = '', children }) {
  const holder = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = holder.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((ents) => ents.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const { img, loading } = useCutout({ survey, ra, dec, fovDeg, size, frame }, visible);
  return (
    <div ref={holder} className={`relative overflow-hidden bg-surface-container-lowest ${className}`}>
      {img && <CutoutCanvas img={img} colormap={colormap} stretch={stretch} className="w-full h-full pixelated" />}
      {(!img || loading) && <div className="absolute inset-0 animate-pulse bg-surface-container-high/40" />}
      {children}
    </div>
  );
}
