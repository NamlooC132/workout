// Reusable UI pieces: headers, list rows, steppers, number fields, sheets, charts, drag-to-reorder.
import { h, cx } from '../vdom.js';
import { icon } from './icons.js';
import { MuscleMap } from './musclemap.js';
import { data, ui, update, closeSheet, openSheet } from '../store.js';
import { parseNum, fmtNum, fmtGroup } from '../logic/util.js';
import { displayWeight, fromDisplayWeight } from '../logic/units.js';
import { videoFor, thumbFor } from '../logic/catalog.js';

// ---------- Navigation ----------
export function nav(path) {
  if (location.hash !== '#' + path) location.hash = path;
}

export function back(fallback = '/routines') {
  if (history.length > 1 && sessionStorageSafe('navCount') > 0) history.back();
  else nav(fallback);
}

function sessionStorageSafe(k) {
  try { return Number(sessionStorage.getItem(k) || 0); } catch { return 0; }
}

// ---------- Layout ----------
export function Page({ title, backTo, actions, large = true, children, subtitle, left }) {
  return h('div.page', [
    h('header.page-header', { class: large ? 'large' : '' }, [
      h('div.header-bar', [
        left || (backTo
          ? h('button.icon-btn.back', { onclick: () => back(backTo), 'aria-label': 'Back' }, icon('chevronLeft', 26))
          : h('span.spacer')),
        !large && h('div.header-title', title),
        h('div.header-actions', actions || []),
      ]),
      large && h('h1.page-title', title),
      subtitle && h('div.page-subtitle', subtitle),
    ]),
    h('main.page-body', children),
  ]);
}

export function Section({ title, footer, children, right, flush }) {
  return h('section.section', [
    (title || right) && h('div.section-head', [h('span', title || ''), right || null]),
    h('div.card', { class: flush ? 'flush' : '' }, children),
    footer && h('div.section-foot', footer),
  ]);
}

export function Row({ title, subtitle, left, right, onClick, chevron, danger, key, class: klass, children }) {
  const Tag = onClick ? 'button' : 'div';
  return h(Tag, { class: cx('row', onClick && 'tappable', danger && 'danger', klass), onclick: onClick, key }, [
    left && h('div.row-left', left),
    h('div.row-main', [
      title !== undefined && h('div.row-title', title),
      subtitle && h('div.row-sub', subtitle),
      children,
    ]),
    right !== undefined && right !== null && h('div.row-right', right),
    chevron && h('span.chev', icon('chevronRight', 18)),
  ]);
}

export function Empty({ iconName = 'dumbbell', title, text, action }) {
  return h('div.empty', [
    h('div.empty-icon', icon(iconName, 40)),
    h('div.empty-title', title),
    text && h('div.empty-text', text),
    action,
  ]);
}

// ---------- Controls ----------
export function Button({ onClick, children, kind = 'primary', size, disabled, block, type = 'button', class: klass, label }) {
  return h('button', { type, class: cx('btn', `btn-${kind}`, size && `btn-${size}`, block && 'btn-block', klass), onclick: onClick, disabled, 'aria-label': label }, children);
}

export function IconButton({ name, onClick, label, size = 22, class: klass, disabled }) {
  return h('button', { class: cx('icon-btn', klass), onclick: onClick, 'aria-label': label, title: label, disabled }, icon(name, size));
}

export function Stepper({ value, onChange, step = 1, min = 0, max = 9999, format = (v) => v }) {
  const set = (v) => onChange(Math.min(max, Math.max(min, Math.round(v * 1000) / 1000)));
  return h('div.stepper', [
    h('button.step-btn', { onclick: () => set(value - step), disabled: value <= min, 'aria-label': 'Decrease' }, icon('minus', 20)),
    h('span.step-val', format(value)),
    h('button.step-btn', { onclick: () => set(value + step), disabled: value >= max, 'aria-label': 'Increase' }, icon('plus', 20)),
  ]);
}

export function Toggle({ checked, onChange, label }) {
  return h('label.toggle', { 'aria-label': label }, [
    h('input', { type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) }),
    h('span.toggle-track', h('span.toggle-thumb')),
  ]);
}

export function Segmented({ options, value, onChange, small, tabs }) {
  // tabs: page-level sections – plain words with an underline under the active one.
  if (tabs) {
    return h('div.tabs-u', { role: 'tablist' }, options.map((o) =>
      h('button', { key: String(o.value), role: 'tab', 'aria-selected': o.value === value ? 'true' : 'false', class: cx('tab-u', o.value === value && 'active'), onclick: () => onChange(o.value) }, o.label)));
  }
  return h('div.segmented', { class: small ? 'small' : '' }, options.map((o) =>
    h('button', { key: String(o.value), class: cx('seg', o.value === value && 'active'), onclick: () => onChange(o.value) }, o.label)));
}

export function Chip({ active, onClick, children, kind }) {
  return h('button', { class: cx('chip', active && 'active', kind && `chip-${kind}`), onclick: onClick }, children);
}

/**
 * Big numeric field. Opens the number keypad, selects all on tap so typing replaces the value,
 * and reports every change immediately (so nothing is lost if you tap ✓ without closing the keyboard).
 */
export function NumberField({ value, onChange, decimals = true, placeholder = '0', class: klass, label, ariaLabel }) {
  const shown = value === null || value === undefined ? '' : fmtNum(value);
  return h('input', {
    class: cx('num-field', klass),
    type: 'text',
    inputmode: decimals ? 'decimal' : 'numeric',
    enterkeyhint: 'done',
    autocomplete: 'off',
    placeholder,
    'aria-label': ariaLabel || label,
    value: shown,
    onfocus: (e) => { const el = e.target; setTimeout(() => { try { el.select(); } catch { /* ignore */ } }, 0); },
    oninput: (e) => {
      let n = parseNum(e.target.value);
      if (n !== null && !decimals) n = Math.round(n);
      if (n !== null && n < 0) n = 0;
      onChange(n);
    },
    onblur: (e) => {
      const n = parseNum(e.target.value);
      e.target.value = n === null ? '' : fmtNum(decimals ? n : Math.round(n));
    },
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); },
  });
}

/** Weight field showing the user's unit; stores kg. */
export function WeightField({ kg, onChange, class: klass, placeholder }) {
  const unit = data.settings.unit;
  return h(NumberField, {
    value: kg === null || kg === undefined ? null : displayWeight(kg, unit),
    onChange: (v) => onChange(v === null ? null : fromDisplayWeight(v, unit)),
    class: klass, placeholder: placeholder || '0', ariaLabel: `Weight in ${unit}`,
  });
}

export function TextField({ value, onChange, placeholder, multiline, label, autofocus }) {
  const props = {
    class: 'text-field', placeholder, 'aria-label': label || placeholder, value: value || '',
    oninput: (e) => onChange(e.target.value),
    ref: autofocus ? (el) => { if (!el.__focused) { el.__focused = true; setTimeout(() => el.focus(), 60); } } : undefined,
  };
  return multiline ? h('textarea', { ...props, rows: 3 }) : h('input', { ...props, type: 'text', enterkeyhint: 'done' });
}

/** Example photo of an exercise (from Pexels) with a small credit; nothing if there's none. */
export function ExercisePhoto({ name, photo }) {
  if (!photo) return null;
  return h('figure.ex-photo', [
    h('img', { src: photo.src, alt: `${name} – example`, loading: 'lazy', onerror: (e) => { e.target.closest('figure').style.display = 'none'; } }),
    photo.page
      ? h('figcaption', h('a', { href: photo.page, target: '_blank', rel: 'noopener' }, photo.credit || 'Photo'))
      : h('figcaption.ai-note', [
        h('span', 'AI-generated picture – it can get the machine or the movement wrong, so don’t rely on it.'), ' ',
        h('a', { href: videoFor(name), target: '_blank', rel: 'noopener' }, 'Not sure how it looks? Watch a video ↗'),
      ]),
  ]);
}

/** Exercise picture: your photo, else the AI picture, else an automatic muscle map, else initials. Tap to zoom the muscles. */
export function Thumb({ image, size = 44, name, muscles, zoom = true }) {
  const hasMuscles = muscles && Object.values(muscles).some((v) => v > 0);
  const canZoom = zoom && hasMuscles;
  const pic = image || thumbFor(name);
  return h('div.thumb', {
    class: cx(!pic && hasMuscles && 'map', pic && !image && 'ai', canZoom && 'zoomable'),
    style: { width: size + 'px', height: size + 'px', borderRadius: Math.round(size * 0.26) + 'px' },
    onclick: canZoom ? (e) => { e.stopPropagation(); e.preventDefault(); openSheet({ type: 'muscleView', name, muscles, image }); } : undefined,
    role: canZoom ? 'button' : undefined,
    'aria-label': canZoom ? `Show muscles worked by ${name || 'this exercise'}` : undefined,
  },
    pic ? h('img', { src: pic, alt: '', loading: 'lazy' })
      : hasMuscles ? MuscleMap({ muscles, size, view: 'auto' })
        : h('span.thumb-ph', name ? initials(name) : icon('dumbbell', Math.round(size * 0.45))));
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// ---------- Sheets & dialogs ----------
export function Sheet({ title, onClose = closeSheet, actions, children, full, left }) {
  return h('div.sheet-wrap', { onclick: (e) => { if (e.target.classList.contains('sheet-wrap')) onClose(); } }, [
    h('div.sheet', { class: full ? 'full' : '' }, [
      h('div.sheet-grabber'),
      h('div.sheet-head', [
        left || h('button.link-btn', { onclick: onClose }, 'Close'),
        h('div.sheet-title', title),
        h('div.sheet-actions', actions || [h('span')]),
      ]),
      h('div.sheet-body', children),
    ]),
  ]);
}

export function Dialog() {
  const d = ui.dialog;
  if (!d) return null;
  const close = () => { ui.dialog = null; update(); };
  return h('div.dialog-wrap', { onclick: (e) => { if (e.target.classList.contains('dialog-wrap')) close(); } },
    h('div.dialog', { role: 'alertdialog' }, [
      h('div.dialog-title', d.title),
      d.message && h('div.dialog-msg', d.message),
      h('div.dialog-actions', [
        ...(d.extra || []).map((x) => h('button', { class: cx('dialog-btn', x.destructive && 'destructive'), onclick: () => { close(); x.onClick(); } }, x.text)),
        d.onConfirm && h('button', { class: cx('dialog-btn', d.destructive && 'destructive', 'strong'), onclick: () => { close(); d.onConfirm(); } }, d.confirmText || 'OK'),
        h('button.dialog-btn', { onclick: () => { close(); d.onCancel && d.onCancel(); } }, d.cancelText || 'Cancel'),
      ]),
    ]));
}

export function Toast() {
  const t = ui.toast;
  if (!t) return null;
  return h('div.toast', { key: t.id, role: 'status' }, [
    h('span', t.message),
    t.action && h('button.toast-action', { onclick: () => { ui.toast = null; t.action.onClick(); update(); } }, t.action.text),
  ]);
}

// ---------- Charts (SVG) ----------
/** points: [{ x: ms, y: number }] oldest first. */
export function LineChart({ points, height = 180, formatY = (v) => fmtGroup(v, 1), color = 'var(--accent)', id = 'chart' }) {
  if (!points || points.length === 0) return h('div.chart-empty', 'No data yet');
  const W = 340, H = height, padL = 40, padR = 12, padT = 14, padB = 24;
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  min -= span * 0.1; max += span * 0.1;
  const xs = points.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const sx = (x) => (x1 === x0 ? (padL + W - padR) / 2 : padL + ((x - x0) / (x1 - x0)) * (W - padL - padR));
  const sy = (y) => padT + (1 - (y - min) / (max - min)) * (H - padT - padB);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const sel = ui.tabState['chartSel_' + id];
  const selPoint = sel !== undefined ? points[sel] : null;
  const ticks = [min + (max - min) * 0.1, (min + max) / 2, max - (max - min) * 0.1];
  const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return h('div.chart', [
    h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', preserveAspectRatio: 'none' }, [
      ...ticks.map((t) => h('g', [
        h('line', { x1: padL, x2: W - padR, y1: sy(t), y2: sy(t), class: 'grid' }),
        h('text', { x: padL - 6, y: sy(t) + 4, 'text-anchor': 'end', class: 'axis' }, formatY(t)),
      ])),
      h('text', { x: padL, y: H - 6, class: 'axis' }, fmtDate(x0)),
      points.length > 1 && h('text', { x: W - padR, y: H - 6, 'text-anchor': 'end', class: 'axis' }, fmtDate(x1)),
      h('path', { d: path, fill: 'none', stroke: color, 'stroke-width': 2.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
      ...points.map((p, i) => h('circle', {
        cx: sx(p.x), cy: sy(p.y), r: sel === i ? 6 : 3.5, fill: sel === i ? color : 'var(--card)', stroke: color, 'stroke-width': 2,
        onclick: () => { ui.tabState['chartSel_' + id] = sel === i ? undefined : i; update(); },
      })),
      // Bigger invisible tap targets
      ...points.map((p, i) => h('rect', {
        x: sx(p.x) - 10, y: padT, width: 20, height: H - padT - padB, fill: 'transparent',
        onclick: () => { ui.tabState['chartSel_' + id] = sel === i ? undefined : i; update(); },
      })),
    ]),
    h('div.chart-label', selPoint ? `${fmtDate(selPoint.x)} · ${formatY(selPoint.y)}${selPoint.label ? ' · ' + selPoint.label : ''}` : 'Tap a point for details'),
  ]);
}

/** Vertical bar chart: bars [{ label, value }]. */
export function BarChart({ bars, height = 140, formatY = (v) => fmtGroup(v, 1), highlightLast = true }) {
  if (!bars.length) return h('div.chart-empty', 'No data yet');
  const max = Math.max(1, ...bars.map((b) => b.value));
  // Label only every few bars (always the latest one) so dates never overlap.
  const every = Math.max(1, Math.ceil(bars.length / 4));
  return h('div.bars', { style: { height: height + 'px' } }, bars.map((b, i) =>
    h('div.bar-col', { key: i }, [
      h('div.bar-val', b.value ? formatY(b.value) : ''),
      h('div.bar', { class: highlightLast && i === bars.length - 1 ? 'current' : '', style: { height: `${(b.value / max) * 100}%` } }),
      h('div.bar-label', (bars.length - 1 - i) % every === 0 ? b.label : '\u00a0'),
    ])));
}

/** Horizontal progress bar with a target zone. */
export function TargetBar({ direct, indirect, target, maxScale }) {
  const total = direct + indirect;
  const scale = Math.max(maxScale || 0, total, target?.max || 0, 1) * 1.08;
  const pct = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  return h('div.tbar', [
    target && (target.min || target.max) && h('div.tbar-zone', { style: { left: pct(target.min || 0), width: `calc(${pct(target.max || scale)} - ${pct(target.min || 0)})` } }),
    h('div.tbar-direct', { style: { width: pct(direct) } }),
    h('div.tbar-indirect', { style: { left: pct(direct), width: pct(indirect) } }),
  ]);
}

/**
 * Spider (radar) chart of sets per muscle – one spoke per muscle.
 * axes: [{ key, label, main, helper, status: 'low'|'ok'|'high'|'none' }]
 * Dark fill = main-muscle sets, light fill = + helper sets. Names below target are yellow.
 */
export function SpiderChart({ axes, selected, onPick }) {
  const n = axes.length;
  if (n < 3) return null;
  const W = 400, H = 390, cx = 200, cy = 195, R = 120;
  const raw = Math.max(1, ...axes.map((a) => a.main + a.helper));
  const stepV = raw <= 4 ? 1 : raw <= 8 ? 2 : raw <= 20 ? 5 : 10;
  const scale = Math.ceil(raw / stepV) * stepV;
  const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, v) => {
    const r = R * Math.min(1, Math.max(0, v || 0) / scale);
    return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  };
  const pts = (vals) => vals.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const ring = (v) => axes.map((_, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const lblA = -Math.PI / 2 + Math.PI / n; // ring numbers sit between the first two spokes
  const levels = [];
  for (let v = stepV; v <= scale; v += stepV) levels.push(v);
  return h('svg.spider', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Sets per muscle', direction: 'ltr' }, [
    ...levels.map((v) => h('polygon', { key: 'r' + v, points: ring(v), fill: 'none', stroke: 'var(--sep)', 'stroke-width': v === scale ? 1.2 : 0.8 })),
    ...axes.map((_, i) => { const [x, y] = pt(i, scale); return h('line', { key: 's' + i, x1: cx, y1: cy, x2: x.toFixed(1), y2: y.toFixed(1), stroke: 'var(--sep)', 'stroke-width': 0.8 }); }),
    h('polygon', { points: pts(axes.map((a) => a.main + a.helper)), fill: 'color-mix(in srgb, var(--helper) 55%, transparent)', stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    h('polygon', { points: pts(axes.map((a) => a.main)), fill: 'color-mix(in srgb, var(--accent) 80%, transparent)', stroke: 'none' }),
    ...axes.map((a, i) => { const [x, y] = pt(i, a.main + a.helper); return h('circle', { key: 'd' + i, cx: x.toFixed(1), cy: y.toFixed(1), r: a.key === selected ? 4.5 : 3, fill: 'var(--accent)' }); }),
    ...levels.map((v) => h('text', { key: 'l' + v, x: (cx + ((R * v) / scale) * Math.cos(lblA)).toFixed(1), y: (cy + ((R * v) / scale) * Math.sin(lblA) + 3).toFixed(1), 'text-anchor': 'middle', 'font-size': 9.5, fill: 'var(--muted)' }, String(v))),
    ...axes.map((a, i) => {
      const c = Math.cos(ang(i)), s = Math.sin(ang(i));
      const x = cx + (R + 10) * c, y = cy + (R + 10) * s + (s > 0.3 ? 9 : s < -0.3 ? -2 : 4);
      const anchor = c > 0.05 ? 'start' : c < -0.05 ? 'end' : 'middle';
      const color = a.status === 'low' ? 'var(--yellow)' : 'var(--text)';
      return h('text', {
        key: 't' + a.key, x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': anchor, 'font-size': 11.5,
        'font-weight': a.key === selected ? 800 : 600, fill: color, style: { cursor: 'pointer' },
        onclick: onPick ? () => onPick(a.key) : undefined,
      }, a.label);
    }),
  ]);
}

// ---------- Drag to reorder ----------
/**
 * Use on a drag handle: onpointerdown: (e) => startDrag(e, (from, to) => …)
 * Rows must have the attribute data-drag-row and be siblings in the same parent.
 */
export function startDrag(e, onDrop) {
  const row = e.target.closest('[data-drag-row]');
  if (!row) return;
  e.preventDefault();
  const list = row.parentElement;
  const rows = Array.from(list.querySelectorAll(':scope > [data-drag-row]'));
  const from = rows.indexOf(row);
  const rects = rows.map((r) => r.getBoundingClientRect());
  const startY = e.clientY;
  const rowH = rects[from].height;
  let to = from;
  row.classList.add('dragging');
  const handle = e.target;
  try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  const move = (ev) => {
    const dy = ev.clientY - startY;
    row.style.transform = `translateY(${dy}px)`;
    const centre = rects[from].top + rowH / 2 + dy;
    to = from;
    rects.forEach((r, i) => {
      const mid = r.top + r.height / 2;
      if (i < from && centre < mid) to = Math.min(to, i);
      if (i > from && centre > mid) to = Math.max(to, i);
    });
    rows.forEach((r, i) => {
      if (i === from) return;
      let shift = 0;
      if (from < to && i > from && i <= to) shift = -rowH;
      if (from > to && i >= to && i < from) shift = rowH;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };
  const end = () => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    rows.forEach((r) => { r.style.transform = ''; });
    row.classList.remove('dragging');
    if (to !== from) onDrop(from, to);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

export function moveItem(list, from, to) {
  const copy = list.slice();
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
}

export function DragHandle({ onDrop, label = 'Drag to reorder' }) {
  return h('span.drag-handle', { onpointerdown: (e) => startDrag(e, onDrop), 'aria-label': label, role: 'button' }, icon('grip', 20));
}

// ---------- Formatting helpers bound to settings ----------
export function fmtW(kg, { unit = true } = {}) {
  if (kg === null || kg === undefined) return '–';
  const u = data.settings.unit;
  return `${fmtGroup(displayWeight(kg, u))}${unit ? ' ' + u : ''}`;
}

export function fmtDate(ms, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(ms).toLocaleDateString(undefined, opts);
}

export function fmtDateTime(ms) {
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function relDay(ms) {
  const days = Math.floor((startOf(Date.now()) - startOf(ms)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  return fmtDate(ms, { day: 'numeric', month: 'short' });
}
function startOf(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
