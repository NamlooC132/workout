// Heart rate & calories box (with "Get from Health" via an Apple Shortcut) and runs.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, update, closeSheet, openSheet, saveWorkout, deleteWorkout, confirm, toast } from '../store.js';
import { Page, Section, Row, Empty, Button, Sheet, NumberField, TextField, Chip, nav, fmtDate, fmtDateTime } from './components.js';
import { uid, deepClone } from '../logic/util.js';
import { shortcutUrl, parseHealthText, detectRuns, paceS, fmtPace, fmtRunTime, fmtKm, runDurationS } from '../logic/health.js';

/** Opens the Shortcut for a time window. */
export function getFromHealth(from, to) {
  if (!(to > from)) { toast('Set the start time and duration first'); return; }
  window.location.href = shortcutUrl(from, to);
}

/** Gets the clipboard text (asks for a manual paste if the browser won't allow it), then calls use(text) → true if it was understood. */
async function withClipboard(use) {
  let text = null;
  try { text = await navigator.clipboard.readText(); } catch { /* not allowed – use the box */ }
  if (text && use(text)) return;
  openSheet({
    type: 'textInput', title: 'Paste from Health', single: true, placeholder: 'Long-press here → Paste',
    onSave: (v) => { if (!use(v)) toast('Couldn’t read that – run the shortcut again'); },
  });
}

/** Reads the Shortcut's result from the clipboard (falls back to a paste box) and keeps the readings in [from, to]. */
export async function pasteFromHealth(apply, from, to) {
  await withClipboard((t) => {
    const r = parseHealthText(t, from, to);
    if (!r) return false;
    if (r.empty) toast('No Health data in this time window – did you wear your Watch?', 4000);
    else { apply(r); toast(healthToast(r) + (r.dailyKcal ? ' · calories need an Apple Watch' : ''), r.dailyKcal ? 4500 : 2600); }
    return true;
  });
}

function healthToast(r) {
  return ['Got', r.hr !== null && `${r.hr} bpm`, r.kcal !== null && `${r.kcal} kcal`, r.km !== null && fmtKm(r.km)].filter(Boolean).join(' · ');
}

/**
 * Heart rate + calories inputs with the Health buttons.
 * health: object to edit ({ hr, kcal }); window: [from, to]; onChange(); onDistance(km) for runs.
 */
export function HealthBox({ health, from, to, onChange, onDistance }) {
  const apply = (r) => {
    if (r.hr !== null) health.hr = r.hr;
    if (r.kcal !== null) health.kcal = r.kcal;
    if (r.km !== null && onDistance) onDistance(r.km);
    onChange();
    update();
  };
  return h('div.health-box', [
    h('div.health-fields', [
      h('label.hf', [h('span.hf-k', [icon('heart', 16), 'Avg heart rate']), h('div.hf-v', [h(NumberField, { value: health.hr ?? null, decimals: false, placeholder: '–', class: 'hf-input', ariaLabel: 'Average heart rate', onChange: (v) => { health.hr = v; onChange(); } }), h('span.hf-u', 'bpm')])]),
      h('label.hf', [h('span.hf-k', [icon('flame', 16), 'Calories']), h('div.hf-v', [h(NumberField, { value: health.kcal ?? null, decimals: false, placeholder: '–', class: 'hf-input', ariaLabel: 'Calories', onChange: (v) => { health.kcal = v; onChange(); } }), h('span.hf-u', 'kcal')])]),
    ]),
    h('div.health-btns', [
      h('button.btn.btn-secondary.btn-sm', { onclick: () => getFromHealth(from, to) }, [icon('heart', 16), 'Get from Health']),
      h('button.btn.btn-plain.btn-sm', { onclick: () => pasteFromHealth(apply, from, to) }, [icon('copy', 16), 'Paste']),
    ]),
    h('div.health-note', '(To get the shortcut ask Freddy)'),
  ]);
}

// ---------- Log / edit a run ----------
// sheet: { type: 'logRun', runId? }
export function LogRunSheet(sheet) {
  if (!sheet.draft) {
    const existing = sheet.runId && data.workouts.find((w) => w.id === sheet.runId);
    if (existing) sheet.draft = deepClone(existing);
    else {
      const start = Math.floor((Date.now() - 45 * 60000) / 300000) * 300000;
      sheet.draft = { id: uid(), kind: 'run', status: 'done', routineId: null, routineName: 'Run', startedAt: start, endedAt: start, entries: [], notes: '', run: { km: null }, health: { hr: null, kcal: null } };
    }
    sheet.isNew = !existing;
  }
  const d = sheet.draft;
  const dur = runDurationS(d);
  const parts = { h: Math.floor(dur / 3600), m: Math.floor((dur % 3600) / 60), s: dur % 60 };
  const setDur = (k, v) => { parts[k] = v || 0; d.endedAt = d.startedAt + (parts.h * 3600 + parts.m * 60 + parts.s) * 1000; update(); };
  const pace = paceS(d);
  const canSave = d.run.km > 0 && dur > 0;
  const save = () => {
    saveWorkout(deepClone(d));
    closeSheet();
    toast(sheet.isNew ? 'Run saved 🏃' : 'Run updated');
    if (sheet.isNew) nav('/history');
  };
  const useRun = (run) => {
    d.startedAt = run.from; d.endedAt = run.to; d.run.km = run.km;
    const hd = sheet.healthText ? parseHealthText(sheet.healthText, run.from, run.to) : null;
    if (hd) { if (hd.hr !== null) d.health.hr = hd.hr; if (hd.kcal !== null) d.health.kcal = hd.kcal; }
    sheet.found = null;
    toast(`Found your run: ${fmtKm(run.km)} · ${fmtRunTime(runDurationS(d))} 🏃`, 3500);
    update();
  };
  // Your way: you say when you started, "now" is when you finished.
  const useWindow = (t) => {
    const from = sheet.startAt, to = sheet.endAt || Date.now();
    const r = parseHealthText(t, from, to);
    if (!r) return false;
    d.startedAt = from; d.endedAt = to;
    if (r.km !== null) d.run.km = r.km;
    if (r.hr !== null) d.health.hr = r.hr;
    if (r.kcal !== null) d.health.kcal = r.kcal;
    toast(r.km !== null ? `Your run: ${fmtKm(r.km)} · ${fmtRunTime(runDurationS(d))} 🏃` : 'No distance found for that time – check the start time', 3500);
    update();
    return true;
  };
  const findRun = () => withClipboard((t) => {
    if (sheet.startAt) return useWindow(t);
    const runs = detectRuns(t);
    if (runs === null) return false;
    sheet.healthText = t;
    if (!runs.length) { sheet.found = []; toast('No run found in the last 2 days – fill it in below', 4000); }
    else if (runs.length === 1) useRun(runs[0]);
    else { sheet.found = runs.slice(0, 6); toast('Pick your run'); }
    update();
    return true;
  });
  const dayLabel = (ms) => { const t = new Date(ms), now = new Date(); const y = new Date(now); y.setDate(now.getDate() - 1); return t.toDateString() === now.toDateString() ? 'Today' : t.toDateString() === y.toDateString() ? 'Yesterday' : t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
  const hhmm = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const hhmm24 = (ms) => { const t = new Date(ms); return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };

  return h(Sheet, {
    title: sheet.isNew ? 'Log a run' : 'Edit run', full: true,
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: [h('button.link-btn.strong', { onclick: save, disabled: !canSave }, 'Save')],
  }, [
    sheet.isNew && h('div.find-run', [
      h('div.fr-t', [icon('run', 20), 'Just finished a run?']),
      h('div.fr-s', 'When did you start? The run ends now.'),
      h('div.chips.fr-chips', [
        ...[15, 20, 30, 45, 60, 90].map((m) => h(Chip, { key: m, active: sheet.startMin === m, onClick: () => { sheet.startMin = m; sheet.startAt = Math.round((Date.now() - m * 60000) / 60000) * 60000; update(); } }, m < 60 ? `${m} min ago` : m === 60 ? '1 h ago' : '1½ h ago')),
      ]),
      h('div.fr-time', [
        h('span', 'Started at'),
        h('input.select', { type: 'time', value: sheet.startAt ? hhmm24(sheet.startAt) : '', onchange: (e) => {
          const [hh, mm] = e.target.value.split(':').map(Number);
          if (!Number.isFinite(hh)) return;
          const t = new Date(); t.setHours(hh, mm, 0, 0);
          if (t.getTime() > Date.now()) t.setDate(t.getDate() - 1); // e.g. 23:30 picked after midnight
          sheet.startAt = t.getTime(); sheet.startMin = null; update();
        } }),
        sheet.startAt && h('span.muted.small', `→ now (${fmtRunTime(Math.max(0, Math.round((Date.now() - sheet.startAt) / 1000)))})`),
      ]),
      h('div.fr-btns', [
        h('button.btn.btn-primary', { onclick: () => { sheet.endAt = Date.now(); getFromHealth(Date.now() - 2 * 86400000, Date.now()); } }, [h('span.fr-n', '1'), 'Get from Health']),
        h('button.btn.btn-secondary', { onclick: findRun }, [h('span.fr-n', '2'), 'Paste']),
      ]),
      sheet.found && sheet.found.length > 1 && h('div.fr-list', sheet.found.map((r) => h('button.fr-item', { key: r.from, onclick: () => useRun(r) }, [
        h('div.grow', [h('b', `${dayLabel(r.from)} · ${hhmm(r.from)}`), h('div.small.muted', `${fmtRunTime(Math.round((r.to - r.from) / 1000))} · ${fmtPace((r.to - r.from) / 1000 / r.km)} /km`)]),
        h('span.fr-km', fmtKm(r.km)),
      ]))),
      h('div.health-note', sheet.startAt ? '(To get the shortcut ask Freddy)' : 'No start time? Paste anyway and the app looks for your run by itself. (To get the shortcut ask Freddy)'),
    ]),
    sheet.isNew && h('div.section-head', { style: { margin: '6px 4px 6px' } }, h('span', 'Or enter it yourself')),
    h('div.run-hero', [
      h('div.run-stat', [h('div.k', 'Distance'), h('div.run-big', [h(NumberField, { value: d.run.km, placeholder: '0.00', class: 'run-input', ariaLabel: 'Distance in km', onChange: (v) => { d.run.km = v; update(); } }), h('span', 'km')])]),
      h('div.run-stat', [h('div.k', 'Time'), h('div.run-time', [
        h(NumberField, { value: parts.h || null, decimals: false, placeholder: '0', class: 'rt-input', ariaLabel: 'Hours', onChange: (v) => setDur('h', v) }), h('span', ':'),
        h(NumberField, { value: parts.m || null, decimals: false, placeholder: '00', class: 'rt-input', ariaLabel: 'Minutes', onChange: (v) => setDur('m', v) }), h('span', ':'),
        h(NumberField, { value: parts.s || null, decimals: false, placeholder: '00', class: 'rt-input', ariaLabel: 'Seconds', onChange: (v) => setDur('s', v) }),
      ]), h('div.rt-cap', 'h : min : sec')]),
      h('div.run-pace', pace ? [h('b', fmtPace(pace)), ' /km average pace'] : 'Pace appears when you add distance and time'),
    ]),
    h(Section, { title: 'When' }, h(Row, { title: 'Started', right: dateTimeInput(d.startedAt, (t) => { const len = d.endedAt - d.startedAt; d.startedAt = t; d.endedAt = t + len; update(); }) })),
    h(Section, { title: 'Heart rate & calories', footer: 'Get from Health fills these (and the distance) from your Apple Watch for the time above.' },
      h('div.pad', HealthBox({ health: d.health, from: d.startedAt, to: d.endedAt, onChange: () => update(), onDistance: (km) => { d.run.km = km; } }))),
    h(Section, { title: 'Notes' }, h('div.field-card', h(TextField, { value: d.notes, placeholder: 'e.g. easy run, hills, felt great', multiline: true, onChange: (v) => { d.notes = v; } }))),
  ]);
}

export function dateTimeInput(ms, onChange) {
  const dt = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  const val = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
  return h('input.select', { type: 'datetime-local', value: val, onchange: (e) => { const t = new Date(e.target.value).getTime(); if (Number.isFinite(t)) onChange(t); } });
}

// ---------- Run detail ----------
export function RunDetailScreen({ w }) {
  const pace = paceS(w);
  const del = () => confirm({
    title: 'Delete this run?', message: `${fmtKm(w.run?.km)} · ${fmtDateTime(w.startedAt)}`, confirmText: 'Delete run', destructive: true,
    onConfirm: () => { const copy = deepClone(w); deleteWorkout(w.id); nav('/history'); toast('Run deleted', 6000, { text: 'Undo', onClick: () => saveWorkout(copy) }); },
  });
  return h(Page, {
    title: w.routineName || 'Run', backTo: '/history', large: false,
    actions: [h('button.link-btn.strong', { onclick: () => openSheet({ type: 'logRun', runId: w.id }) }, 'Edit')],
  }, [
    h('div.run-card', [
      h('div.run-when', fmtDateTime(w.startedAt)),
      h('div.run-km', [String((w.run?.km ?? 0).toFixed(2)), h('small', ' km')]),
      h('div.run-grid', [
        cell('Time', fmtRunTime(runDurationS(w))),
        cell('Pace', pace ? `${fmtPace(pace)} /km` : '–'),
        cell('Avg HR', w.health?.hr ? `${w.health.hr} bpm` : '–'),
        cell('Calories', w.health?.kcal ? `${w.health.kcal} kcal` : '–'),
      ]),
    ]),
    w.notes && h('div.callout.mt', [icon('note', 18), w.notes]),
    !(w.health?.hr || w.health?.kcal) && h(Section, { title: 'Heart rate & calories' }, h('div.pad', HealthBox({ health: (w.health = w.health || { hr: null, kcal: null }), from: w.startedAt, to: w.endedAt, onChange: () => saveWorkout(w), onDistance: (km) => { w.run.km = km; } }))),
    h('div.mt', h(Button, { kind: 'danger', block: true, onClick: del }, [icon('trash', 18), 'Delete run'])),
  ]);
}

function cell(k, v) {
  return h('div.rc', [h('div.k', k), h('div.v', v)]);
}

/** History row subtitle for a run. */
export function runSummary(w) {
  const pace = paceS(w);
  return [fmtKm(w.run?.km), fmtRunTime(runDurationS(w)), pace && `${fmtPace(pace)} /km`, w.health?.hr && `♥ ${w.health.hr}`].filter(Boolean).join(' · ');
}


