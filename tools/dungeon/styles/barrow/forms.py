"""The barrow's own forms as kit objects: the grey-green stone in slabs, uprights (orthostats) and lintels, dry-stone
walling laid between them in thin courses, cup marks and rings pecked into the stones, corbel courses stepping in,
and white quartz pebbles. Stone wears `stone` (its worn faces `stoneAlt`), the marks `relief`, the quartz `wax` (the
game's plain cream). The standing stone and the cup marks are the passages' own (styles/passage/forms.py), so the
barrow's stone is the lamp's. Numbers are the dungeon's frame: x east, y south, z up, metres.
"""
import random

from styles.passage import forms as passage

CARVE = 'relief'


def slab(kit, x0, y0, z0, x1, y1, z1, seed, part='stone', wear=0.02, bevel=0.035):
    """A slab of the grey-green stone, its edges worn and its faces uneven."""
    return kit.bevelled_box(x0, y0, z0, x1, y1, z1, bevel=bevel, wear=wear, seed=seed, part=part)


def upright(kit, width, thick, height, seed, at=(0.0, 0.0, 0.0), turn=0.0, sink=0.0, lean=(0.0, 0.0), part='stone',
            sections=6, points=10):
    """An orthostat: an uneven slab standing from `sink` under its foot to `height`, `width` across x and `thick`
    along y, turned `turn` degrees and set at `at`."""
    faces = passage.standing_stone(width, thick, height, seed, sink=sink, lean=lean, sections=sections, points=points)
    item = kit.mesh(passage.move(faces, at=at, turn=turn), part, 'upright', 40.0, False)
    return item


def marks(kit, spots, normal, seed):
    """Cup marks pecked at spots [(x, y, z, rings), ...] on a face looking along `normal`: one object, or None."""
    faces = []
    for number, (x, y, z, rings) in enumerate(spots):
        faces += passage.cups((x, y, z), normal, rings=rings, seed=f'{seed} {number}')['carve']
    return kit.mesh(faces, CARVE, 'marks', 40.0, False) if faces else None


def drystone(kit, x0, x1, z0, z1, y0, y1, seed):
    """Dry-stone walling: thin courses of flat stones laid without mortar, from x0 to x1 and z0 to z1, its face at y1."""
    return kit.stones(x0, x1, z0, z1, y0, y1, block=(0.34, 0.66), course=(0.11, 0.18), joint=0.014, bevel=0.0,
                      proud=0.03, wear=0.006, alt=0.35, seed=seed)


def quartz(kit, area, count, seed, z=0.0, size=(0.04, 0.08)):
    """White quartz pebbles laid on the ground in `area` (x0, y0, x1, y1), as at the barrows' doors."""
    draw = random.Random(f'quartz {seed}')
    made = []
    for number in range(count):
        x, y, wide = draw.uniform(area[0], area[2]), draw.uniform(area[1], area[3]), draw.uniform(*size)
        made.append(kit.rock(x, y, z - 0.004, (wide, wide * draw.uniform(0.6, 0.9), wide * 0.55),
                             seed=f'{seed} {number}', detail=0, roughness=0.25, part='wax'))
    return made
