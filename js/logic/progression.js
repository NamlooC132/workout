// Progressive overload.
//
// Rules (chosen per exercise):
//   all_max – every working set reached the TOP of the rep range        (default)
//   avg     – the average reps of the working sets reached a target
//   custom  – every working set reached N reps (optionally with ≥ X RIR left)
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
  const rule = exercise.progression?.rule || 'all_max';
  const repMax = cfg.repMax;
  let hit = false;
  let reason = '';
  if (rule === 'avg') {
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
