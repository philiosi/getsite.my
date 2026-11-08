/* Which captured screen each section uses as its reference. Pure: shared by the store (state.picks),
   the step 3 preview, the step 4 cards and buildOrder, so what the customer saw is what is sent.
   A ref is `<sampleId>:<slug>` and is unique only inside its section: always look up (section, ref). */

export const KEEP_IDS = ['layout', 'mood', 'content'];
export const KEEP_LABELS = { layout: '구성', mood: '분위기', content: '내용' };
export const NOTE_MAX = 300;
/** Cuts to `max` characters (code points, as firestore.rules counts them), never inside an emoji. */
export const clip = (v, max = NOTE_MAX) => (typeof v === 'string' ? Array.from(v).slice(0, max).join('') : '');
export const REF_RE = /^(?:[a-z0-9-]{1,40}:[A-Za-z0-9_-]{1,40}|new)$/;

/** The candidates a customer can pick for a section, in preview order. The live gallery has none. */
export const partsFor = (parts, sectionId) => (Array.isArray(parts?.bySection?.[sectionId]) ? parts.bySection[sectionId] : []);
export const findPart = (parts, sectionId, ref) => partsFor(parts, sectionId).find((p) => p.ref === ref) || null;
/** Sections that take a pick: every known section except the live gallery. */
export const pickable = (parts, sectionId) => sectionId !== 'gallery' && !!parts?.bySection && Object.prototype.hasOwnProperty.call(parts.bySection, sectionId);

/** The automatic reference: the chosen sample's screen, else one of the same topic, else the first. */
export function resolvePart(sectionId, sampleId, parts, samples) {
  // Never a motion scene: those are only ever the customer's own choice.
  const list = partsFor(parts, sectionId).filter((p) => p.kind !== 'motion');
  const chosen = samples.find((s) => s.id === sampleId);
  const topicOf = (id) => samples.find((s) => s.id === id)?.topic;
  const tiers = [
    (p) => chosen && p.sampleId === chosen.id,
    (p) => chosen && topicOf(p.sampleId) === chosen.topic,
    () => true,
  ];
  for (const tier of tiers) { const hit = list.find(tier); if (hit) return hit; }
  return null;
}

const NOTE_CONTROL_RE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;
/** Keeps line breaks (a note is a few lines), drops every other control and bidi character. */
export function cleanNote(v, max = NOTE_MAX) {
  if (typeof v !== 'string') return '';
  return clip(v.normalize('NFC').replace(/\r\n?/g, '\n').replace(NOTE_CONTROL_RE, '').replace(/\n{3,}/g, '\n\n').trim(), max);
}
export const cleanKeep = (keep) => (Array.isArray(keep) ? KEEP_IDS.filter((k) => keep.includes(k)) : []);

const autoPick = (sectionId, sampleId, parts, samples) => ({ ref: resolvePart(sectionId, sampleId, parts, samples)?.ref || 'new', by: 'auto', keep: [], note: '' });

/** One pick made safe: a ref that is not a candidate of that section falls back to the automatic one,
    keeping the customer's note (a renamed capture must not silently delete what they wrote). */
export function normalizePick(sectionId, p, sampleId, parts, samples) {
  if (!p || typeof p !== 'object') return autoPick(sectionId, sampleId, parts, samples);
  if (typeof p.ref !== 'string' || !REF_RE.test(p.ref) || (p.ref !== 'new' && !findPart(parts, sectionId, p.ref))) {
    return { ...autoPick(sectionId, sampleId, parts, samples), note: clip(typeof p.note === 'string' ? p.note : '') };
  }
  const keep = p.ref === 'new' ? [] : cleanKeep(p.keep);
  // Raw text is kept while typing (trailing space, new line); buildOrder cleans it.
  const note = clip(typeof p.note === 'string' ? p.note : '');
  return { ref: p.ref, by: p.by === 'user' ? 'user' : 'auto', keep, note };
}

/**
 * Picks for the chosen sections, keyed by section id (gallery excluded).
 * - a section without a pick gets the automatic one;
 * - when the sample changed, an automatic pick follows it, unless the customer already marked what to
 *   keep or wrote a note about that screen: then it stays and becomes the customer's pick;
 * - picks of removed sections are dropped.
 */
export function reconcilePicks({ picks, sections, sampleId, prevSampleId = sampleId, parts, samples }) {
  const out = {};
  const sampleChanged = sampleId !== prevSampleId;
  for (const id of sections) {
    if (!pickable(parts, id)) continue;
    const had = picks && Object.prototype.hasOwnProperty.call(picks, id) ? picks[id] : null;
    let p = had ? normalizePick(id, had, sampleId, parts, samples) : autoPick(id, sampleId, parts, samples);
    if (sampleChanged && had && p.by === 'auto') {
      p = p.keep.length || p.note.trim() ? { ...p, by: 'user' } : autoPick(id, sampleId, parts, samples);
    }
    out[id] = p;
  }
  return out;
}

/* Wire format in the order document: one string per section, `<ref>|<by>|<keep,csv>|<note>`.
   One regex per section keeps firestore.rules under its 1000-expression limit with all 13 sections
   (a map per section did not fit). keep is in KEEP_IDS order; the note is last, so it may hold '|'. */
export const PICK_WIRE_RE = /^(?:(new)\|(auto|user)\||([a-z0-9-]{1,40}:[A-Za-z0-9_-]{1,40})\|(auto|user)\|(layout|mood|content|layout,mood|layout,content|mood,content|layout,mood,content)?)\|([\s\S]{0,300})$/u;
export const encodePick = (p) => `${p.ref}|${p.by}|${p.ref === 'new' ? '' : cleanKeep(p.keep).join(',')}|${p.note}`;
/** Back to { ref, by, keep, note }, or null when the string is not a valid wire pick. */
export function decodePick(v) {
  if (typeof v !== 'string') return null;
  const m = PICK_WIRE_RE.exec(v);
  if (!m) return null;
  return m[1] ? { ref: 'new', by: m[2], keep: [], note: m[6] } : { ref: m[3], by: m[4], keep: m[5] ? m[5].split(',') : [], note: m[6] };
}

/** The motion scene a hero pick names, or null (motion scenes are hero parts with kind 'motion'). */
export const motionPart = (parts, pick) => (pick && pick.ref !== 'new' ? partsFor(parts, 'hero').find((p) => p.ref === pick.ref && p.kind === 'motion') || null : null);
/** Words for a motion scene: "수채 번짐 마스크 모션", the video one marked as the paid option. */
export const motionLabel = (part) => (part.video ? `${part.name} (영상 옵션)` : `${part.name} 모션`);

/** Words for a pick, e.g. "화가 윤서현의 소개 화면", "수채 번짐 마스크 모션", or "새로 구성". */
export function pickLabel(sectionLabel, pick, samples, parts = null) {
  if (!pick || pick.ref === 'new') return '새로 구성';
  const motion = motionPart(parts, pick);
  if (motion) return motionLabel(motion);
  const sample = samples.find((s) => s.id === pick.ref.split(':')[0]);
  return `${sample?.title || '샘플'}의 ${sectionLabel} 화면`;
}

/** v5: no section takes a reference screen (every pick is "새로 구성"); only the hero keeps its motion
    scenes, which the step 3 viewer shows as examples and never picks (resolvePart skips motion). The
    catalog version is kept, so the order and brief format stay the v4 one. */
export function examplesOnly(parts) {
  const bySection = {};
  for (const id of Object.keys(parts?.bySection || {})) bySection[id] = id === 'hero' ? partsFor(parts, 'hero').filter((p) => p.kind === 'motion') : [];
  return { ...parts, bySection };
}
