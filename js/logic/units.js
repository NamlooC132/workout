// Weight & length units. Everything is STORED in kg / cm and converted only for
// display and input, so switching units never changes saved data.

import { round2 } from './util.js';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function toDisplayWeight(kg, unit) {
  if (kg === null || kg === undefined) return null;
  return unit === 'lbs' ? kg / KG_PER_LB : kg;
}

export function fromDisplayWeight(value, unit) {
  if (value === null || value === undefined) return null;
  return unit === 'lbs' ? value * KG_PER_LB : value;
}

/** Display value rounded to 2 decimals (avoids 61.99999 after conversions). */
export function displayWeight(kg, unit) {
  const v = toDisplayWeight(kg, unit);
  return v === null ? null : round2(v);
}

export function toDisplayLength(cm, lengthUnit) {
  if (cm === null || cm === undefined) return null;
  return lengthUnit === 'in' ? cm / CM_PER_IN : cm;
}

export function fromDisplayLength(value, lengthUnit) {
  if (value === null || value === undefined) return null;
  return lengthUnit === 'in' ? value * CM_PER_IN : value;
}

/** Default progressive-overload jump: exactly 2.5 kg or 5 lbs, in display units. */
export function defaultProgressionStep(unit) {
  return unit === 'lbs' ? 5 : 2.5;
}

/** Adds `stepDisplay` (in display unit) to a stored kg weight, returning kg.
 *  Rounds in the display unit so the jump is exact (60 kg → 62.5 kg, 135 lb → 140 lb). */
export function addInDisplayUnit(kg, stepDisplay, unit) {
  const current = round2(toDisplayWeight(kg || 0, unit));
  const next = Math.max(0, round2(current + stepDisplay));
  return fromDisplayWeight(next, unit);
}
