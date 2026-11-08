/* The five steps: a row of step cards that act as tabs, and one panel area below. Panels are
   built once and shown with `hidden`, so the step 3 gallery keeps its state. */
import { doneSteps, validForm, validRef } from './store.js';
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
  const flowHint = h('p', 'flow-hint', '섹션마다 추천 화면이 골라져 있습니다. 바꾸고 싶은 섹션만 "다른 화면 고르기"로 고르세요.');
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
  matNote.append(h('b', '', '자료 올리기'), document.createTextNode('사진·영상은 여기서 첨부하지 않습니다. 접수가 끝나면 의뢰번호로 만든 전용 Google Drive 폴더 링크를 드리고, 그 폴더에 직접 올리시면 됩니다. 큰 영상도 크기 제한이 없습니다.'));
  mat.append(ch, matNote);
  const refs = h('div', 'field');
  refs.append(h('span', 'flabel', '참고할 레퍼런스 (최대 3개, 선택)'));
  const refHelp = h('p', 'help', '핀터레스트 핀, 마음에 드는 사이트, 인스타그램 게시물 주소를 붙여 넣으세요. 이미지 파일은 접수 후 Drive 폴더에 올려 주세요.');
  refHelp.id = 'refs-help';
  refs.append(refHelp);
  const refWrap = h('div', 'refs');
  const refInputs = [0, 1, 2].map((i) => {
    const w = h('div', 'field'); w.style.marginBottom = '0';
    const inp = h('input'); inp.type = 'url'; inp.id = `ref-${i + 1}`; inp.placeholder = ['https://pin.it/… 또는 https://www.pinterest.com/…', 'https://… 사이트 주소', 'https://… (선택)'][i]; inp.setAttribute('aria-label', `레퍼런스 ${i + 1}`); inp.maxLength = 300; inp.setAttribute('aria-describedby', 'refs-help');
    const err = h('div', 'ferr', 'https:// 로 시작하는 주소만 넣을 수 있습니다.'); err.id = `ref-${i + 1}-err`;
    inp.addEventListener('input', () => store.setRef(i, inp.value.trim()));
    w.append(inp, err); refWrap.append(w);
    return { w, inp };
  });
  refs.append(refWrap);
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
    refInputs.forEach(({ w, inp }, i) => {
      if (inp.value !== s.refs[i]) inp.value = s.refs[i];
      const bad = !validRef(s.refs[i]);
      w.classList.toggle('is-err', bad);
      inp.setAttribute('aria-invalid', String(bad));
      inp.setAttribute('aria-describedby', bad ? `${inp.id}-err refs-help` : 'refs-help');
    });
    const ok = s.sections.length > 0 && s.refs.every(validRef);
    next.disabled = !ok;
    hint.textContent = s.sections.length ? `${s.sections.length}개 섹션 · 갤러리 ${s.sections.includes('gallery') ? '포함' : '미포함'}` : '섹션을 하나 이상 고르세요';
  }
  paint(store.get());
  store.subscribe((s, p, changed) => { if (changed.some((k) => ['sections', 'materials', 'refs', 'sampleId'].includes(k))) paint(s); });
  return flow;
}

export { validForm };
