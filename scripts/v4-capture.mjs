/* Captures every sample site for the v4 page: a hero shot (1440x900), a full-page shot,
   and the bounding boxes of its top-level sections, so section previews can be cropped later.
   Run: PW_DIR=<dir with playwright-core> node scripts/v4-capture.mjs <out dir> [id ...]
   Local samples are served from the repo root on 127.0.0.1:5180. */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve('playwright-core', { paths: [process.env.PW_DIR || process.cwd()] }));
const L = 'http://127.0.0.1:5180/';
export const SAMPLES = [
  { id: 'artist', url: `${L}samples/artist-yoon-seohyun/index.html` },
  { id: 'hansakim', url: 'https://hansakim.com/' },
  { id: 'nooreemadang', url: `${L}samples/nooreemadang/index.html` },
  { id: 'haru', url: `${L}samples/art-haru/index.html` },
  { id: 'soap', url: 'https://getsite-soap.web.app/' },
  { id: 'cup', url: `${L}samples/cup-cinematic/index.html` },
  { id: 'cup3d', url: `${L}samples/cup-3d/index.html` },
  { id: 'portfolio', url: `${L}samples/portfolio/index.html` },
  { id: 'portfolio-react', url: `${L}samples/portfolio-react/index.html` },
  { id: 'cafe', url: `${L}samples/cafe-neurinohu/index.html` },
  { id: 'gallery-layouts', url: `${L}samples/gallery-layouts/index.html` },
  { id: 'hero-stack-fan', url: `${L}samples/hero-stack-fan/index.html` },
  { id: 'motion-1', url: `${L}motion/hwaga-hieoro-mosyeongeuraepig-saempeul.html` },
  { id: 'motion-2', url: `${L}motion/hwaga-hieoro-mosyeongeuraepig-saempeul-2.html` },
];
const out = process.argv[2];
const only = process.argv.slice(3);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const meta = {};
for (const s of SAMPLES) {
  if (only.length && !only.includes(s.id)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'ko-KR' });
  const page = await ctx.newPage();
  const t0 = Date.now();
  try {
    await page.goto(s.url, { waitUntil: 'load', timeout: 180000 });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${out}/${s.id}-hero.png` });
    // Scroll through once so lazy content and reveal-on-scroll sections render, then back up.
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < Math.min(H, 20000); y += 700) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(120); }
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(800);
    const sections = await page.evaluate(() => {
      const els = [...document.querySelectorAll('main > section, body > section, section[id], header, footer, main > div[id], body > div[id]')];
      return els.map((el) => {
        const r = el.getBoundingClientRect();
        const head = el.querySelector('h1,h2,h3');
        return { tag: el.tagName.toLowerCase(), id: el.id || '', cls: (el.className && String(el.className).slice(0, 60)) || '', top: Math.round(r.top + scrollY), h: Math.round(r.height), heading: head ? head.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) : '' };
      }).filter((x) => x.h > 80);
    });
    await page.screenshot({ path: `${out}/${s.id}-full.png`, fullPage: true });
    meta[s.id] = { url: s.url, height: H, sections, ms: Date.now() - t0 };
    console.log('ok', s.id, H, sections.length, `${Date.now() - t0}ms`);
  } catch (e) {
    meta[s.id] = { url: s.url, error: String(e.message).slice(0, 200) };
    console.log('FAIL', s.id, e.message.slice(0, 200));
  }
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 2));
