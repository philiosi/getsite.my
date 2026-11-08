/* A 20s film, all of it a pure function of one clock value t.
   Scene 0 follows hansakim.com's opening: the name thickens, its ink drains so each
   letter is a window cut in the ground, then the ground comes past the camera. */
import { onTick, stepSpring, Spring, clamp, smooth } from '../core/spring.js';
import { drag } from '../core/gesture.js';

const DUR = 20;
const STARTS = [0, 5.6, 10.2, 14.8];
const CUT = 0.72;
const CLOSE = 19.28;
const FINAL = 18.6;
const RISE = [0, 1.0];
const BOLD = [0.7, 2.3];
const DRAIN = [1.9, 2.9];
const LIFT = [3.5, 5.0];
const STAGGER = 0.09;
const LIFT_GROW = 0.03;
const WHEEL_PX_PER_S = 70;
const END_ZONE = 0.12;
const DRAG_WIDTHS_S = 6; // one host width of drag is this many seconds
const MAX_RATE = 8;
const WORD_GAP = 0.14;
const SVG = 'http://www.w3.org/2000/svg';

let uid = 0;

const hard = (x) => {
  const t = clamp(x);
  return t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
};
const outQuart = (x) => 1 - (1 - clamp(x)) ** 4;
const span = (range, t, shift = 0) => clamp((t - range[0] - shift) / (range[1] - range[0]));
const mod = (x, n) => ((x % n) + n) % n;
const fmt = (s) => `00:${String(Math.floor(s)).padStart(2, '0')}`;

const svg = (name, attrs = {}) => {
  const n = document.createElementNS(SVG, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};
const html = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** Writes only on change, so a resting frame touches nothing. */
function writer() {
  const seen = new Map();
  const put = (el, key, val, apply) => {
    let c = seen.get(el);
    if (!c) seen.set(el, (c = {}));
    if (c[key] === val) return;
    c[key] = val;
    apply();
  };
  return {
    style: (el, prop, val) => put(el, prop, val, () => { el.style[prop] = val; }),
    attr: (el, name, val) => put(el, `@${name}`, val, () => { el.setAttribute(name, val); }),
    text: (el, val) => put(el, '#text', val, () => { el.textContent = val; }),
  };
}

const platesOf = (concept) => {
  const list = concept.plates?.length ? concept.plates : concept.works.map((w) => w.src);
  return [0, 1, 2, 3].map((i) => list[i % list.length]);
};

const fontOf = (concept, size = 100) => `${concept.tokens.weightDisplay} ${size}px ${concept.tokens.fontDisplay}`;
const trackOf = (concept) => parseFloat(concept.tokens.trackDisplay) || 0;

const ICON = {
  play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor"/></svg>',
  skip: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5v11l8-5.5zM11 2.5h2.5v11H11z" fill="currentColor"/></svg>',
};

/** Picks the line breaks that let the title sit largest in the box. */
function fitTitle(words, measure, track, boxW, boxH) {
  const n = words.length;
  let best = null;
  for (let mask = 0; mask < 2 ** (n - 1); mask++) {
    const lines = [[words[0]]];
    for (let i = 1; i < n; i++) {
      if (mask & (1 << (i - 1))) lines.push([words[i]]);
      else lines[lines.length - 1].push(words[i]);
    }
    if (lines.length > 3 || (n > 1 && lines.some((l) => l.join(' ').length < 2))) continue;
    const widest = Math.max(...lines.map((l) => measure(l.join(' ')) + (track * l.join(' ').length) + WORD_GAP * (l.length - 1)));
    const size = Math.min(boxW / widest, boxH / (lines.length * 1.14));
    if (!best || size > best.size * 1.02) best = { size, lines: lines.map((l) => l.join(' ')) };
  }
  return best;
}

export function mount(el, { concept, reduced }) {
  const put = writer();
  const plates = platesOf(concept);
  const { word, lines } = concept.film;
  const glyphs = Array.from(word);
  const track = 0.015;
  // Serif hairlines need more growth than a grotesque before they carry an image.
  const light = concept.tokens.weightDisplay < 500;
  const thick = light ? 0.048 : 0.03;
  const thin = light ? 0 : 0.028;

  const root = html('div', 'film');
  el.append(root);

  /* plates */
  const scenes = plates.map((src, i) => {
    const node = html('div', `film-plate film-plate-${i}`);
    const img = new Image();
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    node.append(img);
    let title = null;
    if (i > 0) {
      node.append(html('div', 'film-dim'));
      title = html('div', 'film-copy');
      const h = html('h2', 'film-title');
      const body = html('p', 'film-body', lines[i - 1].body);
      title.append(h, body);
      node.append(title);
      return { node, img, title, h, body, rows: [], line: lines[i - 1] };
    }
    return { node, img };
  });
  root.append(...scenes.map((s) => s.node));

  const sign = html('div', 'film-sign', word);
  root.append(sign);

  /* the ground: a night plane with the name cut out of it */
  const maskId = `film-mask-${++uid}`;
  const cover = svg('svg', { class: 'film-cover', role: 'img', 'aria-label': word });
  const mask = svg('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0 });
  const maskRect = svg('rect', { fill: 'white' });
  const holes = glyphs.map((g) => {
    const t = svg('text', { class: 'film-g', fill: 'black', stroke: 'black', 'stroke-linejoin': 'round' });
    t.textContent = g;
    return t;
  });
  // Portrait hosts stretch the name into a tall poster face instead of leaving a thin band.
  const holeGroup = svg('g');
  const inkGroup = svg('g');
  const defs = svg('defs');
  holeGroup.append(...holes);
  mask.append(maskRect, holeGroup);
  defs.append(mask);
  const ground = svg('rect', { class: 'film-ground', mask: `url(#${maskId})` });
  const inks = glyphs.map((g) => {
    const t = svg('text', { class: 'film-g film-ink', 'stroke-linejoin': 'round' });
    t.textContent = g;
    return t;
  });
  inkGroup.append(...inks);
  cover.append(defs, ground, inkGroup);
  root.append(cover);

  /* the wall that closes the loop: t=20 and t=0 are the same night frame */
  const close = html('div', 'film-close');
  root.append(close);

  /* controls */
  const bar = html('div', 'film-bar');
  bar.dataset.nodrag = '';
  const timecode = html('div', 'film-time');
  const now = html('span', '', '00:00');
  timecode.append(now, html('span', 'film-time-total', ` / ${fmt(DUR)}`));
  const playBtn = html('button', 'film-btn');
  playBtn.type = 'button';
  const skipBtn = html('button', 'film-btn');
  skipBtn.type = 'button';
  skipBtn.setAttribute('aria-label', '다음 장면');
  skipBtn.innerHTML = ICON.skip;
  const btns = html('div', 'film-btns');
  btns.append(playBtn, skipBtn);
  bar.append(timecode, btns);
  const rail = html('div', 'film-rail');
  const fill = html('div', 'film-rail-fill');
  rail.append(fill);
  STARTS.slice(1).forEach((s) => {
    const tick = html('i', 'film-rail-tick');
    tick.style.left = `${(s / DUR) * 100}%`;
    rail.append(tick);
  });
  if (!reduced) root.append(bar, rail);

  /* ---------- measure ---------- */
  const ctx = document.createElement('canvas').getContext('2d');
  let W = 0;
  let H = 0;
  let fs = 0;
  let origin = { x: 0, y: 0 };
  let liftScale = 8;

  function layoutName() {
    ctx.font = fontOf(concept);
    const m = glyphs.map((g) => ctx.measureText(g));
    const adv = m.map((x) => x.width / 100);
    const n = glyphs.length;
    const lead = m[0].actualBoundingBoxLeft / 100;
    const tail = (m[n - 1].actualBoundingBoxRight - m[n - 1].width) / 100;
    const inkW = adv.reduce((a, b) => a + b, 0) + track * (n - 1) + lead + tail + 2 * thick;
    const asc = Math.max(...m.map((x) => x.actualBoundingBoxAscent)) / 100;
    const desc = Math.max(...m.map((x) => x.actualBoundingBoxDescent)) / 100;
    const inkH = asc + desc + 2 * thick;
    const margin = W < 640 ? 0.96 : 0.94;
    fs = Math.min((W * margin) / inkW, (H * 0.8) / inkH);
    const left = (W - inkW * fs) / 2 + (lead + thick) * fs;
    const mid = H * 0.48;
    const base = mid + ((asc - desc) / 2) * fs;
    const stretch = W < 640 ? clamp((H * 0.5) / (inkH * fs), 1, 1.3) : 1;
    const squash = `translate(0 ${mid.toFixed(2)}) scale(1 ${stretch.toFixed(3)}) translate(0 ${(-mid).toFixed(2)})`;
    holeGroup.setAttribute('transform', squash);
    inkGroup.setAttribute('transform', squash);
    let x = left;
    glyphs.forEach((_, i) => {
      for (const node of [holes[i], inks[i]]) {
        node.setAttribute('x', x.toFixed(2));
        node.setAttribute('y', base.toFixed(2));
        node.style.fontSize = `${fs.toFixed(2)}px`;
      }
      x += (adv[i] + track) * fs;
    });
    findOrigin(base, left, adv, mid, stretch);
  }

  // The camera has to pass through solid window, so aim at the roomiest point of a letter.
  function findOrigin(base, left, adv, mid, stretch) {
    const k = 0.25;
    const w = Math.max(8, Math.ceil(W * k));
    const h = Math.max(8, Math.ceil(H * k));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.scale(k, k);
    g.translate(0, mid);
    g.scale(1, stretch);
    g.translate(0, -mid);
    g.font = fontOf(concept, fs);
    g.fillStyle = g.strokeStyle = 'black';
    g.lineJoin = 'round';
    g.lineWidth = 2 * thick * fs;
    let x = left;
    glyphs.forEach((ch, i) => {
      g.fillText(ch, x, base);
      g.strokeText(ch, x, base);
      x += (adv[i] + track) * fs;
    });
    const data = g.getImageData(0, 0, w, h).data;
    const dist = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) dist[i] = data[i * 4 + 3] > 128 ? 1e6 : 0;
    const step = (i, j) => { if (dist[j] + 1 < dist[i]) dist[i] = dist[j] + 1; };
    for (let y = 1; y < h - 1; y++) for (let a = 1; a < w - 1; a++) {
      const i = y * w + a;
      step(i, i - 1); step(i, i - w);
    }
    for (let y = h - 2; y > 0; y--) for (let a = w - 2; a > 0; a--) {
      const i = y * w + a;
      step(i, i + 1); step(i, i + w);
    }
    let best = -1e9;
    for (let y = 1; y < h - 1; y++) for (let a = 1; a < w - 1; a++) {
      const d = dist[y * w + a];
      if (!d || d >= 1e6) continue;
      const score = d - Math.hypot(a - w / 2, y - h / 2) * 0.03;
      if (score > best) {
        best = score;
        origin = { x: a / k, y: y / k, r: d / k };
      }
    }
    const far = Math.max(
      Math.hypot(origin.x, origin.y), Math.hypot(W - origin.x, origin.y),
      Math.hypot(origin.x, H - origin.y), Math.hypot(W - origin.x, H - origin.y),
    );
    liftScale = clamp(far / ((origin.r || 1) + LIFT_GROW * fs), 2, 60);
    cover.style.transformOrigin = `${origin.x.toFixed(1)}px ${origin.y.toFixed(1)}px`;
  }

  function layoutTitles() {
    ctx.font = fontOf(concept);
    const measure = (s) => ctx.measureText(s).width / 100;
    const pad = W < 640 ? 16 : 40;
    const boxW = W - pad * 2;
    const boxH = Math.max(120, H * (W < 640 ? 0.5 : 0.56));
    const tr = trackOf(concept);
    scenes.forEach((s) => {
      if (!s.h) return;
      const fit = fitTitle(s.line.title.split(' '), measure, tr, boxW, boxH);
      s.h.style.fontSize = `${Math.floor(Math.min(fit.size, H * 0.42))}px`;
      s.h.textContent = '';
      s.rows = fit.lines.map((text) => {
        const row = html('span', 'film-row');
        const inner = html('span', 'film-row-in', text);
        row.append(inner);
        s.h.append(row);
        return inner;
      });
    });
  }

  function measure() {
    if (destroyed) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    W = r.width;
    H = r.height;
    cover.setAttribute('viewBox', `0 0 ${W} ${H}`);
    cover.setAttribute('width', W);
    cover.setAttribute('height', H);
    for (const n of [mask, maskRect, ground]) {
      n.setAttribute('width', W);
      n.setAttribute('height', H);
    }
    layoutName();
    layoutTitles();
    rowCache = new Map();
    render();
  }

  /* ---------- render ---------- */
  let t = reduced ? FINAL : 0;
  let rowCache = new Map();
  const putRow = (node, val) => {
    if (rowCache.get(node) === val) return;
    rowCache.set(node, val);
    node.style.transform = val;
  };
  let lastSecond = -1;

  function renderName() {
    const coverOn = t < LIFT[1];
    put.style(cover, 'visibility', coverOn ? 'visible' : 'hidden');
    if (!coverOn) return;

    const lift = span(LIFT, t);
    const e = hard(lift);
    const windows = t >= DRAIN[0];
    glyphs.forEach((_, i) => {
      const rise = outQuart(span(RISE, t, i * STAGGER));
      const bold = smooth(0, 1, span(BOLD, t, i * STAGGER));
      const drain = smooth(0, 1, span(DRAIN, t, i * STAGGER));
      const y = (1 - rise) * fs * 0.22;
      const transform = y > 0.05 ? `translate(0 ${y.toFixed(2)})` : '';
      // A positive stroke fattens the letter; a ground-coloured one eats into it.
      const w = (-thin + (thin + thick) * bold) * fs;
      const ink = inks[i];
      put.attr(ink, 'transform', transform);
      put.attr(ink, 'opacity', (rise * (1 - drain)).toFixed(3));
      put.attr(ink, 'stroke', w < 0 ? 'var(--c-night)' : 'var(--c-onNight)');
      put.attr(ink, 'stroke-width', (Math.abs(w) * 2).toFixed(2));
      put.attr(ink, 'visibility', drain >= 1 ? 'hidden' : 'visible');
      const hole = holes[i];
      put.attr(hole, 'visibility', windows ? 'visible' : 'hidden');
      if (windows) {
        const grown = (thick + LIFT_GROW * e) * fs;
        put.attr(hole, 'stroke-width', (grown * 2).toFixed(2));
      }
    });
    put.style(cover, 'transform', lift > 0 ? `scale(${(liftScale ** e).toFixed(4)})` : 'none');
    put.style(cover, 'opacity', (1 - smooth(0.8, 1, lift)).toFixed(3));
  }

  function renderPlates() {
    scenes.forEach((s, i) => {
      const a = STARTS[i];
      const b = i < 3 ? STARTS[i + 1] + CUT : DUR;
      const on = i === 0 ? t >= DRAIN[0] && t < b : t >= a && t < b;
      put.style(s.node, 'visibility', on ? 'visible' : 'hidden');
      if (!on) return;

      const l = clamp((t - a) / (b - a));
      const dir = i % 2 ? 1 : -1;
      const incoming = i > 0 ? hard((t - a) / CUT) : 1;
      const next = i < 3 ? hard((t - STARTS[i + 1]) / CUT) : 0;
      // Outgoing plate is shoved off by the next one; incoming counter-slides inside its aperture.
      let dx = dir * (l - 0.5) * 2;
      let dy = 0;
      let clip = 'none';
      if (i === 1) {
        clip = `inset(${((1 - incoming) * 100).toFixed(2)}% 0 0 0)`;
        dy = (1 - incoming) * 16;
      } else if (i === 2) {
        clip = `inset(0 0 0 ${((1 - incoming) * 100).toFixed(2)}%)`;
        dx += (1 - incoming) * 16;
      } else if (i === 3) {
        const half = ((1 - incoming) * 50).toFixed(2);
        clip = `inset(${half}% 0 ${half}% 0)`;
      }
      if (i === 0) dy -= next * 7;
      if (i === 1) dx -= next * 7;
      const scale = (i === 3 ? 1.18 - 0.12 * incoming : 1.05) + 0.1 * l;
      put.style(s.node, 'clipPath', clip);
      put.style(s.img, 'transform', `translate3d(${dx.toFixed(3)}%,${dy.toFixed(3)}%,0) scale(${scale.toFixed(4)})`);

      if (!s.title) return;
      const from = a + CUT * 0.5;
      s.rows.forEach((row, r) => {
        const p = outQuart((t - from - r * 0.11) / 0.95);
        putRow(row, `translate3d(0,${((1 - p) * 112).toFixed(2)}%,0)`);
      });
      const q = outQuart((t - from - 0.42) / 0.8);
      put.style(s.body, 'opacity', q.toFixed(3));
      put.style(s.body, 'transform', `translate3d(0,${((1 - q) * 14).toFixed(2)}px,0)`);
      put.style(s.title, 'transform', `translate3d(${(-(l - 0.5) * 1.6).toFixed(3)}%,0,0)`);
    });

    const signOn = smooth(LIFT[1] - 0.2, LIFT[1] + 0.3, t);
    put.style(sign, 'opacity', signOn.toFixed(3));
    const c = hard((t - CLOSE) / (DUR - CLOSE));
    put.style(close, 'clipPath', `inset(${((1 - c) * 100).toFixed(2)}% 0 0 0)`);
    put.style(close, 'visibility', c > 0 ? 'visible' : 'hidden');
  }

  function render() {
    if (!W) return;
    renderName();
    renderPlates();
    if (!reduced) {
      put.style(fill, 'transform', `scaleX(${(t / DUR).toFixed(4)})`);
      const sec = Math.floor(t);
      if (sec !== lastSecond) {
        lastSecond = sec;
        now.textContent = fmt(sec);
      }
    }
  }

  /* ---------- clock ---------- */
  let destroyed = false;
  let hostPlaying = !reduced;
  let userPaused = false;
  let held = false;
  let wheelAt = -1;
  let reachedEndAt = -Infinity;
  let wheeling = false;
  let rate = 0;
  let rateV = 0;
  let stopClock = null;

  const wants = () => hostPlaying && !userPaused;

  // Skips and wheel notches travel through this spring so a jump is never a jump.
  const glide = new Spring({
    response: 0.55,
    precision: 0.002,
    onChange: (v) => { t = mod(v, DUR); render(); },
    // Deferred: core/spring.js onTick must not be entered from inside a tick.
    onRest: () => { wheeling = false; rate = 0; rateV = 0; queueMicrotask(startClock); },
  });

  function tick(dt, nowMs) {
    if (wheeling && nowMs - wheelAt > 70) {
      wheeling = false;
      // At either end of the film a wheel release stops there rather than wrapping past the seam.
      rate = t < END_ZONE || t > DUR - END_ZONE ? 0 : clamp(glide.velocity, -MAX_RATE, MAX_RATE);
      rateV = 0;
      glide.stop();
    }
    if (held || glide.active) return;
    const target = wants() ? 1 : 0;
    [rate, rateV] = stepSpring(rate, rateV, target, 1, 0.8, dt);
    t = mod(t + rate * dt, DUR);
    render();
    if (!target && Math.abs(rate) < 0.004) {
      rate = 0;
      rateV = 0;
      stopClock?.();
      stopClock = null;
    }
  }
  function startClock() {
    if (!stopClock && !destroyed && !reduced) stopClock = onTick(tick);
  }

  function syncPlay() {
    playBtn.innerHTML = wants() || !hostPlaying && !userPaused ? ICON.pause : ICON.play;
    playBtn.setAttribute('aria-label', userPaused ? '재생' : '일시정지');
    playBtn.setAttribute('aria-pressed', String(userPaused));
  }

  const glideTo = (target, response) => {
    if (!glide.active) {
      glide.value = t;
      glide.velocity = rate;
    }
    glide.to(target, { response });
    startClock();
  };

  const onPlayClick = () => {
    userPaused = !userPaused;
    syncPlay();
    startClock();
  };
  const onSkipClick = () => {
    const stops = STARTS.slice(1).map((s) => s + CUT + 0.9);
    const base = glide.active ? glide.target : t;
    const next = stops.find((s) => s > base + 0.05) ?? DUR;
    wheeling = false;
    glideTo(next, 0.55);
  };
  playBtn.addEventListener('click', onPlayClick);
  skipBtn.addEventListener('click', onSkipClick);

  let base = 0;
  const secPerPx = () => DRAG_WIDTHS_S / (W || 1);
  const stopDrag = reduced ? null : drag(el, {
    axis: 'x',
    onPress: () => {
      held = true;
      wheeling = false;
      glide.stop();
      rate = 0;
      rateV = 0;
      root.classList.add('is-held');
      startClock();
    },
    onStart: () => { base = t; },
    onMove: ({ dx }) => {
      t = mod(base - dx * secPerPx(), DUR);
      render();
    },
    onEnd: ({ vx, moved }) => {
      held = false;
      root.classList.remove('is-held');
      if (moved) rate = clamp(-vx * secPerPx(), -MAX_RATE, MAX_RATE);
      rateV = 0;
      startClock();
    },
    onCancel: () => {
      held = false;
      root.classList.remove('is-held');
      startClock();
    },
  });

  const ro = new ResizeObserver(measure);
  ro.observe(el);

  syncPlay();
  measure();
  if (document.fonts) {
    const again = () => { if (!destroyed) measure(); };
    document.fonts.load(fontOf(concept), `${word}${lines.map((l) => l.title).join('')}`).then(again, again);
    document.fonts.ready.then(again);
  }
  startClock();

  return {
    play() {
      hostPlaying = !reduced;
      syncPlay();
      startClock();
    },
    pause() {
      hostPlaying = false;
      syncPlay();
    },
    seek(next) {
      if (reduced) return;
      wheeling = false;
      glide.stop();
      rate = 0;
      rateV = 0;
      t = mod(next, DUR);
      render();
    },
    onWheel(dy, dx) {
      if (reduced) return false;
      const sideways = Math.abs(dx) > Math.abs(dy);
      const d = sideways ? dx : dy;
      if (!d) return false;
      const from = wheeling ? glide.target : t;
      const end = DUR - 0.02;
      const nowMs = performance.now();
      // Once the wheel has carried the film to its end, the next push goes to the page,
      // even if playback has looped back to the start in between.
      if (!sideways && d > 0 && nowMs - reachedEndAt < 1500) return false;
      if (!sideways && ((d > 0 && from >= DUR - END_ZONE) || (d < 0 && from <= END_ZONE))) return false;
      let to = from + d / WHEEL_PX_PER_S;
      if (!sideways) to = clamp(to, 0, end);
      if (!sideways && d > 0 && to >= DUR - END_ZONE) reachedEndAt = nowMs;
      wheeling = true;
      wheelAt = performance.now();
      glideTo(to, 0.2);
      return true;
    },
    destroy() {
      destroyed = true;
      stopClock?.();
      stopClock = null;
      glide.stop();
      stopDrag?.();
      ro.disconnect();
      playBtn.removeEventListener('click', onPlayClick);
      skipBtn.removeEventListener('click', onSkipClick);
      root.remove();
    },
  };
}

export function thumb(box, { concept }) {
  const units = Array.from(concept.film.word).reduce((sum, ch) => sum + (/[ㄱ-힝]/.test(ch) ? 1 : 0.68), 0);
  const stage = html('div', 'film-thumb');
  const word = html('div', 'film-thumb-word', concept.film.word);
  word.style.backgroundImage = `url("${platesOf(concept)[0]}")`;
  word.style.fontSize = `${(92 / units).toFixed(1)}cqw`;
  stage.append(word);
  box.append(stage);
}
