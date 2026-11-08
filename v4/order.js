import { total, validRef, cleanText, SECTION_IDS } from './store.js';
import { normalizePick, cleanNote, cleanKeep, pickLabel, motionPart, encodePick, decodePick, KEEP_LABELS, NOTE_MAX } from './parts.js';
import { api, newOrderIdentity, ORDER_KEY_RE, DRIVE_URL_RE } from '../v3/order/api.js';
import { sanitizeText } from '../v3/order/brief.js';
import { CATALOG_VERSION, GALLERIES } from '../v3/catalog.js';

const galleryName = (id) => id === 'auto' ? '제작자에게 맡기기' : GALLERIES.find((x) => x.id === id)?.name || '';
const sampleOf = (state, data) => data.samples.find((x) => x.id === state.sampleId);
/** The picks that go out: one per chosen section (gallery excluded), each a (section, ref) pair from the
    catalog, else the automatic one; notes cleaned. Without the catalog every section reads "새로 구성". */
export function picksOut(state, parts, samples) {
  const out = {};
  for (const id of state.sections) {
    if (id === 'gallery' || !SECTION_IDS.includes(id)) continue;
    const raw = state.picks?.[id];
    const p = parts ? normalizePick(id, raw, state.sampleId, parts, samples) : { ref: 'new', by: 'auto', keep: [], note: typeof raw?.note === 'string' ? raw.note : '' };
    out[id] = { ref: p.ref, by: p.by, keep: p.ref === 'new' ? [] : cleanKeep(p.keep), note: cleanNote(p.note) };
  }
  return out;
}
const labelsOf = (state, sections) => state.sections.map((id) => ({ id, label: sections.find((s) => s.id === id)?.label || id }));

export function buildOrder({ state, data, sections, parts = null, identity, now = new Date() }) {
  const sample = sampleOf(state, data);
  if (!sample) throw new Error('샘플을 선택해 주세요.');
  const refs = state.refs.map((r) => String(r ?? '').trim());
  if (refs.length !== 3 || !refs.every(validRef)) throw new Error('레퍼런스 주소를 확인해 주세요.');
  // Lower-cased so the server's duplicate check (same address within a day) cannot be dodged by case.
  // The email is cleaned as step 2 validated it (control characters removed, not turned into a space
  // the rules would reject); other text keeps sanitizeText's space, so a line break still separates words.
  const email = sanitizeText(cleanText(state.form.email), 120).toLowerCase();
  const siteName = sanitizeText(state.form.siteName, 80);
  const oneLiner = sanitizeText(state.form.oneLiner, 200);
  const name = sanitizeText(state.form.name, 40);
  if (!siteName || !oneLiner || !email) throw new Error('기본 정보를 확인해 주세요.');
  const extras = { pages: Math.min(20, Math.max(0, state.extras.pages | 0)), video: state.extras.video === true, revisions: Math.min(20, Math.max(0, state.extras.revisions | 0)) };
  const estimate = { ...extras, total: total(extras) };
  return {
    schema: 'v4', displayNo: identity.displayNo, catalogVersion: CATALOG_VERSION, email, siteName, oneLiner, name,
    topic: sample.topic, sampleId: sample.id, sections: [...state.sections], galleryLayout: state.gallery,
    picks: Object.fromEntries(Object.entries(picksOut(state, parts, data.samples)).map(([id, p]) => [id, encodePick(p)])), galleryNote: state.sections.includes('gallery') ? cleanNote(state.galleryNote) : '', partsVersion: String(parts?.version || 'none').slice(0, 20),
    ref1: refs[0], ref2: refs[1], ref3: refs[2], materials: state.materials, estimate,
    status: '샘플 제작 대기', briefStatus: 'pending', opMail: 'pending', custMail: 'pending', driveFolderUrl: '',
    brief: { schema: 'getsite.brief.v2', catalogVersion: CATALOG_VERSION,
      order: { displayNo: identity.displayNo, createdAt: now.toISOString() }, delivery: { email },
      sample: { id: sample.id, title: sample.title, topic: sample.topic, url: sample.url },
      sections: labelsOf(state, sections), gallery: { layoutId: state.gallery, name: galleryName(state.gallery) },
      references: { customerLinks: refs.filter(Boolean) }, sampleScope: {}, customerText: { siteName, oneLiner, name } }
  };
}

/** Per-section lines: the screen used as the reference, what to keep, the note. */
export function sectionLines(state, data, sections, parts, { notes = true } = {}) {
  const picks = picksOut(state, parts, data.samples);
  const lines = [];
  state.sections.forEach((id, i) => {
    const label = sections.find((s) => s.id === id)?.label || id;
    const no = String(i + 1).padStart(2, '0');
    if (id === 'gallery') {
      lines.push(`${no} ${label}: ${galleryName(state.gallery)}`);
      const note = cleanNote(state.galleryNote);
      if (notes && note) lines.push(`   의견: ${note.replace(/\n/g, ' / ')}`);
      return;
    }
    const p = picks[id];
    if (!p) { lines.push(`${no} ${label}`); return; }
    lines.push(`${no} ${label}: ${pickLabel(label, p, data.samples, parts)} 참고`);
    const motion = motionPart(parts, p);
    if (motion?.video) lines.push(`   안내: ${parts.motion?.videoNote || '영상 옵션과 함께 제작합니다.'}${state.extras.video ? '' : ' (지금은 영상 옵션이 꺼져 있습니다)'}`);
    if (p.keep.length) lines.push(`   반영할 점: ${p.keep.map((k) => KEEP_LABELS[k]).join(', ')}`);
    if (notes && p.note) lines.push(`   의견: ${p.note.replace(/\n/g, ' / ')}`);
  });
  return lines;
}

export function summaryText(state, data, sections, parts = null, { notes = true } = {}) {
  const sample = sampleOf(state, data);
  const clean = (s, n) => sanitizeText(s, n);
  return ['견적 및 제작 요청 요약', `샘플: ${sample?.title || '선택 없음'} (${sample?.topic || ''})`,
    `사이트 이름: ${clean(state.form.siteName, 80)}`, `목적: ${clean(state.form.oneLiner, 200)}`,
    `이메일: ${clean(state.form.email, 120)}`, `이름: ${clean(state.form.name, 40) || '없음'}`,
    '섹션별 구성:', ...(sectionLines(state, data, sections, parts, { notes }).length ? sectionLines(state, data, sections, parts, { notes }) : ['없음']),
    `레퍼런스: ${state.refs.filter(Boolean).join(', ') || '없음'}`,
    `자료: ${state.materials === 'have' ? '있음' : '없음'}`,
    `기본 구성: 500,000원`, `추가 페이지: ${state.extras.pages}개`, `영상 기반 모션: ${state.extras.video ? '선택' : '없음'}`,
    `추가 수정: ${state.extras.revisions}회`, `예상 합계: ${total(state.extras).toLocaleString('ko-KR')}원 (VAT 별도)`].join('\n');
}

/* The Drive folder is created by the operator's Apps Script after the order is synced; the
   browser never calls the folder endpoint, so the secret key never leaves the page as a query. */
export async function submitOrder({ state, data, sections, parts = null, onStatus = () => {} }) {
  const reuse = state.order && ORDER_KEY_RE.test(String(state.order.key)) && /^WO-[0-9]{4}-[0-9]{4}$/.test(String(state.order.displayNo));
  const identity = reuse ? { key: state.order.key, displayNo: state.order.displayNo } : newOrderIdentity();
  onStatus({ ...identity, saved: false });
  try {
    const doc = buildOrder({ state, data, sections, parts, identity });
    let driveFolderUrl = '';
    let sent = state;
    try { await api().saveOrder(identity.key, doc); }
    catch (e) {
      if (e?.code !== 'permission-denied' && e?.code !== 'timeout') throw e;
      const existing = await api().loadOrder(identity.key);
      if (!existing) throw e;
      driveFolderUrl = DRIVE_URL_RE.test(existing.driveFolderUrl || '') ? existing.driveFolderUrl : '';
      // The first attempt had landed: what the server holds is what was sent, not the form as it is now.
      sent = stateFromDoc(existing, state);
    }
    // The summary is frozen with the order, so later edits never misreport what was sent.
    const recovered = sent === state ? {} : { sentState: sent };
    return { ...identity, driveFolderUrl, saved: true, ...recovered, summary: `${summaryText(sent, data, sections, parts)}\n의뢰 코드: ${identity.key}`.slice(0, 8000) };
  } catch (e) { console.error('[v4] submit failed', e?.code || '', e?.message || e); throw new Error(['레퍼런스 주소를 확인해 주세요.', '샘플을 선택해 주세요.', '기본 정보를 확인해 주세요.'].includes(e?.message) ? e.message : '서버 저장에 실패했습니다. 다시 시도해 주세요.'); }
}
/** Rebuilds the state view of a saved v4 document, for the summary after a recovered retry. */
export function stateFromDoc(doc, fallback) {
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  return {
    ...fallback,
    sampleId: typeof doc.sampleId === 'string' ? doc.sampleId : fallback.sampleId,
    form: { email: str(doc.email, 120), siteName: str(doc.siteName, 80), oneLiner: str(doc.oneLiner, 200), name: str(doc.name, 40) },
    sections: Array.isArray(doc.sections) ? doc.sections.filter((x) => typeof x === 'string') : fallback.sections,
    gallery: typeof doc.galleryLayout === 'string' ? doc.galleryLayout : fallback.gallery,
    picks: doc.picks && typeof doc.picks === 'object' ? Object.fromEntries(Object.entries(doc.picks).map(([id, v]) => [id, decodePick(v)]).filter(([, p]) => p)) : fallback.picks,
    galleryNote: str(doc.galleryNote, NOTE_MAX),
    refs: [str(doc.ref1, 300), str(doc.ref2, 300), str(doc.ref3, 300)],
    materials: doc.materials === 'none' ? 'none' : 'have',
    extras: { pages: doc.estimate?.pages | 0, video: doc.estimate?.video === true, revisions: doc.estimate?.revisions | 0 },
  };
}
export function parseLookup(text) {
  let raw = String(text ?? '').trim();
  try { raw = decodeURIComponent(raw); } catch { /* use original */ }
  const match = raw.match(/WO-\d{4}-\d{4}-[A-Za-z0-9]{20}(?![A-Za-z0-9])/);
  if (match && ORDER_KEY_RE.test(match[0])) return { key: match[0] };
  if (/^WO-\d{4}-\d{4}$/.test(raw)) return { short: true };
  return null;
}
export function orderPageLink(key) { return `${globalThis.location.origin}/v3/order.html#t=${encodeURIComponent(key)}`; }
