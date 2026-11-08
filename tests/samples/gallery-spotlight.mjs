/* Gallery lab sample (samples/gallery-layouts/index.html):
   - Peek and drag carousels: a click opens a work IN PLACE (spotlight) instead of the detail dialog: neighbours slide away
     left/right, the work enlarges, its caption hangs under it; arrows/keys move within the spotlight; Esc/close returns.
   - Museum wall: framed works on one eye line, wall labels, a scrollable row on phones without page sideways scroll.
   Run: python3 -m http.server 5180 --bind 127.0.0.1 (repo root)  then  PW_DIR=<dir with playwright-core> node tests/samples/gallery-spotlight.mjs [shots dir] */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright-core', { paths: [process.env.PW_DIR || process.cwd()] }));
const URL = process.env.URL || 'http://127.0.0.1:5180/samples/gallery-layouts/index.html';
const SHOTS = process.argv[2];
let fails = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ' — ' + detail}`); if (!ok) fails++; };

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const KINDS = {
  peek: { box: '#peekStage', item: (i) => `.peek-item[data-pk="${i}"]`, items: '.peek-item', next: '#pkNext', cur: 'state.peek' },
  drag: { box: '#dragVp', item: (i) => `.drag-card[data-dg="${i}"]`, items: '.drag-card', next: '#dgNext', cur: 'state.drag' },
};

async function open(width, opts = {}) {
  const mobile = width < 720;
  const page = await browser.newPage({ viewport: { width, height: mobile ? 800 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' }); await page.waitForTimeout(500);
  page.pick = async (id) => {
    const i = await page.evaluate((id) => LAYOUTS.findIndex((l) => l.id === id), id);
    await page.locator('#layoutSeg button').nth(i).click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1300);
    await page.evaluate(() => { const s = document.querySelector('.stage-wrap'); scrollTo(0, s.getBoundingClientRect().top + scrollY - 10); }); await page.waitForTimeout(300);
  };
  page.errors = errors;
  return page;
}

// Everything the spotlight contract says, measured in one go.
const measure = (page, k) => page.evaluate(([k]) => {
  const K = { peek: ['#peekStage', '.peek-item', 'data-pk', '#extraView'], drag: ['#dragVp', '.drag-card', 'data-dg', '#extraView'], museum: ['#stage', '#stage .card', 'data-i', '#stage'] }[k];
  const box = document.querySelector(K[0]);
  const items = [...document.querySelectorAll(K[1])];
  const on = items.filter((el) => el.classList.contains('is-spot-on'));
  const rect = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2 }; };
  const vis = (el) => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && r.width > 2 && r.height > 2; };
  const cap = document.querySelectorAll(K[3] + ' .spot-cap');
  const c = cap[0];
  const sel = on[0];
  const img = sel ? sel.querySelector('img') : null;
  const ir = img ? rect(img) : null;
  let capHit = false;
  if (c && vis(c)) { const t = c.querySelector('.spot-title'); if (t) { const pe = c.style.pointerEvents; c.style.pointerEvents = 'auto'; c.querySelectorAll('*').forEach((x) => (x.dataset.pe = x.style.pointerEvents, x.style.pointerEvents = 'auto')); const r = t.getBoundingClientRect(); const hit = document.elementFromPoint(Math.min(innerWidth - 1, r.left + Math.min(20, r.width / 2)), r.top + r.height / 2); capHit = !!hit && c.contains(hit); c.style.pointerEvents = pe; c.querySelectorAll('*').forEach((x) => (x.style.pointerEvents = x.dataset.pe, delete x.dataset.pe)); } }
  const overlaps = [];
  if (ir) for (const el of items) {
    if (el === sel) continue;
    if (+getComputedStyle(el).opacity < 0.05) continue;
    const r = rect(el); const w = Math.min(r.r, ir.r) - Math.max(r.l, ir.l), h = Math.min(r.b, ir.b) - Math.max(r.t, ir.t);
    if (w > 2 && h > 2) overlaps.push(el.getAttribute(K[2]));
  }
  const br = box.getBoundingClientRect();
  const sr = sel ? sel.getBoundingClientRect() : null;
  const matIn = !!sr && sr.left - 6 >= br.left && sr.right + 6 <= br.right;
  const cl = document.querySelector(K[3] + ' .spot-close');
  const clr = cl && vis(cl) ? cl.getBoundingClientRect() : null;
  const closeOnArt = !!(clr && ir && Math.min(clr.right, ir.r) - Math.max(clr.left, ir.l) > 1 && Math.min(clr.bottom, ir.b) - Math.max(clr.top, ir.t) > 1);
  const old = k === 'museum' ? (sel && sel.querySelector('.card-body')) : document.querySelector('#extraView .cover-cap');
  const oldCapVis = !!old && vis(old);
  const pos = Object.fromEntries(items.map((el) => [el.getAttribute(K[2]), { cx: rect(el).cx, op: +getComputedStyle(el).opacity }]));
  return {
    spot: box.classList.contains('is-spot'), dataSpot: box.getAttribute('data-spot'), onCount: on.length, onIdx: sel ? sel.getAttribute(K[2]) : null,
    img: ir, capCount: cap.length, capVis: vis(c), cap: c && vis(c) ? rect(c) : null, capHit,
    title: c ? (c.querySelector('.spot-title') || {}).textContent : null, no: c ? (c.querySelector('.spot-no') || {}).textContent : null,
    hasMeta: !!(c && c.querySelector('.spot-meta') && c.querySelector('.spot-desc')),
    closeVis: vis(document.querySelector(K[3] + ' .spot-close')), focusClose: !!document.activeElement && document.activeElement.classList.contains('spot-close'),
    focusIdx: document.activeElement ? (document.activeElement.getAttribute(K[2]) ?? document.activeElement.closest('[' + K[2] + ']')?.getAttribute(K[2]) ?? null) : null,
    matIn, closeOnArt, oldCapVis, overlaps, pos, dialog: document.querySelector('#detail').open, wide: document.documentElement.scrollWidth > innerWidth + 1, vw: innerWidth,
    capLive: !!(c && (c.getAttribute('aria-live') || c.closest('[aria-live]'))),
    navOnArt: !!ir && [...document.querySelectorAll(K[3] + ' .spot-prev, ' + K[3] + ' .spot-next')].some((b) => { if (!vis(b)) return false; const r = b.getBoundingClientRect(); return Math.min(r.right, ir.r) - Math.max(r.left, ir.l) > 1 && Math.min(r.bottom, ir.b) - Math.max(r.top, ir.t) > 1; }),
    focusable: k === 'museum' ? true : items.every((el) => el.getAttribute('tabindex') === '0' && el.getAttribute('role') === 'button' && /크게 보기/.test(el.getAttribute('aria-label') || '')),
  };
}, [k]);

async function spotlight(width, kind) {
  const K = KINDS[kind];
  const page = await open(width);
  await page.pick(kind);
  const tag = `${width} ${kind}`;
  const cur = () => page.evaluate(K.cur);
  await page.locator(K.next).click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1000); // one in, so there are works on both sides
  const n = await cur();
  const before = await measure(page, kind);
  check(!before.spot && !before.capVis && !before.closeVis && before.capCount === 1, `${tag}: no spotlight before a click, one caption element`);
  check(before.focusable, `${tag}: every work is a focusable button "… 크게 보기"`);
  const w0 = (await page.locator(`${K.item(n)} img`).boundingBox()).width;
  await page.locator(K.item(n)).click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1300);
  const a = await measure(page, kind);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/spot-${kind}-${width}.png` });
  check(a.spot && a.dataSpot === String(n) && a.onCount === 1 && a.onIdx === String(n), `${tag}: a click opens the work in place`, JSON.stringify({ spot: a.spot, d: a.dataSpot, on: a.onIdx }));
  check(!a.dialog, `${tag}: the detail dialog stays closed`);
  check(a.img && a.img.w >= w0 * 1.12 - 1 && a.img.l >= 0 && a.img.r <= a.vw && a.img.w <= a.vw - 24 + 1, `${tag}: the work enlarges and stays on screen`, a.img ? `${Math.round(w0)} → ${Math.round(a.img.w)} (vw ${a.vw})` : 'no image');
  check(a.capVis && a.cap && a.img && a.cap.t >= a.img.b - 2 && a.cap.t <= a.img.b + 64 && a.cap.l >= a.img.l - 2 && a.cap.l < a.img.r, `${tag}: the caption hangs under the work`, a.cap && a.img ? `cap top ${Math.round(a.cap.t)} img bottom ${Math.round(a.img.b)}, cap left ${Math.round(a.cap.l)} img ${Math.round(a.img.l)}–${Math.round(a.img.r)}` : 'no caption');
  check(a.capHit, `${tag}: the caption is not clipped or covered`);
  const title = await page.evaluate((n) => WORKS[n].title, n);
  check(a.title === title && /No\.?\s*0?\d/.test(a.no || '') && a.hasMeta && a.capLive, `${tag}: caption shows No., title, meta and description, announced politely`, `${a.no} ${a.title}`);
  check(!a.overlaps.length, `${tag}: no neighbour covers the enlarged work`, a.overlaps.join(','));
  const movedOk = Object.entries(a.pos).every(([i, p]) => { i = +i; if (i === n || p.op < 0.05) return true; const b = before.pos[i]; return i < n ? p.cx <= b.cx + 1 : p.cx >= b.cx - 1; });
  const someMoved = Object.entries(a.pos).some(([i, p]) => +i !== n && (Math.abs(p.cx - before.pos[i].cx) > 20 || (before.pos[i].op > 0.05 && p.op < 0.05)));
  check(movedOk && someMoved, `${tag}: works on the left slide left, on the right slide right`);
  check(a.closeVis && a.focusClose, `${tag}: a close button shows and takes focus`);
  check(!a.closeOnArt, `${tag}: the close button does not sit on the work`);
  check(a.matIn, `${tag}: the enlarged work and its mat fit inside the stage`);
  check(!a.oldCapVis, `${tag}: only one caption (the carousel caption hides)`);
  check(!a.wide, `${tag}: no sideways page scroll in spotlight`);
  await page.locator(K.next).click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1100);
  const b = await measure(page, kind);
  const t2 = await page.evaluate((n) => WORKS[n].title, n + 1);
  check(b.spot && b.onIdx === String(n + 1) && b.title === t2 && !b.overlaps.length, `${tag}: next arrow moves on and stays in spotlight`, JSON.stringify({ spot: b.spot, on: b.onIdx, t: b.title }));
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(1100);
  const c = await measure(page, kind);
  check(c.spot && c.onIdx === String(n), `${tag}: ← key moves back and stays in spotlight`, JSON.stringify({ spot: c.spot, on: c.onIdx }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
  const d = await measure(page, kind);
  check(!d.spot && !d.onCount && !d.capVis && !d.closeVis && !d.dialog, `${tag}: Esc slides everything back`);
  check(d.focusIdx === String(n), `${tag}: focus returns to the work`, String(d.focusIdx));
  await page.keyboard.press('Enter'); await page.waitForTimeout(1200);
  check((await measure(page, kind)).spot, `${tag}: Enter on the focused work opens the spotlight`);
  await page.locator('#extraView .spot-close').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1200);
  check(!(await measure(page, kind)).spot, `${tag}: the close button returns to the carousel`);
  if (kind === 'peek') {
    await page.locator('#pkOpen').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1200);
    const e = await measure(page, kind);
    check(e.spot && !e.dialog, `${tag}: "자세히 보기" opens the spotlight, not the dialog`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
  }
  // A neighbour clicked from the carousel opens that work.
  const side = await page.evaluate((sel) => { const it = [...document.querySelectorAll(sel)].find((el) => { const r = el.getBoundingClientRect(); return +getComputedStyle(el).opacity > .3 && r.left > innerWidth * 0.55 && r.left < innerWidth - 30; }); return it ? (it.getAttribute('data-pk') ?? it.getAttribute('data-dg')) : null; }, K.items);
  if (side !== null) {
    const pt = await page.evaluate((sel) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const y = r.top + r.height / 2; for (let x = Math.min(innerWidth - 4, r.right - 4); x > r.left; x -= 6) { const h = document.elementFromPoint(x, y); if (h && el.contains(h)) return { x, y }; } return null; }, K.item(side));
    if (pt) await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(1400);
    const f = await measure(page, kind);
    check(f.spot && f.onIdx === side && !f.dialog, `${tag}: clicking a side work opens that work`, JSON.stringify({ spot: f.spot, on: f.onIdx, side }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(1200);
  }
  if (width < 720) { // a swipe never opens the spotlight
    const cdp = await page.context().newCDPSession(page);
    const bb = await page.locator(K.box).boundingBox();
    const x = bb.x + bb.width / 2, y = bb.y + Math.min(120, bb.height / 2);
    const i0 = await cur();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let s = 1; s <= 10; s++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 16 * s, y }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(1100);
    const g = await measure(page, kind);
    const i1 = await cur();
    check(!g.spot && !g.dialog && i1 === i0 + 1, `${tag}: a swipe moves the carousel and never opens the work`, JSON.stringify({ spot: g.spot, i0, i1 }));
  }
  check(!page.errors.length, `${tag}: no page errors`, page.errors.join('; '));
  await page.close();
}

for (const w of [1280, 375, 320]) for (const k of ['peek', 'drag']) await spotlight(w, k);

// Review round 1 regressions.
const contrast = (page) => page.evaluate(() => { // caption title text against what is painted behind it
  const t = document.querySelector('#extraView .spot-title'); const r = t.getBoundingClientRect();
  const lum = (c) => { let m = c.match(/[\d.]+/g).map(Number); if (c.startsWith('color(')) m = m.map((v) => v * 255); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  let bg = 'rgb(255, 255, 255)';
  for (const el of document.elementsFromPoint(r.left + 6, r.top + r.height / 2)) { if (el === t || t.contains(el)) continue; const c = getComputedStyle(el).backgroundColor; const a = c.match(/[\d.]+/g); if (a && (a.length < 4 || +a[3] > 0.5)) { bg = c; break; } }
  const L1 = lum(getComputedStyle(t).color), L2 = lum(bg); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
});
for (const kind of ['peek', 'drag']) for (const scheme of ['light', 'dark']) {
  const page = await open(1280); await page.emulateMedia({ colorScheme: scheme });
  await page.pick(kind);
  await page.locator(KINDS[kind].item(0)).click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1300);
  const cr = await contrast(page);
  check(cr >= 4.5, `${kind} ${scheme}: caption title is readable (contrast ≥ 4.5)`, cr.toFixed(2));
  // Tab from the close button never lands on a hidden work
  await page.locator('#extraView .spot-close').focus(); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  const hidden = await page.evaluate((sel) => { const a = document.activeElement; if (!a || !a.matches(sel)) return false; return +getComputedStyle(a).opacity < 0.05 || a.getBoundingClientRect().right < 0 || a.getBoundingClientRect().left > innerWidth || !a.classList.contains('is-spot-on'); }, KINDS[kind].items);
  check(!hidden, `${kind} ${scheme}: Tab in spotlight never focuses a hidden work`);
  const invisibleClickable = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((el) => !el.classList.contains('is-spot-on') && getComputedStyle(el).pointerEvents !== 'none' && !el.inert && !el.closest('[inert]') && getComputedStyle(el).visibility !== 'hidden').length, KINDS[kind].items);
  check(!invisibleClickable, `${kind} ${scheme}: hidden works cannot be clicked in spotlight`, String(invisibleClickable));
  // A sideways drag inside the spotlight does not pull the work away from its caption
  if (kind === 'drag' && scheme === 'light') {
    const bb = await page.locator('#dragVp').boundingBox();
    await page.mouse.move(bb.x + bb.width * 0.7, bb.y + 120); await page.mouse.down();
    for (let s2 = 1; s2 <= 6; s2++) { await page.mouse.move(bb.x + bb.width * 0.7 - 15 * s2, bb.y + 120); await page.waitForTimeout(16); }
    const mid = await measure(page, 'drag');
    await page.mouse.up(); await page.waitForTimeout(1200);
    const end = await measure(page, 'drag');
    check(mid.img && mid.cap && Math.abs((mid.cap.l) - (mid.img.l)) < 40 && end.spot && end.cap.t >= end.img.b - 2, 'drag: dragging inside the spotlight keeps the work with its caption', mid.img && mid.cap ? `cap ${Math.round(mid.cap.l)} img ${Math.round(mid.img.l)}` : '');
  }
  // Rotate / resize while open
  if (scheme === 'light') {
    await page.setViewportSize({ width: 375, height: 800 }); await page.waitForTimeout(1400);
    const r = await measure(page, kind);
    check(r.spot && r.matIn && r.cap && r.img && r.cap.t >= r.img.b - 2 && r.cap.t <= r.img.b + 64 && !r.overlaps.length && !r.closeOnArt && r.img.w <= 375 - 24 + 1, `${kind}: resizing to a phone while open re-fits work, mat and caption`, JSON.stringify({ mat: r.matIn, cap: r.cap && Math.round(r.cap.t), img: r.img && Math.round(r.img.b), w: r.img && Math.round(r.img.w) }));
  }
  check(!page.errors.length, `${kind} ${scheme}: no page errors`, page.errors.join('; '));
  await page.close();
}
for (const width of [375, 1280]) { // Opening never hides the close button under the sticky layout panel
  for (const kind of ['peek', 'drag']) {
    const page = await open(width, {}); await page.setViewportSize({ width, height: width < 720 ? 560 : 600 });
    await page.pick(kind);
    await page.evaluate((sel) => { const s = document.querySelector(sel); scrollTo(0, s.getBoundingClientRect().top + scrollY - (innerWidth < 720 ? 300 : 180)); }, KINDS[kind].box); await page.waitForTimeout(300);
    await page.locator(KINDS[kind].item(0)).click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1300);
    const ok = await page.evaluate(() => { const b = document.querySelector('#extraView .spot-close'); const r = b.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.top >= 0 && r.bottom <= innerHeight && !!h && b.contains(h) && document.activeElement === b; });
    check(ok, `${width} ${kind}: the focused close button is on screen, not under the layout panel`);
    await page.close();
  }
}
{ // Keys pressed while the layout is still switching
  const page = await open(1280);
  for (const id of ['peek', 'drag', 'autoplay', 'peek']) {
    const i = await page.evaluate((id) => LAYOUTS.findIndex((l) => l.id === id), id);
    await page.locator('#layoutSeg button').nth(i).click(); await page.keyboard.press('Escape'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
  check(!page.errors.length, 'keys during a layout switch throw nothing', page.errors.join('; '));
  // Museum leaves nothing behind: in grid a click with a little hand shake still opens the work
  await page.pick('museum'); await page.pick('museum'); await page.pick('grid');
  const bb = await page.locator('.stage .card-media').first().boundingBox();
  await page.mouse.move(bb.x + 40, bb.y + 40); await page.mouse.down(); await page.mouse.move(bb.x + 52, bb.y + 41, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(700);
  check(await page.evaluate(() => document.querySelector('#detail').open), 'after museum, a slightly moving click in grid still opens the work');
  await page.keyboard.press('Escape');
  // Hero copy matches 14 layouts
  const hero = await page.evaluate(() => document.querySelector('.hero').textContent);
  check(!/열다섯|15\s*종|필름/.test(hero) && /14\s*종|열네/.test(hero), 'hero copy says 14 layouts and no film', hero.match(/열다섯|15\s*종|필름/)?.[0] || '');
  await page.close();
}
{ // Museum in text mode keeps its varied frames
  const page = await open(1280);
  await page.pick('museum');
  await page.locator('#contentSeg button, [data-seg="content"] button').filter({ hasText: '텍스트' }).first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(900);
  const ratios = await page.evaluate(() => [...new Set([...document.querySelectorAll('.stage.layout-museum .card-media')].map((f) => { const r = f.getBoundingClientRect(); return (r.width / r.height).toFixed(1); }))]);
  check(ratios.length >= 3 && !ratios.every((x) => +x > 2), 'museum text mode keeps the varied frame shapes', ratios.join(','));
  await page.close();
}
{ // Reduced motion: the drag track does not slide
  const page = await open(1280, { reduced: true });
  await page.pick('drag'); await page.locator('#dgNext').click(); await page.waitForTimeout(50);
  const tr = await page.evaluate(() => { const t = document.getElementById('dragTrack'); return parseFloat(getComputedStyle(t).transitionDuration) || 0; });
  check(tr <= 0.01, 'reduced motion: the drag track moves without animation', String(tr));
  await page.close();
}

async function museumSpot(width, scheme = 'light') {
  const page = await open(width); await page.emulateMedia({ colorScheme: scheme });
  await page.pick('museum');
  const tag = `${width} museum${scheme === 'dark' ? ' dark' : ''}`;
  const n = 1; // a work with neighbours on both sides
  await page.evaluate(() => { const s = document.getElementById('stage'); const c = s.querySelector('.card[data-i="1"]'); s.scrollLeft = Math.max(0, c.offsetLeft - s.clientWidth / 2 + c.offsetWidth / 2); }); await page.waitForTimeout(400);
  const before = await measure(page, 'museum');
  check(!before.spot && !before.capVis && !before.closeVis && before.capCount === 1, `${tag}: no spotlight before a click, one caption element`);
  const w0 = (await page.locator('#stage .card[data-i="1"] img').boundingBox()).width;
  await page.locator('#stage .card[data-i="1"] .card-media').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1400);
  const a = await measure(page, 'museum');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/spot-museum-${width}-${scheme}.png` });
  check(a.spot && a.dataSpot === String(n) && a.onCount === 1 && a.onIdx === String(n), `${tag}: a click opens the work in place`, JSON.stringify({ spot: a.spot, d: a.dataSpot, on: a.onIdx }));
  check(!a.dialog, `${tag}: the detail dialog stays closed`);
  check(a.img && a.img.w >= w0 * 1.12 - 1 && a.img.l >= 0 && a.img.r <= a.vw && a.img.w <= a.vw - 24 + 1, `${tag}: the work enlarges and stays on screen`, a.img ? `${Math.round(w0)} → ${Math.round(a.img.w)} (vw ${a.vw})` : 'no image');
  check(a.capVis && a.cap && a.img && a.cap.t >= a.img.b - 2 && a.cap.t <= a.img.b + 64 && a.cap.l >= a.img.l - 2 && a.cap.l < a.img.r, `${tag}: the caption hangs under the work`, a.cap && a.img ? `cap top ${Math.round(a.cap.t)} img bottom ${Math.round(a.img.b)}, cap left ${Math.round(a.cap.l)} img ${Math.round(a.img.l)}–${Math.round(a.img.r)}` : 'no caption');
  check(a.capHit, `${tag}: the caption is not clipped or covered`);
  const title = await page.evaluate((n) => WORKS[n].title, n);
  check(a.title === title && /No\.?\s*0?\d/.test(a.no || '') && a.hasMeta && a.capLive, `${tag}: caption shows No., title, meta and description`, `${a.no} ${a.title}`);
  check(!a.overlaps.length && !a.closeOnArt && !a.navOnArt, `${tag}: nothing covers the enlarged work`, JSON.stringify({ o: a.overlaps, c: a.closeOnArt, n: a.navOnArt }));
  check(a.matIn, `${tag}: the enlarged frame fits inside the wall`);
  check(!a.oldCapVis, `${tag}: the beside-label hides, only the caption shows`);
  const movedOk = Object.entries(a.pos).every(([i, p]) => { i = +i; if (i === n || p.op < 0.05) return true; const b = before.pos[i]; return i < n ? p.cx <= b.cx + 1 : p.cx >= b.cx - 1; });
  const someMoved = Object.entries(a.pos).some(([i, p]) => +i !== n && (Math.abs(p.cx - before.pos[i].cx) > 20 || (before.pos[i].op > 0.05 && p.op < 0.05)));
  check(movedOk && someMoved, `${tag}: works on the left slide left, on the right slide right`);
  const inertOk = await page.evaluate(() => [...document.querySelectorAll('#stage .card')].filter((el) => !el.classList.contains('is-spot-on')).every((el) => el.inert || el.closest('[inert]') || getComputedStyle(el).visibility === 'hidden'));
  check(inertOk, `${tag}: hidden works are inert`);
  check(a.closeVis && a.focusClose && !a.wide, `${tag}: close button focused, no sideways page scroll`);
  const cr = await page.evaluate(() => { const t = document.querySelector('#stage .spot-title'); const r = t.getBoundingClientRect();
    const lum = (c) => { let m = c.match(/[\d.]+/g).map(Number); if (c.startsWith('color(')) m = m.map((v) => v * 255); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    let bg = null; for (const el of document.elementsFromPoint(r.left + 6, r.top + r.height / 2)) { if (t.contains(el) || el === t) continue; const cs = getComputedStyle(el); const c = cs.backgroundColor; const al = c.match(/[\d.]+/g); if (al && (al.length < 4 || +al[3] > 0.5)) { bg = c; break; } }
    if (!bg) bg = getComputedStyle(document.body).backgroundColor; const L1 = lum(getComputedStyle(t).color), L2 = lum(bg); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); });
  check(cr >= 4.5, `${tag}: caption title readable on the wall`, cr.toFixed(2));
  if (scheme === 'dark') { await page.close(); return; }
  await page.locator('#stage .spot-next').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1200);
  const b = await measure(page, 'museum');
  check(b.spot && b.onIdx === String(n + 1) && b.title === await page.evaluate((n) => WORKS[n].title, n + 1) && !b.overlaps.length, `${tag}: the next button moves on and stays in spotlight`, JSON.stringify({ spot: b.spot, on: b.onIdx }));
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(1200);
  check((await measure(page, 'museum')).onIdx === String(n), `${tag}: ← key moves back`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(1300);
  const d = await measure(page, 'museum');
  check(!d.spot && !d.onCount && !d.capVis && !d.closeVis && !d.dialog, `${tag}: Esc slides everything back`);
  check(d.focusIdx === String(n), `${tag}: focus returns to the work`, String(d.focusIdx));
  await page.keyboard.press('Enter'); await page.waitForTimeout(1300);
  check((await measure(page, 'museum')).spot, `${tag}: Enter on the focused work opens the spotlight`);
  await page.locator('#stage .spot-close').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1300);
  check(!(await measure(page, 'museum')).spot, `${tag}: the close button returns to the wall`);
  if (width >= 720) { // a mouse pan of the wall never opens a work; panning still works
    const bb = await page.locator('#stage').boundingBox();
    const x0 = await page.evaluate(() => document.getElementById('stage').scrollLeft);
    await page.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height / 2); await page.mouse.down();
    for (let s2 = 1; s2 <= 10; s2++) { await page.mouse.move(bb.x + bb.width * 0.6 - 22 * s2, bb.y + bb.height / 2); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(800);
    const e = await measure(page, 'museum');
    check(!e.spot && !e.dialog && (await page.evaluate(() => document.getElementById('stage').scrollLeft)) > x0 + 100, `${tag}: dragging the wall pans it and opens nothing`);
  } else { // a swipe along the wall scrolls it and opens nothing
    const cdp = await page.context().newCDPSession(page);
    const bb = await page.locator('#stage').boundingBox(); const x = bb.x + bb.width * 0.7, y = bb.y + bb.height / 2;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let s2 = 1; s2 <= 10; s2++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 18 * s2, y }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(900);
    const e = await measure(page, 'museum');
    check(!e.spot && !e.dialog, `${tag}: a swipe along the wall opens nothing`);
  }
  // Resize while open
  await page.locator('#stage .card[data-i="2"] .card-media').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1300);
  await page.setViewportSize({ width: width >= 720 ? 375 : 1280, height: 800 }); await page.waitForTimeout(1400);
  const r = await measure(page, 'museum');
  check(r.spot && r.matIn && r.cap && r.img && r.cap.t >= r.img.b - 2 && r.cap.t <= r.img.b + 64 && !r.overlaps.length && !r.closeOnArt && !r.wide, `${tag}: resizing while open re-fits the work and caption`, JSON.stringify({ mat: r.matIn, cap: r.cap && Math.round(r.cap.t), img: r.img && Math.round(r.img.b) }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  // Leaving the layout while open leaves nothing behind
  await page.locator('#stage .card[data-i="0"] .card-media').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1000);
  await page.pick('grid');
  await page.locator('.stage .card-media').first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(700);
  check(await page.evaluate(() => document.querySelector('#detail').open && !document.querySelector('#stage.is-spot')), `${tag}: after a museum spotlight, grid still opens its detail`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.pick('museum'); await page.pick('focus');
  await page.locator('#focusView [data-open]').first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(700);
  check(await page.evaluate(() => document.querySelector('#detail').open), `${tag}: after museum, the focus layout still opens its detail`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  if (width >= 720) { // a click on the empty wall closes and returns focus to the work
    await page.pick('museum');
    await page.locator('#stage .card[data-i="1"] .card-media').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1300);
    const bb = await page.locator('#stage').boundingBox();
    await page.mouse.click(bb.x + 30, Math.min(bb.y + bb.height - 40, (await page.evaluate(() => innerHeight)) - 20)); await page.waitForTimeout(900);
    check(await page.evaluate(() => !document.querySelector('#stage.is-spot') && document.activeElement && document.activeElement.closest('.card[data-i="1"]') !== null), `${tag}: a click on the empty wall closes and focus returns to the work`);
  }
  check(!page.errors.length, `${tag}: no page errors`, page.errors.join('; '));
  await page.close();
}
for (const w of [1280, 375, 320]) await museumSpot(w);
await museumSpot(1280, 'dark'); await museumSpot(375, 'dark');
{ // Reduced motion: museum spotlight appears at once
  const page = await open(1280, { reduced: true });
  await page.pick('museum');
  await page.locator('#stage .card[data-i="0"] .card-media').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(150);
  const a = await measure(page, 'museum');
  check(a.spot && a.capVis && a.cap && a.img && a.cap.t >= a.img.b - 2, 'reduced motion: the museum spotlight appears at once');
  await page.close();
}

{ // Reduced motion: still works, no waiting for animations.
  const page = await open(375, { reduced: true });
  await page.pick('peek');
  await page.locator('.peek-item[data-pk="0"]').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(120);
  const a = await measure(page, 'peek');
  check(a.spot && a.capVis && a.cap && a.img && a.cap.t >= a.img.b - 2, 'reduced motion: the spotlight appears at once');
  await page.close();
}

{ // Leaving the layout in spotlight leaves nothing behind.
  const page = await open(1280);
  await page.pick('drag');
  await page.locator('.drag-card[data-dg="0"]').click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1200);
  await page.pick('grid');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.locator('.stage .card-media').first().click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(700);
  check(await page.evaluate(() => document.querySelector('#detail').open), 'other layouts still open the detail dialog after a spotlight');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  check(!(await page.evaluate(() => document.querySelector('#detail').open)), 'Esc still closes the detail dialog');
  check(!page.errors.length, 'layout switch: no page errors', page.errors.join('; '));
  await page.close();
}

for (const width of [1280, 375, 320]) { // Museum wall.
  const page = await open(width);
  await page.pick('museum');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/museum-${width}.png` });
  const m = await page.evaluate(() => {
    const st = document.querySelector('.stage.layout-museum');
    const frames = [...st.querySelectorAll('.card-media')];
    const cs = (el) => getComputedStyle(el);
    const fr = frames.map((f) => f.getBoundingClientRect());
    const imgs = frames.map((f) => f.querySelector('img').getBoundingClientRect());
    const labels = [...st.querySelectorAll('.card-body')].map((b) => b.getBoundingClientRect());
    const inView = fr.filter((r) => r.right > 0 && r.left < innerWidth);
    const centres = inView.map((r) => r.top + r.height / 2);
    let labelOnArt = 0;
    labels.forEach((l) => imgs.forEach((r) => { const w = Math.min(l.right, r.right) - Math.max(l.left, r.left), h = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top); if (w > 2 && h > 2) labelOnArt++; }));
    const no = st.querySelector('.card-no');
    return {
      n: frames.length, border: Math.min(...frames.map((f) => parseFloat(cs(f).borderTopWidth))),
      mat: Math.min(...frames.map((f, i) => imgs[i].left - fr[i].left)),
      spread: Math.max(...centres) - Math.min(...centres), inView: inView.length,
      widths: fr.map((r) => r.width / innerWidth),
      rowScroll: st.scrollWidth > st.clientWidth + 4, ox: cs(st).overflowX,
      wide: document.documentElement.scrollWidth > innerWidth + 1,
      noVis: !!no && cs(no).display !== 'none', labelOnArt,
      hidden: [...st.querySelectorAll('.card-desc, .card-open, .card-num, .tl-year')].every((el) => cs(el).display === 'none' || cs(el).visibility === 'hidden'),
      titleSize: parseFloat(cs(st.querySelector('.card-title')).fontSize),
    };
  });
  check(m.n === 8 && m.border >= 2 && m.mat >= (width < 720 ? 5 : 10), `${width} museum: every work framed with a moulding and a mat`, `border ${m.border}, mat ${Math.round(m.mat)}`);
  check(m.spread <= (width < 720 ? 6 : 4), `${width} museum: works hang on one eye line`, `spread ${Math.round(m.spread)}px over ${m.inView}`);
  check(m.noVis && m.hidden && !m.labelOnArt && m.titleSize >= 11, `${width} museum: wall labels with No., nothing on the art`, JSON.stringify({ no: m.noVis, hid: m.hidden, on: m.labelOnArt, fs: m.titleSize }));
  check(!m.wide, `${width} museum: no sideways page scroll`);
  if (width < 720) check(m.rowScroll && /auto|scroll/.test(m.ox) && m.widths.every((w) => w >= 0.45 && w <= 0.8), `${width} museum: one scrollable row of full-size frames`, JSON.stringify({ row: m.rowScroll, ox: m.ox, w: m.widths.map((w) => w.toFixed(2)) }));
  if (width >= 720) {
    const bb = await page.locator('.stage.layout-museum').boundingBox();
    const x0 = await page.evaluate(() => document.querySelector('.stage.layout-museum').scrollLeft);
    await page.mouse.move(bb.x + bb.width * 0.7, bb.y + bb.height / 2); await page.mouse.down();
    for (let s = 1; s <= 12; s++) { await page.mouse.move(bb.x + bb.width * 0.7 - 25 * s, bb.y + bb.height / 2); await page.waitForTimeout(16); }
    await page.mouse.up(); await page.waitForTimeout(500);
    const x1 = await page.evaluate(() => document.querySelector('.stage.layout-museum').scrollLeft);
    check(x1 > x0 + 150 && !(await page.evaluate(() => document.querySelector('#detail').open)), `${width} museum: dragging the wall with a mouse walks along it`, `${x0} → ${x1}`);
    await page.locator('.stage.layout-museum .card-media').nth(1).click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(1300);
    check(await page.evaluate(() => !document.querySelector('#detail').open && !!document.querySelector('#stage.is-spot')), `${width} museum: a click on a work opens it in place, not the dialog`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  }
  check(!page.errors.length, `${width} museum: no page errors`, page.errors.join('; '));
  await page.close();
}

await browser.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
