/* The parts catalog, picks and what buildOrder sends. Run: node --test tests/v4/parts.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { outputs } from '../../scripts/v4-parts.mjs';
import { resolvePart, reconcilePicks, normalizePick, cleanNote, pickLabel, partsFor, encodePick, decodePick } from '../../v4/parts.js';
import { normalize, INITIAL, SECTION_IDS } from '../../v4/store.js';
import { buildOrder, summaryText, stateFromDoc } from '../../v4/order.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const parts = JSON.parse(read('../../v4/data/parts.json'));
const data = JSON.parse(read('../../v4/data/samples.json'));
const samples = data.samples;
const sections = JSON.parse(read('../../v4/data/sections.json')).sections;
const manifest = JSON.parse(read('../../v4/assets/samples/manifest.json'));
const catalog = { parts, samples };
const identity = { displayNo: 'WO-2026-1234', key: 'WO-2026-1234-abcdefghijklmnopqrst' };

/* The old preview picker, kept here verbatim as the oracle resolvePart must match. */
const slugOf = (selector) => selector.replace(/^[#.]/, '').replace(/[^A-Za-z0-9_-]+/g, '-');
function pickPreviewOld(section, sampleId) {
  const chosen = samples.find((s) => s.id === sampleId);
  const has = (id, sel) => { const m = manifest[id]; if (!m) return false; if (sel === '__hero__') return !!m.hero; return !!m[slugOf(sel)]?.file; };
  const cands = section.previews.flatMap((p) => (p.sample === '*' ? samples.map((s) => ({ sample: s.id, selector: p.selector })) : [p]));
  const tiers = [(p) => chosen && p.sample === chosen.id, (p) => chosen && samples.find((s) => s.id === p.sample)?.topic === chosen.topic, () => true];
  for (const t of tiers) for (const p of cands) if (t(p) && has(p.sample, p.selector)) return `${p.sample}:${p.selector === '__hero__' ? 'hero' : slugOf(p.selector)}`;
  return null;
}

test('generated files are current and the gs snapshot matches parts.json', () => {
  const o = outputs();
  assert.equal(read('../../v4/data/parts.json'), o.json, 'run node scripts/v4-parts.mjs');
  assert.equal(read('../../v3/backend/parts-snapshot.gs'), o.gs);
  assert.equal(read('../../deploy/apps-script/parts-snapshot.gs'), o.gs);
  const c = {}; vm.createContext(c); vm.runInContext(o.gs, c);
  for (const [sec, list] of Object.entries(parts.bySection)) {
    assert.deepEqual(Object.keys(c.PARTS.bySection[sec]), list.map((p) => p.ref));
  }
  assert.equal(c.PARTS.version, parts.version);
});

test('catalog shape: refs unique per section, valid format, files exist, gallery excluded', () => {
  assert.ok(!('gallery' in parts.bySection));
  assert.deepEqual(Object.keys(parts.bySection).sort(), SECTION_IDS.filter((x) => x !== 'gallery').sort());
  for (const [sec, list] of Object.entries(parts.bySection)) {
    const refs = list.map((p) => p.ref);
    assert.equal(new Set(refs).size, refs.length, sec);
    for (const p of list) {
      assert.match(p.ref, /^[a-z0-9-]{1,40}:[A-Za-z0-9_-]{1,40}$/);
      assert.match(p.anchor, /^https:\/\//);
      for (const f of [p.file, p.thumb]) assert.doesNotThrow(() => readFileSync(new URL(`../../v4/${f}`, import.meta.url)), f);
    }
  }
  assert.ok(parts.version.length <= 20);
});

test('resolvePart matches the old preview picker for every sample x section', () => {
  for (const sec of sections.filter((s) => !s.live)) {
    for (const sampleId of [null, ...samples.map((s) => s.id)]) {
      assert.equal(resolvePart(sec.id, sampleId, parts, samples)?.ref ?? null, pickPreviewOld(sec, sampleId), `${sec.id} / ${sampleId}`);
    }
  }
});

test('reconcile: auto follows the sample, user and annotated auto stay, removed sections drop', () => {
  const secs = ['hero', 'about', 'gallery', 'newsletter'];
  let picks = reconcilePicks({ picks: {}, sections: secs, sampleId: 'artist', parts, samples });
  assert.deepEqual(Object.keys(picks), ['hero', 'about', 'newsletter']);
  assert.equal(picks.hero.ref, 'artist:hero');
  assert.deepEqual(picks.newsletter, { ref: 'new', by: 'auto', keep: [], note: '' });
  picks = { ...picks, about: { ref: 'portfolio:about', by: 'user', keep: ['mood'], note: '' }, hero: { ...picks.hero, note: '이 느낌' } };
  const moved = reconcilePicks({ picks, sections: secs, sampleId: 'cafe', prevSampleId: 'artist', parts, samples });
  assert.equal(moved.about.ref, 'portfolio:about');
  assert.equal(moved.hero.ref, 'artist:hero');
  assert.equal(moved.hero.by, 'user');
  const plain = reconcilePicks({ picks: { hero: { ref: 'artist:hero', by: 'auto', keep: [], note: '' } }, sections: ['hero'], sampleId: 'cafe', prevSampleId: 'artist', parts, samples });
  assert.equal(plain.hero.ref, 'cafe:hero');
  assert.deepEqual(Object.keys(reconcilePicks({ picks: moved, sections: ['about'], sampleId: 'cafe', parts, samples })), ['about']);
});

test('normalizePick: wrong section pair, bad format and new+keep are repaired', () => {
  // portfolio:works is a featured candidate, not an about one.
  assert.equal(normalizePick('about', { ref: 'portfolio:works', by: 'user', keep: [], note: '' }, 'artist', parts, samples).ref, 'artist:about');
  assert.equal(normalizePick('about', { ref: 'x`y', by: 'user' }, 'artist', parts, samples).by, 'auto');
  assert.deepEqual(normalizePick('about', { ref: 'new', by: 'user', keep: ['mood'], note: 'a' }, 'artist', parts, samples).keep, []);
  assert.deepEqual(normalizePick('about', { ref: 'artist:about', by: 'user', keep: ['mood', 'mood', 'x', 'layout'], note: 'a' }, 'artist', parts, samples).keep, ['layout', 'mood']);
  assert.equal(normalizePick('about', { ref: 'artist:about', by: 'evil', keep: [], note: 'x'.repeat(400) }, 'artist', parts, samples).note.length, 300);
});

test('cleanNote keeps line breaks and removes controls and bidi', () => {
  assert.equal(cleanNote(' 첫 줄\r\n둘째‮줄\n\n\n\n셋째\u0007 '), '첫 줄\n둘째줄\n\n셋째');
  assert.equal(cleanNote(5), '');
});

test('store normalize fills picks from the catalog and drops stale ones', () => {
  const s = normalize({ ...INITIAL, sampleId: 'artist', sections: ['hero', 'gallery', 'about'], picks: { about: { ref: 'cafe:story', by: 'user' }, story: { ref: 'artist:statement' } } }, ['artist'], catalog);
  assert.deepEqual(Object.keys(s.picks).sort(), ['about', 'hero']);
  assert.equal(s.picks.about.ref, 'artist:about');
  assert.deepEqual(normalize(null), INITIAL);
});

test('buildOrder: picks keys = sections minus gallery, notes cleaned, version, summary lines', () => {
  const state = normalize({ ...INITIAL, sampleId: 'artist', form: { email: 'a@example.com', siteName: '이름', oneLiner: '목적', name: '' }, sections: ['hero', 'gallery', 'about', 'newsletter'], galleryNote: ' 큰 사진\n위주 ' }, ['artist'], catalog);
  state.picks.about = { ref: 'portfolio:about', by: 'user', keep: ['layout', 'mood'], note: '사진 크게\r\n글은 짧게‮' };
  const d = buildOrder({ state, data, sections, parts, identity });
  assert.deepEqual(Object.keys(d.picks), ['hero', 'about', 'newsletter']);
  assert.equal(d.picks.about, 'portfolio:about|user|layout,mood|사진 크게\n글은 짧게');
  assert.deepEqual(decodePick(d.picks.about), { ref: 'portfolio:about', by: 'user', keep: ['layout', 'mood'], note: '사진 크게\n글은 짧게' });
  assert.equal(decodePick(d.picks.hero).ref, 'artist:hero');
  assert.equal(d.picks.newsletter, 'new|auto||');
  assert.equal(d.galleryNote, '큰 사진\n위주');
  assert.equal(d.partsVersion, parts.version);
  assert.deepEqual(d.brief.sections.map((x) => x.id), ['hero', 'gallery', 'about', 'newsletter']);
  const text = summaryText(state, data, sections, parts);
  assert.ok(text.includes('03 소개: 포트폴리오') || text.includes('03 소개: '), text);
  assert.ok(text.includes('반영할 점: 구성, 분위기'));
  assert.ok(text.includes('의견: 사진 크게 / 글은 짧게'));
  assert.ok(text.includes('04 뉴스레터·소식 구독: 새로 구성 참고') || text.includes('새로 구성'));
  assert.ok(!summaryText(state, data, sections, parts, { notes: false }).includes('사진 크게'));
  const noGallery = buildOrder({ state: { ...state, sections: ['hero'] }, data, sections, parts, identity });
  assert.equal(noGallery.galleryNote, '');
  assert.deepEqual(Object.keys(noGallery.picks), ['hero']);
  const back = stateFromDoc(d, state);
  assert.deepEqual(back.picks, Object.fromEntries(Object.entries(d.picks).map(([k, v]) => [k, decodePick(v)])));
  assert.equal(back.galleryNote, d.galleryNote);
});

test('pickLabel words', () => {
  assert.equal(pickLabel('소개', { ref: 'artist:about' }, samples), '화가 윤서현의 소개 화면');
  assert.equal(pickLabel('소개', { ref: 'new' }, samples), '새로 구성');
  assert.equal(partsFor(parts, 'gallery').length, 0);
});

test('wire format: round trip, note may hold | and line breaks, junk rejected', () => {
  for (const p of [{ ref: 'artist:hero', by: 'user', keep: ['layout', 'content'], note: 'a|b\nc' }, { ref: 'new', by: 'auto', keep: [], note: '' }]) assert.deepEqual(decodePick(encodePick(p)), p);
  assert.equal(encodePick({ ref: 'new', by: 'user', keep: ['mood'], note: '' }), 'new|user||');
  assert.equal(encodePick({ ref: 'a:b', by: 'user', keep: ['content', 'layout', 'layout'], note: '' }), 'a:b|user|layout,content|');
  for (const bad of ['new|auto|mood|', 'a:b|user|mood,layout|', 'A:b|user||', 'a:b|x||', 'a:b|user|', `a:b|user||${'x'.repeat(301)}`, 5, null]) assert.equal(decodePick(bad), null, String(bad));
});

test('the client wire regex and the firestore.rules regex accept the same strings', () => {
  const rules = read('../../v3/backend/firestore.rules');
  const src = /m\[id\]\.matches\('([^']+)'\)/.exec(rules)[1].replace(/\\\\/g, '\\').replace('(?s:.{0,300})', '([\\s\\S]{0,300})');
  const re = new RegExp(src, 'u');
  const cases = ['artist:hero|user|layout,mood|x', 'new|auto||', 'new|auto|mood|', 'a:b|user|mood,layout|', 'a:b|user||' + '가'.repeat(300), 'a:b|user||' + '가'.repeat(301), 'a:b|user||a|b\nc', 'Artist:x|user||'];
  for (const c of cases) assert.equal(re.test(c), decodePick(c) !== null, c);
});

test('an unknown ref falls back to the automatic screen but keeps the note; notes cut by code point', () => {
  const p = normalizePick('about', { ref: 'artist:gone', by: 'user', keep: ['mood'], note: '지우면 안 됨' }, 'artist', parts, samples);
  assert.deepEqual(p, { ref: 'artist:about', by: 'auto', keep: [], note: '지우면 안 됨' });
  const emoji = '😀'.repeat(301);
  assert.equal(Array.from(cleanNote(emoji)).length, 300);
  assert.ok(!/[\ud800-\udbff]$/.test(cleanNote('a'.repeat(299) + '😀😀')));
});
