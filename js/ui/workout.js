// Live workout screen + rest timer panel.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, closeSheet, confirm, toast, exercisesById, saveWorkout, history } from '../store.js';
import { Page, Section, Row, Button, IconButton, Sheet, TextField, Thumb, Chip, NumberField, WeightField, DragHandle, fmtW, nav } from './components.js';
import { fmtClock, fmtDuration, fmtNum, uid } from '../logic/util.js';
import { SET_TYPES, muscleName } from '../logic/muscles.js';
import { displayWeight, fromDisplayWeight } from '../logic/units.js';
import { workoutVolume } from '../logic/volume.js';
import { tonnage, bodyweightAt } from '../logic/records.js';
import * as WS from '../workoutService.js';
import { startRest, adjustRest, skipRest, restRemaining, syncWakeLock } from '../timer.js';
import { guideFor } from '../logic/catalog.js';
import { personalRecords } from '../logic/records.js';

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
  const u = data.settings.unit.toUpperCase();
  switch (snap.type) {
    case 'dumbbell': return snap.loadMode === 'per_hand' ? `${u} / HAND` : u;
    case 'weighted_bw': return `+${u}`;
    case 'assisted': return `ASSIST ${u}`;
    default: return u;
  }
}

// ---------- Workout screen ----------
export function WorkoutView({ w }) {
  const st = (ui.tabState.workout = ui.tabState.workout || { reorder: false });
  const done = WS.doneCount(w);
  const total = w.entries.reduce((t, e) => t + (e.skipped ? 0 : e.sets.length), 0);
  const bw = bodyweightAt(data.measurements, w.startedAt);
  const tons = w.entries.reduce((t, e) => t + e.sets.filter((s) => s.done && s.type !== 'warmup').reduce((a, s) => a + tonnage(s, e.snapshot, bw), 0), 0);

  return h('div.workout', [
    h(Page, {
      title: w.routineName, large: false,
      left: h('button.icon-btn.back', { onclick: () => { ui.workoutOpen = false; update(); }, 'aria-label': 'Minimize workout' }, icon('chevronDown', 28)),
      actions: [
        h(IconButton, { name: 'timer', label: 'Start rest timer', onClick: () => openSheet({ type: 'manualRest' }) }),
        h(IconButton, { name: 'more', label: 'Workout options', onClick: () => workoutMenu(w) }),
        h('button.btn.btn-primary.btn-sm', { onclick: () => askFinish(w), style: { marginLeft: '4px' } }, 'Finish'),
      ],
    }, [
      h('div.wk-top', [
        h('div.stat', [h('div.k', 'Duration'), h('div.v', fmtClockLong(Date.now() - w.startedAt))]),
        h('div.stat', [h('div.k', 'Sets'), h('div.v', `${done}/${total}`)]),
        h('div.stat', [h('div.k', 'Volume'), h('div.v', `${fmtNum(displayWeight(tons, data.settings.unit), 0)}`), h('div.s', data.settings.unit)]),
      ]),
      w.deload && !w.deloadApplied && h('div.deload-banner', [
        h('div', { style: { fontWeight: 700 } }, '🧘 Deload week'),
        h('div.small', { style: { margin: '4px 0 10px' } }, 'Recover and come back stronger. Tap to halve your working sets and use about 10 % less weight. Weight suggestions are paused this week.'),
        h('div.hstack', [
          h(Button, { size: 'sm', onClick: () => { WS.applyDeload(w); toast('Deload applied'); } }, 'Apply deload'),
          h(Button, { size: 'sm', kind: 'plain', onClick: () => { w.deloadApplied = true; saveWorkout(w); } }, 'Not now'),
        ]),
      ]),
      w.notes && h('div.callout', { style: { marginBottom: '12px' } }, [icon('note', 18), w.notes]),
      st.reorder ? ReorderList({ w, st }) : w.entries.map((e, i) => ExerciseCard({ w, entry: e, index: i })),
      !st.reorder && h(Button, { kind: 'secondary', block: true, onClick: () => openSheet({ type: 'picker', multi: true, title: 'Add to workout', onPick: (exs) => WS.addExercises(w, exs) }) }, [icon('plus', 20), 'Add Exercise']),
      !st.reorder && h('div.mt', h(Button, { block: true, size: 'lg', kind: 'green', onClick: () => askFinish(w) }, [icon('check', 20), 'Finish Workout'])),
    ]),
    RestPanel({ inWorkout: true }),
  ]);
}

function fmtClockLong(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`;
}

function ReorderList({ w, st }) {
  return h('div', [
    h('div.hstack', { style: { justifyContent: 'space-between', margin: '0 4px 8px' } }, [h('span.muted.small', 'Drag ≡ to reorder'), h('button.link-btn.strong', { onclick: () => { st.reorder = false; update(); } }, 'Done')]),
    h('div.card', w.entries.map((e) => h('div', { key: e.id, 'data-drag-row': '' }, h(Row, {
      left: h(Thumb, { image: exercisesById().get(e.exerciseId)?.image, name: e.snapshot.name, muscles: exercisesById().get(e.exerciseId)?.muscles || e.snapshot.muscles, size: 36 }),
      title: e.snapshot.name, subtitle: `${e.sets.filter((s) => s.done).length}/${e.sets.length} sets${e.supersetId ? ' · superset' : ''}`,
      right: h(DragHandle, { onDrop: (a, b) => WS.moveEntry(w, a, b) }),
    })))),
  ]);
}

function ExerciseCard({ w, entry, index }) {
  const snap = entry.snapshot;
  const ex = exercisesById().get(entry.exerciseId);
  const prev = w.entries[index - 1], next = w.entries[index + 1];
  const inSS = !!entry.supersetId && ((prev && prev.supersetId === entry.supersetId) || (next && next.supersetId === entry.supersetId));
  const ssStart = inSS && (!prev || prev.supersetId !== entry.supersetId);
  const showWeight = snap.type !== 'bodyweight';
  const uni = !!snap.unilateral;
  const gridCls = cx(!showWeight && 'noweight', uni && 'uni');
  const rirOn = data.settings.rirMode !== 'off';
  const p = entry.progression || {};
  const step = snap.weightStep || data.settings.defaultWeightStep || 2.5;
  let workNo = 0;
  const compactRir = data.settings.rirDisplay !== 'all';
  const currentSet = entry.sets.find((s) => !s.done && s.type !== 'warmup');

  return h('div', { key: entry.id, class: cx('ex-card', entry.skipped && 'skipped', inSS && 'in-ss') }, [
    ssStart && h('div.ss-label', { style: { marginBottom: '6px' } }, 'SUPERSET – alternate sets, rest after the round'),
    h('div.ex-head', [
      h('button', { onclick: () => openSheet({ type: 'exHistory', exerciseId: entry.exerciseId, name: snap.name }), 'aria-label': `${snap.name} history` }, h(Thumb, { image: ex?.image, name: snap.name, muscles: ex?.muscles || snap.muscles, size: 50 })),
      h('div.grow', [
        h('button.ex-name', { style: { textAlign: 'left' }, onclick: () => openSheet({ type: 'exHistory', exerciseId: entry.exerciseId, name: snap.name }) }, [snap.name, entry.skipped && h('span.tag', { style: { marginLeft: '6px' } }, 'SKIPPED')]),
        h('div.ex-meta', `${snap.sets} × ${snap.repMin}–${snap.repMax}${snap.rirTarget !== null && snap.rirTarget !== undefined ? ` · target RIR ${snap.rirTarget}` : ''} · rest ${fmtClock(snap.rest || 90)}`),
        h('div.last-time', entry.lastSummary ? `Last time: ${setsSummary(entry.lastSummary.sets, snap)}` : 'First time – no history yet'),
        h('div.ex-links', [
          entry.exerciseId && h('button.mini-link', { onclick: () => openSheet({ type: 'exHistory', exerciseId: entry.exerciseId, name: snap.name }) }, [icon('history', 14), 'History']),
          h('a.mini-link', { href: guideFor(ex || { name: snap.name }), target: '_blank', rel: 'noopener' }, [icon('info', 14), 'How to']),
        ]),
      ]),
      h(IconButton, { name: 'more', label: 'Exercise options', onClick: () => entryMenu(w, entry) }),
    ]),
    ex?.notes && h('div.notes-line', [icon('info', 15), h('span', ex.notes)]),
    entry.routineNotes && h('div.notes-line', [icon('folder', 15), h('span', entry.routineNotes)]),
    entry.notes && h('div.notes-line', [icon('note', 15), h('span', { style: { color: 'var(--text)' } }, entry.notes)]),

    !entry.skipped && !w.deload && ProgressionBanner({ w, entry, p }),

    !entry.skipped && [
      h('div.set-head', { class: gridCls }, [
        h('span', 'Set'),
        showWeight && h('span', weightLabel(snap)),
        uni ? [h('span', 'Left'), h('span', 'Right')] : h('span', 'Reps'),
        h('span', '✓'),
      ]),
      ...entry.sets.map((s) => {
        const isWarm = s.type === 'warmup';
        if (!isWarm) workNo++;
        const t = SET_TYPES.find((x) => x.key === s.type);
        const label = isWarm ? 'W' : `${workNo}${t && t.short ? t.short : ''}`;
        const repsPh = `${snap.repMin}–${snap.repMax}`;
        return h('div', { key: s.id, class: cx('set-wrap', s.done && 'done') }, [
          h('div.set-row', { class: gridCls }, [
            h('button', { class: cx('set-num', s.type), onclick: () => openSheet({ type: 'setMenu', workoutId: w.id, entryId: entry.id, setId: s.id }), 'aria-label': `Set ${label} options` }, s.pr ? h('span.pr-num', ['🏆', h('small', label)]) : label),
            showWeight && h('div.wgt', [
              h('button.step', { onclick: () => bump(w, s, -step), 'aria-label': 'Less weight' }, icon('minus', 18)),
              h(WeightField, { kg: s.kg, onChange: (v) => { s.kg = v; WS.save(w); } }),
              h('button.step', { onclick: () => bump(w, s, step), 'aria-label': 'More weight' }, icon('plus', 18)),
            ]),
            uni
              ? [
                h(NumberField, { value: s.repsL, decimals: false, placeholder: 'L', ariaLabel: 'Reps left', onChange: (v) => { s.repsL = v; s.reps = minReps(s); WS.save(w); } }),
                h(NumberField, { value: s.repsR, decimals: false, placeholder: 'R', ariaLabel: 'Reps right', onChange: (v) => { s.repsR = v; s.reps = minReps(s); WS.save(w); } }),
              ]
              : h(NumberField, { value: s.reps, decimals: false, placeholder: isWarm ? '' : repsPh, ariaLabel: 'Reps', onChange: (v) => { s.reps = v; WS.save(w); } }),
            h('button', { class: cx('check', s.done && 'done'), onclick: () => { document.activeElement?.blur?.(); WS.toggleSet(w, entry, s); }, 'aria-label': s.done ? 'Mark set not done' : 'Complete set' }, icon('check', 26, { weight: 3 })),
          ]),
          rirOn && !isWarm && compactRir && s !== currentSet && s.rir !== null && s.rir !== undefined && h('div.set-note', `RIR ${s.rir === 5 ? '5+' : s.rir}`),
          rirOn && !isWarm && (!compactRir || s === currentSet) && h('div.set-extra', h('div.rir', [
            h('span.lbl', 'RIR'),
            ...[0, 1, 2, 3, 4, 5].map((r) => h('button', { class: s.rir === r ? 'on' : '', onclick: () => { s.rir = s.rir === r ? null : r; WS.save(w); }, 'aria-label': `${r} reps in reserve` }, r === 5 ? '5+' : String(r))),
          ])),
          s.note && h('div.set-note', ['📝 ', s.note]),
        ]);
      }),
      // One tap each: working set, warm-up (goes on top), drop set (≈20 % lighter, goes last).
      h('div.ex-foot', [
        h('button.btn.btn-secondary.btn-sm', { onclick: () => WS.addSet(w, entry), 'aria-label': 'Add working set' }, [icon('plus', 16), 'Set']),
        h('button.btn.btn-secondary.btn-sm', { onclick: () => WS.addSet(w, entry, 'warmup'), 'aria-label': 'Add warm-up set' }, [icon('plus', 16), 'Warm-up']),
        h('button.btn.btn-secondary.btn-sm', { onclick: () => WS.addSet(w, entry, 'drop'), 'aria-label': 'Add drop set' }, [icon('plus', 16), 'Drop']),
        h('button.btn.btn-plain.btn-sm', { disabled: entry.sets.length === 0, onclick: () => {
          const last = entry.sets[entry.sets.length - 1];
          if (last) WS.removeSet(w, entry, last.id);
        }, 'aria-label': 'Remove last set' }, icon('minus', 18)),
      ]),
      h('div.set-hint', 'Tap a set number to change its type (warm-up, drop, rest-pause, failure) or add a note.'),
    ],
  ]);
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
    return h('div.overload.applied', h('div.msg', `✓ Weight ${p.assisted ? 'assistance' : ''} set to ${fmtW(p.suggestedKg)} – go get it!`));
  }
  if (p.status === 'increase' && !p.dismissed) {
    const msg = p.assisted
      ? `${p.reason} — use ${fmtNum(p.step)} ${unit} less assistance!`
      : `${p.reason} — add ${fmtNum(p.step)} ${unit}!`;
    return h('div.overload', [
      h('div.hstack', { style: { alignItems: 'flex-start' } }, [
        icon('arrowUp', 22, { weight: 2.6 }),
        h('div.msg.grow', msg),
        h('button.close', { onclick: () => WS.dismissSuggestion(w, entry), 'aria-label': 'Dismiss suggestion' }, icon('x', 18)),
      ]),
      h('div.sug', [
        h('div', [h('div.k', 'Suggested'), h('div.v', fmtW(p.suggestedKg))]),
        h('button.apply', { onclick: () => { WS.applySuggestion(w, entry); toast(`Applied ${fmtW(p.suggestedKg)} to all sets`); } }, 'Apply'),
      ]),
    ]);
  }
  if (p.status === 'harder' && !p.dismissed) {
    return h('div.overload', h('div.hstack', { style: { alignItems: 'flex-start' } }, [icon('arrowUp', 22), h('div.msg.grow', p.reason), h('button.close', { onclick: () => WS.dismissSuggestion(w, entry) }, icon('x', 18))]));
  }
  if (p.status === 'keep') return h('div.keep-hint', ['＝ ', p.reason]);
  return null;
}

function entryMenu(w, entry) {
  const idx = w.entries.indexOf(entry);
  const next = w.entries[idx + 1];
  openSheet({
    type: 'actions', title: entry.snapshot.name, actions: [
      { text: entry.notes ? 'Edit workout note' : 'Add note for this workout', icon: 'note', onClick: () => openSheet({ type: 'textInput', title: 'Note', value: entry.notes, placeholder: 'Only for this workout', onSave: (v) => { entry.notes = v; WS.save(w); } }) },
      { text: 'Replace exercise', icon: 'swap', onClick: () => openSheet({ type: 'picker', multi: false, title: `Replace ${entry.snapshot.name}`, onPick: ([ex]) => WS.replaceEntry(w, entry, ex) }) },
      { text: entry.skipped ? 'Un-skip exercise' : 'Skip exercise', icon: 'skip', onClick: () => WS.toggleSkip(w, entry) },
      next && !entry.supersetId && { text: `Superset with ${next.snapshot.name}`, icon: 'link', onClick: () => WS.linkSuperset(w, entry) },
      entry.supersetId && next && next.supersetId !== entry.supersetId && { text: `Add ${next.snapshot.name} to superset`, icon: 'link', onClick: () => WS.linkSuperset(w, entry) },
      entry.supersetId && { text: 'Remove from superset', icon: 'link', onClick: () => WS.unlinkSuperset(w, entry) },
      { text: 'Reorder exercises', icon: 'grip', onClick: () => { ui.tabState.workout.reorder = true; update(); } },
      entry.exerciseId && { text: 'Edit exercise in library', icon: 'edit', onClick: () => openSheet({ type: 'exerciseEditor', exerciseId: entry.exerciseId }) },
      { text: 'Remove from workout', icon: 'trash', destructive: true, onClick: () => {
        if (entry.sets.some((s) => s.done)) {
          confirm({ title: `Remove ${entry.snapshot.name}?`, message: 'Sets you already logged for it in this workout will be deleted.', confirmText: 'Remove', destructive: true, onConfirm: () => WS.removeEntry(w, entry.id) });
        } else WS.removeEntry(w, entry.id);
      } },
    ].filter(Boolean),
  });
}

function workoutMenu(w) {
  openSheet({
    type: 'actions', title: w.routineName, actions: [
      { text: 'Minimize', icon: 'chevronDown', onClick: () => { ui.workoutOpen = false; update(); } },
      { text: 'Reorder exercises', icon: 'grip', onClick: () => { ui.tabState.workout.reorder = true; update(); } },
      { text: w.notes ? 'Edit workout notes' : 'Add workout notes', icon: 'note', onClick: () => openSheet({ type: 'textInput', title: 'Workout notes', value: w.notes, placeholder: 'e.g. felt tired today', onSave: (v) => { w.notes = v; WS.save(w); } }) },
      { text: 'Rename workout', icon: 'edit', onClick: () => openSheet({ type: 'textInput', title: 'Workout name', value: w.routineName, single: true, onSave: (v) => { w.routineName = v.trim() || w.routineName; WS.save(w); } }) },
      w.routineId && { text: 'Save changes to routine', icon: 'folder', onClick: () => { if (WS.updateRoutineFromWorkout(w)) toast('Routine updated with this workout’s exercises & sets'); } },
      w.deload && w.deloadApplied === true && { text: 'Deload is applied', icon: 'info', onClick: () => {} },
      { text: 'Discard workout', icon: 'trash', destructive: true, onClick: () => confirm({
        title: 'Discard this workout?', message: 'Everything logged in this session will be deleted.', confirmText: 'Discard', destructive: true,
        onConfirm: () => { const copy = WS.discardWorkout(w); ui.workoutOpen = false; update(); toast('Workout discarded', 6000, { text: 'Undo', onClick: () => { saveWorkout(copy); ui.workoutOpen = true; syncWakeLock(); } }); },
      }) },
    ].filter(Boolean),
  });
}

function askFinish(w) {
  document.activeElement?.blur?.();
  const unchecked = WS.uncheckedCount(w);
  const done = WS.doneCount(w);
  const dur = fmtDuration(Date.now() - w.startedAt);
  const finish = (mode) => {
    const prs = WS.finishWorkout(w, mode);
    ui.workoutOpen = false;
    ui.tabState.workout = { reorder: false };
    openSheet({ type: 'finishSummary', workoutId: w.id, prs });
  };
  if (done === 0 && unchecked > 0) {
    const withReps = w.entries.some((e) => e.sets.some((s) => s.reps > 0 || s.repsL > 0 || s.repsR > 0));
    return confirm({
      title: 'No sets ticked yet', message: withReps ? 'Mark every set that has reps as done and save, or keep training?' : 'Nothing has been logged. Discard this workout?',
      confirmText: withReps ? 'Save all sets as done' : 'Discard workout', destructive: !withReps,
      onConfirm: () => (withReps ? finish('complete') : (WS.discardWorkout(w), ui.workoutOpen = false, update())),
      cancelText: 'Keep training',
    });
  }
  if (unchecked > 0) {
    return confirm({
      title: 'Finish workout?', message: `${done} sets done · ${unchecked} not ticked · ${dur}`,
      confirmText: `Drop the ${unchecked} unticked set${unchecked === 1 ? '' : 's'}`, onConfirm: () => finish('drop'),
      extra: [{ text: 'Mark all sets with reps as done', onClick: () => finish('complete') }],
      cancelText: 'Keep training',
    });
  }
  confirm({ title: 'Finish workout?', message: `${done} sets · ${dur}`, confirmText: 'Finish & Save', onConfirm: () => finish('drop'), cancelText: 'Keep training' });
}

// ---------- Rest timer panel ----------
export function RestPanel({ inWorkout }) {
  const t = data.timer;
  if (!t) return null;
  const left = restRemaining();
  const mini = ui.restMini;
  const pct = t.total ? Math.max(0, Math.min(100, (left / 1000 / t.total) * 100)) : 0;
  return h('div', { class: cx('rest', mini && 'mini', !inWorkout && 'tab-rest') }, [
    h('div.rest-top', [
      h('span.hstack', { style: { gap: '4px' } }, [icon('timer', 16), 'Rest', t.label ? ` · ${t.label}` : '']),
      h('button.link-btn', { style: { minHeight: '32px', padding: '0 4px' }, onclick: () => { ui.restMini = !ui.restMini; update(); } }, mini ? 'Expand' : 'Smaller'),
    ]),
    mini
      ? h('div.hstack', [h('div.rest-time.grow', fmtClock(Math.ceil(left / 1000))), h('button.btn.btn-secondary.btn-sm', { onclick: () => adjustRest(-15) }, '−15'), h('button.btn.btn-secondary.btn-sm', { onclick: () => adjustRest(15) }, '+15'), h('button.btn.btn-primary.btn-sm', { onclick: skipRest }, 'Skip')])
      : [
        h('div.rest-time', { 'aria-live': 'polite' }, fmtClock(Math.ceil(left / 1000))),
        h('div.rest-progress', h('div', { style: { width: pct + '%' } })),
        t.next && h('div.rest-next', ['Next: ', h('b', t.next)]),
        h('div.rest-btns', [
          h('button.btn.btn-secondary', { onclick: () => adjustRest(-15) }, '−15s'),
          h('button.btn.btn-secondary', { onclick: () => adjustRest(15) }, '+15s'),
          h('button.btn.btn-primary', { onclick: skipRest }, 'Skip'),
        ]),
      ],
  ]);
}

// sheet: { type: 'manualRest' }
export function ManualRestSheet() {
  const opts = [30, 45, 60, 75, 90, 120, 150, 180, 240];
  return h(Sheet, { title: 'Start rest timer' }, [
    h('div.chips', { style: { justifyContent: 'center', margin: '12px 0' } }, opts.map((s) => h(Chip, { key: s, onClick: () => { closeSheet(); startRest(s, 'Manual'); } }, fmtClock(s)))),
    data.timer && h(Button, { kind: 'secondary', block: true, onClick: () => { skipRest(); closeSheet(); } }, 'Stop current timer'),
  ]);
}

// sheet: { type: 'setMenu', workoutId, entryId, setId }
export function SetMenuSheet(sheet) {
  const w = data.workouts.find((x) => x.id === sheet.workoutId);
  const entry = w && w.entries.find((e) => e.id === sheet.entryId);
  const s = entry && entry.sets.find((x) => x.id === sheet.setId);
  if (!s) return null;
  return h(Sheet, { title: 'Set options' }, [
    h(Section, { title: 'Set type' }, h('div.pad', h('div.chips', SET_TYPES.map((t) => h(Chip, { key: t.key, active: s.type === t.key, onClick: () => { s.type = t.key; WS.save(w); } }, t.name))))),
    s.type !== 'warmup' && data.settings.rirMode !== 'off' && h(Section, { title: 'RIR (reps in reserve)' }, h('div.pad', h('div.rir', [0, 1, 2, 3, 4, 5].map((r) => h('button', { key: r, class: s.rir === r ? 'on' : '', onclick: () => { s.rir = s.rir === r ? null : r; WS.save(w); } }, r === 5 ? '5+' : String(r)))))),
    h(Section, { title: 'Note for this set' }, h('div.field-card', h(TextField, { value: s.note, placeholder: 'e.g. paused reps, left knee', onChange: (v) => { s.note = v; WS.save(w); } }))),
    h(Button, { kind: 'danger', block: true, onClick: () => { closeSheet(); WS.removeSet(w, entry, s.id); } }, [icon('trash', 18), 'Delete set']),
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

// sheet: { type: 'finishSummary', workoutId, prs }
export function FinishSummarySheet(sheet) {
  const w = data.workouts.find((x) => x.id === sheet.workoutId);
  if (!w) return null;
  const vol = workoutVolume(w, data.settings);
  const sets = w.entries.reduce((t, e) => t + e.sets.filter((s) => s.type !== 'warmup').length, 0);
  const routine = data.routines.find((r) => r.id === w.routineId);
  const structureChanged = routine && (routine.items.length !== w.entries.length || routine.items.some((it, i) => w.entries[i]?.exerciseId !== it.exerciseId));
  return h(Sheet, { title: 'Workout saved' }, [
    h('div.center', { style: { fontSize: '44px', margin: '8px 0 0' } }, sheet.prs.length ? '🏆' : '💪'),
    h('div.center', { style: { fontSize: '22px', fontWeight: 800 } }, sheet.prs.length ? 'New personal records!' : 'Great workout!'),
    h('div.center.muted', { style: { marginBottom: '14px' } }, `${w.routineName} · ${fmtDuration(w.endedAt - w.startedAt)} · ${sets} sets`),
    sheet.prs.length > 0 && h(Section, { title: 'Personal records' }, sheet.prs.map((p, i) => h(Row, {
      key: i, left: h('span.pr', icon('trophy', 22)), title: p.name, subtitle: p.kind,
      right: h('b', p.key === 'bestE1rm' || p.key === 'bestSessionVolume' ? fmtW(p.value) : p.key === 'bestReps' ? `${p.value} reps` : `${fmtW(p.detail?.kg)} × ${p.detail?.reps}`),
    }))),
    Object.keys(vol).length > 0 && h(Section, { title: 'Sets per muscle' }, h('div.pad.chips', Object.entries(vol).sort((a, b) => b[1].total - a[1].total).map(([m, v]) => h('span.chip.chip-static', { key: m }, `${muscleLabel(m)} ${fmtNum(v.total, 1)}`)))),
    structureChanged && h('div.callout.blue', [icon('info', 18), h('div', ['You changed the exercises in this workout. ', h('button.link-btn', { style: { minHeight: 'auto', padding: 0 }, onclick: () => { WS.updateRoutineFromWorkout(w); toast('Routine updated'); } }, 'Save them to the routine')])]),
    h('div.mt', h(Button, { block: true, onClick: () => { closeSheet(); nav('/history'); } }, 'Done')),
  ]);
}

function muscleLabel(k) { return muscleName(k, data.settings); }

// sheet: { type: 'exHistory', exerciseId, name } – history without leaving the workout
export function ExHistorySheet(sheet) {
  const list = (history().get(sheet.exerciseId) || []).slice(0, 8);
  const ex = exercisesById().get(sheet.exerciseId);
  const rec = personalRecords(history().get(sheet.exerciseId) || [], data.measurements);
  const snap = list[0]?.entry.snapshot || { type: ex?.type };
  return h(Sheet, { title: sheet.name }, [
    ex?.notes && h('div.callout', { style: { marginBottom: '10px' } }, [icon('info', 18), ex.notes]),
    list.length === 0
      ? h('div.pad.muted.center', 'No history yet – this is your first time. Have a great set!')
      : [
        h('div.stat-grid', [
          snap.type !== 'bodyweight' && rec.bestWeight && h('div.stat', { style: { background: 'var(--yellow-soft)' } }, [h('div.k', '🏆 Best'), h('div.v', { style: { fontSize: '18px' } }, `${fmtW(rec.bestWeight.value)}`), h('div.s', `× ${rec.bestWeight.detail.reps}`)]),
          rec.bestE1rm && h('div.stat', { style: { background: 'var(--yellow-soft)' } }, [h('div.k', 'e1RM'), h('div.v', { style: { fontSize: '18px' } }, fmtW(rec.bestE1rm.value))]),
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
      h('a.btn.btn-secondary.btn-sm', { href: guideFor(ex || { name: sheet.name }), target: '_blank', rel: 'noopener', style: { textDecoration: 'none' } }, [icon('info', 16), 'How to do it']),
      ex && h('button.btn.btn-plain.btn-sm', { onclick: () => { ui.sheets = []; ui.workoutOpen = false; nav('/exercise/' + ex.id); update(); } }, 'Full progress ›'),
    ]),
  ]);
}
