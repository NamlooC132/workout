// Readiness check sheet: shown right after "Start workout" when Settings → Readiness check is on.
// The workout has already started and is saved, so skipping (or closing) leaves it exactly as before.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, closeSheet, saveWorkout, saveSettings, exercisesById, confirm, toast } from '../store.js';
import { Sheet, Section, Row, Button, Segmented, Toggle, fmtW } from './components.js';
import {
  READINESS_QUESTIONS, PAIN_AREAS, LEVELS, ROLE_NAMES, readinessScore, readinessRecord, levelAdvice,
  exerciseRole, autoRole, buildPlan, planSummary, applyPlan, tiredStreak, shouldSuggestDeload, TIRED_IN_A_ROW,
} from '../logic/readiness.js';
import { fmtNum } from '../logic/util.js';
import { toDisplayWeight, fromDisplayWeight } from '../logic/units.js';
import * as WS from '../workoutService.js';

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

/** Main lift / accessory for a workout entry: the library exercise's role, else from the snapshot. */
export function entryRole(e) {
  const ex = exercisesById().get(e.exerciseId);
  return ex ? exerciseRole(ex) : autoRole({ category: 'Compound', muscles: e.snapshot?.muscles });
}

/** ~10 % lighter, rounded to the exercise's − / + step in the display unit. */
function roundKg(kg, e) {
  const unit = data.settings.unit;
  const step = e.snapshot?.weightStep || 2.5;
  return fromDisplayWeight(Math.max(0, Math.round(toDisplayWeight(kg, unit) / step) * step), unit);
}

function changeText(c, e) {
  const main = e.sets.filter((s) => s.type !== 'warmup' && s.type !== 'drop').length;
  if (c.kind === 'skip') return 'Skip today';
  if (c.kind === 'removeSet') return [h('span', 'Sets'), ` ${main} → ${main - 1}`];
  const s = e.sets.find((x) => !x.done && x.type !== 'warmup' && x.kg > 0);
  return s ? [h('span', 'Weight'), ' ', h('span', fmtW(s.kg)), ' → ', h('span', fmtW(roundKg(s.kg * 0.9, e)))] : 'About 10 % less weight';
}

function finish(sheet, w, decision, extra = {}) {
  w.readiness = { ...w.readiness, decision, ...extra };
  saveWorkout(w);
  sheet.done = true;
  closeSheet();
}

function ResultView(sheet) {
  const w = workoutOf(sheet);
  const rec = w?.readiness;
  if (!rec || rec.skipped) { closeSheet(); return null; }
  const lv = LEVELS[rec.level];
  const plan = (sheet.plan = sheet.plan || buildPlan(w, rec, entryRole));
  const chosen = (sheet.chosen = sheet.chosen || new Set(plan.map((c) => c.id)));
  const byId = new Map(w.entries.map((e) => [e.id, e]));
  const areaNames = PAIN_AREAS.filter((p) => rec.areas.includes(p.key)).map((p) => p.name);
  const streak = tiredStreak(data.workouts, rec, w.id);
  const offerDeload = shouldSuggestDeload(streak, data.settings, Date.now(), !!w.deload);

  const approve = () => {
    const picked = plan.filter((c) => chosen.has(c.id));
    if (!picked.length) return finish(sheet, w, 'cancelled');
    WS.undoable(w, 'Changes applied', () => {
      const counts = applyPlan(w, picked, roundKg);
      w.readiness = { ...w.readiness, decision: 'applied', applied: counts };
      WS.save(w);
    });
    sheet.done = true;
    closeSheet();
  };
  const light = () => {
    WS.undoable(w, 'Light workout', () => {
      const skips = plan.filter((c) => c.kind === 'skip' && chosen.has(c.id));
      applyPlan(w, skips, roundKg);
      WS.applyDeload(w);
      w.readiness = { ...w.readiness, decision: 'light' };
      WS.save(w);
    });
    sheet.done = true;
    closeSheet();
  };
  const restDay = () => confirm({
    title: 'Take a rest day?', message: 'This workout will be removed. Nothing else changes.', confirmText: 'Rest day', destructive: true,
    onConfirm: () => {
      sheet.done = true;
      closeSheet();
      WS.discardWorkout(w);
      ui.workoutOpen = false;
      toast('Enjoy your rest day');
    },
  });
  const startDeload = () => {
    saveSettings({ readinessDeloadUntil: Date.now() + 7 * 86400000 });
    w.deload = true;
    w.deloadApplied = false;
    sheet.plan = plan.filter((c) => c.kind === 'skip'); // the deload replaces the tired-day changes
    sheet.chosen = new Set(sheet.plan.map((c) => c.id));
    saveWorkout(w);
    toast('Deload week started – 7 days');
    update();
  };
  const snoozeDeload = () => { saveSettings({ readinessDeloadSnoozedAt: Date.now() }); update(); };

  const editing = !!sheet.editing;
  return h(Sheet, { title: 'Readiness check', left: h('span'), onClose: () => finish(sheet, w, plan.length ? 'cancelled' : 'none') }, [
    h('div.rd-result', { class: `tone-${lv.tone}` }, [
      h('div.rd-score', fmtNum(rec.avg, 1)),
      h('div', [h('div.rd-level', lv.title), h('div.small.muted', [h('span', `Sleep ${rec.sleep}`), ' · ', h('span', `Energy ${rec.energy}`), ' · ', h('span', `Soreness ${rec.soreness}`)])]),
    ]),

    offerDeload && h('div.callout.rd-deload', [
      h('div', { style: { fontWeight: 700 } }, `${streak} tired check-ins in a row`),
      h('div.small', { style: { margin: '4px 0 10px' } }, 'A deload week can help you recover: fewer sets and less weight for 7 days.'),
      h('div.hstack', [
        h(Button, { size: 'sm', onClick: startDeload }, 'Start deload week'),
        h(Button, { size: 'sm', kind: 'plain', onClick: snoozeDeload }, 'Not now'),
      ]),
    ]),

    rec.pain && h(Section, {
      title: 'Pain',
      footer: 'Sharp pain is a reason to stop, not to push through. If it doesn’t go away, see a doctor or physiotherapist.',
    }, h('div.pad', [
      h('div.rd-advice', [h('span', 'Area:'), ' ', ...areaNames.flatMap((n, i) => [i ? ', ' : '', h('span', n)])]),
      !plan.some((c) => c.kind === 'skip') && h('div.rd-advice', 'None of today’s exercises work this area much.'),
    ])),

    w.deload && h('div.callout.blue', { style: { marginBottom: '12px' } }, 'Deload week – use “Apply deload” in the workout.'),

    plan.length === 0
      ? !w.deload && h(Section, { title: 'Today' }, h('div.pad', (rec.level === 'good' ? levelAdvice('good') : ['Nothing to change in this workout – listen to your body.']).map((t, i) => h('div.rd-advice', { key: i }, t))))
      : h(Section, { title: 'Suggested changes', footer: editing ? 'Untick what you want to keep as planned.' : 'Nothing changes until you tap Apply.' },
        editing
          ? plan.map((c) => {
            const e = byId.get(c.entryId);
            return h(Row, {
              key: c.id, title: e.snapshot.name, subtitle: [h('span', changeText(c, e)), ' · ', h('span', ROLE_NAMES[c.role])],
              right: h(Toggle, { checked: chosen.has(c.id), onChange: (v) => { if (v) chosen.add(c.id); else chosen.delete(c.id); update(); } }),
            });
          })
          : h('div.pad', planSummary(plan, rec.level).map((t, i) => h('div.rd-advice.rd-change', { key: i }, [icon('check', 18), h('span', t)])))),

    plan.length > 0 && h('div.rd-actions', [
      h(Button, { block: true, onClick: approve }, editing ? `Apply ${plan.filter((c) => chosen.has(c.id)).length} changes` : 'Apply'),
      h('div.rd-actions-row', [
        h(Button, { kind: 'secondary', onClick: () => { sheet.editing = !editing; update(); } }, editing ? 'Done editing' : 'Edit'),
        h(Button, { kind: 'secondary', onClick: () => finish(sheet, w, 'cancelled') }, 'Cancel'),
      ]),
    ]),
    plan.length === 0 && h('div', { style: { padding: '4px 0 8px' } }, h(Button, { block: true, onClick: () => finish(sheet, w, 'none') }, [icon('dumbbell', 20), 'Start training'])),

    rec.level === 'high' && h(Section, { title: 'Or', footer: !w.deload && 'Light workout = the deload: half the sets and 10 % less weight.' }, [
      !w.deload && h(Row, { title: 'Light workout', chevron: true, onClick: light }),
      h(Row, { title: 'Rest day', subtitle: 'End this workout', chevron: true, onClick: restDay }),
    ]),
  ]);
}
