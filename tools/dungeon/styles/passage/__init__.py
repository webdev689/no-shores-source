"""The passages' own pieces, built as a pack of their own beside the styles' (catalog.PASSAGE): the lamp that burns
on nothing in its ring of five stones, the onward mouths open and shut, the way in from inside, the Kindle mission's
dead lamp, the Grey Tithe's tally post whole and broken, and the reliquary shut and open. pieces.py makes them as
faces by role, which the islands' kit (tools/islands/kits/passage.py) builds as well; here each role wears a
dungeon part, and a passage zone's pictures dress them as any piece in it.
"""
# The dungeon's part for each role: chalk wears the floor's picture (the chalk's own, in a chalk zone), roots the
# timber, the slate and the cup marks the darker stone and the carving.
ROLES = {'stone': 'stone', 'stoneAlt': 'stoneAlt', 'iron': 'iron', 'glow': 'glow', 'carve': 'relief',
         'chalk': 'floor', 'root': 'wood', 'wood': 'wood', 'rope': 'rope', 'slate': 'stoneAlt', 'earth': 'floor'}


def made(kit, name, parts, roles=None):
    """One object of {role: faces}, each role in its part."""
    roles = roles or ROLES
    objects = [kit.mesh(faces, roles[role], f'{name}.{role}', 40.0, False) for role, faces in parts.items() if faces]
    return kit.join(objects, name)


def shaped():
    """Every passage piece's faces by role, by its module name in the contract."""
    from . import pieces
    return {
        'passage.lamp': pieces.lamp(),
        'passage.mouth.open': pieces.mouth(False, 'passage.mouth.open'),
        'passage.mouth.shut': pieces.mouth(True, 'passage.mouth.shut'),
        'passage.way-in': pieces.way_in(),
        'passage.kindle': pieces.kindle(),
        'passage.tally-post': pieces.tally_post(False),
        'passage.tally-post.broken': pieces.tally_post(True),
        'passage.reliquary': pieces.reliquary(False),
        'passage.reliquary.open': pieces.reliquary(True),
    }


def build(kit):
    """Every passage module: {module name: object}."""
    return {name: made(kit, name, parts) for name, parts in shaped().items()}
