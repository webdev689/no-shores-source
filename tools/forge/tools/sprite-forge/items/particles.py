"""The particles' pictures: small sprites of physical things the game's particle systems wear, each rendered at the size
and in the layout its system reads (tools/sprite-forge/specs/pictures/particles.json).

- Windfall's leaves (src/systems/windfall/windfallPictures.js): two 64 x 64 sheets of 8 x 8 tiles, one leaf a tile -
  oak, maple, birch, elm, linden and willow, each a cupped, veined blade on its stalk, tumbled its own way. The spring
  and summer sheet is green, the fall sheet red, gold and russet: the same leaves at the same tumbles, only their
  colours turned. And its 16 x 16 snow crystal.
- Come Sail Away's wake splash (src/systems/comeSailAway/csaPictures.js): a crown of spray and its droplets seen from
  straight above, as the picture lies flat on the water.
- Dynamic Skies' pixel snow (src/systems/dynamicSkies/dynamicSkiesAssets.js): a 64 x 64 stellar crystal.

Every flat thing is built in its own plane (x right, y up, z its face), then stood square to a level eye: x stays
across the picture, y runs up it and the face looks at the eye (`_to_eye`)."""
import math

import numpy as np

from . import kit, shapes
from .kit import Mat
from .models import model

# --- the colours ---


def _ramp(base, lows=(0.46, 0.64, 0.82), highs=(1.0, 1.18), warm=(14, 12, -6), cool=(-6, 0, 10)):
    """A five-step ramp about `base` (its fourth step): the shade cooled, the light warmed, as sunlit leaves are. Its
    darkest step stays a colour, so the edge the kit sinks away from the light is a leaf's dark rim, not a black line."""
    base = np.asarray(base, dtype=np.float64)
    steps = [base * k + np.asarray(cool) * (1 - k) for k in lows]
    steps += [base * k + np.asarray(warm) * (k - 1) / 0.18 for k in highs]
    return [[int(min(255, max(0, round(c)))) for c in step] for step in steps]


def _mixed(base, toward, share):
    """`base` drawn `share` of the way to `toward`."""
    return [round(b * (1 - share) + t * share) for b, t in zip(base, toward)]


# The leaves' own greens and turned colours (Windfall's painter's, systems/windfall/windfallPictures.js), one a tile by
# its seed and the same index on both sheets; each with its paler underside and its paler veins
SPRING = [[92, 140, 48], [70, 120, 40], [118, 158, 58], [58, 104, 44], [136, 168, 70], [84, 130, 56]]
FALL = [[204, 92, 30], [178, 52, 32], [214, 164, 46], [148, 92, 46], [192, 124, 40], [158, 40, 36]]
OWN_RAMPS = {}
for _index, (_green, _turned) in enumerate(zip(SPRING, FALL)):
    OWN_RAMPS[f'pt-spring{_index}'] = _ramp(_green)
    OWN_RAMPS[f'pt-springUnder{_index}'] = _ramp(_mixed(_green, (168, 182, 140), 0.42))
    OWN_RAMPS[f'pt-springVein{_index}'] = _ramp(_mixed(_green, (200, 220, 120), 0.45))
    OWN_RAMPS[f'pt-fall{_index}'] = _ramp(_turned)
    OWN_RAMPS[f'pt-fallUnder{_index}'] = _ramp(_mixed(_turned, (206, 176, 120), 0.4))
    OWN_RAMPS[f'pt-fallVein{_index}'] = _ramp(_mixed(_turned, (240, 210, 120), 0.45))
OWN_RAMPS.update({
    'pt-fallSpot': _ramp((104, 62, 32)),
    'pt-springStalk': _ramp((132, 150, 70)),
    'pt-fallStalk': _ramp((140, 100, 52)),
    # snow and ice: blue in the shade, white in the light
    'pt-snow': [[92, 122, 170], [146, 174, 216], [196, 216, 244], [232, 241, 255], [255, 255, 255]],
    # the splash: spray lit through, green-blue in its depths and white at its crests
    'pt-spray': [[64, 116, 160], [118, 170, 210], [180, 218, 242], [228, 245, 254], [255, 255, 255]],
    'pt-foam': [[70, 110, 138], [118, 160, 186], [176, 210, 226], [226, 242, 248], [250, 254, 255]],
})
for _name, _steps in OWN_RAMPS.items():
    kit.RAMPS[_name] = np.asarray(_steps, dtype=np.float64)


# --- shared pieces ---

def _to_eye(points):
    """Points built flat (x right, y up, z out of the face) stood square to a level eye: the face toward it (-y)."""
    pts = np.asarray(points, dtype=np.float64)
    return np.stack([pts[:, 0], -pts[:, 2], pts[:, 1]], axis=1)


def _turn(points, axis, degrees):
    """Points turned `degrees` about the axis 'x', 'y' or 'z' through the origin."""
    a = math.radians(degrees)
    c, s = math.cos(a), math.sin(a)
    rot = {'x': [[1, 0, 0], [0, c, -s], [0, s, c]], 'y': [[c, 0, s], [0, 1, 0], [-s, 0, c]],
           'z': [[c, -s, 0], [s, c, 0], [0, 0, 1]]}[axis]
    return np.asarray(points, dtype=np.float64) @ np.asarray(rot).T


def _bounds(item, across, up, level=True):
    """Four loose corners (no face: never drawn) `across` and `up` metres each way about the origin in the picture's
    plane, a level eye's (x, z) or one looking straight down's (x, y): the kit frames a picture by every vertex, so the
    box is the picture's frame - a sheet's cells each whole texels, a picture held to its canvas's shape."""
    corners = [(sx * across, 0.0, su * up) if level else (sx * across, su * up, 0.0) for sx in (-1, 1) for su in (-1, 1)]
    item.add((corners, []), Mat('pt-snow'), smooth=False, name='bounds')


def _math(nodes, links, operation, first, second=0.0):
    node = nodes.new('ShaderNodeMath')
    node.operation = operation
    for socket, value in zip(node.inputs, (first, second)):
        if isinstance(value, (int, float)):
            socket.default_value = value
        else:
            links.new(value, socket)
    return node.outputs['Value']


def _uv(nodes, links, name='leaf'):
    """A part's own flat coordinates (the UV map `name` its builder wrote): u across, v along."""
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = name
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(uv.outputs['UV'], sep.inputs['Vector'])
    return sep.outputs['X'], sep.outputs['Y']


def _write_uv(ob, coords, name='leaf'):
    """Each vertex's flat coordinates (`coords`, one (u, v) a vertex) as the object's UV map `name`."""
    me = ob.data
    layer = me.uv_layers.new(name=name)
    loops = np.zeros(len(me.loops), dtype=np.int64)
    me.loops.foreach_get('vertex_index', loops)
    layer.data.foreach_set('uv', np.asarray(coords, dtype=np.float32)[loops].ravel())


# --- the leaves ---

def _egg(theta, tip, side, base):
    """An egg's radius at `theta` (0 toward the tip, pi toward the stalk): two half-ellipses meeting across."""
    along = np.where(np.cos(theta) >= 0, tip, base)
    return 1.0 / np.sqrt((np.cos(theta) / along) ** 2 + (np.sin(theta) / side) ** 2)


def _point(theta, amount, sharp, at=0.0):
    """A blade drawn out to a point at `at` (0 the tip, pi the stalk)."""
    return 1.0 + amount * np.maximum(np.cos(theta - at), 0.0) ** sharp


def _lobes(theta, count, depth, start, end):
    """Rounded lobes down each side between `start` and `end` (radians from the tip), `count` a side, their sinuses
    cut `depth` of the way in."""
    turn = np.abs(theta)
    phase = np.clip((turn - start) / (end - start), 0.0, 1.0) * count
    cut = (0.5 + 0.5 * np.cos(2 * math.pi * phase)) ** 3
    return np.where((turn >= start) & (turn <= end), 1.0 - depth * cut, 1.0)


# Each kind's blade: its outline round a centre on the midrib (a radius at each angle, 0 toward the tip), the centre's
# height on the midrib, and whether its veins spread from the stalk (palmate) or run up one midrib. The outlines are
# each kind's own, drawn bolder than life - deeper sinuses, longer points - so they still differ at eight texels
def _oak(theta, rng):
    lobed = _lobes(theta, 3, rng.uniform(0.44, 0.52), 0.32, 2.7)
    return 0.5, _egg(theta, 0.48, 0.34, 0.46) * lobed * (1 + 0.12 * np.cos(theta))


def _maple(theta, rng):
    spread = rng.uniform(0.98, 1.1)
    lobes = ((0.0, 0.64, 0.62), (spread, 0.6, 0.6), (-spread, 0.6, 0.6), (2.15, 0.4, 0.55), (-2.15, 0.4, 0.55))
    reach = np.full_like(theta, 0.3)
    for at, length, width in lobes:
        gap = np.abs((theta - at + math.pi) % (2 * math.pi) - math.pi)
        reach = np.maximum(reach, 0.3 + (length - 0.3) * np.clip(1 - gap / width, 0, 1) ** 1.4)
    # the notch the stalk meets
    return 0.36, reach * (1 - 0.4 * np.exp(-((np.abs(theta) - math.pi) / 0.22) ** 2))


def _birch(theta, rng):
    flat = 1 - 0.18 * np.exp(-((np.abs(theta) - math.pi) / 0.5) ** 2)
    return 0.32, _egg(theta, 0.46, 0.37, 0.28) * _point(theta, rng.uniform(0.34, 0.42), 12) * flat


def _elm(theta, rng):
    lopsided = 1 + 0.16 * np.exp(-((theta + 2.45) / 0.42) ** 2)
    return 0.46, _egg(theta, 0.42, 0.29, 0.44) * _point(theta, 0.2, 22) * lopsided


def _linden(theta, rng):
    notch = 1 - 0.45 * np.exp(-((np.abs(theta) - math.pi) / 0.3) ** 2)
    return 0.44, _egg(theta, 0.4, 0.41, 0.42) * _point(theta, 0.24, 20) * notch


def _willow(theta, rng):
    ends = _point(theta, 0.12, 18) * _point(theta, 0.08, 18, at=math.pi)
    return 0.5, _egg(theta, 0.44, rng.uniform(0.19, 0.21), 0.42) * ends


LEAF_KINDS = {'oak': _oak, 'maple': _maple, 'birch': _birch, 'elm': _elm, 'linden': _linden, 'willow': _willow}
PALMATE = {'maple'}
# the colours a kind turns, indices into FALL: maple scarlet and crimson, oak russet, birch and linden gold, elm amber
FALL_OF = {'oak': (3, 1, 4), 'maple': (1, 5, 0), 'birch': (2, 4), 'elm': (4, 0, 5), 'linden': (2, 0), 'willow': (2, 3)}
RINGS = 10       # rings of the blade's mesh from its centre to its edge
AROUND = 96      # points round the blade's outline


def _blade(kind, rng, cup, curl, twist):
    """One blade, flat in its own plane before it is bent: the midrib up y from its stalk (0) to its tip (about 1), its
    face +z. Answers (vertices, faces, flat coordinates a vertex, where the stalk meets it). Bent by `cup` (its sides
    lifted about the midrib), `curl` (its tip and base lifted) and `twist` (one side up toward the tip, one down)."""
    theta = (np.linspace(0.0, 2 * math.pi, AROUND, endpoint=False) + math.pi) % (2 * math.pi) - math.pi
    centre, reach = LEAF_KINDS[kind](theta, rng)
    edge = np.stack([reach * np.sin(theta), centre + reach * np.cos(theta)], axis=1)
    stalk = edge[np.argmax(np.abs(theta)), 1]
    tip = edge[0, 1]
    scale = 1.0 / (tip - stalk)
    edge = (edge - [0.0, stalk]) * scale
    middle = np.array([0.0, (centre - stalk) * scale])
    flat = [middle]
    for ring in range(1, RINGS + 1):
        flat += list(middle + (edge - middle) * ring / RINGS)
    flat = np.asarray(flat)
    x, y = flat[:, 0], flat[:, 1]
    # the sides lifted about the midrib: a groove along it, rounded so the light runs smoothly across each half
    z = cup * (np.sqrt(x * x + 0.012) + 1.2 * x * x) + curl * (y - 0.5) ** 2 + twist * x * (y - 0.5)
    verts = np.stack([x, y, z], axis=1)
    faces = [(0, 1 + (k + 1) % AROUND, 1 + k) for k in range(AROUND)]
    for ring in range(RINGS - 1):
        inner, outer = 1 + ring * AROUND, 1 + (ring + 1) * AROUND
        faces += [(inner + k, inner + (k + 1) % AROUND, outer + (k + 1) % AROUND, outer + k) for k in range(AROUND)]
    base = np.array([0.0, 0.0, curl * 0.25])
    return verts, faces, flat, base


def _stalk(base, length, bend, radius):
    """The leaf's stalk from where it meets the blade down -y, bent a little out of the blade's plane."""
    pts = [base + np.array([0.0, 0.04, 0.0])]
    for step in range(1, 5):
        t = step / 4
        pts.append(base + np.array([bend * 0.3 * t * t, -length * t, bend * t * t]))
    return shapes.tube([tuple(p) for p in pts], radius, sides=6, radius_end=radius * 0.8)


def _veins(palmate, spread=0.96):
    """A blade's main veins over its flat coordinates: the midrib, and a palmate blade's side veins from its stalk. The
    midrib stops short of the tip; a vein is about a texel wide at a tile's size."""
    def mask(nodes, links, coord):
        u, v = _uv(nodes, links)
        half = 0.055
        width = _math(nodes, links, 'ABSOLUTE', u)
        rib = _math(nodes, links, 'LESS_THAN', width, half)
        rib = _math(nodes, links, 'MULTIPLY', rib, _math(nodes, links, 'GREATER_THAN', v, 0.03))
        rib = _math(nodes, links, 'MULTIPLY', rib, _math(nodes, links, 'LESS_THAN', v, 0.8))
        if not palmate:
            return rib
        # a ray from the stalk at `spread` either side of the midrib: its distance off the ray, and how far along
        dx, dy = math.sin(spread), math.cos(spread)
        along = _math(nodes, links, 'ADD', _math(nodes, links, 'MULTIPLY', width, dx),
                      _math(nodes, links, 'MULTIPLY', v, dy))
        off = _math(nodes, links, 'ABSOLUTE', _math(nodes, links, 'SUBTRACT',
                                                    _math(nodes, links, 'MULTIPLY', width, dy),
                                                    _math(nodes, links, 'MULTIPLY', v, dx)))
        side = _math(nodes, links, 'LESS_THAN', off, half)
        side = _math(nodes, links, 'MULTIPLY', side, _math(nodes, links, 'GREATER_THAN', along, 0.06))
        side = _math(nodes, links, 'MULTIPLY', side, _math(nodes, links, 'LESS_THAN', along, 0.5))
        return _math(nodes, links, 'MAXIMUM', rib, side)
    return mask


def _underside(nodes, links, coord):
    """The blade's back, where the eye sees it: a leaf's underside is paler than its face."""
    geometry = nodes.new('ShaderNodeNewGeometry')
    return geometry.outputs['Backfacing']


def _spots(nodes, links, coord):
    """A turned leaf's darker blotches, a texel or two across, scattered by a noise over the sheet."""
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 70.0
    noise.inputs['Detail'].default_value = 1.0
    links.new(coord, noise.inputs['Vector'])
    return _math(nodes, links, 'MULTIPLY', noise.outputs['Fac'], 0.5 / 0.64)


CELLS = 8                    # tiles a side of a sheet
CELL = 0.0625                # a tile's side, metres: a leaf about six centimetres long
TEXEL = CELL / 8             # a tile is eight texels a side
FIT = 0.05 * TEXEL           # the clear a leaf keeps from its tile's edge
OVER = 0.35 * TEXEL          # how far the four leaves that bound the sheet reach past its edge (under half a texel)
# the tiles whose leaf reaches the sheet's edge, each with the side it reaches: the kit cuts a picture to what it draws,
# so a leaf on each edge keeps the cut on the sheet's own bounds
EDGE_TILES = {3 * 8 + 0: 'left', 4 * 8 + 7: 'right', 0 * 8 + 3: 'top', 7 * 8 + 4: 'bottom'}


def _leaf_plan(seed):
    """Every tile's leaf, drawn from the sheet's seed alone (so both sheets lay the same leaves): its kind, its colour's
    index on each sheet, how it is bent, and how it tumbles."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    kinds = list(LEAF_KINDS)
    order = [kinds[k % len(kinds)] for k in range(CELLS * CELLS)]
    rng.shuffle(order)
    plan = []
    for tile, kind in enumerate(order):
        flip = rng.uniform() < 0.28
        # a leaf that bounds the sheet faces the eye nearly square, so it is broad where it meets the edge
        square = 0.3 if tile in EDGE_TILES else 1.0
        plan.append({
            'kind': kind, 'shape': int(rng.randint(1 << 30)),
            'spring': int(rng.randint(len(SPRING))), 'fall': int(rng.choice(FALL_OF[kind])),
            'cup': rng.uniform(0.28, 0.46) * (0.6 if kind in PALMATE else 1.0), 'curl': rng.uniform(-0.15, 0.4),
            'twist': rng.uniform(-0.25, 0.25), 'spin': rng.uniform(0, 360),
            'roll': rng.uniform(-34, 34) * square + (180 if flip else 0), 'pitch': rng.uniform(-30, 30) * square,
            'stalk': rng.uniform(0.16, 0.24), 'bend': rng.uniform(-0.08, 0.08), 'jitter': rng.uniform(-1, 1, 2),
        })
    return plan


def _leaf(leaf):
    """One planned leaf, blade and stalk, tumbled and stood before the eye at a unit's length: its vertices (the
    blade's, then the stalk's), the blade's faces and flat coordinates, and the stalk's faces (counted from its own)."""
    rng = np.random.RandomState(leaf['shape'])
    verts, faces, flat, base = _blade(leaf['kind'], rng, leaf['cup'], leaf['curl'], leaf['twist'])
    stalk_verts, stalk_faces = _stalk(base, leaf['stalk'], leaf['bend'], 0.05)
    both = np.concatenate([verts, np.asarray(stalk_verts)])
    both = _turn(_turn(both - [0.0, 0.5, 0.0], 'y', leaf['roll']), 'x', leaf['pitch'])
    return _turn(_to_eye(both), 'y', leaf['spin']), faces, flat, stalk_faces


@model
def windfallLeaves(item, words, seed):
    """Windfall's sheet of 64 leaves, eight tiles a side, one leaf a tile: oak, maple, birch, elm, linden and willow,
    each cupped about its midrib and curled, its veins paler, on its stalk, tumbled its own way (some show their paler
    undersides). Words: `season` 'spring' (green, the default) or 'fall' (red, gold and russet, blotched darker). The
    leaves, their shapes and tumbles come from the seed alone, so both seasons' sheets lay every leaf the same."""
    season = words.get('season', 'spring')
    if season not in ('spring', 'fall'):
        raise ValueError(f'windfallLeaves: no season "{season}"')
    _bounds(item, CELLS * CELL / 2, CELLS * CELL / 2)
    mats = {}

    def mat(colour, palmate):
        key = (colour, palmate)
        if key not in mats:
            name = 'spring' if season == 'spring' else 'fall'
            patterns = [(f'pt-{name}Under{colour}', _underside)]
            if season == 'fall':
                patterns.append(('pt-fallSpot', _spots))
            patterns.append((f'pt-{name}Vein{colour}', _veins(palmate)))
            mats[key] = Mat(f'pt-{name}{colour}', rough=0.55, spec=0.35, pattern=patterns)
        return mats[key]
    stalk_mat = Mat('pt-springStalk' if season == 'spring' else 'pt-fallStalk', rough=0.6, spec=0.3)
    for tile, leaf in enumerate(_leaf_plan(seed)):
        verts, faces, flat, stalk_faces = _leaf(leaf)
        # fit the leaf to its tile: its longer side across the tile less its clear, its middle on the tile's
        low, high = verts.min(axis=0), verts.max(axis=0)
        scale = (CELL - 2 * FIT) / max(high[0] - low[0], high[2] - low[2])
        verts = (verts - (low + high) / 2) * scale
        row, col = divmod(tile, CELLS)
        centre = np.array([-CELLS * CELL / 2 + (col + 0.5) * CELL, 0.0, CELLS * CELL / 2 - (row + 0.5) * CELL])
        room = (CELL - 2 * FIT - (high - low) * scale) / 2
        centre[0] += leaf['jitter'][0] * room[0]
        centre[2] += leaf['jitter'][1] * room[2]
        verts = verts + centre
        edge = EDGE_TILES.get(tile)
        if edge:
            axis, sign = {'left': (0, -1), 'right': (0, 1), 'top': (2, 1), 'bottom': (2, -1)}[edge]
            far = verts[:, axis].max() if sign > 0 else verts[:, axis].min()
            verts[:, axis] += sign * (CELLS * CELL / 2 + OVER) - far
        blade = item.add((verts[:len(flat)], faces), mat(leaf[season], leaf['kind'] in PALMATE), name=f'leaf{tile}')
        _write_uv(blade, flat)
        item.add((verts[len(flat):], stalk_faces), stalk_mat, name=f'stalk{tile}')


# --- the snow crystals ---

def _ridge(start, end, width, width_end, height):
    """An ice bar in the crystal's plane from `start` to `end` ((x, y) pairs): its section a flat diamond `width`
    across tapering to `width_end`, its ridge `height` proud of the plane each side, its far end drawn to a point.
    Each half of its face leans its own way, so one catches the light and one is in shade, as an ice needle's do."""
    (x0, y0), (x1, y1) = start, end
    along = np.array([x1 - x0, y1 - y0])
    length = float(np.linalg.norm(along))
    along /= length
    across = np.array([-along[1], along[0]])
    verts = []
    stations = ((0.0, width, height), (0.82, width_end, height * 0.8), (1.0, width_end * 0.15, height * 0.2))
    for share, half_width, rise in stations:
        mid = np.array([x0, y0]) + along * length * share
        for side, up in ((-half_width, 0.0), (0.0, rise), (half_width, 0.0), (0.0, -rise)):
            point = mid + across * side
            verts.append((point[0], point[1], up))
    faces = []
    for station in range(len(stations) - 1):
        a, b = station * 4, (station + 1) * 4
        faces += [(a + k, a + (k + 1) % 4, b + (k + 1) % 4, b + k) for k in range(4)]
    faces += [(3, 2, 1, 0), (8, 9, 10, 11)]
    return verts, faces


def _plate(radius, height, turn=0.0):
    """The crystal's hexagonal heart: a low six-sided pyramid each side of its plane, so its six faces each take their
    own light, as a cut gem's facets do."""
    rim = [(radius * math.cos(math.radians(turn + 60 * k)), radius * math.sin(math.radians(turn + 60 * k)), 0.0)
           for k in range(6)]
    verts = rim + [(0.0, 0.0, height), (0.0, 0.0, -height)]
    faces = [(k, (k + 1) % 6, 6) for k in range(6)] + [((k + 1) % 6, k, 7) for k in range(6)]
    return verts, faces


def _crystal(radius, branches, twigs=0, arm_width=0.09, heart=0.22, reach=0.5, seed=0):
    """A stellar snow crystal of six arms `radius` long in its own plane (arms along +y and every sixty degrees on):
    its heart a faceted hexagon, each arm a ridged needle, and on each arm `branches` pairs of side branches at sixty
    degrees, longest nearest the heart (`reach` of the arm left past them); with `twigs`, each branch carries that many
    twigs of its own toward the tip, a fern's way.
    The six arms are alike, as a crystal grows in one weather."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    spots = list(np.linspace(0.36, 0.76, branches) + rng.uniform(-0.03, 0.03, branches)) if branches > 1 else [0.5]
    parts = [_plate(radius * heart, radius * 0.05, turn=30.0)]
    width = radius * arm_width
    for arm in range(6):
        angle = math.radians(90 + 60 * arm)
        direction = np.array([math.cos(angle), math.sin(angle)])
        parts.append(_ridge((0.0, 0.0), tuple(direction * radius), width, width * 0.6, width * 0.8))
        for share in spots:
            root = direction * radius * share
            length = radius * (0.9 - share) * reach
            for side in (-1, 1):
                branch_angle = angle + side * math.radians(60)
                way = np.array([math.cos(branch_angle), math.sin(branch_angle)])
                parts.append(_ridge(tuple(root), tuple(root + way * length), width * 0.62, width * 0.4,
                                    width * 0.5))
                for twig in range(twigs):
                    at = root + way * length * (0.35 + 0.3 * twig)
                    for twig_side in (-1, 1):
                        twig_angle = branch_angle + twig_side * math.radians(60)
                        # only the twig toward the arm's tip: the other would cross the arm
                        if twig_side == side:
                            continue
                        twig_way = np.array([math.cos(twig_angle), math.sin(twig_angle)])
                        parts.append(_ridge(tuple(at), tuple(at + twig_way * length * 0.34), width * 0.42,
                                            width * 0.28, width * 0.3))
    return shapes.joined(*parts)


def _snow():
    """Ice: smooth and bright; it gives back a share of its light, as snow lit through does, so its shade stays pale
    and its edge is never sunk dark."""
    return Mat('pt-snow', rough=0.22, spec=0.85, glow=0.06)


@model
def windfallSnowflake(item, words, seed):
    """Windfall's snowflake: a six-armed snow crystal seen face on - a faceted hexagonal heart, six ridged arms each
    with a pair of side branches - drawn bold, each arm about a texel and a half across at sixteen texels."""
    verts, faces = _crystal(0.004, 1, arm_width=0.13, heart=0.3, reach=1.0, seed=seed)
    item.add((_to_eye(verts), faces), _snow(), smooth=False)


@model
def pixelSnowflake(item, words, seed):
    """Dynamic Skies' pixel snow flake: a stellar crystal seen face on - a faceted hexagonal heart, six ridged arms,
    three pairs of side branches an arm, the inner ones feathered with twigs - and a glint at its heart."""
    verts, faces = _crystal(0.004, 3, twigs=1, arm_width=0.085, heart=0.24, reach=0.68, seed=seed)
    item.add((_to_eye(verts), faces), _snow(), smooth=False)
    item.sparkle((0.0, -0.001, 0.0), ramp='pt-snow', arm=3)


# --- the splash ---

SPLASH_STRETCH = 52 / 41   # the picture is 52 x 41 and the wake draws it on a square: built this much wider, it is round


def _spray():
    """Spray: water lit through, smooth and bright, giving back a share of its light so it glows white-blue."""
    return Mat('pt-spray', rough=0.12, spec=0.9, glow=0.34)


@model
def wakeSplash(item, words, seed):
    """Come Sail Away's wake splash seen from straight above, as it lies on the water: a crown of spray risen round
    the point of impact, its rim torn into jets that throw droplets outward, a ring of churned foam at its foot, a
    jet in the middle with a drop at its head, and droplets flung wide. Glows white-blue. Built round and then
    stretched across, so the wake's square quad draws it round."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    radius = 0.25
    spray, foam = _spray(), Mat('pt-foam', rough=0.7, spec=0.3, glow=0.2, bump=(0.5, 160.0))
    parts_spray, parts_foam = [], []
    # the foam ring at the water: a low lumpy torus
    ring = shapes.wobble(shapes.moved(shapes.torus(radius * 0.6, radius * 0.15, steps=48, around=10),
                                      scale=(1.0, 1.0, 0.35)), seed, 0.12, scale=2.5)
    parts_foam.append(ring)
    # the crown: a wall of water flaring outward as it rises, its rim scalloped into jets
    jets = 13
    wall = []
    for step in range(5):
        t = step / 4
        wall.append((radius * (0.5 + 0.14 * t * t), radius * 0.42 * t))
    sides = jets * 6
    verts, faces = shapes.lathe([(r, z) for r, z in reversed(wall)], sides)
    verts = np.asarray(verts)
    angle = np.arctan2(verts[:, 1], verts[:, 0])
    rise = verts[:, 2] / (radius * 0.42)
    scallop = 0.55 + 0.45 * np.abs(np.cos(angle * jets / 2)) ** 3
    verts[:, 2] *= 1 - (1 - scallop) * rise ** 2
    parts_spray.append(shapes.joined((verts, faces), (verts * [0.93, 0.93, 0.98], [f[::-1] for f in faces])))
    # each jet: a tapering spout from the rim's peak out and up, a drop at its tip
    for jet in range(jets):
        theta = 2 * math.pi * jet / jets + rng.uniform(-0.08, 0.08)
        out = np.array([math.cos(theta), math.sin(theta), 0.0])
        root = out * radius * 0.63 + [0.0, 0.0, radius * 0.4]
        length = radius * rng.uniform(0.18, 0.3)
        tip = root + out * length * 0.85 + [0.0, 0.0, length * 0.5]
        parts_spray.append(shapes.tube([tuple(root), tuple((root + tip) / 2 + [0, 0, length * 0.08]), tuple(tip)],
                                       radius * 0.035, sides=6, radius_end=radius * 0.018))
        drop = rng.uniform(0.045, 0.06) * radius
        parts_spray.append(shapes.ellipsoid((drop, drop, drop * 1.2), centre=tuple(tip + out * drop * 1.4),
                                            rings=5, sides=8))
    # the middle jet and the drop at its head
    parts_spray.append(shapes.lathe([(radius * 0.02, radius * 0.5), (radius * 0.05, radius * 0.25),
                                     (radius * 0.12, 0.0)], 10, top=True))
    parts_spray.append(shapes.ellipsoid((radius * 0.07,) * 3, centre=(0.0, 0.0, radius * 0.56), rings=6, sides=10))
    # droplets flung wide, beyond the crown
    for _ in range(18):
        theta = rng.uniform(0, 2 * math.pi)
        reach = radius * rng.uniform(0.8, 0.98)
        drop = radius * rng.uniform(0.05, 0.07)
        parts_spray.append(shapes.ellipsoid((drop,) * 3, centre=(reach * math.cos(theta), reach * math.sin(theta),
                                                                 radius * rng.uniform(0.05, 0.3)), rings=5, sides=8))
    stretch = (SPLASH_STRETCH, 1.0, 1.0)
    _bounds(item, radius * 1.08 * SPLASH_STRETCH, radius * 1.08, level=False)
    item.add(shapes.moved(shapes.joined(*parts_foam), scale=stretch), foam)
    item.add(shapes.moved(shapes.joined(*parts_spray), scale=stretch), spray)
