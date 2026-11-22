"""The Lattice workflow's render jobs (.github/workflows/lattice.yml): one for each move of each foe asked for, every
view of it (the forge sets a move's cell from all five views at once, so a move is the finest a job can take), and one
for the death wave. Read from each foe's moves table without loading Blender:

    python3 -I tools/lattice/jobs.py husk,flicker,idol,ravager,bulwark,heart

prints the matrix as GitHub Actions' `include` list, on one line."""
import ast
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FOES = ('husk', 'flicker', 'idol', 'ravager', 'bulwark', 'heart')


def moves_of(foe):
    """The moves `<foe>_moves.py`'s MOVES table names, in its order."""
    with open(os.path.join(HERE, f'{foe}_moves.py')) as file:
        tree = ast.parse(file.read())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, 'id', '') == 'MOVES' for t in node.targets):
            return [key.value for key in node.value.keys]
    raise SystemExit(f'{foe}_moves.py has no MOVES table')


def jobs(foes):
    unknown = sorted(set(foes) - set(FOES))
    if unknown:
        raise SystemExit(f'no such foe: {", ".join(unknown)}')
    return [{'foe': foe, 'move': move} for foe in foes for move in moves_of(foe)] + [{'foe': 'wave', 'move': 'wave'}]


if __name__ == '__main__':
    named = (sys.argv[1] if len(sys.argv) > 1 else ','.join(FOES)).split(',')
    asked = list(dict.fromkeys(foe for foe in named if foe))   # each once, in the order named
    print(json.dumps(jobs(asked), separators=(',', ':')))
