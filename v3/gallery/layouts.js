/* Registry of gallery layouts. Each module exports mount(root, ctx) and thumb(box, works). */
import * as focus from './l/focus.js';
import * as film from './l/film.js';
import * as masonry from './l/masonry.js';
import * as index from './l/index.js';
import * as grid from './l/grid.js';
import * as strip from './l/strip.js';
import * as flow from './l/flow.js';
import * as timeline from './l/timeline.js';
import * as coverflow from './l/coverflow.js';
import * as stack from './l/stack.js';
import * as museum from './l/museum.js';

export const layouts = { focus, film, masonry, index, grid, strip, flow, timeline, coverflow, stack, museum };
export const galleryThumb = (id, box, works) => layouts[id].thumb(box, works);
