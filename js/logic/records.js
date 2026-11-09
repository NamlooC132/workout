// Estimated 1RM, personal records and per-exercise series for charts.

import { isProgressionSet, isWorkSet } from './muscles.js';
import { setReps } from './model.js';

const EPS = 0.001;

/** Epley estimate. 1 rep → the weight itself. */
export function e1rm(weight, reps) {
  if (!weight || weight <= 0 || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/** Body weight (kg) closest before `ms`, else the first one after, else null. */
export function bodyweightAt(measurements, ms) {
  const bw = (measurements || []).filter((m) => m.kind === 'bodyweight').sort((a, b) => a.date - b.date);
  if (bw.length === 0) return null;
  let best = null;
  for (const m of bw) if (m.date <= ms) best = m;
  return (best || bw[0]).value;
}

/**
 * Load used for e1RM & tonnage.
 * weighted: bar/machine weight · dumbbell: per entered value (×2 for tonnage if per hand)
 * bodyweight: BW · weighted_bw: BW + added · assisted: BW − assistance
 */
export function effectiveLoad(set, snap, bw) {
  const kg = set.kg || 0;
  switch (snap?.type) {
    case 'bodyweight': return bw || 0;
    case 'weighted_bw': return (bw || 0) + kg;
    case 'assisted': return bw ? Math.max(0, bw - kg) : 0;
    default: return kg;
  }
}

export function tonnage(set, snap, bw) {
  const load = effectiveLoad(set, snap, bw);
  const mult = snap?.type === 'dumbbell' && snap?.loadMode === 'per_hand' ? 2 : 1;
  const reps = snap?.unilateral ? (set.repsL || 0) + (set.repsR || 0) : setReps(set);
  const mini = (set.mini || []).reduce((t, m) => t + (m.done ? m.reps || 0 : 0), 0); // rest-pause mini-sets
  return load * mult * (reps + mini);
}

/** Summary of one session (one workout entry). */
export function sessionStats(entry, workout, measurements) {
  const snap = entry.snapshot || {};
  const bw = bodyweightAt(measurements, workout.startedAt);
  const work = (entry.sets || []).filter((s) => s.done && isWorkSet(s));
  let topKg = null, bestE1rm = 0, bestSetVolume = 0, bestReps = 0, totalReps = 0, volume = 0;
  for (const s of work) {
    const reps = setReps(s);
    const load = effectiveLoad(s, snap, bw);
    totalReps += snap.unilateral ? (s.repsL || 0) + (s.repsR || 0) : reps;
    volume += tonnage(s, snap, bw);
    bestReps = Math.max(bestReps, reps);
    if (snap.type !== 'bodyweight') {
      if (snap.type === 'assisted') topKg = topKg === null ? (s.kg || 0) : Math.min(topKg, s.kg || 0);
      else topKg = topKg === null ? (s.kg || 0) : Math.max(topKg, s.kg || 0);
    }
    bestE1rm = Math.max(bestE1rm, e1rm(load, reps));
    bestSetVolume = Math.max(bestSetVolume, load * reps);
  }
  return { date: workout.startedAt, topKg, e1rm: bestE1rm, bestReps, totalReps, volume, bestSetVolume, sets: work.length };
}

/**
 * Personal records for an exercise from its history list (newest first).
 * Returns { bestWeight, bestReps, bestE1rm, bestSetVolume, bestSessionVolume } where each is
 * { value, date, workoutId, detail }.
 */
export function personalRecords(list, measurements) {
  const rec = {};
  const consider = (key, value, item, detail, lowerIsBetter = false) => {
    if (value === null || value === undefined || (!lowerIsBetter && value <= 0)) return;
    const cur = rec[key];
    const better = !cur || (lowerIsBetter ? value < cur.value - EPS : value > cur.value + EPS);
    // On ties keep the earliest (that's when the record was first set).
    const tieEarlier = cur && Math.abs(value - cur.value) < EPS && item.workout.startedAt < cur.date;
    if (better || tieEarlier) rec[key] = { value, date: item.workout.startedAt, workoutId: item.workout.id, detail };
  };
  for (const item of list) {
    const snap = item.entry.snapshot || {};
    const bw = bodyweightAt(measurements, item.workout.startedAt);
    let sessionVol = 0;
    for (const s of item.entry.sets || []) {
      if (!s.done || !isWorkSet(s)) continue;
      const reps = setReps(s);
      const load = effectiveLoad(s, snap, bw);
      sessionVol += tonnage(s, snap, bw);
      if (snap.type === 'assisted') consider('bestWeight', s.kg || 0, item, { kg: s.kg, reps }, true);
      else if (snap.type !== 'bodyweight') consider('bestWeight', s.kg || 0, item, { kg: s.kg, reps });
      consider('bestReps', reps, item, { kg: s.kg, reps });
      consider('bestE1rm', e1rm(load, reps), item, { kg: s.kg, reps });
      consider('bestSetVolume', load * reps, item, { kg: s.kg, reps });
    }
    consider('bestSessionVolume', sessionVol, item, null);
  }
  return rec;
}

/**
 * Records broken in one workout: compares each entry against all EARLIER sessions.
 * Returns [{ exerciseId, name, kind, value, detail }].
 */
export function prsInWorkout(workout, history, measurements) {
  const out = [];
  for (const entry of workout.entries || []) {
    if (!entry.exerciseId || !(entry.sets || []).some((s) => s.done)) continue;
    const list = (history.get(entry.exerciseId) || []).filter((x) => x.workout.startedAt < workout.startedAt && x.workout.id !== workout.id);
    if (list.length === 0) continue; // first time doing it isn't a "record"
    const before = personalRecords(list, measurements);
    const now = personalRecords([{ workout, entry }], measurements);
    const kinds = [
      ['bestWeight', 'Heaviest weight'],
      ['bestE1rm', 'Best est. 1RM'],
      ['bestReps', 'Most reps'],
      ['bestSessionVolume', 'Best session volume'],
    ];
    for (const [k, label] of kinds) {
      if (!now[k]) continue;
      const lower = k === 'bestWeight' && entry.snapshot?.type === 'assisted';
      const prev = before[k];
      const beat = !prev || (lower ? now[k].value < prev.value - EPS : now[k].value > prev.value + EPS);
      if (beat && prev) out.push({ exerciseId: entry.exerciseId, name: entry.snapshot?.name || '', kind: label, key: k, value: now[k].value, detail: now[k].detail });
    }
  }
  return out;
}

/** Series for an exercise's charts, oldest first. */
export function exerciseSeries(list, measurements) {
  return list
    .slice()
    .reverse()
    .map((item) => sessionStats(item.entry, item.workout, measurements));
}

/**
 * Stagnation: at least 4 sessions and the best e1RM (or reps for bodyweight) of the last 3
 * sessions is not higher than the best before them.
 */
export function isStalled(list, measurements) {
  if (list.length < 4) return false;
  const stats = list.map((x) => sessionStats(x.entry, x.workout, measurements)); // newest first
  const metric = (s) => (s.e1rm > 0 ? s.e1rm : s.bestReps);
  const recent = Math.max(...stats.slice(0, 3).map(metric));
  const before = Math.max(...stats.slice(3).map(metric));
  return recent <= before + EPS;
}

/** Applied progression events, newest first: [{ date, fromKg, toKg }]. */
export function progressionHistory(list) {
  return list
    .filter((x) => x.entry.progression && x.entry.progression.applied)
    .map((x) => ({ date: x.workout.startedAt, fromKg: x.entry.progression.fromKg, toKg: x.entry.progression.toKg }));
}

export { isProgressionSet };

/**
 * Live PR check while training: does `set` (just completed) beat every earlier session AND
 * every earlier set of this workout? Returns { key, label } or null.
 * Only sets after your first session count (the first time isn't a "record").
 */
export function livePr(entry, set, list, measurements, now = Date.now()) {
  if (!set.done || set.type === 'warmup' || !list || list.length === 0) return null;
  const snap = entry.snapshot || {};
  const bw = bodyweightAt(measurements, now);
  const rec = personalRecords(list, measurements);
  const all = entry.sets || [];
  const idx = all.indexOf(set);
  const earlier = (idx >= 0 ? all.slice(0, idx) : all.filter((s) => s !== set)).filter((s) => s.done && isWorkSet(s));
  const reps = setReps(set);
  const load = effectiveLoad(set, snap, bw);
  const mine = e1rm(load, reps);
  if (snap.type !== 'bodyweight' && rec.bestWeight) {
    const kg = set.kg || 0;
    if (snap.type === 'assisted') {
      const best = Math.min(rec.bestWeight.value, ...earlier.map((s) => s.kg || 0));
      if (kg < best - EPS) return { key: 'bestWeight', label: 'least assistance ever' };
    } else {
      const best = Math.max(rec.bestWeight.value, ...earlier.map((s) => s.kg || 0));
      if (kg > best + EPS) return { key: 'bestWeight', label: 'heaviest ever' };
    }
  }
  const bestE = Math.max(rec.bestE1rm ? rec.bestE1rm.value : 0, ...earlier.map((s) => e1rm(effectiveLoad(s, snap, bw), setReps(s))));
  if (mine > bestE + EPS && mine > 0) return { key: 'bestE1rm', label: 'best estimated 1RM' };
  if (snap.type === 'bodyweight') {
    const bestR = Math.max(rec.bestReps ? rec.bestReps.value : 0, ...earlier.map(setReps));
    if (reps > bestR) return { key: 'bestReps', label: 'most reps ever' };
  }
  return null;
}
