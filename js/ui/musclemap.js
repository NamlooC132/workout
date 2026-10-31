// Original muscle-map thumbnail: a simple front + back body outline with the muscles an exercise
// works highlighted (strong colour = main muscle, light colour = helper muscle).
// Generated from each exercise's muscle data, so every exercise gets a picture automatically.
import { h } from '../vdom.js';

// Region shapes in a 100×100 box: front figure centred at x=25, back figure at x=75.
// [muscleKey, view, shape]  shape: ['e', cx, cy, rx, ry] ellipse | ['r', x, y, w, h, r] rect | ['p', points]
const REGIONS = [
  // front
  ['front_delts', 'f', ['e', 16.6, 22.5, 3.1, 3.4]], ['front_delts', 'f', ['e', 33.4, 22.5, 3.1, 3.4]],
  ['side_delts', 'f', ['e', 13.8, 23.4, 1.7, 3.2]], ['side_delts', 'f', ['e', 36.2, 23.4, 1.7, 3.2]],
  ['chest', 'f', ['e', 21.3, 27.2, 4.3, 3.5]], ['chest', 'f', ['e', 28.7, 27.2, 4.3, 3.5]],
  ['biceps', 'f', ['e', 13.6, 31.5, 2.2, 4.8]], ['biceps', 'f', ['e', 36.4, 31.5, 2.2, 4.8]],
  ['forearms', 'f', ['e', 12.4, 42, 1.9, 5]], ['forearms', 'f', ['e', 37.6, 42, 1.9, 5]],
  ['abs', 'f', ['r', 21.3, 31.5, 7.4, 13.5, 2.4]],
  ['quads', 'f', ['e', 21.4, 58, 3.5, 8.8]], ['quads', 'f', ['e', 28.6, 58, 3.5, 8.8]],
  ['adductors', 'f', ['e', 24.1, 53.5, 1.1, 4.6]], ['adductors', 'f', ['e', 25.9, 53.5, 1.1, 4.6]],
  ['calves', 'f', ['e', 21.4, 75, 1.8, 5]], ['calves', 'f', ['e', 28.6, 75, 1.8, 5]],
  // back
  ['traps', 'b', ['p', '69.5,18.5 80.5,18.5 77.5,30 72.5,30']],
  ['rear_delts', 'b', ['e', 66.6, 22.5, 3.1, 3.4]], ['rear_delts', 'b', ['e', 83.4, 22.5, 3.1, 3.4]],
  ['side_delts', 'b', ['e', 63.8, 23.4, 1.7, 3.2]], ['side_delts', 'b', ['e', 86.2, 23.4, 1.7, 3.2]],
  ['back', 'b', ['e', 70.8, 32, 4.3, 7]], ['back', 'b', ['e', 79.2, 32, 4.3, 7]], ['back', 'b', ['r', 72.8, 37.5, 4.4, 7.5, 1.5]],
  ['triceps', 'b', ['e', 63.6, 31.5, 2.2, 4.8]], ['triceps', 'b', ['e', 86.4, 31.5, 2.2, 4.8]],
  ['forearms', 'b', ['e', 62.4, 42, 1.9, 5]], ['forearms', 'b', ['e', 87.6, 42, 1.9, 5]],
  ['glutes', 'b', ['e', 71.8, 49.2, 3.6, 3.4]], ['glutes', 'b', ['e', 78.2, 49.2, 3.6, 3.4]],
  ['hamstrings', 'b', ['e', 71.4, 59.5, 3.3, 7.3]], ['hamstrings', 'b', ['e', 78.6, 59.5, 3.3, 7.3]],
  ['calves', 'b', ['e', 71.4, 74.5, 2.6, 5.4]], ['calves', 'b', ['e', 78.6, 74.5, 2.6, 5.4]],
];

function body(cx) {
  // Neutral silhouette pieces.
  return [
    h('circle', { cx, cy: 10, r: 5.4 }),
    h('rect', { x: cx - 1.8, y: 14.5, width: 3.6, height: 4, rx: 1 }),
    h('rect', { x: cx - 8, y: 18, width: 16, height: 30, rx: 5 }),          // torso
    h('rect', { x: cx - 13.4, y: 19.5, width: 5, height: 29, rx: 2.5 }),     // left arm
    h('rect', { x: cx + 8.4, y: 19.5, width: 5, height: 29, rx: 2.5 }),      // right arm
    h('rect', { x: cx - 7.5, y: 45, width: 15, height: 8, rx: 3 }),          // hips
    h('rect', { x: cx - 7.2, y: 49, width: 6.4, height: 34, rx: 3 }),        // left leg
    h('rect', { x: cx + 0.8, y: 49, width: 6.4, height: 34, rx: 3 }),        // right leg
  ];
}

function shape(s, fill) {
  if (s[0] === 'e') return h('ellipse', { cx: s[1], cy: s[2], rx: s[3], ry: s[4], fill });
  if (s[0] === 'r') return h('rect', { x: s[1], y: s[2], width: s[3], height: s[4], rx: s[5], fill });
  return h('polygon', { points: s[1], fill });
}

export function MuscleMap({ muscles = {}, size = 44 }) {
  const strong = 'var(--accent)';
  const light = 'color-mix(in srgb, var(--accent) 42%, transparent)';
  const idle = 'color-mix(in srgb, var(--muted) 22%, transparent)';
  return h('svg', { viewBox: '10 3 80 81', width: size, height: size, class: 'muscle-map', 'aria-hidden': 'true' }, [
    h('g', { fill: 'color-mix(in srgb, var(--muted) 30%, transparent)' }, [...body(25), ...body(75)]),
    ...REGIONS.map(([m, , s]) => {
      const v = muscles[m] || 0;
      return shape(s, v >= 1 ? strong : v > 0 ? light : idle);
    }),
  ]);
}
