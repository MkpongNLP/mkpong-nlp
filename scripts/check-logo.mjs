// Acceptance checks for the Mkpong logo system.
//
//   npm run check:logo        (builds first, then runs every check)
//
// Checks are independent of the renderer where it matters: geometry is measured
// straight from the emitted `d` attributes with scripts/lib/path-bbox.mjs, and
// expected positions are recomputed from logo/glyphs.json + logo/logo.config.json.
// The orthography wiring is exercised in a sandboxed fake DOM (node:vm), so
// localStorage, the <html> data attributes, the event and live re-render are all
// covered without adding a jsdom dependency.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import vm from 'node:vm';
import { pathBBox, unitsOf, viewBoxOf, pngSize, groupBBox } from './lib/path-bbox.mjs';

const ROOT = process.cwd();
const DIST = join(ROOT, 'logo/dist');
const config = JSON.parse(readFileSync(join(ROOT, 'logo/logo.config.json'), 'utf8'));
const glyphs = JSON.parse(readFileSync(join(ROOT, 'logo/glyphs.json'), 'utf8'));

const UPM = glyphs.meta.unitsPerEm;
const WSCALE = config.wordmark.fontSize / UPM;
const LETTER_SPACING = config.wordmark.letterSpacing;
const MARK_SCALE = config.mark.fontSize / UPM;
const STROKE = config.mark.strokeWidth;

let passed = 0;
const failures = [];
const notes = [];

function check(name, fn) {
  try {
    const result = fn();
    if (result && result.note) notes.push(`${name}: ${result.note}`);
    passed++;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push({ name, message: error.message });
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function closeTo(actual, expected, tolerance, label) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} +/- ${tolerance}, got ${actual} (off by ${(actual - expected).toFixed(4)})`
  );
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 1. SVG hygiene
 * ------------------------------------------------------------------ */

section('SVG hygiene (exported SVGs: paths only)');

const FORBIDDEN = [
  { re: /<text[\s>]/i, what: '<text>' },
  { re: /<metadata/i, what: '<metadata>' },
  { re: /<script/i, what: '<script>' },
  { re: /<foreignObject/i, what: '<foreignObject>' },
  { re: /font-family/i, what: 'font-family' },
  { re: /font-face|@font/i, what: '@font-face' },
  { re: /font-size/i, what: 'font-size' },
  { re: /\.woff2?|\.ttf|\.otf/i, what: 'font file reference' },
  { re: /Georgia|Gelasio/i, what: 'font name reference' }
];

const exportedSvgs = walk(join(DIST, 'svg')).concat(
  [join(DIST, 'favicon.svg')].filter(existsSync)
);

check(`no text/metadata/script/font references in ${exportedSvgs.length} exported SVGs`, () => {
  for (const file of exportedSvgs) {
    const source = readFileSync(file, 'utf8');
    for (const rule of FORBIDDEN) {
      assert(!rule.re.test(source), `${relative(ROOT, file)} contains ${rule.what}`);
    }
    assert(/<path[\s>]/.test(source), `${relative(ROOT, file)} has no <path> geometry`);
  }
  return { note: `${exportedSvgs.length} files scanned` };
});

check('archived originals are C2PA-free', () => {
  const archived = walk(join(ROOT, 'logo/archive')).filter(f => /\.svg$/i.test(f));
  assert(archived.length >= 2, `expected the two original SVGs in logo/archive, found ${archived.length}`);
  for (const file of archived) {
    const source = readFileSync(file, 'utf8');
    assert(!/<metadata/i.test(source), `${relative(ROOT, file)} still has a <metadata> block`);
    assert(!/c2pa/i.test(source), `${relative(ROOT, file)} still references C2PA`);
  }
  return { note: `${archived.length} archived originals kept` };
});

check('theme colours are literal in static exports', () => {
  const sample = readFileSync(join(DIST, 'svg/stacked-dot-hook-dark.svg'), 'utf8');
  assert(!/var\(--/.test(sample), 'static export still uses CSS custom properties');
  assert(!/currentColor/.test(sample), 'static export still uses currentColor');
  assert(/#[0-9A-F]{6}/i.test(sample), 'static export has no literal colour');
});

/* ------------------------------------------------------------------ *
 * 2. geometry: centre axes, paint order, gaps
 * ------------------------------------------------------------------ */

section('Geometry');

const oShorts = config.exports.o.map(id => config.orthography.o[id].short);
const nShorts = config.exports.n.map(id => config.orthography.n[id].short);

function svgPath(layout, oShort, nShort, theme) {
  return join(DIST, `svg/${layout}-${oShort}-${nShort}-${theme}.svg`);
}

check('mark centre-x == wordmark centre-x in every stacked combo (<= 0.5px)', () => {
  let worst = 0;
  const combos = [];
  for (const oShort of oShorts) {
    for (const nShort of nShorts) {
      for (const theme of config.exports.themes) {
        const file = svgPath('stacked', oShort, nShort, theme);
        const svg = readFileSync(file, 'utf8');
        const units = unitsOf(svg);
        assert(units.mark && units.wordmark, `${relative(ROOT, file)}: missing mark or wordmark group`);

        const markBox = groupBBox(units.mark.markup);
        const wordBox = groupBBox(units.wordmark.markup);
        const markCentre = (markBox[0] + markBox[2]) / 2;
        const wordCentre = (wordBox[0] + wordBox[2]) / 2;
        const delta = Math.abs(markCentre - wordCentre);
        worst = Math.max(worst, delta);
        assert(delta <= 0.5, `${relative(ROOT, file)}: mark ${markCentre.toFixed(3)} vs wordmark ${wordCentre.toFixed(3)}`);

        // declared metadata must match the measurement
        closeTo(units.mark.centerX, markCentre, 0.05, `${relative(ROOT, file)}: mark data-center-x`);
        closeTo(units.wordmark.centerX, wordCentre, 0.05, `${relative(ROOT, file)}: wordmark data-center-x`);

        // and both must sit on the canvas centre axis
        const vb = viewBoxOf(svg);
        closeTo(markCentre, vb[2] / 2, 0.5, `${relative(ROOT, file)}: mark vs canvas centre`);
        combos.push({ file, markCentre, wordCentre, width: wordBox[2] - wordBox[0] });
      }
    }
  }
  return { note: `worst axis delta ${worst.toFixed(4)}px across ${combos.length} stacked exports` };
});

check('mark paint order is green, then orange, then white', () => {
  const combos = [];
  for (const oShort of oShorts) {
    for (const nShort of nShorts) {
      for (const theme of config.exports.themes) {
        const file = svgPath('stacked', oShort, nShort, theme);
        const units = unitsOf(readFileSync(file, 'utf8'));
        const roles = units.mark.paintRoles;
        assert(
          roles.join(',') === config.mark.paintOrder.join(','),
          `${relative(ROOT, file)}: paint order is ${roles.join(',')}, expected ${config.mark.paintOrder.join(',')}`
        );
        combos.push(roles.join('>'));
      }
    }
  }
  return { note: `${combos.length} exports: green>orange>white` };
});

check('canonical mark geometry: green -90 / white 0 / orange +90 around the cluster centre', () => {
  // The archived original placed the Ms at x=310 / 490 with the front M at x=400,
  // i.e. symmetric +/-90 offsets. Outlining must preserve that exactly.
  const file = svgPath('stacked', oShorts[0], nShorts[0], 'color');
  const markup = unitsOf(readFileSync(file, 'utf8')).mark.markup;
  const roles = ['green', 'orange', 'white'];
  const centres = {};
  roles.forEach(role => {
    const match = new RegExp(`data-role="${role}"[^>]* d="([^"]+)"`).exec(markup);
    assert(match, `${relative(ROOT, file)}: no path for role ${role}`);
    const box = pathBBox(match[1]);
    centres[role] = (box[0] + box[2]) / 2;
  });
  closeTo(centres.green - centres.white, -90, 0.5, 'green offset');
  closeTo(centres.orange - centres.white, 90, 0.5, 'orange offset');
  return { note: `offsets ${(centres.green - centres.white).toFixed(3)} / ${(centres.orange - centres.white).toFixed(3)}` };
});

check('front M ink height matches the config font size (cap height preserved)', () => {
  const file = svgPath('stacked', oShorts[0], nShorts[0], 'color');
  const markup = unitsOf(readFileSync(file, 'utf8')).mark.markup;
  const d = new RegExp(`data-role="${config.mark.paintOrder.slice(-1)[0]}"[^>]* d="([^"]+)"`).exec(markup)[1];
  const box = pathBBox(d);
  const height = box[3] - box[1];
  const expected = (glyphs.glyphs.M.bbox[3] - glyphs.glyphs.M.bbox[1]) * MARK_SCALE;
  closeTo(height, expected, 0.5, 'M ink height');
  return { note: `${height.toFixed(2)}px at font-size ${config.mark.fontSize}` };
});

check('layout gap is honoured (stacked vertical, inline horizontal)', () => {
  for (const theme of config.exports.themes) {
    const stacked = unitsOf(readFileSync(svgPath('stacked', oShorts[0], nShorts[0], theme), 'utf8'));
    const markBox = groupBBox(stacked.mark.markup);
    const wordBox = groupBBox(stacked.wordmark.markup);
    closeTo(wordBox[1] - markBox[3], config.layouts.gap, 0.5, `stacked ${theme} gap`);

    const inline = unitsOf(readFileSync(svgPath('inline', oShorts[0], nShorts[0], theme), 'utf8'));
    const inlineMark = groupBBox(inline.mark.markup);
    const inlineWord = groupBBox(inline.wordmark.markup);
    closeTo(inlineWord[0] - inlineMark[2], config.layouts.gap, 0.5, `inline ${theme} gap`);
  }
});

/* ------------------------------------------------------------------ *
 * 3. wordmark: order, spacing, variants
 * ------------------------------------------------------------------ */

section('Wordmark spacing and orthography');

const letters = config.wordmark.text.split('');

/** Expected ink boxes of the wordmark letters, derived from the glyph data. */
function expectedLetters(oId, nId) {
  const slotVariant = { O: oId, N: nId };
  let pen = 0;
  return letters.map((slot, i) => {
    const id = slotVariant[slot] || slot;
    const g = glyphs.glyphs[id];
    const box = [pen + g.bbox[0] * WSCALE, pen + g.bbox[2] * WSCALE];
    pen += g.advance * WSCALE;
    if (i < letters.length - 1) {
      const pair = slot + letters[i + 1];
      if (config.wordmark.kerning[pair]) pen += config.wordmark.kerning[pair] * WSCALE;
      pen += LETTER_SPACING;
    }
    return { slot, id, ink: box };
  });
}

function actualLetters(svg) {
  const units = unitsOf(svg);
  const markup = units.wordmark.markup;
  return [...markup.matchAll(/data-letter="([A-Z])"(?: data-variant="([a-z_]+)")?[^>]* d="([^"]+)"/g)]
    .map(m => ({ slot: m[1], variant: m[2] || null, d: m[3], box: pathBBox(m[3]) }));
}

check(`wordmark letters are ${config.wordmark.text.split('').join(' ')} in order, with the chosen variants in the O and N slots`, () => {
  let count = 0;
  for (const oId of config.exports.o) {
    for (const nId of config.exports.n) {
      const file = svgPath('wordmark', config.orthography.o[oId].short, config.orthography.n[nId].short, 'color');
      const actual = actualLetters(readFileSync(file, 'utf8'));
      assert(actual.length === letters.length, `${relative(ROOT, file)}: ${actual.length} letters, expected ${letters.length}`);
      assert(actual.map(a => a.slot).join('') === config.wordmark.text, `${relative(ROOT, file)}: slots are ${actual.map(a => a.slot).join('')}`);
      assert(actual.find(a => a.slot === 'O').variant === oId, `${relative(ROOT, file)}: O slot is not ${oId}`);
      assert(actual.find(a => a.slot === 'N').variant === nId, `${relative(ROOT, file)}: N slot is not ${nId}`);
      count++;
    }
  }
  return { note: `${count} exports` };
});

check('letter positions match advance widths + letter-spacing (no trailing offset, no overlap)', () => {
  let worst = 0;
  for (const oId of config.exports.o) {
    for (const nId of config.exports.n) {
      const file = svgPath('wordmark', config.orthography.o[oId].short, config.orthography.n[nId].short, 'color');
      const actual = actualLetters(readFileSync(file, 'utf8'));
      const expected = expectedLetters(oId, nId);
      const origin = actual[0].box[0] - expected[0].ink[0];
      actual.forEach((letter, i) => {
        const want = expected[i].ink[0] + origin;
        const delta = Math.abs(letter.box[0] - want);
        worst = Math.max(worst, delta);
        assert(
          delta <= 0.5,
          `${relative(ROOT, file)}: letter ${i} (${letter.slot}) ink left ${letter.box[0].toFixed(3)}, expected ${want.toFixed(3)}`
        );
      });
      // no ink may collide, and the spacing must not balloon either
      for (let i = 1; i < actual.length; i++) {
        const gap = actual[i].box[0] - actual[i - 1].box[2];
        assert(gap >= -0.05, `${relative(ROOT, file)}: letters ${i - 1}/${i} overlap by ${(-gap).toFixed(3)}px`);
        assert(gap <= LETTER_SPACING + 60, `${relative(ROOT, file)}: gap of ${gap.toFixed(2)}px after letter ${i - 1} is too wide`);
      }
    }
  }
  return { note: `worst advance error ${worst.toFixed(4)}px` };
});

check('wordmark is centred on its true ink box (no trailing 3px offset)', () => {
  for (const oId of config.exports.o) {
    for (const nId of config.exports.n) {
      const file = svgPath('wordmark', config.orthography.o[oId].short, config.orthography.n[nId].short, 'color');
      const svg = readFileSync(file, 'utf8');
      const units = unitsOf(svg);
      const box = groupBBox(units.wordmark.markup);
      const vb = viewBoxOf(svg);
      closeTo((box[0] + box[2]) / 2, vb[2] / 2, 0.5, `${relative(ROOT, file)}: ink centre vs canvas centre`);
      closeTo(units.wordmark.centerX, (box[0] + box[2]) / 2, 0.05, `${relative(ROOT, file)}: declared centre`);
      // Left and right padding must be equal: if letter-spacing leaked after the
      // last letter, the ink box would sit left of the canvas centre.
      closeTo(box[0], vb[2] - box[2], 0.5, `${relative(ROOT, file)}: asymmetric side bearings`);
    }
  }
});

check('all six combinations render differently, and every variant is distinct', () => {
  const seen = new Map();
  for (const oId of config.exports.o) {
    for (const nId of config.exports.n) {
      const file = svgPath('wordmark', config.orthography.o[oId].short, config.orthography.n[nId].short, 'color');
      const signature = actualLetters(readFileSync(file, 'utf8'))
        .map(l => l.slot + ':' + (l.variant || '-') + ':' + l.box.map(n => n.toFixed(2)).join(','))
        .join('|');
      const key = oId + '+' + nId;
      for (const [other, sig] of seen) {
        assert(sig !== signature, `${key} renders identically to ${other}`);
      }
      seen.set(key, signature);
    }
  }
  return { note: `${seen.size} combinations, all distinct` };
});

check('variant glyphs differ in the way their names promise', () => {
  const boxes = id => glyphs.glyphs[id].bbox;
  // dot below sits under the baseline, tilde above the cap, bar above the cap
  assert(boxes('o_dot')[3] > 0, 'o_dot should have ink below the baseline (dot below)');
  assert(boxes('n_tilde')[1] < boxes('N')[1], 'n_tilde should have ink above the cap height (tilde)');
  assert(boxes('n_bar')[1] < boxes('N')[1], 'n_bar should have ink above the cap height (bar above)');
  assert(boxes('n_bar')[3] <= boxes('N')[3] + 0.01, 'n_bar should not descend: the bar is above, not below');
  assert(boxes('n_hook')[3] > boxes('N')[3], 'n_hook should descend further than a plain N');
  assert(boxes('o_open')[2] < boxes('O')[2], 'open O should be narrower than O');
  Object.entries(config.orthography).forEach(([group, table]) => {
    if (group.startsWith('$')) return;
    Object.entries(table).forEach(([id, def]) => {
      const entry = glyphs.report.find(r => r.id === id);
      assert(entry, `${id} is missing from logo/glyphs.json`);
      assert(
        entry.needsReview === (def.needsReview === true),
        `${id}: config says needsReview=${def.needsReview === true} but glyphs.json says ${entry.needsReview}`
      );
      // A construction named in the config must actually have been used.
      if (def.compose) {
        assert(entry.composed, `${id}: config names construction "${def.compose}" but it was not composed`);
        assert(entry.construction === def.compose, `${id}: composed with "${entry.construction}", expected "${def.compose}"`);
      }
    });
  });
  const review = glyphs.report.filter(r => r.needsReview).map(r => r.id);
  return { note: review.length ? `still flagged for confirmation: ${review.join(', ')}` : 'no variant is awaiting confirmation' };
});

check('n_bar is composed from the font: base N + the font\'s own macron, in the font\'s own band', () => {
  const entry = glyphs.glyphs.n_bar;
  assert(entry.source === 'composed', `n_bar.source is ${entry.source}, expected composed`);
  assert(entry.construction === 'barAboveN', `n_bar used construction ${entry.construction}`);
  assert(entry.composedFrom === 'N + U+0304', `n_bar is built from "${entry.composedFrom}"`);
  assert(entry.advance === glyphs.glyphs.N.advance, 'n_bar must keep the N advance width (the bar hangs above)');

  const [d] = entry.derivedGeometry || [];
  assert(d, 'n_bar recorded no derivation');
  // The bar is the font's macron outline, unmodified in size - only moved.
  assert(d.bandTop === -1748, `the uppercase macron band should be -1748, got ${d.bandTop}`);
  assert(d.bandSpread === 0, `the band glyphs disagree by ${d.bandSpread}; the construction is no longer well-defined`);
  assert(d.bandFrom.length >= 3, `only ${d.bandFrom.length} band glyphs; too few to call it the font's band`);
  assert(Math.abs(d.placed[1] - d.bandTop) < 0.01, `the bar top landed at ${d.placed[1]}, not on the band ${d.bandTop}`);
  const placedW = d.placed[2] - d.placed[0];
  const outlineW = d.outline[2] - d.outline[0];
  assert(Math.abs(placedW - outlineW) < 0.01, 'the bar was resized instead of moved');
  // centred over the N ink, and clear of the cap
  const nInk = glyphs.glyphs.N.bbox;
  closeTo((d.placed[0] + d.placed[2]) / 2, (nInk[0] + nInk[2]) / 2, 0.5, 'bar centre vs N ink centre');
  assert(d.placed[3] < nInk[1], `the bar (bottom ${d.placed[3]}) must clear the N cap (top ${nInk[1]})`);
  return { note: `bar y ${d.placed[1]}..${d.placed[3]}, cap top ${nInk[1]}: ${(nInk[1] - d.placed[3]).toFixed(0)} units of clearance` };
});

/* ------------------------------------------------------------------ *
 * 4. runtime behaviour in a sandboxed fake DOM
 * ------------------------------------------------------------------ */

section('Runtime, storage and live updates');

const runtimeCode = readFileSync(join(DIST, 'mkpong-logo.js'), 'utf8');

function makeSandbox() {
  const nodes = [];
  const sandbox = {
    console,
    __nodes: nodes,
    __events: [],
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init && init.detail; }
    },
    HTMLElement: class HTMLElement {
      constructor() {
        this._attrs = Object.create(null);
        this.isConnected = false;
        this.innerHTML = '';
      }
      hasAttribute(name) { return name in this._attrs; }
      getAttribute(name) { return name in this._attrs ? this._attrs[name] : null; }
      setAttribute(name, value) { this._attrs[name] = String(value); }
    },
    customElements: {
      _registry: Object.create(null),
      get(name) { return this._registry[name]; },
      define(name, ctor) { this._registry[name] = ctor; }
    },
    document: {
      documentElement: {
        _attrs: Object.create(null),
        setAttribute(k, v) { this._attrs[k] = String(v); },
        getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
      },
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent(event) { sandbox.__events.push(event); return true; },
      querySelectorAll() { return nodes; }
    }
  };
  sandbox.window = sandbox;
  sandbox.window.localStorage = (() => {
    const store = new Map();
    return {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
      removeItem: k => { store.delete(k); }
    };
  })();
  vm.createContext(sandbox);
  vm.runInContext(runtimeCode, sandbox);
  return sandbox;
}

const sandbox = makeSandbox();
const MkpongLogo = sandbox.MkpongLogo;

check('runtime exposes the documented API surface', () => {
  assert(MkpongLogo, 'globalThis.MkpongLogo was not set');
  ['renderLogo', 'setOrthography', 'getOrthography', 'init'].forEach(fn => {
    assert(typeof MkpongLogo[fn] === 'function', `missing ${fn}()`);
  });
  assert(MkpongLogo.LAYOUTS.join(',') === 'stacked,inline,mark,wordmark', 'LAYOUTS is wrong');
  assert(MkpongLogo.THEMES.join(',') === config.exports.themes.join(','), 'THEMES is wrong');
  assert(MkpongLogo.O_VARIANTS.length === 2 && MkpongLogo.N_VARIANTS.length === 3, 'variant lists are wrong');
  assert(sandbox.customElements.get('mkpong-logo'), '<mkpong-logo> was not registered');
});

check('every layout x theme x combination renders without throwing, and stacked axes agree', () => {
  let count = 0;
  for (const layout of MkpongLogo.LAYOUTS) {
    for (const theme of MkpongLogo.THEMES) {
      for (const o of MkpongLogo.O_VARIANTS) {
        for (const n of MkpongLogo.N_VARIANTS) {
          const svg = MkpongLogo.renderLogo({ o, n, layout, theme });
          assert(svg.startsWith('<svg '), `${layout}/${theme}/${o}/${n}: not an SVG string`);
          assert(svg.includes('viewBox="'), `${layout}/${theme}/${o}/${n}: no viewBox`);
          const units = unitsOf(svg);
          if (layout === 'stacked') {
            const mb = groupBBox(units.mark.markup);
            const wb = groupBBox(units.wordmark.markup);
            closeTo((mb[0] + mb[2]) / 2, (wb[0] + wb[2]) / 2, 0.5, `${layout}/${theme}/${o}/${n} axes`);
          }
          count++;
        }
      }
    }
  }
  return { note: `${count} runtime renders` };
});

check('CSS-variable themes emit --mkpong-* with fallbacks; static mode emits literals', () => {
  const withVars = MkpongLogo.renderLogo({ theme: 'color' });
  assert(/fill="var\(--mkpong-green, #1C7C3C\)"/.test(withVars), 'green is not a CSS variable with a fallback');
  assert(/fill="var\(--mkpong-orange, #E8792A\)"/.test(withVars), 'orange is not a CSS variable with a fallback');
  assert(/fill="var\(--mkpong-wordmark, #1C4D2E\)"/.test(withVars), 'wordmark is not a CSS variable with a fallback');
  assert(/stroke="var\(--mkpong-outline, #1C7C3C\)"/.test(withVars), 'outline is not a CSS variable with a fallback');
  const dark = MkpongLogo.renderLogo({ theme: 'dark' });
  assert(/stroke="var\(--mkpong-outline, #7FD39A\)"/.test(dark), 'dark theme outline does not have a light fallback');
  const mono = MkpongLogo.renderLogo({ theme: 'mono' });
  assert(/fill="var\(--mkpong-bg, #FFFFFF\)"/.test(mono), 'mono theme does not knock the front M out to the background');
  const literal = MkpongLogo.renderLogo({ useVars: false });
  assert(!/var\(--/.test(literal) && !/currentColor/.test(literal), 'useVars:false still emitted a variable');
});

check('element follows the site preference and is rendered inline (no <img>)', () => {
  const Element = sandbox.customElements.get('mkpong-logo');
  const node = new Element();
  node.setAttribute('layout', 'stacked');
  node.isConnected = true;
  sandbox.__nodes.push(node);
  node.connectedCallback();

  assert(node.innerHTML.startsWith('<svg '), 'element did not render inline SVG');
  assert(!/<img/i.test(node.innerHTML), 'element rendered an <img>');
  assert(node.innerHTML.includes('data-o="' + config.runtime.defaults.o + '"'), 'element ignored the default orthography');

  // pinned elements must not follow
  const pinned = new Element();
  pinned.setAttribute('o', 'dot');
  pinned.setAttribute('n', 'tilde');
  pinned.isConnected = true;
  pinned.connectedCallback();
  MkpongLogo.setOrthography({ o: 'o_open', n: 'n_bar' });
  assert(pinned.innerHTML.includes('data-o="o_dot"'), 'pinned element was overwritten by the preference');

  return { node, pinned };
});

check('setOrthography persists to localStorage, updates <html> and re-renders live', () => {
  sandbox.__events.length = 0;
  const applied = MkpongLogo.setOrthography({ o: 'o_open', n: 'n_bar' });

  assert(applied.o === 'o_open' && applied.n === 'n_bar', 'setOrthography did not normalise the input');
  const stored = JSON.parse(sandbox.window.localStorage.getItem(config.runtime.storageKey));
  assert(stored.o === 'o_open' && stored.n === 'n_bar', 'preference was not persisted');
  const root = sandbox.document.documentElement;
  assert(root.getAttribute('data-o') === 'o_open' && root.getAttribute('data-n') === 'n_bar', '<html> data attributes were not updated');
  assert(MkpongLogo.getOrthography().o === 'o_open', 'getOrthography does not report the stored preference');

  const events = sandbox.__events.filter(e => e.type === config.runtime.eventName);
  assert(events.length === 1, `expected one ${config.runtime.eventName} event, got ${events.length}`);
  assert(events[0].detail.o === 'o_open', 'event detail is wrong');

  const node = sandbox.__nodes[0];
  assert(node.innerHTML.includes('data-o="o_open"'), 'the element did not re-render on the event');

  // short aliases must be accepted too
  assert(MkpongLogo.setOrthography({ o: 'dot', n: 'hook' }).o === 'o_dot', 'short alias "dot" was not accepted');
});

check('changing orthography keeps the wordmark correctly spaced (no overlap, no gaps)', () => {
  const node = sandbox.__nodes[0];
  const widths = new Map();
  for (const o of MkpongLogo.O_VARIANTS) {
    for (const n of MkpongLogo.N_VARIANTS) {
      MkpongLogo.setOrthography({ o, n });
      const svg = node.innerHTML;
      const units = unitsOf(svg);
      const actual = [...units.wordmark.markup.matchAll(/data-letter="([A-Z])"[^>]* d="([^"]+)"/g)]
        .map(m => ({ slot: m[1], box: pathBBox(m[2]) }));
      assert(actual.length === letters.length, `${o}/${n}: ${actual.length} letters`);

      const expected = expectedLetters(o, n);
      const origin = actual[0].box[0] - expected[0].ink[0];
      actual.forEach((letter, i) => {
        closeTo(letter.box[0], expected[i].ink[0] + origin, 0.5, `${o}/${n} letter ${i} position`);
      });
      for (let i = 1; i < actual.length; i++) {
        const gap = actual[i].box[0] - actual[i - 1].box[2];
        assert(gap >= -0.05, `${o}/${n}: letters overlap at index ${i}`);
      }
      const markBox = groupBBox(units.mark.markup);
      const wordBox = groupBBox(units.wordmark.markup);
      closeTo((markBox[0] + markBox[2]) / 2, (wordBox[0] + wordBox[2]) / 2, 0.5, `${o}/${n}: axes drifted after the change`);
      widths.set(`${o}+${n}`, (wordBox[2] - wordBox[0]).toFixed(3));
    }
  }
  const distinct = new Set(widths.values());
  assert(distinct.size >= 3, `wordmark widths barely change with orthography: ${[...widths.values()].join(', ')}`);
  return { note: 'widths ' + [...widths.entries()].map(([k, v]) => `${k}=${v}`).join(' ') };
});

/* ------------------------------------------------------------------ *
 * 5. artifacts
 * ------------------------------------------------------------------ */

section('Artifacts');

check('static SVG/PNG matrix is complete', () => {
  let svgCount = 0;
  let pngCount = 0;
  for (const layout of config.exports.orthographyLayouts) {
    for (const oShort of oShorts) {
      for (const nShort of nShorts) {
        for (const theme of config.exports.themes) {
          const file = svgPath(layout, oShort, nShort, theme);
          assert(existsSync(file), `missing ${relative(ROOT, file)}`);
          svgCount++;
          if (config.exports.formats.includes('png')) {
            for (const size of config.exports.pngSizes) {
              const target = join(DIST, 'png', `${layout}-${oShort}-${nShort}-${theme}-${size}.png`);
              assert(existsSync(target), `missing ${relative(ROOT, target)}`);
              const dims = pngSize(readFileSync(target));
              assert(dims.width === size && dims.height > 0, `${relative(ROOT, target)} is ${dims.width}x${dims.height}`);
              pngCount++;
            }
          }
        }
      }
    }
  }
  for (const theme of config.exports.themes) {
    assert(existsSync(join(DIST, `svg/mark-${theme}.svg`)), `missing svg/mark-${theme}.svg`);
    svgCount++;
  }
  return { note: `${svgCount} SVGs, ${pngCount} PNGs` };
});

check('favicon is mark-only and orthography-independent', () => {
  const favicon = join(DIST, 'favicon.svg');
  assert(existsSync(favicon), 'missing favicon.svg');
  const source = readFileSync(favicon, 'utf8');
  assert(!/data-unit="wordmark"/.test(source), 'favicon contains the wordmark');
  assert(/data-unit="mark"/.test(source), 'favicon has no mark');
  for (const size of config.exports.favicon.sizes) {
    const file = join(DIST, `favicon-${size}.png`);
    assert(existsSync(file), `missing favicon-${size}.png`);
    const dims = pngSize(readFileSync(file));
    assert(dims.width === size && dims.height === size, `favicon-${size}.png is ${dims.width}x${dims.height}`);
  }
  const ico = readFileSync(join(DIST, 'favicon.ico'));
  const count = ico.readUInt16LE(4);
  assert(count === config.exports.favicon.sizes.length, `favicon.ico has ${count} images`);
  const sizes = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    sizes.push(ico.readUInt8(at) || 256);
    const offset = ico.readUInt32LE(at + 12);
    const length = ico.readUInt32LE(at + 8);
    const dims = pngSize(ico.slice(offset, offset + length));
    assert(dims.width === (ico.readUInt8(at) || 256), `favicon.ico entry ${i} is a ${dims.width}px PNG but claims ${ico.readUInt8(at)}`);
  }
  assert(sizes.join(',') === config.exports.favicon.sizes.join(','), `favicon.ico sizes are ${sizes.join(',')}`);
  return { note: `favicon.svg + favicon.ico (${sizes.join('/')}) + pngs` };
});

check('contact sheet and eyeball artifacts exist', () => {
  const sheet = join(DIST, 'checks/contact-sheet.png');
  assert(existsSync(sheet), 'missing checks/contact-sheet.png');
  const dims = pngSize(readFileSync(sheet));
  assert(dims.width > 500 && dims.height > 300, `contact sheet is only ${dims.width}x${dims.height}`);
  return { note: `contact-sheet.png ${dims.width}x${dims.height}, plus favicon 16/32/64 pngs` };
});

check('shipped CSS declares the documented custom properties', () => {
  const css = readFileSync(join(DIST, 'mkpong-logo.css'), 'utf8');
  for (const name of Object.values(config.runtime.cssVariables)) {
    assert(css.includes(name + ':'), `mkpong-logo.css is missing ${name}`);
  }
});

check('demo page wires up the controls and the head snippet', () => {
  const demo = readFileSync(join(ROOT, 'logo/demo.html'), 'utf8');
  assert(demo.includes('src="dist/mkpong-logo.js"'), 'demo does not load the built runtime');
  assert(demo.includes('orthography-head.html') || demo.includes('localStorage.getItem'), 'demo has no inline head snippet');
  for (const token of ['setOrthography', 'renderLogo', '<mkpong-logo', 'layout', 'theme', 'gap']) {
    assert(demo.includes(token), `demo is missing "${token}"`);
  }
});

/* ------------------------------------------------------------------ *
 * summary
 * ------------------------------------------------------------------ */

console.log('');
if (notes.length) {
  notes.forEach(note => console.log(`  note  ${note}`));
  console.log('');
}

if (failures.length) {
  console.log(`${failures.length} check(s) FAILED, ${passed} passed.`);
  process.exit(1);
}
console.log(`All ${passed} logo checks passed.`);
