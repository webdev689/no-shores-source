"""The chalk's portal and exit, round the code's faces (|x| ≤ 1.3, y ≤ 0.3, z ≤ 3.1, the face's 1.4 × 2.4 at y 0.04
left clear): a surround of knapped flint and squared chalk laid in a chequer, a shell carved over it, and the mouth of
an adit timbered with a door-set and lagging, its spoil heaped either side.
"""
import random

from styles.chalk import forms
from styles.chalk.forms import chalk, dog, flints, post, wedge
from styles.crypt.hidden import cull

SQUARE = 0.19


def _chequer(kit, x0, x1, z0, z1, seed):
    """Squares of chalk and of knapped flint in turn, the flint set back a little and its face uneven."""
    draw = random.Random(f'chequer {seed}')
    made = []
    columns, rows = max(1, round((x1 - x0) / SQUARE)), max(1, round((z1 - z0) / SQUARE))
    wide, high = (x1 - x0) / columns, (z1 - z0) / rows
    for column in range(columns):
        for row in range(rows):
            left, low = x0 + column * wide, z0 + row * high
            flint = (column + row) % 2 == 1
            face = 0.28 - (draw.uniform(0.012, 0.024) if flint else 0.0)
            made.append(kit.box(left + 0.006, 0.0, low + 0.006, left + wide - 0.006, face, low + high - 0.006,
                                part='stoneAlt' if flint else 'stone'))
    return made


def portal(kit):
    """The return portal's surround: jambs and a head of flint and chalk in a chequer, dressed chalk quoins at its
    edges, and a great scallop carved in the chalk of its keystone."""
    made = []
    for side in (-1, 1):
        near, far = sorted((side * 0.73, side * 1.13))
        made += _chequer(kit, near, far, 0.0, 2.47, f'portal {side}')
        quoin_near, quoin_far = sorted((side * 1.13, side * 1.29))
        for row in range(7):
            low = row * 0.36
            made.append(chalk(kit, quoin_near, 0.02, low + 0.005, quoin_far, 0.29, low + 0.355,
                              f'chalk.portal quoin {side} {row}', bevel=0.015))
    made += _chequer(kit, -1.13, 1.13, 2.47, 3.0, 'portal head')
    made.append(chalk(kit, -1.29, 0.0, 3.0, 1.29, 0.29, 3.1, 'chalk.portal string', bevel=0.012))
    made.append(chalk(kit, -0.26, 0.0, 2.44, 0.26, 0.25, 3.0, 'chalk.portal key', bevel=0.012))
    made.append(forms.shell(kit, (0.0, 0.25, 2.5), 0.42, turn=180.0))
    return cull(kit.join(made, 'portal'), wall=0.0)


def exit_frame(kit):
    """An adit's mouth: two oak posts under a head-tree, wedged and dogged, boards laid over it against the roof's
    fall, a lamp hook on the head-tree and spoil of chalk and flint heaped against the posts' feet."""
    made = [post(kit, side * 0.86, 0.15, 0.0, 2.44, f'chalk.exit post {side}', half=0.12) for side in (-1, 1)]
    made.append(kit.bevelled_box(-1.28, 0.02, 2.44, 1.28, 0.29, 2.7, bevel=0.02, wear=0.006, seed='chalk.exit head',
                                 part='wood'))
    for side in (-1, 1):
        made.append(dog(kit, side * 0.86 - 0.1, side * 0.86 + 0.1, 0.0, 2.48))
        made.append(wedge(kit, side * 1.28, 0.15, 2.7, size=0.13, flip=-side))
        near, far = sorted((side * 1.02, side * 1.22))
        made += forms.spoil(kit, (near, 0.08, far, 0.22), 5, f'chalk.exit spoil {side}', high=(0.08, 0.22),
                            size=(0.1, 0.16), part='stone')
    for number in range(11):
        x = -1.26 + number * 0.23
        made.append(kit.box(x, 0.02, 2.7, x + 0.21, 0.28, 2.76, part='wood'))
    made.append(chalk(kit, -1.28, 0.0, 2.76, 1.28, 0.29, 3.08, 'chalk.exit over', wear=0.015))
    made += flints(kit, -1.2, 1.2, 2.92, 0.24, 'chalk.exit band', count=8, out=1, sink=0.75)
    made.append(kit.prism((0.95, 0.27, 2.6), (0.95, 0.27, 2.44), 0.01, 4, 45.0, part='iron'))
    return cull(kit.join(made, 'exit'), floor=0.0, wall=0.0)
