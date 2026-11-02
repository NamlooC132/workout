// App entry: loads data, routes between screens, renders the tab bar, sheets and the live workout.
import { h, render, cx } from './vdom.js';
import { icon } from './ui/icons.js';
import { data, ui, update, setRenderer, load, activeWorkout, toast } from './store.js';
import { Dialog, Toast, nav } from './ui/components.js';
import { RoutinesScreen, RoutineScreen, NewRoutineSheet, RoutineMetaSheet, ItemEditorSheet } from './ui/routines.js';
import { LibraryScreen, PickerSheet, ExerciseEditorSheet } from './ui/exercises.js';
import { WorkoutView, RestPanel, ManualRestSheet, SetMenuSheet, TextInputSheet, FinishSummarySheet, ExHistorySheet } from './ui/workout.js';
import { HistoryScreen, WorkoutDetailScreen, ExerciseScreen } from './ui/history.js';
import { ProgressScreen, MeasurementSheet } from './ui/progress.js';
import { PlanScreen, BlockEditorSheet } from './ui/plan.js';
import { MuscleViewSheet } from './ui/muscleview.js';
import { HowToSheet } from './ui/howto.js';
import { DataInfoSheet } from './ui/datainfo.js';
import { LogRunSheet } from './ui/health.js';
import { SettingsScreen, AdvancedSettingsScreen, ExportRoutinesSheet, ImportPreviewSheet, TargetsSheet, MusclesSheet, ActionsSheet } from './ui/settings.js';
import { resumeTimer, unlockAudio, syncWakeLock } from './timer.js';
import { fmtDuration } from './logic/util.js';

const SHEETS = {
  muscleView: MuscleViewSheet,
  logRun: LogRunSheet,
  picker: PickerSheet,
  exerciseEditor: ExerciseEditorSheet,
  newRoutine: NewRoutineSheet,
  routineMeta: RoutineMetaSheet,
  itemEditor: ItemEditorSheet,
  manualRest: ManualRestSheet,
  setMenu: SetMenuSheet,
  exHistory: ExHistorySheet,
  howTo: HowToSheet,
  dataInfo: DataInfoSheet,
  textInput: TextInputSheet,
  finishSummary: FinishSummarySheet,
  measurement: MeasurementSheet,
  blockEditor: BlockEditorSheet,
  exportRoutines: ExportRoutinesSheet,
  importPreview: ImportPreviewSheet,
  targets: TargetsSheet,
  muscles: MusclesSheet,
  actions: ActionsSheet,
};

// ---------- Routing ----------
const ROUTES = [
  [/^\/routines$/, () => h(RoutinesScreen), 'routines'],
  [/^\/routine\/(.+)$/, (m) => h(RoutineScreen, { id: m[1] }), 'routines'],
  [/^\/library$/, () => h(LibraryScreen), null],
  [/^\/plan$/, () => h(PlanScreen), 'routines'],
  [/^\/exercise\/(.+)$/, (m) => h(ExerciseScreen, { id: m[1] }), null],
  [/^\/history$/, () => h(HistoryScreen), 'history'],
  [/^\/workout\/(.+)$/, (m) => h(WorkoutDetailScreen, { id: m[1] }), 'history'],
  [/^\/progress$/, () => h(ProgressScreen), 'progress'],
  [/^\/settings$/, () => h(SettingsScreen), 'settings'],
  [/^\/settings\/advanced$/, () => h(AdvancedSettingsScreen), 'settings'],
];

let lastTab = 'routines';
function currentRoute() {
  const path = location.hash.replace(/^#/, '') || '/routines';
  for (const [re, view, tab] of ROUTES) {
    const m = path.match(re);
    if (m) {
      if (tab) lastTab = tab;
      return { view: view(m), tab: lastTab };
    }
  }
  return { view: h(RoutinesScreen), tab: 'routines' };
}

const TABS = [
  { key: 'routines', path: '/routines', label: 'Workout', icon: 'dumbbell' },
  { key: 'history', path: '/history', label: 'History', icon: 'history' },
  { key: 'progress', path: '/progress', label: 'Progress', icon: 'chart' },
  { key: 'settings', path: '/settings', label: 'Settings', icon: 'gear' },
];

function TabBar({ tab }) {
  return h('nav.tabbar', TABS.map((t) => h('button', {
    key: t.key, class: cx('tab', tab === t.key && 'active'),
    onclick: () => { if (tab === t.key) window.scrollTo({ top: 0, behavior: 'smooth' }); nav(t.path); },
    'aria-current': tab === t.key ? 'page' : null,
  }, [icon(t.icon, 24), t.label])));
}

function ResumeBar({ w }) {
  const done = w.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  return h('button.resume-bar', { onclick: () => { ui.workoutOpen = true; update(); } }, [
    icon('dumbbell', 24),
    h('div.grow', { style: { textAlign: 'left' } }, [h('div.title', w.routineName), h('div.sub', `Workout in progress · ${done} set${done === 1 ? '' : 's'} done`)]),
    h('b.mono', fmtDuration(Date.now() - w.startedAt)),
    icon('chevronUp', 20),
  ]);
}

function App() {
  const w = activeWorkout();
  if (!w && ui.workoutOpen) ui.workoutOpen = false;
  const { view, tab } = currentRoute();
  const sheet = ui.sheets[ui.sheets.length - 1];
  const SheetView = sheet && SHEETS[sheet.type];
  return h('div', { class: ui.workoutOpen ? 'wk-open' : '' }, [
    h('div.app-shell', { class: w && !ui.workoutOpen ? 'with-resume' : '' }, [
      !ui.storageOk && h('div.callout.yellow', { style: { margin: '8px 16px 0' } }, [icon('info', 18), 'Storage is not available, so changes may not be saved. Avoid private browsing.']),
      view,
    ]),
    !ui.workoutOpen && h(TabBar, { tab }),
    w && !ui.workoutOpen && h(ResumeBar, { w }),
    w && !ui.workoutOpen && data.timer && RestPanel({ inWorkout: false }),
    w && ui.workoutOpen && h(WorkoutView, { w }),
    // Only the top sheet is rendered (sheets are a stack).
    SheetView && h('div', { key: 'sheet-' + ui.sheets.length + sheet.type }, SheetView(sheet)),
    h(Dialog),
    h(Toast),
  ]);
}

function applyTheme() {
  const t = data.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#f2f2f7');
}

const root = document.getElementById('app');
let lastHash = location.hash;
setRenderer(() => {
  applyTheme();
  render(App(), root);
  // Scroll to top when the screen changes.
  if (location.hash !== lastHash) {
    lastHash = location.hash;
    if (!ui.workoutOpen) window.scrollTo(0, 0);
  }
  document.body.style.overflow = ui.workoutOpen || ui.sheets.length ? 'hidden' : '';
});

// ---------- Start-up ----------
(async function start() {
  await load();
  if (!location.hash) history.replaceState(null, '', '#/routines');
  try { sessionStorage.setItem('navCount', '0'); } catch { /* ignore */ }
  // An unfinished workout is reopened automatically – nothing is ever lost.
  if (activeWorkout()) {
    ui.workoutOpen = true;
    toast('Your workout was restored ✓', 2500);
  }
  resumeTimer();
  syncWakeLock();
  update();
})();

window.addEventListener('hashchange', () => {
  try { sessionStorage.setItem('navCount', String(Number(sessionStorage.getItem('navCount') || 0) + 1)); } catch { /* ignore */ }
  ui.sheets = [];
  update();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    resumeTimer();
    syncWakeLock();
    update();
  }
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => update());

// iOS only allows sound after a tap; unlock audio on the first touch.
document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

// Live clocks (workout duration) – once a second while a workout runs.
setInterval(() => { if (activeWorkout()) update(); }, 1000);

// Keep-screen-on follows the workout state.
setInterval(() => syncWakeLock(), 5000);

// ---------- Offline support ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version is ready', 10000, { text: 'Reload', onClick: () => location.reload() });
        }
      });
    });
  }).catch(() => { /* offline support unavailable */ });
}
