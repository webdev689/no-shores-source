"""Checks that the figures workflow's jobs lay into the forge's tables as `forge_publish.py figures` lays them: the
first job of a move gives it its cell, a layer drawn in another cell keeps its own, a published layer not drawn again
keeps the cell its strip was drawn in, and the jobs are one for each set, body and move.

    python3 -I tools/test_forge_figures.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge_publish  # noqa: E402

OLD = {'frames': 4, 'cell': [103, 116], 'root': [51, 111]}
NEW = {'frames': 4, 'cell': [93, 116], 'root': [46, 111]}
WIDE = {'frames': 4, 'cell': [121, 120], 'root': [60, 115]}


def published():
    """Published tables: the walk drawn wide, the body and a boot in its cell, a staff past it in its own."""
    return {'bodies': {'male': {'anims': {'walk': OLD},
                                'layers': {'body': ['idle', 'walk'], 'boots_iron': ['walk'], 'staff': ['walk']},
                                'cells': {'staff': {'walk': WIDE}}}},
            'order': {'boots_iron': 0.004}, 'dye': ['shirt']}


def job(anims, layers, cells=None, order=None):
    """A layers.py index begun empty: `anims` its moves' cells, `layers` each layer's moves, `cells` the layers drawn in
    a cell of their own."""
    return {'bodies': {'male': {'anims': anims, 'layers': layers, 'cells': cells or {}}},
            'order': order or {}, 'dye': ['shirt', 'tunic'], 'depth': {'base': -3.0, 'scale': 10000.0}}


class MergeFigures(unittest.TestCase):
    def test_the_first_job_gives_the_move_its_cell(self):
        looks, claimed = published(), set()
        forge_publish.merge_figures(looks, job({'walk': NEW}, {'body': ['walk'], 'staff': ['walk']}), claimed)
        male = looks['bodies']['male']
        self.assertEqual(male['anims']['walk'], NEW)
        # the staff is drawn within the move's cell now; the boot, not drawn again, keeps the cell it was drawn in
        self.assertNotIn('staff', male['cells'])
        self.assertEqual(male['cells']['boots_iron'], {'walk': OLD})
        self.assertEqual(male['layers']['body'], ['idle', 'walk'])

    def test_a_later_job_in_another_cell_keeps_its_own(self):
        looks, claimed = published(), set()
        forge_publish.merge_figures(looks, job({'walk': NEW}, {'body': ['walk']}), claimed)
        forge_publish.merge_figures(looks, job({'walk': WIDE}, {'boots_iron': ['walk'], 'tunic': ['walk']},
                                               order={'tunic': 0.002}), claimed)
        male = looks['bodies']['male']
        self.assertEqual(male['anims']['walk'], NEW)
        self.assertEqual(male['cells']['boots_iron'], {'walk': WIDE})
        self.assertEqual(male['cells']['tunic'], {'walk': WIDE})
        self.assertEqual(male['layers']['tunic'], ['walk'])
        self.assertEqual(looks['order'], {'boots_iron': 0.004, 'tunic': 0.002})
        self.assertEqual(looks['dye'], ['shirt', 'tunic'])

    def test_a_later_job_in_the_moves_cell_drops_a_cell_of_its_own(self):
        looks, claimed = published(), set()
        forge_publish.merge_figures(looks, job({'walk': NEW}, {'body': ['walk']}), claimed)
        forge_publish.merge_figures(looks, job({'walk': NEW}, {'boots_iron': ['walk']}), claimed)
        self.assertNotIn('boots_iron', looks['bodies']['male']['cells'])

    def test_a_new_move_takes_the_first_jobs_cell(self):
        looks, claimed = published(), set()
        forge_publish.merge_figures(looks, job({'quaff': NEW}, {'body': ['quaff'], 'prop_flask': ['quaff']}), claimed)
        forge_publish.merge_figures(looks, job({'quaff': WIDE}, {'tunic': ['quaff']}), claimed)
        male = looks['bodies']['male']
        self.assertEqual(male['anims']['quaff'], NEW)
        self.assertEqual(male['layers']['prop_flask'], ['quaff'])
        self.assertEqual(male['cells']['tunic'], {'quaff': WIDE})
        self.assertNotIn('quaff', male['cells'].get('boots_iron', {}))


class Jobs(unittest.TestCase):
    def test_a_job_for_each_set_body_and_move(self):
        got = forge_publish.jobs('walk,quaff')
        names = [job['name'] for job in got]
        self.assertEqual(len(names), len(set(names)))
        self.assertIn({'set': 'armour', 'body': 'female', 'anims': 'quaff', 'name': 'armour-female-quaff'}, got)
        self.assertIn({'set': 'hair', 'body': 'male', 'anims': 'walk,quaff', 'name': 'hair-male-walk-quaff'}, got)
        self.assertEqual(len(got), 3 * 2 * 2 + 2 * 2)

    def test_a_move_not_named_plainly_stops_it(self):
        with self.assertRaises(SystemExit):
            forge_publish.jobs('walk;rm -rf')
        with self.assertRaises(SystemExit):
            forge_publish.jobs('')


if __name__ == '__main__':
    unittest.main()
