/* Image and short text in turn, in a column with its own momentum. Reveal is a pure
   function of the scroll position, so scrubbing back plays it in reverse. */

import { clamp, smooth } from '../../core/spring.js';
import { h, frame, createScope, createAxis, keyTap, drawCells, drawBars } from './shared-a.js';

export function mount(root, { works, reduced, view: open }) {
  const s = createScope(reduced);
  const view = h('div', 'g-flow');
  const track = h('div', 'g-flow-track');
  view.append(track);
  root.append(view);

  const items = works.map((work, i) => {
    const item = h('article', i % 2 ? 'g-flow-item is-alt' : 'g-flow-item');
    const slot = h('figure', 'g-slot g-flow-slot');
    const box = frame(work);
    box.style.setProperty('--g-flow-r', String(work.ratio));
    slot.append(box);
    const text = h('div', 'g-flow-text');
    text.append(h('h3', 'g-flow-title', work.title), h('p', 'g-flow-meta', `${work.year} · ${work.cat}`));
    item.append(slot, text);
    track.append(item);
    keyTap(s, box, work.title, () => open(work.id));
    return { item, box, img: box.querySelector('img'), text, top: 0, height: 0, boxTop: 0, boxH: 0, last: -1, armed: true };
  });

  const M = { H: 1, content: 0 };
  let inFlight = false;

  function render(pos) {
    track.style.transform = `translate3d(0,${-pos}px,0)`;
    for (const it of items) {
      const top = it.boxTop - pos;
      if (top > M.H * 1.3 || top + it.boxH < -M.H * 0.5) {
        if (it.last === 0 && top > 0) continue;
      }
      // 0 as the image's top edge enters low in the view, 1 once it has risen clear.
      const raw = reduced ? 1 : clamp((M.H * 0.97 - top) / (M.H * 0.62));
      // A work that flew in stays shown until its reveal can take over without a visible change.
      if (!it.armed && !inFlight && (raw >= 1 || top >= M.H)) it.armed = true;
      const r = it.armed ? raw : 1;
      const ease = smooth(0, 1, r);
      const textR = it.armed ? smooth(0.35, 1, raw) : 1;
      const drift = reduced ? 0 : (top + it.boxH / 2 - M.H / 2) / M.H;
      it.img.style.clipPath = r >= 1 ? '' : `inset(0 0 ${(1 - ease) * 100}% 0)`;
      it.img.style.transform = reduced ? '' : `translate3d(0,${clamp(drift, -1, 1) * it.boxH * 0.035}px,0) scale(${1.08 + (1 - ease) * 0.08})`;
      it.text.style.opacity = String(textR);
      it.text.style.transform = reduced ? '' : `translate3d(0,${(1 - textR) * 26}px,0)`;
      it.last = r;
    }
  }

  function measure() {
    const H = root.clientHeight;
    if (!H) return false;
    M.H = H;
    const tr = track.getBoundingClientRect();
    items.forEach((it) => {
      const b = it.box.getBoundingClientRect();
      it.boxTop = b.top - tr.top;
      it.boxH = b.height;
    });
    M.content = track.offsetHeight;
    return true;
  }

  measure();
  const axis = createAxis(s, {
    value: 0,
    max: Math.max(0, M.content - M.H),
    dim: M.H,
    response: 0.84,
    onChange: render,
  });
  render(0);

  // The engine starts its flights right after mount, before the first frame paints.
  const flying = () => items.some((it) => it.box.style.transform);
  s.tick(() => {
    if (flying()) {
      if (!inFlight) {
        inFlight = true;
        items.forEach((it) => { it.armed = false; });
        render(axis.value);
      }
      return undefined;
    }
    inFlight = false;
    render(axis.value);
    return false;
  });

  let mode = false;
  let pressed = null;
  s.ownDrag(view, {
    axis: 'y',
    onPress: (e) => {
      axis.hold();
      mode = false;
      pressed = e.target.closest?.('[data-work]')?.dataset.work ?? null;
    },
    onStart: () => { axis.begin(); mode = true; },
    onMove: ({ dy }) => axis.move(-dy),
    onEnd: ({ vy, moved }) => {
      const id = moved ? null : pressed;
      pressed = null;
      axis.release(moved && mode ? -vy : 0);
      if (id) open(id);
      mode = false;
    },
    onCancel: () => { pressed = null; axis.release(0); },
  });

  const remeasure = () => {
    if (!measure()) return;
    const max = Math.max(0, M.content - M.H);
    axis.setBounds(0, max, M.H);
    axis.spring.set(Math.min(axis.value, max));
  };
  s.observe(root, remeasure);
  s.onFonts(remeasure);

  return {
    destroy() { s.destroy(); view.remove(); },
    pause: s.pause,
    resume: s.resume,
    onWheel(dy) { return axis.wheel(dy); },
  };
}

export function thumb(box, works) {
  const wrap = drawCells(box, works, [
    [0, 8, 6, 52, 40],
    [1, 40, 54, 52, 40],
  ]);
  drawBars(wrap, [
    [65, 28, 26, 6],
    [65, 38, 16, 4, 0.4],
    [8, 74, 26, 6],
    [8, 84, 16, 4, 0.4],
  ]);
}
