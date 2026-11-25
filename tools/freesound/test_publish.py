"""publish.py as the freesound workflow runs it, on a machine with no numpy, over downloads made here: a cue of one
pick written whole with its credit, a cue of several written as its variations with each one's credit, DFO's own
kept, and a cue no longer picked dropped; a pick already on R2 kept there, beside a new one sent, as a single pick
becomes several; a cut cue of several published from each pick's own cut; and a music cue's root checked by its
pattern. Nothing goes to R2: its door is stood in for by a counter.

    python3 -I tools/freesound/test_publish.py"""
import json
import os
import sys
import tempfile
import unittest

# As on the workflow's machine: numpy cannot be imported.
sys.modules['numpy'] = None
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import publish  # noqa: E402

CC0 = {'name': 'CC0', 'url': 'https://creativecommons.org/publicdomain/zero/1.0/'}
MP3 = b'ID3 a recording'
CUT = b'ID3 a recording, cut'


def pick(cue, sound, file):
    return {'id': cue, 'freesound': sound, 'name': f'n{sound}', 'author': 'a', 'licence': CC0,
            'page': f'https://freesound.org/people/a/sounds/{sound}/', 'file': file}


def published(cues, before, picks, cut=()):
    """The sounds publish.py writes for `cues` over `before` from a download of `picks`, those in `cut` already cut
    as the workflow's --cut step leaves them; and the bytes it sent to R2, in order."""
    with tempfile.TemporaryDirectory() as here:
        download = os.path.join(here, 'download')
        os.makedirs(os.path.join(download, 'picks'))
        for each in picks:
            with open(os.path.join(download, each['file']), 'wb') as file:
                file.write(MP3)
            if each['freesound'] in cut:
                with open(publish.cut_path(download, each), 'wb') as file:
                    file.write(CUT)
        with open(os.path.join(download, 'picks.json'), 'w') as file:
            json.dump(picks, file)
        publish.WANTED = os.path.join(here, 'freesound.json')
        with open(publish.WANTED, 'w') as file:
            json.dump({'cues': cues}, file)
        publish.MANIFEST = os.path.join(here, 'sounds.json')
        with open(publish.MANIFEST, 'w') as file:
            json.dump({'sounds': before}, file)
        made = []
        publish.put = lambda data, *rest: made.append(data) or f'sounds/{len(made)}.mp3'
        sys.argv = ['publish.py', download]
        publish.main()
        with open(publish.MANIFEST) as file:
            return json.load(file)['sounds'], made


class Picks(unittest.TestCase):
    def test_one_pick_and_several_each_with_its_credit_dfo_s_own_kept_and_an_unpicked_cue_dropped(self):
        picks = [pick('one', 11, 'picks/one.mp3'), pick('many', 21, 'picks/many.21.mp3'),
                 pick('many', 22, 'picks/many.22.mp3')]
        cues = [{'id': 'one', 'picked': 11}, {'id': 'many', 'picked': [21, 22]}, {'id': 'gone'}, {'id': 'own'}]
        before = {'gone': {'keys': ['sounds/old.mp3'], 'credits': [{'freesound': 9}], 'changes': 'Unchanged.'},
                  'own': {'keys': ['sounds/own.mp3'], 'name': 'n', 'licence': 'Ours', 'from': 'DFO'}}
        sounds, _ = published(cues, before, picks)
        self.assertEqual((sounds['one']['key'], sounds['one']['freesound']), ('sounds/1.mp3', 11))
        self.assertEqual(sounds['many']['keys'], ['sounds/2.mp3', 'sounds/3.mp3'], 'each variation its file, in order')
        self.assertEqual([each['freesound'] for each in sounds['many']['credits']], [21, 22], 'and each its credit')
        self.assertTrue(all(each['author'] and each['page'] for each in sounds['many']['credits']))
        self.assertIn('own', sounds, "DFO's own kept")
        self.assertNotIn('gone', sounds, 'a cue no longer picked dropped')

    def test_picks_on_r2_are_kept_and_a_cut_cue_of_several_sends_each_pick_s_own_cut(self):
        picks = [pick('one', 11, 'picks/one.11.mp3'), pick('one', 12, 'picks/one.12.mp3'),
                 pick('many', 21, 'picks/many.21.mp3'), pick('many', 23, 'picks/many.23.mp3'),
                 pick('strides', 31, 'picks/strides.31.mp3'), pick('strides', 32, 'picks/strides.32.mp3')]
        cues = [{'id': 'one', 'picked': [11, 12]}, {'id': 'many', 'picked': [21, 23]},
                {'id': 'strides', 'picked': [31, 32], 'cut': [1, 0.5], 'mono': True}]
        whole = publish.changes_of('one', {})
        before = {'one': {'key': 'sounds/k11.mp3', 'freesound': 11, 'changes': whole},
                  'many': {'keys': ['sounds/k21.mp3', 'sounds/k22.mp3'],
                           'credits': [{'freesound': 21}, {'freesound': 22}], 'changes': whole}}
        sounds, made = published(cues, before, picks, cut=(31, 32))
        self.assertEqual(sounds['one']['keys'][0], 'sounds/k11.mp3', 'a single pick become several keeps its file')
        self.assertEqual(sounds['many']['keys'][0], 'sounds/k21.mp3', 'a pick kept in the list keeps its file')
        self.assertEqual((len(made), made.count(MP3), made.count(CUT)), (4, 2, 2), 'only the new and the cut are sent')
        self.assertEqual([each['freesound'] for each in sounds['strides']['credits']], [31, 32])
        self.assertTrue(sounds['strides']['changes'].startswith('Cut to 0.5 s from 1 s in, made mono'))


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
