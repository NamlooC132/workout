// Automatic warm-up: each warm-up set is a % of the heaviest working set's weight.
import { toDisplayWeight, fromDisplayWeight } from './units.js';

export const DEFAULT_WARMUP_STEPS = [{ pct: 50, reps: 10 }, { pct: 70, reps: 5 }, { pct: 85, reps: 2 }];
const NO_WARMUP_TYPES = ['bodyweight', 'assisted', 'weighted_bw'];

export const warmupSteps = (settings) => (settings?.warmupSteps && settings.warmupSteps.length ? settings.warmupSteps : DEFAULT_WARMUP_STEPS);

/** True when automatic warm-up weights make sense for this kind of exercise. */
export const canAutoWarmup = (type) => !NO_WARMUP_TYPES.includes(type);

/** Number of warm-up sets a new workout entry gets. */
export function warmupCount(cfg, settings) {
  if (cfg.warmupSets) return cfg.warmupSets;
  if (settings?.warmupAuto && settings.warmupScope === 'all' && canAutoWarmup(cfg.type)) return warmupSteps(settings).length;
  return 0;
}

/** Warm-up weight in kg for one step, rounded to the weight step (display units). */
export function warmupKg(workKg, pct, step, unit) {
  if (!workKg || workKg <= 0) return null;
  const st = step || 2.5;
  const v = Math.round((toDisplayWeight(workKg, unit) * pct) / 100 / st) * st;
  return fromDisplayWeight(Math.max(st, v), unit);
}

/**
 * Updates the automatic warm-up sets of an entry (not done and not edited by hand)
 * from the first working set. Returns true when something changed.
 */
export function syncWarmups(entry, settings) {
  if (!settings?.warmupAuto || entry.skipped) return false;
  const snap = entry.snapshot || {};
  if (!canAutoWarmup(snap.type)) return false;
  const steps = warmupSteps(settings);
  // Based on the heaviest working set, so changing any working weight moves the warm-up.
  const workKgs = entry.sets.filter((s) => s.type !== 'warmup' && s.type !== 'drop' && s.kg > 0).map((s) => s.kg);
  const workKg = workKgs.length ? Math.max(...workKgs) : null;
  let k = -1, changed = false;
  for (const s of entry.sets) {
    if (s.type !== 'warmup') continue;
    k++;
    if (!s.auto || s.done) continue;
    const st = steps[Math.min(k, steps.length - 1)];
    const kg = warmupKg(workKg, st.pct, snap.weightStep, settings.unit);
    const reps = st.reps;
    if (s.kg !== kg || s.reps !== reps) {
      s.kg = kg; s.reps = reps;
      if (snap.unilateral) { s.repsL = reps; s.repsR = reps; }
      changed = true;
    }
  }
  return changed;
}

/** The step the next added warm-up set will use (e.g. { pct: 70, reps: 5 }). */
export function nextWarmupStep(entry, settings) {
  const steps = warmupSteps(settings);
  const have = entry.sets.filter((s) => s.type === 'warmup').length;
  return steps[Math.min(have, steps.length - 1)];
}
