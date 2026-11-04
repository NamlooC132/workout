// Live-workout operations. Every function saves immediately (saveWorkout), so an
// unfinished workout is always restorable after the app is closed or the phone restarts.

import { data, saveWorkout, saveRoutine, saveExercise, deleteWorkout, history, exercisesById, toast } from './store.js';
import { uid, deepClone } from './logic/util.js';
import { newSet, effectiveConfig, withConfig, exerciseSnapshot, newRoutineItem } from './logic/model.js';
import { lastSession } from './logic/history.js';
import { evaluateProgression } from './logic/progression.js';
import { activeBlock, blockWeek, isDeloadWeek } from './logic/blocks.js';
import { fromDisplayWeight, toDisplayWeight } from './logic/units.js';
import { prsInWorkout, livePr } from './logic/records.js';
import { buildHistory } from './logic/history.js';
import { startRest, skipRest, syncWakeLock } from './timer.js';
import { syncWarmups, warmupCount, canAutoWarmup } from './logic/warmup.js';

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
  const auto = canAutoWarmup(cfg.type);
  for (let i = 0; i < warmupCount(cfg, data.settings); i++) {
    const src = auto ? null : lastWarm[i] || null;
    sets.push(newSet({ type: 'warmup', kg: src ? src.kg : null, reps: src ? src.reps : null, auto }));
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
  const evalResult = evaluateProgression(withConfig(exercise, cfg), last, cfg, data.settings);
  const entry = {
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
  syncWarmups(entry, data.settings);
  return entry;
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

export const save = (w) => {
  // Automatic warm-up sets follow the working weight live.
  for (const e of w.entries || []) syncWarmups(e, data.settings);
  return saveWorkout(w);
};

/** Adds the full automatic warm-up (one set per step) before the working sets. */
export function addWarmups(w, entry) {
  const have = entry.sets.filter((s) => s.type === 'warmup').length;
  const n = Math.max(0, (data.settings.warmupSteps || []).length - have);
  for (let i = 0; i < n; i++) {
    const idx = entry.sets.findIndex((s) => s.type !== 'warmup');
    entry.sets.splice(idx < 0 ? entry.sets.length : idx, 0, newSet({ type: 'warmup', auto: true }));
  }
  save(w);
  return n;
}

/**
 * After an exercise (or its routine settings) is edited, apply the new settings to the
 * active workout right away: rep range, rest, weight step, goals, type, one side …
 * `counts` = how much the editor changed { warmupSets, sets, dropSets } (e.g. +1): that many
 * sets are added to (or unfinished ones removed from) what the workout has now.
 * Returns the number of updated entries.
 */
export function refreshExercise(exerciseId, counts = null) {
  const w = data.workouts.find((x) => x.status === 'active');
  const ex = exercisesById().get(exerciseId);
  if (!w || !ex) return 0;
  const routine = w.routineId ? data.routines.find((r) => r.id === w.routineId) : null;
  const item = routine ? routine.items.find((i) => i.exerciseId === exerciseId) : null;
  let n = 0;
  for (const entry of w.entries) {
    if (entry.exerciseId !== exerciseId) continue;
    const cfg = effectiveConfig(ex, item);
    const old = entry.snapshot || {};
    entry.snapshot = exerciseSnapshot(ex, cfg);
    entry.routineNotes = cfg.routineNotes;
    const isWarm = (s) => s.type === 'warmup';
    const isDrop = (s) => s.type === 'drop';
    const isWork = (s) => !isWarm(s) && !isDrop(s);
    const delta = counts || {
      warmupSets: (cfg.warmupSets ?? 0) - (old.warmupSets ?? cfg.warmupSets ?? 0),
      sets: old.sets ? (cfg.sets || 0) - old.sets : 0,
      dropSets: 0,
    };
    changeCount(entry, isWarm, delta.warmupSets || 0, () => {
      const idx = entry.sets.findIndex((s) => !isWarm(s));
      entry.sets.splice(idx < 0 ? entry.sets.length : idx, 0, newSet({ type: 'warmup', auto: true }));
    });
    changeCount(entry, isWork, delta.sets || 0, () => addSetNoSave(entry), 1);
    changeCount(entry, isDrop, delta.dropSets || 0, () => {
      const base = entry.sets.filter(isWork).slice(-1)[0];
      entry.sets.push(newSet({ type: 'drop', kg: dropWeight(base?.kg, entry.snapshot.weightStep) }));
    });
    // New suggestion for the new rep range (e.g. a lower goal you already hit → add weight),
    // unless it was already applied. A dismissed banner comes back only if the advice changed.
    const p = entry.progression || {};
    if (!p.applied) {
      const last = lastSession(history(), exerciseId, { excludeWorkoutId: w.id });
      const np = evaluateProgression(withConfig(ex, cfg), last, cfg, data.settings);
      const same = np.status === p.status && np.suggestedKg === p.suggestedKg;
      entry.progression = { ...np, applied: false, dismissed: same ? !!p.dismissed : false };
    }
    entry.changedAt = Date.now();
    n++;
  }
  if (n) save(w);
  return n;
}

/** Adds `delta` sets of a kind, or removes −delta unfinished ones from the end (keeps at least `min`). */
function changeCount(entry, match, delta, add, min = 0) {
  for (let i = 0; i < delta; i++) add();
  let remove = -delta;
  let have = entry.sets.filter(match).length;
  for (let i = entry.sets.length - 1; i >= 0 && remove > 0 && have > min; i--) {
    const s = entry.sets[i];
    if (match(s) && !s.done) { entry.sets.splice(i, 1); remove--; have--; }
  }
}

function addSetNoSave(entry) {
  const last = entry.sets.filter((s) => s.type !== 'warmup' && s.type !== 'drop').slice(-1)[0];
  const set = newSet({ type: last ? last.type : data.settings.defaultSetType || 'working', kg: last ? last.kg : null, reps: null });
  let idx = entry.sets.length;
  while (idx > 0 && entry.sets[idx - 1].type === 'drop') idx--;
  entry.sets.splice(idx, 0, set);
}

// ---------- Sets ----------
export function addSet(w, entry, type) {
  const last = entry.sets.filter((s) => s.type !== 'warmup' && s.type !== 'drop').slice(-1)[0] || entry.sets.slice(-1)[0];
  const set = newSet({ type: type || (last && last.type !== 'warmup' ? 'working' : data.settings.defaultSetType || 'working'), kg: last ? last.kg : null, reps: last ? last.reps : null, repsL: last?.repsL ?? null, repsR: last?.repsR ?? null });
  if (type === 'warmup') {
    const idx = entry.sets.findIndex((s) => s.type !== 'warmup');
    entry.sets.splice(idx < 0 ? entry.sets.length : idx, 0, { ...set, kg: null, reps: null, repsL: null, repsR: null, auto: true });
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
    set.pr = null;
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
  // Live personal-record check against all earlier sessions and earlier sets today.
  const pr = entry.exerciseId ? livePr(entry, set, history().get(entry.exerciseId) || [], data.measurements) : null;
  set.pr = pr ? pr.key : null;
  if (pr) toast(`🏆 New PR! ${entry.snapshot.name} – ${pr.label}`, 3500);
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
  const setShare = data.settings.deloadSetShare ?? 0.5;        // keep 50 % of working sets
  const lighter = (data.settings.deloadWeightPct ?? 10) / 100; // 10 % lighter
  for (const e of w.entries) {
    const work = e.sets.filter((s) => s.type !== 'warmup' && !s.done);
    const keep = Math.max(1, Math.ceil(e.sets.filter((s) => s.type !== 'warmup').length * setShare));
    const doneWork = e.sets.filter((s) => s.type !== 'warmup' && s.done).length;
    let toRemove = Math.max(0, doneWork + work.length - keep);
    for (let i = work.length - 1; i >= 0 && toRemove > 0; i--, toRemove--) e.sets = e.sets.filter((s) => s !== work[i]);
    const step = e.snapshot.weightStep || 2.5;
    for (const s of e.sets) {
      if (s.done || s.type === 'warmup' || !s.kg) continue;
      const disp = toDisplayWeight(s.kg, unit) * (1 - lighter);
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

// ---------- Undo ----------
/**
 * Runs `fn` (which changes the workout) and shows a short message with Undo.
 * Undo puts back an exact copy of the workout from before the change.
 */
export function undoable(w, message, fn) {
  const before = deepClone(w);
  fn();
  toast(message, 5000, { text: 'Undo', onClick: () => saveWorkout(before) });
}

/** "Same as previous": copy weight and reps from the set above. */
export function copyPrevious(w, entry, set) {
  const i = entry.sets.indexOf(set);
  const prev = entry.sets.slice(0, i).reverse().find((s) => s.type === set.type || (s.type !== 'warmup' && set.type !== 'warmup'));
  if (!prev) return false;
  set.auto = false;
  set.kg = prev.kg;
  set.reps = prev.reps;
  set.repsL = prev.repsL;
  set.repsR = prev.repsR;
  save(w);
  return true;
}

/** Changing a set's type: a new warm-up set gets automatic weight/reps and moves to the warm-up block. */
export function setType(w, entry, set, type) {
  if (set.type === type) return;
  const wasWarm = set.type === 'warmup';
  set.type = type;
  if (type === 'warmup' && !wasWarm) {
    set.auto = true;
    entry.sets = entry.sets.filter((s) => s !== set);
    const idx = entry.sets.findIndex((s) => s.type !== 'warmup');
    entry.sets.splice(idx < 0 ? entry.sets.length : idx, 0, set);
  } else if (wasWarm) {
    set.auto = false;
  }
  save(w);
}

// ---------- Edit exercise during a workout ----------
// Changes go to this workout only; when it is finished the app asks whether to keep them.
const LIVE_KEYS = ['repMin', 'repMax', 'rest', 'weightStep', 'rirTarget', 'type', 'loadMode', 'unilateral'];
const isWarmSet = (s) => s.type === 'warmup';
const isDropSet = (s) => s.type === 'drop';
const isWorkSet = (s) => !isWarmSet(s) && !isDropSet(s);

/** What the editor shows for an exercise in the open workout: the workout's current state. */
export function liveDraft(entry, exercise) {
  const snap = entry.snapshot || {};
  return {
    ...deepClone(exercise),
    ...Object.fromEntries(LIVE_KEYS.map((k) => [k, snap[k] ?? exercise[k]])),
    unilateral: !!(snap.unilateral ?? exercise.unilateral),
    progression: deepClone(snap.progression || exercise.progression || {}),
    sets: entry.sets.filter(isWorkSet).length,
    warmupSets: entry.sets.filter(isWarmSet).length,
    dropSets: entry.sets.filter(isDropSet).length,
    notes: entry.notes || '',
  };
}

/** Sets the number of sets of one kind: adds new ones or removes unfinished ones from the end. */
function setCount(entry, match, target, add, min = 0) {
  target = Math.max(min, target || 0);
  let have = entry.sets.filter(match).length;
  while (have < target) { add(); have++; }
  for (let i = entry.sets.length - 1; i >= 0 && have > target; i--) {
    if (match(entry.sets[i]) && !entry.sets[i].done) { entry.sets.splice(i, 1); have--; }
  }
}

/** Applies the editor's values to this workout's entry (not to the routine or library). */
export function applyLiveEdit(w, entry, d) {
  const ex = exercisesById().get(entry.exerciseId) || d;
  entry.snapshot = {
    ...entry.snapshot,
    ...Object.fromEntries(LIVE_KEYS.map((k) => [k, d[k]])),
    unilateral: !!d.unilateral,
    sets: d.sets,
    warmupSets: d.warmupSets || 0,
    progression: deepClone(d.progression || {}),
  };
  entry.notes = d.notes || '';
  setCount(entry, isWarmSet, d.warmupSets, () => {
    const idx = entry.sets.findIndex((s) => !isWarmSet(s));
    entry.sets.splice(idx < 0 ? entry.sets.length : idx, 0, newSet({ type: 'warmup', auto: true }));
  });
  setCount(entry, isWorkSet, d.sets, () => addSetNoSave(entry), 1);
  setCount(entry, isDropSet, d.dropSets, () => {
    const base = entry.sets.filter(isWorkSet).slice(-1)[0];
    entry.sets.push(newSet({ type: 'drop', kg: dropWeight(base?.kg, d.weightStep) }));
  });
  const p = entry.progression || {};
  if (!p.applied) {
    const cfg = { ...entry.snapshot, dropSets: d.dropSets || 0 };
    const last = lastSession(history(), entry.exerciseId, { excludeWorkoutId: w.id });
    const np = evaluateProgression(withConfig(ex, cfg), last, cfg, data.settings);
    const same = np.status === p.status && np.suggestedKg === p.suggestedKg;
    entry.progression = { ...np, applied: false, dismissed: same ? !!p.dismissed : false };
  }
  entry.changedAt = Date.now();
  save(w);
}

/**
 * Differences between this workout and the exercise's saved settings (routine or library),
 * e.g. [{ entryId, exerciseId, name, values: {...}, lines: ['Warm-up sets 0 → 2'] }].
 * Call before finishing, while unfinished sets are still there.
 */
export function liveChanges(w) {
  const routine = w.routineId ? data.routines.find((r) => r.id === w.routineId) : null;
  const out = [];
  for (const e of w.entries) {
    const ex = e.exerciseId && exercisesById().get(e.exerciseId);
    if (!ex || e.skipped) continue;
    const item = routine ? routine.items.find((i) => i.exerciseId === e.exerciseId) : null;
    if (routine && !item) continue; // exercises added to the workout are handled by "Save them to the routine"
    const cfg = effectiveConfig(ex, item);
    const snap = e.snapshot || {};
    const now = {
      sets: e.sets.filter(isWorkSet).length,
      warmupSets: e.sets.filter(isWarmSet).length,
      dropSets: e.sets.filter(isDropSet).length,
      ...Object.fromEntries(LIVE_KEYS.map((k) => [k, k === 'unilateral' ? !!snap[k] : snap[k]])),
      progression: snap.progression || {},
    };
    const was = {
      sets: cfg.sets, warmupSets: warmupCount(cfg, data.settings), dropSets: cfg.dropSets || 0,
      ...Object.fromEntries(LIVE_KEYS.map((k) => [k, k === 'unilateral' ? !!cfg[k] : cfg[k]])),
      progression: cfg.progression || {},
    };
    const lines = [];
    const add = (label, a, b) => lines.push({ label, from: a, to: b });
    if (now.warmupSets !== was.warmupSets) add('Warm-up sets', was.warmupSets, now.warmupSets);
    if (now.sets !== was.sets) add('Working sets', was.sets, now.sets);
    if (now.dropSets !== was.dropSets) add('Drop sets', was.dropSets, now.dropSets);
    if (now.repMin !== was.repMin || now.repMax !== was.repMax) add('Rep range', `${was.repMin}–${was.repMax}`, `${now.repMin}–${now.repMax}`);
    if (now.rest !== was.rest) add('Rest', fmtSec(was.rest), fmtSec(now.rest));
    if (now.weightStep !== was.weightStep) add('− / + step', was.weightStep, now.weightStep);
    if ((now.rirTarget ?? null) !== (was.rirTarget ?? null)) add('Target RIR', was.rirTarget ?? '–', now.rirTarget ?? '–');
    if (now.type !== was.type || (now.type === 'dumbbell' && now.loadMode !== was.loadMode)) add('Type', was.type, now.type);
    if (now.unilateral !== was.unilateral) add('One side at a time', was.unilateral ? 'On' : 'Off', now.unilateral ? 'On' : 'Off');
    if (JSON.stringify(normProg(now.progression)) !== JSON.stringify(normProg(was.progression))) add('Overload rule', '', '');
    if (lines.length) out.push({ entryId: e.id, exerciseId: e.exerciseId, name: ex.name, values: now, lines });
  }
  return out;
}

const fmtSec = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`);
const normProg = (p) => Object.fromEntries(Object.entries(p || {}).filter(([, v]) => v !== null && v !== undefined).sort(([a], [b]) => a.localeCompare(b)));

/** Saves workout changes for next time: into the routine (this routine only) or the library exercise. */
export function saveLiveChanges(w, changes) {
  const routine = w.routineId ? data.routines.find((r) => r.id === w.routineId) : null;
  const keys = ['sets', 'warmupSets', 'dropSets', ...LIVE_KEYS, 'progression'];
  if (routine) {
    const items = routine.items.map((it) => {
      const c = changes.find((x) => x.exerciseId === it.exerciseId);
      if (!c) return it;
      const ex = exercisesById().get(it.exerciseId) || {};
      const next = { ...it };
      for (const k of keys) {
        const v = c.values[k];
        const lib = k === 'warmupSets' || k === 'dropSets' ? ex[k] || 0 : k === 'unilateral' ? !!ex[k] : ex[k];
        next[k] = JSON.stringify(k === 'progression' ? normProg(v) : v) === JSON.stringify(k === 'progression' ? normProg(lib) : lib) ? null : deepClone(v);
      }
      return next;
    });
    saveRoutine({ ...routine, items });
  } else {
    for (const c of changes) {
      const ex = data.exercises.find((x) => x.id === c.exerciseId);
      if (ex) saveExercise({ ...ex, ...deepClone(Object.fromEntries(keys.map((k) => [k, c.values[k]]))) });
    }
  }
}
