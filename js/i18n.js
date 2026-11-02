// Language support. The app is written in English; when Hebrew is on, every piece of text is
// translated right before it is drawn (see vdom.js), so screens don't need special code.
//   DICT     – exact phrases (English → Hebrew)
//   PATTERNS – text with numbers or names in it, e.g. "3 of 15 sets"
//   NAMES    – exercise names
import { DICT, PATTERNS } from './i18n/he.js';
import { NAMES } from './i18n/he-exercises.js';

// Keys are matched without surrounding spaces.
for (const k of Object.keys(DICT)) { const t = k.trim(); if (t !== k && !(t in DICT)) DICT[t] = DICT[k].trim(); }

let lang = 'en';
const cache = new Map();

export function getLang() { return lang; }
export function isHe() { return lang === 'he'; }

export function setLang(l) {
  const next = l === 'he' ? 'he' : 'en';
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root.lang !== next) root.lang = next;
    const dir = next === 'he' ? 'rtl' : 'ltr';
    if (root.dir !== dir) root.dir = dir;
  }
  if (next !== lang) { lang = next; cache.clear(); }
}

const HAS_LATIN = /[A-Za-z]/;

function lookup(core) {
  if (core in DICT) return DICT[core];
  if (core in NAMES) return NAMES[core];
  for (const [re, rep] of PATTERNS) {
    const m = core.match(re);
    if (m) {
      const g = m.map((x, i) => (i === 0 ? x : x === undefined ? '' : x));
      return typeof rep === 'function' ? rep(g, tr) : rep.replace(/\$(\d)/g, (_, i) => tr(g[i] || ''));
    }
  }
  // "A · B · C" or "A, B" → translate each part.
  for (const sep of [' · ', ', ']) {
    if (!core.includes(sep)) continue;
    const parts = core.split(sep);
    const out = parts.map((p) => tr(p));
    if (out.some((p, i) => p !== parts[i])) return out.join(sep);
  }
  return undefined;
}

/** Translate one piece of display text (returns it unchanged in English or when unknown). */
export function tr(s) {
  if (lang !== 'he' || typeof s !== 'string' || !HAS_LATIN.test(s)) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const found = lookup(m[2]);
  let out = found === undefined ? s : m[1] + found + m[3];
  out = out.replace(/(^|[\s\d(])kg\b/g, '$1ק״ג').replace(/(^|[\s\d(])km\b/g, '$1ק״מ').replace(/(^|[\s\d(])lbs\b/g, '$1ליב׳');
  if (cache.size > 4000) cache.clear();
  cache.set(s, out);
  return out;
}

/** Hebrew name of a catalog exercise (or null). Used for search. */
export function heName(name) {
  return NAMES[String(name || '').trim()] || null;
}

// Dates and times follow the chosen language.
if (typeof Date !== 'undefined' && !Date.prototype.__i18n) {
  for (const fn of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
    const orig = Date.prototype[fn];
    Date.prototype[fn] = function (loc, opts) {
      return orig.call(this, loc === undefined && lang === 'he' ? 'he-IL' : loc, opts);
    };
  }
  Date.prototype.__i18n = true;
}
