/* Dial and covers share one position. The dial is what the hand turns: it leads, the covers follow
   a beat behind it. Dragging the covers moves them 1:1 and the dial catches up. */
import { clamp } from '../../core/spring.js';
import { drag, project, rubberClamp, unrubberClamp } from '../../core/gesture.js';
import { h, lifecycle, watchSize, dragNoStage, cutoutsOf, picture, fit, wheelDriver, thumbPic, tapKey } from './shared-b.js';

const STEP = 27; // degrees of dial per work
const ROT = 62;
const FOLLOW = 0.17;

export function mount(root, { concept, works, reduced, view }) {
  const life = lifecycle();
  const cutouts = cutoutsOf(concept);
  const n = works.length;
  const wrap = h('div', 'g-coverflow', root);
  const stage = h('div', 'g-coverflow-stage', wrap);
  const dialBox = h('div', 'g-coverflow-dial', wrap);
  const disc = h('div', 'g-coverflow-disc', dialBox);
  const pointer = h('div', 'g-coverflow-pointer', dialBox);
  const status = h('p', 'g-coverflow-status', wrap);
  status.setAttribute('role', 'status');

  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'g-coverflow-ticks');
  svg.setAttribute('viewBox', '-100 -100 200 200');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVGNS, 'path');
  let d = '';
  for (let a = 0; a < 360; a += STEP / 3) {
    const major = Math.abs((a / STEP) - Math.round(a / STEP)) < 0.01;
    const r0 = major ? 92.5 : 95;
    const c = Math.sin((a * Math.PI) / 180);
    const s = -Math.cos((a * Math.PI) / 180);
    d += `M${(c * r0).toFixed(2)} ${(s * r0).toFixed(2)}L${(c * 98).toFixed(2)} ${(s * 98).toFixed(2)}`;
  }
  path.setAttribute('d', d);
  svg.append(path);
  disc.append(svg);

  const items = works.map((w, i) => {
    const slot = h('div', 'g-slot g-coverflow-slot', stage);
    slot.dataset.i = i;
    const card = h('figure', 'g-coverflow-card', slot);
    card.dataset.work = w.id;
    picture(w, card, cutouts);
    tapKey(slot, life, `${w.title} 크게 보기`, () => tap(i));
    const shade = h('div', 'g-coverflow-shade', slot);
    const pill = h('span', 'g-coverflow-pill', slot, { textContent: w.title });
    const knob = h('button', 'g-coverflow-knob', disc, { type: 'button' });
    knob.setAttribute('aria-label', `${w.title} 보기`);
    knob.addEventListener('click', () => go(i));
    h('img', '', knob, { src: w.src, alt: '', draggable: false });
    return { w, slot, card, shade, pill, knob, w0: 0, h0: 0, z: -1 };
  });

  let W = wrap.clientWidth;
  let H = wrap.clientHeight;
  let gap = 1;
  let farGap = 1;
  let depth = 1;
  let active = -1;
  let grabbing = 'none'; // 'covers' | 'dial' | 'none'
  let lastDetent = null;

  const notch = life.spring({ value: 0, damping: 0.55, response: 0.2, precision: 0.02,
    onChange: (a) => { pointer.style.transform = `rotate(${a.toFixed(2)}deg)`; } });
  const press = life.spring({ value: 0, response: 0.18, precision: 0.002, onChange: () => draw() });
  const cover = life.spring({ value: 0, response: FOLLOW, precision: 0.0006, onChange: () => draw() });
  const dial = life.spring({ value: 0, response: 0.46, precision: 0.0006, onChange: turned });

  function turned(v) {
    disc.style.transform = `rotate(${(-v * STEP).toFixed(3)}deg)`;
    const detent = Math.round(v);
    if (lastDetent !== null && detent !== lastDetent && detent >= 0 && detent < n && !reduced) {
      notch.velocity += Math.sign(detent - lastDetent) * -150;
      notch.to(0);
    }
    lastDetent = detent;
    if (grabbing !== 'covers') {
      if (reduced) cover.set(v);
      else cover.to(v);
    }
  }

  function draw() {
    const pos = cover.value;
    const lift = press.value;
    let best = 0;
    let bestD = Infinity;
    items.forEach((it, i) => {
      const dist = i - pos;
      const ad = Math.abs(dist);
      const t = Math.tanh(1.7 * dist);
      // Linear within one step so the centre card stays under the finger.
      const x = ad <= 1 ? dist * gap : Math.sign(dist) * (gap + (ad - 1) * farGap);
      const z = -depth * t * t - 46 * (dist * dist) / (1 + ad);
      const s = 1 - lift * 0.022 * clamp(1 - ad);
      it.slot.style.transform = `translate3d(${x.toFixed(2)}px,0,${z.toFixed(2)}px) rotateY(${(-ROT * t).toFixed(2)}deg) scale(${s.toFixed(4)})`;
      it.slot.style.opacity = clamp(1.42 - Math.max(0, ad - 1.6) * 0.42, 0.12, 1).toFixed(3);
      it.shade.style.opacity = (Math.min(1, t * t) * 0.34).toFixed(3);
      it.pill.style.opacity = clamp(1 - ad * 3.2).toFixed(3);
      const zi = 100 - Math.round(ad * 12);
      if (zi !== it.z) { it.z = zi; it.slot.style.zIndex = zi; }
      if (ad < bestD) { bestD = ad; best = i; }
    });
    if (best !== active) {
      items[active]?.knob.removeAttribute('aria-current');
      active = best;
      items[best].knob.setAttribute('aria-current', 'true');
      status.textContent = items[best].w.title;
    }
  }

  function measure() {
    const dialH = W < 720 ? 82 : 92;
    const areaH = Math.max(120, H - dialH);
    stage.style.height = `${areaH}px`;
    stage.style.perspective = `${Math.max(760, W * 1.05)}px`;
    const maxW = W < 720 ? W * 0.76 : W < 960 ? W * 0.6 : W * 0.44;
    const maxH = areaH * 0.9;
    let widest = 0;
    for (const it of items) {
      // Phones are narrow: covers get squarer and the image crops, so they keep their presence.
      const b = fit(W < 720 ? Math.min(it.w.ratio, 1.14) : it.w.ratio, maxW, maxH);
      it.w0 = b.w;
      it.h0 = b.h;
      widest = Math.max(widest, b.w);
      it.slot.style.width = `${b.w}px`;
      it.slot.style.height = `${b.h}px`;
      it.slot.style.left = `${Math.round(W / 2 - b.w / 2)}px`;
      it.slot.style.top = `${Math.round(areaH / 2 - b.h / 2)}px`;
    }
    gap = widest * 0.64;
    farGap = Math.max(26, widest * 0.17);
    depth = widest * 0.62;

    const size = W < 720 ? 216 : 248;
    disc.style.width = disc.style.height = `${size}px`;
    disc.style.marginLeft = `${-size / 2}px`;
    const orbit = size / 2 - (W < 720 ? 25 : 28);
    items.forEach((it, i) => {
      it.knob.style.transform = `rotate(${i * STEP}deg) translate3d(0,${-orbit}px,0)`;
    });
    pointer.style.transformOrigin = `50% ${size / 2 + 10}px`;
    pointer.style.top = '-10px';
    pointer.style.width = `${W < 720 ? 44 : 50}px`;
    pointer.style.height = `${W < 720 ? 44 : 50}px`;
    pointer.style.marginTop = `${size / 2 - orbit - (W < 720 ? 22 : 25) + 10}px`;
    pointer.style.marginLeft = `${W < 720 ? -22 : -25}px`;
    discRadius = orbit;
    draw();
  }
  let discRadius = 90;

  function landAt(target, velocity, thrown) {
    const t = clamp(Math.round(target), 0, n - 1);
    if (reduced) {
      dial.set(t);
      stage.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 160, easing: 'linear' });
      return;
    }
    dial.to(t, { velocity, damping: thrown ? 0.82 : 1, response: 0.46 });
  }
  function go(i) { landAt(i, dial.velocity, false); }
  // A side cover comes to the centre first; the centred one opens large.
  function tap(i) {
    const open = i === active;
    go(i); // the press stopped it; let it settle under the viewer too
    if (open) view?.(items[i].w.id);
  }

  /* ---------- dragging the covers ---------- */
  let base = 0;
  let pressed = null;
  life.add(drag(stage, {
    axis: 'x',
    onPress: (e) => {
      pressed = e.target;
      cover.stop();
      dial.stop();
      if (!reduced) press.to(1);
    },
    onStart: () => {
      grabbing = 'covers';
      base = unrubberClamp(cover.value, 0, n - 1, 1.6);
    },
    onMove: ({ dx }) => {
      const v = rubberClamp(base - dx / gap, 0, n - 1, 1.6);
      cover.set(v);
      if (reduced) dial.set(v);
      else dial.to(v, { response: 0.09, damping: 1 });
    },
    onEnd: ({ vx, moved }) => {
      press.to(0);
      if (!moved) {
        const slot = pressed.closest('.g-coverflow-slot');
        if (slot) tap(Number(slot.dataset.i));
        else go(Math.round(dial.value));
        return;
      }
      grabbing = 'none';
      const rate = -vx / gap;
      cover.velocity = rate;
      landAt(cover.value + project(-vx) / gap, rate, Math.abs(vx) > 240);
    },
    onCancel: () => { press.to(0); go(Math.round(dial.value)); },
  }));

  /* ---------- turning the dial: the finger keeps its angle ---------- */
  let cx = 0;
  let cy = 0;
  let lastAngle = 0;
  let swept = 0;
  let dialBase = 0;
  const angleOf = (x, y) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
  dragNoStage(dialBox, life, {
    axis: 'both',
    threshold: 4,
    onPress: () => {
      dial.stop();
      cover.stop();
      const r = disc.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    },
    onStart: ({ x, y }) => {
      grabbing = 'dial';
      lastAngle = angleOf(x, y);
      swept = 0;
      dialBase = unrubberClamp(dial.value, 0, n - 1, 1.4);
    },
    onMove: ({ x, y }) => {
      const a = angleOf(x, y);
      let delta = a - lastAngle;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      lastAngle = a;
      swept += delta;
      dial.set(rubberClamp(dialBase - swept / STEP, 0, n - 1, 1.4));
    },
    onEnd: ({ x, y, vx, vy, moved }) => {
      grabbing = 'none';
      if (!moved) { landAt(dial.value, 0, false); return; }
      const rx = x - cx;
      const ry = y - cy;
      const r2 = Math.max(400, rx * rx + ry * ry);
      const deg = (((rx * vy - ry * vx) / r2) * 180) / Math.PI;
      const rate = -deg / STEP;
      const pxPerStep = (discRadius * STEP * Math.PI) / 180;
      landAt(dial.value + project(rate * pxPerStep) / pxPerStep, rate, Math.abs(rate) > 0.6);
    },
    onCancel: () => landAt(dial.value, 0, false),
  });

  const wheel = wheelDriver({
    value: () => dial.target,
    min: () => 0,
    max: () => n - 1,
    life,
    scale: 1 / 240,
    apply: (g) => { if (reduced) dial.set(g); else dial.to(g, { response: 0.26, damping: 1 }); },
    settle: (sign) => landAt(dial.target + sign * 0.42, dial.velocity, false),
  });

  life.on(wrap, 'keydown', (e) => {
    const next = e.key === 'ArrowRight' ? active + 1 : e.key === 'ArrowLeft' ? active - 1 : null;
    if (next === null || next < 0 || next >= n) return;
    go(next);
    items[next].knob.focus({ preventScroll: true });
  });

  // Start in the middle so the first thing seen has covers on both sides.
  const start = Math.floor((n - 1) / 2);
  measure();
  cover.set(start);
  dial.set(start);
  watchSize(wrap, life, (w, ht) => { W = w; H = ht; measure(); });

  return {
    destroy() { life.destroy(); wrap.remove(); },
    pause: life.pause,
    resume: life.resume,
    onWheel: wheel,
  };
}

export function thumb(box, works) {
  const stage = h('span', 'g-coverflow-thumb', box);
  [[1, 58], [0, 0], [2, -58]].forEach(([i, deg], k) => {
    const w = works[(i + 1) % works.length];
    const left = deg === 0 ? 27 : deg > 0 ? 7 : 57;
    thumbPic(stage, w, `position:absolute;left:${left}%;top:${deg === 0 ? 10 : 15}%;width:${deg === 0 ? 46 : 36}%;height:${deg === 0 ? 56 : 46}%;object-fit:cover;z-index:${k === 1 ? 2 : 1};transform:rotateY(${deg}deg)`);
  });
  h('span', 'g-coverflow-thumbdial', box);
}
