import { validForm, formOk, doneSteps, total } from './store.js';
import { GALLERIES, CONCEPTS } from '../v3/catalog.js';
import { api, DRIVE_URL_RE } from '../v3/order/api.js';
import { summaryText, submitOrder, parseLookup, orderPageLink, uploadRefFiles, refsOut } from './order.js';
import { getFile } from './ref-files.js';

/** Per saved order key: the request as sent and its pinned File objects, for a retry in this page load. */
const sentFiles = new Map();
import { findPart, pickLabel, clip, KEEP_IDS, KEEP_LABELS, NOTE_MAX } from './parts.js';

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const button = (text, fn, cls = 'btn btn-line') => { const b = h('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; };
const link = (text, href) => { const a = h('a', '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
const gallery = (s) => s.gallery === 'auto' ? '제작자에게 맡기기' : GALLERIES.find((g) => g.id === s.gallery)?.name || '';
const workSet = (sample) => CONCEPTS.find((c) => c.id === (sample?.concept || 'atelier'))?.name || '';
async function copy(text, toast) { try { await navigator.clipboard.writeText(text); toast('복사했습니다.'); } catch { toast('복사하지 못했습니다.'); } }

export function renderPanel2(el, { store, data, go }) {
  el.textContent = ''; const head = h('div', 'panel-head'); const line = h('p'); head.append(h('h3', '', '최소 입력'), line);
  const note = h('p', 'note'); const backSample = button('샘플 선택으로 돌아가기', () => go(1)); note.append('샘플을 먼저 선택해 주세요. ', backSample);
  const grid = h('div', 'form-grid'); const touched = {}; const inputs = {};
  for (const [key, label, type, placeholder, max, error] of [
    ['email', '이메일 *', 'email', 'sample@example.com', 120, '이메일 형식을 확인해 주세요.'],
    ['siteName', '사이트 이름 *', 'text', '예: 도예공방 흙과불', 80, '사이트 이름을 입력해 주세요.'],
    ['oneLiner', '목적 한 줄 *', 'text', '예: 전시 문의를 받는 것', 200, '목적을 한 줄로 입력해 주세요.'],
    ['name', '이름 (선택)', 'text', '이름 또는 브랜드명', 40, '이름은 40자까지 입력할 수 있습니다.']]) {
    const wrap = h('div', 'field'); const lab = h('label', 'flabel', label); const input = h('input'); input.id = `v4-${key}`; lab.htmlFor = input.id; input.type = type; input.placeholder = placeholder; input.maxLength = max;
    if (key !== 'name') input.required = true;
    input.autocomplete = { email: 'email', name: 'name', siteName: 'organization', oneLiner: 'off' }[key];
    const err = h('div', 'ferr', error); err.id = `${input.id}-error`;
    input.addEventListener('input', () => store.setField(key, input.value)); input.addEventListener('blur', () => { touched[key] = true; paint(store.get()); });
    wrap.append(lab, input, err); grid.append(wrap); inputs[key] = { input, wrap };
  }
  // The next button stays reachable while the form is incomplete: pressing it shows the errors and moves focus to the first one.
  const foot = h('div', 'panel-foot'); const next = button('다음: 프로토타입 구성안', () => { Object.keys(inputs).forEach((k) => { touched[k] = true; }); paint(store.get()); const valid = validForm(store.get().form); const first = Object.keys(inputs).find((k) => !valid[k]); if (first) inputs[first].input.focus(); else go(3); }, 'btn btn-ink');
  foot.append(button('이전', () => go(1)), next); el.append(head, note, grid, foot);
  function paint(s) { const chosen = data.samples.find((x) => x.id === s.sampleId); line.textContent = chosen ? `선택한 샘플: ${chosen.title}` : '샘플을 선택해 주세요.'; note.hidden = !!chosen; const valid = validForm(s.form); for (const [key, { input, wrap }] of Object.entries(inputs)) { if (input.value !== s.form[key]) input.value = s.form[key]; const bad = !!touched[key] && !valid[key]; wrap.classList.toggle('is-err', bad); input.setAttribute('aria-invalid', String(bad)); if (bad) input.setAttribute('aria-describedby', `${input.id}-error`); else input.removeAttribute('aria-describedby'); } next.setAttribute('aria-disabled', String(!formOk(s.form))); }
  paint(store.get()); store.subscribe((s, p) => { if (p.order?.saved && !s.order) Object.keys(touched).forEach((k) => delete touched[k]); paint(s); });
}

export function renderPanel4(el, ctx) {
  const { store, data, sections, parts = null, toast, go } = ctx;
  const jumpTo = (id) => (ctx.goToSection ? ctx.goToSection(id) : go(3));
  el.textContent = ''; const head = h('div', 'panel-head'); head.append(h('h3', '', '정리와 가격'), h('p', '', '선택한 구성과 예상 견적을 확인하세요.'));
  const sum = h('div', 'sum'); const boxes = {};
  for (const title of ['샘플', '기본 정보', '레퍼런스', '자료']) { const box = h('div', 'box'); box.append(h('h4', '', title)); const body = h('div'); box.append(body); sum.append(box); boxes[title] = body; }

  const picksSec = h('div', 'picks-sec');
  const picksHead = h('div', 'picks-head');
  picksHead.append(h('h4', 'picks-title', '고르신 구성'), h('p', 'picks-sub', '고르신 섹션과 순서가 맞는지 확인해 주세요. 섹션마다 바라는 점이 있으면 적어 주세요(선택).'));
  const lockedNote = h('p', 'note picks-locked', '접수된 내용입니다. 바꾸려면 새 요청을 시작하세요.'); lockedNote.hidden = true;
  const cardList = h('ol', 'pick-list');
  const emptyPicks = h('p', 'picks-empty', '아직 고른 섹션이 없습니다.'); emptyPicks.hidden = true;
  picksSec.append(picksHead, lockedNote, cardList, emptyPicks);

  const cards = new Map();
  let drawnOrder = [];
  const flushAll = () => cards.forEach((c) => c.flush());

  function makeCard(id) {
    const isGallery = id === 'gallery';
    const li = h('li', 'pick-card'); li.dataset.section = id;
    const media = h('div', 'pick-media');
    const cBody = h('div', 'pick-body');
    const top = h('div', 'pick-top');
    const noEl = h('span', 'pick-no');
    const titleEl = h('strong', 'pick-title');
    const fixBtn = button('고치기', () => { flushAll(); jumpTo(id); }, 'btn btn-line btn-sm pick-fix');
    fixBtn.dataset.fix = '';
    top.append(noEl, titleEl, fixBtn);

    const srcEl = h('p', 'pick-src');
    const videoEl = h('p', 'pick-video-note'); videoEl.hidden = true; videoEl.dataset.videoNote = '';
    cBody.append(top, srcEl, videoEl);

    let autoEl = null;
    let keepWrap = null;
    let chipsGroup = null;
    const chipBtns = new Map();
    if (isGallery) {
      autoEl = h('p', 'pick-auto', '미리보기는 집중형 예시입니다. 실제 구도는 자료를 보고 정해 드립니다.');
      cBody.append(autoEl);
    } else {
      keepWrap = h('div', 'pick-keep');
      const keepHead = h('div', 'pick-keep-head');
      keepHead.append(h('span', 'pick-keep-label', '반영할 점'), h('span', 'pick-keep-hint', '이 화면에서 가져오고 싶은 것을 고르세요'));
      chipsGroup = h('div', 'pick-chips'); chipsGroup.setAttribute('role', 'group');
      for (const k of KEEP_IDS) {
        const b = button(KEEP_LABELS[k], () => { flushAll(); store.toggleKeep(id, k); }, 'pick-chip');
        b.dataset.keep = k;
        b.setAttribute('aria-pressed', 'false');
        chipsGroup.append(b);
        chipBtns.set(k, b);
      }
      keepWrap.append(keepHead, chipsGroup);
      cBody.append(keepWrap);
    }

    const noteWrap = h('div', 'pick-note-wrap');
    const panelId = `v4-note-panel-${id}`;
    const noteId = `v4-note-${id}`;
    const initState = store.get();
    const initNote = isGallery ? initState.galleryNote : (initState.picks?.[id]?.note ?? '');
    let open = Boolean(initNote);
    let timer = null;
    let composing = false;

    const notePanel = h('div', 'pick-note-panel'); notePanel.id = panelId; notePanel.hidden = !open;
    const setOpen = (next) => {
      open = next;
      toggleBtn.setAttribute('aria-expanded', String(open));
      notePanel.hidden = !open;
    };
    const toggleBtn = button('의견 추가', () => setOpen(!open), 'pick-note-toggle');
    toggleBtn.dataset.noteToggle = '';
    toggleBtn.setAttribute('aria-expanded', String(open));
    toggleBtn.setAttribute('aria-controls', panelId);

    const noteHead = h('div', 'pick-note-head');
    const noteLab = h('label', 'pick-note-label', '이 섹션에 바라는 점'); noteLab.htmlFor = noteId;
    const countEl = h('span', 'pick-note-count', `${initNote.length}/${NOTE_MAX}`);
    noteHead.append(noteLab, countEl);

    const textarea = h('textarea', 'pick-note');
    textarea.id = noteId; textarea.dataset.note = ''; textarea.rows = 3; textarea.maxLength = NOTE_MAX;
    textarea.placeholder = '예: 사진은 크게, 글은 두 줄 이내로';
    textarea.value = initNote;

    const cancelTimer = () => { if (timer != null) { clearTimeout(timer); timer = null; } };
    const commit = () => {
      const cur = store.get();
      if (cur.order?.saved) return;
      const val = clip(textarea.value);
      const prevVal = isGallery ? cur.galleryNote : (cur.picks?.[id]?.note ?? '');
      if (val === prevVal) return;
      if (isGallery) store.setGalleryNote(val);
      else store.setNote(id, val);
    };
    const flush = () => {
      if (composing || timer == null) return;
      cancelTimer();
      commit();
    };

    textarea.addEventListener('compositionstart', () => { composing = true; cancelTimer(); });
    textarea.addEventListener('compositionend', () => {
      composing = false;
      cancelTimer();
      countEl.textContent = `${textarea.value.length}/${NOTE_MAX}`;
      commit();
    });
    textarea.addEventListener('input', (e) => {
      countEl.textContent = `${textarea.value.length}/${NOTE_MAX}`;
      if (composing || e.isComposing) return;
      cancelTimer();
      timer = setTimeout(() => { timer = null; if (!composing) commit(); }, 400);
    });
    textarea.addEventListener('blur', () => { composing = false; cancelTimer(); commit(); });

    notePanel.append(noteHead, textarea);
    noteWrap.append(toggleBtn, notePanel);
    cBody.append(noteWrap);
    li.append(media, cBody);

    let drawnMediaKey = null;
    function update(s, idx) {
      const label = sections.find((x) => x.id === id)?.label || id;
      const saved = !!s.order?.saved;
      noEl.textContent = String(idx + 1).padStart(2, '0');
      titleEl.textContent = label;
      fixBtn.setAttribute('aria-label', `${label} 구성 고치기`);
      fixBtn.hidden = saved;

      if (isGallery) {
        const sample = data.samples.find((x) => x.id === s.sampleId);
        const layoutLabel = gallery(s);
        const setLabel = workSet(sample);
        const mediaKey = `gallery:${layoutLabel}:${setLabel}`;
        if (drawnMediaKey !== mediaKey) {
          drawnMediaKey = mediaKey;
          media.textContent = '';
          const gBox = h('div', 'pick-empty is-gallery'); gBox.setAttribute('aria-hidden', 'true');
          gBox.append(h('span', 'pick-empty-sub', '실시간 갤러리'), h('b', 'pick-empty-main', layoutLabel));
          media.append(gBox);
        }
        srcEl.textContent = `구도: ${layoutLabel} · 작품 세트: ${setLabel}`;
        autoEl.hidden = s.gallery !== 'auto';
      } else {
        const pick = s.picks?.[id];
        const ref = pick?.ref || 'new';
        const part = parts && ref !== 'new' ? findPart(parts, id, ref) : null;
        const partSample = part ? data.samples.find((x) => x.id === part.sampleId) : null;
        const alt = part ? `${partSample?.title || '샘플'}의 ${label} 화면` : '';
        const mediaKey = part ? `part:${part.ref}:${alt}` : 'new';
        if (drawnMediaKey !== mediaKey) {
          drawnMediaKey = mediaKey;
          media.textContent = '';
          if (part) {
            const img = h('img', 'pick-thumb');
            img.src = `./${part.thumb}`;
            img.width = 640;
            img.height = part.w && part.h ? Math.round((640 * part.h) / part.w) : 400;
            img.alt = alt;
            img.loading = 'lazy'; img.decoding = 'async';
            media.append(img);
          } else {
            const empty = h('div', 'pick-empty');
            empty.append(h('span', 'pick-empty-main', '새로 구성'));
            media.append(empty);
          }
        }
        srcEl.textContent = part ? `${pickLabel(label, pick, data.samples, parts)} 참고` : '제작 때 새로 만듭니다';
        // The video scene: what the option means and whether it is on.
        videoEl.hidden = !part?.video;
        if (part?.video) videoEl.textContent = `${parts.motion?.videoNote || '영상 옵션과 함께 제작합니다.'}${s.extras.video ? '' : ' 지금은 영상 옵션이 꺼져 있어, 켜야 이 장면으로 제작됩니다.'}`;
        keepWrap.hidden = !part;
        chipsGroup.setAttribute('aria-label', `${label} 반영할 점`);
        const keep = Array.isArray(pick?.keep) ? pick.keep : [];
        for (const [k, b] of chipBtns) {
          b.setAttribute('aria-pressed', String(keep.includes(k)));
          b.disabled = saved;
        }
      }

      const stateNote = isGallery ? s.galleryNote : (s.picks?.[id]?.note ?? '');
      textarea.readOnly = saved;
      if (stateNote && !open) setOpen(true);
      else if (!s.sampleId && s.step === 1 && !stateNote && open && document.activeElement !== textarea) setOpen(false);
      if (document.activeElement !== textarea && timer == null) {
        if (textarea.value !== stateNote) textarea.value = stateNote;
        countEl.textContent = `${textarea.value.length}/${NOTE_MAX}`;
      }
    }

    return { li, update, flush, cancelTimer };
  }

  const priceHead = h('h4', '', '기본 구성 500,000원'); const table = h('table', 'price'); const body = h('tbody'); table.append(body);
  const rows = ['히어로 1개 (모션 20초 내/이미지 연출)', '', '한국어/영어', 'Firebase 배포+도메인 연결 (도메인 구입 별도)', '유지보수 1년 무료'];
  const pageCell = h('td'); rows.forEach((label, i) => { const tr = h('tr'); const td = i === 1 ? pageCell : h('td', '', label); tr.append(td, h('td', 'r', '포함')); body.append(tr); });
  const baseRow = h('tr'); baseRow.append(h('td', '', '기본 구성 합계'), h('td', 'r', '500,000원')); body.append(baseRow);
  const optionHead = h('h4', '', '추가 옵션 단가'); const options = h('table', 'price'); const ob = h('tbody'); options.append(ob);
  for (const [a, b] of [['추가 페이지', '장당 100,000원'], ['영상 기반 모션 그래픽 30초', '200,000원'], ['추가 수정 (기본 2회 포함)', '회당 50,000원'], ['PG 연동·회원제·예약시스템', '추후 오픈']]) { const tr = h('tr'); tr.append(h('td', '', a), h('td', 'r', b)); ob.append(tr); }
  const calc = h('div', 'calc'); const counts = {};
  for (const [key, title] of [['pages', '추가 페이지'], ['revisions', '추가 수정']]) { const row = h('div', 'calc-row'); const ctl = h('div', 'ctl'); const output = h('output'); const minus = button('−', () => store.setExtra(key, Math.max(0, store.get().extras[key] - 1)), ''); const plus = button('+', () => store.setExtra(key, Math.min(20, store.get().extras[key] + 1)), ''); minus.setAttribute('aria-label', `${title} 줄이기`); plus.setAttribute('aria-label', `${title} 늘리기`); ctl.append(minus, output, plus); row.append(h('span', '', title), ctl); calc.append(row); counts[key] = { output, minus, plus }; }
  const videoRow = h('label', 'calc-row'); const video = h('input'); video.type = 'checkbox'; video.addEventListener('change', () => store.setExtra('video', video.checked)); videoRow.append(h('span', '', '영상 기반 모션 그래픽 30초'), video); calc.append(videoRow);
  const totalRow = h('div', 'calc-total'); const amount = h('span', 'amt'); totalRow.append(h('span', '', '예상 합계 · VAT 별도'), amount); calc.append(totalRow);
  const quote = h('pre', 'quote'); const actions = h('div', 'pick-quote-actions');
  actions.append(
    button('견적 요약 복사', () => { flushAll(); copy(summaryText(store.get(), data, sections, parts), toast); }),
    button('견적 다운로드', () => { flushAll(); const url = URL.createObjectURL(new Blob([summaryText(store.get(), data, sections, parts)], { type: 'text/plain;charset=utf-8' })); const a = h('a'); a.href = url; a.download = '견적 요약.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }),
  );
  const foot = h('div', 'panel-foot');
  foot.append(button('이전', () => { flushAll(); go(3); }), button('다음: 샘플 제작 요청', () => { flushAll(); go(5); }, 'btn btn-ink'));
  el.append(head, sum, picksSec, priceHead, table, optionHead, options, calc, actions, quote, foot);

  function paint(s) {
    const sample = data.samples.find((x) => x.id === s.sampleId);
    boxes['샘플'].textContent = sample ? `${sample.title} · ${data.topics.find((t) => t.id === sample.topic)?.name || sample.topic}` : '없음';
    boxes['기본 정보'].textContent = `${s.form.siteName} · ${s.form.oneLiner} · ${s.form.email}`;
    // The same cleaned values the order sends (a blank note reads as none).
    const refs = boxes['레퍼런스']; refs.textContent = ''; const ul = h('ul'); const r = refsOut(s);
    r.refs.forEach((url, i) => { if (!url) return; const li = h('li', '', url); if (r.notes[i]) li.append(h('span', 'ref-note', ` — 참고: ${r.notes[i]}`)); ul.append(li); });
    if (r.files.length) { const li = h('li', 'ref-files-sum', `참고 이미지 ${r.files.length}개: ${r.files.map((f) => f.name).join(', ')}`); if (r.fileNote) li.append(document.createTextNode(` — 참고: ${r.fileNote}`)); ul.append(li); }
    if (ul.children.length) refs.append(ul); else refs.textContent = '없음';
    boxes['자료'].textContent = s.materials === 'have' ? '있음' : '없음';

    const orderChanged = s.sections.length !== drawnOrder.length || s.sections.some((id, i) => id !== drawnOrder[i]);
    if (orderChanged) {
      for (const [id, card] of cards) {
        if (!s.sections.includes(id)) { card.cancelTimer(); card.li.remove(); cards.delete(id); }
      }
      s.sections.forEach((id, i) => {
        let card = cards.get(id);
        if (!card) { card = makeCard(id); cards.set(id, card); }
        if (cardList.children[i] !== card.li) cardList.insertBefore(card.li, cardList.children[i] || null);
      });
      drawnOrder = [...s.sections];
    }
    s.sections.forEach((id, i) => cards.get(id)?.update(s, i));
    cardList.hidden = s.sections.length === 0;
    emptyPicks.hidden = s.sections.length > 0;
    lockedNote.hidden = !s.order?.saved;

    pageCell.textContent = `원페이지 (선택 섹션 ${s.sections.length}개)`;
    // After submission step 4 is a receipt: nothing here may change (an edit would detach the order).
    const locked = !!s.order?.saved;
    for (const [key, c] of Object.entries(counts)) { c.output.textContent = s.extras[key]; c.minus.disabled = locked || s.extras[key] <= 0; c.plus.disabled = locked || s.extras[key] >= 20; }
    video.checked = s.extras.video; video.disabled = locked;
    amount.textContent = `${total(s.extras).toLocaleString('ko-KR')}원`;
    quote.textContent = summaryText(s, data, sections, parts);
  }
  paint(store.get());
  store.subscribe((s, p, changed = []) => {
    if (p?.step === 4 && s.step !== 4) {
      if (changed.includes('picks') || changed.includes('galleryNote')) cards.forEach((c) => c.cancelTimer());
      else queueMicrotask(flushAll);
    }
    paint(s);
  });
}

export function renderPanel5(el, { store, data, sections, parts = null, toast, go }) {
  el.textContent = ''; const head = h('div', 'panel-head'); const recap = h('p'); head.append(h('h3', '', '샘플 제작 요청'), recap);
  const consent = h('label', 'consent'); const check = h('input'); check.type = 'checkbox'; check.addEventListener('change', () => store.setConsent(check.checked)); const consentText = h('span'); consentText.append(h('b', '', '개인정보 수집·이용 동의'), document.createElement('br'), document.createTextNode('접수 처리와 샘플 발송, 이메일 소통을 위해 이름·이메일을 수집하는 데 동의합니다.')); consent.append(check, consentText);
  // The status region is always rendered (an element under display:none is not a live region): when empty
  // it is only visually hidden.
  const status = h('div', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const SR_ONLY = 'position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;padding:0';
  status.style.cssText = SR_ONLY;
  const result = h('div'); result.tabIndex = -1; result.setAttribute('role', 'region'); result.setAttribute('aria-label', '접수 결과');
  let busy = false; let error = ''; let lastStatus = ''; let drawnKey = null; let drawnUploads = null; let uploadStatus = ''; let notice = ''; let retrying = false;
  /** Upload progress text, then the outcome: the order is accepted either way. */
  const outcome = (uploads) => { const bad = uploads.filter((u) => !u.ok).length; return bad ? `접수되었습니다. 참고 이미지 ${uploads.length - bad}개를 올렸고 ${bad}개는 올리지 못했습니다.` : `접수되었습니다. 참고 이미지 ${uploads.length}개를 모두 올렸습니다.`; };
  async function send() { if (busy || store.get().order?.saved) return; const done = doneSteps(store.get()); if (!done[1] || !done[2] || !done[3] || !store.get().consent) return; busy = true; error = ''; notice = ''; paint(store.get());
    // The chosen files are pinned now: removing one in step 3 while the save runs must not lose its bytes.
    const before = store.get(); const pinned = new Map(before.refFiles.map((f) => [f.id, getFile(f.id)]));
    try { const { sentState, ...order } = await submitOrder({ state: before, data, sections, parts, onStatus: (order) => store.setOrder(order) });
      // A recovered retry returns what the server already held; that, not the form, is the request.
      const sent = sentState || before;
      // Edits made while the save was in flight are not in the stored order: put back what was sent, so
      // step 3/4 and the receipt show exactly the saved request.
      const SENT = ['sampleId', 'form', 'materials', 'sections', 'gallery', 'picks', 'galleryNote', 'refs', 'refNotes', 'refFiles', 'refFileNote', 'extras', 'videoAuto'];
      if (SENT.some((k) => store.get()[k] !== sent[k])) { store.set(Object.fromEntries(SENT.map((k) => [k, sent[k]]))); toast('접수 중 바꾼 내용은 반영되지 않았습니다. 접수된 내용으로 되돌렸습니다.'); } else toast('접수되었습니다.');
      const ref = refsOut(sent);
      // Each file starts as pending: a reload during the upload reads it as not uploaded (normalize keeps ok only).
      const pending = ref.files.map((f, i) => ({ name: ref.names[i], original: String(f.name).slice(0, 120), ok: false, pending: true }));
      store.set({ consent: true }); store.setOrder(pending.length ? { ...order, uploads: pending } : order);
      if (pending.length) {
        sentFiles.set(order.key, { state: sent, get: (id) => pinned.get(id) || null });
        uploadStatus = `참고 이미지를 올리는 중입니다… (0/${pending.length})`; paint(store.get());
        const uploads = await uploadRefFiles({ key: order.key, state: sent, getFile: (id) => pinned.get(id) || null, onProgress: (n) => { uploadStatus = `참고 이미지를 올리는 중입니다… (${n}/${pending.length})`; paint(store.get()); } });
        uploadStatus = ''; notice = outcome(uploads);
        // An edit during the upload detached this order (a changed request is a new one): never put it back.
        const cur = store.get().order; if (cur?.key === order.key) store.setOrder({ ...cur, uploads });
      } } catch (e) { error = e.message; } finally { busy = false; paint(store.get()); } }
  async function retryUploads(order, failedNames) {
    const entry = sentFiles.get(order.key); if (retrying || !entry) return;
    retrying = true; notice = `참고 이미지 ${failedNames.length}개를 다시 올리는 중입니다…`; paint(store.get());
    try {
      const updated = await uploadRefFiles({ key: order.key, state: entry.state, getFile: entry.get, only: failedNames });
      const cur = store.get().order;
      // Not retrying any more before the redraw, so the new retry button is enabled and can take focus.
      retrying = false;
      if (cur?.key === order.key) { const uploads = cur.uploads.map((item) => updated.find((u) => u.name === item.name) || item); notice = outcome(uploads); store.setOrder({ ...cur, uploads }); }
    } finally { retrying = false; paint(store.get()); }
  }
  const foot = h('div', 'panel-foot'); const submit = button('이대로 샘플 제작 요청', send, 'btn btn-ink'); submit.dataset.submit = ''; const again = button('새 요청 시작', () => { error = ''; notice = ''; store.reset(); }, 'btn btn-line'); again.hidden = true; foot.append(button('이전', () => go(4)), again, submit); el.append(head, consent, status, result, foot);
  function paint(s) {
    const sample = data.samples.find((x) => x.id === s.sampleId); recap.textContent = `${sample?.title || '샘플 미선택'} · ${s.form.siteName || '사이트 이름 미입력'} · ${total(s.extras).toLocaleString('ko-KR')}원 (VAT 별도)`; check.checked = s.consent; const done = doneSteps(s);
    const saved = !!s.order?.saved;
    submit.hidden = saved; again.hidden = !saved; again.disabled = busy || retrying; submit.disabled = busy || !done[1] || !done[2] || !done[3] || !s.consent; consent.hidden = saved;
    const text = busy ? (uploadStatus || '서버에 저장 중입니다…') : error || (saved ? notice || '접수되었습니다.' : '');
    status.style.cssText = text ? '' : SR_ONLY; status.className = `status ${busy || retrying ? 'ing' : error ? 'err' : 'ok'}`;
    if (text !== lastStatus) { status.textContent = text; if (error && !busy) status.append(' ', button('다시 시도', send, 'btn btn-line btn-sm')); lastStatus = text; }
    if (!saved) { result.textContent = ''; drawnKey = null; drawnUploads = null; return; }
    const order = s.order; if (drawnKey === order.key && drawnUploads === order.uploads) return;
    const first = drawnKey !== order.key; const hadFocus = result.contains(document.activeElement) || document.activeElement === document.body;
    drawnKey = order.key; drawnUploads = order.uploads;
    result.textContent = '';
    const no = h('div', 'done-no', order.displayNo); const code = h('code', '', order.key); const codeLine = h('p'); codeLine.append(code, ' ', button('의뢰 코드 복사', () => copy(order.key, toast), 'btn btn-line btn-sm'));
    const drive = h('div', 'note'); drive.append(h('b', '', 'Drive 폴더'), document.createElement('br')); if (DRIVE_URL_RE.test(order.driveFolderUrl || '')) drive.append(link('Drive 폴더 열기', order.driveFolderUrl)); else drive.append('자료 폴더는 접수 처리 뒤 만들어지며, 주문 페이지와 안내 메일에서 확인할 수 있습니다.');
    // The summary frozen at submit time, never the current form; mailto gets the note-free short form.
    const summary = order.summary || `${summaryText(s, data, sections, parts)}\n의뢰 코드: ${order.key}`;
    const mailBody = `${summaryText(s, data, sections, parts, { notes: false })}\n의뢰 코드: ${order.key}`.slice(0, 1500).replace(/[\uD800-\uDBFF]$/, '');
    const mail = h('a', 'btn btn-line', '운영자에게 메일로 보내기'); mail.href = `mailto:getsite.yours@gmail.com?subject=${encodeURIComponent(`제작 요청 ${order.displayNo}`)}&body=${encodeURIComponent(mailBody)}`;
    result.append(h('h4', '', '접수 완료'), no, codeLine, link('내 주문 페이지 열기', orderPageLink(order.key)), drive, h('p', '', '접수되었습니다. 안내 메일은 서버에서 곧 발송됩니다. 메일이 오지 않으면 의뢰 코드로 진행 조회를 이용하세요. 이 코드와 링크는 꼭 보관하세요.'), button('접수 요약 복사', () => copy(summary, toast)), mail);
    let focusAfter = null;
    if (order.uploads?.length) {
      const uploads = h('div', 'uploads'); const list = h('ul'); const title = h('h5', '', '참고 이미지'); title.tabIndex = -1;
      order.uploads.forEach((item) => { const li = h('li', '', `${item.original} — ${item.pending ? '올리는 중' : item.ok ? '올림' : '실패'}`); li.dataset.ok = String(item.ok); if (item.pending) li.dataset.pending = ''; list.append(li); });
      uploads.append(title, list); focusAfter = title;
      const failed = order.uploads.filter((item) => !item.ok && !item.pending).map((item) => item.name);
      if (failed.length) {
        // A retry needs the bytes, which only this page load still holds.
        const entry = sentFiles.get(order.key); const r = entry ? refsOut(entry.state) : null;
        const again = r ? r.names.filter((n, i) => failed.includes(n) && entry.get(r.files[i].id)) : [];
        const can = again.length > 0;
        uploads.append(h('p', '', !can ? '올리지 못한 파일은 접수 후 받는 Drive 폴더에 올려 주세요.' : again.length === failed.length ? '올리지 못한 파일은 다시 시도하거나 Drive 폴더에 올려 주세요.' : `${again.length}개는 다시 올릴 수 있고, 나머지는 접수 후 받는 Drive 폴더에 올려 주세요.`));
        if (can) { const retry = button(`실패한 파일 다시 올리기 (${again.length}개)`, () => retryUploads(order, again), 'btn btn-line'); retry.dataset.retryUploads = ''; retry.disabled = retrying; uploads.append(retry); focusAfter = retry; }
      }
      result.append(uploads);
    }
    // Focus moves to the receipt once; a redraw for upload results keeps the keyboard user inside it.
    if (first) result.focus({ preventScroll: true });
    else if (hadFocus && focusAfter) focusAfter.focus({ preventScroll: true });
  }
  paint(store.get()); store.subscribe(paint);
}

export function mountLookup({ input, button: trigger, out }) {
  let seq = 0;
  async function lookup() { const parsed = parseLookup(input.value); out.textContent = ''; if (!parsed) { out.textContent = '전체 의뢰 코드를 입력해 주세요.'; return; } if (parsed.short) { out.textContent = '전체 의뢰 코드가 필요합니다. 접수 완료 화면이나 안내 메일의 코드 전체를 붙여 넣으세요.'; return; } const mine = ++seq; out.textContent = '조회 중입니다…'; trigger.disabled = true; try { const order = await api().loadOrder(parsed.key); if (mine !== seq) return; out.textContent = ''; if (!order) { out.textContent = '해당 코드의 주문을 찾을 수 없습니다'; return; } const dl = h('dl'); const add = (title, value) => { const dd = h('dd'); if (value instanceof Node) dd.append(value); else dd.textContent = value || '없음'; dl.append(h('dt', '', title), dd); }; let date = order.createdAt; if (typeof date?.toDate === 'function') date = date.toDate(); if (date instanceof Date) date = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR'); else if (date) date = String(date); add('의뢰번호', order.displayNo); add('사이트 이름', order.siteName); add('상태', order.status); add('접수 시각', date); add('Drive 폴더', DRIVE_URL_RE.test(order.driveFolderUrl || '') ? link('폴더 열기', order.driveFolderUrl) : '준비 중'); add('주문 페이지', link('주문 페이지 열기', orderPageLink(parsed.key))); out.append(dl); } catch { if (mine === seq) out.textContent = '조회에 실패했습니다. 다시 시도해 주세요.'; } finally { if (mine === seq) trigger.disabled = false; } }
  trigger.addEventListener('click', lookup); input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
}
