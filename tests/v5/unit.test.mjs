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
  assert.deepEqual(out.map((s) => s.id), ['outreach-todos-cafe', 'outreach-blessing-atelier', 'outreach-hansol-pilates', 'outreach-romi-bungee-yoga']);
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
