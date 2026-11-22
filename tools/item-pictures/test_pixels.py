"""Checks a render is made a glyph as the hand-drawn ones are, without Blender: run it from the repository root with
`python3 -I tools/item-pictures/test_pixels.py`."""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pixels import LETTERS, OUTLINE, SCALE, glyph  # noqa: E402


def rendered(cells, paint):
    """A render `cells` a side, its pixels set by `paint(y, x)` to RGBA, or left empty."""
    pixels = np.zeros((cells * SCALE, cells * SCALE, 4))
    for y in range(cells * SCALE):
        for x in range(cells * SCALE):
            found = paint(y, x)
            if found is not None:
                pixels[y, x] = found
    return pixels


class Glyph(unittest.TestCase):
    def test_a_square_is_outlined_round_side_by_side_not_at_its_corners(self):
        square = rendered(8, lambda y, x: (1, 0, 0, 1) if 16 <= y < 48 and 16 <= x < 48 else None)
        rows, palette = glyph(square, 8)
        self.assertEqual(palette, [OUTLINE, '#ff0000'])
        self.assertEqual(rows[1:7], ['..aaaa..', '.abbbba.', '.abbbba.', '.abbbba.', '.abbbba.', '..aaaa..'])

    def test_a_cell_is_kept_when_half_covered_and_dropped_when_less(self):
        half = rendered(4, lambda y, x: (0, 0, 1, 1) if 8 <= y < 16 and 8 <= x < 12 else None)
        self.assertEqual(glyph(half, 4)[0][1], 'aba.')
        quarter = rendered(4, lambda y, x: (0, 0, 1, 1) if 8 <= y < 12 and 8 <= x < 12 else None)
        self.assertEqual(glyph(quarter, 4)[0], ['....'] * 4)

    def test_colours_are_cut_to_the_most_asked_for_and_lettered_light_to_dark(self):
        ramp = rendered(16, lambda y, x: (x / 128, x / 128, x / 128, 1) if 8 <= y < 120 and 8 <= x < 120 else None)
        rows, palette = glyph(ramp, 16, most=4)
        self.assertEqual(len(palette), 5, 'the outline and four')
        brightness = [int(colour[1:3], 16) for colour in palette[1:]]
        self.assertEqual(brightness, sorted(brightness, reverse=True))
        self.assertTrue(set(''.join(rows)) <= set('.' + LETTERS[:5]))

    def test_an_empty_render_is_an_empty_glyph(self):
        rows, palette = glyph(np.zeros((8 * SCALE, 8 * SCALE, 4)), 8)
        self.assertEqual(rows, ['........'] * 8)
        self.assertEqual(palette, [])


if __name__ == '__main__':
    unittest.main()
