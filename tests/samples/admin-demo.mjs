/* The admin page sample (samples/admin-demo): menus follow sections, forms validate and save, list CRUD with the
   two-step delete, images, backup export/import, no injected markup, and the layout at 1280/375/320 in light and dark.
   Run: node scripts/v4-build.mjs --main=v5 ; (cd public && python3 -m http.server 5181 --bind 127.0.0.1)
        PW_DIR=<dir with playwright-core> node tests/samples/admin-demo.mjs [shots dir] */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { PRESETS, modulesFor, STORAGE_KEY } from '../../samples/admin-demo/schema.js';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright-core', { paths: [process.env.PW_DIR || process.cwd()] }));
const URL_ = process.env.ADMIN_URL || 'http://127.0.0.1:5181/admin-demo/';
const SHOTS = process.argv[2] || '';
let fails = 0, passes = 0;
const check = (ok, name, info) => { if (ok) passes++; else fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info === undefined ? '' : `  (${JSON.stringify(info)})`}`); };

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function open(viewport = { width: 1280, height: 860 }, scheme = 'light') {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(URL_, { waitUntil: 'load' });
  return { ctx, page, errors };
}
const navIds = (page) => page.$$eval('#nav .nav-item', (b) => b.map((x) => x.dataset.module));
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), STORAGE_KEY);
const toastText = async (page) => { await page.waitForFunction(() => { const t = document.querySelector('#toast'); return !t.hidden && t.textContent; }, null, { timeout: 3000 }).catch(() => {}); return page.$eval('#toast', (t) => (t.hidden ? '' : t.textContent)); };
const go = async (page, id) => { await page.click(`#nav .nav-item[data-module="${id}"]`); await page.waitForFunction((i) => window.__adminDemo?.route() === i, id); };
const expected = (sections) => modulesFor(sections).map((m) => m.id);
const closed = (page) => page.waitForFunction(() => !document.querySelector('#editor').open);

/* ---------- login and the menus that follow sections ---------- */
{
  const { ctx, page, errors } = await open();
  check(await page.isVisible('#login') && !(await page.isVisible('#app')), 'login card first, app hidden');
  check(await page.isDisabled('#googleLogin'), 'the Google button is shown but disabled in the sample');
  await page.click('#demoEnter');
  await page.waitForSelector('#app:not([hidden])');
  check(!(await page.isVisible('#login')), 'demo entry opens the app');
  const artist = PRESETS.find((p) => p.id === 'artist');
  check(JSON.stringify(await navIds(page)) === JSON.stringify(expected(artist.sections)), 'artist menus follow its sections', await navIds(page));
  check((await page.textContent('#siteName')).trim() === artist.data.basic.siteName, 'site name in the top bar');
  check((await page.textContent('#sectionCount')).includes(`${artist.sections.length}/13`), 'section count', await page.textContent('#sectionCount'));
  check((await page.textContent('#nav .nav-item[data-module="works"] .count')).includes('3'), 'works count in the menu');

  await page.click('#sectionPanel summary');
  await page.click('#sectionToggles input[data-section="faq"]');
  check((await navIds(page)).includes('faq'), 'turning FAQ on adds its menu');
  await go(page, 'history');
  await page.click('#sectionToggles input[data-section="history"]');
  await page.waitForFunction(() => window.__adminDemo.route() !== 'history');
  check(!(await navIds(page)).includes('history') && (await page.evaluate(() => window.__adminDemo.route())) === 'basic', 'turning the open menu off moves to 기본 정보');
  await page.click('#sectionToggles input[data-section="history"]');
  check((await page.textContent('#nav .nav-item[data-module="history"] .count')).includes('2'), 'turning it back on keeps its data');
  await page.click('#sectionToggles input[data-section="gallery"]');
  check((await navIds(page)).includes('works'), 'works stays while 대표작 is still on');
  await page.click('#sectionToggles input[data-section="featured"]');
  check(!(await navIds(page)).includes('works'), 'works goes when gallery and featured are both off');
  await page.click('#sectionToggles input[data-section="gallery"]');

  for (const p of [...PRESETS.slice(1), PRESETS[0]]) { // artist last: selecting the current value fires no change
    await page.selectOption('#presetSelect', p.id);
    await page.waitForFunction((n) => document.querySelector('#siteName')?.textContent.trim() === n, p.data.basic.siteName);
    check(JSON.stringify(await navIds(page)) === JSON.stringify(expected(p.sections)), `${p.name}: menus follow its sections`, await navIds(page));
  }
  await page.goto(URL_ + '#/nope');
  await page.waitForSelector('#app:not([hidden])');
  await page.waitForFunction(() => window.__adminDemo?.route());
  check(await page.evaluate(() => window.__adminDemo.route()) === 'basic', 'the session survives a reload; an unknown route opens 기본 정보');
  await page.goto(URL_ + '#/history');
  await page.waitForFunction(() => window.__adminDemo?.route() === 'history');
  check((await page.textContent('#moduleTitle')).includes('연혁'), 'a hash opens that menu');
  await page.goto(URL_ + '#/services'); // artist has no services section
  await page.waitForFunction(() => window.__adminDemo?.route() === 'basic');
  check(true, 'a hash to a menu the site does not have opens 기본 정보');
  check(errors.length === 0, 'no page errors (menus)', errors);
  await ctx.close();
}

/* ---------- forms, lists, delete, images, backup ---------- */
{
  const { ctx, page, errors } = await open();
  await page.click('#demoEnter');
  await page.waitForSelector('#app:not([hidden])');
  await go(page, 'basic');
  await page.fill('#moduleBody [name="tagline"]', '   ');
  await page.fill('#moduleBody [name="email"]', 'not-an-email');
  await page.click('#moduleBody button[type="submit"]');
  const inv = await page.$$eval('#moduleBody [aria-invalid="true"]', (x) => x.map((e) => e.name));
  check(inv.includes('tagline') && inv.includes('email'), 'required and email errors show inline', inv);
  check(await page.evaluate(() => document.activeElement?.name) === 'tagline', 'focus moves to the first invalid field');
  check((await stored(page) || { data: { basic: { tagline: 'x' } } }).data.basic.tagline.trim() !== '', 'nothing saved while invalid');
  await page.fill('#moduleBody [name="tagline"]', '새 소개 한 줄');
  await page.fill('#moduleBody [name="email"]', 'new@yoon.example');
  await page.fill('#moduleBody [name="siteName"]', '윤서현 스튜디오');
  await page.click('#moduleBody button[type="submit"]');
  check((await toastText(page)).includes('저장'), 'save shows a toast');
  const s1 = await stored(page);
  check(s1?.data.basic.tagline === '새 소개 한 줄' && s1?.data.basic.email === 'new@yoon.example', 'saved to localStorage');
  check((await page.textContent('#siteName')).includes('윤서현 스튜디오'), 'the top bar follows the new name');

  // add, edit, injected markup stays text
  await go(page, 'works');
  await page.click('#addItem');
  check(await page.evaluate(() => document.querySelector('#editor').open) && await page.isHidden('#editorDelete'), 'add opens the editor without delete');
  await page.click('#editorSave');
  check((await page.$$('#editorFields [aria-invalid="true"]')).length > 0 && await page.evaluate(() => document.querySelector('#editor').open), 'the editor refuses an empty required name');
  const evil = '<img src=x onerror="window.__pwned=1">';
  await page.fill('#editorFields [name="titleKo"]', evil);
  await page.fill('#editorFields [name="year"]', '2026');
  await page.click('#editorSave');
  await closed(page);
  check(await page.evaluate(() => [...document.querySelectorAll('.row-title')].some((t) => t.textContent.includes('<img'))) && await page.evaluate(() => window.__pwned === undefined) && (await page.$$('#moduleBody .row-main img')).length === 0, 'a name with markup is shown as text');
  check((await page.textContent('#nav .nav-item[data-module="works"] .count')).includes('4'), 'count goes up');
  const added = (await stored(page)).data.works.find((w) => w.titleKo === evil);
  check(!!added && typeof added.id === 'string' && added.year === 2026, 'new item saved with an id and a number year', added);

  await page.click(`li.row[data-id="${added.id}"] [data-edit]`);
  check((await page.textContent('#editorTitle')).includes('수정') && await page.isVisible('#editorDelete'), 'edit opens with delete');
  await page.fill('#editorFields [name="titleKo"]', '새 작품');
  await page.keyboard.press('Escape');
  await closed(page);
  check((await stored(page)).data.works.some((w) => w.id === added.id && w.titleKo === evil), 'Esc discards the edit');
  check(await page.evaluate((id) => document.activeElement?.closest('li.row')?.dataset.id === id, added.id), 'focus returns to the row after closing');
  await page.click(`li.row[data-id="${added.id}"] [data-edit]`);
  await page.fill('#editorFields [name="titleKo"]', '새 작품');
  await page.click('#editorSave');
  await closed(page);
  check(await page.textContent(`li.row[data-id="${added.id}"] .row-title`) === '새 작품', 'edit saves');

  // image: a real small PNG, then a too-big file
  await page.click(`li.row[data-id="${added.id}"] [data-edit]`);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJAQoAAP//AwYCAf9g6cUAAAAASUVORK5CYII=', 'base64');
  await page.setInputFiles('#editorFields .img-field input[type=file]', { name: 'a.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('#editorFields .img-preview img')?.src.startsWith('data:image/jpeg'), null, { timeout: 5000 }).catch(() => {});
  check(await page.evaluate(() => !!document.querySelector('#editorFields .img-preview img')?.src.startsWith('data:image/jpeg')), 'a picked image is scaled and previewed');
  await page.setInputFiles('#editorFields .img-field input[type=file]', { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(1.6 * 1024 * 1024) });
  check(await page.isVisible('#editorFields .img-field .field-error'), 'a file over 1.5MB is refused');
  await page.click('#editorSave');
  await closed(page);
  check(((await stored(page)).data.works.find((w) => w.id === added.id).image || '').startsWith('data:image/jpeg'), 'the image is saved');
  check((await page.$$(`li.row[data-id="${added.id}"] .row-thumb img`)).length === 1, 'the row shows the thumbnail');

  // two-step delete
  await page.click(`li.row[data-id="${added.id}"] [data-delete]`);
  await page.click('#confirmGo');
  check((await stored(page)).data.works.some((w) => w.id === added.id) && await page.isVisible('#confirmStep'), 'the first click only asks again');
  await page.click('#confirm [data-close]');
  await page.click(`li.row[data-id="${added.id}"] [data-delete]`);
  check(!(await page.isVisible('#confirmStep')) && (await page.textContent('#confirmGo')).includes('1/2'), 'reopening starts at step 1');
  await page.click('#confirmGo'); await page.click('#confirmGo');
  await page.waitForFunction((id) => !document.querySelector(`li.row[data-id="${id}"]`), added.id);
  check(!(await stored(page)).data.works.some((w) => w.id === added.id), 'the second click deletes');

  // received items: status only
  await go(page, 'inbox');
  check(!(await page.$('#addItem')) && (await page.$$('#moduleBody [data-delete]')).length === 0, 'the inbox has no add and no delete');
  await page.click('#moduleBody [data-edit]');
  check(await page.$eval('#editorFields [name="body"]', (e) => e.readOnly || e.disabled), 'a received message is read-only');
  await page.selectOption('#editorFields [name="status"]', '답변함');
  await page.click('#editorSave');
  await closed(page);
  check((await stored(page)).data.inbox[0].status === '답변함', 'its status saves');

  // backup
  await go(page, 'backup');
  const tiles = await page.$$eval('.health-item', (t) => t.length);
  check(tiles >= 4, 'the status grid lists the menus', tiles);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportJson')]);
  check(/^getsite-admin-artist-\d{8}\.json$/.test(dl.suggestedFilename()), 'export file name', dl.suggestedFilename());
  const exported = JSON.parse(await readFile(await dl.path(), 'utf8'));
  check(exported.version === 1 && exported.data.inbox[0].status === '답변함', 'export holds the current data');
  const before = JSON.stringify(await stored(page));
  await page.setInputFiles('#importFile', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2}') });
  check((await toastText(page)).includes('올바른') && JSON.stringify(await stored(page)) === before, 'a bad backup is refused and nothing changes');
  await page.click('#resetDemo');
  await page.waitForFunction(() => window.__adminDemo.state.data.inbox[0].status === '새 문의', null, { timeout: 3000 }).catch(() => {});
  check((await stored(page)).data.inbox[0].status === '새 문의', 'reset brings the sample data back');
  if (await page.evaluate(() => window.__adminDemo.route()) !== 'backup') await go(page, 'backup');
  await page.setInputFiles('#importFile', { name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await page.waitForFunction(() => window.__adminDemo.state.data.inbox[0].status === '답변함', null, { timeout: 3000 }).catch(() => {});
  check((await stored(page)).data.inbox[0].status === '답변함', 'a good backup loads');
  check(errors.length === 0, 'no page errors (editing)', errors);
  await ctx.close();
}

/* ---------- review fixes: focus, labels, validation, import, stored state ---------- */
{
  const { ctx, page, errors } = await open();
  await page.click('#demoEnter');
  await page.waitForSelector('#app:not([hidden])');
  await page.click('#sectionPanel summary');
  await page.focus('#sectionToggles input[data-section="faq"]');
  await page.keyboard.press('Space');
  check(await page.evaluate(() => document.activeElement?.dataset?.section) === 'faq', 'focus stays on a section chip after toggling it');
  await page.focus('#nav .nav-item[data-module="works"]');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__adminDemo.route() === 'works');
  check(await page.evaluate(() => document.activeElement?.dataset?.module) === 'works', 'focus stays on the menu item after opening it');
  const firstId = await page.$eval('#moduleBody li.row', (r) => r.dataset.id);
  await page.click(`li.row[data-id="${firstId}"] [data-edit]`);
  check(await page.$eval('#editorFields .img-field input[type=file]', (i) => getComputedStyle(i).display !== 'none' && i.tabIndex >= 0), 'the image picker is reachable by keyboard');
  check(await page.$$eval('#editorFields .field', (fs) => fs.filter((f) => f.querySelector('input[type=checkbox]')).every((f) => f.querySelectorAll('label').length === 1)), 'a checkbox has one label');
  check(await page.$eval('#editorFields [name="titleKo"]', (i) => i.getAttribute('aria-required') === 'true'), 'required fields say so to assistive tech');
  await page.fill('#editorFields [name="year"]', '');
  await page.click('#editorFields [name="year"]');
  await page.keyboard.type('12e'); // typed, so the browser marks it as bad input
  await page.click('#editorSave');
  check(await page.$eval('#editorFields [name="year"]', (i) => i.getAttribute('aria-invalid') === 'true'), 'a malformed number is refused');
  await page.fill('#editorFields [name="year"]', '2024');
  await page.click('#editorSave');
  await closed(page);
  check(await page.evaluate((id) => document.activeElement?.dataset?.edit === id, firstId), 'focus returns to the row after saving');
  await go(page, 'basic');
  await page.fill('#moduleBody [name="instagram"]', 'https://');
  await page.click('#moduleBody button[type="submit"]');
  check(await page.$eval('#moduleBody [name="instagram"]', (i) => i.getAttribute('aria-invalid') === 'true'), 'a bare https:// is refused');
  await page.fill('#moduleBody [name="instagram"]', 'https://instagram.com/yoon.example');
  await page.click('#moduleBody button[type="submit"]');
  check(await page.evaluate(() => document.activeElement?.matches('.module-form button[type=submit]')), 'focus stays on 저장하기 after saving');
  await go(page, 'backup');
  const st = await stored(page);
  const bad = structuredClone(st); bad.data.basic.siteName = { x: 1 };
  await page.setInputFiles('#importFile', { name: 'obj.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  check((await toastText(page)).includes('올바른') && (await stored(page)).data.basic.siteName === st.data.basic.siteName, 'an object where text belongs is refused');
  const dup = structuredClone(st); dup.data.works = [{ ...st.data.works[0], id: 'same' }, { ...st.data.works[1], id: 'same' }];
  await page.setInputFiles('#importFile', { name: 'dup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dup)) });
  await page.waitForFunction(() => window.__adminDemo.state.data.works.length === 2, null, { timeout: 3000 }).catch(() => {});
  const ids = (await stored(page)).data.works.map((w) => w.id);
  check(ids.length === 2 && ids[0] !== ids[1], 'duplicate ids in a backup are made unique', ids);
  const empty = structuredClone(st); empty.data.works = [{ id: 'x', titleKo: '' }];
  await page.setInputFiles('#importFile', { name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(empty)) });
  check((await toastText(page)).includes('올바른') && (await stored(page)).data.works.length === 2, 'a backup item missing its required name is refused');
  await go(page, 'works');
  const delId = await page.$eval('#moduleBody li.row', (r) => r.dataset.id);
  await page.focus(`li.row[data-id="${delId}"] [data-delete]`);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#confirm').open);
  check(await page.evaluate(() => document.activeElement?.dataset?.delete !== undefined), 'cancelling the delete returns focus to its button');
  await page.click(`li.row[data-id="${delId}"] [data-edit]`);
  await page.evaluate(() => document.querySelector('#editorFields .img-field').setAttribute('data-pending', ''));
  await page.click('#editorSave');
  check(await page.evaluate(() => document.querySelector('#editor').open) && (await page.textContent('#editorFields .img-field .field-error')).includes('처리하는 중'), 'saving waits while a picture is still being prepared');
  await page.keyboard.press('Escape');
  check(errors.length === 0, 'no page errors (review fixes)', errors);
  // a broken saved state starts from the sample with a notice, without errors
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ version: 1, preset: 'artist', sections: ['hero'], data: { works: [null] } })), STORAGE_KEY);
  await page.reload();
  await page.waitForSelector('#app:not([hidden])');
  check((await toastText(page)).includes('읽지 못해') && (await page.textContent('#siteName')).trim() === PRESETS[0].data.basic.siteName, 'broken saved data: sample data and a notice', await page.textContent('#siteName'));
  check(errors.length === 0, 'no page errors after broken saved data', errors);
  await ctx.close();
}

/* ---------- layout and contrast ---------- */
function contrastFn() {
  const lum = (c) => {
    const m = c.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
    const v = m ? m.slice(1, 4).map((x) => +x * 255) : (c.match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
    const [r, g, b] = v.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'rgb(255,255,255)'; };
  const ratio = (el) => { const a = lum(getComputedStyle(el).color), b = lum(bgOf(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  return ['#siteName', '#moduleTitle', '.module-hint', '.nav-item', '.nav-item[aria-current="page"]', '#addItem', '.row-title', '.row-sub', '.demo-banner', '.btn-ghost']
    .map((s) => [s, document.querySelector(s)]).filter(([, e]) => e).map(([s, e]) => [s, Math.round(ratio(e) * 100) / 100]);
}
for (const [w, h, scheme] of [[1280, 860, 'light'], [375, 812, 'light'], [320, 700, 'light'], [1280, 860, 'dark'], [375, 812, 'dark']]) {
  const { ctx, page, errors } = await open({ width: w, height: h }, scheme);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-login-${w}-${scheme}.png` });
  await page.click('#demoEnter');
  await page.waitForSelector('#app:not([hidden])');
  await go(page, 'works');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(over <= 0, `${w} ${scheme}: no sideways scroll`, over);
  const lows = (await page.evaluate(contrastFn)).filter(([, r]) => r < 4.5);
  check(lows.length === 0, `${w} ${scheme}: text contrast AA`, lows);
  const small = await page.$$eval('#app button, #app select', (els) => els.filter((e) => e.offsetParent && e.getBoundingClientRect().height < 32).map((e) => e.textContent.trim() || e.id));
  check(small.length === 0, `${w} ${scheme}: controls at least 32px tall`, small);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-works-${w}-${scheme}.png` });
  await page.click('#moduleBody [data-edit]');
  const dlg = await page.$eval('#editor', (d) => { const r = d.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(innerWidth - r.right) }; });
  check(dlg.l >= 0 && dlg.r >= 0, `${w} ${scheme}: the editor fits the screen`, dlg);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-editor-${w}-${scheme}.png` });
  check(errors.length === 0, `${w} ${scheme}: no page errors`, errors);
  await ctx.close();
}

await browser.close();
console.log(`${passes}/${passes + fails} passed`);
process.exit(fails ? 1 : 0);
