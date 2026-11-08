/* A pile of work that fans out. One spring value, `open`, is the whole fan: every card's transform
   is a pure function of it, so the intro, a drag and a flick are the same motion at different speeds.
   Drag sticks the grabbed card to the finger. */

import { Spring, onTick, clamp, smooth, lerp } from '../core/spring.js';
import { drag, project, rubberClamp, unrubberClamp, nearest } from '../core/gesture.js';

const RATIO = 1.25;          // card height / width
const STAGGER = 0.135;       // seconds between landings
const SKEW = -11;            // degrees, the tilt of the fanned deck
const PILE_ROT = [-5.5, 3.5, -2, 5, -3.5, 1.5];
const FALL_ROT = [-16, 13, -9, 15, -12, 8];

/* core onTick schedules a second frame loop when a spring first starts inside a tick callback, which
   doubles every clock. Starting after the callback returns avoids that. */
const fromTick = queueMicrotask.bind(globalThis);

/** Transparent corners mean a cutout: it must sit whole on the card, not be cropped to fill it. */
function isCutout(img) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 12;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 12, 12);
    const d = ctx.getImageData(0, 0, 12, 12).data;
    return [3, 47, 575, 527].some((k) => d[k] < 200);
  } catch { return false; }
}

export function mount(el, { concept, reduced }) {
  const works = concept.works;
  const n = works.length;

  const root = document.createElement('div');
  root.className = 'st';
  const name = document.createElement('h2');
  name.className = 'st-name';
  const nameText = document.createElement('span');
  nameText.textContent = concept.site;
  name.append(nameText);
  const deck = document.createElement('div');
  deck.className = 'st-deck';
  root.append(name, deck);

  const cards = works.map((w, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'st-card';
    b.setAttribute('aria-label', w.title);
    b.style.zIndex = String(i + 1);
    const img = new Image();
    img.alt = w.alt || '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = w.src;
    b.append(img);
    deck.append(b);
    const state = { el: b, img, i, d: 0, press: 0, lift: 0, landed: false, raised: false };
    state.dSpring = new Spring({ value: 0, damping: 1, response: 0.3, precision: 0.002, onChange: (v) => { state.d = v; landing(state); paint(state); } });
    state.pressSpring = new Spring({ value: 0, damping: 1, response: 0.16, precision: 0.005, onChange: (v) => { state.press = v; paint(state); } });
    state.liftSpring = new Spring({
      value: 0,
      damping: 1,
      response: 0.42,
      precision: 0.002,
      onChange: (v) => {
        state.lift = v;
        const up = v > 0.004 || focused === state;
        if (up !== state.raised) { state.raised = up; b.style.zIndex = String(up ? n + 5 : i + 1); }
        paintAll();
      },
    });
    return state;
  });

  let W = el.clientWidth || 1, H = el.clientHeight || 1;
  let base = 1, step = 1, focusW = 1, deckY = 0;
  let focused = null;
  let destroyed = false;
  let playing = true;
  let thud = 0;
  let open = reduced ? 1 : 0;

  const thudSpring = new Spring({ value: 0, damping: 1, response: 0.2, precision: 0.002, onChange: (v) => { thud = v; paintAll(); } });
  const openSpring = new Spring({
    value: open,
    damping: 1,
    response: 0.52,
    precision: 0.0015,
    onChange: (v) => { open = v; paintAll(); },
  });

  function landing(s) {
    if (s.landed || s.d < 0.86) return;
    s.landed = true;
    // Each landing presses the pile under it; the first one has nothing to press.
    if (s.i > 0) fromTick(() => thudSpring.to(0, { velocity: thudSpring.velocity + 3.2 }));
  }

  function paint(s) {
    const { i, d } = s;
    const c = i - (n - 1) / 2;
    const o = open;
    const tilt = smooth(0, 0.34, o);
    const under = Math.min(o, 0);

    let x = c * step * Math.max(o, 0);
    let y = 0;
    let rot = PILE_ROT[i % PILE_ROT.length] * (1 - smooth(0, 0.6, o));
    let skew = SKEW * tilt;
    let scale = base * (1 + under * 0.32);

    // Falling onto the table. Squared so it arrives hard rather than drifting in.
    const fall = 1 - d;
    const f2 = fall * fall;
    y -= f2 * H * 0.3;
    rot += f2 * FALL_ROT[i % FALL_ROT.length];
    scale *= 1 + f2 * 0.6;

    if (s.landed) {
      scale *= 1 - thud * 0.018 * (1 - o * 0.8);
      rot += thud * 0.9 * Math.sign(PILE_ROT[i % PILE_ROT.length]);
    }

    // The other cards give way to a card brought forward.
    let give = 0, side = 0;
    for (const other of cards) {
      if (other !== s && other.lift > give) { give = other.lift; side = Math.sign(i - other.i); }
    }
    x += side * give * step * 0.4;
    scale *= 1 - give * 0.05;

    const L = s.lift;
    if (L > 0) {
      x = lerp(x, 0, L); y = lerp(y, H / 2 - deckY, L);
      rot = lerp(rot, 0, L); skew = lerp(skew, 0, L);
      scale = lerp(scale, 1, L);
    }
    scale *= 1 - s.press * 0.025;

    s.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${rot.toFixed(3)}deg) skewY(${skew.toFixed(3)}deg) scale(${scale.toFixed(4)})`;
    s.el.style.opacity = d >= 0.14 ? '1' : (d / 0.14).toFixed(3);
  }

  function paintAll() {
    for (const s of cards) paint(s);
    name.style.transform = `scale(${(0.94 + 0.06 * clamp(open, 0, 1.1)).toFixed(4)})`;
  }

  /* ---------- measure: the layout sizes cards at their largest so a card brought forward stays sharp ---------- */
  function measure() {
    W = el.clientWidth || W; H = el.clientHeight || H;
    focusW = Math.min(W * 0.84, (H * 0.88) / RATIO);
    const cardW = Math.min(H * 0.4, W * 0.54);
    base = cardW / focusW;
    step = Math.min(cardW * 0.62, (W * 0.9 - cardW) / Math.max(1, n - 1));
    deck.style.setProperty('--w', `${focusW}px`);
    deck.style.setProperty('--h', `${focusW * RATIO}px`);

    // The name stands behind the deck, the fanned cards covering its lower third, and the two sit
    // centered as one block.
    name.style.fontSize = '100px';
    const nameEm = (nameText.offsetWidth || 100) / 100;
    const size = Math.min((W * 0.96) / nameEm, H * 0.5);
    name.style.fontSize = `${size}px`;
    const deckH = cardW * RATIO + cardW * Math.tan((-SKEW * Math.PI) / 180);
    const showing = size * 0.68;
    const top = Math.max(0, (H - showing - deckH) / 2);
    name.style.top = `${top}px`;
    deckY = top + showing + deckH / 2;
    deck.style.top = `${deckY}px`;
    paintAll();
  }

  const ro = new ResizeObserver(measure);
  ro.observe(el);
  el.append(root);
  measure();

  /* ---------- gesture ---------- */
  let dragBase = 0, sign = 1, travel = 1, pressed = null, grabbed = false;
  const OVER = 0.5;

  const cardAt = (e) => {
    const b = e.target.closest?.('.st-card');
    return b ? cards.find((c) => c.el === b) : null;
  };

  function setFocus(next) {
    if (focused === next) return;
    const prev = focused;
    focused = next;
    if (prev) {
      if (reduced) { prev.liftSpring.set(0); prev.el.style.zIndex = String(prev.i + 1); prev.raised = false; }
      else prev.liftSpring.to(0);
    }
    if (next) {
      next.raised = true;
      next.el.style.zIndex = String(n + 5);
      if (reduced) {
        next.liftSpring.set(1);
        next.el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      } else next.liftSpring.to(1);
    }
    for (const c of cards) c.el.setAttribute('aria-pressed', String(c === next));
  }

  function toggleCard(s) {
    if (open < 0.5) { settleOpen(1); return; }
    setFocus(focused === s ? null : s);
  }

  function settleOpen(target, velocity) {
    if (reduced) { openSpring.set(target); return; }
    intro.auto = false;
    const thrown = velocity !== undefined && Math.abs(velocity) > 0.2;
    openSpring.to(target, { velocity, damping: thrown ? 0.8 : 1, response: thrown ? 0.46 : 0.5 });
  }

  const disposeDrag = drag(root, {
    axis: 'x',
    threshold: 8,
    onPress: (e) => {
      pressed = cardAt(e);
      if (pressed) pressed.pressSpring.to(1);
      if (!reduced) {
        grabbed = openSpring.active;
        openSpring.stop();
      }
    },
    onStart: ({ lead, e }) => {
      if (reduced) return;
      intro.auto = false;
      setFocus(null);
      if (pressed) { pressed.pressSpring.to(0); }
      const rect = root.getBoundingClientRect();
      const fromCenter = e.clientX - lead.dx - (rect.left + rect.width / 2);
      // Pile: whichever way the finger goes opens it. Fan: pulling a card outward opens, inward closes.
      sign = open < 0.15 || Math.abs(fromCenter) < step * 0.5 ? (lead.dx >= 0 ? 1 : -1) : Math.sign(fromCenter);
      const c = pressed ? Math.abs(pressed.i - (n - 1) / 2) : 0;
      travel = Math.max(1, (c >= 1 ? c : (n - 1) / 2) * step);
      dragBase = unrubberClamp(open, 0, 1, OVER);
    },
    onMove: ({ dx }) => {
      if (reduced) return;
      openSpring.set(rubberClamp(dragBase + (sign * dx) / travel, 0, 1, OVER));
    },
    onEnd: ({ moved, vx, e }) => {
      if (pressed) pressed.pressSpring.to(0);
      const hit = pressed;
      pressed = null;
      if (!moved) {
        if (hit) toggleCard(hit);
        else if (focused) setFocus(null);
        if (grabbed && !hit) resumeOpen();
        grabbed = false;
        return;
      }
      grabbed = false;
      if (reduced) return;
      const v = (sign * vx) / travel;
      const landing = open + (sign * project(vx)) / travel;
      settleOpen(nearest(landing, [0, 1]), v);
    },
    onCancel: () => {
      if (pressed) pressed.pressSpring.to(0);
      pressed = null;
      if (grabbed) resumeOpen();
      grabbed = false;
    },
  });

  function resumeOpen() {
    if (!reduced) openSpring.to(openSpring.target);
  }

  root.addEventListener('click', (e) => {
    // Pointer taps are handled by the gesture; detail 0 is the keyboard.
    if (e.detail !== 0) return;
    const s = cardAt(e);
    if (s) toggleCard(s);
  });

  /* ---------- intro clock: stagger and the moment the pile tilts open ---------- */
  const intro = { t: 0, next: 0, auto: true, ready: false, stop: null };

  function introTick(dt) {
    if (!intro.ready) return;
    intro.t += dt;
    while (intro.next < n && intro.t >= intro.next * STAGGER) {
      const card = cards[intro.next];
      fromTick(() => card.dSpring.to(1));
      intro.next++;
    }
    const landedAll = intro.next >= n && intro.t >= (n - 1) * STAGGER + 0.36;
    if (landedAll) {
      if (intro.auto && !openSpring.active && open === 0) fromTick(() => openSpring.to(1, { damping: 1, response: 0.56 }));
      intro.stop?.();
      intro.stop = null;
      intro.auto = false;
    }
  }

  function finishNow() {
    for (const s of cards) { s.landed = true; s.dSpring.set(1); }
    intro.next = n;
    intro.auto = false;
    intro.stop?.();
    intro.stop = null;
  }

  const allSprings = () => [openSpring, thudSpring, ...cards.flatMap((c) => [c.dSpring, c.pressSpring, c.liftSpring])];

  // Cards stay off the table until they can actually be seen landing.
  const decoded = Promise.all(cards.map((s) => s.img.decode().then(() => {
    if (!destroyed && isCutout(s.img)) s.el.classList.add('is-cutout');
  }).catch(() => null)));

  if (reduced) {
    finishNow();
    openSpring.set(1);
  } else {
    decoded.then(() => {
      if (destroyed) return;
      intro.ready = true;
      if (playing && !intro.stop && intro.next < n) intro.stop = onTick(introTick);
    });
  }

  document.fonts?.ready?.then(() => { if (!destroyed) measure(); });

  return {
    play() {
      if (destroyed) return;
      playing = true;
      if (!reduced && intro.ready && (intro.next < n || intro.auto) && !intro.stop) intro.stop = onTick(introTick);
      for (const s of allSprings()) if (s.value !== s.target) s.to(s.target);
    },
    pause() {
      playing = false;
      intro.stop?.();
      intro.stop = null;
      for (const s of allSprings()) s.stop();
    },
    seek(t) {
      if (t >= n * STAGGER) finishNow();
      openSpring.set(clamp((t - n * STAGGER) / 0.5));
    },
    onWheel(dy, dx = 0) {
      if (reduced || Math.abs(dx) <= Math.abs(dy)) return false;
      const next = clamp(open + dx / (((n - 1) / 2) * step));
      if (next === open) return false;
      intro.auto = false;
      setFocus(null);
      openSpring.set(next);
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      intro.stop?.();
      for (const s of allSprings()) s.stop();
      disposeDrag();
      ro.disconnect();
      root.remove();
    },
  };
}

/** The deck, fanned, in real images. */
export function thumb(box, { concept }) {
  const wrap = document.createElement('div');
  wrap.className = 'st-thumb';
  const shown = concept.works.slice(0, 5);
  shown.forEach((w, i) => {
    const c = i - (shown.length - 1) / 2;
    const img = new Image();
    img.alt = '';
    img.src = w.src;
    img.style.transform = `translate(calc(-50% + ${c * 38}%), -50%) skewY(${SKEW}deg)`;
    img.style.zIndex = String(i);
    wrap.append(img);
  });
  box.append(wrap);
}
