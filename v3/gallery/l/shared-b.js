/* Helpers for timeline, coverflow, stack, museum. */
import { Spring, clamp } from '../../core/spring.js';
import { drag } from '../../core/gesture.js';

export function h(tag, cls, parent, props) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (props) Object.assign(el, props);
  parent?.append(el);
  return el;
}

/** Everything a mount acquires, released at once. Paused springs resume with their velocity. */
export function lifecycle() {
  const cleanups = [];
  const springs = [];
  let parked = [];
  let alive = true;
  return {
    get alive() { return alive; },
    add(fn) { cleanups.push(fn); },
    on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    },
    spring(opts) {
      const s = new Spring(opts);
      springs.push(s);
      return s;
    },
    pause() {
      // A second pause must not forget what the first one parked.
      parked = [...new Set([...parked, ...springs.filter((s) => s.active)])];
      parked.forEach((s) => s.stop());
    },
    resume() {
      parked.forEach((s) => s.to(s.target));
      parked = [];
    },
    destroy() {
      alive = false;
      springs.forEach((s) => s.stop());
      parked = [];
      cleanups.splice(0).forEach((fn) => fn());
    },
  };
}

/** Calls cb(w, h) when el's box changes and once more when fonts have settled. */
export function watchSize(el, life, cb, onFonts) {
  let w = el.clientWidth;
  let ht = el.clientHeight;
  const ro = new ResizeObserver(() => {
    if (el.clientWidth === w && el.clientHeight === ht) return;
    w = el.clientWidth;
    ht = el.clientHeight;
    if (w > 0 && ht > 0) cb(w, ht);
  });
  ro.observe(el);
  life.add(() => ro.disconnect());
  document.fonts?.ready.then(() => { if (life.alive) (onFonts || cb)(el.clientWidth, el.clientHeight); });
}

/** drag() refuses targets inside [data-nodrag], and so does the stage. The attribute is lifted
    only while this element's own drag sees the press, so the stage still stands aside. */
export function dragNoStage(el, life, handlers) {
  el.setAttribute('data-nodrag', '');
  life.on(el, 'pointerdown', () => el.removeAttribute('data-nodrag'), true);
  life.add(drag(el, handlers));
  life.on(el, 'pointerdown', () => el.setAttribute('data-nodrag', ''));
}

/** Alpha cutouts are named by the concept's anchor data, not guessed from the image. */
export function cutoutsOf(concept) {
  const set = new Set();
  if (concept?.anchor?.cutout) {
    set.add(concept.anchor.center);
    concept.anchor.bundles?.forEach((b) => b.center && set.add(b.center));
  }
  return set;
}

export function picture(work, parent, cutouts) {
  const img = h('img', cutouts?.has(work.src) ? 'g-b-img is-cutout' : 'g-b-img', parent, { src: work.src, alt: work.alt, draggable: false });
  img.decoding = 'async';
  return img;
}

/** Largest box of this ratio inside maxW x maxH. */
export function fit(ratio, maxW, maxH) {
  const w = Math.min(maxW, maxH * ratio);
  return { w: Math.round(w), h: Math.round(w / ratio) };
}

/** Wheel moves a value directly; at either end it gives the wheel back to the page. */
export function wheelDriver({ value, min, max, apply, settle, life, scale = 1 }) {
  let goal = null;
  let timer = 0;
  life.add(() => clearTimeout(timer));
  return (dy, dx) => {
    const raw = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    if (!raw) return false;
    const delta = raw * scale;
    const cur = goal ?? value();
    const span = max() - min();
    const eps = span * 0.001 + 1e-4;
    if ((delta > 0 && cur >= max() - eps) || (delta < 0 && cur <= min() + eps)) {
      goal = null;
      return false;
    }
    goal = clamp(cur + delta, min(), max());
    apply(goal);
    clearTimeout(timer);
    const sign = Math.sign(delta);
    timer = setTimeout(() => { goal = null; settle?.(sign); }, 140);
    return true;
  };
}

/** A small image for a thumb. box is .tile-art: 4:3, clipped, paper2 behind. */
export function thumbPic(box, work, style) {
  const img = h('img', 'g-b-thumb', box, { src: work.src, alt: '', draggable: false });
  img.loading = 'lazy';
  img.style.cssText = style;
  return img;
}

/** The keyboard twin of a tap: el takes focus, and Enter or Space calls fn. */
export function tapKey(el, life, label, fn) {
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', label);
  life.on(el, 'keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat) return;
    e.preventDefault();
    e.stopPropagation();
    fn();
  });
}
