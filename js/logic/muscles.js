// Muscle groups, set types, exercise types and equipment lists.
// Exercise → muscle relationships are NOT hardcoded: every exercise stores its own
// { muscleKey: contribution } map that the user can edit, and users can add
// custom muscle groups in Settings.

export const BASE_MUSCLES = [
  { key: 'chest', name: 'Chest' },
  { key: 'lats', name: 'Lats' },
  { key: 'upper_back', name: 'Upper back' },
  { key: 'lower_back', name: 'Lower back' },
  { key: 'front_delts', name: 'Front delts' },
  { key: 'side_delts', name: 'Side delts' },
  { key: 'rear_delts', name: 'Rear delts' },
  { key: 'biceps', name: 'Biceps' },
  { key: 'triceps', name: 'Triceps' },
  { key: 'quads', name: 'Quadriceps' },
  { key: 'hamstrings', name: 'Hamstrings' },
  { key: 'glutes', name: 'Glutes' },
  { key: 'calves', name: 'Calves' },
  { key: 'abs', name: 'Abs' },
  { key: 'traps', name: 'Traps' },
  { key: 'forearms', name: 'Forearms' },
  { key: 'adductors', name: 'Adductors' },
];

/** All muscles = built-in + user-defined ones from settings. */
export function allMuscles(settings) {
  const custom = (settings && settings.customMuscles) || [];
  return [...BASE_MUSCLES, ...custom];
}

export function muscleName(key, settings) {
  const m = allMuscles(settings).find((x) => x.key === key);
  return m ? m.name : key;
}

export const SET_TYPES = [
  { key: 'warmup', short: 'W', name: 'Warm-up' },
  { key: 'working', short: '', name: 'Working' },
  { key: 'drop', short: 'D', name: 'Drop set' },
  { key: 'restpause', short: 'RP', name: 'Rest-pause' },
  { key: 'failure', short: 'F', name: 'To failure' },
];

/** Sets used for progressive-overload checks ("straight" working sets). */
export function isProgressionSet(set) {
  return set.type === 'working' || set.type === 'failure' || !set.type;
}

/** Any non-warm-up set. */
export function isWorkSet(set) {
  return set.type !== 'warmup';
}

export const EXERCISE_TYPES = [
  { key: 'weighted', name: 'Weight & reps', hint: 'Barbell, machine, cable…' },
  { key: 'dumbbell', name: 'Dumbbell', hint: 'Weight per hand or total' },
  { key: 'bodyweight', name: 'Bodyweight', hint: 'Reps only' },
  { key: 'weighted_bw', name: 'Weighted bodyweight', hint: 'Added weight, e.g. dips + belt' },
  { key: 'assisted', name: 'Assisted bodyweight', hint: 'Assistance weight – less is harder' },
];

export const EQUIPMENT = ['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Smith machine', 'Bodyweight', 'Kettlebell', 'Band', 'Other'];

export const CATEGORIES = ['Compound', 'Isolation'];

export const PHASES = ['Accumulation', 'Intensification', 'Strength', 'Maintenance', 'Deload', 'Other'];

/** Sorted contribution list: [{key, value}], highest first. */
export function contributions(exercise) {
  const m = (exercise && exercise.muscles) || {};
  return Object.entries(m)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

export function primaryMuscle(exercise) {
  return contributions(exercise)[0]?.key || null;
}

/**
 * Old data had one "back" muscle. Splits it into lats / upper back / lower back,
 * using the built-in catalog when the exercise is known, else the exercise name.
 * Returns a new muscles object (unchanged if there is no "back").
 */
export function splitBackMuscles(muscles, name, catalogMuscles = null) {
  if (!muscles || !(muscles.back > 0)) {
    if (muscles && 'back' in muscles) { const m = { ...muscles }; delete m.back; return m; }
    return muscles;
  }
  const v = muscles.back;
  const out = { ...muscles };
  delete out.back;
  const put = (k, x) => { const r = Math.round(x * 4) / 4; if (r > 0) out[k] = Math.max(out[k] || 0, r); };
  if (catalogMuscles && ['lats', 'upper_back', 'lower_back'].some((k) => catalogMuscles[k])) {
    for (const k of ['lats', 'upper_back', 'lower_back']) if (catalogMuscles[k]) put(k, catalogMuscles[k]);
    return out;
  }
  const n = String(name || '').toLowerCase();
  if (/deadlift|rack pull|good morning|extension|hyperext|superman|rdl/.test(n)) {
    put('lower_back', v);
    if (v >= 1 && /deadlift|rack pull/.test(n) && !/romanian|stiff|rdl/.test(n)) put('upper_back', 0.5);
  } else if (/straight.?arm|pullover|hang/.test(n)) {
    put('lats', v);
  } else if (/pull.?up|chin|pulldown|lat /.test(n)) {
    put('lats', v); put('upper_back', v / 2);
  } else if (/row|face pull|reverse fly|rear delt/.test(n)) {
    if (/single|one.?arm|dumbbell row|kroc|meadows|kettlebell/.test(n)) { put('lats', v); put('upper_back', v / 2); }
    else { put('upper_back', v); put('lats', v / 2); }
  } else {
    put('lats', v); put('upper_back', v / 2);
  }
  return out;
}
