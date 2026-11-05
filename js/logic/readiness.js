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
