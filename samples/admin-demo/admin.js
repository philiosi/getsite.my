import { MODULES, PRESETS, modulesFor, seedFor, STORAGE_KEY, SESSION_KEY, IMAGE_MAX_BYTES, IMAGE_MAX_SIDE, SECTION_LABELS } from './schema.js';

const $ = (selector) => document.querySelector(selector);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const idFor = (moduleId) => `${moduleId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;
const sections = Object.keys(SECTION_LABELS);
let state;
let bootNotice = '';
const session = {
  get() { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } },
  set(on) { try { if (on) sessionStorage.setItem(SESSION_KEY, '1'); else sessionStorage.removeItem(SESSION_KEY); } catch { /* blocked storage: the session simply is not remembered */ } },
};
// Stored state goes through the same checks as an imported file; anything unreadable starts from the sample.
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) state = normalizeImport(JSON.parse(raw));
} catch { bootNotice = '저장된 데이터를 읽지 못해 샘플 데이터로 시작합니다.'; }
if (!state) state = seedFor('artist');
let current = 'basic';
let editorContext = null;
let deleteContext = null;
let editorTrigger = null;
let toastTimer;
let fieldSequence = 0;

function toast(message, error = false) {
  const node = $('#toast');
  node.classList.toggle('is-error', error);
  node.setAttribute('aria-live', error ? 'assertive' : 'polite');
  node.hidden = false;
  node.textContent = '';
  // Text set after the region is shown, so screen readers announce it.
  requestAnimationFrame(() => { node.textContent = message; });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; node.textContent = ''; }, error ? 4000 : 2400);
}
/** A selector that finds the same control again after a re-render. */
function focusKey(node) {
  if (!node) return null;
  if (node.dataset?.section) return `[data-section="${node.dataset.section}"]`;
  if (node.dataset?.module) return `.nav-item[data-module="${node.dataset.module}"]`;
  if (node.dataset?.edit !== undefined) return `[data-edit="${node.dataset.edit}"]`;
  if (node.dataset?.delete !== undefined) return `[data-edit="${node.dataset.delete}"]`;
  if (node.id) return `#${node.id}`;
  if (node.matches?.('.module-form button[type=submit]')) return '.module-form button[type=submit]';
  return null;
}
function refocus(key, fallback = '#main') {
  const target = (key && document.querySelector(key)) || document.querySelector(fallback) || $('#main');
  target.focus();
}
function save(next) {
  next.savedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    state = next;
    return true;
  } catch (error) {
    toast(error.name === 'QuotaExceededError' ? '저장 공간이 부족합니다. 사진 크기를 줄여 주세요.' : '저장하지 못했습니다.', true);
    return false;
  }
}
function showApp(show) {
  $('#login').hidden = show;
  $('#app').hidden = !show;
  if (show) { render(); $('#main').focus(); }
}
function activeModule() { return modulesFor(state.sections).find((m) => m.id === current); }
function render() {
  $('#presetSelect').value = state.preset;
  $('#siteName').textContent = state.data.basic.siteName || '이름 없는 사이트';
  renderSections();
  route();
}
function renderSections() {
  const container = $('#sectionToggles');
  container.querySelectorAll('.toggle-chip').forEach((node) => node.remove());
  for (const id of sections) {
    const label = el('label', 'toggle-chip');
    const input = el('input');
    input.type = 'checkbox'; input.dataset.section = id; input.checked = state.sections.includes(id);
    label.append(input, el('span', '', SECTION_LABELS[id]));
    container.append(label);
  }
  $('#sectionCount').textContent = `${state.sections.length}/13`;
}
function route() {
  const visible = modulesFor(state.sections);
  const requested = location.hash.slice(2);
  const module = visible.find((m) => m.id === requested) || visible[0];
  if (location.hash !== `#/${module.id}`) history.replaceState(null, '', `#/${module.id}`);
  current = module.id;
  const nav = $('#nav'); nav.replaceChildren();
  for (const item of visible) {
    const li = el('li');
    const button = el('button', 'nav-item'); button.type = 'button'; button.dataset.module = item.id;
    if (item.id === current) button.setAttribute('aria-current', 'page');
    button.append(el('span', 'nav-label', item.title));
    if (item.kind === 'list') button.append(el('span', 'count', String(state.data[item.id].length)));
    li.append(button); nav.append(li);
  }
  document.title = `${module.title} · 관리자 페이지 샘플`;
  $('#moduleTitle').textContent = module.title;
  $('#moduleHint').textContent = module.hint || '';
  const actions = $('#moduleActions'); actions.replaceChildren();
  const body = $('#moduleBody'); body.replaceChildren();
  if (module.kind === 'form') renderForm(module, body);
  if (module.kind === 'list') {
    if (module.canCreate !== false) {
      const add = el('button', 'btn btn-primary', module.addLabel); add.type = 'button'; add.id = 'addItem'; actions.append(add);
    }
    renderList(module, body);
  }
  if (module.kind === 'backup') renderBackup(body);
}
function setError(field, message) {
  const error = field.querySelector('.field-error');
  const control = field.querySelector('input, textarea, select');
  error.textContent = message; error.hidden = !message;
  error.setAttribute('role', message ? 'alert' : 'none');
  if (message) { control.setAttribute('aria-invalid', 'true'); control.setAttribute('aria-describedby', error.id); }
  else { control.removeAttribute('aria-invalid'); control.removeAttribute('aria-describedby'); }
}
function preview(container, value) {
  container.replaceChildren();
  if (!value) { container.append(el('span', 'img-empty', '이미지 없음')); return; }
  const img = el('img'); img.alt = ''; img.loading = 'lazy';
  img.addEventListener('error', () => container.replaceChildren(el('span', 'img-empty', '이미지 없음')), { once: true });
  img.src = value; container.append(img);
}
function fieldNode(field, value) {
  const wrap = el('div', `field${field.half ? ' field-half' : ''}${field.readonly ? ' is-readonly' : ''}${field.type === 'image' ? ' img-field' : ''}`);
  wrap.dataset.key = field.key;
  const id = `field-${++fieldSequence}`;
  if (field.type !== 'checkbox') { // a checkbox is named by its own .check label
    const label = el('label', '', field.label); label.htmlFor = id;
    if (field.required) label.append(' ', el('span', 'req', '*'));
    wrap.append(label);
  }
  let control;
  if (field.type === 'image') {
    const imagePreview = el('div', 'img-preview'); preview(imagePreview, value);
    const actions = el('div', 'img-actions');
    const choose = el('label', 'btn btn-ghost btn-sm', '사진 선택');
    control = el('input'); control.type = 'file'; control.accept = 'image/*'; control.id = id;
    choose.append(control);
    const clear = el('button', 'btn btn-danger-ghost btn-sm', '사진 삭제'); clear.type = 'button'; clear.dataset.clearImage = ''; clear.hidden = !value;
    actions.append(choose, clear); wrap.append(imagePreview, actions);
    wrap.dataset.imageValue = value || '';
  } else {
    control = el(field.type === 'textarea' ? 'textarea' : field.type === 'select' ? 'select' : 'input');
    control.id = id; control.name = field.key;
    if (field.type === 'select') {
      for (const option of field.options) { const node = el('option', '', option); node.value = option; control.append(node); }
      control.value = value ?? field.options[0];
    } else if (field.type === 'checkbox') {
      control.type = 'checkbox'; control.checked = Boolean(value);
    } else {
      if (control.tagName === 'INPUT') control.type = field.type;
      control.value = value ?? '';
    }
    if (field.required) control.setAttribute('aria-required', 'true');
    if (field.readonly) {
      if (field.type === 'select' || field.type === 'checkbox') control.disabled = true;
      else control.readOnly = true;
    }
    if (field.type === 'checkbox') {
      // The control remains associated with the field label and also has a clickable check label.
      const check = el('label', 'check'); check.append(control, document.createTextNode(field.label)); wrap.append(check);
    } else wrap.append(control);
  }
  const error = el('p', 'field-error'); error.id = `${id}-error`; error.hidden = true; wrap.append(error);
  return wrap;
}
function fillFields(container, module, values) {
  container.replaceChildren();
  for (const field of module.fields) container.append(fieldNode(field, values[field.key]));
}
function collect(container, module, original = {}) {
  const values = { ...original }; let firstInvalid = null;
  const busy = container.querySelector('.img-field[data-pending]');
  if (busy) { setError(busy, '사진을 처리하는 중입니다. 잠시 후 다시 저장해 주세요.'); busy.querySelector('input').focus(); return null; }
  for (const field of module.fields) {
    const wrap = [...container.querySelectorAll('.field')].find((node) => node.dataset.key === field.key);
    const control = wrap.querySelector('input, textarea, select');
    if (field.readonly) { values[field.key] = original[field.key] ?? ''; continue; } // shown only, saved as received
    let value = field.type === 'image' ? wrap.dataset.imageValue : field.type === 'checkbox' ? control.checked : control.value.trim();
    let message = '';
    if (field.type === 'number' && control.validity?.badInput) message = '숫자를 입력해 주세요.';
    else if (field.required && (value === '' || value === false)) message = '필수 항목을 입력해 주세요.';
    else if (value !== '' && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = '이메일 주소를 확인해 주세요.';
    else if (value !== '' && field.type === 'url' && !httpsUrl(value)) message = 'https://로 시작하는 올바른 주소를 입력해 주세요.';
    else if (value !== '' && field.type === 'number' && !/^-?\d+(\.\d+)?$/.test(value)) message = '숫자를 입력해 주세요.';
    if (field.type === 'number' && value !== '' && !message) value = Number(value);
    setError(wrap, message);
    if (message && !firstInvalid) firstInvalid = control;
    values[field.key] = value;
  }
  if (firstInvalid) { firstInvalid.focus(); return null; }
  return values;
}
function httpsUrl(value) {
  if (/\s/.test(value)) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname.includes('.'); } catch { return false; }
}
function renderForm(module, body) {
  const form = el('form', 'card module-form'); form.noValidate = true;
  const grid = el('div', 'form-grid'); fillFields(grid, module, state.data[module.id]);
  const foot = el('div', 'form-foot'); const submit = el('button', 'btn btn-primary', '저장하기'); submit.type = 'submit';
  foot.append(submit); form.append(grid, foot); body.append(form);
}
function sortedItems(module) {
  const items = [...state.data[module.id]];
  if (module.fields.some((field) => field.key === 'order')) items.sort((a, b) => {
    const av = a.order === '' || a.order == null ? Infinity : Number(a.order);
    const bv = b.order === '' || b.order == null ? Infinity : Number(b.order);
    return av - bv || 0;
  });
  else if (module.fields.some((field) => field.key === 'date')) items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return items;
}
function renderList(module, body) {
  const items = sortedItems(module);
  if (!items.length) { body.append(el('p', 'empty', '아직 등록된 항목이 없습니다.')); return; }
  const list = el('ul', 'list');
  const columns = module.columns.filter((key) => key !== 'image');
  for (const item of items) {
    const row = el('li', 'row'); row.dataset.id = item.id;
    if (module.columns.includes('image')) {
      const thumb = el('div', 'row-thumb');
      const empty = () => thumb.replaceChildren(el('span', 'thumb-empty', String(item[columns[0]] || '').charAt(0)));
      if (item.image) {
        const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.addEventListener('error', empty, { once: true }); img.src = item.image; thumb.append(img);
      } else empty();
      row.append(thumb);
    }
    const main = el('div', 'row-main'); main.append(el('strong', 'row-title', String(item[columns[0]] ?? '')));
    const sub = el('span', 'row-sub'); let count = 0;
    for (const key of columns.slice(1)) {
      const field = module.fields.find((f) => f.key === key); const value = item[key];
      if (field?.type === 'checkbox' && key === 'featured' && !value) continue;
      if (value === '' || value == null) continue;
      if (count++) sub.append(document.createTextNode(' · '));
      if (field?.type === 'checkbox') sub.append(el('span', 'badge', key === 'visible' ? (value ? '보임' : '숨김') : key === 'featured' ? '대표' : field.label));
      else if (key === 'status' && field?.type === 'select') sub.append(el('span', 'badge badge-status', String(value)));
      else sub.append(document.createTextNode(key === 'price' && Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('ko-KR')}원` : String(value)));
    }
    main.append(sub); row.append(main);
    const actions = el('div', 'row-actions');
    const edit = el('button', 'btn btn-ghost btn-sm', '수정'); edit.type = 'button'; edit.dataset.edit = item.id; actions.append(edit);
    if (module.canCreate !== false) { const del = el('button', 'btn btn-danger-ghost btn-sm', '삭제'); del.type = 'button'; del.dataset.delete = item.id; actions.append(del); }
    row.append(actions); list.append(row);
  }
  body.append(list);
}
function openEditor(module, item, trigger) {
  editorContext = { module, id: item?.id || null, original: item || {} }; editorTrigger = trigger;
  $('#editorTitle').textContent = `${module.title} ${item ? '수정' : '등록'}`;
  $('#editorDelete').hidden = !item || module.canCreate === false;
  const values = item || Object.fromEntries(module.fields.filter((f) => f.type === 'checkbox').map((f) => [f.key, f.key === 'visible']));
  fillFields($('#editorFields'), module, values); $('#editor').showModal();
}
function openConfirm(module, item) {
  deleteContext = { module, id: item.id };
  const titleKey = module.columns.find((key) => key !== 'image');
  $('#confirmText').textContent = `"${item[titleKey] ?? ''}" 항목을 삭제합니다.`;
  resetConfirm(); $('#confirm').showModal();
}
function resetConfirm() { $('#confirmStep').hidden = true; $('#confirmGo').textContent = '삭제 진행 (1/2)'; }
function renderBackup(body) {
  const grid = el('div', 'health-grid');
  for (const module of modulesFor(state.sections).filter((m) => m.kind !== 'backup')) {
    const item = el('div', 'health-item');
    const value = module.kind === 'list' ? `${state.data[module.id].length}건` : Object.values(state.data[module.id]).some((v) => v !== '' && v != null && v !== false) ? '입력됨' : '비어 있음';
    item.append(el('span', 'health-label', module.title), el('strong', 'health-value', value)); grid.append(item);
  }
  const actions = el('div', 'card backup-actions');
  for (const [id, text, style] of [['exportJson', 'JSON 내보내기', 'btn-primary'], ['importJson', 'JSON 불러오기', 'btn-ghost'], ['resetDemo', '샘플 데이터로 되돌리기', 'btn-danger-ghost']]) {
    const button = el('button', `btn ${style}`, text); button.type = 'button'; button.id = id; actions.append(button);
  }
  actions.append(el('p', 'backup-note', '데이터를 파일로 보관하거나 다시 불러올 수 있습니다.')); body.append(grid, actions);
}
/** Field values must be plain: text, number or boolean; an image is a data:image or same-site path. */
function checkValues(module, values) {
  for (const field of module.fields) {
    const v = values[field.key];
    // A list item needs its required fields; a form may still be empty (not filled in yet).
    if (module.kind === 'list' && field.required && !field.readonly && (v == null || v === '')) throw new Error('invalid');
    if (v == null || v === '') continue;
    if (!['string', 'number', 'boolean'].includes(typeof v)) throw new Error('invalid');
    if (field.type === 'image' && !(typeof v === 'string' && (/^data:image\/(jpeg|png|webp|gif);base64,/.test(v) || /^\/[\w./-]+$/.test(v)))) throw new Error('invalid');
  }
}
function normalizeImport(value) {
  if (!object(value) || value.version !== 1 || !PRESETS.some((p) => p.id === value.preset) || !Array.isArray(value.sections) || value.sections.some((id) => !sections.includes(id)) || !object(value.data)) throw new Error('invalid');
  const data = {};
  for (const module of MODULES) {
    if (module.kind === 'backup') continue;
    const entry = value.data[module.id];
    if (module.kind === 'list') {
      if (entry !== undefined && (!Array.isArray(entry) || entry.some((item) => !object(item)))) throw new Error('invalid');
      const seen = new Set();
      data[module.id] = (entry || []).map((item) => {
        checkValues(module, item);
        let id = typeof item.id === 'string' && /^[\w-]{1,60}$/.test(item.id) ? item.id : idFor(module.id);
        while (seen.has(id)) id = idFor(module.id);
        seen.add(id);
        return { ...item, id };
      });
    } else {
      if (entry !== undefined && !object(entry)) throw new Error('invalid');
      checkValues(module, entry || {});
      data[module.id] = entry || {};
    }
  }
  return { version: 1, preset: value.preset, sections: sections.filter((id) => value.sections.includes(id)), data, savedAt: value.savedAt || null };
}
async function readImage(input) {
  const wrap = input.closest('.field'); const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { setError(wrap, '이미지 파일만 올릴 수 있습니다.'); input.value = ''; return; }
  if (file.size > IMAGE_MAX_BYTES) { setError(wrap, '1.5MB 이하의 이미지 파일만 올릴 수 있습니다.'); input.value = ''; return; }
  const url = URL.createObjectURL(file);
  wrap.dataset.pending = ''; // saving waits until the picture is ready
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // JPEG has no transparency: keep it white, not black
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    wrap.dataset.imageValue = canvas.toDataURL('image/jpeg', 0.82);
    preview(wrap.querySelector('.img-preview'), wrap.dataset.imageValue); wrap.querySelector('[data-clear-image]').hidden = false; setError(wrap, '');
  } catch (error) { console.warn('image decode failed', error?.name); setError(wrap, '이 이미지를 읽지 못했습니다. JPG나 PNG로 바꿔 올려 주세요.'); }
  finally { delete wrap.dataset.pending; URL.revokeObjectURL(url); input.value = ''; }
}

for (const preset of PRESETS) { const option = el('option', '', `${preset.name} · ${preset.sample}`); option.value = preset.id; $('#presetSelect').append(option); }
$('#demoEnter').addEventListener('click', () => { session.set(true); showApp(true); });
$('#logout').addEventListener('click', () => { session.set(false); showApp(false); $('#demoEnter').focus(); });
$('#presetSelect').addEventListener('change', (event) => {
  const seed = seedFor(state.preset); const comparable = { ...state, savedAt: null };
  if (JSON.stringify(comparable) !== JSON.stringify(seed) && !confirm('사이트 종류를 바꾸면 지금 데이터가 샘플 데이터로 바뀝니다. 계속할까요?')) { event.target.value = state.preset; return; }
  save(seedFor(event.target.value)); render();
});
$('#sectionToggles').addEventListener('change', (event) => {
  if (!event.target.matches('[data-section]')) return;
  const next = structuredClone(state); const selected = new Set(next.sections);
  if (event.target.checked) selected.add(event.target.dataset.section); else selected.delete(event.target.dataset.section);
  next.sections = sections.filter((id) => selected.has(id));
  if (!save(next)) event.target.checked = !event.target.checked;
  render(); refocus(focusKey(event.target));
});
$('#nav').addEventListener('click', (event) => { const button = event.target.closest('[data-module]'); if (button) location.hash = `#/${button.dataset.module}`; });
window.addEventListener('hashchange', () => { const key = focusKey(document.activeElement); route(); refocus(key, '#main'); });
$('#moduleBody').addEventListener('submit', (event) => {
  if (!event.target.matches('.module-form')) return;
  event.preventDefault(); const module = activeModule(); const values = collect(event.target, module, state.data[module.id]);
  if (!values) return;
  const next = structuredClone(state); next.data[module.id] = values;
  if (save(next)) { render(); refocus('.module-form button[type=submit]'); toast('저장되었습니다'); }
});
$('#editorForm').addEventListener('submit', (event) => {
  event.preventDefault(); if (!editorContext) return;
  const { module, id, original } = editorContext; const values = collect($('#editorFields'), module, original);
  if (!values) return;
  const next = structuredClone(state);
  let savedId = id;
  if (id) { const index = next.data[module.id].findIndex((item) => item.id === id); if (index < 0) { toast('항목을 찾지 못했습니다. 다시 열어 주세요.', true); return; } next.data[module.id][index] = values; }
  else { savedId = idFor(module.id); next.data[module.id].push({ ...values, id: savedId }); }
  if (save(next)) { editorTrigger = `[data-edit="${savedId}"]`; $('#editor').close(); render(); refocus(editorTrigger); editorTrigger = null; toast('저장되었습니다'); }
});
document.addEventListener('change', (event) => { if (event.target.matches('.img-field input[type=file]')) readImage(event.target); });
document.addEventListener('click', (event) => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.matches('[data-clear-image]')) { const wrap = button.closest('.field'); wrap.dataset.imageValue = ''; preview(wrap.querySelector('.img-preview'), ''); button.hidden = true; setError(wrap, ''); return; }
  if (button.matches('[data-close]')) { button.closest('dialog').close(); return; }
  const module = activeModule();
  if (button.id === 'addItem') openEditor(module, null, button);
  if (button.dataset.edit !== undefined) { const item = state.data[module.id].find((x) => x.id === button.dataset.edit); if (item) openEditor(module, item, button); }
  if (button.dataset.delete !== undefined) { const item = state.data[module.id].find((x) => x.id === button.dataset.delete); if (item) openConfirm(module, item); }
  if (button.id === 'editorDelete' && editorContext) { const item = state.data[editorContext.module.id].find((x) => x.id === editorContext.id); if (item) openConfirm(editorContext.module, item); }
  if (button.id === 'confirmGo' && deleteContext) {
    if ($('#confirmStep').hidden) { $('#confirmStep').hidden = false; button.textContent = '최종 삭제 (2/2)'; }
    else { const next = structuredClone(state); next.data[deleteContext.module.id] = next.data[deleteContext.module.id].filter((x) => x.id !== deleteContext.id); if (save(next)) { editorTrigger = null; $('#confirm').close(); if ($('#editor').open) $('#editor').close(); render(); refocus('#addItem', '#main'); toast('삭제되었습니다'); } }
  }
  if (button.id === 'exportJson') {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = el('a');
    const date = new Date(); const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    link.href = url; link.download = `getsite-admin-${state.preset}-${stamp}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  if (button.id === 'importJson') $('#importFile').click();
  if (button.id === 'resetDemo' && confirm('샘플 데이터로 되돌릴까요?')) { if (save(seedFor(state.preset))) { render(); refocus('#resetDemo'); toast('샘플 데이터로 되돌렸습니다'); } }
});
$('#importFile').addEventListener('change', async (event) => {
  const file = event.target.files[0]; if (!file) return;
  let next;
  try { next = normalizeImport(JSON.parse(await file.text())); }
  catch { toast('올바른 백업 파일이 아닙니다.', true); return; }
  finally { event.target.value = ''; }
  if (save(next)) { render(); refocus('#importJson'); toast('불러왔습니다'); }
});
for (const dialog of [$('#editor'), $('#confirm')]) {
  dialog.addEventListener('click', (event) => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
}
$('#confirm').addEventListener('close', () => { resetConfirm(); deleteContext = null; });
$('#editor').addEventListener('close', () => {
  editorContext = null;
  // After a save or delete the list was re-rendered: the trigger is found again by its key.
  if (typeof editorTrigger === 'string') refocus(editorTrigger);
  else if (editorTrigger?.isConnected) editorTrigger.focus();
  else if (editorTrigger) refocus(focusKey(editorTrigger));
  editorTrigger = null;
});
window.__adminDemo = { get state() { return structuredClone(state); }, route: () => current };
showApp(session.get() === '1');
if (bootNotice) toast(bootNotice, true);
