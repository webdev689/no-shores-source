"""The chalk's kit pieces. Its doorways are timber door-sets wedged into the cut chalk, or the chalk cut away to a
low arch; its pillars are chalk the cutters left standing under an oak head-board; its wall sets are props, a post on
a sole-block under a head-plank; its ceilings are head-trees, a band of chalk left uncut, and lagging over a crack;
its floors are spoil and trodden dust; its sconce a lamp hook in a boss of chalk. A doorway's room is toward -y; its
code-built jambs fill x ±0.9..±1.6, y 0..0.3, under a lintel at 2.8.
"""
import random

import details
from styles.chalk import forms
from styles.chalk.forms import chalk, dog, flints, pick_marks, post, wedge
from styles.crypt.hidden import cull

# The doorway's way through and its jambs' faces either side, metres.
HALF = 0.82
ROOM, CORRIDOR = -0.06, 0.36


def door_a(kit):
    """A door-set of squared oak wedged into the cut: two posts under a head-tree, iron dogs at its corners, cut
    chalk packed over it with a band of flints through it, the pick marks plain on its faces."""
    draw = random.Random('chalk.door.a')
    made = [post(kit, side * (HALF + 0.11), 0.15, 0.0, 2.33, f'chalk.door.a post {side}', half=0.11)
            for side in (-1, 1)]
    made.append(kit.bevelled_box(-1.32, ROOM + 0.02, 2.33, 1.32, CORRIDOR - 0.02, 2.6, bevel=0.02, wear=0.006,
                                 seed='chalk.door.a head', part='wood'))
    for side in (-1, 1):
        made.append(dog(kit, side * 0.86 - 0.09, side * 0.86 + 0.09, ROOM + 0.0, 2.36))
        made.append(wedge(kit, side * 1.32, 0.15, 2.6, size=0.14, flip=-side))
        for level, (low, high) in enumerate(((0.0, 0.9), (0.9, 1.7), (1.7, 2.33))):
            near, far = sorted((side * 1.0, side * 1.56))
            made.append(chalk(kit, near, ROOM, low + 0.006, far, CORRIDOR, high - 0.006,
                              f'chalk.door.a jamb {side} {level}'))
        made += pick_marks(kit, min(side * 1.0, side * 1.56), max(side * 1.0, side * 1.56), 0.1, 2.2, ROOM,
                           f'chalk.door.a picks {side}', count=7, out=-1)
    for number, (low, high) in enumerate(((2.6, 2.95), (2.95, 3.36))):
        x = -1.56
        while x < 1.5:
            wide = min(draw.uniform(0.5, 0.9), 1.56 - x)
            made.append(chalk(kit, x + 0.006, ROOM, low + 0.006, x + wide - 0.006, CORRIDOR, high - 0.006,
                              f'chalk.door.a over {number} {x:.2f}'))
            x += wide
    made += flints(kit, -1.5, 1.5, 2.95, ROOM, 'chalk.door.a band', count=9, out=-1, sink=0.7)
    made += flints(kit, -1.5, 1.5, 2.95, CORRIDOR, 'chalk.door.a band back', count=7, out=1, sink=0.7)
    return cull(kit.join(made, 'door.a'), floor=0.0)


def door_b(kit):
    """The chalk cut away to a low arch with no lining: its rough reveals and soffit pick-marked, a band of flints
    running through both faces at waist height, an iron lamp hook driven in beside it."""
    made = []
    for side in (-1, 1):
        for level, (low, high) in enumerate(((0.0, 0.75), (0.75, 1.55), (1.55, 2.3))):
            near, far = sorted((side * HALF, side * 1.58))
            made.append(chalk(kit, near, ROOM, low + 0.004, far, CORRIDOR, high - 0.004,
                              f'chalk.door.b jamb {side} {level}', wear=0.02, bevel=0.03))
        made += flints(kit, side * 0.86, side * 1.55, 1.18, ROOM, f'chalk.door.b band {side}', count=4, out=-1,
                       sink=0.7)
        made += flints(kit, side * 0.86, side * 1.55, 1.18, CORRIDOR, f'chalk.door.b band back {side}', count=4,
                       out=1, sink=0.7)
        made += pick_marks(kit, min(side * HALF, side * 1.58), max(side * HALF, side * 1.58), 0.1, 2.25, ROOM,
                           f'chalk.door.b picks {side}', count=8, out=-1)
    made.append(kit.arch(HALF, 2.3, 0.62, ROOM, CORRIDOR, shape='segmental', rise=0.32, segments=12, part='stone'))
    # The chalk over the haunches runs in to the arch's ring, so no gap shows between them.
    for side in (-1, 1):
        near, far = sorted((side * (HALF + 0.12), side * 1.58))
        made.append(kit.bevelled_box(near, ROOM + 0.004, 2.3, far, CORRIDOR - 0.004, 3.1, bevel=0.03, part='stone'))
    made.append(kit.bevelled_box(-HALF - 0.14, ROOM + 0.004, 2.94, HALF + 0.14, CORRIDOR - 0.004, 3.1, bevel=0.03,
                                 part='stone'))
    made += flints(kit, -1.5, 1.5, 2.92, ROOM, 'chalk.door.b high band', count=8, out=-1, sink=0.7)
    hook = [kit.prism((-1.22, ROOM + 0.02, 2.0), (-1.22, ROOM - 0.045, 2.0), 0.012, 4, 45.0, part='iron'),
            kit.prism((-1.22, ROOM - 0.045, 2.0), (-1.22, ROOM - 0.045, 2.08), 0.012, 4, 45.0, part='iron')]
    made += hook
    return cull(kit.join(made, 'door.b'), floor=0.0)


def pillar_base(kit):
    """The foot of a pillar of chalk left standing: wider where the cutters stopped, spoil heaped against it, a flint
    band showing through it."""
    made = [chalk(kit, -0.48, -0.48, 0.0, 0.48, 0.48, 0.2, 'chalk.pillar.base foot', wear=0.02, bevel=0.04),
            chalk(kit, -0.33, -0.33, 0.18, 0.33, 0.33, 0.6, 'chalk.pillar.base body', wear=0.01)]
    for turn in range(4):
        side = flints(kit, -0.28, 0.28, 0.4, -0.33, f'chalk.pillar.base band {turn}', count=3, size=(0.05, 0.08),
                      out=-1, sink=0.85)
        made += [kit.rotate_z(item, 90 * turn) for item in side]
    made += forms.spoil(kit, (-0.4, -0.4, 0.4, 0.4), 8, 'chalk.pillar.base', high=(0.04, 0.12),
                        size=(0.08, 0.16), part='stone', z=0.0)
    return cull(kit.join(made, 'pillar.base'), floor=0.0)


def pillar_shaft(kit):
    """The pillar's shaft: chalk cut square with its arrises taken off unevenly, a flint seam round it and the upright
    grooves the cutters' picks left down its faces."""
    made = [kit.prism((0.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.33, sides=8, turn=22.5, part='stone')]
    kit.scale(made[0], 0.98, 1.03, 1.0)
    made.append(kit.prism((0.0, 0.0, 0.46), (0.0, 0.0, 0.54), 0.345, sides=8, turn=22.5, part='stoneAlt'))
    for turn in range(4):
        for x in (-0.08, 0.01, 0.075):
            groove = kit.box(x - 0.01, -0.316, 0.0, x + 0.01, -0.3, 1.0, part='relief')
            made.append(kit.rotate_z(groove, 90 * turn))
    return cull(kit.join(made, 'pillar.shaft'), floor=0.0, ceiling=1.0)


def pillar_capital(kit):
    """Where the pillar meets the roof: the chalk swelling out under an oak head-board, wedged tight."""
    made = [kit.frustum((0.0, 0.0, 0.0), (0.0, 0.0, 0.48), 0.43, 0.6, sides=4, part='stone')]
    kit.rotate_z(made[0], 45)
    made.append(kit.bevelled_box(-0.68, -0.24, 0.48, 0.68, 0.24, 0.66, bevel=0.015, wear=0.005, seed='chalk.cap',
                                 part='wood'))
    made.append(kit.box(-0.5, -0.5, 0.66, 0.5, 0.5, 0.7, part='stone'))
    for side in (-1, 1):
        made.append(wedge(kit, side * 0.68, 0.0, 0.66, size=0.1, flip=-side))
    made += flints(kit, -0.36, 0.36, 0.2, -0.32, 'chalk.cap band', count=4, size=(0.05, 0.09), out=-1, sink=0.8)
    return cull(kit.join(made, 'pillar.capital'), floor=0.0, ceiling=0.7)


def wall_base(kit):
    """A prop's foot against the wall: a sole-block of chalk, the post standing in it, spoil kicked against it."""
    made = [chalk(kit, -0.3, 0.0, 0.0, 0.3, 0.28, 0.16, 'chalk.wall.base sole', wear=0.015),
            post(kit, 0.0, 0.13, 0.16, 0.6, 'chalk.wall.base post', half=0.105)]
    made += forms.spoil(kit, (-0.5, 0.06, 0.5, 0.24), 5, 'chalk.wall.base', high=(0.03, 0.08), size=(0.06, 0.12),
                        part='stone', z=0.0)
    return cull(kit.join(made, 'wall.base'), floor=0.0, wall=0.0)


def wall_shaft(kit):
    """The prop's post, squared oak, a unit high for the page to stretch."""
    return cull(post(kit, 0.0, 0.13, 0.0, 1.0, 'chalk.wall.shaft', half=0.105), floor=0.0, wall=0.0, ceiling=1.0)


def wall_cap(kit):
    """The prop's head: the post under a head-plank laid along the wall, wedged up to the roof, an iron lamp hook
    driven into the plank's face."""
    made = [post(kit, 0.0, 0.13, 0.0, 0.66, 'chalk.wall.cap post', half=0.105),
            kit.bevelled_box(-0.76, 0.0, 0.66, 0.76, 0.27, 0.86, bevel=0.015, wear=0.005, seed='chalk.wall.cap plank',
                             part='wood')]
    for x in (-0.55, 0.5):
        made.append(wedge(kit, x, 0.13, 0.86, size=0.12, flip=1 if x < 0 else -1))
    made.append(kit.box(-0.76, 0.0, 0.89, 0.76, 0.27, 0.9, part='stone'))
    made.append(kit.prism((0.42, 0.27, 0.72), (0.42, 0.38, 0.72), 0.01, 4, 45.0, part='iron'))
    made.append(kit.prism((0.42, 0.38, 0.72), (0.42, 0.38, 0.79), 0.01, 4, 45.0, part='iron'))
    made.append(dog(kit, -0.12, 0.12, 0.27, 0.62))
    return cull(kit.join(made, 'wall.cap'), floor=0.0, wall=0.0, ceiling=0.9)


def feature_a(kit):
    """A face of the chalk with the old sea in it: two bands of flint across it and shells and urchins set in it
    where the cut opened them, the pick marks round them."""
    draw = random.Random('chalk.feature.a')
    made = []
    for row, (low, high) in enumerate(((0.0, 0.9), (0.9, 1.9), (1.9, 2.7))):
        made.append(chalk(kit, -0.76, 0.0, low + 0.005, 0.76, 0.1 + 0.02 * (row % 2), high - 0.005,
                          f'chalk.feature.a course {row}', wear=0.015))
    for z in (0.9, 1.9):
        made += flints(kit, -0.72, 0.72, z, 0.11, f'chalk.feature.a band {z}', count=8, out=1)
    for number, (x, z, size) in enumerate(((-0.42, 0.45, 0.13), (-0.15, 1.3, 0.16), (0.45, 1.5, 0.11),
                                           (0.2, 2.35, 0.14))):
        made.append(forms.shell(kit, (x, 0.104, z), size, turn=180.0, tilt=draw.uniform(-30, 30)))
    for x, z in ((0.3, 0.55), (-0.45, 1.6), (-0.4, 2.3)):
        made.append(forms.urchin(kit, (x, 0.1, z), 0.085, facing=(0.0, 1.0, 0.0)))
    made += pick_marks(kit, -0.76, 0.76, 0.05, 2.65, 0.1, 'chalk.feature.a', count=12)
    return cull(kit.join(made, 'feature.a'), floor=0.0, wall=0.0)


def feature_b(kit):
    """A cutter's niche cut into the face: chalk cheeks and a lintel round an oak shelf, an antler pick laid on it,
    flints heaped below where they were picked out, a basket for them."""
    made = []
    for side in (-1, 1):
        near, far = sorted((side * 0.44, side * 0.76))
        made.append(chalk(kit, near, 0.0, 0.0, far, 0.26, 1.96, f'chalk.feature.b cheek {side}', wear=0.015))
    made.append(chalk(kit, -0.76, 0.0, 1.96, 0.76, 0.26, 2.36, 'chalk.feature.b lintel', wear=0.015))
    made.append(kit.box(-0.44, 0.0, 0.0, 0.44, 0.04, 1.96, part='stoneAlt'))
    made.append(kit.bevelled_box(-0.44, 0.02, 1.08, 0.44, 0.27, 1.13, bevel=0.008, part='wood'))
    tine = [(-0.3, 0.12, 1.14), (-0.1, 0.16, 1.15), (0.1, 0.14, 1.15), (0.28, 0.12, 1.15)]
    made.append(kit.rope(tine, radius=0.022, sides=6, strands=1, part='bone'))
    for start in ((-0.05, 0.15, 1.15), (0.15, 0.14, 1.15)):
        made.append(kit.cone(start, (start[0] + 0.05, start[1] + 0.1, start[2] + 0.02), 0.014, 0.003, sides=5,
                             part='bone'))
    made += flints(kit, -0.36, 0.36, 0.07, 0.15, 'chalk.feature.b heap', count=7, size=(0.08, 0.14), sink=0.0)
    made += flints(kit, -0.22, 0.2, 0.18, 0.13, 'chalk.feature.b heap top', count=3, size=(0.07, 0.11), sink=0.0)
    made.append(kit.lathe([(0.0, 1.6), (0.1, 1.6), (0.14, 1.72), (0.15, 1.8), (0.13, 1.8), (0.12, 1.73), (0.0, 1.66)],
                          0.18, 0.15, 0.0, sides=10, part='rope'))
    made += pick_marks(kit, -0.76, 0.76, 2.0, 2.32, 0.26, 'chalk.feature.b', count=4)
    return cull(kit.join(made, 'feature.b'), floor=0.0, wall=0.0)


def ceiling_a(kit):
    """A head-tree across the way: squared oak under the roof, iron dogs at its ends and wedges driven over it."""
    made = [kit.bevelled_box(-1.6, -0.15, -0.3, 1.6, 0.15, 0.0, bevel=0.02, wear=0.006, seed='chalk.ceiling.a',
                             part='wood')]
    for x in (-1.3, 1.3):
        made.append(dog(kit, x - 0.1, x + 0.1, -0.15, -0.15))
    return cull(kit.join(made, 'ceiling.a'), ceiling=0.0)


def ceiling_b(kit):
    """A band of the chalk left uncut across the roof, its underside rough, its flints hanging out of it."""
    draw = random.Random('chalk.ceiling.b')
    made, x = [], -1.6
    while x < 1.58:
        wide = min(draw.uniform(0.4, 0.7), 1.6 - x)
        made.append(chalk(kit, x + 0.004, -0.32, -draw.uniform(0.3, 0.42), x + wide - 0.004, 0.32, 0.0,
                          f'chalk.ceiling.b {x:.2f}', wear=0.03, bevel=0.04))
        x += wide
    for y, out in ((-0.32, -1), (0.32, 1)):
        made += flints(kit, -1.45, 1.45, -0.2, y, f'chalk.ceiling.b band {y}', count=7, size=(0.06, 0.11), out=out)
    return cull(kit.join(made, 'ceiling.b'), ceiling=0.0)


def ceiling_c(kit):
    """Lagging over a crack in the roof: two oak bearers and boards across them, a hook hung on a short chain."""
    draw = random.Random('chalk.ceiling.c')
    made = [kit.bevelled_box(-1.5, y - 0.09, -0.26, 1.5, y + 0.09, -0.06, bevel=0.015, part='wood')
            for y in (-0.55, 0.55)]
    x = -1.45
    while x < 1.4:
        wide = draw.uniform(0.18, 0.26)
        made.append(kit.box(x, -0.8, -0.06, x + wide - 0.015, 0.8, 0.0, part='wood'))
        x += wide
    made.append(kit.chain(details.sag_path((0.4, 0.55, -0.26), (0.4, 0.55, -0.62), 0.0, steps=3), link=0.09,
                          wire=0.01, part='iron'))
    made.append(kit.ring((0.4, 0.55, -0.68), 0.05, 0.01, axis=(1.0, 0.0, 0.0), sides=8, tube_sides=3, part='iron'))
    return cull(kit.join(made, 'ceiling.c'), ceiling=0.0)


def floor_a(kit):
    """Spoil underfoot: lumps of chalk and chips of flint where the cutters dropped them."""
    made = forms.spoil(kit, (-1.3, -1.3, 1.3, 1.3), 13, 'chalk.floor.a', part='stone', flint_share=0.3,
                       size=(0.12, 0.3))
    return cull(kit.join(made, 'floor.a'), floor=0.0)


def floor_b(kit):
    """Trodden chalk dust, a shell and an urchin lying in it, a broken antler tine."""
    made = [kit.polygon([(-0.9, -0.55, 0.006), (0.2, -1.05, 0.006), (1.1, -0.3, 0.006), (0.8, 0.9, 0.006),
                         (-0.4, 1.1, 0.006), (-1.1, 0.3, 0.006)], part='floor')]
    made.append(kit.lathe([(0.0, 0.0), (0.055, 0.0), (0.045, 0.024), (0.02, 0.036), (0.0, 0.038)], 0.35, 0.2, 0.0,
                          sides=7, part='bone'))
    made.append(forms.urchin(kit, (-0.4, -0.2, 0.0), 0.08, facing=(0.0, 0.0, 1.0), studs=()))
    made.append(kit.rope([(-0.1, 0.6, 0.015), (0.15, 0.68, 0.016), (0.32, 0.62, 0.016)], radius=0.014, sides=5,
                         strands=1, part='bone'))
    made += forms.spoil(kit, (-1.0, -1.0, 1.0, 1.0), 2, 'chalk.floor.b', high=(0.015, 0.03), size=(0.05, 0.1),
                        part='stone')
    return cull(kit.join(made, 'floor.b'), floor=0.0)


def sconce(kit):
    """A lamp hook in a boss of chalk: an iron bar driven into the chalk, bent out and up into a cup for the flame."""
    made = [kit.rock(0.0, 0.05, -0.42, (0.3, 0.2, 0.34), seed='chalk.sconce', detail=1, roughness=0.25,
                     part='stone')]
    made.append(kit.prism((0.0, 0.08, -0.25), (0.0, 0.33, -0.2), 0.012, 4, 45.0, part='iron'))
    made.append(kit.lathe([(0.0, -0.17), (0.03, -0.17), (0.045, -0.13), (0.048, -0.075), (0.0, -0.075)],
                          0.0, 0.35, 0.0, sides=6, part='iron'))
    return cull(kit.join(made, 'sconce'), wall=0.0)
