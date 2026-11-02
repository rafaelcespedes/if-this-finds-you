# Character set

Which characters every hand must be able to write, in the order we build them.

Benchmark: Google Fonts' official Latin glyph sets ([googlefonts/glyphsets](https://github.com/googlefonts/glyphsets)).
Every font on Google Fonts must cover **GF Latin Core**. **GF Latin Kernel** is the smaller
"English, done properly" set inside it.

## Tier 1: launch (116 characters). GF Latin Kernel

**Basic keyboard (95).** Already drawn in the prototype, in both print and script, from the Hershey data:

```
A–Z  a–z  0–9  space
! " # $ % & ' ( ) * + , - . / : ; < = > ? @ [ \ ] ^ _ ` { | } ~
```

**The 21 extras every real document needs.** Not yet drawn:

| Group | Characters | Why it matters |
|---|---|---|
| Smart quotes | ‘ ’ “ ” | **Most important.** Mac, iOS, Word, Google Docs and most CMSs auto-convert `'` and `"` into these. Without them, every apostrophe ("don’t") falls back to a different font mid-word. |
| Dashes | – — − | En dash for ranges (9–5), em dash for breaks, true minus for numbers |
| Ellipsis, bullet, dot | … • · | Auto-inserted by many apps; bullets for lists |
| Currency | € £ ¥ ¢ | $ is already covered |
| Marks | © ® ™ ° | Footers, prices, temperatures |
| Math | × ÷ | Dimensions (3 × 4), recipes |
| Non-breaking space | (invisible) | Inserted by browsers and editors; must have a width |

These are cheap to make. Quotes are mirrored or rotated commas, the dashes are stretched hyphens,
and the ellipsis is three periods. Only € £ ¥ ¢ © ® ™ need new strokes drawn.

## Tier 2: European languages (324 characters). GF Latin Core

Adds about 210 characters so the hand can write French, Spanish, German, Portuguese, Italian,
Dutch, the Nordic languages, Polish, Czech, Turkish, Romanian and others:

- **Accented letters** (À É ñ ü ç ł š ő ż …). These are built automatically as **base letter + accent
  mark**, so we draw about 15 accent marks (´ ` ˆ ¨ ˜ ˚ ¸ ˇ ˘ ¯ ˙ ˛ ˝ and the comma below), not 200
  letters. This suits handwriting well, because people write accents as a separate flick of the pen.
- **Special letters:** ß ẞ Æ æ Œ œ Ø ø Ð ð Þ þ ı ȷ Ł ł Đ đ Ħ ħ
- **Punctuation:** ¡ ¿ « » ‹ › ‚ „ § ¶ ª º

## Later

Vietnamese (stacked accents), then other scripts (Cyrillic, Greek, and so on). Each new script needs new
source handwriting, not just new code. Scope v1 to Latin and say so on the site.

## How the live tool should handle a missing character

Never fall back silently to a system font mid-word. Show a visible, consistent placeholder: the
character in a light pencil "sketch" style, with a tooltip saying "This hand hasn't learned ‹ç› yet".
Log the misses, so we can see which characters real users actually type.

## Reference files

The full official lists were downloaded from the googlefonts/glyphsets repo on 2026-11-02:
`data/results/txt/nice-names/GF_Latin_Kernel.txt` (116 glyphs) and `GF_Latin_Core.txt` (324 glyphs).
