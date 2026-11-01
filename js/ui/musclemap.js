// Original anatomy-style muscle chart (front + back) drawn in SVG.
// Worked muscles glow orange: strong = main muscle, soft = helper muscle.
// Generated from each exercise's muscle data, so every exercise gets a picture automatically.
//
// Only the LEFT half of each figure is drawn; the right half is a mirror copy.
// Each figure lives in a 100 × 220 box (centre line x = 50).
import { h } from '../vdom.js';

// Body outline pieces (left half)
const SILHOUETTE_RAW = [
  // torso
  'M50,35 L42,35 Q34,36 29,41 Q23,46 23,55 L26,63 Q29,75 33,82 Q36,93 34,104 Q32,111 35,117 L50,119 Z',
  // arm
  'M30,41 Q21,43 20,55 Q18,69 20,82 Q17,96 16,110 Q15,121 17,129 Q21,134 24,129 Q25,119 27,109 Q31,96 31,84 Q33,72 32,60 Z',
  // leg
  'M35,110 Q30,130 31,150 Q32,161 34,169 Q31,183 34,199 Q35,207 33,213 Q38,218 47,215 Q46,205 47,196 Q49,180 47,166 Q50,150 49.5,130 L50,118 Z',
  // neck
  'M44,26 L50,26 L50,38 L42,38 Z',
];

// ---------- Muscular build ----------
// The outlines above are drawn lean; this reshapes every point into a big, muscular
// V-taper: broad shoulders and chest, thick neck and arms, narrower waist, big legs.
const WIDTH = [[0, 1], [24, 1], [30, 1.18], [40, 1.27], [56, 1.24], [72, 1.12], [90, 1.04], [106, 1.08], [120, 1.15], [145, 1.18], [165, 1.12], [180, 1.18], [200, 1.15], [220, 1.1]];
const ARM_WIDTH = [[38, 1.24], [60, 1.18], [85, 1.08], [130, 1.0]];
const ARM_AXIS = [[38, 27], [50, 25.5], [70, 26], [86, 24.5], [104, 22.5], [130, 20.5]];
const ARM_KEYS = new Set(['biceps', 'triceps', 'forearms', 'arm']);
const DELT_KEYS = new Set(['front_delts', 'side_delts', 'rear_delts']);
function lerp(tbl, y) {
  if (y <= tbl[0][0]) return tbl[0][1];
  for (let i = 1; i < tbl.length; i++) if (y <= tbl[i][0]) { const [y0, a] = tbl[i - 1], [y1, b] = tbl[i]; return a + ((b - a) * (y - y0)) / (y1 - y0); }
  return tbl[tbl.length - 1][1];
}
function bulkPoint(x, y, kind) {
  if (kind === 'arm') {
    const ax = lerp(ARM_AXIS, y);
    x = ax + (x - ax) * 1.24 - 0.8;
    return [50 - (50 - x) * lerp(ARM_WIDTH, y), y];
  }
  if (kind === 'delt') { x = 26 + (x - 26) * 1.12 - 0.5; y = 50 + (y - 50) * 1.05; }
  return [50 - (50 - x) * lerp(WIDTH, y), y];
}
function bulk(d, kind) {
  const t = d.match(/[MLQZ]|-?\d*\.?\d+/g);
  let out = '', nums = [];
  const flush = () => { for (let i = 0; i < nums.length; i += 2) { const [x, y] = bulkPoint(nums[i], nums[i + 1], kind); out += `${+x.toFixed(2)},${+y.toFixed(2)} `; } nums = []; };
  for (const tok of t) {
    if (/[MLQZ]/.test(tok)) { flush(); out += tok; } else nums.push(parseFloat(tok));
  }
  flush();
  return out.trim();
}
const SILHOUETTE = SILHOUETTE_RAW.map((d, i) => bulk(d, i === 1 ? 'arm' : ''));
/** Puff a muscle up around its own centre so it fills the bigger frame. */
function puff(d, f) {
  const nums = (d.match(/-?\d*\.?\d+/g) || []).map(Number);
  let cx = 0, cy = 0;
  for (let i = 0; i < nums.length; i += 2) { cx += nums[i]; cy += nums[i + 1]; }
  cx /= nums.length / 2; cy /= nums.length / 2;
  let k = 0;
  return d.replace(/-?\d*\.?\d+/g, (n) => { const v = Number(n); const r = k++ % 2 === 0 ? cx + (v - cx) * f : cy + (v - cy) * f; return String(+r.toFixed(2)); });
}
const PUFF = { biceps: 1.14, triceps: 1.12, forearms: 1.14, chest: 1.05, quads: 1.08, hamstrings: 1.06, calves: 1.12, glutes: 1.04, lats: 1.04, front_delts: 1.06, side_delts: 1.06, rear_delts: 1.06 };
const build = (list) => list.map(([m, d]) => {
  const b = bulk(d, ARM_KEYS.has(m) ? 'arm' : DELT_KEYS.has(m) ? 'delt' : '');
  return [m, PUFF[m] ? puff(b, PUFF[m]) : b];
});

const FRONT = build([
  ['traps', 'M45,33 Q38,35 32,40 L40,41 Q45,38 47,35 Z'],
  ['side_delts', 'M29,41 Q22,43 21,52 Q21,58 23,61 Q24,52 27,47 Z'],
  ['front_delts', 'M35,40 Q28,42 26,49 Q27,56 30,60 Q32,52 36,46 Q37,42 35,40 Z'],
  ['chest', 'M50,42 L39,41 Q33,43 31,51 Q31,58 34,62 Q42,65 50,63 Z'],
  ['lats', 'M31,60.5 Q30.4,67 32.8,74.5 Q34.6,68.5 35.2,63.5 Q33,63.5 31,60.5 Z'],
  ['biceps', 'M27,62 Q23.5,68 23.5,76 Q24.5,83 28,85 Q31,78 31,70 Q31,64 29,61 Z'],
  ['forearms', 'M21.5,88 Q18.5,98 18.5,108 Q19.5,117 21.5,121 Q25,113 27,103 Q28,95 27,88 Z'],
  ['abs', 'M43.6,65 L49.4,65 Q51,65 51,66.6 L51,74 L42,74 L42,66.6 Q42,65 43.6,65 Z'],
  ['abs', 'M42,76 L51,76 L51,84.6 L42,84.6 Z'],
  ['abs', 'M42.4,86.4 L51,86.4 L51,95 L42.4,95 Z'],
  ['abs', 'M43.2,96.8 L51,96.8 L51,104.8 Q47,108 43.2,104 Z'],
  ['abs', 'M41,65 Q36,71 35,81 Q35,93 37.5,101 Q40.5,96 41,88 Q41.5,76 41,65 Z'], // obliques
  ['quads', 'M37,119 Q32.5,133 33.5,149 Q35.5,159 40.5,163 Q45,161 46.5,151 Q48,135 46.5,122 Q42,118 37,119 Z'],
  ['quads', 'M42,153 Q39.5,160 42.5,165 Q47,164 47,157 Q45,152 42,153 Z'],
  ['adductors', 'M47,121 Q45.5,130 46.8,142 Q49.5,134 50,124 Z'],
  ['calves', 'M35.5,172 Q33.5,183 35.5,195 Q37.5,197 38.8,192 Q39.8,182 38.8,172 Z'],
  ['calves', 'M42.5,170 Q46,180 45,193 Q43,193 41.8,187 Q40.8,178 42.5,170 Z'],
]);

const BACK = build([
  ['traps', 'M50,29 L44,32 Q36,35 30,41 Q37,42 42,45 Q46,48 50,52 Z'],
  ['upper_back', 'M50,53.5 Q46,49.5 42,46.5 Q37,43.5 32,43.5 Q32,48 34.2,51.3 Q40,54 44,60 Q47,66 50,74 Z'],
  ['side_delts', 'M28,40 Q21.5,43 20.5,52 Q21,57 22.5,60 Q23,51 26,46 Z'],
  ['rear_delts', 'M31,41 Q24.5,44 23.5,53 Q25.5,58 28.5,59 Q29.5,50 33.5,45 Z'],
  ['triceps', 'M23.5,61 Q20.5,69 21.5,79 Q23.5,85 27,85 Q30,77 30,69 Q29.5,63 27,60 Z'],
  ['forearms', 'M21.5,88 Q18.5,98 18.5,108 Q19.5,117 21.5,121 Q25,113 27,103 Q28,95 27,88 Z'],
  ['lats', 'M34,53.2 Q31.5,61 32.5,71 Q34.5,85 41,97 Q44.8,92.5 46.3,85 Q46,75 43.6,64.5 Q40,57.5 34,53.2 Z'],
  ['lower_back', 'M50,75.5 Q47.8,73.5 47.4,80 Q46.8,93 47.1,106 L50,108.3 Z'],
  ['glutes', 'M36,109 Q32.5,117 34.5,127 Q41,133 50,129 L50,109 Q43,105 36,109 Z'],
  ['hamstrings', 'M35,131 Q32.8,145 34.8,157 Q38,163 42,163 Q46.2,161 47.2,151 Q48.2,139 47.2,131 Q41,134 35,131 Z'],
  ['calves', 'M35,171 Q32,181 35,191 Q38,193 41,187 Q42,179 41,171 Q38,168 35,171 Z'],
  ['calves', 'M42,171 Q47,177 46,187 Q44,193 42,189 Q41,181 42,171 Z'],
]);

const defs = (glow) => h('defs', [
  h('linearGradient', { id: 'mmStrong', x1: 0, y1: 0, x2: 0.4, y2: 1 }, [
    h('stop', { offset: '0%', style: { stopColor: 'color-mix(in srgb, var(--accent) 62%, #ffcf9e)' } }),
    h('stop', { offset: '55%', style: { stopColor: 'var(--accent)' } }),
    h('stop', { offset: '100%', style: { stopColor: 'color-mix(in srgb, var(--accent) 78%, #7a1400)' } }),
  ]),
  h('linearGradient', { id: 'mmLight', x1: 0, y1: 0, x2: 0.4, y2: 1 }, [
    h('stop', { offset: '0%', style: { stopColor: 'color-mix(in srgb, var(--accent) 28%, #fff4ea)' } }),
    h('stop', { offset: '100%', style: { stopColor: 'color-mix(in srgb, var(--accent) 52%, #ffe2c8)' } }),
  ]),
  h('linearGradient', { id: 'mmIdle', x1: 0, y1: 0, x2: 0.3, y2: 1 }, [
    h('stop', { offset: '0%', style: { stopColor: 'color-mix(in srgb, var(--muted) 22%, var(--card))' } }),
    h('stop', { offset: '100%', style: { stopColor: 'color-mix(in srgb, var(--muted) 38%, var(--card))' } }),
  ]),
  h('linearGradient', { id: 'mmBody', x1: 0, y1: 0, x2: 0, y2: 1 }, [
    h('stop', { offset: '0%', style: { stopColor: 'color-mix(in srgb, var(--muted) 12%, var(--card))' } }),
    h('stop', { offset: '100%', style: { stopColor: 'color-mix(in srgb, var(--muted) 22%, var(--card))' } }),
  ]),
  glow && h('filter', { id: 'mmGlow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, [
    h('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 1.6, result: 'b' }),
    h('feFlood', { style: { floodColor: 'var(--accent)', floodOpacity: 0.55 } }),
    h('feComposite', { in2: 'b', operator: 'in', result: 'g' }),
    h('feMerge', [h('feMergeNode', { in: 'g' }), h('feMergeNode', { in: 'SourceGraphic' })]),
  ]),
]);

function half(regions, muscles, opts) {
  const outline = 'color-mix(in srgb, var(--muted) 32%, var(--card))';
  return [
    ...SILHOUETTE.map((d) => h('path', { d, fill: 'url(#mmBody)', stroke: opts.big ? outline : 'none', 'stroke-width': 0.6, 'stroke-linejoin': 'round' })),
    ...regions.map(([m, d]) => {
      let v = muscles[m] || 0;
      if (opts.focus && m !== opts.focus) v = v > 0 ? 0.001 : 0; // dim the others
      const fill = v >= 1 || (opts.focus === m && v > 0) ? 'url(#mmStrong)' : v > 0.1 ? 'url(#mmLight)' : v > 0 ? 'color-mix(in srgb, var(--accent) 18%, var(--card))' : 'url(#mmIdle)';
      const strong = v >= 1 || (opts.focus === m && v > 0);
      return h('path', {
        d, fill, stroke: 'var(--card)', 'stroke-width': opts.big ? 0.7 : 0.9, 'stroke-linejoin': 'round',
        filter: opts.big && strong ? 'url(#mmGlow)' : null,
      });
    }),
  ];
}

function figure(regions, muscles, dx, label, opts) {
  return h('g', { transform: `translate(${dx},0)` }, [
    h('ellipse', { cx: 50, cy: 15, rx: 10.2, ry: 12.2, fill: 'url(#mmBody)', stroke: opts.big ? 'color-mix(in srgb, var(--muted) 32%, var(--card))' : 'none', 'stroke-width': 0.6 }),
    h('g', half(regions, muscles, opts)),
    h('g', { transform: 'translate(100,0) scale(-1,1)' }, half(regions, muscles, opts)),
    label && h('text', { x: 50, y: 232, 'text-anchor': 'middle', class: 'mm-label' }, label),
  ]);
}

/**
 * muscles: { chest: 1, triceps: 0.5, … }
 * size: pixel size. labels: "Front / Back" captions. view: 'both' | 'front' | 'back'.
 * focus: highlight one muscle and dim the others (used in the zoom view).
 */
const LOWER = new Set(['quads', 'hamstrings', 'glutes', 'calves', 'adductors']);

/** For small pictures: the side (front/back) and body half that show the worked muscles best. */
function autoFrame(muscles) {
  // Frame the MAIN muscles (helpers on the other side still show in the zoom view).
  let worked = Object.keys(muscles).filter((m) => muscles[m] >= 1 && sideOf(m));
  if (!worked.length) worked = Object.keys(muscles).filter((m) => muscles[m] > 0 && sideOf(m));
  if (!worked.length) return { view: 'both', y: [2, 217] };
  const prefer = { lats: 'back', traps: 'back' };
  const sides = new Set(worked.map((m) => prefer[m] || sideOf(m)).filter((x) => x !== 'both'));
  const view = sides.size === 2 ? 'both' : sides.size === 1 ? [...sides][0] : 'front';
  const lower = worked.filter((m) => LOWER.has(m)).length, upper = worked.length - lower;
  if (view !== 'both' && !lower) return { view, y: [0, 124] };
  if (view !== 'both' && !upper) return { view, y: [100, 220] };
  return { view, y: [2, 217] };
}

/**
 * muscles: { chest: 1, triceps: 0.5, … }
 * size: pixel size. labels: "Front / Back" captions. view: 'both' | 'front' | 'back' | 'auto'
 * ('auto' = small picture zoomed to where the work happens). focus: highlight one muscle (zoom view).
 */
export function MuscleMap({ muscles = {}, size = 44, labels = false, view = 'both', focus = null }) {
  const big = size >= 110;
  const opts = { big, focus };
  let vb, width = size;
  if (view === 'auto') {
    const f = autoFrame(muscles);
    view = f.view;
    if (view === 'both') vb = '-8 2 228 217';
    else {
      const hgt = f.y[1] - f.y[0];
      const wid = Math.max(114, hgt); // keep it square-ish, figure centred
      vb = `${50 - wid / 2} ${f.y[0]} ${wid} ${hgt}`;
    }
  } else {
    const one = view !== 'both';
    vb = one ? (labels ? '-7 0 114 238' : '-7 2 114 217') : labels ? '-8 0 228 238' : '-8 2 228 217';
    if (one) width = Math.round(size * (114 / 238));
  }
  return h('svg', { viewBox: vb, width, height: size, class: 'muscle-map', 'aria-hidden': 'true' }, [
    defs(big),
    view !== 'back' && figure(FRONT, muscles, 0, labels ? 'Front' : null, opts),
    view !== 'front' && figure(BACK, muscles, view === 'both' ? 112 : 0, labels ? 'Back' : null, opts),
  ]);
}

/** Which side of the body a muscle is drawn on. */
export function sideOf(muscle) {
  const f = FRONT.some(([m]) => m === muscle), b = BACK.some(([m]) => m === muscle);
  return f && b ? 'both' : f ? 'front' : b ? 'back' : null;
}
