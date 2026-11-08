/* Gallery host. Each layout owns its real DOM, CSS and gestures.
   The engine only carries the works across a layout change: it measures where
   each [data-work] is on screen, mounts the new layout, and springs each one
   home from its old position.

   Ownership rule: the engine transforms [data-work] elements. Layouts must move
   a parent (".g-slot") or a child, never the [data-work] element itself. The two
   motions then add up, so a drag during a flight cannot make anything jump. */

import { Spring, prefersReducedMotion } from '../core/spring.js';
import { createViewer } from './viewer.js';

const FLY = { damping: 1, response: 0.5 };

export function createGallery(host, { layouts, concept, layoutId, onReady }) {
  const root = document.createElement('div');
  root.className = 'g-root';
  host.append(root);

  let controller = null;
  let currentId = null;
  let currentConcept = concept;
  let flights = new Map();
  let paused = false;
  // Tapping a work in any layout opens it large; the layout fades behind it.
  const viewer = createViewer(root, { getWorks: () => currentConcept.works });
  const view = (id) => viewer.show(id);

  const stopFlights = () => {
    for (const f of flights.values()) f.springs.forEach((s) => s.stop());
    flights = new Map();
  };

  function capture() {
    const rects = new Map();
    root.querySelectorAll('[data-work]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const flight = flights.get(el.dataset.work);
      rects.set(el.dataset.work, {
        x: r.left,
        y: r.top,
        w: r.width,
        h: r.height,
        vx: flight?.springs[0].velocity ?? 0,
        vy: flight?.springs[1].velocity ?? 0,
      });
    });
    return rects;
  }

  function fly(el, from) {
    const to = el.getBoundingClientRect();
    if (to.width < 1 || to.height < 1) return;
    const dx = from.x - to.left;
    const dy = from.y - to.top;
    const sx = from.w / to.width;
    const sy = from.h / to.height;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.005 && Math.abs(sy - 1) < 0.005) return;

    el.style.transformOrigin = '0 0';
    el.style.willChange = 'transform';
    const state = { dx, dy, sx, sy };
    const apply = () => {
      el.style.transform = `translate3d(${state.dx}px,${state.dy}px,0) scale(${state.sx},${state.sy})`;
    };
    const id = el.dataset.work;
    const finish = () => {
      const f = flights.get(id);
      if (!f || f.springs.some((s) => s.active)) return;
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.willChange = '';
      flights.delete(id);
    };
    const make = (key, value, velocity = 0, precision = 0.1) => {
      const s = new Spring({ value, ...FLY, precision, onChange: (v) => { state[key] = v; apply(); }, onRest: finish });
      s.velocity = velocity;
      return s;
    };
    const springs = [make('dx', dx, from.vx), make('dy', dy, from.vy), make('sx', sx, 0, 0.002), make('sy', sy, 0, 0.002)];
    flights.set(id, { springs });
    apply();
    springs[0].to(0);
    springs[1].to(0);
    springs[2].to(1);
    springs[3].to(1);
  }

  function arrive(el, i) {
    el.animate(
      [{ opacity: 0, transform: 'translate3d(0,14px,0)' }, { opacity: 1, transform: 'none' }],
      { duration: 320, delay: i * 24, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' },
    );
  }

  function mount(id) {
    root.textContent = '';
    root.dataset.layout = id;
    controller = layouts[id].mount(root, { concept: currentConcept, works: currentConcept.works, reduced: prefersReducedMotion(), view });
    currentId = id;
    if (paused) controller?.pause?.();
  }

  function setLayout(id, { animate = true } = {}) {
    if (id === currentId) return;
    viewer.dismiss();
    const reduced = prefersReducedMotion();
    const rects = animate && !reduced ? capture() : new Map();
    stopFlights();
    controller?.destroy?.();
    mount(id);
    if (reduced) {
      root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'linear' });
    } else if (animate) {
      let i = 0;
      root.querySelectorAll('[data-work]').forEach((el) => {
        const from = rects.get(el.dataset.work);
        if (from) fly(el, from);
        else arrive(el, i++);
      });
    }
    onReady?.(id);
  }

  /** Same layout, new photographs: a concept change. Positions stay, content crossfades. */
  function setConcept(next) {
    if (next === currentConcept) return;
    currentConcept = next;
    viewer.dismiss();
    const id = currentId;
    stopFlights();
    controller?.destroy?.();
    mount(id);
    root.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: prefersReducedMotion() ? 150 : 320, easing: 'ease-out' });
  }

  mount(layoutId);

  return {
    setLayout,
    setConcept,
    get layout() { return currentId; },
    get root() { return root; },
    pause() { paused = true; viewer.pause(); controller?.pause?.(); },
    resume() { paused = false; controller?.resume?.(); },
    /** Wheel from the stage. Return true if the layout used it. */
    onWheel(dy, dx) { return viewer.wheel(dy, dx) || (controller?.onWheel?.(dy, dx) ?? false); },
    /** Opens one work large, as a tap would. */
    view,
    get viewing() { return viewer.open; },
    closeView() { viewer.close(); },
    destroy() { viewer.destroy(); stopFlights(); controller?.destroy?.(); root.remove(); },
  };
}
