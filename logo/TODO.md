# Mkpong logo — open questions

Everything here is something I deliberately did **not** invent. Each item has a
clear question and the current placeholder behaviour. Nothing in this list is
silently wrong: the placeholders are marked in the code and in
`logo/ORTHOGRAPHY.md`, and the two ambiguous variants are flagged
`needsReview: true` in `logo/logo.config.json`, which `npm run check:logo`
asserts.

---

## 1. `n_hook` — which hook? (blocks correctness)

Currently resolves to **U+014A Ŋ (ENG)**: hook on the right, descends below the
baseline (ink to y = +449 at upm 2048).

The alternative in the same font is **U+019D Ɲ (N WITH LEFT HOOK)**: hook on the
left, same advance as a plain N (1571), no descender.

**Question:** which is the Mkpong/Ibibio "n with hook", and does it descend?

Changing it is a one-line edit in `logo/logo.config.json` (`orthography.n.n_hook.char`)
followed by `npm run build:logo`. All exports, the favicon-independent wordmark,
the demo and the checks follow automatically.

## 2. `n_bar` — bar under, or stroke through? (blocks correctness)

Currently resolves to **U+1E48 Ṉ (N WITH MACRON BELOW)**: a short bar *under* the
N (ink to y = +328).

**Question:** is it a bar *under* the letter, or a stroke *through* it? If it is
through the letter there is no precomposed Unicode character, so it has to be
composed (`logo.config.json` -> `composeFallback`) and I need to know the bar
height, thickness and whether it extends past the stems.

## 3. `o_dot` / `o_open` — confirm the pair

Currently `o_dot` = U+1ECC (Ọ, dot below, advance 1524) and `o_open` = U+0186
(Ɔ, OPEN O, advance 1315).

**Question:** confirm these two are the intended members of the O pair. If
"open o" is supposed to be a mirrored `C` instead of the real Ɔ glyph, say so —
that construction is already described in `composeFallback.mirrorOpenO`.

## 4. Final hex values (blocks sign-off, not the build)

`logo/logo.config.json` -> `palette` is marked *PROVISIONAL*. It carries over the
original artwork's values:

| role       | value     | used for                        |
|------------|-----------|---------------------------------|
| `green`    | `#1C7C3C` | back M                          |
| `orange`   | `#E8792A` | middle M                        |
| `white`    | `#FFFFFF` | front M fill                    |
| `outline`  | `#1C7C3C` | front M stroke                  |
| `wordmark` | `#1C4D2E` | MKPONG letters                  |
| `background` | `#FFFFFF` | mono knockout (`--mkpong-bg`) |

The `dark` theme (`#3FA45C`, `#F08A3C`, `#E9F5EC`, outline `#7FD39A`,
background `#101613`) is **my invention** to keep the front M's outline legible
on dark pages.

**Questions:** are the Akwa Ibom green/orange values final, and if not, what are
they? Do you want a dark theme at all, and with which values?

Note the original page also used `#66BB6A` / `#81C784` / `#FF7043` for the old
gradient lockup. If those are the brand colours, say which set wins.

## 5. Kerning (affects polish)

`logo.config.json` -> `wordmark.kerning` is **empty**, so letters sit on raw
advance widths (plus the 6px letter-spacing carried over from the original SVG).

Gelasio ships kerning in a GPOS table only, and it has no legacy `kern` table;
opentype.js does not read GPOS. So there are two ways forward:

**Question:** should the build extract GPOS pair kerning from the font at
outline time, or do you want a hand-tuned table? The pairs that actually matter
here are `M-K`, `K-P`, `P-O`, `O-N`, `N-G` (and the variant spellings of the
last three). I would not guess values.

## 6. Favicon at small sizes (design question)

`favicon.svg` / `favicon.ico` / `favicon-16|32|64.png` are the **mark only** (no
wordmark), which is what "simplified" means here.

The mark is ~2.2:1, so inside a square icon it is letterboxed and at 16 px it is
mushy.

**Question:** do you want a tighter small-size mark — e.g. reduced M overlap to
make it squarer, or a single-M monogram — or should the full triple-M mark be
kept as is?

## 7. Accessible name

`<mkpong-logo>` currently exposes `aria-label="MKPONG"` (overridable per element;
the maintenance page passes `MkpọNLP`).

**Question:** should the accessible name follow the orthography preference — i.e.
be spelled "Mkpọŋ / Mkpọñ / Mkpọṉ" for screen readers — and if so, which slots
are pronounced? Right now it never changes with the preference.

Also: the site name is spelled **MkpọŋNLP** in the page title while the logo
wordmark is **MKPONG**. Confirm that the two are meant to differ.

## 8. Letter-spacing value

`wordmark.letterSpacing` is `6` (from the original SVG's `letter-spacing="6"` at
font-size 72), applied *between* letters only. With real outlines and no kerning
this is the only thing setting optical rhythm.

**Question:** keep 6, drop it to 0 and rely on kerning (item 5), or a different
value?

## 9. Mono theme and `--mkpong-bg`

In the `mono` theme the front M is knocked out to `var(--mkpong-bg, #FFFFFF)`.
On a dark page the site must set `--mkpong-bg` (or use the `dark` theme), or the
knockout will read as a white shape on a dark mark.

**Question:** is a mono variant wanted at all, and should it use the page
background automatically via `currentColor`-style inheritance instead?

## 10. Build artifacts in version control

`logo/dist/` is generated but **committed**, because the site is served statically
and the maintenance page loads `logo/dist/mkpong-logo.js` directly. `node_modules/`
is ignored.

**Question:** happy with generated `logo/dist/` in the repo (58 SVGs + ~118 PNGs),
or should the build run in a deploy step and `dist/` be ignored instead?
