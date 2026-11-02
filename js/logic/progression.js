// Progressive overload.
//
// Rules (chosen per exercise):
//   descending – set 1 reaches the TOP of the rep range and each following set may
//                drop by one rep (6–10: 10, 9, 8 …)                      (default)
//   all_max – every working set reached the TOP of the rep range
//   avg     – the average reps of the working sets reached a target
//   custom  – every working set reached N reps (optionally with ≥ X RIR left)
//   per_set – each working set has its own goal, e.g. 12, 12, 11, 11, 10, 10, 9
//
// Extra conditions for ANY rule (decisions documented in the README):
//   • Only completed "straight" working sets count (warm-ups, drop and rest-pause sets are ignored).
//   • All of those sets must be at the same weight.
//   • You must have completed at least as many working sets as the target set count,
//     so doing 1 of 3 sets never triggers an increase.
//   • Suggestions are never applied automatically – the user taps "Apply".
//
// The increase is the exercise's progression step (default exactly 2.5 kg or 5 lbs).
// Assisted exercises progress by REDUCING assistance. Pure bodyweight exercises
// get a "make it harder" message instead of a weight.

import { isProgressionSet } from './muscles.js';
import { setReps } from './model.js';
import { addInDisplayUnit, defaultProgressionStep } from './units.js';

const EPS = 0.001;

/** Parse "12, 12, 11 10" → [12, 12, 11, 10]. */
export function parseSetGoals(text) {
  return (String(text || '').match(/\d+/g) || []).map(Number).filter((n) => n > 0 && n <= 200).slice(0, 20);
}

/**
 * Rep goal for each working set (array, one per set), or null when the rule has no per-set goal.
 * `ex` can be a library exercise or a workout snapshot (both carry repMin/repMax/progression).
 */
export function setGoals(ex, count) {
  const n = Math.max(1, count || ex?.sets || 1);
  const pr = ex?.progression || {};
  const rule = pr.rule || 'descending';
  const top = ex?.repMax || 10;
  if (rule === 'per_set' && pr.setGoals && pr.setGoals.length) {
    return Array.from({ length: n }, (_, i) => pr.setGoals[Math.min(i, pr.setGoals.length - 1)]);
  }
  if (rule === 'descending') return Array.from({ length: n }, (_, i) => Math.max(ex?.repMin || 1, top - i));
  if (rule === 'custom') return Array.from({ length: n }, () => pr.customReps || top);
  return Array.from({ length: n }, () => top);
}

export function progressionStep(exercise, settings) {
  const own = exercise?.progression?.step;
  if (own && own > 0) return own;
  if (settings?.defaultProgressionStep && settings.defaultProgressionStep > 0) return settings.defaultProgressionStep;
  return defaultProgressionStep(settings?.unit || 'kg');
}

/**
 * @param exercise  library exercise (current settings)
 * @param last      { workout, entry } from lastSession() or null
 * @param cfg       effective config { sets, repMin, repMax }
 * @returns {{ status: 'none' } |
 *           { status: 'increase', repMax, lastKg, suggestedKg, step, reason } |
 *           { status: 'harder', repMax, reason } |
 *           { status: 'keep', reason }}
 */
export function evaluateProgression(exercise, last, cfg, settings) {
  if (!last) return { status: 'none' };
  const sets = (last.entry.sets || []).filter((s) => s.done && isProgressionSet(s));
  if (sets.length === 0) return { status: 'none' };

  const targetSets = Math.max(1, cfg.sets || 1);
  if (sets.length < targetSets) {
    return { status: 'keep', reason: `Complete all ${targetSets} working sets to unlock a weight increase.` };
  }

  const type = exercise.type || 'weighted';
  const weights = sets.map((s) => s.kg ?? 0);
  const sameWeight = weights.every((w) => Math.abs(w - weights[0]) < EPS);
  if (type !== 'bodyweight' && !sameWeight) {
    return { status: 'keep', reason: 'Use the same weight on every working set to get a suggestion.' };
  }

  const reps = sets.map(setReps);
  const rule = exercise.progression?.rule || 'descending';
  const repMax = cfg.repMax;
  let hit = false;
  let reason = '';
  if (rule === 'descending') {
    // Target for set i (0-based) is repMax − i, but never below the bottom of the range.
    const targets = reps.map((_, i) => Math.max(cfg.repMin || 1, repMax - i));
    hit = reps.every((r, i) => r >= targets[i]);
    const want = targets.join(', ');
    reason = hit
      ? `You hit ${reps.join(', ')} last time`
      : `Keep this weight – aim for ${want}.`;
  } else if (rule === 'per_set') {
    const targets = setGoals({ ...exercise, repMax }, reps.length);
    hit = reps.every((r, i) => r >= targets[i]);
    reason = hit
      ? `You hit ${reps.join(', ')} last time`
      : `Keep this weight – aim for ${targets.join(', ')}.`;
  } else if (rule === 'avg') {
    const target = exercise.progression?.avgTarget || repMax;
    const avg = reps.reduce((a, b) => a + b, 0) / reps.length;
    hit = avg >= target - EPS;
    reason = hit
      ? `You averaged ${round1(avg)} reps last time (target ${target})`
      : `Average ${round1(avg)} reps – aim for ${target} on average.`;
  } else if (rule === 'custom') {
    const need = exercise.progression?.customReps || repMax;
    const minRir = exercise.progression?.customMinRir;
    hit = reps.every((r) => r >= need);
    if (hit && minRir !== null && minRir !== undefined) {
      hit = sets.every((s) => s.rir !== null && s.rir !== undefined && s.rir >= minRir);
    }
    const rirText = minRir !== null && minRir !== undefined ? ` with ${minRir}+ RIR` : '';
    reason = hit
      ? `You hit ${need} reps${rirText} on every set last time`
      : `Aim for ${need} reps${rirText} on every set.`;
  } else {
    hit = reps.every((r) => r >= repMax);
    reason = hit ? `You hit ${repMax} reps on every set last time` : `Keep this weight – aim for ${repMax} reps on every set.`;
  }

  if (!hit) return { status: 'keep', reason };

  if (type === 'bodyweight') {
    return { status: 'harder', repMax, reason: `${reason} — make it harder (add weight, slow the tempo or use a harder variation).` };
  }

  const step = progressionStep(exercise, settings);
  const unit = settings?.unit || 'kg';
  const lastKg = weights[0];
  const suggestedKg = type === 'assisted'
    ? addInDisplayUnit(lastKg, -step, unit)
    : addInDisplayUnit(lastKg, step, unit);
  return { status: 'increase', repMax, lastKg, suggestedKg, step, reason, assisted: type === 'assisted' };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
