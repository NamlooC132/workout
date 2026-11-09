// Readiness check (1.27): a short "how do you feel?" before a workout.
//
// Three questions on a 1–5 scale where 5 is always the best answer
// (slept great / lots of energy / not sore at all), plus "sharp pain or a possible injury?".
// The average gives a level:
//   good      (avg ≥ 3.5)  – train as planned, nothing changes
//   moderate  (2.5 – 3.49) – suggest one set fewer on accessory exercises
//   high      (< 2.5)      – suggest ~10 % less weight everywhere and one set fewer on every
//                            exercise, plus a light workout or a rest day
// Nothing here changes a workout by itself – it only describes what to suggest.
//
// Stored on the workout record as `workout.readiness`:
//   { at, skipped: false, sleep, energy, soreness, avg, level, pain, areas: [] }
//   or { at, skipped: true } when the check was skipped.

export const READINESS_QUESTIONS = [
  { key: 'sleep', title: 'Sleep quality', low: 'Poor', high: 'Great' },
  { key: 'energy', title: 'Energy', low: 'Very low', high: 'Very high' },
  { key: 'soreness', title: 'Muscle soreness', low: 'Very sore', high: 'Not sore' },
];

/** Body areas for "sharp pain"; an exercise is involved when one of these muscles works ≥ 50 %. */
export const PAIN_AREAS = [
  { key: 'neck', name: 'Neck', muscles: ['traps'] },
  { key: 'shoulder', name: 'Shoulder', muscles: ['front_delts', 'side_delts', 'rear_delts'] },
  { key: 'chest', name: 'Chest', muscles: ['chest'] },
  { key: 'upper_back', name: 'Upper back', muscles: ['lats', 'upper_back', 'traps'] },
  { key: 'elbow', name: 'Elbow', muscles: ['biceps', 'triceps'] },
  { key: 'wrist', name: 'Wrist', muscles: ['forearms'] },
  { key: 'lower_back', name: 'Lower back', muscles: ['lower_back'] },
  { key: 'abs', name: 'Stomach', muscles: ['abs'] },
  { key: 'hip', name: 'Hip', muscles: ['glutes', 'adductors'] },
  { key: 'knee', name: 'Knee', muscles: ['quads', 'hamstrings'] },
  { key: 'ankle', name: 'Ankle / calf', muscles: ['calves'] },
];

export const LEVELS = {
  good: { title: 'Good to go', tone: 'green' },
  moderate: { title: 'Somewhat tired', tone: 'yellow' },
  high: { title: 'Very tired', tone: 'red' },
};

const valid = (v) => Number.isInteger(v) && v >= 1 && v <= 5;

/** Average of the three answers (rounded to 0.1) and its level, or null if an answer is missing. */
export function readinessScore(answers) {
  const vals = READINESS_QUESTIONS.map((q) => answers?.[q.key]);
  if (!vals.every(valid)) return null;
  const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  return { avg, level: levelFor(avg) };
}

export function levelFor(avg) {
  if (avg >= 3.5) return 'good';
  if (avg >= 2.5) return 'moderate';
  return 'high';
}

/** The record saved on the workout. */
export function readinessRecord(answers, now = Date.now()) {
  const sc = readinessScore(answers);
  if (!sc) return { at: now, skipped: true };
  const areas = answers.pain ? [...new Set(answers.areas || [])].filter((a) => PAIN_AREAS.some((p) => p.key === a)) : [];
  return {
    at: now, skipped: false,
    sleep: answers.sleep, energy: answers.energy, soreness: answers.soreness,
    avg: sc.avg, level: sc.level,
    pain: !!answers.pain, areas,
  };
}

/** Does this muscle map involve any of the painful areas (a muscle working ≥ 50 %)? */
export function involvesAreas(muscles, areas) {
  if (!areas || !areas.length) return false;
  const keys = new Set(PAIN_AREAS.filter((p) => areas.includes(p.key)).flatMap((p) => p.muscles));
  return Object.entries(muscles || {}).some(([k, v]) => keys.has(k) && v >= 0.5);
}

/** Workout entries that use the painful areas (not already skipped). */
export function entriesForAreas(entries, areas) {
  return (entries || []).filter((e) => !e.skipped && involvesAreas(e.snapshot?.muscles, areas));
}

/** Plain-language suggestion lines for a level (shown, never applied by themselves). */
export function levelAdvice(level) {
  if (level === 'moderate') return ['Suggestion: one set fewer on accessory exercises.'];
  if (level === 'high') return [
    'Suggestion: about 10 % less weight on every exercise.',
    'Suggestion: one set fewer on every exercise, including the main lifts.',
    'Or make it a light workout – or take a rest day.',
  ];
  return ['Train as planned – no changes.'];
}

// ---------- Stage 2: main lifts vs accessory exercises ----------
// Main lift = a compound exercise whose main muscle is chest, back, quads or hamstrings.
// exercise.role: null = automatic, or 'major' / 'accessory' chosen by the user in the exercise editor.
export const MAJOR_MUSCLES = ['chest', 'lats', 'upper_back', 'lower_back', 'quads', 'hamstrings'];
export const ROLE_NAMES = { major: 'Main lift', accessory: 'Accessory' };

export function autoRole(ex) {
  const m = ex?.muscles || {};
  const top = Math.max(0, ...Object.values(m));
  const main = Object.keys(m).filter((k) => top > 0 && m[k] === top);
  return ex?.category === 'Compound' && main.some((k) => MAJOR_MUSCLES.includes(k)) ? 'major' : 'accessory';
}

export function exerciseRole(ex) {
  return ex?.role === 'major' || ex?.role === 'accessory' ? ex.role : autoRole(ex);
}

// ---------- Stage 3: the suggested changes (applied only after the user approves) ----------
const isMain = (s) => s.type !== 'warmup' && s.type !== 'drop';

function canDropSet(e) {
  const main = e.sets.filter(isMain);
  return main.length >= 2 && main.some((s) => !s.done);
}
const hasWeight = (e) => e.sets.some((s) => !s.done && s.type !== 'warmup' && s.kg > 0);

/**
 * Changes for this workout. roleOf(entry) → 'major' | 'accessory'.
 * Returns [{ id, entryId, kind: 'skip' | 'removeSet' | 'lighter', role }].
 * In a deload workout only the pain skips are suggested (the deload already lightens it).
 */
export function buildPlan(w, rec, roleOf) {
  if (!w || !rec || rec.skipped) return [];
  const out = [];
  const skip = new Set(rec.pain ? entriesForAreas(w.entries, rec.areas).map((e) => e.id) : []);
  for (const e of w.entries) {
    if (e.skipped) continue;
    const role = roleOf(e);
    if (skip.has(e.id)) { out.push({ id: 'skip:' + e.id, entryId: e.id, kind: 'skip', role }); continue; }
    if (w.deload) continue;
    if (rec.level === 'high' || (rec.level === 'moderate' && role === 'accessory')) {
      if (canDropSet(e)) out.push({ id: 'set:' + e.id, entryId: e.id, kind: 'removeSet', role });
    }
    if (rec.level === 'high' && hasWeight(e)) out.push({ id: 'kg:' + e.id, entryId: e.id, kind: 'lighter', role });
  }
  return out;
}

const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Short summary lines, e.g. "One set fewer on 3 accessory exercises". */
export function planSummary(changes, level) {
  const lines = [];
  const sets = changes.filter((c) => c.kind === 'removeSet');
  const kg = changes.filter((c) => c.kind === 'lighter');
  const skip = changes.filter((c) => c.kind === 'skip');
  if (sets.length) lines.push(level === 'moderate' ? `One set fewer on ${pl(sets.length, 'accessory exercise')}` : `One set fewer on ${pl(sets.length, 'exercise')}`);
  if (kg.length) lines.push(`About 10 % less weight on ${pl(kg.length, 'exercise')}`);
  if (skip.length) lines.push(`Skip ${pl(skip.length, 'exercise')} that use the painful area`);
  return lines;
}

/**
 * Applies the chosen changes to the workout (in place). round(kg, entry) rounds a lighter weight
 * to the exercise's weight step. Returns how many of each kind were applied.
 */
export function applyPlan(w, changes, round, pct = 10) {
  const byId = new Map(w.entries.map((e) => [e.id, e]));
  const counts = { skip: 0, removeSet: 0, lighter: 0 };
  for (const c of changes) {
    const e = byId.get(c.entryId);
    if (!e) continue;
    if (c.kind === 'skip') { e.skipped = true; counts.skip++; }
    if (c.kind === 'removeSet' && canDropSet(e)) {
      const open = e.sets.filter((s) => isMain(s) && !s.done);
      const last = open[open.length - 1];
      e.sets = e.sets.filter((s) => s !== last);
      e.autoWorkSets = e.sets.filter((s) => s.type !== 'warmup' && s.type !== 'drop').length; // set by the app, not the user (no "Save changes?")
      counts.removeSet++;
    }
    if (c.kind === 'lighter') {
      for (const s of e.sets) if (!s.done && s.type !== 'warmup' && s.kg > 0) s.kg = round(s.kg * (1 - pct / 100), e);
      if (e.progression) e.progression = { ...e.progression, dismissed: true }; // no "add weight" banner on a tired day
      counts.lighter++;
    }
  }
  return counts;
}

// ---------- Stage 4: history and deload ----------
export const TIRED_IN_A_ROW = 3;

/** Tired (moderate/high) check-ins in a row, newest first. Skipped checks are ignored. `current` = today's record. */
export function tiredStreak(workouts, current = null, excludeId = null) {
  const recs = workouts
    .filter((w) => w.status === 'done' && w.id !== excludeId && w.readiness && !w.readiness.skipped)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((w) => w.readiness);
  if (current && !current.skipped) recs.unshift(current);
  let n = 0;
  for (const r of recs) { if (r.level === 'good') break; n++; }
  return n;
}

export function shouldSuggestDeload(streak, settings, now = Date.now(), inDeload = false) {
  if (streak < TIRED_IN_A_ROW || inDeload) return false;
  if ((settings.readinessDeloadUntil || 0) > now) return false;
  if (settings.readinessDeloadSnoozedAt && now - settings.readinessDeloadSnoozedAt < 7 * 86400000) return false;
  return true;
}

/** Readiness points for a chart: [{ x: startedAt, y: avg }] oldest first. */
export function readinessSeries(workouts, limit = 30) {
  return workouts
    .filter((w) => w.status === 'done' && w.readiness && !w.readiness.skipped)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-limit)
    .map((w) => ({ x: w.startedAt, y: w.readiness.avg }));
}
