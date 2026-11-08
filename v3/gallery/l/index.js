/* Names, big. The picture is a separate object that chases the pointer on a spring and
   leans into its own velocity, so it reads as carried, not attached. */

import { clamp, lerp } from '../../core/spring.js';
import { h, frame, createScope, keyTap, drawCells, drawBars } from './shared-a.js';

export function mount(root, { works, reduced, view: open }) {
  const s = createScope(reduced);
  const view = h('div', 'g-index');
  const list = h('ol', 'g-index-list');
  const preview = h('div', 'g-index-preview');
  preview.setAttribute('aria-hidden', 'true');
  view.append(list, preview);
  root.append(view);

  const rows = works.map((work, i) => {
    const li = h('li', 'g-index-row');
    const slot = h('div', 'g-slot g-index-slot');
    slot.append(frame(work));
    const name = h('strong', 'g-index-name', work.title);
    const cat = h('span', 'g-index-cat', work.cat);
    const year = h('span', 'g-index-year', work.year);
    li.append(slot, name, cat, year);
    list.append(li);
    keyTap(s, li, work.title, () => open(work.id));

    const pic = new Image();
    pic.src = work.src;
    pic.alt = '';
    pic.draggable = false;
    if (work.id === 'b5' || work.id === 'b6') pic.className = 'is-cutout';
    preview.append(pic);

    const row = { li, name, pic, a: null };
    row.a = s.spring({
      value: 0,
      damping: 1,
      response: 0.3,
      precision: 0.004,
      onChange: () => paintRow(row),
    });
    return row;
  });

  const M = { W: 0, H: 0, top: 0, rowH: 1, pw: 0, ph: 0, narrow: false };

  function measure() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return;
    const r = view.getBoundingClientRect();
    const a = rows[0].li.getBoundingClientRect();
    M.W = W;
    M.H = H;
    M.top = a.top - r.top;
    M.rowH = a.height || 1;
    M.narrow = W < 720;
    M.pw = M.narrow ? Math.min(190, W * 0.5) : Math.min(420, W * 0.27);
    M.ph = M.pw * 0.74;
    preview.style.width = `${M.pw}px`;
    preview.style.height = `${M.ph}px`;
  }

  // Tracks x, y and visibility on one transform: written once per changed frame.
  const pos = { x: 0, y: 0 };
  const paintPreview = () => {
    const v = vis.value;
    if (v <= 0.001 && !vis.active) { preview.style.visibility = 'hidden'; return; }
    preview.style.visibility = 'visible';
    const rot = reduced ? 0 : clamp(px.velocity * 0.007, -9, 9);
    const scale = reduced ? 1 : lerp(0.84, 1, v);
    preview.style.opacity = String(clamp(v * 1.5));
    preview.style.transform = `translate3d(${px.value}px,${py.value}px,0) rotate(${rot}deg) scale(${scale})`;
  };

  const px = s.spring({ value: 0, damping: 0.82, response: 0.42, precision: 0.05, onChange: paintPreview });
  const py = s.spring({ value: 0, damping: 0.86, response: 0.46, precision: 0.05, onChange: paintPreview });
  const vis = s.spring({
    value: 0,
    damping: 1,
    response: 0.28,
    precision: 0.004,
    onChange: () => { paintPreview(); rows.forEach(paintRow); },
  });

  function paintRow(row) {
    const a = row.a.value;
    const v = vis.value;
    row.name.style.transform = reduced ? '' : `translate3d(${a * 0.18}em,0,0)`;
    row.li.style.opacity = String(lerp(1, lerp(0.3, 1, a), v));
    row.pic.style.opacity = String(a);
  }

  let active = -1;
  const select = (i) => {
    if (i === active) return;
    active = i;
    rows.forEach((row, j) => {
      const t = j === i ? 1 : 0;
      if (reduced) row.a.set(t);
      else row.a.to(t);
    });
  };

  const place = (cx, cy, snap) => {
    let x;
    let y;
    if (reduced) {
      x = M.W - M.pw - 16;
      y = M.narrow ? 8 : (M.H - M.ph) / 2;
    } else if (M.narrow) {
      x = clamp(cx - M.pw / 2, 8, M.W - M.pw - 8);
      y = cy - M.ph - 32;
      if (y < 4) y = cy + 32;
    } else {
      x = cx > M.W * 0.6 ? cx - M.pw - 32 : cx + 32;
      y = clamp(cy - M.ph / 2, 4, M.H - M.ph - 4);
    }
    pos.x = x;
    pos.y = y;
    if (snap || reduced) { px.set(x); py.set(y); } else { px.to(x); py.to(y); }
  };

  const local = (e) => {
    const r = view.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const rowAt = (y) => clamp(Math.floor((y - M.top) / M.rowH), 0, rows.length - 1);

  const showAt = (e) => {
    const p = local(e);
    const wasHidden = vis.target < 0.5;
    select(rowAt(p.y));
    place(p.x, p.y, wasHidden && vis.value < 0.05);
    if (wasHidden) {
      if (reduced) vis.set(1);
      else vis.to(1);
    }
  };
  const hide = () => {
    active = -1;
    rows.forEach((row) => { if (reduced) row.a.set(0); else row.a.to(0); });
    if (reduced) vis.set(0);
    else vis.to(0);
  };

  s.on(view, 'pointermove', (e) => {
    if (e.pointerType === 'mouse' && !e.buttons) showAt(e);
  });
  s.on(view, 'pointerleave', (e) => {
    if (e.pointerType === 'mouse') hide();
  });

  // Pressing shows the picture; a drag scrubs through the names; a tap opens the row large.
  let pressedRow = -1;
  s.ownDrag(view, {
    axis: 'both',
    threshold: 6,
    onPress: (e) => {
      const li = e.target.closest?.('.g-index-row');
      pressedRow = rows.findIndex((row) => row.li === li);
      showAt(e);
    },
    onMove: ({ e }) => showAt(e),
    onEnd: ({ moved, e }) => {
      const i = moved ? -1 : pressedRow;
      pressedRow = -1;
      if (e.pointerType !== 'mouse') hide();
      if (i >= 0) open(works[i].id);
    },
    onCancel: () => { pressedRow = -1; },
  });

  measure();
  preview.style.visibility = 'hidden';
  rows.forEach(paintRow);
  s.observe(root, measure);
  s.onFonts(measure);

  return {
    destroy() { s.destroy(); view.remove(); },
    pause() { hide(); s.pause(); },
    resume: s.resume,
  };
}

export function thumb(box, works) {
  const wrap = drawCells(box, works, [[2, 50, 22, 42, 48, 1, 7]]);
  drawBars(wrap, [
    [8, 14, 56, 9],
    [8, 32, 38, 9, 0.28],
    [8, 50, 48, 9, 0.28],
    [8, 68, 30, 9, 0.28],
    [8, 86, 44, 9, 0.28],
  ]);
  wrap.lastElementChild.after(wrap.firstElementChild);
}
