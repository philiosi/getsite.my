/* Step 3's right column (v5): the chosen sections, in order, as one vertical flow. A section is a
   structure only (made new; the order sends every pick as "새로 구성"). Two things are shown as
   samples: the hero motion scenes, as examples to watch, and the gallery, live, whose layout is
   picked here or in the large viewer. */
import { layoutName } from './gallery-mount.js';
import { partsFor } from './parts.js';
import { openMotionPicker, openGalleryPicker, GALLERY_LAB_URL, LAB_IDS } from './picker.js';

const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };

export function createFlow({ scroll, bar, store, data, sections, manifest, parts = null, toast = () => {} }) {
  const tiles = new Map();
  // What the tiles were last drawn for. Compared to the state, not to `prev`, because the
  // flow is only drawn while step 3 is showing and changes made elsewhere must still land.
  let drawnSample;
  let drawnGallery;

  /* The gallery tile is the gallery lab itself (the same 14 layouts as "크게 보며 고르기"), in pick mode,
     in a same-origin iframe loaded when the tile nears the screen. A layout button pressed in it is
     the choice (as the chips were); a layout chosen elsewhere is sent to it. The lab posts its layout
     once when it loads: that first post is its starting point, not a choice, and is ignored. */
  function galleryTile(state) {
    const tile = h('div', 'tile');
    tile.dataset.section = 'gallery';
    const head = h('div', 'tile-head');
    head.append(h('span', 'tile-no'), h('b', '', '작품·제품 갤러리'), h('span', 'src', '실제로 움직이는 미리보기 · 레이아웃 버튼을 누르면 그 구도로 담깁니다'));
    const big = h('button', 'alt-toggle', '크게 보며 고르기');
    big.type = 'button'; big.dataset.galleryOpen = '';
    big.addEventListener('click', () => openGalleryPicker({ store, data, toast, returnFocus: big }));
    head.append(big);
    const body = h('div', 'tile-gallery');
    const bar = h('div', 'g-bar');
    const chosenLine = h('p', 'g-chosen'); chosenLine.dataset.galleryChosen = ''; chosenLine.setAttribute('aria-live', 'polite');
    const auto = h('button', 'g-auto', '제작자에게 맡기기'); auto.type = 'button'; auto.dataset.galleryAuto = '';
    auto.title = '주제와 자료에 맞춰 저희가 고릅니다';
    auto.addEventListener('click', () => store.setGallery('auto'));
    bar.append(chosenLine, auto);
    const frame = h('iframe', 'g-lab');
    frame.title = '갤러리 구도 미리보기 (레이아웃 버튼으로 구도를 고릅니다)';
    frame.loading = 'lazy';
    const start = LAB_IDS.includes(state.gallery) ? state.gallery : '';
    frame.src = `${GALLERY_LAB_URL}?pick=1${start ? `&layout=${start}` : ''}`;
    labLayout = null;
    labFrame = frame;
    body.append(bar, frame);
    tile.append(head, body);
    paintChips(state);
    return tile;
  }

  // The lab's own layout and the frame it lives in (null until its first post after a load).
  let labFrame = null;
  let labLayout = null;
  function onLabMessage(e) {
    if (!labFrame || e.source !== labFrame.contentWindow || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.type !== 'getsite:gallery-layout' || !LAB_IDS.includes(d.id)) return;
    const first = labLayout === null;
    labLayout = d.id;
    if (first) { syncLab(store.get()); return; }
    if (store.get().gallery !== d.id) store.setGallery(d.id);
  }
  window.addEventListener('message', onLabMessage);
  /** Shows the stored layout in the lab when it differs (a choice made in the large viewer). */
  function syncLab(state) {
    if (!labFrame || labLayout === null || !LAB_IDS.includes(state.gallery) || state.gallery === labLayout) return;
    labFrame.contentWindow?.postMessage({ type: 'getsite:gallery-set', id: state.gallery }, location.origin);
  }

  function paintChips(state) {
    const tile = tiles.get('gallery') || labFrame?.closest('.tile');
    const line = tile?.querySelector('[data-gallery-chosen]') || labFrame?.parentElement?.querySelector('[data-gallery-chosen]');
    const auto = labFrame?.parentElement?.querySelector('[data-gallery-auto]');
    if (auto) auto.setAttribute('aria-pressed', String(state.gallery === 'auto'));
    if (line) {
      line.textContent = '';
      line.append(h('span', '', '선택한 구도: '), h('b', '', layoutName(state.gallery)));
      if (state.gallery === 'auto') line.append(h('span', 'g-chosen-hint', ' · 주제와 자료에 맞춰 저희가 고릅니다. 아래에서 레이아웃을 누르면 그 구도로 바뀝니다.'));
    }
  }

  const motions = () => partsFor(parts, 'hero').filter((p) => p.kind === 'motion');

  /* v5: a section is chosen as a structure only and is made new; nothing to pick here. The hero
     shows the motion scenes as examples (a poster and a viewer), never as a choice. */
  function imageTile(section) {
    const tile = h('div', 'tile');
    tile.dataset.section = section.id;
    const head = h('div', 'tile-head');
    head.append(h('span', 'tile-no'), h('b', '', section.label), h('span', 'src', '구성만 고릅니다 · 제작 때 새로 만듭니다'));
    const body = h('div', 'tile-body');
    tile.append(head, body);
    const scenes = section.id === 'hero' && parts?.motion?.page ? motions() : [];
    if (scenes.length) {
      const open = (startRef, back) => openMotionPicker({ parts, startRef, returnFocus: back });
      const all = h('button', 'alt-toggle', `모션 예시 보기 (${scenes.length})`);
      all.type = 'button'; all.dataset.motionOpen = '';
      all.addEventListener('click', () => open(null, all));
      head.append(all);
      const first = scenes[0];
      const img = h('img');
      img.loading = 'lazy'; img.decoding = 'async'; img.alt = `첫 장면 모션 예시: ${first.name}`;
      img.src = `./${first.file}`;
      if (first.w && first.h) { img.width = first.w; img.height = first.h; }
      body.classList.add('is-motion');
      const play = h('button', 'motion-play', `움직임 예시 보기 · ${first.name} 외 ${scenes.length - 1}가지`);
      play.type = 'button'; play.dataset.motionPlay = '';
      play.addEventListener('click', () => open(first.ref, play));
      body.append(img, play);
    } else {
      const wire = h('div', 'wire');
      wire.dataset.sketch = section.id;
      const text = h('div', 'wire-text');
      // The head already names the section with its number (.tile-no); the big copies are visual only.
      const bigNo = h('span', 'wire-no'); bigNo.setAttribute('aria-hidden', 'true');
      const bigName = h('b', 'wire-name', section.label); bigName.setAttribute('aria-hidden', 'true');
      text.append(bigNo, bigName, h('span', 'wire-sub', section.sub || '제작 때 새로 구성합니다'));
      const sketch = h('div', `sk sk-${section.id}`);
      sketch.setAttribute('aria-hidden', 'true');
      const counts = { about: 4, story: 4, featured: 3, history: 4, process: 3, services: 3, trust: 2, faq: 3, contact: 3, booking: 16, newsletter: 2 };
      for (let i = 0; i < (counts[section.id] || 3); i++) sketch.append(h('span'));
      wire.append(text, sketch);
      body.append(wire);
    }
    return tile;
  }

  function render(state) {
    const order = state.sections;
    // Rebuild image tiles when the sample or the set changes; keep the gallery tile alive.
    for (const [id, el] of tiles) {
      if (!order.includes(id) && id !== 'gallery') { el.remove(); tiles.delete(id); }
    }
    if (!order.includes('gallery') && tiles.has('gallery')) { tiles.get('gallery').remove(); tiles.delete('gallery'); labFrame = null; labLayout = null; }
    for (const id of order) {
      if (tiles.has(id)) continue;
      const def = sections.find((s) => s.id === id);
      if (!def) continue;
      tiles.set(id, def.live === 'gallery' ? galleryTile(state) : imageTile(def));
    }
    // Put them in the chosen order.
    order.forEach((id, i) => { const el = tiles.get(id); if (el && scroll.children[i] !== el) scroll.insertBefore(el, scroll.children[i] || null); });
    order.forEach((id, i) => {
      const el = tiles.get(id); const n = String(i + 1).padStart(2, '0');
      el?.querySelectorAll('.tile-no, .wire-no').forEach((no) => { no.textContent = n; });
    });
    if (labFrame && state.gallery !== drawnGallery) { paintChips(state); syncLab(state); }
    drawnSample = state.sampleId;
    drawnGallery = state.gallery;
    const chosen = data.samples.find((s) => s.id === state.sampleId);
    bar.textContent = '';
    bar.append(h('span', '', order.length ? `${order.length}개 섹션을 위에서부터 이어 봅니다` : '왼쪽에서 섹션을 고르면 여기에 순서대로 이어집니다'));
    bar.append(h('b', '', chosen ? chosen.title : '샘플 미선택'));
  }

  /** Opens a section's tile (its screen picker), scrolls it into the flow and focuses it. */
  function focusSection(id) {
    render(store.get());
    const tile = tiles.get(id);
    if (!tile) return false;
    let target = tile.__open ? tile.__open() : tile.querySelector('[data-layout][aria-pressed="true"]') || tile.querySelector('button');
    if (!target) { tile.tabIndex = -1; target = tile; } // a section without candidates: the tile itself
    tile.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    target?.focus({ preventScroll: true });
    return true;
  }

  return {
    render,
    focusSection,
    destroy() { window.removeEventListener('message', onLabMessage); labFrame = null; labLayout = null; tiles.clear(); scroll.textContent = ''; },
  };
}
