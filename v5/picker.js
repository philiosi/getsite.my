/* "보면서 고르기": a full-screen dialog on the same page (never a new window, so the choice cannot be
   lost to a popup blocker or a closed tab). Two kinds:
   - the hero motion scenes (v5: examples only, nothing is chosen here): the motion sample page in its
     embed mode, in a same-origin iframe, loaded only while the dialog is open; scenes are switched by
     a same-origin postMessage;
   - the gallery layouts: the live v3 gallery engine, large.
   Looking never changes the order; only the gallery's "이 구도로 선택" does, through the store. */
import { partsFor } from './parts.js';
import { mountGallery, LAYOUT_IDS, layoutName } from './gallery-mount.js';
import { GALLERIES } from '../v3/catalog.js';

const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let seq = 0;
/** The dialog shell: title, close, a stage, a candidate list, a detail line and the actions. */
function shell(title) {
  const id = `picker-${++seq}`;
  const dlg = h('dialog', 'picker');
  dlg.setAttribute('aria-labelledby', `${id}-t`);
  const head = h('div', 'picker-head');
  const t = h('h3', 'picker-title', title); t.id = `${id}-t`;
  const close = h('button', 'picker-close', '닫기'); close.type = 'button';
  head.append(t, close);
  const stage = h('div', 'picker-stage');
  const list = h('div', 'picker-list'); list.setAttribute('role', 'radiogroup');
  const info = h('div', 'picker-info'); info.setAttribute('aria-live', 'polite');
  const actions = h('div', 'picker-actions');
  const side = h('div', 'picker-side');
  side.append(list, info, actions);
  const body = h('div', 'picker-body');
  body.append(stage, side);
  dlg.append(head, body);
  // Arrow keys move through the candidates (one tab stop, like any radio group).
  list.addEventListener('keydown', (e) => {
    const radios = [...list.querySelectorAll('[role="radio"]')];
    const i = radios.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (i < 0 || !step) return;
    e.preventDefault();
    const next = radios[(i + step + radios.length) % radios.length];
    next.focus(); next.click();
  });
  return { dlg, close, stage, list, info, actions };
}

function open(dlg, close, onClose, returnFocus) {
  document.body.append(dlg);
  dlg.addEventListener('close', () => {
    onClose(); dlg.remove();
    // A function is asked at close time: choosing may have redrawn the button that opened the dialog.
    const back = typeof returnFocus === 'function' ? returnFocus() : returnFocus;
    back?.focus?.({ preventScroll: true });
  }, { once: true });
  close.addEventListener('click', () => dlg.close());
  // A click on the backdrop (outside the box) closes too.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();
  return () => dlg.close();
}

function radios(list, items, current, onLook) {
  list.textContent = '';
  for (const it of items) {
    const b = h('button', 'picker-opt');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.value = it.value;
    if (it.thumb) { const img = h('img'); img.src = it.thumb; img.alt = ''; img.width = 112; img.height = 70; img.loading = 'lazy'; img.decoding = 'async'; b.append(img); }
    const txt = h('span', 'picker-opt-text');
    txt.append(h('b', '', it.label));
    if (it.badge) txt.append(h('span', 'picker-badge', it.badge));
    if (it.value === current) txt.append(h('span', 'picker-chosen', '선택됨'));
    b.append(txt);
    b.addEventListener('click', () => onLook(it.value));
    list.append(b);
  }
}
const mark = (list, value) => list.querySelectorAll('[role="radio"]').forEach((b) => {
  const on = b.dataset.value === value;
  b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
});

/** The hero motion scenes, as examples. `startRef` is the scene to show first (else the first). */
export function openMotionPicker({ parts, startRef = null, returnFocus = null }) {
  const scenes = partsFor(parts, 'hero').filter((p) => p.kind === 'motion');
  const page = parts?.motion?.page;
  if (!scenes.length || !page) return null;
  const sceneOf = (ref) => scenes.find((p) => p.ref === ref);
  let look = sceneOf(startRef)?.ref || scenes[0].ref;
  const { dlg, close, stage, list, info, actions } = shell('첫 장면 모션 예시');
  dlg.dataset.picker = 'motion';
  list.setAttribute('aria-label', '첫 장면 모션');

  const frame = h('iframe', 'picker-frame');
  frame.title = '첫 장면 모션 미리보기';
  frame.setAttribute('allow', 'autoplay');
  const loading = h('p', 'picker-loading', '모션 샘플을 불러오는 중입니다… (처음 한 번, 약 9MB)');
  stage.append(frame, loading);
  let loaded = false;
  let playing = !reduced();
  const send = (msg) => { if (loaded) frame.contentWindow?.postMessage({ getsite: 'motion', ...msg }, location.origin); };
  frame.addEventListener('load', () => { if (frame.src === 'about:blank') return; loaded = true; loading.hidden = true; send({ scene: sceneOf(look).scene, play: playing }); });
  frame.src = `${page}?embed=1#scene=${sceneOf(look).scene}`;

  const pause = h('button', 'btn btn-line btn-sm', ''); pause.type = 'button'; pause.dataset.pickerPause = '';
  const paintPause = () => { pause.textContent = playing ? '일시정지' : '재생'; pause.setAttribute('aria-pressed', String(!playing)); };
  pause.addEventListener('click', () => { playing = !playing; paintPause(); send({ play: playing }); });
  const orig = h('a', 'btn btn-line btn-sm', '원본 새 탭으로 보기'); orig.target = '_blank'; orig.rel = 'noopener';
  actions.append(pause, orig);

  function show(ref) {
    look = ref;
    const p = sceneOf(ref);
    mark(list, ref);
    send({ scene: p.scene });
    orig.href = p.anchor;
    info.textContent = '';
    info.append(h('b', 'picker-info-name', `${p.scene}. ${p.name}`), h('p', '', p.hint || ''));
    if (p.video) {
      const note = h('p', 'picker-video-note', '영상 옵션(+200,000원, 4단계 견적에서 선택)을 고르시면 영상을 먼저 만든 뒤, 웹 페이지에 맞게 Remotion으로 다시 제작해 첫 장면에 넣습니다. 7번 샘플이 실제로 이렇게 다시 만든 영상입니다.');
      note.dataset.videoNote = '';
      info.append(note);
    }
    info.append(h('p', 'picker-muted', '이런 움직임을 만들 수 있다는 예시입니다. 따로 고르실 필요는 없고, 첫 장면의 움직임은 샘플을 보신 뒤 자료에 맞춰 함께 정합니다.'));
  }
  radios(list, scenes.map((p) => ({ value: p.ref, label: `${p.scene}. ${p.name}`, thumb: `./${p.thumb}`, badge: p.video ? '영상 옵션' : '' })), null, show);
  paintPause();
  show(look);
  const closeFn = open(dlg, close, () => { send({ play: false }); loaded = false; frame.src = 'about:blank'; }, returnFocus);
  list.querySelector('[aria-checked="true"]')?.focus();
  return { dialog: dlg, close: closeFn };
}

/** The gallery layouts, large and live. */
export function openGalleryPicker({ store, data, toast = () => {}, returnFocus = null }) {
  const state = store.get();
  const concept = data.samples.find((s) => s.id === state.sampleId)?.concept || 'atelier';
  let look = state.gallery;
  const { dlg, close, stage, list, info, actions } = shell('갤러리 구도 고르기');
  dlg.dataset.picker = 'gallery';
  list.setAttribute('aria-label', '갤러리 구도');
  const host = h('div', 'picker-gallery');
  stage.append(host);
  const gallery = mountGallery(host, { conceptId: concept, layoutId: look === 'auto' ? 'focus' : look });
  const choose = h('button', 'btn btn-ink', '이 구도로 선택'); choose.type = 'button'; choose.dataset.pickerChoose = '';
  actions.append(choose);
  function show(id) {
    look = id;
    mark(list, id);
    gallery.setLayout(id === 'auto' ? 'focus' : id);
    info.textContent = '';
    info.append(h('b', 'picker-info-name', layoutName(id)));
    info.append(h('p', '', id === 'auto' ? '주제와 자료에 맞춰 저희가 고릅니다. 미리보기는 집중형 예시입니다.' : GALLERIES.find((g) => g.id === id)?.hint || ''));
    info.append(h('p', 'picker-muted', '작품을 누르면 크게 보입니다. 옆으로 밀거나 화살표 키로 넘겨 보세요.'));
  }
  radios(list, ['auto', ...LAYOUT_IDS].map((id) => ({ value: id, label: layoutName(id) })), state.gallery, show);
  choose.addEventListener('click', () => { store.setGallery(look); toast(`갤러리 구도를 ${layoutName(look)}(으)로 골랐습니다.`); dlg.close(); });
  show(look);
  const closeFn = open(dlg, close, () => gallery.destroy(), returnFocus);
  list.querySelector('[aria-checked="true"]')?.focus();
  return { dialog: dlg, close: closeFn };
}
