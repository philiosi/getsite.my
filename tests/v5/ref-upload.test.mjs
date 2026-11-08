/* ref-upload.gs (Apps Script web app that saves v5 reference files into Drive), run in node:vm with fake
   Firestore, Drive, Lock and Utilities. Nothing real is called.
   Run: node --test tests/v5/ref-upload.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const KEY = 'WO-2026-1234-ABCDEFGHIJKLMNOPQRST';
const NOW = Date.parse('2026-11-08T10:00:00Z');
const MAGIC = {
  jpg: [0xff, 0xd8, 0xff, 0xe0], png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], gif: [...Buffer.from('GIF89a')],
  webp: [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')], heic: [0, 0, 0, 24, ...Buffer.from('ftypheic')], zip: [0x50, 0x4b, 0x03, 0x04],
};
const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', zip: 'application/zip' };
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

function folder(name) {
  const f = { name, folders: new Map(), files: new Map() };
  f.getFoldersByName = (n) => { const x = f.folders.get(n); return { hasNext: () => !!x, next: () => x }; };
  f.createFolder = (n) => { const x = folder(n); f.folders.set(n, x); return x; };
  f.getFilesByName = (n) => ({ hasNext: () => f.files.has(n) });
  f.createFile = (blob) => { f.files.set(blob.name, blob); };
  return f;
}

function setup({ files = 'ref-1.jpg,ref-2.zip', createdAt = new Date(NOW - 10 * 60000).toISOString(), status = 200 } = {}) {
  const c = { logs: [] };
  c.console = { error: (...a) => c.logs.push(a.join(' ')), warn() {}, log() {} };
  vm.createContext(c);
  for (const p of ['../../v3/backend/parts-snapshot.gs', '../../v3/backend/catalog-snapshot.gs', '../../v3/backend/brief-sync.gs', '../../v3/backend/ref-upload.gs']) vm.runInContext(read(p), c);
  const drive = folder('My Drive');
  c.requests = [];
  c.request_ = (method, url) => {
    c.requests.push(method + ' ' + url);
    if (status !== 200) throw new Error(`Firestore GET ${status} {"error":"x"}`);
    const fields = { createdAt: { timestampValue: createdAt } };
    if (files !== null) fields.brief = { mapValue: { fields: { references: { mapValue: { fields: { files: { stringValue: files } } } } } } };
    return { fields };
  };
  c.Utilities = {
    base64Decode: (s) => [...Buffer.from(s, 'base64')].map((b) => (b > 127 ? b - 256 : b)), // Apps Script bytes are signed
    newBlob: (bytes, type, name) => ({ bytes, type, name }),
  };
  c.LockService = { getScriptLock: () => { throw new Error('no script lock: it would block syncBriefs'); } };
  c.store = new Map();
  c.CacheService = { getScriptCache: () => ({ get: (k) => c.store.get(k) ?? null, put: (k, v) => c.store.set(k, v) }) };
  c.now = NOW;
  c.DriveApp = { getFoldersByName: drive.getFoldersByName, createFolder: drive.createFolder };
  const saved = () => drive.folders.get('getsite-order-refs')?.folders.get(KEY)?.files;
  const up = (body) => c.handleRefUpload_(typeof body === 'string' ? body : JSON.stringify({ key: KEY, name: 'ref-1.jpg', type: 'image/jpeg', data: b64([...MAGIC.jpg, 1, 2, 3]), ...body }), () => c.now);
  return { c, up, saved };
}
const plain = (o) => JSON.parse(JSON.stringify(o)); // vm objects come from another realm

test('a listed file is saved into getsite-order-refs/<key>/, once, without the script lock', () => {
  const { c, up, saved } = setup();
  assert.deepEqual(plain(up({})), { ok: true });
  const blob = saved().get('ref-1.jpg');
  assert.equal(blob.type, 'image/jpeg');
  assert.equal(blob.bytes.length, 7);
  assert.deepEqual(plain(up({ data: b64([...MAGIC.jpg, 9]) })), { ok: true, exists: true }); // never overwritten
  assert.equal(saved().get('ref-1.jpg').bytes.length, 7);
  assert.deepEqual(plain(up({ name: 'ref-2.zip', type: 'application/zip', data: b64(MAGIC.zip) })), { ok: true });
  assert.equal(c.requests[0], 'GET https://firestore.googleapis.com/v1/projects/getsite-my/databases/(default)/documents/orders/' + KEY);
});

test('every accepted type passes with its real leading bytes', () => {
  const exts = Object.keys(MAGIC);
  const { up, saved } = setup({ files: exts.map((e, i) => `ref-${i + 1}.${e}`).join(',') });
  exts.forEach((e, i) => assert.equal(up({ name: `ref-${i + 1}.${e}`, type: TYPES[e], data: b64(MAGIC[e]) }).ok, true, e));
  assert.equal(saved().size, exts.length);
});

test('bad input is refused before Firestore or Drive is touched', () => {
  const { c, up, saved } = setup();
  const cases = [
    ['not json', 'bad-request'], [JSON.stringify({ key: KEY }), 'bad-request'], ['x'.repeat(28000001), 'bad-request'],
    [{ key: 'WO-2026-1234-short' }, 'bad-key'], [{ key: '../' + KEY }, 'bad-key'],
    [{ name: 'ref-11.jpg' }, 'bad-name'], [{ name: 'ref-1.exe' }, 'bad-name'], [{ name: '../ref-1.jpg' }, 'bad-name'], [{ name: 'ref-1.jpeg' }, 'bad-name'],
    [{ type: 'text/html' }, 'bad-type'], [{ type: 'application/zip' }, 'bad-type'],
    [{ data: 'not base64!' }, 'bad-request'], [{ data: '' }, 'bad-size'],
    [{ data: b64([0x3c, 0x68, 0x74, 0x6d, 0x6c]) }, 'bad-content'], // <html> named .jpg
    [{ name: 'ref-2.zip', type: 'application/zip', data: b64(MAGIC.jpg) }, 'bad-content'],
  ];
  for (const [body, code] of cases) assert.equal(up(body).error, code, JSON.stringify(body).slice(0, 60));
  assert.equal(c.requests.length, 0);
  assert.equal(saved(), undefined);
});

test('over 20MB is refused', () => {
  const { up } = setup();
  const big = Buffer.alloc(20 * 1024 * 1024 + 1); big.set(MAGIC.jpg);
  assert.equal(up({ data: big.toString('base64') }).error, 'bad-size');
});

test('the order decides: missing, unlisted, over 10 names, late', () => {
  assert.equal(setup({ status: 404 }).up({}).error, 'no-order');
  assert.equal(setup({ status: 500 }).up({}).error, 'server');
  assert.equal(setup().up({ name: 'ref-3.jpg' }).error, 'not-listed');
  assert.equal(setup({ files: null }).up({}).error, 'not-listed');
  assert.equal(setup({ files: '' }).up({}).error, 'not-listed');
  assert.equal(setup({ files: Array.from({ length: 11 }, (_, i) => `ref-${(i % 10) + 1}.jpg`).join(',') }).up({}).error, 'not-listed');
  assert.equal(setup({ createdAt: new Date(NOW - 61 * 60000).toISOString() }).up({}).error, 'expired');
  assert.equal(setup({ createdAt: 'garbage' }).up({}).error, 'expired');
});

test('endpoint caps: requests a minute before the Firestore read, bytes per 6 hours', () => {
  const { c, up } = setup();
  for (let i = 0; i < 60; i++) up({ name: 'ref-3.jpg' }); // not-listed, still counted
  const reads = c.requests.length;
  assert.equal(up({}).error, 'busy');
  assert.equal(c.requests.length, reads); // refused before the read
  c.now += 60000;
  assert.equal(up({}).ok, true); // next minute
  const s = setup();
  s.c.store.set('bytes-' + Math.floor(NOW / 21600000), String(1024 * 1024 * 1024 - 3));
  assert.equal(s.up({}).error, 'busy');
  assert.equal(s.saved()?.size ?? 0, 0);
  s.c.store.clear();
  assert.equal(s.up({}).ok, true);
  assert.equal(s.c.store.get('bytes-' + Math.floor(NOW / 21600000)), '7');
});

test('the hour is checked again right before saving; errors leak no detail', () => {
  const late = setup({ createdAt: new Date(NOW - 59 * 60000).toISOString() });
  const orig = late.c.DriveApp.getFoldersByName;
  late.c.DriveApp.getFoldersByName = (n) => { late.c.now += 2 * 60000; return orig(n); }; // the Drive lookup took two minutes
  assert.equal(late.up({}).error, 'expired');
  assert.equal(late.saved()?.size ?? 0, 0);
  const s = setup(); s.c.DriveApp.getFoldersByName = () => { throw new Error('secret detail'); };
  assert.deepEqual(plain(s.up({})), { ok: false, error: 'server' });
  assert.ok(s.c.logs.length && s.c.logs.every((l) => !l.includes('secret') && !l.includes(KEY.slice(12))));
});

test('doPost wraps the result as JSON text', () => {
  const { c } = setup();
  c.ContentService = { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType(m) { this.m = m; return this; } }) };
  const r = c.doPost({ postData: { contents: 'nope' } });
  assert.equal(r.m, 'json');
  assert.deepEqual(JSON.parse(r.t), { ok: false, error: 'bad-request' });
  assert.deepEqual(JSON.parse(c.doPost(undefined).t), { ok: false, error: 'bad-request' });
});

test('the deploy copy is identical', () => {
  assert.equal(read('../../deploy/apps-script/ref-upload.gs'), read('../../v3/backend/ref-upload.gs'));
});
