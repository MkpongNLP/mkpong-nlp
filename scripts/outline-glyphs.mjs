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
// glyph plus drawn marks (see logo.config.json -> composeFallback) and marked
// needsReview: true so it cannot ship silently.

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

function compose(baseEntry, spec) {
  if (!baseEntry) throw new Error(`compose: missing base glyph for ${JSON.stringify(spec)}`);
  let commands = spec.mirror
    ? mirrorPathData(baseEntry.path, baseEntry.advance)
    : baseEntry.path.commands.map(c => ({ ...c }));

  for (const mark of spec.marks || []) {
    commands = commands.concat(markCommands({ advance: baseEntry.advance, ...mark }));
  }

  const strokes = (spec.marks || []).filter(m => m.kind === 'tilde' || m.kind === 'hook');
  return { commands, advance: baseEntry.advance, stroked: strokes.length > 0, marks: spec.marks || [] };
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
    let entry = makeEntry(id, def.char, {
      slot: def.slot,
      label: def.label,
      short: def.short,
      configuredSource: def.source,
      needsReview: def.needsReview === true,
      note: def.note,
    });

    let composed = false;
    if (entry.missing) {
      const spec = CONFIG.composeFallback[def.compose];
      if (!spec) {
        throw new Error(
          `Gelasio has no glyph for ${id} (${def.char} ${codepointOf(def.char)}) and ` +
          `logo.config.json has no composeFallback for it. Add a construction and mark it needsReview.`
        );
      }
      const base = spec.base.startsWith('o_') || spec.base.startsWith('n_')
        ? glyphs[spec.base] || glyphs[CONFIG.orthography[spec.base.split('_')[0]][spec.base].char]
        : glyphs[spec.base];
      const built = compose(base, spec);
      const path = new opentype.Path(built.commands);
      entry = {
        id,
        char: def.char,
        codepoint: codepointOf(def.char),
        source: 'composed',
        composedFrom: `${spec.mirror ? 'mirror(' : ''}${spec.base}${spec.mirror ? ')' : ''}`,
        advance: round(built.advance),
        bbox: bboxOf(path),
        d: dOf(path),
        stroke: built.stroked,
        slot: def.slot,
        label: def.label,
        short: def.short,
        needsReview: true,
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
const review = report.filter(r => r.needsReview);
if (review.length) {
  console.log(`Needs your confirmation (see logo/TODO.md): ${review.map(r => `${r.id} (${r.char} ${r.codepoint})`).join(', ')}`);
}
