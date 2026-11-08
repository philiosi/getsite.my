/* Browser checks for v5 (step 3: sections as structure only, hero motion as examples, gallery picked)
   against a local server. Firebase is blocked; orders go to a fake API.
   Run: python3 -m http.server 5180 --bind 127.0.0.1 (repo root)  then  PW_DIR=<dir with playwright-core> node tests/v5/e2e.mjs [shots dir] */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright-core', { paths: [process.env.PW_DIR || process.cwd()] }));
const BASE = process.env.BASE || 'http://127.0.0.1:5180/v5/';
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const FORBIDDEN = /firestore\.googleapis|firebaseio|gstatic\.com\/firebasejs|script\.google\.com/;
const FAKE = `window.__calls=[];window.__store={};window.__uploads=[];window.__log=[];window.__failUpload=[];window.__GETSITE_API__={
  async saveOrder(key,doc){window.__log.push('save');window.__calls.push({key,doc});window.__store[key]=doc;},
  async uploadRefFile(key,name,file,contentType){window.__log.push('up:'+name);if(window.__slow)await new Promise(r=>setTimeout(r,window.__slow));if(window.__failUpload.includes(name))throw new Error('fake upload failure');window.__uploads.push({key,name,size:file.size,contentType});},
  async loadOrder(key){return window.__store[key]||null;},
  async requestFolder(){return null;},
  async loadConfig(){return null;},
};`;
// The same wire regex as firestore.rules pk().
const PICK_RULE = /^(new[|](auto|user)[|]|[a-z0-9-]{1,40}:[A-Za-z0-9_-]{1,40}[|](auto|user)[|](layout|mood|content|layout,mood|layout,content|mood,content|layout,mood,content)?)[|][\s\S]{0,300}$/;

async function open(viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = []; const forbidden = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.route(FORBIDDEN, (route) => { forbidden.push(route.request().url()); route.abort(); });
  await page.addInitScript(FAKE);
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => !!window.__getsite4);
  return { context, page, errors, forbidden };
}
const wait = (page, ms) => page.waitForTimeout(ms);
const st = (page) => page.evaluate(() => window.__getsite4.store.get());

{
  const { page, errors, forbidden, context } = await open();
  await page.evaluate(() => {
    const s = window.__getsite4.store; s.reset(); s.pickSample('artist');
    ['email', 'siteName', 'oneLiner'].forEach((k, i) => s.setField(k, ['v5@example.com', '오후 화실', '작품 소개'][i]));
    for (const id of ['about', 'contact']) if (!s.get().sections.includes(id)) s.toggleSection(id);
    s.setStep(3);
  });
  await wait(page, 600);
  const s0 = await st(page);
  check('structure: every non-gallery section is sent as 새로 구성', Object.values(s0.picks).every((p) => p.ref === 'new'), JSON.stringify(s0.picks));
  check('structure: no "다른 화면 고르기" strip anywhere', (await page.$$('[data-alt-toggle], .alt-track')).length === 0);
  const tiles = await page.$$eval('#panel-3 .tile', (t) => t.map((x) => ({ id: x.dataset.section, src: x.querySelector('.src')?.textContent || '', wire: !!x.querySelector('.wire') })));
  check('structure: plain sections show a structure tile, not a captured screen', tiles.filter((t) => !['hero', 'gallery'].includes(t.id)).every((t) => t.wire && /구성만/.test(t.src)), JSON.stringify(tiles));

  // Section colours: each section its own ground, a number + name + sketch, the same colour in the order list.
  await page.evaluate(() => { const s = window.__getsite4.store; for (const id of ['story', 'history', 'faq']) if (!s.get().sections.includes(id)) s.toggleSection(id); });
  await wait(page, 400);
  const look = await page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
    const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
    const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const order = window.__getsite4.store.get().sections;
    return [...document.querySelectorAll('#panel-3 .tile')].filter((t) => !['hero', 'gallery'].includes(t.dataset.section)).map((t) => {
      const w = t.querySelector('.wire'); const id = t.dataset.section;
      const bg = getComputedStyle(w).backgroundColor;
      const nm = t.querySelector('.wire-name'); const sub = t.querySelector('.wire-sub');
      const li = document.querySelector(`.stack li[data-id="${id}"] .no`);
      return {
        id, bg: rgb(bg).join(','),
        no: t.querySelector('.wire-no')?.textContent, want: String(order.indexOf(id) + 1).padStart(2, '0'),
        name: nm?.textContent, sketch: !!t.querySelector(`.sk.sk-${id}`) && t.querySelector(`.sk.sk-${id}`).children.length > 0,
        cName: nm ? ratio(getComputedStyle(nm).color, bg) : 0, cSub: sub ? ratio(getComputedStyle(sub).color, bg) : 0,
        list: li ? rgb(getComputedStyle(li).backgroundColor).join(',') : null,
      };
    });
  });
  check('colour: every plain section has its own ground colour', new Set(look.map((l) => l.bg)).size === look.length && look.length >= 5, JSON.stringify(look.map((l) => `${l.id}:${l.bg}`)));
  check('colour: each tile shows its order number, name and its own sketch', look.every((l) => l.no === l.want && l.name && l.sketch), JSON.stringify(look.map((l) => [l.id, l.no, l.want, l.sketch])));
  check('colour: name and description pass AA contrast on the section ground', look.every((l) => l.cName >= 4.5 && l.cSub >= 4.5), JSON.stringify(look.map((l) => [l.id, l.cName.toFixed(1), l.cSub.toFixed(1)])));
  check('colour: the order list number uses the same section colour', look.every((l) => l.list === l.bg), JSON.stringify(look.map((l) => [l.id, l.list, l.bg])));
  await page.evaluate(() => window.__getsite4.store.toggleSection('story'));
  await wait(page, 300);
  const renum = await page.evaluate(() => { const order = window.__getsite4.store.get().sections; return [...document.querySelectorAll('#panel-3 .tile .wire-no')].every((n) => n.textContent === String(order.indexOf(n.closest('.tile').dataset.section) + 1).padStart(2, '0')); });
  check('colour: numbers follow the order after a section is removed', renum);
  const heads = await page.evaluate(() => { const order = window.__getsite4.store.get().sections; return [...document.querySelectorAll('#panel-3 .tile')].map((t) => [t.dataset.section, t.querySelector('.tile-head .tile-no')?.textContent, String(order.indexOf(t.dataset.section) + 1).padStart(2, '0')]); });
  check('colour: every tile head (hero and gallery too) shows its order number', heads.every(([, got, want]) => got === want), JSON.stringify(heads));
  const srAll = await page.evaluate(() => [...document.querySelectorAll('#panel-3 .wire-no, #panel-3 .wire-name')].every((e) => e.getAttribute('aria-hidden') === 'true'));
  check('colour: the big number and name are not read twice by screen readers', srAll);
  await page.evaluate(() => { const s = window.__getsite4.store; for (const id of ['history', 'faq']) if (s.get().sections.includes(id)) s.toggleSection(id); });
  await wait(page, 300);

  // Hero: motion scenes as examples only.
  const heroBtn = await page.$eval('.tile[data-section="hero"] [data-motion-open]', (b) => b.textContent).catch(() => null);
  check('motion: the hero tile offers the 7 scenes as examples', heroBtn === '모션 예시 보기 (7)', heroBtn);
  await page.click('.tile[data-section="hero"] [data-motion-open]');
  await page.waitForSelector('dialog.picker[data-picker="motion"][open]');
  await page.waitForFunction(() => document.querySelector('dialog.picker .picker-loading')?.hidden === true, null, { timeout: 90000 });
  const dlg = await page.evaluate(() => ({ title: document.querySelector('dialog.picker h3').textContent, choose: !!document.querySelector('dialog.picker [data-picker-choose]'), opts: document.querySelectorAll('dialog.picker [role="radio"]').length, chosen: !!document.querySelector('dialog.picker .picker-chosen') }));
  check('motion: viewer has no choose button and marks nothing as chosen', dlg.title === '첫 장면 모션 예시' && !dlg.choose && dlg.opts === 7 && !dlg.chosen, JSON.stringify(dlg));
  await page.click('dialog.picker [data-value="motion-2:scene-camera"]');
  await wait(page, 600);
  const scene = await page.evaluate(() => document.querySelector('dialog.picker iframe').contentDocument?.querySelector('.scene.on')?.dataset.scene);
  check('motion: looking switches the live example (scene 5)', scene === '4', scene);
  await page.click('dialog.picker [data-value="motion-2:scene-video"]');
  const note = await page.$eval('dialog.picker [data-video-note]', (n) => n.textContent).catch(() => '');
  check('motion: the video scene explains the option and the Remotion remake', /\+200,000원/.test(note) && /Remotion/.test(note), note);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/v5-motion.png` });
  await page.click('dialog.picker .picker-close');
  await wait(page, 300);
  const s1 = await st(page);
  check('motion: looking at examples changes nothing in the order', s1.picks.hero.ref === 'new' && s1.extras.video === false, JSON.stringify({ hero: s1.picks.hero, video: s1.extras.video }));
  check('motion: focus returns to the button that opened it', await page.evaluate(() => document.activeElement?.dataset?.motionOpen === ''));

  // Gallery: picked in the large viewer.
  await page.click('.tile[data-section="gallery"] [data-gallery-open]');
  await page.waitForSelector('dialog.picker[data-picker="gallery"][open]');
  await page.click('dialog.picker [data-value="museum"]');
  await page.click('dialog.picker [data-picker-choose]');
  await wait(page, 300);
  check('gallery: the large viewer sets the layout', (await st(page)).gallery === 'museum');
  if (SHOTS) await page.locator('#panel-3').screenshot({ path: `${SHOTS}/v5-step3.png` });

  // Step 4 and the order.
  await page.evaluate(() => { const s = window.__getsite4.store; s.setNote('about', '작업실 사진 크게'); s.setStep(4); });
  await wait(page, 400);
  const strips = await page.$$eval('li.pick-card .pick-no', (n) => n.map((x) => getComputedStyle(x).backgroundColor));
  check('step 4: each card number carries its section colour', strips.length > 1 && new Set(strips).size === strips.length, JSON.stringify(strips));
  const cards = await page.$$eval('li.pick-card', (c) => c.map((x) => ({ id: x.dataset.section, keep: [...x.querySelectorAll('[data-keep]')].filter((b) => b.offsetParent).length })));
  check('step 4: one card per section, no "반영할 점" chips', cards.length === s1.sections.length && cards.every((c) => c.keep === 0), JSON.stringify(cards));
  const quote = await page.$eval('#panel-4 pre', (p) => p.textContent).catch(() => '');
  check('step 4: summary lists sections without "새로 구성 참고" and keeps the note', !/새로 구성 참고/.test(quote) && /작업실 사진 크게/.test(quote), quote.slice(0, 400));
  if (SHOTS) await page.locator('#panel-4').screenshot({ path: `${SHOTS}/v5-step4.png` });
  await page.evaluate(() => { const s = window.__getsite4.store; s.setConsent(true); s.setStep(5); });
  await wait(page, 300);
  await page.click('#panel-5 [data-submit]');
  await wait(page, 800);
  const doc = (await page.evaluate(() => window.__calls))[0]?.doc || {};
  check('order: schema v4 doc, every pick "new" and passing the rules regex', doc.schema === 'v4' && Object.values(doc.picks || {}).length > 0 && Object.values(doc.picks).every((v) => v.startsWith('new|') && PICK_RULE.test(v)), JSON.stringify(doc.picks));
  check('order: the note and the gallery layout are sent', /작업실 사진 크게$/.test(doc.picks?.about || '') && doc.galleryLayout === 'museum', `${doc.picks?.about} ${doc.galleryLayout}`);
  check('order: the estimate has no video unless chosen', doc.estimate?.video === false);
  check('no page errors, no Firebase traffic', errors.length === 0 && forbidden.length === 0, [...errors, ...forbidden].join('|').slice(0, 200));
  await context.close();
}

/* Reference links with a note each, reference files uploaded after the order is saved */
{
  const { page, errors, forbidden, context } = await open();
  await page.evaluate(() => {
    const s = window.__getsite4.store; s.reset(); s.pickSample('artist');
    ['email', 'siteName', 'oneLiner'].forEach((k, i) => s.setField(k, ['refs@example.com', '오후 화실', '작품 소개'][i]));
    s.setStep(3);
  });
  await wait(page, 500);
  const help = await page.$eval('#refs-help', (p) => p.textContent);
  check('refs: the help asks for colour, style and mood references (sites, images, Pinterest)', /색감/.test(help) && /스타일/.test(help) && /분위기/.test(help) && /핀터레스트/.test(help) && /참고하고 싶은지/.test(help), help);
  const rows = await page.$$eval('#panel-3 .ref-row', (r) => r.map((x) => { const n = x.querySelector('input[id^="ref-note-"]'); return { url: !!x.querySelector('input[type="url"]'), note: !!n, max: n?.maxLength, label: n?.getAttribute('aria-label') || '' }; }));
  check('refs: three rows, each a link and a labelled note (100 characters)', rows.length === 3 && rows.every((r, i) => r.url && r.note && r.max === 100 && r.label === `레퍼런스 ${i + 1}에서 참고할 부분`), JSON.stringify(rows));
  await page.fill('#ref-1', 'https://pin.it/abcd');
  await page.fill('#ref-note-1', '베이지·초록 색감과 넓은 여백');
  await page.fill('#ref-note-2', '주소 없는 메모');
  const accept = await page.$eval('#ref-files', (i) => ({ accept: i.accept, multiple: i.multiple, shown: getComputedStyle(i).display !== 'none' }));
  check('files: a multiple picker for jpg/png/zip…, focusable (not display:none)', accept.multiple && /\.jpg/.test(accept.accept) && /\.png/.test(accept.accept) && /\.zip/.test(accept.accept) && accept.shown, JSON.stringify(accept));
  const buf = (n) => Buffer.alloc(n, 1);
  await page.setInputFiles('#ref-files', [
    { name: '조명.jpg', mimeType: 'image/jpeg', buffer: buf(2048) },
    { name: 'logo.ZIP', mimeType: 'application/zip', buffer: buf(4096) },
    { name: 'run.exe', mimeType: 'application/octet-stream', buffer: buf(10) },
    { name: 'big.png', mimeType: 'image/png', buffer: buf(20 * 1024 * 1024 + 1) },
  ]);
  await wait(page, 300);
  let names = await page.$$eval('.ref-file-list li .nm', (n) => n.map((x) => x.textContent));
  const err = await page.$eval('#ref-files-err', (e) => (e.hidden ? '' : e.textContent));
  check('files: images and zip are kept, an .exe and a file over 20MB are refused with a message', names.join(',') === '조명.jpg,logo.ZIP' && /run\.exe: 지원하지 않는 형식/.test(err) && /big\.png: 20MB/.test(err), `${names} | ${err}`);
  await page.click('.ref-file-list li:nth-child(2) button.rm');
  await wait(page, 200);
  const afterRm = await page.evaluate(() => ({ names: [...document.querySelectorAll('.ref-file-list li .nm')].map((x) => x.textContent), focus: document.activeElement?.id || document.activeElement?.className, err: document.querySelector('#ref-files-err').textContent === '' }));
  check('files: 빼기 removes the file, keeps focus in the block and clears the message', afterRm.names.join(',') === '조명.jpg' && ['ref-files', 'rm'].includes(afterRm.focus) && afterRm.err, JSON.stringify(afterRm));
  await page.setInputFiles('#ref-files', [{ name: 'logo.ZIP', mimeType: 'application/zip', buffer: buf(4096) }, { name: '조명.jpg', mimeType: 'image/jpeg', buffer: buf(2048) }]);
  await wait(page, 200);
  names = await page.$$eval('.ref-file-list li .nm', (n) => n.map((x) => x.textContent));
  check('files: choosing the same file again does not duplicate it', names.join(',') === '조명.jpg,logo.ZIP', names.join(','));
  const noteShown = await page.$eval('.ref-file-note', (e) => !e.hidden && e.offsetParent !== null);
  await page.fill('#ref-file-note', '첫 사진의 따뜻한 조명');
  check('files: the "이미지에서 참고할 부분" note appears once files are chosen', noteShown);
  if (SHOTS) await page.locator('#panel-3 .ref-files').evaluate((e) => e.closest('.form-grid').scrollIntoView());
  if (SHOTS) await page.locator('#panel-3 .form-grid').last().screenshot({ path: `${SHOTS}/v5-refs-1440.png` });

  await page.evaluate(() => window.__getsite4.store.setStep(4));
  await wait(page, 400);
  const box = await page.$eval('#panel-4', (p) => p.textContent);
  check('step 4: the summary shows the link with its note and the files with theirs', /pin\.it\/abcd — 참고: 베이지·초록 색감과 넓은 여백/.test(box) && /참고 이미지 2개: 조명\.jpg, logo\.ZIP — 참고: 첫 사진의 따뜻한 조명/.test(box) && !/주소 없는 메모 —|참고: 주소 없는 메모/.test(box.replace(/\s+/g, ' ')), box.match(/레퍼런스[\s\S]{0,200}/)?.[0]);

  await page.evaluate(() => { window.__failUpload = ['ref-2.zip']; const s = window.__getsite4.store; s.setConsent(true); s.setStep(5); });
  await wait(page, 300);
  await page.click('#panel-5 [data-submit]');
  await page.waitForSelector('#panel-5 .uploads', { timeout: 10000 }).catch(() => {});
  const out = await page.evaluate(() => ({ doc: window.__calls[0]?.doc, key: window.__calls[0]?.key, uploads: window.__uploads, log: window.__log }));
  const rx = out.doc?.brief?.references || {};
  check('order: notes ride in brief.references aligned with ref1..3; a note without a link is dropped', JSON.stringify(rx.refNotes) === JSON.stringify(['베이지·초록 색감과 넓은 여백', '', '']) && out.doc.ref1 === 'https://pin.it/abcd', JSON.stringify(rx));
  check('order: file names ref-1.jpg,ref-2.zip and the file note are sent; no new top-level keys', rx.files === 'ref-1.jpg,ref-2.zip' && rx.fileNote === '첫 사진의 따뜻한 조명' && !('refNotes' in out.doc) && !('refFiles' in out.doc), JSON.stringify(rx));
  check('upload: only after the order is saved, under its key, with the mapped content type', out.log[0] === 'save' && out.uploads.length === 1 && out.uploads[0].key === out.key && out.uploads[0].name === 'ref-1.jpg' && out.uploads[0].contentType === 'image/jpeg' && out.uploads[0].size === 2048, JSON.stringify(out));
  const receipt = await page.$$eval('#panel-5 .uploads li', (l) => l.map((x) => `${x.textContent}|${x.dataset.ok}`));
  const saved = await page.$eval('#panel-5 .status', (e) => e.textContent).catch(() => '');
  check('receipt: the order stays accepted; each file reads 올림/실패 with a retry for the failed one', /접수되었습니다/.test(saved) && receipt.join(',') === '조명.jpg — 올림|true,logo.ZIP — 실패|false' && !!(await page.$('#panel-5 [data-retry-uploads]')), `${saved} ${receipt}`);
  await page.evaluate(() => { window.__failUpload = []; });
  await page.click('#panel-5 [data-retry-uploads]');
  await wait(page, 500);
  const after = await page.evaluate(() => ({ list: [...document.querySelectorAll('#panel-5 .uploads li')].map((x) => x.dataset.ok), retry: !!document.querySelector('#panel-5 [data-retry-uploads]'), ups: window.__uploads.map((u) => u.name), order: window.__getsite4.store.get().order?.uploads }));
  check('retry: only the failed file is sent again; then every file reads 올림 and the retry is gone', after.ups.join(',') === 'ref-1.jpg,ref-2.zip' && after.list.join(',') === 'true,true' && !after.retry && after.order?.every((u) => u.ok), JSON.stringify(after));
  if (SHOTS) await page.locator('#panel-5').screenshot({ path: `${SHOTS}/v5-refs-receipt.png` });
  const summary = await page.evaluate(() => window.__getsite4.store.get().order?.summary || '');
  check('receipt: the frozen summary lists the links with notes and the files', /pin\.it\/abcd — 참고: 베이지/.test(summary) && /참고 이미지: 2개 \(조명\.jpg, logo\.ZIP\)/.test(summary), summary.slice(0, 300));

  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => !!window.__getsite4);
  const re = await st(page);
  check('reload: notes survive, chosen files do not (their bytes are gone)', re.refNotes[0] === '베이지·초록 색감과 넓은 여백' && re.refFiles.length === 0, JSON.stringify({ n: re.refNotes, f: re.refFiles }));
  const unexpected = errors.filter((e) => !/\[v5\] reference upload failed ref-2\.zip/.test(e)); // the one failure this test injects
  check('refs flow: no other page errors, no Firebase traffic', unexpected.length === 0 && forbidden.length === 0, [...unexpected, ...forbidden].join('|').slice(0, 200));
  await context.close();
}

/* Review fixes: the receipt and the upload under edits, reloads and odd file names */
{
  const { page, errors, context } = await open();
  const setup = async () => { await page.evaluate(() => { const s = window.__getsite4.store; s.reset(); s.pickSample('artist'); ['email', 'siteName', 'oneLiner'].forEach((k, i) => s.setField(k, ['fix@example.com', '오후 화실', '작품 소개'][i])); s.setStep(3); }); await wait(page, 300); };
  await setup();
  const live = await page.$eval('#panel-5 .status', (e) => ({ display: getComputedStyle(e).display, role: e.getAttribute('role') }));
  check('status: the live region is rendered before any message (not display:none)', live.display !== 'none' && live.role === 'status', JSON.stringify(live));
  const longName = `${'가'.repeat(130)}.png`;
  await page.setInputFiles('#ref-files', [{ name: longName, mimeType: 'image/png', buffer: Buffer.alloc(100, 1) }, { name: 'b.jpeg', mimeType: 'image/jpeg', buffer: Buffer.alloc(50, 1) }]);
  await page.fill('#ref-note-1', '   ');
  await page.fill('#ref-1', 'https://example.com/a');
  await page.evaluate(() => window.__getsite4.store.setStep(4)); await wait(page, 300);
  const box4 = await page.$eval('#panel-4', (p) => p.textContent);
  check('step 4: a blank note is not shown as "— 참고:" on the link', /example\.com\/a/.test(box4) && !/example\.com\/a — 참고:/.test(box4));
  await page.evaluate(() => { window.__slow = 600; const s = window.__getsite4.store; s.setConsent(true); s.setStep(5); });
  await wait(page, 200);
  await page.click('#panel-5 [data-submit]');
  await page.waitForSelector('#panel-5 .uploads li[data-pending]', { timeout: 5000 }).catch(() => {});
  const pend = await page.$$eval('#panel-5 .uploads li', (l) => l.map((x) => x.textContent));
  const sentRx = await page.evaluate(() => window.__calls.at(-1)?.doc?.brief?.references);
  check('files: a 130-character name keeps its extension; .jpeg goes as ref-2.jpg', sentRx?.files === 'ref-1.png,ref-2.jpg', JSON.stringify(sentRx));
  check('receipt: files read 올리는 중 while uploading', pend.length === 2 && pend.every((t) => /올리는 중/.test(t)), pend.join(','));
  // An edit during the upload detaches the order; the finished upload must not bring it back.
  await page.evaluate(() => window.__getsite4.store.setRef(1, 'https://example.com/b'));
  await wait(page, 1800);
  const revived = await page.evaluate(() => window.__getsite4.store.get().order);
  check('upload: an edit during the upload leaves the order detached (not revived)', revived === null, JSON.stringify(revived));
  await page.evaluate(() => { window.__slow = 0; });

  // A failed upload, then a reload: no dead retry button, the Drive folder instead.
  await setup();
  await page.setInputFiles('#ref-files', [{ name: 'x.png', mimeType: 'image/png', buffer: Buffer.alloc(10, 1) }]);
  await page.evaluate(() => { window.__failUpload = ['ref-1.png']; const s = window.__getsite4.store; s.setConsent(true); s.setStep(5); });
  await wait(page, 200); await page.click('#panel-5 [data-submit]'); await wait(page, 800);
  const msg = await page.$eval('#panel-5 .status', (e) => e.textContent);
  check('status: the outcome says how many files did not upload', /1개는 올리지 못했습니다/.test(msg), msg);
  await page.focus('#panel-5 [data-retry-uploads]');
  await page.evaluate(() => { window.__failUpload = ['ref-1.png']; });
  await page.click('#panel-5 [data-retry-uploads]'); await wait(page, 500);
  const focusAfter = await page.evaluate(() => document.activeElement?.matches('[data-retry-uploads], .uploads h5') || false);
  check('retry: focus stays in the upload block after a failed retry', focusAfter);
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => !!window.__getsite4); await wait(page, 400);
  const afterReload = await page.evaluate(() => ({ retry: !!document.querySelector('#panel-5 [data-retry-uploads]'), text: document.querySelector('#panel-5 .uploads')?.textContent || '' }));
  check('reload: a failed file has no dead retry button, only the Drive folder guidance', !afterReload.retry && /Drive 폴더에 올려 주세요/.test(afterReload.text) && /실패/.test(afterReload.text), JSON.stringify(afterReload));

  // Refused or repeated files change nothing: a saved order is not detached by them.
  await setup();
  await page.evaluate(() => { const s = window.__getsite4.store; s.setConsent(true); s.setStep(5); });
  await wait(page, 200); await page.click('#panel-5 [data-submit]'); await wait(page, 600);
  await page.evaluate(() => window.__getsite4.store.setStep(3)); await wait(page, 200);
  await page.setInputFiles('#ref-files', [{ name: 'run.exe', mimeType: 'application/octet-stream', buffer: Buffer.alloc(5, 1) }]);
  await wait(page, 200);
  const still = await page.evaluate(() => window.__getsite4.store.get().order?.saved === true);
  check('files: a refused file does not detach the saved order', still);
  const unexpected = errors.filter((e) => !/\[v5\] reference upload failed/.test(e));
  check('review fixes: no other page errors', unexpected.length === 0, unexpected.join('|').slice(0, 200));
  await context.close();
}

/* Mobile 375: the viewer covers the screen, no sideways scroll on step 3 */
{
  const { page, errors, context } = await open({ width: 375, height: 812 });
  await page.evaluate(() => { const s = window.__getsite4.store; s.reset(); s.pickSample('artist'); for (const id of ['about', 'story', 'featured', 'history', 'process', 'services', 'trust', 'faq', 'contact', 'booking', 'newsletter']) if (!s.get().sections.includes(id)) s.toggleSection(id); s.setStep(3); });
  await wait(page, 600);
  if (SHOTS) await page.locator('#panel-3 .flow').screenshot({ path: `${SHOTS}/v5-m375-flow.png` }).catch(() => {});
  const spill = await page.evaluate(() => [...document.querySelectorAll('#panel-3 .tile .sk')].filter((s) => { const r = s.getBoundingClientRect(), t = s.closest('.tile').getBoundingClientRect(); return r.right > t.right + 1 || r.left < t.left - 1; }).map((s) => s.className));
  check('375: no sketch spills out of its tile', spill.length === 0, spill.join(','));
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('375: step 3 has no sideways scroll', over <= 0, `${over}px`);
  const stack = await page.$eval('#panel-3 .ref-row', (r) => { const u = r.querySelector('input[type="url"]').getBoundingClientRect(); const n = r.querySelector('input[id^="ref-note-"]').getBoundingClientRect(); return { below: n.top >= u.bottom - 1, nw: Math.round(n.width), rw: Math.round(r.getBoundingClientRect().width) }; });
  check('375: each reference note sits under its link, full width', stack.below && stack.nw >= stack.rw - 2, JSON.stringify(stack));
  if (SHOTS) { await page.locator('#panel-3 .refs').scrollIntoViewIfNeeded(); await page.locator('#panel-3 .form-grid').last().screenshot({ path: `${SHOTS}/v5-refs-375.png` }); }
  await page.click('.tile[data-section="hero"] [data-motion-open]');
  await page.waitForSelector('dialog.picker[open]');
  const box = await page.$eval('dialog.picker', (d) => { const r = d.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  check('375: the motion viewer fills the screen', box.w === 375 && box.h === 812, JSON.stringify(box));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/v5-m375.png` });
  check('375: no page errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
