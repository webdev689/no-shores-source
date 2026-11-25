"""The passages' kit: the pieces a passage zone above ground stands, as an island is drawn, the same pieces the
dungeon's passage pack holds (tools/dungeon/styles/passage/pieces.py makes both from one source). Each role wears an
island part: the lamp's glass the ember the game lights, the chalk grown over the way in the snow's white, roots bark.
"""
import os
import sys

# The pieces' own source sits with the dungeon's styles; it needs only shapes.py and details.py, which this build
# has its own of on the path.
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'dungeon',
                             'styles'))
import passage  # noqa: E402

ROLES = {'stone': 'stone', 'stoneAlt': 'stoneAlt', 'iron': 'iron', 'glow': 'ember', 'carve': 'stoneAlt',
         'chalk': 'snow', 'root': 'bark', 'wood': 'wood', 'rope': 'rope', 'slate': 'rock', 'earth': 'earth'}


def build(kit):
    """Every module of the passages' kit: {module name: object}."""
    return {name: passage.made(kit, name, parts, ROLES) for name, parts in passage.shaped().items()}
