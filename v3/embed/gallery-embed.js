/* Replaces the order page's gallery preview with the v3 gallery engine.
   The page keeps its chips and its gpLayout variable; only the drawing changes. */

import { createGallery } from '../gallery/engine.js';
import { layouts } from '../gallery/layouts.js';
import { CONCEPTS } from '../catalog.js';

const stage = document.getElementById('gpStage');

if (stage) {
  const concept = CONCEPTS.find((c) => c.id === 'atelier');
  // The page's chips keep their own state; the selected one tells us where to start. "auto" shows the grid.
  const layoutOf = (id) => (layouts[id] ? id : 'grid');
  const chosen = () => document.querySelector('#gpChips [aria-checked="true"]')?.dataset.gp;
  stage.classList.add('gpx');
  stage.textContent = '';
  stage.tabIndex = 0;
  stage.setAttribute('aria-label', '갤러리 미리보기. 화살표 키로 넘겨 봅니다');
  const host = document.createElement('div');
  host.className = 'gpx-host';
  stage.append(host);

  const gallery = createGallery(host, { layouts, concept, layoutId: layoutOf(chosen()) });
  // The page's renderGPStage() hands over to this whenever a chip is chosen.
  window.__gpx = (id) => gallery.setLayout(layoutOf(id));

  // In a scrolling page, vertical wheel belongs to the page unless the layout scrolls inside itself.
  const SCROLLS_INSIDE = new Set(['masonry', 'flow']);
  stage.addEventListener('wheel', (e) => {
    const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    // An open work takes the wheel too: sideways pages, a firm push closes it.
    // Still consumed while it flies home, so the rest of one flick doesn't scroll the page.
    if (!sideways && !SCROLLS_INSIDE.has(gallery.layout) && !stage.querySelector('.g-view')) return;
    if (gallery.onWheel(e.deltaY, e.deltaX)) e.preventDefault();
  }, { passive: false });

  stage.addEventListener('keydown', (e) => {
    const step = { ArrowRight: [0, 160], ArrowDown: [160, 0], ArrowLeft: [0, -160], ArrowUp: [-160, 0] }[e.key];
    if (!step || e.target !== stage) return;
    if (gallery.onWheel(step[0], step[1]) || gallery.onWheel(step[1], step[0])) e.preventDefault();
  });

  // Off screen, nothing animates.
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) gallery.resume();
    else gallery.pause();
  }).observe(stage);
}
