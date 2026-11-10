/* Browser checks for v4 against a local server. Firebase is blocked and the run fails if touched.
   Run: python3 -m http.server 5180 --bind 127.0.0.1 (repo root)  then  PW_DIR=<dir with playwright-core> node tests/v4/e2e.mjs [shots dir] */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright-core', { paths: [process.env.PW_DIR || process.cwd()] }));
const BASE = process.env.BASE || 'http://127.0.0.1:5180/v4/';
const SHOTS = process.argv[2] || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const samples = JSON.parse(readFileSync(new URL('../../v4/data/samples.json', import.meta.url), 'utf8'));
const sections = JSON.parse(readFileSync(new URL('../../v4/data/sections.json', import.meta.url), 'utf8')).sections;

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); };
const FORBIDDEN = /firestore\.googleapis|firebaseio|firebasejs|gstatic\.com\/firebasejs|script\.google\.com/;
const FAKE = `window.__calls=[];window.__store={};window.__failFirst=false;window.__GETSITE_API__={
  async saveOrder(key,doc){window.__calls.push({key,doc});if(window.__delay)await new Promise((r)=>setTimeout(r,window.__delay));if(window.__failFirst){window.__failFirst=false;if(window.__landFirst)window.__store[key]={...doc,...(window.__landAs||{})};throw Object.assign(new Error('x'),{code:'timeout'});}window.__store[key]=doc;},
  async loadOrder(key){return window.__store[key]||window.__order||null;},
  async requestFolder(){return null;},
  async loadConfig(){return null;},
};`;

async function open(options = {}, { url = BASE, init = FAKE, reduced, app = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference', ...options });
  const page = await context.newPage();
  const errors = []; const forbidden = []; const net404 = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() === 404) net404.push(r.url()); });
  await page.route(FORBIDDEN, (route) => { forbidden.push(route.request().url()); route.abort(); });
  if (init) await page.addInitScript(init);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  if (app) await page.waitForFunction(() => !!window.__getsite4);
  return { context, page, errors, forbidden, net404 };
}
const wait = (page, ms) => page.waitForTimeout(ms);
const st = (page) => page.evaluate(() => window.__getsite4.store.get());

/* 1. samples: all 14 cards, topic filter, links open the real site in a new tab */
{
  const { page, errors, context, net404 } = await open();
  const n = await page.$$eval('.s-card', (c) => c.length);
  check('samples: one card per sample', n === samples.samples.length, `${n}`);
  const links = await page.$$eval('.s-card a[href^="http"]', (as) => as.map((a) => ({ href: a.href, t: a.target, rel: a.rel })));
  check('samples: every link is https, new tab, noopener', links.length === n * 2 && links.every((l) => /^https:/.test(l.href) && l.t === '_blank' && /noopener/.test(l.rel)), `${links.length}`);
  for (const t of samples.topics) {
    await page.click(`#topicRail [data-topic="${t.id}"]`);
    const vis = await page.$$eval('.s-card:not(.is-hidden)', (c) => c.map((x) => x.dataset.topic));
    if (!(vis.length && vis.every((x) => x === t.id))) check(`samples: topic ${t.id} filters`, false, JSON.stringify(vis));
  }
  await page.click('#topicRail [data-topic="all"]');
  check('samples: topics filter and "all" restores', (await page.$$eval('.s-card:not(.is-hidden)', (c) => c.length)) === n);
  const imgs = await page.$$eval('.s-card img', (im) => im.map((i) => i.getAttribute('src') || ''));
  const missing = net404.filter((u) => /assets\/samples/.test(u));
  check('samples: card images resolve (no 404 under assets/samples)', missing.length === 0, missing.slice(0, 3).join(' '));
  check('samples: hero images are files, not data URIs', imgs.every((s) => !s.startsWith('data:')), `${imgs.filter((s) => s.startsWith('data:')).length} data URIs`);
  await page.click('.s-card .s-actions button');
  await wait(page, 300);
  const s = await st(page);
  check('samples: "이 샘플로 시작" picks the sample and opens step 1', !!s.sampleId && s.step === 1, `${s.sampleId}`);
  check('samples: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 2. steps: panels toggle, state survives a reload, #step hash */
{
  const { page, context } = await open();
  await page.click('#step-3');
  await wait(page, 200);
  const vis = await page.$$eval('.panel', (ps) => ps.map((p) => !p.hidden));
  check('steps: only the chosen panel is visible', JSON.stringify(vis) === JSON.stringify([false, false, true, false, false]), JSON.stringify(vis));
  check('steps: url hash follows', (await page.evaluate(() => location.hash)) === '#step=3');
  await page.evaluate(() => { window.__getsite4.store.pickSample('cafe'); window.__getsite4.store.setField('siteName', '느린오후'); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__getsite4);
  const s = await st(page);
  check('steps: reload keeps sample, form and step', s.sampleId === 'cafe' && s.form.siteName === '느린오후' && s.step === 3, JSON.stringify({ s: s.sampleId, n: s.form.siteName, step: s.step }));
  await page.goto(`${BASE}?reload=1#step=5`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__getsite4);
  check('steps: #step=5 in the url wins', (await st(page)).step === 5);
  await context.close();
}

/* 3. step 3: stack order = preview order, reorder, gallery chips, viewer, vertical wheel passes through */
{
  const { page, errors, context } = await open();
  await page.evaluate(() => { window.__getsite4.store.pickSample('artist'); window.__getsite4.store.setStep(3); });
  await wait(page, 800);
  const order = () => page.evaluate(() => ({ stack: [...document.querySelectorAll('.stack li .nm')].map((x) => x.textContent), tiles: [...document.querySelectorAll('.flow-scroll .tile')].map((t) => t.dataset.section) }));
  let o = await order();
  const labels = (ids) => ids.map((id) => sections.find((x) => x.id === id).label);
  check('step 3: stack shows the chosen sections in order and the flow matches', JSON.stringify(o.stack) === JSON.stringify(labels(o.tiles)) && o.tiles.length === 4, JSON.stringify(o));
  await page.click('.sec-opt input[value="history"]');
  await page.click('.sec-opt input[value="about"]');
  await wait(page, 200);
  o = await order();
  check('step 3: checking adds at the end, unchecking removes, flow follows', JSON.stringify(o.tiles) === JSON.stringify(['hero', 'gallery', 'contact', 'history']) && JSON.stringify(o.stack) === JSON.stringify(labels(o.tiles)), JSON.stringify(o));
  await page.click('.stack li:nth-child(4) button[aria-label$="위로"]');
  await wait(page, 200);
  o = await order();
  check('step 3: move up reorders stack and flow together', o.tiles[2] === 'history' && o.stack[2] === '이력·연혁', JSON.stringify(o));
  const own = await page.$$eval('.flow-scroll .tile:not([data-section=gallery]) .tile-body > img', (im) => im.map((i) => i.getAttribute('src')));
  check('step 3: artist tiles use captures from the artist sample', own.length >= 2 && own.every((s) => /samples\/artist\//.test(s)), own.join(' ').slice(0, 160));
  const chips = await page.$$eval('.g-chips button', (b) => b.map((x) => x.dataset.layout));
  check('step 3: gallery chips = auto + 11 layouts', chips.length === 12 && chips[0] === 'auto');
  let bad = 0;
  for (const id of chips.slice(1)) {
    await page.click(`.g-chips [data-layout="${id}"]`);
    await wait(page, 500);
    const w = await page.$$eval('.g-stage [data-work]', (x) => x.length);
    const lay = await page.evaluate(() => window.__getsite4.store.get().gallery);
    if (w !== 6 || lay !== id || errors.length) { bad++; console.log('  chip problem', id, w, lay, errors.splice(0).join('|').slice(0, 200)); }
  }
  check('step 3: every gallery layout mounts six works without errors', bad === 0, `${bad} bad`);
  await page.click('.g-chips [data-layout="grid"]');
  await wait(page, 600);
  await page.evaluate(() => document.querySelector('.g-stage').scrollIntoView({ block: 'center' }));
  await wait(page, 300);
  const pt = await page.evaluate(() => { const el = document.querySelector('.g-stage [data-work]'); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.click(pt.x, pt.y);
  await wait(page, 800);
  check('step 3: tapping a work opens it large inside the gallery tile', (await page.$('.g-stage .g-view')) != null);
  await page.keyboard.press('Escape');
  await wait(page, 700);
  await page.evaluate(() => { const f = document.querySelector('.flow'); scrollTo(0, f.getBoundingClientRect().top + scrollY - 90); });
  await wait(page, 900); // lazy images inside the flow load once it is on screen
  const box = await page.evaluate(() => { const r = document.querySelector('.g-stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(innerHeight - 20, r.top + r.height / 2) }; });
  const before = await page.evaluate(() => document.querySelector('.flow-scroll').scrollTop);
  await page.mouse.move(box.x, box.y);
  await page.mouse.wheel(0, 300);
  await wait(page, 400);
  const after = await page.evaluate(() => document.querySelector('.flow-scroll').scrollTop);
  check('step 3: a vertical wheel over the gallery scrolls the flow', after > before, `${before} -> ${after}`);
  await page.evaluate(() => window.__getsite4.store.pickSample('soap'));
  await wait(page, 700);
  const src = await page.$eval('.g-stage [data-work] img', (i) => i.getAttribute('src') || '');
  check('step 3: changing the sample changes the gallery works (brand set)', /brand/.test(src), src.slice(-40));
  await page.evaluate(() => { window.__getsite4.store.setStep(1); window.__getsite4.store.setStep(3); window.__getsite4.store.setStep(2); window.__getsite4.store.setStep(3); });
  await wait(page, 500);
  check('step 3: leaving and returning keeps exactly one gallery', (await page.$$eval('.g-stage .g-root', (x) => x.length)) === 1);
  check('step 3: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 3b. step 3 screen picker: choose, sample change, notes pin, section remove/re-add, keyboard, hero list */
{
  const { page, errors, context } = await open();
  await page.evaluate(() => { const s = window.__getsite4.store; s.reset(); s.pickSample('artist'); s.setStep(3); });
  await wait(page, 700);
  let s = await st(page);
  check('picks: every chosen section except gallery has an automatic pick from the chosen sample', JSON.stringify(Object.keys(s.picks).sort()) === JSON.stringify(['about', 'contact', 'hero']) && s.picks.hero.ref === 'artist:hero' && s.picks.about.ref === 'artist:about' && s.picks.about.by === 'auto', JSON.stringify(s.picks));
  const tileSrc = (id) => page.$eval(`.flow-scroll .tile[data-section="${id}"]`, (t) => ({ img: t.querySelector('.tile-body > img')?.getAttribute('src') || '', src: t.querySelector('.src').textContent, ref: t.dataset.ref }));
  check('step 3: tile head names the screen ("참고: 화가 윤서현의 소개 화면")', (await tileSrc('about')).src === '참고: 화가 윤서현의 소개 화면', (await tileSrc('about')).src);
  await page.click('.tile[data-section="about"] [data-alt-toggle]');
  await wait(page, 200);
  const radios = await page.$$eval('.tile[data-section="about"] .alt-track [role="radio"]', (b) => b.map((x) => ({ ref: x.dataset.ref, on: x.getAttribute('aria-checked') })));
  check('step 3: "다른 화면 고르기" opens 7 candidates + 새로 구성, current one checked, own sample first', radios.length === 8 && radios[0].ref === 'artist:about' && radios[0].on === 'true' && radios.at(-1).ref === 'new', JSON.stringify(radios));
  await page.click('.tile[data-section="about"] .alt-track [data-ref="portfolio:about"]');
  await wait(page, 200);
  s = await st(page);
  const t = await tileSrc('about');
  check('step 3: picking another screen swaps the tile image and records a user pick', s.picks.about.ref === 'portfolio:about' && s.picks.about.by === 'user' && /samples\/portfolio\/about/.test(t.img) && /\(예시\)/.test(t.src), JSON.stringify({ p: s.picks.about, t }));
  await page.focus('.tile[data-section="about"] .alt-track [aria-checked="true"]');
  await page.keyboard.press('ArrowRight');
  await wait(page, 150);
  s = await st(page);
  check('step 3: arrow keys move the choice inside the radiogroup', s.picks.about.ref !== 'portfolio:about' && (await page.evaluate(() => document.activeElement?.getAttribute('aria-checked'))) === 'true', s.picks.about.ref);
  await page.click('.tile[data-section="about"] .alt-track [data-ref="portfolio:about"]');
  await page.evaluate(() => window.__getsite4.store.setNote('contact', '지도는 크게'));
  await page.evaluate(() => window.__getsite4.store.pickSample('cafe'));
  await wait(page, 300);
  s = await st(page);
  check('picks: sample change moves plain auto picks, keeps user picks and annotated ones', s.picks.hero.ref === 'cafe:hero' && s.picks.about.ref === 'portfolio:about' && s.picks.contact.ref === 'artist:contact' && s.picks.contact.by === 'user', JSON.stringify(s.picks));
  check('step 3: tiles follow the picks after a sample change', /samples\/cafe\/hero/.test((await tileSrc('hero')).img) && /samples\/portfolio\/about/.test((await tileSrc('about')).img));
  await page.click('.tile[data-section="about"] .alt-track [data-ref="new"]');
  await wait(page, 150);
  check('step 3: "새로 구성" shows the wireframe and clears keep', (await page.$$eval('.tile[data-section="about"] .tile-body .wire', (x) => x.length)) === 1 && (await st(page)).picks.about.ref === 'new');
  await page.evaluate(() => { const st = window.__getsite4.store; st.toggleSection('about'); st.toggleSection('newsletter'); st.toggleSection('about'); });
  await wait(page, 200);
  s = await st(page);
  check('picks: keys always equal the chosen sections minus gallery (remove/re-add, newsletter = new)', JSON.stringify(Object.keys(s.picks).sort()) === JSON.stringify(s.sections.filter((x) => x !== 'gallery').sort()) && s.picks.newsletter.ref === 'new' && s.picks.about.by === 'auto', JSON.stringify(s.picks));
  check('step 3: a section without candidates has no picker', (await page.$$eval('.tile[data-section="newsletter"] [data-alt-toggle]', (x) => x.length)) === 0);
  await page.click('.tile[data-section="hero"] [data-alt-toggle]');
  await wait(page, 200);
  const hero = await page.$$eval('.tile[data-section="hero"] .alt-track > button', (b) => b.map((x) => x.dataset.ref || x.textContent));
  check('step 3: hero shows the closest 6, then 더 보기, then 새로 구성', hero.length === 8 && hero[0] === 'cafe:hero' && /더 보기/.test(hero[6]) && hero[7] === 'new', JSON.stringify(hero));
  await page.click('.tile[data-section="hero"] .alt-more');
  await wait(page, 150);
  check('step 3: 더 보기 shows all 16 hero screens', (await page.$$eval('.tile[data-section="hero"] .alt-track [role="radio"]', (b) => b.length)) === 17);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__getsite4);
  const r = await st(page);
  check('picks: survive a reload', r.picks.contact?.note === '지도는 크게' && r.picks.hero?.ref === 'cafe:hero', JSON.stringify(r.picks).slice(0, 200));
  check('step 3 picker: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 3c. step 4 cards: same screens as step 3, keep chips, notes (focus kept, debounced), 고치기, submit sends the picks */
{
  const { page, errors, context } = await open();
  await page.evaluate(() => { const s = window.__getsite4.store; s.reset(); s.pickSample('artist'); s.toggleSection('newsletter'); ['email', 'siteName', 'oneLiner'].forEach((k, i) => s.setField(k, ['a@example.com', '스튜디오', '전시 문의'][i])); s.setPick('about', 'portfolio:about'); s.setStep(4); });
  await wait(page, 500);
  const cards = await page.$$eval('#panel-4 li.pick-card', (li) => li.map((x) => ({ id: x.dataset.section, src: x.querySelector('.pick-src')?.textContent || '', img: x.querySelector('img.pick-thumb')?.getAttribute('src') || '' })));
  const s0 = await st(page);
  check('step 4: one card per section, in order', JSON.stringify(cards.map((c) => c.id)) === JSON.stringify(s0.sections), JSON.stringify(cards.map((c) => c.id)));
  const about = cards.find((c) => c.id === 'about');
  check('step 4: the card shows the screen chosen in step 3 ("○○의 소개 화면 참고")', /소개 화면 참고$/.test(about.src) && /samples\/portfolio\/about-640/.test(about.img), JSON.stringify(about));
  check('step 4: newsletter reads 새로 구성, gallery card shows the layout', /새로 구성/.test(cards.find((c) => c.id === 'newsletter').src) && /구도: 제작자에게 맡기기/.test(cards.find((c) => c.id === 'gallery').src), JSON.stringify(cards.slice(-2)));
  check('step 4: keep chips hidden for 새로 구성', await page.$eval('#panel-4 li.pick-card[data-section="newsletter"] .pick-keep', (e) => e.hidden));
  await page.click('#panel-4 li.pick-card[data-section="about"] [data-keep="mood"]');
  await page.click('#panel-4 li.pick-card[data-section="about"] [data-keep="layout"]');
  await wait(page, 100);
  check('step 4: chips toggle keep (canonical order) and show pressed', JSON.stringify((await st(page)).picks.about.keep) === '["layout","mood"]' && (await page.$eval('#panel-4 li.pick-card[data-section="about"] [data-keep="mood"]', (b) => b.getAttribute('aria-pressed'))) === 'true');
  await page.click('#panel-4 li.pick-card[data-section="about"] [data-note-toggle]');
  await page.click('#panel-4 li.pick-card[data-section="about"] textarea[data-note]');
  await page.keyboard.type('사진은 크게', { delay: 30 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('글은 두 줄', { delay: 30 });
  const focusKept = await page.evaluate(() => document.activeElement?.matches('li.pick-card[data-section="about"] textarea[data-note]'));
  await wait(page, 600);
  const s1 = await st(page);
  check('step 4: typing a note keeps focus and commits after a pause (line break kept)', focusKept && s1.picks.about.note === '사진은 크게\n글은 두 줄' && (await page.evaluate(() => document.activeElement?.matches('textarea[data-note]'))), JSON.stringify(s1.picks.about));
  await page.click('#panel-4 li.pick-card[data-section="gallery"] [data-note-toggle]');
  await page.fill('#panel-4 li.pick-card[data-section="gallery"] textarea[data-note]', '큰 사진 위주');
  await page.click('#panel-4 h3');
  await wait(page, 100);
  check('step 4: gallery note commits on blur', (await st(page)).galleryNote === '큰 사진 위주');
  check('step 4: the quote lists the per-section picks and notes', /반영할 점: 구성, 분위기/.test(await page.$eval('#panel-4 pre.quote', (e) => e.textContent)) && /의견: 사진은 크게 \/ 글은 두 줄/.test(await page.$eval('#panel-4 pre.quote', (e) => e.textContent)));
  await page.click('#panel-4 li.pick-card[data-section="about"] [data-fix]');
  await wait(page, 700);
  const fix = await page.evaluate(() => ({ step: window.__getsite4.store.get().step, open: document.querySelector('.tile[data-section="about"] .alt-track')?.hidden === false, focus: !!document.activeElement?.closest('.tile[data-section="about"]') }));
  check('step 4: 고치기 opens step 3 with that section\'s picker open and focused', fix.step === 3 && fix.open && fix.focus, JSON.stringify(fix));
  await page.evaluate(() => window.__getsite4.store.setStep(5));
  await wait(page, 200);
  await page.click('#panel-5 .consent input');
  await page.click('#panel-5 [data-submit]');
  await wait(page, 600);
  const doc = (await page.evaluate(() => window.__calls))[0]?.doc || {};
  const s2 = await st(page);
  check('order: picks sent as one wire string per section (sections minus gallery)', JSON.stringify(Object.keys(doc.picks || {}).sort()) === JSON.stringify(s2.sections.filter((x) => x !== 'gallery').sort()) && doc.picks.about === 'portfolio:about|user|layout,mood|사진은 크게\n글은 두 줄' && doc.picks.newsletter === 'new|auto||' && /^artist:hero\|auto\|\|$/.test(doc.picks.hero) && doc.galleryNote === '큰 사진 위주' && /^p-[0-9a-f]{10}$/.test(doc.partsVersion), JSON.stringify({ p: doc.picks, g: doc.galleryNote, v: doc.partsVersion }));
  check('order: the frozen summary carries the notes', /사진은 크게/.test(s2.order?.summary || ''));
  const mail = decodeURIComponent(await page.$eval('#panel-5 a[href^="mailto:"]', (a) => a.href));
  check('step 5: the mailto body is the short one (no notes)', !/사진은 크게/.test(mail) && /소개/.test(mail) && mail.length < 2200, `${mail.length}`);
  await page.evaluate(() => window.__getsite4.store.setStep(4));
  await wait(page, 200);
  const locked = await page.evaluate(() => ({ ro: [...document.querySelectorAll('#panel-4 textarea[data-note]')].every((t) => t.readOnly), chips: [...document.querySelectorAll('#panel-4 [data-keep]')].every((b) => b.disabled), fix: [...document.querySelectorAll('#panel-4 [data-fix]')].every((b) => b.hidden) }));
  check('step 4: after submission notes are read-only, chips disabled, 고치기 hidden', locked.ro && locked.chips && locked.fix, JSON.stringify(locked));
  const calcLocked = await page.evaluate(() => [...document.querySelectorAll('#panel-4 .calc button, #panel-4 .calc input')].every((b) => b.disabled));
  check('step 4: after submission the price calculator is locked too (no edit can detach the order)', calcLocked);
  check('step 4 cards: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 3d. timeout recovery: the summary is rebuilt from the saved document, notes included */
{
  const { page, errors, context } = await open({}, { init: `${FAKE};window.__failFirst=true;window.__landFirst=true;window.__landAs={siteName:'서버 이름'};` });
  await page.evaluate(() => { const s = window.__getsite4.store; s.reset(); s.pickSample('cafe'); ['email', 'siteName', 'oneLiner'].forEach((k, i) => s.setField(k, ['b@example.com', '느린오후', '방문 안내'][i])); s.setNote('about', '창가 자리 사진'); s.setConsent(true); s.setStep(5); });
  await wait(page, 300);
  await page.click('#panel-5 [data-submit]');
  await wait(page, 800);
  const s = await st(page);
  check('recovery: saved after a timeout and the summary has the note from the server copy', s.order?.saved === true && /창가 자리 사진/.test(s.order.summary), (s.order?.summary || '').slice(0, 120));
  check('recovery: the page state becomes the server copy (step 4/5 show what is stored)', s.form.siteName === '서버 이름' && /서버 이름/.test(s.order.summary), s.form.siteName);
  check('recovery: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 3e. an edit made while the save is in flight is rolled back to what was stored */
{
  const { page, errors, context } = await open({}, { init: `${FAKE};window.__delay=800;` });
  await page.evaluate(() => { const s = window.__getsite4.store; s.reset(); s.pickSample('artist'); ['email', 'siteName', 'oneLiner'].forEach((k, i) => s.setField(k, ['c@example.com', '가게', '목적'][i])); s.setConsent(true); s.setStep(5); });
  await wait(page, 200);
  await page.click('#panel-5 [data-submit]');
  await wait(page, 150);
  await page.evaluate(() => window.__getsite4.store.setPick('about', 'portfolio:about'));
  await wait(page, 1200);
  const s = await st(page);
  const doc = (await page.evaluate(() => window.__calls))[0]?.doc || {};
  check('submit race: state after the save equals the stored doc (late edit rolled back)', s.order?.saved === true && s.picks.about.ref === 'artist:about' && doc.picks.about.startsWith('artist:about|'), JSON.stringify({ saved: s.order?.saved, ref: s.picks.about?.ref, doc: doc.picks?.about }));
  check('submit race: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 3f. "보면서 고르기": hero motion scenes (same-origin embed of the motion sample) and gallery layouts, large */
{
  const { page, errors, context } = await open({}, { init: `${FAKE}` });
  await page.evaluate(() => { const s = window.__getsite4.store; s.reset(); s.pickSample('artist'); ['email', 'siteName', 'oneLiner'].forEach((k, i) => s.setField(k, ['m@example.com', '모션 가게', '목적'][i])); s.setStep(3); });
  await wait(page, 600);
  const head = await page.$eval('.tile[data-section="hero"]', (t) => ({ alt: t.querySelector('[data-alt-toggle]')?.textContent, motion: t.querySelector('[data-motion-open]')?.textContent }));
  check('motion: the hero tile offers 16 still screens and 7 motion scenes separately', head.alt === '다른 화면 고르기 (16)' && head.motion === '모션 장면 보며 고르기 (7)', JSON.stringify(head));
  await page.click('.tile[data-section="hero"] [data-motion-open]');
  await page.waitForSelector('dialog.picker[data-picker="motion"][open]');
  const opts = await page.$$eval('dialog.picker [role="radio"]', (b) => b.map((x) => ({ v: x.dataset.value, on: x.getAttribute('aria-checked'), badge: x.querySelector('.picker-badge')?.textContent || '' })));
  check('motion: the dialog lists the 7 scenes, the video one marked 영상 옵션', opts.length === 7 && opts[0].on === 'true' && opts[6].v === 'motion-2:scene-video' && opts[6].badge === '영상 옵션' && opts.slice(0, 6).every((o) => !o.badge), JSON.stringify(opts));
  const focused = await page.evaluate(() => document.activeElement?.dataset?.value);
  check('motion: focus moves into the dialog (the shown scene)', focused === 'motion-2:scene-watercolor', focused);
  await page.waitForFunction(() => document.querySelector('dialog.picker .picker-loading')?.hidden === true, null, { timeout: 60000 });
  const frameScene = () => page.evaluate(() => document.querySelector('dialog.picker iframe').contentDocument?.querySelector('.scene.on')?.dataset.scene);
  const embed = await page.evaluate(() => { const d = document.querySelector('dialog.picker iframe').contentDocument; return d.documentElement.classList.contains('embed') && getComputedStyle(d.querySelector('.tabs')).display === 'none'; });
  check('motion: the sample loads in embed mode (stage only, no tabs or intro)', embed);
  await page.click('dialog.picker [role="radio"][data-value="motion-2:scene-camera"]');
  await wait(page, 600);
  check('motion: looking at a scene switches the live preview (scene 5)', (await frameScene()) === '4', await frameScene());
  check('motion: looking does not change the order', (await st(page)).picks.hero.ref === 'artist:hero');
  await page.keyboard.press('ArrowDown');
  await wait(page, 400);
  check('motion: arrow keys move to the next scene', (await frameScene()) === '5', await frameScene());
  await page.click('dialog.picker [role="radio"][data-value="motion-2:scene-video"]');
  await wait(page, 400);
  const vid = await page.evaluate(() => ({ note: document.querySelector('dialog.picker [data-video-note]')?.textContent || '', choose: document.querySelector('dialog.picker [data-picker-choose]').textContent, href: document.querySelector('dialog.picker .picker-actions a').getAttribute('href') }));
  check('motion: the video scene explains the option and the Remotion remake, the button shows the price', /영상 옵션\(\+200,000원\)/.test(vid.note) && /Remotion으로 다시 제작/.test(vid.note) && /200,000원/.test(vid.choose) && /#scene=7$/.test(vid.href), JSON.stringify(vid));
  const pauseBefore = await page.$eval('dialog.picker [data-picker-pause]', (b) => b.textContent);
  await page.click('dialog.picker [data-picker-pause]');
  const paused = await page.evaluate(() => new Promise((r) => setTimeout(() => r(document.querySelector('dialog.picker iframe').contentDocument.querySelector('#stage').classList.contains('paused')), 300)));
  check('motion: 일시정지 pauses the embedded scene', pauseBefore === '일시정지' && paused);
  await page.click('dialog.picker [data-picker-choose]');
  await wait(page, 400);
  let s = await st(page);
  check('motion: choosing the video scene sets the hero pick and turns the video option on, dialog closes', s.picks.hero.ref === 'motion-2:scene-video' && s.picks.hero.by === 'user' && s.extras.video === true && !(await page.$('dialog.picker')), JSON.stringify({ ref: s.picks.hero.ref, v: s.extras.video }));
  const tile = await page.$eval('.tile[data-section="hero"]', (t) => ({ src: t.querySelector('.src').textContent, play: !!t.querySelector('[data-motion-play]'), img: t.querySelector('.tile-body > img')?.getAttribute('src') }));
  check('motion: the hero tile shows the poster, "움직임 보기", and names the scene', tile.play && /scene-video\.webp$/.test(tile.img) && tile.src === '참고: 영상 시네마틱 (영상 옵션)', JSON.stringify(tile));
  await page.click('.tile[data-section="hero"] [data-motion-play]');
  await page.waitForSelector('dialog.picker[data-picker="motion"][open]');
  const reopened = await page.$eval('dialog.picker [aria-checked="true"]', (b) => ({ v: b.dataset.value, chosen: !!b.querySelector('.picker-chosen') }));
  check('motion: "움직임 보기" reopens at the chosen scene, marked 선택됨', reopened.v === 'motion-2:scene-video' && reopened.chosen, JSON.stringify(reopened));
  await page.keyboard.press('Escape');
  await wait(page, 300);
  const back = await page.evaluate(() => ({ gone: !document.querySelector('dialog.picker'), focus: document.activeElement?.hasAttribute('data-motion-play') }));
  check('motion: Escape closes and focus returns to the button', back.gone && back.focus, JSON.stringify(back));
  // gallery, large
  await page.click('.tile[data-section="gallery"] [data-gallery-open]');
  await page.waitForSelector('dialog.picker[data-picker="gallery"][open]');
  const gopts = await page.$$eval('dialog.picker [role="radio"]', (b) => b.length);
  await page.click('dialog.picker [role="radio"][data-value="film"]');
  await wait(page, 500);
  const live = await page.evaluate(() => !!document.querySelector('dialog.picker .picker-gallery .g-host'));
  check('gallery picker: 12 choices (맡기기 + 11), live engine inside, looking does not change the order', gopts === 12 && live && (await st(page)).gallery === 'auto', `${gopts}`);
  await page.click('dialog.picker [data-picker-choose]');
  await wait(page, 300);
  s = await st(page);
  check('gallery picker: choosing sets the layout and the tile chips follow', s.gallery === 'film' && (await page.$eval('.tile[data-section="gallery"] [data-layout="film"]', (b) => b.getAttribute('aria-pressed'))) === 'true');
  // step 4 and the order
  await page.evaluate(() => window.__getsite4.store.setStep(4));
  await wait(page, 300);
  const card = await page.$eval('#panel-4 li.pick-card[data-section="hero"]', (c) => ({ src: c.querySelector('.pick-src').textContent, note: c.querySelector('[data-video-note]')?.hidden === false ? c.querySelector('[data-video-note]').textContent : '' }));
  check('step 4: the hero card names the video scene and shows the Remotion note', card.src === '영상 시네마틱 (영상 옵션) 참고' && /Remotion/.test(card.note), JSON.stringify(card));
  await page.click('#panel-4 .calc input[type="checkbox"]');
  await wait(page, 200);
  const off = await page.$eval('#panel-4 li.pick-card[data-section="hero"] [data-video-note]', (n) => n.textContent);
  check('step 4: turning the video option off says the scene needs it', /꺼져 있어/.test(off), off);
  await page.click('#panel-4 .calc input[type="checkbox"]');
  await page.evaluate(() => { window.__getsite4.store.setConsent(true); window.__getsite4.store.setStep(5); });
  await wait(page, 200);
  await page.click('#panel-5 [data-submit]');
  await wait(page, 600);
  const doc = (await page.evaluate(() => window.__calls))[0]?.doc || {};
  check('order: the motion pick is sent as a normal wire pick, with the video option', /^motion-2:scene-video\|user\|\|$/.test(doc.picks?.hero || '') && doc.estimate?.video === true && doc.galleryLayout === 'film', JSON.stringify({ h: doc.picks?.hero, v: doc.estimate?.video }));
  check('motion picker: no errors', errors.length === 0, errors.join('|').slice(0, 300));
  await context.close();
}

/* 3h. review fixes: a paused picker keeps the video still; choosing from "움직임 보기" returns focus to the redrawn button */
{
  const { page, errors, context } = await open({}, { init: `${FAKE}`, reduced: false });
  await page.evaluate(() => { const s = window.__getsite4.store; s.reset(); s.pickSample('artist'); s.setPick('hero', 'motion-2:scene-tiles'); s.setStep(3); });
  await wait(page, 600);
  await page.click('.tile[data-section="hero"] [data-motion-play]');
  await page.waitForFunction(() => document.querySelector('dialog.picker .picker-loading')?.hidden === true, null, { timeout: 60000 });
  const vid = () => page.evaluate(() => { const v = document.querySelector('dialog.picker iframe').contentDocument.getElementById('cineVideo'); return { paused: v.paused, t: v.currentTime }; });
  await page.click('dialog.picker [role="radio"][data-value="motion-2:scene-video"]');
  await wait(page, 2000);
  const playing = await vid();
  await page.click('dialog.picker [role="radio"][data-value="motion-2:scene-tiles"]');
  await page.click('dialog.picker [data-picker-pause]');
  await page.click('dialog.picker [role="radio"][data-value="motion-2:scene-video"]');
  await wait(page, 2000);
  const still = await vid();
  // Only meaningful where this browser can play the video at all (it played while not paused).
  check('picker: paused, the video scene stays paused', playing.paused ? true : still.paused === true, JSON.stringify({ playing, still }));
  await page.click('dialog.picker [role="radio"][data-value="motion-2:scene-wall"]');
  await page.click('dialog.picker [data-picker-choose]');
  await wait(page, 400);
  const f = await page.evaluate(() => ({ play: document.activeElement?.hasAttribute('data-motion-play'), text: document.activeElement?.textContent }));
  check('picker: after choosing another scene, focus is on the redrawn "움직임 보기"', f.play && /스프링 진열 벽/.test(f.text), JSON.stringify(f));
  check('picker review fixes: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 3g. the motion picker on a phone: full screen, nothing wider than the screen */
{
  const { page, errors, context } = await open({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  await page.evaluate(() => { const s = window.__getsite4.store; s.reset(); s.pickSample('artist'); s.setStep(3); });
  await wait(page, 600);
  await page.click('.tile[data-section="hero"] [data-motion-open]');
  await page.waitForSelector('dialog.picker[open]');
  await wait(page, 400);
  const box = await page.evaluate(() => { const d = document.querySelector('dialog.picker'); const r = d.getBoundingClientRect(); const wide = [...d.querySelectorAll('.picker-side *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.picker-list')); return { w: r.width, h: r.height, wide: wide.length, choose: d.querySelector('[data-picker-choose]').getBoundingClientRect().height }; });
  check('motion picker 375: full screen, no element past the edge, one-line choose button', Math.round(box.w) === 375 && box.wide === 0 && box.choose < 56, JSON.stringify(box));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/picker-375.png` });
  check('motion picker 375: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 4. the whole order flow with the fake api: validation, price, submit, retry with the same key */
{
  const { page, errors, context, forbidden } = await open({}, { init: `${FAKE};window.__failFirst=true;window.__landFirst=true;` });
  await page.evaluate(() => { window.__getsite4.store.pickSample('portfolio'); window.__getsite4.store.setStep(2); });
  await wait(page, 200);
  for (const id of ['v4-email', 'v4-siteName', 'v4-oneLiner']) { await page.focus(`#${id}`); await page.keyboard.press('Tab'); }
  await wait(page, 200);
  check('step 2: empty fields show errors on blur and next is marked disabled', (await page.$$eval('#panel-2 .field.is-err', (x) => x.length)) >= 3 && (await page.$eval('#panel-2 .panel-foot button.btn-ink', (b) => b.getAttribute('aria-disabled') === 'true')) && (await st(page)).step === 2);
  await page.$eval('#panel-2 .panel-foot button.btn-ink', (b) => b.click());
  await wait(page, 150);
  check('step 2: pressing next with errors keeps the step and focuses the first error', (await st(page)).step === 2 && (await page.evaluate(() => document.activeElement?.id)) === 'v4-email');
  await page.fill('#panel-2 input[type=email]', 'Me@Example.com');
  await page.fill('#v4-siteName', '스튜디오 결');
  await page.fill('#v4-oneLiner', '협업 문의 받기');
  await page.$eval('#panel-2 .panel-foot button.btn-ink', (b) => b.click());
  await wait(page, 300);
  check('step 2: valid form moves to step 3', (await st(page)).step === 3);
  await page.evaluate(() => { window.__getsite4.store.setRef(0, 'javascript:alert(1)'); });
  await wait(page, 100);
  check('step 3: a non-https reference is flagged and blocks next', (await page.$$eval('#panel-3 .field.is-err', (x) => x.length)) === 1 && (await page.$eval('#panel-3 .panel-foot .btn-ink', (b) => b.disabled)));
  await page.evaluate(() => { window.__getsite4.store.setRef(0, 'https://pin.it/abc'); window.__getsite4.store.setStep(4); });
  await wait(page, 300);
  const base = await page.$eval('#panel-4 .calc-total .amt', (e) => e.textContent);
  await page.evaluate(() => { window.__getsite4.store.setExtra('pages', 2); window.__getsite4.store.setExtra('video', true); window.__getsite4.store.setExtra('revisions', 1); });
  await wait(page, 200);
  const tot = await page.$eval('#panel-4 .calc-total .amt', (e) => e.textContent);
  check('step 4: price recomputes (2 pages + video + 1 revision)', base.startsWith('500,000') && tot.startsWith('950,000'), `${base} -> ${tot}`);
  await page.evaluate(() => window.__getsite4.store.setStep(5));
  await wait(page, 200);
  const submit = '#panel-5 button[data-submit], #panel-5 .panel-foot button.btn-ink';
  check('step 5: submit disabled without consent', await page.$eval(submit, (b) => b.disabled));
  await page.click('#panel-5 .consent input');
  await page.click(submit);
  await wait(page, 800);
  check('step 5: first save fails (timeout) but the order was found by key and treated as saved', (await st(page)).order?.saved === true);
  const calls = await page.evaluate(() => window.__calls);
  const doc = calls[0]?.doc || {};
  const want = ['schema','displayNo','catalogVersion','email','siteName','oneLiner','name','topic','sampleId','sections','galleryLayout','picks','galleryNote','partsVersion','ref1','ref2','ref3','materials','estimate','status','briefStatus','opMail','custMail','driveFolderUrl','brief'];
  check('order: one write, schema v4, contract keys only', calls.length === 1 && doc.schema === 'v4' && Object.keys(doc).sort().join() === want.sort().join(), Object.keys(doc).join());
  check('order: fields reflect the selection (email lower-cased)', doc.email === 'me@example.com' && doc.sampleId === 'portfolio' && doc.topic === 'studio' && doc.sections?.[0] === 'hero' && doc.ref1 === 'https://pin.it/abc' && doc.estimate?.total === 950000 && doc.brief?.sections?.length === doc.sections?.length && doc.brief?.customerText?.siteName === '스튜디오 결', JSON.stringify({ s: doc.sampleId, t: doc.topic, r: doc.ref1, e: doc.estimate }));
  const done = await page.$eval('#panel-5', (p) => p.textContent);
  check('step 5: done block shows the display number and the order page link', /WO-\d{4}-\d{4}/.test(done) && (await page.$$eval('#panel-5 a[href*="/v3/order.html#t=WO-"]', (a) => a.length)) >= 1);
  check('order: no text claims the mail was already sent', !/발송했습니다|보냈습니다|발송되었습니다/.test(done));
  check('step 5: consent is hidden and a separate "새 요청 시작" button appears', (await page.$eval('#panel-5 .consent', (e) => e.hidden)) && (await page.$$eval('#panel-5 .panel-foot button', (bs) => bs.some((b) => !b.hidden && b.textContent === '새 요청 시작'))));
  check('step 5: the mailto summary is the one that was sent', /스튜디오 결/.test(await page.$eval('#panel-5 a[href^="mailto:"]', (a) => decodeURIComponent(a.href))));
  await page.evaluate(() => { window.__getsite4.store.setField('siteName', '바뀐 이름'); });
  await wait(page, 150);
  const fresh = await st(page);
  check('step 5: editing after a saved order detaches it (new request, consent reset, submit back)', fresh.order === null && fresh.consent === false && (await page.$$eval('#panel-5 [data-submit]', (b) => b.length === 1 && !b[0].hidden)) && (await page.$('#panel-5 a[href^="mailto:"]')) == null);
  check('order: no production request reached Firebase', forbidden.length === 0, forbidden.join(' '));
  check('order flow: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 5. lookup */
{
  const order = { schema: 'v4', displayNo: 'WO-2026-1234', siteName: '<b>x</b>', status: '샘플 제작 대기', driveFolderUrl: 'javascript:alert(1)', createdAt: new Date().toISOString() };
  const { page, context } = await open({}, { init: `${FAKE};window.__order=${JSON.stringify(order)};` });
  await page.fill('#lookupInput', 'WO-2026-1234');
  await page.click('#lookupBtn');
  await wait(page, 300);
  check('lookup: a short number asks for the full code', /전체|의뢰 코드/.test(await page.$eval('#lookupResult', (e) => e.textContent)));
  await page.fill('#lookupInput', 'https://getsite-my.web.app/v3/order.html#t=WO-2026-1234-ABCDEFGHJKLMNPQRSTUV');
  await page.click('#lookupBtn');
  await wait(page, 400);
  const out = await page.$eval('#lookupResult', (e) => ({ text: e.textContent, bold: e.querySelectorAll('b').length, badLinks: [...e.querySelectorAll('a')].filter((a) => !/^https:/.test(a.href) && !a.href.startsWith(location.origin)).length }));
  check('lookup: a pasted order link is parsed, text escaped, unsafe folder link dropped', /WO-2026-1234/.test(out.text) && /샘플 제작 대기/.test(out.text) && out.bold === 0 && out.badLinks === 0, JSON.stringify(out).slice(0, 200));
  await context.close();
}

/* 5b. order page: v4 recap from the wire picks, customer text never parsed as HTML */
{
  const key = 'WO-2026-1234-ABCDEFGHJKLMNPQRSTUV';
  const order = { schema: 'v4', displayNo: 'WO-2026-1234', siteName: '가게', status: '결제 완료', driveFolderUrl: '', createdAt: new Date().toISOString(), sampleId: 'artist', sections: ['hero', 'gallery', 'about', 'newsletter'], galleryLayout: 'auto', galleryNote: '갤러리 의견', picks: { hero: 'artist:hero|auto|layout,mood|', about: 'portfolio:about|user||<img src=x onerror=window.__xss=1>\n둘째 줄', newsletter: 'new|auto||' }, partsVersion: 'none' };
  const { page, errors, context } = await open({}, { url: `${BASE.replace(/v4\/$/, '')}v3/order.html#t=${key}`, init: `${FAKE};window.__order=${JSON.stringify(order)};`, app: false });
  await wait(page, 1200);
  const recap = await page.evaluate(() => ({ text: document.querySelector('.o-picks')?.textContent || '', imgs: document.querySelectorAll('.o-picks img').length, xss: window.__xss === 1 }));
  check('order page: v4 recap lists each section with its reference screen, keep and note', /화가 윤서현의 첫 장면 화면/.test(recap.text) && /구성, 분위기|구성 · 분위기|구성·분위기/.test(recap.text) && /김지우의 소개 화면/.test(recap.text) && /새로 구성/.test(recap.text) && /갤러리 의견/.test(recap.text), recap.text.slice(0, 300));
  check('order page: a note with HTML is shown as text, never run', !recap.xss && /<img src=x/.test(recap.text), `${recap.imgs} imgs`);
  const ph = await page.$$eval('textarea', (t) => t.map((x) => x.placeholder)).catch(() => []);
  check('order page: after payment the request box hints the note left at intake', ph.some((p) => /접수 때 남긴 의견: <img/.test(p)), JSON.stringify(ph).slice(0, 200));
  check('order page: no errors', errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}

/* 6. responsive + reduced motion + dark */
for (const width of [320, 375, 414, 768, 1440]) {
  const height = width < 500 ? 740 : 900;
  const { page, errors, context } = await open({ viewport: { width, height } });
  await page.evaluate(() => { window.__getsite4.store.pickSample('artist'); window.__getsite4.store.setStep(3); });
  await wait(page, 700);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  const nav = await page.$eval('.topbar-in', (e) => e.getBoundingClientRect().height);
  check(`${width}px: no horizontal scroll, nav on one line`, sw <= width && nav <= 80, `${sw} ${nav}`);
  if (SHOTS) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/v4-${width}.png`, fullPage: true }); }
  check(`${width}px: no errors`, errors.length === 0, errors.join('|').slice(0, 200));
  await context.close();
}
{
  const { page, errors, context } = await open({ colorScheme: 'dark' }, { reduced: true });
  await wait(page, 400);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const ctas = await page.$eval('#heroCtas', (e) => getComputedStyle(e).opacity);
  check('dark + reduced motion: dark paper, hero ctas visible at once', !/255, 255, 255|251, 251/.test(bg) && ctas === '1', `${bg} ${ctas}`);
  await page.evaluate(() => { window.__getsite4.store.pickSample('artist'); window.__getsite4.store.setStep(3); });
  await wait(page, 600);
  check('dark + reduced motion: step 3 mounts', (await page.$$eval('.g-stage [data-work]', (x) => x.length)) === 6 && errors.length === 0, errors.join('|').slice(0, 120));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/v4-dark.png` });
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
