// "How to do it" sheet: a beginner guide (setup, steps, common mistakes) you can open mid-workout.
import { h } from '../vdom.js';
import { icon } from './icons.js';
import { exercisesById } from '../store.js';
import { Sheet, ExercisePhoto } from './components.js';
import { guideFor, photoFor, catalogEntry, videoFor } from '../logic/catalog.js';
import { howToFor, genericTips, BEGINNER_NOTE } from '../logic/howto.js';

function List({ title, items, kind }) {
  if (!items || !items.length) return null;
  const Tag = kind === 'steps' || kind === 'setup' ? 'ol' : 'ul';
  return h('section.howto-sec', [
    h('h3.howto-h', title),
    h(`${Tag}.howto-list`, { class: kind }, items.map((t, i) => h('li', { key: i }, t))),
  ]);
}

// sheet: { type: 'howTo', name, exerciseId? }
export function HowToSheet(sheet) {
  const ex = sheet.exerciseId ? exercisesById().get(sheet.exerciseId) : null;
  const name = sheet.name || ex?.name || '';
  const g = howToFor(name);
  const equipment = ex?.equipment || catalogEntry(name)?.equipment;
  return h(Sheet, { title: 'How to do it', full: true }, [
    h('div.howto-name', name),
    ExercisePhoto({ name, photo: photoFor(name) }),
    ex?.notes && h('div.callout', { style: { margin: '10px 0' } }, [icon('note', 18), h('div', [h('b', 'Your note: '), ex.notes])]),
    g
      ? [
        h(List, { title: 'Setup', items: g.setup, kind: 'setup' }),
        h(List, { title: 'How to do it', items: g.steps, kind: 'steps' }),
        h(List, { title: 'Common mistakes', items: g.mistakes, kind: 'mistakes' }),
        h(List, { title: 'Tip', items: g.tips, kind: 'tips' }),
      ]
      : [
        h('div.callout', { style: { margin: '10px 0' } }, [icon('info', 18), 'There\'s no written guide for this exercise yet. Watch the video below, and keep these basics in mind:']),
        h(List, { title: 'Basics', items: genericTips(equipment), kind: 'tips' }),
      ],
    h('div.callout.blue', { style: { margin: '14px 0 10px' } }, [icon('sparkle', 18), BEGINNER_NOTE]),
    h('a.btn.btn-secondary.btn-block', { href: videoFor(name), target: '_blank', rel: 'noopener', style: { textDecoration: 'none' } }, [icon('play', 18), 'Watch a video on YouTube ↗']),
    guideFor(ex || { name }) !== videoFor(name) && h('a.btn.btn-plain.btn-block', { href: guideFor(ex || { name }), target: '_blank', rel: 'noopener', style: { textDecoration: 'none', marginTop: '6px' } }, 'Step-by-step guide with pictures ↗'),
  ]);
}
