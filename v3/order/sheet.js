/* Sample request sheet. Rises from the button that opened it, follows a drag,
   and can be thrown closed. The site stays visible behind it. */

import { Spring, prefersReducedMotion } from '../core/spring.js';
import { drag, project, rubberband } from '../core/gesture.js';
import { LIMITS, buildBrief, renderBriefMd, sanitizeText, summarize, validateForm } from './brief.js';
import { api, newOrderIdentity, orderDocument, orderLink } from './api.js';

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
};

/* One attempt keeps one identity, so a retry can never create a second order. */
let attempt = null;
let draft = { siteName: '', email: '', oneLiner: '', refs: '', consent: false };
let context = null;
let saved = null;

function field(id, label, optional, input, help) {
  const wrap = el('div', { class: 'field', 'data-field': id });
  const lab = el('label', { for: `f-${id}`, text: label });
  if (optional) lab.append(el('span', { text: '선택' }));
  input.id = `f-${id}`;
  input.name = id;
  wrap.append(lab, input);
  if (help) wrap.append(el('p', { class: 'field-help', text: help }));
  wrap.append(el('p', { class: 'field-error', id: `e-${id}`, hidden: '' }));
  input.setAttribute('aria-describedby', `e-${id}`);
  return wrap;
}

function showErrors(root, errors) {
  root.querySelectorAll('[data-field]').forEach((f) => {
    const id = f.dataset.field;
    const msg = errors[id];
    const box = f.querySelector('.field-error');
    f.classList.toggle('has-error', !!msg);
    box.hidden = !msg;
    box.textContent = msg || '';
    f.querySelector('input,textarea')?.setAttribute('aria-invalid', String(!!msg));
  });
}

function moreInfo(catalog) {
  const { PRICE } = catalog;
  const dl = el('dl');
  dl.append(el('dt', { text: '포함' }), el('dd', { text: PRICE.includes }));
  for (const [k, v] of PRICE.extras) dl.append(el('dt', { text: k }), el('dd', { text: v }));
  const d = el('details', { class: 'more' });
  d.append(el('summary', { text: '포함 내용과 진행 순서' }), dl, el('p', { text: `접수 → 샘플 전달 → 확인 후 결제 → 섹션별 요청 반영. ${PRICE.payment}.` }));
  return d;
}

function renderForm(body) {
  const { catalog, getSelection } = context;
  body.textContent = '';
  const selection = getSelection();
  const siteName = el('input', { type: 'text', autocomplete: 'organization', maxlength: String(LIMITS.siteName), required: '' });
  const email = el('input', { type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: String(LIMITS.email), required: '' });
  const oneLiner = el('input', { type: 'text', maxlength: String(LIMITS.oneLiner), placeholder: '예: 도자기 작품을 소개하고 전시 문의를 받고 싶어요' });
  const refs = el('textarea', { rows: '2', placeholder: '핀터레스트나 마음에 드는 사이트 주소' });
  siteName.value = draft.siteName;
  email.value = draft.email;
  oneLiner.value = draft.oneLiner;
  refs.value = draft.refs;

  const consent = el('input', { type: 'checkbox' });
  consent.checked = draft.consent;
  const consentField = el('div', { class: 'field', 'data-field': 'consent' },
    el('label', { class: 'check' }, consent, el('span', { text: '샘플 전달과 연락을 위해 이메일을 수집·이용하는 데 동의합니다.' })),
    el('p', { class: 'field-error', hidden: '' }));

  const send = el('button', { type: 'submit', class: 'send', text: '샘플 요청하기' });
  const errorBox = el('p', { class: 'save-error', role: 'alert', hidden: '' });
  const form = el('form', { class: 'form', novalidate: '' },
    field('siteName', '사이트 이름', false, siteName),
    field('email', '이메일', false, email, '샘플을 이곳으로 보내드립니다.'),
    field('oneLiner', '어떤 사이트인가요', true, oneLiner),
    field('refs', '참고 링크', true, refs),
    consentField, errorBox, send,
    el('p', { class: 'price-line', text: `${catalog.PRICE.baseLabel} · ${catalog.PRICE.vat}. 샘플을 보고 결정하세요.` }),
    moreInfo(catalog));

  const read = () => ({ siteName: siteName.value, email: email.value, oneLiner: oneLiner.value, refs: refs.value, consent: consent.checked });
  form.addEventListener('input', () => { draft = read(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (send.disabled) return;
    draft = read();
    const errors = validateForm(draft);
    showErrors(form, errors);
    const first = Object.keys(errors)[0];
    if (first) {
      (first === 'consent' ? consent : form.querySelector(`#f-${first}`)).focus();
      return;
    }
    errorBox.hidden = true;
    send.disabled = true;
    send.textContent = '보내는 중…';
    try {
      // A retry after a lost answer: the first write may have landed. Rules forbid overwriting it,
      // so look before writing again and finish if it is already there.
      const existing = attempt ? await api().loadOrder(attempt.key).catch(() => null) : null;
      attempt = attempt || newOrderIdentity();
      const brief = buildBrief({ selection, form: draft, catalog, order: attempt });
      const summary = summarize(selection, catalog);
      const doc = orderDocument({ brief, md: renderBriefMd(brief), summary, order: attempt });
      if (!existing) await api().saveOrder(attempt.key, doc);
      // If the first write landed, that document is the order: show its contents, not the edited form.
      saved = existing
        ? { ...attempt, summary: String(existing.sample || summary), email: String(existing.email || brief.delivery.email) }
        : { ...attempt, summary, email: brief.delivery.email };
      attempt = null;
      draft = { siteName: '', email: '', oneLiner: '', refs: '', consent: false };
      renderDone(body);
    } catch (error) {
      console.error('[order]', error?.code || error?.message || 'save-failed');
      errorBox.hidden = false;
      errorBox.textContent = '저장하지 못했습니다. 입력 내용은 그대로 있습니다. 다시 보내 주세요.';
      send.disabled = false;
      send.textContent = '다시 보내기';
    }
  });

  body.append(
    el('h2', { id: 'sheet-title', text: '이 구성으로 샘플을 만들어 드릴게요' }),
    el('p', { class: 'recap', text: summarize(selection, catalog) }),
    form,
  );
  return siteName;
}

function renderDone(body) {
  body.textContent = '';
  const link = orderLink(saved.key);
  const linkInput = el('input', { type: 'text', readonly: '', 'aria-label': '내 의뢰 링크' });
  linkInput.value = link;
  const copy = el('button', { type: 'button', class: 'ghost', text: '복사' });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = '복사됨';
    } catch {
      linkInput.select();
      copy.textContent = '직접 복사해 주세요';
    }
  });
  const folder = el('p', { class: 'status-line', text: '자료를 올릴 폴더를 준비하고 있습니다.' });
  const close = el('button', { type: 'button', class: 'ghost', text: '닫기' });
  close.addEventListener('click', () => closeSheet());

  body.append(el('div', { class: 'done' },
    el('h2', { id: 'sheet-title', text: '접수되었습니다' }),
    el('p', { class: 'done-no', text: saved.displayNo }),
    el('p', { class: 'recap', text: saved.summary }),
    el('ol', { class: 'steps' },
      el('li', { text: `샘플이 준비되면 ${saved.email}로 보내드립니다.` }),
      el('li', { text: '샘플을 보고 진행을 결정하시면 결제 방법을 안내합니다.' }),
      el('li', { text: '결제 후 아래 링크에서 섹션별 요청을 받습니다.' })),
    el('div', { class: 'field' },
      el('label', { text: '내 의뢰 링크', for: 'done-link' }),
      el('div', { class: 'done-link' }, linkInput, copy),
      el('p', { class: 'field-help', text: '이 링크를 아는 사람은 의뢰 내용을 볼 수 있으니 공유하지 마세요.' })),
    folder, close));
  linkInput.id = 'done-link';

  const order = saved;
  api().requestFolder?.(order.key)
    .then((url) => {
      if (saved !== order) return;
      if (url) {
        folder.textContent = '';
        folder.append('자료는 ', el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: '전용 Drive 폴더' }), '에 올려 주세요.');
      } else {
        folder.textContent = '자료를 올릴 곳은 샘플과 함께 이메일로 안내합니다.';
      }
    })
    .catch(() => {
      if (saved === order) folder.textContent = '접수는 완료되었습니다. 자료를 올릴 곳은 이메일로 안내합니다.';
    });
}

/* ---------- motion ---------- */
let y = null;
let height = 0;

function closedY() {
  return height + 32;
}

function ensureSpring(sheet) {
  if (y) return;
  y = new Spring({
    value: 0,
    damping: 1,
    response: 0.34,
    precision: 0.3,
    onChange: (v) => {
      sheet.style.transform = `translate3d(0,${v}px,0)`;
      const scrim = context?.scrim;
      if (scrim) scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - v / closedY())));
    },
    onRest: (v) => { if (v !== 0) finishClose(); },
  });
}

let previousFocus = null;
let removeGesture = null;
let grabbedAt = 0;

function finishClose() {
  const { sheet, scrim, inertTargets, onClose } = context;
  sheet.hidden = true;
  scrim.hidden = true;
  inertTargets.forEach((t) => { t.inert = false; });
  context.capsule.classList.remove('is-away');
  document.removeEventListener('keydown', onKey);
  removeGesture?.();
  removeGesture = null;
  onClose?.();
  previousFocus?.focus?.();
  saved = null;
}

export function closeSheet(velocity = 0) {
  if (!context || context.sheet.hidden) return;
  height = context.sheet.getBoundingClientRect().height;
  if (prefersReducedMotion()) {
    y.set(closedY());
    finishClose();
    return;
  }
  y.to(closedY(), { velocity, damping: velocity > 400 ? 0.9 : 1 });
}

function onKey(e) {
  if (e.key === 'Escape') {
    closeSheet();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = [...context.sheet.querySelectorAll('button,a[href],input,textarea,summary')].filter((n) => !n.disabled && n.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function openSheet(ctx) {
  context = ctx;
  const { sheet, scrim, inertTargets, onOpen, capsule, trigger } = ctx;
  previousFocus = trigger;
  sheet.textContent = '';
  const grip = el('div', { class: 'sheet-grip', 'aria-hidden': 'true' });
  const body = el('div', { class: 'sheet-body' });
  sheet.append(grip, body);
  sheet.hidden = false;
  scrim.hidden = false;
  capsule.classList.add('is-away');
  inertTargets.forEach((t) => { t.inert = true; });
  const firstInput = saved ? null : renderForm(body);
  if (saved) renderDone(body);
  height = sheet.getBoundingClientRect().height;

  ensureSpring(sheet);
  document.addEventListener('keydown', onKey);
  onOpen?.();

  if (prefersReducedMotion()) {
    y.set(0);
    sheet.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
  } else {
    if (!y.active) y.set(closedY());
    y.to(0, { damping: 1 });
  }
  // On touch, wait for the sheet to land so the keyboard does not fight the spring.
  if (firstInput && matchMedia('(pointer: fine)').matches) firstInput.focus({ preventScroll: true });
  else sheet.querySelector('button,input')?.blur?.();

  scrim.onclick = () => closeSheet();

  removeGesture = drag(grip, {
    axis: 'y',
    threshold: 2,
    // Grabbing a sheet that is still rising continues from where it is.
    onStart: () => { height = context.sheet.getBoundingClientRect().height; grabbedAt = y.value; y.stop(); },
    onMove: ({ dy }) => {
      const next = grabbedAt + dy;
      y.set(next < 0 ? rubberband(next, height) : next);
    },
    onEnd: ({ vy, moved }) => {
      if (!moved) return;
      const resting = Math.max(0, y.value) + project(vy);
      if (resting > height * 0.5 && vy >= 0) closeSheet(vy);
      else y.to(0, { velocity: vy });
    },
  });
}

export { sanitizeText };
