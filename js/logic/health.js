// Heart rate, calories and runs.
//
// A website can't read Apple Health, so an Apple Shortcut ("Workout Log Health") does it:
// the app opens the Shortcut with the workout's start|end time, the Shortcut reads Health for
// that window and copies a line like  "WL hr=148 kcal=420 dist=5.21 unit=km"  to the clipboard,
// and the app's Paste button reads it back.
import { addDays, startOfWeek } from './util.js';

export const SHORTCUT_NAME = 'Workout Log Health';

const pad = (n) => String(n).padStart(2, '0');
/** Local time as "yyyy-MM-dd HH:mm:ss" – a format Shortcuts' "Get Dates from Input" understands. */
export function shortcutDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ---- Send a finished workout INTO Apple Health ----
// The Shortcut "Workout to Health" gets the text  "type|start|minutes"  and uses its "Log Workout" action.
// (Log Workout has a start date and a duration, but no end date: Health ends it at start + duration.)
export const HEALTH_WRITE_SHORTCUT = 'Workout to Health';

/** Health type word for an item: 'strength' | 'run' | 'boxing' | 'swimming' | 'cycling' | 'walking' | 'soccer' | 'basketball' | 'yoga' | 'other'. */
export function healthTypeFor(item, known = null) {
  const t = rawHealthType(item);
  // `known` = the type words the user's Shortcut has a branch for; anything else is sent as 'other'.
  if (known && t !== 'other' && !known.includes(t)) return 'other';
  return t;
}

/** "strength, run" → ['strength', 'run'] */
export const parseKnownTypes = (text) => String(text ?? '').toLowerCase().split(/[,\s|]+/).filter(Boolean);

function rawHealthType(item) {
  if (!item) return 'other';
  if (item.kind === 'run') return 'run';
  if (Array.isArray(item.entries)) return 'strength';        // a normal workout
  const n = String(item.name || '').toLowerCase();
  const rules = [['boxing', /box|קראטה|אגרוף/], ['swimming', /swim|שחי/], ['cycling', /cycl|bike|biking|spin|רכיב|אופני/], ['walking', /walk|hike|הליכ|טיול/], ['soccer', /soccer|football|כדורגל/], ['basketball', /basket|כדורסל/], ['yoga', /yoga|יוגה/], ['run', /\brun|jog|ריצ/]];
  for (const [t, re] of rules) if (re.test(n)) return t;
  return 'other';
}

/** Minutes of a finished workout or activity (at least 1). */
export const healthMinutes = (item) => Math.max(1, Math.round(((item.endedAt || item.startedAt) - item.startedAt) / 60000));

export function healthWorkoutText(item, known = null) {
  return `${healthTypeFor(item, known)}|${shortcutDate(item.startedAt)}|${healthMinutes(item)}`;
}

export function healthWorkoutUrl(item, known = null) {
  return `shortcuts://run-shortcut?name=${encodeURIComponent(HEALTH_WRITE_SHORTCUT)}&input=text&text=${encodeURIComponent(healthWorkoutText(item, known))}`;
}

export function shortcutUrl(from, to) {
  const text = `${shortcutDate(from)}|${shortcutDate(to)}`;
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(text)}`;
}

/**
 * Numbers as Shortcuts prints them. A dot is always a decimal point ("1.801" = 1.801);
 * with both separators the last one is the decimal; a single comma is a decimal comma ("5,21");
 * several commas are thousands ("1,024,000"). Scientific notation ("6.5e-05") is fine.
 */
export function parseLocaleNumber(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).trim().replace(/[\s\u00a0\u202f]/g, '');
  const hasDot = t.includes('.'), commas = (t.match(/,/g) || []).length;
  if (hasDot && commas) t = t.lastIndexOf('.') > t.lastIndexOf(',') ? t.replace(/,/g, '') : t.replace(/\./g, '').replace(',', '.');
  else if (commas > 1) t = t.replace(/,/g, '');
  else if (commas === 1) t = t.replace(',', '.');
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/**
 * Dates as Shortcuts prints them: "1 Nov 2026 at 15:14", "Nov 1, 2026 at 3:14 PM",
 * "1 November 2026 at 15:14:05", or ISO "2026-11-01T15:14:05". Returns ms or null.
 */
export function parseShortcutDate(str) {
  if (!str) return null;
  const s = String(str).replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
  const time = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?/);
  let day, mon, year;
  if ((m = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/))) { day = +m[1]; mon = MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()]; year = +m[3]; }
  else if ((m = s.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/))) { mon = MONTHS[m[1].slice(0, 4).toLowerCase()] ?? MONTHS[m[1].slice(0, 3).toLowerCase()]; day = +m[2]; year = +m[3]; }
  else if ((m = s.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/))) { day = +m[1]; mon = +m[2] - 1; year = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
  if (mon === undefined || !year || !day) return null;
  let hh = 0, mm = 0, ss = 0;
  if (time) {
    hh = +time[1]; mm = +time[2]; ss = +(time[3] || 0);
    const ap = time[4] ? time[4].toLowerCase()[0] : null;
    if (ap === 'p' && hh < 12) hh += 12;
    if (ap === 'a' && hh === 12) hh = 0;
  }
  return new Date(year, mon, day, hh, mm, ss).getTime();
}

/**
 * Shortcut format 2 – raw readings with their times; the app keeps those inside [from, to]:
 *   WL2 / HR / values… / @ / dates… / KC / values… / @ / dates… / DI / values… / @ / dates…
 */
function readSections(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sec = {};
  let cur = null, part = 'v';
  for (const l of lines) {
    const u = l.toUpperCase();
    if (u === 'WL2') continue;
    if (u === 'HR' || u === 'KC' || u === 'DI') { cur = u; part = 'v'; sec[cur] = { v: [], d: [], e: [] }; continue; }
    if (l === '@') { part = part === 'v' ? 'd' : 'e'; continue; }
    if (!cur) continue;
    if (part === 'v') sec[cur].v.push(parseLocaleNumber(l.replace(/[^\d.,eE+-]/g, '')));
    else sec[cur][part].push(parseShortcutDate(l));
  }
  return sec;
}

function parseSamples(text, from, to) {
  const sec = readSections(text);
  // Some phones (no Apple Watch) store calories as ONE total per day, stamped at midnight.
  // Those can't be split per workout, so ignore them instead of showing a wrong number.
  const atMidnight = (t) => { if (t === null) return false; const d = new Date(t); return d.getHours() === 0 && d.getMinutes() === 0; };
  for (const k of ['KC', 'DI']) {
    const s = sec[k];
    if (s && s.d.length && s.d.filter(atMidnight).length > s.d.length / 2) { s.v = []; s.d = []; s.daily = true; }
  }
  const lo = from - 60000, hi = to + 60000;
  const pick = (k) => {
    const s = sec[k];
    if (!s) return [];
    const out = [];
    const n = Math.min(s.v.length, s.d.length);
    for (let i = 0; i < n; i++) if (s.v[i] !== null && s.d[i] !== null && s.d[i] >= lo && s.d[i] <= hi) out.push(s.v[i]);
    return out;
  };
  const hrs = pick('HR'), kc = pick('KC'), di = pick('DI');
  const sum = (a) => a.reduce((t, x) => t + x, 0);
  const hr = hrs.length ? Math.round(sum(hrs) / hrs.length) : null;
  const kcal = kc.length ? Math.round(sum(kc)) : null;
  const km = di.length && sum(di) > 0.01 ? Math.round(sum(di) * 100) / 100 : null;
  const found = Object.keys(sec).length > 0;
  return { hr, kcal, km, found, dailyKcal: !!sec.KC?.daily, counts: { hr: hrs.length, kcal: kc.length, km: di.length } };
}

/**
 * Reads the Shortcut's text. Returns { hr, kcal, km } (missing values are null), or null if it isn't
 * Shortcut output. With the WL2 format, from/to choose the readings that belong to the workout.
 */
export function parseHealthText(text, from = null, to = null) {
  if (text && /(^|\n)\s*WL2\s*(\n|$)/i.test(String(text)) && from !== null && to !== null) {
    const r = parseSamples(text, from, to);
    return r.found ? { hr: r.hr, kcal: r.kcal, km: r.km, empty: r.hr === null && r.kcal === null && r.km === null, dailyKcal: r.dailyKcal } : null;
  }
  return parseHealthTextV1(text);
}

function parseHealthTextV1(text) {
  if (!text) return null;
  const s = String(text);
  const grab = (key) => {
    const m = s.match(new RegExp(`${key}\\s*[=:]\\s*([\\d.,\\s]*\\d)`, 'i'));
    return m ? parseLocaleNumber(m[1]) : null;
  };
  let hr = grab('hr');
  let kcal = grab('kcal');
  let dist = grab('dist');
  const unitM = s.match(/unit\s*[=:]\s*([a-z]+)/i);
  const unit = unitM ? unitM[1].toLowerCase() : 'km';
  let km = dist;
  if (dist !== null) {
    if (unit.startsWith('mi')) km = dist * 1.609344;
    else if (unit === 'm') km = dist / 1000;
    else if (unit === 'yd') km = dist * 0.0009144;
  }
  if (hr !== null) hr = hr > 20 && hr < 250 ? Math.round(hr) : null;
  if (kcal !== null) kcal = kcal > 0 && kcal < 10000 ? Math.round(kcal) : null;
  if (km !== null) km = km > 0.01 && km < 500 ? Math.round(km * 100) / 100 : null;
  if (hr === null && kcal === null && km === null) return null;
  return { hr, kcal, km };
}

// ---------- Runs ----------
export const isRun = (w) => w && w.kind === 'run';

export function runDurationS(w) {
  return Math.max(0, Math.round((w.endedAt - w.startedAt) / 1000));
}

/** Seconds per km, or null. */
export function paceS(w) {
  const km = w.run?.km;
  const s = runDurationS(w);
  return km > 0 && s > 0 ? s / km : null;
}

export function fmtPace(sPerKm) {
  if (!sPerKm || !Number.isFinite(sPerKm)) return '–';
  const m = Math.floor(sPerKm / 60), s = Math.round(sPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${pad(s)}`;
}

export function fmtRunTime(totalS) {
  const hh = Math.floor(totalS / 3600), mm = Math.floor((totalS % 3600) / 60), ss = totalS % 60;
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

export function fmtKm(km) {
  return km === null || km === undefined ? '–' : `${(Math.round(km * 100) / 100).toFixed(km < 10 ? 2 : 1)} km`;
}

/** Running summary for the Progress tab. runs = done runs, newest first. */
export function runStats(runs, now, weekStart = 1, weeks = 12) {
  const thisWeek = startOfWeek(now, weekStart);
  const weekly = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(thisWeek, -7 * i), to = addDays(from, 7);
    const list = runs.filter((r) => r.startedAt >= from && r.startedAt < to);
    weekly.push({ from, km: list.reduce((t, r) => t + (r.run?.km || 0), 0), count: list.length });
  }
  const withPace = runs.filter((r) => paceS(r) && r.run.km >= 1);
  const best = (list) => list.reduce((b, r) => (!b || paceS(r) < paceS(b) ? r : b), null);
  const fastest = best(withPace);
  const fastest5k = best(withPace.filter((r) => r.run.km >= 5));
  const longest = runs.reduce((b, r) => (!b || (r.run?.km || 0) > (b.run?.km || 0) ? r : b), null);
  const last4 = weekly.slice(-4).reduce((t, w) => t + w.km, 0);
  const prev4 = weekly.slice(-8, -4).reduce((t, w) => t + w.km, 0);
  const recent = withPace.filter((r) => r.startedAt >= addDays(thisWeek, -21));
  const recentKm = recent.reduce((t, r) => t + r.run.km, 0);
  const recentPace = recentKm ? recent.reduce((t, r) => t + runDurationS(r), 0) / recentKm : null;
  return { weekly, fastest, fastest5k, longest, last4, prev4, recentPace, total: runs.length, totalKm: runs.reduce((t, r) => t + (r.run?.km || 0), 0) };
}

/**
 * Finds runs in the Shortcut's distance readings (last 2 days), newest first:
 * [{ from, to, km }]. A reading counts as running when its speed is ≥ 6.5 km/h.
 * Uses each reading's end time when the Shortcut sends it (3rd list); otherwise estimates it.
 */
export const RUN_SPEED_KMH = 6.5;
export function detectRuns(text) {
  if (!text || !/(^|\n)\s*WL2\s*(\n|$)/i.test(String(text))) return null;
  const di = readSections(text).DI;
  if (!di) return [];
  const MIN = 60000;
  const raw = [];
  for (let i = 0; i < Math.min(di.v.length, di.d.length); i++) {
    if (di.v[i] === null || di.d[i] === null) continue;
    raw.push({ s: di.d[i], e: di.e[i] ?? null, km: di.v[i] });
  }
  raw.sort((a, b) => a.s - b.s);
  // Daily totals at midnight can't be used.
  if (raw.length && raw.filter((r) => { const d = new Date(r.s); return d.getHours() === 0 && d.getMinutes() === 0; }).length > raw.length / 2) return [];
  raw.forEach((r, i) => {
    if (!(r.e > r.s)) {
      const next = raw[i + 1];
      r.e = Math.min(next ? next.s : r.s + 10 * MIN, r.s + 10 * MIN);
      if (r.e <= r.s) r.e = r.s + MIN; // same-minute timestamps (no seconds)
    }
  });
  const isRun = (r) => r.km / ((r.e - r.s) / 3600000) >= RUN_SPEED_KMH && r.km >= 0.05;
  const runs = [];
  let cur = null;
  for (const r of raw) {
    if (!isRun(r)) {
      // a short slower bit (stopping at a light) doesn't end the run
      if (cur && r.e - r.s <= 3 * MIN && r.s - cur.to <= 3 * MIN) { cur.to = Math.max(cur.to, r.e); cur.km += r.km; }
      continue;
    }
    if (cur && r.s - cur.to <= 4 * MIN) { cur.to = Math.max(cur.to, r.e); cur.km += r.km; }
    else { cur = { from: r.s, to: r.e, km: r.km }; runs.push(cur); }
  }
  return runs
    .filter((r) => r.km >= 0.8 && r.to - r.from >= 5 * MIN)
    .map((r) => ({ ...r, km: Math.round(r.km * 100) / 100 }))
    .sort((a, b) => b.from - a.from);
}
