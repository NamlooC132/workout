// Settings: units, defaults, RIR, progression, volume targets, timer, appearance, backup.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, closeSheet, saveSettings, confirm, toast, applyImport, eraseAll, seedSamples, sortedRoutines } from '../store.js';
import { Page, Section, Row, Button, Stepper, Toggle, Segmented, Sheet, NumberField, TextField, Chip, fmtDate, nav } from './components.js';
import { select } from './exercises.js';
import { fmtClock, uid, fmtNum } from '../logic/util.js';
import { allMuscles, BASE_MUSCLES } from '../logic/muscles.js';
import { REST_STEP, REST_MIN, REST_MAX } from '../logic/restTimer.js';
import { defaultProgressionStep } from '../logic/units.js';
import { makeBackup, validateBackup, planImport } from '../logic/backup.js';
import { wakeLockSupported } from '../timer.js';
import { warmupSteps, DEFAULT_WARMUP_STEPS } from '../logic/warmup.js';
import { activeWorkout } from '../store.js';
import * as WS from '../workoutService.js';

export const APP_VERSION = '1.30.0';

export function SettingsScreen() {
  const s = data.settings;
  const set = (patch) => saveSettings(patch);
  const unit = s.unit;
  return h(Page, { title: 'Settings' }, [
    h(Section, { title: 'Units' }, [
      h(Row, { title: 'Weight', right: h(Segmented, { small: true, value: unit, onChange: (v) => {
        const patch = { unit: v };
        if (v === 'lbs' && s.defaultWeightStep === 2.5) patch.defaultWeightStep = 5;
        if (v === 'kg' && s.defaultWeightStep === 5) patch.defaultWeightStep = 2.5;
        set(patch);
      }, options: [{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }] }) }),
      h(Row, { title: 'Body measurements', right: h(Segmented, { small: true, value: s.lengthUnit, onChange: (v) => set({ lengthUnit: v }), options: [{ value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }] }) }),
    ]),

    h(Section, { title: 'Rest timer', footer: wakeLockSupported() ? 'A website can’t ring while the phone is locked, so the app keeps the screen on during workouts. Sound follows your phone’s silent switch; iPhones don’t allow websites to vibrate.' : 'Your browser can’t keep the screen on – keep the app open between sets to hear the timer.' }, [
      h(Row, { title: 'Start automatically after a set', right: h(Toggle, { checked: s.autoRest, onChange: (v) => set({ autoRest: v }) }) }),
      h(Row, { title: '− / + buttons change rest by', right: select([5, 10, 15, 30, 60].map((x) => ({ value: x, label: `${x}s` })), s.restAdjustStep || 15, (v) => set({ restAdjustStep: Number(v) })) }),
      h(Row, { title: 'Sound', right: h(Toggle, { checked: s.restSound, onChange: (v) => set({ restSound: v }) }) }),
      h(Row, { title: 'Keep screen on during workouts', right: h(Toggle, { checked: s.keepAwake, onChange: (v) => set({ keepAwake: v }) }) }),
    ]),

    WarmupSection(s),

    h(Section, { title: 'Readiness check', footer: 'Three quick questions (sleep, energy, soreness) and a pain check when you start a routine. You can always skip it; suggestions are never applied without your tap.' }, [
      h(Row, { title: 'Ask how I feel before a workout', right: h(Toggle, { checked: s.readinessCheck !== false, onChange: (v) => set({ readinessCheck: v }) }) }),
      (s.readinessDeloadUntil || 0) > Date.now() && h(Row, {
        title: 'Deload week', subtitle: `Until ${fmtDate(s.readinessDeloadUntil, { weekday: 'short', day: 'numeric', month: 'short' })}`,
        right: h(Button, { size: 'sm', kind: 'secondary', onClick: () => { set({ readinessDeloadUntil: null }); toast('Deload week ended'); } }, 'End now'),
      }),
    ]),

    h(Section, { title: 'Sections', footer: 'Turn on only what you use. Your data stays saved when a section is hidden.' }, [
      h(Row, { left: icon('yoga', 22), title: 'Show Yoga', subtitle: 'Log sessions, a pose journal and stats', right: h(Toggle, { checked: !!s.showYoga, onChange: (v) => { set({ showYoga: v }); if (v) toast('Yoga is now in the bottom bar'); } }) }),
    ]),

    h(Section, { title: 'Language · שפה' }, h(Row, { title: 'App language', right: h(Segmented, { small: true, value: s.language || 'en', onChange: (v) => set({ language: v }), options: [{ value: 'en', label: 'English' }, { value: 'he', label: 'עברית' }] }) })),

    h(Section, { title: 'Appearance' }, h(Row, { title: 'Theme', right: h(Segmented, { small: true, value: s.theme, onChange: (v) => set({ theme: v }), options: [{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }] }) })),

    h(Section, {
      title: 'Backup & sharing',
      footer: s.lastBackupAt ? `Last backup: ${fmtDate(s.lastBackupAt)}.` : 'No backup yet.',
    }, [
      h(Row, { left: icon('info', 22), title: 'Where is my data saved?', chevron: true, onClick: () => openSheet({ type: 'dataInfo' }) }),
      h(Row, { title: 'Backup reminder', right: h(Toggle, { checked: s.backupReminder !== false, onChange: (v) => set({ backupReminder: v }) }) }),
      h(Row, { left: icon('download', 22), title: 'Export all data', subtitle: data.yogaSessions.length || data.yogaEntries.length ? 'Routines, exercises, photos, history, measurements, yoga, settings' : 'Routines, exercises, photos, history, measurements, settings', onClick: () => exportFile('full') }),
      h(Row, { left: icon('copy', 22), title: 'Share routines', subtitle: 'Pick routines to send to friends – no history', onClick: () => openSheet({ type: 'exportRoutines' }) }),
      h(Row, { left: icon('upload', 22), title: 'Import data', subtitle: 'From a backup or a friend’s routines (also iPhone-app backups)', onClick: () => document.getElementById('import-input').click() }),
      h('input#import-input.hidden-input', { type: 'file', accept: '.json,application/json', onchange: onImportFile }),
    ]),

    h(Section, {}, h(Row, { left: icon('gear', 22), title: 'Advanced settings', subtitle: 'Exercise defaults, RIR, overload rules, muscle volume, deload', chevron: true, onClick: () => nav('/settings/advanced') })),
    h('div.section-foot.center', `Workout Log ${APP_VERSION} · works offline · no account`),
    h('div.section-foot.center', h('a', { href: 'https://repdb.co', target: '_blank', rel: 'noopener' }, 'Exercise data by RepDB (repdb.co)')),
  ]);
}

export function AdvancedSettingsScreen() {
  const s = data.settings;
  const set = (patch) => saveSettings(patch);
  const unit = s.unit;
  return h(Page, { title: 'Advanced settings', backTo: '/settings', large: false }, [
    h(Section, { title: 'Defaults for new exercises' }, [
      h(Row, { title: 'Rest time', right: h(Stepper, { value: s.defaultRest, step: REST_STEP, min: REST_MIN, max: REST_MAX, format: fmtClock, onChange: (v) => set({ defaultRest: v }) }) }),
      h(Row, { title: '− / + buttons change weight by', right: select([0.5, 1, 1.25, 2, 2.5, 5, 10].map((x) => ({ value: x, label: `${x} ${unit}` })), s.defaultWeightStep, (v) => set({ defaultWeightStep: Number(v) })) }),
      h(Row, { title: 'Warm-up sets', right: h(Stepper, { value: s.defaultWarmupSets || 0, min: 0, max: 5, onChange: (v) => set({ defaultWarmupSets: v }) }) }),
      h(Row, { title: 'Drop sets', right: h(Stepper, { value: s.defaultDropSets || 0, min: 0, max: 4, onChange: (v) => set({ defaultDropSets: v }) }) }),
      h(Row, { title: 'Target RIR', right: select([{ value: '', label: 'None' }, ...[0, 1, 2, 3, 4].map((x) => ({ value: String(x), label: String(x) }))], s.defaultRirTarget === null ? '' : String(s.defaultRirTarget), (v) => set({ defaultRirTarget: v === '' ? null : Number(v) })) }),
      h(Row, { title: 'Default set type', right: select([{ value: 'working', label: 'Working' }, { value: 'failure', label: 'To failure' }], s.defaultSetType, (v) => set({ defaultSetType: v })) }),
    ]),

    h(Section, { title: 'RIR (reps in reserve)', footer: 'RIR = how many more reps you could have done. 0 = failure. Required means a working set can’t be ticked until you pick RIR.' }, [
      h(Row, { title: 'Log RIR', right: h(Segmented, { small: true, value: s.rirMode, onChange: (v) => set({ rirMode: v }), options: [{ value: 'off', label: 'Off' }, { value: 'optional', label: 'Optional' }, { value: 'required', label: 'Required' }] }) }),
    ]),

    h(Section, { title: 'Progressive overload', footer: 'Used for new exercises; each exercise can have its own rule and step. Suggestions are never applied without your tap.' }, [
      h(Row, { title: 'Default rule', right: select([{ value: 'descending', label: 'Reps drop 1 per set' }, { value: 'all_max', label: 'Max reps on all sets' }, { value: 'avg', label: 'Average reps' }, { value: 'custom', label: 'Custom' }], s.defaultRule, (v) => set({ defaultRule: v })) }),
      h(Row, { title: 'Increase by', right: h('div.hstack', [h(NumberField, { value: s.defaultProgressionStep, placeholder: String(defaultProgressionStep(unit)), class: 'w-80', onChange: (v) => set({ defaultProgressionStep: v || null }) }), h('span.muted', unit)]) }),
    ]),

    h(Section, { title: 'Muscle volume' }, [
      h(Row, { title: 'Weekly targets per muscle', chevron: true, onClick: () => openSheet({ type: 'targets' }) }),
      h(Row, { title: 'Muscle groups', subtitle: `${allMuscles(s).length} groups · add your own`, chevron: true, onClick: () => openSheet({ type: 'muscles' }) }),
      h(Row, { title: 'Helper muscle share', subtitle: 'How much a set counts for a helper muscle', right: select([0.25, 0.5, 0.75].map((x) => ({ value: x, label: `${x * 100} %` })), s.indirectContribution, (v) => set({ indirectContribution: Number(v) })) }),
      h(Row, { title: 'Drop & rest-pause sets count as', right: select([{ value: 1, label: '1 set' }, { value: 0.5, label: '½ set' }], s.dropSetsCount, (v) => set({ dropSetsCount: Number(v) })) }),
    ]),

    h(Section, { title: 'Deload weeks', footer: 'Used by “Apply deload” in a training-plan deload week.' }, [
      h(Row, { title: 'Keep this share of sets', right: select([0.33, 0.5, 0.67, 0.75].map((x) => ({ value: x, label: `${Math.round(x * 100)} %` })), s.deloadSetShare ?? 0.5, (v) => set({ deloadSetShare: Number(v) })) }),
      h(Row, { title: 'Use less weight', right: select([0, 5, 10, 15, 20, 30].map((x) => ({ value: x, label: `${x} %` })), s.deloadWeightPct ?? 10, (v) => set({ deloadWeightPct: Number(v) })) }),
    ]),
    h(Section, { title: 'Other' }, [
      h(Row, { title: 'Week starts on', right: h(Segmented, { small: true, value: s.weekStart, onChange: (v) => set({ weekStart: v }), options: [{ value: 0, label: 'Sun' }, { value: 1, label: 'Mon' }] }) }),
      h(Row, { title: 'Vibrate when rest ends (Android)', right: h(Toggle, { checked: s.restVibrate, onChange: (v) => set({ restVibrate: v }) }) }),
    ]),
    h(Section, { title: 'Storage' }, [
      h(Row, { title: 'Protected from automatic clean-up', right: h('span', ui.persisted ? '✓ Yes' : 'Not guaranteed') }),
      !ui.storageOk && h('div.callout.yellow', [icon('info', 18), 'Saving failed on this device. If you are in a private browsing window, open the app normally.']),
      h(Row, { title: 'Add sample routines & exercises', onClick: async () => { await seedSamples(); toast('Samples added'); } }),
      h(Row, { title: 'Erase all data', danger: true, onClick: () => confirm({
        title: 'Erase ALL data?', message: 'Every routine, exercise, workout and measurement on this device will be deleted. Export a backup first if you might need it.',
        confirmText: 'Continue', destructive: true,
        onConfirm: () => confirm({ title: 'Are you absolutely sure?', message: 'This cannot be undone.', confirmText: 'Erase everything', destructive: true, onConfirm: async () => { await eraseAll(); toast('All data erased'); } }),
      }) }),
    ]),
  ]);
}

// ---------- Export ----------
export function exportFile(kind, routineIds = null) {
  const backup = makeBackup(data, { kind, routineIds });
  const json = JSON.stringify(backup, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  const name = kind === 'full' ? `WorkoutLog-Backup-${date}.json` : `WorkoutLog-Routines-${date}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const done = () => { if (kind === 'full') saveSettings({ lastBackupAt: Date.now() }); };
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: name }).then(done).catch((e) => { if (e.name !== 'AbortError') download(file, name, done); });
  } else {
    download(file, name, done);
  }
}

function download(file, name, done) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  done();
  toast(`Saved ${name}`);
}

// sheet: { type: 'exportRoutines' }
export function ExportRoutinesSheet(sheet) {
  const routines = sortedRoutines();
  sheet.sel = sheet.sel || new Set(routines.map((r) => r.id));
  return h(Sheet, {
    title: 'Share routines',
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: [h('button.link-btn.strong', { disabled: !sheet.sel.size, onclick: () => { closeSheet(); exportFile('routines', [...sheet.sel]); } }, 'Share')],
  }, [
    h(Section, { footer: 'Your friend taps Settings → Import data. Their own history stays on their phone; exercises with the same name are reused.' }, routines.map((r) => h(Row, {
      key: r.id, title: r.name, subtitle: `${r.items.length} exercises`,
      right: sheet.sel.has(r.id) ? h('span', { style: { color: 'var(--accent)' } }, icon('check', 22)) : null,
      onClick: () => { if (sheet.sel.has(r.id)) sheet.sel.delete(r.id); else sheet.sel.add(r.id); update(); },
    }))),
  ]);
}

// ---------- Import ----------
function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  file.text().then((text) => {
    let raw;
    try { raw = JSON.parse(text); } catch { return toast("That file isn't valid JSON."); }
    const v = validateBackup(raw);
    if (!v.ok) return confirm({ title: 'Import failed', message: v.error, cancelText: 'OK' });
    openSheet({ type: 'importPreview', result: v, plan: planImport(v.data, data), fileName: file.name });
  }).catch(() => toast("Couldn't read the file."));
}

// sheet: { type: 'importPreview', result, plan, fileName }
export function ImportPreviewSheet(sheet) {
  const p = sheet.plan;
  const nothing = !p.exercises.length && !p.routines.length && !p.workouts.length && !p.measurements.length && !p.blocks.length;
  const go = async () => {
    try {
      await applyImport(p, { includeSettings: !!sheet.includeSettings });
      closeSheet();
      toast('Import complete ✓', 3500);
    } catch (err) {
      confirm({ title: 'Import failed', message: `Nothing was changed.\n${err?.message || err}`, cancelText: 'OK' });
    }
  };
  return h(Sheet, {
    title: 'Import',
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: [h('button.link-btn.strong', { onclick: go, disabled: nothing && !sheet.includeSettings }, 'Import')],
  }, [
    h('div.muted.small.center', { style: { margin: '4px 0 8px' } }, sheet.fileName),
    h(Section, { title: 'Will be added', footer: 'Nothing on this phone is deleted or overwritten.' }, [
      h(Row, { title: 'Routines', right: h('b', p.routines.length) }),
      h(Row, { title: 'Exercises', right: h('b', p.exercises.length) }),
      h(Row, { title: 'Workouts', right: h('b', p.workouts.length) }),
      h(Row, { title: 'Measurements', right: h('b', p.measurements.length) }),
      h(Row, { title: 'Training blocks', right: h('b', p.blocks.length) }),
      (p.yogaSessions?.length || p.yogaPoses?.length || p.yogaEntries?.length) > 0 && h(Row, { title: 'Yoga sessions', right: h('b', p.yogaSessions.length) }),
      (p.yogaPoses?.length || p.yogaEntries?.length) > 0 && h(Row, { title: 'Pose results', right: h('b', p.yogaEntries.length) }),
    ]),
    (p.skipped || p.reused || p.renamed) > 0 && h(Section, { title: 'Duplicates' }, [
      p.skipped > 0 && h(Row, { title: 'Already on this phone (skipped)', right: h('b', p.skipped) }),
      p.reused > 0 && h(Row, { title: 'Exercises matched by name (history shared)', right: h('b', p.reused) }),
      p.renamed > 0 && h(Row, { title: 'Routines renamed “(imported)”', right: h('b', p.renamed) }),
    ]),
    p.settings && h(Section, {}, h(Row, { title: 'Also replace my settings', subtitle: 'Units, defaults, targets…', right: h(Toggle, { checked: !!sheet.includeSettings, onChange: (v) => { sheet.includeSettings = v; update(); } }) })),
    sheet.result.warnings.length > 0 && h('div.callout.yellow', [icon('info', 18), h('div', sheet.result.warnings.slice(0, 6).map((w, i) => h('div', { key: i }, w)))]),
    nothing && h('div.callout', [icon('info', 18), 'Everything in this file is already on this phone.']),
  ]);
}

// ---------- Volume targets ----------
// sheet: { type: 'targets' }
export function TargetsSheet() {
  const s = data.settings;
  const t = s.volumeTargets || {};
  const upd = (key, patch) => saveSettings({ volumeTargets: { ...t, [key]: { ...(t[key] || { min: 0, max: 0 }), ...patch } } });
  return h(Sheet, { title: 'Weekly set targets', full: true }, [
    h('div.callout', { style: { marginBottom: '8px' } }, [icon('info', 18), 'Hard sets per muscle per week. Common starting ranges are about 10–20; adjust to what you recover from. Set both to 0 to hide a target.']),
    h(Section, {}, allMuscles(s).map((m) => h(Row, {
      key: m.key, title: m.name,
      right: h('div.hstack', [
        h(NumberField, { value: t[m.key]?.min ?? 0, decimals: false, class: 'w-64', ariaLabel: `${m.name} minimum`, onChange: (v) => upd(m.key, { min: v || 0 }) }),
        h('span.muted', '–'),
        h(NumberField, { value: t[m.key]?.max ?? 0, decimals: false, class: 'w-64', ariaLabel: `${m.name} maximum`, onChange: (v) => upd(m.key, { max: v || 0 }) }),
      ]),
    }))),
  ]);
}

// sheet: { type: 'muscles' }
export function MusclesSheet(sheet) {
  const s = data.settings;
  sheet.name = sheet.name || '';
  const custom = s.customMuscles || [];
  return h(Sheet, { title: 'Muscle groups' }, [
    h(Section, { title: 'Built in' }, h('div.pad.chips', BASE_MUSCLES.map((m) => h('span.chip.chip-static', { key: m.key }, m.name)))),
    h(Section, { title: 'Your own', footer: 'Add groups like Forearms, Traps or Adductors. Then set them on exercises in the editor.' }, [
      ...custom.map((m) => h(Row, { key: m.key, title: m.name, right: h('button.link-btn.danger', { onclick: () => saveSettings({ customMuscles: custom.filter((x) => x.key !== m.key) }) }, 'Remove') })),
      h('div.row', [
        h('input.text-field.grow', { placeholder: 'New muscle group', value: sheet.name, oninput: (e) => { sheet.name = e.target.value; } }),
        h('button.link-btn.strong', { onclick: () => {
          const name = sheet.name.trim();
          if (!name) return;
          saveSettings({ customMuscles: [...custom, { key: 'm_' + uid().slice(0, 8), name }] });
          sheet.name = '';
        } }, 'Add'),
      ]),
    ]),
  ]);
}

// sheet: { type: 'actions', title, actions: [{ text, icon, destructive, onClick }] }
export function ActionsSheet(sheet) {
  return h(Sheet, { title: sheet.title || '' }, h(Section, {}, sheet.actions.map((a, i) => h(Row, {
    key: i, danger: a.destructive,
    left: a.icon ? h('span', { style: { color: a.destructive ? 'var(--red)' : 'var(--accent)' } }, icon(a.icon, 20)) : null,
    title: a.text,
    onClick: () => { closeSheet(); a.onClick(); },
  }))));
}

// Automatic warm-up: steps as % of the first working set's weight.
function WarmupSection(s) {
  const steps = warmupSteps(s).map((x) => ({ ...x }));
  const save = (patch) => {
    saveSettings(patch);
    const w = activeWorkout();
    if (w) WS.save(w); // an open workout picks up the new warm-up right away
  };
  const setStep = (i, patch) => { steps[i] = { ...steps[i], ...patch }; save({ warmupSteps: steps }); };
  const on = true;
  return h(Section, {
    title: 'Warm-up',
    footer: 'Warm-up weight = % of your heaviest working set, rounded to the − / + step. It follows the working weight live. Change a warm-up set by hand in a workout and it stays as you typed it.',
  }, [
    on && h(Row, { title: 'Add warm-up to', right: h(Segmented, { small: true, value: s.warmupScope || 'chosen', onChange: (v) => save({ warmupScope: v }), options: [{ value: 'all', label: 'Every exercise' }, { value: 'chosen', label: 'Chosen ones' }] }) }),
    on && (s.warmupScope || 'chosen') === 'chosen' && h('div.pad.small.muted', 'Chosen ones = exercises where you set Warm-up sets (exercise → Advanced). In a workout you can also tap ⋯ → Add warm-up set.'),
    on && steps.map((st, i) => h(Row, {
      key: 'wu' + i, title: `Warm-up ${i + 1}`,
      right: h('div.wu-step', [
        h(NumberField, { value: st.pct, decimals: false, class: 'w-64 center', ariaLabel: `Warm-up ${i + 1} percent`, onChange: (v) => v && setStep(i, { pct: Math.max(5, Math.min(100, v)) }) }),
        h('span.muted', '%  ×'),
        h(NumberField, { value: st.reps, decimals: false, class: 'w-64 center', ariaLabel: `Warm-up ${i + 1} reps`, onChange: (v) => v && setStep(i, { reps: Math.max(1, Math.min(50, v)) }) }),
        h('span.muted', 'reps'),
        steps.length > 1 && h('button.goal-x', { onclick: () => save({ warmupSteps: steps.filter((_, k) => k !== i) }), 'aria-label': `Remove warm-up ${i + 1}` }, '×'),
      ]),
    })),
    on && h('div.pad.hstack.wrap', { style: { gap: '8px' } }, [
      steps.length < 6 && h('button.btn.btn-secondary.btn-sm', { onclick: () => { const l = steps[steps.length - 1]; save({ warmupSteps: [...steps, { pct: Math.min(95, l.pct + 5), reps: Math.max(1, l.reps - 1) }] }); } }, [icon('plus', 16), 'Add warm-up set']),
      h('button.btn.btn-plain.btn-sm', { onclick: () => save({ warmupSteps: DEFAULT_WARMUP_STEPS.map((x) => ({ ...x })) }) }, 'Reset to 50 / 70 / 85 %'),
    ]),
  ]);
}
