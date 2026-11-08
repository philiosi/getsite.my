/* One work, large. The rest of the layout fades and blurs behind it.
   The photo grows out of its own box and returns to the box of whichever work is showing
   when it closes, on the same path. Left and right follow the finger 1:1 and keep its speed.

   The viewer never touches [data-work] transforms (the engine owns those); it draws its own
   copy of the image above the layout and hides the original while open. */

import { Spring, clamp, lerp, prefersReducedMotion } from '../core/spring.js';
import { drag, project, rubberClamp, unrubberClamp } from '../core/gesture.js';

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

export function createViewer(root, { getWorks, onChange } = {}) {
  let layer = null;
  let works = [];
  let slides = [];
  let index = 0;
  let origin = null; // the [data-work] element hidden while open
  let from = null; // its rect when the viewer grew from it
  let closing = false;
  let disposeDrag = null;
  let dragMode = null;
  let base = 0;
  let returnFocus = null;
  let opened = 0; // the index it grew from; only that work returns to `from`
  let inerted = [];
  let ro = null;
  let wheelLockUntil = 0;
  let wheelDy = 0;
  let wheelQuietAt = 0;
  let homeRect = null; // where the work now showing flies back to on close, or null to fade in place

  // p: 0 = in the layout box, 1 = full view. x: position along the works, in work units.
  const p = new Spring({ value: 0, damping: 1, response: 0.42, precision: 0.001, onChange: () => paint(), onRest: (v) => { if (v === 0 && closing) teardown(); } });
  const x = new Spring({ value: 0, damping: 1, response: 0.36, precision: 0.0005, onChange: () => paint() });
  const pull = new Spring({ value: 0, damping: 1, response: 0.3, precision: 0.1, onChange: () => paint() });

  const reduced = () => prefersReducedMotion();
  const box = () => root.getBoundingClientRect();
  // Spacing between works: neighbours peek in at the edges on wide stages; on narrow ones a
  // contained work is nearly full width, so neighbours sit just off screen instead of on top.
  const unit = () => { const w = box().width; return Math.max(1, w < 640 ? w + 16 : w * 0.8); };
  const workEl = (id) => root.querySelector(`[data-work="${CSS.escape(id)}"]`);

  /* Where a work sits when fully open: contained, centred, above the caption. */
  function target(work) {
    const R = box();
    const narrow = R.width < 640;
    const padX = narrow ? 16 : 72;
    const top = narrow ? 16 : 28;
    const bottom = narrow ? 84 : 72;
    const W = R.width - padX * 2;
    const H = R.height - top - bottom;
    const ratio = work.ratio || 1;
    const w = Math.max(1, Math.min(W, H * ratio));
    const hh = w / ratio;
    return { x: (R.width - w) / 2, y: top + (H - hh) / 2, w, h: hh };
  }

  function rectOf(el) {
    const R = box();
    const r = el?.getBoundingClientRect();
    if (!r || r.width < 1) return null;
    // A box scrolled out of the stage is no place to fly home to.
    if (r.right < R.left || r.left > R.right || r.bottom < R.top || r.top > R.bottom) return null;
    return { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height };
  }

  function build() {
    layer = h('div', 'g-view');
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-label', '작품 크게 보기');
    layer.tabIndex = -1;
    layer.dataset.nodrag = '';
    const scrim = h('div', 'g-view-scrim');
    const track = h('div', 'g-view-track');
    slides = works.map((w) => {
      const img = h('img', 'g-view-img');
      img.src = w.src;
      img.alt = w.alt || w.title || '';
      img.draggable = false;
      track.append(img);
      return img;
    });
    const cap = h('p', 'g-view-cap');
    cap.id = `g-view-cap-${Math.random().toString(36).slice(2, 8)}`;
    cap.setAttribute('aria-live', 'polite');
    layer.setAttribute('aria-describedby', cap.id);
    const prev = h('button', 'g-view-arrow is-prev', '←');
    const next = h('button', 'g-view-arrow is-next', '→');
    const close = h('button', 'g-view-close', '닫기');
    prev.type = next.type = close.type = 'button';
    prev.setAttribute('aria-label', '이전 작품');
    next.setAttribute('aria-label', '다음 작품');
    prev.addEventListener('click', () => go(index - 1));
    next.addEventListener('click', () => go(index + 1));
    close.addEventListener('click', () => api.close());
    layer.append(scrim, track, cap, prev, next, close);
    root.append(layer);

    // The stage and the layout's own drags must stand aside, but the viewer's drag must not:
    // lift the mark only while this layer's own drag sees the press (as dragNoStage does).
    const lift = () => layer?.removeAttribute('data-nodrag');
    const mark = () => layer?.setAttribute('data-nodrag', '');
    layer.addEventListener('pointerdown', lift, true);
    const disposeOwn = drag(layer, {
      axis: 'both',
      threshold: 6,
      onStart: ({ lead }) => {
        dragMode = Math.abs(lead.dx) >= Math.abs(lead.dy) ? 'page' : 'dismiss';
        x.stop();
        pull.stop();
        base = unrubberClamp(x.value, 0, works.length - 1, 1.2);
      },
      onMove: ({ dx, dy }) => {
        if (closing) return;
        if (dragMode === 'page') x.set(rubberClamp(base - dx / unit(), 0, works.length - 1, 1.2));
        else pull.set(Math.max(0, dy) + Math.min(0, dy) * 0.2);
      },
      onEnd: ({ moved, vx, vy, e }) => {
        if (closing) return;
        if (!moved) {
          // A tap on the photo or a button does its own thing; a tap beside the photo closes.
          if (!e.target.closest('.g-view-img, button')) api.close();
          return;
        }
        // Each mode also settles the other spring, which onStart stopped wherever it was.
        if (dragMode === 'page') {
          const landing = x.value - project(vx) / unit();
          go(Math.round(clamp(landing, index - 1, index + 1)), -vx / unit());
          if (reduced()) pull.set(0); else pull.to(0);
        } else if (pull.value + project(vy) > box().height * 0.22) {
          api.close(vy);
        } else {
          if (reduced()) { pull.set(0); x.set(index); }
          else { pull.to(0, { velocity: vy }); x.to(index); }
        }
      },
    });
    layer.addEventListener('pointerdown', mark);
    disposeDrag = disposeOwn;
  }

  function hideOrigin() {
    origin = workEl(works[index].id);
    if (origin) { origin.style.visibility = 'hidden'; origin.dataset.viewing = ''; }
  }
  function showOrigin() {
    if (origin) { origin.style.visibility = ''; delete origin.dataset.viewing; }
    origin = null;
  }

  function go(i, velocity) {
    if (closing) return;
    const to = clamp(i, 0, works.length - 1);
    if (to !== index) {
      showOrigin();
      index = to;
      hideOrigin();
      onChange?.(works[index].id);
    }
    if (reduced()) x.set(index);
    else x.to(index, velocity === undefined ? {} : { velocity });
    paintChrome();
  }

  function paintChrome() {
    if (!layer) return;
    const w = works[index];
    const cap = layer.querySelector('.g-view-cap');
    cap.textContent = '';
    cap.append(
      h('span', 'g-view-no', `${String(index + 1).padStart(2, '0')} / ${String(works.length).padStart(2, '0')}`),
      h('strong', 'g-view-title', w.title),
      h('span', 'g-view-meta', [w.year, w.cat].filter(Boolean).join(' · ')),
    );
    const prev = layer.querySelector('.is-prev');
    const next = layer.querySelector('.is-next');
    const closeBtn = layer.querySelector('.g-view-close');
    // A button that goes dead under the focus would drop focus to the page; hand it on first.
    const atStart = index <= 0;
    const atEnd = index >= works.length - 1;
    if ((atStart && document.activeElement === prev) || (atEnd && document.activeElement === next)) {
      const other = document.activeElement === prev ? next : prev;
      (other.disabled || (other === prev ? atStart : atEnd) ? closeBtn : other).focus({ preventScroll: true });
    }
    prev.disabled = atStart;
    next.disabled = atEnd;
    slides.forEach((img, i) => img.setAttribute('aria-hidden', String(i !== index)));
  }

  function paint() {
    if (!layer) return;
    const pv = p.value;
    const R = box();
    const drop = clamp(pull.value / Math.max(1, R.height * 0.5));
    root.style.setProperty('--view-p', String(clamp(pv * (1 - drop * 0.6))));
    // Opening grows from the box it was tapped in; closing returns to the box of the work now shown.
    const home = closing ? homeRect : (index === opened ? from : null);
    const s = 1 - drop * 0.25;
    const step = unit();
    slides.forEach((img, i) => {
      if (Math.abs(i - x.value) > 1.6) { img.style.visibility = 'hidden'; return; }
      img.style.visibility = '';
      const t = target(works[i]);
      let rx = t.x + (i - x.value) * step;
      let ry = t.y + pull.value;
      let rw = t.w;
      let rh = t.h;
      if (i === index && home && pv < 1) {
        rx = lerp(home.x, rx, pv);
        ry = lerp(home.y, ry, pv);
        rw = lerp(home.w, rw, pv);
        rh = lerp(home.h, rh, pv);
      }
      img.style.width = `${t.w}px`;
      img.style.height = `${t.h}px`;
      img.style.transform = `translate3d(${rx + (rw * (1 - s)) / 2}px,${ry + (rh * (1 - s)) / 2}px,0) scale(${(rw / t.w) * s},${(rh / t.h) * s})`;
      // With no box to return to, the current work fades where it is instead of flying off.
      img.style.opacity = i === index ? (home || !closing ? '1' : String(clamp(pv))) : String(clamp(pv * 2 - 1));
    });
    layer.style.setProperty('--chrome', String(clamp(pv * 2 - 1) * (1 - drop)));
  }

  function onKey(e) {
    if (!layer || closing) return;
    // Only while the viewer has the focus (or nothing does): keys typed elsewhere on the page are theirs.
    const a = document.activeElement;
    if (!(layer.contains(a) || a === document.body || a == null)) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowUp' || k === 'ArrowDown') {
      // Consumed here so the gallery's own arrow handler doesn't page (or close) a second time.
      e.preventDefault();
      e.stopPropagation();
      if (k === 'ArrowRight') go(index + 1);
      else if (k === 'ArrowLeft') go(index - 1);
    } else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); }
    else if (k === 'Tab') {
      // Keep Tab inside the dialog: the page behind is inert or, in an embed, still live.
      const stops = [...layer.querySelectorAll('button:not(:disabled)')];
      if (!stops.length) return;
      const i = stops.indexOf(a);
      e.preventDefault();
      stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
    }
  }

  /* The box to fly home to on close. Paged away from the work it opened on, the new work's box
     may be scrolled off or sit under other works (a stack, a coverflow); then it fades in place. */
  function homeFor(i) {
    const el = workEl(works[i].id);
    const r = rectOf(el);
    if (!r) return i === opened ? from : null;
    if (i === opened) return r;
    const R = box();
    const cover = [...root.querySelectorAll('[data-work]')].some((o) => {
      if (o === el || o.closest('.g-view')) return false;
      const q = o.getBoundingClientRect();
      const w = Math.min(q.right, R.left + r.x + r.w) - Math.max(q.left, R.left + r.x);
      const hh = Math.min(q.bottom, R.top + r.y + r.h) - Math.max(q.top, R.top + r.y);
      return w > 0 && hh > 0 && (w * hh) / (r.w * r.h) > 0.3;
    });
    return cover ? null : r;
  }

  function setInert(on) {
    if (on) {
      inerted = [...root.children].filter((el) => el !== layer && !el.inert);
      inerted.forEach((el) => { el.inert = true; });
    } else {
      inerted.forEach((el) => { el.inert = false; });
      inerted = [];
    }
  }

  function teardown() {
    disposeDrag?.();
    disposeDrag = null;
    ro?.disconnect();
    ro = null;
    setInert(false);
    layer?.remove();
    layer = null;
    slides = [];
    showOrigin();
    root.classList.remove('is-viewing');
    root.style.removeProperty('--view-p');
    closing = false;
    from = null;
    homeRect = null;
    wheelLockUntil = 0;
    wheelDy = 0;
    document.removeEventListener('keydown', onKey, true);
    // Focus goes back to the work now showing if it can take focus, else to where it came from.
    const shown = works[index] && workEl(works[index].id);
    const own = shown && (shown.closest('[tabindex="0"]') || shown.querySelector('[tabindex="0"]'));
    const back = own && root.contains(own) ? own : returnFocus;
    // Opened by a keyboard press on a work (returnFocus is that work), not by a pointer on nothing focusable.
    const cameByFocus = returnFocus != null && returnFocus !== document.body;
    returnFocus = null;
    if (cameByFocus && back?.isConnected) back.focus({ preventScroll: true });
  }

  const api = {
    get open() { return !!layer && !closing; },
    get workId() { return layer ? works[index]?.id : null; },
    /** Opens on the work with this id, growing out of its box. */
    show(id) {
      if (layer) {
        const at = works.findIndex((w) => w.id === id);
        if (at < 0) return;
        if (closing) {
          // Asked again while it was going home: turn around from where it is.
          closing = false;
          from = rectOf(workEl(works[index].id)) || from;
          opened = index;
          p.to(1);
        }
        go(at);
        return;
      }
      works = getWorks();
      const i = works.findIndex((w) => w.id === id);
      if (i < 0) return;
      index = i;
      opened = i;
      from = rectOf(workEl(id));
      returnFocus = document.activeElement;
      build();
      hideOrigin();
      root.classList.add('is-viewing');
      setInert(true);
      // A resize or rotation while open re-lays the photos for the new stage.
      ro = new ResizeObserver(() => paint());
      ro.observe(root);
      x.set(index);
      pull.set(0);
      paintChrome();
      document.addEventListener('keydown', onKey, true);
      if (reduced() || !from) {
        p.set(1);
        layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      } else {
        p.set(0);
        p.to(1);
      }
      layer.querySelector('.g-view-close').focus({ preventScroll: true });
      // A live region doesn't read what it held before focus arrived; say it once more.
      requestAnimationFrame(() => { if (layer && !closing) paintChrome(); });
      onChange?.(id);
    },
    close(velocity = 0) {
      if (!layer || closing) return;
      closing = true;
      homeRect = homeFor(index);
      // Next task, not now: the click that follows this pointerup must still land on the viewer.
      if (reduced()) { setTimeout(() => { if (closing) teardown(); }, 0); return; }
      x.to(index);
      pull.to(0);
      p.to(0, { velocity: -Math.abs(velocity) / Math.max(1, box().height) });
    },
    /** Wheel while open: sideways pages, a firm vertical push closes. Consumed while open. */
    wheel(dyWheel, dxWheel) {
      if (!layer) return false;
      if (closing) return true;
      const now = performance.now();
      // A trackpad flick keeps sending inertia for a second: one flick, one work.
      if (now < wheelLockUntil) { wheelLockUntil = now + 160; return true; }
      if (Math.abs(dxWheel) > Math.abs(dyWheel)) {
        wheelDy = 0;
        if (Math.abs(dxWheel) > 12) { go(index + Math.sign(dxWheel)); wheelLockUntil = now + 420; }
      } else {
        // Closing takes a deliberate push, not one stray tick of a diagonal swipe.
        if (now - wheelQuietAt > 220) wheelDy = 0;
        wheelQuietAt = now;
        wheelDy += dyWheel;
        if (Math.abs(wheelDy) > 90) { wheelDy = 0; api.close(); }
      }
      return true;
    },
    /** Immediately, for a layout or concept change. */
    dismiss() {
      if (!layer) return;
      p.stop(); x.stop(); pull.stop();
      teardown();
    },
    /** The gallery left the screen (another page, scrolled away): put the work back at once, so
        nothing stays open out of sight holding the keyboard. */
    pause() { api.dismiss(); },
    destroy() { api.dismiss(); },
  };
  return api;
}
