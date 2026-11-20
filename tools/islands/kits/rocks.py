"""The biome kits' stone pieces, made in one of four rocks: granite (rounded, a weed line where the sea reaches),
sandstone (in bands of two parts), basalt (dark columns, coral on the shore) and slate (angular plates under snow).

`pieces(kit, look)` gives every shore rock, cliff, stack, boulder and outcrop a biome kit holds, each filling its size
in kits.json from a skirt sunk into the ground up to its height. Its numbers are the module's frame: x east, y south,
z up, metres; a cliff's sea face looks north (-y).
"""
import catalog

SINK_M = 0.3
LOOKS = {
    'granite': {'body': 'rock', 'trim': 'moss'},
    'sandstone': {'body': 'rock', 'trim': 'rockAlt'},
    'basalt': {'body': 'rockAlt', 'trim': 'stoneAlt'},
    'slate': {'body': 'rock', 'trim': 'snow'},
}


def _size(name):
    return catalog.MODULES[name]['size']


def lump(kit, look, x, y, z0, sx, sy, sz, seed, fine=False, bands=None, blocky=False):
    """One rock in `look` filling the box round (x, y) from z0 up sx × sy × sz: a list of objects; `blocky`
    granite is jointed into blocks, as a cliff's face is."""
    body = LOOKS[look]['body']
    if look == 'granite' and blocky:
        return [kit.rock(x, y, z0, (sx, sy, sz), seed=seed, shape='cube', detail=2, roughness=0.2, base=0.05,
                         part=body, smooth=None)]
    if look == 'granite':
        return [kit.rock(x, y, z0, (sx, sy, sz), seed=seed, detail=2 if fine else 1, roughness=0.22, base=0.12,
                         part=body)]
    if look == 'sandstone':
        # Bands, each a little narrower or wider than the last and pushed aside: wind-cut layers.
        draw = kit.seeded(seed)
        count = bands or max(2, min(5, round(sz / 0.6)))
        made, low = [], z0
        for band in range(count):
            high = z0 + sz * (band + 1) / count
            share = draw.uniform(0.78, 1.0) if band else 1.0
            shift = (1 - share) / 2
            made.append(kit.rock(x + draw.uniform(-shift, shift) * sx, y + draw.uniform(-shift, shift) * sy, low,
                                 (sx * share, sy * share, high - low + (0.02 if band < count - 1 else 0.0)),
                                 seed=f'{seed}.{band}', shape='cube',
                                 detail=1, roughness=0.12, base=0.0, part=body if band % 2 else LOOKS[look]['trim'],
                                 smooth=None))
            low = high
        return made
    if look == 'basalt':
        return [kit.rock(x, y, z0, (sx, sy, sz), seed=seed, detail=1, roughness=0.32, base=0.2, part=body,
                         smooth=None)]
    # Slate: angular plates, the top under a cap of snow.
    made = [kit.rock(x, y, z0, (sx, sy, sz * 0.86), seed=seed, shape='cube', detail=1, roughness=0.18, base=0.1,
                     part=body, smooth=None)]
    made.append(kit.rock(x, y, z0 + sz * 0.74, (sx * 0.8, sy * 0.8, sz * 0.26), seed=f'{seed}.snow', detail=1,
                         roughness=0.15, base=0.4, part='snow', smooth=20.0))
    return made


def columns(kit, x0, y0, x1, y1, z0, height, radius, seed, round_in=None):
    """Basalt's columns over the rectangle x0..x1, y0..y1, standing from z0 to height(x, y) (less a little, seeded),
    six-sided, `radius` to their corners; with `round_in` only those within that radius of the middle."""
    draw = kit.seeded(seed)
    made, row = [], 0
    y = y0 + radius
    while y <= y1 - radius * 0.86 + 1e-6:
        x = x0 + radius + (radius * 0.87 if row % 2 else 0.0)
        while x <= x1 - radius + 1e-6:
            if round_in is None or x * x + y * y <= round_in * round_in:
                top = height(x, y) * draw.uniform(0.84, 1.0)
                made.append(kit.prism((x, y, z0), (x, y, top), radius * 0.98, sides=6, turn=30.0, part='rockAlt',
                                      smooth=None))
            x += radius * 1.74
        y += radius * 1.5
        row += 1
    return made


def weed_line(kit, look, x, y, sx, sy, seed):
    """Where the sea reaches a rock: granite's band of weed, basalt's coral; none on the others."""
    if look == 'granite':
        return [kit.rock(x, y, -SINK_M, (sx, sy, 0.55), seed=f'{seed}.weed', detail=1, roughness=0.1, base=0.0,
                         part='moss')]
    if look == 'basalt':
        draw = kit.seeded(f'{seed}.coral')
        return [kit.rock(x + draw.uniform(-0.3, 0.3) * sx, y - sy * 0.3, -SINK_M, (sx * 0.3, sy * 0.3, 0.5),
                         seed=f'{seed}.coral{k}', detail=0, roughness=0.4, base=0.0, part='stoneAlt')
                for k in range(2)]
    return []


def shore_rocks(kit, look, name):
    """The three shore rocks: a round one with a smaller at its foot, a single low one, and a pair."""
    a, b, c = (_size(f'{name}.shore.rock.{key}') for key in 'abc')
    rock_a = lump(kit, look, 0.25, 0.1, -SINK_M, a[0] * 0.8, a[1] * 0.92, a[2] + SINK_M, f'{name}.ra', fine=True)
    rock_a += lump(kit, look, -a[0] * 0.33, -a[1] * 0.2, -SINK_M, a[0] * 0.34, a[1] * 0.45, a[2] * 0.5 + SINK_M,
                   f'{name}.ra2')
    rock_a += weed_line(kit, look, 0, 0, a[0], a[1], f'{name}.ra')
    rock_b = lump(kit, look, 0, 0, -SINK_M, b[0] * 0.96, b[1] * 0.96, b[2] + SINK_M, f'{name}.rb', fine=True)
    rock_b += weed_line(kit, look, 0, 0, b[0], b[1], f'{name}.rb')
    rock_c = lump(kit, look, -0.9, 0.1, -SINK_M, c[0] * 0.55, c[1] * 0.9, c[2] + SINK_M, f'{name}.rc1')
    rock_c += lump(kit, look, 1.1, -0.15, -SINK_M, c[0] * 0.5, c[1] * 0.75, c[2] * 0.72 + SINK_M, f'{name}.rc2')
    rock_c += weed_line(kit, look, 0, 0, c[0], c[1], f'{name}.rc')
    return {'shore.rock.a': kit.join(rock_a), 'shore.rock.b': kit.join(rock_b), 'shore.rock.c': kit.join(rock_c)}


def _tiers(kit, look, name, fronts, seed):
    """A cliff of tiers, each (top, front y): the sea face at the front, each tier set back over the last so its
    foot is a ledge, every tier running back into the land past the module's back."""
    x, y, z = _size(name)
    made, low = [], -SINK_M
    for number, (top, front) in enumerate(fronts):
        if look == 'basalt':
            break
        for part, across in enumerate((-x / 3, 0.0, x / 3)):
            wide = x / 3 * 1.22 if part != 1 else x / 3 * 1.3
            left, right = max(across - wide / 2, -x / 2), min(across + wide / 2, x / 2)
            made += lump(kit, look, (left + right) / 2, (front + y / 2) / 2, low, right - left, y / 2 - front,
                         top - low, f'{seed}.{number}.{part}', bands=2, blocky=True)
        low = top - 0.6
    if look == 'basalt':
        def height(px, py):
            return next((top for top, front in fronts if py <= front + 1.2), fronts[-1][0])
        made = columns(kit, -x / 2, -y / 2, x / 2, y / 2, -SINK_M, height, 0.62, seed)
    return kit.join(made)


def cliffs(kit, look, name):
    """Two cliffs: one with two ledges, one a tall face with one deep ledge and a fallen block at its foot."""
    first, second = f'{name}.cliff.a', f'{name}.cliff.b'
    _, y, z = _size(first)
    cliff_a = _tiers(kit, look, first, [(z * 0.42, -y / 2), (z * 0.72, -y / 2 + 1.1), (z, -y / 2 + 2.1)],
                     f'{name}.ca')
    cliff_b = _tiers(kit, look, second, [(z * 0.66, -y / 2 + 0.6), (z, -y / 2 + 2.4)], f'{name}.cb')
    fallen = lump(kit, look, -2.6, -y / 2 + 0.7, -SINK_M, 2.2, 1.3, 1.5, f'{name}.cbf')
    return {'cliff.a': cliff_a, 'cliff.b': kit.join([cliff_b] + fallen)}


def stack(kit, look, name):
    """A sea stack: a pillar of stone narrowing as it rises, its foot in the sea."""
    x, y, z = _size(f'{name}.stack')
    if look == 'basalt':
        made = columns(kit, -x / 2, -y / 2, x / 2, y / 2, -SINK_M, lambda px, py: z - 1.6 * (px * px + py * py) /
                       (x * x / 4), 0.62, f'{name}.st', round_in=x / 2)
        return kit.join(made)
    tiers = [(1.0, 0.36), (0.8, 0.66), (0.64, 0.88), (0.42, 1.0)]
    made, low = [], -SINK_M
    for number, (share, top) in enumerate(tiers):
        shift = (0.6 * (number % 2) - 0.3, 0.4 * (number % 3) - 0.4) if number else (0.0, 0.0)
        made += lump(kit, look, *shift, low, x * share, y * share * 0.9,
                     z * top - low, f'{name}.st{number}', blocky=True)
        low = z * top - 0.8
    made += weed_line(kit, look, 0, 0, x, y, f'{name}.st')
    return kit.join(made)


def boulders(kit, look, name):
    """Three boulders: a round one, a big one split down the middle, and a small one; and the outcrop, a knot of
    them."""
    a, b, c = (_size(f'{name}.boulder.{key}') for key in 'abc')
    split = []
    for side in (-1, 1):
        split += lump(kit, look, side * b[0] / 4 + side * 0.06, 0, -SINK_M, b[0] / 2 - 0.12, b[1] * (0.96 - 0.06 *
                      (side > 0)), b[2] * (1.0 if side < 0 else 0.86) + SINK_M, f'{name}.bb{side}', fine=side < 0)
    small = lump(kit, look, 0, 0, -0.15, c[0], c[1], c[2] + 0.15, f'{name}.bc', blocky=True)
    x, y, z = _size(f'{name}.outcrop')
    knot = []
    for number, (px, py, sx, sy, sz) in enumerate([(-2.2, 0, 3.6, 4.6, 1.0), (2.2, 0.2, 3.4, 4.2, 0.82),
                                                   (0, 1.4, 3.2, 3.0, 0.6), (-0.4, -1.8, 2.6, 2.4, 0.45),
                                                   (3.0, -1.9, 1.9, 2.0, 0.35)]):
        knot += lump(kit, look, px, py, -SINK_M, sx, sy, z * sz + SINK_M, f'{name}.oc{number}')
    return {'boulder.a': kit.join(lump(kit, look, 0, 0, -SINK_M, a[0], a[1], a[2] + SINK_M, f'{name}.ba',
                                       fine=True)),
            'boulder.b': kit.join(split), 'boulder.c': kit.join(small), 'outcrop': kit.join(knot)}


def pieces(kit, look, name):
    """Every stone piece of the biome kit `name` in `look`, by piece name."""
    return {**shore_rocks(kit, look, name), **cliffs(kit, look, name), 'stack': stack(kit, look, name),
            **boulders(kit, look, name)}
