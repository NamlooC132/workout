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
export function HealthBox({ health, from, to, onChange, onDistance, buttons = true }) {
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
    buttons && h('div.health-btns', [
      h('button.btn.btn-secondary.btn-sm', { onclick: () => getFromHealth(from, to) }, [icon('heart', 16), 'Get from Health']),
      h('button.btn.btn-plain.btn-sm', { onclick: () => pasteFromHealth(apply, from, to) }, [icon('copy', 16), 'Paste']),
    ]),
    buttons && h('div.health-note', '(To get the shortcut ask Freddy)'),
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
  const isNew = sheet.isNew;
  const clearStart = () => { sheet.startAt = null; sheet.startMin = null; sheet.applied = false; update(); };
  const setStart = (t, min = null) => { sheet.startAt = Math.round(t / 60000) * 60000; sheet.startMin = min; sheet.applied = false; update(); };
  // New run: the time runs from your start until you tapped Get from Health (or now).
  const winEnd = () => sheet.endAt || Date.now();
  const dur = isNew && !sheet.applied ? (sheet.startAt ? Math.max(0, Math.round((winEnd() - sheet.startAt) / 1000)) : 0) : runDurationS(d);
  const parts = { h: Math.floor(dur / 3600), m: Math.floor((dur % 3600) / 60), s: dur % 60 };
  const setDur = (k, v) => { parts[k] = v || 0; d.endedAt = d.startedAt + (parts.h * 3600 + parts.m * 60 + parts.s) * 1000; update(); };
  const pace = d.run.km > 0 && dur > 0 ? dur / d.run.km : null;
  const canSave = d.run.km > 0 && dur > 0;
  const save = () => {
    if (isNew && !sheet.applied && sheet.startAt) { d.startedAt = sheet.startAt; d.endedAt = winEnd(); }
    saveWorkout(deepClone(d));
    closeSheet();
    toast(isNew ? 'Run saved 🏃' : 'Run updated');
    if (isNew) nav('/history');
  };
  const useRun = (run) => {
    d.startedAt = run.from; d.endedAt = run.to; d.run.km = run.km;
    const hd = sheet.healthText ? parseHealthText(sheet.healthText, run.from, run.to) : null;
    if (hd) { if (hd.hr !== null) d.health.hr = hd.hr; if (hd.kcal !== null) d.health.kcal = hd.kcal; }
    sheet.found = null; sheet.applied = true; sheet.startAt = run.from; sheet.startMin = null;
    toast(`Found your run: ${fmtKm(run.km)} · ${fmtRunTime(runDurationS(d))} 🏃`, 3500);
    update();
  };
  // Your way: you say when you started; the run ends when you tapped Get from Health.
  const useWindow = (t) => {
    const from = sheet.startAt, to = winEnd();
    const r = parseHealthText(t, from, to);
    if (!r) return false;
    d.startedAt = from; d.endedAt = to; sheet.applied = true;
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
    if (!runs.length) { sheet.found = []; toast('No run found in the last 2 days – pick when you started', 4000); }
    else if (runs.length === 1) useRun(runs[0]);
    else { sheet.found = runs.slice(0, 6); toast('Pick your run'); }
    update();
    return true;
  });
  const dayLabel = (ms) => { const t = new Date(ms), now = new Date(); const y = new Date(now); y.setDate(now.getDate() - 1); return t.toDateString() === now.toDateString() ? 'Today' : t.toDateString() === y.toDateString() ? 'Yesterday' : t.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); };
  const hhmm = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const ago = sheet.customAgo || { h: 0, m: 30 };
  const setAgo = (k, v) => { ago[k] = Number(v); sheet.customAgo = ago; setStart(Date.now() - (ago.h * 60 + ago.m) * 60000, 'custom'); };

  const sheetProps = {
    title: isNew ? 'Log a run' : 'Edit run', full: true,
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: [h('button.link-btn.strong', { onclick: save, disabled: !canSave }, 'Save')],
  };

  // ---------- Edit an existing run: plain form ----------
  if (!isNew) {
    return h(Sheet, sheetProps, [
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
      h(Section, { title: 'Heart rate & calories' }, h('div.pad', HealthBox({ health: d.health, from: d.startedAt, to: d.endedAt, onChange: () => update(), onDistance: (km) => { d.run.km = km; } }))),
      h(Section, { title: 'Notes' }, h('div.field-card', h(TextField, { value: d.notes, placeholder: 'e.g. easy run, hills, felt great', multiline: true, onChange: (v) => { d.notes = v; } }))),
    ]);
  }

  // ---------- New run: 1. when you started → 2. Health → your run ----------
  const startLabel = sheet.startAt ? `${dayLabel(sheet.startAt)}, ${hhmm(sheet.startAt)}` : 'Pick a time';
  const done = sheet.applied && d.run.km > 0;
  const quick = [[15, '15 min'], [20, '20 min'], [30, '30 min'], [45, '45 min'], [60, '1 h'], [90, '1½ h']];
  return h(Sheet, sheetProps, [
    // Step 1
    h('div.lr-step', [
      h('div.lr-head', [h('span.lr-num', '1'), h('div', [h('div.lr-title', 'When did you start?'), h('div.lr-sub', 'The run ends when you tap Get from Health')])]),
      h('div.lr-chips', [
        ...quick.map(([m, l]) => h('button', { key: m, class: cx('lr-chip', sheet.startMin === m && 'on'), onclick: () => (sheet.startMin === m ? clearStart() : setStart(Date.now() - m * 60000, m)) }, [h('b', l), h('small', 'ago')])),
        h('button', { key: 'c', class: cx('lr-chip', sheet.startMin === 'custom' && 'on'), onclick: () => { if (sheet.startMin === 'custom') return clearStart(); sheet.customAgo = ago; setStart(Date.now() - (ago.h * 60 + ago.m) * 60000, 'custom'); } }, [h('b', 'Custom'), h('small', 'ago')]),
      ]),
      sheet.startMin === 'custom' && h('div.lr-ago', [
        h('label.lr-wheel', [h('select', { 'aria-label': 'Hours ago', onchange: (e) => setAgo('h', e.target.value) }, [0, 1, 2, 3, 4, 5, 6].map((x) => h('option', { value: x, selected: ago.h === x }, String(x)))), h('span', 'h')]),
        h('label.lr-wheel', [h('select', { 'aria-label': 'Minutes ago', onchange: (e) => setAgo('m', e.target.value) }, Array.from({ length: 60 }, (_, x) => h('option', { value: x, selected: ago.m === x }, String(x).padStart(2, '0')))), h('span', 'min')]),
        h('span.lr-ago-l', 'ago'),
      ]),
      h('div.lr-start-wrap', [h('label.lr-start', [
        icon('calendar', 18),
        h('span.grow', [h('span.muted', 'Started  '), h('b', startLabel)]),
        sheet.startAt && !sheet.applied && h('span.lr-so-far', fmtRunTime(dur)),
        // the real (invisible) date & time picker sits on top
        h('input.lr-native', { type: 'datetime-local', 'aria-label': 'Start date and time', value: dtLocal(sheet.startAt || Date.now() - 30 * 60000), onchange: (e) => {
          const t = new Date(e.target.value).getTime();
          if (!Number.isFinite(t)) return;
          if (t > Date.now()) { toast('That time is in the future'); return; }
          setStart(t, null);
        } }),
      ]),
      sheet.startAt && h('button.lr-clear', { onclick: clearStart, 'aria-label': 'Clear start time' }, icon('x', 18)),
      ]),
    ]),

    // Step 2
    h('div.lr-step', [
      h('div.lr-head', [h('span.lr-num', '2'), h('div', [h('div.lr-title', 'Get your run from Health'), h('div.lr-sub', 'Tap Get, come back, then Paste')])]),
      h('div.lr-btns', [
        h('button.btn.btn-primary', { onclick: () => { sheet.endAt = Date.now(); getFromHealth(Date.now() - 2 * 86400000, Date.now()); } }, [icon('heart', 18), 'Get from Health']),
        h('button.btn.btn-secondary', { onclick: findRun }, [icon('copy', 18), 'Paste']),
      ]),
      sheet.found && sheet.found.length > 1 && h('div.fr-list', sheet.found.map((r) => h('button.fr-item', { key: r.from, onclick: () => useRun(r) }, [
        h('div.grow', [h('b', `${dayLabel(r.from)} · ${hhmm(r.from)}`), h('div.small.muted', `${fmtRunTime(Math.round((r.to - r.from) / 1000))} · ${fmtPace((r.to - r.from) / 1000 / r.km)} /km`)]),
        h('span.fr-km', fmtKm(r.km)),
      ]))),
      h('div.lr-note', sheet.startAt ? 'To get the shortcut ask Freddy' : 'No start time? Tap Get and Paste anyway – the app finds your run. · To get the shortcut ask Freddy'),
    ]),

    // Result
    h('div', { class: cx('lr-result', done && 'done') }, [
      h('div.lr-r-k', done ? 'Your run' : 'Your run will appear here'),
      h('div.lr-r-km', [h('input.lr-km-input', {
        type: 'text', inputmode: 'decimal', placeholder: '0.00', 'aria-label': 'Distance in km', value: d.run.km ? String(d.run.km) : '',
        style: { width: `${Math.max(4, (d.run.km ? String(d.run.km) : '0.00').length) * 0.55 + 0.1}em` },
        onfocus: (e) => { const el = e.target; setTimeout(() => { try { el.select(); } catch { /* ignore */ } }, 0); },
        oninput: (e) => { const v = parseFloat(e.target.value.replace(',', '.')); d.run.km = Number.isFinite(v) && v > 0 ? v : null; e.target.style.width = `${Math.max(4, e.target.value.length) * 0.55 + 0.1}em`; },
        onblur: () => update(),
      }), h('span', 'km')]),
      h('div.lr-r-grid', [
        h('div.lr-cell', [h('div.k', 'Time'), h('div.v', dur ? fmtRunTime(dur) : '–')]),
        h('div.lr-cell', [h('div.k', 'Pace'), h('div.v', pace ? fmtPace(pace) : '–'), h('div.u', '/km')]),
        h('label.lr-cell', [h('div.k', 'Avg HR'), h('div.v', h(NumberField, { value: d.health.hr ?? null, decimals: false, placeholder: '–', class: 'lr-cell-input', ariaLabel: 'Average heart rate', onChange: (v) => { d.health.hr = v; } })), h('div.u', 'bpm')]),
        h('label.lr-cell', [h('div.k', 'Calories'), h('div.v', h(NumberField, { value: d.health.kcal ?? null, decimals: false, placeholder: '–', class: 'lr-cell-input', ariaLabel: 'Calories', onChange: (v) => { d.health.kcal = v; } })), h('div.u', 'kcal')]),
      ]),
    ]),
    sheet.noteOpen || d.notes
      ? h('div.field-card.mt', h(TextField, { value: d.notes, placeholder: 'How did it feel?', multiline: true, autofocus: !d.notes, onChange: (v) => { d.notes = v; } }))
      : h('button.lr-add-note', { onclick: () => { sheet.noteOpen = true; update(); } }, [icon('note', 16), 'Add a note']),
  ]);
}

function dtLocal(ms) {
  const t = new Date(ms), p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
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


