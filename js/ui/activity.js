// "Log an activity": any other activity (boxing, swimming…) with a live timer.
// Stop saves the duration to History. A running activity is saved straight away, so it survives a closed app.
import { h } from '../vdom.js';
import { icon } from './icons.js';
import { data, update, openSheet, closeSheet, confirm, toast, saveActivity, deleteActivity } from '../store.js';
import { Sheet, Section, Button, TextField, NumberField, Chip, fmtDateTime } from './components.js';
import { uid, fmtDuration, deepClone } from '../logic/util.js';

const DEFAULT_NAMES = ['Boxing', 'Swimming', 'Cycling', 'Walking', 'Football', 'Basketball'];

export const activeActivity = () => (data.activities || []).find((a) => a.status === 'running') || null;
export const activityMs = (a) => Math.max(0, (a.endedAt || a.startedAt) - a.startedAt);

function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

/** Recent activity names first, then the defaults. */
function suggestions() {
  const seen = new Set(), out = [];
  const recent = [...(data.activities || [])].filter((a) => a.status === 'done').sort((a, b) => b.startedAt - a.startedAt);
  for (const n of [...recent.map((a) => a.name), ...DEFAULT_NAMES]) {
    const k = n.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(n.trim());
    if (out.length >= 8) break;
  }
  return out;
}

// sheet: { type: 'logActivity' } – ask for the name, then start the timer
export function LogActivitySheet(sheet) {
  if (sheet.name === undefined) sheet.name = '';
  const start = () => {
    const name = sheet.name.trim();
    if (!name) { toast('Write the activity name first'); return; }
    if (activeActivity()) { toast('An activity is already running'); return; }
    saveActivity({ id: uid(), name, status: 'running', startedAt: Date.now(), endedAt: null, notes: '' });
    closeSheet();
  };
  return h(Sheet, { title: 'Log an activity' }, [
    h(Section, { title: 'What activity?' }, h('div.field-card', h(TextField, { value: sheet.name, placeholder: 'e.g. Boxing', autofocus: true, onChange: (v) => { sheet.name = v; } }))),
    h('div.chips', { style: { padding: '0 4px 12px' } }, suggestions().map((n) => h(Chip, { key: n, active: sheet.name.trim().toLowerCase() === n.toLowerCase(), onClick: () => { sheet.name = n; update(); } }, n))),
    h(Button, { block: true, size: 'lg', onClick: start }, [icon('play', 20), 'Start timer']),
  ]);
}

/** Card on the Workout tab while an activity is running. */
export function ActivityCard() {
  const a = activeActivity();
  if (!a) return null;
  const stop = () => {
    a.status = 'done';
    a.endedAt = Date.now();
    saveActivity(a);
    openSheet({ type: 'activity', activityId: a.id, saved: true });
  };
  const discard = () => confirm({
    title: 'Discard this activity?', message: `${a.name} · ${clock(Date.now() - a.startedAt)}`, confirmText: 'Discard', destructive: true,
    onConfirm: () => deleteActivity(a.id),
  });
  return h('div.activity-card', [
    h('div.k', 'Activity in progress'),
    h('div.t', a.name),
    h('div.act-time', clock(Date.now() - a.startedAt)),
    h('div.act-btns', [
      h(Button, { size: 'lg', onClick: stop }, [icon('check', 20), 'Stop & save']),
      h('button.link-btn', { onclick: discard }, 'Discard'),
    ]),
  ]);
}

// sheet: { type: 'activity', activityId, saved? } – name, minutes, note (also used to edit from History)
export function ActivitySheet(sheet) {
  const a = data.activities.find((x) => x.id === sheet.activityId);
  if (!a) return null;
  if (!sheet.draft) { sheet.draft = deepClone(a); sheet.min = Math.max(1, Math.round(activityMs(a) / 60000)); sheet.min0 = sheet.min; }
  const d = sheet.draft;
  const save = () => {
    d.name = d.name.trim() || 'Activity';
    if (sheet.min !== sheet.min0 && sheet.min > 0) d.endedAt = d.startedAt + sheet.min * 60000;
    saveActivity(d);
    closeSheet();
  };
  const del = () => confirm({
    title: 'Delete this activity?', message: `${a.name} · ${fmtDateTime(a.startedAt)}`, confirmText: 'Delete activity', destructive: true,
    onConfirm: () => { deleteActivity(a.id); closeSheet(); },
  });
  return h(Sheet, { title: sheet.saved ? 'Activity saved' : 'Activity', actions: [h('button.link-btn.strong', { onclick: save }, 'Done')] }, [
    h('div.center', { style: { fontSize: '34px', fontWeight: 800, margin: '4px 0' } }, fmtDuration(sheet.min * 60000)),
    h('div.center.muted.small', { style: { marginBottom: '12px' } }, fmtDateTime(a.startedAt)),
    h(Section, { title: 'Activity' }, h('div.field-card', h(TextField, { value: d.name, placeholder: 'Activity name', onChange: (v) => { d.name = v; } }))),
    h(Section, { title: 'Minutes' }, h('div.field-card', h(NumberField, { value: sheet.min, decimals: false, placeholder: '0', ariaLabel: 'Minutes', onChange: (v) => { sheet.min = v || 0; } }))),
    h(Section, { title: 'Note' }, h('div.field-card', h(TextField, { value: d.notes, placeholder: 'e.g. sparring, felt strong', multiline: true, onChange: (v) => { d.notes = v; } }))),
    h('div.mt', h(Button, { block: true, kind: 'danger', onClick: del }, 'Delete activity')),
  ]);
}
