/* Topic rail and sample cards. A card is a link to the real site (new tab); its second
   action hands the sample to step 1. */
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
  }
  paint(store.get());
  store.subscribe((s, p) => { if (s.topic !== p.topic) paint(s); });
}
