// Readiness check sheet: shown right after "Start workout" when Settings → Readiness check is on.
// The workout has already started and is saved, so skipping (or closing) leaves it exactly as before.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, update, closeSheet, saveWorkout } from '../store.js';
import { Sheet, Section, Button, Segmented } from './components.js';
import { READINESS_QUESTIONS, PAIN_AREAS, LEVELS, readinessScore, readinessRecord, entriesForAreas, levelAdvice } from '../logic/readiness.js';
import { fmtNum } from '../logic/util.js';

const workoutOf = (sheet) => data.workouts.find((w) => w.id === sheet.workoutId && w.status === 'active');

function saveRecord(sheet, rec) {
  const w = workoutOf(sheet);
  if (!w) return;
  w.readiness = rec;
  saveWorkout(w);
}

export function ReadinessSheet(sheet) {
  const a = (sheet.answers = sheet.answers || { sleep: null, energy: null, soreness: null, pain: false, areas: [] });
  const skip = () => {
    if (!sheet.saved) saveRecord(sheet, readinessRecord(null));
    closeSheet();
  };
  if (sheet.step === 'result') return ResultView(sheet);

  const score = readinessScore(a);
  const ready = !!score && (!a.pain || a.areas.length > 0);
  const scale = (q) => h('div.rd-q', { key: q.key }, [
    h('div.rd-q-title', q.title),
    h('div.rd-scale', [1, 2, 3, 4, 5].map((n) => h('button', {
      key: n, type: 'button', class: cx('rd-n', a[q.key] === n && 'active'), 'aria-label': `${q.title} ${n}`,
      onclick: () => { a[q.key] = n; update(); },
    }, String(n)))),
    h('div.rd-ends', [h('span', [h('span', '1 · '), h('span', q.low)]), h('span', [h('span', q.high), h('span', ' · 5')])]),
  ]);

  return h(Sheet, {
    title: 'Readiness check',
    left: h('button.link-btn', { onclick: skip }, 'Skip'),
    onClose: skip,
  }, [
    h('div.small.muted', { style: { margin: '0 4px 12px' } }, 'How do you feel today? 5 = best.'),
    h(Section, {}, h('div.pad', READINESS_QUESTIONS.map(scale))),
    h(Section, {}, h('div.pad', [
      h('div.rd-q-title', 'Sharp pain or a possible injury?'),
      h(Segmented, { value: a.pain ? 'yes' : 'no', onChange: (v) => { a.pain = v === 'yes'; if (!a.pain) a.areas = []; update(); }, options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }] }),
      a.pain && h('div', { style: { marginTop: '12px' } }, [
        h('div.small.muted', { style: { marginBottom: '8px' } }, 'Where? (pick all that apply)'),
        h('div.chips', PAIN_AREAS.map((p) => h('button', {
          key: p.key, type: 'button', class: cx('chip', a.areas.includes(p.key) && 'active'),
          onclick: () => { a.areas = a.areas.includes(p.key) ? a.areas.filter((x) => x !== p.key) : [...a.areas, p.key]; update(); },
        }, p.name))),
      ]),
    ])),
    h('div', { style: { padding: '4px 0 8px' } }, h(Button, {
      block: true, disabled: !ready,
      onClick: () => { saveRecord(sheet, readinessRecord(a)); sheet.saved = true; sheet.step = 'result'; update(); },
    }, 'Continue')),
  ]);
}

function ResultView(sheet) {
  const w = workoutOf(sheet);
  const rec = w?.readiness;
  if (!rec || rec.skipped) { closeSheet(); return null; }
  const lv = LEVELS[rec.level];
  const avoid = rec.pain ? entriesForAreas(w.entries, rec.areas) : [];
  const areaNames = PAIN_AREAS.filter((p) => rec.areas.includes(p.key)).map((p) => p.name);
  return h(Sheet, { title: 'Readiness check', left: h('span'), onClose: closeSheet }, [
    h('div.rd-result', { class: `tone-${lv.tone}` }, [
      h('div.rd-score', fmtNum(rec.avg, 1)),
      h('div', [h('div.rd-level', lv.title), h('div.small.muted', [h('span', `Sleep ${rec.sleep}`), ' · ', h('span', `Energy ${rec.energy}`), ' · ', h('span', `Soreness ${rec.soreness}`)])]),
    ]),
    h(Section, { title: 'Today' }, h('div.pad', levelAdvice(rec.level).map((t, i) => h('div.rd-advice', { key: i }, t)))),
    rec.pain && h(Section, {
      title: 'Pain',
      footer: 'Sharp pain is a reason to stop, not to push through. If it doesn’t go away, see a doctor or physiotherapist.',
    }, h('div.pad', [
      h('div.rd-advice', [h('span', 'Area:'), ' ', ...areaNames.flatMap((n, i) => [i ? ', ' : '', h('span', n)])]),
      avoid.length
        ? [h('div.rd-advice', 'We recommend skipping:'), h('ul.rd-list', avoid.map((e) => h('li', { key: e.id }, e.snapshot.name)))]
        : h('div.rd-advice', 'None of today’s exercises work this area much.'),
    ])),
    h('div', { style: { padding: '4px 0 8px' } }, h(Button, { block: true, onClick: closeSheet }, [icon('dumbbell', 20), 'Start training'])),
  ]);
}
