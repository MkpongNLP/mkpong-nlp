/* =====================================================================
 * Mkpong logo runtime
 * ---------------------------------------------------------------------
 * Framework-free. This file is the SOURCE; scripts/build-logo.mjs wraps it
 * with the embedded glyph data and writes logo/dist/mkpong-logo.js, which is
 * the file consumers load (a single classic <script>, no bundler, works from
 * file:// and any static host).
 *
 * The wrapped build defines `var MKPONG_DATA = {...}` immediately above this
 * body; the `typeof` probe at the bottom picks it up. This file on its own is
 * still valid JavaScript (it just has no data until configure() is called).
 *
 * Public API (also on globalThis.MkpongLogo):
 *   renderLogo({ o, n, layout, gap, theme, ... })  -> SVG string
 *   setOrthography({ o, n })    persist + broadcast + re-render
 *   getOrthography()            { o, n } actually in force
 *   init()                      apply storage/<html> data attrs, render all
 *   configure(data)             inject glyph/config data manually
 *   LAYOUTS / THEMES / O_VARIANTS / N_VARIANTS
 *
 * Custom element: <mkpong-logo o="dot" n="tilde" layout="stacked" gap="24"
 *                               theme="color" title="...">
 * Renders inline SVG (never <img>), so page CSS and JS can reach inside it.
 *
 * Output rules the exported SVGs rely on:
 *   - paths only: no <text>, no font references, no <script>, no <metadata>
 *   - no transform attributes: every coordinate is emitted in final user units
 *   - the mark group comes before the wordmark group, and inside the mark the
 *     paint order is green, orange, white
 * ===================================================================== */

var DATA = null;
var PARSED = {};
var SVG_NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------ *
 * data plumbing
 * ------------------------------------------------------------------ */

function requireData() {
  if (!DATA) {
    throw new Error('mkpong-logo: no glyph data. Load logo/dist/mkpong-logo.js or call MkpongLogo.configure(data).');
  }
  return DATA;
}

function configure(data) {
  if (!data || !data.glyphs || !data.config) throw new Error('mkpong-logo: configure() needs { glyphs, config, meta }');
  DATA = data;
  PARSED = {};
  return API;
}

function cfg() { return requireData().config; }

function glyph(id) {
  var g = requireData().glyphs[id];
  if (!g) throw new Error('mkpong-logo: unknown glyph "' + id + '"');
  return g;
}

/* ------------------------------------------------------------------ *
 * small helpers
 * ------------------------------------------------------------------ */

function num(value, fallback) {
  var n = typeof value === 'string' ? parseFloat(value) : value;
  return (typeof n === 'number' && isFinite(n)) ? n : fallback;
}

/** Compact SVG number: trim trailing zeros, collapse -0. */
function fmt(n) {
  var rounded = Math.round(n * 100) / 100;
  if (rounded === 0) return '0';
  var out = String(rounded);
  if (out.indexOf('.') !== -1) out = out.replace(/0+$/, '').replace(/\.$/, '');
  return out;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
  });
}

/**
 * Parse absolute path data (the subset opentype.js emits: M L Q C Z).
 * Cached per glyph id. The runtime re-emits coordinates itself rather than
 * using transform attributes, which keeps the exported SVGs inspectable and
 * lets scripts/check-logo.mjs measure the geometry straight from `d`.
 */
function parseD(d) {
  var cmds = [];
  var re = /([MLQCZ])([^MLQCZ]*)/gi;
  var m;
  while ((m = re.exec(d)) !== null) {
    var type = m[1].toUpperCase();
    if (type === 'Z') { cmds.push({ type: 'Z' }); continue; }
    var a = (m[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (type === 'M' || type === 'L') cmds.push({ type: type, x: a[0], y: a[1] });
    else if (type === 'Q') cmds.push({ type: type, x1: a[0], y1: a[1], x: a[2], y: a[3] });
    else if (type === 'C') cmds.push({ type: type, x1: a[0], y1: a[1], x2: a[2], y2: a[3], x: a[4], y: a[5] });
  }
  return cmds;
}

/** Emit a glyph's path data with tx/ty/scale applied, in final user units. */
function pathD(id, tx, ty, scale) {
  if (!PARSED[id]) PARSED[id] = parseD(glyph(id).d);
  var cmds = PARSED[id];
  var out = '';
  for (var i = 0; i < cmds.length; i++) {
    var c = cmds[i];
    if (c.type === 'Z') { out += 'Z'; continue; }
    if (c.type === 'M' || c.type === 'L') {
      out += c.type + fmt(tx + c.x * scale) + ' ' + fmt(ty + c.y * scale);
    } else if (c.type === 'Q') {
      out += 'Q' + fmt(tx + c.x1 * scale) + ' ' + fmt(ty + c.y1 * scale) + ' ' +
             fmt(tx + c.x * scale) + ' ' + fmt(ty + c.y * scale);
    } else {
      out += 'C' + fmt(tx + c.x1 * scale) + ' ' + fmt(ty + c.y1 * scale) + ' ' +
             fmt(tx + c.x2 * scale) + ' ' + fmt(ty + c.y2 * scale) + ' ' +
             fmt(tx + c.x * scale) + ' ' + fmt(ty + c.y * scale);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * themes: CSS variables with per-theme fallbacks
 * ------------------------------------------------------------------ */

function themeNames() { return Object.keys(cfg().themes); }

/**
 * Resolve a paint role ("green" | "orange" | "white" | "wordmark" | "outline")
 * for a theme. With useVars !== false the value is wrapped in the matching CSS
 * custom property (--mkpong-green, ...) with the theme value as fallback, so a
 * page can restyle the logo without touching the JS. Static exports pass
 * useVars:false and get literal colours instead, because resvg and email
 * clients do not resolve custom properties or currentColor.
 */
function paint(role, theme, useVars) {
  var pal = cfg().palette;
  var t = cfg().themes[theme] || {};
  var override = t.overrides || {};
  var fallback = Object.prototype.hasOwnProperty.call(override, role) ? override[role] : pal[role];

  if (useVars === false) {
    var literal = (t.literal || {})[role];
    if (literal) return literal;
    if (fallback === 'currentColor') return pal.wordmark;
    var m = /var\(\s*--[^,]+,\s*([^)]+?)\s*\)/.exec(fallback);
    return m ? m[1] : fallback;
  }

  var varName = cfg().runtime.cssVariables[role];
  // A theme override that is already a custom property or currentColor is used
  // as-is: in the mono theme the front M must knock out to --mkpong-bg, not to
  // --mkpong-white, and the ink must be able to inherit currentColor.
  if (/^\s*var\(/.test(fallback) || fallback === 'currentColor') return fallback;
  return varName ? 'var(' + varName + ', ' + fallback + ')' : fallback;
}

/* ------------------------------------------------------------------ *
 * orthography variants
 * ------------------------------------------------------------------ */

function variants(group) { return cfg().orthography[group]; }

/** Accepts "o_dot", "dot", or a raw variant id and returns a known id. */
function normaliseVariant(value, group, fallback) {
  var table = variants(group);
  if (!value) return fallback;
  if (table[value]) return value;
  var alias = cfg().runtime.shortAliases[value];
  if (alias && table[alias]) return alias;
  var id = group + '_' + value;
  if (table[id]) return id;
  return fallback;
}

function defaultO() { return cfg().runtime.defaults.o; }
function defaultN() { return cfg().runtime.defaults.n; }

/* ------------------------------------------------------------------ *
 * units: mark and wordmark, built from the same glyph data
 * ------------------------------------------------------------------ */

function buildMark(theme, useVars, style, paintRole) {
  var c = cfg().mark;
  var g = glyph('M');
  var scale = num(c.fontSize, 300) / requireData().meta.unitsPerEm;
  var strokeWidth = num(c.strokeWidth, 0);
  var items = [];
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // 'single' is the small-size form: one M, no overlap and no stroke. The
  // overlapping Ms need the stroke to stay separable, but at favicon sizes they
  // read as one dark blob anyway, so the overlap carries no meaning there.
  if (style === 'single') {
    var role = paintRole || 'green';
    var txSingle = -(g.advance / 2) * scale;
    items.push({
      id: 'M', role: role, index: 0,
      tx: txSingle, ty: 0, scale: scale,
      fill: paint(role, theme, useVars),
      stroke: null, strokeWidth: 0
    });
    var sbb = g.bbox;
    return {
      kind: 'mark',
      style: 'single',
      items: items,
      bbox: [txSingle + sbb[0] * scale, sbb[1] * scale, txSingle + sbb[2] * scale, sbb[3] * scale]
    };
  }

  var front = c.paintOrder[c.paintOrder.length - 1];
  c.paintOrder.forEach(function (role, index) {
    // The glyph is placed so its ADVANCE box is centred on the role's centre
    // offset, which is how the original artwork was aligned (text-anchor
    // middle centres advance width, not ink).
    var tx = num(c.centers[role], 0) - (g.advance / 2) * scale;
    var isFront = role === front;
    var item = {
      id: 'M',
      role: role,
      index: index,
      tx: tx,
      ty: 0, // baseline at unit-local y = 0
      scale: scale,
      fill: paint(role, theme, useVars),
      stroke: isFront ? paint('outline', theme, useVars) : null,
      strokeWidth: isFront ? strokeWidth : 0
    };
    items.push(item);

    var pad = item.strokeWidth / 2;
    var bb = g.bbox;
    minX = Math.min(minX, tx + bb[0] * scale - pad);
    minY = Math.min(minY, 0 + bb[1] * scale - pad);
    maxX = Math.max(maxX, tx + bb[2] * scale + pad);
    maxY = Math.max(maxY, 0 + bb[3] * scale + pad);
  });

  return { kind: 'mark', style: 'triple', items: items, bbox: [minX, minY, maxX, maxY] };
}

function buildWordmark(fontSize, oId, nId, letterSpacing, theme, useVars) {
  var c = cfg().wordmark;
  var scale = num(fontSize, 72) / requireData().meta.unitsPerEm;
  var letters = String(c.text).split('');
  var slotVariant = { O: oId, N: nId };
  var kern = c.kerning || {};
  var items = [];
  var pen = 0;
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  letters.forEach(function (slot, i) {
    var id = slotVariant[slot] || slot;
    var g = glyph(id);
    var bb = g.bbox;
    items.push({
      id: id,
      slot: slot,
      variant: slotVariant[slot] ? id : null,
      tx: pen,
      ty: 0, // baseline at unit-local y = 0
      scale: scale,
      fill: paint('wordmark', theme, useVars)
    });
    minX = Math.min(minX, pen + bb[0] * scale);
    minY = Math.min(minY, bb[1] * scale);
    maxX = Math.max(maxX, pen + bb[2] * scale);
    maxY = Math.max(maxY, bb[3] * scale);

    // Advance the pen by the real advance width plus any pair kerning.
    // letter-spacing is inserted BETWEEN letters only -- never after the last
    // one, which is exactly the trailing offset CSS letter-spacing leaves.
    pen += g.advance * scale;
    var next = letters[i + 1];
    if (next) {
      var pair = slot + next;
      if (Object.prototype.hasOwnProperty.call(kern, pair)) pen += num(kern[pair], 0) * scale;
      pen += num(letterSpacing, 0);
    }
  });

  return { kind: 'wordmark', items: items, bbox: [minX, minY, maxX, maxY] };
}

/* ------------------------------------------------------------------ *
 * emit
 * ------------------------------------------------------------------ */

function unitBBox(unit, dx, dy) {
  return [unit.bbox[0] + dx, unit.bbox[1] + dy, unit.bbox[2] + dx, unit.bbox[3] + dy];
}

function emitUnit(unit, dx, dy) {
  var out = '';
  unit.items.forEach(function (item) {
    var attrs = ' d="' + pathD(item.id, item.tx + dx, item.ty + dy, item.scale) + '"' +
                ' fill="' + escapeXml(item.fill) + '"';
    if (item.stroke) {
      attrs += ' stroke="' + escapeXml(item.stroke) + '" stroke-width="' + fmt(item.strokeWidth) + '"' +
               ' stroke-linejoin="round"';
    }
    var cls = unit.kind === 'mark'
      ? 'mkpong-logo__mark-m mkpong-logo__mark-m--' + item.role
      : 'mkpong-logo__letter' + (item.variant ? ' mkpong-logo__letter--' + item.variant : '');
    var meta = unit.kind === 'mark'
      ? ' data-role="' + item.role + '" data-paint-index="' + item.index + '"'
      : ' data-letter="' + item.slot + '"' + (item.variant ? ' data-variant="' + item.variant + '"' : '');
    out += '<path class="' + cls + '"' + meta + attrs + '/>';
  });
  return out;
}

/**
 * Place units and compute the canvas. Both units are centred on their own true
 * ink bounding box, so in every stacked combo the mark axis and the wordmark
 * axis are the same number (not "close", identical by construction).
 */
function placeUnits(units, layoutName, gap, padding) {
  if (units.length === 1) {
    var only = units[0];
    var onlyW = only.bbox[2] - only.bbox[0];
    var onlyH = only.bbox[3] - only.bbox[1];
    return {
      width: onlyW + padding * 2,
      height: onlyH + padding * 2,
      place: [{ unit: only, dx: padding - only.bbox[0], dy: padding - only.bbox[1] }],
      axisX: padding + onlyW / 2
    };
  }

  var mark = units[0];
  var word = units[1];
  var markW = mark.bbox[2] - mark.bbox[0], markH = mark.bbox[3] - mark.bbox[1];
  var wordW = word.bbox[2] - word.bbox[0], wordH = word.bbox[3] - word.bbox[1];

  if (layoutName === 'inline') {
    var contentH = Math.max(markH, wordH);
    return {
      width: padding * 2 + markW + gap + wordW,
      height: contentH + padding * 2,
      place: [
        { unit: mark, dx: padding - mark.bbox[0], dy: padding + (contentH - markH) / 2 - mark.bbox[1] },
        { unit: word, dx: padding + markW + gap - word.bbox[0], dy: padding + (contentH - wordH) / 2 - word.bbox[1] }
      ],
      axisX: { mark: padding + markW / 2, wordmark: padding + markW + gap + wordW / 2 }
    };
  }

  // stacked (default): one shared vertical centre axis.
  var contentW = Math.max(markW, wordW);
  var axis = padding + contentW / 2;
  return {
    width: contentW + padding * 2,
    height: padding * 2 + markH + gap + wordH,
    place: [
      { unit: mark, dx: axis - (mark.bbox[0] + mark.bbox[2]) / 2, dy: padding - mark.bbox[1] },
      { unit: word, dx: axis - (word.bbox[0] + word.bbox[2]) / 2, dy: padding + markH + gap - word.bbox[1] }
    ],
    axisX: axis
  };
}

/* ------------------------------------------------------------------ *
 * renderLogo
 * ------------------------------------------------------------------ */

function renderLogo(options) {
  var opts = options || {};
  var c = cfg();
  var useVars = opts.useVars !== false;
  var theme = opts.theme || 'color';
  if (!c.themes[theme]) throw new Error('mkpong-logo: unknown theme "' + theme + '"');

  var oId = normaliseVariant(opts.o, 'o', defaultO());
  var nId = normaliseVariant(opts.n, 'n', defaultN());
  var layoutName = opts.layout || 'stacked';
  var gap = num(opts.gap, c.layouts.gap);
  var padding = num(opts.padding, c.layouts.padding);
  var letterSpacing = num(opts.letterSpacing, c.wordmark.letterSpacing);

  var markStyle = opts.markStyle === 'single' ? 'single' : 'triple';
  var mark = buildMark(theme, useVars, markStyle, opts.markPaint);
  var wordmark = buildWordmark(num(opts.wordmarkFontSize, c.wordmark.fontSize), oId, nId, letterSpacing, theme, useVars);

  var units;
  if (layoutName === 'mark') units = [mark];
  else if (layoutName === 'wordmark') units = [wordmark];
  else if (layoutName === 'stacked' || layoutName === 'inline') units = [mark, wordmark];
  else throw new Error('mkpong-logo: unknown layout "' + layoutName + '" (expected stacked, inline, mark, wordmark)');

  var geo = placeUnits(units, layoutName, gap, padding);

  // square: pad the canvas out to a square with the artwork centred. Needed for
  // icons/favicons, where a non-square viewBox would letterbox to a wrong size.
  if (opts.square) {
    var side = Math.max(geo.width, geo.height);
    var offX = (side - geo.width) / 2;
    var offY = (side - geo.height) / 2;
    geo.place.forEach(function (p) { p.dx += offX; p.dy += offY; });
    if (typeof geo.axisX === 'object') {
      geo.axisX = { mark: geo.axisX.mark + offX, wordmark: geo.axisX.wordmark + offX };
    } else {
      geo.axisX += offX;
    }
    geo.width = side;
    geo.height = side;
  }

  // The accessible name is the brand's plain-ASCII name, not the wordmark text
  // with variant glyphs, so it does not change with the reader's preference.
  var brandConfig = cfg().wordmark || {};
  var brand = brandConfig.label || brandConfig.text || 'MKPON';
  var title = opts.title || opts.ariaLabel || brand;
  var label = opts.ariaLabel || opts.title || brand;
  var dims = opts.dimensions === true
    ? ' width="' + fmt(geo.width) + '" height="' + fmt(geo.height) + '"'
    : '';
  var size = opts.size ? ' width="' + fmt(num(opts.size, geo.width)) + '"' : '';

  var groups = geo.place.map(function (p) {
    var kind = p.unit.kind;
    var bb = unitBBox(p.unit, p.dx, p.dy);
    return '<g class="mkpong-logo__' + kind + '" data-unit="' + kind + '"' +
      ' data-center-x="' + fmt((bb[0] + bb[2]) / 2) + '"' +
      ' data-bbox="' + bb.map(fmt).join(' ') + '">' +
      emitUnit(p.unit, p.dx, p.dy) +
      '</g>';
  });

  var classes = 'mkpong-logo mkpong-logo--' + layoutName + ' mkpong-logo--' + theme;
  if (opts.className) classes += ' ' + opts.className;

  return '<svg ' + 'xmlns="' + SVG_NS + '"' +
    ' viewBox="0 0 ' + fmt(geo.width) + ' ' + fmt(geo.height) + '"' +
    dims + size +
    ' class="' + escapeXml(classes) + '"' +
    ' role="img" aria-label="' + escapeXml(label) + '"' +
    ' data-o="' + oId + '" data-n="' + nId + '"' +
    ' data-layout="' + layoutName + '" data-theme="' + theme + '"' +
    (mark.style ? ' data-mark-style="' + mark.style + '"' : '') +
    (opts.id ? ' id="' + escapeXml(opts.id) + '"' : '') +
    ' preserveAspectRatio="xMidYMid meet">' +
    '<title>' + escapeXml(title) + '</title>' +
    groups.join('') +
    '</svg>';
}

/* ------------------------------------------------------------------ *
 * orthography preference: storage, <html> data attributes, live updates
 * ------------------------------------------------------------------ */

var hasDOM = typeof document !== 'undefined';

function storageKey() { return cfg().runtime.storageKey; }
function eventName() { return cfg().runtime.eventName; }

function storageGet() {
  if (!hasDOM || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    var raw = window.localStorage.getItem(storageKey());
    var parsed = raw ? JSON.parse(raw) : null;
    return (parsed && (parsed.o || parsed.n)) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function storageSet(value) {
  if (!hasDOM || typeof window === 'undefined' || !window.localStorage) return false;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(value));
    return true;
  } catch (e) {
    return false; // private mode / storage disabled
  }
}

/** Preference in force: localStorage, then <html data-o data-n>, then defaults. */
function getOrthography() {
  var stored = storageGet() || {};
  var domO = hasDOM ? document.documentElement.getAttribute('data-o') : null;
  var domN = hasDOM ? document.documentElement.getAttribute('data-n') : null;
  return {
    o: normaliseVariant(stored.o || domO, 'o', defaultO()),
    n: normaliseVariant(stored.n || domN, 'n', defaultN())
  };
}

function applyToDocument(ortho) {
  if (!hasDOM) return ortho;
  document.documentElement.setAttribute('data-o', ortho.o);
  document.documentElement.setAttribute('data-n', ortho.n);
  return ortho;
}

function renderAll(ortho) {
  if (!hasDOM) return;
  var nodes = document.querySelectorAll('mkpong-logo');
  for (var i = 0; i < nodes.length; i++) {
    if (typeof nodes[i].refresh === 'function') nodes[i].refresh(ortho);
  }
}

/** Persist + apply + broadcast. Every <mkpong-logo> that is not pinned follows. */
function setOrthography(next) {
  var current = getOrthography();
  var ortho = {
    o: normaliseVariant(next && next.o, 'o', current.o),
    n: normaliseVariant(next && next.n, 'n', current.n)
  };
  storageSet(ortho);
  applyToDocument(ortho);
  if (hasDOM) {
    var evt;
    if (typeof CustomEvent === 'function') evt = new CustomEvent(eventName(), { detail: ortho });
    else {
      evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(eventName(), true, true, ortho);
    }
    document.dispatchEvent(evt);
  }
  renderAll(ortho);
  return ortho;
}

/** Call once at startup: mirrors the inline <head> snippet, then renders. */
function init() {
  var ortho = applyToDocument(getOrthography());
  renderAll(ortho);
  return ortho;
}

/* ------------------------------------------------------------------ *
 * custom element
 * ------------------------------------------------------------------ */

function defineElement(global) {
  if (!global.customElements || global.customElements.get('mkpong-logo')) return null;

  var MkpongLogoElement = class extends global.HTMLElement {
    static get observedAttributes() {
      return ['o', 'n', 'layout', 'gap', 'theme', 'title', 'aria-label', 'size'];
    }

    connectedCallback() {
      if (!this._onOrthography) this._onOrthography = (event) => this.refresh(event.detail);
      document.addEventListener(eventName(), this._onOrthography);
      this.renderNow();
    }

    disconnectedCallback() {
      document.removeEventListener(eventName(), this._onOrthography);
    }

    attributeChangedCallback() {
      if (this.isConnected) this.renderNow();
    }

    /** True when the author pinned o/n on this element. */
    get pinned() {
      return this.hasAttribute('o') || this.hasAttribute('n');
    }

    /** Follow the site preference (called on mkpong:orthography). */
    refresh(ortho) {
      if (!this.pinned) this.renderNow(ortho);
    }

    renderNow(ortho) {
      var pref = ortho || getOrthography();
      var svg = renderLogo({
        o: this.hasAttribute('o') ? this.getAttribute('o') : pref.o,
        n: this.hasAttribute('n') ? this.getAttribute('n') : pref.n,
        layout: this.getAttribute('layout') || 'stacked',
        gap: this.hasAttribute('gap') ? this.getAttribute('gap') : undefined,
        theme: this.getAttribute('theme') || 'color',
        title: this.hasAttribute('title') ? this.getAttribute('title') : undefined,
        ariaLabel: this.getAttribute('aria-label') || undefined,
        size: this.hasAttribute('size') ? this.getAttribute('size') : undefined
      });
      // Inline SVG in the light DOM: page CSS and JS can reach inside it.
      this.innerHTML = svg;
    }
  };

  global.customElements.define('mkpong-logo', MkpongLogoElement);
  return MkpongLogoElement;
}

/* ------------------------------------------------------------------ *
 * public API
 * ------------------------------------------------------------------ */

var API = {
  version: '1.0.0',
  configure: configure,
  renderLogo: renderLogo,
  setOrthography: setOrthography,
  getOrthography: getOrthography,
  init: init,
  defineElement: defineElement,
  LAYOUTS: ['stacked', 'inline', 'mark', 'wordmark'],
  get THEMES() { return DATA ? themeNames() : []; },
  get O_VARIANTS() { return DATA ? Object.keys(variants('o')) : []; },
  get N_VARIANTS() { return DATA ? Object.keys(variants('n')) : []; },
  get CONFIG() { return DATA ? DATA.config : null; },
  get GLYPHS() { return DATA ? DATA.glyphs : null; },
  get ORTHOGRAPHY() { return DATA ? DATA.config.orthography : null; }
};

if (typeof MKPONG_DATA !== 'undefined' && MKPONG_DATA) {
  configure(MKPONG_DATA);
}

if (typeof globalThis !== 'undefined') {
  globalThis.MkpongLogo = API;
  if (typeof globalThis.document !== 'undefined' && globalThis.customElements) {
    defineElement(globalThis);
  }
}
