## Present-day adult handwriting, mixed print and cursive, France 2022–23 — style `adult-fr-2023` ("Everyday French 2023", print family)

| | |
|---|---|
| Item | *CREMMA-Wikipedia*: volunteers each copied an excerpt of a randomly chosen Wikipedia page by hand, 2022–23. Ground truth of contemporary French handwriting for HTR (CREMMA project, HTR-United) |
| Copy | HTR-United, https://github.com/HTR-United/cremma-wikipedia (page images `data/batch-NN/*.out.png` and ALTO 4 line transcriptions `*.out.xml`); six pages downloaded, listed in `tools/trace/manifest/cremma-wikipedia.json` |
| Rights | Creative Commons Attribution 4.0 International (repository licence cc-by-4.0 and README "License" section). Not share-alike. Credit: "CREMMA-Wikipedia (HTR-United), volunteers' handwritten copies of Wikipedia excerpts, 2022–23; CC BY 4.0" |
| Traced | 136 letters from six volunteers whose hands mix print and joined letters: a–z complete (cursive and print forms of b, e, f, g, h, k, l, r, t, v, w, y, z), 21 capitals, 0–9. O, Q, X, Y, Z, accented letters and punctuation borrow the Hershey print forms. Joined letters were cut out of words at the thinnest connector (slanted cuts), keeping a short natural tail; y and t of batch1_08 drawn by hand (`manual`), the cursive M and one F snapped through `via` waypoints. Batch 07 (a school class of 11-year-olds) was left out: adults only |
| Used in | `tools/trace/hands/adult-fr-2023.json` → `engine/sources/adult-fr-2023.js`; each variant carries `tags.writer` and its page as source |
| Movement | Everyday adult writing, not a school model: print a (single-storey), d with a straight stem, print s and r beside cursive looped l, h, k, b, e, a ʒ-like z (z.3), looped f and g, a peaked cursive r (r.1, weighted down) and a cursive M with a long lead-in. Letters lift between most pairs; joined letters keep only a short tail of their connector. Upright to slightly slanted (writers lean 1°–22°; straightened to 0 and the engine adds the seed's own slant). Small, rounded x-height (0.5 of cap height) with tall looped ascenders. Continental numerals: flagged 1 (1.2), crossed 7 (7.2) |
| Note | The small 0 is one writer's real habit (zeros at x-height in "800", "3000"), kept as written. Two faithful forms that read as other letters out of context are weighted down so most seeds pick the clearer one: the looped p of batch6-051 (0.35) and the open-bowl b of batch6-047 (0.4). The volunteers consented to publication and are anonymised; their writing is used for letterforms only, never their text. Writers are named by page |
| Review | Coordinator review: descRatio 0.36 so j stays on the page; batch6-051's dash-dotted i written as a dot |

Letters per volunteer (writer key, page, own slant before straightening, letters taken):

| Writer | Page | Slant | Letters |
|---|---|---|---|
| cremma-batch6-022 | [data/batch-06/batch6-022](https://github.com/HTR-United/cremma-wikipedia/blob/master/data/batch-06/batch6-022.out.png) | +14° | acdefilnoprstuvHILMPSV |
| cremma-batch6-047 | [data/batch-06/batch6-047](https://github.com/HTR-United/cremma-wikipedia/blob/master/data/batch-06/batch6-047.out.png) | +8° | abcdeglmosvyz (z twice) ADEG |
| cremma-batch6-053 | [data/batch-06/batch6-053](https://github.com/HTR-United/cremma-wikipedia/blob/master/data/batch-06/batch6-053.out.png) | +22° | bcefqtvFIPU459 |
| cremma-batch6-051 | [data/batch-06/batch6-051](https://github.com/HTR-United/cremma-wikipedia/blob/master/data/batch-06/batch6-051.out.png) | +5° | bcdegijklmnopqrstuvxCFL35 |
| cremma-batch1_08 | [data/batch-01/batch1_08](https://github.com/HTR-United/cremma-wikipedia/blob/master/data/batch-01/batch1_08.out.png) | +4° | acdefghklmoqrtyzJKPRSTUV01236789 |
| cremma-batch2-53 | [data/batch-02/batch2-53](https://github.com/HTR-United/cremma-wikipedia/blob/master/data/batch-02/batch2-53.out.png) | +1° | acdehinqrstuw (w twice) ABCEHINPW46 |
