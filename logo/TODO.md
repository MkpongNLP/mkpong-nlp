# Mkpong logo — open questions and decisions

This file is the log of the things I deliberately did **not** invent, plus what
came back when they were reviewed. Each open item has a clear question and the
current placeholder behaviour; each decided item records what was chosen and
where it now lives. Nothing here is silently wrong: every placeholder is marked
in the code and in `logo/ORTHOGRAPHY.md`.

**Open: 4** (§5, §7, §8, §9 — all deferred rather than blocking).
**Decided: 6** (§1, §2, §3, §4, §6, §10).

`npm run check:logo` enforces the structure that keeps these honest: a variant's
`needsReview` flag must match `logo/glyphs.json`, a variant that names a
construction must really be composed through it, and the wordmark sequence must
match the config. So a new undecided variant cannot slip in unflagged.

---

## Open

### 5. Kerning (deferred — not needed yet)

`logo.config.json` → `wordmark.kerning` is **empty**, so letters sit on raw
advance widths plus the 6px letter-spacing carried over from the original SVG.

Gelasio ships kerning in a GPOS table only and has no legacy `kern` table, and
opentype.js does not read GPOS. So the choices are: extract GPOS pair kerning at
outline time, or hand-tune a table.

**Question (when it matters):** which way? The pairs that would actually matter
are `M-K`, `K-P`, `P-O`, `O-N` (and the variant spellings of the last two). I
would not guess values.

### 7. Accessible name (queued)

`<mkpong-logo>` exposes the config's `wordmark.label` as the accessible name
(`"MKPON"`), overridable per element; the maintenance page passes `MkpọNLP`. It
does **not** change with the orthography preference.

**Question:** should the accessible name follow the preference — i.e. be spelled
"Mkpọŋ / Mkpọñ / Mkpọṉ" for screen readers — and if so, which slots are
pronounced?

Resolved along the way: the wordmark no longer ends in a `G` (see §2/§3 notes
below and `logo/ORTHOGRAPHY.md`), so the logo now reads **Mkpọŋ**, the brand,
rather than the site name's full "MkpọŋNLP". The two still differ by the `NLP`
suffix, which is intentional: the logo is the brand mark, the title is the site.

### 8. Letter-spacing value (deferred)

`wordmark.letterSpacing` is `6` (from the original SVG's `letter-spacing="6"` at
font-size 72), applied *between* letters only. With real outlines and no kerning
this is currently the only thing setting optical rhythm.

**Question (when it matters):** keep `6`, drop it to `0` and rely on kerning
(§5), or use a different value?

### 9. Mono theme and `--mkpong-bg` (kept)

In the `mono` theme the front M is knocked out to `var(--mkpong-bg, #FFFFFF)`. On
a dark page the site must set `--mkpong-bg` (or use the `dark` theme), otherwise
the knockout reads as a white shape on a dark mark.

Review note: "doesn't hurt" — kept as is. The theme and the escape hatch stay.

---

## Decided

### 1. `n_hook` — right hook, descending ✅

Answer: *"Right Hook descending"*.

Resolves to **U+014A LATIN CAPITAL LETTER ENG (Ŋ)**: hook on the right,
descending below the baseline (ink to y = +449 at upm 2048). This was already the
default, so the change was to stop flagging it: `needsReview` is now `false`, the
label reads "n with hook (right hook, descending)", and the note records that
U+019D Ɲ (left hook) was considered and rejected.

### 2. `n_bar` — a bar ABOVE the letter ✅

Answer: *"The bar is ABOVE"*.

The old default was **wrong**: `U+1E48` is N WITH MACRON **BELOW**. Gelasio has
no precomposed N-with-macron-above (no Unicode character does, in fact), so the
variant is now composed: `orthography.n.n_bar.source` is `composed` and it names
the construction `composeFallback.barAboveN`.

The construction is measured from the font, not invented:

| part of the bar | where it comes from |
|---|---|
| shape / weight | Gelasio's own combining macron, U+0304 (588 × 141 units) |
| vertical band | the top edge every precomposed uppercase macron in Gelasio shares — Ā, Ē, Ī, Ō, Ū and Ḡ all put the macron at y = **−1748** |
| horizontal place | centred over the N's ink |

Result: the bar sits at y −1748…−1607, x 493…1081 — 188 units clear of the N's
cap top, and 588 units wide over a 1468-unit letter. It is only ever *translated*
(never scaled), and `npm run check:logo` asserts that plus the band, the advance
width and the clearance.

`logo/glyphs.json` records the derivation it used (`derivedGeometry`), so if the
font is ever swapped the geometry follows, and if the bar should look different
(wider, thicker, higher, or a different mark entirely) this is the one place to
change: `composeFallback.barAboveN` in `logo.config.json`.

### 3. `o_dot` / `o_open` — confirmed ✅

Answer: *"3/4 are fine"*.

`o_dot` = **U+1ECC Ọ** (dot below, advance 1524) and `o_open` = **U+0186 Ɔ**
(OPEN O, advance 1315) stay as they were. The mirrored-`C` alternative in
`composeFallback.mirrorOpenO` remains available but unused.

### 4. Palette and dark theme — confirmed ✅

Answer: *"3/4 are fine"* — the provisional palette stands (values in
`logo/ORTHOGRAPHY.md` and `logo.config.json` → `palette`), including the
`dark` theme I invented to keep the front M's outline legible on dark pages. The
old gradient colours (`#66BB6A` / `#81C784` / `#FF7043`) are not used.

### 6. Favicon at small sizes — a single green M ✅

Answer: *"a single green M is going to be the move, because it is meaningless at
16px"*.

The favicon is no longer the three-M cluster: `exports.favicon.markStyle` is
`"single"`, painted in the `green` role, unstroked. At 16px the overlapping Ms
merge into one dark blob and the separating stroke becomes a pale fringe, so the
overlap carried no meaning there. The square is tighter too (−41% width), so the
`M` fills the tab icon. The full lockup keeps the triple-M mark everywhere else.

### 10. Build artifacts in version control — split the difference ✅

Answer: *"it'd be best for this to need a build run step and not clog up the
github repo"* — with the important caveat, raised and checked, that the site
fetches two generated files at runtime and the repo has no deploy config, so a
fully ignored `dist/` would 404 the logo in production unless a build step were
wired up.

So `logo/dist/` is split: the files the deployed page actually needs are
committed — `mkpong-logo.js` (45 KB), `mkpong-logo.css`, `orthography-head.html`
and the favicons, ~58 KB — while the heavy generated output that nothing on the
site requests is ignored: `svg/` (738 KB), `png/` (3.35 MB) and `checks/`
(64 KB). That removes 98.6% of the generated bytes without making the site depend
on a build step.

`npm run build:logo` regenerates everything; `npm run check:logo` builds first,
then runs the checks.

---

## Standing notes

- Only the `O` and the `N` of the `MKPON` wordmark vary. The `M` cluster is
  orthography-independent, and so is the favicon.
- Changing any variant is a one-line edit in `logo/logo.config.json` followed by
  `npm run build:logo` (or just `npm run outline` if only glyph data changed).
  Exports, the demo, the favicon and the checks all follow.
- Adding a variant that has no precomposed glyph means adding a construction to
  `composeFallback` and leaving `needsReview: true` until it is confirmed; the
  build refuses to ship a missing glyph that has no construction.
