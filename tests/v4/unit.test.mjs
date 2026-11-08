import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INITIAL, total } from '../../v4/store.js';
import { buildOrder, summaryText, parseLookup, submitOrder } from '../../v4/order.js';
const data = JSON.parse(await readFile(new URL('../../v4/data/samples.json', import.meta.url)));
const sections = JSON.parse(await readFile(new URL('../../v4/data/sections.json', import.meta.url))).sections;
const identity = { displayNo: 'WO-2026-1234', key: 'WO-2026-1234-abcdefghijklmnopqrst' };
const state = { ...INITIAL, sampleId: 'artist', form: { email: 'a@example.com', siteName: '이름\u2028`test`', oneLiner: '목적', name: '' }, sections: ['contact', 'hero'], refs: ['', 'https://example.com/a', ''], extras: { pages: 2, video: true, revisions: 3 } };
const build = (s = state) => buildOrder({ state: s, data, sections, identity, now: new Date('2026-01-01T00:00:00Z') });
test('계약 필드와 순서, 입력 정리', () => { const d = build(); assert.deepEqual(Object.keys(d).sort(), ['schema','displayNo','catalogVersion','email','siteName','oneLiner','name','topic','sampleId','sections','galleryLayout','ref1','ref2','ref3','materials','picks','galleryNote','partsVersion','estimate','status','briefStatus','opMail','custMail','driveFolderUrl','brief'].sort()); assert.deepEqual(Object.keys(d.brief).sort(), ['schema','catalogVersion','order','delivery','sample','sections','gallery','references','sampleScope','customerText'].sort()); assert.deepEqual(d.brief.sections.map(x => x.id), ['contact','hero']); assert.equal(d.siteName, '이름 `test`'); assert.equal(d.brief.customerText.siteName, d.siteName); assert.equal(d.estimate.total, 1050000); assert.equal(total(state.extras), 1050000); });
test('레퍼런스 검증', () => { assert.throws(() => build({ ...state, refs: ['http://example.com', '', ''] })); assert.equal(build().ref2, 'https://example.com/a'); });
test('조회 코드와 링크 추출', () => { assert.deepEqual(parseLookup(identity.key), { key: identity.key }); assert.deepEqual(parseLookup(`https://example.com/v3/order.html#t=${identity.key}`), { key: identity.key }); assert.deepEqual(parseLookup(`/p/${identity.key}`), { key: identity.key }); assert.deepEqual(parseLookup(identity.displayNo), { short: true }); assert.equal(parseLookup('잘못된 코드'), null); });
test('요약에 샘플과 섹션 포함', () => { const text = summaryText(state, data, sections); assert.ok(text.includes(data.samples.find(x => x.id === 'artist').title)); assert.ok(text.includes('연락처·문의')); assert.ok(text.includes('첫 장면')); assert.ok(text.includes('`test`')); });
test('실패한 쓰기 재시도는 기존 주문을 확인', async () => { globalThis.__GETSITE_API__ = { saveOrder: async () => { throw Object.assign(new Error(), { code: 'permission-denied' }); }, loadOrder: async () => ({ driveFolderUrl: '' }) }; try { const result = await submitOrder({ state: { ...state, order: identity }, data, sections }); assert.equal(result.key, identity.key); assert.equal(result.saved, true); } finally { delete globalThis.__GETSITE_API__; } });
test('리뷰 회귀: 참고 링크 문자 집합과 이메일 제어 문자', async () => {
  const { validRef } = await import('../../v4/store.js');
  for (const bad of ['https://example.com/a`b', 'https://example.com/<x>', 'https://example.com/a>b']) assert.equal(validRef(bad), false, bad);
  assert.equal(validRef('https://example.com/a-b?c=d'), true);
  const d = build({ ...state, form: { ...state.form, email: 'User​@Example.com' } });
  assert.equal(d.email, 'user@example.com');
});
test('리뷰 회귀: 타임아웃 복구는 서버에 있던 내용을 sentState로 돌려준다', async () => {
  const server = build({ ...state, form: { ...state.form, siteName: '원래 이름' } });
  globalThis.__GETSITE_API__ = { saveOrder: async () => { const e = new Error('t'); e.code = 'timeout'; throw e; }, loadOrder: async () => server };
  try {
    const out = await submitOrder({ state: { ...state, order: { key: identity.key, displayNo: identity.displayNo } }, data, sections });
    assert.equal(out.sentState.form.siteName, '원래 이름');
    assert.match(out.summary, /원래 이름/);
  } finally { delete globalThis.__GETSITE_API__; }
});
test('영상 장면과 영상 옵션: 장면이 켠 옵션은 장면이 빠지면 꺼지고, 고객이 켠 옵션은 그대로', async () => {
  const { createAppStore } = await import('../../v4/store.js');
  const parts = JSON.parse(await readFile(new URL('../../v4/data/parts.json', import.meta.url)));
  const mk = () => { const st = createAppStore({ sampleIds: data.samples.map((x) => x.id), parts, samples: data.samples }); st.reset(); st.pickSample('artist'); return st; };
  let st = mk();
  st.setPick('hero', 'motion-2:scene-video');
  assert.equal(st.get().extras.video, true); assert.equal(st.get().videoAuto, true);
  st.setPick('hero', 'motion-2:scene-tiles');
  assert.equal(st.get().extras.video, false, '다른 장면으로 바꾸면 장면이 켠 옵션은 꺼진다');
  st.setPick('hero', 'motion-2:scene-video'); st.toggleSection('hero');
  assert.equal(st.get().extras.video, false, '첫 장면 섹션을 빼도 꺼진다');
  st = mk();
  st.setExtra('video', true); st.setPick('hero', 'motion-2:scene-video'); st.setPick('hero', 'artist:hero');
  assert.equal(st.get().extras.video, true, '고객이 먼저 켠 옵션은 유지');
  st = mk();
  st.setPick('hero', 'motion-2:scene-video'); st.setExtra('video', true); st.setPick('hero', 'artist:hero');
  assert.equal(st.get().extras.video, true, '고객이 직접 만진 뒤에는 장면을 따라가지 않는다');
  st = mk();
  st.setPick('hero', 'motion-2:scene-watercolor');
  assert.equal(st.get().extras.video, false, '영상이 아닌 장면은 옵션을 켜지 않는다');
});
