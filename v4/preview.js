/* Step 3's right column: the chosen sections, in order, as one vertical flow. Each image tile shows
   the screen in state.picks (the store resolves it: chosen sample → same topic → any; see parts.js),
   and "다른 화면 고르기" opens a row of the other candidate screens. The gallery tile is the live v3
   engine. What a tile shows is exactly what the order sends. */
import { mountGallery, LAYOUT_IDS, layoutName } from './gallery-mount.js';
import { GALLERIES } from '../v3/catalog.js';
import { partsFor, findPart, pickLabel } from './parts.js';
import { openMotionPicker, openGalleryPicker } from './picker.js';

const HERO_FIRST = 6; // the hero has a candidate per sample; show the closest six first

const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };

export function createFlow({ scroll, bar, store, data, sections, manifest, parts = null, toast = () => {} }) {
  let gallery = null;
  let galleryStage = null;
  const tiles = new Map();
  // What the tiles were last drawn for. Compared to the state, not to `prev`, because the
  // flow is only drawn while step 3 is showing and changes made elsewhere must still land.
  let drawnSample;
  let drawnGallery;

  function galleryTile(state) {
    const tile = h('div', 'tile');
    tile.dataset.section = 'gallery';
    const head = h('div', 'tile-head');
    head.append(h('b', '', '작품·제품 갤러리'), h('span', 'src', '실제로 움직이는 미리보기 · 작품을 누르면 크게'));
    const big = h('button', 'alt-toggle', '크게 보며 고르기');
    big.type = 'button'; big.dataset.galleryOpen = '';
    big.addEventListener('click', () => openGalleryPicker({ store, data, toast, returnFocus: big }));
    head.append(big);
    const body = h('div', 'tile-gallery');
    const chips = h('div', 'g-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', '갤러리 구도');
    for (const id of ['auto', ...LAYOUT_IDS]) {
      const b = h('button', '', layoutName(id));
      b.type = 'button'; b.dataset.layout = id;
      b.title = id === 'auto' ? '주제와 자료에 맞춰 저희가 고릅니다' : GALLERIES.find((g) => g.id === id)?.hint || '';
      b.addEventListener('click', () => store.setGallery(id));
      chips.append(b);
    }
    galleryStage = h('div', '');
    body.append(chips, galleryStage);
    tile.append(head, body);
    const concept = data.samples.find((s) => s.id === state.sampleId)?.concept || 'atelier';
    gallery = mountGallery(galleryStage, { conceptId: concept, layoutId: state.gallery === 'auto' ? 'focus' : state.gallery });
    paintChips(state);
    return tile;
  }

  function paintChips(state) {
    galleryStage?.parentElement?.querySelectorAll('[data-layout]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.layout === state.gallery));
    });
  }

  /** Candidates in the order a customer should see them: chosen sample, same topic, the rest. */
  function ordered(sectionId, state) {
    const chosen = data.samples.find((x) => x.id === state.sampleId);
    const rank = (p) => (!chosen ? 2 : p.sampleId === chosen.id ? 0 : data.samples.find((x) => x.id === p.sampleId)?.topic === chosen.topic ? 1 : 2);
    return stills(sectionId).map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map((x) => x.p);
  }
  const stills = (sectionId) => partsFor(parts, sectionId).filter((p) => p.kind !== 'motion');
  const motions = () => partsFor(parts, 'hero').filter((p) => p.kind === 'motion');
  const titleOf = (sampleId) => data.samples.find((x) => x.id === sampleId)?.title || '';

  function imageTile(section) {
    const tile = h('div', 'tile');
    tile.dataset.section = section.id;
    const head = h('div', 'tile-head');
    const src = h('span', 'src');
    head.append(h('b', '', section.label), src);
    const body = h('div', 'tile-body');
    tile.append(head, body);
    const count = stills(section.id).length;
    let toggle = null; let track = null; let showAll = false;
    if (count > 0) {
      toggle = h('button', 'alt-toggle', `다른 화면 고르기 (${count})`);
      toggle.type = 'button';
      toggle.dataset.altToggle = '';
      toggle.setAttribute('aria-expanded', 'false');
      track = h('div', 'alt-track');
      track.id = `alt-${section.id}`;
      track.setAttribute('role', 'radiogroup');
      track.setAttribute('aria-label', `${section.label} 참고 화면`);
      track.hidden = true;
      toggle.setAttribute('aria-controls', track.id);
      toggle.addEventListener('click', () => setOpen(track.hidden));
      head.append(toggle);
      tile.append(track);
    }
    const sceneCount = section.id === 'hero' && parts?.motion?.page ? motions().length : 0;
    let motionBtn = null;
    if (sceneCount) {
      motionBtn = h('button', 'alt-toggle', `모션 장면 보며 고르기 (${sceneCount})`);
      motionBtn.type = 'button'; motionBtn.dataset.motionOpen = '';
      motionBtn.addEventListener('click', () => openMotionPicker({ store, parts, toast, returnFocus: () => (motionBtn.isConnected ? motionBtn : null) }));
      head.append(motionBtn);
    }
    if (track) {
      track.addEventListener('keydown', (e) => {
        const radios = [...track.querySelectorAll('[role="radio"]')];
        const i = radios.indexOf(document.activeElement);
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (i < 0 || !step) return;
        e.preventDefault();
        const next = radios[(i + step + radios.length) % radios.length];
        next.focus(); next.click();
      });
    }
    let drawnRef;
    function setOpen(open) {
      if (!track) return;
      if (open && !track.childElementCount) fillTrack();
      track.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    }
    function radio(ref, label, thumb) {
      const b = h('button', 'alt');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.ref = ref;
      b.setAttribute('aria-label', label);
      if (thumb) {
        const img = h('img'); img.loading = 'lazy'; img.decoding = 'async'; img.alt = ''; img.src = `./${thumb.thumb}`;
        img.width = 114; img.height = 64;
        b.append(img);
      } else b.append(h('span', 'alt-new', '새로 구성'));
      b.addEventListener('click', () => store.setPick(section.id, ref));
      return b;
    }
    function fillTrack() {
      const state = store.get();
      track.textContent = '';
      const list = ordered(section.id, state);
      const shown = section.id === 'hero' && !showAll ? list.slice(0, HERO_FIRST) : list;
      for (const p of shown) track.append(radio(p.ref, `${titleOf(p.sampleId)}의 ${section.label} 화면`, p));
      if (shown.length < list.length) {
        const more = h('button', 'alt alt-more', `더 보기 (${list.length - shown.length})`);
        more.type = 'button';
        more.addEventListener('click', () => { showAll = true; fillTrack(); track.querySelector(`[data-ref="${CSS.escape(list[shown.length].ref)}"]`)?.focus(); });
        track.append(more);
      }
      track.append(radio('new', '새로 구성 · 이 섹션은 제작 때 새로 만듭니다', null));
      paintTrack(store.get().picks[section.id]);
    }
    function paintTrack(pick) {
      if (!track || !track.childElementCount) return;
      let current = pick?.ref || 'new';
      // A picked hero beyond the first six still shows as chosen.
      if (!track.querySelector(`[data-ref="${CSS.escape(current)}"]`) && section.id === 'hero' && !showAll && !findPart(parts, 'hero', current)?.kind) { showAll = true; fillTrack(); return; }
      const all = [...track.querySelectorAll('[role="radio"]')];
      all.forEach((b) => {
        const on = b.dataset.ref === current;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      // A motion scene is chosen (it is not in this strip): keep the strip reachable by keyboard.
      if (!all.some((b) => b.tabIndex === 0) && all[0]) all[0].tabIndex = 0;
    }
    /** Draws the picked screen; replaces only the image or wireframe, never the tile. */
    function update(state) {
      const pick = state.picks?.[section.id];
      const ref = pick?.ref || 'new';
      paintTrack(pick);
      // The label says "(예시)" when the screen is not from the chosen sample, so the sample is part of the key.
      const key = `${ref}|${state.sampleId}`;
      if (key === drawnRef) return;
      drawnRef = key;
      tile.dataset.ref = ref;
      const part = ref === 'new' ? null : findPart(parts, section.id, ref);
      body.textContent = '';
      if (part) {
        const img = h('img');
        img.loading = 'lazy'; img.decoding = 'async'; img.alt = `${titleOf(part.sampleId)}의 ${section.label} 구성`;
        img.src = `./${part.file}`;
        if (part.w && part.h) { img.width = part.w; img.height = part.h; }
        body.append(img);
        if (part.kind === 'motion') {
          // The poster stands for a moving scene: one button plays it in the picker.
          body.classList.add('is-motion');
          const play = h('button', 'motion-play', `움직임 보기 · ${part.name}`);
          play.type = 'button'; play.dataset.motionPlay = '';
          play.addEventListener('click', () => openMotionPicker({ store, parts, toast, startRef: part.ref, returnFocus: () => (play.isConnected ? play : tile.querySelector('[data-motion-play]') || motionBtn) }));
          body.append(play);
        } else body.classList.remove('is-motion');
        const own = part.sampleId === state.sampleId;
        src.textContent = `참고: ${pickLabel(section.label, pick, data.samples, parts)}${own || part.kind === 'motion' ? '' : ' (예시)'}`;
      } else {
        const wire = h('div', 'wire');
        wire.append(h('span', '', count ? '새로 구성 · 제작 시 새로 만듭니다' : section.id === 'newsletter' ? '확장 옵션 · 제작 시 새로 구성' : '이 샘플에 없는 섹션 · 제작 시 새로 구성'));
        body.classList.remove('is-motion');
        body.append(wire);
        src.textContent = '새로 구성';
      }
    }
    tile.__update = update;
    tile.__open = () => { setOpen(true); return track?.querySelector('[aria-checked="true"]') || toggle; };
    tile.__reorder = () => { if (track?.childElementCount) fillTrack(); };
    update(store.get());
    return tile;
  }

  function render(state) {
    const sampleChanged = state.sampleId !== drawnSample;
    const order = state.sections;
    // Rebuild image tiles when the sample or the set changes; keep the gallery tile alive.
    for (const [id, el] of tiles) {
      if (!order.includes(id) && id !== 'gallery') { el.remove(); tiles.delete(id); }
    }
    if (!order.includes('gallery') && gallery) { gallery.destroy(); gallery = null; tiles.get('gallery')?.remove(); tiles.delete('gallery'); }
    for (const id of order) {
      if (tiles.has(id)) continue;
      const def = sections.find((s) => s.id === id);
      if (!def) continue;
      tiles.set(id, def.live === 'gallery' ? galleryTile(state) : imageTile(def));
    }
    for (const el of tiles.values()) { el.__update?.(state); if (sampleChanged) el.__reorder?.(); }
    // Put them in the chosen order.
    order.forEach((id, i) => { const el = tiles.get(id); if (el && scroll.children[i] !== el) scroll.insertBefore(el, scroll.children[i] || null); });
    if (gallery) {
      if (sampleChanged) gallery.setConcept(data.samples.find((s) => s.id === state.sampleId)?.concept || 'atelier');
      if (state.gallery !== drawnGallery) { gallery.setLayout(state.gallery === 'auto' ? 'focus' : state.gallery); paintChips(state); }
    }
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
    destroy() { gallery?.destroy(); gallery = null; tiles.clear(); scroll.textContent = ''; },
  };
}
