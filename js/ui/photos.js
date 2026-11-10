// Workout photos (e.g. a pump photo). Full-size photos are stored on the phone as Blobs in their own store
// (`photos`), plus a small thumbnail for lists. They are included in backups.
import { h } from '../vdom.js';
import { icon } from './icons.js';
import { data, update, toast, confirm, savePhoto, deletePhoto } from '../store.js';
import { uid } from '../logic/util.js';

export const workoutPhotos = (workoutId) => (data.photos || []).filter((p) => p.workoutId === workoutId).sort((a, b) => a.addedAt - b.addedAt);

// One object URL per photo (created once, so lists do not leak memory).
const urls = new Map();
export function photoUrl(p) {
  if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob));
  return urls.get(p.id);
}

function makeThumb(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 320 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

export async function addPhotos(workoutId, files) {
  let added = 0;
  for (const file of Array.from(files || [])) {
    try {
      const thumb = await makeThumb(file);
      savePhoto({ id: uid(), workoutId, addedAt: Date.now() + added, blob: file, thumb });
      added++;
    } catch { toast("Couldn’t read one of the photos"); }
  }
  if (added) update();
}

/** Blob ⇄ data URL for backups. */
export const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
export const dataUrlToBlob = (url) => fetch(url).then((r) => r.blob());

/** "Add photo" button (camera or gallery, one or more). */
export function AddPhotoButton({ workoutId, label = 'Add photo' }) {
  return h('label.btn.btn-secondary.btn-block.photo-add', [
    icon('plus', 18), label,
    h('input.hidden-input', { type: 'file', accept: 'image/*', multiple: true, onchange: (e) => { const files = Array.from(e.target.files || []); e.target.value = ''; addPhotos(workoutId, files); } }),
  ]);
}

/** Small thumbnails with a remove button (used on Workout complete). */
export function PhotoStrip({ workoutId }) {
  const list = workoutPhotos(workoutId);
  if (!list.length) return null;
  return h('div.photo-strip', list.map((p) => h('div.photo-thumb', { key: p.id }, [
    h('img', { src: p.thumb, alt: 'Workout photo' }),
    h('button.photo-x', { 'aria-label': 'Remove photo', onclick: () => confirm({ title: 'Remove this photo?', message: '', confirmText: 'Remove photo', destructive: true, onConfirm: () => deletePhoto(p.id) }) }, icon('x', 14)),
  ])));
}

/** Swipe left / right through the photos of a workout. */
export function PhotoCarousel({ workoutId }) {
  const list = workoutPhotos(workoutId);
  if (!list.length) return null;
  return h('div.photo-carousel-wrap', [
    h('div.photo-carousel', list.map((p, i) => h('div.photo-slide', { key: p.id }, [
      h('img', { src: photoUrl(p), alt: `Workout photo ${i + 1}` }),
      list.length > 1 && h('span.photo-count', `${i + 1} / ${list.length}`),
      h('button.photo-x', { 'aria-label': 'Remove photo', onclick: () => confirm({ title: 'Remove this photo?', message: '', confirmText: 'Remove photo', destructive: true, onConfirm: () => deletePhoto(p.id) }) }, icon('x', 14)),
    ]))),
  ]);
}
