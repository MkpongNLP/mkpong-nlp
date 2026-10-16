# Mkpong logo orthography

The Mkpong logo is orthography-aware: readers pick a preference and the whole
lockup follows. **Only the `O` and the `N` of the `MKPONG` wordmark change.**
The three overlapping `M`s are fixed.

* Slots in the wordmark: `M K P [O] [N] G`
* O variants: `o_dot`, `o_open`
* N variants: `n_hook`, `n_tilde`, `n_bar`
* Combinations: 2 x 3 = 6

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
| `n_hook` | N    | Ŋ    | U+014A    | LATIN CAPITAL LETTER ENG            | font   | 1511    | 96, −1439, 1331, 449      | **YES** |
| `n_tilde`| N    | Ñ    | U+00D1    | LATIN CAPITAL LETTER N WITH TILDE   | font   | 1571    | 53, −1819, 1521, 30       | —      |
| `n_bar`  | N    | Ṉ    | U+1E48    | LATIN CAPITAL LETTER N WITH MACRON BELOW | font | 1571 | 53, −1419, 1521, 328     | **YES** |

For reference, the base letters used by the unswitched slots:

| glyph | advance | ink bbox                  |
|-------|---------|---------------------------|
| `M`   | 1899    | 81, −1419, 1819, 0        |
| `K`   | 1422    | 96, −1419, 1423, 0        |
| `P`   | 1249    | 96, −1431, 1180, 0        |
| `G`   | 1485    | 84, −1449, 1440, 30       |
| `O`   | 1524    | 94, −1449, 1430, 29       |
| `N`   | 1571    | 53, −1419, 1521, 30       |

Coverage result: **all five variants exist as precomposed glyphs in Gelasio**,
so none of them has to be drawn by hand right now. That is a property of this
font, not a guarantee — see "Composition fallback" below.

---

## Please confirm these five definitions

Nothing here is decided for you; the two marked **YES** are genuinely
ambiguous and are called out in `logo/TODO.md`.

1. **`o_dot` = U+1ECC (Ọ, O with DOT BELOW).**
   The dot is *below* the O, and it is the middle-dot shape.
   Confirm: dot below (not an under-dot of a different size/shape), and that
   "dot" is the right member of the pair.

2. **`o_open` = U+0186 (Ɔ, OPEN O).**
   This is a *separate letter* with its own advance width (1315 vs 1524 for O),
   wider and more circular than a mirrored C would be. Confirm this is the
   intended "open o" and not e.g. an O with a stroke or a smaller counter.
   If it should instead be built as a mirrored `C`, say so: `composeFallback.mirrorOpenO`
   in `logo.config.json` already describes exactly that construction.

3. **`n_hook` = U+014A (Ŋ, ENG) — AMBIGUOUS.**
   The hook is on the *right*, descending below the baseline (ink reaches y = +449).
   Gelasio *also* has U+019D (Ɲ, N WITH LEFT HOOK), a hook on the *left*, with
   the plain N's advance (1571) and no descender. Which one is "n_hook"?

4. **`n_tilde` = U+00D1 (Ñ, N WITH TILDE).**
   The tilde sits *above* the cap height (ink reaches y = −1819). Confirm.

5. **`n_bar` = U+1E48 (Ṉ, N WITH MACRON BELOW) — AMBIGUOUS.**
   This is a short bar *under* the N (ink reaches y = +328). Alternatives:
   a bar *through* the N (no precomposed Unicode character; would have to be
   composed), or `N` + U+0331 COMBINING MACRON BELOW (renders identically here,
   but is a different construction and would be composed, not a single glyph).

---

## Composition fallback

`scripts/outline-glyphs.mjs` composes a glyph when a variant's codepoint is
missing from the font, using the primitives in `logo.config.json` ->
`composeFallback`:

* `mirror` — mirror a base glyph horizontally inside its advance box (e.g. `C` -> `Ɔ`).
* `marks` — draw extra shapes on top of a base glyph: `dot` (circle), `bar`
  (rectangle), `tilde` (quadratic wave), `hook` (quarter arc, `dir` chooses the side).

A composed glyph is emitted with `source: "composed"` and forced to
`needsReview: true`, so it cannot ship unnoticed. No variant needs this today;
the mechanism is proven by a test in `scripts/check-logo.mjs`.

Composition geometry (where a dot sits, how wide a bar is) is a **design**
decision, not a linguistic one. If a variant ever has to be composed, the
geometry will be proposed for review before it is used.

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
