// Routines tab: routine "folders", routine detail (pre-start summary), per-routine overrides.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, closeSheet, saveRoutine, deleteRoutine, confirm, toast, history, exercisesById, sortedRoutines, activeWorkout, doneWorkouts, addTemplate } from '../store.js';
import { Page, Section, Row, Empty, Button, IconButton, Stepper, Sheet, TextField, Thumb, Chip, DragHandle, moveItem, nav, relDay, fmtW, Toggle, Segmented, NumberField } from './components.js';
import { select } from './exercises.js';
import { newRoutine, newRoutineItem, effectiveConfig, withConfig } from '../logic/model.js';
import { muscleName, EXERCISE_TYPES } from '../logic/muscles.js';
import { routineSummary } from '../logic/analytics.js';
import { lastSession } from '../logic/history.js';
import { evaluateProgression, setGoals, progressionStep } from '../logic/progression.js';
import { fmtNum } from '../logic/util.js';
import { activeBlock, blockWeek, isDeloadWeek, plannedRoutineIds } from '../logic/blocks.js';
import { fmtClock, uid, deepClone } from '../logic/util.js';
import { REST_STEP, REST_MIN, REST_MAX } from '../logic/restTimer.js';
import { TEMPLATES } from '../logic/samples.js';
import { startWorkout, discardWorkout } from '../workoutService.js';
import { exportFile } from './settings.js';
import { saveSettings } from '../store.js';

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function lastDoneAt(routineId) {
  const w = doneWorkouts().find((x) => x.routineId === routineId);
  return w ? w.startedAt : null;
}

/** Starts a routine, asking first if another workout is already running. */
export function beginRoutine(routine) {
  const running = activeWorkout();
  const go = () => {
    const w = startWorkout(routine);
    ui.workoutOpen = true;
    // Readiness check (Settings → Readiness check). Skipping it leaves the workout exactly as planned.
    if (data.settings.readinessCheck !== false && w.entries.length) openSheet({ type: 'readiness', workoutId: w.id });
    update();
  };
  if (!running) return go();
  confirm({
    title: 'A workout is already in progress',
    message: `“${running.routineName}” is still running. You can only run one workout at a time.`,
    confirmText: 'Resume current workout',
    onConfirm: () => { ui.workoutOpen = true; update(); },
    extra: [{ text: `Discard it & start ${routine ? routine.name : 'new'}`, destructive: true, onClick: () => { discardWorkout(running); go(); } }],
  });
}

/** The routine to suggest: today's planned one (if not done yet), else the next in rotation. */
export function suggestedRoutine() {
  const routines = sortedRoutines().filter((r) => r.items.length);
  if (!routines.length) return null;
  const todayStr = new Date().toDateString();
  const doneTodayIds = new Set(doneWorkouts().filter((w) => new Date(w.startedAt).toDateString() === todayStr).map((w) => w.routineId));
  const planned = plannedRoutineIds(data.blocks, Date.now()).map((id) => routines.find((r) => r.id === id)).filter(Boolean);
  const plannedLeft = planned.find((r) => !doneTodayIds.has(r.id));
  if (plannedLeft) return { routine: plannedLeft, why: 'Planned for today' };
  const last = doneWorkouts().find((w) => w.routineId && routines.some((r) => r.id === w.routineId));
  if (!last) return { routine: routines[0], why: 'Suggested' };
  // Next one in the same folder as the last workout, wrapping around.
  const lastR = routines.find((r) => r.id === last.routineId);
  const group = routines.filter((r) => (r.folder || '') === (lastR.folder || ''));
  const next = group[(group.indexOf(lastR) + 1) % group.length];
  return { routine: next, why: next.id === lastR.id ? `Last done ${relDay(last.startedAt).toLowerCase()}` : `Next after ${lastR.name}` };
}

// ---------- Workout home ----------
export function RoutinesScreen() {
  const st = (ui.tabState.routines = ui.tabState.routines || { edit: false });
  const routines = sortedRoutines();
  const folders = [];
  const byFolder = new Map();
  for (const r of routines) {
    const f = r.folder || '';
    if (!byFolder.has(f)) { byFolder.set(f, []); folders.push(f); }
    byFolder.get(f).push(r);
  }
  folders.sort((a, b) => (a === '' ? -1 : b === '' ? 1 : 0));

  const running = activeWorkout();
  const sug = suggestedRoutine();
  const block = activeBlock(data.blocks);
  const todayIds = plannedRoutineIds(data.blocks, Date.now());
  const todayRoutines = todayIds.map((id) => data.routines.find((r) => r.id === id)).filter(Boolean);
  const doneTodayIds = new Set(doneWorkouts().filter((w) => new Date(w.startedAt).toDateString() === new Date().toDateString()).map((w) => w.routineId));

  const reorder = (folder, from, to) => {
    const group = moveItem(byFolder.get(folder), from, to);
    byFolder.set(folder, group);
    let i = 0;
    for (const f of folders) for (const r of byFolder.get(f)) { if (r.order !== i) saveRoutine({ ...r, order: i }); i++; }
  };

  // Weekly backup reminder (kept low on the page).
  const s = data.settings;
  const done = doneWorkouts();
  const now = Date.now();
  const unsaved = done.filter((w) => !s.lastBackupAt || w.endedAt > s.lastBackupAt).length;
  const showBackup = s.backupReminder !== false && unsaved >= 3 && (!s.lastBackupAt || now - s.lastBackupAt > 14 * 86400000) &&
    !(s.backupSnoozeUntil && s.backupSnoozeUntil > now);

  const routineLine = (r) => {
    const last = lastDoneAt(r.id);
    const n = r.items.length;
    return `${last ? `Last done ${relDay(last).toLowerCase()}` : 'Not done yet'} · ${n} exercise${n === 1 ? '' : 's'}`;
  };

  return h(Page, {
    title: 'Workout',
    actions: [
      h(IconButton, { name: 'plus', label: 'New routine', onClick: () => openSheet({ type: 'newRoutine' }) }),
      h(IconButton, { name: 'more', label: 'More', onClick: () => openSheet({ type: 'actions', title: 'Routines', actions: [
        { text: 'New routine', icon: 'plus', onClick: () => openSheet({ type: 'newRoutine' }) },
        routines.length > 0 && { text: 'Edit routines', icon: 'edit', onClick: () => { st.edit = true; update(); } },
        { text: 'Exercise library', icon: 'dumbbell', onClick: () => nav('/library') },
        { text: 'Training plan', icon: 'calendar', onClick: () => nav('/plan') },
      ].filter(Boolean) }) }),
    ],
  }, [
    // 1. One clear Start workout button
    !st.edit && h('div.hero', [
      sug
        ? [h('div.hero-k', sug.why), h('div.hero-t', sug.routine.name)]
        : [h('div.hero-k', 'Ready when you are'), h('div.hero-t', routines.length ? 'Empty workout' : 'Start training')],
      h('button.hero-btn', { onclick: () => beginRoutine(sug ? sug.routine : null) }, [icon('play', 22), 'Start workout']),
      h('div.hero-alt', [
        routines.length > 1 && h('button', { onclick: () => document.getElementById('routine-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 'Choose another routine'),
        h('button', { onclick: () => beginRoutine(null) }, 'Start empty workout'),
        h('button', { onclick: () => openSheet({ type: 'logRun' }) }, 'Log a run'),
        data.settings.showYoga && h('button', { onclick: () => nav('/yoga/log') }, 'Log yoga'),
      ]),
    ]),

    // 2. Continue workout
    running && !st.edit && h('button.continue-card', { onclick: () => { ui.workoutOpen = true; update(); } }, [
      h('div.grow', [h('div.k', 'Workout in progress'), h('div.t', running.routineName), h('div.small', `${Math.max(1, Math.round((now - running.startedAt) / 60000))} min · ${plural(running.entries.reduce((t, e) => t + e.sets.filter((x) => x.done).length, 0), 'set')} done`)]),
      h('span.continue-go', ['Continue workout', icon('chevronRight', 18)]),
    ]),

    // 3. Today's routine (from the training plan) – one tap starts it
    block && !st.edit && h(Section, { title: `Today · ${block.name} week ${blockWeek(block)}${isDeloadWeek(block) ? ' · deload' : ''}` },
      todayRoutines.length
        ? todayRoutines.map((r) => RoutineRow(r, doneTodayIds.has(r.id) ? 'Done today ✓' : routineLine(r), { st }))
        : h('div.pad.muted', 'Rest day – recover well. You can still start any routine.')),

    routines.length === 0 && h(Empty, {
      iconName: 'folder', title: 'No routines yet', text: 'Create a routine once, then just tap Start workout.',
      action: h(Button, { onClick: () => openSheet({ type: 'newRoutine' }) }, 'New routine'),
    }),

    // 4. All routines (folders kept, never in the way)
    h('div', { id: 'routine-list' }),
    st.edit && h('div.hstack', { style: { justifyContent: 'space-between', margin: '0 4px 8px' } }, [h('span.muted.small', 'Drag ≡ to reorder · ⋯ for options'), h('button.link-btn.strong', { onclick: () => { st.edit = false; update(); } }, 'Done')]),
    ...folders.map((f, fi) => h(Section, {
      key: 'f-' + f,
      title: f || (folders.length > 1 ? 'Routines' : 'My routines'),
      right: fi === 0 && !st.edit && routines.length > 0 ? h('button.link-btn', { onclick: () => { st.edit = true; update(); } }, 'Edit') : null,
    }, byFolder.get(f).map((r) => RoutineRow(r, routineLine(r), { st, edit: st.edit, onDrop: (a, b) => reorder(f, a, b) })))),

    h('div.home-links', [
      h('button.link-btn', { onclick: () => nav('/library') }, [icon('dumbbell', 18), 'Exercise library']),
      h('button.link-btn', { onclick: () => nav('/plan') }, [icon('calendar', 18), 'Training plan']),
    ]),

    showBackup && h('div.backup-card', [
      h('div.hstack', [icon('download', 20), h('b', 'Back up your workouts')]),
      h('div.small', { style: { margin: '6px 0 10px' } }, [`${plural(unsaved, 'workout')} not backed up${s.lastBackupAt ? ` · last backup ${relDay(s.lastBackupAt).toLowerCase()}` : ''}. `, h('button.link-btn.inline-link', { onclick: () => openSheet({ type: 'dataInfo' }) }, 'Why?')]),
      h('div.hstack', [
        h(Button, { size: 'sm', onClick: () => exportFile('full') }, 'Back up now'),
        h(Button, { size: 'sm', kind: 'plain', onClick: () => saveSettings({ backupSnoozeUntil: now + 7 * 86400000 }) }, 'Later'),
      ]),
    ]),
  ]);
}

/** Routine row: tap the name to open it, tap ▶ to start right away. */
function RoutineRow(r, subtitle, { edit, onDrop }) {
  return h('div.rt-row', { key: r.id, 'data-drag-row': '' }, [
    h('button.rt-main', { onclick: edit ? () => routineMenu(r) : () => nav('/routine/' + r.id) }, [
      h('div.rt-name', r.name),
      h('div.rt-sub', subtitle),
    ]),
    edit
      ? h('div.hstack', [h(IconButton, { name: 'more', label: 'Routine options', onClick: () => routineMenu(r) }), h(DragHandle, { onDrop })])
      : h('button.rt-play', { onclick: () => beginRoutine(r), 'aria-label': `Start ${r.name}`, disabled: !r.items.length }, icon('play', 20)),
  ]);
}

export function routineMenu(r) {
  openSheet({
    type: 'actions', title: r.name, actions: [
      { text: 'Rename / move to folder', icon: 'edit', onClick: () => openSheet({ type: 'routineMeta', routineId: r.id }) },
      { text: 'Duplicate', icon: 'copy', onClick: () => duplicateRoutine(r) },
      { text: 'Delete', icon: 'trash', destructive: true, onClick: () => askDeleteRoutine(r) },
    ],
  });
}

export function duplicateRoutine(r) {
  const order = Math.max(...data.routines.map((x) => x.order ?? 0)) + 1;
  const ss = new Map();
  const copy = { ...deepClone(r), id: uid(), name: `${r.name} Copy`, order, createdAt: Date.now() };
  copy.items = copy.items.map((i) => {
    let s = null;
    if (i.supersetId) { if (!ss.has(i.supersetId)) ss.set(i.supersetId, uid()); s = ss.get(i.supersetId); }
    return { ...i, id: uid(), supersetId: s };
  });
  saveRoutine(copy);
  toast(`Created “${copy.name}”`);
}

function askDeleteRoutine(r) {
  confirm({
    title: `Delete “${r.name}”?`,
    message: 'Your exercises stay in the library and your workout history is kept.',
    confirmText: 'Delete routine', destructive: true,
    onConfirm: () => {
      const backup = deepClone(r);
      deleteRoutine(r.id);
      if (location.hash.includes(r.id)) nav('/routines');
      toast('Routine deleted', 5000, { text: 'Undo', onClick: () => saveRoutine(backup) });
    },
  });
}

// sheet: { type: 'newRoutine' }
export function NewRoutineSheet(sheet) {
  sheet.name = sheet.name ?? '';
  sheet.folder = sheet.folder ?? '';
  const folders = [...new Set(data.routines.map((r) => r.folder).filter(Boolean))];
  const create = () => {
    const order = Math.max(-1, ...data.routines.map((r) => r.order ?? 0)) + 1;
    const r = newRoutine({ name: sheet.name.trim() || 'New routine', folder: sheet.folder.trim(), order });
    saveRoutine(r);
    closeSheet();
    nav('/routine/' + r.id);
    openSheet({ type: 'picker', multi: true, title: `Add to ${r.name}`, onPick: (exs) => addToRoutine(r.id, exs) });
  };
  return h(Sheet, {
    title: 'New routine',
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: [h('button.link-btn.strong', { onclick: create }, 'Create')],
  }, [
    h(Section, {}, [
      h('div.field-card', h(TextField, { value: sheet.name, onChange: (v) => { sheet.name = v; }, placeholder: 'Routine name, e.g. Upper A', autofocus: true })),
      h('div.field-card', h(TextField, { value: sheet.folder, onChange: (v) => { sheet.folder = v; update(); }, placeholder: 'Folder / phase (optional)' })),
    ]),
    folders.length > 0 && h('div.chips', folders.map((f) => h(Chip, { key: f, active: sheet.folder === f, onClick: () => { sheet.folder = f; update(); } }, f))),
    h(Section, { title: 'Or start from a template', footer: 'Templates add routines (and any missing exercises) you can then edit.' },
      TEMPLATES.map((t) => h(Row, {
        key: t.id, title: t.name, subtitle: t.description, chevron: true,
        onClick: async () => { const rs = await addTemplate(t.id, sheet.folder.trim() || t.name); closeSheet(); toast(`Added ${rs.length} routines`); },
      }))),
  ]);
}

// sheet: { type: 'routineMeta', routineId }
export function RoutineMetaSheet(sheet) {
  const r = data.routines.find((x) => x.id === sheet.routineId);
  if (!r) return null;
  if (!sheet.draft) sheet.draft = { name: r.name, folder: r.folder || '', notes: r.notes || '' };
  const d = sheet.draft;
  const folders = [...new Set(data.routines.map((x) => x.folder).filter(Boolean))];
  return h(Sheet, {
    title: 'Routine',
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: [h('button.link-btn.strong', { onclick: () => { saveRoutine({ ...r, name: d.name.trim() || r.name, folder: d.folder.trim(), notes: d.notes }); closeSheet(); } }, 'Save')],
  }, [
    h(Section, { title: 'Name' }, h('div.field-card', h(TextField, { value: d.name, onChange: (v) => { d.name = v; }, placeholder: 'Name' }))),
    h(Section, { title: 'Folder / phase' }, h('div.field-card', h(TextField, { value: d.folder, onChange: (v) => { d.folder = v; update(); }, placeholder: 'None' }))),
    folders.length > 0 && h('div.chips', [h(Chip, { active: !d.folder, onClick: () => { d.folder = ''; update(); } }, 'None'), ...folders.map((f) => h(Chip, { key: f, active: d.folder === f, onClick: () => { d.folder = f; update(); } }, f))]),
    h(Section, { title: 'Routine notes' }, h('div.field-card', h(TextField, { value: d.notes, onChange: (v) => { d.notes = v; }, placeholder: 'Shown when you open this routine', multiline: true }))),
  ]);
}

export function addToRoutine(routineId, exercises) {
  const r = data.routines.find((x) => x.id === routineId);
  if (!r || !exercises.length) return;
  saveRoutine({ ...r, items: [...r.items, ...exercises.map((e) => newRoutineItem(e.id))] });
}

// ---------- Routine detail ----------
export function RoutineScreen({ id }) {
  const r = data.routines.find((x) => x.id === id);
  if (!r) return h(Page, { title: 'Routine', backTo: '/routines' }, h(Empty, { title: 'Routine not found' }));
  const st = (ui.tabState['routine_' + id] = ui.tabState['routine_' + id] || { edit: false });
  const exById = exercisesById();
  const sum = routineSummary(r, exById, lastDoneAt(r.id));
  const block = activeBlock(data.blocks);
  const deload = isDeloadWeek(block);
  const hist = history();

  const items = r.items.filter((i) => exById.has(i.exerciseId));
  const rows = items.map((item, idx) => {
    const ex = exById.get(item.exerciseId);
    const cfg = effectiveConfig(ex, item);
    const prog = evaluateProgression(withConfig(ex, cfg), lastSession(hist, ex.id), cfg, data.settings);
    const prev = items[idx - 1], next = items[idx + 1];
    const ssStart = item.supersetId && (!prev || prev.supersetId !== item.supersetId);
    const inSS = !!item.supersetId && ((prev && prev.supersetId === item.supersetId) || (next && next.supersetId === item.supersetId));
    return h('div', { key: item.id, 'data-drag-row': '', class: inSS ? 'superset-bar' : '' }, [
      inSS && ssStart && h('div.ss-label', { style: { padding: '8px 16px 0' } }, 'SUPERSET'),
      h(Row, {
        left: h(Thumb, { image: ex.image, name: ex.name, muscles: ex.muscles }),
        title: ex.name,
        subtitle: [
          `${cfg.warmupSets ? cfg.warmupSets + 'W + ' : ''}${cfg.sets} × ${cfg.repMin}–${cfg.repMax}${cfg.dropSets ? ` + ${cfg.dropSets} drop` : ''} · Rest ${fmtClock(cfg.rest)}${cfg.rirTarget !== null && cfg.rirTarget !== undefined ? ` · RIR ${cfg.rirTarget}` : ''}`,
          item.notes && h('div', ['📝 ', item.notes]),
          ex.notes && h('div', ['📌 ', ex.notes]),
        ],
        right: st.edit ? h(DragHandle, { onDrop: (a, b) => saveRoutine({ ...r, items: moveItem(r.items.filter((i) => exById.has(i.exerciseId)), a, b) }) })
          : (prog.status === 'increase' && !deload ? h('span', { style: { color: 'var(--green)' }, title: 'Ready to add weight' }, icon('arrowUp', 20)) : null),
        onClick: st.edit ? null : () => openSheet({ type: 'exerciseEditor', exerciseId: item.exerciseId, routineId: r.id, itemId: item.id, advanced: false }),
      }),
    ]);
  });

  return h(Page, {
    title: r.name, backTo: '/routines', subtitle: r.folder || null,
    actions: [
      h('button.link-btn', { onclick: () => { st.edit = !st.edit; update(); } }, st.edit ? 'Done' : 'Edit'),
      h(IconButton, { name: 'more', label: 'Routine options', onClick: () => routineMenu(r) }),
    ],
  }, [
    h('div.summary-strip', [
      stat('Exercises', sum.exercises),
      stat('Sets', sum.workingSets),
      stat('Minutes', `~${sum.minutes}`),
      stat('Last done', sum.lastDoneAt ? relDay(sum.lastDoneAt) : '—', true),
    ]),
    sum.targetMuscles.length > 0 && h('div.chips', sum.targetMuscles.slice(0, 8).map((m) => h('span.chip.chip-static', { key: m }, muscleName(m, data.settings)))),
    deload && h('div.callout.blue.mt', [icon('info', 18), h('div', [h('b', 'Deload week. '), 'When you start, you can tap “Apply deload” to halve the sets and lower the weights ~10 %.'])]),
    r.notes && h('div.callout.mt', [icon('note', 18), r.notes]),
    h(Section, {
      title: 'Exercises',
      footer: st.edit ? 'Drag ≡ to reorder.' : 'Tap an exercise to change its sets, reps and rest for this routine, make a superset, replace or remove it.',
    }, [
      ...rows,
      !st.edit && h(Row, {
        key: 'add',
        left: h('span', { style: { color: 'var(--accent)' } }, icon('plus', 24)),
        title: h('span', { style: { color: 'var(--accent)', fontWeight: 650 } }, 'Add exercise'),
        onClick: () => openSheet({ type: 'picker', multi: true, title: `Add to ${r.name}`, onPick: (exs) => addToRoutine(r.id, exs) }),
      }),
    ]),
    h('div.start-bar', h(Button, { size: 'lg', block: true, disabled: items.length === 0, onClick: () => beginRoutine(r) }, [icon('play', 20), 'Start workout'])),
  ]);
}

function stat(k, v, small) {
  return h('div.stat', [h('div.v', { style: small ? { fontSize: '14px', paddingTop: '5px' } : null }, String(v)), h('div.k', k)]);
}

// ---------- Routine item actions (shown at the bottom of the exercise editor in routine mode) ----------
export function routineItemActions(r, item, ex) {
  const idx = r.items.indexOf(item);
  const next = r.items[idx + 1];
  return [
    h(Section, {}, [
      next && !item.supersetId && h(Row, { title: 'Superset with next exercise', subtitle: exercisesById().get(next.exerciseId)?.name, left: icon('link', 20), onClick: () => {
        const id = next.supersetId || uid();
        saveRoutine({ ...r, items: r.items.map((i) => (i.id === item.id || i.id === next.id ? { ...i, supersetId: id } : i)) });
      } }),
      item.supersetId && h(Row, { title: 'Remove from superset', left: icon('link', 20), onClick: () => {
        const items = r.items.map((i) => (i.id === item.id ? { ...i, supersetId: null } : i));
        const left = items.filter((i) => i.supersetId === item.supersetId);
        if (left.length === 1) left[0].supersetId = null;
        saveRoutine({ ...r, items });
      } }),
      item.supersetId && next && next.supersetId !== item.supersetId && h(Row, { title: 'Add next exercise to this superset', left: icon('link', 20), onClick: () => saveRoutine({ ...r, items: r.items.map((i) => (i.id === next.id ? { ...i, supersetId: item.supersetId } : i)) }) }),
      h(Row, { title: 'Replace exercise', subtitle: 'History of both exercises is kept', left: icon('swap', 20), onClick: () => openSheet({
        type: 'picker', multi: false, title: `Replace ${ex.name}`,
        onPick: ([nx]) => { saveRoutine({ ...r, items: r.items.map((i) => (i.id === item.id ? { ...newRoutineItem(nx.id), id: i.id, supersetId: i.supersetId, notes: i.notes } : i)) }); toast(`Replaced with ${nx.name}`); },
      }) }),
      h(Row, { title: 'Remove from routine', danger: true, left: h('span', { style: { color: 'var(--red)' } }, icon('trash', 20)), onClick: () => {
        closeSheet();
        const before = deepClone(r);
        saveRoutine({ ...r, items: r.items.filter((i) => i.id !== item.id) });
        toast(`Removed ${ex.name}`, 5000, { text: 'Undo', onClick: () => saveRoutine(before) });
      } }),
    ]),
  ];
}

// Re-exported for other modules.
export { fmtW };
