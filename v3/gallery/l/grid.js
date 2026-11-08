/* An even grid, small and centered. A tap opens a cell large in the shared viewer; on a
   resize each one springs to its new cell, a touch later than the one before it. */

import { h, frame, createScope, keyTap, drawCells } from './shared-a.js';

function fit(W, H, n, pad, gap) {
  const cap = W < 720 ? Infinity : 304;
  let best = { cols: 1, side: 0 };
  for (const cols of [1, 2, 3, 4, 6]) {
    const rows = Math.ceil(n / cols);
    const side = Math.min(cap, (W - pad * 2 - gap * (cols - 1)) / cols, (H - pad * 2 - gap * (rows - 1)) / rows);
    if (side > best.side) best = { cols, side: Math.floor(side) };
  }
  return best;
}

export function mount(root, { works, reduced, view: open }) {
  const s = createScope(reduced);
  const view = h('div', 'g-grid');
  const wall = h('div', 'g-grid-wall');
  view.append(wall);
  root.append(view);

  const cards = works.map((work, i) => {
    const slot = h('figure', 'g-slot g-grid-slot');
    const box = frame(work);
    slot.append(box);
    wall.append(slot);
    const card = { slot, work };
    const write = () => {
      slot.style.transform = `translate3d(${card.sx.value}px,${card.sy.value}px,0)`;
      slot.style.width = `${card.ss.value}px`;
      slot.style.height = `${card.ss.value}px`;
    };
    const opts = (precision) => ({ value: 0, damping: 1, response: 0.44 + i * 0.022, precision, onChange: write });
    card.sx = s.spring(opts(0.1));
    card.sy = s.spring(opts(0.1));
    card.ss = s.spring(opts(0.1));
    card.write = write;
    keyTap(s, box, work.title, () => open(work.id));
    return card;
  });

  let placed = false;

  function layout() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    const narrow = W < 720;
    const pad = narrow ? 16 : 24;
    const gap = narrow ? 6 : 10;
    const { cols, side } = fit(W, H, cards.length, pad, gap);
    const rows = Math.ceil(cards.length / cols);
    const x0 = (W - cols * side - (cols - 1) * gap) / 2;
    const y0 = Math.max(pad, (H - rows * side - (rows - 1) * gap) / 2);
    cards.forEach((c, i) => {
      const x = x0 + (i % cols) * (side + gap);
      const y = y0 + Math.floor(i / cols) * (side + gap);
      if (!placed || s.reduced || s.paused) {
        c.sx.set(x);
        c.sy.set(y);
        c.ss.set(side);
      } else {
        c.sx.to(x);
        c.sy.to(y);
        c.ss.to(side);
      }
    });
    placed = true;
  }

  layout();

  let pressed = null;
  const unpress = () => { pressed?.slot.classList.remove('is-press'); pressed = null; };

  s.drag(view, {
    axis: 'both',
    onPress: (e) => {
      const slot = e.target.closest?.('.g-grid-slot');
      pressed = slot ? cards.find((c) => c.slot === slot) : null;
      pressed?.slot.classList.add('is-press');
    },
    onStart: unpress,
    onEnd: ({ moved }) => {
      const card = pressed;
      unpress();
      if (!moved && card) open(card.work.id);
    },
    onCancel: unpress,
  });

  s.observe(root, layout);

  return {
    destroy() { s.destroy(); view.remove(); },
    pause: s.pause,
    resume: s.resume,
  };
}

export function thumb(box, works) {
  const side = 26;
  const gapX = 3;
  const x0 = (100 - side * 3 - gapX * 2) / 2;
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    cells.push([i, x0 + col * (side + gapX), 14 + row * 37, side, 34]);
  }
  drawCells(box, works, cells);
}
