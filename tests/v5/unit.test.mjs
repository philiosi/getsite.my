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
