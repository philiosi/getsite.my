/* Uneven columns on a wall that scrolls by wheel and drag. Pressing lifts a card, a tap
   opens it large in the shared viewer. */

import { h, frame, createScope, createAxis, keyTap, drawCells } from './shared-a.js';

// The catalog's ratios are close to each other; these crops are what make the wall uneven.
const CROP = [1, 0.74, 1.12, 0.82, 0.66, 0.95];

export function mount(root, { works, reduced, view: open }) {
  const s = createScope(reduced);
  const view = h('div', 'g-masonry');
  const wall = h('div', 'g-masonry-wall');
  view.append(wall);
  root.append(view);

  const cards = works.map((work, i) => {
    const slot = h('figure', 'g-slot g-masonry-slot');
    const box = frame(work);
    slot.append(box);
    wall.append(slot);
    keyTap(s, box, work.title, () => open(work.id));
    return { slot, work, i, x: 0, y: 0, w: 0, h: 0 };
  });

  const M = { W: 0, H: 0, content: 0 };

  function measure() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return false;
    const cols = W < 560 ? 2 : 3;
    const pad = W < 720 ? 16 : 24;
    const gap = W < 720 ? 8 : 12;
    const cw = (W - pad * 2 - gap * (cols - 1)) / cols;
    const stagger = [0, Math.round(cw * 0.16), Math.round(cw * 0.06)];
    const tops = Array.from({ length: cols }, (_, c) => stagger[c] + 4);
    cards.forEach((c) => {
      let col = 0;
      tops.forEach((t, j) => { if (t < tops[col] - 0.5) col = j; });
      c.w = cw;
      c.h = cw / (c.work.ratio * CROP[c.i % CROP.length]);
      c.x = pad + col * (cw + gap);
      c.y = tops[col];
      tops[col] += c.h + gap;
      c.slot.style.transform = `translate3d(${c.x}px,${c.y}px,0)`;
      c.slot.style.width = `${c.w}px`;
      c.slot.style.height = `${c.h}px`;
    });
    M.W = W;
    M.H = H;
    M.content = Math.max(...tops) + pad;
    wall.style.height = `${M.content}px`;
    return true;
  }

  const render = (pos) => { wall.style.transform = `translate3d(0,${-pos}px,0)`; };

  measure();
  const axis = createAxis(s, { value: 0, max: Math.max(0, M.content - M.H), dim: M.H || 1, response: 0.82, onChange: render });
  render(0);

  let pressed = null;
  const unpress = () => { pressed?.slot.classList.remove('is-press'); pressed = null; };

  s.ownDrag(view, {
    axis: 'y',
    onPress: (e) => {
      axis.hold();
      const slot = e.target.closest?.('.g-masonry-slot');
      pressed = slot ? cards.find((c) => c.slot === slot) : null;
      pressed?.slot.classList.add('is-press');
    },
    onStart: () => { unpress(); axis.begin(); },
    onMove: ({ dy }) => axis.move(-dy),
    onEnd: ({ vy, moved }) => {
      const card = pressed;
      unpress();
      axis.release(moved ? -vy : 0);
      if (!moved && card) open(card.work.id);
    },
    onCancel: () => { unpress(); axis.release(0); },
  });

  const remeasure = () => {
    if (!measure()) return;
    const max = Math.max(0, M.content - M.H);
    axis.setBounds(0, max, M.H);
    axis.spring.set(Math.min(axis.value, max));
  };
  s.observe(root, remeasure);

  return {
    destroy() { s.destroy(); view.remove(); },
    pause: s.pause,
    resume: s.resume,
    onWheel(dy) { return axis.wheel(dy); },
  };
}

export function thumb(box, works) {
  drawCells(box, works, [
    [0, 5, 6, 28, 44],
    [3, 5, 53, 28, 41],
    [1, 36, 14, 28, 28],
    [4, 36, 45, 28, 49],
    [2, 67, 6, 28, 56],
    [5, 67, 65, 28, 29],
  ]);
}
