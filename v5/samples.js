/* Topic rail and sample cards. A card is a link to the real site (new tab); its second
   action hands the sample to step 1. */
import { Spring } from '../v3/core/spring.js';

const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };

export const assetFor = (manifest, sampleId, name) => {
  const m = manifest?.[sampleId];
  if (!m) return null;
  if (name === 'hero') return m.hero ? `./assets/samples/${sampleId}/${m.hero}` : null;
  const e = m[name];
  return e?.thumb ? `./assets/samples/${sampleId}/${e.thumb}` : e?.file ? `./assets/samples/${sampleId}/${e.file}` : null;
};

export function renderSamples({ grid, rail, count, data, manifest, store, onStart }) {
  const topics = [{ id: 'all', name: '전체' }, ...data.topics];
  rail.textContent = '';
  const buttons = topics.map((t) => {
    const b = h('button', '', t.name);
    b.type = 'button';
    b.dataset.topic = t.id;
    if (t.hint) b.title = t.hint;
    b.addEventListener('click', () => store.setTopic(t.id));
    rail.append(b);
    return b;
  });

  grid.textContent = '';
  // Sliding pill behind the active topic (designbookmark Tab pill). The pill lives
  // inside the rail so it scrolls with the buttons on small screens; the buttons
  // stay transparent and the pill carries the paper background (see v4.css).
  const pill = h('span', 's-pill');
  pill.setAttribute('aria-hidden', 'true');
  rail.prepend(pill);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pillX = new Spring({ value: 0, damping: 1, response: 0.4 });
  const pillW = new Spring({ value: 0, damping: 1, response: 0.4 });
  const applyPill = () => { pill.style.transform = `translateX(${pillX.value}px)`; pill.style.width = `${pillW.value}px`; };
  pillX.onChange = applyPill; pillW.onChange = applyPill;
  let pillReady = false;
  function movePill(animate) {
    const active = buttons.find((b) => b.dataset.topic === store.get().topic);
    if (!active) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '';
    pill.style.top = `${active.offsetTop}px`;
    pill.style.height = `${active.offsetHeight}px`;
    const x = active.offsetLeft, w = active.offsetWidth;
    if (animate && !reducedMotion) { pillX.to(x); pillW.to(w); }
    else { pillX.set(x); pillW.set(w); }
  }
  addEventListener('resize', () => movePill(false));
  if (document.fonts?.ready) document.fonts.ready.then(() => movePill(false)).catch(() => {});

  /* Rail scroll: when a topic is picked, bring the active button fully into view
     so the neighbours that were hidden off the side flow in. The pill moves on
     its spring; the rail scrolls on its own smooth scroll. The active button is
     centred (clamped at both ends) so neighbours peek in from both sides.
     Manual scrollLeft math — not scrollIntoView — so the page itself never
     moves vertically. */
  function revealTab(animate, topic) {
    const active = buttons.find((b) => b.dataset.topic === topic);
    if (!active) return;
    const max = rail.scrollWidth - rail.clientWidth;
    if (max <= 0) return; // every tab already fits
    const target = active.offsetLeft + active.offsetWidth / 2 - rail.clientWidth / 2;
    rail.scrollTo({ left: Math.max(0, Math.min(max, target)), behavior: animate && !reducedMotion ? 'smooth' : 'auto' });
  }

  const cards = data.samples.map((s) => {
    const card = h('article', 's-card');
    card.dataset.sample = s.id;
    card.dataset.topic = s.topic;
    const link = h('a', 's-hero');
    link.href = s.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${s.title} 사이트 열기 (새 탭)`);
    const img = h('img');
    img.loading = 'lazy'; img.decoding = 'async'; img.width = 1440; img.height = 900;
    img.alt = `${s.title} 첫 화면`;
    img.src = assetFor(manifest, s.id, 'hero') || 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    link.append(img);
    const keys = h('div', 's-keys');
    for (const k of s.keys || []) {
      const src = assetFor(manifest, s.id, k);
      if (!src) continue;
      const ki = h('img'); ki.loading = 'lazy'; ki.decoding = 'async'; ki.alt = ''; ki.src = src; ki.width = 640; ki.height = 480;
      keys.append(ki);
    }
    const body = h('div', 's-body');
    body.append(h('span', 's-badge', s.badge), h('h3', '', s.title), h('p', 's-line', s.line));
    const actions = h('div', 's-actions');
    const open = h('a', 'btn btn-ink btn-sm', '열어보기 ↗');
    open.href = s.url; open.target = '_blank'; open.rel = 'noopener noreferrer'; open.setAttribute('aria-label', `열어보기: ${s.title} (새 탭)`);
    const start = h('button', 'btn btn-line btn-sm', '이 샘플로 시작');
    start.type = 'button'; start.setAttribute('aria-label', `이 샘플로 시작: ${s.title}`);
    start.addEventListener('click', () => onStart(s.id));
    actions.append(open, start);
    card.append(link, keys, body, actions);
    grid.append(card);
    return card;
  });

  function paint(state) {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.topic === state.topic)));
    let n = 0;
    cards.forEach((c) => { const show = state.topic === 'all' || c.dataset.topic === state.topic; c.classList.toggle('is-hidden', !show); if (show) n++; });
    const t = topics.find((x) => x.id === state.topic);
    count.textContent = state.topic === 'all' ? `샘플 ${n}개` : `${t?.name || ''} 샘플 ${n}개 · ${t?.hint || ''}`;
    movePill(pillReady);
    revealTab(pillReady, state.topic);
    pillReady = true;
  }
  paint(store.get());
  /* Filtering shortens the grid. If the reader is already down among the cards, the next
     section would slide up under them, so bring the first cards back under the rail.
     Scroll anchoring is held off for this one layout: it would shift the page a second time. */
  function settle(state) {
    const root = document.documentElement;
    root.style.overflowAnchor = 'none';
    paint(state);
    /* Where the rail rests while stuck. Its live position is no guide: a shorter grid can push it off screen. */
    const line = (parseFloat(getComputedStyle(rail).top) || 0) + rail.offsetHeight + 14;
    const top = count.getBoundingClientRect().top;
    if (top < line) window.scrollTo({ top: Math.max(0, window.scrollY + top - line) });
    requestAnimationFrame(() => requestAnimationFrame(() => { root.style.overflowAnchor = ''; }));
  }
  store.subscribe((s, p) => { if (s.topic !== p.topic) settle(s); });
}
