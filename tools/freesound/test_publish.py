"""publish.py on a download made here: a cue of one pick written whole with its credit, a cue of several written as
its variations with each one's credit, DFO's own kept, and a cue no longer picked dropped. Nothing goes to R2: its
door is stood in for by a counter.

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


def pick(cue, sound, file):
    return {'id': cue, 'freesound': sound, 'name': f'n{sound}', 'author': 'a', 'licence': CC0,
            'page': f'https://freesound.org/people/a/sounds/{sound}/', 'file': file}


def run():
    with tempfile.TemporaryDirectory() as here:
        download = os.path.join(here, 'download')
        os.makedirs(os.path.join(download, 'picks'))
        picks = [pick('one', 11, 'picks/one.mp3'), pick('many', 21, 'picks/many.21.mp3'),
                 pick('many', 22, 'picks/many.22.mp3')]
        for each in picks:
            with open(os.path.join(download, each['file']), 'wb') as file:
                file.write(MP3)
        with open(os.path.join(download, 'picks.json'), 'w') as file:
            json.dump(picks, file)
        publish.WANTED = os.path.join(here, 'freesound.json')
        with open(publish.WANTED, 'w') as file:
            json.dump({'cues': [{'id': 'one', 'picked': 11}, {'id': 'many', 'picked': [21, 22]},
                                {'id': 'gone'}, {'id': 'own'}]}, file)
        publish.MANIFEST = os.path.join(here, 'sounds.json')
        before = {'gone': {'keys': ['sounds/old.mp3'], 'credits': [{'freesound': 9}], 'changes': 'Unchanged.'},
                  'own': {'keys': ['sounds/own.mp3'], 'name': 'n', 'licence': 'Ours', 'from': 'DFO'}}
        with open(publish.MANIFEST, 'w') as file:
            json.dump({'sounds': before}, file)
        made = []
        publish.put = lambda data, *rest: made.append(data) or f'sounds/{len(made)}.mp3'
        sys.argv = ['publish.py', download]
        publish.main()
        with open(publish.MANIFEST) as file:
            sounds = json.load(file)['sounds']
    assert sounds['one']['key'] == 'sounds/1.mp3' and sounds['one']['freesound'] == 11, sounds['one']
    assert sounds['many']['keys'] == ['sounds/2.mp3', 'sounds/3.mp3'], 'each variation its file, in order'
    assert [each['freesound'] for each in sounds['many']['credits']] == [21, 22], 'and each its credit'
    assert all(each['author'] and each['page'] for each in sounds['many']['credits'])
    assert 'own' in sounds and 'gone' not in sounds, 'DFO\'s own kept, a cue no longer picked dropped'
    return sounds


if __name__ == '__main__':
    run()
    print('publish: a single pick, several picks, DFO\'s own kept and an unpicked cue dropped')
