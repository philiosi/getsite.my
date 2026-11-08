/* Stage, capsule and tray. The page is the customer's site:
   every choice changes it in place. */

import * as catalog from './catalog.js';
import { Spring, prefersReducedMotion, clamp } from './core/spring.js';
import { drag, project, rubberClamp, unrubberClamp, nearest } from './core/gesture.js';
import { DEFAULTS, createStore, parseSelection, serializeSelection } from './core/state.js';
import { createGallery } from './gallery/engine.js';
import { layouts, galleryThumb } from './gallery/layouts.js';

const { CONCEPTS, SCENES, GALLERIES, REAL_SITES, byId } = catalog;
const $ = (id) => document.getElementById(id);

const SCENE_LOADERS = {
  film: () => import('./scenes/film.js'),
  anchor: () => import('./scenes/anchor.js'),
  glass: () => import('./scenes/glass.js'),
  stack: () => import('./scenes/stack.js'),
};

const app = $('app');
const stage = $('stage');
const track = $('track');
const tray = $('tray');
const capsule = $('capsule');
const VIEWS = ['scene', 'gallery', 'close'];

const initial = parseSelection(location.search, catalog);
const urlHadUnknown = (() => {
  const q = new URLSearchParams(location.search);
  return (q.has('c') && q.get('c') !== initial.concept)
    || (q.has('s') && q.get('s') !== initial.scene)
    || (q.has('g') && q.get('g') !== initial.gallery);
})();
const store = createStore(initial);

/* ---------- toast ---------- */
let toastTimer = 0;
function toast(message, retry) {
  const el = $('toast');
  el.textContent = message;
  if (retry) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = '다시 시도';
    b.addEventListener('click', () => { el.hidden = true; retry(); });
    el.append(b);
  }
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, retry ? 7000 : 3200);
}

/* ---------- concept tokens ---------- */
function applyTokens(concept) {
  for (const [k, v] of Object.entries(concept.tokens)) app.style.setProperty(`--c-${k}`, String(v));
  document.documentElement.style.setProperty('--c-night', concept.tokens.night);
}

function fillCopy(concept) {
  $('gallery-title').textContent = concept.galleryTitle;
  $('close-site').textContent = concept.site;
  $('close-tagline').textContent = concept.tagline;
  $('close-about').textContent = concept.about;
  $('close-contact').textContent = concept.contactLine;
  const img = $('close-img');
  img.src = concept.works[3].src;
  img.alt = concept.works[3].alt;
}

function decode(src) {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => { throw new Error('image'); });
}

/** Everything a concept needs is ready before it replaces what is on screen. */
async function prepareConcept(concept) {
  const family = concept.tokens.fontDisplay.split(',')[0].replace(/"/g, '');
  const fonts = document.fonts?.load(`${concept.tokens.weightDisplay} 40px "${family}"`, '가A').catch(() => null);
  await Promise.all([fonts, decode(concept.works[0].src), decode(concept.anchor.center), decode(concept.plates[0])]);
}

/* ---------- view: which page of the site is showing ---------- */
const pageTop = (view) => {
  const el = $(`page-${view}`);
  return -el.offsetTop;
};
let view = 'scene';
const trackY = new Spring({
  value: 0,
  damping: 1,
  response: 0.42,
  precision: 0.2,
  onChange: (y) => { track.style.transform = `translate3d(0,${y}px,0)`; },
});

function renderPager() {
  document.querySelectorAll('#pager [data-view]').forEach((b) => {
    if (b.dataset.view === view) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
}

function setView(next, { velocity } = {}) {
  const changed = view !== next;
  view = next;
  renderPager();
  const target = pageTop(next);
  if (prefersReducedMotion()) {
    trackY.set(target);
    track.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 180 });
  } else {
    trackY.to(target, velocity === undefined ? {} : { velocity });
  }
  if (changed) syncPlayback();
}

function syncPlayback() {
  if (view === 'scene') scene.api?.play?.();
  else scene.api?.pause?.();
  if (view === 'gallery') gallery.resume();
  else gallery.pause();
}

/* ---------- scene lifecycle: one mounted scene, destroyed on change ---------- */
const scene = { api: null, layer: null, controller: null, token: 0 };

function poster(host, concept) {
  const img = document.createElement('img');
  img.src = concept.works[0].src;
  img.alt = '';
  img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
  host.append(img);
}

async function mountScene(id, concept, { fade = true } = {}) {
  const token = ++scene.token;
  const host = $('scene-host');
  scene.controller?.abort();

  let mod;
  try {
    mod = await SCENE_LOADERS[id]();
  } catch {
    if (token !== scene.token) return false;
    toast('장면을 불러오지 못했습니다.', () => mountScene(id, concept));
    if (!scene.layer) {
      const layer = document.createElement('div');
      layer.className = 'scene-layer';
      poster(layer, concept);
      host.append(layer);
      scene.layer = layer;
    }
    return false;
  }
  if (token !== scene.token) return false;

  const previous = { layer: scene.layer, api: scene.api };
  const layer = document.createElement('div');
  layer.className = 'scene-layer';
  layer.dataset.scene = id;
  host.append(layer);

  const controller = new AbortController();
  let api = null;
  try {
    api = mod.mount(layer, { concept, reduced: prefersReducedMotion(), signal: controller.signal, catalog });
  } catch (error) {
    console.error('[scene]', id, error);
    controller.abort();
    layer.textContent = '';
    poster(layer, concept);
    toast('이 장면을 표시하지 못했습니다.', () => mountScene(id, concept));
  }

  scene.layer = layer;
  scene.api = api;
  scene.controller = controller;
  if (view !== 'scene') api?.pause?.();

  const remove = () => {
    try { previous.api?.destroy?.(); } catch (e) { console.error('[scene destroy]', e); }
    previous.layer?.remove();
  };
  if (previous.layer && fade) {
    const fadeIn = layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: prefersReducedMotion() ? 150 : 300, easing: 'ease-out' });
    fadeIn.finished.then(remove, remove);
  } else {
    remove();
  }
  return true;
}

/* ---------- gallery ---------- */
function setGalleryHint(id) {
  $('gallery-hint').textContent = byId(GALLERIES, id).hint;
}
const gallery = createGallery($('gallery-host'), {
  layouts,
  concept: byId(CONCEPTS, initial.concept),
  layoutId: initial.gallery,
  onReady: setGalleryHint,
});
setGalleryHint(initial.gallery);

/* ---------- capsule values ---------- */
function renderCapsule(state) {
  const set = (key, value) => { document.querySelector(`[data-value="${key}"]`).textContent = value; };
  set('concept', byId(CONCEPTS, state.concept).name);
  set('scene', byId(SCENES, state.scene).name);
  set('gallery', byId(GALLERIES, state.gallery).name);
}

/* ---------- tray: grows from its chip, one at a time ---------- */
let openTray = null;
let galleryExpanded = false;
const trayScale = new Spring({
  value: 0,
  damping: 1,
  response: 0.3,
  precision: 0.002,
  onChange: (v) => {
    tray.style.opacity = String(clamp(v * 1.6));
    tray.style.transform = `translate3d(-50%,${(1 - v) * 12}px,0) scale(${0.94 + 0.06 * v})`;
  },
  onRest: (v) => { if (v === 0) { tray.hidden = true; tray.textContent = ''; } },
});

function chipFor(name) {
  return capsule.querySelector(`[data-tray="${name}"]`);
}

function tile({ pressed, name, hint, art, onPick }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tile';
  b.setAttribute('aria-pressed', String(pressed));
  const box = document.createElement('span');
  box.className = 'tile-art';
  box.style.display = 'block';
  art(box);
  const n = document.createElement('span');
  n.className = 'tile-name';
  n.textContent = name;
  const h = document.createElement('span');
  h.className = 'tile-hint';
  h.textContent = hint;
  b.append(box, n, h);
  // Commit on press: the site answers the moment the finger lands.
  b.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.preventDefault(); onPick(); } });
  b.addEventListener('click', (e) => { if (e.detail === 0) onPick(); }); // keyboard
  return b;
}

function imgArt(src) {
  return (box) => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    box.append(img);
  };
}

function markPressed(root, index) {
  root.querySelectorAll('.tile').forEach((t, i) => t.setAttribute('aria-pressed', String(i === index)));
}

function buildConceptTray() {
  const rail = document.createElement('div');
  rail.className = 'rail';
  CONCEPTS.forEach((c, i) => {
    rail.append(tile({
      pressed: store.get().concept === c.id,
      name: c.name,
      hint: c.hint,
      art: imgArt(c.works[c.id === 'brand' ? 1 : c.id === 'studio' ? 1 : 3].src),
      onPick: () => { markPressed(rail, i); pick({ concept: c.id }); },
    }));
  });
  const foot = document.createElement('p');
  foot.className = 'tray-foot';
  foot.append('실제로 만든 사이트');
  for (const site of Object.values(REAL_SITES)) {
    const a = document.createElement('a');
    a.href = site.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `${site.name} ↗`;
    foot.append(a);
  }
  tray.append(rail, foot);
}

async function buildSceneTray() {
  const rail = document.createElement('div');
  rail.className = 'rail';
  const concept = byId(CONCEPTS, store.get().concept);
  SCENES.forEach((s, i) => {
    rail.append(tile({
      pressed: store.get().scene === s.id,
      name: s.name,
      hint: s.hint,
      art: (box) => {
        SCENE_LOADERS[s.id]().then((m) => m.thumb?.(box, { concept })).catch(() => imgArt(concept.works[i].src)(box));
      },
      onPick: () => { markPressed(rail, i); pick({ scene: s.id }); setView('scene'); },
    }));
  });
  tray.append(rail);
}

function buildGalleryTray() {
  const rail = document.createElement('div');
  rail.className = galleryExpanded ? 'rail is-all' : 'rail';
  const concept = byId(CONCEPTS, store.get().concept);
  const current = store.get().gallery;
  const shown = GALLERIES.filter((g) => galleryExpanded || g.core || g.id === current);
  shown.forEach((g, i) => {
    rail.append(tile({
      pressed: current === g.id,
      name: g.name,
      hint: g.hint,
      art: (box) => galleryThumb(g.id, box, concept.works),
      onPick: () => { markPressed(rail, i); setView('gallery'); pick({ gallery: g.id }); },
    }));
  });
  const foot = document.createElement('p');
  foot.className = 'tray-foot';
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'tray-more';
  more.textContent = galleryExpanded ? '대표만 보기' : `전체 ${GALLERIES.length}종 보기`;
  more.addEventListener('click', () => {
    galleryExpanded = !galleryExpanded;
    tray.textContent = '';
    buildGalleryTray();
  });
  foot.append(more);
  tray.append(rail, foot);
}

function setTray(name) {
  if (openTray === name) name = null;
  // Focus left inside a closing tray would vanish with it: give it back to the chip.
  if (!name && openTray && tray.contains(document.activeElement)) chipFor(openTray).focus({ preventScroll: true });
  capsule.querySelectorAll('[data-tray]').forEach((c) => c.setAttribute('aria-expanded', String(c.dataset.tray === name)));
  openTray = name;
  if (!name) {
    if (prefersReducedMotion()) trayScale.set(0), (tray.hidden = true), (tray.textContent = '');
    else trayScale.to(0);
    return;
  }
  tray.hidden = false;
  tray.textContent = '';
  tray.setAttribute('aria-label', `${chipFor(name).querySelector('.chip-k').textContent} 고르기`);
  if (name === 'concept') buildConceptTray();
  if (name === 'scene') buildSceneTray();
  if (name === 'gallery') buildGalleryTray();
  const chip = chipFor(name).getBoundingClientRect();
  const box = tray.getBoundingClientRect();
  const originX = clamp(chip.left + chip.width / 2 - box.left, 24, Math.max(24, box.width - 24));
  tray.style.transformOrigin = `${originX}px 100%`;
  if (prefersReducedMotion()) trayScale.set(1);
  else trayScale.to(1);
  // The tray sits before the capsule in the document, so Tab would skip it: take focus there.
  (tray.querySelector('.tile[aria-pressed="true"]') || tray.querySelector('.tile'))?.focus({ preventScroll: true });
}

/* ---------- applying a selection ---------- */
function persist(state) {
  history.replaceState(null, '', serializeSelection(state) + location.hash);
}

let conceptRequest = 0;

async function pick(patch) {
  if (patch.concept && patch.concept !== store.get().concept) {
    const request = ++conceptRequest;
    const next = byId(CONCEPTS, patch.concept);
    try {
      await prepareConcept(next);
    } catch {
      if (request !== conceptRequest) return;
      // The screen never changed, so there is nothing to undo except the highlight.
      if (openTray === 'concept') { tray.textContent = ''; buildConceptTray(); }
      toast('불러오지 못했습니다.', () => pick({ concept: patch.concept }));
      return;
    }
    // A newer concept choice was made while this one was loading: the last choice wins.
    if (request !== conceptRequest) return;
  } else if (patch.concept) {
    conceptRequest++;
  }
  store.set(patch);
}

store.subscribe((state, prev, changed) => {
  persist(state);
  renderCapsule(state);
  if (changed.includes('concept')) {
    const concept = byId(CONCEPTS, state.concept);
    applyTokens(concept);
    fillCopy(concept);
    gallery.setConcept(concept);
    mountScene(state.scene, concept);
  }
  if (changed.includes('scene') && !changed.includes('concept')) {
    mountScene(state.scene, byId(CONCEPTS, state.concept));
  }
  if (changed.includes('gallery')) {
    gallery.setLayout(state.gallery);
  }
});

/* ---------- moving between pages: wheel, swipe, keys, pager, peek ---------- */
let wheelLockUntil = 0;
let wheelSum = 0;
let wheelTimer = 0;

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (view === 'scene' && scene.api?.onWheel?.(e.deltaY, e.deltaX)) return;
  if (view === 'gallery' && gallery.onWheel(e.deltaY, e.deltaX)) return;
  const now = performance.now();
  if (now < wheelLockUntil) return;
  wheelSum += e.deltaY;
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(() => { wheelSum = 0; }, 160);
  if (Math.abs(wheelSum) < 60) return;
  const i = VIEWS.indexOf(view) + Math.sign(wheelSum);
  wheelSum = 0;
  if (i < 0 || i >= VIEWS.length) return;
  wheelLockUntil = now + 650;
  setView(VIEWS[i]);
}, { passive: false });

const stops = () => VIEWS.map(pageTop);

// Swipe the whole site up and down. Scenes and layouts that need the vertical axis
// mark themselves data-nodrag; the pager and the peek still move them.
drag(stage, {
  axis: 'y',
  threshold: 10,
  onStart: () => {
    const s = stops();
    trackY.stop();
    dragBase = unrubberClamp(trackY.value, s[s.length - 1], s[0], stage.clientHeight);
  },
  onMove: ({ dy }) => {
    const s = stops();
    trackY.set(rubberClamp(dragBase + dy, s[s.length - 1], s[0], stage.clientHeight));
  },
  onEnd: ({ vy, moved }) => {
    if (!moved) return;
    const s = stops();
    const landing = trackY.value + project(vy);
    setView(VIEWS[s.indexOf(nearest(landing, s))], { velocity: vy });
  },
});
let dragBase = 0;

document.getElementById('pager').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b) setView(b.dataset.view);
});

// Tapping the sliver of the next page brings it up.
stage.addEventListener('click', (e) => {
  const bottom = stage.getBoundingClientRect().bottom;
  const peek = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--peek')) || 80;
  if (view !== 'close' && !gallery.viewing && e.clientY > bottom - peek && !e.target.closest('button,a,input,.g-view')) {
    setView(VIEWS[VIEWS.indexOf(view) + 1]);
  }
});

// Keyboard: the gallery takes arrow keys the same way it takes the wheel.
const galleryHost = $('gallery-host');
galleryHost.tabIndex = 0;
galleryHost.setAttribute('aria-label', '갤러리. 화살표 키로 넘겨 봅니다');
galleryHost.addEventListener('keydown', (e) => {
  const step = { ArrowRight: [0, 160], ArrowDown: [160, 0], ArrowLeft: [0, -160], ArrowUp: [-160, 0] }[e.key];
  if (!step) return;
  e.preventDefault();
  if (view !== 'gallery') setView('gallery');
  if (!gallery.onWheel(step[0], step[1]) && !gallery.onWheel(step[1], step[0])) {
    const n = VIEWS[VIEWS.indexOf(view) + Math.sign(step[0] + step[1])];
    if (n) setView(n);
  }
});

document.addEventListener('keydown', (e) => {
  if (sheetOpen()) return;
  if (e.target.matches?.('input,textarea')) return;
  if (e.key === 'Escape' && openTray) { setTray(null); return; }
  if (e.key === 'PageDown') { const n = VIEWS[VIEWS.indexOf(view) + 1]; if (n) setView(n); }
  if (e.key === 'PageUp') { const n = VIEWS[VIEWS.indexOf(view) - 1]; if (n) setView(n); }
});

capsule.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-tray]');
  if (chip) setTray(chip.dataset.tray);
});

// A press on the site closes the tray but never competes with the gesture underneath.
stage.addEventListener('pointerdown', () => { if (openTray) setTray(null); });

window.addEventListener('resize', () => {
  trackY.set(pageTop(view));
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) scene.api?.pause?.();
  else if (view === 'scene') scene.api?.play?.();
});

/* ---------- sample request sheet ---------- */
let sheetModule = null;
const sheetOpen = () => !$('sheet').hidden;

async function openSheet() {
  setTray(null);
  try {
    sheetModule = sheetModule || (await import('./order/sheet.js'));
  } catch (error) {
    console.error('[sheet]', error?.message);
    toast('접수 화면을 불러오지 못했습니다.', openSheet);
    return;
  }
  sheetModule.openSheet({
    sheet: $('sheet'),
    scrim: $('scrim'),
    trigger: $('cta'),
    capsule,
    inertTargets: [stage, capsule, document.querySelector('.bar')],
    catalog,
    getSelection: () => store.get(),
    onOpen: () => scene.api?.pause?.(),
    onClose: () => { if (view === 'scene') scene.api?.play?.(); },
  });
}
$('cta').addEventListener('click', openSheet);

/* ---------- start ---------- */
const startConcept = byId(CONCEPTS, initial.concept);
applyTokens(startConcept);
fillCopy(startConcept);
renderCapsule(initial);
renderPager();
gallery.pause();
mountScene(initial.scene, startConcept, { fade: false });
if (location.search) persist(initial);
if (urlHadUnknown) toast('일부 선택을 기본값으로 바꿨습니다.');

matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => {
  mountScene(store.get().scene, byId(CONCEPTS, store.get().concept));
});

/* Test hook. No customer data here. */
window.__getsite = {
  store,
  pick,
  setView,
  setTray,
  defaults: DEFAULTS,
  get view() { return view; },
  get sceneApi() { return scene.api; },
  gallery,
  ready: Promise.resolve(),
};
