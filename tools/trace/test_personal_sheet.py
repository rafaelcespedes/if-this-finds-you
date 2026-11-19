"""Run with tools/trace/.venv/bin/python -I tools/trace/test_personal_sheet.py."""
import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from xml.etree import ElementTree

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import trace
from personal_sheet import HEIGHT, MARK_SIZE, WIDTH, glyph_cells, sheet_svg


def sample_sheet(letters=True, missing_corner=False, heading=True):
    sheet = Image.new('L', (WIDTH, HEIGHT), 255)
    ink = ImageDraw.Draw(sheet)
    if heading:
        for line in ElementTree.fromstring(sheet_svg()).findall('.//{*}text')[:3]:
            font = ImageFont.load_default(size=int(line.get('font-size')))
            baseline = (int(line.get('x')), int(line.get('y')))
            ink.text(baseline, line.text, fill=34, font=font, anchor='ls')
    for x in (0, WIDTH - MARK_SIZE):
        for y in (0, HEIGHT - MARK_SIZE):
            if missing_corner and (x, y) == (WIDTH - MARK_SIZE, HEIGHT - MARK_SIZE):
                continue
            ink.rectangle((x, y, x + MARK_SIZE - 1, y + MARK_SIZE - 1), fill=0)
    if letters:
        for ch, (left, _, _, _), base, cap in glyph_cells():
            if ch == 'u':
                points = [(20, -20), (42, -48), (35, -5), (47, 0),
                          (76, -48), (68, -5), (79, 0), (100, -18)]
            elif ch == 'L':
                points = [(50, -cap), (26, 0), (98, 0)]
            else:
                continue
            ink.line([(left + x, base + y) for x, y in points], fill=20, width=6)
    return sheet


class PersonalSheetTest(unittest.TestCase):
    def setUp(self):
        tmp = TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        paths = patch.multiple(trace, HERE=tmp.name, ROOT=tmp.name)
        paths.start()
        self.addCleanup(paths.stop)
        self.photo = self.root / 'photo.png'
        self.hand_dir = self.root / 'raw' / 'personal-robin'
        self.review_dir = self.root / 'out' / 'personal-robin'

    def test_rotated_sheet_preserves_labels_and_baselines(self):
        photo = sample_sheet().rotate(5, Image.Resampling.BICUBIC, expand=True, fillcolor=255)
        photo.resize((photo.width // 2, photo.height // 2), Image.Resampling.LANCZOS).save(self.photo)
        trace.cmd_personal(['robin', str(self.photo)])

        hand_file = self.hand_dir / 'hand.json'
        hand = json.loads(hand_file.read_text())
        glyphs = {g['ch']: g for g in hand['glyphs']}
        self.assertEqual(set(glyphs), {'u', 'L'})
        with Image.open(self.hand_dir / 'sheet.png') as aligned:
            self.assertEqual(aligned.size, (WIDTH, HEIGHT))
            for ch, box, base, cap in glyph_cells():
                if ch not in glyphs:
                    continue
                glyph = glyphs[ch]
                self.assertEqual((glyph['box'], glyph['base'], glyph['capH']), (list(box), base, cap))
                # Both test strokes have ink near their baseline at this x.
                x = box[0] + (78 if ch == 'u' else 60)
                patch_box = (x - 3, base - 4, x + 4, base + 4)
                self.assertLess(aligned.crop(patch_box).getextrema()[0], 80)
        strokes = json.loads((self.review_dir / 'strokes.json').read_text())
        self.assertEqual(set(strokes), set(glyphs))
        for result in strokes.values():
            self.assertTrue(result['engine']['s'])
        self.assertTrue(list(self.review_dir.glob('review-*.png')))

        # Re-importing must leave edits to the existing trace alone.
        hand_file.write_text('my edited trace')
        with self.assertRaisesRegex(SystemExit, 'already exists'):
            trace.cmd_personal(['robin', str(self.photo)])
        self.assertEqual(hand_file.read_text(), 'my edited trace')

    def test_quarter_turns_restore_the_writing_to_its_cells(self):
        for turn in (Image.Transpose.ROTATE_90, Image.Transpose.ROTATE_180, Image.Transpose.ROTATE_270):
            with self.subTest(turn=turn):
                name = 'robin-' + turn.name.lower().replace('_', '-')
                sample_sheet().transpose(turn).save(self.photo)
                trace.cmd_personal([name, str(self.photo)])
                hand = json.loads((self.root / 'raw' / ('personal-' + name) / 'hand.json').read_text())
                self.assertEqual([glyph['ch'] for glyph in hand['glyphs']], ['u', 'L'])

    def test_empty_and_incomplete_sheets_can_be_retried(self):
        for sheet, error in [(sample_sheet(letters=False), 'No letters'),
                             (sample_sheet(missing_corner=True), 'corner squares'),
                             (sample_sheet(heading=False), 'printed heading')]:
            with self.subTest(error=error):
                sheet.save(self.photo)
                with self.assertRaisesRegex(SystemExit, error):
                    trace.cmd_personal(['robin', str(self.photo)])
                self.assertFalse(self.hand_dir.exists())
                self.assertFalse(self.review_dir.exists())


if __name__ == '__main__':
    unittest.main()
