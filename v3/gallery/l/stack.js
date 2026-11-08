/* A real pile. The top card is held by the finger; a throw carries its velocity off screen,
   the card then slides back under the pile the way it left. A card in the air can be caught. */
import { clamp } from '../../core/spring.js';
import { project } from '../../core/gesture.js';
import { h, lifecycle, watchSize, dragNoStage, cutoutsOf, picture, fit, thumbPic, tapKey } from './shared-b.js';

const TILT = [0, -3.8, 3, -2, 4.2, -3.2, 2.2];

export function mount(root, { concept, works, reduced, view }) {
  const life = lifecycle();
  const cutouts = cutoutsOf(concept);
  const n = works.length;
  const wrap = h('div', 'g-stack', root);
  const titles = h('div', 'g-stack-titles', wrap);
  const pile = h('div', 'g-stack-pile', wrap);
  const bar = h('div', 'g-stack-bar', wrap);
  const count = h('span', 'g-stack-count', bar);
  const next = h('button', 'g-stack-next', bar, { type: 'button', textContent: '다음 장' });
  const status = h('p', 'g-stack-status', wrap);
  status.setAttribute('role', 'status');

  let W = wrap.clientWidth;
  let H = wrap.clientHeight;
  let threshold = 120;
  let exitDist = 1000;
  let grabbed = null;
  let grabLift = 0;

  const cards = works.map((w, i) => {
    const slot = h('div', 'g-slot g-stack-slot', pile);
    slot.dataset.i = i;
    const face = h('figure', 'g-stack-card', slot);
    face.dataset.work = w.id;
    picture(w, face, cutouts);
    // Only the top card is reachable by keyboard; stackOrder() moves the tab stop with it.
    tapKey(slot, life, `${w.title} 크게 보기`, () => { if (order[0] === c) view?.(w.id); });
    const title = h('div', 'g-stack-title', titles);
    h('strong', '', title, { textContent: w.title });
    h('span', '', title, { textContent: `${w.year} · ${w.cat}` });
    const c = { i, w, slot, title, state: 'pile', z: -1, tilt: TILT[(i + 1) % TILT.length] };
    const onChange = () => {
      if (c.state === 'fly' && Math.hypot(c.x.value, c.y.value) > exitDist) goUnder(c);
      if (c === order[0]) drawAll();
      else draw(c);
    };
    // Back under the pile: an ordinary card again.
    const onRest = () => {
      if (c.state !== 'under' || c.x.active || c.y.active) return;
      c.state = 'pile';
      stackOrder();
      draw(c);
    };
    c.x = life.spring({ value: 0, response: 0.42, precision: 0.2, onChange, onRest });
    c.y = life.spring({ value: 0, response: 0.42, precision: 0.2, onChange, onRest });
    c.d = life.spring({ value: i, damping: 1, response: 0.42, precision: 0.002, onChange: () => draw(c) });
    return c;
  });
  const order = cards.slice();

  const press = life.spring({ value: 0, response: 0.16, precision: 0.002, onChange: (v) => {
    grabLift = v;
    if (grabbed) draw(grabbed);
  } });

  function draw(c) {
    const top = order[0];
    const lift = c === top ? 0 : clamp(Math.hypot(top.x.value, top.y.value) / threshold) * 0.45;
    const k = Math.max(0, c.d.value - (c.state === 'pile' ? lift : 0));
    const x = c.x.value;
    const y = c.y.value - k * 11;
    const spin = clamp((c.x.value / Math.max(W, 320)) * 34, -30, 30);
    const rot = spin + c.tilt * clamp(k);
    const s = (1 - k * 0.018) * (c === grabbed ? 1 + grabLift * 0.018 : 1);
    c.slot.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${rot.toFixed(3)}deg) scale(${s.toFixed(4)})`;
    const away = 1 - Math.hypot(c.x.value, c.y.value) / threshold;
    const shown = c === top || c.state === 'fly' ? away : c.state === 'under' ? 0 : 1 - k * 2.1;
    c.title.style.opacity = clamp(shown).toFixed(3);
  }
  function drawAll() { cards.forEach(draw); }

  function stackOrder() {
    order.forEach((c, k) => {
      const z = c.state === 'fly' ? 200 + k : c.state === 'under' ? 0 : n - k + 1;
      if (z !== c.z) { c.z = z; c.slot.style.zIndex = z; }
    });
    const top = order[0];
    cards.forEach((c) => { c.slot.tabIndex = c === top ? 0 : -1; });
    count.textContent = `${String(top.i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    status.textContent = top.w.title;
  }

  function riseAll() {
    order.forEach((c, k) => {
      if (c.state === 'fly') return;
      c.d.to(k, { damping: 0.86, response: 0.44 });
    });
  }

  /** The card has left the screen: it can change layer unseen and slide back under. */
  function goUnder(c) {
    c.state = 'under';
    c.d.set(order.indexOf(c));
    stackOrder();
    c.x.velocity = 0;
    c.y.velocity = 0;
    c.x.to(0, { damping: 1, response: 0.62 });
    c.y.to(0, { damping: 1, response: 0.62 });
  }

  function send(c, vx, vy) {
    if (reduced) {
      order.splice(order.indexOf(c), 1);
      order.push(c);
      c.state = 'pile';
      c.x.set(0);
      c.y.set(0);
      order.forEach((o, k) => o.d.set(k));
      stackOrder();
      drawAll();
      order[0].slot.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 180, easing: 'linear' });
      return;
    }
    let dx = vx;
    let dy = vy;
    if (Math.hypot(dx, dy) < 200) { dx = c.x.value || 1; dy = c.y.value; }
    const len = Math.hypot(dx, dy) || 1;
    const far = exitDist * 1.6;
    order.splice(order.indexOf(c), 1);
    order.push(c);
    c.state = 'fly';
    stackOrder();
    c.x.to(c.x.value + (dx / len) * far, { velocity: vx, damping: 1, response: 0.56 });
    c.y.to(c.y.value + (dy / len) * far, { velocity: vy, damping: 1, response: 0.56 });
    riseAll();
    drawAll();
  }

  function home(c, vx, vy, thrown) {
    if (reduced) { c.x.set(0); c.y.set(0); return; }
    c.x.to(0, { velocity: vx, damping: thrown ? 0.72 : 1, response: 0.42 });
    c.y.to(0, { velocity: vy, damping: thrown ? 0.72 : 1, response: 0.42 });
  }

  function measure() {
    const barH = 60;
    const areaH = Math.max(120, H - barH);
    pile.style.left = `${Math.round(W / 2)}px`;
    pile.style.top = `${Math.round(areaH / 2 + 12)}px`;
    const maxW = W < 960 ? W * 0.76 : Math.min(W * 0.5, 720);
    const maxH = areaH * 0.84;
    let big = 0;
    for (const c of cards) {
      const b = fit(c.w.ratio, maxW, maxH);
      c.slot.style.width = `${b.w}px`;
      c.slot.style.height = `${b.h}px`;
      c.slot.style.marginLeft = `${-b.w / 2}px`;
      c.slot.style.marginTop = `${-b.h / 2}px`;
      big = Math.max(big, b.w, b.h);
    }
    threshold = Math.max(90, big * 0.4);
    exitDist = Math.hypot(W, H + 120) * 0.5 + big * 0.75;
    drawAll();
  }

  /* ---------- the hand ---------- */
  let bx = 0;
  let by = 0;
  let caught = false; // the hand took a card out of the air, not the top of the pile
  dragNoStage(pile, life, {
    axis: 'both',
    threshold: 3,
    onPress: (e) => {
      const hit = e.target.closest?.('.g-stack-slot');
      const under = hit ? cards[Number(hit.dataset.i)] : null;
      // A card still in the air, or sliding back, is what the hand caught. Otherwise the top one.
      const c = under && under.state !== 'pile' && Math.hypot(under.x.value, under.y.value) > 40 ? under : order[0];
      grabbed = c;
      caught = c !== order[0] || c.state !== 'pile';
      c.x.stop();
      c.y.stop();
      c.x.velocity = 0;
      c.y.velocity = 0;
      if (c !== order[0] || c.state !== 'pile') {
        order.splice(order.indexOf(c), 1);
        order.unshift(c);
        c.state = 'pile';
        stackOrder();
        riseAll();
      }
      bx = c.x.value;
      by = c.y.value;
      if (!reduced) press.to(1);
    },
    onStart: () => {
      bx = grabbed.x.value;
      by = grabbed.y.value;
    },
    onMove: ({ dx, dy }) => {
      grabbed.x.set(bx + dx);
      grabbed.y.set(by + dy);
    },
    onEnd: ({ vx, vy, moved }) => {
      const c = grabbed;
      press.to(0);
      if (!c) return;
      const px = c.x.value + project(vx);
      const py = c.y.value + project(vy);
      if (moved && Math.hypot(px, py) > threshold) send(c, vx, vy);
      else home(c, vx, vy, moved && Math.hypot(vx, vy) > 120);
      // A tap on the resting top card opens it large; catching a card in flight does not.
      if (!moved && !caught) view?.(c.w.id);
    },
    onCancel: () => { press.to(0); if (grabbed) home(grabbed, 0, 0, false); },
  });
  press.onRest = (v) => { if (v === 0) grabbed = null; };

  next.addEventListener('click', () => send(order[0], 1500, -380));

  measure();
  stackOrder();
  watchSize(wrap, life, (w, ht) => { W = w; H = ht; measure(); });

  return {
    destroy() { life.destroy(); wrap.remove(); },
    pause: life.pause,
    resume: life.resume,
  };
}

export function thumb(box, works) {
  const shapes = [
    [2, 15, 58, 62, 7],
    [1, 20, 58, 60, -6],
    [0, 26, 56, 58, 3],
  ];
  shapes.forEach(([i, left, width, height, deg]) => {
    thumbPic(box, works[i % works.length], `position:absolute;left:${left}%;top:${100 - height - 18}%;width:${width}%;height:${height}%;object-fit:cover;background:var(--c-paper);outline:2px solid var(--c-paper);transform:rotate(${deg}deg);box-shadow:0 2px 5px color-mix(in oklch,var(--c-ink) 28%,transparent)`);
  });
}
