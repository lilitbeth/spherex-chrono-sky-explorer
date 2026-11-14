// Official NASA open data APIs (api.nasa.gov, images-api.nasa.gov) with local caching.
// DEMO_KEY is heavily rate-limited (~30 requests/hour/IP); users can paste a free key from
// https://api.nasa.gov in Settings.

const KEY_STORAGE = 'spx.nasaApiKey';
const CACHE_PREFIX = 'spx.cache.';

export function getApiKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || import.meta.env.VITE_NASA_API_KEY || 'DEMO_KEY';
  } catch {
    return 'DEMO_KEY';
  }
}
export function setApiKey(k) {
  try {
    if (k) localStorage.setItem(KEY_STORAGE, k.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function readCache(key, ttlMs) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > ttlMs) return null;
    return v;
  } catch {
    return null;
  }
}
function writeCache(key, v) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v }));
  } catch {
    // Quota exceeded: drop old cache entries and retry once.
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v }));
    } catch {
      /* ignore */
    }
  }
}

async function cachedJson(cacheKey, url, ttlMs, { force = false } = {}) {
  if (!force) {
    const c = readCache(cacheKey, ttlMs);
    if (c) return { data: c, cached: true };
  }
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      msg = j?.error?.message || j?.msg || msg;
    } catch {
      /* not json */
    }
    throw new ApiError(msg, res.status);
  }
  const data = await res.json();
  writeCache(cacheKey, data);
  return { data, cached: false };
}

const HOUR = 3600e3;
export const isoDate = (d) => d.toISOString().slice(0, 10);

// ---- NeoWs ----
export async function neoFeed(start, end, opts) {
  const s = isoDate(start);
  const e = isoDate(end);
  const { data, cached } = await cachedJson(
    `neofeed.${s}.${e}`,
    `https://api.nasa.gov/neo/rest/v1/feed?start_date=${s}&end_date=${e}&api_key=${getApiKey()}`,
    6 * HOUR,
    opts,
  );
  const list = Object.entries(data.near_earth_objects || {}).flatMap(([day, arr]) =>
    arr.map((o) => ({ ...o, _day: day })),
  );
  return { list, count: data.element_count, cached };
}

export async function neoLookup(id) {
  const { data } = await cachedJson(
    `neo.${id}`,
    `https://api.nasa.gov/neo/rest/v1/neo/${id}?api_key=${getApiKey()}`,
    72 * HOUR,
  );
  return data;
}

export async function neoStats() {
  const { data } = await cachedJson('neostats', `https://api.nasa.gov/neo/rest/v1/stats?api_key=${getApiKey()}`, 24 * HOUR);
  return data;
}

// ---- DONKI (Space Weather Database Of Notifications, Knowledge, Information) ----
export async function donkiNotifications(start, end, opts) {
  const s = isoDate(start);
  const e = isoDate(end);
  const { data, cached } = await cachedJson(
    `donki.${s}.${e}`,
    `https://api.nasa.gov/DONKI/notifications?startDate=${s}&endDate=${e}&type=all&api_key=${getApiKey()}`,
    3 * HOUR,
    opts,
  );
  return { list: Array.isArray(data) ? data : [], cached };
}

// ---- NASA Image and Video Library (no key) ----
export async function nasaImages(query = 'SPHEREx') {
  const { data } = await cachedJson(
    `images.${query}`,
    `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`,
    24 * HOUR,
  );
  return (data.collection?.items || [])
    .map((it) => ({
      id: it.data?.[0]?.nasa_id,
      title: it.data?.[0]?.title,
      date: it.data?.[0]?.date_created,
      center: it.data?.[0]?.center,
      description: it.data?.[0]?.description,
      thumb: it.links?.find((l) => l.rel === 'preview')?.href || it.links?.[0]?.href,
    }))
    .filter((x) => x.thumb);
}

// ---- SPHEREx orbital elements (CelesTrak, NORAD 63182) ----
// Snapshot used when CelesTrak is unreachable (epoch 2026-11-14).
const SPHEREX_TLE_FALLBACK = [
  '1 63182U 25047E   26318.05429977  .00000956  00000+0  15185-3 0  9993',
  '2 63182  97.9569 140.1785 0011582  73.9821 286.2663 14.74308339 90127',
];

function parseTle(l1, l2) {
  const yy = Number(l1.slice(18, 20));
  const day = Number(l1.slice(20, 32));
  const epoch = new Date(Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (day - 1) * 86400000);
  return {
    OBJECT_NAME: 'SPHEREX (MIDEX 9)',
    NORAD_CAT_ID: Number(l1.slice(2, 7)),
    EPOCH: epoch.toISOString(),
    INCLINATION: Number(l2.slice(8, 16)),
    RA_OF_ASC_NODE: Number(l2.slice(17, 25)),
    ECCENTRICITY: Number(`0.${l2.slice(26, 33).trim()}`),
    ARG_OF_PERICENTER: Number(l2.slice(34, 42)),
    MEAN_ANOMALY: Number(l2.slice(43, 51)),
    MEAN_MOTION: Number(l2.slice(52, 63)),
    REV_AT_EPOCH: Number(l2.slice(63, 68)),
    line1: l1,
    line2: l2,
  };
}

export async function spherexOMM() {
  const cacheKey = 'spherex.tle';
  const cached = readCache(cacheKey, 6 * HOUR);
  if (cached) return { omm: parseTle(cached[0], cached[1]), live: true, cached: true };
  try {
    const res = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=63182&FORMAT=TLE');
    const lines = (await res.text()).split('\n').map((l) => l.trimEnd()).filter((l) => /^[12] /.test(l));
    if (lines.length < 2) throw new Error('no TLE');
    writeCache(cacheKey, [lines[0], lines[1]]);
    return { omm: parseTle(lines[0], lines[1]), live: true, cached: false };
  } catch {
    return { omm: parseTle(...SPHEREX_TLE_FALLBACK), live: false, cached: false };
  }
}
