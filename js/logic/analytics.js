// Training-level analytics: frequency, streaks, durations, routine summaries.

import { addDays, startOfWeek, sum } from './util.js';
import { effectiveConfig } from './model.js';
import { contributions } from './muscles.js';

/** Workouts per week for the last `count` weeks (oldest first). */
export function weeklyFrequency(workouts, now, count, weekStart = 1) {
  const thisWeek = startOfWeek(now, weekStart);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const from = addDays(thisWeek, -7 * i);
    const to = addDays(from, 7);
    out.push({ from, count: workouts.filter((w) => w.status === 'done' && w.startedAt >= from && w.startedAt < to).length });
  }
  return out;
}

/** Consecutive weeks (ending this week or last week) with at least one workout. */
export function weekStreak(workouts, now, weekStart = 1) {
  const done = workouts.filter((w) => w.status === 'done');
  if (done.length === 0) return 0;
  let week = startOfWeek(now, weekStart);
  const has = (from) => done.some((w) => w.startedAt >= from && w.startedAt < addDays(from, 7));
  if (!has(week)) week = addDays(week, -7); // this week not trained yet → don't break the streak
  let streak = 0;
  while (has(week)) {
    streak++;
    week = addDays(week, -7);
  }
  return streak;
}

/**
 * Summary shown before starting a routine.
 * Estimated duration = per working set (~40 s of work + rest) + warm-ups (~1 min each) + 2 min setup per exercise.
 */
export function routineSummary(routine, exercisesById, lastDoneAt) {
  let workingSets = 0, seconds = 0;
  const muscles = new Map();
  let count = 0;
  for (const item of routine.items || []) {
    const ex = exercisesById.get(item.exerciseId);
    if (!ex) continue;
    count++;
    const cfg = effectiveConfig(ex, item);
    workingSets += cfg.sets;
    seconds += cfg.sets * (40 + (cfg.rest || 90)) + (cfg.warmupSets || 0) * 60 + 120;
    for (const c of contributions(ex)) {
      if (c.value >= 1) muscles.set(c.key, (muscles.get(c.key) || 0) + cfg.sets);
    }
  }
  const targetMuscles = [...muscles.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { exercises: count, workingSets, minutes: Math.round(seconds / 60), targetMuscles, lastDoneAt };
}

export function workoutDuration(w) {
  return Math.max(0, (w.endedAt || Date.now()) - w.startedAt);
}

export function workoutSetCount(w) {
  return sum(w.entries || [], (e) => (e.sets || []).filter((s) => s.done && s.type !== 'warmup').length);
}
