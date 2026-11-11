// Settings → Background picture: pick a photo, shrink it, read its colors.
import { h } from '../vdom.js';
import { icon } from './icons.js';
import { data, toast, saveSettings } from '../store.js';
import { Row } from './components.js';
import { analyzePixels } from '../logic/wallpaper.js';

function loadPicture(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      // Picture for the background: up to 1400 px on the long side.
      const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      // Small copy to read the colors.
      const s = document.createElement('canvas');
      s.width = 48; s.height = Math.max(1, Math.round((48 * img.height) / img.width));
      const sx = s.getContext('2d', { willReadFrequently: true });
      sx.drawImage(img, 0, 0, s.width, s.height);
      const stats = analyzePixels(sx.getImageData(0, 0, s.width, s.height).data);
      URL.revokeObjectURL(url);
      resolve({ dataUrl: c.toDataURL('image/jpeg', 0.82), stats });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

export function BackgroundRow() {
  const s = data.settings;
  const glass = Number.isFinite(+s.bgGlass) ? +s.bgGlass : 50;
  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { dataUrl, stats } = await loadPicture(file);
      saveSettings({ bgImage: dataUrl, bgStats: stats });
    } catch { toast('Couldn’t read that picture'); }
  };
  const row = h(Row, {
    left: s.bgImage ? h('img.bg-thumb', { src: s.bgImage, alt: '' }) : icon('camera', 22),
    title: 'Background picture',
    subtitle: 'The colors of the app follow your picture',
    right: h('div.hstack', [
      h('label.btn.btn-secondary.btn-sm.photo-add', ['Choose', h('input.hidden-input', { type: 'file', accept: 'image/*', onchange: pick })]),
      s.bgImage && h('button.link-btn', { onclick: () => saveSettings({ bgImage: null, bgStats: null }) }, 'Remove picture'),
    ]),
  });
  return h('div', [
    row,
    s.bgImage && h('div.glass-row', [
      h('div.glass-top', [h('span', 'Glass'), h('span.muted', glass <= 10 ? 'Solid' : glass >= 90 ? 'Clear' : `${glass}%`)]),
      h('input.glass-slider', { type: 'range', min: 0, max: 100, step: 5, value: glass, 'aria-label': 'Glass',
        oninput: (e) => saveSettings({ bgGlass: Number(e.target.value) }) }),
      h('div.glass-ends.small.muted', [h('span', 'Solid'), h('span', 'Clear')]),
    ]),
  ]);
}
