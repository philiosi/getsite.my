/* The v3 gallery engine inside a scrolling page. Unlike v3/embed/gallery-embed.js this mounts on
   demand into any element and tears everything down, so a panel can be hidden and shown again.
   The stage never takes the vertical wheel from the page unless a work is open large. */
import { createGallery } from '../v3/gallery/engine.js';
import { layouts } from '../v3/gallery/layouts.js';
import { CONCEPTS, GALLERIES } from '../v3/catalog.js';

export const LAYOUT_IDS = GALLERIES.map((g) => g.id);
export const layoutName = (id) => (id === 'auto' ? '제작자에게 맡기기' : GALLERIES.find((g) => g.id === id)?.name || id);
const conceptOf = (id) => CONCEPTS.find((c) => c.id === id) || CONCEPTS[0];
const real = (id) => (layouts[id] ? id : 'focus');

export function mountGallery(stage, { conceptId, layoutId }) {
  stage.classList.add('g-stage');
  stage.tabIndex = 0;
  stage.setAttribute('aria-label', '갤러리 미리보기. 작품을 누르면 크게 보입니다');
  const host = document.createElement('div');
  host.className = 'g-host';
  stage.append(host);
  const gallery = createGallery(host, { layouts, concept: conceptOf(conceptId), layoutId: real(layoutId) });

  const onWheel = (e) => {
    const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    // Vertical wheel belongs to the page while nothing is open large; sideways is the gallery's.
    // Consumed while a work is open or still flying home, so the rest of one flick stays put.
    if (!sideways && !gallery.viewing && !stage.querySelector('.g-view')) return;
    if (gallery.onWheel(e.deltaY, e.deltaX)) e.preventDefault();
  };
  const onKey = (e) => {
    const step = { ArrowRight: [0, 160], ArrowLeft: [0, -160] }[e.key];
    if (!step || e.target !== stage) return;
    if (gallery.onWheel(step[0], step[1]) || gallery.onWheel(step[1], step[0])) e.preventDefault();
  };
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('keydown', onKey);
  const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) gallery.resume(); else gallery.pause(); });
  io.observe(stage);

  return {
    setLayout: (id) => gallery.setLayout(real(id)),
    setConcept: (id) => gallery.setConcept(conceptOf(id)),
    get layout() { return gallery.layout; },
    destroy() {
      io.disconnect();
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('keydown', onKey);
      gallery.destroy();
      host.remove();
      stage.classList.remove('g-stage');
    },
  };
}
