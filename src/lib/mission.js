// SPHEREx survey calendar derived from the DR1 observation window (IRSA HiPS metadata).
import { SPHEREX_DR1_TMIN, SPHEREX_DR1_TMAX } from './hips.js';
import { dateToMJD, mjdToDate } from './coords.js';

// DR1 spans the first two all-sky surveys; each survey lasts ~6 months.
export const SURVEY_LENGTH = (SPHEREX_DR1_TMAX - SPHEREX_DR1_TMIN) / 2;

export function surveys(now = new Date()) {
  const mjd = dateToMJD(now);
  return [1, 2, 3, 4].map((k) => {
    const start = SPHEREX_DR1_TMIN + (k - 1) * SURVEY_LENGTH;
    const end = start + SURVEY_LENGTH;
    const progress = Math.max(0, Math.min(1, (mjd - start) / (end - start)));
    let status = 'planned';
    if (progress >= 1) status = 'done';
    else if (progress > 0) status = 'active';
    return { k, start: mjdToDate(start), end: mjdToDate(end), progress, status, inDR1: k <= 2 };
  });
}

export function currentSurvey(now = new Date()) {
  const s = surveys(now);
  return s.find((x) => x.status === 'active') || s[s.length - 1];
}

export function fmtMonth(date, lang) {
  return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
export function fmtDate(date, lang) {
  return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
