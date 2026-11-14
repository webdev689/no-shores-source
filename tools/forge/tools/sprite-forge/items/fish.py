"""Iliac Puddle No More's seven fish, seen side-on as they swim (src/systems/deepWater/deepWatersFishItems.js): each a
body of its own anatomy - its outline, its girth, its fins and its tail - with its markings, its gill cover, its mouth
and its eye. One picture is both the fish's billboard in the sea and its item's icon, so each is set in the canvas of
its billboard's shape (tools/sprite-forge/specs/pictures/fish.json), facing left, seen from level.

Any colour here can reach the outline, where the sea's edge-cleaner clears a near-black texel joined to the clear
ground (src/world/underwater/underwaterDecorations.js clearEdgeBlackPixels), and the kit sinks the outline's lower
right to its ramp's darkest. So each ramp's darkest step is lifted far enough that even sunk it stays clear of that
black (a channel of 64 or more), and the cleaner finds nothing to take."""
import math

import numpy as np

from . import kit, shapes
from .kit import Mat
from .models import model

# the fishes' own ramps, darkest first: the painted fish's hues, their darks lifted clear of the edge-cleaner's black
FISH_RAMPS = {
    'fishYellow': [[112, 74, 10], [150, 104, 14], [190, 140, 22], [222, 178, 36], [242, 208, 70], [252, 234, 140]],
    'fishInk': [[64, 60, 74], [64, 60, 74], [66, 62, 77], [70, 66, 82], [78, 74, 92]],
    'fishPearl': [[96, 98, 108], [140, 142, 152], [180, 182, 190], [214, 216, 222], [238, 238, 242], [252, 252, 252]],
    'fishVeil': [[112, 112, 104], [148, 146, 132], [182, 180, 164], [210, 208, 192], [234, 232, 220]],
    'fishSlate': [[80, 92, 116], [100, 114, 140], [124, 138, 164], [152, 166, 188]],
    'fishOlive': [[66, 74, 36], [86, 96, 46], [108, 120, 56], [132, 144, 70], [158, 168, 88], [184, 192, 116]],
    'fishMoss': [[58, 64, 34], [72, 80, 40], [90, 98, 50], [110, 118, 62]],
    'fishCream': [[112, 98, 68], [148, 132, 94], [182, 166, 122], [210, 196, 152], [232, 222, 184]],
    'fishRust': [[118, 40, 18], [156, 56, 24], [194, 78, 32], [222, 108, 46], [242, 142, 72]],
    'fishEmber': [[136, 54, 20], [178, 80, 28], [214, 110, 40], [238, 142, 58], [250, 178, 92]],
    'fishCanary': [[152, 98, 24], [198, 138, 36], [230, 176, 56], [246, 206, 92], [252, 230, 142]],
    'fishBronze': [[96, 64, 28], [124, 88, 38], [152, 112, 50], [180, 140, 66], [204, 168, 92], [226, 198, 126]],
    'fishGold': [[132, 98, 32], [174, 134, 46], [206, 168, 68], [230, 198, 98], [246, 224, 142]],
    'fishSea': [[56, 76, 88], [72, 98, 112], [92, 124, 138], [116, 150, 162], [148, 178, 188]],
    'fishSheen': [[104, 110, 120], [146, 152, 160], [186, 190, 196], [218, 220, 224], [242, 242, 246]],
    'fishGrey': [[80, 82, 86], [104, 106, 110], [130, 132, 136], [156, 158, 160], [182, 182, 184], [208, 208, 208]],
    'fishBlotch': [[78, 74, 72], [98, 94, 90], [120, 116, 110], [144, 138, 132]],
    'fishMouth': [[76, 34, 32], [98, 48, 42], [122, 64, 54], [146, 84, 70]],
}
for _name, _steps in FISH_RAMPS.items():
    if _name in kit.RAMPS and not np.array_equal(kit.RAMPS[_name], _steps):
        raise ValueError(f'fish: the ramp "{_name}" is another\'s')
    kit.RAMPS[_name] = np.asarray(_steps, dtype=np.float64)


# --- a smooth outline through a species' stations ---

def _pchip(xs, ys):
    """A smooth curve through (xs, ys) that never overshoots between them (a monotone cubic): a fish's outline bends
    where its stations say and nowhere else."""
    xs, ys = np.asarray(xs, dtype=np.float64), np.asarray(ys, dtype=np.float64)
    gaps = np.diff(xs)
    slopes = np.diff(ys) / gaps
    tangents = np.zeros_like(ys)
    tangents[0], tangents[-1] = slopes[0], slopes[-1]
    for i in range(1, len(xs) - 1):
        if slopes[i - 1] * slopes[i] > 0:
            ahead, behind = 2 * gaps[i] + gaps[i - 1], gaps[i] + 2 * gaps[i - 1]
            tangents[i] = (ahead + behind) / (ahead / slopes[i - 1] + behind / slopes[i])

    def at(x):
        x = float(np.clip(x, xs[0], xs[-1]))
        i = int(np.clip(np.searchsorted(xs, x) - 1, 0, len(xs) - 2))
        gap = gaps[i]
        share = (x - xs[i]) / gap
        cube, square = share ** 3, share ** 2
        return float((2 * cube - 3 * square + 1) * ys[i] + (cube - 2 * square + share) * gap * tangents[i]
                     + (-2 * cube + 3 * square) * ys[i + 1] + (cube - square) * gap * tangents[i + 1])
    return at


class _Body:
    """A fish's body along +x, its snout at x 0 and the wrist of its tail at `length`, its flank to the eye (-y).
    `stations` [(along, top, bottom, half width), ...] give its outline and girth at the share `along` of its length,
    each a share of its length. `keel` sharpens its back and belly (over 1), `flank` flattens its sides (under 1)."""

    def __init__(self, length, stations, keel=1.0, flank=0.85):
        self.length, self.keel, self.flank = length, keel, flank
        ts = [s[0] for s in stations]
        self._top = _pchip(ts, [s[1] * length for s in stations])
        self._bottom = _pchip(ts, [s[2] * length for s in stations])
        self._width = _pchip(ts, [s[3] * length for s in stations])

    def top(self, along):
        return self._top(along)

    def bottom(self, along):
        return self._bottom(along)

    def mid(self, along):
        return (self._top(along) + self._bottom(along)) / 2

    def surface(self, along, angle, out=0.0):
        """The skin at the share `along` along and `angle` round (0 the back, a half turn the belly, the eye's flank
        between), pushed `out` beyond it."""
        half = (self._top(along) - self._bottom(along)) / 2
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        z = self.mid(along) + (half + out) * math.copysign(abs(cos_a) ** self.keel, cos_a)
        y = -(self._width(along) + out) * math.copysign(abs(sin_a) ** self.flank, sin_a)
        return (along * self.length, y, z)

    def at_height(self, along, z, out=0.0):
        """The skin on the eye's flank at the share `along` along and the height `z`."""
        half = (self._top(along) - self._bottom(along)) / 2
        v = max(-1.0, min(1.0, (z - self.mid(along)) / max(half, 1e-9)))
        cos_a = math.copysign(abs(v) ** (1 / self.keel), v)
        return self.surface(along, math.acos(max(-1.0, min(1.0, cos_a))), out)

    def mesh(self, rings=48, sides=40):
        """The body's skin: rings closer at the snout and the tail, a fan closing each end. Gives (verts, faces) and
        each face's middle (x, z, share along, angle round) for the parts to sort its faces by."""
        verts, faces, middles = [], [], []
        ts = [0.5 - 0.5 * math.cos(math.pi * i / (rings - 1)) for i in range(rings)]
        angles = [2 * math.pi * k / sides for k in range(sides)]
        for along in ts:
            for a in angles:
                verts.append(self.surface(along, a))
        snout = len(verts)
        verts.append((-self.length * 0.004, 0.0, self.mid(0.0)))
        tail = len(verts)
        verts.append((self.length * 1.002, 0.0, self.mid(1.0)))
        for i in range(rings - 1):
            for k in range(sides):
                k1 = (k + 1) % sides
                face = (i * sides + k, i * sides + k1, (i + 1) * sides + k1, (i + 1) * sides + k)
                faces.append(face)
                middles.append(((ts[i] + ts[i + 1]) / 2, angles[k] + math.pi / sides))
        last = (rings - 1) * sides
        for k in range(sides):
            k1 = (k + 1) % sides
            faces.append((snout, k1, k))
            middles.append((0.0, angles[k] + math.pi / sides))
            faces.append((tail, last + k, last + k1))
            middles.append((1.0, angles[k] + math.pi / sides))
        out = []
        for (along, a), face in zip(middles, faces):
            xs = [verts[v][0] for v in face]
            zs = [verts[v][2] for v in face]
            out.append((sum(xs) / len(xs), sum(zs) / len(zs), along, a % (2 * math.pi)))
        return verts, faces, out


def _sorted_parts(verts, faces, middles, sort):
    """The body's faces sorted into parts by `sort(x, z, along, angle)` (a part's name per face): one mesh a part, on
    the one set of points, so the parts meet without a seam."""
    parts = {}
    for face, middle in zip(faces, middles):
        parts.setdefault(sort(*middle), []).append(face)
    return {name: (verts, part) for name, part in parts.items()}


# --- fins ---

def _membrane(base, edge, steps=4, pleat=0.0, y=0.0, margin=0, lean=None):
    """A fin's membrane: a ray from each point of `base` [(x, z), ...] (on the body) to the same point of `edge` (its
    free edge), alternate rays pleated `pleat` toward and away from the eye, growing from nothing at the base, so each
    fold catches the light its own way, as a fin's rays do. Its outermost `margin` steps come back apart (a fin's pale
    or dark edge). `lean(x, z)` bends it toward the eye where given. Gives (membrane, margin) meshes."""
    n = len(base)
    verts = []
    for i in range(n):
        side = 0.0 if i in (0, n - 1) else (1.0 if i % 2 else -1.0)
        for k in range(steps + 1):
            share = k / steps
            x = base[i][0] + (edge[i][0] - base[i][0]) * share
            z = base[i][1] + (edge[i][1] - base[i][1]) * share
            offset = y - pleat * side * share ** 0.7
            if lean:
                offset += lean(x, z)
            verts.append((x, offset, z))
    inner, outer = [], []
    for i in range(n - 1):
        for k in range(steps):
            face = (i * (steps + 1) + k, (i + 1) * (steps + 1) + k, (i + 1) * (steps + 1) + k + 1,
                    i * (steps + 1) + k + 1)
            (outer if k >= steps - margin else inner).append(face)
    return (verts, inner), (verts, outer)


def _spread(points, count):
    """`count` points spaced evenly along the polyline `points` [(x, z), ...]."""
    pts = np.asarray(points, dtype=np.float64)
    lengths = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    run = np.concatenate([[0.0], np.cumsum(lengths)])
    out = []
    for share in np.linspace(0.0, run[-1], count):
        i = int(np.clip(np.searchsorted(run, share) - 1, 0, len(lengths) - 1))
        part = (share - run[i]) / max(lengths[i], 1e-12)
        out.append(tuple(pts[i] + (pts[i + 1] - pts[i]) * part))
    return out


def _smooth_edge(points, count):
    """`count` points along a smooth curve through `points` [(x, z), ...] (a fin's rounded edge)."""
    pts = np.asarray(points, dtype=np.float64)
    run = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    run /= run[-1]
    along_x, along_z = _pchip(run, pts[:, 0]), _pchip(run, pts[:, 1])
    return [(along_x(share), along_z(share)) for share in np.linspace(0.0, 1.0, count)]


def _fin(item, mat, base, edge, rays, steps=4, pleat=0.0, y=0.0, margin_mat=None, margin=1, smooth=True, lean=None):
    """A fin: `rays` rays from along `base` to along `edge` (both polylines, (x, z)), its membrane `mat`, its edge
    `margin_mat` if given."""
    base_pts = _spread(base, rays)
    edge_pts = _smooth_edge(edge, rays) if smooth else _spread(edge, rays)
    inner, outer = _membrane(base_pts, edge_pts, steps, pleat, y, margin if margin_mat else 0, lean)
    item.add(inner, mat, smooth=False)
    if margin_mat and outer[1]:
        item.add(outer, margin_mat, smooth=False)


def _flank_fin(item, mat, body, root_t, root_z, edge, rays=7, steps=3, pleat=0.0, rise=0.0, margin_mat=None):
    """A paired fin lying back along the flank (a pectoral, a pelvic): its root on the skin at `root_t`, `root_z`,
    `edge` [(x, z), ...] its free edge, held just before the skin and lifted `rise` from it toward its tip."""
    root = body.at_height(root_t, root_z)
    base = [(root[0], root[2] + body.length * 0.012), (root[0] - body.length * 0.004, root[2] - body.length * 0.012)]
    reach = max(abs(p[0] - root[0]) for p in edge) or 1.0

    def lean(x, z):
        return -rise * min(1.0, abs(x - root[0]) / reach)
    _fin(item, mat, base, edge, rays, steps, pleat, root[1] - body.length * 0.006, margin_mat, lean=lean)


def _ridge_fin(item, mat, body, span, edge, rays, side=1, steps=6, pleat=0.0, margin_mat=None, smooth=True,
               inset=0.012):
    """A fin along the back (`side` 1) or the belly (-1): its base on the skin over `span` (from, to: shares along),
    its free edge [(along, height), ...] each a share of the body's length beyond the skin there."""
    length = body.length
    rim = body.top if side > 0 else body.bottom
    base = [(along * length, rim(along) - side * inset * length) for along in np.linspace(span[0], span[1], 8)]
    tips = [(along * length, rim(min(along, 1.0)) + side * height * length) for along, height in edge]
    _fin(item, mat, base, tips, rays, steps, pleat, 0.0, margin_mat, smooth=smooth)


def _tail(item, mat, body, edge, rays=13, steps=6, pleat=0.0, margin_mat=None, smooth=True, reach=0.04):
    """The tail fin: rays from the wrist of the tail (its last `reach` of the body) to `edge` [(along, height), ...],
    each a share of the body's length."""
    length = body.length
    along = 1.0 - reach
    half = (body.top(along) - body.bottom(along)) / 2 * 0.85
    wrist = [(along * length, body.mid(along) + half), (along * length, body.mid(along) - half)]
    tips = [(at * length, height * length) for at, height in edge]
    _fin(item, mat, wrist, tips, rays, steps, pleat, 0.0, margin_mat, smooth=smooth)


def _spines(span, count, high, low):
    """A spiny fin's notched edge: `count` spines over `span` (from, to: shares along), each `high` (a share; a list
    rises and falls along it) with the membrane between dipping to `low` of its spines."""
    t0, t1 = span
    out = []
    for i in range(count):
        along = t0 + (t1 - t0) * i / (count - 1)
        height = high
        if isinstance(high, (list, tuple)):
            height = float(np.interp(i / (count - 1), np.linspace(0, 1, len(high)), high))
        out.append((along, height))
        if i < count - 1:
            out.append((along + (t1 - t0) / (count - 1) * 0.55, height * low))
    return out


# --- the head ---

def _eye(item, body, along, z, radius, iris, glint=True):
    """An eye on the flank at the share `along` along and height `z`: a domed iris of `iris`, a pupil before it, a glint
    at its upper left."""
    x, y, _ = body.at_height(along, z)
    item.add(shapes.ellipsoid((radius, radius * 0.55, radius), (x, y - radius * 0.05, z), rings=8, sides=14),
             Mat(iris, rough=0.3, spec=0.7))
    pupil = radius * 0.62
    front = (x + radius * 0.08, y - radius * 0.42, z)
    item.add(shapes.ellipsoid((pupil, pupil * 0.6, pupil), front, rings=8, sides=14),
             Mat('black', rough=0.2, spec=0.9))
    if glint:
        item.sparkle((front[0] - pupil * 0.45, front[1] - pupil, front[2] + pupil * 0.45), 'diamond', arm=0)


def _skin_line(item, mat, body, points, radius, out=0.0):
    """A line laid on the skin along `points` [(along, z), ...]: a gill cover's edge, a mouth, a lateral line."""
    path = [body.at_height(along, z, out) for along, z in points]
    item.add(shapes.tube(path, radius, sides=6), mat)


def _mouth(item, body, points, gape, radius, jaw=None, jaw_radius=0.0, reach=0.0):
    """A mouth along `points` [(along, z), ...] from its front: its gape a dark line of `gape`; and, given `jaw` (a
    Mat), the lower jaw as a lip under it, thrust `reach` metres ahead of the snout (a bass's, a grouper's)."""
    _skin_line(item, Mat(gape, rough=0.6), body, points, radius, out=radius * 0.25)
    if jaw is None:
        return
    lip = [body.at_height(along, z - radius * 1.6, jaw_radius * 0.2) for along, z in points]
    front = lip[0]
    lip = [(front[0] - reach, front[1] * 0.6, front[2] + radius * 0.4)] + lip
    item.add(shapes.tube(lip, jaw_radius, sides=8, radius_end=jaw_radius * 0.45), jaw)


# --- shader masks: a pattern's `mask(nodes, links, coord)` over the part's coordinates (metres) ---

def _math(nodes, links, operation, *inputs):
    node = nodes.new('ShaderNodeMath')
    node.operation = operation
    for socket, value in zip(node.inputs, inputs):
        if isinstance(value, (int, float)):
            socket.default_value = value
        else:
            links.new(value, socket)
    return node.outputs['Value']


def _xz(nodes, links, coord):
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(coord, sep.inputs['Vector'])
    return sep.outputs['X'], sep.outputs['Z']


def _either(nodes, links, masks):
    out = masks[0]
    for mask in masks[1:]:
        out = _math(nodes, links, 'MAXIMUM', out, mask)
    return out


def _spots(centres, radius):
    """Round spots of `radius` about each of `centres` [(x, z), ...], seen side-on."""
    def mask(nodes, links, coord):
        x, z = _xz(nodes, links, coord)
        found = []
        for cx, cz in centres:
            dx = _math(nodes, links, 'SUBTRACT', x, cx)
            dz = _math(nodes, links, 'SUBTRACT', z, cz)
            reach = _math(nodes, links, 'ADD', _math(nodes, links, 'MULTIPLY', dx, dx),
                          _math(nodes, links, 'MULTIPLY', dz, dz))
            found.append(_math(nodes, links, 'LESS_THAN', reach, radius * radius))
        return _either(nodes, links, found)
    return mask


def _bands(bands):
    """Upright bands, each (x at z 0, its slant: x moved a metre of rise, half its width): an angelfish's bars."""
    def mask(nodes, links, coord):
        x, z = _xz(nodes, links, coord)
        found = []
        for at, slant, half in bands:
            along = _math(nodes, links, 'SUBTRACT', _math(nodes, links, 'SUBTRACT', x,
                                                          _math(nodes, links, 'MULTIPLY', z, slant)), at)
            found.append(_math(nodes, links, 'LESS_THAN', _math(nodes, links, 'ABSOLUTE', along), half))
        return _either(nodes, links, found)
    return mask


def _scales(size, rim, angle=40.0, rows=None):
    """Scales seen side-on, in oblique rows as a fish's lie: a lattice of diamonds `size` across, each darker along
    its two back (right) edges by `rim` of its width, where it overlaps the next toward the tail; `rows` (z low,
    z high) keeps them between two heights."""
    rad = math.radians(angle)

    def mask(nodes, links, coord):
        x, z = _xz(nodes, links, coord)
        across = _math(nodes, links, 'MULTIPLY', x, math.cos(rad) / size)
        rise = _math(nodes, links, 'MULTIPLY', z, math.sin(rad) / size)
        up = _math(nodes, links, 'FRACT', _math(nodes, links, 'ADD', across, rise))
        down = _math(nodes, links, 'FRACT', _math(nodes, links, 'SUBTRACT', across, rise))
        edge = _math(nodes, links, 'GREATER_THAN', _math(nodes, links, 'MAXIMUM', up, down), 1.0 - rim)
        if rows:
            low, high = rows
            edge = _math(nodes, links, 'MULTIPLY', edge, _math(nodes, links, 'MULTIPLY',
                                                                _math(nodes, links, 'GREATER_THAN', z, low),
                                                                _math(nodes, links, 'LESS_THAN', z, high)))
        return edge
    return mask


def _line_z(nodes, links, x, points):
    """The height of the polyline `points` [(x, z), ...] over `x`, straight on past its ends."""
    line = None
    for (x0, z0), (x1, z1) in zip(points, points[1:]):
        slope = (z1 - z0) / (x1 - x0)
        run = _math(nodes, links, 'SUBTRACT', x, x0)
        segment = _math(nodes, links, 'ADD', _math(nodes, links, 'MULTIPLY', run, slope), z0)
        if line is None:
            line = segment
        else:
            past = _math(nodes, links, 'GREATER_THAN', x, x0)
            before = _math(nodes, links, 'MULTIPLY', line, _math(nodes, links, 'SUBTRACT', 1.0, past))
            line = _math(nodes, links, 'ADD', before, _math(nodes, links, 'MULTIPLY', segment, past))
    return line


def _stripe(points, half, wobble=0.0, scale=1.0, seed=0, span=None):
    """A stripe `half` either side of the polyline `points` [(x, z), ...], its edges broken by a noise `wobble`
    metres deep and `scale` cycles a metre (a bass's blotched band); `span` (x, x) its ends."""
    def mask(nodes, links, coord):
        x, z = _xz(nodes, links, coord)
        if wobble:
            noise = nodes.new('ShaderNodeTexNoise')
            noise.noise_dimensions = '4D'
            noise.inputs['Scale'].default_value = scale
            noise.inputs['Detail'].default_value = 1.0
            noise.inputs['W'].default_value = (seed % 997) * 0.41
            links.new(coord, noise.inputs['Vector'])
            # a noise's value strays little from its middle: spread to reach `wobble` either way
            stray = _math(nodes, links, 'SUBTRACT', noise.outputs['Fac'], 0.5)
            z = _math(nodes, links, 'ADD', z, _math(nodes, links, 'MULTIPLY', stray, wobble * 6))
        off = _math(nodes, links, 'ABSOLUTE', _math(nodes, links, 'SUBTRACT', z, _line_z(nodes, links, x, points)))
        found = _math(nodes, links, 'LESS_THAN', off, half)
        if span:
            found = _math(nodes, links, 'MULTIPLY', found, _math(nodes, links, 'MULTIPLY',
                                                                  _math(nodes, links, 'GREATER_THAN', x, span[0]),
                                                                  _math(nodes, links, 'LESS_THAN', x, span[1])))
        return found
    return mask


def _wavy_bars(period, slant, wave, duty, above):
    """Dark wavy bars across the back, above the polyline `above` [(x, z), ...]: `period` metres apart, leaning back
    `slant` (x a metre of rise), waving `wave` of a period, `duty` of each period dark (a mackerel's)."""
    def mask(nodes, links, coord):
        x, z = _xz(nodes, links, coord)
        lean = _math(nodes, links, 'ADD', x, _math(nodes, links, 'MULTIPLY', z, slant))
        swing = _math(nodes, links, 'SINE', _math(nodes, links, 'MULTIPLY', z, 2 * math.pi / period * 1.6))
        bend = _math(nodes, links, 'MULTIPLY', swing, wave * period)
        phase = _math(nodes, links, 'FRACT', _math(nodes, links, 'DIVIDE', _math(nodes, links, 'ADD', lean, bend),
                                                   period))
        bar = _math(nodes, links, 'LESS_THAN', phase, duty)
        high = _math(nodes, links, 'GREATER_THAN', z, _line_z(nodes, links, x, above))
        return _math(nodes, links, 'MULTIPLY', bar, high)
    return mask


def _mottle(seed, scale, cover):
    """Soft blotches over `cover` of the part, `scale` cycles a metre, seeded: a grouper's mottling."""
    def mask(nodes, links, coord):
        noise = nodes.new('ShaderNodeTexNoise')
        noise.noise_dimensions = '4D'
        noise.inputs['Scale'].default_value = scale
        noise.inputs['Detail'].default_value = 1.5
        noise.inputs['W'].default_value = (seed % 997) * 0.37
        links.new(coord, noise.inputs['Vector'])
        return _math(nodes, links, 'GREATER_THAN', noise.outputs['Fac'], 0.5 + 0.22 * (0.5 - cover) / 0.5)
    return mask


def _any(masks):
    """Where any one of `masks` shows."""
    def mask(nodes, links, coord):
        return _either(nodes, links, [m(nodes, links, coord) for m in masks])
    return mask


def _by_angle(back, belly, head=None):
    """A sort for the body's faces by how far round the body they lie: 'back' within `back` of a half turn from the
    spine, 'belly' past `belly`, 'flank' between; and 'head' forward of the share `head` along, where given."""
    def sort(x, z, along, angle):
        round_from_spine = (angle if angle <= math.pi else 2 * math.pi - angle) / math.pi
        if head is not None and along < head:
            return 'head'
        if round_from_spine < back:
            return 'back'
        return 'belly' if round_from_spine > belly else 'flank'
    return sort


def _polyline_z(points, x):
    """The height of the polyline `points` [(x, z), ...] at `x`, its last height past its end."""
    for (x0, z0), (x1, z1) in zip(points, points[1:]):
        if x <= x1:
            return z0 + (z1 - z0) * (x - x0) / (x1 - x0)
    return points[-1][1]


# --- the seven ---

@model
def butterflyfish(item, words, seed):
    """The Gold Butterflyfish: a longnose butterflyfish, a tall yellow disc with a long thin snout, the top of its
    head black from its spines to its snout, the lower head and chest white, its spiny and soft fins yellow edged in
    slate, a black eyespot on its anal fin under the tail, its tail clear (its pectorals are clear too, and show
    nothing over the body). No words."""
    size = 0.17
    body = _Body(size, [
        (0.0, 0.022, -0.02, 0.013), (0.12, 0.025, -0.023, 0.015), (0.24, 0.03, -0.028, 0.019),
        (0.30, 0.075, -0.05, 0.030), (0.36, 0.165, -0.12, 0.048), (0.44, 0.245, -0.205, 0.062),
        (0.55, 0.285, -0.25, 0.068), (0.68, 0.255, -0.235, 0.062), (0.80, 0.185, -0.17, 0.05),
        (0.90, 0.095, -0.088, 0.034), (1.0, 0.066, -0.06, 0.026)], keel=1.15, flank=0.7)
    eye_at, eye_z, eye_r = 0.315, 0.028 * size, 0.034 * size
    dorsal_at = 0.40
    # the head: black above a line from the snout's middle through the eye, white below it, back to the gill
    # (from the first spine down to behind the pelvic fin); the rest gold
    eye_line = [(0.0, body.mid(0.0)), (eye_at * size, eye_z), (0.42 * size, eye_z - eye_r * 0.4)]

    def gill_x(z):
        top, bottom = body.top(dorsal_at), body.bottom(0.47)
        return dorsal_at * size + (top - z) / (top - bottom) * 0.07 * size

    def region(x, z, along, angle):
        if x >= gill_x(z):
            return 'gold'
        return 'mask' if z > _polyline_z(eye_line, x) else 'chest'
    verts, faces, middles = body.mesh(rings=56, sides=40)
    parts = _sorted_parts(verts, faces, middles, region)
    gold = Mat('fishYellow', rough=0.45, spec=0.45, pattern=('fishYellow', _scales(0.0095, 0.3), 0.88))
    item.add(parts['gold'], gold)
    item.add(parts['mask'], Mat('fishInk', rough=0.4, spec=0.5))
    item.add(parts['chest'], Mat('fishPearl', rough=0.35, spec=0.6))
    fin_gold = Mat('fishYellow', rough=0.55, spec=0.3, dim=0.92)
    rim = Mat('fishSlate', rough=0.5)
    # the dorsal fin: tall spines over the back, then the rounded soft fin running back over the tail's wrist
    spine_back = [(along * size, body.top(along) - 0.012 * size) for along in np.linspace(dorsal_at, 0.94, 14)]
    dorsal_edge = [(0.40 * size, body.top(0.40) + 0.02 * size), (0.46 * size, body.top(0.46) + 0.12 * size),
                   (0.58 * size, body.top(0.58) + 0.135 * size), (0.72 * size, body.top(0.72) + 0.135 * size),
                   (0.86 * size, body.top(0.86) + 0.11 * size), (0.97 * size, body.top(0.97) + 0.04 * size),
                   (0.95 * size, body.top(0.95) - 0.01 * size)]
    _fin(item, fin_gold, spine_back, dorsal_edge, rays=21, steps=8, pleat=0.006 * size, margin_mat=rim)
    anal_base = [(along * size, body.bottom(along) + 0.012 * size) for along in np.linspace(0.58, 0.94, 10)]
    anal_edge = [(0.58 * size, body.bottom(0.58) - 0.02 * size), (0.66 * size, body.bottom(0.66) - 0.11 * size),
                 (0.80 * size, body.bottom(0.80) - 0.12 * size), (0.93 * size, body.bottom(0.93) - 0.06 * size),
                 (0.95 * size, body.bottom(0.95) + 0.01 * size)]
    spot = (0.86 * size, body.bottom(0.86) - 0.055 * size)
    anal = Mat('fishYellow', rough=0.55, spec=0.3, dim=0.92, pattern=('fishInk', _spots([spot], 0.034 * size)))
    _fin(item, anal, anal_base, anal_edge, rays=15, steps=8, pleat=0.006 * size, margin_mat=rim)
    # the tail: a clear fan, its end squared off
    wrist = [(0.97 * size, body.mid(0.97) + 0.055 * size), (0.97 * size, body.mid(0.97) - 0.05 * size)]
    tail_edge = [(1.06 * size, 0.11 * size), (1.18 * size, 0.15 * size), (1.205 * size, 0.04 * size),
                 (1.205 * size, -0.04 * size), (1.18 * size, -0.14 * size), (1.06 * size, -0.10 * size)]
    _fin(item, Mat('fishVeil', rough=0.5, spec=0.3), wrist, tail_edge, rays=13, steps=6, pleat=0.005 * size)
    # the pelvic fin, yellow, under the chest
    _ridge_fin(item, fin_gold, body, (0.42, 0.49), [(0.42, 0.01), (0.48, 0.06), (0.52, 0.085), (0.52, 0.065),
                                                     (0.49, 0.0)], rays=6, side=-1, steps=5, pleat=0.003 * size)
    # the gill cover's edge, curving down through the white
    _skin_line(item, Mat('fishPearl', rough=0.5, dim=0.72), body,
               [(0.405, eye_z - eye_r * 1.5), (0.42, -0.06 * size), (0.42, -0.12 * size), (0.405, -0.17 * size)],
               0.006 * size, out=0.002 * size)
    _eye(item, body, eye_at, eye_z, eye_r, 'silkWhite')


@model
def largemouthBass(item, words, seed):
    """The Rusttail Bass: a largemouth bass, long and heavy-headed, its wide mouth running back under its eye, olive
    over a paler flank and a cream belly, a dark blotched band along its side from snout to tail, a spiny dorsal fin
    notched from the soft one behind it, and its rust-red tail. No words."""
    size = 0.40
    body = _Body(size, [
        (0.0, 0.034, -0.05, 0.036), (0.05, 0.076, -0.088, 0.062), (0.14, 0.13, -0.124, 0.094),
        (0.28, 0.172, -0.152, 0.112), (0.45, 0.186, -0.16, 0.114), (0.62, 0.158, -0.138, 0.096),
        (0.80, 0.1, -0.09, 0.066), (0.92, 0.064, -0.058, 0.043), (1.0, 0.056, -0.051, 0.037)], keel=1.05, flank=1.0)
    verts, faces, middles = body.mesh(rings=56, sides=40)
    parts = _sorted_parts(verts, faces, middles, _by_angle(0.36, 0.7))
    band_line = [(0.0, body.mid(0.0) + 0.006 * size), (0.12 * size, 0.044 * size), (0.3 * size, 0.04 * size),
                 (0.7 * size, 0.014 * size), (1.0 * size, body.mid(1.0))]
    # the band blotched broad along the body, narrow through the eye on the head
    band = _any([_stripe(band_line, 0.034 * size, wobble=0.02 * size, scale=9.0 / size, seed=seed,
                         span=(0.25 * size, 1.02 * size)),
                 _stripe(band_line, 0.016 * size, wobble=0.006 * size, scale=9.0 / size, seed=seed,
                         span=(0.0, 0.26 * size))])
    item.add(parts['back'], Mat('fishOlive', rough=0.45, spec=0.45, dim=0.86, pattern=('fishMoss', band)))
    item.add(parts['flank'], Mat('fishOlive', rough=0.45, spec=0.45, pattern=('fishMoss', band)))
    item.add(parts['belly'], Mat('fishCream', rough=0.4, spec=0.5,
                                 pattern=('fishCream', _scales(0.04 * size, 0.3), 0.9)))
    olive_fin = Mat('fishOlive', rough=0.55, spec=0.3, dim=0.82)
    rust = Mat('fishRust', rough=0.5, spec=0.35)
    # the spiny dorsal, notched low before the taller soft dorsal; the anal fin under the soft one
    _ridge_fin(item, olive_fin, body, (0.33, 0.59), _spines((0.33, 0.59), 9, [0.05, 0.1, 0.095, 0.07, 0.035], 0.72),
               rays=17, steps=6, pleat=0.005 * size, smooth=False)
    _ridge_fin(item, olive_fin, body, (0.6, 0.86), [(0.6, 0.03), (0.64, 0.1), (0.74, 0.105), (0.84, 0.06), (0.87, 0.0)],
               rays=11, steps=6, pleat=0.005 * size)
    _ridge_fin(item, Mat('fishOlive', rough=0.55, spec=0.3, dim=0.92), body, (0.66, 0.85),
               [(0.66, 0.02), (0.7, 0.085), (0.8, 0.08), (0.86, 0.0)], rays=9, side=-1, steps=6, pleat=0.004 * size)
    # the rust tail, its edge cut shallow in the middle
    _tail(item, rust, body, [(1.02, 0.075), (1.2, 0.155), (1.215, 0.13), (1.17, 0.005), (1.215, -0.125), (1.2, -0.15),
                             (1.02, -0.07)], rays=15, steps=6, pleat=0.006 * size, smooth=False)
    # the pelvic fin under the chest, the pectoral lying back from behind the gill
    _ridge_fin(item, Mat('fishCream', rough=0.5, spec=0.3, dim=0.85), body, (0.31, 0.4),
               [(0.31, 0.01), (0.38, 0.05), (0.43, 0.072), (0.44, 0.055), (0.41, 0.0)], rays=7, side=-1, steps=5,
               pleat=0.003 * size)
    _flank_fin(item, Mat('fishOlive', rough=0.5, spec=0.3, dim=0.95), body, 0.28, -0.035 * size,
               [(0.36 * size, 0.0), (0.42 * size, -0.03 * size), (0.42 * size, -0.055 * size),
                (0.36 * size, -0.07 * size)], rays=6, pleat=0.003 * size, rise=0.012 * size)
    # the gill cover's edge; the wide mouth, its corner under the eye's back, the lower jaw thrust out under it
    _skin_line(item, Mat('fishOlive', rough=0.6, dim=0.62), body,
               _smooth_edge([(0.225, 0.12 * size), (0.262, 0.07 * size), (0.278, 0.0), (0.268, -0.07 * size),
                             (0.235, -0.12 * size)], 9), 0.007 * size, out=0.002 * size)
    _mouth(item, body, [(0.0, -0.006 * size), (0.07, -0.016 * size), (0.14, -0.03 * size), (0.185, -0.04 * size)],
           'fishMouth', 0.011 * size, jaw=Mat('fishCream', rough=0.45, spec=0.45, dim=0.92), jaw_radius=0.016 * size,
           reach=0.012 * size)
    _eye(item, body, 0.115, 0.05 * size, 0.034 * size, 'gold')


@model
def canaryRockfish(item, words, seed):
    """The Ember Rockfish: a canary rockfish, big-headed and big-eyed, ember orange over a canary belly, two red-orange
    stripes running back from its eye and a red-orange line along its side, a deeply notched spiny dorsal before a
    rounded soft one, its fins and squared tail red-orange. No words."""
    size = 0.36
    body = _Body(size, [
        (0.0, 0.03, -0.046, 0.028), (0.06, 0.082, -0.088, 0.054), (0.18, 0.142, -0.13, 0.08),
        (0.35, 0.17, -0.146, 0.092), (0.55, 0.158, -0.134, 0.082), (0.75, 0.104, -0.092, 0.06),
        (0.9, 0.066, -0.06, 0.043), (1.0, 0.058, -0.053, 0.037)], keel=1.05, flank=0.9)
    verts, faces, middles = body.mesh(rings=48, sides=36)
    parts = _sorted_parts(verts, faces, middles, _by_angle(0.5, 0.68))
    eye_at, eye_z, eye_r = 0.12, 0.046 * size, 0.05 * size
    stripes = _any([_stripe([(eye_at * size, eye_z + above), (0.3 * size, eye_z + above * 2.2 + rise)], 0.011 * size,
                            span=(eye_at * size, 0.3 * size))
                    for above, rise in ((0.03 * size, 0.01 * size), (-0.025 * size, -0.03 * size))])
    lateral = _stripe([(0.26 * size, 0.07 * size), (0.6 * size, 0.045 * size), (1.0 * size, body.mid(1.0))],
                      0.017 * size, span=(0.26 * size, 0.98 * size))
    marks = ('fishRust', _any([stripes, lateral]))
    item.add(parts['back'], Mat('fishEmber', rough=0.45, spec=0.45, pattern=marks))
    item.add(parts['flank'], Mat('fishEmber', rough=0.45, spec=0.45, pattern=marks))
    item.add(parts['belly'], Mat('fishCanary', rough=0.4, spec=0.5))
    fin = Mat('fishRust', rough=0.5, spec=0.35)
    _ridge_fin(item, fin, body, (0.26, 0.62), _spines((0.26, 0.62), 10, [0.06, 0.11, 0.1, 0.075, 0.05], 0.55),
               rays=19, steps=5, pleat=0.005 * size, smooth=False)
    _ridge_fin(item, fin, body, (0.63, 0.88), [(0.63, 0.04), (0.68, 0.1), (0.8, 0.095), (0.88, 0.0)], rays=9, steps=5,
               pleat=0.005 * size)
    _ridge_fin(item, fin, body, (0.64, 0.84), [(0.64, 0.03), (0.68, 0.095), (0.78, 0.085), (0.85, 0.0)], rays=7,
               side=-1, steps=5, pleat=0.004 * size)
    _tail(item, fin, body, [(1.02, 0.07), (1.18, 0.14), (1.2, 0.12), (1.18, 0.0), (1.2, -0.12), (1.18, -0.135),
                            (1.02, -0.065)], rays=13, steps=5, pleat=0.006 * size, smooth=False)
    _flank_fin(item, fin, body, 0.27, -0.02 * size,
               [(0.36 * size, 0.02 * size), (0.46 * size, -0.03 * size), (0.45 * size, -0.07 * size),
                (0.36 * size, -0.08 * size)], rays=6, pleat=0.003 * size, rise=0.012 * size)
    _skin_line(item, Mat('fishEmber', rough=0.6, dim=0.6), body,
               [(0.23, 0.11 * size), (0.26, 0.04 * size), (0.26, -0.03 * size), (0.24, -0.09 * size)], 0.008 * size,
               out=0.002 * size)
    _mouth(item, body, [(0.0, -0.01 * size), (0.06, -0.02 * size), (0.11, -0.03 * size)], 'fishMouth', 0.012 * size,
           jaw=Mat('fishCanary', rough=0.45, spec=0.45), jaw_radius=0.016 * size, reach=0.01 * size)
    _eye(item, body, eye_at, eye_z, eye_r, 'fishCanary')


@model
def crucianCarp(item, words, seed):
    """The Bronze Carp: a crucian carp, deep and high-backed behind a small head, bronze above and gold below under
    large scales in their rows, a long dorsal fin over its back, its tail forked, its fins a darker bronze. No
    words."""
    size = 0.26
    body = _Body(size, [
        (0.0, 0.034, -0.032, 0.026), (0.06, 0.082, -0.068, 0.048), (0.15, 0.158, -0.118, 0.076),
        (0.28, 0.254, -0.178, 0.1), (0.42, 0.302, -0.202, 0.108), (0.58, 0.28, -0.19, 0.1),
        (0.75, 0.19, -0.136, 0.074), (0.9, 0.096, -0.08, 0.047), (1.0, 0.078, -0.068, 0.04)], keel=1.1, flank=0.85)
    verts, faces, middles = body.mesh(rings=56, sides=40)
    parts = _sorted_parts(verts, faces, middles, _by_angle(0.52, 0.72, head=0.2))
    scales = _scales(0.11 * size, 0.3)
    item.add(parts['head'], Mat('fishBronze', rough=0.4, spec=0.5))
    item.add(parts['back'], Mat('fishBronze', rough=0.45, spec=0.45, dim=0.96, pattern=('fishBronze', scales, 0.82)))
    item.add(parts['flank'], Mat('fishBronze', rough=0.45, spec=0.45, dim=0.94, pattern=('fishBronze', scales, 0.82)))
    item.add(parts['belly'], Mat('fishGold', rough=0.4, spec=0.5, pattern=('fishGold', scales, 0.86)))
    fin = Mat('fishBronze', rough=0.55, spec=0.3, dim=0.8)
    _ridge_fin(item, fin, body, (0.42, 0.84), [(0.42, 0.04), (0.47, 0.12), (0.6, 0.115), (0.75, 0.09), (0.84, 0.05),
                                              (0.85, 0.0)], rays=17, steps=6, pleat=0.006 * size)
    _ridge_fin(item, fin, body, (0.72, 0.86), [(0.72, 0.03), (0.76, 0.1), (0.84, 0.06), (0.87, 0.0)], rays=7, side=-1,
               steps=6, pleat=0.005 * size)
    _tail(item, fin, body, [(1.02, 0.08), (1.26, 0.22), (1.27, 0.19), (1.16, 0.005), (1.27, -0.18), (1.26, -0.21),
                            (1.02, -0.075)], rays=15, steps=6, pleat=0.007 * size, smooth=False)
    _ridge_fin(item, fin, body, (0.4, 0.5), [(0.4, 0.01), (0.48, 0.07), (0.54, 0.1), (0.55, 0.08), (0.51, 0.0)],
               rays=7, side=-1, steps=5, pleat=0.004 * size)
    _flank_fin(item, Mat('fishBronze', rough=0.5, spec=0.3, dim=0.9), body, 0.2, -0.06 * size,
               [(0.28 * size, -0.04 * size), (0.34 * size, -0.08 * size), (0.32 * size, -0.11 * size),
                (0.26 * size, -0.11 * size)], rays=6, pleat=0.003 * size, rise=0.01 * size)
    _skin_line(item, Mat('fishBronze', rough=0.6, dim=0.6), body,
               [(0.16, 0.11 * size), (0.2, 0.05 * size), (0.205, -0.03 * size), (0.18, -0.09 * size)], 0.009 * size,
               out=0.002 * size)
    _skin_line(item, Mat('fishMouth', rough=0.6), body, [(0.0, 0.0), (0.035, -0.006 * size)], 0.008 * size,
               out=0.002 * size)
    _eye(item, body, 0.085, 0.034 * size, 0.04 * size, 'fishGold')


@model
def mackerel(item, words, seed):
    """The Grey Mackerel: slim and pointed, blue-grey above with dark wavy bars, silver below, two small dorsal fins
    far apart, a row of finlets running to its narrow tail, and its tail forked deep. No words."""
    size = 0.30
    body = _Body(size, [
        (0.0, 0.02, -0.018, 0.014), (0.08, 0.07, -0.062, 0.048), (0.2, 0.13, -0.116, 0.078),
        (0.38, 0.158, -0.138, 0.088), (0.55, 0.145, -0.127, 0.082), (0.75, 0.088, -0.078, 0.058),
        (0.9, 0.037, -0.035, 0.03), (1.0, 0.023, -0.021, 0.021)], keel=1.0, flank=0.95)
    verts, faces, middles = body.mesh(rings=48, sides=32)
    parts = _sorted_parts(verts, faces, middles, _by_angle(0.46, 0.46))
    split = [(0.0, 0.0), (0.4 * size, 0.004 * size), (1.0 * size, body.mid(1.0))]
    bars = _wavy_bars(0.1 * size, 0.5, 0.12, 0.42, [(x, z + 0.012 * size) for x, z in split])
    item.add(parts['back'], Mat('fishSea', rough=0.35, spec=0.6, pattern=('fishInk', bars)))
    # the belly faces down, away from the light, yet a mackerel's belly shines: lifted to read silver
    item.add(parts['belly'], Mat('fishSheen', rough=0.3, spec=0.7, dim=1.25))
    fin = Mat('fishSea', rough=0.5, spec=0.35, dim=0.85)
    _ridge_fin(item, fin, body, (0.32, 0.48), _spines((0.32, 0.48), 5, [0.11, 0.09, 0.05], 0.75), rays=9, steps=4,
               pleat=0.004 * size, smooth=False)
    _ridge_fin(item, fin, body, (0.6, 0.68), [(0.6, 0.02), (0.62, 0.065), (0.68, 0.0)], rays=4, steps=3)
    _ridge_fin(item, fin, body, (0.62, 0.7), [(0.62, 0.02), (0.64, 0.06), (0.7, 0.0)], rays=4, side=-1, steps=3)
    for side in (1, -1):   # the finlets: a row of small points along the back and the belly to the tail
        for along in np.linspace(0.73, 0.93, 5):
            _ridge_fin(item, fin, body, (along, along + 0.035),
                       [(along, 0.003), (along + 0.035, 0.016), (along + 0.04, 0.0)], rays=3, side=side, steps=2,
                       inset=0.004)
    _tail(item, fin, body, [(1.0, 0.025), (1.1, 0.1), (1.18, 0.17), (1.165, 0.125), (1.09, 0.02), (1.09, -0.02),
                            (1.165, -0.12), (1.18, -0.165), (1.1, -0.095), (1.0, -0.023)],
          rays=13, steps=5, pleat=0.004 * size, smooth=False, reach=0.03)
    _flank_fin(item, fin, body, 0.24, 0.0, [(0.3 * size, 0.02 * size), (0.37 * size, 0.0), (0.3 * size, -0.02 * size)],
               rays=4, rise=0.008 * size)
    _skin_line(item, Mat('fishSheen', rough=0.6, dim=0.62), body,
               [(0.19, 0.06 * size), (0.21, 0.01 * size), (0.2, -0.04 * size)], 0.006 * size, out=0.002 * size)
    _eye(item, body, 0.1, 0.014 * size, 0.04 * size, 'fishSheen')


@model
def zebraAngelfish(item, words, seed):
    """The Banded Angelfish: a white zebra angelfish, a round silver-white body under a tall swept dorsal fin and a
    deep anal fin, long trailing threads below its chest, black bars standing across it from its eye to its tail, the
    fins' edges clear. No words."""
    size = 0.1
    body = _Body(size, [
        (0.0, 0.03, -0.022, 0.022), (0.1, 0.12, -0.1, 0.045), (0.25, 0.275, -0.24, 0.072),
        (0.45, 0.355, -0.335, 0.085), (0.65, 0.32, -0.31, 0.078), (0.82, 0.205, -0.195, 0.058),
        (0.93, 0.105, -0.1, 0.04), (1.0, 0.082, -0.08, 0.032)], keel=1.2, flank=0.8)
    verts, faces, middles = body.mesh(rings=48, sides=40)
    bars = _bands([(0.2 * size, -0.15, 0.045 * size), (0.47 * size, -0.12, 0.06 * size),
                   (0.75 * size, -0.08, 0.05 * size), (0.98 * size, 0.0, 0.035 * size),
                   (0.6 * size, -0.1, 0.012 * size)])
    item.add((verts, faces), Mat('fishPearl', rough=0.35, spec=0.6, pattern=('fishInk', bars)))
    veil = Mat('fishPearl', rough=0.5, spec=0.35, dim=0.9, pattern=('fishInk', bars))
    clear = Mat('fishVeil', rough=0.5, spec=0.3)
    # the dorsal fin sweeps up and back to a high point; the anal fin mirrors it below
    _ridge_fin(item, veil, body, (0.38, 1.0), [(0.38, 0.03), (0.5, 0.35), (0.7, 0.75), (0.86, 0.95), (0.94, 0.88),
                                              (0.98, 0.5), (1.0, 0.04)],
               rays=19, steps=9, pleat=0.008 * size, margin_mat=clear)
    _ridge_fin(item, veil, body, (0.36, 1.0), [(0.36, 0.03), (0.48, 0.3), (0.68, 0.7), (0.84, 0.9), (0.92, 0.84),
                                              (0.97, 0.48), (1.0, 0.04)],
               rays=19, side=-1, steps=9, pleat=0.008 * size, margin_mat=clear)
    _tail(item, veil, body, [(1.02, 0.1), (1.3, 0.24), (1.38, 0.27), (1.34, 0.0), (1.38, -0.26), (1.3, -0.23),
                             (1.02, -0.1)], rays=11, steps=6, pleat=0.006 * size, margin_mat=clear, smooth=False)
    # the pelvic threads, long and fine, trailing down and back from under the chest
    for i, (back, low) in enumerate(((0.36, -1.0), (0.42, -0.92))):
        start = (0.3 * size, -0.012 * size - 0.0015 * i, body.bottom(0.3) + 0.03 * size)
        path = [start, (0.33 * size, start[1], body.bottom(0.33) - 0.15 * size),
                (back * size + 0.06 * size, start[1], low * size * 0.6),
                (back * size + 0.12 * size, start[1], low * size)]
        item.add(shapes.tube(path, 0.012 * size, sides=6, radius_end=0.006 * size), clear)
    _flank_fin(item, clear, body, 0.3, -0.02 * size,
               [(0.38 * size, 0.0), (0.46 * size, -0.04 * size), (0.4 * size, -0.07 * size)], rays=5,
               rise=0.01 * size)
    _skin_line(item, Mat('fishPearl', rough=0.6, dim=0.7), body, [(0.0, -0.002 * size), (0.03, -0.006 * size)],
               0.008 * size, out=0.002 * size)
    _eye(item, body, 0.2, 0.06 * size, 0.045 * size, 'fishRust')


@model
def paleGrouper(item, words, seed):
    """The Pale Grouper: a heavy grouper, its broad head and wide mouth thrust forward by its lower jaw, a small high
    eye, pale grey mottled with darker blotches, a long low spiny dorsal before a rounded soft one, broad round fins
    and a rounded tail. Its blotches are seeded by the row."""
    size = 0.8
    body = _Body(size, [
        (0.0, 0.034, -0.074, 0.046), (0.06, 0.11, -0.126, 0.08), (0.18, 0.19, -0.18, 0.114),
        (0.35, 0.24, -0.206, 0.132), (0.5, 0.246, -0.208, 0.132), (0.68, 0.2, -0.172, 0.11),
        (0.85, 0.12, -0.104, 0.074), (1.0, 0.086, -0.075, 0.054)], keel=1.0, flank=0.95)
    verts, faces, middles = body.mesh(rings=56, sides=40)
    parts = _sorted_parts(verts, faces, middles, _by_angle(0.5, 0.74))
    blotches = _mottle(seed, 16.0 / size, 0.4)
    item.add(parts['back'], Mat('fishGrey', rough=0.5, spec=0.4, dim=0.88, pattern=('fishBlotch', blotches)))
    item.add(parts['flank'], Mat('fishGrey', rough=0.5, spec=0.4, dim=0.94, pattern=('fishBlotch', blotches)))
    item.add(parts['belly'], Mat('fishPearl', rough=0.45, spec=0.45, dim=0.92, pattern=('fishGrey', blotches)))
    fin = Mat('fishGrey', rough=0.55, spec=0.3, dim=0.82, pattern=('fishBlotch', _mottle(seed + 1, 14.0 / size, 0.3)))
    _ridge_fin(item, fin, body, (0.3, 0.63), _spines((0.3, 0.63), 11, [0.05, 0.075, 0.07, 0.06], 0.7), rays=21,
               steps=5, pleat=0.004 * size, smooth=False)
    _ridge_fin(item, fin, body, (0.64, 0.9), [(0.64, 0.05), (0.7, 0.1), (0.8, 0.105), (0.89, 0.05), (0.9, 0.0)],
               rays=11, steps=5, pleat=0.005 * size)
    _ridge_fin(item, fin, body, (0.66, 0.86), [(0.66, 0.03), (0.71, 0.09), (0.8, 0.085), (0.87, 0.0)], rays=9, side=-1,
               steps=5, pleat=0.004 * size)
    _tail(item, fin, body, [(1.02, 0.07), (1.12, 0.14), (1.2, 0.12), (1.225, 0.0), (1.2, -0.115), (1.12, -0.135),
                            (1.02, -0.065)], rays=13, steps=5, pleat=0.005 * size)
    _ridge_fin(item, fin, body, (0.29, 0.38), [(0.29, 0.01), (0.36, 0.05), (0.41, 0.075), (0.42, 0.06), (0.39, 0.0)],
               rays=7, side=-1, steps=5, pleat=0.003 * size)
    _flank_fin(item, fin, body, 0.27, -0.03 * size,
               [(0.34 * size, 0.0), (0.41 * size, -0.03 * size), (0.42 * size, -0.07 * size),
                (0.36 * size, -0.1 * size)], rays=7, pleat=0.003 * size, rise=0.012 * size)
    _skin_line(item, Mat('fishGrey', rough=0.6, dim=0.58), body,
               [(0.22, 0.13 * size), (0.26, 0.05 * size), (0.265, -0.03 * size), (0.24, -0.11 * size)], 0.008 * size,
               out=0.002 * size)
    _mouth(item, body, [(0.0, -0.016 * size), (0.07, -0.032 * size), (0.15, -0.054 * size), (0.2, -0.066 * size)],
           'fishMouth', 0.02 * size, jaw=Mat('fishPearl', rough=0.45, spec=0.45, dim=0.88), jaw_radius=0.02 * size,
           reach=0.022 * size)
    _eye(item, body, 0.12, 0.09 * size, 0.032 * size, 'gold')
