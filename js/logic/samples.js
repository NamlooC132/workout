// Sample exercises (with muscle contributions) and routine templates.
// Added on first launch; everything can be edited or deleted.

import { newExercise, newRoutine, newRoutineItem } from './model.js';

// [name, type, equipment, category, sets, repMin, repMax, rest, muscles, extra]
const LIBRARY = [
  ['Bench Press', 'weighted', 'Barbell', 'Compound', 3, 6, 10, 150, { chest: 1, triceps: 0.5, front_delts: 0.5 }, { notes: 'Shoulder blades back and down' }],
  ['Incline Dumbbell Press', 'dumbbell', 'Dumbbell', 'Compound', 3, 8, 12, 120, { chest: 1, front_delts: 0.5, triceps: 0.5 }, { loadMode: 'per_hand' }],
  ['Overhead Press', 'weighted', 'Barbell', 'Compound', 3, 6, 10, 120, { front_delts: 1, triceps: 0.5, side_delts: 0.5 }],
  ['Cable Fly', 'weighted', 'Cable', 'Isolation', 3, 10, 15, 75, { chest: 1 }],
  ['Lateral Raise', 'dumbbell', 'Dumbbell', 'Isolation', 3, 12, 20, 60, { side_delts: 1 }, { loadMode: 'per_hand', weightStep: 1 }],
  ['Triceps Pushdown', 'weighted', 'Cable', 'Isolation', 3, 10, 15, 60, { triceps: 1 }],
  ['Overhead Triceps Extension', 'weighted', 'Cable', 'Isolation', 3, 10, 15, 60, { triceps: 1 }],
  ['Pull-up', 'weighted_bw', 'Bodyweight', 'Compound', 3, 6, 10, 120, { lats: 1, upper_back: 0.5, biceps: 0.5, rear_delts: 0.5 }],
  ['Lat Pulldown', 'weighted', 'Cable', 'Compound', 3, 8, 12, 90, { lats: 1, upper_back: 0.5, biceps: 0.5 }, { notes: 'Thigh pad: 3' }],
  ['Barbell Row', 'weighted', 'Barbell', 'Compound', 3, 6, 10, 120, { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.5 }],
  ['Seated Cable Row', 'weighted', 'Cable', 'Compound', 3, 10, 12, 90, { upper_back: 1, lats: 0.5, biceps: 0.5, rear_delts: 0.5 }],
  ['Face Pull', 'weighted', 'Cable', 'Isolation', 3, 12, 15, 60, { rear_delts: 1 }],
  ['Dumbbell Curl', 'dumbbell', 'Dumbbell', 'Isolation', 3, 8, 12, 60, { biceps: 1 }, { loadMode: 'per_hand', weightStep: 1 }],
  ['Hammer Curl', 'dumbbell', 'Dumbbell', 'Isolation', 3, 10, 12, 60, { biceps: 1 }, { loadMode: 'per_hand', weightStep: 1 }],
  ['Squat', 'weighted', 'Barbell', 'Compound', 3, 5, 8, 180, { quads: 1, glutes: 0.5 }, { warmupSets: 2 }],
  ['Romanian Deadlift', 'weighted', 'Barbell', 'Compound', 3, 8, 10, 120, { hamstrings: 1, glutes: 0.5, lower_back: 0.5 }],
  ['Leg Press', 'weighted', 'Machine', 'Compound', 3, 10, 12, 120, { quads: 1, glutes: 0.5 }, { notes: 'Seat position 4' }],
  ['Bulgarian Split Squat', 'dumbbell', 'Dumbbell', 'Compound', 3, 8, 12, 90, { quads: 1, glutes: 1 }, { loadMode: 'per_hand', unilateral: true }],
  ['Leg Curl', 'weighted', 'Machine', 'Isolation', 3, 10, 12, 75, { hamstrings: 1 }],
  ['Leg Extension', 'weighted', 'Machine', 'Isolation', 3, 10, 15, 75, { quads: 1 }],
  ['Calf Raise', 'weighted', 'Machine', 'Isolation', 4, 12, 15, 60, { calves: 1 }],
  ['Hanging Leg Raise', 'bodyweight', 'Bodyweight', 'Isolation', 3, 10, 15, 60, { abs: 1 }],
  ['Dips', 'weighted_bw', 'Bodyweight', 'Compound', 3, 8, 12, 90, { chest: 1, triceps: 1, front_delts: 0.5 }],
];

export function sampleExercises(settings) {
  return LIBRARY.map(([name, type, equipment, category, sets, repMin, repMax, rest, muscles, extra = {}]) =>
    newExercise(settings, { name, type, equipment, category, sets, repMin, repMax, rest, muscles, ...extra }));
}

export const TEMPLATES = [
  {
    id: 'ppl', name: 'Push / Pull / Legs', description: '3 routines, train 3–6 days a week',
    routines: [
      ['Push', ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Lateral Raise', 'Triceps Pushdown']],
      ['Pull', ['Lat Pulldown', 'Barbell Row', 'Seated Cable Row', 'Face Pull', 'Dumbbell Curl']],
      ['Legs', ['Squat', 'Romanian Deadlift', 'Leg Press', 'Leg Curl', 'Calf Raise']],
    ],
  },
  {
    id: 'ul', name: 'Upper / Lower', description: '4 routines, 4 days a week',
    routines: [
      ['Upper A', ['Bench Press', 'Barbell Row', 'Overhead Press', 'Lat Pulldown', 'Dumbbell Curl', 'Triceps Pushdown']],
      ['Lower A', ['Squat', 'Romanian Deadlift', 'Leg Extension', 'Calf Raise', 'Hanging Leg Raise']],
      ['Upper B', ['Incline Dumbbell Press', 'Pull-up', 'Cable Fly', 'Seated Cable Row', 'Lateral Raise', 'Hammer Curl']],
      ['Lower B', ['Leg Press', 'Bulgarian Split Squat', 'Leg Curl', 'Calf Raise', 'Hanging Leg Raise']],
    ],
  },
  {
    id: 'fb', name: 'Full Body', description: '3 routines, 3 days a week',
    routines: [
      ['Full Body A', ['Squat', 'Bench Press', 'Barbell Row', 'Lateral Raise', 'Dumbbell Curl']],
      ['Full Body B', ['Romanian Deadlift', 'Overhead Press', 'Lat Pulldown', 'Cable Fly', 'Triceps Pushdown']],
      ['Full Body C', ['Leg Press', 'Incline Dumbbell Press', 'Seated Cable Row', 'Leg Curl', 'Calf Raise']],
    ],
  },
];

/**
 * Builds routines for a template. Reuses library exercises with the same name; missing ones are
 * created from the sample library. Returns { exercises: [new], routines: [new] }.
 */
export function buildTemplate(templateId, existingExercises, settings, startOrder = 0, folder = '') {
  const t = TEMPLATES.find((x) => x.id === templateId);
  if (!t) return { exercises: [], routines: [] };
  const byName = new Map(existingExercises.map((e) => [e.name.toLowerCase(), e]));
  const samples = new Map(sampleExercises(settings).map((e) => [e.name.toLowerCase(), e]));
  const created = [];
  const get = (name) => {
    const k = name.toLowerCase();
    if (byName.has(k)) return byName.get(k);
    const e = samples.get(k);
    byName.set(k, e);
    created.push(e);
    return e;
  };
  const routines = t.routines.map(([name, names], i) =>
    newRoutine({ name, folder, order: startOrder + i, items: names.map((n) => newRoutineItem(get(n).id)) }));
  return { exercises: created, routines };
}
