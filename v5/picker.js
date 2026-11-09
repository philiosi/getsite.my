/* "보면서 고르기": a full-screen dialog on the same page (never a new window, so the choice cannot be
   lost to a popup blocker or a closed tab). Two kinds:
   - the hero motion scenes (v5: examples only, nothing is chosen here): the motion sample page in its
     embed mode, in a same-origin iframe, loaded only while the dialog is open; scenes are switched by
     a same-origin postMessage;
   - the gallery layouts: the gallery lab (14 layouts) in its pick mode, in a same-origin iframe.
   Looking never changes the order; only the gallery's "이 구도로 선택" does, through the store. */
import { partsFor } from './parts.js';
import { layoutName } from './gallery-mount.js';

/** Where the gallery lab is served (scripts/v4-build.mjs copies samples/gallery-layouts there) and its layouts. */
export const GALLERY_LAB_URL = '/gallery-lab/index.html';
export const LAB_IDS = ['grid', 'masonry', 'strip', 'flow', 'focus', 'timeline', 'index', 'coverflow', 'stack', 'museum', 'peek', 'autoplay', 'drag', 'thumbnav'];

const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let seq = 0;
/** The dialog shell: title, close, a stage, a candidate list, a detail line and the actions. */
// Shown beside the motion viewer title: these scenes explain motion graphics; real work follows the customer's references.
const MOTION_NOTE = '모션그래픽을 설명하기 위한 예시 화면입니다. 실제 제작은 보내 주신 레퍼런스(사이트, 핀터레스트 등) 링크와 상세 설명에 맞춰 진행됩니다. (예: 한붓 그리기, 픽셀 아트, 타이포그래피 등)';

/** Sites to browse for motion references, shown in the motion viewer's second tab. Edit here. */
export const MOTION_REFS = [
  { name: 'Vimeo', url: 'https://vimeo.com/', host: 'vimeo.com', desc: '전 세계 모션 디자이너·스튜디오의 하이엔드 영상이 모이는 곳.',
    more: [['Staff Picks', 'https://vimeo.com/channels/staffpicks'], ['Wine after Coffee', 'https://vimeo.com/channels/wineaftercoffee']] },
  { name: 'Motionographer', url: 'https://motionographer.com/', host: 'motionographer.com', desc: '업계 트렌드, 우수 스튜디오 작품, 인터뷰를 큐레이션하는 모션그래픽 매거진.' },
  { name: 'Behance', url: 'https://www.behance.net/galleries/motion', host: 'behance.net', desc: '어도비 포트폴리오. 모션 분야에서 기획·스타일프레임·최종 영상까지 한눈에.' },
  { name: 'Dribbble', url: 'https://dribbble.com/shots/popular/animation', host: 'dribbble.com', desc: 'UI 인터랙션, 로고 애니메이션 등 짧은 루프 모션 모음.' },
  { name: '노트폴리오', url: 'https://notefolio.net/', host: 'notefolio.net', desc: '국내 디자이너·영상 스튜디오의 모션그래픽 포트폴리오.', badge: '국내' },
];

function refSites() {
  const ul = h('ul', 'ref-sites');
  for (const s of MOTION_REFS) {
    const li = h('li', 'ref-site');
    const a = h('a', 'ref-site-main'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    const top = h('span', 'ref-site-top');
    top.append(h('b', '', s.name));
    if (s.badge) top.append(h('span', 'picker-badge', s.badge));
    top.append(h('span', 'ref-site-host', `${s.host} ↗`));
    a.append(top, h('span', 'ref-site-desc', s.desc));
    a.setAttribute('aria-label', `${s.name} 새 탭에서 열기`);
    li.append(a);
    if (s.more) {
      const more = h('p', 'ref-site-more', '추천 채널: ');
      s.more.forEach(([t, u], i) => {
        const m = h('a', '', `${t} ↗`); m.href = u; m.target = '_blank'; m.rel = 'noopener noreferrer';
        m.setAttribute('aria-label', `${s.name} ${t} 새 탭에서 열기`);
        if (i) more.append(document.createTextNode(' · '));
        more.append(m);
      });
      li.append(more);
    }
    ul.append(li);
  }
  return ul;
}

/** Two tabs in the motion viewer's side: the scenes (list + detail) and the reference sites. */
function motionTabs(side, list, info, count) {
  const id = `picker-${++seq}`;
  const tabs = h('div', 'picker-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '모션 예시와 참고 사이트');
  const scenesPanel = h('div', 'picker-panel picker-panel-scenes');
  const refsPanel = h('div', 'picker-panel picker-panel-refs');
  scenesPanel.append(list, info);
  refsPanel.append(refSites(), h('p', 'picker-muted ref-sites-note', '마음에 드는 영상 주소를 구성 화면 아래 「참고하고 싶은 사이트·이미지」 칸에 붙여 주시면 제작에 반영합니다.'));
  const defs = [['scenes', `모션 예시 ${count}`, scenesPanel], ['refs', `참고 사이트 ${MOTION_REFS.length}`, refsPanel]];
  const btns = defs.map(([key, label, panel]) => {
    const b = h('button', 'picker-tab', label); b.type = 'button'; b.setAttribute('role', 'tab');
    b.id = `${id}-tab-${key}`; b.dataset.pickerTab = key;
    panel.id = `${id}-panel-${key}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', b.id);
    b.setAttribute('aria-controls', panel.id);
    tabs.append(b);
    return b;
  });
  const select = (key) => defs.forEach(([k], i) => {
    const on = k === key;
    btns[i].setAttribute('aria-selected', String(on)); btns[i].tabIndex = on ? 0 : -1;
    defs[i][2].hidden = !on;
  });
  btns.forEach((b, i) => b.addEventListener('click', () => select(defs[i][0])));
  tabs.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    const i = btns.indexOf(document.activeElement);
    if (!step || i < 0) return;
    e.preventDefault();
    const next = btns[(i + step + btns.length) % btns.length];
    next.focus(); next.click();
  });
  side.prepend(tabs, scenesPanel, refsPanel);
  side.classList.add('picker-side-tabs');
  select('scenes');
}

function shell(title, desc = '') {
  const id = `picker-${++seq}`;
  const dlg = h('dialog', 'picker');
  dlg.setAttribute('aria-labelledby', `${id}-t`);
  const head = h('div', 'picker-head');
  const t = h('h3', 'picker-title', title); t.id = `${id}-t`;
  const close = h('button', 'picker-close', '닫기'); close.type = 'button';
  if (desc) {
    const d = h('p', 'picker-desc', desc); d.id = `${id}-d`;
    dlg.setAttribute('aria-describedby', d.id);
    const titles = h('div', 'picker-titles'); titles.append(t, d);
    head.append(titles, close);
  } else head.append(t, close);
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
  return { dlg, close, stage, list, info, actions, side };
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
  const { dlg, close, stage, list, info, actions, side } = shell('첫 장면 모션 예시', MOTION_NOTE);
  dlg.dataset.picker = 'motion';
  list.setAttribute('aria-label', '첫 장면 모션');
  motionTabs(side, list, info, scenes.length);

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

const labLabel = (id) => layoutName(id);

/** The gallery layouts, large and live: the gallery lab (14 layouts) in pick mode, in a same-origin
    iframe loaded only while the dialog is open. The lab posts the layout it shows; "이 구도로 선택"
    stores that one. */
export function openGalleryPicker({ store, toast = () => {}, returnFocus = null, labUrl = GALLERY_LAB_URL }) {
  const state = store.get();
  let look = null;
  const { dlg, close, stage, list, info, actions } = shell('갤러리 구도 고르기', '위쪽 레이아웃 버튼으로 구도를 바꿔 보고, 작품을 눌러 크게 보세요. 마음에 드는 구도에서 "이 구도로 선택"을 누르면 주문에 담깁니다. 색과 카드 구성 버튼은 보기용입니다.');
  dlg.dataset.picker = 'gallery';
  dlg.classList.add('picker-lab');
  list.remove();
  const frame = h('iframe', 'picker-frame');
  frame.title = '갤러리 구도 미리보기';
  const loading = h('p', 'picker-loading', '갤러리 샘플을 불러오는 중입니다… (처음 한 번, 약 6MB)');
  stage.append(frame, loading);
  // A page that is not the lab (404, a cut-off load) never posts: say so instead of "불러오는 중" forever.
  frame.addEventListener('load', () => {
    if (frame.src === 'about:blank') return;
    let ok = false;
    try { ok = !!frame.contentDocument?.getElementById('layoutSeg'); } catch { ok = false; }
    loading.hidden = ok;
    if (!ok) { loading.textContent = '갤러리 샘플을 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요. "제작자에게 맡기기"는 지금도 고를 수 있습니다.'; loading.dataset.failed = ''; }
  });
  const start = LAB_IDS.includes(state.gallery) ? state.gallery : '';
  frame.src = `${labUrl}?pick=1${start ? `&layout=${start}` : ''}`;

  const choose = h('button', 'btn btn-ink', '이 구도로 선택'); choose.type = 'button'; choose.dataset.pickerChoose = '';
  const auto = h('button', 'btn btn-line', '제작자에게 맡기기'); auto.type = 'button'; auto.dataset.pickerAuto = '';
  actions.append(choose, auto);
  function show(id) {
    look = id;
    choose.disabled = !id;
    info.textContent = '';
    const now = id ? labLabel(id) : '불러오는 중…';
    info.append(h('b', 'picker-info-name', `지금 보는 구도: ${now}`));
    info.append(h('p', 'picker-muted', state.gallery && state.gallery !== id ? `주문에 담긴 구도: ${labLabel(state.gallery)}` : (id && id === state.gallery ? '이미 주문에 담긴 구도입니다.' : '')));
  }
  const onMessage = (e) => {
    if (e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.type !== 'getsite:gallery-layout' || !LAB_IDS.includes(d.id)) return;
    show(d.id);
  };
  window.addEventListener('message', onMessage);
  const pick = (id) => { store.setGallery(id); toast(`갤러리 구도를 ${labLabel(id)}(으)로 골랐습니다.`); dlg.close(); };
  choose.addEventListener('click', () => { if (look) pick(look); });
  auto.addEventListener('click', () => pick('auto'));
  show(null);
  const closeFn = open(dlg, close, () => { window.removeEventListener('message', onMessage); frame.src = 'about:blank'; }, returnFocus);
  close.focus();
  return { dialog: dlg, close: closeFn };
}
