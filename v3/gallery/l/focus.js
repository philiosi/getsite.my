/* One work large on a shared floor. Neighbours are real boxes that shrink and dim with
   distance, driven by one scroll coordinate that moves the active work 1:1 with the finger. */

import { clamp, lerp } from '../../core/spring.js';
import { h, frame, createScope, createAxis, keyTap, drawCells } from './shared-a.js';

const scaleAt = (d) => (d <= 0 ? 1 : d === 1 ? 0.56 : 0.44);

export function mount(root, { works, reduced, view: open }) {
  const s = createScope(reduced);
  const view = h('div', 'g-focus');
  root.append(view);
  const n = works.length;

  const cards = works.map((work, i) => {
    const slot = h('figure', 'g-slot g-focus-slot');
    const box = frame(work);
    const cap = h('figcaption', 'g-focus-cap');
    cap.append(
      h('span', 'g-focus-no', `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`),
      h('strong', 'g-focus-title', work.title),
      h('span', 'g-focus-meta', `${work.year} · ${work.cat}`),
    );
    slot.append(box, cap);
    view.append(slot);
    keyTap(s, box, work.title, () => tap(i));
    return { slot, img: box.querySelector('img'), cap, work };
  });

  let X = [];
  let SZ = [];
  let stops = [];
  let floor = 0;
  let idx = Math.min(1, n - 1);

  function measure() {
    const W = root.clientWidth;
    const H = root.clientHeight;
    if (!W || !H) return false;
    const narrow = W < 720;
    view.classList.toggle('is-narrow', narrow);
    const capW = narrow ? 0 : Math.min(210, W * 0.17);
    const gap = narrow ? 12 : 24;
    const maxW = narrow ? W * 0.76 : Math.min(W * 0.6, W - capW - 200);
    const maxH = narrow ? H - 104 : H - 32;
    const base = cards.map((c) => {
      const w = Math.min(maxW, maxH * c.work.ratio);
      return { w, h: w / c.work.ratio };
    });
    const tallest = Math.max(...base.map((b) => b.h));
    floor = narrow ? Math.min(H - 16, (H + tallest + 64) / 2) : Math.min(H - 16, (H + tallest) / 2);
    view.style.setProperty('--g-focus-cap', `${capW}px`);

    X = [];
    SZ = [];
    for (let k = 0; k < n; k++) {
      const x = new Array(n);
      const sz = base.map((b, i) => {
        const f = scaleAt(Math.abs(i - k));
        return { w: b.w * f, h: b.h * f };
      });
      x[k] = (W - sz[k].w - capW) / 2;
      for (let i = k + 1; i < n; i++) x[i] = x[i - 1] + sz[i - 1].w + gap + (i - 1 === k ? capW : 0);
      for (let i = k - 1; i >= 0; i--) x[i] = x[i + 1] - gap - sz[i].w;
      X.push(x);
      SZ.push(sz);
    }
    stops = [0];
    for (let k = 0; k < n - 1; k++) stops.push(stops[k] + Math.abs(X[k][k] - X[k + 1][k]));
    return true;
  }

  function render(u) {
    if (!stops.length) return;
    let k = 0;
    while (k < n - 2 && u > stops[k + 1]) k++;
    const span = stops[k + 1] - stops[k] || 1;
    const t = clamp((u - stops[k]) / span);
    const over = u < stops[0] ? u - stops[0] : u > stops[n - 1] ? u - stops[n - 1] : 0;
    const f = k + t;
    cards.forEach((c, i) => {
      const x = lerp(X[k][i], X[k + 1][i], t) - over;
      const w = lerp(SZ[k][i].w, SZ[k + 1][i].w, t);
      const hh = lerp(SZ[k][i].h, SZ[k + 1][i].h, t);
      const d = Math.abs(i - f);
      c.slot.style.transform = `translate3d(${x}px,${floor - hh}px,0)`;
      c.slot.style.width = `${w}px`;
      c.slot.style.height = `${hh}px`;
      c.img.style.opacity = String(lerp(1, 0.42, Math.min(1, d)));
      c.cap.style.opacity = String(clamp(1 - d * 2.2));
      c.cap.style.visibility = d < 0.46 ? 'visible' : 'hidden';
    });
  }

  measure();
  const axis = createAxis(s, {
    value: stops[idx] ?? 0,
    response: 0.44,
    onChange: render,
    snaps: () => stops,
  });

  const syncBounds = () => axis.setBounds(0, stops[n - 1] ?? 0, root.clientWidth || 1);
  syncBounds();
  render(axis.value);

  const goTo = (i) => {
    idx = clamp(i, 0, n - 1);
    // Mounted while hidden: nothing is measured yet, so there is nowhere to go.
    if (!stops.length && !measure()) return;
    const target = stops[idx];
    if (s.reduced) {
      axis.spring.set(target);
      view.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 160 });
    } else {
      axis.spring.to(target, { response: 0.44, damping: 1 });
    }
  };

  // A side work comes to the centre first; the one already there opens large.
  const tap = (i) => {
    if (i === idx && Math.abs(axis.value - stops[idx]) < 2) open(works[i].id);
    else goTo(i);
  };

  const nearestIndex = (u) => {
    let best = 0;
    stops.forEach((p, i) => { if (Math.abs(p - u) < Math.abs(stops[best] - u)) best = i; });
    return best;
  };

  let pressed = null;
  const unpress = () => { pressed?.classList.remove('is-press'); pressed = null; };
  s.drag(view, {
    axis: 'x',
    onPress: (e) => {
      axis.hold();
      unpress();
      pressed = e.target.closest?.('.g-focus-slot') ?? null;
      pressed?.classList.add('is-press');
      view.classList.add('is-grab');
    },
    onStart: () => { unpress(); axis.begin(); },
    onMove: ({ dx }) => axis.move(-dx),
    onEnd: ({ vx, moved }) => {
      view.classList.remove('is-grab');
      const slot = pressed;
      unpress();
      if (moved) {
        idx = nearestIndex(axis.release(-vx));
        return;
      }
      const hit = cards.findIndex((c) => c.slot === slot);
      if (hit >= 0) tap(hit);
      else goTo(idx);
    },
    onCancel: () => { view.classList.remove('is-grab'); unpress(); goTo(idx); },
  });

  s.observe(root, () => {
    const f = nearestIndex(axis.value);
    if (!measure()) return;
    syncBounds();
    idx = axis.spring.active ? nearestIndex(axis.target) : f;
    axis.spring.set(stops[idx]);
  });

  let sum = 0;
  let lockUntil = 0;
  return {
    destroy() { s.destroy(); view.remove(); },
    pause: s.pause,
    resume: s.resume,
    onWheel(dy, dx) {
      const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (!d) return false;
      const now = performance.now();
      if (now < lockUntil) return true;
      if ((idx === 0 && d < 0) || (idx === n - 1 && d > 0)) { sum = 0; return false; }
      sum += d;
      if (Math.abs(sum) < 30) return true;
      goTo(idx + Math.sign(sum));
      sum = 0;
      const reachedEnd = idx === 0 || idx === n - 1;
      lockUntil = now + (reachedEnd ? 560 : 300);
      return true;
    },
  };
}

export function thumb(box, works) {
  drawCells(box, works, [
    [0, -22, 42, 36, 40, 0.5],
    [1, 20, 12, 60, 70],
    [2, 86, 42, 36, 40, 0.5],
  ]);
}
