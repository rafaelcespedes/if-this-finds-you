// x-count.mjs: a post's length as X counts it (twitter-text: every link is 23; Latin, punctuation and typographic
// quotes weigh 1, most other scripts and emoji 2).
const ONE = [[0, 4351], [8192, 8205], [8208, 8223], [8242, 8247]];
export function xLength(t) {
  const urls = t.match(/https?:\/\/\S+/g) || [];
  let s = t;
  for (const u of urls) s = s.replace(u, '');
  let n = 23 * urls.length;
  for (const ch of s) { const c = ch.codePointAt(0); n += ONE.some(([a, b]) => c >= a && c <= b) ? 1 : 2; }
  return n;
}
