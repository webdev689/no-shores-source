"""The Lattice's crown (`lattice-crown`): the crystallized structure the owner has the Lattice arrive under, "a
crystallized structure that appears, as the enemies spawn below". It hangs in the air over where they form: a heart
of the crystal's light, held in a cage of great spars reaching down from it like a claw, shorter ones between them
splayed out level, a dense cluster pointing down at the ground under it, a lesser crown of points standing up off its
top, a halo of small shards round its waist, and long thin shards dripping from its arms' ends. It is the Lattice's
own crystal (latticekit), its heart alight, its points bright, its roots dark.

Its origin is its heart: it reaches down some 4 m to the drips' tips and up some 1.6 m. The page hangs it over the
ground, grows it out of its heart and breaks it.
"""
import math

import latticekit

# The great spars: how many, how long, how thick, and how far they splay out from straight down (radians): a claw
# reaching down at the ground; and a ring of shorter ones between them, splayed nearly level.
SPARS = 7
SPAR_M = (2.4, 3.1)
SPAR_RADIUS_M = 0.26
SPLAY = 0.7
OUTER_M = (1.2, 1.8)
OUTER_SPLAY = 1.3
# The heart's light, and the halo round its waist.
HEART_M = 0.5
HALO = 14
HALO_OUT_M = 1.25


def crown(module):
    """The crown whole, about its heart."""
    m = latticekit.kinds()
    pick = latticekit.picker(module.random.randrange(1 << 30))
    draw = module.random
    latticekit.light(module, m, (0.0, 0.0, 0.0), HEART_M, subdivisions=2)
    for k in range(SPARS):
        turn = math.tau * k / SPARS + draw.uniform(-0.15, 0.15)
        splay = SPLAY + draw.uniform(-0.15, 0.15)
        out = (math.cos(turn) * math.sin(splay), math.sin(turn) * math.sin(splay), -math.cos(splay))
        root = (out[0] * 0.35, out[1] * 0.35, out[2] * 0.25)
        length = draw.uniform(*SPAR_M)
        latticekit.shard(module, m, root, out, length, SPAR_RADIUS_M * draw.uniform(0.85, 1.15), turn, widest=0.36)
        # A long thin shard drips from each arm's end.
        end = tuple(root[axis] + out[axis] * length * 0.82 for axis in range(3))
        latticekit.shard(module, m, end, (out[0] * 0.15, out[1] * 0.15, -1.0), draw.uniform(1.0, 1.7), 0.07,
                         turn + 0.5, widest=0.3)
        # And a lesser point grows off it partway, turned up and out.
        part = tuple(root[axis] + out[axis] * length * 0.45 for axis in range(3))
        latticekit.shard(module, m, part, (out[0], out[1], 0.6), draw.uniform(0.4, 0.8), 0.09, turn, widest=0.4)
    for k in range(SPARS):
        turn = math.tau * (k + 0.5) / SPARS + draw.uniform(-0.1, 0.1)
        out = (math.cos(turn) * math.sin(OUTER_SPLAY), math.sin(turn) * math.sin(OUTER_SPLAY), -math.cos(OUTER_SPLAY))
        latticekit.shard(module, m, (out[0] * 0.3, out[1] * 0.3, 0.0), out, draw.uniform(*OUTER_M), 0.16, turn,
                         widest=0.4)
    latticekit.cluster(module, m, pick, (0.0, 0.0, -0.3), (0.0, 0.0, -1.0), 12, (0.6, 1.6), 0.12, 0.55)
    latticekit.cluster(module, m, pick, (0.0, 0.0, 0.3), (0.0, 0.0, 1.0), 7, (0.4, 1.3), 0.1, 0.6)
    for k in range(HALO):
        turn = math.tau * k / HALO + draw.uniform(-0.1, 0.1)
        at = (math.cos(turn) * HALO_OUT_M * 0.55, math.sin(turn) * HALO_OUT_M * 0.55, draw.uniform(-0.1, 0.15))
        latticekit.shard(module, m, at, (math.cos(turn), math.sin(turn), draw.uniform(-0.25, 0.2)),
                         draw.uniform(0.35, 0.75), 0.06, turn, widest=0.4)
