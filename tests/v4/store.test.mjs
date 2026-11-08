/* State restore hardening and the reference/key validators (no browser). Run: node --test tests/v4/store.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, INITIAL, validRef, validForm, doneSteps, total } from '../../v4/store.js';

test('normalize: a hostile or stale session value never throws and falls back field by field', () => {
  const bad = { step: 9, form: { email: null, siteName: 1 }, sections: [1, 'about', 'about', 'nope'], gallery: 'x', refs: ['a'], extras: { pages: '1', video: 'yes', revisions: 99 }, order: { key: 'short' }, materials: 'maybe', consent: 'true' };
  const s = normalize(bad, ['artist']);
  assert.equal(s.step, 1);
  assert.deepEqual(s.form, { email: '', siteName: '', oneLiner: '', name: '' });
  assert.deepEqual(s.sections, ['about']);
  assert.equal(s.gallery, 'auto');
  assert.deepEqual(s.refs, ['', '', '']);
  assert.deepEqual(s.extras, { pages: 0, video: false, revisions: 0 });
  assert.equal(s.order, null);
  assert.equal(s.materials, 'have');
  assert.equal(s.consent, false);
  assert.doesNotThrow(() => doneSteps(s));
  assert.doesNotThrow(() => validForm({ email: null }));
  assert.deepEqual(normalize(null), INITIAL);
  assert.deepEqual(normalize('str'), INITIAL);
});

test('normalize: a good value round-trips, unknown sample ids are dropped', () => {
  const good = { ...INITIAL, step: 4, sampleId: 'artist', sections: ['hero', 'gallery'], gallery: 'grid', extras: { pages: 2, video: true, revisions: 1 }, order: { key: 'WO-2026-1234-ABCDEFGHJKLMNPQRSTUV', displayNo: 'WO-2026-1234', saved: true, summary: 'x' } };
  const s = normalize(good, ['artist']);
  assert.equal(s.step, 4); assert.equal(s.sampleId, 'artist'); assert.deepEqual(s.sections, ['hero', 'gallery']); assert.equal(s.gallery, 'grid');
  assert.deepEqual(s.extras, { pages: 2, video: true, revisions: 1 });
  assert.equal(s.order.saved, true); assert.equal(s.order.summary, 'x');
  assert.equal(normalize({ sampleId: 'gone' }, ['artist']).sampleId, null);
});

test('validRef: https with a real host only', () => {
  for (const ok of ['', 'https://pin.it/abc', 'https://www.pinterest.com/pin/1/', 'https://example.co.kr:8443/x?y=1']) assert.equal(validRef(ok), true, ok);
  for (const bad of ['http://pin.it/a', 'https://::::', 'https://localhost/x', 'javascript:alert(1)', 'https://', `https://a.com/${'x'.repeat(300)}`, 5]) assert.equal(validRef(bad), false, String(bad));
});

test('total: published prices', () => {
  assert.equal(total({ pages: 0, video: false, revisions: 0 }), 500000);
  assert.equal(total({ pages: 2, video: true, revisions: 1 }), 950000);
});
