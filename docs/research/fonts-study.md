# Handwritten and script fonts: what the best ones do well

_Research for Dynamic Font (seeded, live handwriting), 2 November 2026._

_Method: open-web research. Google Fonts facts come from Google's metadata JSON and the font sources on GitHub, with OpenType features read from the shipped binaries. Foundry facts come from foundry pages, MyFonts and the type press. Anything not confirmed is marked **(unverified)**. The web-search quota ran out before the last few checks, and those are flagged too._

---

## In one paragraph

The handwriting fonts that feel real share three habits:
- They hold a few things steady: the x-height band, stroke weight, slant and join height.
- They spend their variety on letter shape, position in the word and rhythm, not on random noise.
- They react to context: the previous letters, the letter's place in the word, the ink left in the pen.

Even the best fonts hit three walls:
- Only a handful of alternates: 3 in Kosmik and Caveat, 4 in LiebeDoris, 7 in Playpen Sans.
- They can look only a few letters back.
- They know nothing about the line, the page, the size they're set at, or time.

Those three walls are exactly where a live, seeded generator wins.

---

## 1. Google Fonts' handwriting category

### 1.1 What is actually popular

Google files 358 families as Handwriting. The ranks below are global popularity ranks across all 1,959 families, from `https://fonts.google.com/metadata/fonts`. View counts come from `https://fonts.google.com/metadata/stats`.

| In category | Family | Global rank | Note |
|---|---|---|---|
| 1 | Dancing Script | 32 | 152B all-time views, the most in the category |
| 2 | Caveat | 40 | The only top-10 family that fights repetition |
| 3 | Zeyada | 81 | Probably a spike: 864M views in 30 days, only 12.7B all-time |
| 4 | Pacifico | 92 | 126B all-time |
| 5 | Comic Neue | 108 | A reworking of Comic Sans |
| 6 | Shadows Into Light | 113 | 104B all-time |
| 7 | Great Vibes | 128 | The formal or wedding script |
| 12 | Kalam | 144 | Devanagari and Latin |
| 14 | Indie Flower | 148 | **146B all-time**, second only to Dancing Script |
| 18 | Amatic SC | 176 | 61B all-time |
| n/a | Lobster, Shantell Sans | 59, n/a | Google files these under Display |

Positions 8 to 13 are Permanent Marker, Courgette, Satisfy, Delius and Gloria Hallelujah, with Kalam at 12. Indie Flower and Amatic SC once dominated far more than their current rank shows: that's the 2012-era blog look.

### 1.2 Family facts

Each row was checked against the family's `METADATA.pb`, its description file and the font binary in `github.com/google/fonts`.

| Family | Designer | Whose hand? | Coverage | Variation features | License |
|---|---|---|---|---|---|
| **Caveat** (2015) | Impallari Type; Cyrillic by Cyreal | None named | Latin, Cyrillic | **calt cycles 3 forms** of each lowercase, with separate consonant and vowel classes and a look-back of up to 5 letters. wght axis 400–700 | OFL |
| **Dancing Script** (2011) | Impallari Type | References: Murray Hill, Mistral | Latin, Vietnamese | liga and dlig only, **no calt**. wght 400–700 | OFL |
| **Pacifico** (2011) | Vernon Adams, redrawn 2016 | 1950s US surf lettering | Latin, Cyrillic, Vietnamese | calt, fina, salt | OFL |
| **Shadows Into Light, Indie Flower, Gloria Hallelujah, Covered By Your Grace, Zeyada, Architects Daughter** | Kimberly Geswein | **Real people:** a teacher friend, a Korean high-school student, a young mother, an architect's daughter | Latin | **No substitution features at all** (no GSUB table): every repeat is identical | OFL |
| **Kalam** (2014) | Indian Type Foundry | A generic everyday pen | Devanagari, Latin | Script shaping only | OFL |
| **Patrick Hand** (2011) | Patrick Wagesreiter | The designer's own | Latin, Vietnamese | Small caps and old-style figures; no alternates | OFL |
| **Handlee** (2011) | Joe Prince | Loosely the designer's own | Latin | None; the **baseline jitter is drawn into each glyph** | OFL |
| **Gochi Hand** (2011) | HT Fonts | An unnamed teenager | Latin | liga only | OFL |
| **Great Vibes** (2012) | Robert Leuschke | n/a | Latin, Cyrillic, Greek, Vietnamese | **calt, init, fina, ss01–04; up to 7 alternates per glyph; 2,025 glyphs** | OFL |
| **Homemade Apple, Permanent Marker, Rock Salt, Satisfy** | Font Diner; Sideshow | Marker; brush | Latin | None | **Apache 2.0** |
| **Reenie Beanie** (2010) | James Grieshaber | "Basic ball-point pen handwriting" | Latin | None | OFL |
| **Nanum Pen Script** (2018) | Sandoll / Naver | n/a | Korean (13,751 glyphs) | None | OFL |
| **Mrs Saint Delafield, Monsieur La Doulaise** | Sudtipos (Alejandro Paul) | **Built from collected real signatures** (the Bluemlein collection, 1930s–40s), under **made-up names** | Latin | None | OFL |
| **Shantell Sans** (2023) | Shantell Martin with Arrow Type (Stephen Nixon) | From Martin's marker writing, **normalised to one core shape per character** | Latin, Cyrillic, Vietnamese; 380+ languages | **Bounce** axis (−100 to 100), **Informality** axis (0–100), spacing and weight axes. `rlig` "cycles through several alternates" in a "pseudo-random" pattern | OFL |
| **Playwrite** (2023–26) | TypeTogether (Veronika Burian, José Scaglione) | National school models | **52 models for 36 countries** ship on Google, each with a "Guides" twin | Positional calt (initial, medial, final). A "TRACKBACK" lookup then **picks each entry stroke from the previous letter's exit**. The sources have slant, "speed" and extender axes, but Google serves weight only | OFL |
| **Playpen Sans** (2023) | TypeTogether | n/a | Latin, Greek, Cyrillic | "Seven different glyphs for each character" through a calt "shuffler" | OFL |
| **Lobster** (2010) | Impallari Type | Lettering practice | Latin, Cyrillic, Vietnamese | Many pair ligatures to perfect joins | OFL |

Three things stand out:
- **No Google font checked uses `rand`.** All the variety comes from deterministic cycling, because apps effectively don't support `rand`.
- **Most of the top families have no variation at all.**
- **The Sudtipos signature fonts are our model.** They take real hands and publish them under fictional writers' names, the same move as our seeded writers.

Sources: https://github.com/google/fonts · Caveat's feature file https://github.com/googlefonts/caveat/blob/main/sources/Caveat-Regular.ufo/features.fea · https://github.com/arrowtype/shantell-sans · https://shantellsans.com/process · https://github.com/TypeTogether/Playwrite · https://fonts.googleblog.com/2024/06/playwrite-is-new-font-superfamily-for.html

### 1.3 What works, and what gives each one away

| Family | What works | What looks fake or tired |
|---|---|---|
| Caveat | The best free anti-repeat; compact; a weight axis; Cyrillic | Only 3 forms, so long text shows a periodic pattern. Loops close up when small ([DesignRush](https://www.designrush.com/best-designs/logo/handwritten-fonts)) |
| Dancing Script | A lively bounce in size and position | The bounce is baked into each glyph, so every "e" bounces the same way. It's the default bakery script |
| Pacifico, Lobster | Strong joins at display sizes | Fatigue: "Dear Startups, Lobster is the new Comic Sans" (http://5in5nyc.com/2012/05/31/dear-startups-lobster-is-the-new-comic-sans), and "most overused font of 2013" (https://www.signs101.com/threads/the-most-overused-font-in-2013-is.108907). **There is no designer article calling Pacifico a cliché; that's our reading of 126B views** |
| The Geswein fonts | Real people's hands, real charm | Identical repeats; the "quirky blog" voice of 2011–15 |
| Amatic SC | Condensed hand-drawn capitals | The craft-market and chalkboard default; on The Bold Italic's list of "much-loathed" fonts (https://www.thebolditalic.com/in-defense-of-papyrus-your-guide-for-when-to-use-despised-fonts/) |
| Great Vibes, Allura | Technically rich | Wedding cliché. A tiny x-height fails at small sizes **(our judgement)** |
| Kalam, Patrick Hand | Neutral and legible small | No alternates, so repeats show in body text |
| Shantell Sans | Personality when large, yet "carefully made to work well in smaller text" (Nixon) | The bounce is per glyph, which can read cartoonish **(our judgement)** |
| Playwrite | Joins driven by the previous letter's exit; national models | A teaching hand: it reads as "school", not as a person |

Google's own Knowledge lesson states the core point: a handwritten face loses its human touch once you notice repeated letterforms (https://fonts.google.com/knowledge/using_type/how_to_make_type_feel_authentic).

---

## 2. Commercial and foundry landmarks

### 2.1 The technique table

| Font (maker, year) | Source hand | Technique that sells "handwritten" | Numbers |
|---|---|---|---|
| **Liza Pro** (Underware: Bas Jacobs, Akiem Helmling, Sami Kortemäki; begun 2004, released 2009) | Hand-painted lettering | A set of named features (below) that work from context, not chance | 4,000 hand-made characters; about 200 ligatures; 219 languages |
| **Bello Pro** (Underware) | Brush | Ligatures on by default; a different "y" before a space; **Bello Words**, 62 whole-word logos | 60+ ligatures |
| **Auto** (Underware, 2004) | n/a | **Three italics of rising personality**, from "restrained" to "provocative" with loops: a personality dial on one roman **(the handwriting link is our inference)** | 3 italics |
| **Ed Interlock** (House Industries, 2004; engineered by Tal Leming) | Ed Benguiat's Photo-Lettering | **Contextual ligatures** choose the best interlocking combination for each word, so letters nest into their neighbours | About 1,400 ligatures; 1,700+ glyphs |
| **Studio Lettering** (House: Ken Barber, Tal Leming, 2009) | Mid-century lettering | Swing's shapes "smoothly flow between slightly larger and smaller shapes": a rhythm, not dice. Slant picks 1 of 3 alternates. **National forms follow the OpenType language setting**: reverse or forward r, crossed 7, Sütterlin-flavoured German | Swing: 1,400+ glyphs |
| **Burgues Script** (Sudtipos, Alejandro Paul) | Louis Madarasz's engraver's script | Flourished sets for word **beginnings and endings**, with quiet middles | TDC2 2008 Certificate of Excellence |
| **Feel Script** (Sudtipos, 2011) | Rand Holub's lettering for Monterey | **Redrew the lowercase joins** instead of inheriting the metal ones | 1,200+ glyphs |
| **Bickham Script** (Richard Lipton, Adobe; 1996; Pro 3 in 2016) | George Bickham, *The Universal Penman* | **Standardised joins**: "most letters joined in a consistent, standard way". Restrained default alternates. Pro 3 places alternates at the **beginning, middle or end of a word**, and worked hardest on **short words, where repeats show most** | 1996: 43 alternate lowercase, 27 beginning and 19 ending forms. Pro 3 adds Greek and Cyrillic |
| **Zapfino** (Hermann Zapf, from a 1944 sketch; Linotype 1998; Extra with Akira Kobayashi, 2003/04) | Zapf's calligraphy | Huge alternate sets (9 forms of "d"), with automatic ligatures and contextual swaps | Extra: 1,676 glyphs |
| **Mistral** (Roger Excoffon, Fonderie Olive, 1953) | **Excoffon's own handwriting** | The lowercase joins on one line "to an extent unusual in script fonts", within metal type, with brush-and-ink irregularity in each letter | Frutiger reportedly studied it under a loupe and couldn't tell how it was done |
| **Caflisch Script** (Robert Slimbach, Adobe, 1993; Pro 2001) | Max Caflisch's hand | Keeps "the natural letter joins" in a practical text face | n/a |
| **Tekton** (David Siegel, Adobe, 1989/90; multiple master 1993) | Architect **Frank Ching**'s book lettering | A trained, consistent hand: its personality is in proportion, not noise. Weight and width axes for signage | 18 styles |
| **P22 artist series** (Richard Kegler et al.) | Cézanne (1996, for the Philadelphia Museum of Art); Vincent (van Gogh's letters to Theo); da Vinci (including mirror writing) | **Provenance**: a named real hand. P22 itself began with a Duchamp font | n/a |
| **FF Kosmik** (LettError, c.1993) | Erik van Blokland's comic lettering | A **"flipper"**: 3 variants per glyph, swapped by contextual alternates. It ran "in pure PostScript before OpenType". "With three alternates for each glyph, most repeating patterns could be solved" | 3 variants |
| **Beowolf** (LettError, 1990) | n/a | The PostScript `freakto` command moved outline points at random **at print time**. The OpenType edition cycles 6 pre-randomised variants. Robin Kinross saw "an excess of variation, and to no great effect" | 3 roughness levels |
| **FF Erikrighthand / Justlefthand** (LettError, 1990) | A fat marker; a thin fineliner held left-handed | "Quickly drawn and scanned". "Functional rather than fancy", for "reminders and shopping lists". "Inappropriately used ever since" | n/a |
| **Samantha** (Laura Worthington) | Pointed pen | Many alternates. Each one also gets its own character code (a Unicode Private Use Area slot) so crafters' apps without OpenType can still reach it. Crafters drove over half her sales | 1,100+ alternates and swashes |
| **Flirt Script** (Positype, Neil Summerour, 2014) | Monoline cursive | "Three variable-height strike points" through calt: **each letter's exit height becomes a state the next letter reads** | 2,700+ glyphs |
| **Shameless** (Positype) | Summerour's own hand (Kuretake Zig pens) | Almost no ligatures; flow comes from contextual alternates | n/a |
| **LiebeDoris, LiebeHeide** (LiebeFonts, Ulrike Rausch) | Rausch's hand | 4 variants. The rules **look several letters back**, which fixes "mama/papa" (a one-letter look-back repeats every "a"). LiebeHeide is a colour font of photographed ballpoint ink | 4 variants |
| **Playwrite** (TypeTogether) | 40+ countries' school models (Primarium research) | A **type engine**: country "recipes" set slant, speed and extender length, then pick letter variants | TDC 2025 Certificate; D&AD Yellow Pencil 2025 |

**Liza's features**, from Underware's own guide:
- **LetterMixer** mixes shapes so letters rarely repeat, and **LetterSwapper** changes identical neighbours.
- **ProtoShaper** swaps in hand-painted 2- and 3-letter ligatures.
- **Out of Ink** breaks the flow after 3 to 8 letters, depending on the letters' shape.
- **Introducer and Finalizer** style the first and last letter of a line.
- **SmartCaps** change capitals by their position in the word.
- **Penetrator** balances initial and final forms across long text.

Sources:
- Liza: https://www.myfonts.com/collections/liza-font-underware and the user guide (https://www.underware.nl/download/liza/pdf/Liza-User-Guide-Officielle.pdf, read through a mirror)
- Bello: https://www.underware.nl/fonts/bello/features/how_does_it_work/
- Auto: https://myfonts.com/pages/newsletters-cc-200801
- Ed Interlock: https://luc.devroye.org/fonts-27367.html
- Studio Lettering: https://typographica.org/typeface-reviews/studio-lettering/
- Sudtipos: https://myfonts.com/fonts/sudtipos/burgues-script and https://www.myfonts.com/fonts/sudtipos/feel-script
- Bickham: https://blog.typekit.com/alternate/creating-bickham-script/ and https://blog.typekit.com/alternate/building-contextual-behavior-an-essential-part-of-the-design-process
- Zapfino: https://en.wikipedia.org/wiki/Zapfino
- Mistral: https://en.wikipedia.org/wiki/Mistral_(typeface) and https://eyemagazine.com/feature/article/mr-mistral
- Caflisch: https://fonts.adobe.com/fonts/caflisch-script-pro
- Tekton: https://www.myfonts.com/collections/tekton-font-adobe
- P22: https://en.wikipedia.org/wiki/P22_(type_foundry)
- LettError: https://letterror.com/kosmik, https://letterror.com/fonts/randomfonts.html and https://letterror.com/fonts/hands.html
- Worthington: https://typedrawers.com/discussion/comment/18006
- Positype: https://myfonts.com/fonts/positype/flirt-script and https://www.myfonts.com/fonts/positype/shameless
- Rausch: https://beyondtellerrand.com/events/dusseldorf-2021/speakers/ulrike-rausch
- Playwrite: https://www.typetogether.com/2025_playwrite-wins-tdc

### 2.2 Awards and talks

- **TDC:** Burgues Script (TDC2 2008). Playwrite (2025), which also won the D&AD Yellow Pencil, ED-Awards Gold and Joseph Binder Gold.
- **Granshan:** I found no handwriting winners. It focuses on non-Latin text faces, and the search wasn't exhaustive.
- **ATypI:**
  - Underware's **"Grammatography"** (Tokyo 2019): letters "unspecified until they are written". It is the conceptual ancestor of a live hand (https://atypi.org/presentation/grammatography/).
  - Copenhagen 2025:
    - Robert/Boisen's generative handwriting (section 3).
    - Burian and Scaglione on Primarium and Playwrite.
    - Yehang Yin's "Towards Infinite Styles: Do We Even Need Fonts?", a real-time generative lettering tool priced by use rather than licensed (https://atypi.org/presentation/towards-infinite-styles-do-we-even-need-fonts/).
- **Apple Chancery** (Kris Holmes) is often cited as Apple's showcase for contextual alternates **(unverified)**.

### 2.3 Four techniques that keep recurring

1. **Mix by context, don't roll dice.** Underware: "Being random alone does not guarantee" a handmade look (https://www.printmag.com/print-design-articles/lettercentric-type-as-writing/). Beowolf, the truly random font, was judged "an excess of variation".
2. **Standardise the join and vary the rest.** Bickham fixes join heights, Mistral uses one line, Flirt allows three heights, and Playwrite derives each entry from the previous exit.
3. **Position carries meaning.** Beginning, middle and end forms appear in Bickham, Burgues, Liza, Bello and Playwrite.
4. **Ink is a resource.** Only Liza models it, and only with a counter of 3 to 8 letters.

---

## 3. Agency and brand work

### 3.1 Verified cases

| Brand | Who made it | How it was produced | Deployed | Status |
|---|---|---|---|---|
| **innocent**, "innocent hand" (2025) | In-house team with lettering artist Carol Kemp. Brand by Derek&Eric; Rob Clarke redrew the logo and "innocent sans" | A new hand-drawn typeface. Source hand and alternate count not published | Packaging | Verified from a Design Week snippet; one caption credits Clarke instead |
| **Lush**, "Lush Handwritten" | The font file names **Dalton Maag**, © 2014 Lush's parent company | A proprietary handwriting font with per-script builds. Whose hand it is: **unverified** | Labels (assumed) | Partly verified |
| **Coca-Cola** (1886) | Frank M. Robinson | Spencerian, "the ornate handwriting style of the day", because "the two Cs would look well in advertising". A logo, not a font | Logo | Verified |
| **"Share a Coke"** (2011) | Ian Brignell | A custom "You" font for printing names, styled after the Coke script | Bottles | Verified |
| **Mailchimp** | Jessica Hische refreshed the script logo (2013). Collins and the in-house team rebranded in 2018 | The 2018 rebrand **dropped the script** for a chunky wordmark and Cooper, plus hand-drawn illustration | Logo, illustration | Verified |
| **Trader Joe's** | Each store's "Sign Artists" | Hand-painted signs; no stencils, **no font**. Said to "emphasize the personal relationship" | In-store | Verified |
| **Apple "hello"** | 1984: attributed to Susan Kare (secondary sources). 2021: the macOS 11.3 screensaver, designer uncredited | **Drawn and animated lettering**, not a font | Ads, setup screen, screensaver | Partly verified |
| **Shantell Sans in use** | Shantell Martin with Arrow Type; Google Fonts paid for extensions | Felt-tip pangrams scanned, traced along the centre of the stroke, then normalised; `rlig` cycles alternates | Cash App card; **tldraw**'s writing font; **Whitney Museum shop** key tags | Verified |
| **P22 Cézanne** (1996) | P22 for the **Philadelphia Museum of Art** | Built from the artist's letters for an exhibition, then sold commercially | Exhibition, then everywhere | Verified |
| **Robert/Boisen & Like-Minded** (Copenhagen agency) | Christoffer Birkkjær and Tore Rosbo, of an unnamed "newly founded design agency" | **An AI image model trained on handwritten words**, delivered as an online generator: type a word, get handwritten type or icons. Paired with a variable custom font | Brand system | The ATypI 2025 talk is verified. **No launch or case study found** |

**Common myths, checked:**
- **Oatly:** Forsman & Bodenfors with Lars Elfman use hand-drawn-feeling display faces (John Rounded, Toni Grotesk). There is **no font made from anyone's handwriting**.
- **innocent** was **not** by Pearlfisher.
- **Starbucks** (Lettermatic: Sodo Sans, Lander, Pike) has **no handwriting font**.
- **Dropbox** (2017) uses Sharp Grotesk, "inspired by hand-drawn poster lettering", but **no handwriting font**.
- **Ben & Jerry's** lettering is credited to Lyn Severance, and Chank Diesel lists the brand as a client, but no "Chunky" font was found.
- **No 2013 Apple "hello"** was found.
- **Google** has no handwriting brand font.

Sources:
- innocent: https://www.designweek.co.uk/derekeric-heroes-the-dude-logo-for-innocents-brand-refresh/ and https://robclarke.com/work/innocent/
- Coca-Cola: https://www.coca-colacompany.com/about-us/history/coke-lore-trademark-chronology
- Share a Coke: https://en.wikipedia.org/wiki/Share_a_Coke
- Mailchimp: https://fontsinuse.com/uses/39539/mailchimp-identity-2018-redesign
- Oatly: https://fontsinuse.com/uses/37736/oatly-packaging-2015
- Trader Joe's: https://www.tastingtable.com/1141691/who-creates-all-the-hand-painted-signs-at-trader-joes
- Dropbox: https://sharptype.co/case-studies/dropbox
- Apple: https://9to5mac.com/2021/04/21/hands-on-apples-new-hello-screen-saver-for-m1-macs-running-macos-11-3-video/
- Robert/Boisen: https://atypi.org/presentation/variable-type-and-generative-handwriting-in-brand-design/

### 3.2 Robot-pen companies

| Service | Method | Custom style | How they fight repetition |
|---|---|---|---|
| **Handwrytten** | About 175 robots holding real pens; 23–35 stock styles | **$1,750 for print, $2,000 for cursive.** You fill in a paper packet, and staff rebuild the hand in 1–4 weeks | "We alternate characters so no two look alike and we vary line spacing and the edge" (founder David Wachs). **No alternate count published** |
| **Simply Noted** | 220+ ballpoint robots | Not published | Claims only ink variation and pen indentation |
| **Bond** | Robot arms with pen, brush or marker | $199 (2015) to $1,500 (2016) | A "couple dozen variations per letter" claim **couldn't be traced**. The domain now belongs to another business |
| **Thankster** | A library plus custom styles | Low or free | **Merges up to 5 handwriting samples** into one "Font Group" |
| **Inkpact** (UK) | 2,000 human scribes, plus an "AI-Scripted" tier | Not stated | Not stated |

Sources: https://siliconangle.com/2023/09/29/duplicating-charm-handwritten-messages-large-scale/ · https://handwrytten.helpscoutdocs.com/article/53-make-your-mark-with-custom-fonts · https://newatlas.com/bond-handwriting-robot/36083/ · https://thankster.com/faq · https://inkpact.com

### 3.3 What the brand cases add up to

- **Why handwriting:** human presence and a personal relationship (Trader Joe's), a chatty voice (innocent), heritage (Coca-Cola).
- **How it's made:** mostly as **lettering, not fonts**: logos, signs and illustrations drawn once. Where a real brand handwriting font exists, its alternate count and source hand stay private.
- **Where it's deployed:** packaging and in-store first. Motion is rarest, and Apple's "hello" is animated by hand.
- **Direction of travel:** brands are leaving script logos (Mailchimp 2018; Johnson & Johnson 2023, per [Fast Company](https://www.fastcompany.com/90984954/brands-dumping-script-logos-who-is-next)) for type that is **drawn but not handwritten**, like Sharp Grotesk and John Rounded. Handwriting survives as voice, illustration and personalisation.
- **The opening:** generative handwriting in identity work is nearly absent. The one case is undocumented. The robot-pen trade sells "real pen" authenticity, stays silent about variation, and still makes customers fill in paper packets.

**Not checked (the search quota ran out); leads only, from memory:**
- Handwriting-led identities by Pentagram, Koto, DixonBaxi, Wolff Olins and Base.
- Museum identities built from an artist's hand: Van Gogh Museum, Anne Frank House, Munch, Frida Kahlo.
- Jamie Oliver's handwriting branding.
- Signature logos: Disney, Kellogg's, Paul Smith, Cadbury.
- Hallmark's lettering studio.

---

## 4. Synthesis: what the best ones do well

**1. Consistency against liveliness.** The best fonts keep three things nearly fixed: the **x-height band, stroke weight and join height**. Shantell Sans normalised Martin's hand for "consistent heights, widths, and spacing" but kept her shapes, and Lipton standardised Bickham's joins. The liveliness lives in shape alternates, size rhythm (Swing), small baseline moves (Bounce, Handlee) and ink (Liza). For us, variation should come in layers:
   - **Writer (the seed):** the largest.
   - **Paragraph:** drift and fatigue.
   - **Word:** slant and pressure move together.
   - **Letter:** which alternative form (allograph) is used.
   - **Stroke:** tremor, the smallest.

   Within one writer, x-height should move only a few percent **(our starting value, not sourced)**.

**2. Avoiding the repeated-letter tell.** Three alternates fix most patterns (Kosmik, Caveat), four is comfortable (LiebeDoris), seven is luxury (Playpen, Great Vibes). **The look-back window matters more than the count.** Short words and double letters (ll, ee, oo, ss, tt) are where repeats show (Bickham Pro 3). Remember too that **real writers have a few allographs, not infinite forms.** Someone may use two "r"s and a word-final "s", but builds "a" the same way every time. Overdo the variation and the text reads as several people.

**3. Word-shape rhythm.** Words are written as units. Burgues and Liza flourish the start and end of a word or line and keep the middle quiet, and Swing makes sizes rise and fall across a word. A real word has an **envelope**: a careful first letter, a little speed and lost height toward the end, a trailing exit **(our observation, consistent with positional-form practice)**. Baseline variation reads truer **per word** (the whole word tilts) than **per letter** (every glyph hops).

**4. Connection strategies.**

| Strategy | Examples | Trade-off |
|---|---|---|
| One fixed join line | Mistral, metal scripts | Reliable and fast-looking, but uniform |
| Standard joins with exceptions | Bickham | The classic compromise |
| Join heights as discrete states | Flirt (3 heights) | Natural-looking, but the rules multiply |
| Entry stroke chosen from the previous exit | Playwrite's TRACKBACK lookup | Closest to real writing, but glyph-hungry |
| Ligature-led | Lobster, Bello, Liza, Ed Interlock | Beautiful for planned pairs, patchy for the rest |
| Semi-connected print | Playwrite NZ, Shameless, Caveat | Most like everyday adult writing |

A live engine can **compute each join from the real exit point and its direction**, with no states. "Joins or lifts here" should be a writer trait: a join rate, plus habitual pen lifts (before capitals, at awkward pairs).

**5. Spacing and kerning irregular letters.**
- Space by the ink, not the box (the engine already does).
- Bickham kerns every special pair, and Ed Interlock nests letters instead of spacing them.
- Real word spaces vary more than letter spaces, and they shrink near the end of a line.
- Collisions are the hidden cost. Bickham's restrained defaults exist "to avoid awkward collisions", and Zapfino's loops make it unusable in running text.
- A live engine can **shorten a loop that would hit the next line**, as real writers do. A font can't.

**6. Legibility at small sizes.** Script costs comprehension. In Song and Schwarz (2008), instructions set in Brush Script made an exercise routine *seem* harder and longer than the same text in Arial (https://news.umich.edu/if-its-hard-to-read-is-it-hard-to-do).
   - **What survives at small sizes:** a large x-height, open counters, low contrast, modest slant, and letters that are clearly distinct. Nixon: "make sure that the characters could be distinguished from one another".
   - **What fails:** closing loops (Caveat), thinning ballpoint (Reenie Beanie), tiny formal x-heights.
   - **For us, an "optical size" for hands:** when text renders small, automatically raise neatness, cut tremor, thicken hairlines and open the spacing.

**7. Multilingual coverage.**
   - **The leaders:** Liza (219 languages); Shantell (380+, Latin and Cyrillic); Playwrite (national models); Bickham Pro 3 (Greek and Cyrillic, which needed new rules because repeats behave differently in short words); Kalam (Devanagari); Nanum Pen Script (Korean).
   - **Most popular Google handwriting fonts are Latin-only.**
   - **Locale is also a trait of the hand.** Studio Lettering switches its r, 7 and p by language.
   - **Accents and dots are written after the word, and land loosely.** The engine's `strokeShift` already models this for i-dots and t-bars.

**8. Personality against neutrality.** Schroll, Schnurr and Grewal (*Journal of Consumer Research*, 2018) found that handwritten typefaces raise "perceived human presence" and lifted sales of indulgent products, but not functional ones **(read through summaries such as https://www.smartcompany.com.au/marketing/handwritten-typefaces-can-increase-sales-indulgent-products/; the paper itself wasn't read)**. Personality can be a dial on one skeleton: Auto's three italics and Shantell's Informality axis both work that way. The product needs a calm "note" mode for UI and a loud mode for display, from the same writer.

**9. What makes a handwriting font feel cheap.**
   1. Identical repeats, or a 2–3-form cycle you can spot across a paragraph.
   2. Scan-and-trace outlines: lumpy edges that read as low resolution rather than ink.
   3. The same wobble at the same strength on every stroke, so it reads as a filter, not a hand.
   4. Joins that gap, blob or double up.
   5. Texture that's wrong for the tool, like pointed-pen contrast on a marker hand.
   6. Digits, punctuation, accents or "@" that fall back to a system font, or were never drawn in the same hand.
   7. Script capitals mid-sentence, or all-caps set in a script.
   8. Features left switched off. Illustrator often has contextual alternates off, Canva has no toggle, and Word disables them by default, so even a good font looks fake once deployed.

**10. Overused genres in branding.**

| Cliché | Typical fonts | Where it's tired |
|---|---|---|
| Wedding or boutique script | Great Vibes, Allura, Edwardian | Invitations, salons, real estate |
| Retro surf or baseball script | Pacifico, Lobster, Yellowtail | Fast-casual food, 2012-era startups |
| "Quirky" kids' marker | Comic Sans and Comic Neue, Gloria Hallelujah, Indie Flower | Edtech, "fun" fintech |
| Coffee-shop chalk | Amatic SC, chalkboard faces | Cafés, markets, grocery |
| Brush-pen lettering | Kaushan- and Satisfy-style brush scripts | Fitness, influencer merchandise from 2014–19 |
| Signature monogram | Signature scripts | Personal brands, cosmetics |

Brush Script's decline is the warning. Typographica blames its overuse on cheap font bundles, not on its design (https://typographica.org/typeface-reviews/atf-brush/). **Ubiquity, not quality, turns a hand into a cliché.** A generator that never gives two customers the same hand is structurally protected from that.

---

## 5. Gaps and opportunities for a seeded generator

| Where fonts stop | Evidence | What live generation can do |
|---|---|---|
| **A finite stock of alternates** | 3 (Kosmik, Caveat), 4 (LiebeDoris), 6 (Beowolf), 7 (Playpen) | Never repeat, while staying inside one writer's set of allographs so it reads as one person |
| **A short look-back, and rules that multiply** | Rausch's mama/papa; Caveat's 5-letter window | Remember the whole text, with per-writer positional habits |
| **Uncorrelated variation** | Each alternate is drawn on its own | Slant, pressure and size drift together across a word; fatigue builds across a page |
| **Blind to the line and page** | Liza's line-start and line-end features are the ceiling | Squeeze words at the line end, write uphill on unlined paper, shorten loops before they collide, let the margin creep |
| **Ink is a counter** | Out of Ink: 3 to 8 letters | Model ink per pen: ballpoint skips, fountain-pen pooling and fade before a re-dip, pencil grain and wear, marker bleed |
| **No time** | No font has stroke order; Apple's "hello" is hand-animated | Animate the writing stroke by stroke |
| **Blind to set size** | Caveat closes up when small | "Optical size" for hands |
| **Joins are discrete states** | Flirt's 3 heights; Playwrite's glyph count | Geometric joins for every pair, with a per-writer join rate |
| **Locale is an afterthought** | Studio Lettering and Playwrite are the exceptions | "Where you learned to write" as part of the seed: crossed 7, continental 1, French upright cursive, German forms |
| **Identity needs a real person** | P22; robot-pen custom styles at $1,750–2,000 | A unique, reproducible, licensable writer per customer, with nobody's hand scanned and no paper packet |
| **Apps hide the features** | Word, Illustrator, Canva; Worthington's Private Use Area workaround | Web embed, SVG and PNG export, single-line output for plotters. The variety never depends on an app |
| **No writing artefacts** | No font does corrections | Optional rare extras: a crossed-out word, an inserted caret, a re-traced letter. **Off by default, or they become a gimmick** |

**The trap to avoid:** Beowolf proved that moving points at random is not handwriting. The variety has to come from **structure**: which allograph, where in the word, how fast, how much ink. Jitter is the last and smallest layer.

---

## 6. Preset hands for the product

Twelve archetypes, each distinct, each tied to a real job, and each clear of the clichés in 4.10. Parameter names follow `engine/hand.js` where they exist. *Italics* mark knobs the roadmap still needs: skeleton variants, join rate, line behaviour, fatigue.

| # | Preset | What it's for | References | Parameter direction |
|---|---|---|---|---|
| 1 | **Letter to a friend** | Personal notes, longer text | Caflisch Script (natural joins); Liza Text (mixing); Biro Script Plus (ballpoint) | Semi-cursive; *join rate* 0.6–0.8; `slant` 8–14°; `neatness` 0.5–0.65; ballpoint; `drift` medium; *fatigue* on |
| 2 | **Thank-you card** | B2B and robot-pen mail, gifting | Robot-pen house styles (3.2); Schroll et al. on warmth | `neatness` 0.75–0.85; `xHeight` 0.58 or more; gel pen; *join rate* 0.3–0.5; `tremor` low; exports as a single line |
| 3 | **Architect's notes** | Plans, product sketches, annotation | Tekton (Frank Ching); Architects Daughter | `slant` 0–2°; `neatness` 0.85+; `xHeight` 0.62–0.68 for a small-caps feel; thin, even `penWidth`; `pressure` ≈ 0.1; `roundness` low; wide letters; extra tracking; crossbars rising slightly |
| 4 | **Field journal** | Travel and science notes, captions | P22 da Vinci; FF Justlefthand (fineliner); Reenie Beanie | Pencil with grain; small `xHeight`; tight `sidebearing`; `neatness` 0.4–0.55; high `strokeShift` and `drift`; strong *fatigue*; *line-end squeeze* |
| 5 | **Whiteboard draft** | Wireframes, diagrams, "this is a sketch" UI | Shantell Sans (tldraw's writing font); FF Erikrighthand (fat marker); Excalidraw's hand font, the same idea **(unverified)** | Chisel marker; thick `penWidth`; print with no joins; `neatness` 0.5; bounce per word; arrows and underlines as companion marks |
| 6 | **Margin notes** (the red pen) | Feedback on documents and screenshots | FF Erikrighthand; Shantell Sans | Red felt tip; large; `slant` changes word to word; short words; ticks, circles and carets as optional marks |
| 7 | **Postcard** | Short warm messages in small spaces | Caveat (compact); Homemade Apple | `width` about 0.8; small `xHeight`; tight leading; *line-end squeeze*; *uphill drift* with no ruled lines; fountain pen or ballpoint |
| 8 | **Recipe card** | Heritage, food, family | Palmer Method (1915, public domain); Bickham as the formal ancestor | Script on *Palmer skeletons*; `slant` 20–28°; `neatness` 0.6; high `tremor` (age); fading ink; crossed 7 and looped 2; fractions and abbreviations |
| 9 | **First letters** | Education, children's products | Playwrite Guides (real school models), deliberately not Comic Sans or Gloria Hallelujah | Pencil; large; on guide lines with over- and undershoot; `neatness` 0.25–0.4; high `pressure`; `slant` uncorrelated letter to letter; uneven spacing; a rare mirrored s or z |
| 10 | **Italic hand** | Everyday calligraphy, menus, certificates | Caflisch Script; restrained Zapfino; broad-nib manuals | Broad nib; `nibAngle` 30–40°; `slant` 5–10°; `neatness` 0.85–0.95; high contrast; joins only on diagonal exits; flourishes only at word starts and ends |
| 11 | **Signature** | Sign-offs, one-word marks | Mistral (speed); Burgues (flourished ends); Mrs Saint Delafield (built from signatures) | Script; `neatness` 0.1–0.3; oversized first capital; letters dwindling to a line; trailing exit stroke and underline; high `slant`. **Never imitate a real person's signature** |
| 12 | **Backhand diary** | A private, inward voice; journaling apps | FF Justlefthand (a left hand) | `slant` −5 to −12°; compact; small `xHeight`; rounded forms; low `pressure`; optional graphite drag (smudge on the letters that follow) |

How the set covers the ground:
- **Coverage:** practical notes (3, 5, 6), commercial (2, 7), personal voice (1, 4, 8, 12), special cases (9, 10, 11). Only 10 and 11 are formal.
- **No "wedding script" or "chalkboard" preset.** Those looks are cheap and everywhere already. Anyone who wants them can still reach them with the knobs.
- **Each preset is a family of seeds, not one hand.** Rerolling inside "Recipe card" should meet a new grandmother every time.

---

## 7. Verification notes

- **Unverified or single-source:**
  - Bello's release year.
  - Apple Chancery's contextual alternates.
  - Excalidraw's font.
  - How Mistral was built, beyond "joins on a line" and "his own handwriting". Excoffon's 1956 *Typographica* article wasn't available.
  - The Schroll et al. results, which come from summaries.
  - Liza's numbers, which are the foundry describing itself.
- **Conflicts:**
  - Zapfino Extra's date: 2003 (Wikipedia) or 2004 (Monotype).
  - Tekton's year: 1989 or 1990.
  - Playwrite's research: 18 months (Google) or three years (European Design Awards). It covered 40+ countries, but only 36 ship on Google Fonts.
- **Not reached when the search quota ran out:** the agency and museum leads in 3.3, and any Typotheque handwriting typeface. Typotheque's contribution here is its Handwriting Database, already in `references/`.
