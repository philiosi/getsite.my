/* The real browser path of api.uploadRefFile (v3/order/api.js) against a routed fake of the ref-upload.gs
   web app: no Firebase, no Apps Script, nothing leaves the machine.
   Run: python3 -m http.server 5180 --bind 127.0.0.1 (repo root)  then  PW_DIR=<dir with playwright-core> node tests/v5/upload-client.mjs */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright-core', { paths: [process.env.PW_DIR || process.cwd()] }));
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:5180';
const FAKE = 'https://script.google.com/macros/s/FAKE/exec';
let fails = 0;
const check = (ok, name) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) fails++; };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const seen = [];
let answer = { ok: true };
await page.route(/firestore|firebasejs|googleapis/, (r) => r.abort());
await page.route(FAKE, async (r) => {
  const req = r.request();
  seen.push({ method: req.method(), type: req.headers()['content-type'], body: req.postData() });
  await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer) });
});
// The deployed web app (REF_UPLOAD_URL in api.js) is intercepted too, so nothing real is called.
const deployed = [];
await page.route(/script\.google\.com\/macros\/s\/AKfy/, async (r) => { deployed.push(r.request().url()); await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":false,"error":"no-order"}' }); });
await page.goto(`${ORIGIN}${process.env.PAGE || '/v5/'}`);
const run = (url) => page.evaluate(async ([u]) => {
  if (u) window.__REF_UPLOAD_URL__ = u; else delete window.__REF_UPLOAD_URL__;
  delete window.__GETSITE_API__;
  const { api } = await import('/v3/order/api.js');
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2])], 'photo.jpg', { type: 'image/jpeg' });
  try { await api().uploadRefFile('WO-2026-1234-ABCDEFGHIJKLMNOPQRST', 'ref-1.jpg', file, 'image/jpeg'); return 'ok'; } catch (e) { return `throw:${e.code}`; }
}, [url]);

check(await run(FAKE) === 'ok', 'saved answer resolves');
const body = JSON.parse(seen[0]?.body || '{}');
check(seen[0]?.method === 'POST' && /^text\/plain/.test(seen[0]?.type || ''), 'POST as text/plain (no CORS preflight)');
check(body.key === 'WO-2026-1234-ABCDEFGHIJKLMNOPQRST' && body.name === 'ref-1.jpg' && body.type === 'image/jpeg', 'key, name, type sent');
check(body.data === Buffer.from([0xff, 0xd8, 0xff, 1, 2]).toString('base64'), 'bytes sent as plain base64 (no data: prefix)');
answer = { ok: true, exists: true };
check(await run(FAKE) === 'ok', 'exists (retry after a lost answer) counts as done');
answer = { ok: false, error: 'not-listed' };
check(await run(FAKE) === 'throw:not-listed', 'a refusal throws with its code');
check(await run('') === 'throw:no-order', 'without an override the deployed web app URL is used');
check(deployed.length === 1 && seen.length === 3, 'one request, to the deployed URL only');
await browser.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
