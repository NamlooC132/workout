// Yoga tab (shown when Settings → Show Yoga is on): log a session, pose journal, stats & progress.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, closeSheet, confirm, toast, cached,
  saveYogaSession, deleteYogaSession, saveYogaPose, deleteYogaPose, saveYogaEntry, deleteYogaEntry } from '../store.js';
import { Page, Section, Row, Empty, Button, IconButton, Segmented, Sheet, NumberField, TextField, Chip, Stepper, LineChart, BarChart, nav, fmtDate, relDay } from './components.js';
import { dateKey, fmtNum } from '../logic/util.js';
import {
  YOGA_STYLES, PRESET_POSES, styleName, dayToMs, newSession, newPose, newPoseEntry,
  yogaStreaks, yogaTotals, weeklyMinutes, styleBreakdown, feelByWeek, averageFeel,
  entriesFor, poseSummary, entryHighlight, poseSeries, fmtHold, fmtMinutes,
} from '../logic/yoga.js';

const DIFFICULTY = ['Very easy', 'Easy', 'Moderate', 'Hard', 'Very hard'];
const FEEL = ['Bad', 'Meh', 'Fine', 'Good', 'Great'];
const QUICK_MINUTES = [15, 20, 30, 45, 60, 75, 90];

const sessionsNewestFirst = () => cached('yogaSessionsSorted', () => data.yogaSessions.slice().sort((a, b) => b.date - a.date || (b.createdAt || 0) - (a.createdAt || 0)));
const posesSorted = () => cached('yogaPosesSorted', () => data.yogaPoses.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0)));

function state() {
  return (ui.tabState.yoga = ui.tabState.yoga || { seg: 'log', draft: null, editId: null, statPose: null });
}

/** A fresh session draft that remembers your usual style and length. */
function freshDraft() {
  const last = sessionsNewestFirst()[0];
  return newSession({ style: last?.style || 'vinyasa', minutes: last?.minutes || 30 });
}

export function YogaScreen({ seg }) {
  const st = state();
  if (seg && st.routeSeg !== seg) { st.seg = seg; st.routeSeg = seg; }
  return h(Page, {
    title: 'Yoga',
    actions: st.seg === 'poses' ? [h(IconButton, { name: 'plus', label: 'Add pose', onClick: () => openSheet({ type: 'yogaAddPose' }) })] : [],
  }, [
    h(Segmented, {
      value: st.seg, onChange: (v) => { st.seg = v; update(); },
      options: [{ value: 'log', label: 'Log' }, { value: 'poses', label: 'Poses' }, { value: 'stats', label: 'Stats' }],
    }),
    st.seg === 'log' && LogView(st),
    st.seg === 'poses' && PosesView(),
    st.seg === 'stats' && StatsView(st),
  ]);
}

// ---------- 1. Log a session ----------
function Rating({ value, onChange, label }) {
  return h('div.rating', { role: 'radiogroup', 'aria-label': label }, [1, 2, 3, 4, 5].map((n) =>
    h('button', { key: n, class: cx('rate', value === n && 'on'), 'aria-label': `${label} ${n}`, 'aria-pressed': value === n ? 'true' : 'false', onclick: () => onChange(value === n ? null : n) }, String(n))));
}

function LogView(st) {
  if (!st.draft) st.draft = freshDraft();
  const d = st.draft;
  const editing = !!st.editId;
  const set = (patch) => { Object.assign(d, patch); update(); };
  const save = () => {
    const rec = { ...d, minutes: Math.max(1, Math.round(d.minutes || 0)), notes: (d.notes || '').trim() };
    saveYogaSession(rec);
    st.draft = null; st.editId = null;
    if (editing) { toast('Session updated'); return; }
    const { current } = yogaStreaks(data.yogaSessions);
    toast(current > 1 ? `Session saved 🧘 · ${current}-day streak 🔥` : 'Session saved 🧘');
  };
  const recent = sessionsNewestFirst().slice(0, 8);

  return h('div', [
    editing && h('div.callout.blue', { style: { marginBottom: '10px' } }, [icon('edit', 18), h('div.grow', 'Editing a session'),
      h('button.link-btn', { onclick: () => { st.draft = null; st.editId = null; update(); } }, 'Cancel')]),

    h(Section, { title: 'Style' }, h('div.pad.chips', YOGA_STYLES.map((s) => h(Chip, { key: s.key, active: d.style === s.key, onClick: () => set({ style: s.key }) }, s.name)))),

    h(Section, { title: 'Duration' }, [
      h(Row, { title: 'Minutes', right: h(Stepper, { value: d.minutes, step: 5, min: 5, max: 300, format: (v) => `${v} min`, onChange: (v) => set({ minutes: v }) }) }),
      h('div.pad.chips', { style: { paddingTop: 0 } }, QUICK_MINUTES.map((m) => h(Chip, { key: m, active: d.minutes === m, onClick: () => set({ minutes: m }) }, `${m}`))),
    ]),

    h(Section, {}, [
      h(Row, { title: 'Difficulty', right: h('span.muted.small', d.difficulty ? DIFFICULTY[d.difficulty - 1] : 'Optional') },
        h(Rating, { value: d.difficulty, label: 'Difficulty', onChange: (v) => set({ difficulty: v }) })),
      h(Row, { title: 'How I felt afterwards', right: h('span.muted.small', d.feel ? FEEL[d.feel - 1] : 'Optional') },
        h(Rating, { value: d.feel, label: 'How I felt', onChange: (v) => set({ feel: v }) })),
      h(Row, { title: 'Date', right: h('input.select', { type: 'date', value: dateKey(d.date), max: dateKey(Date.now()), onchange: (e) => { if (e.target.value) set({ date: dayToMs(e.target.value) }); } }) }),
    ]),

    h(Section, { title: 'Notes' }, h('div.field-card', h(TextField, { value: d.notes, multiline: true, placeholder: 'Optional – e.g. hips felt open today', onChange: (v) => { d.notes = v; } }))),

    h('div.vstack', { style: { gap: '10px', margin: '4px 0 22px' } }, [
      h(Button, { block: true, onClick: save }, [icon('check', 20), editing ? 'Save changes' : 'Save session']),
      editing && h(Button, { block: true, kind: 'secondary', class: 'danger-text', onClick: () => confirm({
        title: 'Delete this session?', confirmText: 'Delete', destructive: true,
        onConfirm: () => { deleteYogaSession(st.editId); st.draft = null; st.editId = null; toast('Session deleted'); },
      }) }, 'Delete session'),
    ]),

    recent.length > 0 && h(Section, { title: 'Recent sessions', footer: 'Tap a session to change or delete it.' }, recent.map((s) => h(Row, {
      key: s.id, left: h('span.yoga-dot', icon('yoga', 20)),
      title: `${styleName(s.style)} · ${fmtMinutes(s.minutes)}`,
      subtitle: [relDay(s.date), s.feel ? `Felt ${FEEL[s.feel - 1].toLowerCase()}` : null, s.difficulty ? DIFFICULTY[s.difficulty - 1] : null].filter(Boolean).join(' · '),
      chevron: true,
      onClick: () => { st.draft = { ...s }; st.editId = s.id; update(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    }))),
  ]);
}

// ---------- 2. Pose journal ----------
function poseLine(p) {
  const sm = poseSummary(p, data.yogaEntries);
  if (p.kind === 'achieve') return sm.achieved ? `Achieved 🎉 · first time ${fmtDate(sm.firstAchieved)}` : sm.count ? `Not yet · ${sm.count} tries` : 'Not yet';
  return sm.best ? `Best ${fmtHold(sm.best)} · ${sm.count} result${sm.count === 1 ? '' : 's'}` : 'No results yet';
}

function PosesView() {
  const poses = posesSorted();
  if (!poses.length) {
    return h(Empty, {
      iconName: 'yoga', title: 'Track your poses',
      text: 'Pick poses to follow: how long you hold them, or the day you nail one for the first time.',
      action: h(Button, { onClick: () => openSheet({ type: 'yogaAddPose' }) }, [icon('plus', 20), 'Add pose']),
    });
  }
  return h('div', [
    h(Section, { footer: 'Tap a pose to add a result and see your progress.' }, poses.map((p) => h(Row, {
      key: p.id,
      left: h('span', { class: cx('yoga-dot', p.kind === 'achieve' && 'achieve') }, icon(p.kind === 'achieve' ? 'trophy' : 'timer', 20)),
      title: p.name, subtitle: poseLine(p), chevron: true,
      onClick: () => nav('/yoga/pose/' + p.id),
    }))),
    h(Button, { block: true, kind: 'secondary', onClick: () => openSheet({ type: 'yogaAddPose' }) }, [icon('plus', 20), 'Add pose']),
  ]);
}

// sheet: { type: 'yogaAddPose' }
export function YogaAddPoseSheet(sheet) {
  if (!sheet.init) { sheet.init = true; sheet.name = ''; sheet.kind = 'hold'; }
  const tracked = new Set(data.yogaPoses.map((p) => p.preset).filter(Boolean));
  const trackedNames = new Set(data.yogaPoses.map((p) => p.name.trim().toLowerCase()));
  const presets = PRESET_POSES.filter((p) => !tracked.has(p.key) && !trackedNames.has(p.name.toLowerCase()));
  const order = () => Math.max(-1, ...data.yogaPoses.map((p) => p.order ?? 0)) + 1;
  const add = (fields) => {
    const p = newPose({ ...fields, order: order() });
    saveYogaPose(p);
    closeSheet();
    toast(`${p.name} added`);
    nav('/yoga/pose/' + p.id);
  };
  const custom = sheet.name.trim();
  const dup = custom && trackedNames.has(custom.toLowerCase());
  return h(Sheet, { title: 'Add pose', full: true }, [
    h(Section, { title: 'Your own pose' }, [
      h('div.field-card', h(TextField, { value: sheet.name, placeholder: 'Pose name', onChange: (v) => { sheet.name = v; update(); } })),
      h('div.pad', h(Segmented, { small: true, value: sheet.kind, onChange: (v) => { sheet.kind = v; update(); }, options: [{ value: 'hold', label: 'Hold time' }, { value: 'achieve', label: 'Achieved / not yet' }] })),
      h('div.pad', { style: { paddingTop: 0 } }, [
        dup && h('div.small.muted', { style: { marginBottom: '8px' } }, 'You already track a pose with this name.'),
        h(Button, { block: true, disabled: !custom || dup, onClick: () => add({ name: custom, kind: sheet.kind }) }, 'Add pose'),
      ]),
    ]),
    presets.length > 0 && h(Section, { title: 'Common poses' }, presets.map((p) => h(Row, {
      key: p.key,
      left: h('span', { class: cx('yoga-dot', p.kind === 'achieve' && 'achieve') }, icon(p.kind === 'achieve' ? 'trophy' : 'timer', 20)),
      title: p.name, subtitle: p.kind === 'achieve' ? 'Achieved / not yet' : 'Hold time',
      right: icon('plus', 20),
      onClick: () => add({ name: p.name, kind: p.kind, preset: p.key }),
    }))),
  ]);
}

/** Pose page: add a result, see the chart and every result. */
export function YogaPoseScreen({ id }) {
  const p = data.yogaPoses.find((x) => x.id === id);
  if (!p) return h(Page, { title: 'Pose', backTo: '/yoga', large: false }, h(Empty, { iconName: 'yoga', title: 'Pose not found' }));
  const st = state();
  const f = (st.poseForm && st.poseForm.poseId === id) ? st.poseForm : (st.poseForm = { poseId: id, date: dateKey(Date.now()), seconds: null, achieved: true });
  const entries = entriesFor(data.yogaEntries, id);
  const sm = poseSummary(p, data.yogaEntries);
  const hl = st.highlight && st.highlight.poseId === id && Date.now() - st.highlight.at < 8000 ? st.highlight : null;
  const isHold = p.kind === 'hold';
  const canAdd = isHold ? f.seconds > 0 : true;

  const add = () => {
    const e = newPoseEntry({ poseId: id, date: dayToMs(f.date), seconds: isHold ? Math.round(f.seconds) : null, achieved: isHold ? null : !!f.achieved });
    saveYogaEntry(e);
    const kind = entryHighlight(p, e, data.yogaEntries);
    st.poseForm = { poseId: id, date: f.date, seconds: null, achieved: true };
    if (kind) {
      st.highlight = { poseId: id, entryId: e.id, kind, at: Date.now() };
      toast(kind === 'first' ? `🎉 First time! ${p.name} achieved` : `🏆 New record! ${fmtHold(e.seconds)}`, 4000);
      setTimeout(update, 8100);
    } else toast('Result saved');
  };

  const menu = () => openSheet({
    type: 'actions', title: p.name, actions: [
      { text: 'Rename pose', icon: 'edit', onClick: () => openSheet({ type: 'textInput', title: 'Pose name', value: p.name, single: true, onSave: (v) => { if (v.trim()) saveYogaPose({ ...p, name: v.trim() }); } }) },
      { text: 'Remove from journal', icon: 'trash', destructive: true, onClick: () => confirm({
        title: `Remove ${p.name}?`, message: entries.length ? `Its ${entries.length} result${entries.length === 1 ? '' : 's'} will be deleted too.` : undefined,
        confirmText: 'Remove', destructive: true, onConfirm: () => { deleteYogaPose(id); nav('/yoga/poses'); toast('Pose removed'); },
      }) },
    ],
  });

  const series = poseSeries(p, data.yogaEntries);
  return h(Page, { title: p.name, backTo: '/yoga/poses', large: false, actions: [h(IconButton, { name: 'more', label: 'Pose options', onClick: menu })] }, [
    hl && h('div', { class: cx('yoga-highlight', hl.kind) }, [
      h('div.yh-icon', hl.kind === 'first' ? '🎉' : '🏆'),
      h('div', [h('div.yh-t', hl.kind === 'first' ? 'First time!' : 'New personal record!'),
        h('div.yh-s', hl.kind === 'first' ? `You achieved ${p.name}.` : `${fmtHold(sm.best)} – your longest ${p.name} yet.`)]),
    ]),

    h('div.stat-grid.yoga-stats', { style: { marginBottom: '14px' } }, isHold ? [
      statBox('Best', sm.best ? fmtHold(sm.best) : '–', sm.bestDate ? fmtDate(sm.bestDate) : 'No results yet'),
      statBox('Last', sm.last?.seconds ? fmtHold(sm.last.seconds) : '–', sm.last ? relDay(sm.last.date) : ''),
      statBox('Results', String(sm.count), ''),
    ] : [
      statBox('Status', sm.achieved ? 'Achieved' : 'Not yet', sm.achieved ? fmtDate(sm.firstAchieved) : ''),
      statBox('Times achieved', String(sm.achievedCount), `of ${sm.count} tries`),
    ]),

    h(Section, { title: 'Add a result' }, [
      isHold
        ? h(Row, { title: 'Hold time', right: h('div.hstack', [h(NumberField, { value: f.seconds, decimals: false, class: 'w-80 center', ariaLabel: 'Seconds', placeholder: '0', onChange: (v) => { f.seconds = v; update(); } }), h('span.muted', 'sec')]) })
        : h('div.pad', h(Segmented, { small: true, value: f.achieved ? 'yes' : 'no', onChange: (v) => { f.achieved = v === 'yes'; update(); }, options: [{ value: 'yes', label: 'Achieved' }, { value: 'no', label: 'Not yet' }] })),
      isHold && h('div.pad.chips', { style: { paddingTop: 0 } }, [15, 30, 45, 60, 90, 120].map((s) => h(Chip, { key: s, active: f.seconds === s, onClick: () => { f.seconds = s; update(); } }, fmtHold(s)))),
      h(Row, { title: 'Date', right: h('input.select', { type: 'date', value: f.date, max: dateKey(Date.now()), onchange: (e) => { if (e.target.value) { f.date = e.target.value; update(); } } }) }),
      h('div.pad', h(Button, { block: true, disabled: !canAdd, onClick: add }, [icon('plus', 20), 'Add result'])),
    ]),

    h(Section, { title: isHold ? 'Hold time over time' : 'Times achieved over time' },
      h('div.pad', h(LineChart, { points: series, id: 'yogaPose_' + id, formatY: isHold ? (v) => fmtHold(Math.round(v)) : (v) => fmtNum(Math.max(0, v), 0) }))),

    entries.length > 0 && h(Section, { title: 'All results', footer: 'Tap a result to delete it.' }, entries.slice().reverse().map((e) => {
      const k = entryHighlight(p, e, data.yogaEntries);
      return h(Row, {
        key: e.id, class: hl && hl.entryId === e.id ? 'yoga-new' : '',
        title: isHold ? fmtHold(e.seconds) : e.achieved ? 'Achieved' : 'Not yet',
        subtitle: fmtDate(e.date),
        right: k && h('span', { class: cx('tag', k === 'first' ? 'green' : 'yellow') }, k === 'first' ? '🎉 First time' : '🏆 Record'),
        onClick: () => confirm({ title: 'Delete this result?', confirmText: 'Delete', destructive: true, onConfirm: () => { deleteYogaEntry(e.id); toast('Result deleted'); } }),
      });
    })),
  ]);
}

/** Short value for the small stat boxes: 45 → ['45', 'min'], 195 → ['3:15', 'hours']. */
function compactMinutes(min) {
  const m = Math.round(min || 0);
  return m < 60 ? [String(m), 'min'] : [`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, 'hours'];
}

function statBox(k, v, s) {
  return h('div.stat', [h('div.k', k), h('div.v', v), s && h('div.s', s)]);
}

// ---------- 3. Stats & progress ----------
function StatsView(st) {
  const sessions = data.yogaSessions;
  if (!sessions.length) {
    return h(Empty, {
      iconName: 'yoga', title: 'No yoga sessions yet',
      text: 'Log your first session and your streaks, minutes and progress will show up here.',
      action: h(Button, { onClick: () => { st.seg = 'log'; update(); } }, 'Log a session'),
    });
  }
  const ws = data.settings.weekStart;
  const streak = yogaStreaks(sessions);
  const tot = yogaTotals(sessions, Date.now(), ws);
  const weekly = weeklyMinutes(sessions, Date.now(), 12, ws);
  const styles = styleBreakdown(sessions);
  const maxCount = Math.max(1, ...styles.map((x) => x.count));
  const feel = feelByWeek(sessions, ws);
  const avg = averageFeel(sessions);
  const poses = posesSorted();
  const statPose = poses.find((p) => p.id === st.statPose) || poses[0] || null;
  const shortDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return h('div', [
    h('div.stat-grid.yoga-stats', { style: { marginBottom: '14px' } }, [
      statBox('Streak', `${streak.current}`, streak.current === 1 ? 'day' : 'days'),
      statBox('Longest', `${streak.longest}`, streak.longest === 1 ? 'day' : 'days'),
    ]),
    h('div.stat-grid.yoga-stats', { style: { marginBottom: '14px' } }, [
      statBox('This week', ...compactMinutes(tot.week)),
      statBox('This month', ...compactMinutes(tot.month)),
      statBox('All time', compactMinutes(tot.total)[0], `${compactMinutes(tot.total)[1]} · ${tot.count} session${tot.count === 1 ? '' : 's'}`),
    ]),

    h(Section, { title: 'Minutes per week' }, h('div.pad', h(BarChart, { bars: weekly.map((w) => ({ label: shortDate(w.from), value: w.minutes })), formatY: (v) => String(Math.round(v)) }))),

    h(Section, { title: 'Sessions by style' }, styles.map((x) => h(Row, {
      key: x.style, title: styleName(x.style), subtitle: fmtMinutes(x.minutes),
      right: h('b', String(x.count)),
    }, h('div.tbar', { style: { marginTop: '6px' } }, h('div.tbar-direct', { style: { width: `${(x.count / maxCount) * 100}%` } }))))),

    h(Section, { title: 'Pose progress' }, poses.length === 0
      ? h('div.pad.muted', [h('div', 'You aren’t tracking any poses yet.'), h('button.link-btn', { style: { padding: 0, marginTop: '6px' }, onclick: () => { st.seg = 'poses'; update(); } }, 'Go to the pose journal')])
      : [
        h('div.pad.chips', poses.map((p) => h(Chip, { key: p.id, active: statPose && statPose.id === p.id, onClick: () => { st.statPose = p.id; update(); } }, p.name))),
        statPose && h('div.pad', { style: { paddingTop: 0 } }, [
          h('div.small.muted', { style: { marginBottom: '6px' } }, poseLine(statPose)),
          h(LineChart, {
            points: poseSeries(statPose, data.yogaEntries), id: 'yogaStat_' + statPose.id,
            formatY: statPose.kind === 'hold' ? (v) => fmtHold(Math.round(v)) : (v) => fmtNum(Math.max(0, v), 0),
          }),
        ]),
      ]),

    h(Section, { title: 'How I felt afterwards', footer: 'Average rating per week (1 = bad, 5 = great).' }, feel.length === 0
      ? h('div.pad.muted', 'Rate how you felt when you log a session to see this.')
      : [
        h(Row, { title: 'Average', right: h('b', `${fmtNum(avg, 1)} / 5`) }),
        h('div.pad', h(LineChart, { points: feel.map((p) => ({ ...p, label: `${p.n} session${p.n === 1 ? '' : 's'}` })), id: 'yogaFeel', formatY: (v) => fmtNum(v, 1) })),
      ]),
  ]);
}
