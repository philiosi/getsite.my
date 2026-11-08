#!/usr/bin/env node
/* Posters for the motion hero scenes the customer can pick (v4/data/motion-scenes.json): opens the
   motion page in its embed mode at each scene, waits for the motion to settle into a frame, and
   writes assets/samples/<sampleId>/<slug>.webp (+ -640) and their manifest entries.
   Needs the repo served on V4_BASE (python3 -m http.server 5180 at the repo root).
   Usage: PW_DIR=<dir with playwright-core> node scripts/v4-capture-motion.mjs   then  node scripts/v4-parts.mjs */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const { chromium } = await import(path.join(process.env.PW_DIR || '', 'node_modules/playwright-core/index.mjs'));
const ROOT = process.cwd();
const BASE = process.env.V4_BASE || 'http://127.0.0.1:5180';
const motion = JSON.parse(fs.readFileSync(path.join(ROOT, 'v4/data/motion-scenes.json'), 'utf8'));
const outDir = path.join(ROOT, 'v4/assets/samples', motion.sampleId);
const manifestPath = path.join(ROOT, 'v4/assets/samples/manifest.json');

function webp(png, out, width, maxBytes) {
  for (let q = 80; q >= 20; q -= 6) {
    execFileSync('cwebp', ['-quiet', '-q', String(q), '-resize', String(width), '0', png, '-o', out]);
    if (fs.statSync(out).size <= maxBytes) return;
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest[motion.sampleId] ||= {};
fs.mkdirSync(outDir, { recursive: true });
await page.goto(`${BASE}${motion.page}?embed=1#scene=1`, { waitUntil: 'load', timeout: 120000 });
for (const scene of motion.scenes) {
  await page.evaluate((n) => { location.hash = `scene=${n}`; }, scene.index);
  // Let the scene reach a full frame (the brush scene paints itself; the video needs its first frames).
  await page.waitForTimeout(scene.video ? 2500 : scene.slug === 'scene-brush' ? 11000 : 4200);
  // A headless browser cannot play H.264: show the video's own poster without the fallback controls.
  if (scene.video) await page.evaluate(() => { for (const id of ['videoPlayBtn', 'videoNote']) { const el = document.getElementById(id); if (el) el.hidden = true; } const v = document.getElementById('cineVideo'); if (v) v.controls = false; });
  const tmp = path.join(os.tmpdir(), `v4motion-${process.pid}-${scene.slug}.png`);
  await page.screenshot({ path: tmp });
  webp(tmp, path.join(outDir, `${scene.slug}.webp`), 1440, 140 * 1024);
  webp(tmp, path.join(outDir, `${scene.slug}-640.webp`), 640, 40 * 1024);
  fs.rmSync(tmp, { force: true });
  manifest[motion.sampleId][scene.slug] = { file: `${scene.slug}.webp`, thumb: `${scene.slug}-640.webp`, w: 1440, h: 900 };
  console.log(`captured ${scene.slug}`);
}
await browser.close();
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
