// Zoomed muscle picture: tap any exercise picture to see the worked muscles large.
import { h, cx } from '../vdom.js';
import { data, update } from '../store.js';
import { Sheet, Segmented } from './components.js';
import { MuscleMap, sideOf } from './musclemap.js';
import { muscleName } from '../logic/muscles.js';

// sheet: { type: 'muscleView', name, muscles, image }
export function MuscleViewSheet(sheet) {
  const muscles = sheet.muscles || {};
  const list = Object.entries(muscles).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const main = list.filter(([, v]) => v >= 1), helpers = list.filter(([, v]) => v < 1);
  if (!sheet.view) {
    const sides = new Set(list.map(([m]) => sideOf(m)));
    sheet.view = sides.has('both') || (sides.has('front') && sides.has('back')) ? 'both' : sides.has('back') ? 'back' : 'front';
  }
  const w = Math.min(window.innerWidth, 720) - 48;
  const size = sheet.view === 'both' ? Math.min(w, 420) : Math.min(420, Math.round(window.innerHeight * 0.48));
  const focus = (m) => {
    sheet.focus = sheet.focus === m ? null : m;
    const side = sideOf(m);
    if (sheet.focus && sheet.view !== 'both' && side !== 'both' && side !== sheet.view) sheet.view = side;
    update();
  };
  const row = ([m, v]) => h('button', { key: m, class: cx('mv-row', sheet.focus === m && 'on'), onclick: () => focus(m) }, [
    h('i', { class: v >= 1 ? 'main' : 'help' }),
    h('span.grow', muscleName(m, data.settings)),
    h('span.mv-pct', v >= 1 ? 'Main' : `Helper · ${Math.round(v * 100)} %`),
  ]);

  return h(Sheet, { title: sheet.name || 'Muscles worked' }, [
    h(Segmented, { small: true, value: sheet.view, onChange: (v) => { sheet.view = v; update(); }, options: [{ value: 'both', label: 'Both' }, { value: 'front', label: 'Front' }, { value: 'back', label: 'Back' }] }),
    h('div.mv-stage', MuscleMap({ muscles, size, labels: true, view: sheet.view, focus: sheet.focus })),
    list.length === 0 ? h('div.pad.muted.center', 'No muscles set for this exercise yet.') : h('div.mv-legend', [
      main.length > 0 && h('div.mv-head', 'Main muscles'),
      ...main.map(row),
      helpers.length > 0 && h('div.mv-head', 'Helper muscles'),
      ...helpers.map(row),
      h('div.mv-hint', sheet.focus ? 'Tap again to show all' : 'Tap a muscle to highlight it'),
    ]),
  ]);
}
