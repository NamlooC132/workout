// Hypertrophy volume = number of hard sets per muscle group.
//
//  • Only COMPLETED, non-warm-up sets count.
//  • Each set adds the exercise's contribution to each muscle
//    (default: 1 for primary/direct muscles, 0.5 for indirect ones – editable per exercise).
//  • Drop and rest-pause sets count as `settings.dropSetsCount` (1 or 0.5).
//  • Uses the SNAPSHOT stored in the workout, so editing an exercise later doesn't
//    rewrite old weeks.
//
// This is training VOLUME, a rough proxy. It is not a measurement of muscle growth.

import { isWorkSet } from './muscles.js';
import { addDays, startOfWeek, startOfMonth, addMonths } from './util.js';

export function setWeight(set, settings) {
  if (!set.done || !isWorkSet(set)) return 0;
  if (set.type === 'drop') return settings?.dropSetsCount ?? 1;
  return 1;
}

/** { muscle: { total, direct, indirect } } for one workout entry. */
export function entryVolume(entry, settings) {
  const out = {};
  if (entry.skipped) return out;
  const muscles = entry.snapshot?.muscles || {};
  const n = (entry.sets || []).reduce((t, s) => t + setWeight(s, settings), 0);
  if (n === 0) return out;
  for (const [m, c] of Object.entries(muscles)) {
    if (!c || c <= 0) continue;
    const v = n * c;
    const o = (out[m] = out[m] || { total: 0, direct: 0, indirect: 0 });
    o.total += v;
    if (c >= 1) o.direct += v; else o.indirect += v;
  }
  return out;
}

export function mergeVolume(into, add) {
  for (const [m, v] of Object.entries(add)) {
    const o = (into[m] = into[m] || { total: 0, direct: 0, indirect: 0 });
    o.total += v.total; o.direct += v.direct; o.indirect += v.indirect;
  }
  return into;
}

export function workoutVolume(workout, settings) {
  const out = {};
  for (const e of workout.entries || []) mergeVolume(out, entryVolume(e, settings));
  return out;
}

/** Volume of finished workouts with startedAt in [from, to). */
export function volumeBetween(workouts, from, to, settings) {
  const out = {};
  for (const w of workouts) {
    if (w.status !== 'done' || w.startedAt < from || w.startedAt >= to) continue;
    mergeVolume(out, workoutVolume(w, settings));
  }
  return out;
}

export function weekRange(ms, settings) {
  const from = startOfWeek(ms, settings?.weekStart ?? 1);
  return { from, to: addDays(from, 7) };
}

/** Last `count` weeks ending with the week of `ms`: [{ from, to, volume }], oldest first. */
export function weeklySeries(workouts, ms, count, settings) {
  const { from } = weekRange(ms, settings);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const f = addDays(from, -7 * i);
    const t = addDays(f, 7);
    out.push({ from: f, to: t, volume: volumeBetween(workouts, f, t, settings) });
  }
  return out;
}

export function monthRange(ms) {
  const from = startOfMonth(ms);
  return { from, to: addMonths(from, 1) };
}

/** Status of a weekly value vs target {min, max}: 'low' | 'ok' | 'high' | 'none'. */
export function targetStatus(value, target) {
  if (!target || (!target.min && !target.max)) return 'none';
  if (target.min && value < target.min) return 'low';
  if (target.max && value > target.max) return 'high';
  return 'ok';
}

// ---------- Lifted volume (weight × reps) ----------
// Separate from the set counts above: this is the total weight moved in completed,
// non-warm-up sets (rest-pause mini-sets included). Bodyweight exercises use the body
// weight logged closest to the workout.

/**
 * { total, workouts, sets, reps, byMuscle: {m: kg}, byExercise: [{ id, name, kg, sets }] }
 * for finished workouts with startedAt in [from, to). A muscle gets the volume of the
 * exercises where it is a main muscle (contribution ≥ 1).
 * `tonnageOf(set, snap, bw)` and `bodyweightAt(ms)` are passed in (records.js).
 */
export function liftedBetween(workouts, from, to, tonnageOf, bodyweightAt) {
  const out = { total: 0, workouts: 0, sets: 0, reps: 0, byMuscle: {}, byExercise: [] };
  const exMap = new Map();
  for (const w of workouts) {
    if (w.status !== 'done' || w.kind === 'run' || w.startedAt < from || w.startedAt >= to) continue;
    const bw = bodyweightAt(w.startedAt);
    let any = false;
    for (const e of w.entries || []) {
      if (e.skipped) continue;
      let kg = 0, sets = 0;
      for (const s of e.sets || []) {
        if (!s.done || s.type === 'warmup') continue;
        kg += tonnageOf(s, e.snapshot, bw);
        sets++;
        const reps = e.snapshot?.unilateral ? (s.repsL || 0) + (s.repsR || 0) : s.reps || 0;
        out.reps += reps + (s.mini || []).reduce((t, m) => t + (m.done ? m.reps || 0 : 0), 0);
      }
      if (!sets) continue;
      any = true;
      out.total += kg;
      out.sets += sets;
      for (const [m, c] of Object.entries(e.snapshot?.muscles || {})) if (c >= 1) out.byMuscle[m] = (out.byMuscle[m] || 0) + kg;
      const key = e.exerciseId || e.snapshot?.name;
      const x = exMap.get(key) || { id: e.exerciseId, name: e.snapshot?.name || '?', kg: 0, sets: 0 };
      x.kg += kg; x.sets += sets;
      exMap.set(key, x);
    }
    if (any) out.workouts++;
  }
  out.byExercise = [...exMap.values()].sort((a, b) => b.kg - a.kg);
  return out;
}
