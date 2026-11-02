// Coverage: which characters of GF Latin Kernel and GF Latin Core each style can write (has()).
// Also the contracts around it: every variant names its source, and missing characters never fall
// back silently (layout emits a 'miss' item and the SVG shows the pencil placeholder).

import { KERNEL, KERNEL_EXTRAS, CORE, CORE_SOURCE, groupChars } from '../charsets.mjs';
import { showCh } from '../util.mjs';

export async function run(ctx) {
  const { E } = ctx;
  const problems = [], lines = [], data = {};
  lines.push(`GF Latin Kernel: ${KERNEL.length} chars · GF Latin Core: ${CORE.length} chars (${CORE_SOURCE})`);

  const extrasEngine = new Set(E.EXTRAS || []);
  const extrasDoc = new Set(KERNEL_EXTRAS);
  const onlyEngine = [...extrasEngine].filter((c) => !extrasDoc.has(c)), onlyDoc = [...extrasDoc].filter((c) => !extrasEngine.has(c));
  if (onlyEngine.length || onlyDoc.length) problems.push({ level: 'warn', msg: `engine EXTRAS and docs/character-set.md disagree: engine-only [${onlyEngine.map(showCh).join(' ')}], doc-only [${onlyDoc.map(showCh).join(' ')}]` });

  for (const style of E.styleNames()) {
    const p = E.makeHand('coverage', style);
    const kMiss = KERNEL.filter((c) => !E.has(p, c));
    const cMiss = CORE.filter((c) => !E.has(p, c));
    data[style] = { kernel: KERNEL.length - kMiss.length, kernelMissing: kMiss, core: CORE.length - cMiss.length, coreMissing: cMiss };
    lines.push(`${style}: Kernel ${KERNEL.length - kMiss.length}/${KERNEL.length}` + (kMiss.length ? ` — missing ${kMiss.map(showCh).join(' ')}` : '') +
      ` · Core ${CORE.length - cMiss.length}/${CORE.length} (${Math.round(100 * (CORE.length - cMiss.length) / CORE.length)}%)`);
    if (cMiss.length) {
      for (const [g, list] of Object.entries(groupChars(cMiss))) lines.push(`    missing ${g} (${list.length}): ${list.map(showCh).join('')}`);
    }
    if (kMiss.length) problems.push({ level: 'fail', msg: `${style} cannot write ${kMiss.length} GF Latin Kernel characters: ${kMiss.map(showCh).join(' ')}` });

    // every variant carries provenance (ARCHITECTURE.md contract)
    const noSource = [];
    const variantCounts = [];
    for (const c of CORE) {
      const vs = E.variants(style, c);
      if (vs.length) variantCounts.push(vs.length);
      for (const v of vs) if (!v.source || !v.source.name || !v.source.credit) noSource.push(showCh(c) + (v.id ? `(${v.id})` : ''));
      const ids = vs.map((v) => v.id);
      if (new Set(ids).size !== ids.length) problems.push({ level: 'fail', msg: `${style} '${showCh(c)}' has duplicate variant ids: ${ids.join(', ')}` });
    }
    if (noSource.length) problems.push({ level: 'fail', msg: `${style}: ${noSource.length} variants without source {name, credit}: ${noSource.slice(0, 20).join(' ')}` });
    const multi = variantCounts.filter((n) => n > 1).length;
    lines.push(`    variants: ${multi} of ${variantCounts.length} drawable characters have more than one design (max ${Math.max(0, ...variantCounts)})`);
    data[style].multiVariant = multi;

    // missing characters never fall back silently
    const probe = 'ç';
    if (!E.has(p, probe)) {
      const page = E.layout(p, 'a' + probe + 'b', {});
      const miss = page.items.filter((it) => it.kind === 'miss');
      const svg = E.renderSVG(p, page, { width: 300, emPx: 40 });
      if (miss.length !== 1 || !page.misses.includes(probe)) problems.push({ level: 'fail', msg: `${style}: missing '${probe}' did not produce exactly one 'miss' item` });
      if (!/class="miss"/.test(svg)) problems.push({ level: 'fail', msg: `${style}: missing character placeholder not rendered in SVG` });
    }
    // the Kernel as text produces no misses
    const kpage = E.layout(p, KERNEL.filter((c) => c !== ' ').join(''), {});
    if (kpage.misses.length) problems.push({ level: 'fail', msg: `${style}: laying out the Kernel produced misses: ${kpage.misses.map(showCh).join(' ')}` });
  }
  return { id: 'coverage', title: 'Character coverage', lines, problems, data };
}
