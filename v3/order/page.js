/* Customer's order page. The key in the URL hash is the only credential.
   Everything from the document is rendered as text; links pass an allowlist. */

import { DRIVE_URL_RE, ORDER_KEY_RE, api } from './api.js';
import { GALLERIES } from '../catalog.js';

export const SECTION_LIMIT = 2000;
const PAID_STATUSES = new Set(['결제 완료', '제작 중', '수정 중', '납품 완료']);
const KEEP_IDS = ['layout', 'mood', 'content'];
const KEEP_LABELS = { layout: '구성', mood: '분위기', content: '내용' };
const VALID_PART_REF_RE = /^[a-z0-9-]{1,40}:[A-Za-z0-9_-]{1,40}$/;
const SAFE_THUMB_RE = /^assets\/[A-Za-z0-9/_.-]+\.webp$/;
const PICK_WIRE_RE = /^(?:(new)\|(auto|user)\||([a-z0-9-]{1,40}:[A-Za-z0-9_-]{1,40})\|(auto|user)\|(layout|mood|content|layout,mood|layout,content|mood,content|layout,mood,content)?)\|([\s\S]{0,300})$/u;

const main = document.getElementById('o');
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

const hasOwn = (obj, key) => Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
const hasV4Picks = (order) => order?.schema === 'v4' && Boolean(order.picks) && typeof order.picks === 'object' && !Array.isArray(order.picks);

async function fetchOptionalJson(path) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function loadV4Catalog() {
  const [secDoc, partsDoc, sampDoc] = await Promise.all([
    fetchOptionalJson('/v4/data/sections.json'),
    fetchOptionalJson('/v4/data/parts.json'),
    fetchOptionalJson('/v4/data/samples.json'),
  ]);
  return {
    sections: Array.isArray(secDoc?.sections) ? secDoc.sections : null,
    parts: partsDoc?.bySection && typeof partsDoc.bySection === 'object' ? partsDoc : null,
    samples: Array.isArray(sampDoc?.samples) ? sampDoc.samples : null,
  };
}

function readPick(v) {
  if (typeof v === 'string') {
    const m = PICK_WIRE_RE.exec(v);
    if (!m) return null;
    return m[1]
      ? { ref: 'new', by: m[2], keep: [], note: m[6] }
      : { ref: m[3], by: m[4], keep: m[5] ? m[5].split(',') : [], note: m[6] };
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  return null;
}

function intakeNoteOf(order, id) {
  if (order?.schema !== 'v4') return '';
  if (id === 'gallery') return typeof order.galleryNote === 'string' ? order.galleryNote.trim() : '';
  if (!hasV4Picks(order) || !hasOwn(order.picks, id)) return '';
  const pick = readPick(order.picks[id]);
  return typeof pick?.note === 'string' ? pick.note.trim() : '';
}

function picksRecap(order, catalog) {
  const sectionIds = Array.isArray(order.sections)
    ? order.sections.filter((id) => typeof id === 'string')
    : (Array.isArray(order.brief?.sections) ? order.brief.sections.map((s) => s?.id).filter((id) => typeof id === 'string') : []);
  const list = el('ol', { class: 'o-pick-list' });

  sectionIds.forEach((id, idx) => {
    const label = catalog?.sections?.find((s) => s?.id === id)?.label || id;
    const no = String(idx + 1).padStart(2, '0');
    const head = el('div', { class: 'o-pick-head' }, el('span', { class: 'o-pick-no', text: no }), el('b', { class: 'o-pick-label', text: label }));
    const body = el('div', { class: 'o-pick-body' }, head);
    const item = el('li', { class: 'o-pick-item' });

    if (id === 'gallery') {
      const layoutId = typeof order.galleryLayout === 'string'
        ? order.galleryLayout
        : (typeof order.brief?.gallery?.layoutId === 'string' ? order.brief.gallery.layoutId : 'auto');
      const layoutLabel = layoutId === 'auto' ? '제작자에게 맡기기' : (GALLERIES.find((g) => g.id === layoutId)?.name || layoutId);
      body.append(el('p', { class: 'o-pick-src', text: `구도: ${layoutLabel}` }));
      const gNote = typeof order.galleryNote === 'string' ? order.galleryNote.trim() : '';
      if (gNote) body.append(el('p', { class: 'o-pick-note', text: gNote }));
      item.append(body);
      list.append(item);
      return;
    }

    const pick = hasOwn(order.picks, id) ? readPick(order.picks[id]) : null;
    const ref = typeof pick?.ref === 'string' ? pick.ref : 'new';
    const hasCatalog = Boolean(catalog?.parts && hasOwn(catalog.parts.bySection, id) && Array.isArray(catalog.parts.bySection[id]));
    const part = hasCatalog && ref !== 'new' ? catalog.parts.bySection[id].find((p) => p?.ref === ref) || null : null;
    const isNew = !pick || ref === 'new' || !VALID_PART_REF_RE.test(ref) || (hasCatalog && !part);

    if (!isNew && part && typeof part.thumb === 'string' && SAFE_THUMB_RE.test(part.thumb) && !part.thumb.includes('..')) {
      const sampleTitle = catalog?.samples?.find((s) => s?.id === part.sampleId)?.title || part.sampleId;
      const thumbProps = {
        class: 'o-pick-thumb',
        src: `/v4/${part.thumb}`,
        alt: `${sampleTitle}의 ${label} 화면`,
        loading: 'lazy',
        decoding: 'async',
      };
      if (part.w && part.h) {
        thumbProps.width = '640';
        thumbProps.height = String(Math.round((640 * part.h) / part.w));
      }
      item.append(el('img', thumbProps));
    }

    if (isNew) {
      body.append(el('p', { class: 'o-pick-src', text: '새로 구성' }));
    } else {
      const sampleId = part ? part.sampleId : ref.split(':')[0];
      const sampleTitle = catalog?.samples?.find((s) => s?.id === sampleId)?.title || sampleId;
      const motion = id === 'hero' && part?.kind === 'motion';
      const sourceText = motion ? `${part.name}${part.video ? ' (영상 옵션)' : ' 모션'} 참고` : `${sampleTitle}의 ${label} 화면 참고`;
      body.append(el('p', { class: 'o-pick-src', text: sourceText }));
      if (motion && part.video && typeof catalog.parts.motion?.videoNote === 'string') body.append(el('p', { class: 'o-pick-note', text: catalog.parts.motion.videoNote }));
      const keeps = Array.isArray(pick?.keep) ? KEEP_IDS.filter((k) => pick.keep.includes(k)).map((k) => KEEP_LABELS[k]) : [];
      if (keeps.length) body.append(el('p', { class: 'o-pick-keep', text: `반영할 점: ${keeps.join(', ')}` }));
    }

    const note = typeof pick?.note === 'string' ? pick.note.trim() : '';
    if (note) body.append(el('p', { class: 'o-pick-note', text: note }));

    item.append(body);
    list.append(item);
  });

  return el('section', { class: 'o-picks', 'aria-label': '고르신 구성' }, el('h2', { class: 'o-picks-title', text: '고르신 구성' }), list);
}

function fail(title, body) {
  main.replaceChildren(el('h1', { text: title }), el('p', { class: 'o-muted', text: body }));
}

function folderLine(url) {
  if (!DRIVE_URL_RE.test(url || '')) return el('p', { class: 'o-muted', text: '자료를 올릴 곳은 이메일로 안내합니다.' });
  return el('p', {}, '자료는 ', el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: '전용 Drive 폴더' }), '에 올려 주세요.');
}

function sectionForm(key, order, catalog = null) {
  const saved = order.sectionRequests && typeof order.sectionRequests === 'object' ? order.sectionRequests : {};
  // v4: order.sections is what the rules checked (brief.sections is not), so it decides which inputs exist.
  const briefLabel = (id) => String((Array.isArray(order.brief?.sections) ? order.brief.sections.find((s) => s?.id === id)?.label : '') || id);
  const sections = order?.schema === 'v4' && Array.isArray(order.sections)
    ? order.sections.filter((id) => typeof id === 'string').map((id) => ({ id, label: catalog?.sections?.find((s) => s?.id === id)?.label || briefLabel(id) }))
    : (Array.isArray(order.brief?.sections) ? order.brief.sections : []);
  const inputs = new Map();
  const form = el('form');
  for (const s of sections) {
    const input = el('textarea', { rows: '4', maxlength: String(SECTION_LIMIT), name: s.id });
    const val = hasOwn(saved, s.id) && typeof saved[s.id] === 'string' ? saved[s.id] : '';
    input.value = val;
    if (!val) {
      const note = intakeNoteOf(order, s.id);
      if (note) input.placeholder = `접수 때 남긴 의견: ${note}`;
    }
    inputs.set(s.id, input);
    form.append(el('label', { text: s.label }, input));
  }
  const message = el('p', { role: 'status' });
  const send = el('button', { type: 'submit', text: '요청 저장하기' });
  form.append(message, send);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (send.disabled) return;
    send.disabled = true;
    send.textContent = '저장하는 중…';
    message.textContent = '';
    try {
      const requests = Object.fromEntries([...inputs].map(([id, input]) => [id, Array.from(input.value).slice(0, SECTION_LIMIT).join('')]));
      await api().saveSectionRequests(key, requests);
      message.className = 'o-ok';
      message.textContent = '저장했습니다. 다시 고치셔도 됩니다.';
      send.textContent = '요청 저장하기';
    } catch (error) {
      console.error('[order page]', error?.code || 'save-failed');
      message.className = 'o-error';
      message.textContent = '저장하지 못했습니다. 입력 내용은 그대로 있습니다.';
      send.textContent = '다시 보내기';
    }
    send.disabled = false;
  });
  return form;
}

function render(key, order, catalog = null) {
  const status = String(order.status || '접수됨');
  const paid = PAID_STATUSES.has(status);
  const parts = [
    el('p', { class: 'o-no', text: String(order.displayNo || '') }),
    el('h1', { text: String(order.siteName || '내 의뢰') }),
    el('p', { class: 'o-recap', text: String(order.sample || order.brief?.sample?.title || '') }),
    el('p', { class: 'o-status' }, el('b', { text: status })),
    folderLine(order.driveFolderUrl),
  ];
  if (hasV4Picks(order)) {
    parts.push(picksRecap(order, catalog));
  }
  if (paid) {
    parts.push(el('p', { class: 'o-muted', text: '섹션별로 바라는 점을 적어 주세요. 비워 두신 곳은 샘플대로 진행합니다.' }), sectionForm(key, order, catalog));
  } else {
    parts.push(el('p', { class: 'o-muted', text: '샘플을 보고 결제하시면 이곳에서 섹션별 요청을 받습니다.' }));
  }
  main.replaceChildren(...parts);
}

async function start() {
  const key = new URLSearchParams(location.hash.slice(1)).get('t') || '';
  if (!ORDER_KEY_RE.test(key)) {
    fail('이 링크로 주문을 찾을 수 없습니다', '메일에 있는 링크를 그대로 열어 주세요.');
    return;
  }
  try {
    const order = await api().loadOrder(key);
    if (!order) {
      fail('이 링크로 주문을 찾을 수 없습니다', '메일에 있는 링크를 그대로 열어 주세요.');
      return;
    }
    const catalog = hasV4Picks(order) ? await loadV4Catalog() : null;
    render(key, order, catalog);
  } catch (error) {
    console.error('[order page]', error?.code || 'load-failed');
    main.replaceChildren(
      el('h1', { text: '의뢰를 불러오지 못했습니다' }),
      el('p', { class: 'o-muted', text: '잠시 후 다시 시도해 주세요.' }),
      Object.assign(el('button', { type: 'button', text: '다시 시도' }), { onclick: start }),
    );
  }
}

start();
