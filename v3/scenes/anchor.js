/* The subject stands still; the world turns around it. A world (colour, giant word, far orb)
   opens as a disc from behind the subject, near orbs cross in front of it. Everything is a
   pure function of pos, a float along an endless bundle track. */
import { onTick, Spring, clamp, smooth } from '../core/spring.js';
import { drag, project } from '../core/gesture.js';

const PERIOD = 2.4;
const html = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const orbImg = (src) => {
  const i = new Image();
  i.src = src;
  i.alt = '';
  i.decoding = 'async';
  i.draggable = false;
  return i;
};
const mod = (x, n) => ((x % n) + n) % n;
const wrap = (x, n) => mod(x + n / 2, n) - n / 2;

// Rest position of [near orb, far orb], as fractions of the host.
const SPOTS = [
  [[0.13, 0.76], [0.86, 0.2]],
  [[0.87, 0.78], [0.12, 0.17]],
  [[0.2, 0.86], [0.8, 0.12]],
];

const fontOf = (concept, size = 100) => `${concept.tokens.weightDisplay} ${size}px ${concept.tokens.fontDisplay}`;

export function mount(el, { concept, reduced }) {
  const { anchor } = concept;
  const N = anchor.bundles.length;
  const root = html('div', 'anchor');
  el.append(root);

  const worldsBox = html('div', 'an-worlds');
  const worlds = anchor.bundles.map((b, i) => {
    const node = html('div', 'an-world');
    node.style.background = b.bg;
    const word = html('div', 'an-word', b.word);
    word.style.color = b.ink;
    const far = html('div', 'an-orb an-far');
    far.append(orbImg(b.orbs[1]));
    node.append(far, word);
    worldsBox.append(node);
    return { node, word, far, b, i };
  });
  root.append(worldsBox);

  /* subject */
  const center = html('div', `an-center ${anchor.cutout ? 'is-cutout' : 'is-arch'}`);
  const srcs = [...new Set(anchor.bundles.map((b) => b.center || anchor.center))];
  const subjects = srcs.map((src) => {
    const i = orbImg(src);
    i.className = 'an-subject';
    center.append(i);
    return { src, node: i };
  });
  root.append(center);

  const frontBox = html('div', 'an-front');
  const nears = anchor.bundles.map((b) => {
    const n = html('div', 'an-orb an-near');
    n.append(orbImg(b.orbs[0]));
    frontBox.append(n);
    return n;
  });
  root.append(frontBox);

  /* ---------- measure ---------- */
  let W = 0;
  let H = 0;
  let cx = 0;
  let cy = 0;
  let D = 1;
  let rMax = 1;
  let nearSize = 0;
  let farSize = 0;
  const ctx = document.createElement('canvas').getContext('2d');

  function measure() {
    if (destroyed) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width;
    H = r.height;

    let cw;
    let ch;
    if (anchor.cutout) {
      cw = Math.min(W * 0.72, H * 0.74);
      ch = cw * 0.8;
      cy = H * 0.56;
    } else {
      ch = H * 0.74;
      cw = Math.min(ch * 0.72, W * 0.56);
      ch = Math.min(ch, cw / 0.62);
      cy = H - ch / 2;
    }
    cx = W / 2;
    center.style.width = `${cw}px`;
    center.style.height = `${ch}px`;
    center.style.left = `${cx - cw / 2}px`;
    center.style.top = `${cy - ch / 2}px`;
    rMax = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 8;
    D = Math.min(W * 0.8, 760);

    const m = Math.min(W, H);
    nearSize = m * (W < 640 ? 0.42 : 0.4);
    farSize = m * (W < 640 ? 0.26 : 0.25);
    for (const n of nears) { n.style.width = n.style.height = `${nearSize}px`; }

    ctx.font = fontOf(concept);
    const track = parseFloat(concept.tokens.trackDisplay) || 0;
    worlds.forEach((w) => {
      w.far.style.width = w.far.style.height = `${farSize}px`;
      const text = w.b.word;
      const mt = ctx.measureText(text);
      const inkW = (mt.actualBoundingBoxLeft + mt.actualBoundingBoxRight) / 100 + track * (text.length - 1);
      const inkH = (mt.actualBoundingBoxAscent + mt.actualBoundingBoxDescent) / 100;
      const fs = Math.min((W * 0.96) / inkW, (H * 0.86) / inkH);
      w.word.style.fontSize = `${fs.toFixed(1)}px`;
      // Short words fill the height behind the subject; long ones ride above its shoulders.
      const glyphH = inkH * fs;
      w.wordY = glyphH > H * 0.5 ? H * 0.48 : Math.max(glyphH * 0.62, anchor.cutout ? H * 0.26 : (cy - ch / 2) + glyphH * 0.02);
    });
    render();
  }

  /* ---------- render ---------- */
  let pos = 0;
  let clock = 0;
  const cache = new Map();
  const put = (node, prop, val) => {
    let c = cache.get(node);
    if (!c) cache.set(node, (c = {}));
    if (c[prop] === val) return;
    c[prop] = val;
    node.style[prop] = val;
  };

  const orbTransform = (u, i, kind, size) => {
    const [sx, sy] = SPOTS[i % SPOTS.length][kind];
    const near = kind === 0;
    const rx = sx * W;
    const ry = sy * H;
    // Near orbs cross right to left, far orbs left to right: one orbit seen from the side.
    const xFrom = near ? W + size * 0.9 : -size * 0.9;
    const xTo = near ? -size * 0.9 : W + size * 0.9;
    const a = (xTo - xFrom) / 2;
    const b = (xTo + xFrom) / 2 - rx;
    const x = rx + a * u + b * u * u;
    const arc = (near ? 0.14 : -0.1) * H;
    const bob = reduced ? 0 : Math.sin(clock * 1.25 + i * 2.1 + kind * 1.3) * Math.min(H * 0.012, 9);
    const y = ry + arc * u * u + bob;
    const scale = near ? 1 + 0.34 * u * u : 1 - 0.3 * u * u;
    const roll = (near ? -1 : 1) * u * 46 + (reduced ? 0 : Math.sin(clock * 0.8 + i) * 2.4);
    return `translate3d(${(x - size / 2).toFixed(2)}px,${(y - size / 2).toFixed(2)}px,0) rotate(${roll.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
  };

  function render() {
    if (!W) return;
    const k = Math.floor(pos);
    const p = pos - k;
    const a = mod(k, N);
    const b = mod(k + 1, N);
    const radius = (reduced ? 1 : p ** 1.12) * rMax;

    worlds.forEach((w, i) => {
      const on = i === a || (i === b && p > 0.0005);
      put(w.node, 'visibility', on ? 'visible' : 'hidden');
      if (!on) return;
      const u = wrap(pos - i, N);
      put(w.node, 'zIndex', i === b ? '2' : '1');
      if (reduced) {
        put(w.node, 'clipPath', 'none');
        put(w.node, 'opacity', i === b ? p.toFixed(3) : '1');
      } else {
        put(w.node, 'clipPath', i === b ? `circle(${radius.toFixed(1)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px)` : 'none');
      }
      const uu = reduced ? 0 : u;
      const drift = reduced ? 0 : Math.sin(clock * 0.42 + i * 1.7) * W * 0.006;
      put(w.word, 'transform', `translate3d(${(W / 2 - uu * D + drift).toFixed(2)}px,${(w.wordY ?? 0).toFixed(2)}px,0) translate(-50%,-50%)`);
      put(w.far, 'transform', orbTransform(uu, i, 1, farSize));
    });

    nears.forEach((node, i) => {
      const u = wrap(pos - i, N);
      const on = reduced ? i === a || (i === b && p > 0) : Math.abs(u) < 1.2;
      put(node, 'visibility', on ? 'visible' : 'hidden');
      if (!on) return;
      put(node, 'transform', orbTransform(reduced ? 0 : u, i, 0, nearSize));
      if (reduced) put(node, 'opacity', (i === b ? p : i === a ? 1 - p : 0).toFixed(3));
    });

    const srcA = anchor.bundles[a].center || anchor.center;
    const srcB = anchor.bundles[b].center || anchor.center;
    const local = Math.hypot(center.offsetWidth, center.offsetHeight) / 2;
    subjects.forEach((s) => {
      const isA = s.src === srcA;
      const isB = s.src === srcB;
      const on = isA || (isB && p > 0.0005);
      put(s.node, 'visibility', on ? 'visible' : 'hidden');
      if (!on) return;
      if (isB && !isA) {
        put(s.node, 'zIndex', '2');
        if (reduced) put(s.node, 'opacity', p.toFixed(3));
        else put(s.node, 'clipPath', `circle(${Math.min(radius, local + 2).toFixed(1)}px at 50% 50%)`);
      } else {
        put(s.node, 'zIndex', '1');
        put(s.node, 'clipPath', 'none');
        put(s.node, 'opacity', '1');
      }
    });
  }

  /* ---------- motion ---------- */
  let destroyed = false;
  let playing = !reduced;
  let hovering = false;
  let held = false;
  let since = 0;
  let wheelAt = -1;
  let wheeling = false;
  let stopTick = null;

  const spring = new Spring({
    value: 0,
    response: reduced ? 0.25 : 0.85,
    precision: 0.0006,
    onChange: (v) => {
      pos = v;
      if (!stopTick) render();
    },
    onRest: () => { spring.damping = 1; spring.response = reduced ? 0.25 : 0.85; },
  });

  // core/spring.js onTick double-schedules its frame loop if called from inside a tick,
  // so a spring may only be (re)started once the current frame's callbacks have returned.
  const retarget = (to, response) => queueMicrotask(() => {
    if (!destroyed && !held) spring.to(to, { response, damping: 1 });
  });

  function tick(dt, now) {
    clock += dt;
    if (wheeling && now - wheelAt > 120) {
      wheeling = false;
      since = 0;
      retarget(Math.round(spring.target), 0.6);
    }
    if (!hovering && !held && !wheeling) {
      since += dt;
      if (since >= PERIOD) {
        since -= PERIOD;
        retarget(Math.round(spring.target) + 1, 0.85);
      }
    }
    render();
    if (!playing && !wheeling) {
      stopTick?.();
      stopTick = null;
    }
  }
  const startTick = () => {
    if (!stopTick && !destroyed && !reduced) stopTick = onTick(tick);
  };

  /* reduced: short crossfade by tap, swipe or the two buttons */
  let nav = null;
  const stepReduced = (dir) => {
    const here = Math.round(spring.target);
    spring.set(here);
    pos = here;
    spring.to(here + dir, { response: 0.25 });
    render();
  };
  if (reduced) {
    nav = html('div', 'an-nav');
    nav.dataset.nodrag = '';
    const prev = html('button', 'an-nav-btn');
    prev.type = 'button';
    prev.setAttribute('aria-label', '이전');
    prev.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.75"/></svg>';
    const next = html('button', 'an-nav-btn');
    next.type = 'button';
    next.setAttribute('aria-label', '다음');
    next.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 2.5 11 8l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.75"/></svg>';
    prev.addEventListener('click', () => stepReduced(-1), { once: false });
    next.addEventListener('click', () => stepReduced(1), { once: false });
    nav.append(prev, next);
    root.append(nav);
  }

  let base = 0;
  const stopDrag = drag(el, {
    axis: 'x',
    onPress: () => {
      if (reduced) return;
      held = true;
      wheeling = false;
      spring.stop();
      spring.velocity = 0;
      root.classList.add('is-held');
    },
    onStart: () => { base = pos; },
    onMove: ({ dx }) => {
      if (reduced) return;
      pos = base - dx / D;
      spring.set(pos);
      if (!stopTick) render();
    },
    onEnd: ({ dx, vx, moved, x }) => {
      held = false;
      root.classList.remove('is-held');
      since = 0;
      if (reduced) {
        if (moved) { if (Math.abs(dx) > 24) stepReduced(dx < 0 ? 1 : -1); }
        else stepReduced(x - el.getBoundingClientRect().left < W / 2 ? -1 : 1);
        return;
      }
      if (!moved) {
        spring.to(Math.round(pos), { response: 0.85, damping: 1 });
        return;
      }
      const v = -vx / D;
      const landing = pos + project(-vx) / D;
      // A hard throw clears at most two bundles.
      const here = Math.round(pos);
      const target = clamp(Math.round(landing), here - 2, here + 2);
      spring.to(target, { velocity: v, damping: Math.abs(v) > 0.8 ? 0.82 : 1, response: 0.7 });
    },
    onCancel: () => {
      held = false;
      root.classList.remove('is-held');
      if (!reduced) spring.to(Math.round(spring.target), { damping: 1, response: 0.85 });
    },
  });

  const onEnter = (e) => { if (e.pointerType === 'mouse') hovering = true; };
  const onLeave = (e) => { if (e.pointerType === 'mouse') hovering = false; };
  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointerleave', onLeave);

  const ro = new ResizeObserver(measure);
  ro.observe(el);
  measure();
  if (document.fonts) {
    const again = () => { if (!destroyed) measure(); };
    const text = anchor.bundles.map((b) => b.word).join('');
    document.fonts.load(fontOf(concept), text).then(again, again);
    document.fonts.ready.then(again);
  }
  startTick();

  return {
    play() {
      playing = !reduced;
      startTick();
    },
    pause() { playing = false; },
    seek(t) {
      wheeling = false;
      since = 0;
      pos = t / PERIOD;
      spring.set(pos);
      if (!stopTick) render();
    },
    onWheel(dy, dx) {
      if (reduced || Math.abs(dx) <= Math.abs(dy) || !dx) return false;
      wheeling = true;
      wheelAt = performance.now();
      spring.to(spring.target + dx / D, { response: 0.2, damping: 1 });
      startTick();
      return true;
    },
    destroy() {
      destroyed = true;
      stopTick?.();
      stopTick = null;
      spring.stop();
      stopDrag();
      ro.disconnect();
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('pointerleave', onLeave);
      root.remove();
    },
  };
}

export function thumb(box, { concept }) {
  const { anchor } = concept;
  const b = anchor.bundles[0];
  const stage = html('div', 'an-thumb');
  stage.style.background = b.bg;
  const word = html('div', 'an-thumb-word', b.word);
  word.style.color = b.ink;
  const units = Array.from(b.word).reduce((s, c) => s + (/[ㄱ-힝]/.test(c) ? 1 : 0.62), 0);
  word.style.fontSize = `${Math.min(92 / units, 74).toFixed(1)}cqw`;
  const far = html('div', 'an-thumb-orb is-far');
  far.append(orbImg(b.orbs[1]));
  const center = html('div', `an-thumb-center ${anchor.cutout ? 'is-cutout' : 'is-arch'}`);
  center.append(orbImg(b.center || anchor.center));
  const near = html('div', 'an-thumb-orb is-near');
  near.append(orbImg(b.orbs[0]));
  stage.append(word, far, center, near);
  box.append(stage);
}
