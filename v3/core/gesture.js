/* Pointer gestures: 1:1 tracking, velocity history, momentum projection,
   rubber-banded edges. Feedback starts on pointer-down. */

/** Apple's projection: where a flick would come to rest, as an offset in px. */
export function project(velocity, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Inverse of rubberClamp: the unresisted value that produced a resisted one.
    Grabbing something mid-bounce starts from here, so it is not compressed twice. */
export function unrubberClamp(value, min, max, dimension, constant = 0.55) {
  const undo = (r) => (r * dimension) / (constant * (dimension - Math.min(Math.abs(r), dimension * 0.98)));
  if (value < min) return min + undo(value - min);
  if (value > max) return max + undo(value - max);
  return value;
}

/** Clamp to [min, max], resisting softly beyond the edges. */
export function rubberClamp(value, min, max, dimension) {
  if (value < min) return min + rubberband(value - min, dimension);
  if (value > max) return max + rubberband(value - max, dimension);
  return value;
}

export function nearest(value, points) {
  let best = points[0];
  for (const p of points) if (Math.abs(p - value) < Math.abs(best - value)) best = p;
  return best;
}

/** Velocity in px/s from recent samples (last 100ms). */
export function velocityFrom(history, now) {
  const recent = history.filter((s) => now - s.t <= 100);
  if (recent.length < 2) return { vx: 0, vy: 0 };
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = (b.t - a.t) / 1000;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt };
}

/**
 * drag(el, handlers)
 * axis: 'x' | 'y' | 'both'. On a single axis, movement along the other axis first
 * releases the gesture so the browser or a parent can have it.
 * onPress(e)  pointer-down, immediately
 * onStart(s)  threshold crossed; s.lead = travel before the threshold
 * onMove(s)   { dx, dy, x, y, e }
 * onEnd(s)    { dx, dy, vx, vy, moved, e } moved=false means a tap
 * onCancel()  gesture released to something else
 */
export function drag(el, { axis = 'both', threshold = 8, onPress, onStart, onMove, onEnd, onCancel } = {}) {
  let active = null;

  const down = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest?.('[data-nodrag]')) return;
    active = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, history: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
    onPress?.(e);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  const info = (e) => ({ dx: e.clientX - active.x0, dy: e.clientY - active.y0, x: e.clientX, y: e.clientY, e });

  const release = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    active = null;
  };

  const move = (e) => {
    if (!active || e.pointerId !== active.id) return;
    const s = info(e);
    active.history.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (active.history.length > 8) active.history.shift();
    if (!active.moved) {
      const ax = Math.abs(s.dx);
      const ay = Math.abs(s.dy);
      if (Math.max(ax, ay) < threshold) return;
      if ((axis === 'x' && ay > ax) || (axis === 'y' && ax > ay)) {
        onCancel?.();
        release();
        return;
      }
      active.moved = true;
      // Travel before the threshold, for handlers that need the opening direction.
      const lead = { dx: s.dx, dy: s.dy };
      // Follow from where the finger is now, so crossing the threshold does not jump.
      active.x0 = axis === 'y' ? active.x0 : e.clientX;
      active.y0 = axis === 'x' ? active.y0 : e.clientY;
      try { el.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
      onStart?.({ ...info(e), lead });
    }
    e.preventDefault?.();
    onMove?.(info(e));
  };

  const up = (e) => {
    if (!active || e.pointerId !== active.id) return;
    const { vx, vy } = velocityFrom(active.history, e.timeStamp);
    const moved = active.moved;
    const s = info(e);
    release();
    onEnd?.({ ...s, vx, vy, moved });
  };

  const cancel = (e) => {
    if (!active || e.pointerId !== active.id) return;
    const moved = active.moved;
    const s = info(e);
    release();
    if (moved) onEnd?.({ ...s, vx: 0, vy: 0, moved: true });
    else onCancel?.();
  };

  el.addEventListener('pointerdown', down);
  return () => {
    el.removeEventListener('pointerdown', down);
    release();
  };
}
