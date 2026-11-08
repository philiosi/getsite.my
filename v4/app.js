/* getsite.my v4. One page: hero (kept from the live page), samples by topic, five steps with one
   panel, FAQ, lookup. Firebase loads only when an order is submitted or looked up. */
import { mountHero } from './hero.js';
import { createAppStore } from './store.js';
import { renderSamples } from './samples.js';
import { renderProcess } from './process.js';
import { mountLookup } from './panels.js';

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');
let toastT = null;
export function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

mountHero();

const json = async (url, required) => {
  const r = await fetch(url);
  if (!r.ok) { if (required) throw new Error(`${url} ${r.status}`); return {}; }
  return r.json();
};
let data; let sections; let manifest; let parts;
try {
  [data, { sections }, manifest, parts] = await Promise.all([json('./data/samples.json', true), json('./data/sections.json', true), json('./assets/samples/manifest.json').catch(() => ({})), json('./data/parts.json').catch(() => null)]);
  // Without the catalog the page still works: every section has no candidates and is sent as "새로 구성",
  // and notes are still kept (an empty catalog, not none).
  if (!parts?.bySection) {
    console.warn('[v4] parts.json did not load; reference screens are off');
    parts = { version: 'none', assetBase: '', bySection: Object.fromEntries(sections.filter((s) => !s.live).map((s) => [s.id, []])) };
  }
} catch (e) {
  console.error('[v4] data failed to load', e);
  const p = document.createElement('p');
  p.className = 'note'; p.setAttribute('role', 'alert'); p.textContent = '샘플 목록을 불러오지 못했습니다. 새로고침해 주세요.';
  $('sampleGrid').replaceWith(p);
  throw e;
}
const store = createAppStore({ sampleIds: data.samples.map((s) => s.id), parts, samples: data.samples });

// #step=N in the URL wins over the saved state, so a link to a step works; back/forward follow it too.
const stepFromHash = () => { const m = /^#step=([1-5])$/.exec(location.hash); return m ? Number(m[1]) : null; };
if (stepFromHash()) store.setStep(stepFromHash());
addEventListener('hashchange', () => { const n = stepFromHash(); if (n && n !== store.get().step) store.setStep(n); });

renderSamples({
  grid: $('sampleGrid'), rail: $('topicRail'), count: $('sampleCount'), data, manifest, store,
  onStart: (id) => { store.pickSample(id); store.setStep(1); $('process').scrollIntoView({ behavior: 'smooth', block: 'start' }); toast(`${data.samples.find((s) => s.id === id)?.title}로 시작합니다`); },
});

renderProcess({ stepsEl: $('steps'), panels: [1, 2, 3, 4, 5].map((n) => $(`panel-${n}`)), store, data, sections, manifest, parts, toast });

document.querySelectorAll('[data-go-step]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); store.setStep(Number(a.dataset.goStep)); $('process').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }));

mountLookup({ input: $('lookupInput'), button: $('lookupBtn'), out: $('lookupResult'), toast });

/* Test hook. No customer data here. */
window.__getsite4 = { store, data, sections, manifest, parts };
