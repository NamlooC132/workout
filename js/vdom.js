// Tiny virtual-DOM renderer (no dependencies).
//
// h('div.card#main', {onclick}, children...) creates a virtual node.
// render(vnode, container) updates the real DOM with as few changes as possible,
// so inputs keep focus and the keyboard stays open while the app re-renders.
//
// Function components are plain functions: h(MyView, props) calls MyView(props).
// All state lives in the global store (see store.js); there are no hooks.

const SVG_NS = 'http://www.w3.org/2000/svg';

// Display-text translator (set by i18n). Applied to text and to placeholder / aria-label / title.
let TR = (s) => s;
export function setTranslator(fn) { TR = fn || ((s) => s); }
const TR_ATTRS = ['placeholder', 'aria-label', 'title', 'alt'];

export function h(tag, props, ...children) {
  if (props == null || typeof props !== 'object' || Array.isArray(props) || props.__v) {
    if (props !== undefined && props !== null) children.unshift(props);
    props = {};
  }
  const flat = [];
  flatten(children, flat);
  if (typeof tag === 'function') {
    return tag({ ...props, children: flat });
  }
  // "div.a.b#id" selector shorthand
  let cls = props.class || '';
  let id = props.id;
  if (typeof tag === 'string' && (tag.includes('.') || tag.includes('#'))) {
    const parts = tag.split(/(?=[.#])/);
    tag = parts[0] || 'div';
    for (const p of parts.slice(1)) {
      if (p[0] === '.') cls = cls ? `${p.slice(1)} ${cls}` : p.slice(1);
      else if (p[0] === '#') id = p.slice(1);
    }
  }
  const finalProps = { ...props };
  if (typeof tag === 'string' && tag !== 'path') for (const a of TR_ATTRS) if (typeof finalProps[a] === 'string') finalProps[a] = TR(finalProps[a]);
  if (cls) finalProps.class = cls; else delete finalProps.class;
  if (id) finalProps.id = id;
  return { __v: true, tag, props: finalProps, children: flat, key: props.key };
}

function flatten(list, out) {
  for (const c of list) {
    if (c === null || c === undefined || c === false || c === true) continue;
    if (Array.isArray(c)) flatten(c, out);
    else if (typeof c === 'object' && c.__v) out.push(c);
    else out.push({ __v: true, text: TR(String(c)) });
  }
}

/** Joins class names, skipping falsy ones: cx('a', cond && 'b'). */
export function cx(...names) {
  return names.filter(Boolean).join(' ');
}

export function render(vnode, container) {
  const old = container.__vnode;
  if (!old) {
    container.textContent = '';
    const el = create(vnode, false);
    container.appendChild(el);
  } else {
    patch(container, container.firstChild, old, vnode, false);
  }
  container.__vnode = vnode;
}

function create(v, svg) {
  if (v.text !== undefined) {
    const t = document.createTextNode(v.text);
    v.el = t;
    return t;
  }
  const isSvg = svg || v.tag === 'svg';
  const el = isSvg ? document.createElementNS(SVG_NS, v.tag) : document.createElement(v.tag);
  v.el = el;
  for (const k in v.props) setProp(el, k, v.props[k], undefined, isSvg);
  for (const c of v.children) el.appendChild(create(c, isSvg && v.tag !== 'foreignObject'));
  if (v.props.ref) v.props.ref(el);
  return el;
}

function patch(parent, el, oldV, newV, svg) {
  if (oldV === newV) return el;
  const sameType =
    oldV && el &&
    ((oldV.text !== undefined && newV.text !== undefined) ||
      (oldV.tag === newV.tag && oldV.key === newV.key && oldV.text === undefined && newV.text === undefined));
  if (!sameType) {
    const fresh = create(newV, svg);
    if (el) parent.replaceChild(fresh, el); else parent.appendChild(fresh);
    return fresh;
  }
  newV.el = el;
  if (newV.text !== undefined) {
    if (oldV.text !== newV.text) el.nodeValue = newV.text;
    return el;
  }
  const isSvg = svg || newV.tag === 'svg';
  const op = oldV.props, np = newV.props;
  for (const k in op) if (!(k in np)) setProp(el, k, undefined, op[k], isSvg);
  for (const k in np) {
    if (k === 'value' || k === 'checked' || op[k] !== np[k]) setProp(el, k, np[k], op[k], isSvg);
  }
  patchChildren(el, oldV.children, newV.children, isSvg && newV.tag !== 'foreignObject');
  if (np.ref && np.ref !== op.ref) np.ref(el);
  return el;
}

function patchChildren(el, oldC, newC, svg) {
  const keyed = newC.length > 0 && newC.every((c) => c.key !== undefined && c.key !== null);
  if (!keyed) {
    const domKids = Array.from(el.childNodes);
    const n = Math.max(oldC.length, newC.length);
    for (let i = 0; i < n; i++) {
      if (i >= newC.length) {
        if (domKids[i]) el.removeChild(domKids[i]);
      } else if (i >= oldC.length || !domKids[i]) {
        el.appendChild(create(newC[i], svg));
      } else {
        patch(el, domKids[i], oldC[i], newC[i], svg);
      }
    }
    return;
  }
  // Keyed: reuse elements by key, then put them in the new order.
  const oldByKey = new Map();
  oldC.forEach((c) => { if (c.key !== undefined && c.el) oldByKey.set(c.key, c); });
  const used = new Set();
  const nodes = newC.map((c) => {
    const prev = oldByKey.get(c.key);
    if (prev && !used.has(prev)) {
      used.add(prev);
      return patch(el, prev.el, prev, c, svg);
    }
    return create(c, svg);
  });
  for (const c of oldC) {
    if (!used.has(c) && c.el && c.el.parentNode === el) el.removeChild(c.el);
  }
  // Also drop any stray nodes not belonging to the new list.
  const wanted = new Set(nodes);
  for (const child of Array.from(el.childNodes)) if (!wanted.has(child)) el.removeChild(child);
  nodes.forEach((node, i) => {
    if (el.childNodes[i] !== node) el.insertBefore(node, el.childNodes[i] || null);
  });
}

function setProp(el, key, value, oldValue, svg) {
  if (key === 'key' || key === 'children' || key === 'ref') return;
  if (key.startsWith('on')) {
    el[key.toLowerCase()] = value || null;
    return;
  }
  if (key === 'style') {
    if (typeof value === 'string') el.style.cssText = value;
    else {
      if (typeof oldValue === 'object' && oldValue) for (const s in oldValue) if (!value || !(s in value)) el.style.removeProperty(s);
      if (value) for (const s in value) {
        if (s.startsWith('--')) el.style.setProperty(s, value[s]);
        else el.style[s] = value[s];
      }
    }
    return;
  }
  if (key === 'value' && !svg) {
    const str = value == null ? '' : String(value);
    // Never fight the user while they're typing in this field.
    if (el.value !== str && document.activeElement !== el) el.value = str;
    return;
  }
  if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'multiple') {
    el[key] = !!value;
    return;
  }
  if (key === 'innerHTML') {
    if (value !== oldValue) el.innerHTML = value || '';
    return;
  }
  if (key === 'class' && !svg) {
    el.className = value || '';
    return;
  }
  if (value === undefined || value === null || value === false) el.removeAttribute(key);
  else el.setAttribute(key, value === true ? '' : value);
}
