/* A continuous strip. Each frame's image sits oversized in its frame and drifts against
   the strip's position, so a throw reads as depth, not as a sliding bitmap. */

import { clamp } from '../../core/spring.js';
import { h, frame, createScope, createAxis, keyTap, drawCells } from './shared-a.js';

export function mount(root, { works, reduced, view: open }) {
  const s = createScope(reduced);
  const view = h('div', 'g-film');
  const track = h('div', 'g-film-track');
  const bar = h('div', 'g-film-bar');
  const barThumb = h('span', 'g-film-thumb');
  bar.append(barThumb);
  view.append(track, bar);
  root.append(view);

  const cards = works.map((work, i) => {
    const slot = h('figure', 'g-slot g-film-slot');
    const label = h('figcaption', 'g-film-label');
    label.append(h('span', 'g-film-no', String(i + 1).padStart(2, '0')), h('span', 'g-film-name', work.title), h('span', 'g-film-year', work.year));
    const box = frame(work);
    slot.append(label, box);
    track.append(slot);
    keyTap(s, box, work.title, () => open(work.id));
    return { slot, box, img: box.querySelector('img'), work, x: 0, w: 0 };
  });

  const M = { W: 0, pad: 16, total: 0, max: 0, thumb: 0, barW: 0 };

  function measure() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return false;
    const narrow = W < 720;
    const pad = narrow ? 16 : 24;
    const gap = narrow ? 8 : 10;
    const top = 26;
    const maxW = W * (narrow ? 0.8 : 0.72);
    const frameH = Math.min(H - top - 34, narrow ? maxW * 1.14 : Infinity);
    const offsetY = Math.max(0, (H - 34 - top - frameH) / 2);
    let x = pad;
    cards.forEach((c) => {
      c.w = Math.min(maxW, frameH * c.work.ratio);
      c.x = x;
      c.slot.style.transform = `translate3d(${x}px,${offsetY}px,0)`;
      c.slot.style.width = `${c.w}px`;
      c.box.style.height = `${frameH}px`;
      x += c.w + gap;
    });
    const total = x - gap + pad;
    M.W = W;
    M.pad = pad;
    M.total = total;
    M.max = Math.max(0, total - W);
    M.barW = W - pad * 2;
    M.thumb = Math.max(32, M.barW * Math.min(1, W / total));
    barThumb.style.width = `${M.thumb}px`;
    return true;
  }

  function render(pos) {
    track.style.transform = `translate3d(${-pos}px,0,0)`;
    for (const c of cards) {
      const screen = c.x - pos + c.w / 2;
      if (screen < -c.w || screen > M.W + c.w) continue;
      const t = clamp((screen - M.W / 2) / M.W, -1.1, 1.1);
      c.img.style.transform = reduced ? '' : `translate3d(${-t * c.w * 0.07}px,0,0)`;
    }
    const p = M.max ? clamp(pos / M.max) : 0;
    barThumb.style.transform = `translate3d(${p * (M.barW - M.thumb)}px,0,0)`;
  }

  const snapPoints = () => {
    const pts = cards.map((c) => clamp(c.x - M.pad, 0, M.max));
    return [...new Set(pts)];
  };

  measure();
  const axis = createAxis(s, { value: 0, max: M.max, dim: M.W || 1, response: 0.72, onChange: render, snaps: snapPoints });
  render(0);

  let pressed = null;
  const unpress = () => { pressed?.classList.remove('is-press'); pressed = null; };
  s.drag(view, {
    axis: 'x',
    onPress: (e) => {
      axis.hold();
      pressed = e.target.closest?.('.g-film-slot') ?? null;
      pressed?.classList.add('is-press');
      view.classList.add('is-grab');
    },
    onStart: () => { unpress(); axis.begin(); },
    onMove: ({ dx }) => axis.move(-dx),
    onEnd: ({ vx, moved }) => {
      view.classList.remove('is-grab');
      const slot = pressed;
      unpress();
      axis.release(moved ? -vx : 0);
      const hit = moved ? null : cards.find((c) => c.slot === slot);
      if (hit) open(hit.work.id);
    },
    onCancel: () => { view.classList.remove('is-grab'); unpress(); axis.release(0); },
  });

  const remeasure = () => {
    const ratio = M.max ? axis.value / M.max : 0;
    if (!measure()) return;
    axis.setBounds(0, M.max, M.W);
    axis.spring.set(ratio * M.max);
  };
  s.observe(root, remeasure);

  return {
    destroy() { s.destroy(); view.remove(); },
    pause: s.pause,
    resume: s.resume,
    onWheel(dy, dx) { return axis.wheel(Math.abs(dx) > Math.abs(dy) ? dx : dy); },
  };
}

export function thumb(box, works) {
  const wrap = drawCells(box, works, [
    [0, -16, 22, 44, 50],
    [1, 31, 22, 44, 50],
    [2, 78, 22, 44, 50],
  ]);
  wrap.classList.add('is-film');
}
