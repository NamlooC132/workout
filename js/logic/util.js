// Small helpers shared by logic and UI. No DOM access here (unit-testable in Node).

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export const DAY = 24 * 60 * 60 * 1000;

/** Local date key "2026-10-31". */
export function dateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parses "2026-10-31" as local midnight (ms). */
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Start of the week containing `ms`. weekStart: 0 = Sunday, 1 = Monday. */
export function startOfWeek(ms, weekStart = 1) {
  const d = new Date(startOfDay(ms));
  const diff = (d.getDay() - weekStart + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export function addDays(ms, days) {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function startOfMonth(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function addMonths(ms, n) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function round2(v) {
  return Math.round(v * 100) / 100;
}

export function sum(arr, fn = (x) => x) {
  let t = 0;
  for (const x of arr) t += fn(x);
  return t;
}

export function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function deepClone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/** "1:30" from 90 seconds. */
export function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "47 min" / "1 h 05 min". */
export function fmtDuration(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** Number with up to 2 decimals, no trailing zeros. */
export function fmtNum(v, maxDecimals = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  const r = Math.round(v * 10 ** maxDecimals) / 10 ** maxDecimals;
  return String(r);
}

/** Parses user input accepting "," or "." as decimal separator. */
export function parseNum(text) {
  if (text === null || text === undefined) return null;
  const s = String(text).trim().replace(',', '.');
  if (s === '' || s === '.') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
