// JSON export / import.
//
// Import is done in two steps so nothing is changed until you confirm:
//   1. validateBackup()  – checks the file and normalises every record (bad records are skipped & reported)
//   2. planImport()      – works out what's new vs already on this device (duplicate detection)
// The store then writes the plan in ONE database transaction: if anything fails,
// nothing is written. Existing data is never overwritten or deleted by an import.
//
// Also reads backups exported from the iPhone (Swift) version of the app.

import { uid } from './util.js';
import { SCHEMA_VERSION, newExercise, newRoutineItem, newSet, defaultSettings } from './model.js';
import { splitBackMuscles } from './muscles.js';
import { catalogEntry } from './catalog.js';

export const FORMAT = 'workoutlog-web';

/** kind: 'full' | 'routines'. `routineIds` limits a routines export to some routines. */
export function makeBackup(db, { kind = 'full', routineIds = null } = {}) {
  let routines = db.routines;
  if (routineIds) routines = routines.filter((r) => routineIds.includes(r.id));
  let exercises = db.exercises;
  if (kind === 'routines') {
    const used = new Set(routines.flatMap((r) => r.items.map((i) => i.exerciseId)));
    exercises = exercises.filter((e) => used.has(e.id));
  }
  return {
    format: FORMAT,
    version: SCHEMA_VERSION,
    kind,
    exportedAt: new Date().toISOString(),
    settings: kind === 'full' ? db.settings : undefined,
    exercises,
    routines,
    workouts: kind === 'full' ? db.workouts.filter((w) => w.status === 'done') : [],
    measurements: kind === 'full' ? db.measurements : [],
    blocks: kind === 'full' ? db.blocks : [],
    yogaSessions: kind === 'full' ? db.yogaSessions || [] : [],
    yogaPoses: kind === 'full' ? db.yogaPoses || [] : [],
    yogaEntries: kind === 'full' ? db.yogaEntries || [] : [],
  };
}

const isStr = (v) => typeof v === 'string';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numOr = (v, d) => (isNum(v) ? v : d);
const numOrNull = (v) => (isNum(v) ? v : null);

/** Returns { ok, error?, warnings[], data } – data is normalised and safe to import. */
export function validateBackup(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'The file is empty or not JSON.', warnings };
  if (raw.format === 'workoutlog-backup') return convertIosBackup(raw);
  if (raw.format !== FORMAT) return { ok: false, error: "This file isn't a Workout Log backup.", warnings };
  if (isNum(raw.version) && raw.version > SCHEMA_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the app. Update the app first.', warnings };
  }
  const arr = (k) => (Array.isArray(raw[k]) ? raw[k] : []);
  const data = { kind: raw.kind === 'routines' ? 'routines' : 'full', exercises: [], routines: [], workouts: [], measurements: [], blocks: [], yogaSessions: [], yogaPoses: [], yogaEntries: [], settings: null };

  for (const e of arr('exercises')) {
    if (!e || !isStr(e.id) || !isStr(e.name) || !e.name.trim()) { warnings.push('Skipped an exercise without a name.'); continue; }
    const base = newExercise(null);
    data.exercises.push({
      ...base, ...e,
      muscles: splitBack(sanitizeMuscles(e.muscles), e.name),
      sets: Math.max(0, Math.round(numOr(e.sets, 3))),
      repMin: Math.max(1, Math.round(numOr(e.repMin, 8))),
      repMax: Math.max(Math.round(numOr(e.repMin, 8)), Math.round(numOr(e.repMax, 12))),
      rest: numOr(e.rest, 90),
      weightStep: numOr(e.weightStep, 2.5),
      progression: { ...base.progression, ...(e.progression || {}) },
      image: isStr(e.image) && e.image.startsWith('data:image/') ? e.image : null,
    });
  }
  const exIds = new Set(data.exercises.map((e) => e.id));
  for (const r of arr('routines')) {
    if (!r || !isStr(r.id) || !isStr(r.name)) { warnings.push('Skipped a routine without a name.'); continue; }
    const items = (Array.isArray(r.items) ? r.items : []).filter((i) => i && isStr(i.exerciseId) && exIds.has(i.exerciseId));
    if (items.length !== (r.items || []).length) warnings.push(`Routine “${r.name}”: skipped exercises missing from the file.`);
    data.routines.push({ ...r, folder: isStr(r.folder) ? r.folder : '', notes: isStr(r.notes) ? r.notes : '', items: items.map((i) => ({ ...newRoutineItem(i.exerciseId), ...i })) });
  }
  for (const w of arr('workouts')) {
    if (!w || !isStr(w.id) || !isNum(w.startedAt) || !Array.isArray(w.entries)) { warnings.push('Skipped a damaged workout.'); continue; }
    data.workouts.push({
      ...w,
      status: 'done',
      endedAt: numOr(w.endedAt, w.startedAt),
      entries: w.entries.filter((e) => e && Array.isArray(e.sets)).map((e) => ({
        ...e,
        id: isStr(e.id) ? e.id : uid(),
        snapshot: { ...(e.snapshot || {}), name: e.snapshot?.name || 'Exercise', muscles: splitBack(sanitizeMuscles(e.snapshot?.muscles), e.snapshot?.name) },
        sets: e.sets.filter((s) => s && typeof s === 'object').map((s) => ({ ...newSet(), ...s, kg: numOrNull(s.kg), reps: numOrNull(s.reps), done: !!s.done })),
      })),
    });
  }
  for (const m of arr('measurements')) {
    if (!m || !isStr(m.id) || !isStr(m.kind) || !isNum(m.value) || !isNum(m.date)) { warnings.push('Skipped a damaged measurement.'); continue; }
    data.measurements.push(m);
  }
  for (const b of arr('blocks')) {
    if (!b || !isStr(b.id) || !isStr(b.name)) { warnings.push('Skipped a damaged training block.'); continue; }
    data.blocks.push({ deloadWeeks: [], schedule: {}, ...b });
  }
  const rating = (v) => (isNum(v) && v >= 1 && v <= 5 ? Math.round(v) : null);
  for (const s of arr('yogaSessions')) {
    if (!s || !isStr(s.id) || !isNum(s.date)) { warnings.push('Skipped a damaged yoga session.'); continue; }
    data.yogaSessions.push({ ...s, style: isStr(s.style) ? s.style : 'other', minutes: Math.max(0, numOr(s.minutes, 0)), difficulty: rating(s.difficulty), feel: rating(s.feel), notes: isStr(s.notes) ? s.notes : '' });
  }
  for (const p of arr('yogaPoses')) {
    if (!p || !isStr(p.id) || !isStr(p.name) || !p.name.trim()) { warnings.push('Skipped a yoga pose without a name.'); continue; }
    data.yogaPoses.push({ ...p, kind: p.kind === 'achieve' ? 'achieve' : 'hold' });
  }
  const poseIds = new Set(data.yogaPoses.map((p) => p.id));
  for (const e of arr('yogaEntries')) {
    if (!e || !isStr(e.id) || !isNum(e.date) || !poseIds.has(e.poseId)) { warnings.push('Skipped a damaged pose result.'); continue; }
    data.yogaEntries.push({ ...e, seconds: numOrNull(e.seconds), achieved: typeof e.achieved === 'boolean' ? e.achieved : null });
  }
  if (raw.settings && typeof raw.settings === 'object') data.settings = splitBackTargets({ ...defaultSettings(), ...raw.settings });
  return { ok: true, warnings, data };
}

/** One old "back" muscle → lats / upper back / lower back (catalog first, then the name). */
export function splitBack(muscles, name) {
  return splitBackMuscles(muscles, name, catalogEntry(name)?.muscles || null);
}

/** Old weekly "back" target becomes the lats and upper-back targets. */
export function splitBackTargets(settings) {
  const t = settings.volumeTargets;
  if (!t || !t.back) return settings;
  const def = defaultSettings().volumeTargets;
  const vt = { ...t };
  vt.lats = { ...t.back };
  vt.upper_back = { ...t.back };
  if (!vt.lower_back) vt.lower_back = def.lower_back;
  delete vt.back;
  return { ...settings, volumeTargets: vt };
}

/** Converts everything in place; returns the changed exercises and workouts. */
export function migrateBackData(d) {
  const exercises = [], workouts = [];
  for (const e of d.exercises) {
    if (e.muscles && 'back' in e.muscles) { e.muscles = splitBack(e.muscles, e.name); exercises.push(e); }
  }
  for (const w of d.workouts) {
    let ch = false;
    for (const en of w.entries || []) {
      const m = en.snapshot?.muscles;
      if (m && 'back' in m) { en.snapshot.muscles = splitBack(m, en.snapshot.name); ch = true; }
    }
    if (ch) workouts.push(w);
  }
  d.settings = splitBackTargets(d.settings);
  return { exercises, workouts };
}

function sanitizeMuscles(m) {
  const out = {};
  if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) if (isNum(v) && v > 0) out[k] = Math.min(1, v);
  return out;
}

const nameKey = (s) => String(s || '').trim().toLowerCase();

/**
 * Duplicate detection:
 *  • exercises: same id → skip; same name → reuse the existing one (history stays together)
 *  • routines: same id → skip; same name → added as "Name (imported)"
 *  • workouts, measurements, blocks: same id → skip
 */
export function planImport(data, db) {
  const plan = { exercises: [], routines: [], workouts: [], measurements: [], blocks: [], yogaSessions: [], yogaPoses: [], yogaEntries: [], skipped: 0, reused: 0, renamed: 0 };
  const byId = new Map(db.exercises.map((e) => [e.id, e]));
  const byName = new Map(db.exercises.map((e) => [nameKey(e.name), e]));
  const idMap = new Map();
  for (const e of data.exercises) {
    const existing = byId.get(e.id) || byName.get(nameKey(e.name));
    if (existing) {
      idMap.set(e.id, existing.id);
      if (existing.id === e.id) plan.skipped++; else plan.reused++;
      continue;
    }
    plan.exercises.push(e);
    idMap.set(e.id, e.id);
    byName.set(nameKey(e.name), e);
  }
  const routineIds = new Set(db.routines.map((r) => r.id));
  const routineNames = new Set(db.routines.map((r) => nameKey(r.name)));
  let order = Math.max(-1, ...db.routines.map((r) => r.order ?? 0)) + 1;
  for (const r of data.routines) {
    if (routineIds.has(r.id)) { plan.skipped++; continue; }
    let name = r.name;
    if (routineNames.has(nameKey(name))) { name = `${name} (imported)`; plan.renamed++; }
    plan.routines.push({ ...r, name, order: order++, items: r.items.map((i) => ({ ...i, exerciseId: idMap.get(i.exerciseId) || i.exerciseId })) });
  }
  const has = (list) => new Set(list.map((x) => x.id));
  const wIds = has(db.workouts), mIds = has(db.measurements), bIds = has(db.blocks);
  for (const w of data.workouts) {
    if (wIds.has(w.id)) { plan.skipped++; continue; }
    plan.workouts.push({ ...w, entries: w.entries.map((e) => ({ ...e, exerciseId: e.exerciseId ? (idMap.get(e.exerciseId) || e.exerciseId) : null })) });
  }
  for (const m of data.measurements) { if (mIds.has(m.id)) plan.skipped++; else plan.measurements.push(m); }
  for (const b of data.blocks) { if (bIds.has(b.id)) plan.skipped++; else plan.blocks.push(b); }
  // Yoga: sessions by id; poses by id or name (results join the pose already here).
  const ysIds = has(db.yogaSessions || []), yeIds = has(db.yogaEntries || []);
  for (const s of data.yogaSessions || []) { if (ysIds.has(s.id)) plan.skipped++; else plan.yogaSessions.push(s); }
  const poseById = new Map((db.yogaPoses || []).map((p) => [p.id, p]));
  const poseByName = new Map((db.yogaPoses || []).map((p) => [nameKey(p.name), p]));
  const poseMap = new Map();
  for (const p of data.yogaPoses || []) {
    const ex = poseById.get(p.id) || poseByName.get(nameKey(p.name));
    if (ex) { poseMap.set(p.id, ex.id); if (ex.id === p.id) plan.skipped++; continue; }
    poseMap.set(p.id, p.id); poseByName.set(nameKey(p.name), p); plan.yogaPoses.push(p);
  }
  for (const e of data.yogaEntries || []) { if (yeIds.has(e.id)) plan.skipped++; else plan.yogaEntries.push({ ...e, poseId: poseMap.get(e.poseId) || e.poseId }); }
  plan.settings = data.settings;
  return plan;
}

/** Converts a backup from the iPhone (SwiftData) app into this format. */
function convertIosBackup(raw) {
  const warnings = ['Converted from the iPhone app – add muscles to your exercises to see volume.'];
  const data = { kind: raw.kind === 'routines' ? 'routines' : 'full', exercises: [], routines: [], workouts: [], measurements: [], blocks: [], settings: null };
  for (const e of raw.exercises || []) {
    if (!e || !e.name) continue;
    data.exercises.push(newExercise(null, {
      id: e.id || uid(), name: e.name,
      image: e.imageData ? `data:image/jpeg;base64,${e.imageData}` : null,
      sets: e.targetSets || 3, repMin: e.repMin || 8, repMax: e.repMax || 12,
      rest: e.restSeconds || 90, weightStep: e.weightIncrement || 2.5, notes: e.note || '',
    }));
  }
  const exIds = new Set(data.exercises.map((e) => e.id));
  for (const r of raw.routines || []) {
    data.routines.push({
      id: r.id || uid(), name: r.name || 'Routine', folder: '', order: r.sortIndex || 0, notes: '', createdAt: Date.now(),
      items: (r.exerciseIDs || []).filter((id) => exIds.has(id)).map((id) => newRoutineItem(id)),
    });
  }
  const exById = new Map(data.exercises.map((e) => [e.id, e]));
  for (const w of raw.workouts || []) {
    const startedAt = Date.parse(w.startedAt);
    if (!Number.isFinite(startedAt)) continue;
    data.workouts.push({
      id: w.id || uid(), routineId: w.routineID || null, routineName: w.routineName || 'Workout',
      startedAt, endedAt: Date.parse(w.endedAt) || startedAt, status: 'done', notes: w.notes || '', deload: false,
      entries: (w.exercises || []).sort((a, b) => a.sortIndex - b.sortIndex).map((x) => {
        const ex = exById.get(x.exerciseID);
        return {
          id: x.id || uid(), exerciseId: ex ? ex.id : null, supersetId: null, notes: '', skipped: false,
          snapshot: { name: x.exerciseName, muscles: {}, type: 'weighted', loadMode: 'total', unilateral: false, repMin: ex?.repMin || 8, repMax: ex?.repMax || 12, sets: ex?.sets || 3, rest: ex?.rest || 90 },
          sets: (x.sets || []).sort((a, b) => a.position - b.position).map((s) => newSet({ id: s.id || uid(), kg: s.weightKg, reps: s.reps, done: !!s.isCompleted })),
        };
      }),
    });
  }
  return { ok: true, warnings, data };
}
