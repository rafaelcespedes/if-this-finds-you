# Sample letters

Before anyone types, each new hand writes a short real letter. This folder holds those letters:

- `sample-texts.json`: the collection, in the order "New hand" should step through it.
- `check-texts.mjs`: run `node content/check-texts.mjs` to validate it (add `--list` to print every item).
- This file: how the letters were chosen, the rights rules, the credits, and what was left out.

## At a glance

- **117 letters, 116 switched on.** The one switched off is Vietnamese: the engine can't yet write stacked tone marks (Tier 3).
- **Kinds:** 107 letters and 10 notes (short messages left for someone, like Steele's "Dear Prue… one in the morning"). No
  postcards: printed postcards from before 1931 are rare.
- **Languages (enabled):** English 59 (51%), Spanish 10, French 8 (2 from Québec), German 7, Italian 6, Portuguese 5 (2
  Brazilian), Dutch 4, Polish 3, Czech 3, Hungarian 2, Romanian 2, Welsh 2, Catalan 1, Swedish 1, Danish 1, Norwegian 2.
- **Writers:** 95 people. 51 women, 44 men; 66 of the 116 enabled letters (57%) are by women. Fourteen enabled letters are
  by writers of colour: Ignatius Sancho, Phillis Wheatley, Frederick Douglass, Paul Laurence Dunbar, Machado de Assis,
  Toru Dutt (in English and French), Sarojini Naidu and Rabindranath Tagore. Eight come from Latin America.
- **Ordinary people as well as famous ones:** a Norwegian farmer at the 1814 constitutional assembly, two Czech
  gentlewomen of 1611 and 1613, a Florentine widow sending cheeses in 1450, Goethe's seven-year-old son, Liselotte von der
  Pfalz aged seven, Goethe's wife Christiane, Charles Lamb's sister Mary.
- **Span:** 1390 to 1921. Most (75) are from the 1800s.
- **Length:** 27 to 90 words, median 76.

## How the letters were chosen

Rafael's brief: **real letters, not short pieces of literature.** Each item should read as a complete short letter: a
greeting, a few lines, a sign-off. Notes and travel letters home count too. The tone should be warm, curious, sometimes
funny, intimate: something lovely to read in a stranger's handwriting.

**Kept out on tone:** war and soldiers' letters, death and grief, illness as the subject, wills, prison suffering, long
religious passages, anything hateful, and anything twee. Where a good letter also contained something unpleasant (a slur,
an illness, a death), we took only the warm part, and say so in that item's `rights.basis` note.

**Kept out on form:** poems, essays written as letters (Bécquer's *Cartas desde mi celda*), letter-novels, newspaper
reportage with no greeting (Sienkiewicz, Aletta Jacobs), and letters to a likely invented addressee (Mikes Kelemen's
*Letters from Turkey*).

**Method.** Six research passes ran in parallel, one per language group (British and Commonwealth English; American and
diaspora English; Spanish and Portuguese; French, Italian and Catalan; German, Dutch and Nordic; Central European, Welsh and
Vietnamese). Every text was copied from a page or scan that was actually fetched: Project Gutenberg plain texts, Internet
Archive scans, Wikisource, MEK (Hungary), DBNL (Netherlands), the Prague City Library, Runeberg, zeno.org,
vangoghletters.org. A script then matched every fragment of every letter back against its source text. Where the
machine-read text of a scan was unreliable, the letter was read off the page images instead: for example, the Spanish
and Portuguese letters, the Welsh Morris letters and the Nordic letters. Spot checks against the page images confirmed the
transcriptions (the OCR sometimes adds accents the printed page doesn't have).

## Rights rules

Strict, and recorded for every item in `rights`:

| Test | Rule | Field |
|---|---|---|
| **US** | The text was **first published before 1931** | `rights.us`, `rights.firstPublished` |
| **EU and UK** | The writer **died before 1956** (life + 70) | `rights.eu`, `rights.authorDied` |
| **Translation** | The translator also died before 1956, and the translation was published before 1931 | `translator: { name, died, published }` |

- **Every enabled letter passes both tests.** `check-texts.mjs` fails if one doesn't, or if the true/false values
  disagree with the dates.
- `rights.firstPublished` is **the earliest printing we actually saw**, so it can only be the same as or later than the
  true first printing. That makes the US test safe. Example: a Teresa of Ávila letter of 1577 is recorded as "by 1893",
  the edition we read, although her letters were printed from 1658.
- `rights.authorDiedBy` replaces `authorDied` when the exact death year is unknown. It is an upper bound: the two Czech
  women writing in 1611 and 1613 are recorded as "died by 1700".
- **Posthumous first publication** was checked letter by letter. That is why Twain's Santa Claus letter (apparently first
  printed in 1931) and John Adams's "Miss Adorable" note (no printing before 1963 found) are out. Emily Dickinson's letters come only
  from Mabel Loomis Todd's 1894 edition, never the 1955 or 1958 Johnson editions.
- **Translations:** one item, Chekhov in Constance Garnett's 1920 translation (Garnett died 1946). Everything else is in the
  language it was written in. Van Gogh appears in his own Dutch and French, not in translation.
- **First publication of old letters** (for example Welsh letters of 1739 first printed in 1907) can create a 25-year
  publisher's right in the EU. Every first printing here is before 1931, so any such right ran out long ago.
- Project Gutenberg is used only as a source of public-domain text. None of its name or licence text is reproduced.

**Edge cases worth knowing:**
- **Narcyza Żmichowska** (first printed 1930) and **Bolívar** (1929) pass the US test by one and two years.
- **Mansfield** (1928), **Tagore** (1924, 1928), **Gertrude Bell** (1927), **Rosa Luxemburg** (1920): 1920s first printings
  that pass.
- **Van Gogh:** the words are from the original letters, first printed in 1914, but the transcription we copied is the
  Van Gogh Museum's (vangoghletters.org, 2009), whose spelling follows the manuscript. A faithful transcription is not a
  new work in the US or the Netherlands. Germany gives scholarly editions their own 25-year right, so to be extra safe the
  two Van Gogh texts could be re-keyed from the 1914 printing.
- **Sarojini Naidu** (two letters) survives only as quoted by Arthur Symons in 1905. The words are hers; Symons's
  narration is left out.

## How the text is written down

- **Spelling is the writer's own,** including old spellings (Liselotte's 1659 German, Goya's "estubo echa", Słowacki's
  "iak", Dutch "myn"). Nothing is modernised.
- **Long s (ſ) becomes s.** Straight quotes become curly ones (“ ” ‘ ’). Everything else is as printed.
- **Cuts.** These are excerpts. A cut **inside a sentence or paragraph** is marked with an ellipsis "…". A cut at a sentence
  or paragraph break, or between the greeting, the body and the sign-off, is **not** marked, as in most anthologies. Where a
  writer used dots themselves (Caragiale's "fluierat...", Multatuli's "omdat... omdat..."), they stay as full stops, so you
  can tell them apart from our cuts.
- **Line breaks** (`\n`) separate the dateline, the greeting, each paragraph and each line of the sign-off. The layout
  engine wraps long paragraphs.
- **No invented words.** Some first editors printed letters without a greeting or signature (Tagore, Sarojini Naidu, Celia
  Thaxter, Katherine Mansfield, Anne Sullivan, Giuseppina Strepponi, Suor Maria Celeste). Those letters start or end without
  one; we never add one.

## Fields

As in the brief, plus three rights fields that let the checker verify the rules:

```
id            lowercase kebab-case, writer + year (e.g. "carlyle-1850-from-nero")
text          the letter, with \n line breaks
kind          letter | note           (postcard is allowed; none yet)
lang          BCP-47 (en-GB, en-US, en-IN, en-NZ, es-MX, es-CU, es-AR, pt-BR, fr-CA, de-AT, nb, cy, ...)
title         who it's to, or what it is about
author        the writer's usual name
year          the year it was written
source        { name, url }: the page the text was copied from
rights        { us, eu, basis, firstPublished, authorDied | authorDiedBy }
translator    { name, died, published }   (only on translations)
tags          greeting, love, family, friendship, humour, food, nature, garden, travel, weather, home, work, music,
              art, books, writing, children, animals, city, sea, gifts, thanks, morning, evening, seasons
traditions    hand styles it pairs well with (see below)
enabled       false only for Vietnamese until the engine writes stacked tones
```

## Pairing letters with hand traditions

`traditions` uses provisional ids for the 13 v1 traditions in `docs/research/hand-traditions.md` §8. Rename them when the
engine settles on its own ids. The pairing is by the language and period a writer was schooled in, never as a costume:

| Letters in | Pair with |
|---|---|
| British, Irish, Indian, NZ English; Welsh | `english-roundhand` |
| American English | `american-business` |
| German before 1915 | `german-kurrent` |
| German 1915 and later | `sutterlin`, `german-kurrent` |
| French | `french-school` (Québec: also `modern-adult`) |
| Spanish, Portuguese, Catalan | `spanish-letra-espanola` (nearest v1 tradition for Portuguese and Catalan) |
| Italian | `italian-chancery` |
| Dutch | `dutch-running` |
| Polish, Czech, Hungarian, Romanian | `polish-copperplate` (the nearest Central European copperplate in v1) |
| Swedish, Danish, Norwegian | `norwegian-roundhand` |
| Vietnamese | `vietnamese-chu-thao` |

Also unused so far: `austrian-1969`. Blending is expected: a German-language writer can be shown in any hand. The pairing
only says which hands feel most at home with a letter.

## Order

The array order is the "New hand" order. It opens with six favourites: Dickinson's "Dear Peacock", Goya's "I'm Painter to
the King!", Jane Carlyle's letter written as her dog Nero, Madame de Sévigné on the Loire, Tagore's "let us agree to waste
the holidays", and Liselotte aged seven. After that, English letters alternate with letters in the other languages, and the
other languages take turns, so two clicks rarely show the same language. Letters by the same writer are spread apart (the
closest pair is 8 clicks apart).

## Characters

`check-texts.mjs` imports GF Latin Core from `tools/qa/lib/charsets.mjs` (315 characters, derived; it falls back to the
same derivation if that file moves) and fails if any enabled letter uses a character outside it. All 116 pass. Things
avoided on purpose: Welsh ŵ and ŷ (outside the derived set; neither Welsh letter needs them), superscript abbreviations
other than ª and º (one Eça de Queirós letter was dropped for "S.ta"), Greek and Cyrillic words.

The Vietnamese item needs 18 characters outside the set (ấ ợ ư ở ệ …). It stays switched off until Tier 3.

## Left out, and why

**Rights: the writer died in 1956 or later (EU fails).** Gabriela Mistral (1957), Juana de Ibarbourou (1979), Helen Keller
(1968; Anne Sullivan's letter from the same 1903 book is in), Karen Blixen (1962), Víctor Català (1966).

**Rights: not printed before 1931 (US fails).** Twain's Santa Claus letter to Susy (1931); Ellen Terry and Bernard Shaw's
correspondence (1931); Élisabeth Bégon's Montréal letters (1934–35); Rubén Darío (1940 onward); Manuela Sáenz (1940s);
Multatuli's *Reisbrieven aan Mimi* (1941); Eliza Orzeszkowa (1954 onward); Verdaguer (1959 onward); Narcís Oller (1962);
Emilia Pardo Bazán to Galdós (1975); Veronica Micle to Eminescu (2000); Willa Cather (2013); Hoàng Tích Chu (1931).

**Rights: first printing before 1931 not proven.** José Martí to María Mantilla; Machado de Assis to Carolina (we use his
1907 letter printed in 1917 instead); John Adams's "Miss Adorable"; Rosalía de Castro; Alfonsina Storni; Joan Maragall;
Phan Châu Trinh; Peter Andreas Munch; Eminescu.

**Authenticity or form.** Creangă's letters to Eminescu (probably forged, and one contains a slur); Mikes Kelemen's
*Letters from Turkey* (addressee probably invented); Bécquer's *Cartas desde mi celda* (essays); Bettina von Arnim's
*Goethes Briefwechsel mit einem Kinde* (reworked, semi-fictional); Sienkiewicz's and Aletta Jacobs's travel reportage (no
letter form, and passages that demean other peoples); Vietnamese verse letters (poems).

**Tone.** Sydney Smith's "take short views" letter (about low spirits); Carroll's "extra weight" letter (kisses posted to
a child; reads uncomfortably today); Chekhov's mongoose letters (talk of beating the pet); the rest of Douglass's Belfast
letter (slurs quoted); Twain's "Dear Heart" note (a sickroom); Naidu's letters about illness; Toru Dutt's last letters
(illness); Sand's and Crémazie's 1870–71 letters (war); Alecsandri's letter-preface (an antisemitic jibe); Havlíček and
Němcová's 1854 letter (exile, poverty, a child's death); most of Phillis Wheatley's and Marie de l'Incarnation's letters
(sermons, war).

**Could not be copied exactly** (only unreadable Fraktur or garbled OCR, or the site blocked access): Fontane, Beethoven's
notes to Zmeskall, Hans Christian Andersen, Clara Schumann, Rahel Varnhagen, Pierre Curie to Marie, Toru Dutt's
Indian-dishes letter, Puccini. Worth another try with a person reading the scans; Andersen and Pierre Curie especially.

**Not found at all:** a letter in Irish printed before 1931 by a writer who died before 1956; a pre-1931 letter in
Vietnamese (the one Vietnamese item is a travel journal, Trương Vĩnh Ký's 1876 trip north, printed 1881).

**Spares, all rights-clear and checked**, if any item needs swapping: Liselotte's talking-parrot letter (1702), Violant de Bar's thank-you for a Machaut manuscript (1389), a
second Fernán Caballero note about her cats, Mansfield's "At the Bay" letter, Osborne's "free and easy" letter, and
Dickinson's sweet-peas note.

## Open questions for Rafael

1. **Cut marks.** Keep the "…" inside sentences (honest, but a little bookish in a handwritten letter), or drop them from
   the written text and leave the record here?
2. **Letters with no greeting or signature** (Tagore ×2, Naidu ×2, Thaxter, Mansfield, Sullivan, Strepponi, Maria Celeste):
   keep them, or show only letters that open and close like letters?
3. **Old spellings.** Liselotte (1659), Violant de Bar (1390), Marie de l'Incarnation (1644) and the two Czech letters of
   1611 and 1613 are authentic but slow to read. Keep them in the default rotation, or only pair them with the older hands?
4. **English share** is 51%, a little under the 55% asked for, to keep room for 17 other languages. Add more English?
5. **Vietnamese** has no real letter yet, only a travel journal (switched off). Ask a Vietnamese reader to help find a
   letter printed before 1931?
6. **Rosa Luxemburg's** bird letter was written in prison, though the excerpt is pure spring. Keep it?

## Credits

Every letter, grouped by language. The `id` links each row to `sample-texts.json`.

### English (59)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Abigail Adams** (d. 1818), American letter-writer; wife of John Adams | To her husband: remember the ladies, 1776 · `adams-1776` | 1876, Familiar Letters of John Adams and His Wife Abigail Adams, during the Revolution, ed. Charles Francis Adams | [Familiar Letters of John Adams and His Wife Abigail Adams (1876), via Project Gutenberg](https://www.gutenberg.org/cache/epub/34123/pg34123.txt) |
| **Abigail Adams** (d. 1818), American letter-writer; wife of President John Adams | To her daughter, from the unfinished White House, 1800 · `adams-1800` | 1840, Letters of Mrs. Adams, the Wife of John Adams, ed. Charles Francis Adams (text read in the 4th edition, 1848) | [Letters of Mrs. Adams, 4th ed. (Boston, 1848), Internet Archive full text](https://archive.org/download/lettersofmrsadam03adam/lettersofmrsadam03adam_djvu.txt) |
| **Anne Sullivan (Macy)** (d. 1936), American teacher of Helen Keller; partially blind herself | To Mrs. Hopkins: everything has a name, 1887 · `sullivan-1887` | 1903, in Helen Keller, The Story of My Life (New York: Doubleday, Page), supplementary letters ed. John Albert Macy | [The Story of My Life (1903), Part III, via Project Gutenberg](https://www.gutenberg.org/cache/epub/2397/pg2397.txt) |
| **Anton Chekhov** (d. 1904), Russian writer; English translation by Constance Garnett | To Madame Kiselyov, from Venice (in English translation), 1891 · `chekhov-1891` | Russian original first printed 1912-16 (Letters, ed. M. P. Chekhova); this English translation 1920, Letters of Anton Tchekhov to his Family and Friends, tr. Constance Garnett (London: Chatto & Windus); tr. Constance Garnett (d. 1946), 1920 | [Letters of Anton Tchekhov to his Family and Friends, tr. Constance Garnett (1920), via Project Gutenberg #6408](https://www.gutenberg.org/cache/epub/6408/pg6408.txt) |
| **Celia Thaxter** (d. 1894), American poet and gardener of Appledore Island, Maine/New Hampshire | To Bradford Torrey, from the Isles of Shoals, 1889 · `thaxter-1889` | 1895, Letters of Celia Thaxter, ed. A. F. [Annie Fields] and R. L. [Rose Lamb] | [Letters of Celia Thaxter (Boston: Houghton Mifflin, 1895), Internet Archive full text](https://archive.org/download/lettersofcelia00thaxrich/lettersofcelia00thaxrich_djvu.txt) |
| **Charles Darwin** (d. 1882), English naturalist | To his sister Susan, packing for the Beagle, 1831 · `darwin-1831` | 1887, The Life and Letters of Charles Darwin, ed. Francis Darwin (London: John Murray), vol. I | [Life and Letters of Charles Darwin, vol. 1 (1887), via Project Gutenberg #2087](https://www.gutenberg.org/cache/epub/2087/pg2087.txt) |
| **Charles Lamb** (d. 1834), English essayist ("Elia") | To Wordsworth: no thanks to mountains, 1801 · `charles-lamb-1801` | 1837, T. N. Talfourd, The Letters of Charles Lamb (London: Moxon) | [The Best Letters of Charles Lamb, ed. E. G. Johnson (Chicago: McClurg, 1892), Letter XXXV, via Project Gutenberg #10125](https://www.gutenberg.org/cache/epub/10125/pg10125.txt) |
| **Charlotte Brontë** (d. 1855), English novelist | To her friend Ellen Nussey, 1839 · `bronte-1839` | 1857, in part, in E. Gaskell, The Life of Charlotte Brontë; fuller text in C. K. Shorter, The Brontës: Life and Letters (London: Hodder & Stoughton, 1908) | [C. K. Shorter, The Brontës: Life and Letters, vol. I (1908), Letter 50, Internet Archive full text](https://archive.org/details/brontslifelett01shoruoft) |
| **Dorothy Osborne** (d. 1695), English letter-writer, later Lady Temple | To William Temple: how she passes her days, 1653 · `osborne-1653` | 1888, Letters from Dorothy Osborne to Sir William Temple, ed. E. A. Parry (extracts earlier in T. P. Courtenay, Memoirs of Sir William Temple, 1836) | [The Love Letters of Dorothy Osborne to Sir William Temple, 1652-54, ed. E. A. Parry (New York, 1901), Letter 18, via Project Gutenberg #12544](https://www.gutenberg.org/cache/epub/12544/pg12544.txt) |
| **Dorothy Wordsworth** (d. 1855), English diarist and letter-writer | To Thomas De Quincey: the fairy mouse, 1809 · `wordsworth-1809` | By 1907: Letters of the Wordsworth Family from 1787 to 1855, ed. William Knight (Boston: Ginn), vol. I | [Letters of the Wordsworth Family, ed. W. Knight, vol. I (1907), Letter CLXXXVI, Internet Archive full text](https://archive.org/details/lettersofwordswo01worduoft) |
| **Edward Lear** (d. 1888), English artist and nonsense poet | To Chichester Fortescue, from Rome, 1860 · `lear-1860` | 1907, Letters of Edward Lear to Chichester Fortescue, Lord Carlingford, and Frances, Countess Waldegrave, ed. Lady Strachey (London: T. Fisher Unwin) | [Letters of Edward Lear, ed. Lady Strachey (1907; 1909 printing), Internet Archive full text, cross-checked with a second scan](https://archive.org/details/lettersofedwardl00learuoft) |
| **Elizabeth Barrett Browning** (d. 1861), English poet | To Robert Browning, her first reply, 1845 · `elizabeth-barrett-1845` | 1899, The Letters of Robert Browning and Elizabeth Barrett Barrett 1845-1846 (2 vols, London: Smith, Elder) | [The Letters of Robert Browning and Elizabeth Barrett Barrett, vol. 1 (1899), via Project Gutenberg #16182](https://www.gutenberg.org/cache/epub/16182/pg16182.txt) |
| **Emily Dickinson** (d. 1886) | To Mr Bowdoin, returning Jane Eyre, 1849 · `dickinson-1849` | 1894, Letters of Emily Dickinson, ed. Mabel Loomis Todd (vol. 1) | [Letters of Emily Dickinson, ed. Todd (1894), vol. 1, Internet Archive full text](https://archive.org/download/lettersemilydic00toadgoog/lettersemilydic00toadgoog_djvu.txt) |
| **Emily Dickinson** (d. 1886), American poet | To Mrs Holland, on moving house, 1855 · `dickinson-1855` | 1894, Letters of Emily Dickinson, ed. Mabel Loomis Todd (vol. 1) | [Letters of Emily Dickinson, ed. Todd (Boston: Roberts Brothers, 1894), vol. 1, Internet Archive full text](https://archive.org/download/lettersofemilydi00dick/lettersofemilydi00dick_djvu.txt) |
| **Emily Dickinson** (d. 1886), American poet | To the Hollands, in early spring, 1856 · `dickinson-1856` | 1894, Letters of Emily Dickinson, ed. Mabel Loomis Todd (vol. 1; Todd's opening omission marks kept) | [Letters of Emily Dickinson, ed. Todd (1894), Internet Archive full text (also checked against lettersofemilydi00dick)](https://archive.org/download/lettersemilydic00toadgoog/lettersemilydic00toadgoog_djvu.txt) |
| **Emily Dickinson** (d. 1886), American poet | To her cousin Louise Norcross, 1861 · `dickinson-1861` | 1894, Letters of Emily Dickinson, ed. Mabel Loomis Todd (vol. 2, letters to the Misses Norcross) | [Letters of Emily Dickinson, ed. Todd (1894), vols. 1-2, Internet Archive full text](https://archive.org/download/lettersemilydic00toadgoog/lettersemilydic00toadgoog_djvu.txt) |
| **Emily Eden** (d. 1869), English novelist and letter-writer | To her friend Theresa Villiers, from Woburn, 1821 · `eden-1821` | 1919, Miss Eden's Letters, ed. Violet Dickinson (London: Macmillan) | [Miss Eden's Letters, ed. Violet Dickinson (1919), via Project Gutenberg #41400](https://www.gutenberg.org/cache/epub/41400/pg41400.txt) |
| **Fanny Burney (Madame d'Arblay)** (d. 1840), English novelist, then Keeper of the Robes to Queen Charlotte | To the Lockes: a royal question about poultry, 1789 · `burney-1789` | 1842-46, Diary and Letters of Madame d'Arblay, ed. Charlotte Barrett (7 vols, London: Colburn) | [The Diary and Letters of Madame d'Arblay, notes by W. C. Ward, vol. 2 (London: Vizetelly, 1891-92), via Project Gutenberg #6042](https://www.gutenberg.org/cache/epub/6042/pg6042.txt) |
| **Frederick Douglass** (d. 1895), African-American abolitionist, orator and writer, on his 1845-47 tour of Ireland and Britain | To William Lloyd Garrison, from Ireland, 1846 · `douglass-1846` | 1846, The Liberator (Boston), as one of his travel letters; reprinted in My Bondage and My Freedom (1855) | [My Bondage and My Freedom (1855), ch. 24, via Project Gutenberg](https://www.gutenberg.org/cache/epub/202/pg202.txt) |
| **Gertrude Bell** (d. 1926), English traveller, archaeologist and writer | To her cousin, from a Persian garden, 1892 · `bell-1892` | 1927, The Letters of Gertrude Bell, ed. Lady Bell (2 vols, London: Ernest Benn) | [The Letters of Gertrude Bell, vol. I (Benn, 1927), Internet Archive full text (cross-checked with two other scans)](https://archive.org/details/lettersofgertrud0001vari) |
| **Gilbert White** (d. 1793), English parson-naturalist of Selborne | To Daines Barrington: the tortoise, 1772 · `white-1772` | 1789, The Natural History and Antiquities of Selborne (London: B. White) | [The Natural History of Selborne, Letter XIII to Barrington, via Project Gutenberg #1408](https://www.gutenberg.org/cache/epub/1408/pg1408.txt) |
| **Harriet Beecher Stowe** (d. 1896), American novelist and abolitionist (Uncle Tom's Cabin) | To her sister-in-law, between chores, 1850 · `stowe-1850` | 1889, Life of Harriet Beecher Stowe, Compiled from Her Letters and Journals, by Charles Edward Stowe | [Life of Harriet Beecher Stowe (1889), via Project Gutenberg](https://www.gutenberg.org/cache/epub/6702/pg6702.txt) |
| **Ignatius Sancho** (d. 1780), Afro-British writer, composer and shopkeeper in Westminster | To Mrs. C——, with a turtle, 1775 · `sancho-1775` | 1782, Letters of the Late Ignatius Sancho, an African (text read in the 3rd edition, 1784) | [Letters of the Late Ignatius Sancho, an African, 3rd ed. (London: J. Nichols, 1784), via Project Gutenberg](https://www.gutenberg.org/cache/epub/66908/pg66908.txt) |
| **Ignatius Sancho** (d. 1780), Afro-British writer, composer and shopkeeper in Westminster | To J. S——, Esq., with a fish, 1779 · `sancho-1779` | 1782, Letters of the Late Ignatius Sancho, an African (text read in the 3rd edition, 1784) | [Letters of the Late Ignatius Sancho, an African, 3rd ed. (1784), via Project Gutenberg](https://www.gutenberg.org/cache/epub/66908/pg66908.txt) |
| **Isabella Bird** (d. 1904), English traveller and writer | To her sister, from Lake Tahoe, 1873 · `bird-1873` | 1879, A Lady's Life in the Rocky Mountains (London: John Murray); letters first serialised in The Leisure Hour, 1878 | [A Lady's Life in the Rocky Mountains, Letter I, via Project Gutenberg #755](https://www.gutenberg.org/cache/epub/755/pg755.txt) |
| **Jane Austen** (d. 1817), English novelist | To her sister Cassandra, 1799 · `austen-1799` | 1884, Letters of Jane Austen, ed. Edward, Lord Brabourne (2 vols, London: Bentley) | [The Letters of Jane Austen, selected from Brabourne by Sarah Chauncey Woolsey (Boston: Little, Brown; 1908 printing), via Project Gutenberg #42078](https://www.gutenberg.org/cache/epub/42078/pg42078.txt) |
| **Jane Austen** (d. 1817), English novelist | To her sister Cassandra, before breakfast, 1813 · `austen-1813` | 1884, Letters of Jane Austen, ed. Edward, Lord Brabourne | [The Letters of Jane Austen, sel. Sarah Chauncey Woolsey (1908 printing), via Project Gutenberg #42078](https://www.gutenberg.org/cache/epub/42078/pg42078.txt) |
| **Jane Welsh Carlyle** (d. 1866), Scottish letter-writer; written in the voice of her dog Nero | From her dog Nero to “Master”, 1850 · `carlyle-1850-from-nero` | 1883, Letters and Memorials of Jane Welsh Carlyle, ed. J. A. Froude (3 vols, London: Longmans, Green), vol. II | [Letters and Memorials of Jane Welsh Carlyle, vol. II (Longmans, 1883), Internet Archive scan (University of Toronto), full text](https://archive.org/details/lettersandmemori02carluoft) |
| **Jane Welsh Carlyle** (d. 1866), Scottish letter-writer | To her little dog Nero, 1850 · `carlyle-1850-to-nero` | 1883, Letters and Memorials of Jane Welsh Carlyle, ed. J. A. Froude, vol. II | [Letters and Memorials of Jane Welsh Carlyle, vol. II (Longmans, 1883), Internet Archive full text](https://archive.org/details/lettersandmemori02carluoft) |
| **John Keats** (d. 1821), English poet | To his sister Fanny: a garden wish-list, 1819 · `keats-1819-garden` | By 1891: Letters of John Keats to His Family and Friends, ed. Sidney Colvin (London: Macmillan); letters to Fanny first printed by H. Buxton Forman in the 1880s | [Letters of John Keats to His Family and Friends, ed. Sidney Colvin (1891), Letter CXIII, via Project Gutenberg #35698](https://www.gutenberg.org/cache/epub/35698/pg35698.txt) |
| **John Keats** (d. 1821) | To his sister Fanny: anything but live stock, 1819 · `keats-1819-goldfish` | 1891, Letters of John Keats to His Family and Friends, ed. Sidney Colvin (London: Macmillan), letter XCIV; letters to Fanny first printed by H. Buxton Forman in the 1880s | [Letters of John Keats to His Family and Friends, ed. Sidney Colvin (1891), letter XCIV, via Project Gutenberg](https://www.gutenberg.org/cache/epub/35698/pg35698.txt) |
| **Kate Greenaway** (d. 1901), English illustrator | To Lady Mayo, for spring flowers, 1891 · `greenaway-1891` | 1905, M. H. Spielmann and G. S. Layard, Kate Greenaway (London: A. & C. Black) | [Spielmann & Layard, Kate Greenaway (1905), via Project Gutenberg #49041](https://www.gutenberg.org/cache/epub/49041/pg49041.txt) |
| **Katherine Mansfield** (d. 1923), New Zealand-born short-story writer | To Dorothy Brett: reading letters on the stairs, 1921 · `mansfield-1921` | 1928, The Letters of Katherine Mansfield, ed. J. Middleton Murry (2 vols, London: Constable); US ed. New York: Knopf, Feb 1929 | [The Letters of Katherine Mansfield, vol. II (New York: Knopf, 1929), Internet Archive full text](https://archive.org/details/lettersofkatheri031425mbp) |
| **Lady Mary Wortley Montagu** (d. 1762), English writer and traveller, wife of the ambassador to Constantinople | To a lady, with a Turkish love-letter, 1718 · `montagu-1718` | 1763, Letters of the Right Honourable Lady M—y W—y M—e (3 vols, London: Becket and De Hondt) | [Letters of the Right Honourable Lady M—y W—y M—e, new edition (London: Thomas Martin, 1790), Letter XL, via Project Gutenberg #17520; checked against Wharncliffe ed., Letters and Works (1837), Internet Archive lettersworksofla0002lord](https://www.gutenberg.org/cache/epub/17520/pg17520.txt) |
| **Lafcadio Hearn (Koizumi Yakumo)** (d. 1904), Greek-Irish writer raised in Dublin, journalist in America, later a Japanese citizen | To Sentarō Nishida, on the gift of a bird, 1890 · `hearn-1890` | 1906, The Life and Letters of Lafcadio Hearn, by Elizabeth Bisland (vol. 2) | [The Life and Letters of Lafcadio Hearn, Volume 2 (1906), via Project Gutenberg](https://www.gutenberg.org/cache/epub/42313/pg42313.txt) |
| **Lewis Carroll (C. L. Dodgson)** (d. 1898), English writer and mathematician | To Gertrude Chataway, a birthday letter, 1875 · `carroll-1875` | 1898, S. D. Collingwood, The Life and Letters of Lewis Carroll (London: T. Fisher Unwin) | [Collingwood, The Life and Letters of Lewis Carroll (1898), via Project Gutenberg #11483](https://www.gutenberg.org/cache/epub/11483/pg11483.txt) |
| **Louisa May Alcott** (d. 1888), American novelist (Little Women) | To her mother, with her first book, 1854 · `alcott-1854` | 1889, Louisa May Alcott: Her Life, Letters, and Journals, ed. Ednah D. Cheney | [Louisa May Alcott: Her Life, Letters, and Journals (1889), via Project Gutenberg](https://www.gutenberg.org/cache/epub/38049/pg38049.txt) |
| **Louisa May Alcott** (d. 1888), American novelist (Little Women) | To her sister Anna, on the birth of a nephew, 1863 · `alcott-1863` | 1889, Louisa May Alcott: Her Life, Letters, and Journals, ed. Ednah D. Cheney | [Louisa May Alcott: Her Life, Letters, and Journals (1889), via Project Gutenberg](https://www.gutenberg.org/cache/epub/38049/pg38049.txt) |
| **Mark Twain (Samuel L. Clemens)** (d. 1910), American humorist | To W. D. Howells: come next Saturday, 1875 · `twain-1875` | 1917, Mark Twain's Letters, ed. Albert Bigelow Paine | [Mark Twain's Letters, ed. Paine (1917), Volume 2 (1867-1875), via Project Gutenberg](https://www.gutenberg.org/cache/epub/3194/pg3194.txt) |
| **Mark Twain (Samuel L. Clemens)** (d. 1910), American humorist | To Henry H. Rogers, from Lake Lucerne, 1897 · `twain-1897` | 1917, Mark Twain's Letters, ed. Albert Bigelow Paine (vol. 2 of the 1917 edition; Gutenberg vol. 4) | [Mark Twain's Letters, ed. Paine (1917), Volume 4 (1886-1900), via Project Gutenberg](https://www.gutenberg.org/cache/epub/3196/pg3196.txt) |
| **Mary Lamb** (d. 1847), English writer, co-author of Tales from Shakespeare | To Thomas and Jane Hood, 1828 · `mary-lamb-1828` | By 1905: E. V. Lucas, ed., The Works of Charles and Mary Lamb, vol. VI, Letters 1821-1842 (London: Methuen) | [The Works of Charles and Mary Lamb, vol. VI, ed. E. V. Lucas, Letter 459, via Project Gutenberg #10851](https://www.gutenberg.org/cache/epub/10851/pg10851.txt) |
| **Mary Russell Mitford** (d. 1855), English writer, author of Our Village | To her father: the cats in the greenhouse, 1834 · `mitford-1834` | 1870, The Life of Mary Russell Mitford, told by herself in letters to her friends, ed. A. G. L'Estrange (London: Bentley; New York: Harper) | [The Life of Mary Russell Mitford, vol. II (New York: Harper, 1870), Internet Archive full text](https://archive.org/details/lifeofmaryrussel02mitfuoft) |
| **Paul Laurence Dunbar** (d. 1906), African-American poet and novelist from Dayton, Ohio | To his friend Dr. Tobey: I am married!, 1898 · `dunbar-1898` | 1907, The Life and Works of Paul Laurence Dunbar, by Lida Keck Wiggins | [The Life and Works of Paul Laurence Dunbar, by Lida Keck Wiggins (1907), Internet Archive full text (checked against a second scan)](https://archive.org/download/lifeworksofpaull00dunb/lifeworksofpaull00dunb_djvu.txt) |
| **Paul Laurence Dunbar** (d. 1906), African-American poet and novelist | To a small boy who sent him peonies, 1904 · `dunbar-1904` | 1907, The Life and Works of Paul Laurence Dunbar, by Lida Keck Wiggins (quoting Mrs. Bogg's article in Quill, 1906) | [The Life and Works of Paul Laurence Dunbar, by Lida Keck Wiggins (1907), Internet Archive full text](https://archive.org/download/lifeworkspaullau00dunbrich/lifeworkspaullau00dunbrich_djvu.txt) |
| **Phillis Wheatley** (d. 1784), African-American poet, enslaved in Boston; first published Black woman poet in English | To her friend Obour Tanner, 1773 · `wheatley-1773` | 1864, Proceedings of the Massachusetts Historical Society, vol. 7 (Nov. 1863 meeting; letters communicated by Charles Deane) | [Proceedings of the Massachusetts Historical Society, Nov. 1863 ('Letters of Phillis Wheatley'), JSTOR Early Journal Content via Internet Archive](https://archive.org/download/jstor-25079312/25079312_djvu.txt) |
| **Rabindranath Tagore** (d. 1941), Bengali poet, Nobel laureate 1913; wrote these letters in English | To C. F. Andrews: come and waste the holidays, 1914 · `tagore-1914` | 1928, Letters to a Friend (London: George Allen & Unwin), ed. C. F. Andrews | [Letters to a Friend (London: Allen & Unwin, 1928), Internet Archive full text](https://archive.org/download/letterstofriend00tago/letterstofriend00tago_djvu.txt) |
| **Rabindranath Tagore** (d. 1941), Bengali poet, Nobel laureate 1913; wrote these letters in English | To C. F. Andrews, from a crowded steamer, 1920 · `tagore-1920` | 1924, Letters from Abroad (Madras: S. Ganesan), ed. C. F. Andrews | [Letters from Abroad (Madras: S. Ganesan, 1924), Internet Archive (Digital Library of India) full text](https://archive.org/download/in.ernet.dli.2015.97031/2015.97031.Letters-From-Abroad_djvu.txt) |
| **Robert Browning** (d. 1889), English poet | To Elizabeth Barrett, his first letter, 1845 · `robert-browning-1845` | 1899, The Letters of Robert Browning and Elizabeth Barrett Barrett 1845-1846 (London: Smith, Elder) | [The Letters of Robert Browning and Elizabeth Barrett Barrett, vol. 1 (1899), via Project Gutenberg #16182](https://www.gutenberg.org/cache/epub/16182/pg16182.txt) |
| **Robert Louis Stevenson** (d. 1894), Scottish novelist, then living in Samoa | To Annie Ide, to whom he gave his birthday, 1891 · `stevenson-1891` | 1899, The Letters of Robert Louis Stevenson to his Family and Friends, ed. Sidney Colvin (London: Methuen) | [The Letters of Robert Louis Stevenson, vol. 2, ed. Colvin (Methuen, 7th ed. 1906), via Project Gutenberg #637](https://www.gutenberg.org/cache/epub/637/pg637.txt) |
| **Sarah Orne Jewett** (d. 1909), American novelist of Maine (The Country of the Pointed Firs) | To Annie Fields, after the great pines, 1890 · `jewett-1890` | 1911, Letters of Sarah Orne Jewett, ed. Annie Fields | [Letters of Sarah Orne Jewett, ed. Annie Fields (Boston: Houghton Mifflin, 1911), Internet Archive full text](https://archive.org/download/sarahorneletter00jewerich/sarahorneletter00jewerich_djvu.txt) |
| **Sarah Orne Jewett** (d. 1909), American novelist of Maine | From Venice, after Torcello, 1892 · `jewett-1892` | 1911, Letters of Sarah Orne Jewett, ed. Annie Fields | [Letters of Sarah Orne Jewett, ed. Annie Fields (1911), Internet Archive full text](https://archive.org/download/sarahorneletter00jewerich/sarahorneletter00jewerich_djvu.txt) |
| **Sarojini Naidu** (d. 1949), Indian poet and political leader; a student in England and Italy at the time | To Arthur Symons, from Florence, 1897 · `naidu-1897` | 1905, quoted in Arthur Symons's introduction to The Golden Threshold (London: Heinemann) | [The Golden Threshold (1905), introduction by Arthur Symons, via Project Gutenberg](https://www.gutenberg.org/cache/epub/680/pg680.txt) |
| **Sarojini Naidu** (d. 1949), Indian poet and political leader ('the Nightingale of India') | To Arthur Symons, from Hyderabad, 1904 · `naidu-1904` | 1905, quoted in Arthur Symons's introduction to The Golden Threshold (London: Heinemann) | [The Golden Threshold (1905), introduction by Arthur Symons, via Project Gutenberg](https://www.gutenberg.org/cache/epub/680/pg680.txt) |
| **Sir Richard Steele** (d. 1729), Irish-born essayist (The Tatler, The Spectator) | To his wife Prue: an outing, with periwig, 1708 · `steele-1708` | 1809, The Epistolary Correspondence of Sir Richard Steele, ed. John Nichols (1st ed. 1787); text here from Selected English Letters, ed. M. Duckitt and H. Wragg (1913) | [Selected English Letters (XV–XIX Centuries), ed. Duckitt and Wragg (1913), via Project Gutenberg](https://www.gutenberg.org/cache/epub/12515/pg12515.txt) |
| **Sir Richard Steele** (d. 1729), Dublin-born essayist and playwright (The Tatler) | To his wife Prue, one in the morning, 1710 · `steele-1710` | 1809, The Epistolary Correspondence of Sir Richard Steele, ed. John Nichols, new edition (London: Nichols); 1st edition 1787 | [The Epistolary Correspondence of Sir Richard Steele, ed. J. Nichols, vol. I (1809), letter *284, Internet Archive full text](https://archive.org/details/epistolarycorres01steeiala) |
| **Toru Dutt** (d. 1877), Bengali poet and translator who wrote in English and French; aged 14 here | To her cousin, from a snowy London, 1870 · `dutt-1870` | 1921, Life and Letters of Toru Dutt, by Harihar Das (Oxford University Press) | [Life and Letters of Toru Dutt, by Harihar Das (1921), Internet Archive full text](https://archive.org/download/lifelettersoftor00duttuoft/lifelettersoftor00duttuoft_djvu.txt) |
| **Toru Dutt** (d. 1877), Bengali poet and translator who wrote in English and French | To Mary Martin, from the garden house, 1873 · `dutt-1873` | 1921, Life and Letters of Toru Dutt, by Harihar Das (Oxford University Press) | [Life and Letters of Toru Dutt, by Harihar Das (1921), Internet Archive full text](https://archive.org/download/lifelettersoftor00duttuoft/lifelettersoftor00duttuoft_djvu.txt) |
| **Walt Whitman** (d. 1892), American poet (Leaves of Grass) | To Peter Doyle, from his mother’s kitchen, 1872 · `whitman-1872` | 1897, Calamus: A Series of Letters Written During the Years 1868-1880 by Walt Whitman to a Young Friend (Peter Doyle), ed. Richard Maurice Bucke | [Calamus (Boston: Laurens Maynard, 1897), Internet Archive full text](https://archive.org/download/calamusseriesofl00whitiala/calamusseriesofl00whitiala_djvu.txt) |
| **William Cowper** (d. 1800), English poet | To John Newton: a sheet of my largest paper, 1784 · `cowper-1784` | By 1824: The Private Correspondence of William Cowper with Several of his Most Intimate Friends, ed. John Johnson (London: Colburn) | [Letters of William Cowper, ed. J. G. Frazer, vol. I (London: Macmillan, 1912), Letter CXXIV, Internet Archive full text](https://archive.org/details/lettersofwilliam01cowpiala) |

### Spanish (10)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Domingo Faustino Sarmiento** (d. 1888), Argentine writer and educator (later president), writing on his travels | From Paris, on getting a letter from home, 1846 · `sarmiento-1846` | 1849, Viajes por Europa, África i América, vol. 1 (Santiago de Chile: Julio Belin) | [Viajes, ed. Julio Noé, vol. 1 (Buenos Aires: Vaccaro, 1922), pp. 162–163, 201–202, via Internet Archive (page scans read)](https://archive.org/details/viajesconunaintr01sarm/page/n165/mode/1up) |
| **Fernán Caballero (Cecilia Böhl de Faber)** (d. 1877), Novelist who published under a male pen name; Swiss-born, lived in Andalusia | To her friend Matilde, with news of the cats, 1857 · `caballero-1857` | 1919, Cartas de Fernán Caballero, ed. P. Diego de Valencina (Madrid: Sucesores de Hernando) | [Cartas (Madrid, 1919), pp. 130–132, via Internet Archive (page scans read)](https://archive.org/details/cartasca00caba/page/n151/mode/1up) |
| **Francisco de Goya** (d. 1828), Painter, writing to his childhood friend in Zaragoza | To Martín Zapater: “I’m Painter to the King!”, 1786 · `goya-1786` | 1868, Francisco Zapater y Gómez, Goya: noticias biográficas (Zaragoza) | [Goya: noticias biográficas (Zaragoza, Tip. La Académica reprint, c. 1928, of the 1868 text), p. 19, via Internet Archive (page scan read)](https://archive.org/details/goyanoticiasbibl00zapa/page/n22/mode/1up) |
| **Gertrudis Gómez de Avellaneda** (d. 1873), Cuban-born poet and novelist, writing from Madrid | To Ignacio de Cepeda, on moving house and his marriage plans, 1845 · `avellaneda-1845` | 1907, La Avellaneda: autobiografía y cartas de la ilustre poetisa, hasta ahora inéditas, ed. Lorenzo Cruz de Fuentes (Huelva), letter XXIII | [La Avellaneda: autobiografía y cartas (Huelva, 1907), pp. 93–95, via Internet Archive (page scans read)](https://archive.org/details/laavellanedaauto00cruz/page/n98/mode/1up) |
| **Gertrudis Gómez de Avellaneda** (d. 1873), Cuban-born poet and novelist, writing from Madrid | To Ignacio de Cepeda, written through the night, 1847 · `avellaneda-1847` | 1907, La Avellaneda: autobiografía y cartas de la ilustre poetisa, hasta ahora inéditas, ed. Lorenzo Cruz de Fuentes (Huelva), letter XXVIII | [La Avellaneda: autobiografía y cartas (Huelva, 1907), pp. 104–108, via Internet Archive (page scans read)](https://archive.org/details/laavellanedaauto00cruz/page/n109/mode/1up) |
| **Juana Manuela Gorriti** (d. 1892), Argentine novelist and salon host, writing from Lima | To José Hernández, thanking him for Martín Fierro, 1880 · `gorriti-1880` | Printed among the ‘Juicios críticos’ in El Gaucho Martín Fierro (Buenos Aires, 1894 edition) | [Carta de Juana Manuela Gorriti a José Hernández (Abril de 1880), es.wikisource (validated transcription of the 1894 edition, pp. XII–XIII)](https://es.wikisource.org/wiki/Carta_de_Juana_Manuela_Gorriti_a_Jos%C3%A9_Hern%C3%A1ndez_(Abril_de_1880)) |
| **Santa Teresa de Jesús (Teresa of Ávila)** (d. 1582), Carmelite reformer and writer from Ávila | To María de San José, on letters, quinces and tuna, 1576 · `teresa-1576` | By 1893: Cartas de Santa Teresa de Jesús (París: Garnier Hermanos, 1893), carta XLVI; her letters were collected in print from 1658 | [Cartas de Santa Teresa de Jesús (Paris, 1893), Carta XLVI, pp. 90–92, via Internet Archive (page scans read)](https://archive.org/details/cartasdesantater00tere/page/n119/mode/1up) |
| **Santa Teresa de Jesús (Teresa of Ávila)** (d. 1582), Carmelite reformer and writer from Ávila | To her brother Lorenzo, thanking him for the sea bream, 1577 · `teresa-1577` | By 1893: Cartas de Santa Teresa de Jesús (París: Garnier Hermanos, 1893), carta LXXI; her letters were collected in print from 1658 | [Cartas de Santa Teresa de Jesús (Paris, 1893), Carta LXXI, pp. 139–144, via Internet Archive (page scans read)](https://archive.org/details/cartasdesantater00tere/page/n168/mode/1up) |
| **Simón Bolívar** (d. 1830), Venezuelan-born leader of South American independence | To Manuela Garaycoa, on a wedding in the family, 1824 · `bolivar-1824` | 1929, Cartas del Libertador, ed. Vicente Lecuna, vol. IV (Caracas: Lit. y Tip. del Comercio), letter 659 | [Cartas del Libertador, t. IV (Caracas, 1929), p. 115, via Internet Archive (page scan and title page read)](https://archive.org/details/vicente-lecuna-cartas-del-libertador-tomo-iv/page/n124/mode/1up) |
| **Sor Juana Inés de la Cruz** (d. 1695), Mexican nun, poet and scholar (New Spain) | To “Sor Filotea” (the Bishop of Puebla), on kitchen philosophy, 1691 · `sor-juana-1691` | 1700, Fama, y obras pósthumas del Fénix de México, décima musa (Madrid) | [Respuesta a sor Filotea de la Cruz, es.wikisource (modernised-spelling transcription)](https://es.wikisource.org/wiki/Respuesta_a_sor_Filotea_de_la_Cruz) |

### Portuguese (5)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Álvares de Azevedo** (d. 1852), Brazilian Romantic poet, then a law student in São Paulo | To his sister on her birthday, from gloomy São Paulo, 1851 · `azevedo-1851` | By 1862, Obras de Manoel Antonio Alvares de Azevedo, 2nd ed., vol. 3 (Rio de Janeiro: B. L. Garnier), pp. 135–136 | [Carta de Álvares de Azevedo à sua irmã (1851), pt.wikisource, checked against page scans of Obras (1862) vol. 3](https://pt.wikisource.org/wiki/Carta_de_%C3%81lvares_de_Azevedo_%C3%A0_sua_irm%C3%A3_(1851)) |
| **Camilo Castelo Branco** (d. 1890), Portuguese novelist, writing from his country house at São Miguel de Seide | To Silva Pinto, on a very wet ride home, 1880 · `castelo-branco-1880` | 1895, Cartas de Camillo Castello Branco, ed. Silva Pinto (Lisboa: T. Cardoso) | [Cartas de Camillo Castello Branco (Lisboa, 1895), letter X, pp. 47–49, via Internet Archive (page scans read)](https://archive.org/details/cartasdecamilloc00castuoft/page/n48/mode/1up) |
| **Eça de Queirós** (d. 1900), Portuguese novelist | To the Pindela brothers, after a holiday visit, 1884 · `eca-1884` | 1916, Antonio Cabral, Eça de Queiroz: a sua vida e a sua obra. Cartas e documentos inéditos (Lisboa: Aillaud e Bertrand) | [Eça de Queiroz: a sua vida e a sua obra (1916), pp. 362–364, via Internet Archive (page scans read)](https://archive.org/details/eadequeirozsua00cabruoft/page/n359/mode/1up) |
| **Leonor de Almeida, Marquesa de Alorna (“Alcipe”)** (d. 1839), Portuguese poet; wrote as a young woman confined with her mother and sister in the Chelas convent, Lisbon | To her father, on swapping Arabic and Latin lessons with her sister, 1775 · `alorna-1775` | 1916, Marquês de Ávila e de Bolama, A Marqueza d'Alorna: algumas noticias authenticas… (Lisboa: Impr. de M. L. Torres) | [A Marqueza d'Alorna (Lisboa, 1916), pp. 81–82, via Internet Archive (page scans read)](https://archive.org/details/marquezadalornaa00avil/page/n106/mode/1up) |
| **Machado de Assis** (d. 1908), Afro-Brazilian novelist, founder of the Brazilian Academy of Letters | To Alfredo Pujol, sending a new photograph, 1907 · `machado-1907` | 1917, ‘Cartas inéditas’, Revista do Brasil, anno II, vol. V, n. 17 (São Paulo), pp. 101–104 | [Revista do Brasil (1917), ‘Cartas Inéditas’, pt.wikisource (transcription checked against the page scan, p. 103)](https://pt.wikisource.org/wiki/Revista_do_Brasil/Volume_5/N%C3%BAmero_17/Cartas_In%C3%A9ditas) |

### French (8)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **George Sand** (d. 1876), Amantine Aurore Dupin, French novelist | To Flaubert, after carnival, 1872 · `sand-1872` | 1884, George Sand, Correspondance 1812–1876, tome VI (Paris, Calmann Lévy), letter DCCCXLI | [George Sand, Correspondance 1812–1876, t. 6 (1884), via fr.wikisource](https://fr.wikisource.org/wiki/Correspondance_1812-1876,_6/1872/DCCCXLI) |
| **George Sand** (d. 1876), French novelist, writing as “boune mè” (grandma) to her six-year-old granddaughter | To her granddaughter, about a box of toys, 1873 · `sand-1873` | 1884, George Sand, Correspondance 1812–1876, tome VI (Calmann Lévy), letter DCCCXCV | [George Sand, Correspondance 1812–1876, t. 6 (1884), via fr.wikisource](https://fr.wikisource.org/wiki/Correspondance_1812-1876,_6/1873/DCCCXCV) |
| **Madame de Sévigné** (d. 1696), Marie de Rabutin-Chantal, marquise de Sévigné | To her cousin, on haymaking, 1671 · `sevigne-1671` | 1815 (Monmerqué’s note: the “Lettre des foins” was “imprimée pour la première fois en 1815”); reprinted in Monmerqué 1862 | [Lettres de Madame de Sévigné, éd. Monmerqué (1862), tome II, lettre 187, via fr.wikisource](https://fr.wikisource.org/wiki/Lettres_de_Madame_de_S%C3%A9vign%C3%A9/%C3%89dition_Monmerqu%C3%A9/Volume_2/Texte_entier) |
| **Madame de Sévigné** (d. 1696), Marie de Rabutin-Chantal, marquise de Sévigné; the great French letter-writer | To her daughter, from a boat on the Loire, 1680 · `sevigne-1680` | 1737, Lettres de Madame de Sévigné, ed. Denis-Marius Perrin (Monmerqué’s notes quote the 1737 and 1754 texts of this letter) | [Lettres de Madame de Sévigné, éd. Monmerqué (Grands Écrivains de la France, 1862), tome VI, lettre 807, via fr.wikisource](https://fr.wikisource.org/wiki/Lettres_de_Madame_de_S%C3%A9vign%C3%A9/%C3%89dition_Monmerqu%C3%A9/Volume_6/Texte_entier) |
| **Marie de l’Incarnation** (d. 1672), Marie Guyart, Ursuline nun who founded the Ursulines of Québec; writing from Québec in 1644 | To her son in France, about winter in Québec, 1644 · `marie-incarnation-1644` | 1681, Lettres de la vénérable Mère Marie de l’Incarnation, ed. Claude Martin (Paris, Louis Billaine), part II, letter XXXI, pp. 382–390 | [Lettres de la vénérable Mère Marie de l’Incarnation (1681), Internet Archive scan (transcribed from the page images; long s normalised)](https://archive.org/details/lettresdelavn00mari) |
| **Octave Crémazie** (d. 1879), Québec poet and bookseller, writing from exile in Paris | To his mother, on receiving her portrait, 1865 · `cremazie-1865` | 1882, Œuvres complètes de Octave Crémazie, publiées sous le patronage de l’Institut canadien de Québec (Montréal, Beauchemin & Valois) | [Œuvres complètes (Crémazie, 1882), Lettres 06, via fr.wikisource (proofread pages)](https://fr.wikisource.org/wiki/%C5%92uvres_compl%C3%A8tes_(Cr%C3%A9mazie)/Lettres_06) |
| **Toru Dutt** (d. 1877), Bengali poet and translator from Calcutta (1856–1877), who wrote in English and French | To a French friend she never met, 1877 · `dutt-1877-french` | 1921, Harihar Das, Life and Letters of Toru Dutt (London: Oxford University Press), pp. 46–47 (letter printed in the original French) | [Life and Letters of Toru Dutt (1921), Internet Archive scan (text read from the page images)](https://archive.org/details/lifelettersoftor00duttuoft) |
| **Vincent van Gogh** (d. 1890), Dutch painter, writing in French from Arles | To Theo, painting sunflowers, 1888 · `van-gogh-1888` | 1914, Brieven aan zijn broeder, ed. J. van Gogh-Bonger, vol. 3, letter 526 (printed in the original French; checked in the scan at archive.org/details/brievenaanzijnbr03gogh) | [Vincent van Gogh – The Letters (Van Gogh Museum & Huygens ING), letter 666, original text (read via the Internet Archive snapshot of the static page)](https://web.archive.org/web/2023/https://vangoghletters.org/vg/letters/let666/original_text.html) |

### Italian (6)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Alessandra Macinghi Strozzi** (d. 1471), Florentine widow who ran her family’s affairs and wrote to her exiled sons | To her son in Naples, with cheeses and shirts, 1450 · `macinghi-strozzi-1450` | 1877, Lettere di una gentildonna fiorentina del secolo XV ai figliuoli esuli, ed. Cesare Guasti (Firenze, Sansoni), Lettera nona, pp. 109–112 | [Lettere di una gentildonna fiorentina (1877), Internet Archive scan (checked against the page images)](https://archive.org/details/letterediunagent00strouoft) |
| **Giacomo Leopardi** (d. 1837), Italian poet, writing from Bologna | To his sister Paolina, out of winter, 1827 · `leopardi-1827` | 1849, Epistolario di Giacomo Leopardi, ed. Prospero Viani (Firenze, Le Monnier), vol. II, letter 326, p. 16 | [Epistolario di Giacomo Leopardi (1849), vol. 2, Internet Archive scan (checked against the page image)](https://archive.org/details/bub_gb_jYptzoNp18AC) |
| **Giuseppe Verdi** (d. 1901), Italian composer, writing from his farm at Sant’Agata | To his publisher, on a rainy day, 1862 · `verdi-1862` | 1913, I copialettere di Giuseppe Verdi, ed. Cesari and Luzio (Milano), appendix to letter CXCII, pp. 617–618 | [I copialettere di Giuseppe Verdi (1913), Internet Archive scan (checked against the page images)](https://archive.org/details/icopialettere00verd) |
| **Giuseppina Strepponi** (d. 1897), Italian operatic soprano, Verdi’s companion and later wife | To a friend, on Verdi and the garden, 1867 · `strepponi-1867` | 1913, I copialettere di Giuseppe Verdi, ed. Gaetano Cesari and Alessandro Luzio (Milano), appendix note to letter CXXV, pp. 498–499 | [I copialettere di Giuseppe Verdi (1913), Internet Archive scan (checked against the page images)](https://archive.org/details/icopialettere00verd) |
| **Pietro Aretino** (d. 1556), Venetian satirist, famous for his witty published letters | Thanks for a gift of wine, 1529 · `aretino-1529` | 1538, Il primo libro delle lettere (Venezia, Francesco Marcolini), letter XVI; text from the ed. by Fausto Nicolini (Bari, Laterza, 1913) | [Il primo libro delle lettere, ed. Nicolini (1913), letter XVI, via it.wikisource (proofread pages 32–33)](https://it.wikisource.org/wiki/Il_primo_libro_delle_lettere_(Aretino)/XVI._A_messer_Girolamo_Agnelli) |
| **Suor Maria Celeste (Virginia Galilei)** (d. 1634), Poor Clare nun at San Matteo in Arcetri, eldest daughter of Galileo | To her father Galileo, with his mended shirts, 1623 · `maria-celeste-1623` | 1864, Carlo Arduini, La primogenita di Galileo Galilei rivelata dalle sue lettere (Firenze), as an unpublished letter; text here from Antonio Favaro, Galileo Galilei e Suor Maria Celeste (Firenze, Barbèra, 1891), letter X, pp. 246–247 | [Favaro, Galileo Galilei e Suor Maria Celeste (1891), Internet Archive scan (checked against the page images)](https://archive.org/details/galileogalileie00galigoog) |

### Catalan (1)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Violant de Bar** (d. 1431), Queen of Aragon (born in Bar, France), patron of poets and lover of books | A queen asks for her book back, 1390 · `violant-1390` | 1908, Antoni Rubió i Lluch, Documents per l’historia de la cultura catalana mig-eval, vol. I (Barcelona, Institut d’Estudis Catalans), doc. CCCCIV, p. 361 (from Arxiu de la Corona d’Aragó, reg. 2056, f. 19v) | [Rubió i Lluch, Documents per l’historia de la cultura catalana mig-eval, I (1908), Internet Archive scan (transcribed from the page image)](https://archive.org/details/documentsperlhi00llucgoog) |

### German (7)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Annette von Droste-Hülshoff** (d. 1848), Westphalian poet | To Levin Schücking, from Rüschhaus in autumn, 1842 · `droste-hulshoff-1842` | 1893, Theo Schücking (ed.), Briefe von Annette von Droste-Hülshoff und Levin Schücking (Leipzig: Grunow) | [Briefe von Annette von Droste-Hülshoff und Levin Schücking (1893), via Projekt Gutenberg-DE](https://projekt-gutenberg.org/authors/annette-von-droste-huelshoff/books/briefe-von-annette-von-droste-huelshoff-und-levin-schuecking/chapter/20) |
| **August von Goethe** (d. 1830), Son of Christiane Vulpius and Goethe, aged seven; enclosed in his mother's letter | A seven-year-old’s note to his father, 1797 · `august-goethe-1797` | 1916, H. G. Gräf (ed.), Goethes Briefwechsel mit seiner Frau, vol. 1 (enclosure to no. 138) | [Goethe, Briefwechsel mit seiner Frau, Band 1 (ed. Gräf, 1916), via Projekt Gutenberg-DE](https://projekt-gutenberg.org/authors/johann-wolfgang-von-goethe/books/briefwechsel-mit-seiner-frau-band-1/chapter/7) |
| **Christiane Vulpius (Christiane von Goethe)** (d. 1816), Former artificial-flower maker, Goethe's partner and later wife; her letters keep her own grammar ('mir' for 'wir') | To Goethe, waiting for him to come home, 1799 · `christiane-goethe-1799` | 1916, H. G. Gräf (ed.), Goethes Briefwechsel mit seiner Frau, vol. 1, no. 228 | [Goethe, Briefwechsel mit seiner Frau, Band 1 (ed. Gräf, 1916), via Projekt Gutenberg-DE](https://projekt-gutenberg.org/authors/johann-wolfgang-von-goethe/books/briefwechsel-mit-seiner-frau-band-1/chapter/9) |
| **Elisabeth Charlotte of the Palatinate (Liselotte von der Pfalz)** (d. 1722), Palatine princess, later Duchess of Orléans; wrote this at seven, newly arrived at The Hague with her aunt Sophie | To her father, aged seven, 1659 · `liselotte-1659` | 1885, in E. Bodemann (ed.), Briefwechsel der Herzogin Sophie von Hannover mit ihrem Bruder, dem Kurfürsten Karl Ludwig von der Pfalz (Publicationen aus den K. Preußischen Staatsarchiven 26), p. 20 n. 4; text read in the anthology Briefe der Herzogin von Orléans (Voigtländer, 1913) | [Briefe der Herzogin von Orléans (R. Voigtländer, 1913), via Projekt Gutenberg-DE](https://projekt-gutenberg.org/authors/elisabeth-charlotte-von-orleans/books/briefe-der-herzogin-von-orleans/chapter/2) |
| **Johann Wolfgang von Goethe** (d. 1832) | To Christiane, from Frankfurt, 1792 · `goethe-1792` | Printed by 1916 at the latest: H. G. Gräf (ed.), Goethes Briefwechsel mit seiner Frau, vol. 1, no. 3 (may have appeared earlier in the Weimar edition of the letters; not checked) | [Goethe, Briefwechsel mit seiner Frau, Band 1 (ed. Gräf, 1916), via Projekt Gutenberg-DE](https://projekt-gutenberg.org/authors/johann-wolfgang-von-goethe/books/briefwechsel-mit-seiner-frau-band-1/chapter/1) |
| **Rosa Luxemburg** (d. 1919), Polish-born writer and economist; an amateur naturalist and birdwatcher | To Sophie Liebknecht: the birds came early, 1918 · `luxemburg-1918` | 1920, Briefe aus dem Gefängnis (Berlin: Verlag der Jugendinternationale); text from the 1922 printing | [Rosa Luxemburg, Briefe aus dem Gefängnis, via Project Gutenberg (eBook #26964)](https://www.gutenberg.org/cache/epub/26964/pg26964.txt) |
| **Wolfgang Amadeus Mozart** (d. 1791), Composer; the opera is Die Zauberflöte, then in progress | To his wife Constanze, taking the cure at Baden, 1791 · `mozart-1791` | 1828, G. N. von Nissen, Biographie W. A. Mozart's (Schiedermair's notes credit Nissen's edits to these 1791 letters to Constanze); text from L. Schiedermair (ed.), Die Briefe W. A. Mozarts und seiner Familie, vol. 2 (1914), no. 334 | [Schiedermair, Die Briefe W. A. Mozarts und seiner Familie (1914), via zeno.org](http://www.zeno.org/Musik/M/Schiedermair,+Ludwig/Die+Briefe+W.A.+Mozarts+und+seiner+Familie/Zweiter+Band/Elfte+Reihe/334.+an+die+Gattin+in+Baden+bei+Wien,+Wien,+11.+Juni+1791) |

### Dutch (4)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Aagje Deken (Agatha Deken)** (d. 1804), Dutch writer, orphanage-raised, lifelong companion and co-author of Betje Wolff | To a newly married friend, 1781 · `deken-1781` | 1904, J. Dyserinck (ed.), Brieven van Betje Wolff en Aagtje Deken ('s-Gravenhage: Van Cleef), letter CVII | [Brieven van Betje Wolff en Aagtje Deken (1904), via DBNL](https://www.dbnl.org/tekst/wolf016jdys01_01/wolf016jdys01_01_0112.php) |
| **Betje Wolff (Elizabeth Wolff-Bekker)** (d. 1804), Dutch novelist, co-author of Sara Burgerhart with Aagje Deken | To a young friend, from Lommerlust, 1784 · `wolff-1784` | 1904, J. Dyserinck (ed.), Brieven van Betje Wolff en Aagtje Deken ('s-Gravenhage: Van Cleef), letter CXIII | [Brieven van Betje Wolff en Aagtje Deken (1904), via DBNL](https://www.dbnl.org/tekst/wolf016jdys01_01/wolf016jdys01_01_0118.php) |
| **Multatuli (Eduard Douwes Dekker)** (d. 1887), Dutch writer, author of Max Havelaar; then a young colonial official on Java | To his fiancée Tine, from Buitenzorg, 1845 · `multatuli-1845` | 1891, Brieven van Multatuli, deel 1: Eerste periode tot 1846, ed. Mimi Douwes Dekker (series 1890–96; DBNL dates this volume 1891), letter I | [Brieven van Multatuli, deel 1, via DBNL](https://www.dbnl.org/tekst/mult001mdou03_01/mult001mdou03_01_0008.php) |
| **Vincent van Gogh** (d. 1890), Painter, then a 19-year-old art-dealer's clerk in The Hague | To his brother Theo, the first surviving letter, 1872 · `van-gogh-1872` | 1914, J. van Gogh-Bonger (ed.), Brieven aan zijn broeder, vol. 1 (Amsterdam), where it opens the collection (dated there 'Augustus 1872'; confirmed in the Internet Archive scan brievenaanzijnbr01gogh) | [Van Gogh Letters (Van Gogh Museum / Huygens ING), letter 001, original Dutch text](https://vangoghletters.org/vg/letters/let001/letter.html) |

### Swedish (1)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Fredrika Bremer** (d. 1865), Swedish novelist and campaigner for women's rights | To her sister Agathe, at sea on the way to America, 1849 · `bremer-1849` | 1853, Hemmen i den Nya Verlden: en dagbok i bref, vol. 1 (Stockholm: Norstedt), first letter, pp. 1 and 12 | [Hemmen i den Nya Verlden, vol. 1 (1853), via Project Runeberg (text checked against the page scans)](https://runeberg.org/hemmeninya/1/0017.html) |

### Danish (1)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Kamma Rahbek (Karen Margrethe Rahbek)** (d. 1829), Danish salon hostess of Bakkehuset, a famously witty letter writer | To young J. L. Heiberg, about her terrible pens, 1813 · `rahbek-1813` | 1862, Breve fra og til Johan Ludvig Heiberg (Kjøbenhavn), letter 7, pp. 42–45 | [Breve fra og til Johan Ludvig Heiberg (1862), via Project Runeberg (text checked against the page scans)](https://runeberg.org/hjlbreve/0054.html) |

### Norwegian (2)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Alexander L. Kielland** (d. 1906), Norwegian novelist; wrote in Dano-Norwegian | To his daughter Beate, from the farm at Aarre, 1890 · `kielland-1890` | 1909, Breve til hans Datter (Kristiania/København: Gyldendal), pp. 4–7 | [Alexander L. Kielland, Breve til hans Datter (1909), via Project Runeberg (text checked against the page scans)](https://runeberg.org/datterbrev/0016.html) |
| **Christopher Bergersen Hoen** (d. 1845), Farmer from Øvre Eker, one of the delegates at Eidsvoll; untutored Dano-Norwegian spelling | A farmer at the 1814 Constitutional Assembly writes home, 1814 · `hoen-1814` | 1901, Historisk Tidsskrift (Kristiania), 4. Række, 1. Bind, 'Smaastykker' no. 4, communicated by Albert J. Lange | [Historisk Tidsskrift 1901, via Norwegian Wikisource (raw transcription, checked against the page scans)](https://no.wikisource.org/wiki/Brev_fra_Eidsvoldsmanden,_Gaardbruger_Christopher_Hoen,_til_hans_Hustru) |

### Polish (3)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Fryderyk Chopin** (d. 1849), Polish composer, aged 18, on his first trip abroad | From Berlin, to his parents and sisters, 1828 · `chopin-1828` | 1882, Maurycy Karasowski, Fryderyk Chopin. Życie — Listy — Dzieła, vol. I (Warsaw: Gebethner i Wolff); Karasowski had printed some letters earlier in Młodość Fryderyka Chopina (1862). The autographs burned in Warsaw in 1863, so Karasowski's text is the surviving source. | [Karasowski, Fryderyk Chopin (1882), vol. I, ch. IV, via Polish Wikisource](https://pl.wikisource.org/wiki/Fryderyk_Chopin_(Karasowski)/Tom_I/Rozdział_IV) |
| **Juliusz Słowacki** (d. 1849), Polish Romantic poet, aged 21 | From Dresden, to his mother, 1831 · `slowacki-1831` | 1899, Listy Juliusza Słowackiego z autografów poety, vol. I, ed. Leopold Méyet (Lwów: Księgarnia Polska), pp. 37–41 ("wydał po raz pierwszy" from the autographs) | [Listy Juliusza Słowackiego (1899), vol. I, scan and OCR at the Internet Archive (text checked against page images pp. 37–41)](https://archive.org/details/listyjuliuszasl00sogoog) |
| **Narcyza Żmichowska** (d. 1876), Polish novelist (pen name Gabryella), early feminist and teacher | Note to Wanda, returning pencilled proofs, 1865 · `zmichowska-1865` | 1930, Narcyssa i Wanda: listy Narcyzy Żmichowskiej do Wandy Grabowskiej (Żeleńskiej), ed. Tadeusz Żeleński (Boy) (Warsaw: Dom Książki Polskiej), letter XXXVIII, p. 87 (undated; placed among letters of c. 1864–65) | [Narcyssa i Wanda (1930), scan at the Internet Archive (text checked against page image p. 87)](https://archive.org/details/bc.radom.pl.narcyssa_i_wanda_11686_pdf) |

### Czech (3)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Božena Němcová** (d. 1862), Czech novelist (Babička), folklorist | Letter from the spa at Františkovy Lázně, 1846 · `nemcova-1846` | 1846–47 in the Prague magazine Květy (Vávra 1895 dates the piece 1846–47; venue from standard bibliographies, not seen in scan); certainly in print in Z Chodska a odjinud z Čech (Prague, 1929), found by full-text search in Kramerius | [Národopisné a cestopisné obrázky z Čech (1951 ed.), via Czech Wikisource (modernised spelling of that edition)](https://cs.wikisource.org/wiki/Národopisné_a_cestopisné_obrázky_z_Čech/Dopisy_z_Lázní_Františkových) |
| **Mandalena Velemyšská** (d. before 1700), Bohemian gentlewoman (née Pětipeská z Chyš), writing from Prague; exact death year unknown, but she died in the 17th century | To her brother: thanks for the trout, 1611 · `velemyska-1611` | 1869, František Dvorský (ed.), Staré písemné památky žen a dcer českých (Prague), letter no. 185, from the original in the Roudnice archive | [Dvorský, Staré písemné památky žen a dcer českých (1869), e-book of the Prague City Library (MKP)](http://web2.mlp.cz/koweb/00/03/91/13/90/stare_pisemne_pamatky.html) |
| **Marie Anna Trmalová z Chyš** (d. before 1700), Bohemian gentlewoman of the early 17th century (née Pětipeská z Chyš); exact death year unknown, but she lived and died in the 1600s | To her brother, with twelve handkerchiefs, 1613 · `trmalova-1613` | 1869, František Dvorský (ed.), Staré písemné památky žen a dcer českých (Prague), letter no. 193, from the original in the Roudnice archive | [Dvorský, Staré písemné památky žen a dcer českých (1869), e-book of the Prague City Library (MKP)](http://web2.mlp.cz/koweb/00/03/91/13/90/stare_pisemne_pamatky.html) |

### Hungarian (2)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Petőfi Sándor** (d. 1849), Hungarian poet, travelling to court Júlia Szendrey | Travel letter from Nagykároly, 1847 · `petofi-1847` | 1847, Hazánk (Győr), 26 Aug–30 Nov 1847, in 19 instalments as Úti levelek Kerényi Frigyeshez (letter 4, dated Nagy-Károly, 15 May 1847) | [Petőfi Sándor összes prózai művei és levelezése, ed. Martinkó András, via MEK (OSZK)](https://mek.oszk.hu/05900/05911/05911.htm) |
| **Szendrey Júlia** (d. 1868), Hungarian poet and writer; married Petőfi later that year | To her friend Mari, before a ball, 1847 · `szendrey-1847` | 1898, Petőfiné Szendrey Julia naplója és levelei Térey Marihoz, with a preface by Jókai Mór (Magyar Könyvtár 49, Budapest: Lampel), letter IV, pp. 37–38 | [Petőfiné Szendrey Julia naplója és levelei (1898), scan via MEK (OSZK) (text checked against page images pp. 37–38)](https://mek.oszk.hu/19400/19401/) |

### Romanian (2)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Ion Ghica** (d. 1897), Romanian writer, economist and statesman | To Alecsandri: how we met in Paris, 1881 · `ghica-1881` | 1884, Scrisori către V. Alecsandri (Bucureşti: Socec), after appearing in Convorbiri literare in the early 1880s | [Scrisori către Vasile Alecsandri, "Generalul Coletti la 1835", via Romanian Wikisource (modern-edition spelling)](https://ro.wikisource.org/wiki/Scrisori_către_Vasile_Alecsandri/Generalul_Coletti_la_1835) |
| **Ion Luca Caragiale** (d. 1912), Romanian playwright, newly made director of the National Theatre | Open letter to the Bucharest editors, 1888 · `caragiale-1888` | 1888, sent to the Bucharest dailies as an open letter shortly after his appointment as director general of theatres (autumn 1888); exact paper not verified | [Caragiale, "Scrisoare" (to the editors of the Bucharest papers), via Romanian Wikisource](https://ro.wikisource.org/wiki/Scrisoare_(Caragiale)) |

### Welsh (2)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **John Morris (Ioan Morys)** (d. 1740), Anglesey sailor, youngest of the Morris brothers (Morrisiaid Môn) | From Liverpool, to his brother Richard, 1739 · `morris-1739` | 1907, The Letters of Lewis, Richard, William and John Morris of Anglesey (Morrisiaid Môn) 1728–1765, ed. J. H. Davies, vol. I (Aberystwyth, privately printed), letter X, pp. 15–18 | [Morris Letters, vol. I (1907), scan at the Internet Archive (text checked against page images pp. 15 and 18)](https://archive.org/details/lettersoflewisri01davi) |
| **William Morris (Gwilym Morys)** (d. 1763), Customs officer and amateur botanist at Holyhead, Anglesey | From Holyhead: where are my seeds?, 1741 · `morris-1741` | 1907, The Letters of Lewis, Richard, William and John Morris of Anglesey (Morrisiaid Môn) 1728–1765, ed. J. H. Davies, vol. I (Aberystwyth, privately printed), letter XXXIX, pp. 57–58 | [Morris Letters, vol. I (1907), scan at the Internet Archive (text checked against page images pp. 57–58)](https://archive.org/details/lettersoflewisri01davi) |

### Vietnamese (1)

| Writer | Letter | First printed (earliest we verified) | Source |
|---|---|---|---|
| **Trương Vĩnh Ký** (d. 1898), Vietnamese scholar from the south, pioneer of quốc ngữ prose | Travel notes: setting off for the North, 1876 *(disabled)* · `truong-vinh-ky-1876` | 1881, Chuyến đi Bắc Kỳ năm Ất Hợi 1876 (Saigon) | [Chuyến đi Bắc Kỳ năm Ất Hợi 1876, via Vietnamese Wikisource (modernised quốc ngữ)](https://vi.wikisource.org/wiki/Chuyến_đi_Bắc_Kỳ_năm_Ất_Hợi_1876) |
