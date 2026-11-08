/* A rail of the works' real years. The marker stays put; the rail moves under it.
   One continuous position drives the numeral, the scale of every work and the captions. */
import { clamp } from '../../core/spring.js';
import { drag, project, rubberClamp, unrubberClamp, nearest } from '../../core/gesture.js';
import { h, lifecycle, watchSize, cutoutsOf, picture, fit, wheelDriver, thumbPic, tapKey } from './shared-b.js';

const RAIL_H = 86;

export function mount(root, { concept, works, reduced, view }) {
  const life = lifecycle();
  const cutouts = cutoutsOf(concept);
  const wrap = h('div', 'g-timeline', root);

  const yearEl = h('div', 'g-timeline-year', wrap);
  yearEl.setAttribute('aria-hidden', 'true');
  const digits = [0, 1, 2, 3].map(() => {
    const col = h('span', 'g-timeline-digit', yearEl);
    const reel = h('span', 'g-timeline-reel', col);
    for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) h('span', '', reel, { textContent: n });
    return { col, reel, shown: NaN };
  });
  const probe = h('span', 'g-timeline-probe', yearEl, { textContent: '0' });

  const slotsLayer = h('div', 'g-timeline-slots', wrap);
  const rail = h('div', 'g-timeline-rail', wrap);
  const line = h('div', 'g-timeline-line', rail);
  const marker = h('div', 'g-timeline-marker', wrap);
  const status = h('p', 'g-timeline-status', wrap);
  status.setAttribute('role', 'status');

  const items = works.map((w, i) => {
    const slot = h('div', 'g-slot g-timeline-slot', slotsLayer);
    slot.dataset.i = i;
    const fig = h('figure', 'g-timeline-work', slot);
    fig.dataset.work = w.id;
    picture(w, fig, cutouts);
    tapKey(slot, life, `${w.title} 크게 보기`, () => tap(i));
    const tick = h('button', 'g-timeline-tick', rail, { type: 'button' });
    tick.setAttribute('aria-label', `${w.title}, ${w.year}`);
    tick.addEventListener('click', () => go(i));
    const cap = h('div', 'g-timeline-cap', rail);
    h('strong', '', cap, { textContent: w.title });
    h('span', '', cap, { textContent: `${w.year} · ${w.cat}` });
    return { w, slot, fig, tick, cap, x: 0, boxW: 0, boxH: 0, year: Number(w.year), z: -1 };
  });

  // A year label for each run of works with the same year, in catalog order.
  const groups = [];
  items.forEach((it, i) => {
    if (i && items[i - 1].w.year === it.w.year) return;
    const major = h('div', 'g-timeline-major', rail);
    h('span', '', major, { textContent: it.w.year });
    groups.push({ first: i, major });
  });

  let W = wrap.clientWidth;
  let H = wrap.clientHeight;
  let S = 1;
  let markerX = 0;
  let maxP = 0;
  let fontPx = 100;
  let active = -1;

  const pos = life.spring({ value: 0, response: 0.5, precision: 0.1, onChange: render });

  function measure() {
    const prevActive = Math.max(active, 0);
    const wide = W >= 900;
    markerX = Math.round(W * (wide ? 0.62 : 0.5));
    const baseline = H - RAIL_H;

    probe.style.fontSize = '100px';
    const digitEm = (probe.getBoundingClientRect().width || 60) / 100;
    fontPx = Math.floor(Math.min((W - 24) / (digitEm * 4) * (wide ? 0.58 : 1), H * (wide ? 0.46 : 0.34)));
    yearEl.style.fontSize = `${fontPx}px`;
    digits.forEach((d) => { d.col.style.width = `${Math.ceil(digitEm * fontPx)}px`; d.shown = NaN; });

    const numeralFloor = wide ? H * 0.2 : fontPx * 0.9;
    const maxH = Math.max(120, baseline - numeralFloor);
    const maxW = wide ? W * 0.46 : W * 0.8;
    let widest = 0;
    let tallest = 0;
    for (const it of items) {
      const b = fit(it.w.ratio, maxW, maxH);
      it.boxW = b.w;
      it.boxH = b.h;
      widest = Math.max(widest, b.w);
      tallest = Math.max(tallest, b.h);
      it.slot.style.width = `${b.w}px`;
      it.slot.style.height = `${b.h}px`;
      it.slot.style.top = `${baseline - b.h}px`;
    }
    yearEl.style.top = `${Math.max(0, Math.round(baseline - tallest - fontPx * (wide ? 0.62 : 0.9)))}px`;

    S = Math.round(widest * 0.5 + widest * 0.21 + Math.max(16, W * 0.03));
    const yearGap = Math.round(S * 0.2);
    let x = 0;
    items.forEach((it, i) => {
      if (i && items[i - 1].w.year !== it.w.year) x += yearGap;
      it.x = x;
      x += S;
    });
    maxP = items[items.length - 1].x;

    rail.style.top = `${baseline}px`;
    line.style.left = `${-W}px`;
    line.style.width = `${maxP + W * 2}px`;
    marker.style.left = `${markerX}px`;
    marker.style.top = `${baseline - 1}px`;
    for (const it of items) {
      it.tick.style.left = `${it.x}px`;
      it.cap.style.left = `${it.x}px`;
      it.cap.style.width = `${Math.round(S * 0.66)}px`;
    }
    for (const g of groups) g.major.style.left = `${items[g.first].x - (S + yearGap) / 2}px`;

    pos.set(items[prevActive].x);
  }

  const stations = () => items.map((it) => it.x);

  function yearAt(p) {
    if (p <= 0) return items[0].year;
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i];
      const b = items[i + 1];
      if (p <= b.x) {
        const t = (p - a.x) / (b.x - a.x);
        return a.year + (b.year - a.year) * t;
      }
    }
    return items[items.length - 1].year;
  }

  // An odometer: the units reel is the value itself, higher reels turn only during its last tenth.
  function drawYear(y) {
    if (!Number.isFinite(y)) return;
    let carry = clamp((y % 10) - 9);
    digits.forEach((d, idx) => {
      const place = 10 ** (3 - idx);
      const v = idx === 3 ? y % 10 : (Math.floor(y / place) % 10) + carry;
      if (idx !== 3 && (Math.floor(y / place) % 10) !== 9) carry = 0;
      if (Math.abs(v - d.shown) < 0.001) return;
      d.shown = v;
      d.reel.style.transform = `translate3d(0,${(-v * fontPx).toFixed(2)}px,0)`;
    });
  }

  function render() {
    const p = pos.value;
    rail.style.transform = `translate3d(${markerX - p}px,0,0)`;
    drawYear(yearAt(clamp(p, 0, maxP)));
    let best = 0;
    let bestD = Infinity;
    items.forEach((it, i) => {
      const d = (it.x - p) / S;
      const ad = Math.abs(d);
      const near = Math.exp(-2.4 * d * d);
      const s = (0.42 + 0.58 * near) * (1 - 0.05 * Math.min(ad, 3));
      it.slot.style.transform = `translate3d(${(markerX + it.x - p - it.boxW / 2).toFixed(2)}px,0,0) scale(${s.toFixed(4)})`;
      it.slot.style.opacity = (0.3 + 0.7 * Math.max(near, 0.55 * clamp(1.6 - ad * 0.6))).toFixed(3);
      it.cap.style.opacity = clamp(1 - ad * 2.2).toFixed(3);
      const z = 100 - Math.round(ad * 10);
      if (z !== it.z) { it.z = z; it.slot.style.zIndex = z; }
      if (ad < bestD) { bestD = ad; best = i; }
    });
    if (best !== active) {
      items[active]?.tick.removeAttribute('aria-current');
      active = best;
      items[best].tick.setAttribute('aria-current', 'true');
      status.textContent = `${items[best].w.year} ${items[best].w.title}`;
    }
  }

  function settleTo(target, velocity, thrown) {
    if (reduced) {
      pos.set(target);
      slotsLayer.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 160, easing: 'linear' });
      return;
    }
    pos.to(target, { velocity: velocity ?? pos.velocity, damping: thrown ? 0.84 : 1, response: 0.5 });
  }
  function go(i) { settleTo(items[clamp(i, 0, items.length - 1)].x); }
  // Another year comes to the marker first; the one already there opens large.
  function tap(i) {
    const open = i === active;
    go(i); // the press stopped it; let it settle under the viewer too
    if (open) view?.(items[i].w.id);
  }

  let base = 0;
  let pressed = null;
  life.add(drag(wrap, {
    axis: 'x',
    onPress: (e) => { pressed = e.target; pos.stop(); },
    onStart: () => { base = unrubberClamp(pos.value, 0, maxP, W); },
    onMove: ({ dx }) => pos.set(rubberClamp(base - dx, 0, maxP, W)),
    onEnd: ({ vx, moved }) => {
      if (!moved) {
        if (pressed.closest('.g-timeline-tick')) return;
        const slot = pressed.closest('.g-timeline-slot');
        if (slot) tap(Number(slot.dataset.i));
        else settleTo(nearest(pos.value, stations()), 0);
        return;
      }
      const v = -vx;
      const landing = nearest(clamp(pos.value + project(v), 0, maxP), stations());
      settleTo(landing, v, Math.abs(v) > 240);
    },
    onCancel: () => settleTo(nearest(pos.value, stations()), 0),
  }));

  const wheel = wheelDriver({
    value: () => pos.target,
    min: () => 0,
    max: () => maxP,
    life,
    apply: (g) => { if (reduced) pos.set(g); else pos.to(g, { response: 0.28, damping: 1 }); },
    settle: (sign) => settleTo(nearest(clamp(pos.target + sign * S * 0.42, 0, maxP), stations())),
  });

  life.on(wrap, 'keydown', (e) => {
    if (e.key === 'ArrowRight') { go(active + 1); items[Math.min(active + 1, items.length - 1)].tick.focus({ preventScroll: true }); }
    if (e.key === 'ArrowLeft') { go(active - 1); items[Math.max(active - 1, 0)].tick.focus({ preventScroll: true }); }
  });

  measure();
  watchSize(wrap, life, (w, ht) => { W = w; H = ht; measure(); });

  return {
    destroy() { life.destroy(); wrap.remove(); },
    pause: life.pause,
    resume: life.resume,
    onWheel: wheel,
  };
}

export function thumb(box, works) {
  const base = 74;
  [[5, 25, 0.75], [32, 44, 1], [78, 24, 0.75]].forEach(([left, width, o], i) => {
    const w = works[(i + 1) % works.length];
    thumbPic(box, w, `position:absolute;left:${left}%;width:${width}%;height:auto;aspect-ratio:${w.ratio};bottom:${100 - base}%;object-fit:cover;opacity:${o}`);
  });
  const line = h('span', 'g-timeline-thumbline', box);
  line.style.top = `${base}%`;
  [8, 22, 54, 66, 86, 95].forEach((left, i) => {
    const t = h('span', 'g-timeline-thumbtick', box);
    t.style.cssText = `left:${left}%;top:${base}%;height:${i === 2 ? 14 : 7}%${i === 2 ? ';background:var(--c-accent);width:2px' : ''}`;
  });
}
