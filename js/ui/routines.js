// Routines tab: routine "folders", routine detail (pre-start summary), per-routine overrides.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, closeSheet, saveRoutine, deleteRoutine, confirm, toast, history, exercisesById, sortedRoutines, activeWorkout, doneWorkouts, addTemplate } from '../store.js';
import { Page, Section, Row, Empty, Button, IconButton, Stepper, Sheet, TextField, Thumb, Chip, DragHandle, moveItem, nav, relDay, fmtW } from './components.js';
import { select } from './exercises.js';
import { newRoutine, newRoutineItem, effectiveConfig } from '../logic/model.js';
import { muscleName } from '../logic/muscles.js';
import { routineSummary } from '../logic/analytics.js';
import { lastSession } from '../logic/history.js';
import { evaluateProgression } from '../logic/progression.js';
import { activeBlock, blockWeek, isDeloadWeek, plannedRoutineIds } from '../logic/blocks.js';
import { fmtClock, uid, deepClone } from '../logic/util.js';
import { REST_STEP, REST_MIN, REST_MAX } from '../logic/restTimer.js';
import { TEMPLATES } from '../logic/samples.js';
import { startWorkout, discardWorkout } from '../workoutService.js';

function lastDoneAt(routineId) {
  const w = doneWorkouts().find((x) => x.routineId === routineId);
  return w ? w.startedAt : null;
}

/** Starts a routine, asking first if another workout is already running. */
export function beginRoutine(routine) {
  const running = activeWorkout();
  const go = () => { startWorkout(routine); ui.workoutOpen = true; update(); };
  if (!running) return go();
  confirm({
    title: 'A workout is already in progress',
    message: `“${running.routineName}” is still running. You can only run one workout at a time.`,
    confirmText: 'Resume current workout',
    onConfirm: () => { ui.workoutOpen = true; update(); },
    extra: [{ text: `Discard it & start ${routine ? routine.name : 'new'}`, destructive: true, onClick: () => { discardWorkout(running); go(); } }],
  });
}

// ---------- Routines list ----------
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

  const block = activeBlock(data.blocks);
  const todayIds = plannedRoutineIds(data.blocks, Date.now());
  const todayRoutines = todayIds.map((id) => data.routines.find((r) => r.id === id)).filter(Boolean);
  const doneToday = doneWorkouts().filter((w) => new Date(w.startedAt).toDateString() === new Date().toDateString());

  const reorder = (folder, from, to) => {
    const group = moveItem(byFolder.get(folder), from, to);
    byFolder.set(folder, group);
    let i = 0;
    for (const f of folders) for (const r of byFolder.get(f)) { if (r.order !== i) saveRoutine({ ...r, order: i }); i++; }
  };

  return h(Page, {
    title: 'Routines',
    actions: [
      routines.length > 0 && h('button.link-btn', { onclick: () => { st.edit = !st.edit; update(); } }, st.edit ? 'Done' : 'Edit'),
      h(IconButton, { name: 'dumbbell', label: 'Exercise library', onClick: () => nav('/library') }),
      h(IconButton, { name: 'calendar', label: 'Training plan', onClick: () => nav('/plan') }),
      h(IconButton, { name: 'plus', label: 'New routine', onClick: () => openSheet({ type: 'newRoutine' }) }),
    ],
  }, [
    block && h('div.today-card', [
      h('div.k', `${block.name} · ${block.phase || ''} · Week ${blockWeek(block)} of ${block.weeks}${isDeloadWeek(block) ? ' · DELOAD' : ''}`),
      todayRoutines.length
        ? [h('div.t', `Today: ${todayRoutines.map((r) => r.name).join(' + ')}`),
          doneToday.length ? h('div', '✓ Done today – nice work!') :
            h('div.hstack', todayRoutines.map((r) => h(Button, { key: r.id, size: 'sm', onClick: () => nav('/routine/' + r.id) }, [icon('play', 16), r.name])))]
        : h('div.t', 'Rest day 😴'),
    ]),
    routines.length === 0 && h(Empty, {
      iconName: 'folder', title: 'No routines yet', text: 'Create a routine once, then just open it and train.',
      action: h(Button, { onClick: () => openSheet({ type: 'newRoutine' }) }, 'New Routine'),
    }),
    ...folders.map((f) => h(Section, { key: 'f-' + f, title: f || (folders.length > 1 ? 'Routines' : '') },
      byFolder.get(f).map((r, idx) => {
        const names = r.items.map((i) => exercisesById().get(i.exerciseId)?.name).filter(Boolean);
        const last = lastDoneAt(r.id);
        return h('div', { key: r.id, 'data-drag-row': '' }, h(Row, {
          left: h('div.folder-icon', icon('folder', 24)),
          title: r.name,
          subtitle: names.length ? `${names.length} exercises · ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}` : 'No exercises yet',
          right: st.edit
            ? h('div.hstack', [h(IconButton, { name: 'more', label: 'Routine options', onClick: (e) => { e.stopPropagation(); routineMenu(r); } }), h(DragHandle, { onDrop: (a, b) => reorder(f, a, b) })])
            : (last ? h('span.small', relDay(last)) : null),
          chevron: !st.edit,
          onClick: st.edit ? () => routineMenu(r) : () => nav('/routine/' + r.id),
        }));
      }))),
    routines.length > 0 && h('div.section-foot.center', st.edit ? 'Drag ≡ to reorder · ⋯ to rename, move to a folder, duplicate or delete' : 'Tap Edit to reorder, rename, duplicate or delete'),
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
    confirmText: 'Delete Routine', destructive: true,
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
    const r = newRoutine({ name: sheet.name.trim() || 'New Routine', folder: sheet.folder.trim(), order });
    saveRoutine(r);
    closeSheet();
    nav('/routine/' + r.id);
    openSheet({ type: 'picker', multi: true, title: `Add to ${r.name}`, onPick: (exs) => addToRoutine(r.id, exs) });
  };
  return h(Sheet, {
    title: 'New Routine',
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
    const prog = evaluateProgression(ex, lastSession(hist, ex.id), cfg, data.settings);
    const prev = items[idx - 1], next = items[idx + 1];
    const ssStart = item.supersetId && (!prev || prev.supersetId !== item.supersetId);
    const inSS = !!item.supersetId && ((prev && prev.supersetId === item.supersetId) || (next && next.supersetId === item.supersetId));
    return h('div', { key: item.id, 'data-drag-row': '', class: inSS ? 'superset-bar' : '' }, [
      inSS && ssStart && h('div.ss-label', { style: { padding: '8px 16px 0' } }, 'SUPERSET'),
      h(Row, {
        left: h(Thumb, { image: ex.image, name: ex.name }),
        title: ex.name,
        subtitle: [
          `${cfg.warmupSets ? cfg.warmupSets + 'W + ' : ''}${cfg.sets} × ${cfg.repMin}–${cfg.repMax} · Rest ${fmtClock(cfg.rest)}${cfg.rirTarget !== null && cfg.rirTarget !== undefined ? ` · RIR ${cfg.rirTarget}` : ''}`,
          item.notes && h('div', ['📝 ', item.notes]),
          ex.notes && h('div', ['📌 ', ex.notes]),
        ],
        right: st.edit ? h(DragHandle, { onDrop: (a, b) => saveRoutine({ ...r, items: moveItem(r.items.filter((i) => exById.has(i.exerciseId)), a, b) }) })
          : (prog.status === 'increase' && !deload ? h('span', { style: { color: 'var(--green)' }, title: 'Ready to add weight' }, icon('arrowUp', 20)) : null),
        onClick: st.edit ? null : () => openSheet({ type: 'itemEditor', routineId: r.id, itemId: item.id }),
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
        title: h('span', { style: { color: 'var(--accent)', fontWeight: 650 } }, 'Add Exercise'),
        onClick: () => openSheet({ type: 'picker', multi: true, title: `Add to ${r.name}`, onPick: (exs) => addToRoutine(r.id, exs) }),
      }),
    ]),
    h('div.start-bar', h(Button, { size: 'lg', block: true, disabled: items.length === 0, onClick: () => beginRoutine(r) }, [icon('play', 20), 'Start Workout'])),
  ]);
}

function stat(k, v, small) {
  return h('div.stat', [h('div.v', { style: small ? { fontSize: '14px', paddingTop: '5px' } : null }, String(v)), h('div.k', k)]);
}

// ---------- Item editor (per-routine overrides) ----------
// sheet: { type: 'itemEditor', routineId, itemId }
export function ItemEditorSheet(sheet) {
  const r = data.routines.find((x) => x.id === sheet.routineId);
  const item = r && r.items.find((i) => i.id === sheet.itemId);
  const ex = item && exercisesById().get(item.exerciseId);
  if (!ex) return h(Sheet, { title: 'Exercise' }, h('div.pad', 'Not found.'));
  const cfg = effectiveConfig(ex, item);
  const s = data.settings;
  const setOverride = (k, v) => {
    const val = v === ex[k] ? null : v;
    saveRoutine({ ...r, items: r.items.map((i) => (i.id === item.id ? { ...i, [k]: val } : i)) });
  };
  const idx = r.items.indexOf(item);
  const next = r.items[idx + 1];
  const overridden = ['sets', 'warmupSets', 'repMin', 'repMax', 'rest', 'weightStep', 'rirTarget'].some((k) => item[k] !== null && item[k] !== undefined);
  const lib = (k, f = (x) => x) => `Library: ${f(ex[k] ?? '–')}`;

  return h(Sheet, { title: ex.name, full: true }, [
    h('div.hstack', { style: { margin: '6px 0 4px', gap: '14px' } }, [
      h(Thumb, { image: ex.image, name: ex.name, size: 56 }),
      h('div.grow', [h('div', { style: { fontWeight: 700, fontSize: '19px' } }, ex.name), h('div.muted.small', `${ex.equipment || ''}${ex.notes ? ' · ' + ex.notes : ''}`)]),
    ]),
    h('div.hstack.wrap', { style: { margin: '10px 0' } }, [
      h(Button, { kind: 'secondary', size: 'sm', onClick: () => openSheet({ type: 'exerciseEditor', exerciseId: ex.id }) }, [icon('edit', 16), 'Edit in library']),
      h(Button, { kind: 'secondary', size: 'sm', onClick: () => { ui.sheets = []; nav('/exercise/' + ex.id); update(); } }, [icon('chart', 16), 'Progress']),
    ]),
    h(Section, {
      title: 'In this routine only',
      footer: 'These settings only change this routine. The exercise’s history is shared everywhere.',
      right: overridden && h('button.link-btn', { style: { minHeight: 'auto', padding: 0, textTransform: 'none', letterSpacing: 0, fontSize: '13px' }, onclick: () => saveRoutine({ ...r, items: r.items.map((i) => (i.id === item.id ? { ...newRoutineItem(i.exerciseId), id: i.id, notes: i.notes, supersetId: i.supersetId } : i)) }) }, 'Reset to library'),
    }, [
      h(Row, { title: 'Working sets', subtitle: lib('sets'), right: h(Stepper, { value: cfg.sets, min: 1, max: 12, onChange: (v) => setOverride('sets', v) }) }),
      h(Row, { title: 'Warm-up sets', subtitle: lib('warmupSets'), right: h(Stepper, { value: cfg.warmupSets || 0, min: 0, max: 6, onChange: (v) => setOverride('warmupSets', v) }) }),
      h(Row, { title: 'Min reps', subtitle: lib('repMin'), right: h(Stepper, { value: cfg.repMin, min: 1, max: cfg.repMax, onChange: (v) => setOverride('repMin', v) }) }),
      h(Row, { title: 'Max reps', subtitle: lib('repMax'), right: h(Stepper, { value: cfg.repMax, min: cfg.repMin, max: 100, onChange: (v) => setOverride('repMax', v) }) }),
      h(Row, { title: 'Rest', subtitle: lib('rest', fmtClock), right: h(Stepper, { value: cfg.rest, step: REST_STEP, min: REST_MIN, max: REST_MAX, format: fmtClock, onChange: (v) => setOverride('rest', v) }) }),
      ex.type !== 'bodyweight' && h(Row, { title: 'Weight step', subtitle: lib('weightStep', (x) => `${x} ${s.unit}`), right: select([0.5, 1, 1.25, 2, 2.5, 5, 10].map((x) => ({ value: x, label: `${x} ${s.unit}` })), cfg.weightStep, (v) => setOverride('weightStep', Number(v))) }),
      h(Row, { title: 'Target RIR', right: select([{ value: '', label: 'None' }, ...[0, 1, 2, 3, 4, 5].map((x) => ({ value: String(x), label: x === 5 ? '5+' : String(x) }))], cfg.rirTarget === null || cfg.rirTarget === undefined ? '' : String(cfg.rirTarget), (v) => setOverride('rirTarget', v === '' ? null : Number(v))) }),
    ]),
    h(Section, { title: 'Routine notes' }, h('div.field-card', h(TextField, {
      value: item.notes, placeholder: 'Only shown in this routine', multiline: true,
      onChange: (v) => { item.notes = v; saveRoutine({ ...r }); },
    }))),
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
  ]);
}

// Re-exported for other modules.
export { fmtW };
