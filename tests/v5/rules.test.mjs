/* v5 reference fields in firestore.rules, run in the local emulator only (project demo-getsite).
   The files themselves go to Drive through ref-upload.gs (tests/v5/ref-upload.test.mjs); storage.rules stays deny-all.
   Run: firebase emulators:exec --only firestore --project demo-getsite --config <cfg> "PW_DIR=<deps> node --test tests/v5/rules.test.mjs" */
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { newOrderIdentity } from '../../v3/order/api.js';

const require = createRequire(import.meta.url);
const from = (name) => require(require.resolve(name, { paths: [process.env.PW_DIR] }));
const { initializeTestEnvironment, assertSucceeds, assertFails } = from('@firebase/rules-unit-testing');
const { doc, setDoc, serverTimestamp } = from('firebase/firestore');

const env = await initializeTestEnvironment({
  projectId: 'demo-getsite',
  firestore: { rules: readFileSync(new URL('../../v3/backend/firestore.rules', import.meta.url), 'utf8') },
});
const ALL = ['hero', 'about', 'story', 'gallery', 'featured', 'history', 'process', 'services', 'trust', 'faq', 'contact', 'booking', 'newsletter'];
function v4(extra = {}, sections = ['hero', 'gallery'], refs = {}) {
  const order = newOrderIdentity();
  const picks = Object.fromEntries(sections.filter((s) => s !== 'gallery').map((s) => [s, `new|auto||${'의견'.repeat(10)}`]));
  return { order, data: { schema: 'v4', displayNo: order.displayNo, catalogVersion: 'v4', email: 'a@b.co', siteName: '가게', oneLiner: '소개', name: '', topic: 'artist', sampleId: 'artist', sections, picks, galleryNote: '', partsVersion: 'none', galleryLayout: 'auto', ref1: 'https://pin.it/abc', ref2: '', ref3: '', materials: 'have', estimate: { pages: 0, video: false, revisions: 0, total: 500000 }, status: '샘플 제작 대기', briefStatus: 'pending', opMail: 'pending', custMail: 'pending', driveFolderUrl: '', createdAt: serverTimestamp(), brief: { schema: 'getsite.brief.v2', catalogVersion: 'v4', order: { displayNo: order.displayNo, createdAt: '2026-01-01' }, delivery: { email: 'a@b.co' }, sample: { id: 'artist', title: '작가', topic: 'artist', url: 'https://example.com' }, sections: sections.map((id) => ({ id, label: id })), gallery: { layoutId: 'auto', name: '제작자에게 맡기기' }, references: { customerLinks: ['https://pin.it/abc'], refNotes: ['', '', ''], files: '', fileNote: '', ...refs }, sampleScope: {}, customerText: { siteName: '가게', oneLiner: '소개', name: '' } }, ...extra } };
}
const REFS = { refNotes: ['베이지 색감', '', ''], files: 'ref-1.jpg,ref-2.zip', fileNote: '따뜻한 조명' };
const withRefs = (refs = REFS, sections) => v4({}, sections, refs);
const anon = () => env.unauthenticatedContext();
const create = (o) => setDoc(doc(anon().firestore(), 'orders', o.order.key), o.data);

test('firestore: a v4 order without the reference fields still passes', async () => { await assertSucceeds(create(v4())); });
test('firestore: reference notes and files ride in the brief, with all 13 sections (expression limit)', async () => {
  await assertSucceeds(create(withRefs()));
  await assertSucceeds(create(withRefs({ refNotes: ['가'.repeat(100), '나'.repeat(100), '다'.repeat(100)], files: Array.from({ length: 10 }, (_, i) => `ref-${i + 1}.${['jpg', 'png', 'webp', 'gif', 'heic', 'zip'][i % 6]}`).join(','), fileNote: '라'.repeat(200) }, ALL)));
});
test('firestore: the reference fields are refused at the top level (the key set stays exact)', async () => {
  for (const extra of [{ refNotes: ['a', '', ''] }, { refFiles: 'ref-1.jpg' }, { refFileNote: 'x' }]) await assertFails(create(v4(extra)));
});

test('firestore: the gallery lab layouts are accepted, with all 13 sections; an unknown layout is refused', async () => {
  for (const id of ['peek', 'autoplay', 'drag', 'thumbnav', 'museum']) { const o = withRefs(REFS, ALL); o.data.galleryLayout = id; await assertSucceeds(create(o)); }
  await assertFails(create(v4({ galleryLayout: 'carousel' })));
});

test('firestore: the Daol sample (studio) is accepted with all 13 sections; an unknown sample is refused', async () => {
  const o = withRefs(REFS, ALL); o.data.topic = 'studio'; o.data.sampleId = 'daol'; await assertSucceeds(create(o));
  await assertFails(create(v4({ sampleId: 'daol-x' })));
});

test.after(() => env.cleanup());
