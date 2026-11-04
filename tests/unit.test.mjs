// Unit tests for the training logic. Run with:  node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import { newExercise, newSet, defaultSettings, effectiveConfig, newRoutineItem, setReps } from '../js/logic/model.js';
import { evaluateProgression, progressionStep } from '../js/logic/progression.js';
import { e1rm, personalRecords, prsInWorkout, isStalled, sessionStats, tonnage } from '../js/logic/records.js';
import { entryVolume, volumeBetween, targetStatus } from '../js/logic/volume.js';
import { buildHistory, lastSession } from '../js/logic/history.js';
import { toDisplayWeight, fromDisplayWeight, addInDisplayUnit, displayWeight } from '../js/logic/units.js';
import { snapRest, startTimer, adjustTimer, remainingMs } from '../js/logic/restTimer.js';
import { validateBackup, planImport, makeBackup } from '../js/logic/backup.js';
import { activeBlock, blockWeek, isDeloadWeek, plannedRoutineIds } from '../js/logic/blocks.js';
import { weekStreak, strengthTrend, trendBuckets } from '../js/logic/analytics.js';
import { buildTemplate } from '../js/logic/samples.js';
import { parseNum, fmtClock } from '../js/logic/util.js';

const settings = defaultSettings();
const day = (n) => new Date(2026, 0, 1 + n, 10).getTime();

function workout(id, startedAt, entries, extra = {}) {
  return { id, status: 'done', startedAt, endedAt: startedAt + 3600e3, entries, ...extra };
}
function entry(ex, sets, extra = {}) {
  return { id: 'e' + Math.random(), exerciseId: ex.id, snapshot: { name: ex.name, muscles: ex.muscles, type: ex.type, loadMode: ex.loadMode, unilateral: ex.unilateral, repMax: ex.repMax }, sets, ...extra };
}
const S = (kg, reps, extra = {}) => newSet({ kg, reps, done: true, ...extra });
const cfg = (ex) => effectiveConfig(ex, null);

// ---------- Units ----------
test('kg ⇄ lbs round trip keeps the stored value', () => {
  const kg = 62.5;
  const lbs = toDisplayWeight(kg, 'lbs');
  assert.ok(Math.abs(fromDisplayWeight(lbs, 'lbs') - kg) < 1e-9);
  assert.equal(displayWeight(100, 'lbs'), 220.46);
});

test('progression step is exactly 2.5 kg or 5 lbs', () => {
  assert.equal(addInDisplayUnit(60, 2.5, 'kg'), 62.5);
  const kg135 = fromDisplayWeight(135, 'lbs');
  assert.equal(displayWeight(addInDisplayUnit(kg135, 5, 'lbs'), 'lbs'), 140);
  assert.equal(progressionStep(newExercise(settings), settings), 2.5);
  assert.equal(progressionStep(newExercise(settings), { ...settings, unit: 'lbs' }), 5);
});

// ---------- Progression ----------
test('all_max: hitting max reps on every set at the same weight suggests +2.5 kg', () => {
  const ex = newExercise(settings, { repMin: 8, repMax: 12, sets: 3, progression: { rule: 'all_max' } });
  const last = { workout: workout('w', day(0), []), entry: entry(ex, [S(60, 12), S(60, 12), S(60, 12)]) };
  const r = evaluateProgression(ex, last, cfg(ex), settings);
  assert.equal(r.status, 'increase');
  assert.equal(r.suggestedKg, 62.5);
  assert.match(r.reason, /12 reps on every set/);
});

test('all_max: missing a rep keeps the weight', () => {
  const ex = newExercise(settings, { repMax: 12, sets: 3, progression: { rule: 'all_max' } });
  const last = { workout: workout('w', day(0), []), entry: entry(ex, [S(60, 12), S(60, 12), S(60, 11)]) };
  assert.equal(evaluateProgression(ex, last, cfg(ex), settings).status, 'keep');
});

test('different weights or too few sets never trigger an increase', () => {
  const ex = newExercise(settings, { repMax: 10, sets: 3 });
  const mixed = { workout: workout('w', day(0), []), entry: entry(ex, [S(60, 10), S(62.5, 10), S(60, 10)]) };
  assert.equal(evaluateProgression(ex, mixed, cfg(ex), settings).status, 'keep');
  const few = { workout: workout('w', day(0), []), entry: entry(ex, [S(60, 10), S(60, 10)]) };
  assert.equal(evaluateProgression(ex, few, cfg(ex), settings).status, 'keep');
});

test('warm-ups and drop sets are ignored by progression', () => {
  const ex = newExercise(settings, { repMax: 10, sets: 2 });
  const sets = [S(20, 5, { type: 'warmup' }), S(60, 10), S(60, 10), S(40, 6, { type: 'drop' })];
  const r = evaluateProgression(ex, { workout: workout('w', day(0), []), entry: entry(ex, sets) }, cfg(ex), settings);
  assert.equal(r.status, 'increase');
});

test('avg and custom (RIR) rules', () => {
  const avgEx = newExercise(settings, { repMax: 12, sets: 3, progression: { rule: 'avg', avgTarget: 10 } });
  const lastAvg = { workout: workout('w', day(0), []), entry: entry(avgEx, [S(50, 12), S(50, 10), S(50, 8)]) };
  assert.equal(evaluateProgression(avgEx, lastAvg, cfg(avgEx), settings).status, 'increase');

  const cust = newExercise(settings, { repMax: 12, sets: 2, progression: { rule: 'custom', customReps: 10, customMinRir: 2 } });
  const ok = { workout: workout('w', day(0), []), entry: entry(cust, [S(50, 10, { rir: 2 }), S(50, 11, { rir: 3 })]) };
  const notOk = { workout: workout('w', day(0), []), entry: entry(cust, [S(50, 10, { rir: 1 }), S(50, 11, { rir: 3 })]) };
  assert.equal(evaluateProgression(cust, ok, cfg(cust), settings).status, 'increase');
  assert.equal(evaluateProgression(cust, notOk, cfg(cust), settings).status, 'keep');
});

test('lbs units suggest +5 lbs, assisted reduces assistance, bodyweight says harder', () => {
  const lbsSettings = { ...settings, unit: 'lbs' };
  const ex = newExercise(lbsSettings, { repMax: 8, sets: 1 });
  const kg = fromDisplayWeight(135, 'lbs');
  const r = evaluateProgression(ex, { workout: workout('w', day(0), []), entry: entry(ex, [S(kg, 8)]) }, cfg(ex), lbsSettings);
  assert.equal(displayWeight(r.suggestedKg, 'lbs'), 140);

  const assisted = newExercise(settings, { type: 'assisted', repMax: 8, sets: 1 });
  const ra = evaluateProgression(assisted, { workout: workout('w', day(0), []), entry: entry(assisted, [S(30, 8)]) }, cfg(assisted), settings);
  assert.equal(ra.suggestedKg, 27.5);

  const bw = newExercise(settings, { type: 'bodyweight', repMax: 15, sets: 1 });
  const rb = evaluateProgression(bw, { workout: workout('w', day(0), []), entry: entry(bw, [S(null, 15)]) }, cfg(bw), settings);
  assert.equal(rb.status, 'harder');
});

test('unilateral sets use the weaker side', () => {
  assert.equal(setReps(newSet({ repsL: 10, repsR: 8 })), 8);
  const ex = newExercise(settings, { unilateral: true, repMax: 10, sets: 1 });
  const r = evaluateProgression(ex, { workout: workout('w', day(0), []), entry: entry(ex, [S(20, null, { repsL: 10, repsR: 9 })]) }, cfg(ex), settings);
  assert.equal(r.status, 'keep');
});

test('routine overrides win over library defaults', () => {
  const ex = newExercise(settings, { repMin: 8, repMax: 12, rest: 90 });
  const c = effectiveConfig(ex, newRoutineItem(ex.id, { repMin: 12, repMax: 15, rest: 60 }));
  assert.deepEqual([c.repMin, c.repMax, c.rest, c.sets], [12, 15, 60, 3]);
});

// ---------- History ----------
test('last session skips deload weeks and the current workout', () => {
  const ex = newExercise(settings);
  const w1 = workout('w1', day(0), [entry(ex, [S(60, 10)])]);
  const w2 = workout('w2', day(7), [entry(ex, [S(40, 10)])], { deload: true });
  const active = { ...workout('w3', day(8), [entry(ex, [S(70, 10)])]), status: 'active' };
  const h = buildHistory([w1, w2, active]);
  assert.equal(lastSession(h, ex.id).workout.id, 'w1');
  assert.equal(lastSession(h, ex.id, { includeDeload: true }).workout.id, 'w2');
});

// ---------- Records ----------
test('e1RM (Epley)', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.ok(Math.abs(e1rm(100, 10) - 133.333) < 0.01);
  assert.equal(e1rm(0, 5), 0);
});

test('personal records and PR detection', () => {
  const ex = newExercise(settings);
  const w1 = workout('w1', day(0), [entry(ex, [S(60, 10), S(60, 9)])]);
  const w2 = workout('w2', day(3), [entry(ex, [S(65, 8), S(65, 8)])]);
  const h = buildHistory([w1, w2]);
  const rec = personalRecords(h.get(ex.id), []);
  assert.equal(rec.bestWeight.value, 65);
  assert.equal(rec.bestReps.value, 10);
  const prs = prsInWorkout(w2, h, []);
  assert.ok(prs.some((p) => p.key === 'bestWeight'));
  assert.equal(prsInWorkout(w1, h, []).length, 0); // first session is not a "PR"
});

test('dumbbell per-hand tonnage doubles, weighted bodyweight adds body weight', () => {
  const snapDb = { type: 'dumbbell', loadMode: 'per_hand' };
  assert.equal(tonnage(S(20, 10), snapDb, null), 400);
  const ex = newExercise(settings, { type: 'weighted_bw' });
  const w = workout('w', day(0), [entry(ex, [S(10, 8)])]);
  const stats = sessionStats(w.entries[0], w, [{ kind: 'bodyweight', value: 80, date: day(-1) }]);
  assert.ok(Math.abs(stats.e1rm - 90 * (1 + 8 / 30)) < 1e-9);
});

test('stagnation detection', () => {
  const ex = newExercise(settings);
  const ws = [100, 102.5, 100, 100, 100].map((kg, i) => workout('w' + i, day(i * 3), [entry(ex, [S(kg, 5)])]));
  assert.equal(isStalled(buildHistory(ws).get(ex.id), []), true);
  const up = [100, 102.5, 105, 107.5].map((kg, i) => workout('u' + i, day(i * 3), [entry(ex, [S(kg, 5)])]));
  assert.equal(isStalled(buildHistory(up).get(ex.id), []), false);
});

// ---------- Volume ----------
test('direct sets count 1, indirect 0.5, warm-ups 0, drop sets per setting', () => {
  const ex = newExercise(settings, { muscles: { chest: 1, triceps: 0.5 } });
  const e = entry(ex, [S(20, 10, { type: 'warmup' }), S(60, 10), S(60, 10), S(40, 8, { type: 'drop' }), newSet({ kg: 60, reps: 10 })]);
  const v = entryVolume(e, settings);
  assert.equal(v.chest.total, 3);
  assert.equal(v.chest.direct, 3);
  assert.equal(v.triceps.total, 1.5);
  assert.equal(v.triceps.indirect, 1.5);
  const half = entryVolume(e, { ...settings, dropSetsCount: 0.5 });
  assert.equal(half.chest.total, 2.5);
});

test('weekly volume only counts finished workouts in range', () => {
  const ex = newExercise(settings, { muscles: { back: 1 } });
  const ws = [workout('a', day(0), [entry(ex, [S(50, 10), S(50, 10)])]), workout('b', day(20), [entry(ex, [S(50, 10)])]), { ...workout('c', day(1), [entry(ex, [S(50, 10)])]), status: 'active' }];
  const v = volumeBetween(ws, day(-1), day(7), settings);
  assert.equal(v.back.total, 2);
  assert.equal(targetStatus(2, { min: 10, max: 20 }), 'low');
  assert.equal(targetStatus(12, { min: 10, max: 20 }), 'ok');
});

// ---------- Rest timer ----------
test('rest times snap to 15 s and the timer uses absolute end times', () => {
  assert.equal(snapRest(100), 105);
  assert.equal(snapRest(5), 15);
  const t = startTimer(90, 1000);
  assert.equal(remainingMs(t, 31000), 60000);
  assert.equal(remainingMs(adjustTimer(t, 15, 31000), 31000), 75000);
  assert.equal(adjustTimer(t, -15, 80000), null); // would end → skip
  assert.equal(fmtClock(90), '1:30');
});

// ---------- Backup ----------
test('backup round-trip: validate, detect duplicates, reuse exercises by name', () => {
  const ex = newExercise(settings, { name: 'Bench Press', muscles: { chest: 1 } });
  const db = { settings, exercises: [ex], routines: [{ id: 'r1', name: 'Push', folder: '', order: 0, items: [newRoutineItem(ex.id)] }], workouts: [workout('w1', day(0), [entry(ex, [S(60, 10)])])], measurements: [], blocks: [] };
  const file = JSON.parse(JSON.stringify(makeBackup(db)));
  const v = validateBackup(file);
  assert.ok(v.ok);
  const same = planImport(v.data, db);
  assert.equal(same.exercises.length + same.routines.length + same.workouts.length, 0);
  assert.ok(same.skipped >= 3);

  const friend = { ...db, exercises: [], routines: [], workouts: [], measurements: [], blocks: [] };
  const other = { ...file, exercises: [{ ...file.exercises[0], id: 'other-id', name: 'bench press' }], routines: [{ ...file.routines[0], id: 'r2', items: [{ ...file.routines[0].items[0], exerciseId: 'other-id' }] }], workouts: [] };
  const plan = planImport(validateBackup(other).data, db);
  assert.equal(plan.exercises.length, 0);   // reused existing "Bench Press"
  assert.equal(plan.reused, 1);
  assert.equal(plan.routines[0].name, 'Push (imported)');
  assert.equal(plan.routines[0].items[0].exerciseId, ex.id);
  assert.ok(planImport(v.data, friend).workouts.length === 1);
});

test('invalid files are rejected, damaged records skipped', () => {
  assert.equal(validateBackup(null).ok, false);
  assert.equal(validateBackup({ format: 'something' }).ok, false);
  assert.equal(validateBackup({ format: 'workoutlog-web', version: 999 }).ok, false);
  const v = validateBackup({ format: 'workoutlog-web', version: 1, exercises: [{ id: 'x' }], workouts: [{ id: 'w' }] });
  assert.ok(v.ok);
  assert.equal(v.data.exercises.length, 0);
  assert.equal(v.warnings.length, 2);
});

test('iPhone app backups are converted', () => {
  const ios = { format: 'workoutlog-backup', version: 1, kind: 'full', exercises: [{ id: 'E1', name: 'Squat', targetSets: 3, repMin: 5, repMax: 8, restSeconds: 180, weightIncrement: 2.5, note: '' }], routines: [{ id: 'R1', name: 'Legs', sortIndex: 0, exerciseIDs: ['E1'] }], workouts: [{ id: 'W1', routineName: 'Legs', startedAt: '2026-10-01T10:00:00Z', endedAt: '2026-10-01T11:00:00Z', notes: '', exercises: [{ id: 'X', exerciseID: 'E1', exerciseName: 'Squat', sortIndex: 0, sets: [{ id: 'S', position: 0, weightKg: 100, reps: 5, isCompleted: true }] }] }] };
  const v = validateBackup(ios);
  assert.ok(v.ok);
  assert.equal(v.data.workouts[0].entries[0].sets[0].kg, 100);
  assert.equal(v.data.routines[0].items[0].exerciseId, 'E1');
});

// ---------- Blocks ----------
test('blocks: active block, week number, deload, schedule', () => {
  const b = { id: 'b', name: 'Block', phase: 'Accumulation', startDate: '2026-01-05', weeks: 4, deloadWeeks: [4], schedule: { 1: ['push'] } };
  const mon = new Date(2026, 0, 5, 9).getTime();
  assert.equal(activeBlock([b], mon).id, 'b');
  assert.equal(blockWeek(b, mon), 1);
  assert.equal(blockWeek(b, new Date(2026, 0, 26, 9).getTime()), 4);
  assert.equal(isDeloadWeek(b, new Date(2026, 0, 27).getTime()), true);
  assert.deepEqual(plannedRoutineIds([b], mon), ['push']);
  assert.equal(activeBlock([b], new Date(2026, 1, 5).getTime()), null);
});

// ---------- Misc ----------
test('streaks, templates and number parsing', () => {
  const now = new Date(2026, 0, 21, 12).getTime(); // Wednesday
  const ws = [day(2), day(9), day(16)].map((d, i) => workout('s' + i, d, []));
  assert.equal(weekStreak(ws, now, 1), 3);
  const t = buildTemplate('ppl', [], settings, 0);
  assert.equal(t.routines.length, 3);
  assert.equal(t.exercises.length, 15);
  assert.equal(parseNum('62,5'), 62.5);
  assert.equal(parseNum(''), null);
});

// ---------- Descending-reps rule (default) ----------
test('descending: 10, 9, 8 in a 6–10 range suggests more weight', () => {
  const ex = newExercise(settings, { repMin: 6, repMax: 10, sets: 3 });
  assert.equal(ex.progression.rule, 'descending');
  const mk = (reps) => ({ workout: workout('w', day(0), []), entry: entry(ex, reps.map((r) => S(60, r))) });
  const r = evaluateProgression(ex, mk([10, 9, 8]), cfg(ex), settings);
  assert.equal(r.status, 'increase');
  assert.equal(r.suggestedKg, 62.5);
  assert.match(r.reason, /10, 9, 8/);
  assert.equal(evaluateProgression(ex, mk([10, 10, 9]), cfg(ex), settings).status, 'increase');
  assert.equal(evaluateProgression(ex, mk([10, 8, 8]), cfg(ex), settings).status, 'keep');
  assert.equal(evaluateProgression(ex, mk([9, 9, 8]), cfg(ex), settings).status, 'keep');
  assert.match(evaluateProgression(ex, mk([9, 9, 8]), cfg(ex), settings).reason, /aim for 10, 9, 8/);
});

test('descending never asks for fewer reps than the bottom of the range', () => {
  const ex = newExercise(settings, { repMin: 8, repMax: 10, sets: 4 });
  const last = { workout: workout('w', day(0), []), entry: entry(ex, [10, 9, 8, 7].map((r) => S(50, r))) };
  assert.equal(evaluateProgression(ex, last, cfg(ex), settings).status, 'keep'); // 4th set needs 8
  const ok = { workout: workout('w', day(0), []), entry: entry(ex, [10, 9, 8, 8].map((r) => S(50, r))) };
  assert.equal(evaluateProgression(ex, ok, cfg(ex), settings).status, 'increase');
});

test('drop sets and warm-ups are ignored by the descending rule', () => {
  const ex = newExercise(settings, { repMin: 6, repMax: 10, sets: 2 });
  const sets = [S(30, 8, { type: 'warmup' }), S(60, 10), S(60, 9), S(47.5, 6, { type: 'drop' })];
  assert.equal(evaluateProgression(ex, { workout: workout('w', day(0), []), entry: entry(ex, sets) }, cfg(ex), settings).status, 'increase');
});

// ---------- Live PR + catalog ----------
import { livePr } from '../js/logic/records.js';
import { CATALOG, guideFor, CATALOG_CODES } from '../js/logic/catalog.js';
import { BASE_MUSCLES } from '../js/logic/muscles.js';

test('live PR fires once for a new heaviest set, not on the first session', () => {
  const ex = newExercise(settings);
  const h = buildHistory([workout('w1', day(0), [entry(ex, [S(60, 10), S(60, 9)])])]);
  const e = entry(ex, [S(62.5, 8), S(62.5, 8)]);
  assert.equal(livePr(e, e.sets[0], h.get(ex.id), []).key, 'bestWeight');
  assert.equal(livePr(e, e.sets[1], h.get(ex.id), []), null); // same weight again today → no second PR
  const first = entry(ex, [S(100, 5)]);
  assert.equal(livePr(first, first.sets[0], [], []), null);
  const warm = entry(ex, [S(100, 5, { type: 'warmup' })]);
  assert.equal(livePr(warm, warm.sets[0], h.get(ex.id), []), null);
  const e2 = entry(ex, [S(55, 15)]);
  assert.equal(livePr(e2, e2.sets[0], h.get(ex.id), []).key, 'bestE1rm');
});

test('catalog: unique names, valid muscles and rep ranges', () => {
  const names = CATALOG.map((c) => c.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  const valid = new Set(BASE_MUSCLES.map((m) => m.key));
  for (const c of CATALOG) {
    assert.ok(Object.keys(c.muscles).length > 0, c.name);
    for (const k of Object.keys(c.muscles)) assert.ok(valid.has(k), `${c.name}: ${k}`);
    assert.ok(c.repMin <= c.repMax, c.name);
  }
  assert.ok(CATALOG.length > 120);
  assert.match(guideFor({ name: 'Bench Press' }), /simplyfitness\.com\/pages\/barbell-bench-press/);
  assert.match(guideFor({ name: 'My Weird Exercise' }), /youtube\.com/);
  assert.ok(Object.keys(CATALOG_CODES).length >= 15);
});

test('strength trend: first session in window vs best of the latest two', () => {
  const up = newExercise(settings, { name: 'Up' });
  const flat = newExercise(settings, { name: 'Flat' });
  const once = newExercise(settings, { name: 'Once' });
  const ws = [
    workout('a', day(0), [entry(up, [S(60, 8)]), entry(flat, [S(40, 10)]), entry(once, [S(20, 10)])]),
    workout('b', day(7), [entry(up, [S(62.5, 8)]), entry(flat, [S(40, 10)])]),
    workout('c', day(14), [entry(up, [S(65, 8)]), entry(flat, [S(40, 10)])]),
  ];
  const tr = strengthTrend(buildHistory(ws), [], day(15));
  assert.equal(tr.length, 2);
  assert.equal(tr[0].name, 'Up');
  assert.ok(tr[0].change > 0.07 && tr[0].change < 0.09);
  assert.equal(tr[1].change, 0);
  const b = trendBuckets(tr);
  assert.equal(b.up.length, 1); assert.equal(b.steady.length, 1); assert.equal(b.down.length, 0);
  assert.equal(strengthTrend(buildHistory(ws), [], day(100)).length, 0); // outside the 8-week window
});

test('old "back" muscle splits into lats / upper back / lower back', async () => {
  const { migrateBackData, splitBack } = await import('../js/logic/backup.js');
  assert.deepEqual(splitBack({ back: 1, biceps: 0.5 }, 'Lat Pulldown'), { biceps: 0.5, lats: 1, upper_back: 0.5 });
  assert.deepEqual(splitBack({ back: 1, biceps: 0.5 }, 'My Funky Row'), { biceps: 0.5, upper_back: 1, lats: 0.5 });
  assert.deepEqual(splitBack({ hamstrings: 1, back: 0.5 }, 'Romanian Deadlift'), { hamstrings: 1, lower_back: 0.5 });
  assert.deepEqual(splitBack({ back: 1 }, 'Single-Arm Machine Row'), { lats: 1, upper_back: 0.5 });
  assert.deepEqual(splitBack({ chest: 1 }, 'Bench Press'), { chest: 1 });
  const d = {
    exercises: [{ name: 'Barbell Row', muscles: { back: 1, rear_delts: 0.5 } }, { name: 'Bench Press', muscles: { chest: 1 } }],
    workouts: [{ entries: [{ snapshot: { name: 'Pull-up', muscles: { back: 1 } } }] }],
    settings: { ...defaultSettings(), volumeTargets: { back: { min: 12, max: 22 }, chest: { min: 10, max: 20 } } },
  };
  const ch = migrateBackData(d);
  assert.equal(ch.exercises.length, 1); assert.equal(ch.workouts.length, 1);
  assert.equal(d.exercises[0].muscles.upper_back, 1);
  assert.equal(d.workouts[0].entries[0].snapshot.muscles.lats, 1);
  assert.deepEqual(d.settings.volumeTargets.lats, { min: 12, max: 22 });
  assert.equal(d.settings.volumeTargets.back, undefined);
});

test('health: parse the shortcut text and build the shortcut link', async () => {
  const H = await import('../js/logic/health.js');
  assert.deepEqual(H.parseHealthText('WL hr=148 kcal=420 dist=5.21 unit=km'), { hr: 148, kcal: 420, km: 5.21 });
  assert.deepEqual(H.parseHealthText('WL hr=147.6 kcal=1024 dist=3,2 unit=mi'), { hr: 148, kcal: 1024, km: 5.15 });
  assert.equal(H.parseLocaleNumber('1.801'), 1.801);
  assert.equal(H.parseLocaleNumber('6.5e-05'), 0.000065);
  assert.equal(H.parseLocaleNumber('1,024,000'), 1024000);
  assert.equal(H.parseLocaleNumber('1.234,5'), 1234.5);
  assert.deepEqual(H.parseHealthText('WL hr= kcal=310 dist=0 unit=km'), { hr: null, kcal: 310, km: null });
  assert.equal(H.parseHealthText('hello'), null);
  assert.equal(H.parseHealthText(''), null);
  const url = H.shortcutUrl(new Date(2026, 10, 1, 9, 5, 0).getTime(), new Date(2026, 10, 1, 10, 0, 0).getTime());
  assert.match(url, /^shortcuts:\/\/run-shortcut\?name=Workout%20Log%20Health&input=text&text=/);
  assert.ok(decodeURIComponent(url).endsWith('2026-11-01 09:05:00|2026-11-01 10:00:00'));
});

test('runs: pace, records and weekly km', async () => {
  const H = await import('../js/logic/health.js');
  const run = (id, d, km, min) => ({ id, kind: 'run', status: 'done', startedAt: day(d), endedAt: day(d) + min * 60000, entries: [], run: { km } });
  const runs = [run('c', 14, 5, 25), run('b', 7, 10, 55), run('a', 0, 3, 18)];
  assert.equal(H.fmtPace(H.paceS(runs[0])), '5:00');
  const st = H.runStats(runs, day(15), 1, 4);
  assert.equal(st.longest.id, 'b');
  assert.equal(st.fastest.id, 'c');
  assert.equal(st.fastest5k.id, 'c');
  assert.equal(Math.round(st.totalKm), 18);
  assert.equal(st.weekly.length, 4);
});

test('health v2: raw readings with times are filtered to the workout window', async () => {
  const H = await import('../js/logic/health.js');
  assert.equal(H.parseShortcutDate('1 Nov 2026 at 15:14'), new Date(2026, 10, 1, 15, 14).getTime());
  assert.equal(H.parseShortcutDate('Nov 1, 2026 at 3:14 PM'), new Date(2026, 10, 1, 15, 14).getTime());
  assert.equal(H.parseShortcutDate('1 November 2026 at 09:05:30'), new Date(2026, 10, 1, 9, 5, 30).getTime());
  assert.equal(H.parseShortcutDate('2026-11-01T15:14:05+02:00'), new Date(2026, 10, 1, 15, 14, 5).getTime());
  const text = [
    'WL2', 'HR', '70', '140', '150', '@', '1 Nov 2026 at 13:00', '1 Nov 2026 at 15:10', '1 Nov 2026 at 15:40',
    'KC', '5', '120,5', '200', '@', '1 Nov 2026 at 12:00', '1 Nov 2026 at 15:20', '1 Nov 2026 at 15:50',
    'DI', '0.4', '2.1', '3.0', '@', '31 Oct 2026 at 18:00', '1 Nov 2026 at 15:15', '1 Nov 2026 at 15:45',
  ].join('\n');
  const from = new Date(2026, 10, 1, 15, 0).getTime(), to = new Date(2026, 10, 1, 16, 0).getTime();
  assert.deepEqual(H.parseHealthText(text, from, to), { hr: 145, kcal: 321, km: 5.1, empty: false, dailyKcal: false });
  const none = H.parseHealthText(text, from + 86400000, to + 86400000);
  assert.equal(none.empty, true);
  assert.equal(H.parseHealthText('random text', from, to), null);
  const daily = ['WL2', 'HR', '@', 'KC', '711', '512', '13', '@', '31 Oct 2026 at 0:00', '1 Nov 2026 at 0:00', '2 Nov 2026 at 0:00', 'DI', '0.5', '@', '1 Nov 2026 at 15:30'].join('\n');
  const rd = H.parseHealthText(daily, from, new Date(2026, 10, 2, 1, 0).getTime());
  assert.equal(rd.kcal, null); assert.equal(rd.km, 0.5); assert.equal(rd.dailyKcal, true);
  // old one-line format still works
  assert.equal(H.parseHealthText('WL hr=148 kcal=420 dist=5.21 unit=km', from, to).hr, 148);
});

test('runs are found automatically in the distance readings', async () => {
  const H = await import('../js/logic/health.js');
  const f = (h, m) => `1 Nov 2026 at ${h}:${String(m).padStart(2, '0')}`;
  // walking all day (0.3 km per 10 min ≈ 1.8 km/h), a 30-min run at 18:00 (1.6 km per 10 min ≈ 9.6 km/h)
  const vals = [], starts = [], ends = [];
  const add = (h, m, km, mins) => { vals.push(String(km)); starts.push(f(h, m)); const e = new Date(2026, 10, 1, h, m + mins); ends.push(f(e.getHours(), e.getMinutes())); };
  add(9, 0, 0.3, 10); add(12, 0, 0.25, 10); add(18, 0, 1.6, 10); add(18, 10, 1.65, 10); add(18, 20, 1.55, 10); add(18, 31, 0.1, 9); add(20, 0, 0.3, 10);
  const withEnds = ['WL2', 'HR', '@', 'KC', '@', 'DI', ...vals, '@', ...starts, '@', ...ends].join('\n');
  const runs = H.detectRuns(withEnds);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].from, new Date(2026, 10, 1, 18, 0).getTime());
  assert.equal(runs[0].to, new Date(2026, 10, 1, 18, 30).getTime());
  assert.equal(runs[0].km, 4.8);
  // without end times (older shortcut) it still finds it
  const noEnds = ['WL2', 'HR', '@', 'KC', '@', 'DI', ...vals, '@', ...starts].join('\n');
  const r2 = H.detectRuns(noEnds);
  assert.equal(r2.length, 1); assert.equal(r2[0].km, 4.8);
  assert.equal(H.detectRuns('nothing'), null);
});

test('per-set goals: each set has its own rep target', async () => {
  const { evaluateProgression, setGoals, parseSetGoals } = await import('../js/logic/progression.js');
  assert.deepEqual(parseSetGoals('12, 12,11 11'), [12, 12, 11, 11]);
  const ex = { type: 'weighted', repMin: 9, repMax: 12, sets: 7, progression: { rule: 'per_set', setGoals: [12, 12, 11, 11, 10, 10, 9] } };
  assert.deepEqual(setGoals(ex, 8), [12, 12, 11, 11, 10, 10, 9, 9]);
  const last = (reps) => ({ workout: {}, entry: { sets: reps.map((r) => ({ done: true, type: 'working', kg: 40, reps: r })) } });
  const cfg = { sets: 7, repMin: 9, repMax: 12 };
  assert.equal(evaluateProgression(ex, last([12, 12, 11, 11, 10, 10, 9]), cfg, { unit: 'kg' }).status, 'increase');
  assert.equal(evaluateProgression(ex, last([12, 12, 11, 10, 10, 10, 9]), cfg, { unit: 'kg' }).status, 'keep');
});

// ---------- Automatic warm-up ----------
import { syncWarmups, warmupKg, warmupCount } from '../js/logic/warmup.js';

test('warm-up weights are 50/70/85 % of the first working set, rounded to the step', () => {
  const settings = { warmupAuto: true, unit: 'kg', warmupSteps: [{ pct: 50, reps: 10 }, { pct: 70, reps: 5 }, { pct: 85, reps: 2 }] };
  const entry = { snapshot: { type: 'weighted', weightStep: 2.5 }, sets: [
    { type: 'warmup', auto: true, kg: null, reps: null, done: false },
    { type: 'warmup', auto: true, kg: null, reps: null, done: false },
    { type: 'warmup', auto: false, kg: 30, reps: 3, done: false },
    { type: 'working', kg: 100, reps: 8, done: false },
  ] };
  syncWarmups(entry, settings);
  assert.deepEqual(entry.sets.slice(0, 3).map((s) => [s.kg, s.reps]), [[50, 10], [70, 5], [30, 3]]);
  entry.sets[3].kg = 80; // working weight changes → warm-ups follow
  syncWarmups(entry, settings);
  assert.deepEqual(entry.sets.slice(0, 2).map((s) => s.kg), [40, 55]);
  assert.equal(warmupKg(62.5, 85, 2.5, 'kg'), 52.5);
});

test('warm-up count: own setting, else every weighted exercise only when chosen', () => {
  const s = { warmupAuto: true, warmupScope: 'all', warmupSteps: [{ pct: 50, reps: 10 }, { pct: 70, reps: 5 }, { pct: 85, reps: 2 }] };
  assert.equal(warmupCount({ warmupSets: 0, type: 'weighted' }, s), 3);
  assert.equal(warmupCount({ warmupSets: 1, type: 'weighted' }, s), 1);
  assert.equal(warmupCount({ warmupSets: 0, type: 'bodyweight' }, s), 0);
  assert.equal(warmupCount({ warmupSets: 0, type: 'weighted' }, { ...s, warmupScope: 'chosen' }), 0);
});

test('warm-up follows the heaviest working set; next step matches the warm-up number', async () => {
  const { nextWarmupStep } = await import('../js/logic/warmup.js');
  const settings = { warmupAuto: true, unit: 'kg', warmupSteps: [{ pct: 50, reps: 10 }, { pct: 70, reps: 5 }, { pct: 85, reps: 2 }] };
  const entry = { snapshot: { type: 'weighted', weightStep: 2.5 }, sets: [
    { type: 'warmup', auto: true, kg: null, reps: null, done: false },
    { type: 'working', kg: 80, reps: 8, done: false },
    { type: 'working', kg: 100, reps: 6, done: false },
  ] };
  syncWarmups(entry, settings);
  assert.deepEqual([entry.sets[0].kg, entry.sets[0].reps], [50, 10]);
  assert.deepEqual(nextWarmupStep(entry, settings), { pct: 70, reps: 5 });
});

test('warm-up uses the suggested or last-time weight when nothing is typed yet', async () => {
  const { baseWorkKg } = await import('../js/logic/warmup.js');
  const settings = { unit: 'kg', warmupSteps: [{ pct: 50, reps: 10 }, { pct: 70, reps: 5 }, { pct: 85, reps: 2 }] };
  const entry = { snapshot: { type: 'weighted', weightStep: 2.5 }, progression: { status: 'none' },
    lastSummary: { sets: [{ type: 'working', kg: 80, reps: 8 }, { type: 'working', kg: 90, reps: 6 }] },
    sets: [{ type: 'warmup', auto: true, kg: null, reps: null }, { type: 'working', kg: null, reps: null }] };
  assert.equal(baseWorkKg(entry), 90);
  syncWarmups(entry, settings);
  assert.equal(entry.sets[0].kg, 45);
  entry.progression = { status: 'increase', suggestedKg: 92.5 };
  assert.equal(baseWorkKg(entry), 92.5);
  entry.sets[1].kg = 100;
  assert.equal(baseWorkKg(entry), 100);
});

test('warm-up for weighted bodyweight (+kg) and assisted exercises', () => {
  const settings = { unit: 'kg', warmupSteps: [{ pct: 50, reps: 10 }, { pct: 70, reps: 5 }, { pct: 85, reps: 2 }] };
  const mk = (type, kg) => ({ snapshot: { type, weightStep: 2.5 }, sets: [
    { type: 'warmup', auto: true, kg: null, reps: null }, { type: 'warmup', auto: true, kg: null, reps: null },
    { type: 'working', kg, reps: 6 }] });
  const bw = mk('weighted_bw', 10); syncWarmups(bw, settings);
  assert.deepEqual(bw.sets.slice(0, 2).map((s) => [s.kg, s.reps]), [[5, 10], [7.5, 5]]);
  const as = mk('assisted', 20); syncWarmups(as, settings);
  assert.deepEqual(as.sets.slice(0, 2).map((s) => s.kg), [40, 27.5]);
  const body = { snapshot: { type: 'bodyweight' }, sets: [{ type: 'warmup', auto: true, kg: null, reps: null }, { type: 'working', reps: 10 }] };
  syncWarmups(body, settings);
  assert.equal(body.sets[0].reps, 10);
});
