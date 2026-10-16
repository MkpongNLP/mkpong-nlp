// One-time glyph extraction: Gelasio outlines -> logo/glyphs.json
//
//   npm run outline          (node scripts/outline-glyphs.mjs)
//
// Why this exists
// ---------------
// The original SVG used live <text> in Georgia, so the M cluster and the
// "MKPONG" wordmark rendered in whatever font the viewer happened to have and
// the O/N orthography variants could silently fall back to another font. The
// whole logo is now outlined paths, and the wordmark's spacing comes from real
// advance widths instead of the font engine.
//
// Output coordinate space: font units, y-down (SVG convention), origin at the
// left edge of the advance box sitting on the baseline. Glyphs are placed by
// translate(x, baseline) + scale(fontSize / unitsPerEm).
//
// Every glyph is emitted even if it is not currently used, so swapping a
// variant in logo.config.json never requires re-running the font tooling.
//
// If a variant's codepoint is missing from the font, it is composed from a base
// glyph plus marks (see logo.config.json -> composeFallback). A variant can also
// name a construction explicitly with `compose`, which is how n_bar works: its
// char is "N" + U+0304, and the font would resolve the leading N alone, so the
// composition is requested rather than inferred. Composed glyphs report the
// geometry they were derived from, and anything still awaiting a decision is
// marked needsReview: true so it cannot ship silently.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import opentype from 'opentype.js';

const ROOT = process.cwd();
const CONFIG = JSON.parse(readFileSync(join(ROOT, 'logo/logo.config.json'), 'utf8'));
const FONT_PATH = join(ROOT, CONFIG.font.file);
const OUT_PATH = join(ROOT, 'logo/glyphs.json');

const UPM = CONFIG.font.unitsPerEm;
const DECIMALS = 2;

const font = opentype.loadSync(FONT_PATH);
if (font.unitsPerEm !== UPM) {
  throw new Error(`config unitsPerEm ${UPM} != font unitsPerEm ${font.unitsPerEm}`);
}

/* ------------------------------------------------------------------ *
 * path helpers (font units, y-down)
 * ------------------------------------------------------------------ */

function glyphPath(char) {
  const glyph = font.charToGlyph(char);
  if (!glyph || glyph.index === 0) return null;
  return { glyph, path: glyph.getPath(0, 0, UPM) };
}

function bboxOf(pathData) {
  const b = pathData.getBoundingBox();
  return [b.x1, b.y1, b.x2, b.y2].map(n => round(n));
}

function round(n) {
  return Math.abs(n) < 1e-6 ? 0 : Number(n.toFixed(DECIMALS));
}

function dOf(path) {
  return path.toPathData(DECIMALS);
}

/**
 * opentype.js 1.3.x's Path constructor takes no arguments, so
 * `new Path(commands)` silently yields an empty path. Assign the commands.
 */
function pathFromCommands(commands) {
  const path = new opentype.Path();
  path.commands = commands;
  return path;
}

/** Scale every coordinate of an absolute path string. */
function scalePathData(path, sx, sy = sx) {
  const out = [];
  path.commands.forEach(cmd => {
    const c = { ...cmd };
    if ('x' in c && c.x != null) c.x = round(c.x * sx);
    if ('y' in c && c.y != null) c.y = round(c.y * sy);
    if ('x1' in c && c.x1 != null) c.x1 = round(c.x1 * sx);
    if ('y1' in c && c.y1 != null) c.y1 = round(c.y1 * sy);
    if ('x2' in c && c.x2 != null) c.x2 = round(c.x2 * sx);
    if ('y2' in c && c.y2 != null) c.y2 = round(c.y2 * sy);
    out.push(c);
  });
  return out;
}

function mirrorPathData(path, advance) {
  const mirrored = path.commands.map(cmd => {
    const c = { ...cmd };
    if ('x' in c && c.x != null) c.x = round(advance - c.x);
    if ('x1' in c && c.x1 != null) c.x1 = round(advance - c.x1);
    if ('x2' in c && c.x2 != null) c.x2 = round(advance - c.x2);
    return c;
  });
  // Command order stays valid: only x coordinates changed.
  return mirrored;
}

function translatePathData(path, dx, dy) {
  return path.commands.map(cmd => {
    const c = { ...cmd };
    for (const k of ['x', 'x1', 'x2']) if (c[k] != null) c[k] = round(c[k] + dx);
    for (const k of ['y', 'y1', 'y2']) if (c[k] != null) c[k] = round(c[k] + dy);
    return c;
  });
}

function codepointToChar(cp) {
  return String.fromCodePoint(parseInt(String(cp).replace(/^U\+/i, ''), 16));
}

/** The most frequent value, so one odd glyph does not move a whole band. */
function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) { best = v; bestCount = n; }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * composition fallback (only used when a codepoint is absent)
 * ------------------------------------------------------------------ */

/**
 * Build marks as absolute path commands in font units (y-down).
 * Supported kinds: dot (circle), bar (rectangle), tilde (wave), hook (quarter arc).
 */
function markCommands(mark) {
  const { kind, x = 0, y = 0, r = 0, w = 0, h = 0, advance = 0 } = mark;
  switch (kind) {
    case 'dot': {
      const k = round(r * 0.5523);
      return [
        { type: 'M', x: round(x - r), y: round(y) },
        { type: 'C', x1: round(x - r), y1: round(y - k), x2: round(x - k), y2: round(y - r), x: round(x), y: round(y - r) },
        { type: 'C', x1: round(x + k), y1: round(y - r), x2: round(x + r), y2: round(y - k), x: round(x + r), y: round(y) },
        { type: 'C', x1: round(x + r), y1: round(y + k), x2: round(x + k), y2: round(y + r), x: round(x), y: round(y + r) },
        { type: 'C', x1: round(x - k), y1: round(y + r), x2: round(x - r), y2: round(y + k), x: round(x - r), y: round(y) },
        { type: 'Z' },
      ];
    }
    case 'bar':
      return [
        { type: 'M', x: round(x - w / 2), y: round(y - h / 2) },
        { type: 'L', x: round(x + w / 2), y: round(y - h / 2) },
        { type: 'L', x: round(x + w / 2), y: round(y + h / 2) },
        { type: 'L', x: round(x - w / 2), y: round(y + h / 2) },
        { type: 'Z' },
      ];
    case 'tilde': {
      const t = round(h / 2);
      const cx = round(x);
      return [
        { type: 'M', x: round(cx - w / 2), y: round(y + t) },
        { type: 'Q', x1: round(cx - w / 4), y1: round(y - t * 2), x: cx, y: round(y) },
        { type: 'Q', x1: round(cx + w / 4), y1: round(y + t * 2), x: round(cx + w / 2), y: round(y) },
      ];
    }
    case 'hook': {
      // Quarter arc open on the side given by `dir` (+1 = right/down hook).
      const dir = mark.dir === -1 ? -1 : 1;
      const hx = round(x);
      const bend = round(w / 2);
      return [
        { type: 'M', x: hx, y: round(y) },
        { type: 'Q', x1: hx, y1: round(y + h), x: round(hx + dir * bend), y: round(y + h) },
      ];
    }
    default:
      throw new Error(`unknown compose mark kind: ${kind}`);
  }
}

/**
 * A mark taken from another glyph in the font, so the shape and weight are the
 * designer's, not a drawn approximation. Placement can be derived rather than
 * hardcoded:
 *   placement.x            "centreOverBaseInk" centres it over the base's ink
 *   placement.bandTopFrom  [codepoints] puts the mark's top edge on the band
 *                          those glyphs use for the same mark (a macron sits at
 *                          one height in every precomposed uppercase macron, so
 *                          that height is the font's own answer for the band)
 */
function glyphMarkCommands(mark, baseBox) {
  const src = glyphPath(codepointToChar(mark.char));
  if (!src) throw new Error(`compose: mark glyph ${mark.char} is missing from ${CONFIG.font.family}`);
  const srcBox = bboxOf(src.path);
  const place = mark.placement || {};
  let dx = Number.isFinite(place.dx) ? place.dx : 0;
  let dy = Number.isFinite(place.dy) ? place.dy : 0;
  const derivation = { mark: mark.char, glyph: src.glyph.name, outline: srcBox };

  if (place.x === 'centreOverBaseInk') {
    dx = (baseBox[0] + baseBox[2]) / 2 - (srcBox[0] + srcBox[2]) / 2;
    derivation.x = 'centred over the base ink';
  }

  if (place.bandTopFrom) {
    const band = place.bandTopFrom.map(cp => {
      const g = glyphPath(codepointToChar(cp));
      if (!g) throw new Error(`compose: band glyph ${cp} is missing from ${CONFIG.font.family}`);
      return { cp, top: bboxOf(g.path)[1] };
    });
    const targetTop = round(mostCommon(band.map(b => b.top)));
    dy = targetTop - srcBox[1];
    const tops = [...new Set(band.map(b => b.top))];
    derivation.bandTop = targetTop;
    derivation.bandFrom = band;
    derivation.bandSpread = tops.length === 1 ? 0 : round(Math.max(...tops) - Math.min(...tops));
  }

  derivation.dx = round(dx);
  derivation.dy = round(dy);
  derivation.placed = [
    round(srcBox[0] + dx), round(srcBox[1] + dy),
    round(srcBox[2] + dx), round(srcBox[3] + dy),
  ];

  return { commands: translatePathData(src.path, dx, dy), derivation, stroked: false };
}

function compose(baseEntry, spec) {
  if (!baseEntry) throw new Error(`compose: missing base glyph for ${JSON.stringify(spec)}`);
  const baseBox = bboxOf(baseEntry.path);
  let commands = spec.mirror
    ? mirrorPathData(baseEntry.path, baseEntry.advance)
    : baseEntry.path.commands.map(c => ({ ...c }));

  const strokes = [];
  const derivations = [];
  for (const mark of spec.marks || []) {
    if (mark.kind === 'glyph') {
      const built = glyphMarkCommands(mark, baseBox);
      commands = commands.concat(built.commands);
      derivations.push(built.derivation);
    } else {
      commands = commands.concat(markCommands({ advance: baseEntry.advance, ...mark }));
      if (mark.kind === 'tilde' || mark.kind === 'hook') strokes.push(mark);
    }
  }

  return {
    commands,
    advance: baseEntry.advance,
    stroked: strokes.length > 0,
    marks: spec.marks || [],
    derivations,
  };
}

function describeComposition(spec) {
  const parts = [spec.mirror ? `mirror(${spec.base})` : spec.base];
  for (const mark of spec.marks || []) {
    parts.push(mark.kind === 'glyph' ? mark.char : `${mark.kind} (drawn)`);
  }
  return parts.join(' + ');
}

/** The base of a construction: a plain letter, or another variant's glyph. */
function baseGlyph(baseKey) {
  let char = baseKey;
  if (!glyphs[baseKey]) {
    const m = /^(o|n)_(.+)$/.exec(baseKey);
    const def = m && CONFIG.orthography[m[1]] && CONFIG.orthography[m[1]][baseKey];
    if (!def) throw new Error(`compose: unknown base "${baseKey}"`);
    char = def.char;
  }
  const found = glyphPath(char);
  if (!found) throw new Error(`compose: base glyph "${char}" is missing from ${CONFIG.font.family}`);
  return { char, path: found.path, advance: found.glyph.advanceWidth };
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

function makeEntry(id, char, extra = {}) {
  const found = glyphPath(char);
  if (!found) return { id, char, missing: true, ...extra };
  const { glyph, path } = found;
  const entry = {
    id,
    char,
    codepoint: codepointOf(char),
    source: 'font',
    glyphName: glyph.name,
    advance: round(glyph.advanceWidth),
    bbox: bboxOf(path),
    d: dOf(path),
    ...extra,
  };
  return entry;
}

function codepointOf(char) {
  const cps = [...char].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
  return cps.join(' ');
}

const glyphs = {};
const report = [];

// Base letters the wordmark is built from (O and N are placeholders the
// variants replace).
for (const char of ['M', 'K', 'P', 'O', 'N', 'G', 'C']) {
  const entry = makeEntry(char, char);
  if (entry.missing) {
    throw new Error(`Gelasio is missing base glyph "${char}" — cannot build the wordmark`);
  }
  glyphs[char] = entry;
}

// Orthography variants. Slot letters (O/N) are only used as compose bases.
for (const [group, variants] of Object.entries(CONFIG.orthography)) {
  if (group.startsWith('$')) continue;
  for (const [id, def] of Object.entries(variants)) {
    if (id.startsWith('$')) continue;
    const direct = makeEntry(id, def.char, {
      slot: def.slot,
      label: def.label,
      short: def.short,
      configuredSource: def.source,
      needsReview: def.needsReview === true,
      note: def.note,
    });

    // Composition is requested explicitly with `compose`, or inferred when the
    // codepoint has no glyph at all in the font.
    const specKey = def.compose ? def.compose : (direct.missing ? def.id : null);

    let entry = direct;
    let composed = false;
    if (specKey) {
      const spec = CONFIG.composeFallback[specKey];
      if (!spec) {
        throw new Error(
          `${id}: logo.config.json has no composeFallback named "${specKey}". ` +
          (direct.missing
            ? `Gelasio has no glyph for ${def.char} (${codepointOf(def.char)}).`
            : `The glyph itself exists, so this construction was asked for explicitly.`)
        );
      }
      const base = baseGlyph(spec.base);
      const built = compose(base, spec);
      const path = pathFromCommands(built.commands);
      entry = {
        id,
        char: def.char,
        codepoint: codepointOf(def.char),
        source: 'composed',
        construction: specKey,
        composedFrom: describeComposition(spec),
        derivedGeometry: built.derivations,
        advance: round(built.advance),
        bbox: bboxOf(path),
        d: dOf(path),
        stroke: built.stroked,
        strokeWidth: null,
        slot: def.slot,
        label: def.label,
        short: def.short,
        needsReview: def.needsReview === true,
        note: def.note,
      };
      composed = true;
    }

    glyphs[id] = entry;
    report.push({
      id,
      label: def.label,
      slot: def.slot,
      char: def.char,
      codepoint: codepointOf(def.char),
      inFont: !entry.missing && !composed,
      composed,
      construction: specKey,
      composedFrom: entry.composedFrom || null,
      derivedGeometry: entry.derivedGeometry || null,
      needsReview: entry.needsReview === true,
      advance: entry.advance,
    });
  }
}

const out = {
  meta: {
    generatedBy: 'scripts/outline-glyphs.mjs',
    doNotEdit: 'Generated file. Re-run: npm run outline',
    fontFamily: CONFIG.font.family,
    fontFile: CONFIG.font.file,
    fontVersion: font.names.version && font.names.version.en,
    unitsPerEm: UPM,
    coordinateSpace: 'font units, y-down (SVG), origin at baseline-left of the advance box',
    substituteRule: 'Runtime fill-rule is nonzero; composed glyphs concatenate subpaths.',
  },
  glyphs: Object.fromEntries(Object.entries(glyphs).sort(([a], [b]) => a.localeCompare(b))),
  report,
};

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');

/* console summary ------------------------------------------------- */

console.log(`Gelasio ${out.meta.fontVersion}  upm=${UPM}  ->  logo/glyphs.json\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('variant', 10)} ${pad('slot', 5)} ${pad('char', 5)} ${pad('codepoint', 10)} ${pad('source', 9)} ${pad('advance', 8)} review`);
for (const r of report) {
  console.log(
    `${pad(r.id, 10)} ${pad(r.slot, 5)} ${pad(r.char, 5)} ${pad(r.codepoint, 10)} ` +
    `${pad(r.inFont ? 'font' : (r.composed ? 'composed' : 'MISSING'), 9)} ${pad(r.advance, 8)} ` +
    `${r.needsReview ? 'YES' : '-'}`
  );
}
console.log(`\n${report.filter(r => r.inFont).length}/${report.length} variants resolved directly from the font.`);

const composed = report.filter(r => r.composed);
if (composed.length) {
  console.log('\nComposed glyphs (geometry measured from the font, not invented):');
  for (const r of composed) {
    console.log(`  ${r.id}: ${r.composedFrom}   [${r.construction}]`);
    for (const d of r.derivedGeometry || []) {
      const band = d.bandTop == null
        ? ''
        : `  band top ${d.bandTop} from ${d.bandFrom.length} glyphs` +
          (d.bandSpread ? ` (SPREAD ${d.bandSpread} - check)` : ' (all agree)');
      console.log(`    ${d.glyph} ${d.mark} ${JSON.stringify(d.outline)} -> placed ${JSON.stringify(d.placed)}  dx=${d.dx} dy=${d.dy}${band}`);
    }
  }
}

const review = report.filter(r => r.needsReview);
console.log(review.length
  ? `\nNeeds your confirmation (see logo/TODO.md): ${review.map(r => `${r.id} (${r.char} ${r.codepoint})`).join(', ')}`
  : '\nNo variant is awaiting confirmation.');
