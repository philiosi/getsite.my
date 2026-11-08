/* The selection: concept, scene, gallery. Lives in the URL so a reload or a
   shared link shows the same site. Unknown values fall back to defaults. */

export const DEFAULTS = { concept: 'atelier', scene: 'film', gallery: 'focus' };

export function parseSelection(search, catalog) {
  const q = new URLSearchParams(search);
  const pick = (key, list, fallback) => {
    const v = q.get(key);
    return list.some((x) => x.id === v) ? v : fallback;
  };
  return {
    concept: pick('c', catalog.CONCEPTS, DEFAULTS.concept),
    scene: pick('s', catalog.SCENES, DEFAULTS.scene),
    gallery: pick('g', catalog.GALLERIES, DEFAULTS.gallery),
  };
}

export function serializeSelection({ concept, scene, gallery }) {
  return `?c=${encodeURIComponent(concept)}&s=${encodeURIComponent(scene)}&g=${encodeURIComponent(gallery)}`;
}

export function createStore(initial) {
  let state = { ...initial };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...patch };
      const changed = Object.keys(patch).filter((k) => state[k] !== next[k]);
      if (!changed.length) return;
      const prev = state;
      state = next;
      subs.forEach((fn) => fn(state, prev, changed));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
