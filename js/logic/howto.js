// Beginner "how to" guides for every catalog exercise: setup, steps, common mistakes and tips.
// The text lives in ./howto/part*.js in a simple line format (see part1.js).
import p1 from './howto/part1.js';
import p2 from './howto/part2.js';
import p3 from './howto/part3.js';
import p4 from './howto/part4.js';
import p5 from './howto/part5.js';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/[’‘]/g, "'");

let GUIDES = null;
function guides() {
  if (GUIDES) return GUIDES;
  GUIDES = new Map();
  const keys = { S: 'setup', D: 'steps', X: 'mistakes', T: 'tips' };
  for (const text of [p1, p2, p3, p4, p5]) {
    let cur = null;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('# ')) {
        cur = { name: line.slice(2).trim(), setup: [], steps: [], mistakes: [], tips: [] };
        GUIDES.set(norm(cur.name), cur);
      } else if (cur && keys[line[0]] && line[1] === ' ') {
        cur[keys[line[0]]].push(line.slice(2).trim());
      }
    }
  }
  return GUIDES;
}

// General advice for exercises without their own guide (e.g. your own custom exercises).
const GENERIC = {
  Barbell: ['Start with just the empty bar to practice the movement.', 'Use clips on both ends so plates can\'t slide off.'],
  Dumbbell: ['Pick up and put down dumbbells with a flat back, bending your knees.'],
  Machine: ['Adjust the seat and pads before you start, so the moving part lines up with your joint.', 'Start with a light pin setting.'],
  Cable: ['Set the pulley height and attachment before you start.', 'Stand far enough away that the weight stack doesn\'t touch down between reps.'],
  'Smith machine': ['Set the safety stoppers before you start.', 'Twist the bar to unhook it and twist back to re-hook it.'],
  Bodyweight: ['Make it easier at first if needed (knees down, a band, a higher surface) and build up.'],
  Kettlebell: ['Start light and learn the movement first.'],
};

/** Guide for an exercise name, or null. */
export function howToFor(name) {
  return guides().get(norm(name)) || null;
}

/** General tips used when an exercise has no specific guide. */
export function genericTips(equipment) {
  return [
    ...(GENERIC[equipment] || []),
    'Move slowly and in control: about 2 seconds down, 1 second up.',
    'Pick a weight you can lift for the target reps with 1–2 reps left in the tank.',
    'Stop if you feel sharp pain (not the same as muscle burn).',
  ];
}

export const BEGINNER_NOTE = 'New to this exercise? Start light for the first 1–2 sessions and focus on doing it right. Add weight once every rep looks the same.';

export function guideCount() { return guides().size; }
