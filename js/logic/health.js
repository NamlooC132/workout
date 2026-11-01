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

export function shortcutUrl(from, to) {
  const text = `${shortcutDate(from)}|${shortcutDate(to)}`;
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(text)}`;
}

/** "1,024" → 1024, "5,21" → 5.21, "148.0" → 148. */
export function parseLocaleNumber(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).trim().replace(/\s/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else t = t.replace(',', '.');
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
function parseSamples(text, from, to) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sec = {};
  let cur = null, part = 'v';
  for (const l of lines) {
    const u = l.toUpperCase();
    if (u === 'WL2') continue;
    if (u === 'HR' || u === 'KC' || u === 'DI') { cur = u; part = 'v'; sec[cur] = { v: [], d: [] }; continue; }
    if (l === '@') { part = 'd'; continue; }
    if (!cur) continue;
    if (part === 'v') { const n = parseLocaleNumber(l.replace(/[^\d.,]/g, '')); sec[cur].v.push(n); }
    else sec[cur].d.push(parseShortcutDate(l));
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
  return { hr, kcal, km, found, counts: { hr: hrs.length, kcal: kc.length, km: di.length } };
}

/**
 * Reads the Shortcut's text. Returns { hr, kcal, km } (missing values are null), or null if it isn't
 * Shortcut output. With the WL2 format, from/to choose the readings that belong to the workout.
 */
export function parseHealthText(text, from = null, to = null) {
  if (text && /(^|\n)\s*WL2\s*(\n|$)/i.test(String(text)) && from !== null && to !== null) {
    const r = parseSamples(text, from, to);
    return r.found ? { hr: r.hr, kcal: r.kcal, km: r.km, empty: r.hr === null && r.kcal === null && r.km === null } : null;
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
