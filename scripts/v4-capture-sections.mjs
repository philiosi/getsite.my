#!/usr/bin/env node
// v4 section & hero capture pipeline
// Usage: PW_DIR=/path/to/pw node scripts/v4-capture-sections.mjs [sampleId...]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const PW_DIR =
  process.env.PW_DIR ||
  '/private/tmp/claude-501/-Users-philiosi-Library-CloudStorage-OneDrive----dev-getsite-my/3c3f5b87-5d68-4d9c-9a2e-cd95dff27f29/scratchpad/pw';
const { chromium } = await import(path.join(PW_DIR, 'node_modules/playwright-core/index.mjs'));

const ROOT = process.cwd();
const BASE = process.env.V4_BASE || 'http://127.0.0.1:5180';
const OUT_ROOT = path.join(ROOT, 'v4/assets/samples');
const MANIFEST_PATH = path.join(OUT_ROOT, 'manifest.json');

const VIEWPORT = { width: 1440, height: 900 };
const MAX_SECTION_HEIGHT = 1100;
const MIN_W = 300;
const MIN_H = 120;
const MAX_FULL_BYTES = 120 * 1024; // 120KB
const MAX_THUMB_BYTES = 40 * 1024; // 40KB
const INITIAL_QUALITY = 78;

const samplesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'v4/data/samples.json'), 'utf8')).samples;
const sectionsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'v4/data/sections.json'), 'utf8')).sections;

const filterIds = process.argv.slice(2).filter(Boolean);

function selectorToSlug(selector) {
  return selector.replace(/^[#.]+/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

function collectSelectorsForSample(sample) {
  const seen = new Map(); // slug -> selector
  for (const sec of sectionsData) {
    for (const prev of sec.previews || []) {
      if (prev.sample === sample.id && prev.selector) {
        const slug = selectorToSlug(prev.selector);
        if (!seen.has(slug)) seen.set(slug, prev.selector);
      }
    }
  }
  for (const key of sample.keys || []) {
    const sel = key.startsWith('#') || key.startsWith('.') ? key : `#${key}`;
    const slug = selectorToSlug(sel);
    if (!seen.has(slug)) seen.set(slug, sel);
  }
  return [...seen.entries()].map(([slug, selector]) => ({ slug, selector }));
}

// Decode PNG buffer and sample pixels across (w, min(origH, maxH))
function validatePngBuffer(buf, maxH = MAX_SECTION_HEIGHT, { isDarkBg = false } = {}) {
  if (!buf || buf.length < 33) {
    return { valid: false, reason: 'empty-or-invalid-png', w: 0, h: 0, nearBlackRatio: 0 };
  }
  const w = buf.readUInt32BE(16);
  const origH = buf.readUInt32BE(20);
  const h = Math.min(origH, maxH);

  if (w < MIN_W || h < MIN_H) {
    return { valid: false, reason: `too-small (${w}x${h} < ${MIN_W}x${MIN_H})`, w, h, origH, nearBlackRatio: 0 };
  }

  const colorType = buf[25];
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;

  const idats = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idats.push(buf.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }

  const raw = zlib.inflateSync(Buffer.concat(idats));
  const stride = w * bpp + 1;
  const pixels = Buffer.allocUnsafe(h * w * bpp);

  for (let y = 0; y < h; y++) {
    const filter = raw[y * stride];
    const rowIn = y * stride + 1;
    const rowOut = y * w * bpp;
    const prevOut = (y - 1) * w * bpp;
    for (let i = 0; i < w * bpp; i++) {
      const x = raw[rowIn + i];
      const a = i >= bpp ? pixels[rowOut + i - bpp] : 0;
      const b = y > 0 ? pixels[prevOut + i] : 0;
      const c = y > 0 && i >= bpp ? pixels[prevOut + i - bpp] : 0;
      let val = x;
      if (filter === 1) val = (x + a) & 0xff;
      else if (filter === 2) val = (x + b) & 0xff;
      else if (filter === 3) val = (x + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (x + pr) & 0xff;
      }
      pixels[rowOut + i] = val;
    }
  }

  // Compute near-black pixel fraction (R < 20 && G < 20 && B < 20)
  let nearBlackCount = 0;
  let sampledPixels = 0;
  for (let sy = 0; sy < h; sy += 2) {
    for (let sx = 0; sx < w; sx += 2) {
      const idx = (sy * w + sx) * bpp;
      const R = pixels[idx];
      const G = bpp >= 3 ? pixels[idx + 1] : R;
      const B = bpp >= 3 ? pixels[idx + 2] : R;
      if (R < 20 && G < 20 && B < 20) nearBlackCount++;
      sampledPixels++;
    }
  }
  const nearBlackRatio = sampledPixels > 0 ? nearBlackCount / sampledPixels : 0;

  // Sample 200 regions on a 20x10 grid; pick the most contrasting pixel in each region relative to (0,0)
  // so thin editorial typography/hairlines on solid dark/light backgrounds are accurately detected.
  const bgR = pixels[0];
  const bgG = bpp >= 3 ? pixels[1] : bgR;
  const bgB = bpp >= 3 ? pixels[2] : bgR;
  const cols = 20;
  const rows = 10;
  const counts = new Map();
  let total = 0;
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor((r / rows) * h);
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) / rows) * h));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c / cols) * w);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) / cols) * w));
      let bestR = bgR;
      let bestG = bgG;
      let bestB = bgB;
      let maxDist = -1;
      for (let sy = y0; sy < y1; sy += 4) {
        for (let sx = x0; sx < x1; sx += 4) {
          const idx = (sy * w + sx) * bpp;
          const R = pixels[idx];
          const G = bpp >= 3 ? pixels[idx + 1] : R;
          const B = bpp >= 3 ? pixels[idx + 2] : R;
          const dist = Math.abs(R - bgR) + Math.abs(G - bgG) + Math.abs(B - bgB);
          if (dist > maxDist) {
            maxDist = dist;
            bestR = R;
            bestG = G;
            bestB = B;
          }
        }
      }
      const key = `${bestR >> 2},${bestG >> 2},${bestB >> 2}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      total++;
    }
  }

  let maxSame = 0;
  for (const cnt of counts.values()) {
    if (cnt > maxSame) maxSame = cnt;
  }
  const uniformRatio = maxSame / total;
  if (uniformRatio > 0.95) {
    return {
      valid: false,
      reason: `nearly-uniform (${Math.round(uniformRatio * 100)}% same colour)`,
      w,
      h,
      origH,
      uniformRatio,
      nearBlackRatio
    };
  }

  if (!isDarkBg && nearBlackRatio > 0.10) {
    return {
      valid: false,
      reason: `too-many-near-black-pixels (${(nearBlackRatio * 100).toFixed(1)}% > 10% on light bg)`,
      w,
      h,
      origH,
      uniformRatio,
      nearBlackRatio
    };
  }

  return { valid: true, w, h, origH, uniformRatio, nearBlackRatio };
}

function readWebpDimensions(webpPath) {
  const buf = fs.readFileSync(webpPath);
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  }
  return { w: 0, h: 0 };
}

function encodeWebpWithLimit({ pngPath, outPath, cropW, cropH, resizeW, maxBytes, startQuality = INITIAL_QUALITY }) {
  let q = startQuality;
  while (q >= 20) {
    const args = ['-quiet', '-q', String(q)];
    if (cropW && cropH) {
      args.push('-crop', '0', '0', String(cropW), String(cropH));
    }
    if (resizeW) {
      args.push('-resize', String(resizeW), '0');
    }
    args.push(pngPath, '-o', outPath);
    execFileSync('cwebp', args);
    const size = fs.statSync(outPath).size;
    if (size <= maxBytes || q === 20) {
      return { size, quality: q, ...readWebpDimensions(outPath) };
    }
    q -= 6;
  }
  return { size: fs.statSync(outPath).size, quality: q, ...readWebpDimensions(outPath) };
}

function convertPngToWebpPair({ pngBuf, outDir, baseName, origW, origH, clipH }) {
  const tmpPng = path.join(os.tmpdir(), `v4cap-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  fs.writeFileSync(tmpPng, pngBuf);
  try {
    const needsCrop = clipH && origH > clipH;
    const cropW = needsCrop ? origW : 0;
    const cropH = needsCrop ? clipH : 0;

    const fullPath = path.join(outDir, `${baseName}.webp`);
    const thumbPath = path.join(outDir, `${baseName}-640.webp`);

    const fullMeta = encodeWebpWithLimit({
      pngPath: tmpPng,
      outPath: fullPath,
      cropW,
      cropH,
      resizeW: baseName === 'hero' && origW !== 1440 ? 1440 : 0,
      maxBytes: MAX_FULL_BYTES,
      startQuality: INITIAL_QUALITY
    });

    const thumbMeta = encodeWebpWithLimit({
      pngPath: tmpPng,
      outPath: thumbPath,
      cropW,
      cropH,
      resizeW: 640,
      maxBytes: MAX_THUMB_BYTES,
      startQuality: INITIAL_QUALITY
    });

    return {
      file: `${baseName}.webp`,
      thumb: `${baseName}-640.webp`,
      w: fullMeta.w,
      h: fullMeta.h,
      fullBytes: fullMeta.size,
      thumbBytes: thumbMeta.size,
      fullQ: fullMeta.quality,
      thumbQ: thumbMeta.quality
    };
  } finally {
    try {
      fs.unlinkSync(tmpPng);
    } catch {}
  }
}

async function dismissPreloadersForHero(page, sampleId) {
  await page.evaluate((id) => {
    for (const sel of ['#veil', '#intro', '#preloader']) {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    }
    document.documentElement.classList.remove('intro-on', 'intro-draw', 'intro-ink', 'intro-write', 'intro-out');
    document.body.classList.remove('intro-on', 'intro-draw', 'intro-ink', 'intro-write', 'intro-out');

    // Cafe hero photo has a 2.3s veil + 1.5s delay (>3.5s); ensure hero elements are visible while keeping ambient animations active
    if (id === 'cafe') {
      const heroEls = document.querySelectorAll(
        '#topbar, #heroTag, #heroPhoto, #heroCta, #heroInner, #heroMeta span, #hero .unit, #topbar .unit'
      );
      heroEls.forEach((el) => {
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('transform', 'none', 'important');
      });
      const shade = document.querySelector('#heroShade, .hero-shade');
      if (shade) shade.remove();
      const st = document.createElement('style');
      st.textContent =
        '#topbar, #heroTag, #heroPhoto, #heroCta, #heroInner, #heroMeta span, #hero .unit, #topbar .unit { opacity: 1 !important; transform: none !important; }';
      document.head.appendChild(st);
    }
  }, sampleId);
}

async function getBackgroundInfo(page, selector) {
  return await page
    .evaluate((sel) => {
      const startEl = sel === '__hero__' ? document.body : document.querySelector(sel) || document.body;
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      let cur = startEl;
      while (cur) {
        const bg = getComputedStyle(cur).backgroundColor;
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          if (a > 16) {
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            return { bg, r, g, b, lum, isDarkBg: lum < 64 };
          }
        }
        cur = cur.parentElement;
      }
      return { bg: 'rgb(255, 255, 255)', r: 255, g: 255, b: 255, lum: 255, isDarkBg: false };
    }, selector)
    .catch(() => ({ bg: 'unknown', r: 255, g: 255, b: 255, lum: 255, isDarkBg: false }));
}

async function preparePageForSections(page, sampleId) {
  // 1. Pre-scroll adjustments (remove preloaders, stop hansakim film auto-scroll, expand closed details)
  await page.evaluate((id) => {
    for (const sel of ['#veil', '#intro', '#preloader']) {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    }
    document.documentElement.classList.remove('intro-on', 'intro-draw', 'intro-ink', 'intro-write', 'intro-out');
    document.body.classList.remove('intro-on', 'intro-draw', 'intro-ink', 'intro-write', 'intro-out', 'stack-on');
    document.querySelectorAll('#heroShade, .hero-shade').forEach((el) => el.remove());

    // Stop hansakim documentary auto-scroll loop (#film-skip sets paused=true and stopAuto(true))
    const skipBtn = document.querySelector('#film-skip');
    if (skipBtn) {
      try {
        skipBtn.click();
      } catch {}
    }
    const motionToggle = document.querySelector('#motion-toggle');
    if (motionToggle && motionToggle.getAttribute('aria-pressed') === 'false') {
      try {
        motionToggle.click();
      } catch {}
    }
    document.querySelectorAll('video').forEach((v) => {
      try {
        v.pause();
      } catch {}
    });

    // Open closed <details> inside sections (e.g., nooreemadang #artist-note)
    document.querySelectorAll('section details, #artist-note details, details.artist-note-disclosure').forEach((d) => {
      d.open = true;
    });

    // Force eager loading on lazy images
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
      img.loading = 'eager';
    });
  }, sampleId);

  // 2. Full scroll-through slowly (every 600px, 150ms) to trigger lazy loads and IntersectionObservers
  await page.evaluate(async () => {
    const step = 600;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const maxScroll = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    );
    for (let y = 0; y <= maxScroll; y += step) {
      window.scrollTo(0, y);
      await delay(150);
    }
    window.scrollTo(0, maxScroll);
    await delay(200);
    window.scrollTo(0, 0);
  });

  // 3. Wait for fonts and 1.5s settle
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve())).catch(() => {});
  await page.waitForTimeout(1500);

  // 4. Unpin GSAP ScrollTrigger sections (e.g. portfolio #story) & inject pause/reveal CSS
  await page.evaluate((id) => {
    if (window.lenis && typeof window.lenis.destroy === 'function') {
      try {
        window.lenis.destroy();
      } catch {}
    }
    if (window.ScrollTrigger && typeof window.ScrollTrigger.getAll === 'function') {
      try {
        window.ScrollTrigger.getAll().forEach((t) => t.kill(true));
      } catch {}
    }
    document.querySelectorAll('.story.is-pinned').forEach((el) => el.classList.remove('is-pinned'));
    document.querySelectorAll('.story-beat').forEach((el) => {
      el.style.position = '';
      el.style.top = '';
      el.style.left = '';
      el.style.width = '';
      el.style.opacity = '1';
      el.style.visibility = 'visible';
      el.style.transform = 'none';
    });

    // Add reveal completion classes across all known sample conventions
    const revealSelectors = [
      '.reveal',
      '.reveal-side',
      '[data-reveal]',
      '.awaiting-reveal',
      '.fade-in',
      '.fade-up',
      '.menu-row',
      '.foot-row',
      '.unit',
      '.sec-head > *',
      '.split-word',
      '.works-grid .card'
    ];
    document.querySelectorAll(revealSelectors.join(',')).forEach((el) => {
      el.classList.remove('awaiting-reveal');
      el.classList.add('is-in', 'in', 'visible', 'is-visible', 'revealed', 'active');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('filter', 'none', 'important');
      if (!el.closest('.note-list')) {
        el.style.setProperty('transform', 'none', 'important');
      }
    });

    // Clear inline opacity: 0 on any content element inside sections/footer (excluding shade/backdrop overlays)
    document.body.classList.remove('stack-on');
    document.querySelectorAll('#heroShade, .hero-shade').forEach((el) => el.remove());
    document.querySelectorAll('main *, section *, footer *, .statement *, .manifesto *').forEach((el) => {
      if (el.id === 'heroShade' || el.classList.contains('hero-shade')) return;
      const inlineOp = el.style && el.style.opacity;
      if (inlineOp !== '' && inlineOp !== undefined && parseFloat(inlineOp) === 0) {
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('filter', 'none', 'important');
        if (!el.closest('.note-list')) {
          el.style.setProperty('transform', 'none', 'important');
        }
      }
    });
  }, sampleId);

  await page.addStyleTag({
    content: `
      html, body, *, *::before, *::after {
        scroll-behavior: auto !important;
        animation-play-state: paused !important;
        transition: none !important;
      }
      #veil, #intro, #preloader, #heroShade, .hero-shade {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
      }
      body.stack-on .hero {
        position: relative !important;
        z-index: auto !important;
      }
      .reveal, .reveal-side, [data-reveal], .awaiting-reveal,
      [style*="opacity: 0"], [style*="opacity:0"],
      .sec-head > *, .split-word, .works-grid .card,
      .menu-row, .foot-row, .unit {
        opacity: 1 !important;
        visibility: visible !important;
        filter: none !important;
      }
      .reveal:not(.note-item), .reveal-side:not(.note-item), [data-reveal]:not(.note-item), .awaiting-reveal:not(.note-item),
      .sec-head > *, .split-word, .works-grid .card,
      .menu-row, .foot-row, .unit {
        transform: none !important;
      }
    `
  });
}

async function prepareTargetForScreenshot(page, selector) {
  await page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, selector);

  await page.waitForTimeout(800);

  await page.evaluate((sel) => {
    for (const rmSel of ['#veil', '#intro', '#preloader', '#heroShade', '.hero-shade']) {
      document.querySelectorAll(rmSel).forEach((el) => el.remove());
    }
    document.body.classList.remove('stack-on');

    const target = document.querySelector(sel);
    if (!target) return;

    const classRe = /(reveal|fade|in-view|awaiting|split-word|unit|menu-row|foot-row|card)/i;
    const nodes = [target, ...target.querySelectorAll('*')];
    for (const el of nodes) {
      const cs = getComputedStyle(el);
      const op = parseFloat(cs.opacity);
      const inlineOp = el.style && el.style.opacity !== '' ? parseFloat(el.style.opacity) : 1;
      const cls = typeof el.className === 'string' ? el.className : '';
      if (
        el === target ||
        op < 1 ||
        inlineOp < 1 ||
        cs.visibility === 'hidden' ||
        classRe.test(cls) ||
        el.hasAttribute('data-reveal')
      ) {
        el.classList.remove('awaiting-reveal');
        el.classList.add('is-in', 'in', 'visible', 'is-visible', 'revealed', 'active');
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('filter', 'none', 'important');
        if (!el.closest('.note-list')) {
          el.style.setProperty('transform', 'none', 'important');
        }
      }
      if (el !== target && cs.position === 'sticky') {
        el.style.setProperty('position', 'static', 'important');
      }
    }
  }, selector);

  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve())).catch(() => {});
}

async function withHiddenFixedStickyOutsideTarget(page, selector, fn) {
  await page.evaluate((sel) => {
    const target = document.querySelector(sel);
    if (!target) return;
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el === target || target.contains(el) || el.contains(target)) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'sticky') {
        el.setAttribute('data-v4-hidden-fixed', el.style.getPropertyValue('display') || '');
        el.setAttribute('data-v4-hidden-prio', el.style.getPropertyPriority('display') || '');
        el.style.setProperty('display', 'none', 'important');
      }
    }
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, selector);

  try {
    return await fn();
  } finally {
    await page.evaluate(() => {
      document.querySelectorAll('[data-v4-hidden-fixed]').forEach((el) => {
        const prev = el.getAttribute('data-v4-hidden-fixed');
        const prio = el.getAttribute('data-v4-hidden-prio');
        el.removeAttribute('data-v4-hidden-fixed');
        el.removeAttribute('data-v4-hidden-prio');
        if (prev) el.style.setProperty('display', prev, prio || '');
        else el.style.removeProperty('display');
      });
    });
  }
}

const manifest = fs.existsSync(MANIFEST_PATH)
  ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  : {};
if (!Array.isArray(manifest._failed)) manifest._failed = [];
// Clear previous failures for samples we are about to run
const targetSamples = filterIds.length
  ? samplesData.filter((s) => filterIds.includes(s.id))
  : samplesData;
const runningIds = new Set(targetSamples.map((s) => s.id));
manifest._failed = manifest._failed.filter((f) => !runningIds.has(f.sample));

const summaryRows = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  locale: 'ko-KR'
});

for (const sample of targetSamples) {
  const url = sample.local ? `${BASE}/${sample.local}` : sample.url;
  const sampleOutDir = path.join(OUT_ROOT, sample.id);
  fs.mkdirSync(sampleOutDir, { recursive: true });

  manifest[sample.id] = {};
  const targets = collectSelectorsForSample(sample);
  const sampleFailures = [];
  let capturedCount = 0;

  console.log(`\n=== [${sample.id}] ${url} (${targets.length} sections + __hero__) ===`);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3500);
    await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve())).catch(() => {});
    await dismissPreloadersForHero(page, sample.id);
    await page.waitForTimeout(150);

    // 1. Capture __hero__ (1440x900, animations NOT paused)
    try {
      const heroBg = await getBackgroundInfo(page, '__hero__');
      const heroBuf = await page.screenshot({ fullPage: false, timeout: 30000 });
      const check = validatePngBuffer(heroBuf, VIEWPORT.height, { isDarkBg: heroBg.isDarkBg });
      if (!check.valid) {
        sampleFailures.push({ selector: '__hero__', reason: check.reason });
        manifest._failed.push({ sample: sample.id, selector: '__hero__', reason: check.reason });
        console.log(`  ✗ __hero__: FAILED (${check.reason})`);
      } else {
        const out = convertPngToWebpPair({
          pngBuf: heroBuf,
          outDir: sampleOutDir,
          baseName: 'hero',
          origW: check.w,
          origH: check.origH,
          clipH: VIEWPORT.height
        });
        manifest[sample.id].hero = out.file;
        capturedCount++;
        console.log(
          `  ✓ __hero__ -> ${out.file} (${out.w}x${out.h}, ${(out.fullBytes / 1024).toFixed(1)}KB q=${out.fullQ}, thumb ${(out.thumbBytes / 1024).toFixed(1)}KB q=${out.thumbQ}, nearBlack=${(check.nearBlackRatio * 100).toFixed(1)}% bg=${heroBg.bg} darkBg=${heroBg.isDarkBg})`
        );
      }
    } catch (err) {
      const reason = `screenshot-error: ${err.message}`;
      sampleFailures.push({ selector: '__hero__', reason });
      manifest._failed.push({ sample: sample.id, selector: '__hero__', reason });
      console.log(`  ✗ __hero__: ERROR (${reason})`);
    }

    // 2. Capture sections if any
    if (targets.length > 0) {
      await preparePageForSections(page, sample.id);

      for (const { slug, selector } of targets) {
        try {
          const loc = page.locator(selector).first();
          const count = await page.locator(selector).count();
          if (count === 0) {
            const reason = 'selector-not-found';
            sampleFailures.push({ selector, reason });
            manifest._failed.push({ sample: sample.id, selector, reason });
            console.log(`  ✗ ${selector} (${slug}): FAILED (${reason})`);
            continue;
          }

          await prepareTargetForScreenshot(page, selector);
          const bgInfo = await getBackgroundInfo(page, selector);

          const pngBuf = await withHiddenFixedStickyOutsideTarget(page, selector, async () => {
            return await loc.screenshot({ timeout: 30000 });
          });

          const check = validatePngBuffer(pngBuf, MAX_SECTION_HEIGHT, { isDarkBg: bgInfo.isDarkBg });
          if (!check.valid) {
            sampleFailures.push({ selector, reason: check.reason });
            manifest._failed.push({ sample: sample.id, selector, reason: check.reason });
            console.log(`  ✗ ${selector} (${slug}): FAILED (${check.reason})`);
            continue;
          }

          const out = convertPngToWebpPair({
            pngBuf,
            outDir: sampleOutDir,
            baseName: slug,
            origW: check.w,
            origH: check.origH,
            clipH: MAX_SECTION_HEIGHT
          });

          manifest[sample.id][slug] = {
            file: out.file,
            w: out.w,
            h: out.h,
            thumb: out.thumb
          };
          capturedCount++;
          console.log(
            `  ✓ ${selector} -> ${out.file} (${out.w}x${out.h}, ${(out.fullBytes / 1024).toFixed(1)}KB q=${out.fullQ}, thumb ${(out.thumbBytes / 1024).toFixed(1)}KB q=${out.thumbQ}, nearBlack=${(check.nearBlackRatio * 100).toFixed(1)}% bg=${bgInfo.bg} darkBg=${bgInfo.isDarkBg})`
          );
        } catch (err) {
          const reason = `capture-error: ${err.message.split('\n')[0]}`;
          sampleFailures.push({ selector, reason });
          manifest._failed.push({ sample: sample.id, selector, reason });
          console.log(`  ✗ ${selector} (${slug}): ERROR (${reason})`);
        }
      }
    }
  } catch (err) {
    const reason = `page-load-error: ${err.message.split('\n')[0]}`;
    sampleFailures.push({ selector: '__page__', reason });
    manifest._failed.push({ sample: sample.id, selector: '__page__', reason });
    console.log(`  ✗ [${sample.id}] PAGE ERROR: ${reason}`);
  } finally {
    await page.close();
  }

  summaryRows.push({
    sample: sample.id,
    captured: capturedCount,
    expected: 1 + targets.length,
    failed: sampleFailures.map((f) => `${f.selector} (${f.reason})`).join('; ') || '-'
  });
}

await browser.close();

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nWrote manifest -> ${MANIFEST_PATH}`);

// Print summary table
console.log('\n=== Capture Summary ===');
console.log(
  `${'Sample'.padEnd(18)} | ${'Captured'.padEnd(10)} | ${'Failed List'}`
);
console.log(`${'-'.repeat(18)}-+-${'-'.repeat(10)}-+-${'-'.repeat(50)}`);
for (const row of summaryRows) {
  console.log(
    `${row.sample.padEnd(18)} | ${`${row.captured}/${row.expected}`.padEnd(10)} | ${row.failed}`
  );
}
