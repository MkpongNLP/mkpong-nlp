# Mkpong logo system

Code-driven, orthography-aware logo for MkpongNLP. Framework-free: the shipped
runtime is **one classic script**, no bundler, and it works from `file://` as
well as from any static host.

* Only the `O` and `N` of the `MKPONG` wordmark change with the reader's
  orthography preference (2 x 3 = 6 combinations). The three overlapping `M`s
  never change.
* Everything is **outlined paths**, generated from Gelasio (OFL). No live
  `<text>`, so a variant can never fall back to a different font.
* The mark and the wordmark are separate units built from the same glyph data.
  Both are centred on their own **true ink bounding box**, so in `stacked` the
  two centre axes are identical (verified to 0.0000 px), unlike CSS
  `letter-spacing`, which leaves a trailing offset.
* Colours come from CSS custom properties (`--mkpong-green`, `--mkpong-orange`,
  `--mkpong-white`, `--mkpong-wordmark`, `--mkpong-outline`, `--mkpong-bg`) with
  fallbacks baked into the runtime.

Read `logo/ORTHOGRAPHY.md` for the variant definitions (and what still needs your
confirmation) and `logo/TODO.md` for open questions.

---

## Layout of the repo

```
logo/
  logo.config.json     single source of truth: palette, themes, geometry, variants, export matrix
  glyphs.json          GENERATED glyph outlines + advance widths (npm run outline)
  ORTHOGRAPHY.md       which codepoint/construction each variant uses, and the questions
  TODO.md             open questions (nothing invented)
  demo.html            control panel: O/N, layout, gap, theme, light/dark
  src/runtime.js       runtime source (the build wraps it with embedded data)
  fonts/               Gelasio variable TTF + OFL.txt
  archive/             the two original hand-made SVGs, C2PA manifest stripped
  dist/                GENERATED deliverables (see below)
scripts/
  outline-glyphs.mjs   Gelasio outlines -> logo/glyphs.json
  build-logo.mjs       -> logo/dist (runtime, css, head snippet, svg/, png/, favicon, contact sheet)
  check-logo.mjs       npm run check:logo acceptance checks
  strip-c2pa.mjs       removes embedded C2PA manifests from SVGs
  lib/path-bbox.mjs    independent path measurement used by the checks
```

`logo/dist/`:

```
mkpong-logo.js         the runtime consumers load (glyph data embedded)
mkpong-logo.css        the --mkpong-* custom properties
orthography-head.html  inline <head> snippet (no flash of the default)
svg/                   static, literal-colour exports
png/                   512 px and 1024 px of the same
favicon.svg .ico       mark-only, orthography-independent
favicon-16/32/64.png
checks/contact-sheet.png   all 6 wordmarks + the favicon sizes, for eyeballing
```

## Commands

```powershell
npm install          # opentype.js + @resvg/resvg-js
npm run outline      # Gelasio -> logo/glyphs.json (only when the font or variants change)
npm run build:logo   # -> logo/dist
npm run check:logo   # builds, then runs every acceptance check
```

`check:logo` is the gate: SVG hygiene (no `<text>`/`<metadata>`/`<script>`/font
references), centre axes within 0.5 px, paint order, gap correctness, wordmark
spacing recomputed from the glyph data, all 6 combos distinct, favicon sizes,
and the orthography wiring exercised in a sandboxed fake DOM.

## Using it

```html
<script src="/logo/dist/mkpong-logo.js"></script>

<mkpong-logo layout="stacked"></mkpong-logo>          <!-- follows the preference -->
<mkpong-logo layout="inline" theme="dark"></mkpong-logo>
<mkpong-logo layout="mark" theme="mono"></mkpong-logo>
<mkpong-logo layout="wordmark" o="open" n="bar" gap="16"></mkpong-logo>  <!-- pinned -->
```

Attributes: `o`, `n` (`dot open hook tilde bar`), `layout`
(`stacked inline mark wordmark`), `gap`, `theme` (`color mono dark`), `size`,
`title`, `aria-label`. Setting `o`/`n` on the element **pins** it; leaving them
off makes it follow the site preference forever.

```js
MkpongLogo.renderLogo({ o: 'dot', n: 'tilde', layout: 'stacked', theme: 'dark', gap: 24 }); // -> SVG string
MkpongLogo.setOrthography({ o: 'open', n: 'bar' });  // persists + updates <html> + re-renders every element
MkpongLogo.getOrthography();                          // { o, n } actually in force
```

Static exports (for OG images, README, email — anywhere JS does not run):

```
logo/dist/svg/stacked-dot-hook-color.svg
logo/dist/svg/inline-open-bar-dark.svg
logo/dist/svg/wordmark-dot-tilde-mono.svg
logo/dist/svg/mark-color.svg
logo/dist/png/stacked-dot-hook-color-1024.png
```

They use literal colours on purpose: CSS custom properties and `currentColor` do
not resolve in resvg, email clients or most OG scrapers.

## Adding or changing a variant

1. Edit `logo/logo.config.json` -> `orthography` (and `palette`, `themes`,
   `wordmark.kerning` as needed).
2. `npm run outline` — regenerates `logo/glyphs.json`. If the codepoint is
   missing from Gelasio, add a `composeFallback` entry; the glyph is then
   composed and forced to `needsReview: true`.
3. `npm run check:logo`.
4. Update `logo/ORTHOGRAPHY.md` and, if it is a new question, `logo/TODO.md`.

To export less (fewer themes, layouts, sizes, or drop PNGs entirely), trim
`exports` in `logo/logo.config.json` — the build script needs no edits.

## Integration

`maintenance/maintenance.html` renders `<mkpong-logo class="mkpopnlp-logo" layout="stacked">`
in place of the old inline gradient SVG, with the inline head snippet above the
stylesheets. Styling was **appended** to `maintenance/mkpongnlp-logo.css` (the
legacy rules are untouched). `index.html` is unchanged.

## Licensing

Gelasio is SIL OFL 1.1 — `logo/fonts/OFL.txt`, kept next to the font. Glyph
outlines (derivative data) live in `logo/glyphs.json`.
