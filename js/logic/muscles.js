// Muscle groups, set types, exercise types and equipment lists.
// Exercise → muscle relationships are NOT hardcoded: every exercise stores its own
// { muscleKey: contribution } map that the user can edit, and users can add
// custom muscle groups in Settings.

export const BASE_MUSCLES = [
  { key: 'chest', name: 'Chest' },
  { key: 'back', name: 'Back' },
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
