"""publish.py loads where the freesound workflow runs it, a machine with no numpy: it checks a root by root.py's
pattern, and only measuring one needs numpy.

    python3 -I tools/freesound/test_publish.py"""
import os
import sys
import unittest

# As on the workflow's machine: numpy cannot be imported.
sys.modules['numpy'] = None
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import publish  # noqa: E402


class RootsWithoutNumpy(unittest.TestCase):
    def test_a_music_cue_keeps_its_root(self):
        self.assertEqual(publish.root_of('music.harp', {'root': 'C3-38'}), {'root': 'C3-38'})

    def test_a_cue_with_no_root_gets_none(self):
        self.assertEqual(publish.root_of('music.harp', {}), {})

    def test_a_root_not_written_as_root_py_writes_it_stops_the_publish(self):
        with self.assertRaises(SystemExit):
            publish.root_of('music.harp', {'root': 'middle C'})


if __name__ == '__main__':
    unittest.main()
