"""publish.py on a download made here: a cue of one pick written whole with its credit, a cue of several written as
its variations with each one's credit, DFO's own kept, and a cue no longer picked dropped; a pick already on R2 kept
there, beside a new one sent, as a single pick becomes several; and a cut cue of several published from each pick's
own cut. Nothing goes to R2: its door is stood in for by a counter.

    python3 -I tools/freesound/test_publish.py"""
import importlib.util
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('publish', os.path.join(HERE, 'publish.py'))
publish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publish)

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


def run():
    picks = [pick('one', 11, 'picks/one.mp3'), pick('many', 21, 'picks/many.21.mp3'),
             pick('many', 22, 'picks/many.22.mp3')]
    cues = [{'id': 'one', 'picked': 11}, {'id': 'many', 'picked': [21, 22]}, {'id': 'gone'}, {'id': 'own'}]
    before = {'gone': {'keys': ['sounds/old.mp3'], 'credits': [{'freesound': 9}], 'changes': 'Unchanged.'},
              'own': {'keys': ['sounds/own.mp3'], 'name': 'n', 'licence': 'Ours', 'from': 'DFO'}}
    sounds, _ = published(cues, before, picks)
    assert sounds['one']['key'] == 'sounds/1.mp3' and sounds['one']['freesound'] == 11, sounds['one']
    assert sounds['many']['keys'] == ['sounds/2.mp3', 'sounds/3.mp3'], 'each variation its file, in order'
    assert [each['freesound'] for each in sounds['many']['credits']] == [21, 22], 'and each its credit'
    assert all(each['author'] and each['page'] for each in sounds['many']['credits'])
    assert 'own' in sounds and 'gone' not in sounds, 'DFO\'s own kept, a cue no longer picked dropped'


def run_kept_and_cut():
    picks = [pick('one', 11, 'picks/one.11.mp3'), pick('one', 12, 'picks/one.12.mp3'),
             pick('many', 21, 'picks/many.21.mp3'), pick('many', 23, 'picks/many.23.mp3'),
             pick('strides', 31, 'picks/strides.31.mp3'), pick('strides', 32, 'picks/strides.32.mp3')]
    cues = [{'id': 'one', 'picked': [11, 12]}, {'id': 'many', 'picked': [21, 23]},
            {'id': 'strides', 'picked': [31, 32], 'cut': [1, 0.5], 'mono': True}]
    whole = publish.changes_of('one', {})
    before = {'one': {'key': 'sounds/k11.mp3', 'freesound': 11, 'changes': whole},
              'many': {'keys': ['sounds/k21.mp3', 'sounds/k22.mp3'], 'credits': [{'freesound': 21}, {'freesound': 22}],
                       'changes': whole}}
    sounds, made = published(cues, before, picks, cut=(31, 32))
    assert sounds['one']['keys'][0] == 'sounds/k11.mp3', 'a single pick become several keeps its file on R2'
    assert sounds['many']['keys'][0] == 'sounds/k21.mp3', 'a pick kept in the list keeps its file'
    assert len(made) == 4 and made.count(MP3) == 2, 'only the two new picks and the two cut are sent'
    assert made.count(CUT) == 2, 'a cut cue of several sends each pick\'s own cut'
    assert [each['freesound'] for each in sounds['strides']['credits']] == [31, 32]
    assert sounds['strides']['changes'].startswith('Cut to 0.5 s from 1 s in, made mono')


if __name__ == '__main__':
    run()
    run_kept_and_cut()
    print('publish: a single pick, several picks, DFO\'s own kept, an unpicked cue dropped, picks on R2 kept and '
          'several cut')
