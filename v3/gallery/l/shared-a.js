/* Helpers for the focus, film, masonry, index, grid, strip and flow layouts. */

import { Spring, onTick, clamp } from '../../core/spring.js';
import { drag, project, rubberClamp, nearest } from '../../core/gesture.js';

export function h(tag, cls = '', text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

const CUTOUTS = new Set(['b5', 'b6']);

/** The element the engine flies: a clipping box holding the image, so a flight is never clipped by its slot. */
export function frame(work) {
  const f = h('div', CUTOUTS.has(work.id) ? 'g-a-frame is-cutout' : 'g-a-frame');
  f.dataset.work = work.id;
  const img = new Image();
  img.src = work.src;
  img.alt = work.alt;
  img.draggable = false;
  img.decoding = 'async';
  f.append(img);
  return f;
}

/** Every listener, spring, tick and observer of one mount. */
export function createScope(reduced = false) {
  const cleanups = new Set();
  const springs = new Set();
  const ticks = new Set();
  let parked = [];
  let paused = false;
  let alive = true;

  const startTick = (t) => { t.off = onTick(t.fn); };

  const s = {
    reduced,
    get alive() { return alive; },
    get paused() { return paused; },
    add(fn) { cleanups.add(fn); return fn; },
    on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      s.add(() => target.removeEventListener(type, fn, opts));
    },
    spring(opts) {
      const sp = new Spring(opts);
      springs.add(sp);
      return sp;
    },
    /** Pause-aware ticker. fn may return false to end itself. */
    tick(fn) {
      const t = { off: null, fn: null };
      const stop = () => { t.off?.(); t.off = null; ticks.delete(t); };
      t.fn = (dt, now) => { if (fn(dt, now) === false) stop(); };
      ticks.add(t);
      if (!paused) startTick(t);
      return stop;
    },
    drag(el, opts) { s.add(drag(el, opts)); },
    /**
     * drag() on an element the stage must not also drag. drag() refuses anything inside
     * [data-nodrag], and so does the stage, so the mark is lifted only while this
     * element's own handler runs. The stage, further up the bubble path, still sees it.
     */
    ownDrag(el, opts, blockStage = () => true) {
      const lift = () => el.removeAttribute('data-nodrag');
      const mark = () => { if (blockStage()) el.setAttribute('data-nodrag', ''); };
      mark();
      el.addEventListener('pointerdown', lift, { capture: true });
      s.add(drag(el, opts));
      el.addEventListener('pointerdown', mark);
      s.add(() => {
        el.removeEventListener('pointerdown', lift, { capture: true });
        el.removeEventListener('pointerdown', mark);
      });
    },
    /** Calls fn when the element's size really changes. */
    observe(el, fn) {
      let w = el.clientWidth;
      let hh = el.clientHeight;
      const ro = new ResizeObserver(() => {
        if (el.clientWidth === w && el.clientHeight === hh) return;
        w = el.clientWidth;
        hh = el.clientHeight;
        fn();
      });
      ro.observe(el);
      s.add(() => ro.disconnect());
    },
    /** Measurements depend on the display font, which may arrive after mount. */
    onFonts(fn) {
      document.fonts?.ready?.then(() => { if (alive) fn(); });
    },
    timeout(fn, ms) {
      const id = setTimeout(fn, ms);
      s.add(() => clearTimeout(id));
      return id;
    },
    pause() {
      if (paused) return;
      paused = true;
      parked = [...springs].filter((sp) => sp.active);
      parked.forEach((sp) => sp.stop());
      ticks.forEach((t) => { t.off?.(); t.off = null; });
    },
    resume() {
      if (!paused) return;
      paused = false;
      parked.forEach((sp) => sp.to(sp.target));
      parked = [];
      ticks.forEach((t) => { if (!t.off) startTick(t); });
    },
    destroy() {
      alive = false;
      springs.forEach((sp) => sp.stop());
      ticks.forEach((t) => t.off?.());
      ticks.clear();
      cleanups.forEach((fn) => fn());
      cleanups.clear();
      springs.clear();
      parked = [];
    },
  };
  return s;
}

/** Inverse of rubberClamp's overshoot, so a surface grabbed past its edge does not jump. */
function unrubber(value, min, max, dim, c = 0.55) {
  const undo = (r) => (r * dim) / (c * (dim - Math.min(Math.abs(r), dim * 0.98)));
  if (value < min) return min + undo(value - min);
  if (value > max) return max + undo(value - max);
  return value;
}

/**
 * One scrollable coordinate: drag 1:1, rubber band, momentum by project(), wheel that
 * lets go at the ends. With snaps() it lands on the point nearest the projection.
 */
export function createAxis(s, { value = 0, min = 0, max = 0, dim = 1, onChange, response = 0.8, snaps = null, rate = 0.998 }) {
  const sp = s.spring({ value, damping: 1, response, precision: 0.05, onChange });
  let base = value;
  let holdUntil = 0;
  let quiet = 0;
  const bounds = { min, max, dim };

  const go = (target, opts) => {
    if (s.reduced) sp.set(target);
    else sp.to(target, opts);
  };

  const axis = {
    spring: sp,
    get value() { return sp.value; },
    get target() { return sp.target; },
    get min() { return bounds.min; },
    get max() { return bounds.max; },
    setBounds(lo, hi, d) { bounds.min = lo; bounds.max = hi; bounds.dim = d; },
    /** Catch on pointer-down. */
    hold() { sp.stop(); clearTimeout(quiet); },
    begin() { sp.stop(); base = unrubber(sp.value, bounds.min, bounds.max, bounds.dim); },
    move(delta) { sp.set(rubberClamp(base + delta, bounds.min, bounds.max, bounds.dim)); },
    /** v is in the coordinate's own direction, px/s. */
    release(v = 0) {
      // Past an edge, a flick further out is mostly spent on the band.
      const outward = (sp.value < bounds.min && v < 0) || (sp.value > bounds.max && v > 0);
      if (outward) v *= 0.2;
      const landing = sp.value + project(v, rate);
      const points = snaps?.();
      const target = points ? nearest(landing, points) : clamp(landing, bounds.min, bounds.max);
      const thrown = Math.abs(v) > 500;
      go(target, { velocity: v, response, damping: points && thrown ? 0.86 : 1 });
      return target;
    },
    wheel(d) {
      if (bounds.max - bounds.min < 1 || !d) return false;
      const now = performance.now();
      const atEnd = (d > 0 && sp.target >= bounds.max - 0.5) || (d < 0 && sp.target <= bounds.min + 0.5);
      if (atEnd) return now < holdUntil;
      const t = clamp(sp.target + d, bounds.min, bounds.max);
      // The tail of a trackpad fling that reached the end should not also turn the page.
      if (t <= bounds.min || t >= bounds.max) holdUntil = now + 350;
      go(t, { response: 0.24, damping: 1 });
      if (snaps) {
        clearTimeout(quiet);
        quiet = setTimeout(() => { if (s.alive) axis.release(0); }, 170);
      }
      return true;
    },
  };
  s.add(() => clearTimeout(quiet));
  return axis;
}

/** Tab to a work and press Enter or Space: the same path as a tap. */
export function keyTap(s, el, label, fn) {
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', `${label} 크게 보기`);
  s.on(el, 'keydown', (e) => {
    if (e.target !== el || (e.key !== 'Enter' && e.key !== ' ') || e.repeat) return;
    e.preventDefault();
    fn();
  });
}

/* ---------- thumbnails ---------- */

/** cells: [workIndex, left, top, width, height, opacity?, rotate?] in percent of the box. */
export function drawCells(box, works, cells) {
  const wrap = h('div', 'g-a-thumb');
  for (const [i, l, t, w, hh, o, r] of cells) {
    const c = h('div', 'g-a-thumb-cell');
    c.style.cssText = `left:${l}%;top:${t}%;width:${w}%;height:${hh}%;${o === undefined ? '' : `opacity:${o};`}${r ? `transform:rotate(${r}deg);` : ''}`;
    const img = new Image();
    img.src = works[i % works.length].src;
    img.alt = '';
    img.draggable = false;
    c.append(img);
    wrap.append(c);
  }
  box.append(wrap);
  return wrap;
}

/** Text is drawn as bars: [left, top, width, height, strength]. */
export function drawBars(wrap, bars) {
  for (const [l, t, w, hh, o] of bars) {
    const b = h('span', 'g-a-thumb-bar');
    b.style.cssText = `left:${l}%;top:${t}%;width:${w}%;height:${hh}%;opacity:${o ?? 0.8}`;
    wrap.append(b);
  }
}
