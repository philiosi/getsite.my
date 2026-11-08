/* Browser checks against a local server. Firebase and Drive are blocked and fail the run if touched.
   Run: python3 -m http.server 5180 --bind 127.0.0.1  then  PW_DIR=<dir with playwright-core> node tests/v3/e2e.mjs [screenshot dir] */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import * as catalog from '../../v3/catalog.js';

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright-core', { paths: [process.env.PW_DIR || process.cwd()] }));
const BASE = process.env.BASE || 'http://127.0.0.1:5180/v3/';
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const FORBIDDEN = /firestore\.googleapis|firebaseio|firebasejs|script\.google\.com/;

async function open(options = {}, { url = BASE, init } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  const page = await context.newPage();
  const errors = [];
  const forbidden = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route(FORBIDDEN, (route) => { forbidden.push(route.request().url()); route.abort(); });
  if (init) await page.addInitScript(init);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  return { context, page, errors, forbidden };
}
const wait = (page, ms) => page.waitForTimeout(ms);
const FAKE = `window.__calls=[];window.__store={};window.__failFirst=true;window.__GETSITE_API__={
  async saveOrder(key,doc){window.__calls.push({key,doc});if(window.__failFirst){window.__failFirst=false;if(window.__landFirst)window.__store[key]=doc;throw Object.assign(new Error('x'),{code:'unavailable'});}window.__store[key]=doc;},
  async loadOrder(key){return window.__store[key]||window.__order||null;},
  async saveSectionRequests(key,r){window.__saved={key,r};},
  async requestFolder(){return null;},
};`;

/* 1. every combination */
{
  const { page, errors, context } = await open();
  let bad = 0;
  let n = 0;
  for (const c of catalog.CONCEPTS) for (const s of catalog.SCENES) for (const g of catalog.GALLERIES) {
    await page.evaluate(async (p) => { await window.__getsite.pick(p); }, { concept: c.id, scene: s.id, gallery: g.id });
    await wait(page, 60);
    const st = await page.evaluate(() => ({ works: document.querySelectorAll('.g-root [data-work]').length, w: document.documentElement.scrollWidth, sel: window.__getsite.store.get() }));
    n++;
    if (st.works !== 6 || st.w > 1440 || st.sel.gallery !== g.id || st.sel.scene !== s.id) { bad++; console.log('  combo problem', c.id, s.id, g.id, st.works, st.w); }
    if (errors.length) { console.log('  combo error', c.id, s.id, g.id, errors.splice(0).join(' | ').slice(0, 300)); bad++; }
  }
  check(`${n} combinations mount with six works and no errors`, bad === 0 && n === 132, `${bad} bad`);
  await context.close();
}

/* 2. responsive */
for (const width of [320, 375, 414, 768, 1440]) {
  const height = width < 500 ? 700 : 900;
  const { page, errors, context } = await open({ viewport: { width, height }, hasTouch: width < 500 });
  const m = await page.evaluate(() => {
    const cap = document.getElementById('capsule').getBoundingClientRect();
    const items = [...document.querySelectorAll('#capsule button')].map((b) => b.getBoundingClientRect());
    return { sw: document.documentElement.scrollWidth, left: cap.left, right: cap.right, h: cap.height, rowed: items.every((r) => Math.abs(r.top - items[0].top) < 2), wrapped: [...document.querySelectorAll('#capsule button')].some((b) => b.scrollHeight > b.clientHeight + 2) };
  });
  check(`${width}px: no horizontal scroll, capsule on one line inside the viewport`, m.sw <= width && m.left >= 0 && m.right <= width && m.rowed && !m.wrapped && m.h <= 60, JSON.stringify(m));
  for (const view of ['scene', 'gallery', 'close']) {
    await page.evaluate((v) => window.__getsite.setView(v), view);
    await wait(page, 800);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > width) check(`${width}px ${view} width`, false, String(sw));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/w${width}-${view}.jpg`, type: 'jpeg', quality: 60 });
  }
  check(`${width}px: no errors`, errors.length === 0, errors.join(' | ').slice(0, 200));
  await context.close();
}

/* 3. interruption: reversing the stage mid-flight never jumps */
{
  const { page, context } = await open();
  const r = await page.evaluate(async () => {
    const g = window.__getsite;
    const track = document.getElementById('track');
    const y = () => new DOMMatrix(getComputedStyle(track).transform).m42;
    const samples = [];
    g.setView('gallery');
    for (let i = 0; i < 6; i++) { await new Promise(requestAnimationFrame); samples.push(y()); }
    g.setView('scene');
    for (let i = 0; i < 40; i++) { await new Promise(requestAnimationFrame); samples.push(y()); }
    let maxStep = 0;
    for (let i = 1; i < samples.length; i++) maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]));
    return { maxStep, travel: Math.min(...samples), end: samples.at(-1) };
  });
  check('stage reverses mid-flight without a jump', r.maxStep < Math.max(90, Math.abs(r.travel)) && Math.abs(r.end) < 200, JSON.stringify(r));

  const f = await page.evaluate(async () => {
    const g = window.__getsite;
    g.setView('gallery');
    await g.pick({ gallery: 'grid' });
    await new Promise((r) => setTimeout(r, 900));
    const el = document.querySelector('.g-root [data-work]');
    const id = el.dataset.work;
    const left = () => document.querySelector(`[data-work="${id}"]`).getBoundingClientRect().left;
    const a = left();
    const seq = [a];
    g.gallery.setLayout('film');
    seq.push(left());
    const mid = [];
    for (let i = 0; i < 5; i++) { await new Promise(requestAnimationFrame); mid.push(left()); }
    g.gallery.setLayout('masonry');
    mid.push(left());
    return { a, afterSwitch: seq[1], mid };
  });
  check('gallery layout starts where the photo was (FLIP)', Math.abs(f.a - f.afterSwitch) < 2, JSON.stringify({ a: f.a, b: f.afterSwitch }));
  check('gallery interrupted mid-flight continues from its position', Math.abs(f.mid[4] - f.mid[5]) < 40, JSON.stringify(f.mid));
  await context.close();
}

/* 3b. pause twice then resume keeps the gallery alive; a layout mounted while hidden stays finite */
{
  const { page, context, errors } = await open();
  const r = await page.evaluate(async () => {
    const g = window.__getsite;
    g.setView('gallery');
    await g.pick({ gallery: 'coverflow' });
    await new Promise((res) => setTimeout(res, 900));
    g.gallery.onWheel(400, 0);
    await new Promise(requestAnimationFrame);
    g.gallery.pause(); g.gallery.pause(); g.gallery.resume();
    await new Promise((res) => setTimeout(res, 1500));
    const slots = [...document.querySelectorAll('.g-root .g-slot')].map((el) => getComputedStyle(el).transform);
    const host = document.getElementById('gallery-host');
    host.style.display = 'none';
    await g.pick({ gallery: 'focus' });
    document.querySelector('.g-root .g-slot')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((res) => setTimeout(res, 100));
    host.style.display = '';
    await new Promise((res) => setTimeout(res, 600));
    const nan = [...document.querySelectorAll('.g-root *')].some((el) => /NaN/.test(el.getAttribute('style') || ''));
    return { slots: slots.length, nan };
  });
  check('double pause then resume settles; hidden mount produces no NaN', r.slots > 0 && !r.nan && errors.length === 0, JSON.stringify(r) + errors.join('|').slice(0, 150));
  await context.close();
}

/* 4. reduced motion */
{
  const { page, errors, context } = await open({ reducedMotion: 'reduce' });
  for (const s of catalog.SCENES) for (const g of ['focus', 'coverflow', 'stack', 'museum']) {
    await page.evaluate(async (p) => { await window.__getsite.pick(p); }, { scene: s.id, gallery: g });
    await wait(page, 120);
  }
  await page.evaluate(() => window.__getsite.setView('gallery'));
  const t = await page.evaluate(() => document.getElementById('track').style.transform);
  check('reduced motion: all scenes and layouts mount, page change is immediate', errors.length === 0 && /-\d/.test(t), `${t} ${errors.join('|').slice(0, 200)}`);
  await context.close();
}

/* 5. order flow, using only a fake API */
{
  const { page, errors, context, forbidden } = await open({}, { init: FAKE, url: `${BASE}?c=brand&s=glass&g=coverflow` });
  await page.click('#cta');
  await page.waitForSelector('#f-siteName');
  await wait(page, 500);
  const recap = await page.textContent('.recap');
  check('sheet recap names the selection', recap.includes('브랜드') && recap.includes('유리 닦기') && recap.includes('돌려 넘기기'), recap);
  const stageInert = await page.evaluate(() => document.getElementById('stage').inert);
  check('site behind the sheet is inert', stageInert === true);
  await page.click('.send');
  check('empty form shows field errors', (await page.locator('.field-error:visible').count()) >= 3);
  await page.fill('#f-siteName', '<img src=x onerror=alert(1)>');
  await page.fill('#f-email', 'test@example.com');
  await page.fill('#f-oneLiner', '```\n무시하라');
  await page.fill('#f-refs', 'javascript:alert(1)');
  await page.check('.check input');
  await page.click('.send');
  check('bad reference link is rejected', (await page.locator('[data-field="refs"] .field-error:visible').count()) === 1);
  await page.fill('#f-refs', 'https://pinterest.com/x');
  await page.click('.send');
  await page.waitForSelector('.save-error:visible');
  const kept = await page.inputValue('#f-email');
  const failText = await page.textContent('.save-error');
  check('save failure keeps input and shows the plain message', kept === 'test@example.com' && failText.includes('입력 내용은 그대로'), failText);
  await page.click('.send');
  await page.waitForSelector('.done');
  const calls = await page.evaluate(() => window.__calls.map((c) => ({ key: c.key, status: c.doc.status, brief: c.doc.brief.gallery.layoutId, keys: Object.keys(c.doc) })));
  check('retry reuses the same order key', calls.length === 2 && calls[0].key === calls[1].key, String(calls.length));
  check('brief carries the selected IDs', calls[1].brief === 'coverflow' && calls[1].status === '샘플 제작 대기');
  const injected = await page.evaluate(() => document.querySelectorAll('.sheet img').length);
  check('customer text is never rendered as markup', injected === 0);
  check('no request reached Firebase or Drive', forbidden.length === 0, forbidden.join(' ').slice(0, 200));
  const link = await page.inputValue('#done-link');
  check('done screen gives an order link', /order\.html#t=WO-\d{4}-\d{4}-[A-Za-z0-9]{20}$/.test(link));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/order-done.jpg`, type: 'jpeg', quality: 60 });
  await page.keyboard.press('Escape');
  await wait(page, 900);
  const closed = await page.evaluate(() => ({ hidden: document.getElementById('sheet').hidden, inert: document.getElementById('stage').inert, focus: document.activeElement?.id }));
  check('sheet closes, returns focus, restores the site', closed.hidden && !closed.inert && closed.focus === 'cta', JSON.stringify(closed));
  check('order flow has no console errors besides the injected save failure', errors.filter((e) => !e.includes('[order]')).length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 5b. the first write landed but its answer was lost: the retry must not write again */
{
  const { page, context, forbidden } = await open({}, { init: `${FAKE};window.__landFirst=true;` });
  await page.click('#cta');
  await page.waitForSelector('#f-siteName');
  await page.fill('#f-siteName', '가게');
  await page.fill('#f-email', 'test@example.com');
  await page.check('.check input');
  await page.click('.send');
  await page.waitForSelector('.save-error:visible');
  await page.click('.send');
  await page.waitForSelector('.done');
  const n = await page.evaluate(() => window.__calls.length);
  check('lost answer: retry finds the saved order and does not write again', n === 1, String(n));
  check('lost answer path made no production request', forbidden.length === 0);
  await context.close();
}

/* 6. error states */
{
  const { page, context } = await open({}, { url: `${BASE}?c=nope&s=glass&g=x` });
  await wait(page, 300);
  const st = await page.evaluate(() => ({ text: document.getElementById('toast').textContent, sel: window.__getsite.store.get() }));
  check('stale URL opens defaults and says so', st.text.includes('기본값') && st.sel.concept === 'atelier' && st.sel.scene === 'glass', st.text);
  await context.close();
}
{
  const { page, context } = await open();
  await page.route(/assets\/studio\//, (r) => r.abort());
  await page.evaluate(() => window.__getsite.pick({ concept: 'studio' }));
  await wait(page, 300);
  const st = await page.evaluate(() => ({ text: document.getElementById('toast').textContent, c: window.__getsite.store.get().concept, paper: document.getElementById('app').style.getPropertyValue('--c-paper') }));
  check('concept that fails to load keeps the current site', st.c === 'atelier' && st.text.includes('불러오지 못했습니다'), JSON.stringify(st));
  await context.close();
}
{
  const { page, context } = await open();
  await page.route(/scenes\/anchor\.js/, (r) => r.abort());
  await page.evaluate(() => window.__getsite.pick({ scene: 'anchor' }));
  await wait(page, 400);
  const st = await page.evaluate(() => ({ text: document.getElementById('toast').textContent, layers: document.querySelectorAll('.scene-layer').length }));
  check('scene module failure leaves a visible scene and a retry', st.layers >= 1 && st.text.includes('다시 시도'), JSON.stringify(st));
  await context.close();
}

/* 7. order page */
const KEY = 'WO-2026-1234-ABCDEFGHJKLMNPQRSTUV';
{
  const { page, context } = await open({}, { url: `${BASE}order.html#t=bad` , init: FAKE });
  await wait(page, 300);
  check('invalid order link', (await page.textContent('h1')).includes('찾을 수 없습니다'));
  await context.close();
}
{
  const order = { displayNo: 'WO-2026-1234', siteName: '<b>x</b>', status: '샘플 제작 대기', sample: '브랜드', driveFolderUrl: 'javascript:alert(1)', brief: { sections: [{ id: 'hero', label: '첫 장면' }] } };
  const { page, context } = await open({}, { url: `${BASE}order.html#t=${KEY}`, init: `${FAKE};window.__order=${JSON.stringify(order)};` });
  await page.waitForSelector('h1');
  await wait(page, 200);
  const st = await page.evaluate(() => ({ h1: document.querySelector('h1').textContent, bold: document.querySelectorAll('h1 b').length, links: document.querySelectorAll('a').length, forms: document.querySelectorAll('form').length }));
  check('unpaid order: text escaped, unsafe folder link dropped, no section form', st.h1 === '<b>x</b>' && st.bold === 0 && st.links === 0 && st.forms === 0, JSON.stringify(st));
  await context.close();
}
{
  const order = { displayNo: 'WO-2026-1234', siteName: 'x', status: '결제 완료', sample: '브랜드', driveFolderUrl: 'https://drive.google.com/drive/folders/abc', brief: { sections: [{ id: 'hero', label: '첫 장면' }, { id: 'contact', label: '문의' }] } };
  const { page, context, forbidden } = await open({}, { url: `${BASE}order.html#t=${KEY}`, init: `${FAKE};window.__order=${JSON.stringify(order)};` });
  await page.waitForSelector('textarea');
  await page.fill('textarea[name=hero]', '더 크게');
  await page.click('button[type=submit]');
  await page.waitForSelector('.o-ok');
  const saved = await page.evaluate(() => window.__saved);
  check('paid order: section requests saved', saved.key === KEY && saved.r.hero === '더 크게' && saved.r.contact === '', JSON.stringify(saved));
  check('order page made no production request', forbidden.length === 0);
  await context.close();
}

/* viewer: in every layout, a real tap opens the work large; drag pages, drag down and a tap beside close */
for (const [width, height] of [[1440, 900], [375, 760]]) {
  let bad = [];
  for (const g of catalog.GALLERIES.map((x) => x.id)) {
    const { page, errors, context } = await open({ viewport: { width, height } }, { url: `${BASE}?c=atelier&s=glass&g=${g}` });
    await page.evaluate(() => window.__getsite.setView('gallery'));
    await wait(page, 1200);
    const tap = async () => {
      const pt = await page.evaluate(() => {
        const R = document.querySelector('#gallery-host').getBoundingClientRect();
        const cx = R.left + R.width / 2, cy = R.top + R.height / 2;
        let best = null;
        for (const el of document.querySelectorAll('#gallery-host [data-work]')) {
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.bottom < R.top || r.top > R.bottom) continue;
          const x = Math.min(Math.max(cx, r.left + 4), r.right - 4), y = Math.min(Math.max(cy, r.top + 4), r.bottom - 4);
          const hit = document.elementFromPoint(x, y);
          if (!hit || !(el.contains(hit) || hit.contains(el))) continue;
          const d = Math.hypot(x - cx, y - cy);
          if (!best || d < best.d) best = { x, y, d };
        }
        return best;
      });
      if (pt) { await page.mouse.click(pt.x, pt.y); await wait(page, 800); }
      return (await page.$('.g-view')) != null;
    };
    let opened = false;
    for (let i = 0; i < 3 && !opened; i++) opened = await tap(); // side works come to the centre first
    const cap = () => page.evaluate(() => parseInt(document.querySelector('.g-view-no')?.textContent));
    const r = { opened };
    if (opened) {
      const n0 = await cap();
      const dir = n0 >= 6 ? 1 : -1;
      const b = await page.evaluate(() => { const r = document.querySelector('.g-view').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top }; });
      await page.mouse.move(b.x, b.y); await page.mouse.down();
      for (let k = 1; k <= 10; k++) await page.mouse.move(b.x + dir * 30 * k, b.y + 2);
      await page.mouse.up(); await wait(page, 800);
      r.paged = (await cap()) === n0 - dir;
      await page.mouse.move(b.x, b.y - 40); await page.mouse.down();
      for (let k = 1; k <= 10; k++) await page.mouse.move(b.x + 2, b.y - 40 + 35 * k);
      await page.mouse.up(); await wait(page, 1000);
      r.dragClosed = (await page.$('.g-view')) == null;
      r.restored = await page.evaluate(() => ![...document.querySelectorAll('[data-work]')].some((e) => e.style.visibility === 'hidden'));
      r.reopened = (await tap()) || (await tap()) || (await tap());
      if (r.reopened) { await page.mouse.click(b.l + 6, b.t + 6); await wait(page, 1000); r.tapClosed = (await page.$('.g-view')) == null; }
      r.stayed = await page.evaluate((g) => window.__getsite.view === 'gallery' && window.__getsite.gallery.layout === g, g);
    }
    if (!(r.opened && r.paged && r.dragClosed && r.restored && r.tapClosed && r.stayed) || errors.length) bad.push(`${g} ${JSON.stringify(r)} ${errors.join('|').slice(0, 120)}`);
    await context.close();
  }
  if (bad.length) console.log('  ' + bad.join('\n  '));
  check(`viewer at ${width}px: tap opens, drag pages, drag down and tap beside close, in all ${catalog.GALLERIES.length} layouts`, bad.length === 0);
}

/* viewer keyboard, focus and wheel (review round 3) */
{
  const { page, errors, context } = await open({ reducedMotion: 'reduce' }, { url: `${BASE}?c=atelier&s=glass&g=masonry` });
  await page.evaluate(() => window.__getsite.setView('gallery'));
  await wait(page, 600);
  const first = await page.evaluate(() => { const el = document.querySelector('#gallery-host [data-work]').closest('[tabindex="0"]') || document.querySelector('#gallery-host [tabindex="0"][role=button]'); el.focus(); return el.getAttribute('aria-label'); });
  await page.keyboard.press('Enter');
  await wait(page, 300);
  const cap = () => page.evaluate(() => parseInt(document.querySelector('.g-view-no')?.textContent));
  const n0 = await cap();
  await page.keyboard.press(n0 >= 6 ? 'ArrowLeft' : 'ArrowRight');
  await wait(page, 200);
  check('viewer: one arrow press pages exactly one work (reduced motion)', Math.abs((await cap()) - n0) === 1, `${n0} -> ${await cap()}`);
  await page.keyboard.press('ArrowDown');
  await wait(page, 200);
  check('viewer: up/down arrows do not close it', (await page.$('.g-view')) != null);
  const inside = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); inside.push(await page.evaluate(() => !!document.activeElement.closest('.g-view'))); }
  const bg = await page.evaluate(() => [...document.querySelector('.g-root').children].filter((c) => !c.classList.contains('g-view')).every((c) => c.inert));
  check('viewer: Tab stays inside, the layout behind is inert, label says what a work does', inside.every(Boolean) && bg && /크게 보기/.test(first), JSON.stringify({ inside, bg, first }));
  await page.keyboard.press('Escape');
  await wait(page, 300);
  const after = await page.evaluate(() => ({ gone: !document.querySelector('.g-view'), focus: !!document.activeElement.closest('#gallery-host'), inert: [...document.querySelector('.g-root').children].some((c) => c.inert) }));
  check('viewer: Esc closes, focus returns into the gallery, nothing left inert', after.gone && after.focus && !after.inert, JSON.stringify(after));
  // a trackpad flick: one gesture's inertia pages one work
  await page.evaluate(() => window.__getsite.gallery.view(document.querySelectorAll('#gallery-host [data-work]')[1].dataset.work));
  await wait(page, 200);
  const m0 = await cap();
  const box = await page.evaluate(() => { const r = document.querySelector('.g-view').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(box.x, box.y);
  for (let i = 0; i < 25; i++) { await page.mouse.wheel(40, 0); await wait(page, 16); }
  await wait(page, 300);
  check('viewer: one sideways flick pages one work', (await cap()) - m0 === 1, `${m0} -> ${await cap()}`);
  await page.mouse.wheel(0, 30);
  await wait(page, 300);
  check('viewer: a stray vertical tick does not close it', (await page.$('.g-view')) != null);
  await page.evaluate(() => window.__getsite.setView('close'));
  await wait(page, 300);
  check('viewer: leaving the gallery page puts the work back', await page.evaluate(() => !document.querySelector('.g-view') && !document.querySelector('[data-work][style*="hidden"]')));
  check('viewer keyboard run: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* viewer: photo tap, mixed drags, covered home (review round 3) */
{
  const { page, errors, context } = await open({}, { url: `${BASE}?c=atelier&s=glass&g=stack` });
  await page.evaluate(() => window.__getsite.setView('gallery'));
  await wait(page, 900);
  const ids = await page.evaluate(() => [...document.querySelectorAll('#gallery-host [data-work]')].map((e) => e.dataset.work));
  await page.evaluate((id) => window.__getsite.gallery.view(id), ids[0]);
  await wait(page, 900);
  const img = await page.evaluate(() => { const i = [...document.querySelectorAll('.g-view-img')].find((x) => x.getAttribute('aria-hidden') === 'false'); const r = i.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(img.x, img.y);
  await wait(page, 600);
  check('viewer: a tap on the photo itself keeps it open', (await page.$('.g-view')) != null);
  if (!(await page.$('.g-view'))) { await wait(page, 600); await page.evaluate((id) => window.__getsite.gallery.view(id), ids[0]); await wait(page, 900); }
  // page by button, then a short vertical drag before the page spring settles
  await page.click('.g-view-arrow.is-next');
  await wait(page, 40);
  await page.mouse.move(img.x, img.y); await page.mouse.down();
  for (let k = 1; k <= 4; k++) { await page.mouse.move(img.x, img.y + 10 * k); await wait(page, 30); }
  await wait(page, 120);
  await page.mouse.up();
  await wait(page, 1200);
  const stillOpen = (await page.$('.g-view')) != null;
  const settled = !stillOpen ? 999 : await page.evaluate(() => { const i = [...document.querySelectorAll('.g-view-img')].find((x) => x.getAttribute('aria-hidden') === 'false'); const r = i.getBoundingClientRect(); const R = document.querySelector('.g-view').getBoundingClientRect(); return Math.abs((r.left + r.width / 2) - (R.left + R.width / 2)); });
  check('viewer: a vertical drag mid-page still lands the work centred', settled < 2, `${settled.toFixed(1)}px off centre`);
  // in a stack the second card sits under the first: closing on it fades in place instead of flying under
  await page.keyboard.press('Escape');
  const mid = [];
  for (let i = 0; i < 6; i++) { await wait(page, 60); mid.push(await page.evaluate(() => { const i = [...document.querySelectorAll('.g-view-img')].find((x) => x.getAttribute('aria-hidden') === 'false'); return i ? +getComputedStyle(i).opacity : -1; })); }
  check('viewer: closing onto a covered card fades in place', mid.some((o) => o > 0 && o < 0.95), JSON.stringify(mid.map((o) => o.toFixed(2))));
  check('viewer stack run: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}
{
  const { page, context } = await open({}, { url: `${BASE}?c=atelier&s=glass&g=coverflow` });
  await page.evaluate(() => window.__getsite.setView('gallery'));
  await wait(page, 900);
  const id = await page.evaluate(() => document.querySelectorAll('#gallery-host [data-work]')[2].dataset.work);
  await page.evaluate((id) => window.__getsite.gallery.view(id), id);
  await wait(page, 900);
  const vis = await page.evaluate(() => { const slot = document.querySelector('[data-viewing]').closest('.g-coverflow-slot'); return [...slot.querySelectorAll('.g-coverflow-shade,.g-coverflow-pill')].map((e) => getComputedStyle(e).visibility); });
  check('viewer: coverflow slot hides its shade and name while its card is open', vis.length === 2 && vis.every((v) => v === 'hidden'), JSON.stringify(vis));
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
