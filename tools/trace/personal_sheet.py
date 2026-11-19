"""A handwriting sheet and its glyph coordinates, shared with the scan importer.

WIDTH and HEIGHT span the outside corners of the four black squares. All glyph
coordinates are relative to this rectangle, excluding the white print margin.
"""
from string import ascii_lowercase, ascii_uppercase

WIDTH, HEIGHT = 1800, 2400
MARK_SIZE = 30


def glyph_cells():
    """Yield (character, crop box, baseline, cap height) in sheet coordinates."""
    for case_index, alphabet in enumerate((ascii_lowercase, ascii_uppercase)):
        for index, ch in enumerate(alphabet):
            row, column = divmod(index, 9)
            x = 60 + 188 * column
            y = 246 + 267 * (3 * case_index + row)
            yield ch, (x + 17, y + 50, x + 167, y + 233), y + 179, 106


def sheet_svg():
    """Return a 190 × 250 mm SVG that fits US Letter and A4 in portrait."""
    elements = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="190mm" height="250mm" '
        'viewBox="-50 -50 1900 2500" role="img" aria-labelledby="title desc">',
        '<title id="title">Your cursive alphabet</title>',
        '<desc id="desc">Write each letter in its own space, then write the sentence twice '
        'in your usual hand. Keep all four black corner squares in the scan.</desc>',
        '<rect x="-50" y="-50" width="1900" height="2500" fill="white"/>',
        '<g fill="#222" font-family="Arial, sans-serif">',
        '<text x="60" y="96" font-family="Georgia, serif" font-size="61">Your cursive alphabet</text>',
        '<text x="60" y="157" font-size="29">Write one letter in each space. Rest it level with the lower ticks.</text>',
        '<text x="60" y="200" font-size="29">The upper tick marks capital height. Keep your usual slant and strokes.</text>',
    ]
    for x in (0, WIDTH - MARK_SIZE):
        for y in (0, HEIGHT - MARK_SIZE):
            elements.append(f'<rect x="{x}" y="{y}" width="{MARK_SIZE}" height="{MARK_SIZE}" fill="black"/>')

    for ch, (left, top, right, _), baseline, cap in glyph_cells():
        elements.append(
            f'<text x="{left}" y="{top - 15}" font-size="31">{ch}</text>'
            f'<path d="M{left - 16} {baseline}h9 M{right + 7} {baseline}h9 '
            f'M{left - 16} {baseline - cap}h9" fill="none" stroke="#666" stroke-width="2"/>'
        )
    elements.extend([
        '<text x="60" y="1901" font-family="Georgia, serif" font-size="45">Joined writing</text>',
        '<text x="60" y="1966" font-size="29">Write this sentence twice at your usual pace.</text>',
        '<text x="60" y="2020" font-family="Georgia, serif" font-size="37">With all my love, I’ll write more tomorrow.</text>',
        '<path d="M61 2172h18 M61 2316h18" stroke="#666" stroke-width="2"/>',
        '<text x="60" y="2377" font-size="24">Photograph or scan the sheet upright with all four black squares in view.</text>',
        '</g></svg>',
    ])
    return '\n'.join(elements) + '\n'


if __name__ == '__main__':
    print(sheet_svg(), end='')
