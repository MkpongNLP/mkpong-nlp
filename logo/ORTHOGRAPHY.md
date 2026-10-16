# Mkpong logo orthography

The Mkpong logo is orthography-aware: readers pick a preference and the whole
lockup follows. **Only the `O` and the `N` of the `MKPON` wordmark change.**
The three overlapping `M`s are fixed.

* Slots in the wordmark: `M K P [O] [N]`
* O variants: `o_dot`, `o_open`
* N variants: `n_hook`, `n_tilde`, `n_bar`
* Combinations: 2 x 3 = 6

The sequence is the brand name **Mkpọŋ** — five letters, so the variant `N`
closes the wordmark. There is no trailing `G` (see `logo/TODO.md` §7).

Everything is drawn from outlined paths, so a variant can never silently fall
back to another font. Glyph outlines and advance widths come from **Gelasio**
(SIL Open Font License 1.1, metric-compatible with Georgia — the font the
original hand-made SVG asked for). Font files: `logo/fonts/`.

Source of truth: `logo/logo.config.json` -> `orthography`. Generated geometry:
`logo/glyphs.json` (`npm run outline`).

---

## What each variant resolves to

Coordinates are font units at `unitsPerEm = 2048`, y-down, origin on the baseline
at the left edge of the advance box. `ink` is the true bounding box of the
outline, so negative `y` is above the baseline.

| variant  | slot | char | codepoint | Unicode name                        | source | advance | ink bbox (x0, y0, x1, y1) | review |
|----------|------|------|-----------|-------------------------------------|--------|---------|---------------------------|--------|
| `o_dot`  | O    | Ọ    | U+1ECC    | LATIN CAPITAL LETTER O WITH DOT BELOW | font | 1524    | 94, −1449, 1430, 414      | —      |
| `o_open` | O    | Ɔ    | U+0186    | LATIN CAPITAL LETTER OPEN O         | font   | 1315    | 103.8, −1449, 1250, 30    | —      |
| `n_hook` | N    | Ŋ    | U+014A    | LATIN CAPITAL LETTER ENG            | font   | 1511    | 96, −1439, 1331, 449      | —      |
| `n_tilde`| N    | Ñ    | U+00D1    | LATIN CAPITAL LETTER N WITH TILDE   | font   | 1571    | 53, −1819, 1521, 30       | —      |
| `n_bar`  | N    | N̄    | U+004E U+0304 | `N` + COMBINING MACRON (no precomposed character exists) | composed | 1571 | 53, −1748, 1521, 30 | — |

`n_bar` is the only composed variant: its ink box is the union of the `N` and
the bar the construction places over it. The bar itself sits at
x 493…1081, y −1748…−1607 — 188 units clear of the `N`'s cap top.

For reference, the base letters used by the unswitched slots:

| glyph | advance | ink bbox                  |
|-------|---------|---------------------------|
| `M`   | 1899    | 81, −1419, 1819, 0        |
| `K`   | 1422    | 96, −1419, 1423, 0        |
| `P`   | 1249    | 96, −1431, 1180, 0        |
| `O`   | 1524    | 94, −1449, 1430, 29       |
| `N`   | 1571    | 53, −1419, 1521, 30       |

`G` (1485, 84, −1449, 1440, 30) is still outlined and emitted by the tooling,
but the wordmark no longer uses it.

Coverage result: **four of the five variants exist as precomposed glyphs in
Gelasio.** The fifth, `n_bar`, has no precomposed character in any font and is
composed. That is a property of this font and of Unicode, not a guarantee — see
"Composition fallback" below.

---

## The five definitions (confirmed)

All five were reviewed and confirmed; none is now flagged `needsReview`.

1. **`o_dot` = U+1ECC (Ọ, O with DOT BELOW).** Confirmed — dot below, the
   middle-dot shape. Ink to y = +414.
2. **`o_open` = U+0186 (Ɔ, OPEN O).** Confirmed as the real `Ɔ` letter (advance
   1315, wider and rounder than a mirrored `C` would be). The mirrored-`C`
   construction in `composeFallback.mirrorOpenO` stays available but unused.
3. **`n_hook` = U+014A (Ŋ, ENG).** Confirmed — *right* hook, *descending* below
   the baseline (ink to y = +449). U+019D (Ɲ, left hook, no descender) was the
   alternative and was rejected.
4. **`n_tilde` = U+00D1 (Ñ, N WITH TILDE).** Confirmed — tilde *above* the cap
   height (ink to y = −1819).
5. **`n_bar` = `N` + a bar ABOVE.** Confirmed — the bar is *above* the letter.
   The old default (U+1E48, MACRON **BELOW**) was wrong; since no precomposed
   character has the bar above, this variant is composed. See below.

---

## Composition fallback

`n_bar` is composed, so this is a live code path rather than a spare tyre.
`scripts/outline-glyphs.mjs` composes a glyph when a variant names a
construction (`orthography.*.compose`) or when its codepoint has no glyph in the
font at all, using `logo.config.json` → `composeFallback`:

* `mirror` — mirror a base glyph horizontally inside its advance box (e.g. `C` → `Ɔ`).
* `marks` — shapes placed on top of a base glyph. Two families:
  * **drawn** primitives: `dot` (circle), `bar` (rectangle), `tilde` (quadratic
    wave), `hook` (quarter arc, `dir` chooses the side).
  * **`glyph`** — take the outline of another glyph in the font, so the shape and
    weight are the type designer's rather than an approximation. Its placement
    can be *measured* instead of hardcoded: `placement.x: "centreOverBaseInk"`
    and `placement.bandTopFrom: [codepoints]` put the mark on the same vertical
    band those glyphs use for the same mark.

A variant can also name its construction explicitly with `compose`, which is how
`n_bar` works: its `char` is `"N" + U+0304`, and the font would otherwise resolve
the leading `N` on its own and report the variant as a plain `N`.

### How `n_bar` is built (`composeFallback.barAboveN`)

| part of the bar | where it comes from |
|---|---|
| shape and weight | Gelasio's own combining macron, U+0304 (588 × 141 units) |
| vertical band | the top edge every precomposed uppercase macron in Gelasio shares: Ā, Ē, Ī, Ō, Ū and Ḡ all put it at y = **−1748** |
| horizontal place | centred over the `N`'s ink |

So the bar lands at x 493…1081, y −1748…−1607: 588 units wide over a 1468-unit
letter (a macron is narrower than its base), 188 units clear of the cap. The
macron outline is only translated, never scaled, and `npm run check:logo` asserts
that, the band, the advance width and the clearance.

Nothing was invented: the shape, the weight and the vertical band all come from
Gelasio. `logo/glyphs.json` records the derivation under `derivedGeometry` for
each composed variant, so the geometry is auditable and follows the font if the
font is ever swapped. To change how the bar looks, edit
`composeFallback.barAboveN`; composition geometry is a **design** decision, not a
linguistic one, which is why it lives in the config rather than in code.

A composed glyph is emitted with `source: "composed"` and, if it is not yet
confirmed, `needsReview: true` (the flag comes from the config, so a confirmed
construction can ship unflagged — as `n_bar` now does). `npm run check:logo`
verifies that a variant naming a construction was really composed through it, and
the build refuses a missing glyph that has no construction at all.

---

## Where the preference is stored and applied

* Stored as `{ "o": "...", "n": "..." }` in `localStorage` under `mkpong.orthography`.
* Mirrored onto `<html data-o data-n>` by the inline `<head>` snippet
  (`logo/dist/orthography-head.html`) **before first paint**, so there is no
  flash of the default.
* `MkpongLogo.setOrthography({ o, n })` persists, updates `<html>`, dispatches
  `mkpong:orthography`, and re-renders every `<mkpong-logo>` that is not pinned
  with an explicit `o=`/`n=` attribute.
* Accepted spellings: `o_dot`/`dot`, `o_open`/`open`, `n_hook`/`hook`,
  `n_tilde`/`tilde`, `n_bar`/`bar`.

```html
<!-- in <head>, before stylesheets -->
<script>
  (function () {
    try {
      var saved = JSON.parse(localStorage.getItem('mkpong.orthography') || 'null');
      var root = document.documentElement;
      if (saved && saved.o) root.setAttribute('data-o', saved.o);
      if (saved && saved.n) root.setAttribute('data-n', saved.n);
    } catch (e) {}
  })();
</script>
```

```html
<script src="/logo/dist/mkpong-logo.js"></script>
<mkpong-logo layout="stacked"></mkpong-logo>
```
