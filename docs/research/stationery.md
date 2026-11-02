# Stationery: what people really write letters on

_2026-11-02. Research for Rafael's note: "Make sure the paper types are things people will really write a
letter on." It covers what people have written letters on across eras and countries, a curated set for the
product, implementation specs in the shape of `app/src/lib/papers.ts`, how each paper interacts with page
breaks, and whether to add an envelope. Related: [`controls-and-feel.md`](controls-and-feel.md) (paper as a
layer) and [`writing-experience.md`](writing-experience.md) (Ink mode)._

## Summary

**Recommended set (7):** Letter pad (with British, Japanese binsen and German A4 variants), Laid paper
(deckled, with a handmade cotton variant), Airmail, Aerogramme, Notebook page (torn out, with US, legal pad,
UK and French rulings), Postcard and Notecard (with a Japanese ippitsusen variant). Envelope is a companion
view, not a paper.

**Remove:** Squared and Dot grid. Nobody reaches for graph paper or a bullet journal to write a letter; they
read as study and planning.

**Merge:** College ruled, Seyès and Feint ruled become one "Notebook page", with the ruling as a regional
sub-option and a torn, perforated or spiral edge. Plain "Letter" becomes "Letter pad": the same plain sheet,
with the pad's lined guide sheet showing faintly through.

**Why:** every option is a surface people actually post. The set spans the UK, France, Germany, the US,
Japan, India and Australia within Latin script, and each looks different at thumbnail size. Pad, airmail and
binsen share one real-world trick, a guide under or on the sheet, so the writing has lines to follow without
looking like school paper.

> **Needs your call:** `DECISIONS.md` currently says "Paper: plain, school-ruled (US, Seyès, UK feint), grid,
> and dot." This report recommends replacing that line.

## 1. Survey

All colours are estimates matched by eye. No maker publishes hex values.

### 1a. What it is

| Surface | Size (mm) | Colour (est.) | Ruling and print | Edge, fibre, texture |
|---|---|---|---|---|
| Wove writing paper | A5 148×210, A4; UK post quarto 178×229 [9] | white `#fbfbf8`, cream `#f8f2e2` | none | cut; smooth, even (woven-mesh mould) [18] |
| Laid writing paper | as above | cream `#f7f0de`; 18th-c. Dutch blue-white `#eef1ee` [19] | none; laid lines ~1 mm and chain lines 25–35 mm show in the sheet [18] | cut or deckled; finely ribbed |
| Handmade cotton rag | A5–A4, ~150 g/m² for letters [17] | natural white `#f4efe3` | none | four deckles, long fibres, rough tooth [17] |
| Onionskin / airmail | B5 182×257, A5 [7] | pale blue `#e7eef5`, white `#f8f8f3` | none; often a lined template to slip under [7] | 25–39 g/m², high cotton, translucent, often cockled [6] |
| Aerogramme | folded 184×90 with three flaps (US) [2]; a British design in thirds of 150×107 [1] | light blue `#dde7f0` (the US rule says light blue [2]) | imprinted stamp, airmail wording, opening instructions; tri-colour border in Australia from 1954 [3] | thin, gummed flaps, nothing may be enclosed [2] |
| Inland letter card (India) | unfolded 282–300 × 182–210; folded up to 210×100 [37] | not confirmed | imprinted stamp | at least 70 g/m², gummed [37] |
| Pad with a guide sheet | UK small 137×178, post quarto 178×229 [9]; France A5/A4 [11]; Japan B5 [13] | white, azure blue `#e6eef5`, cream | nothing printed; a separate lined guide goes under the sheet [9][11][13] | 90 g/m², watermarked, glued at the top [9] |
| Japanese binsen, ruled | A5 210×148, 15 lines at 9.5 mm [12]; B5 250×177, 17 lines [13] | cream `#faf6ea` [12] | printed horizontal (or vertical) rules, often inside a frame | smooth; sold as fountain-pen friendly [13] |
| German Briefbogen | A4 | white | fold marks at 105 and 210 mm (Form B) or 87 and 192 mm (Form A), punch mark at 148.5 mm [15] | cut |
| Correspondence card | flat 108×162 (4¼ × 6⅜ in) [22] | ecru `#f6f0e1`, white `#f9f8f3` | often a border: triple hairline or a coloured band [22] | heavy 100% cotton [22] |
| Folded notecard | A2 108×140, A7 127×178 when folded [24] | white, ivory | none, or a motif | card stock |
| Ippitsusen (short-note strip) | about 185×82 [25] | white, cream | 4–6 rules, about 10 mm apart [25] | smooth |
| Postcard | A6 148×105; UPU allows 140×90 to 235×120 [26] | `#fcf9f2` | divided back: message left, address right, stamp box [27] | coated card |
| Torn-out notebook page | US 203×267, tears to 191×267 [29]; UK 8 mm feint; French Seyès 170×220 [28] | `#fcfcf9` | rules and a margin [28] | spiral fringe, perforation or torn spine; thin |
| Legal pad | 216×298 (8½ × 11¾ in) [30] | canary `#f8ec9f` | 11/32 in (8.7 mm) rules, margin 1¼ in [28][30] | perforated top; thin |
| Folded letter sheet (before the 1840s) | one sheet folded into its own packet, address on the outside [34][35] | laid, cream | none | sealed with wax |
| Envelope | C6 114×162, DL 110×220 [38]; US #6¾ 92×165 | white, blue; red and blue airmail border [4][5] | address, stamp top right [39] | — |

### 1b. Where, when, how it takes ink, and what to do

| Surface | Era and region | Personal letters? | With ink | Verdict |
|---|---|---|---|---|
| Wove | 1750s onwards, standard by the 19th c. [18] | the default | crisp, even lines | **Keep** inside Letter pad |
| Laid | all European paper before the 1750s; still premium letter paper in France [18][20] | very; the archive's 17th–18th-c. letters [35] | ribs can catch a nib [21]; strokes break slightly | **Keep**, add a deckle |
| Cotton rag, deckled | handmade before the 19th c.; today e.g. Karnataka, India [17] | special letters | absorbent: wet ink spreads, dry pens skip | **Variant** of Laid |
| Onionskin / airmail | 1920s–1990s; "foreign correspondence paper" in 1927 [23]; Brazil capped airmail letter paper at 40 g/m² in 1943 [8] | very, for letters abroad | dries fast, no feathering, visible from the back, wrinkles when wet [7] | **Add** |
| Aerogramme | Iraq 1933, British forces 1941, US 1947–2006, Japan until 2023; Australia still sold them in 2024 [1] | huge for emigrants and soldiers: the cheapest way abroad [1] | mostly ballpoint, small and dense | **Add** |
| Inland letter card | India, since 2 October 1950 [37] | very common | ballpoint | **Note** as a future aerogramme variant (colour unconfirmed) |
| Pad with a guide | 20th c. to now; UK, France, Japan [9][11][13][14] | the everyday letter | smooth, any pen | **Add** (replaces Letter) |
| Binsen, ruled | Japan, 20th c. to now | everyday letters | smooth | **Variant** of Letter pad |
| German Briefbogen | DIN 5008, a business-letter rule [15] | A4 is normal; the marks mostly on business paper | — | **Variant**, optional |
| Correspondence card | US and UK social stationery; in 1920s etiquette guides [23] | thank-yous, short notes | heavy cotton: ink sinks in, soft edges | **Add** as Notecard |
| Folded notecard | everywhere | very | — | **Skip**: too close to the flat card |
| Ippitsusen | Japan, now | short notes tucked into parcels and gifts | smooth | **Variant** of Notecard |
| Postcard | divided back in the UK in 1902, internationally in 1907 [27] | very | coated: ballpoint fine, fountain ink sits on top (est.) | **Keep**, refine |
| Notebook page | everywhere, 20th c. to now | yes: children, hurried everyday letters. Etiquette calls it wrong for love letters [31], which is why it feels real | ballpoint and pencil; fountain ink feathers (est.) | **Merge** three rulings |
| Legal pad | US; Holyoke c. 1888, margin c. 1900; why yellow is unknown [30] | common in the US | thin; feathers (est.) | **Variant** of Notebook |
| Hotel letterhead | heyday c. 1900–1930s; now mostly gone [32] | travel letters | — | **Later**, fictional only |
| Telegram | 1850s–1980s; typed tape on a printed form | not handwritten | — | **Skip** |
| V-mail | US, June 1942 to November 1945; a printed form, microfilmed [33] | wartime only | — | **Skip** |
| Folded letter sheet | until the 1830s–40s [34] | how the archive letters travelled | — | **Use** for found letters (section 5) |
| Squared, dot grid | maths books, planners | rarely | — | **Remove** |

### What the survey says

1. **The guide sheet is universal.** British pads ship a removable lined guide [9], French pads a *guide-âne*
   [11][20], Japanese letter paper a *shitajiki* underlay [13][14]. People write on plain paper and follow hidden
   lines, loosely: PRINCIPLES #1 in real life.
2. **Blue is the colour of letters.** Dutch writing paper was tinted blue in the 18th century, and blue became
   standard letter paper in the 19th [19]. Aerogrammes had to be light blue [2], airmail labels blue from 1927
   [5], and the classic British pad is blue [10].
3. **The found letters were folded laid sheets.** The Prize Papers (1652–1815) hold about 160,000 undelivered
   letters, many still folded and some still sealed [35]. Envelopes were rare before the mid-19th century, and
   the address went on the outside of the folded sheet [34].
4. **Thrift shaped the page.** People crossed letters because postage was charged per sheet [36], and filled
   aerogrammes edge to edge in small writing [1]. Cramped, overflowing writing is truthful here.

## 2. The recommended set

| # | Paper | Variants | Why it's a letter | Replaces |
|---|---|---|---|---|
| 1 | **Letter pad** (default) | Continental A5 white · British small pad, blue · Binsen (printed 9.5 mm rules) · German A4 with fold marks | the everyday letter, everywhere | Letter |
| 2 | **Laid paper** | Cream · Blue-white · Handmade cotton (four deckles) | fine letters; the archive's own surface | Laid |
| 3 | **Airmail** | Pale blue · White | long letters abroad; translucent, so the guide shows clearly | new |
| 4 | **Aerogramme** | (later: India inland letter) | the emigrant and soldier letter; a single, finite sheet | new |
| 5 | **Notebook page** | US spiral (fringe) · US loose-leaf (holes) · Legal pad (yellow) · UK exercise book · French cahier (Seyès) | the ordinary, hurried letter | College, Seyès, Feint |
| 6 | **Postcard** | A6 · US 6×4 in | holiday notes | Postcard |
| 7 | **Notecard** | Correspondence card (bordered) · Ippitsusen | thank-yous and short notes | new |

Removed: **Squared**, **Dot grid**. Each of the seven is distinct at thumbnail size: white with ghost lines,
cream with a ragged edge, see-through blue, blue with folds and flaps, blue rules with a torn edge (or canary
yellow), a card with a divider and stamp box, and a small card with a border.

**Old links.** `getPaper` already falls back to the first paper. Add an alias map so shared links keep working:
`plain → pad`, `college → notebook/loose`, `seyes → notebook/fr`, `feint → notebook/uk`,
`squared → pad`, `dots → pad`.

**Roll weights** (in `roll.ts`, est.): pad 20, laid 14, notebook 16 (split across rulings), airmail 12,
aerogramme 9, postcard 8, card 8. Gate by length the way postcards are gated today: postcard ≤ 360 characters,
correspondence card ≤ 420, ippitsusen ≤ 160, aerogramme ≤ 1,500.

## 3. Specs

### 3a. New fields

All values are in mm. Existing fields keep their meaning.

```ts
type Side = 'top' | 'right' | 'bottom' | 'left';
interface PaperSpec {
  // …existing fields…
  /** sub-options shown as a small row under the paper; a patch over the base spec */
  variants?: { id: string; name: string; patch: Partial<PaperSpec> }[];
  /** a lined guide sheet under the page, seen through it: soft, a touch skewed */
  guide?: Rule & { pitch: number; first: number; last: number; alpha: number; blur: number; skewDeg: number };
  /** how closely baselines hold the lines: printed rules 1, a guide ~0.55, plain 0 */
  follow?: number;
  /** edges that aren't cut; the painter clears outside a seeded contour (as it does for binder holes) */
  edges?: Partial<Record<Side, { kind: 'deckle' | 'perforated' | 'fringe' | 'torn'; depth: number; pitch?: number }>>;
  /** grain strength (today 0.05), cockle 0–1 (onionskin), translucency 0–1 (desk and back show through) */
  finish?: { grain?: number; cockle?: number; translucency?: number };
  /** creases: y from the top, x from the left */
  folds?: { ys?: number[]; xs?: number[] };
  /** short marks at the left edge (DIN 5008 fold and punch marks) */
  ticks?: Rule & { ys: number[]; len: number };
  /** printed hairline border(s), inset from the edge */
  border?: Rule & { inset: number; count?: number; gap?: number };
  /** aerogramme flaps, drawn outside the main sheet, with a gum band */
  flaps?: { top: number; sides: number; gum: string };
  /** small printed words, in small caps */
  print?: { text: string; x: number; y: number; size: number; color: string; align?: 'left' | 'center' | 'right' }[];
  /** when the text doesn't fit: more sheets (today), the back of this one, another card, or no more */
  overflow?: 'sheets' | 'back' | 'card' | 'none';
  /** the back of a card */
  back?: Partial<PaperSpec>;
  /** ink on this stock: spread (mm) and feathering (0–1) */
  ink?: { spread: number; feather: number };
}
```

### 3b. The seven papers

```ts
export const PAPERS: PaperSpec[] = [
  {
    // A plain 90 g wove sheet from a writing pad, with the pad's lined guide sheet slipped underneath [9][11].
    id: 'pad', name: 'Letter pad', hint: 'Plain sheet, guide lines underneath',
    w: 148, h: 210, tint: '#fcfcf9',
    guide: { color: '#26303b', weight: 0.5, pitch: 8, first: 30, last: 190, alpha: 0.11, blur: 0.5, skewDeg: 0.35 },
    text: { left: 15, right: 133, first: 30, last: 190 },
    pitch: 8, follow: 0.55, xh: 3.0, finish: { grain: 0.04 }, ink: { spread: 0.02, feather: 0 },
    swatch: { x: 4, y: 26 },
    variants: [
      { id: 'uk', name: 'British pad', patch: { w: 137, h: 178, tint: '#e6eef5',
        guide: { color: '#1f2b3a', weight: 0.55, pitch: 9, first: 22, last: 166, alpha: 0.12, blur: 0.5, skewDeg: 0.35 },
        text: { left: 13, right: 124, first: 22, last: 166 }, pitch: 9, xh: 3.1 } },
      { id: 'jp', name: 'Binsen', patch: { tint: '#faf6ea', guide: undefined, follow: 1,       // printed rules [12]
        lines: { color: '#b5ad9f', weight: 0.2, pitch: 9.5, first: 38, last: 171, x0: 14, x1: 134 },
        text: { left: 16, right: 132, first: 38, last: 171 }, pitch: 9.5, xh: 3.1 } },
      { id: 'de', name: 'A4, fold marks', patch: { w: 210, h: 297,                              // DIN 5008 Form B [15]
        guide: { color: '#26303b', weight: 0.5, pitch: 8, first: 45, last: 277, alpha: 0.11, blur: 0.5, skewDeg: 0.3 },
        ticks: { color: '#9aa0a6', weight: 0.2, ys: [105, 148.5, 210], len: 5 },
        text: { left: 25, right: 190, first: 45, last: 277 }, xh: 3.2 } },
    ],
  },
  {
    // Cream laid letter paper, post quarto, deckled down the right and along the foot.
    id: 'laid', name: 'Laid paper', hint: 'Cream laid, deckled edge',
    w: 178, h: 229, tint: '#f7f0de',
    laid: { pitch: 0.95, chain: 26, color: '#7a6a4c' },                                         // chains 25–35 mm [18]
    edges: { right: { kind: 'deckle', depth: 2.5 }, bottom: { kind: 'deckle', depth: 2.5 } },
    text: { left: 20, right: 154, first: 32, last: 208 },
    pitch: 0, xh: 3.2, ink: { spread: 0.04, feather: 0.1 },
    swatch: { x: 134, y: 195 },                                                                 // the deckled corner
    variants: [
      { id: 'blue', name: 'Blue-white', patch: { tint: '#eef1ee', laid: { pitch: 0.95, chain: 27, color: '#5e6a70' } } }, // [19]
      { id: 'cotton', name: 'Handmade cotton', patch: { w: 148, h: 210, tint: '#f3eee2', laid: undefined,             // [17]
        edges: { top: { kind: 'deckle', depth: 3.5 }, right: { kind: 'deckle', depth: 3.5 },
                 bottom: { kind: 'deckle', depth: 3.5 }, left: { kind: 'deckle', depth: 3.5 } },
        finish: { grain: 0.1 }, text: { left: 18, right: 130, first: 30, last: 190 }, ink: { spread: 0.08, feather: 0.3 } } },
    ],
  },
  {
    // Onionskin airmail paper, B5, about 30 g/m²: pale blue, translucent, softly cockled,
    // with the pad's lined template showing plainly through [6][7].
    id: 'airmail', name: 'Airmail', hint: 'Thin blue onionskin',
    w: 182, h: 257, tint: '#e7eef5',
    finish: { grain: 0.03, cockle: 0.5, translucency: 0.14 },
    guide: { color: '#1b2633', weight: 0.45, pitch: 8, first: 20, last: 244, alpha: 0.3, blur: 0.15, skewDeg: 0.3 },
    text: { left: 13, right: 169, first: 20, last: 244 },
    pitch: 8, follow: 0.6, xh: 2.6, ink: { spread: 0, feather: 0 },
    swatch: { x: 6, y: 14 },
    variants: [{ id: 'white', name: 'White', patch: { tint: '#f8f8f3' } }],
  },
  {
    // The inside of an unfolded aerogramme: one light-blue sheet in three 90.5 mm panels
    // (184 × 90.5 folded, the US size [2]), side and top flaps with a gum band. Nothing goes inside.
    id: 'aerogramme', name: 'Aerogramme', hint: 'Blue air letter, one sheet',
    w: 184, h: 271.5, tint: '#dde7f0',
    folds: { ys: [90.5, 181] },
    flaps: { top: 16, sides: 12, gum: '#d0dce8' },
    print: [                                                                                    // generic, optional
      { text: 'SECOND FOLD', x: 174, y: 89, size: 1.6, color: '#3a5684', align: 'right' },
      { text: 'FIRST FOLD', x: 174, y: 179.5, size: 1.6, color: '#3a5684', align: 'right' },
    ],
    text: { left: 9, right: 175, first: 15, last: 263 },                                        // across the creases
    pitch: 0, xh: 2.45, overflow: 'none', ink: { spread: 0, feather: 0 },
    swatch: { x: 0, y: 72 },
  },
  {
    // A page torn out of a notebook. One paper; the ruling is the region. Default: US spiral, college ruled.
    id: 'notebook', name: 'Notebook page', hint: 'Torn out, ruled',
    w: 203.2, h: 266.7, tint: '#fcfcf9',
    lines: { color: '#9dc3e6', weight: 0.2, pitch: 7.14, first: 25.4, last: 25.4 + 32 * 7.14 },
    margin: { color: '#e8737f', weight: 0.24, x: 31.75 },
    edges: { left: { kind: 'fringe', depth: 4, pitch: 6.35 } },                                 // coil pitch est.
    text: { left: 34.5, right: 196, first: 25.4, last: 25.4 + 32 * 7.14 },
    pitch: 7.14, xh: 2.55, ink: { spread: 0.04, feather: 0.35 },
    variants: [
      { id: 'loose', name: 'US loose-leaf', patch: { edges: undefined, holes: { x: 11, ys: [25.4, 133.35, 241.3], d: 7.9 } } },
      { id: 'legal', name: 'Legal pad', patch: { w: 215.9, h: 298.5, tint: '#f8ec9f',           // [28][30]
        lines: { color: '#8eb1cd', weight: 0.2, pitch: 8.73, first: 31, last: 31 + 29 * 8.73 },
        margin: { color: '#d9545a', weight: 0.24, x: 31.75, double: 2 },                        // double est.
        edges: { top: { kind: 'perforated', depth: 0.4 } },
        text: { left: 36, right: 209, first: 31, last: 31 + 29 * 8.73 }, pitch: 8.73, xh: 3.0 } },
      { id: 'uk', name: 'UK exercise book', patch: { /* today's Feint spec */ edges: { left: { kind: 'torn', depth: 2.5 } } } },
      { id: 'fr', name: 'French cahier', patch: { /* today's Seyès spec */ edges: { left: { kind: 'torn', depth: 2.5 } } } },
    ],
  },
  {
    // Today's A6 postcard, plus a small printed word and the overflow rule.
    id: 'postcard', /* …today's spec… */
    print: [{ text: 'POSTCARD', x: 76, y: 6, size: 1.9, color: '#a59c8a', align: 'center' }],
    overflow: 'card', finish: { grain: 0.03 }, ink: { spread: 0, feather: 0 },
    variants: [{ id: 'us', name: '6 × 4 in', patch: { w: 152.4, h: 101.6 /* divider 78, stamp [121, 8, 23, 27] */ } }],
  },
  {
    // A flat correspondence card, 6⅜ × 4¼ in, heavy cotton, ecru, navy triple hairline border [22].
    id: 'card', name: 'Notecard', hint: 'Heavy card, a few lines',
    w: 162, h: 108, tint: '#f6f0e1',
    border: { color: '#2f4f86', weight: 0.16, inset: 5, count: 3, gap: 0.7 },
    text: { left: 15, right: 147, first: 24, last: 94 },
    pitch: 0, xh: 2.6, overflow: 'back', back: { border: undefined },
    finish: { grain: 0.06 }, ink: { spread: 0.06, feather: 0.15 },
    swatch: { x: 0, y: 0 },
    variants: [
      { id: 'ippitsusen', name: 'Ippitsusen', patch: { w: 185, h: 82, tint: '#fbf8f0', border: undefined,  // [25]
        lines: { color: '#c2bbb0', weight: 0.18, pitch: 10, first: 23, last: 63, x0: 12, x1: 173 },
        text: { left: 14, right: 171, first: 23, last: 63 }, pitch: 10, follow: 1, xh: 2.7,
        overflow: 'card', ink: { spread: 0.02, feather: 0 } } },
    ],
  },
];
export const DEFAULT_PAPER = 'pad';
```

### 3c. Painter notes

| Feature | How to draw it |
|---|---|
| **Guide sheet** | Draw the lines, blur by `blur` mm, multiply at `alpha`. Rotate by a seeded ±`skewDeg` and shift ±1.5 mm per sheet: a guide never sits square. A faint grey ghost on 90 g wove, nearly crisp on onionskin. |
| **Follow** | v1: on guide papers, use the guide pitch but lay out free (`ruled: false`), so lines drift as they do over a guide. Printed rules keep `ruled: true`. |
| **Guide when sent** | The guide stays in the pad, so the person who gets the letter sees plain paper with straight writing. Show it while writing, hide it in the shared link (question 2). |
| **Deckle** | Seeded wavy contour, 0.8–1.6 mm amplitude, several waves per cm. Within `depth` mm of the edge, fade the tint (thinner paper) and add fibre wisps. Clear outside with `destination-out`, as for binder holes. |
| **Torn** | A slow wobble (0.6–1.5 mm), fine fibre noise (0.2 mm), and a 0.4 mm lighter fringe of exposed fibres. |
| **Perforated** | Near-straight, with teeth every ~1 mm, 0.1–0.2 mm deep. |
| **Spiral fringe** | Tabs every `pitch` mm, 2–5 mm deep, ragged tips, a few half torn away. |
| **Cockle** | Low-frequency undulation (cells ~30–60 mm), ±1.5% lightness. |
| **Translucency** | Paint the tint at `1 − translucency` so the desk shows through; in the JPEG, composite over the desk colour. Later: the reverse side's writing, mirrored, at ~6% [7]. |
| **Folds** | Per crease, a highlight (+4%, 0.3 mm) beside a blurred shadow (−5%, 0.5 mm). Ink crosses unchanged. |
| **Flaps** | Trapezoids outside the main rectangle, 45° chamfers; the canvas grows to fit. The outer 5 mm is the gum band. |
| **Border, ticks** | `count` hairlines `gap` apart from `inset`; ticks run from x = 0 to `len`. |
| **Ink** | `spread` widens stroke edges; `feather` adds hair-thin offshoots on slow, wet strokes (the ink pass in `controls-and-feel.md`). |

### 3d. Where the hand sits

- **Pad and airmail:** on the guide pitch, loosely; airmail hands run smaller (`xh` 2.6) to save weight.
- **Binsen, ippitsusen, notebook:** on the printed rules (notebook: right of the margin; Seyès as today).
- **Laid and cotton:** free lines, generous margins.
- **Aerogramme:** edge to edge across both creases, small; flaps clear in v1.
- **Postcard:** the left half only; the right half belongs to the address step (section 5).
- **Notecard:** inside the border, 8–9 lines; the back has no border, so its box is 4 mm wider each side.

## 4. Pages and overflow

`paginate` splits one continuous page into sheets where the lines really fall. That stays right for the
open-ended papers. Fixed-space papers need their own rule, matching what people actually do.

| Paper | Room (est.) | When it overflows | Build |
|---|---|---|---|
| Letter pad, laid, notebook | 16–33 lines a sheet | more sheets, page numbers from sheet 2 (as today) | v1, no change |
| Airmail | 29 lines | more sheets; sheet 2 is the back of sheet 1, each showing the other faintly mirrored | sheets v1, show-through v2 |
| Postcard | ~10 short lines | a second card, with "2" written at the top of the message side | v1 |
| Notecard | ~9 lines | "over" written bottom right, then the plain back, then a second card | v1 |
| Ippitsusen | 5 lines | the next strip; people use two or three | v1 |
| Aerogramme | ~29 small lines | the last lines cramp (smaller, tighter, as a real writer squeezes in the end), then run sideways up the margin, then a quiet offer: "Continue on a second aerogramme" | cramp v1 (needs a per-line size factor), margin v2 |

Notes:
- **Signature:** on postcards and cards, the name `liveLayout` keeps after the text lands on the same card if
  it fits, else on the back or the next card, never on a sheet of its own.
- **No meter.** The cramp and the "over" are the cue, and they're truthful.
- **Back of a card** is a sheet with `back` merged over the spec: a spec swap per sheet, not new layout.

## 5. Envelope (recommendation)

**Yes, as a small companion after the papers.** Three reasons:

1. **It finishes the ritual.** Write, then address: the step people remember from real letters.
2. **It's the natural cover for a shared link.** The recipient sees their name in the sender's hand, taps, and
   the letter writes itself out, which fits the decision that shared links autoplay.
3. **It echoes the archive.** Many Lost Letters were never delivered, and their addresses survive on the outside
   of the folded sheet [34][35]. Seeing the address makes the non-delivery felt.

**How it fits the flow.** After "Write a reply", offer "Address it" as an optional step, pre-filled with the
name and place of the found letter's writer as the archive records them ("To Anna, Nantes"). For a living pen
pal, ask for a name and a town only, never a street address. The envelope sits on the desk beside the letter,
and the share link opens on it.

**Pairing.** Each paper has its own envelope, or is its own:

| Paper | Envelope |
|---|---|
| Letter pad | matching small envelope: 143×95 blue (British), C6 162×114 white (continental) [38] |
| Laid, cotton | C6 cream, laid |
| Airmail | DL 220×110 with a red and blue border (parallelograms ~7.5 mm, 45°, red, white, blue, white) and a blue "PAR AVION / BY AIR MAIL" label [4][5] |
| Notecard | a card envelope, 4½ × 6½ in [22] |
| Postcard | no envelope: write the address on the card's own right half |
| Aerogramme | its own outside panel: address lines, a stamp box, the airmail wording, a tri-colour border [3] |
| Found letters before ~1850 | no envelope: the folded letter packet, address on the outside, a wax seal [34] |

**Layout.** Stamp top right everywhere. The recipient's block a little below the centre, 3–4 lines on a free
pitch with the hand's own drift. US letters put the return address top left on the front; UK letters put it on
the back [39].

**Keep it honest.** Use an empty stamp box or an invented stamp with no country name, value or postal
emblem. Leave out postmarks, or use a plain circle with only a date. No real hotels, brands or crests.

**Cost.** One small painter (rectangle, flap shadow, optional border) and a 3–4 line address layout in the
same hand.

## 6. Questions for Rafael

1. Replace the paper line in `DECISIONS.md` with these seven papers (Squared and Dot grid removed)?
2. Guide lines: hide them in the sent letter (true to life) or keep them visible everywhere?
3. Aerogramme overflow: cramp and then offer a second aerogramme, or cramp and stop?
4. Envelope: build it right after the papers, or later?
5. Later, not now: a fictional hotel or ship letterhead for travel replies. Fine to leave out?

## Sources

1. Aerogram, Wikipedia: https://en.wikipedia.org/wiki/Aerogram ; West Africa Study Circle, formula air letters (fold sizes): https://www.wasc.org.uk/Zoom%20meeting%20files/November%202025/SL%20Formula%20air%20letters%20part2.pdf
2. USPS International Mail Manual (archived 2006), aerogrammes: https://pe.usps.com/imm_archive/html/imm_archive_20060108/imm/immc2_018.html
3. Australia Post Collectables, introduction to the aerogramme: https://collectables.auspost.com.au/community-and-events/articles/introduction-aerogramme-australia
4. Airmail, Wikipedia: https://en.wikipedia.org/wiki/Airmail ; Smithsonian National Postal Museum, US airmail stamped envelopes: https://postalmuseum.si.edu/exhibition/fad-to-fundamental-airmail-in-america-airmail-object-showcase-stamps-and-covers/us-1
5. ICAO postal history, 1927 air post conference (blue PAR AVION labels): https://www.icao.int/sites/default/files/postalhistory/1927_airline_companies_officially_recognized_as_airmail_carriers.htm ; Collectors Club of Chicago, airmail label: https://www.collectorsclubchicago.org/philatelic-encyclopedia/airmail-label/
6. Onionskin, Wikipedia: https://en.wikipedia.org/wiki/Onionskin
7. The Well-Appointed Desk, Life Airmail paper review: https://wellappointeddesk.com/2018/11/paper-review-life-airmail ; Hunter Paper Co., B5 airmail pad: https://hunterpaperco.com/products/life-air-mail-b5-letter-pad-50-sheets
8. Brazil, Decree 11.678 of 18 February 1943 (air-mail letter paper ≤ 40 g/m²): https://planalto.gov.br/ccivil_03/decreto/1930-1949/D11678.htm ; https://brasil.justia.com/nacionales/decretos/11-678-de-18-2-1943/gdoc
9. Pure Pens, small British pad 137×178, 90 g, removable lined guide: https://www.purepens.co.uk/products/basildon-bond-white-writing-paper-duke-small-178mm-x-137mm ; post quarto 178×229: https://www.purepens.co.uk/collections/all/products/basildon-bond-white-writing-paper-post-quarto-medium-178mm-x-229mm
10. National Trust Collections, vintage "Azure" pad with lined sheet: https://www.nationaltrustcollections.org.uk/object/742572.4.2
11. Goulet Pens, French A5 pad with guide sheet, 8 mm, 90 g: https://www.gouletpens.com/products/clairefontaine-triomphe-a5-tablet-blank
12. Maruzen Junkudo, Midori MD binsen A5, 15 lines at 9.5 mm, cream: https://www.maruzenjunkudo.co.jp/products/4902805205832
13. Maruzen Junkudo, Midori B5 letter paper, 17 lines, with underlay: https://www.maruzenjunkudo.co.jp/products/4902805205153
14. Pencil board (shitajiki), Wikipedia: https://en.wikipedia.org/wiki/Pencil_board
15. Falzmarke, German Wikipedia: https://de.wikipedia.org/wiki/Falzmarke
16. Deckle edge, Wikipedia: https://en.wikipedia.org/wiki/Deckle_edge
17. Modulor, Khadi rag paper (handmade cotton, four deckles): https://www.modulor.de/en/khadi-rag-paper-white.html ; Cowling & Wilcox on Khadi: https://www.cowlingandwilcox.com/blog/post/270-khadi-papers-handmade-eco-friendly-artists-paper
18. Wove paper, Wikipedia: https://en.wikipedia.org/wiki/Wove_paper ; Princeton Graphic Arts, laid or wove: https://www.princeton.edu/~graphicarts/2008/03/laid_or_wove.html ; Burns Paper Database (chain lines 25–35 mm): https://www.gla.ac.uk/schools/critical/research/researchcentresandnetworks/robertburnsstudies/ourresearch/paperdatabase
19. "Why is writing paper blue?" (OpenEdition): https://books.openedition.org/pumi/41243?lang=en
20. LDLC, French laid pad (laid lines as a writing guide): https://www.ldlc.com/fiche/PB00545422.html ; Papeterie Makkura, A5 sets with C6 envelopes: https://papeterie-makkura.fr/en/writing-paper/978-block-verge-de-france-a5-blue-g-lalo-3140290114029.html
21. Fountain Pen Network, UK writing paper thread: https://fountainpennetwork.com/forum/topic/302113-writing-paper-uk-recommendations
22. Fahrney's, bordered correspondence card 4¼ × 6⅜ in, 100% cotton: https://www.fahrneyspens.com/Item--i-CC3315 ; Dromgoole's, flat notes with 4½ × 6½ in envelopes: https://www.dromgooles.com/products/crane-triple-debossed-frame-pearl-white-card-10-ea
23. Slipcue, 1927 etiquette on stationery: https://slipcue.com/slipcue/aa_mail/etiquette_02.html
24. 4over4, card sizes: https://mapp.4over4.com/guide/thank-you-card-size-guide
25. Maruzen Junkudo, ippitsusen sizes and rulings: https://www.maruzenjunkudo.co.jp/products/4902805894890 ; Kokuyo, small letter pad, 6 lines: https://www.kokuyostore.com/en/small-letter-pad--%22flows%22-6lines-50sheets/HI-108.html
26. Papersizes.org, postcard sizes: https://www.papersizes.org/postcard-sizes.htm
27. Lehigh University, divided-back period: https://exhibits.lib.lehigh.edu/exhibits/show/postcards/timeline/divided-back-period ; postcard.co.uk history: https://postcard.co.uk/history.php
28. Ruled paper, Wikipedia: https://en.wikipedia.org/wiki/Ruled_paper
29. Newegg Business, spiral notebook tear-out size: https://www.neweggbusiness.com/p/9B-307-02RS-00046
30. NPR, history of the legal pad: https://www.npr.org/2005/05/31/4673512/the-history-of-the-legal-pad ; Mental Floss: https://www.mentalfloss.com/history/law/why-are-legal-pads-yellow ; School Specialty (11/32 in, 1¼ in margin): https://www.schoolspecialty.com/perforated-pad-1074331
31. The Art of Manliness, on letter-writing paper: https://www.artofmanliness.com/app-json/wp/v2/posts/3999
32. Mr & Mrs Smith, a love letter to hotel stationery: https://www.mrandmrssmith.com/editorial/travel-guides/love-letter-to-hotel-stationery ; UBC Chung collection: https://open.library.ubc.ca/collections/chung/chungtext/items/1.0228907
33. Smithsonian National Postal Museum, V-Mail letter sheets: https://postalmuseum.si.edu/collections/object-spotlight/v-mail-letter-sheets
34. Letter sheet, Wikipedia: https://en.wikipedia.org/wiki/Letter_sheet ; Letterlocking, Wikipedia: https://en.wikipedia.org/wiki/Letterlocking
35. The National Archives, the Prize Papers: https://www.nationalarchives.gov.uk/explore-the-collection/explore-by-time-period/georgians/the-prize-papers ; TNA blog, opening closed letters: https://blog.nationalarchives.gov.uk/letters-unread-opening-closed-letters-in-the-prize-papers-project/
36. Crossed letter, Wikipedia: https://en.wikipedia.org/wiki/Crossed_letter
37. India Post, inland letter card: https://indiapost.gov.in/MBE/Pages/Content/Inland-Letter-Card.aspx ; Indian philately, inland letter cards from 1950: https://www.oocities.org/indianphilately/chapter29a.htm
38. Papersizes.org, C-series envelopes: https://www.papersizes.org/c-envelope-sizes.htm
39. Post Office (UK), how to address mail: https://www.postoffice.co.uk/mail/how-to-address-mail ; Jersey Post, addressing guide 2025: https://jerseypost.com/media/3471/addressing_2025.pdf
