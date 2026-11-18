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


if __name__ == '__main__':
    unittest.main()
