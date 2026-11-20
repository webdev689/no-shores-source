"""The biome kits' small growth and what the sea leaves: shrubs, grasses and each biome's drift piece, each filling its
size in kits.json. Numbers are the module's frame: x east, y south, z up, metres.
"""
import math

import catalog
from kits.trees import limb, mass


def _size(module):
    return catalog.MODULES[module]['size']


def bush(kit, module, masses, part='leaf', bloom=0, bloom_part='leafAlt', seed=None):
    """A bush of `masses` leafy masses (two finer, the rest coarse) round its middle, with `bloom` small flowers or
    berries on it."""
    x, y, z = _size(module)
    seed = seed or module
    draw = kit.seeded(seed)
    made = []
    for number in range(masses):
        angle = math.radians(360 * number / masses + draw.uniform(-20, 20))
        reach = 0.0 if number == 0 else x * 0.22
        sx = x * (0.62 if number == 0 else draw.uniform(0.42, 0.52))
        cx, cy = reach * math.cos(angle), reach * math.sin(angle)
        cx, cy = max(-x / 2 + sx / 2, min(x / 2 - sx / 2, cx)), max(-y / 2 + sx / 2, min(y / 2 - sx / 2, cy))
        sz = z * (1.0 if number == 0 else draw.uniform(0.55, 0.8))
        made.append(mass(kit, cx, cy, -0.1, sx, sx * y / x, sz + 0.1, f'{seed}.{number}', part,
                         detail=1 if number < 2 else 0))
    for number in range(bloom):
        angle = math.radians(360 * number / bloom + 40)
        made.append(mass(kit, x * 0.3 * math.cos(angle), y * 0.3 * math.sin(angle), z * 0.55, 0.24, 0.24, 0.2,
                         f'{seed}.b{number}', bloom_part, detail=0))
    return kit.join(made)


def fern(kit, module, fronds=7, part='leaf', width=0.26, seed=None):
    """A fern: fronds springing from its crown, arching up and over."""
    x, y, z = _size(module)
    # A frond rising 2.76 heights over its reach and drooping 2 by its tip peaks near the top of the size.
    made = [kit.frond((0, 0, 0.02), 360 * k / fronds + 11 * (k % 2), x * 0.45, width, z * 1.9,
                      rise=z * 2.62 / (x * 0.45),
                      segments=3, fold=0.2, part=part) for k in range(fronds)]
    made += [kit.frond((0, 0, 0.02), 360 * k / 3 + 50, x * 0.2, width * 0.6, -z * 0.4, rise=0.2, segments=2,
                       part=part) for k in range(3)]
    return kit.join(made)


def broad_leaves(kit, module, leaves=6, part='leaf', seed=None):
    """A broad-leaf plant: wide leaves on short stems, held up and out from its crown."""
    x, y, z = _size(module)
    made = [kit.frond((0, 0, 0.0), 360 * k / leaves, x * 0.48, x * 0.5, z * 1.15, rise=z * 2.03 / (x * 0.48),
                      segments=3,
                      fold=0.05, part=part) for k in range(leaves)]
    made.append(kit.frond((0, 0, 0.0), 30, x * 0.12, x * 0.2, -z * 0.7, rise=0.3, segments=2, part=part))
    return kit.join(made)


def cactus(kit, module, seed=None):
    """A cluster of small round-topped cacti, ribbed, the tallest in the middle."""
    x, y, z = _size(module)
    made = []
    for number, (cx, cy, share, radius) in enumerate([(0.05, 0.0, 1.0, 0.2), (-0.36, 0.18, 0.62, 0.17),
                                                     (0.36, -0.2, 0.5, 0.16), (-0.16, -0.4, 0.38, 0.14),
                                                     (0.3, 0.38, 0.3, 0.12)]):
        top = z * share
        profile = [(0.0, -0.1), (radius, -0.1), (radius * 1.04, top * 0.7), (radius * 0.75, top * 0.95),
                   (0.0, top)]
        made.append(kit.lathe(profile, cx, cy, 0.0, sides=8, part='leaf', smooth=None))
    return kit.join(made)


def grass(kit, module, blades, part='grass', tips=None, width=0.06, heads=0, seed=None):
    """Grass in a tuft of `blades` blades; with `tips` a part (frost, dry seed) for a third of them; with `heads`
    seed heads on stalks (reeds)."""
    x, y, z = _size(module)
    seed = seed or module
    made = [kit.tuft(0, 0, blades, z, x * 0.48, width, seed=seed, part=part)]
    if tips:
        made.append(kit.tuft(0, 0, blades // 3, z * 0.75, x * 0.4, width, seed=f'{seed}.tips', part=tips))
    for number in range(heads):
        angle = math.radians(360 * number / max(heads, 1) + 30)
        top = (x * 0.18 * math.cos(angle), y * 0.18 * math.sin(angle), z * 0.98)
        made.append(limb(kit, (0, 0, -0.05), (top[0], top[1], top[2] - 0.12), 0.01, 0.01, part='grass', sides=3,
                         steps=1))
        made.append(kit.cylinder((top[0], top[1], top[2] - 0.16), top, 0.03, sides=5, part='bark'))
    return kit.join(made)


def log(kit, module, seed=None):
    """A bleached driftwood log along x, its root plate at the east end, two snapped branches."""
    x, y, z = _size(module)
    made = [limb(kit, (-x / 2 + 0.1, 0.05, z * 0.3), (x / 2 - 0.7, -0.05, z * 0.42), 0.26, 0.33, bow=(0, 0.1, 0.05),
                 part='wood', sides=7, steps=4)]
    for number, (dy, dz) in enumerate(((0.5, 0.35), (-0.5, 0.25), (0.35, -0.35), (-0.3, 0.38), (0.0, 0.42))):
        made.append(limb(kit, (x / 2 - 0.8, 0, z * 0.42), (x / 2 - 0.15, dy, z * 0.42 + dz), 0.16, 0.04,
                         part='wood', sides=5, steps=2))
    made.append(limb(kit, (-0.5, 0, z * 0.5), (-1.1, -0.5, z * 0.95), 0.1, 0.05, part='wood', sides=5, steps=1))
    made.append(limb(kit, (0.8, 0, z * 0.5), (1.2, 0.45, z * 0.7), 0.09, 0.05, part='wood', sides=5, steps=1))
    return kit.join(made)


def root(kit, module, seed=None):
    """A sun-bleached root: a stump of knotted wood at the east, its roots writhing west along the ground."""
    x, y, z = _size(module)
    made = [mass(kit, x / 2 - 0.55, 0, -0.1, 1.0, 1.0, z + 0.1, f'{module}.stump', 'wood', detail=1)]
    for number, (ey, bow) in enumerate(((0.3, 0.15), (-0.3, -0.15), (0.1, 0.12), (-0.12, -0.18), (0.22, -0.1))):
        reach = x * (0.95 - 0.12 * number)
        made.append(limb(kit, (x / 2 - 0.6, 0, z * 0.45), (x / 2 - reach, ey, 0.04), 0.15, 0.03,
                         bow=(0, bow, 0.15), part='wood', sides=5, steps=4))
    return kit.join(made)


def mangrove(kit, module, seed=None):
    """Mangrove roots arching out of the water along x: hoops of root rising from the mud and plunging back."""
    x, y, z = _size(module)
    made = []
    for number, (x0, x1, ey) in enumerate(((-2.4, -0.6, 0.3), (-1.4, 0.6, -0.35), (-0.4, 1.6, 0.2),
                                          (0.6, 2.4, -0.25), (-2.0, 0.1, -0.05), (0.2, 2.1, 0.4))):
        made.append(limb(kit, (x0, ey, -0.3), (x1, -ey, -0.3), 0.09, 0.07, bow=(0, 0, z * 1.3), part='bark', sides=5,
                         steps=6))
    made.append(limb(kit, (0, 0, -0.3), (0.1, 0.05, z), 0.16, 0.12, part='bark', sides=6, steps=1))
    return kit.join(made)


def floe(kit, module, seed=None):
    """An ice floe run aground: a broad slab and a smaller one pushed up across it, both under snow."""
    x, y, z = _size(module)
    slab = kit.rock(0, 0, -0.3, (x, y * 0.95, z * 0.6 + 0.3), seed=f'{module}.slab', shape='cube', detail=1,
                    roughness=0.08, base=0.0, part='snow', smooth=None)
    raft = kit.rock(0.8, 0.1, z * 0.25, (x * 0.4, y * 0.7, z * 0.45), seed=f'{module}.raft', shape='cube', detail=1,
                    roughness=0.08, base=0.0, part='snow', smooth=None)
    return kit.join([slab, kit.rotate(raft, -14, 'y', (0.8, 0.1, z * 0.6))])
