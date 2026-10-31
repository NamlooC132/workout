// History tab: past workouts (view / edit / delete) and the per-exercise progress screen.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, confirm, toast, history, exercisesById, doneWorkouts, saveWorkout, deleteWorkout, cached } from '../store.js';
import { Page, Section, Row, Empty, Button, IconButton, Thumb, Segmented, NumberField, WeightField, LineChart, nav, fmtW, fmtDate, fmtDateTime, relDay } from './components.js';
import { setsSummary } from './workout.js';
import { select } from './exercises.js';
import { fmtDuration, fmtNum, deepClone } from '../logic/util.js';
import { displayWeight } from '../logic/units.js';
import { workoutVolume } from '../logic/volume.js';
import { prsInWorkout, personalRecords, exerciseSeries, isStalled, progressionHistory, tonnage, bodyweightAt } from '../logic/records.js';
import { muscleName, contributions, SET_TYPES } from '../logic/muscles.js';
import { newSet } from '../logic/model.js';
import { makeEntry } from '../workoutService.js';

function workoutTonnage(w) {
  const bw = bodyweightAt(data.measurements, w.startedAt);
  return w.entries.reduce((t, e) => t + e.sets.filter((s) => s.done && s.type !== 'warmup').reduce((a, s) => a + tonnage(s, e.snapshot, bw), 0), 0);
}

const workSetCount = (w) => w.entries.reduce((t, e) => t + e.sets.filter((s) => s.done && s.type !== 'warmup').length, 0);

// ---------- History list ----------
export function HistoryScreen() {
  const list = doneWorkouts();
  const hist = history();
  const groups = [];
  for (const w of list) {
    const key = new Date(w.startedAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) groups.push((g = { key, items: [] }));
    g.items.push(w);
  }
  return h(Page, {
    title: 'History',
    actions: [h(IconButton, { name: 'chart', label: 'Exercise progress', onClick: () => nav('/library') })],
  }, [
    list.length === 0 && h(Empty, { iconName: 'history', title: 'No workouts yet', text: 'Finished workouts show up here.' }),
    ...groups.map((g) => h(Section, { key: g.key, title: `${g.key} · ${g.items.length} workout${g.items.length === 1 ? '' : 's'}` },
      g.items.map((w) => {
        const prs = cachedPrs(w, hist);
        return h(Row, {
          key: w.id,
          title: [w.routineName, w.deload && h('span.tag.blue', { style: { marginLeft: '6px' } }, 'DELOAD'), prs > 0 && h('span.pr', { style: { marginLeft: '6px' } }, `🏆${prs > 1 ? '×' + prs : ''}`)],
          subtitle: [
            h('div', fmtDateTime(w.startedAt)),
            h('div', `${fmtDuration(w.endedAt - w.startedAt)} · ${workSetCount(w)} sets · ${fmtNum(displayWeight(workoutTonnage(w), data.settings.unit), 0)} ${data.settings.unit}`),
          ],
          chevron: true,
          onClick: () => nav('/workout/' + w.id),
        });
      }))),
  ]);
}

function cachedPrs(w, hist) {
  return cached('prs_' + w.id, () => prsInWorkout(w, hist, data.measurements).length);
}

// ---------- Workout detail (view + edit) ----------
export function WorkoutDetailScreen({ id }) {
  const w = data.workouts.find((x) => x.id === id && x.status === 'done');
  if (!w) return h(Page, { title: 'Workout', backTo: '/history' }, h(Empty, { title: 'Workout not found' }));
  const st = (ui.tabState['wd_' + id] = ui.tabState['wd_' + id] || { edit: false });
  const edit = st.edit;
  const vol = workoutVolume(w, data.settings);
  const prs = prsInWorkout(w, history(), data.measurements);
  const save = () => saveWorkout(w);

  const del = () => confirm({
    title: 'Delete this workout?', message: `${w.routineName} · ${fmtDateTime(w.startedAt)}`, confirmText: 'Delete Workout', destructive: true,
    onConfirm: () => {
      const copy = deepClone(w);
      deleteWorkout(w.id);
      nav('/history');
      toast('Workout deleted', 6000, { text: 'Undo', onClick: () => saveWorkout(copy) });
    },
  });

  return h(Page, {
    title: w.routineName, backTo: '/history', large: false,
    actions: [h('button.link-btn.strong', { onclick: () => { document.activeElement?.blur?.(); st.edit = !edit; update(); } }, edit ? 'Done' : 'Edit')],
  }, [
    edit
      ? h(Section, { title: 'Workout' }, [
        h(Row, { title: 'Name', right: h('input.text-field', { style: { textAlign: 'right', maxWidth: '60%' }, value: w.routineName, oninput: (e) => { w.routineName = e.target.value; save(); } }) }),
        h(Row, { title: 'Started', right: dtInput(w.startedAt, (v) => { const len = w.endedAt - w.startedAt; w.startedAt = v; w.endedAt = v + len; save(); }) }),
        h(Row, { title: 'Duration (min)', right: h(NumberField, { value: Math.round((w.endedAt - w.startedAt) / 60000), decimals: false, class: 'w-80', onChange: (v) => { w.endedAt = w.startedAt + (v || 0) * 60000; save(); } }) }),
        h('div.field-card', h('textarea.text-field', { rows: 2, placeholder: 'Workout notes', value: w.notes || '', oninput: (e) => { w.notes = e.target.value; save(); } })),
      ])
      : h('div.stat-grid', { style: { margin: '8px 0 4px' } }, [
        stat('Date', fmtDate(w.startedAt, { day: 'numeric', month: 'short' }), new Date(w.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })),
        stat('Duration', fmtDuration(w.endedAt - w.startedAt)),
        stat('Sets', workSetCount(w)),
        stat('Volume', fmtNum(displayWeight(workoutTonnage(w), data.settings.unit), 0), data.settings.unit),
      ]),
    !edit && w.notes && h('div.callout.mt', [icon('note', 18), w.notes]),
    !edit && w.deload && h('div.callout.blue.mt', [icon('info', 18), 'Deload workout – not used for weight suggestions.']),
    !edit && prs.length > 0 && h(Section, { title: 'Personal records' }, prs.map((p, i) => h(Row, { key: i, left: h('span.pr', icon('trophy', 20)), title: p.name, subtitle: p.kind }))),
    !edit && Object.keys(vol).length > 0 && h(Section, { title: 'Sets per muscle' }, h('div.pad.chips', Object.entries(vol).sort((a, b) => b[1].total - a[1].total).map(([m, v]) => h('span.chip.chip-static', { key: m }, `${muscleName(m, data.settings)} ${fmtNum(v.total, 1)}`)))),
    ...w.entries.map((e) => EntryBlock({ w, e, edit, save })),
    edit && h(Button, { kind: 'secondary', block: true, onClick: () => openSheet({ type: 'picker', multi: true, title: 'Add to workout', onPick: (exs) => {
      for (const ex of exs) {
        const entry = makeEntry(ex, null, w);
        entry.sets.forEach((s) => { s.done = true; });
        entry.lastSummary = null;
        entry.progression = { status: 'none' };
        w.entries.push(entry);
      }
      save();
    } }) }, [icon('plus', 18), 'Add exercise']),
    h('div.mt', h(Button, { kind: 'danger', block: true, onClick: del }, [icon('trash', 18), 'Delete Workout'])),
  ]);
}

function stat(k, v, s) {
  return h('div.stat', [h('div.k', k), h('div.v', { style: { fontSize: '19px' } }, String(v)), s && h('div.s', s)]);
}

function dtInput(ms, onChange) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return h('input.select', { type: 'datetime-local', value: val, onchange: (e) => { const t = new Date(e.target.value).getTime(); if (Number.isFinite(t)) onChange(t); } });
}

function EntryBlock({ w, e, edit, save }) {
  const ex = exercisesById().get(e.exerciseId);
  const snap = e.snapshot;
  let n = 0;
  return h(Section, {
    key: e.id,
    title: h('span.hstack', { style: { gap: '8px', textTransform: 'none', letterSpacing: 0, fontSize: '16px', color: 'var(--text)', fontWeight: 700 } }, [h(Thumb, { image: ex?.image, name: snap.name, size: 28 }), snap.name]),
    right: !edit && e.exerciseId && ex ? h('button.link-btn', { style: { minHeight: 'auto', padding: 0, textTransform: 'none', fontSize: '14px', letterSpacing: 0 }, onclick: () => nav('/exercise/' + e.exerciseId) }, 'Progress ›') : null,
  }, [
    ...e.sets.map((s, i) => {
      const warm = s.type === 'warmup';
      if (!warm) n++;
      const t = SET_TYPES.find((x) => x.key === s.type);
      const label = warm ? 'W' : `${n}${t?.short || ''}`;
      if (!edit) {
        const reps = snap.unilateral && (s.repsL !== null || s.repsR !== null) ? `${s.repsL ?? 0} / ${s.repsR ?? 0}` : `${s.reps ?? 0}`;
        const wt = snap.type === 'bodyweight' ? '' : `${snap.type === 'weighted_bw' ? '+' : snap.type === 'assisted' ? '−' : ''}${fmtW(s.kg ?? 0)} × `;
        return h(Row, {
          key: s.id,
          left: h('span', { class: cx('set-num', s.type), style: { width: '30px', height: '30px' } }, label),
          title: h('span.mono', `${wt}${reps}${snap.type === 'bodyweight' ? ' reps' : ''}`),
          subtitle: s.note || null,
          right: s.rir !== null && s.rir !== undefined ? h('span.tag', `RIR ${s.rir === 5 ? '5+' : s.rir}`) : null,
        });
      }
      return h('div.row', { key: s.id, style: { gap: '6px' } }, [
        h('span', { class: cx('set-num', s.type), style: { width: '30px' } }, label),
        snap.type !== 'bodyweight' && h('div', { style: { flex: 1.3 } }, h(WeightField, { kg: s.kg, onChange: (v) => { s.kg = v; save(); } })),
        snap.unilateral
          ? [h('div.grow', h(NumberField, { value: s.repsL, decimals: false, placeholder: 'L', onChange: (v) => { s.repsL = v; s.reps = Math.min(s.repsL ?? 99, s.repsR ?? 99); save(); } })),
            h('div.grow', h(NumberField, { value: s.repsR, decimals: false, placeholder: 'R', onChange: (v) => { s.repsR = v; s.reps = Math.min(s.repsL ?? 99, s.repsR ?? 99); save(); } }))]
          : h('div.grow', h(NumberField, { value: s.reps, decimals: false, placeholder: 'reps', onChange: (v) => { s.reps = v; save(); } })),
        select(SET_TYPES.map((t) => ({ value: t.key, label: t.short || 'Set' })), s.type, (v) => { s.type = v; save(); }),
        h(IconButton, { name: 'trash', label: 'Delete set', class: 'danger', onClick: () => { e.sets.splice(i, 1); if (!e.sets.length) w.entries = w.entries.filter((x) => x !== e); save(); } }),
      ]);
    }),
    edit && h('div.row', [
      h('button.link-btn', { onclick: () => { const last = e.sets[e.sets.length - 1]; e.sets.push(newSet({ kg: last?.kg ?? null, reps: last?.reps ?? null, done: true, doneAt: w.startedAt })); save(); } }, '+ Add set'),
      h('span.grow'),
      h('button.link-btn.danger', { onclick: () => { w.entries = w.entries.filter((x) => x !== e); save(); } }, 'Remove exercise'),
    ]),
  ]);
}

// ---------- Exercise progress ----------
export function ExerciseScreen({ id }) {
  const ex = data.exercises.find((e) => e.id === id);
  const list = history().get(id) || [];
  const name = ex ? ex.name : list[0]?.entry.snapshot.name || 'Exercise';
  const st = (ui.tabState['ex_' + id] = ui.tabState['ex_' + id] || { metric: 'top' });
  const rec = personalRecords(list, data.measurements);
  const series = exerciseSeries(list, data.measurements);
  const stalled = isStalled(list, data.measurements);
  const progHist = progressionHistory(list);
  const type = ex?.type || list[0]?.entry.snapshot.type || 'weighted';
  const bw = type === 'bodyweight';
  const metrics = [
    !bw && { value: 'top', label: type === 'assisted' ? 'Assist' : 'Weight' },
    { value: 'e1rm', label: 'e1RM' },
    { value: 'reps', label: 'Reps' },
    { value: 'volume', label: 'Volume' },
  ].filter(Boolean);
  if (!metrics.some((m) => m.value === st.metric)) st.metric = metrics[0].value;
  const unit = data.settings.unit;
  const pts = series.map((s) => {
    const y = st.metric === 'top' ? displayWeight(s.topKg ?? 0, unit)
      : st.metric === 'e1rm' ? displayWeight(s.e1rm, unit)
        : st.metric === 'reps' ? s.totalReps : displayWeight(s.volume, unit);
    return { x: s.date, y };
  }).filter((p) => st.metric !== 'e1rm' || p.y > 0);
  const recDates = new Set(Object.values(rec).map((r) => r.workoutId));

  // Comparison: latest vs previous vs ~4 weeks ago
  const latest = series[series.length - 1];
  const prev = series[series.length - 2];
  const monthAgo = latest && series.slice().reverse().find((s) => s.date <= latest.date - 26 * 86400000);
  const pct = (a, b) => (a && b ? `${a >= b ? '+' : ''}${fmtNum(((a - b) / b) * 100, 1)} %` : '–');
  const metricOf = (s) => (s ? (s.e1rm > 0 ? s.e1rm : s.bestReps) : null);

  return h(Page, {
    title: name, backTo: '/library', large: false,
    actions: ex ? [h('button.link-btn', { onclick: () => openSheet({ type: 'exerciseEditor', exerciseId: ex.id }) }, 'Edit')] : [],
  }, [
    h('div.hstack', { style: { gap: '14px', margin: '6px 0 4px' } }, [
      h(Thumb, { image: ex?.image, name, size: 64 }),
      h('div.grow', [
        h('div', { style: { fontSize: '22px', fontWeight: 800 } }, name),
        ex && h('div.muted.small', contributions(ex).map((c) => `${muscleName(c.key, data.settings)}${c.value < 1 ? ` ${c.value * 100}%` : ''}`).join(' · ') || 'No muscles set'),
        ex && h('div.muted.small', `${ex.sets} × ${ex.repMin}–${ex.repMax} · ${list.length} sessions`),
      ]),
    ]),
    ex?.notes && h('div.callout.mt', [icon('info', 18), ex.notes]),
    stalled && h('div.callout.yellow.mt', [icon('info', 18), h('div', [h('b', 'Possibly stalled. '), 'No improvement in your last 3 sessions. Consider a deload, a rep-range change or swapping the exercise.'])]),

    h(Section, { title: 'Personal records' }, list.length === 0
      ? h('div.pad.muted', 'Finish a workout with this exercise to set your first records.')
      : h('div.pad', h('div.stat-grid', [
        !bw && rec.bestWeight && recStat(type === 'assisted' ? 'Least assist' : 'Heaviest', fmtW(rec.bestWeight.value), `× ${rec.bestWeight.detail.reps} · ${fmtDate(rec.bestWeight.date, { day: 'numeric', month: 'short' })}`),
        rec.bestE1rm && recStat('Best e1RM', fmtW(rec.bestE1rm.value), fmtDate(rec.bestE1rm.date, { day: 'numeric', month: 'short' })),
        rec.bestReps && recStat('Most reps', `${rec.bestReps.value}`, bw ? fmtDate(rec.bestReps.date, { day: 'numeric', month: 'short' }) : `@ ${fmtW(rec.bestReps.detail.kg ?? 0)}`),
        rec.bestSetVolume && recStat('Best set', fmtW(rec.bestSetVolume.value), 'weight × reps'),
        rec.bestSessionVolume && recStat('Best session', fmtW(rec.bestSessionVolume.value), 'total volume'),
      ]))),

    h(Section, { title: 'Progress' }, [
      h('div', { style: { padding: '8px 12px 0' } }, h(Segmented, { small: true, value: st.metric, options: metrics, onChange: (v) => { st.metric = v; ui.tabState['chartSel_ex' + id] = undefined; update(); } })),
      h(LineChart, { id: 'ex' + id, points: pts, formatY: (v) => fmtNum(v, st.metric === 'reps' ? 0 : 1) }),
    ]),

    series.length >= 2 && h(Section, { title: 'Compared with' }, [
      h(Row, { title: 'Previous session', subtitle: fmtDate(prev.date), right: h('b', pct(metricOf(latest), metricOf(prev))) }),
      monthAgo && h(Row, { title: '~4 weeks ago', subtitle: fmtDate(monthAgo.date), right: h('b', pct(metricOf(latest), metricOf(monthAgo))) }),
      h(Row, { title: 'First session', subtitle: fmtDate(series[0].date), right: h('b', pct(metricOf(latest), metricOf(series[0]))) }),
    ]),

    progHist.length > 0 && h(Section, { title: 'Weight increases' }, progHist.map((p, i) => h(Row, { key: i, left: h('span', { style: { color: 'var(--green)' } }, icon('arrowUp', 20)), title: `${fmtW(p.fromKg)} → ${fmtW(p.toKg)}`, subtitle: fmtDate(p.date) }))),

    h(Section, { title: 'Sessions' }, list.length === 0 ? h('div.pad.muted', 'No sessions yet.') : list.map((item) => h(Row, {
      key: item.workout.id + item.entry.id,
      title: [relDay(item.workout.startedAt), recDates.has(item.workout.id) && h('span.pr', { style: { marginLeft: '6px' } }, '🏆 PR')],
      subtitle: [h('div', setsSummary(item.entry.sets.filter((s) => s.done), item.entry.snapshot)), h('div', `${item.workout.routineName} · ${fmtDate(item.workout.startedAt)}`)],
      chevron: true,
      onClick: () => nav('/workout/' + item.workout.id),
    }))),
  ]);
}

function recStat(k, v, s) {
  return h('div.stat', { style: { background: 'var(--yellow-soft)' } }, [h('div.k', ['🏆 ', k]), h('div.v', { style: { fontSize: '19px' } }, v), h('div.s', s)]);
}
