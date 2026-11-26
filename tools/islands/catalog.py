"""The island modules' contract, content/islands/kits.json, read once: the parts every piece wears, the kits, and each
module's role, size and solids.

Plain Python: the build, the envelopes, the exporter, the publisher and the tests all read the contract through it.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'content', 'islands')

with open(os.path.join(CONTENT, 'kits.json')) as _file:
    _KITS = json.load(_file)

PARTS = tuple(_KITS['parts'])
KITS = tuple(_KITS['kits'])
# Each module by name, in the file's order: {'role', 'size' [x, y, z], 'solids' [[x, y, r], ...]}.
MODULES = dict(_KITS['modules'])
# The kits a climate dresses with; the common kit serves every climate, and the passages' kit stands their own
# pieces in a passage zone above ground, so neither is a biome's.
BIOMES = tuple(kit for kit in KITS if kit not in ('common', 'passage'))


def required(kit):
    """Every module name a kit's pack holds, in the file's order: each whose name starts with `<kit>.`."""
    if kit not in KITS:
        raise KeyError(f'{kit!r} is no kit in kits.json: {", ".join(KITS)}')
    return [name for name in MODULES if name.startswith(f'{kit}.')]


def piece_of(module):
    """The piece a module name holds without its kit (`temperate.tree.a` holds `tree.a`)."""
    return module.partition('.')[2]
