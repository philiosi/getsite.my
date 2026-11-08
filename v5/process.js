/* The five steps: a row of step cards that act as tabs, and one panel area below. Panels are
   built once and shown with `hidden`, so the step 3 gallery keeps its state. */
import { doneSteps, validForm, validRef } from './store.js';
import { addFiles, removeFile, prune, formatSize } from './ref-files.js';
import { createFlow } from './preview.js';
import { assetFor } from './samples.js';
import { renderPanel2, renderPanel4, renderPanel5 } from './panels.js';

const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };

export const STEPS = [
  { n: 1, title: '샘플 선택', line: '있는 샘플 중에서 내 사업과 가장 가까운 것을 고릅니다.' },
  { n: 2, title: '최소 입력', line: '이메일, 사이트 이름, 목적 한 줄이면 됩니다.' },
  { n: 3, title: '프로토타입 구성안', line: '섹션을 고르면 순서대로 쌓이고, 오른쪽에서 한 흐름으로 봅니다.' },
  { n: 4, title: '정리와 가격', line: '고른 구성에 해당하는 가격만 보여드립니다.' },
  { n: 5, title: '샘플 제작 요청', line: '확인하고 접수하면 안내 메일이 갑니다.' },
];

export function renderProcess({ stepsEl, panels, store, data, sections, manifest, parts = null, toast }) {
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = (n) => {
    store.setStep(n);
    const panel = panels[n - 1];
    panel.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    // The button that was pressed is now inside a hidden panel; put focus on the new panel's heading.
    const head = panel.querySelector('h3');
    if (head) { head.tabIndex = -1; head.focus({ preventScroll: true }); }
  };
  // goToSection(id): step 3, that section's tile opened and focused (set by renderPanel3).
  const ctx = { store, data, sections, manifest, parts, toast, go, goToSection: () => go(3) };

  // step cards
  stepsEl.textContent = '';
  const cards = STEPS.map((st) => {
    const b = h('button', 'step');
    b.type = 'button'; b.setAttribute('role', 'tab'); b.id = `step-${st.n}`; b.setAttribute('aria-controls', `panel-${st.n}`);
    const done = h('span', 'done', '✓'); done.setAttribute('aria-hidden', 'true');
    const doneText = h('span', 'sr-only', ''); doneText.dataset.doneText = '';
    b.append(h('span', 'n', `STEP ${st.n}`), h('h3', '', st.title), h('p', '', st.line), done, doneText);
    b.addEventListener('click', () => store.setStep(st.n));
    stepsEl.append(b);
    return b;
  });

  // panels
  const flow = renderPanel3(panels[2], ctx);
  // "고치기" in step 4: back to step 3 with that section's screen picker open and focused.
  ctx.goToSection = (id) => {
    go(3);
    requestAnimationFrame(() => { if (!flow.focusSection(id)) panels[2].querySelector('h3')?.focus(); });
  };
  renderPanel1(panels[0], ctx);
  renderPanel2(panels[1], ctx);
  renderPanel4(panels[3], ctx);
  renderPanel5(panels[4], ctx);

  function paint(state, prev) {
    const done = doneSteps(state);
    cards.forEach((c, i) => {
      const n = i + 1;
      c.setAttribute('aria-selected', String(state.step === n));
      c.classList.toggle('is-done', !!done[n]);
      c.querySelector('[data-done-text]').textContent = done[n] ? ' (완료)' : '';
      c.tabIndex = state.step === n ? 0 : -1;
    });
    panels.forEach((p, i) => { p.hidden = state.step !== i + 1; });
    if (state.step === 3) flow.render(state, prev);
    if (state.step === 4) store.markVisited(4);
    // Only a real step change writes the hash, so #faq or #samples in a shared link survives the first paint.
    if (prev && state.step !== prev.step) history.replaceState(null, '', `#step=${state.step}`);
  }
  paint(store.get(), null);
  store.subscribe((s, p) => paint(s, p));

  // keyboard between tabs
  stepsEl.addEventListener('keydown', (e) => {
    const cur = store.get().step;
    const n = { ArrowRight: cur + 1, ArrowLeft: cur - 1, Home: 1, End: 5 }[e.key];
    if (!n) return;
    const to = Math.min(5, Math.max(1, n));
    store.setStep(to); cards[to - 1].focus(); e.preventDefault();
  });
}

/* ---------- step 1: pick a sample ---------- */
function renderPanel1(el, { store, data, manifest, go }) {
  el.textContent = '';
  const head = h('div', 'panel-head');
  head.append(h('h3', '', '샘플 선택'), h('p', '', '가까운 것을 고르세요. 구성과 갤러리는 다음 단계에서 바꿀 수 있습니다.'));
  const rail = h('div', 'choices');
  rail.setAttribute('role', 'radiogroup'); rail.setAttribute('aria-label', '주제로 거르기');
  const topics = [{ id: 'all', name: '전체' }, ...data.topics];
  const grid = h('div', 'pick-grid');
  const picks = data.samples.map((s) => {
    const b = h('button', 'pick');
    b.type = 'button'; b.dataset.sample = s.id; b.dataset.topic = s.topic;
    const img = h('img'); img.loading = 'lazy'; img.alt = ''; img.src = assetFor(manifest, s.id, 'hero') || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='; img.width = 1440; img.height = 900;
    b.append(img, h('b', '', s.title), h('span', '', `${data.topics.find((t) => t.id === s.topic)?.name || ''} · ${s.badge}`));
    b.addEventListener('click', () => store.pickSample(s.id));
    grid.append(b);
    return b;
  });
  let filter = 'all';
  const tbs = topics.map((t) => {
    const lab = h('label', 'choice');
    const r = h('input'); r.type = 'radio'; r.name = 'pick-topic'; r.value = t.id; r.checked = t.id === 'all';
    lab.append(r, h('span', '', t.name));
    r.addEventListener('change', () => { filter = t.id; picks.forEach((p) => { p.hidden = filter !== 'all' && p.dataset.topic !== filter; }); });
    rail.append(lab);
    return lab;
  });
  const foot = h('div', 'panel-foot');
  const hint = h('span', 'hint', '');
  const next = h('button', 'btn btn-ink', '다음: 최소 입력');
  next.type = 'button'; next.addEventListener('click', () => go(2));
  foot.append(hint, next);
  el.append(head, rail, grid, foot);
  const paint = (s) => {
    picks.forEach((p) => p.setAttribute('aria-pressed', String(p.dataset.sample === s.sampleId)));
    const chosen = data.samples.find((x) => x.id === s.sampleId);
    hint.textContent = chosen ? `선택: ${chosen.title}` : '샘플을 하나 고르세요';
    next.disabled = !chosen;
  };
  paint(store.get());
  store.subscribe((s, p) => { if (s.sampleId !== p.sampleId) paint(s); });
}

/* ---------- step 3: sections, stack, flow, materials, references ---------- */
function renderPanel3(el, ctx) {
  const { store, data, sections, manifest, parts, go, toast } = ctx;
  el.textContent = '';
  const head = h('div', 'panel-head');
  head.append(h('h3', '', '프로토타입 구성안'), h('p', '', '넣고 싶은 섹션을 고르세요. 고른 순서대로 아래에 쌓이고, 오른쪽에서 한 흐름으로 이어 봅니다.'));
  const compose = h('div', 'compose');

  // left: options + stack
  const left = h('div');
  const list = h('div', 'sec-list');
  const boxes = sections.map((sec) => {
    const lab = h('label', 'sec-opt');
    const c = h('input'); c.type = 'checkbox'; c.value = sec.id;
    const t = h('div'); t.append(h('b', '', sec.label), h('small', '', sec.sub));
    lab.append(c, t);
    c.addEventListener('change', () => store.toggleSection(sec.id));
    list.append(lab);
    return c;
  });
  const stack = h('div', 'stack');
  stack.append(h('h4', '', '구성 순서'));
  const ol = h('ol');
  const empty = h('p', 'empty', '아직 고른 섹션이 없습니다.');
  stack.append(ol, empty);
  left.append(list, stack);

  // right: the flow
  const flowBox = h('div', 'flow');
  const bar = h('div', 'flow-bar');
  const scroll = h('div', 'flow-scroll');
  scroll.tabIndex = 0; scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', '구성 미리보기. 위아래로 스크롤');
  const flowHint = h('p', 'flow-hint', '섹션은 구성만 고르시면 됩니다. 각 섹션은 제작 때 새로 만듭니다. 첫 장면 모션은 예시로 보시고, 갤러리는 실제로 움직이는 구도를 보며 고르세요.');
  flowBox.append(bar, flowHint, scroll);
  compose.append(left, flowBox);
  const flow = createFlow({ scroll, bar, store, data, sections, manifest, parts, toast });

  // below: materials + references
  const below = h('div', 'form-grid');
  below.style.marginTop = '24px';
  const mat = h('div', 'field');
  mat.append(h('span', 'flabel', '자료가 있나요?'));
  const ch = h('div', 'choices');
  ch.setAttribute('role', 'radiogroup'); ch.setAttribute('aria-label', '자료가 있나요?');
  for (const [v, t, sub] of [['have', '자료 있음', '사진·소개글 등을 갖고 있어요'], ['none', '자료 없음', '구성안 단계에서 함께 정리해요']]) {
    const lab = h('label', 'choice'); const r = h('input'); r.type = 'radio'; r.name = 'materials'; r.value = v;
    r.addEventListener('change', () => store.setMaterials(v));
    lab.append(r, h('span', '', `${t} · ${sub}`)); ch.append(lab);
  }
  const matNote = h('div', 'note');
  matNote.append(h('b', '', '자료 올리기'), document.createTextNode('참고용 이미지는 「참고 이미지 파일」 칸에서 바로 올릴 수 있습니다. 사이트에 실제로 쓸 사진·영상은 접수가 끝나면 의뢰번호로 만든 전용 Google Drive 폴더에 올려 주세요. 큰 영상도 크기 제한이 없습니다.'));
  mat.append(ch, matNote);
  const refs = h('div', 'field');
  const refsLabel = h('span', 'flabel', '참고하고 싶은 사이트·이미지 (선택)'); refsLabel.id = 'refs-label';
  refs.append(refsLabel);
  const refHelp = h('p', 'help', '원하는 색감, 스타일, 분위기가 담긴 사이트나 이미지, 핀터레스트 핀·보드, 인스타그램 게시물 주소를 최대 3개까지 붙여 넣어 주세요. 주소마다 무엇을 참고하고 싶은지(예: 색감, 글꼴, 사진 분위기, 메뉴 배치) 짧게 적어 주시면 샘플에 더 정확히 반영됩니다.');
  refHelp.id = 'refs-help';
  refs.append(refHelp);
  const refWrap = h('div', 'refs'); refWrap.setAttribute('role', 'group'); refWrap.setAttribute('aria-labelledby', 'refs-label');
  const refInputs = [0, 1, 2].map((i) => {
    const w = h('div', 'field'); w.style.marginBottom = '0';
    const inp = h('input'); inp.type = 'url'; inp.id = `ref-${i + 1}`; inp.placeholder = ['https://pin.it/… 또는 https://www.pinterest.com/…', 'https://… 사이트 주소', 'https://… (선택)'][i]; inp.setAttribute('aria-label', `레퍼런스 ${i + 1}`); inp.maxLength = 300; inp.setAttribute('aria-describedby', 'refs-help');
    const err = h('div', 'ferr', 'https:// 로 시작하는 주소만 넣을 수 있습니다.'); err.id = `ref-${i + 1}-err`;
    inp.addEventListener('input', () => store.setRef(i, inp.value.trim()));
    const note = h('input'); note.type = 'text'; note.id = `ref-note-${i + 1}`; note.maxLength = 100;
    note.setAttribute('aria-label', `레퍼런스 ${i + 1}에서 참고할 부분`);
    note.placeholder = ['참고할 점 예: 베이지·초록 색감', '참고할 점 예: 큰 사진 첫 화면', '참고할 점 예: 손글씨 제목 글꼴'][i];
    note.addEventListener('input', () => store.setRefNote(i, note.value));
    const row = h('div', 'ref-row'); row.dataset.i = i;
    const no = h('span', 'ref-no', String(i + 1)); no.setAttribute('aria-hidden', 'true');
    w.append(inp, err); row.append(no, w, note); refWrap.append(row);
    return { w, inp, note };
  });
  const fileBlock = h('div', 'ref-files');
  const drop = h('label', 'ref-drop'); drop.htmlFor = 'ref-files';
  const fileInput = h('input'); fileInput.id = 'ref-files'; fileInput.type = 'file'; fileInput.multiple = true;
  fileInput.accept = '.jpg,.jpeg,.png,.webp,.gif,.heic,.zip,image/jpeg,image/png,image/webp,image/gif,image/heic,application/zip';
  fileInput.setAttribute('aria-describedby', 'ref-files-help ref-files-err'); // visually hidden in refs.css; the label shows its focus
  drop.append(h('b', '', '파일을 끌어다 놓거나 눌러서 고르세요'), h('span', '', 'jpg · png · webp · gif · heic · zip'), fileInput);
  const fileHelp = h('p', 'help', '최대 10개, 파일당 20MB까지 접수할 때 함께 올라갑니다. 사이트에 실제로 쓸 사진·영상은 접수 후 받는 Drive 폴더에 올려 주세요.'); fileHelp.id = 'ref-files-help';
  // Always in the DOM (never hidden): an alert that appears together with its text is often not read.
  const fileErr = h('div', 'ferr'); fileErr.id = 'ref-files-err'; fileErr.setAttribute('role', 'alert');
  const fileLive = h('div', 'sr-only'); fileLive.id = 'ref-files-live'; fileLive.setAttribute('aria-live', 'polite');
  const say = (t) => { fileLive.textContent = ''; setTimeout(() => { fileLive.textContent = t; }, 50); };
  const fileList = h('ul', 'ref-file-list'); fileList.hidden = true;
  const fileNoteWrap = h('div', 'ref-file-note');
  const fileNoteLabel = h('label', '', '이미지에서 참고할 부분'); fileNoteLabel.htmlFor = 'ref-file-note';
  const fileNote = h('textarea'); fileNote.id = 'ref-file-note'; fileNote.maxLength = 200; fileNote.rows = 2; fileNote.placeholder = '예: 첫 번째 사진의 따뜻한 조명, zip 안 로고 색';
  fileNote.addEventListener('input', () => store.setRefFileNote(fileNote.value)); fileNoteWrap.append(fileNoteLabel, fileNote);
  const clearFileError = () => { fileErr.textContent = ''; };
  const add = (incoming) => {
    const cur = store.get().refFiles; const { list, rejected } = addFiles(cur, incoming);
    // Nothing new (only refused or repeated files): no edit, so a submitted order is not detached.
    const changed = list.length !== cur.length || list.some((f, i) => f.id !== cur[i]?.id);
    if (changed) { store.setRefFiles(list); say(`파일 ${list.length - cur.length}개 추가, 지금 ${list.length}개`); }
    fileErr.textContent = rejected.join(' ');
  };
  fileInput.addEventListener('change', () => { add(fileInput.files); fileInput.value = ''; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); add(e.dataTransfer.files); });
  function paintFiles(s) {
    fileList.textContent = ''; fileList.hidden = !s.refFiles.length; fileNoteWrap.hidden = !s.refFiles.length;
    s.refFiles.forEach((f, i) => {
      const li = h('li'); li.dataset.id = f.id;
      const rm = h('button', 'rm', '빼기'); rm.type = 'button'; rm.setAttribute('aria-label', `${f.name} 빼기`);
      rm.addEventListener('click', () => {
        clearFileError(); store.setRefFiles(removeFile(store.get().refFiles, f.id)); say(`${f.name} 뺌, 지금 ${store.get().refFiles.length}개`);
        const rms = fileList.querySelectorAll('button.rm'); (rms[Math.min(i, rms.length - 1)] || fileInput).focus();
      });
      const nm = h('span', 'nm', f.name); nm.title = f.name;
      li.append(nm, h('span', 'sz', formatSize(f.size)), rm); fileList.append(li);
    });
  }
  fileBlock.append(h('span', 'flabel', '참고 이미지 파일 (선택)'), drop, fileHelp, fileErr, fileLive, fileList, fileNoteWrap);
  refs.append(refWrap, fileBlock);
  below.append(mat, refs);

  const foot = h('div', 'panel-foot');
  const back = h('button', 'btn btn-line', '이전'); back.type = 'button'; back.addEventListener('click', () => go(2));
  const next = h('button', 'btn btn-ink', '다음: 정리와 가격'); next.type = 'button'; next.addEventListener('click', () => go(4));
  const hint = h('span', 'hint', '');
  foot.append(back, hint, next);
  el.append(head, compose, below, foot);

  function paint(s) {
    boxes.forEach((c) => { c.checked = s.sections.includes(c.value); });
    // Remember which stack button had focus, so a reorder does not drop the keyboard user.
    const a = document.activeElement;
    const keep = a && ol.contains(a) ? { id: a.closest('li')?.dataset.id, act: a.dataset.act } : null;
    ol.textContent = '';
    s.sections.forEach((id, i) => {
      const sec = sections.find((x) => x.id === id);
      const li = h('li'); li.dataset.id = id;
      const up = h('button', '', '↑'); up.type = 'button'; up.dataset.act = 'up'; up.setAttribute('aria-label', `${sec.label} 위로`); up.disabled = i === 0; up.addEventListener('click', () => store.moveSection(id, -1));
      const dn = h('button', '', '↓'); dn.type = 'button'; dn.dataset.act = 'dn'; dn.setAttribute('aria-label', `${sec.label} 아래로`); dn.disabled = i === s.sections.length - 1; dn.addEventListener('click', () => store.moveSection(id, 1));
      const rm = h('button', '', '✕'); rm.type = 'button'; rm.dataset.act = 'rm'; rm.setAttribute('aria-label', `${sec.label} 빼기`); rm.addEventListener('click', () => store.toggleSection(id));
      li.append(h('span', 'no', String(i + 1).padStart(2, '0')), h('span', 'nm', sec.label), up, dn, rm);
      ol.append(li);
    });
    empty.hidden = s.sections.length > 0;
    if (keep) {
      const li = ol.querySelector(`li[data-id="${CSS.escape(keep.id || '')}"]`);
      const btn = li && ([...li.querySelectorAll('button')].find((b) => b.dataset.act === keep.act && !b.disabled) || [...li.querySelectorAll('button')].find((b) => !b.disabled));
      (btn || boxes.find((c) => c.value === keep.id) || ol).focus?.({ preventScroll: true });
    }
    ch.querySelectorAll('input').forEach((r) => { r.checked = r.value === s.materials; });
    refInputs.forEach(({ w, inp, note }, i) => {
      if (note.value !== s.refNotes[i]) note.value = s.refNotes[i];
      if (inp.value !== s.refs[i]) inp.value = s.refs[i];
      const bad = !validRef(s.refs[i]);
      w.classList.toggle('is-err', bad);
      inp.setAttribute('aria-invalid', String(bad));
      inp.setAttribute('aria-describedby', bad ? `${inp.id}-err refs-help` : 'refs-help');
    });
    if (fileNote.value !== s.refFileNote) fileNote.value = s.refFileNote;
    const ok = s.sections.length > 0 && s.refs.every(validRef);
    next.disabled = !ok;
    hint.textContent = s.sections.length ? `${s.sections.length}개 섹션 · 갤러리 ${s.sections.includes('gallery') ? '포함' : '미포함'}` : '섹션을 하나 이상 고르세요';
  }
  paint(store.get()); paintFiles(store.get());
  store.subscribe((s, p, changed) => { if (changed.includes('refFiles')) { prune(s.refFiles); paintFiles(s); } if (changed.some((k) => ['sections', 'materials', 'refs', 'refNotes', 'refFiles', 'refFileNote', 'sampleId'].includes(k))) paint(s); });
  return flow;
}

export { validForm };
