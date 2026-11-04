// Yoga: sessions, pose journal and stats. Pure functions – no storage, no UI.
//
//   session: { id, date (ms, noon of the day), style, minutes, difficulty 1–5|null, feel 1–5|null, notes, createdAt }
//   pose:    { id, name, kind: 'hold' | 'achieve', preset: key|null, order, createdAt }
//   entry:   { id, poseId, date (ms), seconds (hold) | achieved (achieve), note, createdAt }
import { uid, startOfDay, startOfWeek, startOfMonth, addDays, dateKey, DAY } from './util.js';

export const YOGA_STYLES = [
  { key: 'vinyasa', name: 'Vinyasa' },
  { key: 'hatha', name: 'Hatha' },
  { key: 'yin', name: 'Yin' },
  { key: 'ashtanga', name: 'Ashtanga' },
  { key: 'restorative', name: 'Restorative' },
  { key: 'other', name: 'Other' },
];
export const styleName = (key) => YOGA_STYLES.find((s) => s.key === key)?.name || 'Other';

/** Common poses. hold = seconds held; achieve = a pose you work towards doing at all. */
export const PRESET_POSES = [
  { key: 'plank', name: 'Plank', kind: 'hold' },
  { key: 'side_plank', name: 'Side Plank', kind: 'hold' },
  { key: 'downward_dog', name: 'Downward Dog', kind: 'hold' },
  { key: 'tree', name: 'Tree Pose', kind: 'hold' },
  { key: 'warrior_2', name: 'Warrior II', kind: 'hold' },
  { key: 'warrior_3', name: 'Warrior III', kind: 'hold' },
  { key: 'chair', name: 'Chair Pose', kind: 'hold' },
  { key: 'boat', name: 'Boat Pose', kind: 'hold' },
  { key: 'bridge', name: 'Bridge Pose', kind: 'hold' },
  { key: 'pigeon', name: 'Pigeon Pose', kind: 'hold' },
  { key: 'forearm_plank', name: 'Forearm Plank', kind: 'hold' },
  { key: 'dolphin', name: 'Dolphin Pose', kind: 'hold' },
  { key: 'half_moon', name: 'Half Moon', kind: 'hold' },
  { key: 'crow', name: 'Crow Pose', kind: 'achieve' },
  { key: 'headstand', name: 'Headstand', kind: 'achieve' },
  { key: 'handstand', name: 'Handstand', kind: 'achieve' },
  { key: 'forearm_stand', name: 'Forearm Stand', kind: 'achieve' },
  { key: 'wheel', name: 'Wheel Pose', kind: 'achieve' },
  { key: 'splits', name: 'Front Splits', kind: 'achieve' },
  { key: 'king_pigeon', name: 'King Pigeon', kind: 'achieve' },
  { key: 'firefly', name: 'Firefly Pose', kind: 'achieve' },
  { key: 'lotus', name: 'Lotus Pose', kind: 'achieve' },
];

/** A day picked in the app is stored as noon of that day, so time zones never shift it. */
export function dayToMs(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}
export const todayNoon = (now = Date.now()) => dayToMs(dateKey(now));

export function newSession(fields = {}) {
  return { id: uid(), date: todayNoon(), style: 'vinyasa', minutes: 30, difficulty: null, feel: null, notes: '', createdAt: Date.now(), ...fields };
}

export function newPose(fields = {}) {
  return { id: uid(), name: '', kind: 'hold', preset: null, order: 0, createdAt: Date.now(), ...fields };
}

export function newPoseEntry(fields = {}) {
  return { id: uid(), poseId: null, date: todayNoon(), seconds: null, achieved: null, note: '', createdAt: Date.now(), ...fields };
}

const byDate = (a, b) => a.date - b.date || (a.createdAt || 0) - (b.createdAt || 0);

// ---------- Streaks ----------
/** Days in a row with at least one session. Current streak still counts if the last session was yesterday. */
export function yogaStreaks(sessions, now = Date.now()) {
  const days = [...new Set(sessions.map((s) => dateKey(s.date)))].sort();
  if (!days.length) return { current: 0, longest: 0 };
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((dayToMs(days[i]) - dayToMs(days[i - 1])) / DAY);
    run = gap === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const set = new Set(days);
  let day = startOfDay(now);
  if (!set.has(dateKey(day))) day = addDays(day, -1);
  let current = 0;
  while (set.has(dateKey(day))) { current++; day = addDays(day, -1); }
  return { current, longest };
}

// ---------- Totals ----------
export function minutesBetween(sessions, from, to) {
  return sessions.filter((s) => s.date >= from && s.date < to).reduce((a, s) => a + (s.minutes || 0), 0);
}

export function yogaTotals(sessions, now = Date.now(), weekStart = 1) {
  const wk = startOfWeek(now, weekStart);
  const mo = startOfMonth(now);
  return {
    week: minutesBetween(sessions, wk, addDays(wk, 7)),
    month: minutesBetween(sessions, mo, Infinity),
    total: sessions.reduce((a, s) => a + (s.minutes || 0), 0),
    count: sessions.length,
  };
}

/** Minutes per week for the last `weeks` weeks (oldest first). */
export function weeklyMinutes(sessions, now = Date.now(), weeks = 12, weekStart = 1) {
  const cur = startOfWeek(now, weekStart);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const from = addDays(cur, -7 * i);
    out.push({ from, minutes: minutesBetween(sessions, from, addDays(from, 7)) });
  }
  return out;
}

/** [{ style, count, minutes }] most sessions first; styles without sessions are left out. */
export function styleBreakdown(sessions) {
  const out = YOGA_STYLES.map((st) => {
    const list = sessions.filter((s) => (YOGA_STYLES.some((x) => x.key === s.style) ? s.style : 'other') === st.key);
    return { style: st.key, count: list.length, minutes: list.reduce((a, s) => a + (s.minutes || 0), 0) };
  }).filter((x) => x.count > 0);
  return out.sort((a, b) => b.count - a.count || b.minutes - a.minutes);
}

/** Average "how I felt" per week, only weeks that have ratings: [{ x: weekStart, y: avg, n }]. */
export function feelByWeek(sessions, weekStart = 1) {
  const map = new Map();
  for (const s of sessions) {
    if (!(s.feel >= 1)) continue;
    const wk = startOfWeek(s.date, weekStart);
    const m = map.get(wk) || { sum: 0, n: 0 };
    m.sum += s.feel; m.n++;
    map.set(wk, m);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([x, m]) => ({ x, y: Math.round((m.sum / m.n) * 10) / 10, n: m.n }));
}

export function averageFeel(sessions) {
  const r = sessions.filter((s) => s.feel >= 1);
  return r.length ? r.reduce((a, s) => a + s.feel, 0) / r.length : null;
}

// ---------- Pose journal ----------
export const entriesFor = (entries, poseId) => entries.filter((e) => e.poseId === poseId).sort(byDate);

/** Best hold (seconds) and first achievement for a pose. */
export function poseSummary(pose, entries) {
  const list = entriesFor(entries, pose.id);
  const last = list[list.length - 1] || null;
  if (pose.kind === 'achieve') {
    const first = list.find((e) => e.achieved) || null;
    return { count: list.length, last, achieved: !!first, firstAchieved: first ? first.date : null, achievedCount: list.filter((e) => e.achieved).length };
  }
  const holds = list.filter((e) => e.seconds > 0);
  const best = holds.reduce((m, e) => (!m || e.seconds > m.seconds ? e : m), null);
  return { count: list.length, last, best: best ? best.seconds : null, bestDate: best ? best.date : null };
}

/**
 * Is this entry a highlight, compared with every entry dated before it?
 * Returns 'first' (first time achieved / first hold), 'record' (longer hold than ever before) or null.
 */
export function entryHighlight(pose, entry, entries) {
  const before = entries.filter((e) => e.poseId === pose.id && e.id !== entry.id && byDate(e, entry) < 0);
  if (pose.kind === 'achieve') {
    if (!entry.achieved) return null;
    return before.some((e) => e.achieved) ? null : 'first';
  }
  if (!(entry.seconds > 0)) return null;
  const prev = before.filter((e) => e.seconds > 0);
  if (!prev.length) return null; // the very first hold is a starting point, not a record
  return entry.seconds > Math.max(...prev.map((e) => e.seconds)) ? 'record' : null;
}

/** Chart points: hold → seconds per entry (best of the day); achieve → times achieved so far. */
export function poseSeries(pose, entries) {
  const list = entriesFor(entries, pose.id);
  if (pose.kind === 'achieve') {
    let n = 0;
    return list.map((e) => { if (e.achieved) n++; return { x: e.date, y: n, label: e.achieved ? 'Achieved' : 'Not yet' }; });
  }
  const best = new Map();
  for (const e of list) {
    if (!(e.seconds > 0)) continue;
    const k = dateKey(e.date);
    if (!best.has(k) || e.seconds > best.get(k).y) best.set(k, { x: e.date, y: e.seconds });
  }
  return [...best.values()].sort((a, b) => a.x - b.x);
}

export function fmtHold(seconds) {
  if (!(seconds > 0)) return '–';
  const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
  return m ? `${m}:${String(s).padStart(2, '0')} min` : `${s} s`;
}

export function fmtMinutes(min) {
  const m = Math.round(min || 0);
  if (m < 60) return `${m} min`;
  const hh = Math.floor(m / 60), mm = m % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}
