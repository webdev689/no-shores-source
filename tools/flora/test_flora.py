"""Checks that the flora's generator is deterministic: the same seed grows the same plant, to the byte.

    python -I tools/flora/test_flora.py

bpy is needed (for the occlusion's ray casts), as for bake.py.
"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import atlas  # noqa: E402
import near  # noqa: E402
from detail import surfaces  # noqa: E402
from growers import grown  # noqa: E402
from species import BIOMES  # noqa: E402


def near_bytes(biome, kind_index, form_index):
    """A form's near mesh bytes, grown from scratch: wood, cards (or a boulder), occlusion and all."""
    form = BIOMES[biome][kind_index][1][form_index]
    model = grown(form)
    detailed = surfaces(model, np.random.default_rng(form['seed'] + 7919))
    mesh = near.Near()
    if model.rock:
        near.rock(mesh, model)
    else:
        near.wood(mesh, model, 200)
        groups = near.groups_of(model.clusters, 90)
        near.cards(mesh, model, groups, ['spray'], near.crown_normal(model), np.random.default_rng(1))
    near.occlusion(mesh, detailed, 3.0)
    return near.encoded(mesh, model.height, {'spray': (0.25, 0.5, 0.25, 0.25)})


class Deterministic(unittest.TestCase):
    def test_a_tree_is_the_same_bytes_from_the_same_seed(self):
        self.assertEqual(near_bytes('woodland', 0, 0), near_bytes('woodland', 0, 0))

    def test_a_boulder_is_the_same_bytes_from_the_same_seed(self):
        self.assertEqual(near_bytes('highland', 2, 1), near_bytes('highland', 2, 1))

    def test_two_seeds_grow_two_trees(self):
        self.assertNotEqual(near_bytes('woodland', 0, 0), near_bytes('woodland', 0, 1))

    def test_the_mesh_holds_its_count_and_36_bytes_a_vertex(self):
        data = near_bytes('woodland', 0, 0)
        count = int.from_bytes(data[:4], 'little')
        self.assertEqual(len(data), 4 + count * near.VERTEX_BYTES)
        self.assertLessEqual(count // 3, near.BUDGETS['tree'])

    def test_a_picture_layer_is_the_same_bytes_every_time(self):
        picture = np.random.default_rng(3).uniform(0, 1, (256, 256, 4)).astype(np.float32)
        pictures = {'one': (picture, picture)}
        places, count = atlas.packed([], [['one']])
        self.assertEqual(atlas.layers(pictures, places, count), atlas.layers(pictures, places, count))

    def test_mips_keep_an_opaque_picture_opaque_and_a_sparse_one_as_covered(self):
        level0 = np.zeros((atlas.LAYER, atlas.LAYER, 4), np.float32)
        level0[:256, :256, 3] = 1.0
        # A quarter of a cell's pixels opaque, scattered: box filtering alone would leave nothing over a half.
        level0[256:384, :128, 3] = (np.random.default_rng(4).uniform(0, 1, (128, 128)) < 0.25).astype(np.float32)
        chain = atlas.mips(level0)
        for level in range(1, atlas.MIPS):
            size = 256 >> level
            self.assertEqual(float(chain[level][:size, :size, 3].min()), 1.0)
            cell = 128 >> level
            sparse = chain[level][size:size + cell, :cell, 3]
            self.assertGreater(float((sparse > 0.5).mean()), 0.15)

    def test_a_card_is_cut_to_its_pictures_cover(self):
        albedo = np.zeros((256, 256, 4), np.float32)
        albedo[100:150, 20:230, 3] = 1.0
        corners = list(near.card_shape(albedo))
        self.assertEqual(len(corners), 4)
        self.assertTrue(all(0 <= u <= 1 and 0 <= v <= 1 for u, v in corners))
        self.assertLess(polygon_area(corners), 0.5)
        rows, columns = np.nonzero(albedo[..., 3] > 0.25)
        for x, y in zip((columns + 0.5) / 256, (rows + 0.5) / 256):
            self.assertTrue(inside(corners, x, y), (x, y))

    def test_a_round_picture_keeps_its_whole_card(self):
        albedo = np.ones((256, 256, 4), np.float32)
        self.assertAlmostEqual(polygon_area(near.card_shape(albedo)), 1.0, places=6)

    def test_the_sprites_box_holds_what_every_frame_shows(self):
        albedo = np.zeros((atlas.SHEET[1], atlas.SHEET[0], 4), np.float32)
        albedo[128 + 10:128 + 120, 3 * 128 + 40:3 * 128 + 80, 3] = 1.0
        albedo[3 * 128 + 30:3 * 128 + 90, 50:100, 3] = 1.0
        left, top, right, bottom = sprites_box(albedo)
        self.assertTrue(left <= 40 / 128 and right >= 100 / 128 and top <= 10 / 128 and bottom >= 120 / 128)
        self.assertTrue(left > 0.2 and right < 0.9 and top >= 0 and bottom <= 1)


def polygon_area(corners):
    """The area a polygon's corners enclose, in uv units."""
    points = np.array(corners)
    x, y = points[:, 0], points[:, 1]
    return abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))) / 2


def inside(corners, x, y):
    """Whether a point lies in a convex polygon, its edge included."""
    signs = []
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        signs.append((bx - ax) * (y - ay) - (by - ay) * (x - ax))
    return all(sign >= -1e-9 for sign in signs) or all(sign <= 1e-9 for sign in signs)


def sprites_box(albedo):
    """The sprites' box, with bpy's sprites module loaded only here (it renders, the rest of the tests do not)."""
    import sprites
    return sprites.box_of((albedo, albedo))


if __name__ == '__main__':
    unittest.main()
