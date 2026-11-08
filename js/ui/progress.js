// Progress tab: overview (frequency, streak, calendar, PRs, stalls), weekly/monthly muscle
// volume vs targets, exercise list and body measurements.
import { readinessSeries } from '../logic/readiness.js';
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, closeSheet, saveMeasurement, deleteMeasurement, saveSettings, confirm, toast, history, doneWorkouts, cached } from '../store.js';
import { Page, Section, Row, Empty, Button, IconButton, Segmented, Sheet, NumberField, Thumb, Chip, LineChart, BarChart, TargetBar, SpiderChart, nav, fmtW, fmtDate, relDay } from './components.js';
import { fmtNum, addDays, startOfWeek, startOfMonth, addMonths, dateKey, uid, parseDateKey, startOfDay, plural } from '../logic/util.js';
import { allMuscles, muscleName } from '../logic/muscles.js';
import { volumeBetween, weekRange, weeklySeries, monthRange, targetStatus } from '../logic/volume.js';
import { weeklyFrequency, weekStreak, strengthTrend, trendBuckets } from '../logic/analytics.js';
import { isRun, runStats, fmtPace, fmtKm, paceS, fmtRunTime, runDurationS } from '../logic/health.js';
import { prsInWorkout, isStalled, personalRecords } from '../logic/records.js';
import { activeBlock, blockRange, planVsDone, adherence, blockWeek } from '../logic/blocks.js';
import { displayWeight, fromDisplayWeight, toDisplayLength, fromDisplayLength } from '../logic/units.js';

export function ProgressScreen() {
  const st = (ui.tabState.progress = ui.tabState.progress || { seg: 'overview', weekOffset: 0, mode: 'week', muscle: 'chest', monthOffset: 0, bodyKind: 'bodyweight' });
  return h(Page, { title: 'Progress' }, [
    h(Segmented, {
      value: st.seg, onChange: (v) => { st.seg = v; update(); },
      options: [{ value: 'overview', label: 'Overview' }, { value: 'volume', label: 'Volume' }, { value: 'exercises', label: 'Exercises' }, { value: 'body', label: 'Body' }],
    }),
    st.seg === 'overview' && Overview(st),
    st.seg === 'volume' && Volume(st),
    st.seg === 'exercises' && Exercises(),
    st.seg === 'body' && Body(st),
  ]);
}

// ---------- Overview ----------
function Overview(st) {
  const now = Date.now();
  const ws = data.settings.weekStart;
  const freq = weeklyFrequency(data.workouts, now, 12, ws);
  const done = doneWorkouts();
  const thisWeek = freq[freq.length - 1].count;
  const avg = freq.reduce((a, b) => a + b.count, 0) / freq.length;
  const streak = weekStreak(data.workouts, now, ws);

  const recentPrs = cached('recentPrs', () => {
    const h0 = history();
    const out = [];
    for (const w of done.filter((x) => x.startedAt > now - 30 * 86400000)) {
      for (const p of prsInWorkout(w, h0, data.measurements)) out.push({ ...p, date: w.startedAt, workoutId: w.id });
    }
    return out;
  });
  const stalled = cached('stalled', () => data.exercises.filter((e) => isStalled(history().get(e.id) || [], data.measurements)));

  const block = activeBlock(data.blocks);
  let adh = null;
  if (block) {
    const r = blockRange(block);
    adh = adherence(planVsDone(data.blocks, data.workouts, r.from, Math.min(r.to, addDays(startOfDay(now), 1))), now);
  }

  const trend = cached('trend', () => strengthTrend(history(), data.measurements, now));
  const tb = trendBuckets(trend);
  const exName = (t) => data.exercises.find((e) => e.id === t.exerciseId)?.name || t.name;
  const pct = (c) => `${c > 0 ? '+' : ''}${fmtNum(c * 100, Math.abs(c) < 0.1 ? 1 : 0)} %`;

  // Takeaway 1: Am I getting stronger?
  let strongT, strongS;
  if (!trend.length) { strongT = 'Not enough data yet'; strongS = 'Do the same exercise twice in 8 weeks and you’ll see your trend here.'; }
  else if (tb.up.length >= Math.max(1, tb.down.length) && tb.up.length >= trend.length / 2) { strongT = 'Yes – you’re getting stronger'; strongS = `${tb.up.length} of ${trend.length} exercises went up in the last 8 weeks.`; }
  else if (tb.down.length > tb.up.length) { strongT = 'Slightly down lately'; strongS = `${tb.down.length} of ${trend.length} exercises dropped. Sleep, food and a deload week can help.`; }
  else { strongT = 'Mostly holding steady'; strongS = `${tb.up.length} up, ${tb.steady.length} steady, ${tb.down.length} down over the last 8 weeks.`; }

  // Takeaway 2: How often did I train?
  const last4 = freq.slice(-4).reduce((a, b) => a + b.count, 0) / 4;
  const prev4 = freq.slice(-8, -4).reduce((a, b) => a + b.count, 0) / 4;
  const freqT = done.length === 0 ? 'No workouts yet' : `${plural(fmtNum(last4, 1), 'workout')} a week`;
  const freqS = done.length === 0 ? 'Finish your first workout to see this.'
    : `Last 4 weeks${prev4 > 0 ? ` (${last4 > prev4 + 0.2 ? 'up from' : last4 < prev4 - 0.2 ? 'down from' : 'same as'} ${fmtNum(prev4, 1)} before)` : ''}. This week: ${thisWeek}${streak > 1 ? ` · ${streak}-week streak 🔥` : ''}.`;

  // Takeaway 3: Which exercises are improving?
  const impT = tb.up.length ? `${exName(tb.up[0])} is improving most` : trend.length ? 'No clear gains yet' : 'Not enough data yet';
  const impS = tb.up.length ? `${pct(tb.up[0].change)} in the last 8 weeks.` : trend.length ? 'Try the suggested weight increases when they appear.' : 'Train an exercise at least twice to compare.';

  // Takeaway 4: running
  const runs = done.filter(isRun);
  const rs = runStats(runs, now, ws);
  const thisWeekKm = rs.weekly[rs.weekly.length - 1].km;
  const runT = thisWeekKm > 0 ? `${fmtNum(thisWeekKm, 1)} km this week` : `${fmtNum(rs.last4 / 4, 1)} km a week`;
  const runS = `${fmtNum(rs.last4, 1)} km in the last 4 weeks${rs.prev4 > 0 ? ` (${rs.last4 > rs.prev4 * 1.05 ? 'up from' : rs.last4 < rs.prev4 * 0.95 ? 'down from' : 'about the same as'} ${fmtNum(rs.prev4, 1)})` : ''}${rs.recentPace ? ` · average pace ${fmtPace(rs.recentPace)} /km` : ''}.`;

  // Readiness check-ins (1.27): average of the last 5, chart of the last 30.
  const rdSeries = readinessSeries(data.workouts, 30);
  const rdRecent = rdSeries.slice(-5);
  const rdAvg = rdRecent.length ? rdRecent.reduce((a, p) => a + p.y, 0) / rdRecent.length : 0;
  const rdTired = rdRecent.filter((p) => p.y < 3.5).length;

  return h('div', [
    Insight({ q: 'Am I getting stronger?', t: strongT, s: strongS, tone: tb.up.length > tb.down.length ? 'good' : tb.down.length > tb.up.length ? 'warn' : '' },
      trend.length > 0 && h('div.trend-chips', [
        h('span.tchip.up', `↑ ${tb.up.length} up`), h('span.tchip', `→ ${tb.steady.length} steady`), h('span.tchip.down', `↓ ${tb.down.length} down`),
      ])),

    Insight({ q: 'How often did I train?', t: freqT, s: freqS },
      h(BarChart, { bars: freq.map((f) => ({ label: new Date(f.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: f.count })), formatY: (v) => String(v) })),

    rdSeries.length > 0 && Insight({ q: 'How ready did I feel?', t: `${fmtNum(rdAvg, 1)} average readiness`, s: `Last ${rdRecent.length} check-ins · ${rdTired} tired`, tone: rdAvg >= 3.5 ? 'good' : rdAvg < 2.5 ? 'warn' : '' },
      rdSeries.length > 1 && h(LineChart, { id: 'readiness', points: rdSeries, formatY: (v) => fmtNum(v, 1) })),

    runs.length > 0 && Insight({ q: 'How is my running going?', t: runT, s: runS, tone: rs.last4 > rs.prev4 * 1.05 ? 'good' : '' }, [
      h(BarChart, { bars: rs.weekly.map((wk) => ({ label: new Date(wk.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: Math.round(wk.km * 10) / 10 })), formatY: (v) => `${fmtNum(v, 1)}` }),
      h('div.run-recs', [
        rs.longest && h('button.rr', { onclick: () => nav('/workout/' + rs.longest.id) }, [h('div.k', 'Longest run'), h('div.v', fmtKm(rs.longest.run.km))]),
        rs.fastest && h('button.rr', { onclick: () => nav('/workout/' + rs.fastest.id) }, [h('div.k', 'Best pace'), h('div.v', `${fmtPace(paceS(rs.fastest))} /km`)]),
        rs.fastest5k && h('button.rr', { onclick: () => nav('/workout/' + rs.fastest5k.id) }, [h('div.k', 'Fastest 5 km'), h('div.v', fmtRunTime(Math.round(paceS(rs.fastest5k) * 5)))]),
      ]),
    ]),

    Insight({ q: 'Which exercises are improving?', t: impT, s: impS },
      trend.length > 0 && h('div.trend-list', trend.slice(0, 8).map((t) => h('button.trend-row', { key: t.exerciseId, onclick: () => nav('/exercise/' + t.exerciseId) }, [
        h('div.grow', [h('div.tn', exName(t)), h('div.ts', t.metric === 'e1rm' ? `Est. 1RM ${fmtW(t.from)} → ${fmtW(t.to)}` : `Best reps ${t.from} → ${t.to}`)]),
        h('span', { class: cx('tpct', t.change > 0.01 ? 'up' : t.change < -0.02 ? 'down' : '') }, pct(t.change)),
      ])))),

    h('div.section-head', { style: { marginTop: '22px' } }, h('span', 'Details')),
    Calendar(st),
    block && adh && h(Section, { title: `Plan · ${block.name}` }, [
      h(Row, { title: `Week ${blockWeek(block)} of ${block.weeks}`, subtitle: block.phase, right: h('b', adh.planned ? `${adh.completed}/${adh.planned} planned done` : 'No plan yet') }),
      adh.planned > 0 && h('div.pad', h('div.tbar', h('div.tbar-direct', { style: { width: `${(adh.completed / adh.planned) * 100}%`, background: 'var(--green)' } }))),
    ]),
    h(Section, { title: 'Records in the last 30 days' }, recentPrs.length === 0
      ? h('div.pad.muted', 'No new records yet – keep pushing!')
      : recentPrs.slice(0, 12).map((p, i) => h(Row, { key: i, left: h('span.pr', icon('trophy', 20)), title: p.name, subtitle: `${p.kind} · ${relDay(p.date)}`, chevron: true, onClick: () => nav('/exercise/' + p.exerciseId) }))),
    stalled.length > 0 && h(Section, { title: 'Possibly stalled', footer: 'No improvement in estimated 1RM (or reps) over the last 3 sessions.' },
      stalled.map((e) => h(Row, { key: e.id, left: h(Thumb, { image: e.image, name: e.name, muscles: e.muscles, size: 36 }), title: e.name, chevron: true, onClick: () => nav('/exercise/' + e.id) }))),
    h('div.stat-grid', { style: { marginTop: '14px' } }, [
      statBox('Total', done.length, 'workouts'),
      statBox('Avg / week', fmtNum(avg, 1), 'last 12 wks'),
    ]),
  ]);
}

/** Question → short answer → chart. */
function Insight({ q, t, s, tone }, body) {
  return h('section.insight', { class: tone || '' }, [
    h('div.iq', q),
    h('div.it', t),
    h('div.is', s),
    body && h('div.ib', body),
  ]);
}

function statBox(k, v, s) {
  return h('div.stat', [h('div.k', k), h('div.v', String(v)), h('div.s', s)]);
}

function Calendar(st) {
  const base = addMonths(startOfMonth(Date.now()), st.monthOffset || 0);
  const ws = data.settings.weekStart;
  const gridStart = startOfWeek(base, ws);
  const monthEnd = addMonths(base, 1);
  const days = planVsDone(data.blocks, data.workouts, gridStart, addDays(gridStart, 42));
  const today = dateKey(Date.now());
  const dows = [...Array(7)].map((_, i) => new Date(addDays(gridStart, i)).toLocaleDateString(undefined, { weekday: 'narrow' }));
  const now = Date.now();
  const inMonth = days.filter((d) => d.date >= base && d.date < monthEnd);
  const doneCount = inMonth.filter((d) => d.done.length).length;
  return h(Section, {
    title: new Date(base).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    right: h('span.hstack', { style: { gap: 0 } }, [
      h(IconButton, { name: 'chevronLeft', label: 'Previous month', size: 18, onClick: () => { st.monthOffset = (st.monthOffset || 0) - 1; update(); } }),
      h(IconButton, { name: 'chevronRight', label: 'Next month', size: 18, onClick: () => { st.monthOffset = (st.monthOffset || 0) + 1; update(); } }),
    ]),
    footer: h('div.legend', [h('span', [h('i', { style: { background: 'var(--accent)' } }), `Trained (${plural(doneCount, 'day')})`]), h('span', [h('i', { style: { background: 'var(--fill2)' } }), 'Planned']), h('span', [h('i', { style: { border: '1.5px dashed var(--muted)' } }), 'Missed'])]),
  }, h('div.cal', [
    ...dows.map((d, i) => h('div.dow', { key: 'd' + i }, d)),
    ...days.slice(0, days[35] && days[35].date >= monthEnd ? 35 : 42).map((d) => {
      const isDone = d.done.length > 0;
      const planned = d.planned.length > 0;
      const missed = planned && !isDone && d.date < startOfDay(now);
      return h('button', {
        key: d.key,
        class: cx('day', (d.date < base || d.date >= monthEnd) && 'other', d.key === today && 'today', isDone && 'done', !isDone && planned && !missed && 'planned', missed && 'missed'),
        onclick: isDone ? () => nav('/workout/' + d.done[0].id) : null,
        'aria-label': `${d.key}${isDone ? ' trained' : planned ? ' planned' : ''}`,
      }, [new Date(d.date).getDate(), d.done.length > 1 && h('span.dot')]);
    }),
  ]));
}

// ---------- Volume ----------
function Volume(st) {
  const s = data.settings;
  const muscles = allMuscles(s);
  const isWeek = st.mode === 'week';
  let range, prevRange, label, weeks = 1;
  if (isWeek) {
    const ref = addDays(Date.now(), 7 * st.weekOffset);
    range = weekRange(ref, s);
    prevRange = weekRange(addDays(range.from, -7), s);
    label = st.weekOffset === 0 ? 'This week' : st.weekOffset === -1 ? 'Last week' : `Week of ${fmtDate(range.from, { day: 'numeric', month: 'short' })}`;
  } else {
    const ref = addMonths(startOfMonth(Date.now()), st.monthOffsetV || 0);
    range = monthRange(ref);
    prevRange = monthRange(addMonths(ref, -1));
    label = new Date(ref).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    weeks = (range.to - range.from) / (7 * 86400000);
  }
  const vol = volumeBetween(data.workouts, range.from, range.to, s);
  const prev = volumeBetween(data.workouts, prevRange.from, prevRange.to, s);
  const rows = muscles.map((m) => ({ m, v: vol[m.key] || { total: 0, direct: 0, indirect: 0 }, p: prev[m.key]?.total || 0 }));
  const maxScale = Math.max(...rows.map((r) => r.v.total / (isWeek ? 1 : weeks)), ...muscles.map((m) => s.volumeTargets[m.key]?.max || 0));
  const total = rows.reduce((a, r) => a + r.v.total, 0);
  const shift = (d) => { if (isWeek) st.weekOffset = Math.min(0, st.weekOffset + d); else st.monthOffsetV = Math.min(0, (st.monthOffsetV || 0) + d); update(); };
  const trend = weeklySeries(data.workouts, Date.now(), 12, s);

  const per = isWeek ? 1 : weeks;
  const spider = s.volumeView === 'spider';
  const stat = rows.map((r) => ({ ...r, st: targetStatus(r.v.total / per, s.volumeTargets[r.m.key]) }));
  const low = stat.filter((r) => r.st === 'low'), ok = stat.filter((r) => r.st === 'ok'), withT = stat.filter((r) => r.st !== 'none');
  const volT = total === 0 ? 'No sets logged in this period' : low.length === 0 ? 'Every muscle hit its target 🎯' : `${ok.length} of ${withT.length} muscles on target`;
  const volS = total === 0 ? 'Finish a workout to see your muscle volume.' : low.length ? `Below target: ${low.slice(0, 4).map((r) => r.m.name).join(', ')}${low.length > 4 ? '…' : '.'}` : 'Nice balance – keep it up.';

  return h('div', [
    h('section.insight', [h('div.iq', 'Am I training every muscle enough?'), h('div.it', volT), h('div.is', volS)]),
    h(Segmented, { small: true, value: st.mode, onChange: (v) => { st.mode = v; update(); }, options: [{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }] }),
    h('div.hstack', { style: { justifyContent: 'space-between' } }, [
      h(IconButton, { name: 'chevronLeft', label: 'Earlier', onClick: () => shift(-1) }),
      h('div.center', [h('div', { style: { fontWeight: 700 } }, label), h('div.muted.small', `${fmtNum(total, 1)} sets total${isWeek ? '' : ` · ${fmtNum(total / weeks, 1)} / week`}`)]),
      h(IconButton, { name: 'chevronRight', label: 'Later', onClick: () => shift(1), disabled: isWeek ? st.weekOffset >= 0 : (st.monthOffsetV || 0) >= 0 }),
    ]),
    h('div.legend', { style: { margin: '6px 4px' } }, [
      h('span', [h('i', { style: { background: 'var(--accent)' } }), 'Main muscle']),
      h('span', [h('i', { style: { background: 'color-mix(in srgb, var(--accent) 40%, transparent)' } }), 'Helper muscle']),
      h('span', [h('i', { style: { background: 'var(--green-soft)', border: '1px solid var(--green)' } }), 'Target']),
    ]),
    h(Segmented, { small: true, value: spider ? 'spider' : 'list', onChange: (v) => saveSettings({ volumeView: v }), options: [{ value: 'list', label: 'List' }, { value: 'spider', label: 'Spider chart' }] }),
    h(Section, {
      right: h('button.link-btn', { style: { minHeight: 'auto', padding: 0, textTransform: 'none', letterSpacing: 0, fontSize: '13px' }, onclick: () => openSheet({ type: 'targets' }) }, 'Edit targets'),
      title: isWeek ? 'Sets per muscle' : 'Sets per muscle (avg per week)',
      footer: spider ? 'Tap a muscle name to see its last 12 weeks. Yellow = below target.' : null,
    }, spider
      ? h('div.spider-wrap', h(SpiderChart, {
        axes: stat.map((r) => ({ key: r.m.key, label: r.m.name, main: r.v.direct / per, helper: r.v.indirect / per, target: s.volumeTargets[r.m.key] || null, status: r.st })),
        maxScale, selected: st.muscle,
        onPick: (k) => { st.muscle = k; update(); setTimeout(() => document.getElementById('trend')?.scrollIntoView({ behavior: 'smooth' }), 50); },
      }))
      : rows.map(({ m, v, p }) => {
      const per = isWeek ? 1 : weeks;
      const val = v.total / per;
      const tgt = s.volumeTargets[m.key];
      const status = targetStatus(val, tgt);
      const delta = (v.total - p) / per;
      return h('button.row', { key: m.key, style: { display: 'block' }, onclick: () => { st.muscle = m.key; update(); setTimeout(() => document.getElementById('trend')?.scrollIntoView({ behavior: 'smooth' }), 50); } }, [
        h('div.hstack', [
          h('span.grow', { style: { fontWeight: 600 } }, m.name),
          status === 'low' && h('span.tag.yellow', 'Low'),
          status === 'ok' && h('span.tag.green', 'In range'),
          status === 'high' && h('span.tag.accent', 'High'),
          h('b.mono', fmtNum(val, 1)),
          tgt && (tgt.min || tgt.max) && h('span.muted.small', `/ ${tgt.min || 0}–${tgt.max || '∞'}`),
        ]),
        h(TargetBar, { direct: v.direct / per, indirect: v.indirect / per, target: tgt, maxScale }),
        h('div.muted.small', { style: { marginTop: '4px' } }, `${fmtNum(v.direct / per, 1)} main · ${fmtNum(v.indirect / per, 1)} helper${delta ? ` · ${delta > 0 ? '+' : ''}${fmtNum(delta, 1)} vs previous ${isWeek ? 'week' : 'month'}` : ''}`),
      ]);
    })),
    h('div#trend', h(Section, { title: `${muscleName(st.muscle, s)} – last 12 weeks` }, [
      h('div.chips', { style: { padding: '10px 12px 0', overflowX: 'auto', flexWrap: 'nowrap' } }, muscles.map((m) => h(Chip, { key: m.key, active: st.muscle === m.key, onClick: () => { st.muscle = m.key; update(); } }, m.name))),
      h(BarChart, { bars: trend.map((t) => ({ label: new Date(t.from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: t.volume[st.muscle]?.total || 0 })) }),
    ])),
    h('div.callout', [icon('info', 18), h('div', 'Volume = completed hard sets (warm-ups excluded). A set counts 1 for its main muscles and 0.5 for helper muscles by default. It’s a useful training guide, not a measurement of how much muscle you build – sleep, food, effort and recovery matter too.')]),
  ]);
}

// ---------- Exercises ----------
function Exercises() {
  const hist = history();
  const list = data.exercises
    .map((e) => ({ e, list: hist.get(e.id) || [] }))
    .filter((x) => x.list.length > 0)
    .sort((a, b) => b.list[0].workout.startedAt - a.list[0].workout.startedAt);
  if (!list.length) return h(Empty, { iconName: 'chart', title: 'No exercise history yet', text: 'Finish a workout to see charts and records here.' });
  const trend = new Map(cached('trend', () => strengthTrend(history(), data.measurements, Date.now())).map((t) => [t.exerciseId, t]));
  const ups = [...trend.values()].filter((t) => t.change > 0.01).length;
  return h('div', [
    h('section.insight', [h('div.iq', 'Which exercises are improving?'), h('div.it', trend.size ? `${ups} of ${trend.size} going up` : 'Not enough data yet'), h('div.is', trend.size ? 'Change in estimated 1RM over the last 8 weeks is shown on each exercise.' : 'Train an exercise twice in 8 weeks to see its trend.')]),
    h(Section, { footer: h('button.link-btn', { onclick: () => nav('/library') }, 'All exercises in the library ›') }, list.map(({ e, list: l }) => {
    const rec = personalRecords(l, data.measurements);
    return h(Row, {
      key: e.id, left: h(Thumb, { image: e.image, name: e.name, muscles: e.muscles }), title: e.name,
      subtitle: `${plural(l.length, 'session')} · last ${relDay(l[0].workout.startedAt)}${rec.bestE1rm ? ` · est. 1RM ${fmtW(rec.bestE1rm.value)}` : ''}`,
      right: trend.has(e.id) ? ((t) => h('span', { class: cx('tpct', t.change > 0.01 ? 'up' : t.change < -0.02 ? 'down' : '') }, `${t.change > 0 ? '+' : ''}${fmtNum(t.change * 100, 0)} %`))(trend.get(e.id)) : null,
      chevron: true, onClick: () => nav('/exercise/' + e.id),
    });
  }))]);
}

// ---------- Body measurements ----------
export const BODY_KINDS = [
  { key: 'bodyweight', name: 'Body weight', type: 'weight' },
  { key: 'chest', name: 'Chest', type: 'length' },
  { key: 'arms', name: 'Arms', type: 'length' },
  { key: 'waist', name: 'Waist', type: 'length' },
  { key: 'thighs', name: 'Thighs', type: 'length' },
  { key: 'calves', name: 'Calves', type: 'length' },
];

export function bodyKinds() {
  const custom = (data.settings.customMeasurements || []).map((c) => ({ ...c, type: c.type || 'length' }));
  return [...BODY_KINDS, ...custom];
}

function toDisp(kind, value) {
  return kind.type === 'weight' ? displayWeight(value, data.settings.unit) : kind.type === 'length' ? toDisplayLength(value, data.settings.lengthUnit) : value;
}
function unitOf(kind) {
  return kind.type === 'weight' ? data.settings.unit : kind.type === 'length' ? data.settings.lengthUnit : (kind.unit || '');
}

function Body(st) {
  const kinds = bodyKinds();
  const kind = kinds.find((k) => k.key === st.bodyKind) || kinds[0];
  const entries = data.measurements.filter((m) => m.kind === kind.key).sort((a, b) => b.date - a.date);
  return h('div', [
    h(Button, { block: true, onClick: () => openSheet({ type: 'measurement' }) }, [icon('plus', 18), 'Log measurements']),
    h(Section, { title: 'Latest' }, kinds.map((k) => {
      const list = data.measurements.filter((m) => m.kind === k.key).sort((a, b) => b.date - a.date);
      const latest = list[0], prev = list[1];
      const diff = latest && prev ? toDisp(k, latest.value) - toDisp(k, prev.value) : null;
      return h(Row, {
        key: k.key, title: k.name,
        subtitle: latest ? `${fmtDate(latest.date)}${diff ? ` · ${diff > 0 ? '+' : ''}${fmtNum(diff, 1)} ${unitOf(k)}` : ''}` : 'Not logged yet',
        right: latest ? h('b.mono', `${fmtNum(toDisp(k, latest.value), 1)} ${unitOf(k)}`) : null,
        class: k.key === kind.key ? 'selected' : '',
        onClick: () => { st.bodyKind = k.key; update(); },
      });
    })),
    h(Section, { title: kind.name }, [
      h(LineChart, { id: 'body' + kind.key, points: entries.slice().reverse().map((m) => ({ x: m.date, y: toDisp(kind, m.value) })), formatY: (v) => fmtNum(v, 1) }),
      ...entries.slice(0, 30).map((m) => h(Row, {
        key: m.id, title: `${fmtNum(toDisp(kind, m.value), 1)} ${unitOf(kind)}`, subtitle: fmtDate(m.date),
        right: h(IconButton, { name: 'trash', label: 'Delete entry', onClick: () => confirm({ title: 'Delete this entry?', confirmText: 'Delete', destructive: true, onConfirm: () => deleteMeasurement(m.id) }) }),
      })),
    ]),
    h('div.section-foot.center', 'Optional – the app works fine without measurements. Body weight is also used for bodyweight exercises (pull-ups, dips…).'),
  ]);
}

// sheet: { type: 'measurement' }
export function MeasurementSheet(sheet) {
  if (!sheet.values) { sheet.values = {}; sheet.date = dateKey(Date.now()); sheet.newName = ''; }
  const kinds = bodyKinds();
  const save = () => {
    const date = parseDateKey(sheet.date) + 12 * 3600e3;
    let n = 0;
    for (const k of kinds) {
      const v = sheet.values[k.key];
      if (v === null || v === undefined || v <= 0) continue;
      const stored = k.type === 'weight' ? fromDisplayWeight(v, data.settings.unit) : k.type === 'length' ? fromDisplayLength(v, data.settings.lengthUnit) : v;
      saveMeasurement({ id: uid(), kind: k.key, value: stored, date });
      n++;
    }
    closeSheet();
    toast(n ? `Saved ${n} measurement${n === 1 ? '' : 's'}` : 'Nothing to save');
  };
  return h(Sheet, {
    title: 'Log measurements', full: true,
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: [h('button.link-btn.strong', { onclick: save }, 'Save')],
  }, [
    h(Section, {}, h(Row, { title: 'Date', right: h('input.select', { type: 'date', value: sheet.date, onchange: (e) => { sheet.date = e.target.value || sheet.date; } }) })),
    h(Section, { footer: 'Fill in only what you measured.' }, kinds.map((k) => h(Row, {
      key: k.key, title: k.name,
      right: h('div.hstack', [h(NumberField, { value: sheet.values[k.key] ?? null, class: 'w-80', onChange: (v) => { sheet.values[k.key] = v; } }), h('span.muted', { style: { width: '28px' } }, unitOf(k))]),
    }))),
    h(Section, { title: 'Add your own measurement' }, h('div.row', [
      h('input.text-field.grow', { placeholder: 'e.g. Neck, Forearm, Body fat %', value: sheet.newName, oninput: (e) => { sheet.newName = e.target.value; } }),
      h('button.link-btn.strong', { onclick: () => {
        const name = sheet.newName.trim();
        if (!name) return;
        const isPct = /%|fat/i.test(name);
        const list = [...(data.settings.customMeasurements || []), { key: 'c_' + uid().slice(0, 8), name, type: isPct ? 'number' : 'length', unit: isPct ? '%' : '' }];
        saveSettings({ customMeasurements: list });
        sheet.newName = '';
      } }, 'Add'),
    ])),
  ]);
}
