// Rest timer service: one timer for the whole app, stored as an END TIME in the database,
// so it survives screen changes, reloads and the app being closed.
//
// When it ends while the app is open: short chime (Web Audio) + vibration (where the
// phone allows it – iPhones don't let websites vibrate). A website can't play sounds
// while the phone is locked, so during a workout we keep the screen awake (Wake Lock).

import { data, saveTimer, update, toast, activeWorkout } from './store.js';
import { startTimer, adjustTimer, remainingMs } from './logic/restTimer.js';

let audioCtx = null;
let tickHandle = null;
let wakeLock = null;

/** Must be called from a user gesture once, so iOS allows sound later. */
export function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    // A silent blip "unlocks" output on iOS.
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.02);
  } catch { /* ignore */ }
}

export function chime() {
  if (!data.settings.restSound || !audioCtx) return;
  try {
    const t0 = audioCtx.currentTime + 0.01;
    [880, 1175, 1568].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const s = t0 + i * 0.16;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.35, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
      o.connect(g).connect(audioCtx.destination);
      o.start(s);
      o.stop(s + 0.4);
    });
  } catch { /* ignore */ }
}

export function buzz(pattern = [200, 100, 200]) {
  if (!data.settings.restVibrate) return;
  try { navigator.vibrate && navigator.vibrate(pattern); } catch { /* ignore */ }
}

export function startRest(seconds, label = '', next = '') {
  saveTimer(startTimer(seconds, Date.now(), label, next));
  ensureTicking();
}

export function adjustRest(delta) {
  const t = adjustTimer(data.timer, delta, Date.now());
  saveTimer(t);
  if (t) ensureTicking();
}

export function skipRest() {
  saveTimer(null);
}

export function restRemaining() {
  return remainingMs(data.timer, Date.now());
}

function ensureTicking() {
  if (tickHandle) return;
  tickHandle = setInterval(tick, 250);
}

function tick() {
  const t = data.timer;
  if (!t) {
    clearInterval(tickHandle);
    tickHandle = null;
    return;
  }
  if (t.endAt <= Date.now()) {
    const lateMs = Date.now() - t.endAt;
    saveTimer(null);
    if (lateMs < 5000 && document.visibilityState === 'visible') {
      chime();
      buzz();
      toast(t.next ? `Rest over – next: ${t.next}` : 'Rest over – time for your next set 💪', 3500);
    } else {
      toast('Rest finished while the app was in the background.', 3500);
    }
    return;
  }
  update(); // refresh the countdown
}

/** Resume after reload / returning to the app. */
export function resumeTimer() {
  if (data.timer) ensureTicking();
}

// ---------- Keep the screen on during a workout ----------
export async function syncWakeLock() {
  const want = data.settings.keepAwake && !!activeWorkout() && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}

export function wakeLockSupported() {
  return 'wakeLock' in navigator;
}
