/* A wall in one room with one light. Works keep equal area, so ratio alone sets how each one hangs:
   centres on a single eye line, shadows all falling away from the upper left. */
import { clamp } from '../../core/spring.js';
import { drag, project, rubberClamp, unrubberClamp } from '../../core/gesture.js';
import { h, lifecycle, watchSize, cutoutsOf, picture, wheelDriver, thumbPic } from './shared-b.js';

const HEAD = 56; // the wall runs up behind the page head
const WALL_RATE = 0.8;

export function mount(root, { concept, works, reduced, view }) {
  const life = lifecycle();
  const cutouts = cutoutsOf(concept);
  const wrap = h('div', 'g-museum', root);
  const wall = h('div', 'g-museum-wall', wrap);
  const track = h('div', 'g-museum-track', wrap);

  const items = works.map((w, i) => {
    const slot = h('button', 'g-slot g-museum-slot', track, { type: 'button' });
    slot.dataset.i = i;
    slot.setAttribute('aria-label', `${w.title} 크게 보기`);
    const frame = h('figure', 'g-museum-frame', slot);
    frame.dataset.work = w.id;
    picture(w, frame, cutouts);
    const label = h('div', 'g-museum-label', track);
    h('strong', '', label, { textContent: w.title });
    h('span', '', label, { textContent: `${w.year} · ${w.cat}` });
    const it = { i, w, slot, frame, label, cx: 0 };
    // Pointer taps come through the drag below; this is Enter and Space on the focused frame.
    slot.addEventListener('click', (e) => { if (e.detail === 0) view?.(w.id); });
    slot.addEventListener('focus', () => { if (slot.matches(':focus-visible')) panTo(it.cx - W / 2); });
    return it;
  });

  let W = wrap.clientWidth;
  let H = wrap.clientHeight;
  let maxPan = 0;
  let seams = [];

  const pan = life.spring({ value: 0, response: 0.62, precision: 0.1, onChange: drawPan });

  function drawPan(p) {
    track.style.transform = `translate3d(${(-p).toFixed(2)}px,0,0)`;
    wall.style.transform = `translate3d(${(-p * WALL_RATE).toFixed(2)}px,0,0)`;
  }

  function measure() {
    const wide = W >= 720;
    const usableH = H - HEAD - 56;
    const eye = HEAD + usableH * 0.5;
    const side = Math.min(usableH * (wide ? 0.66 : 0.6), W * (wide ? 0.3 : 0.56));
    const area = side * side;
    const edge = wide ? 5 : 3;
    const mat = wide ? 14 : 8;
    const gap = wide ? Math.max(170, W * 0.13) : Math.max(36, W * 0.1);
    let x = 0;
    items.forEach((it, i) => {
      const iw = Math.sqrt(area * it.w.ratio);
      const ih = iw / it.w.ratio;
      const fw = Math.round(iw + (edge + mat) * 2);
      const fh = Math.round(ih + (edge + mat) * 2);
      if (i === 0) x = Math.round((W - fw) / 2);
      it.cx = x + fw / 2;
      it.slot.style.cssText = `left:${x}px;top:${Math.round(eye - fh / 2)}px;width:${fw}px;height:${fh}px`;
      it.frame.style.borderWidth = `${edge}px`;
      it.frame.style.padding = `${mat}px`;
      it.label.style.left = `${x + fw + 18}px`;
      it.label.style.top = `${Math.round(eye + fh / 2 - 46)}px`;
      x += fw + gap;
    });
    const last = items[items.length - 1];
    maxPan = Math.max(0, last.cx - W / 2);

    // The wall travels less than the frames, so its joints slide behind them.
    const wallW = W + maxPan * WALL_RATE + W;
    wall.style.width = `${wallW}px`;
    seams.forEach((s) => s.remove());
    const step = Math.max(260, W * 0.42);
    seams = [];
    for (let sx = step * 0.5; sx < wallW; sx += step) {
      const seam = h('i', 'g-museum-seam', wall);
      seam.style.left = `${Math.round(sx)}px`;
      seams.push(seam);
    }
    pan.set(clamp(pan.value, 0, maxPan));
    drawPan(pan.value);
  }

  function panTo(x, velocity) {
    const t = clamp(x, 0, maxPan);
    if (reduced) { pan.set(t); return; }
    pan.to(t, { velocity: velocity ?? pan.velocity, damping: 1, response: 0.62 });
  }

  let base = 0;
  let pressed = null;
  life.add(drag(wrap, {
    axis: 'x',
    onPress: (e) => { pressed = e.target; pan.stop(); },
    onStart: () => {
      base = unrubberClamp(pan.value, 0, maxPan, W);
    },
    onMove: ({ dx }) => pan.set(rubberClamp(base - dx, 0, maxPan, W)),
    onEnd: ({ vx, moved }) => {
      if (!moved) {
        if (pan.value < 0 || pan.value > maxPan) panTo(pan.value, 0);
        const slot = pressed.closest('.g-museum-slot');
        if (slot) view?.(items[Number(slot.dataset.i)].w.id);
        return;
      }
      if (reduced) { panTo(pan.value, 0); return; }
      panTo(pan.value + project(-vx), -vx);
    },
    onCancel: () => panTo(pan.value, 0),
  }));

  const onWheel = wheelDriver({
    value: () => pan.target,
    min: () => 0,
    max: () => maxPan,
    life,
    apply: (g) => { if (reduced) pan.set(g); else pan.to(g, { response: 0.24, damping: 1 }); },
  });

  measure();
  watchSize(wrap, life, (w, ht) => { W = w; H = ht; measure(); }, () => {});

  return {
    destroy() { life.destroy(); wrap.remove(); },
    pause: life.pause,
    resume: life.resume,
    onWheel,
  };
}

export function thumb(box, works) {
  const wall = h('span', 'g-museum-thumb', box);
  [[3, 19], [0, 26], [1, 19]].forEach(([i, width], k) => {
    const w = works[i % works.length];
    const cell = h('span', 'g-museum-thumbframe', wall);
    cell.style.cssText = `left:${[8, 37, 73][k]}%;width:${width}%;aspect-ratio:${w.ratio}`;
    thumbPic(cell, w, 'width:100%;height:100%;object-fit:cover;display:block');
  });
}
