"""Publishes the owner's picked Freesound sounds to R2 and writes the game's list of them, with each one's credit.

    python3 -I tools/freesound/publish.py <download>   # the freesound workflow's download, unzipped

The download holds `picks.json`, each pick read from its own Freesound page (its title, author and licence link), and
`picks/<cue>.mp3`, its preview. Each preview is put on R2 under the SHA-256 of its bytes, unchanged, and
content/audio/sounds.json is written for the game, which plays each in place of its synthesised cue and lists each
credit in Settings. A pick that was not read whole stops the publish: no sound goes in without its credit.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
# Run with -I, the tools folder is not on the path: R2's door sits there.
sys.path.insert(0, TOOLS)
from r2 import PUBLIC, put  # noqa: E402

REPO = os.path.dirname(TOOLS)
MANIFEST = os.path.join(REPO, 'content', 'audio', 'sounds.json')
WANTED = os.path.join(REPO, 'content', 'audio', 'freesound.json')
# What was done to each on its way in, as an Attribution licence asks a credit to say.
CHANGES = "Unchanged; played at the game's own level."


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    download = sys.argv[1]
    with open(os.path.join(download, 'picks.json')) as file:
        picks = json.load(file)
    with open(WANTED) as file:
        wanted = {cue['id']: cue.get('picked') for cue in json.load(file)['cues']}
    sounds = {}
    for pick in picks:
        cue = pick['id']
        if wanted.get(cue) != pick['freesound']:
            sys.exit(f'{cue}: the download picked {pick["freesound"]}, the list {wanted.get(cue)}')
        licence = pick.get('licence') or {}
        if not (pick.get('name') and pick.get('author') and pick.get('page') and licence.get('url') and pick.get('file')):
            sys.exit(f'{cue}: not read whole, so not published: {pick}')
        with open(os.path.join(download, pick['file']), 'rb') as file:
            data = file.read()
        sounds[cue] = {
            'key': put(data, 'sounds', 'mp3', 'audio/mpeg'),
            'freesound': pick['freesound'],
            'name': pick['name'],
            'author': pick['author'],
            'licence': licence['name'],
            'licenceUrl': licence['url'],
            'page': pick['page'],
            'changes': CHANGES,
        }
    manifest = {
        'about': "The owner's picks from Freesound, kept on R2 by their hash, each with its credit. Written by "
        'tools/freesound/publish.py; the game plays each in place of its synthesised cue.',
        'base': PUBLIC,
        'sounds': dict(sorted(sounds.items())),
    }
    with open(MANIFEST, 'w') as file:
        file.write(json.dumps(manifest, indent=2) + '\n')
    print(f'{len(sounds)} sounds in {os.path.relpath(MANIFEST, REPO)}')


if __name__ == '__main__':
    main()
