// Original anatomy-style muscle chart (front + back) drawn in SVG.
// Worked muscles glow orange: strong = main muscle, soft = helper muscle.
// Generated from each exercise's muscle data, so every exercise gets a picture automatically.
//
// Only the LEFT half of each figure is drawn; the right half is a mirror copy.
// Each figure lives in a 100 × 220 box (centre line x = 50).
import { h } from '../vdom.js';

// Body outline pieces (left half)
const SILHOUETTE = [
  // torso
  'M50,35 L42,35 Q34,36 29,41 Q23,46 23,55 L26,63 Q29,75 33,82 Q36,93 34,104 Q32,111 35,117 L50,119 Z',
  // arm
  'M30,41 Q21,43 20,55 Q18,69 20,82 Q17,96 16,110 Q15,121 17,129 Q21,134 24,129 Q25,119 27,109 Q31,96 31,84 Q33,72 32,60 Z',
  // leg
  'M35,110 Q30,130 31,150 Q32,161 34,169 Q31,183 34,199 Q35,207 33,213 Q38,218 47,215 Q46,205 47,196 Q49,180 47,166 Q50,150 49.5,130 L50,118 Z',
  // neck
  'M44,26 L50,26 L50,38 L42,38 Z',
];

const FRONT = [
  ['traps', 'M45,33 Q38,35 32,40 L40,41 Q45,38 47,35 Z'],
  ['side_delts', 'M29,41 Q22,43 21,52 Q21,58 23,61 Q24,52 27,47 Z'],
  ['front_delts', 'M35,40 Q28,42 26,49 Q27,56 30,60 Q32,52 36,46 Q37,42 35,40 Z'],
  ['chest', 'M50,42 L39,41 Q33,43 31,51 Q31,58 34,62 Q42,65 50,63 Z'],
  ['biceps', 'M27,62 Q23.5,68 23.5,76 Q24.5,83 28,85 Q31,78 31,70 Q31,64 29,61 Z'],
  ['forearms', 'M21.5,88 Q18.5,98 18.5,108 Q19.5,117 21.5,121 Q25,113 27,103 Q28,95 27,88 Z'],
  ['abs', 'M43.6,65 h5.8 a1.6,1.6 0 0 1 1.6,1.6 v7.4 h-9 v-7.4 a1.6,1.6 0 0 1 1.6,-1.6 Z'],
  ['abs', 'M42,76 h9 v8.6 h-9 Z'],
  ['abs', 'M42.4,86.4 h8.6 v8.6 h-8.6 Z'],
  ['abs', 'M43.2,96.8 h7.8 v8 Q47,108 43.2,104 Z'],
  ['abs', 'M41,65 Q36,71 35,81 Q35,93 37.5,101 Q40.5,96 41,88 Q41.5,76 41,65 Z'], // obliques
  ['quads', 'M37,119 Q32.5,133 33.5,149 Q35.5,159 40.5,163 Q45,161 46.5,151 Q48,135 46.5,122 Q42,118 37,119 Z'],
  ['quads', 'M42,153 Q39.5,160 42.5,165 Q47,164 47,157 Q45,152 42,153 Z'],
  ['adductors', 'M47,121 Q45.5,130 46.8,142 Q49.5,134 50,124 Z'],
  ['calves', 'M35.5,172 Q33.5,183 35.5,195 Q37.5,197 38.8,192 Q39.8,182 38.8,172 Z'],
  ['calves', 'M42.5,170 Q46,180 45,193 Q43,193 41.8,187 Q40.8,178 42.5,170 Z'],
];

const BACK = [
  ['traps', 'M50,29 L44,32 Q36,35 30,41 Q38,44 44,52 Q47,61 50,72 Z'],
  ['side_delts', 'M28,40 Q21.5,43 20.5,52 Q21,57 22.5,60 Q23,51 26,46 Z'],
  ['rear_delts', 'M31,41 Q24.5,44 23.5,53 Q25.5,58 28.5,59 Q29.5,50 33.5,45 Z'],
  ['triceps', 'M23.5,61 Q20.5,69 21.5,79 Q23.5,85 27,85 Q30,77 30,69 Q29.5,63 27,60 Z'],
  ['forearms', 'M21.5,88 Q18.5,98 18.5,108 Q19.5,117 21.5,121 Q25,113 27,103 Q28,95 27,88 Z'],
  ['back', 'M34,52 Q31.5,61 32.5,71 Q34.5,85 41,97 Q45.5,92 47.5,84 Q46.5,70 44,58 Q40,52 34,52 Z'],
  ['back', 'M46.5,86 Q44.5,96 45.5,106 L50,108.5 L50,84 Z'],
  ['glutes', 'M36,109 Q32.5,117 34.5,127 Q41,133 50,129 L50,109 Q43,105 36,109 Z'],
  ['hamstrings', 'M35,131 Q32.8,145 34.8,157 Q38,163 42,163 Q46.2,161 47.2,151 Q48.2,139 47.2,131 Q41,134 35,131 Z'],
  ['calves', 'M35,171 Q32,181 35,191 Q38,193 41,187 Q42,179 41,171 Q38,168 35,171 Z'],
  ['calves', 'M42,171 Q47,177 46,187 Q44,193 42,189 Q41,181 42,171 Z'],
];

const defs = h('defs', [
  h('linearGradient', { id: 'mmStrong', x1: 0, y1: 0, x2: 0, y2: 1 }, [
    h('stop', { offset: '0%', style: { stopColor: 'color-mix(in srgb, var(--accent) 70%, #ffd2a8)' } }),
    h('stop', { offset: '100%', style: { stopColor: 'var(--accent)' } }),
  ]),
  h('linearGradient', { id: 'mmLight', x1: 0, y1: 0, x2: 0, y2: 1 }, [
    h('stop', { offset: '0%', style: { stopColor: 'color-mix(in srgb, var(--accent) 35%, #ffffff)' } }),
    h('stop', { offset: '100%', style: { stopColor: 'color-mix(in srgb, var(--accent) 55%, #ffffff)' } }),
  ]),
  h('linearGradient', { id: 'mmIdle', x1: 0, y1: 0, x2: 0, y2: 1 }, [
    h('stop', { offset: '0%', style: { stopColor: 'color-mix(in srgb, var(--muted) 30%, var(--card))' } }),
    h('stop', { offset: '100%', style: { stopColor: 'color-mix(in srgb, var(--muted) 45%, var(--card))' } }),
  ]),
  h('linearGradient', { id: 'mmBody', x1: 0, y1: 0, x2: 0, y2: 1 }, [
    h('stop', { offset: '0%', style: { stopColor: 'color-mix(in srgb, var(--muted) 16%, var(--card))' } }),
    h('stop', { offset: '100%', style: { stopColor: 'color-mix(in srgb, var(--muted) 26%, var(--card))' } }),
  ]),
]);

function half(regions, muscles) {
  return [
    ...SILHOUETTE.map((d) => h('path', { d, fill: 'url(#mmBody)' })),
    ...regions.map(([m, d]) => {
      const v = muscles[m] || 0;
      const fill = v >= 1 ? 'url(#mmStrong)' : v > 0 ? 'url(#mmLight)' : 'url(#mmIdle)';
      return h('path', { d, fill, stroke: 'var(--card)', 'stroke-width': 0.9, 'stroke-linejoin': 'round' });
    }),
  ];
}

function figure(regions, muscles, dx, label) {
  return h('g', { transform: `translate(${dx},0)` }, [
    h('ellipse', { cx: 50, cy: 15, rx: 9.5, ry: 11.5, fill: 'url(#mmBody)' }),
    h('g', half(regions, muscles)),
    h('g', { transform: 'translate(100,0) scale(-1,1)' }, half(regions, muscles)),
    label && h('text', { x: 50, y: 230, 'text-anchor': 'middle', class: 'mm-label' }, label),
  ]);
}

/**
 * muscles: { chest: 1, triceps: 0.5, … }
 * size: pixel size (square). labels: show "Front / Back" under the figures (for big views).
 */
export function MuscleMap({ muscles = {}, size = 44, labels = false }) {
  const vb = labels ? '-6 0 217 236' : '-6 2 217 217';
  return h('svg', { viewBox: vb, width: size, height: size, class: 'muscle-map', 'aria-hidden': 'true' }, [
    defs,
    figure(FRONT, muscles, 0, labels ? 'Front' : null),
    figure(BACK, muscles, 105, labels ? 'Back' : null),
  ]);
}
