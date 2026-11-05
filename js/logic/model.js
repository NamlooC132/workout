// Data shapes, defaults and factory functions.
//
// Stored collections (IndexedDB object stores):
//   exercises    – shared library; history is linked by exercise id, so it is shared across routines
//   routines     – ordered items that point to exercises, with optional per-routine overrides
//   workouts     – one record per workout (status 'active' or 'done'), with a SNAPSHOT of each
//                  exercise's settings so later library edits never rewrite history
//   measurements – body weight & body measurements
//   blocks       – training blocks / phases with a weekly schedule and deload weeks
//   meta         – settings, rest timer, schema version
//
// All weights are kg, all lengths cm. Times are epoch milliseconds.

import { uid } from './util.js';
import { BASE_MUSCLES } from './muscles.js';

export const SCHEMA_VERSION = 3;

export function defaultSettings() {
  const targets = {};
  for (const m of BASE_MUSCLES) targets[m.key] = { min: 10, max: 20 };
  for (const k of ['calves', 'abs', 'front_delts']) targets[k] = { min: 6, max: 16 };
  for (const k of ['traps', 'forearms', 'adductors', 'lower_back']) targets[k] = { min: 0, max: 0 }; // no target by default
  return {
    unit: 'kg',
    lengthUnit: 'cm',
    defaultRest: 90,
    defaultWeightStep: 2.5,          // −/+ buttons, display unit
    defaultProgressionStep: null,    // null = 2.5 kg / 5 lbs
    defaultRule: 'descending',
    defaultRirTarget: null,          // e.g. 2
    rirMode: 'optional',             // 'off' | 'optional' | 'required'
    defaultSetType: 'working',
    defaultWarmupSets: 0,
    defaultDropSets: 0,
    readinessCheck: true,           // short 'how do you feel?' check when a routine starts (1.27)
    readinessDeloadUntil: null,      // deload week started from the readiness check (ms)
    readinessDeloadSnoozedAt: null,  // 'Not now' on the deload suggestion – asks again after 7 days
    showYoga: false,                 // Yoga section (tab + home link) – off until switched on in Settings
    warmupScope: 'chosen',           // 'chosen' = exercises with warm-up sets | 'all' = every weighted exercise
    warmupSteps: [{ pct: 50, reps: 10 }, { pct: 70, reps: 5 }, { pct: 85, reps: 2 }],
    weekStart: 1,                    // 0 = Sunday, 1 = Monday
    indirectContribution: 0.5,
    dropSetsCount: 1,                // drop / rest-pause sets count as 1 (or 0.5) set
    volumeTargets: targets,
    customMuscles: [],
    autoRest: true,
    restAdjustStep: 15,              // seconds for the − / + buttons on the rest timer
    restSound: true,
    restVibrate: true,
    keepAwake: true,
    theme: 'system',                 // 'system' | 'light' | 'dark'
    language: 'en',                  // 'en' | 'he'
    rirDisplay: 'current',           // 'current' (only on the set you're doing) | 'all'
    backupReminder: true,            // weekly 'back up your workouts' card
    backupSnoozeUntil: null,
    deloadSetShare: 0.5,             // deload: keep this share of working sets
    deloadWeightPct: 10,             // deload: use this much less weight (%)
    lastBackupAt: null,
  };
}

export function newExercise(settings, fields = {}) {
  return {
    id: uid(),
    name: '',
    image: null,               // small JPEG data URL
    muscles: {},               // { chest: 1, triceps: 0.5 }
    equipment: 'Barbell',
    category: 'Compound',
    type: 'weighted',          // see EXERCISE_TYPES
    loadMode: 'total',         // dumbbells: 'per_hand' | 'total'
    unilateral: false,         // log left & right reps separately
    sets: 3,
    repMin: 8,
    repMax: 12,
    rest: settings?.defaultRest ?? 90,
    weightStep: settings?.defaultWeightStep ?? 2.5,
    rirTarget: settings?.defaultRirTarget ?? null,
    warmupSets: settings?.defaultWarmupSets ?? 0,
    dropSets: settings?.defaultDropSets ?? 0,   // drop sets after the last working set
    progression: {
      rule: settings?.defaultRule ?? 'descending', // 'descending' | 'all_max' | 'avg' | 'custom'
      avgTarget: null,         // 'avg' rule: average reps needed (default = repMax)
      customReps: null,        // 'custom' rule: every set must reach this many reps…
      customMinRir: null,      // …with at least this many reps in reserve (optional)
      step: null,              // display units; null = settings default (2.5 kg / 5 lb)
    },
    notes: '',                 // permanent technique notes
    role: null,                // readiness check: null = automatic | 'major' (main lift) | 'accessory'
    guide: null,               // optional 'how to' link (else the catalog guide / a video search)
    createdAt: Date.now(),
    ...fields,
  };
}

/** A routine item. Fields left null use the exercise's library defaults. */
export function newRoutineItem(exerciseId, fields = {}) {
  return {
    id: uid(),
    exerciseId,
    sets: null,
    warmupSets: null,
    dropSets: null,
    repMin: null,
    repMax: null,
    rest: null,
    weightStep: null,
    rirTarget: null,
    type: null,                // e.g. 'dumbbell' only in this routine
    loadMode: null,
    unilateral: null,
    progression: null,         // partial override of the exercise's overload rule
    notes: '',                 // routine-specific notes
    supersetId: null,          // items sharing an id are a superset
    ...fields,
  };
}

export function newRoutine(fields = {}) {
  return {
    id: uid(),
    name: 'New routine',
    folder: '',                // optional folder / phase name used to group routines
    order: 0,
    notes: '',
    items: [],
    createdAt: Date.now(),
    ...fields,
  };
}

export function newBlock(fields = {}) {
  return {
    id: uid(),
    name: 'New Block',
    phase: 'Accumulation',
    startDate: null,           // "2026-11-01"
    weeks: 6,
    deloadWeeks: [6],
    schedule: {},              // { 0..6 (weekday): [routineId, …] }
    notes: '',
    createdAt: Date.now(),
    ...fields,
  };
}

export function newSet(fields = {}) {
  return {
    id: uid(),
    type: 'working',
    kg: null,
    reps: null,
    repsL: null,               // unilateral
    repsR: null,
    rir: null,                 // 0…5 (5 = "5+")
    done: false,
    doneAt: null,
    note: '',
    ...fields,
  };
}

/** Effective settings for an exercise inside a routine (routine overrides win). */
export function effectiveConfig(exercise, item) {
  const pick = (k) => (item && item[k] !== null && item[k] !== undefined ? item[k] : exercise[k]);
  return {
    sets: pick('sets'),
    warmupSets: pick('warmupSets') ?? 0,
    dropSets: pick('dropSets') ?? 0,
    repMin: pick('repMin'),
    repMax: pick('repMax'),
    rest: pick('rest'),
    weightStep: pick('weightStep'),
    rirTarget: pick('rirTarget'),
    type: pick('type'),
    loadMode: pick('loadMode'),
    unilateral: !!pick('unilateral'),
    progression: { ...(exercise.progression || {}), ...(item?.progression || {}) },
    routineNotes: item?.notes || '',
  };
}

/** The exercise as it behaves inside a routine (routine overrides applied). */
export function withConfig(exercise, cfg) {
  return { ...exercise, type: cfg.type, loadMode: cfg.loadMode, unilateral: cfg.unilateral, progression: cfg.progression };
}

/** Frozen copy of the exercise stored with each workout entry. */
export function exerciseSnapshot(exercise, cfg) {
  return {
    name: exercise.name,
    muscles: { ...(exercise.muscles || {}) },
    type: cfg.type ?? exercise.type,
    loadMode: cfg.loadMode ?? exercise.loadMode,
    unilateral: cfg.unilateral ?? !!exercise.unilateral,
    repMin: cfg.repMin,
    repMax: cfg.repMax,
    sets: cfg.sets,
    rest: cfg.rest,
    weightStep: cfg.weightStep,
    rirTarget: cfg.rirTarget,
    warmupSets: cfg.warmupSets ?? 0,
    progression: { ...(cfg.progression || exercise.progression || {}) },
  };
}

/** Reps used for progression/records: unilateral sets count the weaker side. */
export function setReps(set) {
  if (set.repsL !== null && set.repsL !== undefined && set.repsR !== null && set.repsR !== undefined) {
    return Math.min(set.repsL, set.repsR);
  }
  if (set.repsL !== null && set.repsL !== undefined) return set.repsL;
  if (set.repsR !== null && set.repsR !== undefined) return set.repsR;
  return set.reps ?? 0;
}
