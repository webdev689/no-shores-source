"""The material nodes a patrol's players gather (the game's `footGear.ts`), one for each island's resource
(content/gear/resources.json), each drawn as the stuff it gives: salt grown clear as glass in a tide pool, iron seamed
through a cairn's stones, stones holding the sun's heat on sand, mussels with pearls in a bog's black water and frost
crystals on rock here; the resin, the grass, the flowers and the thistles in `nodeplants.py`. Each stands as a billboard
where its node does, and each as it looks once gathered: the same spot picked over, less of it left, spent until its
turn comes round. Each is laid from the forge's own models where one fits (the ore, the stone lump, the crystal), each
set whole where it stands, so the patterns each lays over its own parts go with it. The eye is a body's on foot a few
metres off: each row's `elevation` (tools/sprite-forge/specs/pictures/nodes.json)."""
import math

import numpy as np
from mathutils import Euler, Matrix, Vector

from . import shapes
from .gather import _foliage, _leaf_ball
from .kit import Mat
from .materials import _patches, _stripes
from .models import MODELS, model

# The words of the forge's own rows the heaps are laid from (tools/sprite-forge/specs/items.json).
STONE = {'rock': 'granite'}
WET = {'rock': 'darkRock'}
IRON = {'rock': 'granite', 'vein': 'rust', 'fleck': 0.7, 'glints': 2}
WORKED = {'rock': 'granite', 'vein': 'rust', 'fleck': 0.78, 'glints': 0}
RIME = {'ramp': 'diamond', 'count': 3}
SPIKE = {'ramp': 'diamond'}
# the seed of the ground a node's two pictures share (its pool, its rocks, its stump), so both show the one spot
SPOT = 1


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


def _pool(item, radii, mat, seed, z=0.0, depth=0.012):
    """A flat lens of water or mud `radii` (x, y) across, standing `depth` from `z`, its rim a little uneven."""
    lens = shapes.ellipsoid((radii[0], radii[1], depth), (0.0, 0.0, z), rings=4, sides=36, flat=0.5)
    item.add(shapes.wobble(lens, seed, 0.06), mat)


def _rim(item, seed, radii, rocks, words):
    """Stones round a pool's rim, each `(angle, scale)`: its place, degrees round from the right toward the back."""
    for k, (angle, scale) in enumerate(rocks):
        a = math.radians(angle)
        _lay(item, 'stoneLump', words, seed + k, (radii[0] * math.cos(a), radii[1] * math.sin(a), 0.0),
             turn=angle + 90, scale=scale)


def _lump(item, at, radii, seed, mat, amp=0.16):
    """A rough lump `radii` across resting with its middle at `at`."""
    item.add(shapes.wobble(shapes.ellipsoid(radii, at, rings=8, sides=14, flat=0.25), seed, amp), mat, smooth=False)


# --- brineglass ---

POOL = (0.46, 0.34)
# the tide pool's rocks: high behind it, low at its ends and none before it, so the water and the salt in it show
SHORE = [(4, 1.7), (38, 2.4), (72, 2.9), (108, 2.8), (144, 2.4), (178, 1.7), (205, 1.1), (335, 1.1)]
# the salt's cubes: size and where each grows, the largest at the pool's heart with smaller ones grown on it
SALT = [(0.2, 0.0, 0.1, 0.09), (0.14, -0.15, 0.04, 0.06), (0.13, 0.15, 0.03, 0.06), (0.12, 0.02, 0.13, 0.25),
        (0.1, -0.3, -0.02, 0.04), (0.07, -0.21, -0.12, 0.025), (0.11, 0.3, -0.04, 0.045), (0.07, 0.1, -0.16, 0.025)]


def _salt_mats():
    """Salt grown clear: pale glass a little lit from within, each pair of a cube's faces its own step of light."""
    return [Mat('glass', rough=0.1, spec=1.0, glow=0.18, steps=5, dim=d) for d in (1.15, 0.9, 0.7)]


def _cube(item, size, at, turn, mats):
    """A cube of salt `size` on a side, its middle at `at`, turned `turn` (degrees about x, y, z): its faces paired,
    top and foot, front and back, the two ends, each pair its own material."""
    verts, faces = shapes.box(size, size, size)
    for pair, mat in zip(((0, 1), (2, 3), (4, 5)), mats):
        item.add(shapes.moved((verts, [faces[i] for i in pair]), offset=at, turn=turn), mat, smooth=False)


def _tide_pool(item, seed):
    """A tide pool: still water, paler where it is shallow, ringed by dark wet rock."""
    shallows = ('glass', _patches(0.22, 8.0, seed), 0.72)
    _pool(item, POOL, Mat('water', rough=0.08, spec=1.0, pattern=shallows), seed)
    _rim(item, seed + 1, POOL, SHORE, WET)


@model
def nodeBrineglass(item, words, seed):
    """Brineglass: a tide pool ringed by wet rock, salt grown in it as clear pale cubes, a cluster of them standing
    out of the water at its heart and smaller ones at its edges, the light caught on their corners."""
    _tide_pool(item, SPOT)
    rng = np.random.RandomState(seed & 0x7fffffff)
    salt = _salt_mats()
    for k, (size, x, y, z) in enumerate(SALT):
        # tipped only a little, so each cube's top and two sides read square
        _cube(item, size, (x, y, z), (rng.uniform(-12, 12), rng.uniform(-14, 14), rng.uniform(20, 70)), salt)
        if k in (0, 3, 6):
            item.sparkle((x - size * 0.3, y - size * 0.5, z + size * 0.45), ramp='diamond', arm=1 if k == 0 else 0)


@model
def nodeBrineglassSpent(item, words, seed):
    """The pool gathered: the salt broken off to two stubs and a white crust where the cluster grew."""
    _tide_pool(item, SPOT)
    rng = np.random.RandomState(seed & 0x7fffffff)
    crust = shapes.ellipsoid((0.16, 0.1, 0.012), (0.0, 0.06, 0.004), rings=4, sides=20, flat=0.5)
    item.add(shapes.wobble(crust, seed, 0.2), Mat('silkWhite', rough=0.9, bump=(0.5, 80.0), dim=0.92))
    salt = _salt_mats()
    for size, x, y, z in ((0.08, -0.05, 0.06, 0.02), (0.06, 0.09, 0.03, 0.015), (0.05, -0.29, -0.02, 0.01)):
        _cube(item, size, (x, y, z), (rng.uniform(-12, 12), rng.uniform(-14, 14), rng.uniform(20, 70)), salt)


# --- cairn iron ---

@model
def nodeCairnIron(item, words, seed):
    """Cairn iron: rough stones stacked three courses high in a cairn, the lumps among them weathered out of the
    highland seamed rust-dark with iron, a nugget catching the light here and there."""
    _lay(item, 'stoneLump', STONE, SPOT, (0.0, 0.2, 0.0), turn=10, scale=4.0)
    _lay(item, 'ore', IRON, seed + 1, (-0.27, 0.0, 0.0), turn=20, scale=4.8)
    _lay(item, 'stoneLump', STONE, SPOT + 2, (0.27, 0.02, 0.0), turn=-30, scale=3.8)
    _lay(item, 'ore', IRON, seed + 3, (0.04, -0.2, 0.0), turn=-10, scale=2.6)
    _lay(item, 'ore', IRON, seed + 4, (-0.1, 0.06, 0.2), turn=-15, scale=4.0)
    _lay(item, 'stoneLump', STONE, seed + 5, (0.16, 0.08, 0.21), turn=30, scale=3.2)
    _lay(item, 'ore', IRON, seed + 6, (0.02, 0.08, 0.38), turn=12, scale=3.4)
    _lay(item, 'stoneLump', STONE, seed + 7, (0.0, 0.1, 0.53), turn=-20, scale=2.4)


@model
def nodeCairnIronSpent(item, words, seed):
    """The cairn gathered: pulled down to its lowest course, the iron broken out of it, only a dull seam left, and its
    upper stones thrown down round it."""
    _lay(item, 'stoneLump', STONE, SPOT, (0.0, 0.2, 0.0), turn=10, scale=4.0)
    _lay(item, 'ore', WORKED, seed + 1, (-0.25, 0.0, 0.0), turn=20, scale=3.4, tip=(0.0, 12.0))
    _lay(item, 'stoneLump', STONE, SPOT + 2, (0.27, 0.02, 0.0), turn=-30, scale=3.8)
    for k, (x, y, turn, scale) in enumerate(((-0.34, -0.24, 60, 1.9), (0.3, -0.26, -40, 2.0), (0.04, -0.26, 15, 1.6),
                                             (-0.12, -0.34, -70, 1.2))):
        _lay(item, 'stoneLump', STONE, seed + 10 + k, (x, y, 0.0), turn=turn, scale=scale)


# --- sunstone ---

SAND = (0.52, 0.36, 0.11)   # the drift's half width, half depth and height, metres
# the stones: where each lies on the drift and how big
SUNSTONES = [(0.02, 0.06, 0.14), (-0.23, 0.0, 0.1), (0.25, 0.03, 0.11), (0.1, -0.16, 0.075), (-0.1, -0.17, 0.065),
             (0.37, -0.1, 0.05), (-0.38, -0.08, 0.05)]


def _sand_at(x, y):
    """The drift's height at (x, y)."""
    rx, ry, h = SAND
    reach = min(1.0, math.hypot(x / rx, y / ry))
    return h * (1 - reach ** 2) ** 0.8


def _drift(item, seed):
    """A low drift of desert sand, rippled by the wind."""
    rx, ry, h = SAND
    profile = [(max(rx * s, 1e-4), h * (1 - s ** 2) ** 0.8 + 0.002) for s in np.linspace(0.0, 1.0, 12)]
    mound = shapes.moved(shapes.wobble(shapes.lathe(profile + [(rx * 1.02, 0.0)], 40), seed, 0.04),
                         scale=(1.0, ry / rx, 1.0))
    ripples = ('sandstone', _stripes((1.0, 0.4, 0.0), 0.07, seed, 0.3), 0.84)
    item.add(mound, Mat('sandstone', rough=0.95, bump=(0.4, 90.0), pattern=ripples))


@model
def nodeSunstone(item, words, seed):
    """Sunstone: smooth desert stones lying half sunk in a drift of sand, warm orange-red and glowing with the day's
    heat, hotter patches in them where it gathers."""
    _drift(item, SPOT)
    heat = ('flame', _patches(0.2, 26.0, seed), 1.0)
    for k, (x, y, r) in enumerate(SUNSTONES):
        mat = Mat('ember', rough=0.5, spec=0.4, glow=0.32, bump=(0.3, 50.0), pattern=heat)
        stone = shapes.ellipsoid((r, r * 0.85, r * 0.75), (x, y, _sand_at(x, y) + r * 0.3), rings=8, sides=16)
        item.add(shapes.wobble(stone, seed + k, 0.18), mat)
        if k < 3:
            item.sparkle((x - r * 0.4, y - r * 0.6, _sand_at(x, y) + r * 0.7), ramp='flame', arm=1 if k == 0 else 0)


@model
def nodeSunstoneSpent(item, words, seed):
    """The drift gathered: hollows in the sand where the stones lay, and one small stone left, its heat gone out."""
    _drift(item, SPOT)
    hollow = Mat('sandstone', rough=1.0, dim=0.62)
    for x, y, r in SUNSTONES[:5]:
        dent = shapes.ellipsoid((r * 0.9, r * 0.75, 0.01), (x, y, _sand_at(x, y) - 0.004), rings=4, sides=16)
        item.add(dent, hollow)
    x, y, r = SUNSTONES[5]
    stone = shapes.ellipsoid((r, r * 0.85, r * 0.6), (x, y, _sand_at(x, y) + r * 0.25), rings=8, sides=16)
    item.add(shapes.wobble(stone, seed, 0.12), Mat('redRock', rough=0.6, spec=0.3))


# --- bog pearl ---

BOG = (0.46, 0.3)
# the reeds behind the water: (x, height, lean degrees toward the right), and whether each bears a head
REEDS = [(-0.36, 0.42, -8, False), (-0.27, 0.54, -3, True), (-0.18, 0.38, 4, False), (0.2, 0.46, 6, False),
         (0.29, 0.56, 2, True), (0.37, 0.4, 10, False)]
# the bed's shut mussels: where each lies, how far it leans from standing on its hinge, its turn and its length
MUSSELS = [(-0.1, 0.1, -64, 30, 0.27), (0.04, 0.15, 24, -20, 0.3), (0.16, 0.08, 72, -40, 0.25),
           (-0.24, 0.06, -76, 50, 0.23), (0.27, 0.12, 60, 15, 0.22)]


def _shell(length):
    """A mussel's half shell lying open face down: a long low dome, narrower toward its hinge at -x."""
    verts, faces = shapes.ellipsoid((length / 2, length * 0.26, length * 0.15), rings=8, sides=18, flat=0.5)
    return [(x, y * (0.55 + 0.45 * (x / length + 0.5)), z) for x, y, z in verts], faces


def _mussel_mats():
    """A mussel's shell, blue-black with its growth lines, and its pale lining."""
    lines = ('ebony', _stripes((1.0, 0.0, 0.0), 0.022, 0, 0.3), 0.62)
    return Mat('ebony', rough=0.3, spec=0.8, pattern=lines), Mat('pewter', rough=0.3, spec=0.7, dim=0.95)


def _closed(item, length, at, lean, turn, shell):
    """A shut mussel lying in the mud, `lean` degrees over from standing on its hinge."""
    verts, faces = _shell(length)
    for flip in (1, -1):
        half = ([(x, y, z * flip) for x, y, z in verts], faces)
        item.add(shapes.moved(half, offset=at, turn=(0.0, -90 + lean, turn)), shell)


def _opened(item, length, at, turn, shell, nacre, pearl=None):
    """A mussel lying open on the mud, its two halves spread from the hinge and tipped to the eye, their pale insides
    up; `pearl` a mat for the pearl in its right half."""
    verts, faces = _shell(length)
    inside = shapes.ellipsoid((length * 0.44, length * 0.2, 0.004), rings=3, sides=16, flat=0.5)
    inside = ([(x, y * (0.55 + 0.45 * (x / length + 0.5)), z) for x, y, z in inside[0]], inside[1])
    for side in (1, -1):
        # each half dome down, its hinge at the middle, raised a little on it so the two halves part in a V
        down = ([(x * side + length / 2 * side, y, -z) for x, y, z in verts], faces)
        lining = ([(x * side + length / 2 * side, y, z) for x, y, z in inside[0]], inside[1])
        pose = dict(offset=at, turn=(30.0, -side * 14.0, turn))
        item.add(shapes.moved(down, **pose), shell)
        item.add(shapes.moved(lining, **pose), nacre)
    if pearl is not None:
        ball = shapes.ellipsoid((length * 0.2,) * 3, (length * 0.45, 0.0, length * 0.17), rings=8, sides=12)
        item.add(shapes.moved(ball, offset=at, turn=(30.0, -14.0, turn)), pearl)


def _bog(item, seed):
    """Black bog water in a bank of peat, reeds standing behind it."""
    _pool(item, (BOG[0] + 0.08, BOG[1] + 0.08), Mat('brown', rough=0.95, bump=(0.5, 60.0), dim=0.85), seed, depth=0.02)
    sheen = ('smoky', _patches(0.12, 6.0, seed), 0.7)
    _pool(item, BOG, Mat('black', rough=0.06, spec=1.0, pattern=sheen), seed + 1, z=0.012)
    rng = np.random.RandomState(seed & 0x7fffffff)
    stems = [Mat('straw2', rough=0.7, dim=0.85), Mat('green', rough=0.7, dim=0.9)]
    for k, (x, height, lean, head) in enumerate(REEDS):
        y = BOG[1] * 0.8 * math.sqrt(max(0.0, 1 - (x / (BOG[0] + 0.1)) ** 2)) + rng.uniform(0.0, 0.04)
        top = (x + height * math.sin(math.radians(lean)), y, height)
        item.add(shapes.tube([(x, y, 0.0), (x + (top[0] - x) * 0.4, y, height * 0.5), top], 0.01, sides=5,
                             radius_end=0.004), stems[k % 2])
        if head:
            cattail = shapes.ellipsoid((0.022, 0.022, 0.065), (top[0], y, height - 0.09), rings=6, sides=10)
            item.add(cattail, Mat('brown', rough=0.8, bump=(0.4, 120.0)))


@model
def nodeBogPearl(item, words, seed):
    """Bog pearl: dark mussels in a bed in black bog water, shut ones heaped behind and open ones lying before them,
    a dull pearl in each, and two pearls fallen on the bank."""
    _bog(item, SPOT)
    shell, nacre = _mussel_mats()
    pearl = Mat('ivory', rough=0.45, spec=0.4, dim=0.9)
    for x, y, lean, turn, length in MUSSELS:
        _closed(item, length, (x, y, length * 0.3), lean, turn, shell)
    for x, y, turn in ((-0.24, -0.12, 12), (0.22, -0.14, -16), (-0.01, -0.08, 4)):
        _opened(item, 0.22, (x, y, 0.03), turn, shell, nacre, pearl)
    for x, y in ((0.45, -0.22), (-0.43, -0.24)):
        item.add(shapes.ellipsoid((0.034,) * 3, (x, y, 0.04), rings=8, sides=12), pearl)
    item.sparkle((-0.03, -0.12, 0.1), ramp='ivory', arm=0)


@model
def nodeBogPearlSpent(item, words, seed):
    """The bed gathered: its mussels taken, two empty shells left gaping in the black water and one shut one."""
    _bog(item, SPOT)
    shell, nacre = _mussel_mats()
    _closed(item, 0.25, (0.06, 0.12, 0.075), 50, -15, shell)
    for x, y, turn in ((-0.2, -0.08, 14), (0.2, -0.12, -20)):
        _opened(item, 0.22, (x, y, 0.03), turn, shell, nacre)


# --- rimecrystal ---

# the rocks the frost has grown on: (middle, radii)
RIME_ROCKS = [((0.0, 0.08, 0.1), (0.3, 0.22, 0.2)), ((-0.33, -0.02, 0.06), (0.16, 0.12, 0.12)),
              ((0.31, -0.04, 0.05), (0.14, 0.11, 0.1))]
# the crystals' clusters: (model words, where, turn, scale, tip)
RIME_CLUSTERS = [(RIME, (0.02, 0.07, 0.25), 10, 6.4, (0.0, 0.0)), (RIME, (-0.32, -0.02, 0.15), 30, 4.2, (0.0, -20.0)),
                 (RIME, (0.3, -0.04, 0.13), -20, 4.0, (0.0, 24.0)), (SPIKE, (-0.13, -0.08, 0.2), 0, 4.6, (12.0, -26.0)),
                 (SPIKE, (0.15, -0.06, 0.21), 0, 4.0, (12.0, 30.0))]


def _frosted(item, seed):
    """Rock rimed white in patches, on a patch of frozen ground."""
    ground = shapes.ellipsoid((0.5, 0.3, 0.01), rings=3, sides=32, flat=0.5)
    frozen = Mat('silkWhite', rough=0.9, pattern=('glass', _patches(0.3, 10.0, seed), 0.9))
    item.add(shapes.wobble(ground, seed, 0.1), frozen)
    rime = ('silkWhite', _patches(0.32, 22.0, seed), 1.0)
    for k, (at, radii) in enumerate(RIME_ROCKS):
        _lump(item, at, radii, seed + k, Mat('granite', rough=0.85, steps=6, bump=(0.35, 70.0), pattern=rime))


@model
def nodeRimecrystal(item, words, seed):
    """Rimecrystal: clusters of blue-white frost crystals grown out of rimed rock, long and pointed, the largest
    standing from its crown and the others leaning out from its sides."""
    _frosted(item, SPOT)
    for k, (kind, at, turn, scale, tip) in enumerate(RIME_CLUSTERS):
        _lay(item, 'crystal', kind, seed + 10 + k, at, turn=turn, scale=scale, tip=tip)


@model
def nodeRimecrystalSpent(item, words, seed):
    """The rock gathered: its crystals broken off to stubs, and two shards lying where they fell."""
    _frosted(item, SPOT)
    ice = [Mat('diamond', rough=0.15, spec=0.9, glow=0.12, steps=5, dim=d) for d in (1.1, 0.75)]
    for k, (_, (x, y, z), turn, scale, _tip) in enumerate(RIME_CLUSTERS):
        stub = shapes.lathe([(0.0085 * scale, 0.012 * scale), (0.0095 * scale, 0.0)], 6, top=True, foot=True)
        item.add(shapes.moved(stub, offset=(x, y, z - 0.01), turn=(0.0, 0.0, turn)), ice[k % 2], smooth=False)
    for k, (x, y, turn) in enumerate(((-0.12, -0.24, 160), (0.24, -0.26, -20))):
        _lay(item, 'crystal', SPIKE, seed + 20 + k, (x, y, 0.025), turn=turn, scale=2.6, tip=(0.0, 84.0))
