"""The dungeon modules' two contracts, content/dungeon/kits.json and content/dungeon/landmarks.json, read once: the
parts every piece wears, the kit pieces every style builds, each style's rules, and the landmarks.

Plain Python: the build, the envelopes, the exporter, the publisher and the tests all read the contracts through it.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'content', 'dungeon')


def _read(name):
    with open(os.path.join(CONTENT, name)) as file:
        return json.load(file)


_KITS = _read('kits.json')
_LANDMARKS = _read('landmarks.json')

PARTS = tuple(_KITS['parts'])
PIECES = tuple(_KITS['pieces'])
STYLES = dict(_KITS['styles'])
# The passages' own pieces, one pack beside the styles': each module's size, its solids (boxes and discs) and glows.
PASSAGE = 'passage'
PASSAGE_MODULES = dict(_KITS['passage']['modules'])
# Every pack a build writes: a style's each, then the passages'.
PACKS = tuple(STYLES) + (PASSAGE,)
# The style whose pictures the passages' contact sheet wears: the barrow's, the grey-green stone the pieces are of.
PASSAGE_PICTURES = 'barrow'
LANDMARKS = tuple(_LANDMARKS['landmarks'])
GLOW_KINDS = tuple(_LANDMARKS['glowKinds'])
# A cell's side, metres: the dungeon crate's CELL_M.
CELL_M = 3.2


def least_ceiling(style):
    """The lowest ceiling any of the style's rooms or corridors has, metres."""
    return STYLES[style]['leastCeiling']


def landmarks_of(style):
    """The style's landmarks, in the contract's order."""
    return [landmark for landmark in LANDMARKS if landmark['style'] == style]


def landmark(module):
    """The landmark a module name names, or None."""
    return next((landmark for landmark in LANDMARKS if landmark['module'] == module), None)


def required(style):
    """Every module name a style's pack holds, in the pack's order: `<style>.<piece>` for each kit piece but those it
    `leaves` (a passage's style, one storey deep, builds no flight or balustrade), then the style's landmarks'
    `module` names; the passages' pack holds its modules in kits.json's order."""
    if style == PASSAGE:
        return list(PASSAGE_MODULES)
    if style not in STYLES:
        raise KeyError(f'{style!r} is no style in kits.json: {", ".join(STYLES)}')
    pieces = [piece for piece in PIECES if piece not in STYLES[style].get('leaves', ())]
    return [f'{style}.{piece}' for piece in pieces] + [landmark['module'] for landmark in landmarks_of(style)]


def piece_of(module):
    """The kit piece a module name holds (`crypt.door.a` holds `door.a`), or None for a landmark."""
    style, _, piece = module.partition('.')
    return piece if style in STYLES and piece in PIECES else None
