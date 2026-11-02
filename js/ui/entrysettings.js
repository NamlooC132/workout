// "This workout's settings": change everything about one exercise for the current workout only.
// Edits the entry's snapshot and its sets; the routine and the exercise library stay as they are
// (unless you tap "Also save to the exercise").
import { h } from '../vdom.js';
import { icon } from './icons.js';
import { data, update, toast, exercisesById, saveExercise, history } from '../store.js';
import { Sheet, Section, Row, Stepper, Toggle, Segmented, NumberField, Button } from './components.js';
import { select } from './exercises.js';
import { EXERCISE_TYPES } from '../logic/muscles.js';
import { fmtClock, fmtNum } from '../logic/util.js';
import { REST_STEP, REST_MIN, REST_MAX } from '../logic/restTimer.js';
import { evaluateProgression, setGoals, progressionStep } from '../logic/progression.js';
import { lastSession } from '../logic/history.js';
import { defaultProgressionStep } from '../logic/units.js';
import * as WS from '../workoutService.js';

const isWork = (s) => s.type !== 'warmup' && s.type !== 'drop';
const KINDS = {
  work: { test: isWork, add: undefined },
  warmup: { test: (s) => s.type === 'warmup', add: 'warmup' },
  drop: { test: (s) => s.type === 'drop', add: 'drop' },
};

/** Change how many sets of a kind the entry has (only unfinished sets are removed). */
function setCount(w, entry, kind, target) {
  const k = KINDS[kind];
  let have = entry.sets.filter(k.test).length;
  while (have < target) { WS.addSet(w, entry, k.add); have++; }
  while (have > target) {
    const last = [...entry.sets].reverse().find((s) => k.test(s) && !s.done);
    if (!last) { toast('Finished sets can’t be removed here'); break; }
    entry.sets = entry.sets.filter((s) => s !== last);
    have--;
  }
  if (kind === 'work') entry.snapshot.sets = Math.max(1, entry.sets.filter(isWork).length);
  WS.save(w);
}

/** Re-check the weight suggestion after the rule changes. */
function reevaluate(w, entry) {
  const ex = exercisesById().get(entry.exerciseId);
  if (!ex) return;
  const snap = entry.snapshot;
  const last = lastSession(history(), ex.id, { excludeWorkoutId: w.id });
  const res = evaluateProgression({ ...ex, type: snap.type, progression: snap.progression }, last, { sets: snap.sets, repMin: snap.repMin, repMax: snap.repMax }, data.settings);
  entry.progression = { ...res, applied: false, dismissed: false };
}

// sheet: { type: 'entrySettings', workoutId, entryId }
export function EntrySettingsSheet(sheet) {
  const w = data.workouts.find((x) => x.id === sheet.workoutId);
  const entry = w?.entries.find((e) => e.id === sheet.entryId);
  if (!entry) return null;
  const snap = entry.snapshot;
  snap.progression = snap.progression || {};
  const s = data.settings;
  const unit = s.unit;
  const hasWeight = snap.type !== 'bodyweight';
  const ex = exercisesById().get(entry.exerciseId);
  const change = (patch, recheck) => { Object.assign(snap, patch); if (recheck) reevaluate(w, entry); WS.save(w); update(); };
  const setProg = (patch) => change({ progression: { ...snap.progression, ...patch } }, true);
  const count = (kind) => entry.sets.filter(KINDS[kind].test).length;

  // Goal for each set
  const perSet = snap.progression.rule === 'per_set';
  const goalList = perSet ? setGoals(snap, count('work')) : [];
  const applyGoals = (goals) => {
    goals = goals.map((g) => Math.max(1, Math.min(200, Math.round(g || 1))));
    snap.progression = { ...snap.progression, setGoals: goals };
    snap.repMin = Math.min(...goals); snap.repMax = Math.max(...goals);
    setCount(w, entry, 'work', goals.length);
    reevaluate(w, entry); WS.save(w); update();
  };
  const setWork = (v) => {
    if (!perSet) { setCount(w, entry, 'work', v); reevaluate(w, entry); WS.save(w); return update(); }
    const g = goalList.slice(0, v);
    while (g.length < v) g.push(g[g.length - 1] || snap.repMax || 10);
    applyGoals(g);
  };
  const stepOptions = unit === 'kg' ? [0.5, 1, 1.25, 2, 2.5, 5, 10] : [1, 2.5, 5, 10];

  const saveToExercise = () => {
    if (!ex) return;
    saveExercise({
      ...ex,
      type: snap.type, loadMode: snap.loadMode, unilateral: !!snap.unilateral,
      sets: count('work'), warmupSets: count('warmup'), dropSets: count('drop'),
      repMin: snap.repMin, repMax: snap.repMax, rest: snap.rest, weightStep: snap.weightStep, rirTarget: snap.rirTarget,
      progression: { ...(ex.progression || {}), ...snap.progression },
    });
    toast('Saved to the exercise');
  };

  return h(Sheet, { title: 'This workout’s settings', full: true }, [
    h('div.callout.blue', { style: { marginBottom: '12px' } }, [icon('info', 18), 'Changes here only apply to this workout. Your routine and the exercise library stay the same.']),

    h(Section, { title: 'Sets, reps and rest' }, [
      h(Row, { title: 'Working sets', right: h(Stepper, { value: count('work'), min: 1, max: 20, onChange: setWork }) }),
      !perSet && h(Row, { title: 'Rep range', right: h('div.hstack', { style: { gap: '6px' } }, [
        h(NumberField, { value: snap.repMin, decimals: false, class: 'w-64 center', ariaLabel: 'Min reps', onChange: (v) => { if (v) change({ repMin: v, repMax: Math.max(v, snap.repMax) }, true); } }),
        h('span.muted', '–'),
        h(NumberField, { value: snap.repMax, decimals: false, class: 'w-64 center', ariaLabel: 'Max reps', onChange: (v) => { if (v) change({ repMax: v, repMin: Math.min(v, snap.repMin) }, true); } }),
      ]) }),
      h(Row, { title: 'Rest timer', right: h(Stepper, { value: snap.rest || s.defaultRest || 90, step: REST_STEP, min: REST_MIN, max: REST_MAX, format: fmtClock, onChange: (v) => change({ rest: v }) }) }),
    ]),

    h(Section, { title: 'Extra sets' }, [
      h(Row, { title: 'Warm-up sets', right: h(Stepper, { value: count('warmup'), min: 0, max: 6, onChange: (v) => { setCount(w, entry, 'warmup', v); update(); } }) }),
      h(Row, { title: 'Drop sets', subtitle: 'After the last working set', right: h(Stepper, { value: count('drop'), min: 0, max: 4, onChange: (v) => { setCount(w, entry, 'drop', v); update(); } }) }),
      hasWeight && h(Row, { title: '− / + buttons change weight by', right: select(stepOptions.map((x) => ({ value: x, label: `${x} ${unit}` })), snap.weightStep || 2.5, (v) => change({ weightStep: Number(v) })) }),
      h(Row, { title: 'Target RIR', subtitle: 'Reps in reserve you aim for', right: select([{ value: '', label: 'None' }, ...[0, 1, 2, 3, 4].map((x) => ({ value: String(x), label: `${x}` })), { value: '5', label: '5+' }], snap.rirTarget === null || snap.rirTarget === undefined ? '' : String(snap.rirTarget), (v) => change({ rirTarget: v === '' ? null : Number(v) })) }),
    ]),

    h(Section, { title: 'Details' }, [
      h(Row, { title: 'Type', right: select(EXERCISE_TYPES.map((t) => ({ value: t.key, label: t.name })), snap.type, (v) => change({ type: v }, true)) }),
      snap.type === 'dumbbell' && h(Row, { title: 'Weight is entered', right: h(Segmented, { small: true, value: snap.loadMode || 'per_hand', onChange: (v) => change({ loadMode: v }), options: [{ value: 'per_hand', label: 'Per hand' }, { value: 'total', label: 'Total' }] }) }),
      h(Row, { title: 'One side at a time', subtitle: 'Log left and right reps separately', right: h(Toggle, { checked: !!snap.unilateral, onChange: (v) => {
        for (const st of entry.sets) if (v && st.repsL == null && st.repsR == null && st.reps != null) { st.repsL = st.reps; st.repsR = st.reps; }
        change({ unilateral: v });
      } }) }),
    ]),

    h(Section, { title: 'Progressive overload' }, [
      h(Row, { title: 'Rule', right: select([
        { value: 'descending', label: 'Reps drop 1 per set (10, 9, 8)' },
        { value: 'all_max', label: 'Max reps on all sets' },
        { value: 'avg', label: 'Average reps' },
        { value: 'custom', label: 'Custom' },
        { value: 'per_set', label: 'Goal for each set' },
      ], snap.progression.rule || 'descending', (v) => {
        setProg({ rule: v });
        if (v === 'per_set' && !(snap.progression.setGoals || []).length) applyGoals(setGoals({ ...snap, progression: { ...snap.progression, rule: 'descending' } }, count('work')));
      }) }),
      perSet && h('div.pad', [
        h('div.small.muted', { style: { marginBottom: '8px' } }, 'Rep goal for each working set. Adding a set adds a box.'),
        h('div.goal-grid', goalList.map((g, i) => h('label.goal-box', { key: i }, [
          h('span.goal-lbl', `Set ${i + 1}`),
          h(NumberField, { value: g, decimals: false, class: 'goal-input', ariaLabel: `Set ${i + 1} goal`, onChange: (v) => { const next = goalList.slice(); next[i] = v || 1; applyGoals(next); } }),
          goalList.length > 1 && h('button.goal-x', { onclick: (e) => { e.preventDefault(); applyGoals(goalList.filter((_, k) => k !== i)); }, 'aria-label': `Remove set ${i + 1}` }, '×'),
        ]))),
        goalList.length < 20 && h('button.btn.btn-secondary.btn-sm', { style: { marginTop: '10px' }, onclick: () => setWork(goalList.length + 1) }, [icon('plus', 16), 'Add set']),
      ]),
      snap.progression.rule === 'avg' && h(Row, { title: 'Average reps needed', right: h(Stepper, { value: snap.progression.avgTarget || snap.repMax, min: 1, max: 100, onChange: (v) => setProg({ avgTarget: v }) }) }),
      snap.progression.rule === 'custom' && h(Row, { title: 'Reps on every set', right: h(Stepper, { value: snap.progression.customReps || snap.repMax, min: 1, max: 100, onChange: (v) => setProg({ customReps: v }) }) }),
      hasWeight && h(Row, {
        title: snap.type === 'assisted' ? 'Reduce assistance by' : 'Increase by',
        right: h('div.hstack', [
          h(NumberField, { value: snap.progression.step ?? null, placeholder: fmtNum(progressionStep({ progression: {} }, s) || defaultProgressionStep(unit)), onChange: (v) => setProg({ step: v || null }), class: 'w-80' }),
          h('span.muted', unit),
        ]),
      }),
    ]),

    ex && h('div', { style: { margin: '6px 0 4px' } }, h(Button, { kind: 'secondary', block: true, onClick: saveToExercise }, 'Also save these to the exercise')),
    ex && h('div.small.muted.center', { style: { marginBottom: '12px' } }, 'Makes them the default for every future workout with this exercise.'),
  ]);
}
