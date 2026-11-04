// App state + persistence.
//
// `data` holds everything in memory (loaded once from IndexedDB at start-up).
// Every mutation goes through a save*/delete* function below, which updates memory,
// writes to IndexedDB straight away and schedules a re-render.
// `ui` holds screen state that isn't saved (open sheets, selected tabs…).

import { catalogMatch } from './logic/catalog.js';
import * as idb from './db.js';
import { defaultSettings, SCHEMA_VERSION } from './logic/model.js';
import { buildHistory } from './logic/history.js';
import { sampleExercises, buildTemplate } from './logic/samples.js';
import { migrateBackData } from './logic/backup.js';

export const data = {
  settings: defaultSettings(),
  exercises: [],
  routines: [],
  workouts: [],
  measurements: [],
  blocks: [],
  yogaSessions: [],
  yogaPoses: [],
  yogaEntries: [],
  timer: null,
};

export const ui = {
  sheets: [],          // stack of open bottom sheets: [{ type, ...props }]
  dialog: null,        // confirm dialog
  toast: null,
  workoutOpen: false,
  storageOk: true,
  persisted: null,
  tabState: {},        // per-screen UI bits (selected segment, week offset…)
};

let renderFn = () => {};
let scheduled = false;
let version = 0;

export function setRenderer(fn) {
  renderFn = fn;
}

/** Re-render on the next animation frame (many updates → one render). */
export function update() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    renderFn();
  });
}

export function dataVersion() {
  return version;
}

function changed() {
  version++;
  update();
}

function persist(promise) {
  promise.catch((err) => {
    console.error(err);
    ui.storageOk = false;
    toast('⚠️ Could not save to this device: ' + (err?.message || err), 6000);
  });
}

// ---------- Derived data (cached per data version) ----------
const memo = new Map();
export function cached(key, fn) {
  const hit = memo.get(key);
  if (hit && hit.v === version) return hit.value;
  const value = fn();
  memo.set(key, { v: version, value });
  return value;
}

export const history = () => cached('history', () => buildHistory(data.workouts));
export const exercisesById = () => cached('exById', () => new Map(data.exercises.map((e) => [e.id, e])));
export const routinesById = () => cached('rById', () => new Map(data.routines.map((r) => [r.id, r])));
export const activeWorkout = () => data.workouts.find((w) => w.status === 'active') || null;
export const sortedRoutines = () => cached('routines', () => data.routines.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
export const doneWorkouts = () => cached('done', () => data.workouts.filter((w) => w.status === 'done').sort((a, b) => b.startedAt - a.startedAt));

// ---------- Generic save / delete ----------
function upsert(listName, record) {
  const list = data[listName];
  const i = list.findIndex((x) => x.id === record.id);
  if (i >= 0) list[i] = record; else list.push(record);
  persist(idb.put(listName, record));
  changed();
  return record;
}

function remove(listName, id) {
  data[listName] = data[listName].filter((x) => x.id !== id);
  persist(idb.del(listName, id));
  changed();
}

export const saveExercise = (r) => upsert('exercises', r);
export const saveRoutine = (r) => upsert('routines', r);
export const saveWorkout = (r) => upsert('workouts', r);
export const saveMeasurement = (r) => upsert('measurements', r);
export const saveBlock = (r) => upsert('blocks', r);
export const deleteRoutine = (id) => remove('routines', id);
export const deleteWorkout = (id) => remove('workouts', id);
export const deleteMeasurement = (id) => remove('measurements', id);
export const deleteBlock = (id) => remove('blocks', id);
export const saveYogaSession = (r) => upsert('yogaSessions', r);
export const deleteYogaSession = (id) => remove('yogaSessions', id);
export const saveYogaPose = (r) => upsert('yogaPoses', r);
export const saveYogaEntry = (r) => upsert('yogaEntries', r);
export const deleteYogaEntry = (id) => remove('yogaEntries', id);
/** Removing a pose from the journal also removes its measurements. */
export function deleteYogaPose(id) {
  for (const e of data.yogaEntries.filter((x) => x.poseId === id)) remove('yogaEntries', e.id);
  remove('yogaPoses', id);
}

/** Deleting an exercise removes it from routines; past workouts keep their snapshot. */
export function deleteExercise(id) {
  for (const r of data.routines) {
    if (r.items.some((i) => i.exerciseId === id)) saveRoutine({ ...r, items: r.items.filter((i) => i.exerciseId !== id) });
  }
  remove('exercises', id);
}

export function saveSettings(patch) {
  data.settings = { ...data.settings, ...patch };
  persist(idb.putMeta('settings', data.settings));
  changed();
}

export function saveTimer(timer) {
  data.timer = timer;
  persist(idb.putMeta('timer', timer));
  update();
}

/** Writes an import plan in a single transaction; memory is updated only if it succeeds. */
export async function applyImport(plan, { includeSettings = false } = {}) {
  const records = {
    exercises: plan.exercises, routines: plan.routines, workouts: plan.workouts,
    measurements: plan.measurements, blocks: plan.blocks,
    yogaSessions: plan.yogaSessions || [], yogaPoses: plan.yogaPoses || [], yogaEntries: plan.yogaEntries || [],
  };
  const meta = includeSettings && plan.settings ? { settings: plan.settings } : {};
  await idb.putMany(records, meta);
  for (const [k, list] of Object.entries(records)) data[k].push(...list);
  if (meta.settings) data.settings = meta.settings;
  changed();
}

export async function eraseAll() {
  await idb.clearAll();
  data.exercises = []; data.routines = []; data.workouts = []; data.measurements = []; data.blocks = [];
  data.yogaSessions = []; data.yogaPoses = []; data.yogaEntries = [];
  data.settings = defaultSettings();
  data.timer = null;
  await idb.putMeta('seeded', true);
  await idb.putMeta('schemaVersion', SCHEMA_VERSION);
  changed();
}

// ---------- UI helpers ----------
let toastTimer = null;
export function toast(message, ms = 2600, action = null) {
  ui.toast = { message, action, id: Math.random() };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = null; update(); }, ms);
  update();
}

export function openSheet(sheet) {
  ui.sheets.push(sheet);
  update();
}

export function closeSheet() {
  ui.sheets.pop();
  update();
}

export function closeAllSheets() {
  ui.sheets = [];
  update();
}

/** confirm({ title, message, confirmText, destructive, onConfirm }) */
export function confirm(opts) {
  ui.dialog = opts;
  update();
}

// ---------- Start-up ----------
export async function load() {
  try {
    const lists = await Promise.all(idb.STORES.map((s) => idb.getAll(s)));
    idb.STORES.forEach((s, i) => { data[s] = lists[i]; });
    const settings = await idb.getMeta('settings');
    data.settings = { ...defaultSettings(), ...(settings || {}) };
    data.timer = (await idb.getMeta('timer')) || null;
    const schema = (await idb.getMeta('schemaVersion')) || 0;
    if (schema < SCHEMA_VERSION) await migrateData(schema);
    await fillMissingMuscles();
    const seeded = await idb.getMeta('seeded');
    if (!seeded && data.routines.length === 0 && data.exercises.length === 0) await seedSamples();
    await idb.putMeta('seeded', true);
  } catch (err) {
    console.error(err);
    ui.storageOk = false;
  }
  // Ask the browser not to clear our data when space runs low.
  try {
    if (navigator.storage && navigator.storage.persist) {
      ui.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
    }
  } catch { /* not supported */ }
  version++;
}

/**
 * Exercises without any muscles (custom or imported) get the muscles of the built-in exercise
 * with the same name, e.g. "Pull Up" → Pull-up. Past workouts of that exercise are updated too,
 * so they count in the muscle charts. Exercises that already have muscles are never touched.
 */
async function fillMissingMuscles() {
  const has = (m) => m && Object.values(m).some((v) => v > 0);
  const fixed = new Map();
  for (const e of data.exercises) {
    if (has(e.muscles)) continue;
    const c = catalogMatch(e.name);
    if (c && has(c.muscles)) { e.muscles = { ...c.muscles }; fixed.set(e.id, e.muscles); }
  }
  if (!fixed.size) return;
  const workouts = [];
  for (const w of data.workouts) {
    let touched = false;
    for (const en of w.entries || []) {
      if (fixed.has(en.exerciseId) && en.snapshot && !has(en.snapshot.muscles)) { en.snapshot.muscles = { ...fixed.get(en.exerciseId) }; touched = true; }
    }
    if (touched) workouts.push(w);
  }
  await idb.putMany({ exercises: data.exercises.filter((e) => fixed.has(e.id)), workouts });
}

/** Data-shape migrations between app versions (runs once per upgrade). */
async function migrateData(from) {
  if (from >= 1 && from < 2) {
    // v2: the default overload rule became "descending reps" (e.g. 10, 9, 8 in a 6–10 range).
    // Exercises still on the old default switch over; custom rules are left alone.
    const changed = [];
    for (const e of data.exercises) {
      if (!e.progression || e.progression.rule === 'all_max') {
        e.progression = { ...(e.progression || {}), rule: 'descending' };
        changed.push(e);
      }
      if (e.dropSets === undefined) e.dropSets = 0;
    }
    if (data.settings.defaultRule === 'all_max') data.settings.defaultRule = 'descending';
    await idb.putMany({ exercises: changed }, { settings: data.settings });
  }
  if (from >= 1 && from < 3) {
    // v3: "Back" is split into Lats, Upper back and Lower back (exercises, past workouts, targets).
    const ch = migrateBackData(data);
    await idb.putMany({ exercises: ch.exercises, workouts: ch.workouts }, { settings: data.settings });
  }
  await idb.putMeta('schemaVersion', SCHEMA_VERSION);
}

export async function seedSamples() {
  const exercises = sampleExercises(data.settings).filter((e) => !data.exercises.some((x) => x.name.toLowerCase() === e.name.toLowerCase()));
  const all = [...data.exercises, ...exercises];
  const order = Math.max(-1, ...data.routines.map((r) => r.order ?? 0)) + 1;
  const { routines } = buildTemplate('ppl', all, data.settings, order, '');
  await idb.putMany({ exercises, routines });
  data.exercises.push(...exercises);
  data.routines.push(...routines);
  changed();
}

/** Adds a template's routines (and any missing exercises). */
export async function addTemplate(templateId, folder) {
  const order = Math.max(-1, ...data.routines.map((r) => r.order ?? 0)) + 1;
  const { exercises, routines } = buildTemplate(templateId, data.exercises, data.settings, order, folder);
  await idb.putMany({ exercises, routines });
  data.exercises.push(...exercises);
  data.routines.push(...routines);
  changed();
  return routines;
}
