// Live-workout operations. Every function saves immediately (saveWorkout), so an
// unfinished workout is always restorable after the app is closed or the phone restarts.

import { data, saveWorkout, saveRoutine, deleteWorkout, history, exercisesById, toast } from './store.js';
import { uid, deepClone } from './logic/util.js';
import { newSet, effectiveConfig, exerciseSnapshot, newRoutineItem } from './logic/model.js';
import { lastSession } from './logic/history.js';
import { evaluateProgression } from './logic/progression.js';
import { activeBlock, blockWeek, isDeloadWeek } from './logic/blocks.js';
import { fromDisplayWeight, toDisplayWeight } from './logic/units.js';
import { prsInWorkout } from './logic/records.js';
import { buildHistory } from './logic/history.js';
import { startRest, skipRest, syncWakeLock } from './timer.js';

/** ~20 % lighter, rounded to the weight step (display units). */
function dropWeight(kg, step) {
  if (!kg) return null;
  const unit = data.settings.unit;
  const st = step || 2.5;
  return fromDisplayWeight(Math.max(0, Math.round((toDisplayWeight(kg, unit) * 0.8) / st) * st), unit);
}

/** Creates a workout entry for an exercise with sets prefilled from last time. */
export function makeEntry(exercise, item, workout) {
  const cfg = effectiveConfig(exercise, item);
  const last = lastSession(history(), exercise.id, { excludeWorkoutId: workout?.id });
  const lastSets = last ? (last.entry.sets || []).filter((s) => s.done) : [];
  const lastWarm = lastSets.filter((s) => s.type === 'warmup');
  const lastWork = lastSets.filter((s) => s.type !== 'warmup');
  const lastMain = lastWork.filter((s) => s.type !== 'drop');
  const sets = [];
  for (let i = 0; i < (cfg.warmupSets || 0); i++) {
    const src = lastWarm[i] || null;
    sets.push(newSet({ type: 'warmup', kg: src ? src.kg : null, reps: src ? src.reps : null }));
  }
  for (let i = 0; i < Math.max(1, cfg.sets || 1); i++) {
    const src = lastMain[i] || lastMain[lastMain.length - 1] || null;
    sets.push(newSet({
      type: src && src.type !== 'warmup' ? src.type : data.settings.defaultSetType || 'working',
      kg: src ? src.kg : null,
      reps: src ? src.reps : null,
      repsL: src ? src.repsL : null,
      repsR: src ? src.repsR : null,
    }));
  }
  // Planned drop sets after the last working set: last time's drop weights, else ~20 % lighter.
  const lastDrops = lastWork.filter((s) => s.type === 'drop');
  const mainWork = sets.filter((s) => s.type !== 'warmup');
  for (let i = 0; i < (cfg.dropSets || 0); i++) {
    const src = lastDrops[i] || null;
    const base = mainWork[mainWork.length - 1];
    sets.push(newSet({ type: 'drop', kg: src ? src.kg : dropWeight(base?.kg, cfg.weightStep), reps: src ? src.reps : null }));
  }
  const evalResult = evaluateProgression(exercise, last, cfg, data.settings);
  return {
    id: uid(),
    exerciseId: exercise.id,
    snapshot: exerciseSnapshot(exercise, cfg),
    supersetId: item?.supersetId || null,
    notes: '',
    routineNotes: cfg.routineNotes,
    skipped: false,
    lastSummary: last ? { date: last.workout.startedAt, sets: lastSets.map((s) => ({ type: s.type, kg: s.kg, reps: s.reps, repsL: s.repsL, repsR: s.repsR, rir: s.rir })) } : null,
    progression: { ...evalResult, applied: false, dismissed: false },
    sets,
  };
}

export function startWorkout(routine) {
  const block = activeBlock(data.blocks);
  const deload = isDeloadWeek(block);
  const w = {
    id: uid(),
    routineId: routine ? routine.id : null,
    routineName: routine ? routine.name : 'Quick Workout',
    startedAt: Date.now(),
    endedAt: null,
    status: 'active',
    notes: '',
    deload,
    blockId: block ? block.id : null,
    blockWeek: block ? blockWeek(block) : null,
    deloadApplied: false,
    entries: [],
  };
  const exById = exercisesById();
  // Superset ids are copied per workout so editing one doesn't affect the routine.
  const ssMap = new Map();
  for (const item of routine ? routine.items : []) {
    const ex = exById.get(item.exerciseId);
    if (!ex) continue;
    const e = makeEntry(ex, item, w);
    if (item.supersetId) {
      if (!ssMap.has(item.supersetId)) ssMap.set(item.supersetId, uid());
      e.supersetId = ssMap.get(item.supersetId);
    }
    w.entries.push(e);
  }
  saveWorkout(w);
  syncWakeLock();
  return w;
}

export const save = (w) => saveWorkout(w);

// ---------- Sets ----------
export function addSet(w, entry, type) {
  const last = entry.sets.filter((s) => s.type !== 'warmup' && s.type !== 'drop').slice(-1)[0] || entry.sets.slice(-1)[0];
  const set = newSet({ type: type || (last && last.type !== 'warmup' ? 'working' : data.settings.defaultSetType || 'working'), kg: last ? last.kg : null, reps: last ? last.reps : null, repsL: last?.repsL ?? null, repsR: last?.repsR ?? null });
  if (type === 'warmup') {
    const idx = entry.sets.findIndex((s) => s.type !== 'warmup');
    entry.sets.splice(idx < 0 ? entry.sets.length : idx, 0, { ...set, kg: null, reps: null });
  } else if (type === 'drop') {
    // Drop set: ~20 % lighter than the set before it, rounded to the weight step.
    const prev = entry.sets[entry.sets.length - 1];
    set.kg = dropWeight(prev?.kg, entry.snapshot.weightStep);
    set.reps = null;
    entry.sets.push(set);
  } else {
    // New working sets go before trailing drop sets.
    let idx = entry.sets.length;
    while (idx > 0 && entry.sets[idx - 1].type === 'drop' && type !== 'drop') idx--;
    entry.sets.splice(idx, 0, set);
  }
  save(w);
}

export function removeSet(w, entry, setId) {
  entry.sets = entry.sets.filter((s) => s.id !== setId);
  save(w);
}

/** Order of sets across the workout, alternating within supersets (A1, B1, A2, B2…). */
export function setSequence(w) {
  const seq = [];
  const entries = w.entries.filter((e) => !e.skipped);
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    if (e.supersetId) {
      const group = [e];
      let j = i + 1;
      while (j < entries.length && entries[j].supersetId === e.supersetId) group.push(entries[j++]);
      const rounds = Math.max(...group.map((g) => g.sets.length));
      for (let r = 0; r < rounds; r++) for (const g of group) if (g.sets[r]) seq.push({ entry: g, set: g.sets[r], index: r });
      i = j;
    } else {
      e.sets.forEach((s, r) => seq.push({ entry: e, set: s, index: r }));
      i++;
    }
  }
  return seq;
}

/** Next unticked set – after `afterSet` if given (so skipped warm-ups aren't suggested again). */
export function nextUp(w, afterSet = null) {
  const seq = setSequence(w);
  const start = afterSet ? seq.findIndex((x) => x.set === afterSet) + 1 : 0;
  const n = seq.slice(start).find((x) => !x.set.done) || seq.find((x) => !x.set.done);
  if (!n) return null;
  const workIndex = n.entry.sets.filter((s) => s.type !== 'warmup').indexOf(n.set);
  const label = n.set.type === 'warmup' ? 'warm-up' : `set ${workIndex + 1}`;
  return { ...n, label: `${n.entry.snapshot.name} · ${label}` };
}

/** Tick / untick a set. Returns false (and explains) if the set can't be completed yet. */
export function toggleSet(w, entry, set) {
  if (set.done) {
    set.done = false;
    set.doneAt = null;
    save(w);
    return true;
  }
  const uni = entry.snapshot.unilateral;
  const hasReps = uni ? (set.repsL > 0 || set.repsR > 0) : set.reps > 0;
  const bwType = entry.snapshot.type === 'bodyweight';
  if (!hasReps) {
    toast('Enter your reps first');
    return false;
  }
  if (!bwType && (set.kg === null || set.kg === undefined) && set.type !== 'warmup') {
    set.kg = 0;
  }
  if (data.settings.rirMode === 'required' && set.type !== 'warmup' && (set.rir === null || set.rir === undefined)) {
    toast('Choose RIR (reps in reserve) first');
    return false;
  }
  set.done = true;
  set.doneAt = Date.now();
  if (uni && set.reps === null) set.reps = Math.min(set.repsL || 0, set.repsR || 0) || set.repsL || set.repsR;
  try { navigator.vibrate && navigator.vibrate(15); } catch { /* ignore */ }
  save(w);

  if (data.settings.autoRest) {
    // In a superset, rest only after the last exercise of the round.
    const seq = setSequence(w);
    const pos = seq.findIndex((x) => x.set === set);
    const following = seq[pos + 1];
    const inSameSuperset = entry.supersetId && following && following.entry.supersetId === entry.supersetId && following.entry !== entry && !following.set.done;
    const next = nextUp(w, set);
    if (!inSameSuperset && next) {
      let rest = entry.snapshot.rest || data.settings.defaultRest;
      if (set.type === 'warmup') rest = Math.max(30, Math.round(rest / 2 / 15) * 15);
      startRest(rest, entry.snapshot.name, next.label);
    } else if (!next) {
      skipRest();
    }
  }
  return true;
}

// ---------- Progressive overload ----------
export function applySuggestion(w, entry) {
  const p = entry.progression;
  if (!p || p.status !== 'increase') return;
  for (const s of entry.sets) if (!s.done && s.type !== 'warmup') s.kg = p.suggestedKg;
  entry.progression = { ...p, applied: true, fromKg: p.lastKg, toKg: p.suggestedKg };
  save(w);
}

export function dismissSuggestion(w, entry) {
  entry.progression = { ...entry.progression, dismissed: true };
  save(w);
}

// ---------- Deload ----------
/** Halves working sets (rounded up) and lowers working weights ~10 % (to the weight step). */
export function applyDeload(w) {
  const unit = data.settings.unit;
  for (const e of w.entries) {
    const work = e.sets.filter((s) => s.type !== 'warmup' && !s.done);
    const keep = Math.ceil(e.sets.filter((s) => s.type !== 'warmup').length / 2);
    const doneWork = e.sets.filter((s) => s.type !== 'warmup' && s.done).length;
    let toRemove = Math.max(0, doneWork + work.length - keep);
    for (let i = work.length - 1; i >= 0 && toRemove > 0; i--, toRemove--) e.sets = e.sets.filter((s) => s !== work[i]);
    const step = e.snapshot.weightStep || 2.5;
    for (const s of e.sets) {
      if (s.done || s.type === 'warmup' || !s.kg) continue;
      const disp = toDisplayWeight(s.kg, unit) * 0.9;
      s.kg = fromDisplayWeight(Math.max(0, Math.round(disp / step) * step), unit);
    }
  }
  w.deloadApplied = true;
  save(w);
}

// ---------- Exercises in the workout ----------
export function addExercises(w, exercises) {
  for (const ex of exercises) w.entries.push(makeEntry(ex, null, w));
  save(w);
}

export function removeEntry(w, entryId) {
  w.entries = w.entries.filter((e) => e.id !== entryId);
  save(w);
}

export function toggleSkip(w, entry) {
  entry.skipped = !entry.skipped;
  save(w);
}

/** Replace: keeps anything already logged (as its own entry) and adds the new exercise after it. */
export function replaceEntry(w, entry, exercise) {
  const fresh = makeEntry(exercise, null, w);
  fresh.supersetId = entry.supersetId;
  const idx = w.entries.indexOf(entry);
  if (entry.sets.some((s) => s.done)) {
    entry.sets = entry.sets.filter((s) => s.done);
    w.entries.splice(idx + 1, 0, fresh);
  } else {
    w.entries.splice(idx, 1, fresh);
  }
  save(w);
}

export function moveEntry(w, from, to) {
  const [x] = w.entries.splice(from, 1);
  w.entries.splice(to, 0, x);
  save(w);
}

export function linkSuperset(w, entry) {
  const idx = w.entries.indexOf(entry);
  const next = w.entries[idx + 1];
  if (!next) return;
  const id = entry.supersetId || next.supersetId || uid();
  entry.supersetId = id;
  next.supersetId = id;
  save(w);
}

export function unlinkSuperset(w, entry) {
  const id = entry.supersetId;
  entry.supersetId = null;
  const left = w.entries.filter((e) => e.supersetId === id);
  if (left.length === 1) left[0].supersetId = null;
  save(w);
}

/** Saves the workout's current exercise order, sets and supersets back into its routine. */
export function updateRoutineFromWorkout(w) {
  const r = data.routines.find((x) => x.id === w.routineId);
  if (!r) return false;
  const oldItems = new Map(r.items.map((i) => [i.exerciseId, i]));
  const ssMap = new Map();
  const items = w.entries.filter((e) => e.exerciseId && !e.skipped).map((e) => {
    const base = oldItems.get(e.exerciseId) || newRoutineItem(e.exerciseId);
    const ex = exercisesById().get(e.exerciseId);
    const working = e.sets.filter((s) => s.type !== 'warmup' && s.type !== 'drop').length;
    const warm = e.sets.filter((s) => s.type === 'warmup').length;
    const drops = e.sets.filter((s) => s.type === 'drop').length;
    let ss = null;
    if (e.supersetId) { if (!ssMap.has(e.supersetId)) ssMap.set(e.supersetId, uid()); ss = ssMap.get(e.supersetId); }
    return {
      ...base,
      sets: ex && ex.sets === working ? null : working,
      warmupSets: ex && (ex.warmupSets || 0) === warm ? null : warm,
      dropSets: ex && (ex.dropSets || 0) === drops ? null : drops,
      supersetId: ss,
    };
  });
  saveRoutine({ ...r, items });
  return true;
}

// ---------- Finish / discard ----------
export function uncheckedCount(w) {
  return w.entries.reduce((t, e) => t + (e.skipped ? 0 : e.sets.filter((s) => !s.done).length), 0);
}

export function doneCount(w) {
  return w.entries.reduce((t, e) => t + e.sets.filter((s) => s.done).length, 0);
}

/**
 * mode: 'complete' marks unchecked sets that have reps as done; 'drop' removes them.
 * Returns the PRs set in this workout.
 */
export function finishWorkout(w, mode) {
  for (const e of w.entries) {
    e.sets = e.sets.filter((s) => {
      if (s.done) return true;
      const hasReps = s.reps > 0 || s.repsL > 0 || s.repsR > 0;
      if (mode === 'complete' && hasReps && !e.skipped) {
        s.done = true;
        s.doneAt = Date.now();
        if (s.kg === null && e.snapshot.type !== 'bodyweight') s.kg = 0;
        return true;
      }
      return false;
    });
  }
  w.entries = w.entries.filter((e) => e.sets.length > 0);
  w.endedAt = Date.now();
  w.status = 'done';
  skipRest();
  save(w);
  syncWakeLock();
  const h = buildHistory(data.workouts);
  return prsInWorkout(w, h, data.measurements);
}

export function discardWorkout(w) {
  const copy = deepClone(w);
  skipRest();
  deleteWorkout(w.id);
  syncWakeLock();
  return copy;
}
