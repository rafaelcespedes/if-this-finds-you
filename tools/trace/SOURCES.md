# Sources of the traced hands

Every skeleton in `engine/sources/{palmer,suetterlin,arrighi,quebec-print}.js` was traced from the items
below. Rights were read on each holder's own page on 2 November 2026 (details and download URLs:
`tools/trace/manifest.json`). We copy letter **structure** as new centerline drawings; we never copy or
display the source's text. For the reference library: each row is one reference; the hand file named
in "Used in" lists exactly which letters came from where.

## American business hand, 1915 — style `palmer` ("Business 1915", joined)

| | |
|---|---|
| Item | Austin Norman Palmer (1859–1927), *The Palmer Method of Business Writing*, New York: The A. N. Palmer Company, 1915. Page 29, "Special studies of the capitals, small letters, and figures" |
| Copy | Smithsonian Libraries, scanned for the Biodiversity Heritage Library, Internet Archive: https://archive.org/details/palmermethodbus00palm (leaf n30) |
| Rights | "Public domain. The Library considers that this work is no longer under copyright protection" (Internet Archive record). US 1915 publication; author died 1927 |
| Traced | A–Z (two forms of E), a–z, 0–9; punctuation borrowed from the Hershey script style |
| Used in | `tools/trace/hands/palmer.json` → `engine/sources/palmer.js` |
| Note | "Palmer Method" is a trademark: don't use it as a product name. Describe the hand as American business writing, 1915 |

## German school hand, 1917 — style `suetterlin` ("German school 1917", joined)

| | |
|---|---|
| Item | Ludwig Sütterlin (1865–1917), *Neuer Leitfaden für den Schreibunterricht*, Berlin: Albrecht-Dürer-Haus, 1917, p. 85, fig. 33, "Lateinisches Alphabet mit Schnurzug" (the Latin-alphabet form of the Sütterlin school hand) |
| Copy | Wikimedia Commons: https://commons.wikimedia.org/wiki/File:S%C3%BCtterlin_,_lateinisches_Alphabet.jpg |
| Rights | Public domain (Commons; author died 1917) |
| Traced | a–z with long s (ſ) and ß, A–Z, ä Ä. The plate has no Arabic numerals: digits and punctuation borrow the upright Hershey print forms |
| Used in | `tools/trace/hands/suetterlin.json` → `engine/sources/suetterlin.js` |
| Note | Present as an ordinary school hand of 1915–41, never as "old Germany" styling (hand-traditions.md §7). The Kurrent form is not traced yet |

## Italian chancery italic, 1522–24 — style `arrighi` ("Chancery 1524", print family)

| | |
|---|---|
| Item | Ludovico degli Arrighi, called Vicentino (1475–1527), *La Operina da imparare di scrivere littera cancellarescha*, Rome, 1522–24; woodcuts by Ugo da Carpi |
| Copy | Getty Research Institute, Internet Archive: https://archive.org/details/laoperinadiludou00arri (leaves n28 and n25). Houghton Library's copy of the same book is on Commons under the Public Domain Mark |
| Rights | Work of 1524, public domain everywhere; no restriction on the Internet Archive record |
| Traced | a–z (two g, two x, long s ſ) and the et-ligature (&) from leaf n28; plain capitals from n28, with A, E and L from the paired capitals of n25. Arrighi writes U and J as V and I: those forms serve. W and digits borrow the Hershey print forms |
| Used in | `tools/trace/hands/arrighi.json` → `engine/sources/arrighi.js` |
| Note | m, n, p, r and ſ were drawn over the woodcut by hand (the broad nib merges strokes the skeleton can't separate) |

## Present-day adult print, Québec 2024 — style `quebec-print` ("Print 2024", print family)

| | |
|---|---|
| Item | *Copiste d'un jour*: 267 volunteers each copied a Wikipedia summary by hand, 2024. Ground truth of contemporary Québécois handwriting for HTR |
| Copy | Bibliothèque et Archives nationales du Québec (BAnQ), https://github.com/banq-dcn/Copiste-d-un-jour (page images and ALTO line transcriptions) |
| Rights | Creative Commons Attribution 4.0 International (repository licence and README). Not share-alike. Credit: "Copiste d'un jour, Bibliothèque et Archives nationales du Québec (2024), CC BY 4.0" |
| Traced | Letters from 13 volunteers who print; four of them supply most letters. T, U, Z and z didn't align in any page and borrow the Hershey print forms |
| Used in | `tools/trace/hands/quebec-print.json` → `engine/sources/quebec-print.js`; each variant carries `tags.writer` and its page as source |
| Note | The volunteers consented to publication; their writing is used for letterforms only. Writers are anonymous: we name them by page |

Letters per volunteer (writer key, page, own slant before straightening, letters taken):

| Writer | Page | Slant | Letters |
|---|---|---|---|
| banq-w0238 | [wikitexte_0238](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0238.jpg) | +6.1° | 12569ACFILMNSabcdefgijklnopqrstuxy |
| banq-w0074 | [wikitexte_0074_1](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0074_1.jpg) | -4.4° | 589JPdejlopsuy |
| banq-w0074 | [wikitexte_0074_2](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0074_2.jpg) | -4.4° | 1ACFGIabghmnqrt |
| banq-i0177 | [imp_wikitexte_0177](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/imp_wikitexte_0177.jpg) | -3.1° | 01289BDILNRSabcefgilopqrstuy |
| banq-w0048 | [wikitexte_0048](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0048.jpg) | +16.5° | 012379Igjlpst |
| banq-w0190 | [wikitexte_0190_1](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0190_1.jpg) | +11.0° | 4Q |
| banq-w0190 | [wikitexte_0190_2](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0190_2.jpg) | +11.0° | w |
| banq-w0201 | [wikitexte_0201_1](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0201_1.jpg) | -0.7° | E |
| banq-w0201 | [wikitexte_0201_2](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0201_2.jpg) | -0.7° | V |
| banq-i0264 | [imp_wikitexte_0264](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/imp_wikitexte_0264.jpg) | -10.4° | K |
| banq-w0200 | [wikitexte_0200_1](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0200_1.jpg) | -5.5° | H |
| banq-w0244 | [wikitexte_0244](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0244.jpg) | +10.8° | W |
| banq-w0107 | [wikitexte_0107](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/wikitexte_0107.jpg) | +0.0° | Y |
| banq-i0147 | [imp_wikitexte_0147](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/imp_wikitexte_0147.jpg) | +13.1° | O |
| banq-i0164 | [imp_wikitexte_0164_1](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/imp_wikitexte_0164_1.jpg) | +0.0° | X |
| banq-o0001 | [oldbatch_wikitexte_0001](https://github.com/banq-dcn/Copiste-d-un-jour/blob/main/jpg/oldbatch_wikitexte_0001.jpg) | -5.6° | v |

## Checked, not used yet

| Item | Rights | Status |
|---|---|---|
| Antonio Castilla Benavides, *Curso completo de caligrafía general* (Madrid, 1866), Biblioteca Digital de Castilla y León, https://bibliotecadigital.jcyl.es/es/consulta/registro.do?id=17089 | CC0 (record page) | Downloaded; the Spanish letra española for the next batch |
| Giovanni Battista Palatino, *Libro nuovo* (Rome, 1550), Getty copy, https://archive.org/details/librodimgiovamba00pala | "NOT_IN_COPYRIGHT" (Internet Archive) | Browsed; has a "Lettera Spagnola" plate (n60) worth tracing |
| Sütterlin, Kurrent sample (1917), https://commons.wikimedia.org/wiki/File:S%C3%BCtterlin,_Schriftprobe_(deutsche_Kurrent).png | Public domain (Commons) | Rights checked; the Kurrent form (legibility: historical) is a later batch |
