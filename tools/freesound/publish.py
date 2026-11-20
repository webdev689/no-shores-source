"""Puts the owner's picked Freesound sounds on R2 under the hash of their bytes and writes content/audio/sounds.json,
each with its credit, from the freesound workflow's download: picks.json, read from each pick's page, and
picks/<cue>.mp3, its preview. A pick not read whole stops the publish: no sound goes in without its credit.

    python3 -I tools/freesound/publish.py --cut <download>   # first, with no key: cut long picks (ffmpeg)
    python3 -I tools/freesound/publish.py <download>         # then, with the Cloudflare token: publish, no ffmpeg

Cutting decodes a stranger's audio, so it runs where no key is held."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
# Run with -I, the tools folder is not on the path: R2's door sits there.
sys.path.insert(0, TOOLS)
from r2 import PUBLIC, put  # noqa: E402

REPO = os.path.dirname(TOOLS)
MANIFEST = os.path.join(REPO, 'content', 'audio', 'sounds.json')
WANTED = os.path.join(REPO, 'content', 'audio', 'freesound.json')
# What was done to each on its way in, as an Attribution licence asks a credit to say; Settings says once that each
# plays at the game's own level. The sounds heard most vary a little in pitch each time (uiSounds.ts, play; the world's
# steps, swings and blows in worldSounds.ts; every ambience recording in the ambience's player).
CHANGES = 'Unchanged.'
VARIED = re.compile(r'ui\.(hover|press|back)|(step|swing|hit|amb)\..+')
VARIES = 'Its pitch varies a little each time it plays.'
# The licences the owner allows, each at its own address with its version.
LICENCES = {
    'CC0': re.compile(r'https://creativecommons\.org/publicdomain/zero/\d\.\d/'),
    'CC-BY': re.compile(r'https://creativecommons\.org/licenses/by/\d\.\d/'),
}


# A cut recording fades in and out over its ends, so a loop's seam or its first play never clicks.
EDGE_S = 0.05


def cut(data, start, seconds, mono):
    """The stretch of a recording its cue asks for, as an MP3: a long one is cut, so the game fetches and holds less."""
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg is needed to cut a recording')
    with tempfile.TemporaryDirectory() as here:
        source, out = os.path.join(here, 'in.mp3'), os.path.join(here, 'out.mp3')
        with open(source, 'wb') as file:
            file.write(data)
        fades = f'afade=t=in:d={EDGE_S},afade=t=out:st={seconds - EDGE_S}:d={EDGE_S}'
        channels = ['-ac', '1'] if mono else []
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-t', str(seconds), '-i', source, *channels,
                        '-af', fades, '-codec:a', 'libmp3lame', '-b:a', '160k', out], check=True)
        with open(out, 'rb') as file:
            return file.read()


def is_mp3(data):
    """Whether the bytes open as an MP3 does: its tags, or a frame's sync."""
    return data[:3] == b'ID3' or (len(data) > 1 and data[0] == 0xFF and data[1] >= 0xE0)


def picks_read(download):
    """Each pick of the download, read and checked against the list: (cue, its pick, its bytes, its cue's entry)."""
    with open(os.path.join(download, 'picks.json')) as file:
        picks = json.load(file)
    with open(WANTED) as file:
        cues = {cue['id']: cue for cue in json.load(file)['cues']}
    wanted = {cue: each.get('picked') for cue, each in cues.items()}
    picked = {cue for cue, sound in wanted.items() if sound}
    # Every pick the list names, and no other: an older download would drop one from the game unsaid.
    if {pick['id'] for pick in picks} != picked:
        sys.exit(f'the download holds {sorted(pick["id"] for pick in picks)}, the list picks {sorted(picked)}')
    for pick in picks:
        cue = pick['id']
        if wanted.get(cue) != pick['freesound']:
            sys.exit(f'{cue}: the download picked {pick["freesound"]}, the list {wanted.get(cue)}')
        licence = pick.get('licence') or {}
        if not (pick.get('name') and pick.get('author') and pick.get('page') and licence.get('url') and pick.get('file')):
            sys.exit(f'{cue}: not read whole, so not published: {pick}')
        # Checked here, before anything goes up for good: the download is read, not trusted.
        allowed = LICENCES.get(licence.get('name'))
        if not (allowed and allowed.fullmatch(licence['url'])):
            sys.exit(f'{cue}: {licence} is not a licence the owner allows')
        if pick['file'] != f'picks/{cue}.mp3':
            sys.exit(f'{cue}: its file is {pick["file"]!r}, not picks/{cue}.mp3')
        with open(os.path.join(download, pick['file']), 'rb') as file:
            data = file.read()
        if not is_mp3(data):
            sys.exit(f'{cue}: {pick["file"]} is not an MP3')
        yield cue, pick, data, cues[cue]


def cut_of(entry):
    """What a cue's cut does to its file, as its credit says it, or nothing for a pick used whole."""
    if not entry.get('cut'):
        return ''
    start, seconds = entry['cut']
    return f'Cut to {seconds:g} s from {start:g} s in{", made mono" if entry.get("mono") else ""}, its ends faded.'


def changes_of(cue, entry):
    """Everything done to a pick on its way in and as it plays, as its credit says it."""
    said = [cut_of(entry), VARIES if VARIED.fullmatch(cue) else '']
    return ' '.join(part for part in said if part) or CHANGES


def kept_key(before, cue, pick, entry):
    """The file a pick already has on R2, the same sound cut the same way (or whole as it was): ffmpeg's bytes differ
    from one version to the next, so cut again it would go up anew under another hash and the game would fetch the
    same sound twice over. Its credit may still change."""
    published = before.get(cue, {})
    cut, said = cut_of(entry), published.get('changes', '')
    same_file = said.startswith(cut) if cut else not said.startswith('Cut to')
    return published['key'] if published.get('freesound') == pick['freesound'] and same_file else None


def cut_path(download, cue):
    return os.path.join(download, 'picks', f'{cue}.cut.mp3')


def main():
    arguments = sys.argv[1:]
    cutting = arguments[:1] == ['--cut']
    if len(arguments) != 1 + cutting:
        sys.exit(__doc__)
    download = arguments[-1]
    with open(MANIFEST) as file:
        before = json.load(file)['sounds']
    if cutting:
        for cue, pick, data, entry in picks_read(download):
            if entry.get('cut') and not kept_key(before, cue, pick, entry):
                start, seconds = entry['cut']
                with open(cut_path(download, cue), 'wb') as file:
                    file.write(cut(data, start, seconds, entry.get('mono', False)))
                print(f'{cue}: cut', flush=True)
        return
    sounds = {}
    for cue, pick, data, entry in picks_read(download):
        key = kept_key(before, cue, pick, entry)
        if not key and entry.get('cut'):
            if not os.path.exists(cut_path(download, cue)):
                sys.exit(f'{cue}: not cut yet: run publish.py --cut first, in a step that holds no key')
            with open(cut_path(download, cue), 'rb') as file:
                data = file.read()
        licence = pick['licence']
        sounds[cue] = {
            'key': key or put(data, 'sounds', 'mp3', 'audio/mpeg'),
            'freesound': pick['freesound'],
            'name': pick['name'],
            'author': pick['author'],
            'licence': licence['name'],
            'licenceUrl': licence['url'],
            'page': pick['page'],
            'changes': changes_of(cue, entry),
        }
    # DFO's own sounds the owner picked are put in by own.py, not by a download: kept, unless the cue now has a pick.
    sounds.update({cue: sound for cue, sound in before.items() if 'freesound' not in sound and cue not in sounds})
    manifest = {
        'about': "The owner's picks, kept on R2 by their hash: Freesound's, each with its credit, written by "
        "tools/freesound/publish.py, and DFO's own, by tools/freesound/own.py. The game plays each in place of its "
        'synthesised cue, or for its world cue.',
        'base': PUBLIC,
        'sounds': dict(sorted(sounds.items())),
    }
    with open(MANIFEST, 'w') as file:
        file.write(json.dumps(manifest, indent=2) + '\n')
    print(f'{len(sounds)} sounds in {os.path.relpath(MANIFEST, REPO)}')


if __name__ == '__main__':
    main()
