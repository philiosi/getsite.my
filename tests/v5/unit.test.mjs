/* v5 reference helpers without a browser: file name clipping and the recovered-retry mapping. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clipFileName, refStorageName } from '../../v5/store.js';
import { stateFromDoc, refsOut } from '../../v5/order.js';

test('a long file name keeps its extension and never ends in half an emoji', () => {
  const n = clipFileName(`${'가'.repeat(130)}.png`);
  assert.equal(n.length, 120); assert.ok(n.endsWith('.png'));
  const e = clipFileName(`${'가'.repeat(114)}😀😀.jpg`);
  assert.ok(e.endsWith('.jpg')); assert.doesNotMatch(e, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  assert.equal(refStorageName(1, 'photo.JPEG'), 'ref-2.jpg');
});

test('a recovered retry pairs saved names with held files only when they match', () => {
  const fallback = { refs: ['', '', ''], refNotes: ['', '', ''], refFiles: [{ id: 'a', name: 'x.zip', size: 1, type: '' }, { id: 'b', name: 'y.png', size: 1, type: '' }], refFileNote: '' };
  const doc = { ref1: '', ref2: '', ref3: '', brief: { references: { refNotes: ['', '', ''], files: 'ref-1.jpg,ref-2.png', fileNote: '빛' } } };
  const st = stateFromDoc(doc, fallback);
  assert.deepEqual(st.refFiles.map((f) => f.id), ['', 'b']);
  assert.deepEqual(refsOut(st).names, ['ref-1.jpg', 'ref-2.png']);
  assert.equal(st.refFileNote, '빛');
});

/* ?sample= from an outreach sample: the sample, its name and purpose, and its sections in one edit. */
import { readFile } from 'node:fs/promises';
import { createAppStore, SECTION_IDS } from '../../v5/store.js';
const load = async (f) => JSON.parse(await readFile(new URL(`../../v5/data/${f}`, import.meta.url)));

test('outreach registry: ids, topics and section ids are valid; public samples are untouched', async () => {
  const pub = await load('samples.json'); const out = (await load('outreach.json')).samples;
  const topics = pub.topics.map((t) => t.id);
  assert.deepEqual(out.map((s) => s.id), ['outreach-todos-cafe', 'outreach-blessing-atelier', 'outreach-hansol-pilates', 'outreach-romi-bungee-yoga', 'outreach-steira-yoga', 'outreach-olc-coffee']);
  for (const s of out) {
    assert.match(s.id, /^outreach-[a-z0-9-]{1,30}$/);
    assert.ok(topics.includes(s.topic), `${s.id} topic`);
    assert.ok(s.sectionIds.length >= 1 && s.sectionIds.every((id) => SECTION_IDS.includes(id)), `${s.id} sectionIds`);
    assert.equal(new Set(s.sectionIds).size, s.sectionIds.length);
    assert.ok(s.siteName.length <= 80 && s.purpose.length <= 200);
    assert.match(s.url, /^https:\/\/getsite-samples\.web\.app\/outreach\//);
  }
  assert.ok(!pub.samples.some((s) => s.id.startsWith('outreach-')), 'public cards stay free of outreach samples');
});

test('every outreach id is also in the firestore.rules sample whitelist (else the order fails at submit)', async () => {
  const rules = await readFile(new URL('../../v3/backend/firestore.rules', import.meta.url), 'utf8');
  for (const s of (await load('outreach.json')).samples) assert.ok(rules.includes(`'${s.id}'`), `${s.id} missing from firestore.rules`);
});

test('startFromSample picks the sample, fills name and purpose, sets its sections and opens step 2', async () => {
  const pub = await load('samples.json'); const out = (await load('outreach.json')).samples;
  const parts = await load('parts.json'); const pool = [...pub.samples, ...out];
  const st = createAppStore({ sampleIds: pool.map((s) => s.id), parts, samples: pool });
  const hansol = out.find((s) => s.id === 'outreach-hansol-pilates');
  st.setField('email', 'a@b.co');
  st.startFromSample(hansol);
  const s = st.get();
  assert.equal(s.sampleId, 'outreach-hansol-pilates'); assert.equal(s.step, 2);
  assert.equal(s.form.siteName, '한솔 필라테스'); assert.equal(s.form.oneLiner, '1:1 개인수업 필라테스 체험 신청 전환');
  assert.equal(s.form.email, 'a@b.co', 'what the customer already typed elsewhere stays');
  assert.deepEqual(s.sections, hansol.sectionIds);
  assert.deepEqual(Object.keys(s.picks).sort(), hansol.sectionIds.filter((id) => id !== 'gallery').sort());
  st.setField('siteName', '내 이름'); assert.equal(st.get().form.siteName, '내 이름', 'the field stays editable');
});

/* 2026-11-20 regression: the document buildOrder sends must carry exactly the keys firestore.rules lists.
   A new top-level key (profile) once made every order fail at submit while all other tests stayed green. */
import { buildOrder } from '../../v5/order.js';
import { newOrderIdentity } from '../../v3/order/api.js';
test('buildOrder sends exactly the key sets firestore.rules allows, and the optional profile rides in brief.references', async () => {
  const rules = await readFile(new URL('../../v3/backend/firestore.rules', import.meta.url), 'utf8');
  const list = (re) => rules.match(re)[1].split(',').map((x) => x.trim().replace(/'/g, ''));
  const top = list(/function validV4\(d\) \{\s*let keys = \[([^\]]+)\]/);
  const brief = list(/b\.keys\(\)\.hasOnly\(\[([^\]]+)\]\)/);
  const pub = await load('samples.json'); const out = (await load('outreach.json')).samples;
  const parts = await load('parts.json'); const sections = (await load('sections.json')).sections; const pool = [...pub.samples, ...out];
  for (const sample of pool) {
    const st = createAppStore({ sampleIds: pool.map((s) => s.id), parts, samples: pool });
    st.startFromSample({ siteName: '가게', purpose: '소개', sectionIds: ['hero', 'about'], ...sample });
    st.setField('email', 'a@b.co'); st.setField('industry', '카페'); st.setField('linkInstagram', 'https://www.instagram.com/sample'); st.setField('linkNaver', 'https://place.map.naver.com/123'); st.setField('linkThreads', 'https://www.threads.net/@sample');
    const doc = buildOrder({ state: st.get(), data: { ...pub, pool }, sections, parts, identity: newOrderIdentity() });
    assert.deepEqual([...Object.keys(doc), 'createdAt'].sort(), [...top].sort(), sample.id + ' top-level keys');
    assert.ok(Object.keys(doc.brief).every((k) => brief.includes(k)), sample.id + ' brief keys');
    assert.equal(doc.sampleId, sample.id); assert.ok(rules.includes("'" + sample.id + "'"), sample.id + ' in the rules list');
    assert.equal(typeof doc.brief.references.profile, 'string', 'one string: a map costs rule expressions');
    assert.deepEqual(JSON.parse(doc.brief.references.profile).links, { threads: 'https://www.threads.net/@sample', instagram: 'https://www.instagram.com/sample', naverPlace: 'https://place.map.naver.com/123', homepage: '' });
    assert.equal(JSON.parse(doc.brief.references.profile).industry, '카페');
    const bare = createAppStore({ sampleIds: pool.map((s) => s.id), parts, samples: pool }); bare.startFromSample({ siteName: '가게', purpose: '소개', sectionIds: ['hero', 'about'], ...sample }); bare.setField('email', 'a@b.co');
    for (const k of ['industry', 'mood', 'linkThreads', 'linkInstagram', 'linkNaver', 'linkHomepage', 'menu', 'customers']) bare.setField(k, '');
    assert.ok(!('profile' in buildOrder({ state: bare.get(), data: { ...pub, pool }, sections, parts, identity: newOrderIdentity() }).brief.references), 'an empty profile is not sent');
    const back = stateFromDoc(doc, st.get());
    assert.equal(back.form.linkInstagram, 'https://www.instagram.com/sample'); assert.equal(back.form.industry, '카페');
  }
});
