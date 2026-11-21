"""The material nodes a patrol's players gather (the game's `footGear.ts`): an outcrop of ore, a patch of herbs, a stack
of felled timber and a heap of salvage, each standing as a billboard where its node does, and each as it looks once
gathered, spent until its turn comes round. Each is laid from the forge's own models (the ore, the stone lump, the
logs, the leaves and berries, the crate, the sack, the boat's parts), each set whole where it stands in the heap, so
the patterns each lays over its own parts go with it. The eye is a body's on foot a few metres off: each row's
`elevation` (tools/sprite-forge/specs/pictures/nodes.json)."""
import math

import numpy as np
from mathutils import Euler, Matrix, Vector

from . import shapes
from .gather import _foliage, _leaf_ball
from .kit import Mat
from .models import MODELS, model

# The words of the forge's own rows the heaps are laid from (tools/sprite-forge/specs/items.json).
ORE = {'rock': 'darkRock', 'vein': 'mithril', 'glints': 6}
CRYSTALS = {'rock': 'rock', 'vein': 'moonstone', 'crystals': 3}
DULL = {'rock': 'darkRock', 'vein': 'mithril', 'glints': 0, 'fleck': 0.78}
STONE = {'rock': 'granite'}
SACK = {'cloth': 'burlap', 'grain': 'straw', 'open': False}
SCRAP = {'metal': 'dwarven'}


class _Placed:
    """An item a model is built into as if alone, each of its parts set whole at `offset`, turned `turn` (degrees about
    x, then y, then z) and `scale` times its size, so the patterns laid over each part's own coordinates go with it;
    its sparkles go where its parts do."""

    def __init__(self, item, offset=(0.0, 0.0, 0.0), turn=(0.0, 0.0, 0.0), scale=1.0):
        self.item = item
        self.matrix = Matrix.LocRotScale(Vector(offset), Euler([math.radians(t) for t in turn]),
                                         Vector((scale, scale, scale)))

    def add(self, mesh, mat, **kwargs):
        ob = self.item.add(mesh, mat, **kwargs)
        ob.matrix_world = self.matrix @ ob.matrix_world
        return ob

    def sparkle(self, point, **kwargs):
        self.item.sparkle(np.array(self.matrix @ Vector(tuple(point))), **kwargs)


def _lay(item, name, words, seed, offset=(0.0, 0.0, 0.0), turn=0.0, scale=1.0, tip=(0.0, 0.0)):
    """The forge's model `name` laid whole at `offset`, turned `turn` degrees about the up axis (and tipped `tip`
    degrees about x and y), `scale` times its size."""
    MODELS[name](_Placed(item, offset, (tip[0], tip[1], turn), scale), dict(words), seed)


def _bush(item, seed, balls, dim=1.0):
    """A mound of leaf balls, each `(x, y, z, radius)`, in the forge's three greens, darker the further back."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    looks = [('leaf', 1.0), ('leaf', 0.82), ('green', 1.0)]
    for k, (x, y, z, radius) in enumerate(balls):
        ramp, shade = looks[k % 3]
        shade *= dim * (1.0 - 0.25 * max(0.0, y) / 0.3)
        mass = Mat(ramp, rough=0.7, dim=shade, bump=(0.7, 30.0), pattern=(ramp, _foliage(9.0, seed + k), 0.72))
        edge = [Mat(ramp, rough=0.6, dim=shade), Mat(ramp, rough=0.6, dim=shade * 0.85)]
        _leaf_ball(item, rng, (x, y, z), radius, mass, edge, seed + k)


@model
def nodeOre(item, words, seed):
    """An outcrop of ore: a granite boulder at its back, three lumps of dark rock seamed with metal before it, nuggets
    cropping out and catching the light, a lump of moonstone crystals at its foot and loose ore round it."""
    _lay(item, 'stoneLump', STONE, seed, (0.02, 0.16, 0.0), turn=12, scale=5.4)
    _lay(item, 'ore', ORE, seed + 1, (-0.24, -0.08, 0.0), turn=24, scale=5.6)
    _lay(item, 'ore', ORE, seed + 2, (0.27, -0.06, 0.0), turn=-36, scale=4.8)
    _lay(item, 'ore', CRYSTALS, seed + 3, (0.02, -0.26, 0.0), turn=8, scale=3.4)
    for k, (x, y, turn) in enumerate(((-0.42, -0.3, 40), (0.43, -0.28, -20), (-0.16, -0.4, 70))):
        _lay(item, 'ore', ORE, seed + 10 + k, (x, y, 0.0), turn=turn, scale=1.4)


@model
def nodeOreSpent(item, words, seed):
    """The outcrop gathered: the boulder bare, the lumps broken down to dull stubs with no metal left to catch the
    light, and spoil round them."""
    _lay(item, 'stoneLump', STONE, seed, (0.0, 0.12, 0.0), turn=12, scale=6.5)
    _lay(item, 'ore', DULL, seed + 1, (-0.24, -0.1, 0.0), turn=24, scale=2.6, tip=(0.0, 14.0))
    _lay(item, 'ore', DULL, seed + 2, (0.25, -0.08, 0.0), turn=-36, scale=2.2)
    for k, (x, y, turn) in enumerate(((-0.4, -0.3, 40), (0.41, -0.3, -20), (0.02, -0.34, 70), (-0.1, -0.22, 10))):
        _lay(item, 'stoneLump', STONE, seed + 10 + k, (x, y, 0.0), turn=turn, scale=1.4)


@model
def nodeHerbs(item, words, seed):
    """A patch of herbs: a low mound of leaves, sprigs of red berries standing out of it and hanging over its front,
    and a cluster of mushrooms at its foot."""
    _bush(item, seed, [(-0.28, 0.08, 0.16, 0.18), (0.0, 0.12, 0.22, 0.22), (0.3, 0.06, 0.15, 0.17),
                       (-0.12, -0.06, 0.12, 0.15), (0.16, -0.08, 0.12, 0.14), (0.02, 0.2, 0.34, 0.16)])
    _lay(item, 'gatherBerries', {}, seed + 20, (-0.14, -0.2, 0.12), turn=8, scale=1.5)
    _lay(item, 'gatherBerries', {}, seed + 21, (0.2, -0.18, 0.18), turn=-170, scale=1.3)
    _lay(item, 'gatherBerries', {}, seed + 22, (0.02, -0.04, 0.34), turn=4, scale=1.2)
    _lay(item, 'mushrooms', {}, seed + 23, (-0.36, -0.26, 0.0), turn=20, scale=2.0)


@model
def nodeHerbsSpent(item, words, seed):
    """The patch gathered: cut stems standing out of a thinned mound, and torn leaves and petals lying round it."""
    _bush(item, seed, [(-0.24, 0.1, 0.09, 0.11), (0.22, 0.08, 0.08, 0.1), (0.0, 0.14, 0.1, 0.12)], dim=0.85)
    stem = Mat('green', rough=0.6, dim=0.8)
    rng = np.random.RandomState(seed & 0x7fffffff)
    for k in range(9):
        x, y = -0.3 + 0.6 * k / 8 + rng.uniform(-0.03, 0.03), rng.uniform(-0.12, 0.06)
        item.add(shapes.tube([(x, y, 0.0), (x + rng.uniform(-0.02, 0.02), y, rng.uniform(0.08, 0.14))], 0.008,
                             sides=5), stem)
    for k, (x, y, turn) in enumerate(((-0.3, -0.24, 10), (0.08, -0.28, 120), (0.32, -0.2, -40))):
        _lay(item, 'gatherHerbBits', {}, seed + 30 + k, (x, y, 0.0), turn=turn, scale=2.6)


@model
def nodeTimber(item, words, seed):
    """Felled timber: three trunks stacked two and one, their sawn ends to the eye showing their rings, a bundle of
    split wood leant at their foot and chips thrown round."""
    _lay(item, 'gatherLog', {}, seed, (0.0, 0.12, 0.0), turn=6)
    _lay(item, 'gatherLog', {}, seed + 1, (0.04, -0.2, 0.0), turn=2)
    _lay(item, 'gatherLog', {}, seed + 2, (0.02, -0.04, 0.27), turn=4)
    _lay(item, 'woodBundle', {}, seed + 3, (-0.52, -0.42, 0.0), turn=-20, scale=1.8)
    for k, (x, y, turn) in enumerate(((0.36, -0.5, 30), (-0.1, -0.56, -60), (0.6, -0.36, 80))):
        _lay(item, 'gatherChip', {}, seed + 10 + k, (x, y, 0.0), turn=turn, scale=2.2)


@model
def nodeTimberSpent(item, words, seed):
    """The timber gathered: one trunk left lying and the chips of what was cut."""
    _lay(item, 'gatherLog', {}, seed, (0.0, 0.0, 0.0), turn=4)
    for k, (x, y, turn) in enumerate(((0.36, -0.42, 30), (-0.22, -0.46, -60), (0.6, -0.3, 80), (-0.5, -0.36, 10))):
        _lay(item, 'gatherChip', {}, seed + 10 + k, (x, y, 0.0), turn=turn, scale=2.2)


@model
def nodeSalvage(item, words, seed):
    """Salvage washed up and piled: two crates of stores, a boat's broken parts behind them, a sack beside them, and a
    machine's scrap at their foot."""
    _lay(item, 'boatParts', {}, seed, (0.12, 0.26, 0.0), turn=10, scale=0.95)
    _lay(item, 'crate', {}, seed + 1, (-0.26, -0.06, 0.0), turn=-14, scale=1.55)
    _lay(item, 'crate', {}, seed + 4, (-0.5, 0.24, 0.0), turn=38, scale=1.25)
    _lay(item, 'sack', SACK, seed + 2, (0.36, -0.12, 0.0), turn=20, scale=1.4)
    _lay(item, 'scrap', SCRAP, seed + 3, (0.08, -0.36, 0.0), turn=-8, scale=2.4)


@model
def nodeSalvageSpent(item, words, seed):
    """The salvage gathered: the boat's parts picked over, and a little scrap left."""
    _lay(item, 'boatParts', {}, seed, (0.0, 0.1, 0.0), turn=10, scale=1.0)
    _lay(item, 'scrap', SCRAP, seed + 3, (0.1, -0.26, 0.0), turn=30, scale=1.6)
