/* Closed-form springs on one shared ticker.
   Apple's parameters: damping ratio + response (seconds).
   Retargeting keeps the current value and velocity, so every animation
   can be interrupted from what is on screen. */

export function stepSpring(x, v, target, damping, response, dt) {
  const w = (2 * Math.PI) / response;
  const d = x - target;
  if (damping >= 1) {
    const b = v + w * d;
    const e = Math.exp(-w * dt);
    const c = d + b * dt;
    return [target + c * e, (b - w * c) * e];
  }
  const wd = w * Math.sqrt(1 - damping * damping);
  const e = Math.exp(-damping * w * dt);
  const cos = Math.cos(wd * dt);
  const sin = Math.sin(wd * dt);
  return [
    target + e * (d * cos + ((v + damping * w * d) / wd) * sin),
    e * (v * cos - ((w * w * d + damping * w * v) / wd) * sin),
  ];
}

const callbacks = new Set();
let frame = 0;
let ticking = false;
let last = 0;
const hasRaf = typeof requestAnimationFrame === 'function';

function loop(now) {
  frame = 0;
  ticking = true;
  const dt = Math.min((now - last) / 1000 || 1 / 60, 1 / 20);
  last = now;
  // One broken callback must not freeze every other animation on the page.
  for (const fn of [...callbacks]) {
    try {
      fn(dt, now);
    } catch (error) {
      console.error('[tick]', error);
    }
  }
  ticking = false;
  if (callbacks.size) frame = requestAnimationFrame(loop);
}

/** Runs fn(dt, now) every frame until the returned function is called. */
export function onTick(fn) {
  callbacks.add(fn);
  if (hasRaf && !frame && !ticking) {
    last = performance.now();
    frame = requestAnimationFrame(loop);
  }
  return () => callbacks.delete(fn);
}

export class Spring {
  constructor({ value = 0, damping = 1, response = 0.35, precision = 0.01, onChange, onRest } = {}) {
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.damping = damping;
    this.response = response;
    this.precision = precision;
    this.onChange = onChange;
    this.onRest = onRest;
    this._stop = null;
    this._tick = (dt) => this.advance(dt);
  }

  get active() {
    return !!this._stop;
  }

  /** Move toward target from the current value. Pass velocity to hand off a gesture. */
  to(target, opts = {}) {
    this.target = target;
    if (opts.velocity !== undefined) this.velocity = opts.velocity;
    if (opts.damping !== undefined) this.damping = opts.damping;
    if (opts.response !== undefined) this.response = opts.response;
    if (!this._stop) this._stop = onTick(this._tick);
    return this;
  }

  /** Follow a finger: set the value directly and stop animating. */
  set(value, velocity = 0) {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = velocity;
    this.onChange?.(value);
    return this;
  }

  stop() {
    this._stop?.();
    this._stop = null;
    return this;
  }

  advance(dt) {
    const [x, v] = stepSpring(this.value, this.velocity, this.target, this.damping, this.response, dt);
    this.value = x;
    this.velocity = v;
    const done = Math.abs(x - this.target) < this.precision && Math.abs(v) < this.precision * 10;
    if (done) {
      this.value = this.target;
      this.velocity = 0;
      this.stop();
    }
    this.onChange?.(this.value);
    if (done) this.onRest?.(this.value);
  }
}

export const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const lerp = (a, b, t) => a + (b - a) * t;
