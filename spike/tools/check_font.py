"""Validate an exported font with fontTools and shape text with HarfBuzz.
Usage: .venv/bin/python tools/check_font.py out/font.otf ["text"]
Shows which glyphs HarfBuzz picks with default features (calt on) vs calt off."""
import sys
from fontTools.ttLib import TTFont
import uharfbuzz as hb

path = sys.argv[1]
text = sys.argv[2] if len(sys.argv) > 2 else "hello little mammoth 1001"
f = TTFont(path)
print("tables:", sorted(f.keys()))
gsub = f["GSUB"].table
print("scripts:", [s.ScriptTag for s in gsub.ScriptList.ScriptRecord])
print("features:", [(r.FeatureTag, r.Feature.LookupListIndex) for r in gsub.FeatureList.FeatureRecord])
print("lookups:", [(l.LookupType, [getattr(st, "Format", "-") for st in l.SubTable]) for l in gsub.LookupList.Lookup])
order = f.getGlyphOrder()
print("glyphs:", len(order), "e.g.", order[60:66], "...", order[-3:])
# round-trip compile to catch structural errors
import io
buf = io.BytesIO(); f.save(buf); print("fontTools re-save OK,", len(buf.getvalue()), "bytes")

blob = hb.Blob.from_file_path(path)
face = hb.Face(blob); font = hb.Font(face)
def shape(features):
    b = hb.Buffer(); b.add_str(text); b.guess_segment_properties()
    hb.shape(font, b, features)
    return [font.glyph_to_string(i.codepoint) for i in b.glyph_infos]
print("text:", repr(text))
print("calt on :", " ".join(shape({})))
print("calt off:", " ".join(shape({"calt": False})))
print("ss01    :", " ".join(shape({"calt": False, "ss01": True})))
