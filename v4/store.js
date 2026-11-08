/* One store for the whole page. Arrays and objects are always replaced, never mutated in place,
   so subscribers see every change. Kept in sessionStorage so a reload does not lose the form. */
import { createStore } from '../v3/core/state.js';
import { reconcilePicks, normalizePick, cleanKeep, findPart, pickable, clip, KEEP_IDS } from './parts.js';

export const KEY = 'getsite.v4.state';

export const INITIAL = {
  step: 1,
  topic: 'all', // samples section filter
  sampleId: null,
  form: { email: '', siteName: '', oneLiner: '', name: '' },
  materials: 'have',
  sections: ['hero', 'about', 'gallery', 'contact'],
  gallery: 'auto',
  picks: {}, // { <sectionId>: { ref: '<sampleId>:<slug>'|'new', by: 'auto'|'user', keep: [...], note } }, see parts.js
  galleryNote: '',
  refs: ['', '', ''],
  extras: { pages: 0, video: false, revisions: 0 },
  videoAuto: false, // the video option was turned on by choosing the video hero scene (not by the customer)
  consent: false,
  visited: {}, // { 4: true } once the price step was seen
  order: null, // { key, displayNo, status, driveFolderUrl, saved }
};

export const PRICE = { base: 500000, page: 100000, video: 200000, revision: 50000 };

export const total = (extras) => PRICE.base + (extras.pages | 0) * PRICE.page + (extras.video ? PRICE.video : 0) + (extras.revisions | 0) * PRICE.revision;

export const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const REF_RE = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d{1,5})?(?:\/[^\s`<>]{0,270})?$/i; // same character set as firestore.rules ref()
/** A reference must be an https URL with a real host; `https://::::` is not one. */
export function validRef(r) {
  if (r === '') return true;
  if (typeof r !== 'string' || r.length > 300 || !REF_RE.test(r)) return false;
  try { const u = new URL(r); return u.protocol === 'https:' && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname); } catch { return false; }
}

const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
/** The same cleaning buildOrder applies, so "valid" here means it will also be non-empty there. */
export const cleanText = (v) => (typeof v === 'string' ? v.replace(CONTROL_RE, '').trim() : '');
export function validForm(form) {
  const f = (k) => cleanText(form?.[k]);
  return {
    email: EMAIL_RE.test(f('email')) && f('email').length <= 120,
    siteName: f('siteName').length > 0 && f('siteName').length <= 80,
    oneLiner: f('oneLiner').length > 0 && f('oneLiner').length <= 200,
    name: f('name').length <= 40,
  };
}
export const formOk = (form) => Object.values(validForm(form)).every(Boolean);

/** Which steps are complete, for the ticks on the step cards. */
export function doneSteps(s) {
  return {
    1: !!s.sampleId,
    2: formOk(s.form),
    3: s.sections.length > 0 && s.refs.every(validRef),
    4: !!s.visited[4],
    5: !!s.order?.saved,
  };
}

export const SECTION_IDS = ['hero', 'about', 'story', 'gallery', 'featured', 'history', 'process', 'services', 'trust', 'faq', 'contact', 'booking', 'newsletter'];
export const GALLERY_IDS = ['auto', 'focus', 'film', 'masonry', 'index', 'grid', 'strip', 'flow', 'timeline', 'coverflow', 'stack', 'museum'];
export const ORDER_KEY_RE = /^WO-[0-9]{4}-[0-9]{4}-[A-Za-z0-9]{20}$/;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v, max) => (Number.isInteger(v) && v >= 0 && v <= max ? v : 0);

/** A saved state is data from the same origin, but a stale or hand-edited value must never crash the page.
    With the parts catalog, every pick is checked as a (section, ref) pair and missing ones are filled. */
export function normalize(v, sampleIds = null, catalog = null) {
  if (!v || typeof v !== 'object') return { ...INITIAL };
  const sections = Array.isArray(v.sections) ? [...new Set(v.sections.filter((id) => SECTION_IDS.includes(id)))] : INITIAL.sections;
  const order = v.order && typeof v.order === 'object' && ORDER_KEY_RE.test(String(v.order.key)) && /^WO-[0-9]{4}-[0-9]{4}$/.test(String(v.order.displayNo))
    ? { key: v.order.key, displayNo: v.order.displayNo, saved: v.order.saved === true, driveFolderUrl: str(v.order.driveFolderUrl, 300), summary: str(v.order.summary, 8000) }
    : null;
  const sampleId = typeof v.sampleId === 'string' && (!sampleIds || sampleIds.includes(v.sampleId)) ? v.sampleId : null;
  const picks = catalog?.parts ? reconcilePicks({ picks: v.picks && typeof v.picks === 'object' ? v.picks : {}, sections, sampleId, parts: catalog.parts, samples: catalog.samples }) : {};
  return {
    step: Number.isInteger(v.step) && v.step >= 1 && v.step <= 5 ? v.step : 1,
    topic: typeof v.topic === 'string' ? v.topic : 'all',
    sampleId,
    form: { email: str(v.form?.email, 120), siteName: str(v.form?.siteName, 80), oneLiner: str(v.form?.oneLiner, 200), name: str(v.form?.name, 40) },
    materials: v.materials === 'none' ? 'none' : 'have',
    sections,
    gallery: GALLERY_IDS.includes(v.gallery) ? v.gallery : 'auto',
    picks,
    galleryNote: clip(v.galleryNote),
    refs: Array.isArray(v.refs) && v.refs.length === 3 ? v.refs.map((r) => str(r, 300)) : [...INITIAL.refs],
    extras: { pages: int(v.extras?.pages, 20), video: v.extras?.video === true, revisions: int(v.extras?.revisions, 20) },
    videoAuto: v.videoAuto === true && v.extras?.video === true,
    consent: v.consent === true,
    visited: v.visited && typeof v.visited === 'object' ? { ...v.visited } : {},
    order,
  };
}

function load(sampleIds, catalog) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return normalize(JSON.parse(raw), sampleIds, catalog);
  } catch { return null; }
}

export function createAppStore({ sampleIds = null, parts = null, samples = [] } = {}) {
  const catalog = parts ? { parts, samples } : null;
  const store = createStore(load(sampleIds, catalog) || normalize({ ...INITIAL }, sampleIds, catalog));
  store.subscribe((s) => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } });
  const s = () => store.get();
  // Any edit to what gets submitted detaches the previous attempt: a changed request is a new request,
  // never a silent retry under the old key.
  const edit = (patch) => store.set(s().order ? { ...patch, order: null, consent: false } : patch);
  // Picks follow the sections and the sample; they are never resolved again at submit time.
  const picksFor = (sections, sampleId, prevSampleId = sampleId) => (catalog ? reconcilePicks({ picks: s().picks, sections, sampleId, prevSampleId, parts, samples }) : s().picks);
  const isVideoScene = (pick) => !!(pick && pick.ref !== 'new' && findPart(parts, 'hero', pick.ref)?.video);
  /** Keeps the video option in step with the hero: on with the video scene (if the customer had not set
      it), off again when that scene goes, unless the customer set the option themselves. */
  const videoFor = (picks, sections) => {
    const scene = sections.includes('hero') && isVideoScene(picks.hero);
    const x = s().extras;
    if (scene && !x.video) return { extras: { ...x, video: true }, videoAuto: true };
    if (!scene && s().videoAuto) return { extras: { ...x, video: false }, videoAuto: false };
    return {};
  };
  const editPick = (id, fn) => {
    if (!catalog || !pickable(parts, id) || !s().picks[id]) return;
    const next = normalizePick(id, fn(s().picks[id]), s().sampleId, parts, samples);
    const picks = { ...s().picks, [id]: next };
    edit({ picks, ...videoFor(picks, s().sections) });
  };
  return {
    ...store,
    setStep: (step) => store.set({ step }),
    setTopic: (topic) => store.set({ topic }),
    pickSample: (sampleId) => edit({ sampleId, picks: picksFor(s().sections, sampleId, s().sampleId) }),
    setField: (k, v) => edit({ form: { ...s().form, [k]: v } }),
    setMaterials: (materials) => edit({ materials }),
    toggleSection(id) {
      const cur = s().sections;
      const sections = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      const picks = picksFor(sections, s().sampleId);
      edit({ sections, picks, ...videoFor(picks, sections) });
    },
    moveSection(id, dir) {
      const cur = [...s().sections];
      const i = cur.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cur.length) return;
      [cur[i], cur[j]] = [cur[j], cur[i]];
      edit({ sections: cur });
    },
    setGallery: (gallery) => edit({ gallery }),
    /** The customer chose a screen (or 'new') for a section. The note stays; 'new' has nothing to keep. */
    setPick(id, ref) {
      const part = ref === 'new' ? null : findPart(parts, id, ref);
      if (ref !== 'new' && !part) return;
      // The video scene is made with the video option: editPick turns it on (the picker says so).
      editPick(id, (p) => ({ ...p, ref, by: 'user', keep: ref === 'new' ? [] : p.keep }));
    },
    toggleKeep(id, k) { if (KEEP_IDS.includes(k)) editPick(id, (p) => ({ ...p, keep: cleanKeep(p.keep.includes(k) ? p.keep.filter((x) => x !== k) : [...p.keep, k]) })); },
    setNote(id, note) { editPick(id, (p) => ({ ...p, note: clip(String(note ?? '')) })); },
    setGalleryNote: (note) => edit({ galleryNote: clip(String(note ?? '')) }),
    setRef(i, v) { const refs = [...s().refs]; refs[i] = v; edit({ refs }); },
    // The customer setting the video option makes it theirs: it no longer follows the hero scene.
    setExtra: (k, v) => edit({ extras: { ...s().extras, [k]: v }, ...(k === 'video' ? { videoAuto: false } : {}) }),
    setConsent: (consent) => store.set({ consent }),
    markVisited: (step) => { if (!s().visited[step]) store.set({ visited: { ...s().visited, [step]: true } }); },
    setOrder: (order) => store.set({ order: order ? { ...order } : null }),
    reset: () => store.set(normalize({ ...INITIAL, step: 1 }, sampleIds, catalog)),
  };
}
