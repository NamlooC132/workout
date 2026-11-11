// "Log an activity": any other activity (boxing, swimming…) with a live timer.
// Stop saves the duration to History. A running activity is saved straight away, so it survives a closed app.
import { h } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, closeSheet, confirm, toast, saveActivity, deleteActivity } from '../store.js';
import { Page, Sheet, Section, Button, IconButton, TextField, NumberField, Chip, fmtDateTime, nav } from './components.js';
import { uid, fmtDuration, deepClone } from '../logic/util.js';
import { PhotoStrip, PhotoCarousel, AddPhotoButton } from './photos.js';

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

// sheet: { type: 'logActivity' } – ask for the name, then start the timer and open the activity page
export function LogActivitySheet(sheet) {
  if (sheet.name === undefined) sheet.name = '';
  const start = () => {
    const name = sheet.name.trim();
    if (!name) { toast('Write the activity name first'); return; }
    if (activeActivity()) { toast('An activity is already running'); return; }
    saveActivity({ id: uid(), name, status: 'running', startedAt: Date.now(), endedAt: null, notes: '' });
    closeSheet();
    ui.activityOpen = true;
    update();
  };
  return h(Sheet, { title: 'Log an activity' }, [
    h(Section, { title: 'What activity?' }, h('div.field-card', h(TextField, { value: sheet.name, placeholder: 'e.g. Boxing', autofocus: true, onChange: (v) => { sheet.name = v; } }))),
    h('div.chips', { style: { padding: '0 4px 12px' } }, suggestions().map((n) => h(Chip, { key: n, active: sheet.name.trim().toLowerCase() === n.toLowerCase(), onClick: () => { sheet.name = n; update(); } }, n))),
    h(Button, { block: true, size: 'lg', onClick: start }, [icon('play', 20), 'Start timer']),
  ]);
}

/** "Continue" card on the Workout tab while an activity is running (like a workout in progress). */
export function ActivityCard() {
  const a = activeActivity();
  if (!a) return null;
  return h('button.continue-card', { onclick: () => { ui.activityOpen = true; update(); } }, [
    h('div.grow', [h('div.k', 'Activity in progress'), h('div.t', a.name), h('div.small', clock(Date.now() - a.startedAt))]),
    h('span.continue-go', ['Continue activity', icon('chevronRight', 18)]),
  ]);
}

/** Bar above the tab bar while an activity is running and its page is minimized. */
export function ActivityResumeBar({ a }) {
  return h('button.resume-bar', { onclick: () => { ui.activityOpen = true; update(); } }, [
    icon('timer', 24),
    h('div.grow', { style: { textAlign: 'left' } }, [h('div.title', a.name), h('div.sub', 'Activity in progress')]),
    h('b.mono', clock(Date.now() - a.startedAt)),
    icon('chevronUp', 20),
  ]);
}

function finish(a) {
  a.status = 'done';
  a.endedAt = Date.now();
  saveActivity(a);
  ui.activityOpen = false;
  openSheet({ type: 'activity', activityId: a.id });
}

/** Full page while the activity runs – opens like a regular workout. */
export function ActivityView({ a }) {
  const menu = () => openSheet({
    type: 'actions', title: a.name, actions: [
      { text: 'Rename activity', icon: 'edit', onClick: () => openSheet({ type: 'textInput', title: 'Activity name', value: a.name, single: true, onSave: (v) => { a.name = v.trim() || a.name; saveActivity(a); } }) },
      { text: 'Minimize', icon: 'chevronDown', onClick: () => { ui.activityOpen = false; update(); } },
      { text: 'Discard activity', icon: 'trash', destructive: true, onClick: () => confirm({
        title: 'Discard this activity?', message: `${a.name} · ${clock(Date.now() - a.startedAt)}`, confirmText: 'Discard activity', destructive: true,
        onConfirm: () => { deleteActivity(a.id); ui.activityOpen = false; update(); },
      }) },
    ],
  });
  return h('div.workout', [
    h(Page, {
      title: a.name, large: false,
      left: h('button.icon-btn.back', { onclick: () => { ui.activityOpen = false; update(); }, 'aria-label': 'Minimize activity' }, icon('chevronDown', 28)),
      actions: [
        h(IconButton, { name: 'more', label: 'Activity options', onClick: menu }),
        h('button.btn.btn-green.btn-sm', { onclick: () => finish(a) }, 'Finish activity'),
      ],
    }, [
      h('div.act-hero', [
        h('div.k', 'Activity in progress'),
        h('div.act-time', clock(Date.now() - a.startedAt)),
        h('div.small.muted', `Started ${fmtDateTime(a.startedAt)}`),
      ]),
      h(Section, { title: 'Note' }, h('div.field-card', h(TextField, { value: a.notes, placeholder: 'e.g. sparring, felt strong', multiline: true, onChange: (v) => { a.notes = v; saveActivity(a); } }))),
      h('div.mt', h(Button, { block: true, size: 'lg', onClick: () => finish(a) }, [icon('check', 20), 'Finish activity'])),
    ]),
  ]);
}

// sheet: { type: 'activity', activityId } – "Activity complete" summary (like Workout complete)
export function ActivitySheet(sheet) {
  const a = data.activities.find((x) => x.id === sheet.activityId);
  if (!a) return null;
  const done = () => { closeSheet(); nav('/history'); };
  return h(Sheet, { title: 'Activity complete', left: h('button.link-btn', { onclick: closeSheet }, 'Back') }, [
    h('div.center', { style: { fontSize: '42px', margin: '6px 0 2px' } }, '💪'),
    h('div.center', { style: { fontSize: '21px', fontWeight: 800, marginBottom: '14px' } }, a.name),
    h('div.summary-strip', { style: { gridTemplateColumns: 'repeat(2, 1fr)' } }, [
      h('div.stat', [h('div.v', fmtDuration(Math.max(activityMs(a), 60000))), h('div.k', 'Duration')]),
      h('div.stat', [h('div.v', new Date(a.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })), h('div.k', 'Date')]),
    ]),
    a.notes && h('div.callout', { style: { marginBottom: '12px' } }, [icon('note', 18), a.notes]),
    h(Section, { title: 'Photos' }, h('div.pad', [PhotoStrip({ workoutId: a.id }), AddPhotoButton({ workoutId: a.id })])),
    h('div.mt', h(Button, { block: true, size: 'lg', onClick: done }, 'Done')),
  ]);
}

/** History page of one activity (like a finished workout): numbers + editable name, minutes, note. */
export function ActivityDetailScreen({ id }) {
  const a = data.activities.find((x) => x.id === id && x.status === 'done');
  if (!a) return h(Page, { title: 'Activity', backTo: '/history' }, h('div.empty', 'Activity not found'));
  const mins = Math.max(1, Math.round(activityMs(a) / 60000));
  const del = () => confirm({
    title: 'Delete this activity?', message: `${a.name} · ${fmtDateTime(a.startedAt)}`, confirmText: 'Delete activity', destructive: true,
    onConfirm: () => { deleteActivity(a.id); nav('/history'); },
  });
  return h(Page, { title: a.name, backTo: '/history', large: false }, [
    PhotoCarousel({ workoutId: a.id }),
    h('div.stat-grid.two', [
      h('div.stat', [h('div.k', 'Date'), h('div.v', new Date(a.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })), h('div.s', new Date(a.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))]),
      h('div.stat', [h('div.k', 'Duration'), h('div.v', fmtDuration(mins * 60000))]),
    ]),
    h(Section, { title: 'Activity' }, h('div.field-card', h(TextField, { value: a.name, placeholder: 'Activity name', onChange: (v) => { a.name = v.trim() || a.name; saveActivity(a); } }))),
    h(Section, { title: 'Minutes' }, h('div.field-card', h(NumberField, { value: mins, decimals: false, placeholder: '0', ariaLabel: 'Minutes', onChange: (v) => { if (v > 0) { a.endedAt = a.startedAt + v * 60000; saveActivity(a); } } }))),
    h(Section, { title: 'Note' }, h('div.field-card', h(TextField, { value: a.notes, placeholder: 'e.g. sparring, felt strong', multiline: true, onChange: (v) => { a.notes = v; saveActivity(a); } }))),
    h('div', { style: { margin: '8px 0 4px' } }, AddPhotoButton({ workoutId: a.id })),
    h('div.mt', h(Button, { block: true, kind: 'danger', onClick: del }, 'Delete activity')),
  ]);
}
