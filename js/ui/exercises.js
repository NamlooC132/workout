// Exercise library: list screen, multi-select picker and the exercise editor.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, closeSheet, saveExercise, deleteExercise, saveRoutine, confirm, toast, history, doneWorkouts } from '../store.js';
import { Page, Section, Row, Empty, Button, IconButton, Stepper, Toggle, Segmented, Chip, Sheet, TextField, Thumb, NumberField, nav } from './components.js';
import { newExercise, effectiveConfig, withConfig } from '../logic/model.js';
import { allMuscles, muscleName, contributions, EXERCISE_TYPES, EQUIPMENT, CATEGORIES } from '../logic/muscles.js';
import { fmtClock, deepClone, fmtNum } from '../logic/util.js';
import { REST_STEP, REST_MIN, REST_MAX } from '../logic/restTimer.js';
import { defaultProgressionStep } from '../logic/units.js';
import { setGoals } from '../logic/progression.js';
import { routineItemActions } from './routines.js';
import { CATALOG, guideFor, catalogEntry } from '../logic/catalog.js';
import { heName, tr } from '../i18n.js';
import { refreshExercise, liveDraft, applyLiveEdit } from '../workoutService.js';

export function exerciseSubtitle(ex) {
  const mus = contributions(ex).filter((c) => c.value >= 1).map((c) => muscleName(c.key, data.settings));
  return [mus.join(', ') || 'No muscles set', ex.equipment].filter(Boolean).join(' · ');
}

// Search by name, equipment, type or muscle ("chest", "cable fly", "db shoulders" …).
const ALIASES = { db: 'dumbbell', dbs: 'dumbbell', bb: 'barbell', kb: 'kettlebell', bw: 'bodyweight', ohp: 'overhead press', rdl: 'romanian deadlift', delts: 'delts', shoulders: 'delts', shoulder: 'delts', legs: 'quadriceps hamstrings glutes calves', arms: 'biceps triceps forearms', lats: 'back', quads: 'quadriceps', hams: 'hamstrings', abs: 'abs', core: 'abs', pecs: 'chest' };
function haystack(ex) {
  const mus = Object.entries(ex.muscles || {}).filter(([, v]) => v > 0).map(([k]) => `${muscleName(k, data.settings)} ${tr(muscleName(k, data.settings))} ${k.replace('_', ' ')}`);
  const type = EXERCISE_TYPES.find((t) => t.key === ex.type)?.name || '';
  return `${ex.name} ${heName(ex.name) || ''} ${ex.aka || catalogEntry(ex.name)?.aka || ''} ${ex.equipment || ''} ${tr(ex.equipment || '')} ${ex.category || ''} ${type} ${mus.join(' ')}`.toLowerCase();
}
// Body-part filter: simple groups of the detailed muscles. An exercise belongs to a group when
// one of the group's muscles is a MAIN muscle (helpers don't count), so "Chest" shows chest exercises.
export const BODY_PARTS = [
  { key: 'chest', name: 'Chest', m: ['chest'] },
  { key: 'back', name: 'Back\u200b', m: // zero-width space keeps it apart from the 'Back' button in translations
     ['lats', 'upper_back', 'lower_back', 'traps'] },
  { key: 'shoulders', name: 'Shoulders', m: ['front_delts', 'side_delts', 'rear_delts'] },
  { key: 'biceps', name: 'Biceps', m: ['biceps'] },
  { key: 'triceps', name: 'Triceps', m: ['triceps'] },
  { key: 'forearms', name: 'Forearms', m: ['forearms'] },
  { key: 'abs', name: 'Abs', m: ['abs'] },
  { key: 'quads', name: 'Quadriceps', m: ['quads'] },
  { key: 'hamstrings', name: 'Hamstrings', m: ['hamstrings'] },
  { key: 'glutes', name: 'Glutes', m: ['glutes'] },
  { key: 'calves', name: 'Calves', m: ['calves'] },
  { key: 'adductors', name: 'Adductors', m: ['adductors'] },
];
const EQUIPMENT_FILTERS = ['Machine', 'Cable', 'Dumbbell', 'Barbell', 'Smith machine', 'Bodyweight', 'Kettlebell', 'Band', 'Other'];
const equipmentOf = (ex) => ex.equipment || catalogEntry(ex.name)?.equipment || 'Other';
function inBodyPart(ex, part) {
  const g = BODY_PARTS.find((b) => b.key === part);
  const keys = g ? g.m : [part]; // custom muscle groups use their own key
  return keys.some((k) => (ex.muscles?.[k] || 0) >= (g ? 1 : 0.01));
}

export function matches(ex, q, muscle, equip) {
  if (muscle && !inBodyPart(ex, muscle)) return false;
  if (equip && equipmentOf(ex) !== equip) return false;
  if (!q || !q.trim()) return true;
  const hay = haystack(ex);
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((tok) => {
    if (hay.includes(tok)) return true;
    const alt = ALIASES[tok];
    return !!alt && alt.split(' ').some((a) => hay.includes(a));
  });
}
/** Name matches first, then the rest (muscle / equipment matches). */
function byRelevance(q) {
  const t = (q || '').trim().toLowerCase();
  return (a, b) => {
    if (t) {
      const sa = a.name.toLowerCase().startsWith(t) ? 0 : a.name.toLowerCase().includes(t) ? 1 : 2;
      const sb = b.name.toLowerCase().startsWith(t) ? 0 : b.name.toLowerCase().includes(t) ? 1 : 2;
      if (sa !== sb) return sa - sb;
    }
    return a.name.localeCompare(b.name);
  };
}
function recentExerciseIds(limit = 8) {
  const out = [];
  for (const w of doneWorkouts()) for (const e of w.entries) {
    if (e.exerciseId && !out.includes(e.exerciseId)) out.push(e.exerciseId);
    if (out.length >= limit) return out;
  }
  return out;
}

/** Two rows of filters: body part, then equipment. `st` holds { muscle, equip }. */
function Filters({ st }) {
  const custom = (data.settings.customMuscles || []).map((m) => ({ key: m.key, name: m.name }));
  const row = (label, all, items, value, set) => h('div.filter-row', [
    h('span.filter-lbl', label),
    h('div.chips.filter-chips', [
      h(Chip, { active: !value, onClick: () => { set(null); update(); } }, all),
      ...items.map((it) => h(Chip, { key: it.key, active: value === it.key, onClick: () => { set(value === it.key ? null : it.key); update(); } }, it.name)),
    ]),
  ]);
  return h('div.filters', [
    row('Body part', 'All', [...BODY_PARTS, ...custom], st.muscle, (v) => { st.muscle = v; }),
    row('Equipment', 'Any', EQUIPMENT_FILTERS.map((e) => ({ key: e, name: e })), st.equip, (v) => { st.equip = v; }),
    (st.muscle || st.equip) && h('button.link-btn.filter-clear', { onclick: () => { st.muscle = null; st.equip = null; update(); } }, 'Clear filters'),
  ]);
}

function SearchBox({ value, onChange, placeholder = 'Search name, muscle or equipment' }) {
  return h('div.card', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', marginTop: '4px' } }, [
    h('span.muted', icon('search', 18)),
    h('input.text-field', { type: 'search', placeholder, value, oninput: (e) => onChange(e.target.value), 'aria-label': placeholder }),
  ]);
}

// ---------- Catalog helpers ----------
/** Catalog exercises not yet in your library that match the search / muscle filter. */
function catalogMatches(q, muscle, equip) {
  const have = new Set(data.exercises.map((e) => e.name.toLowerCase()));
  return CATALOG.filter((c) => !have.has(c.name.toLowerCase()) && matches(c, q, muscle, equip)).sort(byRelevance(q));
}

/** Adds a catalog exercise to your library (with your default rest/step settings) and returns it. */
export function addFromCatalog(c) {
  const ex = newExercise(data.settings, {
    name: c.name, type: c.type, equipment: c.equipment, category: c.category, muscles: { ...c.muscles },
    repMin: c.repMin, repMax: c.repMax, sets: c.sets, rest: c.rest, loadMode: c.loadMode,
    unilateral: c.unilateral, warmupSets: c.warmupSets, notes: c.notes, guide: c.guide,
  });
  saveExercise(ex);
  return ex;
}

function catSubtitle(c) {
  const mus = Object.entries(c.muscles).filter(([, v]) => v >= 1).map(([k]) => muscleName(k, data.settings));
  return `${mus.join(', ')} · ${c.equipment}`;
}

// ---------- Library screen ----------
export function LibraryScreen() {
  const st = (ui.tabState.library = ui.tabState.library || { q: '', muscle: null, equip: null });
  const list = data.exercises.filter((e) => matches(e, st.q, st.muscle, st.equip)).sort(byRelevance(st.q));
  const cat = catalogMatches(st.q, st.muscle, st.equip);
  const hist = history();
  return h(Page, {
    title: 'Exercises', backTo: '/routines',
    actions: [h(IconButton, { name: 'plus', label: 'New exercise', onClick: () => openSheet({ type: 'exerciseEditor', exerciseId: null }) })],
  }, [
    h(SearchBox, { value: st.q, onChange: (v) => { st.q = v; update(); } }),
    h(Filters, { st }),
    h(Section, { title: `My exercises (${list.length})` }, list.length === 0
      ? h('div.pad.muted', data.exercises.length ? 'No matches.' : 'None yet – add some from the list below or tap +.')
      : list.map((ex) => h(Row, {
        key: ex.id,
        left: h(Thumb, { image: ex.image, name: ex.name, muscles: ex.muscles }),
        title: ex.name,
        subtitle: `${exerciseSubtitle(ex)} · ${(hist.get(ex.id) || []).length} sessions`,
        chevron: true,
        onClick: () => nav('/exercise/' + ex.id),
      }))),
    cat.length > 0 && h(Section, { title: `More exercises (${cat.length})`, footer: 'Tap + to add one to your exercises. Muscles, rep range and a “How to” guide link are already set up.' },
      cat.map((c) => h(Row, {
        key: 'cat-' + c.name,
        left: h(Thumb, { name: c.name, muscles: c.muscles }),
        title: c.name,
        subtitle: catSubtitle(c),
        right: h('span', { style: { color: 'var(--accent)' } }, icon('plus', 22)),
        onClick: () => { addFromCatalog(c); toast(`Added ${c.name}`); },
      }))),
  ]);
}

// ---------- Picker sheet ----------
// sheet: { type: 'picker', title, multi, onPick(exercises) }
// Selection keys are exercise ids, or "cat:<name>" for catalog exercises (created on confirm).
export function PickerSheet(sheet) {
  sheet.q = sheet.q || '';
  sheet.selected = sheet.selected || [];
  const list = data.exercises.filter((e) => matches(e, sheet.q, sheet.muscle, sheet.equip)).sort(byRelevance(sheet.q));
  const byId = new Map(list.map((e) => [e.id, e]));
  const recent = recentExerciseIds().map((id) => byId.get(id)).filter(Boolean);
  const shown = new Set(recent.map((e) => e.id));
  const routineIds = new Set(data.routines.flatMap((r) => r.items.map((i) => i.exerciseId)));
  const inRoutines = list.filter((e) => routineIds.has(e.id) && !shown.has(e.id));
  inRoutines.forEach((e) => shown.add(e.id));
  const others = list.filter((e) => !shown.has(e.id));
  const cat = catalogMatches(sheet.q, sheet.muscle, sheet.equip);
  const resolve = (key) => {
    if (key.startsWith('cat:')) {
      const name = key.slice(4);
      const existing = data.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
      if (existing) return existing;
      const c = CATALOG.find((x) => x.name === name);
      return c ? addFromCatalog(c) : null;
    }
    return data.exercises.find((e) => e.id === key);
  };
  const toggle = (key) => {
    if (!sheet.multi) {
      const ex = resolve(key);
      closeSheet();
      if (ex) sheet.onPick([ex]);
      return;
    }
    const i = sheet.selected.indexOf(key);
    if (i >= 0) sheet.selected.splice(i, 1); else sheet.selected.push(key);
    update();
  };
  const confirmPick = () => {
    const exs = sheet.selected.map(resolve).filter(Boolean);
    closeSheet();
    sheet.onPick(exs);
  };
  const mark = (key) => {
    if (!sheet.multi) return null;
    const on = sheet.selected.includes(key);
    return h('span', { style: { color: on ? 'var(--accent)' : 'var(--muted)' } }, on ? h('span.tag.accent', `#${sheet.selected.indexOf(key) + 1}`) : icon('plus', 22));
  };
  return h(Sheet, {
    title: sheet.title || 'Add exercise', full: true,
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: sheet.multi ? [h('button.link-btn.strong', { onclick: confirmPick, disabled: !sheet.selected.length }, sheet.selected.length ? `Add (${sheet.selected.length})` : 'Add')] : null,
  }, [
    h(SearchBox, { value: sheet.q, onChange: (v) => { sheet.q = v; update(); } }),
    h(Filters, { st: sheet }),
    h(Section, {}, [
      h(Row, {
        left: h('span', { style: { color: 'var(--accent)' } }, icon('plus', 24)),
        title: h('span', { style: { color: 'var(--accent)', fontWeight: 650 } }, 'Create new exercise'),
        onClick: () => openSheet({
          type: 'exerciseEditor', exerciseId: null, presetName: sheet.q,
          onSaved: (ex) => { if (sheet.multi) { sheet.selected.push(ex.id); update(); } else { closeSheet(); sheet.onPick([ex]); } },
        }),
      }),
    ]),
    ...[['Recent', recent], ['In your routines', inRoutines], [recent.length || inRoutines.length ? 'Other exercises' : 'My exercises', others]].map(([title, group]) => group.length > 0 && h(Section, { key: title, title }, group.map((ex) => h(Row, {
      key: ex.id,
      left: h(Thumb, { image: ex.image, name: ex.name, muscles: ex.muscles, size: 40 }),
      title: ex.name,
      subtitle: exerciseSubtitle(ex),
      right: mark(ex.id),
      onClick: () => toggle(ex.id),
    })))),
    list.length === 0 && cat.length === 0 && h('div.pad.muted.center', `Nothing matches “${sheet.q}”. Tap Create new exercise to add it.`),
    cat.length > 0 && h(Section, { title: 'More exercises' }, cat.map((c) => h(Row, {
      key: 'cat-' + c.name,
      left: h(Thumb, { name: c.name, muscles: c.muscles, size: 40 }),
      title: c.name,
      subtitle: catSubtitle(c),
      right: mark('cat:' + c.name),
      onClick: () => toggle('cat:' + c.name),
    }))),
  ]);
}

// ---------- Editor sheet ----------
// sheet: { type: 'exerciseEditor', exerciseId, onSaved, presetName }
export function ExerciseEditorSheet(sheet) {
  const s = data.settings;
  // Routine mode: { routineId, itemId } – edits are saved as overrides for that routine only.
  const routine = sheet.routineId ? data.routines.find((r) => r.id === sheet.routineId) : null;
  const item = routine ? routine.items.find((i) => i.id === sheet.itemId) : null;
  const inRoutine = !!item;
  const libEx = sheet.exerciseId ? data.exercises.find((e) => e.id === sheet.exerciseId) : null;
  // Workout mode: { workoutId, entryId } – edits change this workout only; finishing asks to keep them.
  const lw = sheet.workoutId ? data.workouts.find((x) => x.id === sheet.workoutId && x.status === 'active') : null;
  const liveEntry = lw && libEx ? lw.entries.find((e) => e.id === sheet.entryId) : null;
  const live = !!liveEntry;
  const limited = inRoutine || live;
  if (!sheet.draft) {
    const existing = libEx;
    sheet.draft = existing ? deepClone(existing) : newExercise(s, { name: sheet.presetName || '' });
    if (live) {
      sheet.draft = liveDraft(liveEntry, existing);
    } else if (inRoutine && existing) {
      const cfg = effectiveConfig(existing, item);
      Object.assign(sheet.draft, deepClone(withConfig(existing, cfg)), {
        sets: cfg.sets, warmupSets: cfg.warmupSets, dropSets: cfg.dropSets, repMin: cfg.repMin, repMax: cfg.repMax,
        rest: cfg.rest, weightStep: cfg.weightStep, rirTarget: cfg.rirTarget, notes: item.notes || '',
      });
    }
    sheet.isNew = !existing;
    // Remember the set counts, so a live workout can add / remove exactly what changed.
    sheet.orig = { sets: sheet.draft.sets || 0, warmupSets: sheet.draft.warmupSets || 0, dropSets: sheet.draft.dropSets || 0 };
  }
  const countChanges = () => sheet.orig && {
    sets: (sheet.draft.sets || 0) - sheet.orig.sets,
    warmupSets: (sheet.draft.warmupSets || 0) - sheet.orig.warmupSets,
    dropSets: (sheet.draft.dropSets || 0) - sheet.orig.dropSets,
  };
  const d = sheet.draft;
  const set = (patch) => { Object.assign(d, patch); update(); };
  const setProg = (patch) => { d.progression = { ...d.progression, ...patch }; update(); };
  const canSave = d.name.trim().length > 0;
  const routinesUsing = data.routines.filter((r) => r.items.some((i) => i.exerciseId === d.id));
  const save = () => {
    if (live) {
      if (d.repMin > d.repMax) [d.repMin, d.repMax] = [d.repMax, d.repMin];
      applyLiveEdit(lw, liveEntry, d);
      closeSheet();
      toast('Updated for this workout');
      return;
    }
    if (inRoutine) {
      if (d.repMin > d.repMax) [d.repMin, d.repMax] = [d.repMax, d.repMin];
      saveRoutine({ ...routine, items: routine.items.map((i) => (i.id === item.id ? { ...i, ...routineOverrides(libEx, d) } : i)) });
      closeSheet();
      toast(refreshExercise(d.id, countChanges()) ? `Saved for ${routine.name} only · updated in this workout` : `Saved for ${routine.name} only`);
      return;
    }
    d.name = d.name.trim();
    if (d.repMin > d.repMax) [d.repMin, d.repMax] = [d.repMax, d.repMin];
    saveExercise(deepClone(d));
    closeSheet();
    const updatedLive = !sheet.isNew && refreshExercise(d.id, countChanges());
    toast(sheet.isNew ? 'Exercise created' : updatedLive ? 'Exercise saved · updated in this workout' : 'Exercise saved');
    sheet.onSaved && sheet.onSaved(d);
  };
  const unit = s.unit;
  const hasWeight = d.type !== 'bodyweight';
  const stepOptions = [0.5, 1, 1.25, 2, 2.5, 5, 10];

  // Main / helper muscle chips: tap once = main (100 %), twice = helper (default 50 %), three times = off.
  const helperPct = (s.indirectContribution ?? 0.5);
  const cycleMuscle = (key) => {
    const mus = { ...d.muscles };
    const v = mus[key] || 0;
    if (!v) mus[key] = 1; else if (v >= 1) mus[key] = helperPct; else delete mus[key];
    set({ muscles: mus });
  };
  const adv = !!sheet.advanced;
  // "Goal for each set": one goal per working set; the boxes decide the number of sets and the rep range.
  const applyGoals = (goals) => {
    goals = goals.map((g) => Math.max(1, Math.min(200, Math.round(g || 1))));
    d.progression = { ...d.progression, setGoals: goals };
    if (goals.length) Object.assign(d, { sets: goals.length, repMin: Math.min(...goals), repMax: Math.max(...goals) });
    update();
  };
  const perSet = d.progression.rule === 'per_set';
  const goalList = perSet ? setGoals(d, d.sets) : [];
  // Changing the number of sets adds a box (copying the last goal) or removes the last one.
  const setSets = (v) => {
    if (!perSet) return set({ sets: v });
    const g = goalList.slice(0, v);
    while (g.length < v) g.push(g[g.length - 1] || d.repMax || 10);
    applyGoals(g);
  };

  const otherRoutines = inRoutine ? data.routines.filter((x) => x.id !== routine.id && x.items.some((i) => i.exerciseId === d.id)) : [];
  const overridden = inRoutine && ROUTINE_KEYS.some((k) => item[k] !== null && item[k] !== undefined);
  return h(Sheet, {
    title: limited ? d.name : sheet.isNew ? 'New exercise' : 'Edit exercise', full: true,
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: [h('button.link-btn.strong', { onclick: save, disabled: !canSave }, 'Save')],
  }, [
    live && h('div.callout.blue', { style: { marginBottom: '6px' } }, [icon('info', 18), h('div', [
      h('div', { style: { fontWeight: 700, marginBottom: '4px' } }, 'Changes are for this workout.'),
      h('div', 'When you finish the workout, you can save them for next time.'),
    ])]),
    inRoutine && h('div.callout.blue', { style: { marginBottom: '6px' } }, [icon('info', 18), h('div', [
      h('div', [
        h('div', { style: { fontWeight: 700, marginBottom: '4px' } }, `You are editing ${d.name} for the ${routine.name} routine only.`),
        h('div', `When you tap Save, these settings are used every time you do ${routine.name}.`),
        h('div', otherRoutines.length
          ? `${d.name} in ${otherRoutines.map((x) => x.name).join(', ')} and in your exercise library will not change.`
          : `${d.name} in your exercise library will not change.`),
      ]),
      h('div.hstack.wrap', { style: { marginTop: '8px', gap: '8px' } }, [
        h('button.btn.btn-secondary.btn-sm', { onclick: () => openSheet({ type: 'exerciseEditor', exerciseId: d.id }) }, [icon('edit', 15), 'Edit in library (all routines)']),
        overridden && h('button.btn.btn-plain.btn-sm', { onclick: () => { saveRoutine({ ...routine, items: routine.items.map((i) => (i.id === item.id ? { ...i, ...Object.fromEntries(ROUTINE_KEYS.map((k) => [k, null])) } : i)) }); sheet.draft = null; refreshExercise(d.id); update(); toast('Reset to library'); } }, 'Reset to library'),
      ]),
    ])]),
    !limited && h('div.ed-top', [
      h('label.ed-photo', { 'aria-label': d.image ? 'Change photo' : 'Add photo' }, [
        h(Thumb, { image: d.image, name: d.name, muscles: d.muscles, size: 72, zoom: false }),
        h('span.ed-photo-badge', icon('camera', 14)),
        h('input.hidden-input', { type: 'file', accept: 'image/*', onchange: (e) => pickImage(e, (url) => set({ image: url })) }),
      ]),
      h('div.grow', [
        h('div.field-card.ed-name', h(TextField, { value: d.name, onChange: (v) => { d.name = v; update(); }, placeholder: 'Exercise name', autofocus: sheet.isNew && !d.name })),
        d.image && h('button.link-btn.danger', { style: { padding: '2px 4px', minHeight: '32px', fontSize: '14px' }, onclick: () => set({ image: null }) }, 'Remove photo'),
      ]),
    ]),

    h(Section, { title: 'Type' }, h('div.pad', h('div.chips', EXERCISE_TYPES.map((t) => h(Chip, { key: t.key, active: d.type === t.key, onClick: () => set({ type: t.key }) }, t.name))))),

    !limited && h(Section, { title: 'Muscles', footer: 'Tap once for a main muscle, twice for a helper, again to remove.' }, h('div.pad', h('div.chips', allMuscles(s).map((m) => {
      const v = d.muscles[m.key] || 0;
      return h('button', { key: m.key, class: cx('chip', v >= 1 && 'active', v > 0 && v < 1 && 'chip-helper'), onclick: () => cycleMuscle(m.key) }, [m.name, v > 0 && v < 1 && h('small', 'helper')]);
    })))),

    h(Section, { title: 'Sets, reps and rest' }, [
      h(Row, { title: 'Working sets', right: h(Stepper, { value: d.sets, min: 1, max: 20, onChange: (v) => setSets(v) }) }),
      h(Row, { title: 'Rep range', right: h('div.hstack', { style: { gap: '6px' } }, [
        h(NumberField, { value: d.repMin, decimals: false, class: 'w-64 center', ariaLabel: 'Min reps', onChange: (v) => { if (v) d.repMin = v; } }),
        h('span.muted', '–'),
        h(NumberField, { value: d.repMax, decimals: false, class: 'w-64 center', ariaLabel: 'Max reps', onChange: (v) => { if (v) d.repMax = v; } }),
      ]) }),
      h(Row, { title: 'Rest timer', right: h(Stepper, { value: d.rest, step: REST_STEP, min: REST_MIN, max: REST_MAX, format: fmtClock, onChange: (v) => set({ rest: v }) }) }),
    ]),

    h(Section, { title: live ? 'Note for this workout' : inRoutine ? 'Routine notes' : 'Notes' }, h('div.field-card', h(TextField, { value: d.notes, onChange: (v) => { d.notes = v; update(); }, placeholder: live ? 'Only for this workout' : inRoutine ? 'Only shown in this routine' : 'Shown during workouts, e.g. seat height 4', multiline: true }))),

    h('button.adv-toggle', { onclick: () => { sheet.advanced = !adv; update(); } }, [h('span', 'Advanced'), h('span.muted.small', adv ? 'Hide' : 'Equipment, exact %, warm-ups, overload…'), icon(adv ? 'chevronUp' : 'chevronDown', 18)]),

    adv && [
      h(Section, { title: 'Details' }, [
        d.type === 'dumbbell' && h(Row, { title: 'Weight is entered', right: h(Segmented, { small: true, value: d.loadMode, onChange: (v) => set({ loadMode: v }), options: [{ value: 'per_hand', label: 'Per hand' }, { value: 'total', label: 'Total' }] }) }),
        h(Row, { title: 'One side at a time', subtitle: 'Log left and right reps separately', right: h(Toggle, { checked: d.unilateral, onChange: (v) => set({ unilateral: v }) }) }),
        !limited && h(Row, { title: 'Equipment', right: select(EQUIPMENT, d.equipment, (v) => set({ equipment: v })) }),
        !limited && h(Row, { title: 'Category', right: select(CATEGORIES, d.category, (v) => set({ category: v })) }),
      ]),
      !limited && h(Section, { title: 'Exact muscle %', footer: 'How much one working set counts for each muscle.' }, allMuscles(s).filter((m) => d.muscles[m.key] > 0).map((m) => {
        const v = d.muscles[m.key] || 0;
        return h(Row, {
          key: m.key, title: m.name,
          right: h('div.segmented.small', { style: { margin: 0, width: '200px' } }, [0, 0.25, 0.5, 0.75, 1].map((x) =>
            h('button', { class: cx('seg', Math.abs(v - x) < 0.001 && 'active'), onclick: () => { const mus = { ...d.muscles }; if (x === 0) delete mus[m.key]; else mus[m.key] = x; set({ muscles: mus }); } }, x === 0 ? '–' : `${x * 100}`))),
        });
      })),
      h(Section, { title: 'Extra sets' }, [
        h(Row, { title: 'Warm-up sets', right: h(Stepper, { value: d.warmupSets || 0, min: 0, max: 6, onChange: (v) => set({ warmupSets: v }) }) }),
        h(Row, { title: 'Drop sets', subtitle: 'After the last working set', right: h(Stepper, { value: d.dropSets || 0, min: 0, max: 4, onChange: (v) => set({ dropSets: v }) }) }),
        hasWeight && h(Row, { title: '− / + buttons change weight by', subtitle: 'Only for the buttons next to the weight. Automatic increases use “Increase by” below.', right: select(stepOptions.map((x) => ({ value: x, label: `${x} ${unit}` })), d.weightStep, (v) => set({ weightStep: Number(v) })) }),
        h(Row, { title: 'Target RIR', subtitle: 'Reps in reserve you aim for', right: select([{ value: '', label: 'None' }, ...[0, 1, 2, 3, 4].map((x) => ({ value: String(x), label: `${x}` })), { value: '5', label: '5+' }], d.rirTarget === null || d.rirTarget === undefined ? '' : String(d.rirTarget), (v) => set({ rirTarget: v === '' ? null : Number(v) })) }),
      ]),
      h(Section, { title: 'Progressive overload', footer: progressionFooter(d, s) }, [
        h(Row, {
          title: 'Rule',
          right: select([
            { value: 'descending', label: 'Reps drop 1 per set (10, 9, 8)' },
            { value: 'all_max', label: 'Max reps on all sets' },
            { value: 'avg', label: 'Average reps' },
            { value: 'custom', label: 'Custom' },
            { value: 'per_set', label: 'Goal for each set' },
          ], d.progression.rule, (v) => { setProg({ rule: v }); if (v === 'per_set' && !(d.progression.setGoals || []).length) applyGoals(setGoals({ ...d, progression: { ...d.progression, rule: 'descending' } }, d.sets)); }),
        }),
        perSet && h('div.pad', [
          h('div.small.muted', { style: { marginBottom: '8px' } }, 'Rep goal for each working set. Adding a set adds a box.'),
          h('div.goal-grid', goalList.map((g, i) => h('label.goal-box', { key: i }, [
            h('span.goal-lbl', `Set ${i + 1}`),
            h(NumberField, { value: g, decimals: false, class: 'goal-input', ariaLabel: `Set ${i + 1} goal`, onChange: (v) => { const next = goalList.slice(); next[i] = v || 1; applyGoals(next); } }),
            goalList.length > 1 && h('button.goal-x', { onclick: (e) => { e.preventDefault(); applyGoals(goalList.filter((_, k) => k !== i)); }, 'aria-label': `Remove set ${i + 1}` }, '×'),
          ]))),
          goalList.length < 20 && h('button.btn.btn-secondary.btn-sm', { style: { marginTop: '10px' }, onclick: () => setSets(goalList.length + 1) }, [icon('plus', 16), 'Add set']),
        ]),
        d.progression.rule === 'avg' && h(Row, { title: 'Average reps needed', right: h(Stepper, { value: d.progression.avgTarget || d.repMax, min: 1, max: 100, onChange: (v) => setProg({ avgTarget: v }) }) }),
        d.progression.rule === 'custom' && h(Row, { title: 'Reps on every set', right: h(Stepper, { value: d.progression.customReps || d.repMax, min: 1, max: 100, onChange: (v) => setProg({ customReps: v }) }) }),
        d.progression.rule === 'custom' && h(Row, { title: 'With at least RIR', right: select([{ value: '', label: 'Any' }, ...[0, 1, 2, 3, 4, 5].map((x) => ({ value: String(x), label: String(x) }))], d.progression.customMinRir === null || d.progression.customMinRir === undefined ? '' : String(d.progression.customMinRir), (v) => setProg({ customMinRir: v === '' ? null : Number(v) })) }),
        hasWeight && h(Row, {
          title: d.type === 'assisted' ? 'Reduce assistance by' : 'Increase by',
          right: h('div.hstack', [
            h(NumberField, { value: d.progression.step ?? null, placeholder: fmtNum(s.defaultProgressionStep || defaultProgressionStep(unit)), onChange: (v) => setProg({ step: v || null }), class: 'w-80' }),
            h('span.muted', unit),
          ]),
        }),
      ]),
      !limited && h(Section, { title: 'How-to link', footer: 'Optional. Leave empty to use the built-in guide (or a video search).' }, [
        h('div.field-card', h(TextField, { value: d.guide || '', onChange: (v) => { d.guide = v.trim() || null; }, placeholder: 'https://…' })),
        d.name && h(Row, { title: h('a', { href: guideFor(d), target: '_blank', rel: 'noopener', style: { color: 'var(--accent)', textDecoration: 'none' } }, 'Open the how-to guide ↗') }),
      ]),
    ],

    inRoutine && routineItemActions(routine, item, libEx),

    !limited && !sheet.isNew && routinesUsing.length > 1 && h('div.callout.blue', [icon('info', 18), `Used in ${routinesUsing.length} routines – changes here apply to all of them.`]),

    !limited && !sheet.isNew && h('div.mt', h(Button, {
      kind: 'danger', block: true,
      onClick: () => confirm({
        title: `Delete “${d.name}”?`,
        message: 'It will be removed from all routines. Your past workouts keep everything you logged.',
        confirmText: 'Delete exercise', destructive: true,
        onConfirm: () => {
          const backup = deepClone(data.exercises.find((e) => e.id === d.id) || d);
          const usedIn = deepClone(data.routines.filter((r) => r.items.some((i) => i.exerciseId === d.id)));
          deleteExercise(d.id); closeSheet();
          if (location.hash.includes(d.id)) window.history.back();
          toast('Exercise deleted', 5000, { text: 'Undo', onClick: () => { saveExercise(backup); usedIn.forEach(saveRoutine); } });
        },
      }),
    }, [icon('trash', 18), 'Delete exercise'])),
  ]);
}

// Fields a routine can override (null = use the library value).
const ROUTINE_KEYS = ['sets', 'warmupSets', 'dropSets', 'repMin', 'repMax', 'rest', 'weightStep', 'rirTarget', 'type', 'loadMode', 'unilateral', 'progression'];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Differences between the edited draft and the library exercise, as routine overrides. */
function routineOverrides(ex, d) {
  const out = { notes: d.notes || '' };
  for (const k of ROUTINE_KEYS) {
    if (k === 'progression') {
      const base = ex.progression || {};
      const diff = {};
      for (const [pk, pv] of Object.entries(d.progression || {})) if (!same(pv, base[pk])) diff[pk] = pv;
      out.progression = Object.keys(diff).length ? diff : null;
    } else if (k === 'unilateral') {
      out.unilateral = !!d.unilateral === !!ex.unilateral ? null : !!d.unilateral;
    } else {
      out[k] = same(d[k], ex[k]) ? null : d[k];
    }
  }
  return out;
}

function progressionFooter(d, s) {
  const step = d.progression.step || s.defaultProgressionStep || defaultProgressionStep(s.unit);
  if (d.type === 'bodyweight') return 'When you reach the target, you’ll be told to make it harder (add weight or use a harder variation).';
  const verb = d.type === 'assisted' ? `use ${step} ${s.unit} less assistance` : `add ${step} ${s.unit}`;
  if (d.progression.rule === 'descending') {
    const t = [...Array(Math.max(1, d.sets))].map((_, i) => Math.max(d.repMin, d.repMax - i)).join(', ');
    return `Set 1 must reach ${d.repMax} reps and each next set may drop by one (${t}) at the same weight – then the app suggests you ${verb}. Warm-ups and drop sets don’t count.`;
  }
  if (d.progression.rule === 'per_set') return `When every set reaches its own goal above at one weight, the app suggests you ${verb}. Warm-ups and drop sets don’t count.`;
  if (d.progression.rule === 'avg') return `When your average reps reach the target at one weight, the app suggests you ${verb}.`;
  if (d.progression.rule === 'custom') return `When every set reaches the reps (and RIR) above at one weight, the app suggests you ${verb}.`;
  return `When you hit ${d.repMax} reps on every working set at the same weight, the app suggests you ${verb}.`;
}

export function select(options, value, onChange) {
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  return h('select.select', { onchange: (e) => onChange(e.target.value) },
    opts.map((o) => h('option', { value: String(o.value), selected: String(o.value) === String(value) }, o.label)));
}

/** Reads a picked photo and shrinks it to a small JPEG thumbnail. */
export function pickImage(e, done) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const max = 320;
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    done(c.toDataURL('image/jpeg', 0.82));
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast("Couldn't read that photo"); };
  img.src = url;
}
