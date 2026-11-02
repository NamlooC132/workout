// Live workout screen, compact rest timer, set/exercise menus and the finish summary.
//
// Layout goals: easy to scan with sweaty hands.
//  • Each exercise: picture, name, last session, the sets, one "Add set" button.
//  • Less-used actions (replace, reorder, notes, set type, warm-up/drop sets) live in ⋯ menus.
//  • RIR and notes stay collapsed until tapped (unless RIR is set to "required").
//  • The rest timer is a slim bar at the bottom; the next set is scrolled into view above it.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, closeSheet, confirm, toast, exercisesById, saveWorkout, history } from '../store.js';
import { Page, Section, Row, Button, IconButton, Sheet, TextField, Thumb, Chip, NumberField, WeightField, DragHandle, ExercisePhoto, fmtW, nav } from './components.js';
import { fmtClock, fmtDuration, fmtNum } from '../logic/util.js';
import { SET_TYPES, muscleName } from '../logic/muscles.js';
import { displayWeight, fromDisplayWeight } from '../logic/units.js';
import { workoutVolume } from '../logic/volume.js';
import { tonnage, bodyweightAt, personalRecords } from '../logic/records.js';
import * as WS from '../workoutService.js';
import { startRest, adjustRest, skipRest, restRemaining, syncWakeLock } from '../timer.js';
import { guideFor, photoFor } from '../logic/catalog.js';
import { HealthBox } from './health.js';

// ---------- "Last time" text ----------
export function setsSummary(sets, snap) {
  const work = sets.filter((s) => s.type !== 'warmup');
  if (!work.length) return '';
  const groups = [];
  for (const s of work) {
    const repsText = snap?.unilateral && (s.repsL !== null || s.repsR !== null) ? `${s.repsL ?? 0}/${s.repsR ?? 0}` : String(s.reps ?? 0);
    const kind = s.type === 'drop' ? 'drop' : s.type === 'restpause' ? 'rest-pause' : '';
    const g = groups[groups.length - 1];
    if (g && g.kind === kind && Math.abs((g.kg ?? -1) - (s.kg ?? -1)) < 0.001) g.reps.push(repsText);
    else groups.push({ kg: s.kg, kind, reps: [repsText] });
  }
  return groups.map((g) => {
    const label = g.kind ? `${g.kind} ` : '';
    if (snap?.type === 'bodyweight') return `${label}${g.reps.join(', ')} reps`;
    const w = fmtW(g.kg ?? 0);
    const prefix = snap?.type === 'weighted_bw' ? '+' : snap?.type === 'assisted' ? '−' : '';
    return `${label}${prefix}${w} × ${g.reps.join(', ')}`;
  }).join(' · ');
}

function weightLabel(snap) {
  const u = data.settings.unit;
  switch (snap.type) {
    case 'dumbbell': return snap.loadMode === 'per_hand' ? `${u} each` : u;
    case 'weighted_bw': return `+${u}`;
    case 'assisted': return `assist ${u}`;
    default: return u;
  }
}

function fmtClockLong(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

// ---------- Workout screen ----------
export function WorkoutView({ w }) {
  const st = (ui.tabState.workout = ui.tabState.workout || { reorder: false, rirOpen: {} });
  st.rirOpen = st.rirOpen || {};
  const done = WS.doneCount(w);
  const total = w.entries.reduce((t, e) => t + (e.skipped ? 0 : e.sets.length), 0);

  return h('div.workout', { class: data.timer ? 'has-timer' : '' }, [
    h(Page, {
      title: w.routineName, large: false,
      left: h('button.icon-btn.back', { onclick: () => { ui.workoutOpen = false; update(); }, 'aria-label': 'Minimize workout' }, icon('chevronDown', 28)),
      actions: [
        h(IconButton, { name: 'more', label: 'Workout options', onClick: () => workoutMenu(w) }),
        h('button.btn.btn-green.btn-sm', { onclick: () => askFinish(w) }, 'Finish workout'),
      ],
    }, [
      h('div.wk-status', [
        h('span', [icon('timer', 16), fmtClockLong(Date.now() - w.startedAt)]),
        h('span', [icon('check', 16), `${done} of ${total} sets`]),
      ]),
      w.deload && !w.deloadApplied && h('div.deload-banner', [
        h('div', { style: { fontWeight: 700 } }, 'Deload week'),
        h('div.small', { style: { margin: '4px 0 10px' } }, 'Recover and come back stronger. Weight suggestions are paused this week.'),
        h('div.hstack', [
          h(Button, { size: 'sm', onClick: () => WS.undoable(w, 'Deload applied', () => WS.applyDeload(w)) }, 'Apply deload'),
          h(Button, { size: 'sm', kind: 'plain', onClick: () => { w.deloadApplied = true; saveWorkout(w); } }, 'Not now'),
        ]),
      ]),
      w.notes && h('div.callout', { style: { marginBottom: '12px' } }, [icon('note', 18), w.notes]),
      st.reorder ? ReorderList({ w, st }) : w.entries.map((e, i) => ExerciseCard({ w, entry: e, index: i, st })),
      !st.reorder && h(Button, { kind: 'secondary', block: true, onClick: () => openSheet({ type: 'picker', multi: true, title: 'Add exercise', context: { workoutId: w.id }, onPick: (exs) => WS.addExercises(w, exs) }) }, [icon('plus', 20), 'Add exercise']),
    ]),
    RestPanel({ inWorkout: true }),
  ]);
}

function ReorderList({ w, st }) {
  return h('div', [
    h('div.hstack', { style: { justifyContent: 'space-between', margin: '0 4px 8px' } }, [h('span.muted.small', 'Drag ≡ to reorder'), h('button.link-btn.strong', { onclick: () => { st.reorder = false; update(); } }, 'Done')]),
    h('div.card', w.entries.map((e) => h('div', { key: e.id, 'data-drag-row': '' }, h(Row, {
      left: h(Thumb, { image: exercisesById().get(e.exerciseId)?.image, name: e.snapshot.name, muscles: exercisesById().get(e.exerciseId)?.muscles || e.snapshot.muscles, size: 36 }),
      title: e.snapshot.name, subtitle: `${e.sets.filter((s) => s.done).length} of ${e.sets.length} sets${e.supersetId ? ' · superset' : ''}`,
      right: h(DragHandle, { onDrop: (a, b) => WS.moveEntry(w, a, b) }),
    })))),
  ]);
}

function ExerciseCard({ w, entry, index, st }) {
  const snap = entry.snapshot;
  const ex = exercisesById().get(entry.exerciseId);
  const prev = w.entries[index - 1], next = w.entries[index + 1];
  const inSS = !!entry.supersetId && ((prev && prev.supersetId === entry.supersetId) || (next && next.supersetId === entry.supersetId));
  const ssStart = inSS && (!prev || prev.supersetId !== entry.supersetId);
  const showWeight = snap.type !== 'bodyweight';
  const uni = !!snap.unilateral;
  const gridCls = cx(!showWeight && 'noweight', uni && 'uni');
  const rirMode = data.settings.rirMode;
  const step = snap.weightStep || data.settings.defaultWeightStep || 2.5;
  const currentSet = entry.sets.find((s) => !s.done);
  const notes = [ex?.notes, entry.routineNotes, entry.notes].filter(Boolean).join(' · ');
  const openHistory = () => openSheet({ type: 'exHistory', exerciseId: entry.exerciseId, name: snap.name });
  let workNo = 0;

  return h('div', { key: entry.id, class: cx('ex-card', entry.skipped && 'skipped', inSS && 'in-ss') }, [
    ssStart && h('div.ss-label', 'Superset · alternate sets'),
    h('div.ex-head', [
      h(Thumb, { image: ex?.image, name: snap.name, muscles: ex?.muscles || snap.muscles, size: 52 }),
      h('div.grow', [
        h('button.ex-name', { onclick: openHistory }, [snap.name, entry.skipped && h('span.tag', { style: { marginLeft: '6px' } }, 'Skipped')]),
        h('div.last-time', entry.lastSummary ? `Last: ${setsSummary(entry.lastSummary.sets, snap)}` : `First time · aim for ${snap.repMin}–${snap.repMax} reps`),
      ]),
      h(IconButton, { name: 'info', label: `How to do ${snap.name}`, class: 'howto-btn', onClick: () => openSheet({ type: 'howTo', name: snap.name, exerciseId: entry.exerciseId }) }),
      h(IconButton, { name: 'more', label: 'Exercise options', onClick: () => entryMenu(w, entry) }),
    ]),
    notes && h('div.notes-line', [icon('note', 14), h('span', notes)]),

    !entry.skipped && !w.deload && ProgressionBanner({ w, entry, p: entry.progression || {} }),

    !entry.skipped && [
      h('div.set-head', { class: gridCls }, [
        h('span', 'Set'),
        showWeight && h('span', weightLabel(snap)),
        uni ? [h('span', 'Left'), h('span', 'Right')] : h('span', 'Reps'),
        h('span'),
      ]),
      ...entry.sets.map((s, si) => {
        const isWarm = s.type === 'warmup';
        if (!isWarm) workNo++;
        const t = SET_TYPES.find((x) => x.key === s.type);
        const label = isWarm ? 'W' : `${workNo}${t && t.short ? t.short : ''}`;
        const isCurrent = s === currentSet;
        const hasPrev = si > 0;
        const showRir = rirMode !== 'off' && !isWarm && isCurrent && (rirMode === 'required' || st.rirOpen[s.id]);
        return h('div', { key: s.id, 'data-set': s.id, class: cx('set-wrap', s.done && 'done', isCurrent && 'current') }, [
          h('div.set-row', { class: gridCls }, [
            h('button', { class: cx('set-num', s.type), onclick: () => openSheet({ type: 'setMenu', workoutId: w.id, entryId: entry.id, setId: s.id }), 'aria-label': `Set ${label} options` }, s.pr ? h('span.pr-num', ['🏆', h('small', label)]) : label),
            showWeight && h('div.pill', [
              h('button.pill-btn', { onclick: () => bump(w, s, -step), 'aria-label': 'Less weight' }, icon('minus', 18)),
              h(WeightField, { kg: s.kg, class: 'pill-input', placeholder: '–', onChange: (kg) => { s.kg = kg; WS.save(w); } }),
              h('button.pill-btn', { onclick: () => bump(w, s, step), 'aria-label': 'More weight' }, icon('plus', 18)),
            ]),
            uni
              ? [
                h('div.pill', h(NumberField, { value: s.repsL, decimals: false, placeholder: 'L', class: 'pill-input', ariaLabel: 'Reps left', onChange: (v) => { s.repsL = v; s.reps = minReps(s); WS.save(w); } })),
                h('div.pill', h(NumberField, { value: s.repsR, decimals: false, placeholder: 'R', class: 'pill-input', ariaLabel: 'Reps right', onChange: (v) => { s.repsR = v; s.reps = minReps(s); WS.save(w); } })),
              ]
              : h('div.pill', h(NumberField, { value: s.reps, decimals: false, placeholder: isWarm ? '–' : `${snap.repMax}`, class: 'pill-input', ariaLabel: 'Reps', onChange: (v) => { s.reps = v; WS.save(w); } })),
            h('button', { class: cx('done-btn', s.done && 'on'), onclick: () => complete(w, entry, s), 'aria-label': s.done ? 'Mark set not done' : 'Set done' }, icon('check', 24, { weight: 3 })),
          ]),
          // Quiet extras: only on the set you're about to do
          isCurrent && !entry.skipped && h('div.set-tools', [
            hasPrev && h('button.tool', { onclick: () => WS.copyPrevious(w, entry, s) }, [icon('copy', 14), 'Copy last set']),
            rirMode !== 'off' && !isWarm && rirMode !== 'required' && h('button.tool', { class: st.rirOpen[s.id] ? 'on' : '', onclick: () => { st.rirOpen[s.id] = !st.rirOpen[s.id]; update(); } }, s.rir !== null && s.rir !== undefined ? `RIR ${s.rir === 5 ? '5+' : s.rir}` : 'RIR'),
            h('button.tool', { onclick: () => openSheet({ type: 'textInput', title: 'Set note', value: s.note, single: true, placeholder: 'e.g. paused reps', onSave: (v) => { s.note = v; WS.save(w); } }) }, s.note ? 'Edit note' : 'Note'),
          ]),
          showRir && h('div.set-extra', h('div.rir', [
            h('span.lbl', 'Reps in reserve'),
            ...[0, 1, 2, 3, 4, 5].map((r) => h('button', { class: s.rir === r ? 'on' : '', onclick: () => { s.rir = s.rir === r ? null : r; WS.save(w); }, 'aria-label': `${r} reps in reserve` }, r === 5 ? '5+' : String(r))),
          ])),
          (s.note || (s.done && s.rir !== null && s.rir !== undefined && !isWarm)) && h('div.set-note', [
            s.done && s.rir !== null && s.rir !== undefined && !isWarm && `RIR ${s.rir === 5 ? '5+' : s.rir}`,
            s.note && (s.done && s.rir !== null && s.rir !== undefined ? ' · ' : ''), s.note,
          ]),
        ]);
      }),
      h('button.add-set', { onclick: () => WS.addSet(w, entry) }, [icon('plus', 18), 'Add set']),
    ],
  ]);
}

/** Tick a set; afterwards keep the next set visible above the rest timer. */
function complete(w, entry, s) {
  document.activeElement?.blur?.();
  const wasDone = s.done;
  if (!WS.toggleSet(w, entry, s) || wasDone) return;
  setTimeout(() => {
    const next = WS.nextUp(w, s);
    if (!next) return;
    const el = document.querySelector(`[data-set="${next.set.id}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const limit = window.innerHeight - (data.timer ? 130 : 40);
    if (r.bottom > limit || r.top < 70) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
}

function minReps(s) {
  const vals = [s.repsL, s.repsR].filter((v) => v !== null && v !== undefined);
  return vals.length ? Math.min(...vals) : null;
}

function bump(w, s, delta) {
  const u = data.settings.unit;
  const cur = displayWeight(s.kg || 0, u);
  const nextV = Math.max(0, Math.round((cur + delta) * 100) / 100);
  s.kg = fromDisplayWeight(nextV, u);
  WS.save(w);
}

function ProgressionBanner({ w, entry, p }) {
  const unit = data.settings.unit;
  if (p.status === 'increase' && p.applied) {
    return h('div.overload.applied', h('div.msg', `✓ ${fmtW(p.suggestedKg)} applied – go get it!`));
  }
  if (p.status === 'increase' && !p.dismissed) {
    return h('div.overload', [
      h('div.hstack', { style: { alignItems: 'flex-start' } }, [
        icon('arrowUp', 20, { weight: 2.6 }),
        h('div.msg.grow', p.assisted ? `${p.reason} — use ${fmtNum(p.step)} ${unit} less assistance` : `${p.reason} — add ${fmtNum(p.step)} ${unit}`),
        h('button.close', { onclick: () => WS.undoable(w, 'Suggestion hidden', () => WS.dismissSuggestion(w, entry)), 'aria-label': 'Hide suggestion' }, icon('x', 18)),
      ]),
      h('div.sug', [
        h('div', [h('div.k', 'Suggested'), h('div.v', fmtW(p.suggestedKg))]),
        h('button.apply', { onclick: () => WS.undoable(w, `${fmtW(p.suggestedKg)} applied to your sets`, () => WS.applySuggestion(w, entry)) }, 'Apply'),
      ]),
    ]);
  }
  if (p.status === 'harder' && !p.dismissed) {
    return h('div.overload', h('div.hstack', { style: { alignItems: 'flex-start' } }, [icon('arrowUp', 20), h('div.msg.grow', p.reason), h('button.close', { onclick: () => WS.dismissSuggestion(w, entry) }, icon('x', 18))]));
  }
  if (p.status === 'keep') return h('div.keep-hint', p.reason);
  return null;
}

function entryMenu(w, entry) {
  const idx = w.entries.indexOf(entry);
  const next = w.entries[idx + 1];
  const ex = exercisesById().get(entry.exerciseId);
  openSheet({
    type: 'actions', title: entry.snapshot.name, actions: [
      entry.exerciseId && { text: 'History', icon: 'history', onClick: () => openSheet({ type: 'exHistory', exerciseId: entry.exerciseId, name: entry.snapshot.name }) },
      { text: 'How to do it', icon: 'info', onClick: () => openSheet({ type: 'howTo', name: entry.snapshot.name, exerciseId: entry.exerciseId }) },
      { text: 'Add warm-up set', icon: 'flame', onClick: () => WS.addSet(w, entry, 'warmup') },
      { text: 'Add drop set', icon: 'chevronDown', onClick: () => WS.addSet(w, entry, 'drop') },
      { text: entry.notes ? 'Edit note' : 'Add note', icon: 'note', onClick: () => openSheet({ type: 'textInput', title: 'Note for this workout', value: entry.notes, placeholder: 'Only for this workout', onSave: (v) => { entry.notes = v; WS.save(w); } }) },
      { text: 'Replace exercise', icon: 'swap', onClick: () => openSheet({ type: 'picker', multi: false, title: `Replace ${entry.snapshot.name}`, context: { workoutId: w.id }, onPick: ([nx]) => WS.undoable(w, `Replaced with ${nx.name}`, () => WS.replaceEntry(w, entry, nx)) }) },
      { text: 'Reorder exercises', icon: 'grip', onClick: () => { ui.tabState.workout.reorder = true; update(); } },
      next && !entry.supersetId && { text: `Superset with ${next.snapshot.name}`, icon: 'link', onClick: () => WS.linkSuperset(w, entry) },
      entry.supersetId && next && next.supersetId !== entry.supersetId && { text: `Add ${next.snapshot.name} to superset`, icon: 'link', onClick: () => WS.linkSuperset(w, entry) },
      entry.supersetId && { text: 'Remove from superset', icon: 'link', onClick: () => WS.unlinkSuperset(w, entry) },
      { text: entry.skipped ? 'Un-skip exercise' : 'Skip exercise', icon: 'skip', onClick: () => WS.undoable(w, entry.skipped ? 'Exercise back in' : 'Exercise skipped', () => WS.toggleSkip(w, entry)) },
      entry.exerciseId && { text: 'Edit exercise', icon: 'edit', onClick: () => openSheet({ type: 'exerciseEditor', exerciseId: entry.exerciseId }) },
      { text: 'Remove exercise', icon: 'trash', destructive: true, onClick: () => WS.undoable(w, `${entry.snapshot.name} removed`, () => WS.removeEntry(w, entry.id)) },
    ].filter(Boolean),
  });
}

function workoutMenu(w) {
  openSheet({
    type: 'actions', title: w.routineName, actions: [
      { text: 'Rest timer', icon: 'timer', onClick: () => openSheet({ type: 'manualRest' }) },
      { text: 'Reorder exercises', icon: 'grip', onClick: () => { ui.tabState.workout.reorder = true; update(); } },
      { text: w.notes ? 'Edit workout note' : 'Add workout note', icon: 'note', onClick: () => openSheet({ type: 'textInput', title: 'Workout note', value: w.notes, placeholder: 'e.g. felt tired today', onSave: (v) => { w.notes = v; WS.save(w); } }) },
      { text: 'Rename workout', icon: 'edit', onClick: () => openSheet({ type: 'textInput', title: 'Workout name', value: w.routineName, single: true, onSave: (v) => { w.routineName = v.trim() || w.routineName; WS.save(w); } }) },
      w.routineId && { text: 'Save changes to routine', icon: 'folder', onClick: () => { if (WS.updateRoutineFromWorkout(w)) toast('Routine updated'); } },
      { text: 'Minimize', icon: 'chevronDown', onClick: () => { ui.workoutOpen = false; update(); } },
      { text: 'Discard workout', icon: 'trash', destructive: true, onClick: () => confirm({
        title: 'Discard this workout?', message: 'Everything logged in this workout will be deleted.', confirmText: 'Discard workout', destructive: true,
        onConfirm: () => { const copy = WS.discardWorkout(w); ui.workoutOpen = false; update(); toast('Workout discarded', 6000, { text: 'Undo', onClick: () => { saveWorkout(copy); ui.workoutOpen = true; syncWakeLock(); } }); },
      }) },
    ].filter(Boolean),
  });
}

function askFinish(w) {
  document.activeElement?.blur?.();
  const unchecked = WS.uncheckedCount(w);
  const done = WS.doneCount(w);
  const finish = (mode) => {
    const prs = WS.finishWorkout(w, mode);
    ui.workoutOpen = false;
    ui.tabState.workout = { reorder: false, rirOpen: {} };
    openSheet({ type: 'finishSummary', workoutId: w.id, prs });
  };
  if (done === 0) {
    const withReps = w.entries.some((e) => e.sets.some((s) => s.reps > 0 || s.repsL > 0 || s.repsR > 0));
    if (!withReps) {
      return confirm({ title: 'Nothing logged yet', message: 'Discard this empty workout?', confirmText: 'Discard workout', destructive: true, cancelText: 'Keep training',
        onConfirm: () => { WS.discardWorkout(w); ui.workoutOpen = false; update(); } });
    }
    return confirm({ title: 'Finish workout?', message: 'No sets are ticked. Sets with reps will be saved as done.', confirmText: 'Finish workout', cancelText: 'Keep training', onConfirm: () => finish('complete') });
  }
  confirm({
    title: 'Finish workout?',
    message: unchecked ? `${done} sets done. ${unchecked} unfinished set${unchecked === 1 ? '' : 's'} won’t be saved.` : `${done} sets · ${fmtDuration(Date.now() - w.startedAt)}`,
    confirmText: 'Finish workout', cancelText: 'Keep training', onConfirm: () => finish('drop'),
  });
}

// ---------- Rest timer (compact bar) ----------
export function RestPanel({ inWorkout }) {
  const t = data.timer;
  if (!t) return null;
  const left = restRemaining();
  const pct = t.total ? Math.max(0, Math.min(100, (left / 1000 / t.total) * 100)) : 0;
  return h('div', { class: cx('rest-bar', !inWorkout && 'on-tabs') }, [
    h('div.rest-fill', { style: { width: pct + '%' } }),
    h('div.rest-main', [
      h('div.rest-info', [
        h('div.rest-clock', { 'aria-live': 'polite' }, fmtClock(Math.ceil(left / 1000))),
        h('div.rest-next', t.next ? `Next: ${t.next}` : 'Rest timer'),
      ]),
      h('button.btn.btn-secondary.btn-sm.rest-btn', { onclick: () => adjustRest(15), 'aria-label': 'Add 15 seconds' }, '+15s'),
      h('button.btn.btn-primary.btn-sm.rest-btn', { onclick: skipRest }, 'Skip'),
    ]),
  ]);
}

// sheet: { type: 'manualRest' }
export function ManualRestSheet() {
  const opts = [30, 45, 60, 75, 90, 120, 150, 180, 240];
  return h(Sheet, { title: 'Rest timer' }, [
    h('div.chips', { style: { justifyContent: 'center', margin: '12px 0' } }, opts.map((s) => h(Chip, { key: s, onClick: () => { closeSheet(); startRest(s, 'Rest'); } }, fmtClock(s)))),
    data.timer && h(Button, { kind: 'secondary', block: true, onClick: () => { skipRest(); closeSheet(); } }, 'Stop rest timer'),
  ]);
}

// sheet: { type: 'setMenu', workoutId, entryId, setId }
export function SetMenuSheet(sheet) {
  const w = data.workouts.find((x) => x.id === sheet.workoutId);
  const entry = w && w.entries.find((e) => e.id === sheet.entryId);
  const s = entry && entry.sets.find((x) => x.id === sheet.setId);
  if (!s) return null;
  return h(Sheet, { title: 'Set' }, [
    h(Section, { title: 'Set type' }, h('div.pad', h('div.chips', SET_TYPES.map((t) => h(Chip, { key: t.key, active: s.type === t.key, onClick: () => { s.type = t.key; WS.save(w); } }, t.name))))),
    s.type !== 'warmup' && data.settings.rirMode !== 'off' && h(Section, { title: 'Reps in reserve' }, h('div.pad', h('div.rir', [0, 1, 2, 3, 4, 5].map((r) => h('button', { key: r, class: s.rir === r ? 'on' : '', onclick: () => { s.rir = s.rir === r ? null : r; WS.save(w); } }, r === 5 ? '5+' : String(r)))))),
    h(Section, { title: 'Note' }, h('div.field-card', h(TextField, { value: s.note, placeholder: 'e.g. paused reps, left knee', onChange: (v) => { s.note = v; WS.save(w); } }))),
    h(Button, { kind: 'danger', block: true, onClick: () => { closeSheet(); WS.undoable(w, 'Set deleted', () => WS.removeSet(w, entry, s.id)); } }, [icon('trash', 18), 'Delete set']),
  ]);
}

// sheet: { type: 'textInput', title, value, placeholder, single, onSave }
export function TextInputSheet(sheet) {
  if (sheet.draft === undefined) sheet.draft = sheet.value || '';
  return h(Sheet, {
    title: sheet.title,
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: [h('button.link-btn.strong', { onclick: () => { closeSheet(); sheet.onSave(sheet.draft); } }, 'Save')],
  }, h(Section, {}, h('div.field-card', h(TextField, { value: sheet.draft, placeholder: sheet.placeholder, multiline: !sheet.single, autofocus: true, onChange: (v) => { sheet.draft = v; } }))));
}

// sheet: { type: 'finishSummary', workoutId, prs } – short summary; details on demand
export function FinishSummarySheet(sheet) {
  const w = data.workouts.find((x) => x.id === sheet.workoutId);
  if (!w) return null;
  const sets = w.entries.reduce((t, e) => t + e.sets.filter((s) => s.done && s.type !== 'warmup').length, 0);
  const prs = sheet.prs || [];
  return h(Sheet, { title: 'Workout complete' }, [
    h('div.center', { style: { fontSize: '42px', margin: '6px 0 2px' } }, prs.length ? '🏆' : '💪'),
    h('div.center', { style: { fontSize: '21px', fontWeight: 800, marginBottom: '14px' } }, w.routineName),
    h('div.summary-strip', { style: { gridTemplateColumns: 'repeat(3, 1fr)' } }, [
      h('div.stat', [h('div.v', fmtDuration(w.endedAt - w.startedAt)), h('div.k', 'Duration')]),
      h('div.stat', [h('div.v', String(sets)), h('div.k', 'Sets done')]),
      h('div.stat', { style: prs.length ? { background: 'var(--yellow-soft)' } : null }, [h('div.v', String(prs.length)), h('div.k', 'New records')]),
    ]),
    h(Section, { title: 'Heart rate & calories' }, h('div.pad', HealthBox({ health: (w.health = w.health || { hr: null, kcal: null }), from: w.startedAt, to: w.endedAt, onChange: () => saveWorkout(w) }))),
    prs.length > 0 && h(Section, {}, prs.map((p, i) => h(Row, {
      key: i, left: h('span.pr', icon('trophy', 20)), title: p.name, subtitle: p.kind,
      right: h('b', p.key === 'bestE1rm' || p.key === 'bestSessionVolume' ? fmtW(p.value) : p.key === 'bestReps' ? `${p.value} reps` : `${fmtW(p.detail?.kg)} × ${p.detail?.reps}`),
    }))),
    sheet.more ? Details(w) : h('button.link-btn', { style: { display: 'block', margin: '0 auto' }, onclick: () => { sheet.more = true; update(); } }, 'More details'),
    h('div.mt', h(Button, { block: true, size: 'lg', onClick: () => { closeSheet(); nav('/history'); } }, 'Done')),
  ]);
}

function Details(w) {
  const vol = workoutVolume(w, data.settings);
  const bw = bodyweightAt(data.measurements, w.startedAt);
  const tons = w.entries.reduce((t, e) => t + e.sets.filter((s) => s.done && s.type !== 'warmup').reduce((a, s) => a + tonnage(s, e.snapshot, bw), 0), 0);
  const routine = data.routines.find((r) => r.id === w.routineId);
  const changed = routine && w.entries.some((e) => e.exerciseId && !routine.items.some((it) => it.exerciseId === e.exerciseId));
  return h('div', [
    h(Section, { title: 'Details' }, [
      h(Row, { title: 'Total volume', right: h('b', `${fmtNum(displayWeight(tons, data.settings.unit), 0)} ${data.settings.unit}`) }),
      h(Row, { title: 'Exercises', right: h('b', String(w.entries.length)) }),
    ]),
    Object.keys(vol).length > 0 && h(Section, { title: 'Sets per muscle' }, h('div.pad.chips', Object.entries(vol).sort((a, b) => b[1].total - a[1].total).map(([m, v]) => h('span.chip.chip-static', { key: m }, `${muscleName(m, data.settings)} ${fmtNum(v.total, 1)}`)))),
    changed && h('div.callout.blue', [icon('info', 18), h('div', ['You changed the exercises in this workout. ', h('button.link-btn', { style: { minHeight: 'auto', padding: 0 }, onclick: () => { WS.updateRoutineFromWorkout(w); toast('Routine updated'); } }, 'Save them to the routine')])]),
  ]);
}

// sheet: { type: 'exHistory', exerciseId, name } – history without leaving the workout
export function ExHistorySheet(sheet) {
  const list = (history().get(sheet.exerciseId) || []).slice(0, 8);
  const ex = exercisesById().get(sheet.exerciseId);
  const rec = personalRecords(history().get(sheet.exerciseId) || [], data.measurements);
  const snap = list[0]?.entry.snapshot || { type: ex?.type };
  return h(Sheet, { title: sheet.name }, [
    ExercisePhoto({ name: sheet.name, photo: photoFor(sheet.name) }),
    ex?.notes && h('div.callout', { style: { marginBottom: '10px' } }, [icon('info', 18), ex.notes]),
    list.length === 0
      ? h('div.pad.muted.center', 'No history yet – this is your first time. Have a great set!')
      : [
        h('div.stat-grid', [
          snap.type !== 'bodyweight' && rec.bestWeight && h('div.stat', { style: { background: 'var(--yellow-soft)' } }, [h('div.k', '🏆 Best'), h('div.v', { style: { fontSize: '18px' } }, `${fmtW(rec.bestWeight.value)}`), h('div.s', `× ${rec.bestWeight.detail.reps}`)]),
          rec.bestE1rm && h('div.stat', { style: { background: 'var(--yellow-soft)' } }, [h('div.k', 'Est. 1RM'), h('div.v', { style: { fontSize: '18px' } }, fmtW(rec.bestE1rm.value))]),
          rec.bestReps && h('div.stat', { style: { background: 'var(--yellow-soft)' } }, [h('div.k', 'Most reps'), h('div.v', { style: { fontSize: '18px' } }, String(rec.bestReps.value))]),
        ]),
        h(Section, { title: 'Recent sessions' }, list.map((it) => h(Row, {
          key: it.workout.id + it.entry.id,
          title: new Date(it.workout.startedAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
          subtitle: setsSummary(it.entry.sets.filter((x) => x.done), it.entry.snapshot),
          right: h('span.small', it.workout.routineName),
        }))),
      ],
    h('div.hstack', { style: { marginTop: '8px' } }, [
      h('button.btn.btn-secondary.btn-sm', { onclick: () => openSheet({ type: 'howTo', name: sheet.name, exerciseId: sheet.exerciseId }) }, [icon('info', 16), 'How to do it']),
      ex && h('button.btn.btn-plain.btn-sm', { onclick: () => { ui.sheets = []; ui.workoutOpen = false; nav('/exercise/' + ex.id); update(); } }, 'Full progress ›'),
    ]),
  ]);
}
