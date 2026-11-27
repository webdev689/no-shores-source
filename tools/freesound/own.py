"""Puts one of DFO's own picked sounds on R2 and into the game's list, beside the Freesound picks.

    python3 -I tools/freesound/own.py <cue> <name> <licence> <from> <file>...

DFO's own sounds are those its synthesiser made, and the CC0 or public-domain recordings chosen there. Each file is a variant of the cue, played in turn: footsteps
have several. Each is put on R2 under the SHA-256 of its bytes, unchanged; `licence` is `Ours` or `CC0`, and `from`
says where the sound came from. They owe no credit, so Settings does not list them; publish.py keeps them.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, TOOLS)
from r2 import put  # noqa: E402

REPO = os.path.dirname(TOOLS)
MANIFEST = os.path.join(REPO, 'content', 'audio', 'sounds.json')
WANTED = os.path.join(REPO, 'content', 'audio', 'freesound.json')
KINDS = {'.mp3': ('mp3', 'audio/mpeg'), '.wav': ('wav', 'audio/wav')}


def main():
    if len(sys.argv) < 6:
        sys.exit(__doc__)
    cue, name, licence, origin, *files = sys.argv[1:]
    if licence not in ('Ours', 'CC0'):
        sys.exit(f'{licence}: DFO\'s own sounds are Ours or CC0')
    with open(WANTED) as file:
        wanted = {each['id']: each for each in json.load(file)['cues']}
    # Only a cue the list says takes DFO's own: a Freesound pick would be dropped unsaid.
    if not isinstance(wanted.get(cue, {}).get('dfo'), str):
        sys.exit(f'{cue}: the list does not name a DFO sound picked for it')
    keys = []
    for path in files:
        extension = os.path.splitext(path)[1].lower()
        if extension not in KINDS:
            sys.exit(f'{path}: only MP3 or WAV')
        with open(path, 'rb') as file:
            keys.append(put(file.read(), 'sounds', *KINDS[extension]))
    with open(MANIFEST) as file:
        manifest = json.load(file)
    manifest['sounds'][cue] = {'keys': keys, 'name': name, 'licence': licence, 'from': origin, 'changes': 'Unchanged.'}
    manifest['sounds'] = dict(sorted(manifest['sounds'].items()))
    with open(MANIFEST, 'w') as file:
        file.write(json.dumps(manifest, indent=2) + '\n')
    print(f'{cue}: {len(keys)} file(s) in {os.path.relpath(MANIFEST, REPO)}')


if __name__ == '__main__':
    main()
