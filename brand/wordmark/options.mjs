// options.mjs — the wordmark options Rafael reviews. Every engine option records its exact hand, so it can be
// redrawn (wordmark.mjs) or turned into a font (buildFontPackage(withOverrides(makeHand(seed, { style }), overrides))).
// Numbers are stable: say "#7".

const H = (seed, style, extra = {}) => ({ seed, style, ...extra });
const one = (text, hand) => [{ runs: [{ text, hand }] }];
const NAME = 'If This Finds You';

// Small caps by hand: each word's first capital at full size, the rest as capitals at `k` size.
function smallCaps(text, hand, k = 0.74) {
  const runs = [];
  text.split(' ').forEach((w, wi) => {
    runs.push({ text: w[0].toUpperCase(), hand: { ...hand, salt: 'sc' + wi }, gap: wi ? 0.34 : 0 });
    if (w.length > 1) runs.push({ text: w.slice(1).toUpperCase(), hand: { ...hand, salt: 'sc' + wi + 'b' }, size: k, gap: 0.04 });
  });
  return [{ runs }];
}

export const FAMILIES = [
  { key: 'print', title: 'Everyday print', blurb: 'Unjoined capitals and lowercase, the way most people write a note today.' },
  { key: 'joined', title: 'Joined school hands', blurb: 'Cursive taught in schools, from the American Palmer method to Polish and Spanish copybooks.' },
  { key: 'old', title: 'Older hands, lowercase', blurb: 'Traditions from 1618 to 1930s German schools. Set in lowercase, where their letters read best.' },
  { key: 'comp', title: 'Compositions', blurb: 'The same idea arranged differently: stacked, lowercase, small caps, and a "you" that stands out.' },
  { key: 'ref', title: 'Reference typefaces', blurb: 'Open-licence fonts from Google Fonts, for comparison only. The last three pair a serif with a "you" from our engine.' },
];

export const OPTIONS = [
  // ---------- Everyday print ----------
  { family: 'print', slug: 'print-upright-fountain', lines: one(NAME, H('amber-lantern-85', 'print')),
    note: 'Upright, even print with a fountain pen. The clearest at small sizes.' },
  { family: 'print', slug: 'print-felt-chunky', lines: one(NAME, H('corvid-marten-21', 'print')),
    note: 'Felt tip, sturdy and friendly, like a label on a jar.' },
  { family: 'print', slug: 'print-felt-leaning', lines: one(NAME, H('willow-heron-58', 'print')),
    note: 'Leans hard to the right and moves fast; a note written on the way out.' },
  { family: 'print', slug: 'print-italic-nib', lines: one(NAME, H('harbor-sparrow-37', 'print')),
    note: 'Print with a broad italic nib, so thick and thin come for free.' },
  { family: 'print', slug: 'quebec-felt-marker', lines: one(NAME, H('linen-thistle-82', 'quebec-print')),
    note: 'Québec school print in a heavy marker. Big personality, a little clumsy.' },
  { family: 'print', slug: 'quebec-gel-backslant', lines: one(NAME, H('fallow-sparrow-19', 'quebec-print')),
    note: 'Rounded school print leaning backwards, careful and young.' },
  { family: 'print', slug: 'adultfr-felt', lines: one(NAME, H('ember-marten-99', 'adult-fr-2023')),
    note: 'A grown-up French print hand with a felt pen. Modern, plain, honest.' },
  { family: 'print', slug: 'adultfr-gel-loose', lines: one(NAME, H('tidal-wren-20', 'adult-fr-2023')),
    note: 'Looser adult print, gel pen. Uneven heights, very human.' },

  // ---------- Joined school hands ----------
  { family: 'joined', slug: 'script-fountain-classic', lines: one(NAME, H('meadow-finch-75', 'script')),
    note: 'Classic joined script with a fountain pen. Reads like the top of a letter.' },
  { family: 'joined', slug: 'script-ballpoint-light', lines: one(NAME, H('hazel-wren-38', 'script')),
    note: 'The same school of script in a fine ballpoint: light and quiet.' },
  { family: 'joined', slug: 'palmer-fountain', lines: one(NAME, H('juniper-river-86', 'palmer')),
    note: 'American Palmer method, upright for a Palmer writer, with a confident fountain pen.' },
  { family: 'joined', slug: 'palmer-pointed-flourish', lines: one(NAME, H('saffron-pebble-17', 'palmer')),
    note: 'Pointed pen with swelling downstrokes. Dramatic, a bit theatrical.' },
  { family: 'joined', slug: 'spencerian-fountain', lines: one(NAME, H('russet-maple-90', 'spencerian')),
    note: 'Spencerian, the 19th-century American business hand. Tall capitals, small body.' },
  { family: 'joined', slug: 'polish-fountain-bold', lines: one(NAME, H('corvid-marten-81', 'polish-1906')),
    note: 'Polish 1906 copybook, bold fountain pen. Rounded, warm and very legible.' },
  { family: 'joined', slug: 'polish-gel', lines: one(NAME, H('juniper-maple-12', 'polish-1906')),
    note: 'The Polish hand again in gel ink: lighter, more even, a touch formal.' },
  { family: 'joined', slug: 'spanish-fountain', lines: one(NAME, H('saffron-pebble-77', 'spanish-1776')),
    note: 'Spanish 1776 copybook. Big looping capitals, an 18th-century accent.' },
  { family: 'joined', slug: 'spanish-felt', lines: one(NAME, H('willow-heron-34', 'spanish-1776')),
    note: 'Spanish capitals in a modern felt pen, old shapes with today’s tool.' },
  { family: 'joined', slug: 'norwegian-fountain', lines: one(NAME, H('linen-maple-42', 'norwegian-1849')),
    note: 'Norwegian 1849 school hand. Strong slant, distinctive T and F.' },

  // ---------- Older hands, lowercase ----------
  { family: 'old', slug: 'suetterlin-fountain', lines: one('if this finds you', H('fallow-pebble-59', 'suetterlin')),
    note: 'Sütterlin, the 1920s German school hand, in its Latin form. Upright and round; the n reads close to an r.' },
  { family: 'old', slug: 'suetterlin-italic', lines: one('if this finds you', H('saffron-finch-27', 'suetterlin')),
    note: 'Sütterlin with an italic nib: heavier, almost a poster hand.' },
  { family: 'old', slug: 'arrighi-fountain', lines: one('if this finds you', H('corvid-quill-71', 'arrighi')),
    note: 'Arrighi’s 1522 chancery italic. The oldest model here; its y and u are strange to modern eyes.' },
  { family: 'old', slug: 'kurrent-fountain', lines: one('if this finds you', H('corvid-marten-87', 'kurrent-1849')),
    note: 'German Kurrent, 1849. Hard to read for most people today; striking as a shape.' },
  { family: 'old', slug: 'dutch-fountain', lines: one('if this finds you', H('tidal-heron-16', 'dutch-1618')),
    note: 'A Dutch writing master, 1618. The h and s are from another century.' },

  // ---------- Compositions ----------
  { family: 'comp', slug: 'stacked-polish', icon: 'If',
    lines: [{ runs: [{ text: 'If this', hand: H('corvid-marten-81', 'polish-1906') }] },
      { runs: [{ text: 'finds you', hand: H('corvid-marten-81', 'polish-1906', { salt: 'l2' }) }], indent: 0.55, leading: 0.95 }],
    note: 'Stacked, second line stepped in, like the opening of a letter. Fits a square.' },
  { family: 'comp', slug: 'stacked-print', icon: 'If',
    lines: [{ runs: [{ text: 'If this', hand: H('amber-lantern-85', 'print') }] },
      { runs: [{ text: 'finds you', hand: H('amber-lantern-85', 'print', { salt: 'l2' }) }], leading: 0.92 }],
    note: 'Stacked upright print, flush left. Compact and calm.' },
  { family: 'comp', slug: 'lower-palmer', lines: one('if this finds you', H('juniper-river-86', 'palmer')), icon: 'if',
    note: 'All lowercase in Palmer script. Softer, less of a title.' },
  { family: 'comp', slug: 'lower-felt', lines: one('if this finds you', H('corvid-marten-21', 'print')), icon: 'if',
    note: 'All lowercase in felt print. Casual, like a sticky note.' },
  { family: 'comp', slug: 'caps-quebec', lines: one('IF THIS FINDS YOU', H('juniper-river-56', 'quebec-print')), icon: 'IF',
    note: 'All capitals in Québec print. Reads like the outside of an envelope.' },
  { family: 'comp', slug: 'smallcaps-print', lines: smallCaps(NAME, H('amber-lantern-85', 'print')), icon: 'If',
    note: 'Small capitals written by hand: big first letters, smaller rest. Bookish.' },
  { family: 'comp', slug: 'big-you-polish',
    lines: [{ runs: [{ text: 'If this finds', hand: H('corvid-marten-81', 'polish-1906') },
      { text: 'you', hand: H('corvid-marten-81', 'polish-1906', { salt: 'you' }), size: 1.6, gap: 0.22 }] }],
    note: 'The same writer, but "you" is written larger. You are the one it found.' },
  { family: 'comp', slug: 'you-other-hand',
    lines: [{ runs: [{ text: 'If this finds', hand: H('amber-lantern-85', 'print') },
      { text: 'you', hand: H('meadow-finch-75', 'script', { salt: 'you' }), size: 1.5, gap: 0.24 }] }],
    note: 'Two writers: neat print (#1), then "you" in the joined script of #9. Two people on one page.' },
  { family: 'comp', slug: 'stacked-big-you-spanish', icon: 'If',
    lines: [{ runs: [{ text: 'If this finds', hand: H('saffron-pebble-77', 'spanish-1776') }] },
      { runs: [{ text: 'you', hand: H('saffron-pebble-77', 'spanish-1776', { salt: 'you' }), size: 1.7 }], indent: 1.6, leading: 1.25 }],
    note: 'Spanish copybook, "you" alone on a second line, large and stepped in.' },
  { family: 'comp', slug: 'pencil-print', lines: one(NAME, H('amber-lantern-85', 'print', { pen: 'pencil' })),
    note: 'Option #1’s writer in pencil: grainy and soft, like a first draft.' },
];

// Reference typefaces (rendered as live text on the review page; all from Google Fonts)
export const REFERENCES = [
  { slug: 'ref-eb-garamond', font: 'EB Garamond', css: "font-family:'EB Garamond',Garamond,serif;font-style:italic;font-weight:500", licence: 'SIL OFL 1.1',
    note: 'EB Garamond italic. Bookish and graceful, the safe literary choice.' },
  { slug: 'ref-cormorant', font: 'Cormorant Garamond', css: "font-family:'Cormorant Garamond',Garamond,serif;font-weight:500", licence: 'SIL OFL 1.1',
    note: 'Cormorant Garamond. Fine, high-contrast display serif; elegant, a bit fragile small.' },
  { slug: 'ref-fraunces', font: 'Fraunces', css: "font-family:Fraunces,Georgia,serif;font-weight:400;font-variation-settings:'SOFT' 100,'WONK' 1", licence: 'SIL OFL 1.1',
    note: 'Fraunces with its soft, wonky settings. Warm and slightly odd, in a good way.' },
  { slug: 'ref-im-fell', font: 'IM Fell English', css: "font-family:'IM Fell English',Georgia,serif;font-style:italic", licence: 'SIL OFL 1.1',
    note: 'IM Fell English italic, from 17th-century type. Inky and old-fashioned.' },
  { slug: 'ref-instrument-serif', font: 'Instrument Serif', css: "font-family:'Instrument Serif',Georgia,serif;font-style:italic", licence: 'SIL OFL 1.1',
    note: 'Instrument Serif italic, the sister of the app’s UI font. Pairs without effort.' },
  { slug: 'ref-special-elite', font: 'Special Elite', css: "font-family:'Special Elite','Courier New',monospace", licence: 'Apache 2.0',
    note: 'Special Elite, a worn typewriter. Archival and a little cliché.' },
  { slug: 'ref-courier-prime', font: 'Courier Prime', css: "font-family:'Courier Prime','Courier New',monospace", licence: 'SIL OFL 1.1',
    note: 'Courier Prime, a clean typewriter. Reads like a transcript of the letter.' },
  { slug: 'hybrid-garamond-polish', font: 'EB Garamond', css: "font-family:'EB Garamond',Garamond,serif;font-style:italic;font-weight:500", licence: 'SIL OFL 1.1',
    serifText: 'If this finds', you: { hand: H('corvid-marten-81', 'polish-1906', { salt: 'you' }), scale: 1.25 },
    note: 'Garamond italic, then "you" handwritten by the Polish writer of #14.' },
  { slug: 'hybrid-fell-palmer', font: 'IM Fell English', css: "font-family:'IM Fell English',Georgia,serif", licence: 'SIL OFL 1.1',
    serifText: 'If this finds', you: { hand: H('juniper-river-86', 'palmer', { salt: 'you' }), scale: 1.2 },
    note: 'Old type, then a fountain-pen Palmer "you" (#11’s writer). A printed page meets a pen.' },
  { slug: 'hybrid-courier-print', font: 'Courier Prime', css: "font-family:'Courier Prime','Courier New',monospace", licence: 'SIL OFL 1.1',
    serifText: 'IF THIS FINDS', you: { hand: H('amber-lantern-85', 'print', { salt: 'you' }), scale: 1.25 },
    note: 'Typed capitals, then "you" in #1’s print hand. A form somebody filled in.' },
];
