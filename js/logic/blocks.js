// Training blocks / phases: a start date, a number of weeks, deload weeks and a
// weekly schedule (weekday → routines). Used for "today's workout", the calendar
// (planned vs completed) and deload suggestions.

import { parseDateKey, startOfDay, addDays, DAY, dateKey } from './util.js';

export function blockRange(block) {
  if (!block.startDate) return null;
  const from = parseDateKey(block.startDate);
  return { from, to: addDays(from, 7 * Math.max(1, block.weeks || 1)) };
}

/** The block covering `ms` (most recently started wins). */
export function activeBlock(blocks, ms = Date.now()) {
  const day = startOfDay(ms);
  const covering = (blocks || []).filter((b) => {
    const r = blockRange(b);
    return r && day >= r.from && day < r.to;
  });
  covering.sort((a, b) => parseDateKey(b.startDate) - parseDateKey(a.startDate));
  return covering[0] || null;
}

/** 1-based week number of `ms` inside the block, or null. */
export function blockWeek(block, ms = Date.now()) {
  const r = block && blockRange(block);
  if (!r) return null;
  const day = startOfDay(ms);
  if (day < r.from || day >= r.to) return null;
  return Math.floor(Math.round((day - r.from) / DAY) / 7) + 1;
}

export function isDeloadWeek(block, ms = Date.now()) {
  if (!block) return false;
  if ((block.phase || '').toLowerCase() === 'deload') return true;
  const wk = blockWeek(block, ms);
  return wk !== null && (block.deloadWeeks || []).includes(wk);
}

/** Routine ids planned on a given day by whichever block covers it. */
export function plannedRoutineIds(blocks, ms) {
  const b = activeBlock(blocks, ms);
  if (!b) return [];
  const wd = new Date(ms).getDay();
  return (b.schedule && b.schedule[wd]) || [];
}

/**
 * Planned vs completed for days in [from, to): [{ date, key, planned: [routineId], done: [workout] }].
 * A planned routine counts as completed if a finished workout of that routine (or any workout,
 * when the routine isn't found) happened that day.
 */
export function planVsDone(blocks, workouts, from, to) {
  const days = [];
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    const key = dateKey(d);
    const done = workouts.filter((w) => w.status === 'done' && dateKey(w.startedAt) === key);
    days.push({ date: d, key, planned: plannedRoutineIds(blocks, d), done });
  }
  return days;
}

export function adherence(days, now = Date.now()) {
  let planned = 0, completed = 0;
  for (const d of days) {
    if (d.date > now) continue;
    for (const rid of d.planned) {
      planned++;
      if (d.done.some((w) => w.routineId === rid)) completed++;
    }
  }
  return { planned, completed };
}
