// History tab: past workouts (view / edit / delete) and the per-exercise progress screen.
import { LEVELS } from '../logic/readiness.js';
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, confirm, toast, history, exercisesById, doneWorkouts, saveWorkout, deleteWorkout, cached } from '../store.js';
import { Page, Section, Row, Empty, Button, IconButton, Thumb, Segmented, NumberField, WeightField, LineChart, ExercisePhoto, nav, fmtW, fmtDate, fmtDateTime, relDay } from './components.js';
import { setsSummary } from './workout.js';
import { select } from './exercises.js';
import { fmtDuration, fmtNum, deepClone, plural, addDays } from '../logic/util.js';
import { activityMs } from './activity.js';
import { workoutPhotos, PhotoCarousel, AddPhotoButton } from './photos.js';
import { displayWeight } from '../logic/units.js';
import { workoutVolume, weekRange } from '../logic/volume.js';
import { prsInWorkout, personalRecords, exerciseSeries, isStalled, progressionHistory, tonnage, bodyweightAt } from '../logic/records.js';
import { muscleName, contributions, SET_TYPES } from '../logic/muscles.js';
import { newSet } from '../logic/model.js';
import { makeEntry } from '../workoutService.js';
import { guideFor, photoFor } from '../logic/catalog.js';
import { MuscleMap } from './musclemap.js';
import { HealthBox, RunDetailScreen, runSummary } from './health.js';
import { isRun } from '../logic/health.js';

const DECISIONS = { applied: 'Changes applied', light: 'Light workout', cancelled: 'No changes' };

function workoutTonnage(w) {
  const bw = bodyweightAt(data.measurements, w.startedAt);
  return w.entries.reduce((t, e) => t + e.sets.filter((s) => s.done && s.type !== 'warmup').reduce((a, s) => a + tonnage(s, e.snapshot, bw), 0), 0);
}

const workSetCount = (w) => w.entries.reduce((t, e) => t + e.sets.filter((s) => s.done && s.type !== 'warmup').length, 0);

// ---------- History list ----------
export function HistoryScreen() {
  const workouts = doneWorkouts();
  const acts = (data.activities || []).filter((a) => a.status === 'done');
  const list = [...workouts, ...acts].sort((a, b) => b.startedAt - a.startedAt);
  const hist = history();
  const groups = [];
  const thisYear = new Date().getFullYear();
  const dm = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  for (const w of list) {
    const r = weekRange(w.startedAt, data.settings);
    const key = String(r.from);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      const last = addDays(r.from, 6);
      const yr = (ms) => (new Date(ms).getFullYear() === thisYear ? '' : ` ${new Date(ms).getFullYear()}`);
      groups.push((g = { key, label: `${dm(r.from)}${yr(r.from)} – ${dm(last)}${yr(last)}`, items: [] }));
    }
    g.items.push(w);
  }
  const countText = (g) => {
    const a = g.items.filter((x) => x.entries === undefined).length;
    const wk = g.items.length - a;
    return [wk > 0 && plural(wk, 'workout'), a > 0 && plural(a, 'activity', 'activities')].filter(Boolean).join(' · ');
  };
  return h(Page, {
    title: 'History',
    actions: [h(IconButton, { name: 'chart', label: 'Exercise progress', onClick: () => nav('/library') })],
  }, [
    list.length === 0 && h(Empty, { iconName: 'history', title: 'No workouts yet', text: 'Finished workouts show up here.' }),
    ...groups.map((g) => h(Section, { key: g.key, title: `${g.label} · ${countText(g)}` },
      g.items.map((w) => {
        if (w.entries === undefined) return h(Row, {
          key: w.id, left: h('span.run-ico', icon('timer', 22)),
          title: w.name, subtitle: [h('div', fmtDateTime(w.startedAt)), h('div', [fmtDuration(Math.max(activityMs(w), 60000)), w.notes ? ` · ${w.notes}` : ''].join(''))],
          chevron: true, onClick: () => nav('/activity/' + w.id),
        });
        if (isRun(w)) return h(Row, {
          key: w.id, left: h('span.run-ico', icon('run', 22)),
          title: w.routineName || 'Run', subtitle: [h('div', fmtDateTime(w.startedAt)), h('div', runSummary(w))],
          chevron: true, onClick: () => nav('/workout/' + w.id),
        });
        const prs = cachedPrs(w, hist);
        const firstPhoto = workoutPhotos(w.id)[0];
        return h(Row, {
          key: w.id,
          left: firstPhoto ? h('img.hist-photo', { src: firstPhoto.thumb, alt: '' }) : null,
          title: [w.routineName, w.deload && h('span.tag.blue', { style: { marginLeft: '6px' } }, 'DELOAD'), prs > 0 && h('span.pr', { style: { marginLeft: '6px' } }, `🏆${prs > 1 ? '×' + prs : ''}`)],
          subtitle: [
            h('div', fmtDateTime(w.startedAt)),
            h('div', [`${fmtDuration(w.endedAt - w.startedAt)} · ${plural(workSetCount(w), 'set')} · ${fmtNum(displayWeight(workoutTonnage(w), data.settings.unit), 0)} ${data.settings.unit}`, w.health?.hr ? ` · ♥ ${w.health.hr}` : '', w.health?.kcal ? ` · ${w.health.kcal} kcal` : '']),
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
  if (isRun(w)) return RunDetailScreen({ w });
  const st = (ui.tabState['wd_' + id] = ui.tabState['wd_' + id] || { edit: false });
  const edit = st.edit;
  const vol = workoutVolume(w, data.settings);
  const prs = prsInWorkout(w, history(), data.measurements);
  const save = () => saveWorkout(w);

  const del = () => confirm({
    title: 'Delete this workout?', message: `${w.routineName} · ${fmtDateTime(w.startedAt)}`, confirmText: 'Delete workout', destructive: true,
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
    !edit && PhotoCarousel({ workoutId: w.id }),
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
    h('div', { style: { margin: '8px 0 4px' } }, AddPhotoButton({ workoutId: w.id })),
    !edit && (w.health?.hr || w.health?.kcal) && h('div.stat-grid.two', { style: { margin: '0 0 4px' } }, [
      stat('Avg heart rate', w.health.hr ? `${w.health.hr}` : '–', 'bpm'),
      stat('Calories', w.health.kcal ? `${w.health.kcal}` : '–', 'kcal'),
    ]),
    (edit || !(w.health?.hr || w.health?.kcal)) && h(Section, { title: 'Heart rate & calories' }, h('div.pad', HealthBox({ health: (w.health = w.health || { hr: null, kcal: null }), from: w.startedAt, to: w.endedAt, onChange: save }))),
    !edit && w.notes && h('div.callout.mt', [icon('note', 18), w.notes]),
    !edit && w.deload && h('div.callout.blue.mt', [icon('info', 18), 'Deload workout – not used for weight suggestions.']),
    !edit && w.readiness && !w.readiness.skipped && h('div.callout.mt.rd-hist', [
      h('span.rd-dot', { class: `tone-${LEVELS[w.readiness.level]?.tone || 'green'}` }, fmtNum(w.readiness.avg, 1)),
      h('div', [
        h('div', [h('span', 'Readiness'), ' · ', h('span', LEVELS[w.readiness.level]?.title || '')]),
        h('div.small.muted', [h('span', `Sleep ${w.readiness.sleep}`), ' · ', h('span', `Energy ${w.readiness.energy}`), ' · ', h('span', `Soreness ${w.readiness.soreness}`),
          w.readiness.decision && DECISIONS[w.readiness.decision] && [' · ', h('span', DECISIONS[w.readiness.decision])]]),
      ]),
    ]),
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
    h('div.mt', h(Button, { kind: 'danger', block: true, onClick: del }, [icon('trash', 18), 'Delete workout'])),
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
    title: h('span.hstack', { style: { gap: '8px', textTransform: 'none', letterSpacing: 0, fontSize: '16px', color: 'var(--text)', fontWeight: 700 } }, [h(Thumb, { image: ex?.image, name: snap.name, muscles: ex?.muscles || snap.muscles, size: 28 }), snap.name]),
    right: !edit && e.exerciseId && ex ? h('button.link-btn', { style: { minHeight: 'auto', padding: 0, textTransform: 'none', fontSize: '14px', letterSpacing: 0 }, onclick: () => nav('/exercise/' + e.exerciseId) }, 'Progress ›') : null,
  }, [
    ...e.sets.map((s, i) => {
      const warm = s.type === 'warmup';
      if (!warm) n++;
      const t = SET_TYPES.find((x) => x.key === s.type);
      const label = warm ? 'W' : `${n}${t?.short || ''}`;
      if (!edit) {
        const minis = (s.mini || []).filter((m) => m.done && m.reps).map((m) => ` +${m.reps}`).join('');
        const reps = (snap.unilateral && (s.repsL !== null || s.repsR !== null) ? `${s.repsL ?? 0} / ${s.repsR ?? 0}` : `${s.reps ?? 0}`) + minis;
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
    { value: 'e1rm', label: 'Est. 1RM' },
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
      h(Thumb, { image: ex?.image, name, muscles: ex?.muscles || list[0]?.entry.snapshot.muscles, size: 64 }),
      h('div.grow', [
        h('div', { style: { fontSize: '22px', fontWeight: 800 } }, name),
        ex && h('div.muted.small', contributions(ex).map((c) => `${muscleName(c.key, data.settings)}${c.value < 1 ? ` ${c.value * 100}%` : ''}`).join(' · ') || 'No muscles set'),
        ex && h('div.muted.small', `${ex.sets} × ${ex.repMin}–${ex.repMax} · ${plural(list.length, 'session')}`),
      ]),
    ]),
    h('div.mt', ExercisePhoto({ name, photo: photoFor(name) })),
    h('button.btn.btn-secondary.btn-sm', { onclick: () => openSheet({ type: 'howTo', name, exerciseId: ex?.id }), style: { marginTop: '8px' } }, [icon('info', 16), 'How to do this exercise']),
    ex?.notes && h('div.callout.mt', [icon('info', 18), ex.notes]),
    series.length >= 2 && (() => {
      const base = monthAgo || series[0];
      const a = metricOf(latest), b = metricOf(base);
      const ch = a && b ? (a - b) / b : 0;
      const since = monthAgo ? 'in the last 4 weeks' : `since ${fmtDate(base.date, { day: 'numeric', month: 'short' })}`;
      const what = latest.e1rm > 0 ? 'estimated 1RM' : 'best reps';
      return h('section.insight.mt', { class: ch > 0.01 ? 'good' : ch < -0.02 ? 'warn' : '' }, [
        h('div.iq', 'Am I getting stronger at this?'),
        h('div.it', ch > 0.01 ? `Yes – up ${fmtNum(ch * 100, 1)} %` : ch < -0.02 ? `Down ${fmtNum(-ch * 100, 1)} %` : 'Holding steady'),
        h('div.is', `Your ${what} ${since}.${stalled ? ' No gain in the last 3 sessions – consider a deload or new rep range.' : ''}`),
      ]);
    })(),
    (ex || list[0]) && Object.keys((ex?.muscles || list[0]?.entry.snapshot.muscles) || {}).length > 0 && h(Section, { title: 'Muscles worked', right: h('span.small.muted', { style: { textTransform: 'none', letterSpacing: 0 } }, 'Tap to zoom') }, h('div.mm-big', [
      h('button.mm-zoom', { onclick: () => openSheet({ type: 'muscleView', name, muscles: ex?.muscles || list[0].entry.snapshot.muscles }), 'aria-label': 'Zoom muscle picture' }, MuscleMap({ muscles: ex?.muscles || list[0].entry.snapshot.muscles, size: 230, labels: true })),
      h('div.mm-legend', contributions({ muscles: ex?.muscles || list[0].entry.snapshot.muscles }).map((c) => h('div.mm-row', { key: c.key }, [
        h('i', { class: c.value >= 1 ? 'main' : 'help' }),
        h('span.grow', muscleName(c.key, data.settings)),
        h('span.muted', c.value >= 1 ? 'Main' : `Helper ${Math.round(c.value * 100)}%`),
      ]))),
    ])),
    stalled && series.length < 2 && h('div.callout.yellow.mt', [icon('info', 18), h('div', [h('b', 'Possibly stalled. '), 'No improvement in your last 3 sessions. Consider a deload, a rep-range change or swapping the exercise.'])]),

    h(Section, { title: 'Personal records', footer: rec.bestE1rm ? 'Est. 1RM = about the most you could lift for one rep, worked out from your sets.' : null }, list.length === 0
      ? h('div.pad.muted', 'Finish a workout with this exercise to set your first records.')
      : h('div.pad', h('div.stat-grid', [
        !bw && rec.bestWeight && recStat(type === 'assisted' ? 'Least assist' : 'Heaviest', fmtW(rec.bestWeight.value), `× ${rec.bestWeight.detail.reps} · ${fmtDate(rec.bestWeight.date, { day: 'numeric', month: 'short' })}`),
        rec.bestE1rm && recStat('Best est. 1RM', fmtW(rec.bestE1rm.value), fmtDate(rec.bestE1rm.date, { day: 'numeric', month: 'short' })),
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
