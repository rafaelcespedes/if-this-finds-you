"""Validate exported fonts: fontTools (every table decompiles and re-saves), OTS (the sanitizer Chrome and Firefox
run on web fonts), metrics (no glyph outside the line box) and HarfBuzz shaping (calt cycles, joins, word forms).

Usage:  python3 tools/fonts/check_fonts.py font.otf [font.ttf ...]      (needs fonttools, uharfbuzz, opentype-sanitizer)
        python3 tools/fonts/check_fonts.py --json report.json fonts/*.otf
Exit code 1 if any font has an error. Warnings are printed but don't fail.
"""
import io
import json
import os
import subprocess
import sys
import tempfile

from fontTools.ttLib import TTFont

try:
    import uharfbuzz as hb
except ImportError:  # shaping checks are skipped without HarfBuzz
    hb = None
try:
    import ots
except ImportError:
    ots = None

HERE = os.path.dirname(os.path.abspath(__file__))
CORE = os.path.join(HERE, "..", "qa", "data", "gf-latin-core.txt")

SAMPLES = [
    "hello little mammoth, the the the the",
    "Dear Ada, I hope this letter finds you well. Mississippi balloons and coffee.",
    "AFFLUENT ALL CAPS. Ça va? Größe, Łódź, Søren, Ærø, naïve café, Şişli, Ğ, Ő, Ț.",
    "1234567890 (quote) 'single' “double” — dash …",
]


def core_codepoints():
    cps = []
    with open(CORE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            cps.append(int(line.split()[0].replace("U+", ""), 16))
    return cps


def check(path):
    errors, warnings, info = [], [], {}
    data = open(path, "rb").read()
    info["bytes"] = len(data)
    # 1. fontTools: decompile every table, re-save
    try:
        f = TTFont(io.BytesIO(data), lazy=False)
        for tag in f.keys():
            f[tag]  # noqa: B018  decompiles
        buf = io.BytesIO()
        f.save(buf)
        info["tables"] = sorted(f.keys())
    except Exception as e:  # noqa: BLE001
        errors.append(f"fontTools: {e!r}")
        return {"path": path, "errors": errors, "warnings": warnings, "info": info}
    order = f.getGlyphOrder()
    info["glyphs"] = len(order)
    # 2. cmap: GF Latin Core
    cmap = f.getBestCmap()
    missing = [c for c in core_codepoints() if c not in cmap]
    info["core"] = f"{len(core_codepoints()) - len(missing)}/{len(core_codepoints())}"
    if missing:
        warnings.append("cmap misses " + " ".join(f"U+{c:04X}" for c in missing[:20]))
    # 3. metrics: every glyph inside hhea and win metrics
    hhea, os2, head = f["hhea"], f["OS/2"], f["head"]
    gs = f.getGlyphSet()
    from fontTools.pens.boundsPen import BoundsPen

    ymin, ymax, clip = 0, 0, []
    for name in order:
        bp = BoundsPen(gs)
        gs[name].draw(bp)
        if not bp.bounds:
            continue
        _, y0, _, y1 = bp.bounds
        ymin, ymax = min(ymin, y0), max(ymax, y1)
        if y1 > hhea.ascent or y0 < hhea.descent or y1 > os2.usWinAscent or -y0 > os2.usWinDescent:
            clip.append(name)
    info["ink"] = [round(ymin), round(ymax)]
    info["lineBox"] = [hhea.descent, hhea.ascent, hhea.lineGap]
    info["lineHeight"] = round((hhea.ascent - hhea.descent + hhea.lineGap) / head.unitsPerEm, 3)
    if clip:
        errors.append(f"{len(clip)} glyphs outside the line box, e.g. {clip[:5]}")
    if os2.fsType != 0:
        errors.append(f"fsType {os2.fsType} (want 0: installable)")
    if not (os2.fsSelection & 0x80):
        warnings.append("USE_TYPO_METRICS off")
    if (os2.sTypoAscender, os2.sTypoDescender) != (hhea.ascent, hhea.descent):
        warnings.append("typo and hhea metrics differ")
    names = {r.nameID: r.toUnicode() for r in f["name"].names if r.platformID == 3}
    info["family"] = names.get(16) or names.get(1)
    for nid, what in [(0, "copyright"), (1, "family"), (2, "style"), (4, "full name"), (5, "version"), (6, "PostScript name"),
                      (10, "description"), (11, "vendor URL"), (13, "licence"), (14, "licence URL")]:
        if not names.get(nid):
            errors.append(f"name table has no {what} (ID {nid})")
    if "Open Font License" not in names.get(13, ""):
        errors.append("licence (ID 13) doesn't name the SIL Open Font License")
    if "Hershey" not in names.get(13, "") + names.get(0, ""):
        errors.append("Hershey acknowledgement missing from the name table")
    if len(names.get(1, "")) > 31:
        warnings.append("family name (ID 1) longer than 31 characters")
    # 4. GSUB / GPOS structure
    feats = set()
    for tag in ("GSUB", "GPOS"):
        if tag in f:
            t = f[tag].table
            feats |= {r.FeatureTag for r in t.FeatureList.FeatureRecord}
    info["features"] = sorted(feats)
    if "calt" not in feats:
        errors.append("no calt feature")
    # 5. OTS
    if ots is not None:
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(path)[1]) as tmp:
            r = ots.sanitize(path, tmp.name, capture_output=True)
            if r.returncode != 0:
                errors.append("OTS: " + (r.stderr.decode(errors="replace").strip() or r.stdout.decode(errors="replace").strip())[:400])
            elif r.stderr.strip():
                warnings.append("OTS: " + r.stderr.decode(errors="replace").strip()[:300])
    # 6. HarfBuzz shaping
    if hb is not None:
        face = hb.Face(data)
        font = hb.Font(face)

        def shape(text, features=None):
            b = hb.Buffer()
            b.add_str(text)
            b.guess_segment_properties()
            hb.shape(font, b, features or {})
            return [font.glyph_to_string(i.codepoint) for i in b.glyph_infos], b.glyph_infos, b.glyph_positions

        joined = "A joined hand" in names.get(10, "")
        info["shaping"] = {}
        repeats = 0
        for text in SAMPLES:
            gl, infos, pos = shape(text)
            off, _, _ = shape(text, {"calt": False, "kern": False})
            if any(g == ".notdef" for g in gl):
                errors.append(f"HarfBuzz: .notdef in {text[:30]!r}")
            # neighbours never repeat (same character, same glyph)
            for i in range(1, len(gl)):
                if text[i] == text[i - 1] and text[i].isalpha() and gl[i] == gl[i - 1]:
                    repeats += 1
            if any(".alt" in g for g in off):
                errors.append("calt off still produces alternates")
            info["shaping"][text[:24]] = " ".join(gl[:18])
        if repeats:
            errors.append(f"{repeats} doubled letters drew the same glyph twice")
        # repeated words: how often a word comes out identical to the previous one
        gl, _, _ = shape(" ".join(["the"] * 30))
        words, cur = [], []
        for g in gl:
            if g.startswith("space"):
                words.append(tuple(cur)); cur = []
            else:
                cur.append(g)
        words.append(tuple(cur))
        same = sum(1 for a, b in zip(words, words[1:]) if a == b)
        info["repeatedWordSame"] = f"{same}/{len(words) - 1}"
        if joined:
            gl, _, _ = shape("ah an the mammoth a")
            info["joinedForms"] = " ".join(gl)
            if not any(".init" in g for g in gl) or not any(".fina" in g for g in gl):
                warnings.append("joined hand: no word-start / word-end forms in shaping")
        # kerning in use
        if "kern" in feats:
            _, _, pos = shape("To Va r. AV")
            _, _, pos0 = shape("To Va r. AV", {"kern": False})
            info["kernDelta"] = sum(a.x_advance for a in pos) - sum(a.x_advance for a in pos0)
    return {"path": path, "errors": errors, "warnings": warnings, "info": info}


def main(argv):
    out_json = None
    if argv and argv[0] == "--json":
        out_json, argv = argv[1], argv[2:]
    reports = [check(p) for p in argv]
    bad = 0
    for r in reports:
        status = "FAIL" if r["errors"] else "ok  "
        bad += bool(r["errors"])
        i = r["info"]
        print(f"{status} {os.path.basename(r['path'])}: {i.get('glyphs')} glyphs, core {i.get('core')}, line {i.get('lineHeight')}, "
              f"{i.get('bytes', 0) // 1024} KB, words same {i.get('repeatedWordSame')}, kern {i.get('kernDelta')}")
        for e in r["errors"]:
            print("   error:", e)
        for w in r["warnings"]:
            print("   warn: ", w)
    if out_json:
        with open(out_json, "w") as fh:
            json.dump(reports, fh, indent=1, ensure_ascii=False)
    print(f"{len(reports) - bad}/{len(reports)} fonts passed")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
