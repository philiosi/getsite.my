/* The gallery lab sample (samples/gallery-layouts/index.html) on phones: in every one of the 15 layouts,
   nothing (number badge, "+" button, caption, "자세히 보기", counter, arrows, pause, progress) sits on a
   visible artwork, years read whole, no sideways scroll. On desktop the overlays stay as designed.
   Run: python3 -m http.server 5180 --bind 127.0.0.1 (repo root)  then  PW_DIR=<dir with playwright-core> node tests/samples/gallery-layouts.mjs [shots dir] */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright-core', { paths: [process.env.PW_DIR || process.cwd()] }));
const URL = process.env.URL || 'http://127.0.0.1:5180/samples/gallery-layouts/index.html';
const SHOTS = process.argv[2];
let fails = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ' — ' + detail}`); if (!ok) fails++; };

// Everything that must not cover an artwork on a phone.
const UI = ['.card-num', '.card-open', '.card-no', '.focus-caption h3', '.focus-caption p', '.focus-detail-btn', '.focus-count', '.focus-nav button', '.auto-toggle', '.auto-segs', '.cov-btn', '.tl-year'];
const ART = ['.card-media img', '.focus-stage img.on', '.auto-stage > img.on', '.cov-item img', '.peek-item img', '.drag-media img'];

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function phone(width) {
  const page = await browser.newPage({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'load' }); await page.waitForTimeout(600);
  const n = await page.locator('#layoutSeg button').count();
  check(n === 14, `${width}: 14 layouts (no film)`, String(n));
  for (let i = 0; i < n; i++) {
    const name = (await page.locator('#layoutSeg button').nth(i).textContent()).trim();
    await page.locator('#layoutSeg button').nth(i).click(); await page.waitForTimeout(1400);
    if (SHOTS && width === 375) {
      await page.evaluate(() => { const s = document.querySelector('.stage-wrap'); scrollTo(0, s.getBoundingClientRect().top + scrollY - 380); });
      await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/after-${width}-${String(i + 1).padStart(2, '0')}.png` });
    }
    const hits = await page.evaluate(([UI, ART]) => {
      const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && r.width > 2 && r.height > 2 && !el.closest('[hidden],.deck,dialog') ? r : null; };
      const root = document.querySelector('.stage-wrap') || document.body;
      const arts = ART.flatMap((q) => [...root.querySelectorAll(q)]).map((el) => [el, vis(el)]).filter(([, r]) => r);
      const out = [];
      for (const q of UI) for (const el of root.querySelectorAll(q)) {
        const r = vis(el); if (!r) continue;
        for (const [a, ar] of arts) {
          if (a.contains(el) || el.contains(a)) continue;
          const w = Math.min(r.right, ar.right) - Math.max(r.left, ar.left), h = Math.min(r.bottom, ar.bottom) - Math.max(r.top, ar.top);
          if (w > 2 && h > 2) { out.push(`${q} on ${a.className || a.parentElement.className}`); break; }
        }
      }
      // A year reads whole: not clipped, inside the screen, and its text ends before the timeline line and dots.
      const stage = root.querySelector('.layout-timeline');
      const line = stage ? stage.getBoundingClientRect().left + parseFloat(getComputedStyle(stage, '::before').left) - 8 : Infinity;
      const years = [...root.querySelectorAll('.tl-year')].filter((el) => vis(el)).filter((el) => { const rg = document.createRange(); rg.selectNodeContents(el); const t = rg.getBoundingClientRect(); return el.scrollWidth > el.clientWidth + 1 || t.left < 0 || t.right > line; }).length;
      return { hits: [...new Set(out)], years, wide: document.documentElement.scrollWidth > innerWidth + 1 };
    }, [UI, ART]);
    check(!hits.hits.length, `${width} ${name}: nothing on the artwork`, hits.hits.join('; '));
    check(!hits.years, `${width} ${name}: years read whole`);
    check(!hits.wide, `${width} ${name}: no sideways scroll`);
  }
  // Tapping an image still opens the detail (the "+" is gone on phones).
  await page.locator('#layoutSeg button').nth(0).click(); await page.waitForTimeout(900);
  await page.locator('.stage .card-media').first().click(); await page.waitForTimeout(700);
  check(await page.evaluate(() => !!document.querySelector('dialog[open], .dlg.open, [role="dialog"]:not([hidden])')), `${width}: tapping a work opens its detail`);
  // Strip: tapping a folded card unfolds it; tapping the open card's image opens the detail.
  await page.evaluate(() => document.querySelector('#detail')?.close());
  await page.locator('#layoutSeg button').nth(2).click(); await page.waitForTimeout(1200);
  const second = page.locator('.stage .card').nth(1);
  await second.locator('.card-media').click(); await page.waitForTimeout(900);
  check(await second.evaluate((c) => c.classList.contains('active')) && !(await page.evaluate(() => document.querySelector('#detail').open)), `${width} strip: a folded card unfolds first`);
  await second.locator('.card-media').click(); await page.waitForTimeout(700);
  check(await page.evaluate(() => document.querySelector('#detail').open), `${width} strip: the open card's image opens the detail`);
  await page.evaluate(() => document.querySelector('#detail')?.close());
  await page.locator('.stage .card').nth(3).locator('.card-media').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  check(await page.evaluate(() => document.querySelectorAll('.stage .card')[3].classList.contains('active') && !document.querySelector('#detail').open), `${width} strip: Enter on a folded card unfolds it`);
  // Cover flow and card stack: a real finger dragged sideways moves the works; up-down still scrolls the page.
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (sel, dx, dy = 0) => {
    const b = await page.locator(sel).first().boundingBox();
    const x = b.x + b.width / 2, y = b.y + Math.min(b.height / 2, 150);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let k = 1; k <= 12; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * k) / 12, y: y + (dy * k) / 12 }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(900);
  };
  const pick = async (id) => { const i = await page.evaluate((id) => [...document.querySelectorAll('#layoutSeg button')].findIndex((b) => b.dataset.layout === id || b.getAttribute('data-id') === id || b.dataset.v === id), id); return i; };
  const covIdx = (await pick('coverflow')) >= 0 ? await pick('coverflow') : 7, stkIdx = (await pick('stack')) >= 0 ? await pick('stack') : 8;
  await page.locator('#layoutSeg button').nth(covIdx).click(); await page.waitForTimeout(1200);
  await page.locator('.cover-stage').scrollIntoViewIfNeeded();
  const count = () => page.evaluate(() => document.getElementById('covCount').textContent.trim());
  const c0 = await count();
  await swipe('.cover-stage', -160);
  const c1 = await count();
  await swipe('.cover-stage', 160);
  const c2 = await count();
  check(c0.startsWith('01') && c1.startsWith('02') && c2.startsWith('01'), `${width} coverflow: drag left goes forward, drag right goes back`, `${c0} → ${c1} → ${c2}`);
  await swipe('.cover-stage', -420);
  check(Number((await count()).slice(0, 2)) >= 3, `${width} coverflow: a long drag moves several works`, await count());
  // After release the cards glide to rest from the finger's own speed: no jump, at least half a second, on a whole work.
  await page.evaluate(() => { window.__samp = []; const t0 = performance.now(); const f = () => { const m = /translateX\((-?[\d.]+)%\)/.exec(document.querySelector('.cov-item[data-cov="0"]').style.transform); window.__samp.push([performance.now() - t0, -parseFloat(m[1]) / 63]); if (performance.now() - t0 < 2600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await swipe('.cover-stage', 110);
  await page.waitForTimeout(1200);
  const tr = await page.evaluate(() => window.__samp);
  const jumps = Math.max(...tr.slice(1).map((p, i) => Math.abs(p[1] - tr[i][1])));
  const moving = tr.filter((p, i) => i && Math.abs(p[1] - tr[i - 1][1]) > 0.0005);
  const span = moving.length ? moving[moving.length - 1][0] - moving[0][0] : 0, last = tr[tr.length - 1][1];
  check(jumps < 0.2 && span > 650 && Math.abs(last - Math.round(last)) < 0.002, `${width} coverflow: release glides to rest`, `max step ${jumps.toFixed(3)}, moving ${Math.round(span)}ms, rests at ${last.toFixed(3)}`);
  const y0 = await page.evaluate(() => scrollY);
  await swipe('.cover-stage', 0, 220); // finger down: the page scrolls up
  check((await page.evaluate(() => scrollY)) < y0 - 50, `${width} coverflow: an up-down drag still scrolls the page`);
  check(!(await page.evaluate(() => document.querySelector('#detail').open)), `${width} coverflow: a drag never opens the detail`);
  await page.locator('#layoutSeg button').nth(stkIdx).click(); await page.waitForTimeout(1200);
  await page.locator('.deck-zone').scrollIntoViewIfNeeded();
  const title = () => page.evaluate(() => document.querySelector('.stack-panel h3').textContent);
  const t0 = await title();
  await swipe('.deck-card[data-pos="0"]', -160);
  const t1 = await title();
  await swipe('.deck-card[data-pos="0"]', 160);
  const t2 = await title();
  check(t1 !== t0 && t2 === t0, `${width} stack: drag left shows the next card, drag right brings it back`, `${t0} → ${t1} → ${t2}`);
  await swipe('.deck-card[data-pos="0"]', -30);
  check((await title()) === t0 && (await page.evaluate(() => document.querySelector('.deck-card[data-pos="0"]').style.transform)).includes('rotate(0deg)') && !(await page.evaluate(() => /translateX/.test(document.querySelector('.deck-card[data-pos="0"]').style.transform))), `${width} stack: a short drag springs back`);
  check(!(await page.evaluate(() => document.querySelector('#detail').open)), `${width} stack: a drag never opens the detail`);
  await page.locator('.deck-card[data-pos="0"] img').click(); await page.waitForTimeout(700);
  check(await page.evaluate(() => document.querySelector('#detail').open), `${width} stack: a tap on the top card still opens the detail`);
  await page.evaluate(() => document.querySelector('#detail')?.close());
  check(!errors.length, `${width}: no page errors`, errors.join('; '));
  await page.close();
}

await phone(375);
await phone(320);

// Desktop keeps the designed overlays.
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await desk.goto(URL, { waitUntil: 'load' }); await desk.waitForTimeout(800);
const d = await desk.evaluate(() => {
  const num = document.querySelector('.stage .card-media .card-num'), no = document.querySelector('.stage .card-no');
  return { num: !!num && getComputedStyle(num).position === 'absolute' && getComputedStyle(num).display !== 'none', no: !no || getComputedStyle(no).display === 'none' };
});
check(d.num && d.no, '1280: number badge stays on the card as designed, mobile number hidden');
// Desktop: a mouse drag turns the cover flow too.
await desk.locator('#layoutSeg button').nth(7).click(); await desk.waitForTimeout(1200);
await desk.locator('.cover-stage').scrollIntoViewIfNeeded();
const cb = await desk.locator('.cover-stage').boundingBox();
await desk.mouse.move(cb.x + cb.width / 2, cb.y + 150); await desk.mouse.down();
for (let k = 1; k <= 10; k++) { await desk.mouse.move(cb.x + cb.width / 2 - 25 * k, cb.y + 150); await desk.waitForTimeout(16); }
await desk.mouse.up(); await desk.waitForTimeout(900);
const dc = await desk.evaluate(() => document.getElementById('covCount').textContent);
check(dc.startsWith('02') && !(await desk.evaluate(() => document.querySelector('#detail').open)), '1280 coverflow: a mouse drag turns it without opening the detail', dc);
await browser.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
