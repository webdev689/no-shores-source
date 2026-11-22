"""Checks that the Lattice's renders lay into the forge's tables as `forge_publish.py lattice` lays them: each move of
a foe beside its other moves, the wardrobe's own values kept, the skin in the dead's colour, and the wave cut into its
frames.

    python3 -I tools/test_forge_lattice.py
"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge_publish  # noqa: E402

NORD = [[61.6, 55.1, 38.2], [183.0, 140.0, 88.0]]
DARK_ELF = [[40.9, 40.1, 40.9], [110.0, 110.0, 110.0]]


def tables():
    looks = {'bodies': {'male': {'anims': {'idle': {}}, 'layers': {'belt': ['idle']}}}, 'order': {'belt': 0.0075},
             'dye': ['belt']}
    skins = {'bodies': {'male': {'skin': [NORD] * 5, 'races': {'nord': NORD, 'darkelf': DARK_ELF}}}}
    return looks, skins


def render(move, layers, cell, order):
    """A render.py index for the Husk's `move`."""
    return {'bodies': {'husk': {'anims': {move: {'frames': 4, 'cell': cell, 'root': [50, 116]}},
                                'layers': {layer: [move] for layer in layers}}},
            'depth': {'base': -3.0, 'scale': 10000.0}, 'order': order, 'dye': ['belt', 'breeches']}


class MergeFoe(unittest.TestCase):
    def test_moves_from_two_jobs_lie_side_by_side(self):
        looks, skins = tables()
        forge_publish.merge_foe(looks, skins, render('husk_hurt', ['body', 'lattice_husk'], [101, 119],
                                                     {'lattice_husk': 0.009}))
        forge_publish.merge_foe(looks, skins, render('husk_walk', ['body', 'belt'], [90, 120],
                                                     {'belt': 0.5, 'breeches': 0.0015}))
        husk = looks['bodies']['husk']
        self.assertEqual(sorted(husk['anims']), ['husk_hurt', 'husk_walk'])
        self.assertEqual(husk['layers']['body'], ['husk_hurt', 'husk_walk'])
        self.assertEqual(husk['anims']['husk_walk']['cell'], [90, 120])
        self.assertEqual(looks['order'], {'belt': 0.0075, 'lattice_husk': 0.009, 'breeches': 0.0015},
                         "the wardrobe's own order is kept")
        self.assertEqual(looks['dye'], ['belt', 'breeches'])
        self.assertIn('male', looks['bodies'])

    def test_a_move_drawn_again_replaces_what_was_published_of_it(self):
        looks, skins = tables()
        first = render('husk_hurt', ['body', 'lattice_husk'], [101, 119], {'lattice_husk': 0.009})
        first['bodies']['husk']['cells'] = {'lattice_husk': {'husk_hurt': {'cell': [140, 160]}}}
        forge_publish.merge_foe(looks, skins, first)
        forge_publish.merge_foe(looks, skins, render('husk_hurt', ['body'], [101, 119], {'lattice_husk': 0.01}))
        husk = looks['bodies']['husk']
        self.assertEqual(husk['layers']['lattice_husk'], [], 'a layer no longer drawn in it is not listed')
        self.assertEqual(husk['cells']['lattice_husk'], {}, 'nor its old cell kept')
        self.assertEqual(looks['order']['lattice_husk'], 0.01, "a Lattice layer's own order is the new one")

    def test_its_skin_is_the_mans_light_in_the_deads_colour(self):
        looks, skins = tables()
        forge_publish.merge_foe(looks, skins, render('husk_hurt', ['body'], [101, 119], {}))
        own = skins['bodies']['husk']
        light = sum(NORD[1]) / 3
        dead = [round(light * w, 1) for w in forge_publish.DEAD_SKIN]
        self.assertEqual(own['skin'][0][1], dead, 'its own skin')
        self.assertEqual(own['races']['nord'][1], dead, 'and every race the same, so no tone changes it')
        self.assertEqual(own['races']['darkelf'][1], [round(110.0 * w, 1) for w in forge_publish.DEAD_SKIN])
        red, green, blue = dead
        self.assertTrue(green > red > blue, 'grey graded green, never a living tone')


    def test_a_body_named_as_a_path_is_refused(self):
        looks, skins = tables()
        for name in ('../../site', 'husk/x', 'Husk', ''):
            own = render('husk_hurt', ['body'], [101, 119], {})
            own['bodies'] = {name: own['bodies']['husk']}
            with self.assertRaises(SystemExit):
                forge_publish.merge_foe(looks, skins, own)
        self.assertEqual(sorted(looks['bodies']), ['male'], 'nothing laid in before the refusal')


class Beside(unittest.TestCase):
    def test_a_pack_published_again_keeps_its_one_place(self):
        index = {'packs': ['packs/a.webp', 'packs/b.webp'], 'pictures': {'old': [1, 0, 9, 'w'], 'kept': [0, 0, 4, 'w']}}
        new = {'packs': ['packs/b.webp', 'packs/c.webp'], 'pictures': {'old': [0, 3, 9, 'w'], 'new': [1, 0, 5, 'w']}}
        forge_publish.beside(index, new)
        self.assertEqual(index['packs'], ['packs/a.webp', 'packs/b.webp', 'packs/c.webp'])
        self.assertEqual(index['pictures'], {'old': [1, 3, 9, 'w'], 'kept': [0, 0, 4, 'w'], 'new': [2, 0, 5, 'w']})


class WaveFrames(unittest.TestCase):
    def test_the_strip_is_cut_into_its_frames(self):
        from PIL import Image

        with tempfile.TemporaryDirectory() as folder, tempfile.TemporaryDirectory() as art:
            strip = Image.new('RGBA', (30, 4))
            strip.putpixel((25, 1), (200, 200, 200, 255))
            strip.save(os.path.join(folder, 'lattice_wave.png'))
            with open(os.path.join(folder, 'lattice_wave.json'), 'w') as file:
                json.dump({'frames': 3, 'cell': [10, 4], 'root': [5, 3]}, file)
            kept, forge_publish.WAVE_FRAMES = forge_publish.WAVE_FRAMES, art
            try:
                self.assertEqual(forge_publish.wave_frames(folder), 3)
            finally:
                forge_publish.WAVE_FRAMES = kept
            last = Image.open(os.path.join(art, 'wave-2.png'))
            self.assertEqual(last.size, (10, 4))
            self.assertEqual(last.getpixel((5, 1)), (200, 200, 200, 255))


if __name__ == '__main__':
    unittest.main()
