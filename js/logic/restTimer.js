// Rest timer maths. The timer stores an absolute END time, never a countdown,
// so it stays correct after the phone sleeps, the tab is suspended or the app is reopened.

export const REST_STEP = 15;
export const REST_MIN = 15;
export const REST_MAX = 600;

export function snapRest(seconds) {
  const s = Math.round((seconds || 0) / REST_STEP) * REST_STEP;
  return Math.min(REST_MAX, Math.max(REST_MIN, s));
}

export function startTimer(seconds, now, label = '', next = '') {
  return { endAt: now + seconds * 1000, total: seconds, label, next, startedAt: now };
}

export function remainingMs(timer, now) {
  if (!timer) return 0;
  return Math.max(0, timer.endAt - now);
}

/** −15 / +15. Returns null when the timer would drop to zero (= skip). */
export function adjustTimer(timer, deltaSeconds, now) {
  if (!timer) return null;
  const endAt = timer.endAt + deltaSeconds * 1000;
  if (endAt - now <= 500) return null;
  const left = Math.ceil((endAt - now) / 1000);
  return { ...timer, endAt, total: Math.max(timer.total + deltaSeconds, left) };
}

export function isFinished(timer, now) {
  return !!timer && timer.endAt <= now;
}
