/* A fogged window. Technique ported from the owner's condensation/GlassEngine: fog is a low-res
   float grid (1 = wiped) that creeps back, drips are simulated here and drawn as refracting lenses.
   The tagline is written with a fingertip, so it is part of the fog: wiping takes it, re-fogging
   returns it. Drops are GL points and beads a baked tile, so no canvas is re-uploaded per frame. */

import { onTick, Spring, stepSpring, clamp, smooth, lerp } from '../core/spring.js';

const HEADER = `#version 300 es
precision highp float;
uniform sampler2D uSharp;
uniform vec2 uRes, uImg;
uniform float uDpr;
uniform vec3 uFogC;
vec2 cover(vec2 f) {
  float ra = uRes.x / uRes.y, ia = uImg.x / uImg.y;
  vec2 s = ra > ia ? vec2(1.0, ia / ra) : vec2(ra / ia, 1.0);
  return (f - 0.5) * s + 0.5;
}
vec2 screen() { return vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y); }
`;

const FOG_VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FOG_FS = `${HEADER}
uniform sampler2D uBlur, uMask, uTile, uText;
uniform float uWrite;
uniform vec3 uInk;
out vec4 o;
void main() {
  vec2 f = screen(), uv = cover(f), px = gl_FragCoord.xy / uDpr;
  vec3 sharpC = texture(uSharp, uv).rgb;
  vec4 t = texture(uTile, px / 512.0);
  float dens = texture(uTile, px / 4096.0 + 0.37).b;

  // Mottle the boundary so fog returns as creeping patches, not a uniform fade.
  float wiped = texture(uMask, f).r;
  float edge = 4.0 * wiped * (1.0 - wiped);
  float fog = (1.0 - smoothstep(0.0, 1.0, wiped + (t.b - 0.5) * 0.35 * edge)) * (0.9 + 0.1 * dens);

  vec3 fogC = mix(texture(uBlur, uv).rgb, uFogC, 0.66) * (0.985 + 0.03 * t.b);
  vec3 col = mix(sharpC, fogC, fog);

  // Beads live in the fog: tiny lenses onto the room. Wiping takes them too.
  vec2 bn = (t.rg - 0.5) * 2.0;
  float bl = min(1.0, length(bn));
  vec3 bead = mix(texture(uSharp, uv - bn * 0.008).rgb, fogC, 0.74);
  bead *= 1.0 - 0.1 * smoothstep(0.7, 1.0, bl) * smoothstep(-0.3, 0.6, dot(bn, vec2(0.3, 0.9)));
  bead = mix(bead, uFogC, 0.8 * smoothstep(0.3, 0.75, dot(bn, vec2(-0.5, -0.7))));
  col = mix(col, bead, t.a * smoothstep(0.25, 0.9, fog) * 0.8);

  // Pushed water thickens at the rim of a wipe.
  col = mix(col, uFogC, 0.1 * edge * smoothstep(0.1, 0.5, fog));

  // The writing: wet channels cut through fog, deepened so they read on any photo.
  vec4 tx = texture(uText, f);
  float a = tx.a * smoothstep(0.0, 0.03, uWrite - tx.r);
  if (a > 0.003 || tx.a > 0.003) {
    col = mix(col, mix(sharpC, uInk, 0.64), a * fog);
  }
  vec2 off = 1.5 / (uRes / uDpr);
  vec4 tu = texture(uText, f + vec2(off.x * 0.5, off.y));
  float rim = max(0.0, tu.a * smoothstep(0.0, 0.03, uWrite - tu.r) - a);
  col = mix(col, uFogC, 0.75 * rim * fog);
  o = vec4(col, 1.0);
}`;

// aD: x, y (css px, y down), half-size, head radius / half-size.
const DROP_VS = `#version 300 es
in vec4 aD;
uniform vec2 uRes;
uniform float uDpr;
out float vW;
void main() {
  vec2 css = uRes / uDpr;
  gl_Position = vec4(aD.x / css.x * 2.0 - 1.0, 1.0 - aD.y / css.y * 2.0, 0.0, 1.0);
  gl_PointSize = aD.z * 2.0 * uDpr;
  vW = aD.w;
}`;

const DROP_FS = `${HEADER}
in float vW;
out vec4 o;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float taper = vW > 0.99 ? 1.0 : mix(0.34, 1.0, smoothstep(-1.0, 0.35, p.y));
  vec2 n = vec2(p.x / (vW * taper), p.y);
  float l = length(n);
  if (l >= 1.0) discard;
  vec3 c = texture(uSharp, cover(screen()) - n * 0.03).rgb;   // a drop is a small lens, the room flipped in it
  c *= 0.82 + 0.3 * (1.0 - l);
  c *= 1.0 - 0.5 * smoothstep(0.7, 1.0, l) * smoothstep(-0.2, 0.8, dot(n, vec2(0.4, 0.9)));
  c = mix(c, uFogC, 0.85 * smoothstep(0.5, 0.92, dot(n, vec2(-0.55, -0.75))));
  float cover_ = smoothstep(1.0, 0.82, l);
  o = vec4(c * cover_, cover_);
}`;

/* RG bead normal, B mottled grain, A bead coverage. Tileable, baked once for the page. */
let tileData = null;
const TILE = 512;
function bakeTile() {
  if (tileData) return tileData;
  const S = TILE;
  const d = new Uint8Array(S * S * 4);
  const lattice = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = Math.random(); return a; };
  const octave = (a, n, x, y) => {
    const fx = (x / S) * n, fy = (y / S) * n;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const at = (i, j) => a[((j + n) % n) * n + ((i + n) % n)];
    return lerp(lerp(at(ix, iy), at(ix + 1, iy), tx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), tx), ty);
  };
  const a = lattice(24), b = lattice(96);
  for (let y = 0, k = 0; y < S; y++) {
    for (let x = 0; x < S; x++, k += 4) {
      d[k] = d[k + 1] = 128;
      d[k + 2] = 255 * (0.62 * octave(a, 24, x, y) + 0.38 * octave(b, 96, x, y));
    }
  }
  const count = Math.round((S * S) / 72);
  for (let n = 0; n < count; n++) {
    const cx = Math.random() * S, cy = Math.random() * S;
    const r = 0.8 + 2.6 * Math.pow(Math.random(), 2.5);
    const R = Math.ceil(r);
    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        const px = Math.floor(cx) + i, py = Math.floor(cy) + j;
        const dx = (px + 0.5 - cx) / r, dy = (py + 0.5 - cy) / r;
        const l = Math.hypot(dx, dy);
        if (l >= 1) continue;
        const k = (((py + S) % S) * S + ((px + S) % S)) * 4;
        const cov = 255 * clamp((1 - l) / 0.25);
        if (cov <= d[k + 3]) continue;
        d[k] = 128 + 127 * dx; d[k + 1] = 128 + 127 * dy; d[k + 3] = cov;
      }
    }
  }
  tileData = d;
  return d;
}

/** A soft copy of the image without ctx.filter (absent in older Safari): down, then up in halves. */
function softCopy(img) {
  const step = (src, w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  };
  const ratio = img.naturalHeight / img.naturalWidth;
  let c = img;
  for (const w of [320, 160, 80, 40, 80, 160, 320]) c = step(c, w, w * ratio);
  return c;
}

/** Largest setting of the words in W x H, trying every line break. Never breaks inside a word. */
function setType(ctx, makeFont, text, W, H, track, leading) {
  const words = text.split(/\s+/);
  const gaps = Math.min(words.length - 1, 7);
  ctx.font = makeFont(100);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${track * 100}px`;
  let best = null;
  for (let mask = 0; mask < 1 << gaps; mask++) {
    const lines = [[]];
    words.forEach((word, i) => {
      if (i > 0 && i <= gaps && mask & (1 << (i - 1))) lines.push([]);
      lines[lines.length - 1].push(word);
    });
    const strs = lines.map((l) => l.join(' '));
    const widest = Math.max(...strs.map((s) => ctx.measureText(s).width));
    const size = Math.min((W / widest) * 100, H / (strs.length * leading));
    const score = size * (1 - 0.07 * (strs.length - 1));
    if (!best || score > best.score) best = { score, size, lines: strs };
  }
  return best;
}

function program(gl, vs, fs, names) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  const p = gl.createProgram();
  const a = sh(gl.VERTEX_SHADER, vs), b = sh(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, a); gl.attachShader(p, b);
  gl.linkProgram(p);
  gl.deleteShader(a); gl.deleteShader(b);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  const u = {};
  for (const n of names) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}

const WRITE_SECONDS = 1.9;
const SWEEP_RAMP = 1.32;   // blade travel; the spring chasing it brings the sweep to about 1.6s
const REFOG = 0.16;        // per second. Stamps go to 1.35, so a wipe holds about 2s, then returns over about 6s
const MAX_DROPS = 70, MAX_BEADS = 200;

export function mount(el, { concept, reduced, catalog }) {
  const root = document.createElement('div');
  root.className = 'gl';

  const photo = new Image();
  photo.className = 'gl-photo';
  photo.alt = concept.works[0].alt || '';
  photo.src = concept.works[0].src;
  photo.draggable = false;

  const fogLayer = document.createElement('div');
  fogLayer.className = 'gl-fog';
  const wash = document.createElement('div');
  wash.className = 'gl-wash';
  const title = document.createElement('h2');
  title.className = 'gl-title';
  title.textContent = concept.tagline;
  fogLayer.append(wash);

  const blade = document.createElement('div');
  blade.className = 'gl-blade';
  blade.setAttribute('aria-hidden', 'true');

  const sill = document.createElement('div');
  sill.className = 'gl-sill';
  const hint = catalog?.SCENES?.find((s) => s.id === 'glass')?.hint;
  sill.innerHTML = `<svg class="gl-grip" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (hint) {
    const s = document.createElement('span');
    s.className = 'gl-hint';
    s.textContent = hint;
    sill.append(s);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gl-squeegee';
  button.dataset.nodrag = '';
  button.textContent = '한 번에 닦기';
  sill.append(button);

  root.append(photo, fogLayer, title, blade, sill);
  el.append(root);

  const css = getComputedStyle(el);
  const cssVar = (n) => css.getPropertyValue(n).trim();
  const family = cssVar('--c-fontDisplay') || 'serif';
  const weight = cssVar('--c-weightDisplay') || '400';
  const track = parseFloat(cssVar('--c-trackDisplay')) || 0;
  const makeFont = (px) => `${weight} ${px}px ${family}`;
  const LEADING = 1.16;

  let destroyed = false;
  let playing = true;
  let mode = 'wait';       // wait | gl | fallback
  let w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
  const ac = new AbortController();
  const on = { signal: ac.signal };
  const measureCtx = document.createElement('canvas').getContext('2d');

  const insets = () => {
    const pad = clamp(w * 0.04, 16, 56);
    const sillH = sill.offsetHeight || 52;
    return { pad, sillH, W: w - pad * 2 - 28, H: (h - sillH - pad * 2) * 0.62 };
  };

  /* ---------- fallback: blurred to sharp crossfade, driven by pointer and tap ---------- */
  let fbSpring = null;
  let fbHeld = false;
  let soft = null;

  function layoutTitle() {
    const { pad, sillH, W, H } = insets();
    const t = setType(measureCtx, makeFont, concept.tagline, W, H, track, LEADING);
    title.textContent = '';
    for (const line of t.lines) {
      const s = document.createElement('span');
      s.textContent = line;
      title.append(s);
    }
    title.style.fontSize = `${t.size}px`;
    title.style.left = `${pad}px`;
    title.style.bottom = `${sillH + pad}px`;
  }

  function enterFallback() {
    if (destroyed || mode === 'fallback') return;
    mode = 'fallback';
    releaseGL();
    root.classList.remove('is-gl');
    root.classList.add('is-fallback');
    if (!soft && photo.complete && photo.naturalWidth) soft = softCopy(photo);
    if (soft) {
      soft.className = 'gl-soft';
      fogLayer.prepend(soft);
    }
    fogLayer.append(title);
    title.style.opacity = '';
    layoutTitle();
    fbSpring = new Spring({
      value: 0,
      response: 0.24,
      precision: 0.002,
      onChange: (v) => { fogLayer.style.opacity = String(1 - v); },
    });
    root.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || fbHeld) return;
      const r = root.getBoundingClientRect();
      fbSpring.to(smooth(0.12, 0.88, (e.clientX - r.left) / r.width));
    }, on);
    root.addEventListener('pointerleave', () => { if (!fbHeld) fbSpring.to(0); }, on);
    root.addEventListener('click', (e) => {
      if (e.target.closest('.gl-sill')) return;
      fbHeld = !fbHeld;
      fbSpring.to(fbHeld ? 1 : 0);
    }, on);
  }

  /* ---------- GL ---------- */
  let canvas = null, gl = null, res = null;
  let stop = null;
  let scale = Math.min(window.devicePixelRatio || 1, 1.5);
  let cell = 5, gw = 1, gh = 1;
  let mask = new Float32Array(1), bytes = new Uint8Array(1);
  let pendingSize = false;
  let writeP = 0, wrote = false, letterDrops = [];
  let drops = [], beads = [];
  let wipeAcc = 0, nextAmbient = 2, time = 0, lastInput = 0;
  let slowFrames = 0, emaDt = 1 / 60;
  const pointers = new Map();
  const sweep = { on: false, x: 0, v: 0, t: 0, end: 0, trail: 0, y: -999 };
  const pointData = new Float32Array((MAX_DROPS + MAX_BEADS) * 4);
  let inkRgb = [0, 0, 0], fogRgb = [1, 1, 1];

  const parseColor = (value) => {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255];
  };

  const newTex = (unit, filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    res.tex.push(t);
    return t;
  };

  function buildGL() {
    canvas = document.createElement('canvas');
    canvas.className = 'gl-canvas';
    canvas.dataset.nodrag = '';
    canvas.setAttribute('aria-hidden', 'true');
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) { canvas = null; return false; }
    res = { tex: [], buf: [], vao: [], prog: [] };
    try {
      const common = ['uSharp', 'uRes', 'uImg', 'uDpr', 'uFogC'];
      res.fog = program(gl, FOG_VS, FOG_FS, [...common, 'uBlur', 'uMask', 'uTile', 'uText', 'uWrite', 'uInk']);
      res.drop = program(gl, DROP_VS, DROP_FS, common);
      res.prog.push(res.fog.p, res.drop.p);

      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

      newTex(0, gl.LINEAR_MIPMAP_LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, photo);
      gl.generateMipmap(gl.TEXTURE_2D);
      soft = softCopy(photo);
      newTex(1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, soft);
      res.maskTex = newTex(2);
      newTex(3, gl.LINEAR, gl.REPEAT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, TILE, TILE, 0, gl.RGBA, gl.UNSIGNED_BYTE, bakeTile());
      res.textTex = newTex(4);

      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const tri = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, tri);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(res.fog.p, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const pvao = gl.createVertexArray();
      gl.bindVertexArray(pvao);
      const pts = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pts);
      gl.bufferData(gl.ARRAY_BUFFER, pointData.byteLength, gl.DYNAMIC_DRAW);
      const aD = gl.getAttribLocation(res.drop.p, 'aD');
      gl.enableVertexAttribArray(aD);
      gl.vertexAttribPointer(aD, 4, gl.FLOAT, false, 0, 0);
      res.vao.push(vao, pvao);
      res.buf.push(tri, pts);
      res.triVao = vao; res.ptVao = pvao; res.ptBuf = pts;

      inkRgb = parseColor(cssVar('--c-ink'));
      fogRgb = parseColor(cssVar('--c-paper'));
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(res.fog.p);
      const f = res.fog.u;
      gl.uniform1i(f.uSharp, 0); gl.uniform1i(f.uBlur, 1); gl.uniform1i(f.uMask, 2); gl.uniform1i(f.uTile, 3); gl.uniform1i(f.uText, 4);
      gl.uniform3fv(f.uInk, inkRgb);
      gl.uniform3fv(f.uFogC, fogRgb);
      gl.uniform2f(f.uImg, photo.naturalWidth, photo.naturalHeight);
      gl.useProgram(res.drop.p);
      const d = res.drop.u;
      gl.uniform1i(d.uSharp, 0);
      gl.uniform3fv(d.uFogC, fogRgb);
      gl.uniform2f(d.uImg, photo.naturalWidth, photo.naturalHeight);
      if (gl.isContextLost()) throw new Error('context lost during setup');
    } catch (err) {
      console.warn('[glass] WebGL setup failed', err);
      releaseGL();
      return false;
    }
    canvas.addEventListener('webglcontextlost', enterFallback, on);
    canvas.addEventListener('pointerdown', pointerDown, on);
    canvas.addEventListener('pointermove', pointerMove, on);
    canvas.addEventListener('pointerup', pointerEnd, on);
    canvas.addEventListener('pointercancel', pointerEnd, on);
    canvas.addEventListener('pointerleave', pointerEnd, on);
    root.insertBefore(canvas, blade);
    root.classList.add('is-gl');
    mode = 'gl';
    applySize();
    return true;
  }

  function releaseGL() {
    stop?.(); stop = null;
    if (gl && !gl.isContextLost()) {
      for (const t of res?.tex || []) gl.deleteTexture(t);
      for (const b of res?.buf || []) gl.deleteBuffer(b);
      for (const v of res?.vao || []) gl.deleteVertexArray(v);
      for (const p of res?.prog || []) gl.deleteProgram(p);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    canvas?.remove();
    if (canvas) { canvas.width = canvas.height = 1; }
    gl = null; canvas = null; res = null;
  }

  function rasterText() {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const { pad, sillH, W, H } = insets();
    const t = setType(ctx, makeFont, concept.tagline, W, H, track, LEADING);
    const k = c.width / w;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.font = makeFont(t.size);
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${track * t.size}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = ctx.lineCap = 'round';
    // Hairlines of a light serif need a fingertip's width to read as a wiped channel.
    ctx.lineWidth = Math.max(0.8, t.size * (Number(weight) < 500 ? 0.016 : 0.004));

    const widths = t.lines.map((l) => ctx.measureText(l).width);
    const total = widths.reduce((a, b) => a + b, 0);
    const lh = t.size * LEADING;
    const top = h - sillH - pad - lh * t.lines.length;
    let done = 0;
    t.lines.forEach((line, i) => {
      // R encodes when each pixel is written: the shader reveals up to uWrite.
      const g = ctx.createLinearGradient(pad, 0, pad + widths[i], 0);
      const r0 = Math.round((done / total) * 250), r1 = Math.round(((done + widths[i]) / total) * 250);
      g.addColorStop(0, `rgb(${r0},0,0)`);
      g.addColorStop(1, `rgb(${r1},0,0)`);
      ctx.fillStyle = ctx.strokeStyle = g;
      const y = top + lh * i + t.size * 0.92;
      ctx.fillText(line, pad, y);
      ctx.strokeText(line, pad, y);
      done += widths[i];
    });

    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, res.textTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);

    // Where a letter's stroke ends over open fog is where its water can run from.
    const small = document.createElement('canvas');
    small.width = gw; small.height = gh;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(c, 0, 0, gw, gh);
    const px = sctx.getImageData(0, 0, gw, gh).data;
    letterDrops = [];
    for (let j = 1; j < gh - 1; j++) {
      for (let i = 0; i < gw; i++) {
        const k2 = (j * gw + i) * 4;
        if (px[k2 + 3] > 90 && px[k2 + gw * 4 + 3] < 30) letterDrops.push([(i + 0.5) * cell, (j + 1) * cell]);
      }
    }
    c.width = c.height = 1;
  }

  function applySize() {
    pendingSize = false;
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    cell = clamp(w / 260, 3, 6);
    gw = Math.ceil(w / cell); gh = Math.ceil(h / cell);
    mask = new Float32Array(gw * gh);
    bytes = new Uint8Array(gw * gh);
    drops = []; beads = [];
    gl.viewport(0, 0, canvas.width, canvas.height);
    for (const prog of [res.drop, res.fog]) {
      gl.useProgram(prog.p);
      gl.uniform2f(prog.u.uRes, canvas.width, canvas.height);
      gl.uniform1f(prog.u.uDpr, canvas.width / w);
    }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, res.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gw, gh, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
    rasterText();
    wake();
  }

  function stamp(x, y, r, v = 1.35) {
    const gx = x / cell, gy = y / cell, R = r / cell;
    const x0 = Math.max(0, Math.floor(gx - R)), x1 = Math.min(gw - 1, Math.ceil(gx + R));
    const y0 = Math.max(0, Math.floor(gy - R)), y1 = Math.min(gh - 1, Math.ceil(gy + R));
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const d = Math.hypot(i + 0.5 - gx, j + 0.5 - gy) / R;
        if (d >= 1) continue;
        const f = d < 0.5 ? 1 : 2 - d * 2;
        const val = f * f * (3 - 2 * f) * v;
        const k = j * gw + i;
        if (val > mask[k]) mask[k] = val;
      }
    }
  }

  function spawn(x, y, r, wait) {
    if (drops.length >= MAX_DROPS) return;
    drops.push({ x, y, r, v: 0, wait, stick: 0, seed: Math.random() * 100, trail: 0 });
  }

  /* ---------- brush: radius opens with pointer speed ---------- */
  const baseR = () => clamp(w * 0.05, 26, 58);

  function pointerDown(e) {
    if (!playing || e.button > 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY, t: e.timeStamp, r: baseR() * 0.72 });
    stamp(e.offsetX, e.offsetY, baseR() * 0.72);
    wake();
  }

  function pointerMove(e) {
    if (!playing) return;
    let p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType !== 'mouse') return;
      p = { x: e.offsetX, y: e.offsetY, t: e.timeStamp, r: baseR() * 0.72 };
      pointers.set(e.pointerId, p);
    }
    const x = e.offsetX, y = e.offsetY;
    const dist = Math.hypot(x - p.x, y - p.y);
    const speed = dist / Math.max(1, e.timeStamp - p.t) * 1000;
    const r1 = lerp(p.r, baseR() * (0.72 + 0.62 * smooth(100, 2000, speed)), 0.28);
    const n = Math.max(1, Math.ceil(dist / (Math.min(p.r, r1) * 0.25)));
    for (let s = 1; s <= n; s++) stamp(lerp(p.x, x, s / n), lerp(p.y, y, s / n), lerp(p.r, r1, s / n));
    // Pushed water gathers at the lower edge of the wipe and runs.
    wipeAcc += dist;
    if (wipeAcc > 120) {
      wipeAcc = 0;
      spawn(x + (Math.random() - 0.5) * r1, y + r1 * 0.75, 3.2 + Math.random() * 3.2, 0.1 + Math.random() * 0.6);
    }
    p.x = x; p.y = y; p.t = e.timeStamp; p.r = r1;
    lastInput = time;
    wake();
  }

  function pointerEnd(e) { pointers.delete(e.pointerId); }

  /* ---------- squeegee ---------- */
  const OVER = 40;

  function startSweep() {
    // A second press sends the blade back along the path it came, from wherever it is.
    sweep.end = sweep.end ? 0 : 1;
    sweep.on = true;
    lastInput = time;
    blade.style.visibility = 'visible';
    wake();
  }

  function stepSweep(dt) {
    const s = sweep;
    const dir = Math.sign(s.end - s.t);
    s.t = clamp(s.t + (dir * dt) / SWEEP_RAMP, Math.min(s.t, s.end), Math.max(s.t, s.end));
    [s.x, s.v] = stepSpring(s.x, s.v, s.t, 1, 0.3, dt);
    const py = s.y < -900 ? lerp(-OVER, h + OVER, s.x) : s.y;
    const y = lerp(-OVER, h + OVER, s.x);
    const tilt = 0.026 * Math.sin(s.x * Math.PI) * clamp(s.v * 1.3, -1, 1);
    blade.style.transform = `translate3d(0,${y.toFixed(2)}px,0) rotate(${tilt.toFixed(4)}rad)`;
    s.y = y;

    const lo = Math.min(py, y), hi = Math.max(py, y);
    for (let i = 0; i < gw; i++) {
      const off = (i * cell - w / 2) * tilt;
      const j0 = Math.max(0, Math.floor((lo + off) / cell) - 2);
      const j1 = Math.min(gh - 1, Math.ceil((hi + off) / cell));
      for (let j = j0; j <= j1; j++) {
        const k = j * gw + i;
        if (mask[k] < 1.35) mask[k] = 1.35;
      }
    }
    drops = drops.filter((d) => Math.abs(d.y - y) > 14);
    beads = beads.filter((b) => Math.abs(b.y - y) > 10);

    // The blade leaves a few lines of water behind it.
    s.trail += hi - lo;
    if (s.trail > h / 5) {
      s.trail = 0;
      spawn(Math.random() * w, clamp(y - Math.sign(s.v || 1) * 28, 8, h), 2.6 + Math.random() * 2.6, 0.05 + Math.random() * 0.35);
    }
    if (s.t === s.end && Math.abs(s.x - s.end) < 0.002 && Math.abs(s.v) < 0.02) {
      s.x = s.end; s.v = 0; s.on = false; s.y = -999;
      blade.style.visibility = 'hidden';
    }
  }

  function stepDrops(dt) {
    const live = [];
    for (const d of drops) {
      if (d.wait > 0) { d.wait -= dt; live.push(d); continue; }
      if (d.stick > 0) {
        d.stick -= dt;
        d.v *= Math.exp(-dt * 20);
      } else {
        d.v = Math.min(35 + d.r * 32, d.v + 700 * dt);
        if (Math.random() < dt * 1.1) d.stick = 0.06 + Math.random() * 0.45;
      }
      const py = d.y, px = d.x;
      d.y += d.v * dt;
      d.x += Math.sin(d.y * 0.045 + d.seed) * d.v * dt * 0.12;
      const n = Math.max(1, Math.ceil((d.y - py) / 3));
      for (let s = 1; s <= n; s++) stamp(lerp(px, d.x, s / n), lerp(py, d.y, s / n), d.r * 1.25, 1.25);
      d.trail += d.y - py;
      if (d.trail > 12 + Math.random() * 10) {
        d.trail = 0;
        if (beads.length < MAX_BEADS) {
          const life = 3 + Math.random() * 3;
          beads.push({ x: d.x + (Math.random() - 0.5) * d.r * 0.6, y: d.y - d.r * 1.6, r: d.r * (0.28 + Math.random() * 0.2), life, max: life });
        }
        d.r *= 0.985;
      }
      if (d.y < h + 30 && d.r > 1.2) live.push(d);
    }
    drops = live;
    for (let i = beads.length - 1; i >= 0; i--) {
      beads[i].life -= dt;
      if (beads[i].life <= 0) beads.splice(i, 1);
    }
  }

  function draw() {
    gl.bindVertexArray(res.triVao);
    gl.useProgram(res.fog.p);
    gl.uniform1f(res.fog.u.uWrite, writeP * 1.04);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, res.maskTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gw, gh, gl.RED, gl.UNSIGNED_BYTE, bytes);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    let n = 0;
    const put = (x, y, half, ratio) => {
      pointData[n * 4] = x; pointData[n * 4 + 1] = y; pointData[n * 4 + 2] = half; pointData[n * 4 + 3] = ratio;
      n++;
    };
    for (const b of beads) {
      const r = b.r * Math.min(1, (b.life / b.max) * 2);
      if (r > 0.4) put(b.x, b.y, r, 1);
    }
    for (const d of drops) {
      if (d.wait > 0) continue;
      const stretch = 1 + Math.min(0.9, d.v / 150);
      const half = d.r * (1.05 + 0.5 * stretch);
      put(d.x, d.y - half + d.r, half, d.r / half);
    }
    if (n) {
      gl.bindVertexArray(res.ptVao);
      gl.useProgram(res.drop.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.ptBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, pointData, 0, n * 4);
      gl.enable(gl.BLEND);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.disable(gl.BLEND);
    }
  }

  function tick(dt) {
    if (!gl) return;
    if (gl.isContextLost()) { enterFallback(); return; }
    if (pendingSize) applySize();
    time += dt;

    // Weak GPUs get fewer pixels rather than a stutter. The fog is soft; nobody sees the loss.
    emaDt = lerp(emaDt, dt, 0.08);
    slowFrames = emaDt > 0.03 ? slowFrames + 1 : 0;
    if (slowFrames > 45 && scale > 0.7) {
      slowFrames = 0;
      emaDt = 1 / 60;
      scale = Math.max(0.7, scale * 0.8);
      pendingSize = false;
      const keep = mask, kw = gw, kh = gh;
      applySize();
      if (kw === gw && kh === gh) mask = keep;
    }

    if (writeP < 1) {
      writeP = Math.min(1, writeP + dt / WRITE_SECONDS);
      if (writeP === 1 && !wrote) {
        wrote = true;
        // The word has just been written; a few strokes start to run.
        for (let s = 0; s < 5 && letterDrops.length; s++) {
          const [x, y] = letterDrops[Math.floor(Math.random() * letterDrops.length)];
          spawn(x, y, 2.6 + Math.random() * 1.8, s * 0.55 + Math.random() * 0.5);
        }
      }
    }

    if (sweep.on) stepSweep(dt);
    stepDrops(dt);

    let any = false;
    const dec = dt * REFOG;
    for (let i = 0; i < mask.length; i++) {
      const m = mask[i];
      if (m > 0) {
        const v = m - dec;
        mask[i] = v > 0 ? v : 0;
        bytes[i] = v >= 1 ? 255 : v > 0 ? v * 255 : 0;
        any = true;
      } else if (bytes[i]) bytes[i] = 0;
    }

    // Only soon after a touch: a drip re-clears its own trail, so endless ones would never let the pane idle.
    if (any && time > nextAmbient && time < lastInput + 5 && !sweep.on && drops.length < 16) {
      nextAmbient = time + 0.9 + Math.random() * 1.6;
      spawn(Math.random() * w, Math.random() * h * 0.6, 2.4 + Math.random() * 2.4, 0.1 + Math.random());
    }

    draw();
    if (!any && !drops.length && !beads.length && writeP >= 1 && !sweep.on) { stop?.(); stop = null; }
  }

  function wake() {
    if (playing && gl && !stop) stop = onTick(tick);
  }

  button.addEventListener('click', () => {
    if (mode === 'gl') startSweep();
    else if (mode === 'fallback') { fbHeld = !fbHeld; fbSpring.to(fbHeld ? 1 : 0); }
  }, on);

  const ro = new ResizeObserver(([entry]) => {
    const nw = Math.max(1, Math.round(entry.contentRect.width));
    const nh = Math.max(1, Math.round(entry.contentRect.height));
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    if (mode === 'gl') { pendingSize = true; wake(); }
    else if (mode === 'fallback') layoutTitle();
  });
  ro.observe(el);

  /* ---------- start: image and display font first, so the first write is the real one ---------- */
  const ready = Promise.all([
    photo.decode().catch(() => null),
    document.fonts?.load?.(makeFont(100), concept.tagline).catch(() => null),
  ]);
  ready.then(() => {
    if (destroyed) return;
    if (reduced || !(photo.complete && photo.naturalWidth) || !buildGL()) enterFallback();
    document.fonts?.ready?.then(() => {
      if (destroyed) return;
      if (mode === 'gl') { pendingSize = true; wake(); }
      else if (mode === 'fallback') layoutTitle();
    });
  });

  return {
    play() {
      playing = true;
      wake();
      if (fbSpring?.target !== undefined && fbSpring.value !== fbSpring.target) fbSpring.to(fbSpring.target);
    },
    pause() {
      playing = false;
      stop?.(); stop = null;
      fbSpring?.stop();
    },
    seek(t) {
      writeP = clamp(t / WRITE_SECONDS);
      wrote = writeP >= 1;
      if (gl) { const was = playing; playing = true; wake(); playing = was; }
    },
    onWheel() { return false; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ac.abort();
      ro.disconnect();
      fbSpring?.stop();
      releaseGL();
      root.remove();
    },
  };
}

/** Fog on the real image with one wiped stroke through it. */
export function thumb(box, { concept }) {
  const img = new Image();
  img.alt = '';
  img.src = concept.works[0].src;
  const c = document.createElement('canvas');
  c.style.cssText = 'display:block;width:100%;height:100%';
  box.append(c);
  img.addEventListener('load', () => {
    if (!c.isConnected) return;
    const W = c.clientWidth || box.clientWidth || 160, H = c.clientHeight || box.clientHeight || 100;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d');
    const cover = (target, src, sw, sh) => {
      const k = Math.max(c.width / sw, c.height / sh);
      target.drawImage(src, (c.width - sw * k) / 2, (c.height - sh * k) / 2, sw * k, sh * k);
    };
    cover(ctx, img, img.naturalWidth, img.naturalHeight);

    const fog = document.createElement('canvas');
    fog.width = c.width; fog.height = c.height;
    const f = fog.getContext('2d');
    const s = softCopy(img);
    cover(f, s, s.width, s.height);
    f.globalAlpha = 0.66;
    f.fillStyle = concept.tokens.paper;
    f.fillRect(0, 0, fog.width, fog.height);
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'destination-out';
    f.lineCap = 'round';
    f.lineWidth = c.height * 0.2;
    f.shadowColor = concept.tokens.ink;
    f.shadowBlur = c.height * 0.06;
    f.beginPath();
    f.moveTo(c.width * 0.14, c.height * 0.68);
    f.bezierCurveTo(c.width * 0.36, c.height * 0.22, c.width * 0.56, c.height * 0.84, c.width * 0.88, c.height * 0.3);
    f.stroke();
    ctx.drawImage(fog, 0, 0);
  }, { once: true });
}
