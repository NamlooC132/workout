// Fast lookups over finished workouts: "what did I do last time for this exercise?"

import { isWorkSet } from './muscles.js';

/**
 * Builds { exerciseId → [{ workout, entry }] } for finished workouts, newest first.
 * Only entries with at least one completed set are included.
 */
export function buildHistory(workouts) {
  const map = new Map();
  const done = workouts.filter((w) => w.status === 'done').sort((a, b) => b.startedAt - a.startedAt);
  for (const w of done) {
    for (const e of w.entries || []) {
      if (!e.exerciseId || e.skipped) continue;
      if (!(e.sets || []).some((s) => s.done)) continue;
      if (!map.has(e.exerciseId)) map.set(e.exerciseId, []);
      map.get(e.exerciseId).push({ workout: w, entry: e });
    }
  }
  return map;
}

/**
 * Last finished session for an exercise.
 * Deload workouts are skipped by default so prefill and progression use real training.
 * `beforeMs` limits the search to sessions that started before a time (for editing history).
 */
export function lastSession(history, exerciseId, { includeDeload = false, beforeMs = Infinity, excludeWorkoutId = null } = {}) {
  const list = history.get(exerciseId) || [];
  for (const item of list) {
    if (item.workout.startedAt >= beforeMs) continue;
    if (excludeWorkoutId && item.workout.id === excludeWorkoutId) continue;
    if (!includeDeload && item.workout.deload) continue;
    return item;
  }
  // Only deload sessions exist → fall back to them.
  if (!includeDeload) return lastSession(history, exerciseId, { includeDeload: true, beforeMs, excludeWorkoutId });
  return null;
}

export function completedSets(entry) {
  return (entry?.sets || []).filter((s) => s.done);
}

export function completedWorkSets(entry) {
  return completedSets(entry).filter(isWorkSet);
}
