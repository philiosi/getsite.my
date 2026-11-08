/* Panels side by side around one continuous focus value. The image inside a panel never
   resizes: it has the width of the widest panel, and the panel opens like a curtain. */

import { clamp, lerp } from '../../core/spring.js';
import { nearest, project, rubberClamp, unrubberClamp } from '../../core/gesture.js';
import { h, frame, createScope, keyTap, drawCells } from './shared-a.js';

const SIGMA = 0.55;

export function mount(root, { works, reduced, view: open }) {
  const s = createScope(reduced);
  const view = h('div', 'g-strip');
  root.append(view);
  const n = works.length;

  const cards = works.map((work, i) => {
    const slot = h('figure', 'g-slot g-strip-slot');
    const box = frame(work);
    const label = h('figcaption', 'g-strip-label');
    label.append(h('strong', 'g-strip-name', work.title), h('span', 'g-strip-year', work.year));
    slot.append(label, box);
    view.append(slot);
    keyTap(s, box, work.title, () => tap(i));
    return { slot, label, img: box.querySelector('img'), box, i };
  });

  const M = { W: 0, avail: 0, gap: 4, pad: 16, K: 6, per: 1 };
  const weight = (d) => 1 + M.K * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));

  const render = (f) => {
    const fc = clamp(f, 0, n - 1);
    let sum = 0;
    const ws = cards.map((c) => { const w = weight(c.i - fc); sum += w; return w; });
    const unit = M.avail / sum;
    const shift = (f - fc) * -M.per * 0.5;
    let x = M.pad + shift;
    cards.forEach((c, i) => {
      const w = ws[i] * unit;
      const d = Math.abs(i - f);
      c.slot.style.transform = `translate3d(${x}px,0,0)`;
      c.slot.style.width = `${w}px`;
      c.label.style.opacity = String(clamp(1.4 - d * 2.8));
      c.img.style.opacity = String(lerp(1, 0.72, clamp(d / 2)));
      x += w + M.gap;
    });
  };

  const focus = s.spring({ value: Math.min(2, n - 1), damping: 1, response: 0.42, precision: 0.0005, onChange: render });
  let index = focus.value;

  function measure() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    const narrow = W < 720;
    M.W = W;
    M.pad = narrow ? 16 : 24;
    M.gap = narrow ? 3 : 6;
    M.K = narrow ? 4.2 : 6.4;
    M.avail = W - M.pad * 2 - M.gap * (n - 1);
    M.per = (W - M.pad * 2) / Math.max(1, n - 1);
    // The widest a panel can get, at an integer focus away from the ends of the falloff.
    let widest = 0;
    for (let k = 0; k < n; k++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += weight(i - k);
      widest = Math.max(widest, weight(0) / sum);
    }
    view.style.setProperty('--g-strip-w', `${Math.ceil(widest * M.avail) + 2}px`);
    view.style.setProperty('--g-strip-top', '30px');
    render(focus.value);
  }

  const go = (i, opts = {}) => {
    index = clamp(i, 0, n - 1);
    if (reduced) { focus.set(index); return; }
    focus.to(index, { damping: 1, response: 0.42, ...opts });
  };

  // A narrow panel opens first; the one already open opens large.
  const tap = (i) => {
    if (i === index) open(works[i].id);
    else go(i);
  };

  let base = 0;
  let pressed = null;
  let wasOpen = false;
  const unpress = () => { pressed?.classList.remove('is-press'); pressed = null; };
  s.drag(view, {
    axis: 'x',
    onPress: (e) => {
      const slot = e.target.closest?.('.g-strip-slot');
      pressed = slot;
      slot?.classList.add('is-press');
      const hit = cards.findIndex((c) => c.slot === slot);
      wasOpen = hit >= 0 && hit === index;
      if (hit >= 0) go(hit);
      else focus.stop();
    },
    onStart: () => { unpress(); focus.stop(); base = unrubberClamp(focus.value, 0, n - 1, 1); },
    onMove: ({ dx }) => {
      const raw = base + dx / M.per;
      focus.set(rubberClamp(raw, 0, n - 1, 1));
    },
    onEnd: ({ vx, moved }) => {
      const slot = pressed;
      unpress();
      if (!moved) {
        if (wasOpen) open(works[cards.findIndex((c) => c.slot === slot)].id);
        return;
      }
      const v = vx / M.per;
      const landing = focus.value + project(vx, 0.996) / M.per;
      const stops = cards.map((c) => c.i);
      go(nearest(landing, stops), { velocity: v, damping: Math.abs(vx) > 500 ? 0.84 : 1 });
    },
    onCancel: unpress,
  });

  s.on(view, 'pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    const slot = e.target.closest?.('.g-strip-slot');
    const hit = cards.findIndex((c) => c.slot === slot);
    if (hit >= 0 && hit !== index) go(hit, { response: 0.5 });
  });

  measure();
  s.observe(root, measure);

  return {
    destroy() { s.destroy(); view.remove(); },
    pause: s.pause,
    resume: s.resume,
  };
}

export function thumb(box, works) {
  const wrap = drawCells(box, works, [
    [0, 5, 10, 8, 80],
    [1, 15, 10, 8, 80],
    [2, 25, 10, 42, 80],
    [3, 69, 10, 12, 80],
    [4, 83, 10, 6, 80],
    [5, 91, 10, 4, 80],
  ]);
  wrap.classList.add('is-strip');
}
