// letter-shape.js — what each written line of a letter is, so layout can set it out the way this writer
// sets out a letter: the greeting on its own line, paragraphs, the closing block drifting right, the
// name, a P.S. Pure text logic, no geometry (layout.js does the placing, with the writer's habits).
//
// Roles: 'first' (the letter's first line, until the next line shows whether it was a greeting),
//   'opening' (a greeting or heading line), 'para' (a body paragraph starts), 'cont' (a body line that
//   carries on a sentence: no indent), 'closing' (the sign-off, "Your loving daughter,"), 'signature'
//   (lines after it: the name), 'name' (a name on its own at the end, with no sign-off), 'ps' (a
//   postscript starts: "P.S.", "N.B."), 'ps-para' / 'ps-cont' (later lines of a postscript).
//
// A line's role is decided when the line begins, from the line's own text as far as it's known (the
// writer knows what they're about to write: in Ink mode, pass the typing the pen hasn't reached as
// `ahead`) and from the lines before it. With `complete` (the whole letter is known: a fair copy, a
// finished letter replayed), a closing is also recognised by where it sits: only short lines follow it.
// Texts in many languages and centuries: the sign-off words below are a backup for that position test.

const END = '(?![\\p{L}\\p{N}])';
const re = (alts) => new RegExp('^(?:' + alts.join('|') + ')' + END, 'iu');

// unambiguous sign-offs: a line that starts like this is a closing even before it's finished
const FAREWELL = re([
  'yours', 'sincerely', 'lovingly', 'affectionately', 'faithfully', 'cordially', 'respectfully', 'fondly', 'warmly',
  'gratefully', 'devotedly', 'adieux?', 'farewell', 'good-?\\s?bye', 'cheers', 'ever yours', 'all my love', 'much love',
  'lots of love', 'love always', 'love and kisses', 'best wishes', '(?:kind|warm|best)(?:est)? regards',
  'with (?:much |all (?:my )?|my |best |kind(?:est)? |warm(?:est)? |sincere |grateful )?(?:love|regards|wishes|affection|thanks)',
  'adi[oó]s', 'tuy[oa]', 'un (?:fuerte )?abrazo', 'abrazos', 'besos', 'con cariño', 'cariñosamente', 'atentamente',
  'afectuosamente', 'q\\.?\\s?s\\.?\\s?m\\.?\\s?b', 'b\\.?\\s?v\\.?\\s?m', 'abraços', 'beijos', 'saudades', 'addio', 'un abbraccio',
  'baci', 'affettuosamente', 'je t[’\']embrasse', 'bien à (?:toi|vous)', 'bises', 'amitiés', 'affectueusement', 'tendrement',
  'mille baisers', 'herzlich(?:st|e grüße)?', '(?:liebe|viele|herzliche) grüße', 'mit (?:herzlichen|freundlichen|besten|lieben) grüßen',
  'lebe? wohl', 'leben sie wohl', 'leeft wel', 'vaarwel', 'hartelijke groeten', 'farvel', 'lev vel',
  '(?:med )?(?:venlig|kærlig|kjærlig|vennlig) hilsen', 'isten veled', 'isten áldjon', 'całuję', 'ściskam', 'pozdrawiam',
  's pozdravem', 'líbám',
]);
// "Your …", "Ton …", "Ihr …": a sign-off when the line is short (and known to be finished)
const POSSESSIVE = re([
  'your', 'yr', 'thy', 'thine', 'by (?:your|yor|thy)', 'be (?:your|yor)', 'from (?:your|yr|thy)', 'i (?:still )?remain',
  'i am (?:yours|your|ever)', 'ever your', 'ton', 'ta', 'votre', 'vos', 'je suis', 'tu', 'su', 'vuestr[oa]', 'de vd?\\.',
  'teu', 'tua', 'seu', 'sua', 'tuo', 'vostr[oa]', 'dein(?:e|er)?', 'ihr(?:e|er)?', 'euer', 'eure', 'din', 'dit', 'dine',
  'deres', 'eders', 'jeres', 'uw', 'jouw', 'tvá', 'tvůj', 'vaše', 'váš', 'twój', 'twoja', 'wasza?', 'eich', 'dy',
  'al tău', 'a ta',
]);
// sign-offs only when the whole letter is known and the line sits among the last short lines
const TAIL = re(['from', 'merry christmas', 'god bless', 'no more', 'well,? good-?\\s?bye', 'per', 'by', 'amour', 'ever', 'love']);
// a short line ending in a comma or dash that names a relation or a feeling: a sign-off (Ink mode)
const KEYWORD = /(?:love|yours?|friend|servant|son|daughter|sister|brother|mother|father|wife|husband|remain|truly|sincere|affection|devoted|obedient|humble|faithful|regards|wishes|kisses|blessing|frère|s(?:œ|oe)ur|fille|fils|amie?|hij[oa]|herman[oa]|amig[oa]|madre|padre|bruder|schwester|tochter|sohn|freund|vater|mutter|bror|søster|datter|venn?)/iu;
// connectors inside names (Maria Josefa A. Bezerra de Seguin, Marie Anna Trmalová z Chyš)
const CONNECT = new Set(['de', 'da', 'del', 'della', 'di', 'do', 'dos', 'das', 'du', 'la', 'le', 'van', 'von', 'der', 'den', 'ten', 'ter',
  'y', 'e', 'et', 'und', 'and', '&', 'z', 'ze', 'a', 'og', 'i', 'of', 'ap', 'af', 'zu', 'bin', 'ibn']);

const words = (t) => (t.match(/\S+/g) || []).length;
// short enough to be part of a greeting or a closing block
export const isShort = (t) => words(t) <= 10 && t.length <= 72;
// a postscript starts: P.S., P. S.—, PS:, P.P.S., N.B., N. B.—
export const isPS = (t) => /^(?:(?:p\.?\s?){1,3}s|n\.?\s?b)(?![\p{L}\p{N}])/iu.test(t.trim());
// ends a sentence (a new line after it starts a paragraph, not a carried-on sentence)
export const endsSentence = (ch) => !ch || /[.!?…:;"”’»)\]—–-]/u.test(ch);

// a name: a few words, mostly capitalised or initials ("C. Fabregue", "Mary y Nelly", "(Pochi Mari Elena)")
export function nameLike(t) {
  t = t.trim().replace(/^[(\[“"'‘]+/u, '').replace(/[)\]”"'’.,!—–\-\s]+$/u, '');
  if (!t || t.length > 56) return false;
  const ws = t.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (!ws.length || ws.length > 8) return false;
  let caps = 0, n = 0;
  for (const w of ws) {
    if (CONNECT.has(w.toLowerCase().replace(/[.,]/g, ''))) continue;
    n++;
    if (/^\p{Lu}/u.test(w) || /^\p{L}\.?$/u.test(w)) caps++;
  }
  return n > 0 && caps / n >= 0.6;
}

// the next non-empty known line after line i, and whether only short lines (before any P.S.) follow it
function after(lines, i) {
  let next = null, n = 0, short = true;
  for (let j = i + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (!t) continue;
    if (isPS(t)) break;
    if (next == null) next = t;
    n++;
    if (!isShort(t) || n > 4) { short = false; break; }
  }
  return { next, n, short };
}

// Does this line start the closing block? t: the line as far as known; finished: the whole line is known.
function closes(t, finished, complete, tail) {
  if (finished && !isShort(t)) return false;
  if (FAREWELL.test(t)) return true;
  if (!finished) return false;
  if (complete) {
    if (!tail.short) return false; // a closing is followed only by short lines (the name, a date)
    return POSSESSIVE.test(t) || TAIL.test(t) || /[,;—–-]$/u.test(t) ||
      (!/[.!?]$/u.test(t) && tail.next != null && nameLike(tail.next));
  }
  return POSSESSIVE.test(t) || (/[,;—–-]$/u.test(t) && KEYWORD.test(t));
}

// The role of a line as it begins.
// st: the letter so far { n (lines written), body (a body paragraph has been written), open (every line so
//   far was a greeting or heading), greeted (the greeting has ended), closing (a closing has begun), sigs,
//   ps, blanks (blank lines just before this one), prevRole, prevEnd (last character of the line before) }
// lines: the letter's lines as far as known; i: this line; complete: the whole letter is known.
export function lineRole(st, lines, i, complete) {
  const t = lines[i].trim();
  const finished = i < lines.length - 1 || complete;
  if (st.n === 0) return 'first';
  if (st.ps) return isPS(t) ? 'ps' : st.blanks ? 'ps-para' : 'ps-cont';
  if (isPS(t)) return 'ps';
  // a greeting after a heading ("Lafayette, Ind." then "Dear Santa Claus,")
  if (st.open && !st.greeted && st.n <= 2 && finished && t && words(t) <= 6 && t.length <= 48 && !/[.?]$/u.test(t)) return 'opening';
  if (st.closing) {
    if (st.sigs < 4 && (!finished || nameLike(t) || words(t) <= 4 || !/[.!?]$/u.test(t)) && !(finished && words(t) > 8)) return 'signature';
    return 'para';
  }
  if (st.body && t) {
    const tail = complete ? after(lines, i) : null;
    if (closes(t, finished, complete, tail)) return 'closing';
    if (complete && tail.n === 0 && nameLike(t)) return 'name';
  }
  if (st.body && !st.blanks && (st.prevRole === 'para' || st.prevRole === 'cont') && !endsSentence(st.prevEnd)) return 'cont';
  return 'para';
}

// ----- the letter as it's written (layout keeps this in page.pen, so writing can resume) -----
export function newLetter() {
  return { n: 0, role: null, body: false, open: true, greeted: false, closing: false, sigs: 0, ps: false, blanks: 0,
    prevRole: null, prevEnd: '', afterOpen: false, words: 0, chars: 0, end: '' };
}
// a word written on the current line
export function noteWord(st, tok) { st.words++; st.chars += tok.length + (st.words > 1 ? 1 : 0); st.end = tok[tok.length - 1]; }
// a blank line between paragraphs
export function noteBlank(st) { st.blanks++; }
// a new written line begins (line i of the known lines): close the line before, then decide this one. force: a role
// the line was given (format.js: 'title', 'heading', 'item'), never guessed from its text
export function beginLine(st, lines, i, complete, force) {
  if (st.n > 0) {
    let r = st.role;
    // the first line was a greeting (or a heading) if it was short
    if (r === 'first') r = st.words <= 10 && st.chars <= 64 ? 'opening' : 'para';
    // (a title or a heading is a heading line: the letter can still open with a greeting after it)
    if (r === 'opening') { if (/[,:!—–-]/u.test(st.end)) st.greeted = true; } else if (r !== 'title' && r !== 'heading') st.open = false;
    if (r === 'para' || r === 'cont' || r === 'item') st.body = true;
    st.prevRole = r; st.prevEnd = st.end;
  }
  const role = force || lineRole(st, lines, i, complete);
  st.afterOpen = role === 'para' && st.prevRole === 'opening'; // the first paragraph, under the greeting
  if (role === 'closing' || role === 'name') st.closing = true;
  if (role === 'signature') st.sigs++;
  if (role === 'ps' || role === 'ps-para' || role === 'ps-cont') st.ps = true;
  st.n++; st.role = role; st.words = 0; st.chars = 0; st.end = ''; st.blanks = 0;
  return role;
}
