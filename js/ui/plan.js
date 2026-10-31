// Training plan: blocks / phases with a weekly schedule and deload weeks.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { data, ui, update, openSheet, closeSheet, saveBlock, deleteBlock, confirm, toast, sortedRoutines } from '../store.js';
import { Page, Section, Row, Empty, Button, IconButton, Stepper, Sheet, TextField, Chip, fmtDate } from './components.js';
import { select } from './exercises.js';
import { newBlock } from '../logic/model.js';
import { PHASES } from '../logic/muscles.js';
import { activeBlock, blockRange, blockWeek, isDeloadWeek } from '../logic/blocks.js';
import { dateKey, deepClone, addDays, parseDateKey, startOfWeek } from '../logic/util.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function PlanScreen() {
  const active = activeBlock(data.blocks);
  const blocks = data.blocks.slice().sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  const rById = new Map(data.routines.map((r) => [r.id, r]));
  return h(Page, {
    title: 'Training plan', backTo: '/routines',
    actions: [h(IconButton, { name: 'plus', label: 'New block', onClick: () => openSheet({ type: 'blockEditor', blockId: null }) })],
  }, [
    h('div.callout.blue', [icon('info', 18), h('div', 'Plan training blocks (e.g. 6 weeks of accumulation with a deload in week 6). Pick which routine you do on which day – the Routines tab then shows today’s workout, and the calendar shows planned vs done. You never have to follow a fixed split.')]),
    blocks.length === 0 && h(Empty, { iconName: 'calendar', title: 'No training blocks', text: 'Optional – create one to plan phases, deloads and your weekly schedule.', action: h(Button, { onClick: () => openSheet({ type: 'blockEditor', blockId: null }) }, 'New block') }),
    blocks.length > 0 && h(Section, { title: 'Blocks' }, blocks.map((b) => {
      const r = blockRange(b);
      const isActive = active && active.id === b.id;
      const sched = Object.entries(b.schedule || {}).filter(([, ids]) => ids && ids.length).map(([d, ids]) => `${DAYS[d].slice(0, 3)}: ${ids.map((id) => rById.get(id)?.name || '?').join(' + ')}`);
      return h(Row, {
        key: b.id,
        title: [b.name, isActive && h('span.tag.green', { style: { marginLeft: '6px' } }, `WEEK ${blockWeek(b)}`), isActive && isDeloadWeek(b) && h('span.tag.blue', { style: { marginLeft: '4px' } }, 'DELOAD')],
        subtitle: [h('div', `${b.phase} · ${b.weeks} weeks${r ? ` · ${fmtDate(r.from, { day: 'numeric', month: 'short' })} – ${fmtDate(addDays(r.to, -1), { day: 'numeric', month: 'short' })}` : ''}${b.deloadWeeks?.length ? ` · deload wk ${b.deloadWeeks.join(', ')}` : ''}`), sched.length ? h('div', sched.join(' · ')) : null],
        chevron: true,
        onClick: () => openSheet({ type: 'blockEditor', blockId: b.id }),
      });
    })),
  ]);
}

// sheet: { type: 'blockEditor', blockId }
export function BlockEditorSheet(sheet) {
  if (!sheet.draft) {
    const existing = sheet.blockId && data.blocks.find((b) => b.id === sheet.blockId);
    const nextWeek = startOfWeek(Date.now(), data.settings.weekStart);
    sheet.draft = existing ? deepClone(existing) : newBlock({ startDate: dateKey(nextWeek) });
    sheet.isNew = !existing;
  }
  const d = sheet.draft;
  const set = (patch) => { Object.assign(d, patch); update(); };
  const routines = sortedRoutines();
  const order = [...Array(7)].map((_, i) => (data.settings.weekStart + i) % 7);
  const toggleRoutine = (day, rid) => {
    const cur = new Set(d.schedule[day] || []);
    if (cur.has(rid)) cur.delete(rid); else cur.add(rid);
    d.schedule = { ...d.schedule, [day]: [...cur] };
    update();
  };
  const save = () => {
    d.name = d.name.trim() || 'Training block';
    d.deloadWeeks = (d.deloadWeeks || []).filter((w) => w <= d.weeks);
    saveBlock(deepClone(d));
    closeSheet();
    toast(sheet.isNew ? 'Block created' : 'Block saved');
  };
  return h(Sheet, {
    title: sheet.isNew ? 'New block' : 'Edit block', full: true,
    left: h('button.link-btn', { onclick: closeSheet }, 'Cancel'),
    actions: [h('button.link-btn.strong', { onclick: save }, 'Save')],
  }, [
    h(Section, {}, [
      h('div.field-card', h(TextField, { value: d.name, placeholder: 'Block name, e.g. Hypertrophy Block 1', onChange: (v) => { d.name = v; }, autofocus: sheet.isNew })),
      h(Row, { title: 'Phase', right: select(PHASES, d.phase, (v) => set({ phase: v })) }),
      h(Row, { title: 'Starts', right: h('input.select', { type: 'date', value: d.startDate || '', onchange: (e) => set({ startDate: e.target.value || null }) }) }),
      h(Row, { title: 'Length', right: h(Stepper, { value: d.weeks, min: 1, max: 26, format: (v) => `${v} wk`, onChange: (v) => set({ weeks: v }) }) }),
    ]),
    h(Section, { title: 'Deload weeks', footer: 'In a deload week, weight suggestions pause and workouts offer a one-tap “Apply deload” (half the sets, ~10 % lighter).' },
      h('div.pad.chips', [...Array(d.weeks)].map((_, i) => {
        const wk = i + 1;
        const on = (d.deloadWeeks || []).includes(wk);
        return h(Chip, { key: wk, active: on, onClick: () => set({ deloadWeeks: on ? d.deloadWeeks.filter((x) => x !== wk) : [...(d.deloadWeeks || []), wk].sort((a, b) => a - b) }) }, `Week ${wk}`);
      }))),
    h(Section, { title: 'Weekly schedule', footer: routines.length ? 'Tap routines to plan them on a day. Leave a day empty for rest.' : 'Create routines first.' },
      order.map((day) => h('div.row', { key: day, style: { display: 'block' } }, [
        h('div', { style: { fontWeight: 600, marginBottom: '6px' } }, DAYS[day]),
        h('div.chips', routines.map((r) => h(Chip, { key: r.id, active: (d.schedule[day] || []).includes(r.id), onClick: () => toggleRoutine(day, r.id) }, r.name))),
      ]))),
    h(Section, { title: 'Notes' }, h('div.field-card', h(TextField, { value: d.notes, multiline: true, placeholder: 'Goals for this block…', onChange: (v) => { d.notes = v; } }))),
    !sheet.isNew && h(Button, { kind: 'danger', block: true, onClick: () => confirm({
      title: `Delete “${d.name}”?`, message: 'Your workouts are not affected.', confirmText: 'Delete block', destructive: true,
      onConfirm: () => { deleteBlock(d.id); closeSheet(); },
    }) }, [icon('trash', 18), 'Delete block']),
  ]);
}
