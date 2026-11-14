"""Hides, the hunt's spoils, leather and cloth: pelts laid out flat, wings, scales and shells, skeins, rolls and
bolts, a fleece, a tusk, the wraps and the bedroll.

The flat spoils are drawn in the painter's own frame first (x right, y down toward the eye, in its texels; z up out of
the ground) and set in the world by `_lay`, so an outline can follow the painted one; a flat thing is raised toward
the eye by `TILT`, so it reads nearly whole rather than squashed by the eye's slant. Rolls are drawn along x in
texels and laid across the picture by `_roll_place`, their near end facing the eye."""
import math

import numpy as np

from . import shapes
from .kit import Mat
from .materials import LIE
from .models import model

TILT = 28.0   # degrees a flat thing is raised toward the eye, its far edge up


# --- outlines: signed distances in the painter's units, below 0 inside ---

def _sd_ellipse(x, y, mid_x, mid_y, reach_x, reach_y, rot=0.0):
    """An ellipse about (mid_x, mid_y), turned `rot` radians as the painter turns one (its y down)."""
    off_x, off_y = x - mid_x, y - mid_y
    cos_turn, sin_turn = math.cos(rot), math.sin(rot)
    along, across = off_x * cos_turn + off_y * sin_turn, -off_x * sin_turn + off_y * cos_turn
    stretch = np.hypot(along / reach_x, across / reach_y)
    slope = np.hypot(along / reach_x ** 2, across / reach_y ** 2)
    return np.where(slope < 1e-6, -min(reach_x, reach_y), stretch * (stretch - 1) / np.maximum(slope, 1e-9))


def _sd_capsule(x, y, start, end, radius, radius_end=None):
    """A stroke from `start` to `end`, `radius` thick at its start and `radius_end` at its end."""
    radius_end = radius if radius_end is None else radius_end
    run_x, run_y = end[0] - start[0], end[1] - start[1]
    run2 = run_x * run_x + run_y * run_y or 1.0
    share = np.clip(((x - start[0]) * run_x + (y - start[1]) * run_y) / run2, 0.0, 1.0)
    gap = np.hypot(x - (start[0] + share * run_x), y - (start[1] + share * run_y))
    return gap - (radius + (radius_end - radius) * share)


def _sd_polygon(x, y, points):
    """A polygon through `points`."""
    points = np.asarray(points, dtype=np.float64)
    dist = (x - points[0, 0]) ** 2 + (y - points[0, 1]) ** 2
    sign = np.ones_like(x, dtype=np.float64)
    for i in range(len(points)):
        edge_x, edge_y = points[i - 1] - points[i]
        rel_x, rel_y = x - points[i, 0], y - points[i, 1]
        share = np.clip((rel_x * edge_x + rel_y * edge_y) / (edge_x * edge_x + edge_y * edge_y), 0.0, 1.0)
        dist = np.minimum(dist, (rel_x - edge_x * share) ** 2 + (rel_y - edge_y * share) ** 2)
        above, below, left = y >= points[i, 1], y < points[i - 1, 1], edge_x * rel_y > edge_y * rel_x
        flip = (above & below & left) | (~above & ~below & ~left)
        sign = np.where(flip, -sign, sign)
    return sign * np.sqrt(dist)


def _smin(first, second, width):
    """Two outlines joined with a fillet `width` wide, as a leg grows out of a body."""
    blend = np.maximum(width - np.abs(first - second), 0.0) / width
    return np.minimum(first, second) - blend * blend * width * 0.25


def _smooth(edge0, edge1, value):
    """0 below `edge0`, 1 above `edge1`, easing between."""
    share = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return share * share * (3 - 2 * share)


def _field(seed, size, count=7, stretch=1.0):
    """A smooth seeded field over the painter's units, about -1..1, its features about `size` across; `stretch` over
    1 draws them out along y (fur lying one way)."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    angles = rng.uniform(0, 2 * math.pi, count)
    freqs = rng.uniform(0.7, 1.3, count) * math.pi / size
    phases = rng.uniform(0, 2 * math.pi, count)

    def field(x, y):
        total = 0.0
        for angle, freq, phase in zip(angles, freqs, phases):
            total = total + np.sin((x * math.cos(angle) + y / stretch * math.sin(angle)) * freq + phase)
        return total / math.sqrt(count / 2)
    return field


def _cut_sheet(outline, box, cell, height=None):
    """A sheet cut to an outline (signed distance, below 0 inside) over `box` ((x lo, x hi), (y lo, y hi)) in `cell`
    quads, its border pulled onto the outline so the edge is smooth, not stepped. `height(x, y, depth)` raises each
    point, `depth` how far it lies in from the edge. Its faces look up a frame whose y runs away from the eye; `_lay`
    turns them for the painter's frame."""
    (lo_x, hi_x), (lo_y, hi_y) = box
    cols, rows = max(2, int(math.ceil((hi_x - lo_x) / cell))), max(2, int(math.ceil((hi_y - lo_y) / cell)))
    grid_x, grid_y = np.meshgrid(np.linspace(lo_x, hi_x, cols + 1), np.linspace(lo_y, hi_y, rows + 1))
    keep = outline((grid_x[:-1, :-1] + grid_x[1:, 1:]) / 2, (grid_y[:-1, :-1] + grid_y[1:, 1:]) / 2) < 0
    used = np.zeros(grid_x.shape, dtype=bool)
    used[:-1, :-1] |= keep
    used[1:, :-1] |= keep
    used[:-1, 1:] |= keep
    used[1:, 1:] |= keep
    pull_x, pull_y = grid_x.copy(), grid_y.copy()
    step = cell * 0.05
    for _ in range(4):
        dist = outline(pull_x, pull_y)
        out = used & (dist > 0)
        if not out.any():
            break
        slope_x = (outline(pull_x + step, pull_y) - outline(pull_x - step, pull_y)) / (2 * step)
        slope_y = (outline(pull_x, pull_y + step) - outline(pull_x, pull_y - step)) / (2 * step)
        norm2 = np.maximum(slope_x * slope_x + slope_y * slope_y, 1e-9)
        pull_x = np.where(out, pull_x - slope_x * dist / norm2, pull_x)
        pull_y = np.where(out, pull_y - slope_y * dist / norm2, pull_y)
    depth = np.maximum(-outline(pull_x, pull_y), 0.0)
    lift_z = height(pull_x, pull_y, depth) if height else np.zeros_like(pull_x)
    index = -np.ones(grid_x.shape, dtype=np.int64)
    index[used] = np.arange(used.sum())
    verts = list(zip(pull_x[used].tolist(), pull_y[used].tolist(), lift_z[used].tolist()))
    row, col = np.nonzero(keep)
    faces = np.stack([index[row, col], index[row, col + 1], index[row + 1, col + 1], index[row + 1, col]],
                     axis=1).tolist()
    return verts, faces


def _lay(mesh, unit, centre, tilt=TILT):
    """A mesh drawn in the painter's frame set in the world: (x, y) about `centre` in texels of `unit` metres, y
    flipped to point away from the eye (its faces turned to match), z scaled alike; then raised `tilt` degrees toward
    the eye, its far edge up."""
    verts, faces = mesh
    mid_x, mid_y = centre
    placed = [((x - mid_x) * unit, (mid_y - y) * unit, z * unit) for x, y, z in verts]
    return shapes.moved((placed, [tuple(reversed(face)) for face in faces]), turn=(tilt, 0.0, 0.0))


def _scaled(mesh, unit):
    """A mesh drawn in texels, in metres."""
    verts, faces = mesh
    return [(x * unit, y * unit, z * unit) for x, y, z in verts], faces


def _tube(points, radii, sides=8):
    """A tube along `points`, its radius at each point its own from `radii`: a strand that swells and thins."""
    points = np.asarray(points, dtype=np.float64)
    count = len(points)
    verts, faces = [], []
    for i in range(count):
        ahead = points[min(i + 1, count - 1)] - points[max(i - 1, 0)]
        ahead = ahead / (np.linalg.norm(ahead) or 1.0)
        side = np.cross(ahead, (0.0, 0.0, 1.0))
        if np.linalg.norm(side) < 1e-6:
            side = np.cross(ahead, (1.0, 0.0, 0.0))
        side = side / np.linalg.norm(side)
        lift = np.cross(side, ahead)
        for k in range(sides):
            angle = 2 * math.pi * k / sides
            verts.append(tuple(points[i] + radii[i] * (math.cos(angle) * side + math.sin(angle) * lift)))
    for i in range(count - 1):
        for k in range(sides):
            after = (k + 1) % sides
            faces.append((i * sides + k, i * sides + after, (i + 1) * sides + after, (i + 1) * sides + k))
    verts += [tuple(points[0]), tuple(points[-1])]
    first, last = len(verts) - 2, len(verts) - 1
    faces += [(first, (k + 1) % sides, k) for k in range(sides)]
    faces += [(last, (count - 1) * sides + k, (count - 1) * sides + (k + 1) % sides) for k in range(sides)]
    return verts, faces


# --- masks: Blender shader nodes over an object's coordinates ---

def _math(nodes, links, operation, *inputs):
    """A math node on sockets or numbers."""
    node = nodes.new('ShaderNodeMath')
    node.operation = operation
    for slot, value in zip(node.inputs, inputs):
        if isinstance(value, (int, float)):
            slot.default_value = value
        else:
            links.new(value, slot)
    return node.outputs['Value']


def _hypot(nodes, links, first, second):
    """The length of (first, second), two sockets."""
    return _math(nodes, links, 'SQRT', _math(nodes, links, 'ADD', _math(nodes, links, 'MULTIPLY', first, first),
                                             _math(nodes, links, 'MULTIPLY', second, second)))


def _fract_below(nodes, links, value, period, width):
    """1 where `value` lies in the first `width` share of each `period`: thin lines repeating."""
    return _math(nodes, links, 'LESS_THAN',
                 _math(nodes, links, 'FRACT', _math(nodes, links, 'DIVIDE', value, period)), width)


def _painter_xy(nodes, links, coord, unit, centre, tilt=TILT):
    """The painter's (x, y) of a world point that `_lay` set with these numbers."""
    rotate = nodes.new('ShaderNodeVectorRotate')
    rotate.rotation_type = 'X_AXIS'
    rotate.inputs['Angle'].default_value = math.radians(-tilt)
    links.new(coord, rotate.inputs['Vector'])
    parts = nodes.new('ShaderNodeSeparateXYZ')
    links.new(rotate.outputs['Vector'], parts.inputs['Vector'])
    paint_x = _math(nodes, links, 'MULTIPLY_ADD', parts.outputs['X'], 1.0 / unit, centre[0])
    paint_y = _math(nodes, links, 'MULTIPLY_ADD', parts.outputs['Y'], -1.0 / unit, centre[1])
    return paint_x, paint_y


def _along_axis(nodes, links, coord, origin, axis):
    """How far a point lies along `axis` (a unit vector) from `origin`, metres."""
    sub = nodes.new('ShaderNodeVectorMath')
    sub.operation = 'SUBTRACT'
    links.new(coord, sub.inputs[0])
    sub.inputs[1].default_value = tuple(origin)
    dot = nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    links.new(sub.outputs['Vector'], dot.inputs[0])
    dot.inputs[1].default_value = tuple(axis)
    return dot.outputs['Value']


def _spiral(centre, axis, gap, width=0.35):
    """A rolled end's turns: a dark line spiralling out round `axis` through `centre`, `gap` metres a turn, `width`
    the share of each turn the line takes."""
    axis = np.asarray(axis, dtype=np.float64)
    axis = axis / np.linalg.norm(axis)
    side = np.cross(axis, (0.0, 0.0, 1.0))
    side = side / np.linalg.norm(side)
    upward = np.cross(side, axis)

    def mask(nodes, links, coord):
        across = _along_axis(nodes, links, coord, centre, side)
        rise = _along_axis(nodes, links, coord, centre, upward)
        radius = _hypot(nodes, links, across, rise)
        angle = _math(nodes, links, 'ARCTAN2', rise, across)
        turns = _math(nodes, links, 'SUBTRACT', _math(nodes, links, 'DIVIDE', radius, gap),
                      _math(nodes, links, 'DIVIDE', angle, 2 * math.pi))
        return _math(nodes, links, 'ADD', _math(nodes, links, 'FRACT', turns), width - 0.5)
    return mask


def _twill(period):
    """A twill's diagonal ribs over the world, `period` metres apart: a coarse weave's lines."""
    def mask(nodes, links, coord):
        along = _along_axis(nodes, links, coord, (0.0, 0.0, 0.0), (0.577, 0.577, 0.577))
        return _fract_below(nodes, links, along, period, 0.4)
    return mask


def _band(origin, axis, spans):
    """Bands across `axis`: where a point's distance along it from `origin` falls in one of `spans` [(lo, hi)]."""
    def mask(nodes, links, coord):
        along = _along_axis(nodes, links, coord, origin, axis)
        total = None
        for low, high in spans:
            inside = _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'GREATER_THAN', along, low),
                           _math(nodes, links, 'LESS_THAN', along, high))
            total = inside if total is None else _math(nodes, links, 'MAXIMUM', total, inside)
        return total
    return mask


def _tiger(unit, centre, size, seed):
    """A tiger's stripes across its back, wavering, clear of its spine."""
    def mask(nodes, links, coord):
        paint_x, paint_y = _painter_xy(nodes, links, coord, unit, centre)
        from_spine = _math(nodes, links, 'ABSOLUTE', _math(nodes, links, 'SUBTRACT', paint_x, centre[0]))
        off_spine = _math(nodes, links, 'GREATER_THAN', from_spine, 1.3 * size)
        waver = _math(nodes, links, 'SINE', _math(nodes, links, 'MULTIPLY_ADD', paint_x, 0.8 / size, float(seed % 7)))
        shifted = _math(nodes, links, 'MULTIPLY_ADD', waver, 1.3 * size, paint_y)
        wave = _math(nodes, links, 'COSINE', _math(nodes, links, 'MULTIPLY', shifted, 2 * math.pi / (3.2 * size)))
        return _math(nodes, links, 'MULTIPLY', off_spine, _math(nodes, links, 'GREATER_THAN', wave, 0.45))
    return mask


def _rings_about(point, unit, centre, gap, width):
    """Growth lines: thin rings about a point of the painter's frame, `gap` texels apart."""
    def mask(nodes, links, coord):
        paint_x, paint_y = _painter_xy(nodes, links, coord, unit, centre)
        reach = _hypot(nodes, links, _math(nodes, links, 'SUBTRACT', paint_x, point[0]),
                       _math(nodes, links, 'SUBTRACT', paint_y, point[1]))
        return _fract_below(nodes, links, reach, gap, width)
    return mask


def _bars(origin, direction, period, width, unit, centre):
    """Bars across a direction in the painter's frame: `width` of every `period` texels along it from `origin`."""
    def mask(nodes, links, coord):
        paint_x, paint_y = _painter_xy(nodes, links, coord, unit, centre)
        along_x = _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'SUBTRACT', paint_x, origin[0]), direction[0])
        along_y = _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'SUBTRACT', paint_y, origin[1]), direction[1])
        return _fract_below(nodes, links, _math(nodes, links, 'ADD', along_x, along_y), period, width)
    return mask


def _rim(unit, centre, tilt):
    """The great scale's dark rim: its top beyond an inner ellipse."""
    def mask(nodes, links, coord):
        paint_x, paint_y = _painter_xy(nodes, links, coord, unit, centre, tilt)
        norm_x = _math(nodes, links, 'DIVIDE', _math(nodes, links, 'SUBTRACT', paint_x, 15.0), 9.6)
        norm_y = _math(nodes, links, 'DIVIDE', _math(nodes, links, 'SUBTRACT', paint_y, 13.0), 6.6)
        outside_inner = _math(nodes, links, 'GREATER_THAN', _hypot(nodes, links, norm_x, norm_y), 1.0)
        return _math(nodes, links, 'MULTIPLY', outside_inner, _math(nodes, links, 'LESS_THAN', paint_y, 13.5))
    return mask


# --- the flat spoils ---

@model
def pelt(item, words, seed):
    """A pelt stretched flat, fur side up: its body, four splayed legs, its head with ears, eyes and nose, and a tail
    by `tail` (a bushy brush, a thin bare tail, a stub); `ears` false leaves the ears off. `fur` its ramp; `size` its
    scale against a wolf's; `pattern` tiger stripes or a dark bristled spine; `belly` a pale ramp down its middle;
    `over` grizzled light tips through the fur, fewer as it rises."""
    fur, size = words['fur'], words.get('size', 1)
    pattern, tail, ears = words.get('pattern'), words.get('tail', 'brush'), words.get('ears', True)
    belly, over = words.get('belly'), words.get('over')
    mid_x, mid_y = 18.0, 19.0
    rag = _field(seed, 2.2 * size)

    def body_sd(x, y):
        return _sd_ellipse(x, y, mid_x, mid_y, 6.2 * size, 8.6 * size)

    def head_sd(x, y):
        return _smin(_sd_ellipse(x, y, mid_x, mid_y - 9.8 * size, 3.5 * size, 3.1 * size),
                     _sd_ellipse(x, y, mid_x, mid_y - 7.4 * size, 1.9 * size, 1.8 * size), 1.0 * size)

    def outline(x, y):
        shape = body_sd(x, y)
        for side_x in (-1, 1):
            for side_y in (-1, 1):
                leg = _sd_capsule(x, y, (mid_x + side_x * 4 * size, mid_y + side_y * 5 * size),
                                  (mid_x + side_x * 10.8 * size, mid_y + side_y * 9.0 * size), 2.5 * size, 1.6 * size)
                shape = _smin(shape, leg, 2.0 * size)
        shape = _smin(shape, head_sd(x, y), 1.6 * size)
        if ears:
            for side_x in (-1, 1):
                ear = _sd_polygon(x, y, [(mid_x + side_x * 1.4 * size, mid_y - 12.0 * size),
                                         (mid_x + side_x * 4.6 * size, mid_y - 14.2 * size),
                                         (mid_x + side_x * 3.9 * size, mid_y - 10.0 * size)])
                shape = _smin(shape, ear - 0.35 * size, 0.8 * size)
        if tail == 'brush':
            brush = _sd_capsule(x, y, (mid_x, mid_y + 8.5 * size), (mid_x + 1.5 * size, mid_y + 14.5 * size),
                                1.9 * size, 1.4 * size)
            shape = _smin(shape, brush, 1.2 * size)
        elif tail == 'stub':
            stub = _sd_capsule(x, y, (mid_x, mid_y + 8 * size), (mid_x, mid_y + 10.6 * size), 1.4 * size, 1.1 * size)
            shape = _smin(shape, stub, 0.8 * size)
        return shape + 0.22 * size * rag(x, y)

    clumps = _field(seed + 11, 1.3 * size, count=9, stretch=2.2)
    folds = _field(seed + 17, 7.0 * size, count=4)

    def height(x, y, depth):
        on_body = np.clip(-body_sd(x, y) / (3.5 * size), 0, 1)
        on_head = np.clip(-head_sd(x, y) / (1.4 * size), 0, 1)
        lift = 0.7 * size * _smooth(0, 1.8 * size, depth)
        lift = lift + 1.4 * size * on_body * np.exp(-((x - mid_x) / (3.6 * size)) ** 2)
        lift = lift + 1.5 * size * np.sqrt(on_head)
        muzzle = ((x - mid_x) / (1.5 * size)) ** 2 + ((y - mid_y + 7.2 * size) / (1.4 * size)) ** 2
        lift = lift + 1.1 * size * np.exp(-muzzle)
        if tail == 'brush':
            along_tail = _sd_capsule(x, y, (mid_x, mid_y + 9.5 * size), (mid_x + 1.5 * size, mid_y + 14 * size), 0)
            lift = lift + 0.9 * size * np.exp(-(along_tail / (1.2 * size)) ** 2)
        fur_lie = 0.22 * size * clumps(x, y) * _smooth(0, 1.0 * size, depth)
        return lift + fur_lie + 0.35 * size * folds(x, y)

    def above(extra):
        """A layer lying over the hide's own surface, `extra` texels up."""
        return lambda x, y, depth: height(x, y, depth + 9 * size) + extra

    unit, centre = 0.03 * size, (mid_x, mid_y)
    cell = 0.32 * size
    box = ((mid_x - 14 * size, mid_x + 14 * size), (mid_y - 15.5 * size, mid_y + 16 * size))
    fine = (0.45, 1.0 / (unit * 1.4))
    stripes = ('black', _tiger(unit, centre, size, seed), 0.8) if pattern == 'stripes' else None
    item.add(_lay(_cut_sheet(outline, box, cell, height), unit, centre),
             Mat(fur, rough=0.9, bump=fine, pattern=stripes))
    lift = 0.12 * size
    if belly:
        belly_rag = _field(seed + 3, 1.0 * size)

        def belly_outline(x, y):
            patch = _sd_ellipse(x, y, mid_x, mid_y + 1.0, 3.4 * size, 6.2 * size) + 0.5 * size * belly_rag(x, y)
            return np.maximum(outline(x, y) + 0.4 * size, patch)
        item.add(_lay(_cut_sheet(belly_outline, box, cell, above(lift)), unit, centre),
                 Mat(belly, rough=0.9, bump=fine))
    spine_rag = _field(seed + 5, 0.9 * size)

    def spine_band(x, y):
        band = np.maximum(np.abs(x - mid_x) - 1.6 * size,
                          np.maximum(mid_y - 12.2 * size - y, y - mid_y - 9.5 * size))
        return band + 0.5 * size * spine_rag(x, y)

    if pattern == 'spine':
        def crest_height(x, y, depth):
            return height(x, y, depth + 9 * size) + lift + 0.8 * size * _smooth(0, 1.2 * size, depth)
        crest = _cut_sheet(lambda x, y: np.maximum(outline(x, y) + 0.3 * size, spine_band(x, y)), box, cell * 0.8,
                           crest_height)
        item.add(_lay(crest, unit, centre), Mat(fur, rough=0.95, dim=0.35, bump=(0.9, 1.0 / (unit * 1.2))))
    if over:
        grizzle = _field(seed + 7, 1.5 * size, count=9)
        cut = 0.3 + 2.4 * (over - 0.5)

        def over_outline(x, y):
            shape = np.maximum(outline(x, y) + 0.6 * size, (cut - grizzle(x, y)) * 1.5 * size)
            return np.maximum(shape, -spine_band(x, y) + 0.5 * size) if pattern == 'spine' else shape
        tips = _cut_sheet(over_outline, box, cell * 0.8, above(lift * 2))
        if tips[1]:
            item.add(_lay(tips, unit, centre), Mat(fur, rough=0.9, dim=1.3, bump=fine))
    if tail == 'thin':
        root_z = height(np.array(mid_x), np.array(mid_y + 7.6 * size), np.array(3.0)).item()
        points = [(mid_x, mid_y + 7.6 * size, root_z * 0.6), (mid_x + 1.2 * size, mid_y + 10.5 * size, 0.9 * size),
                  (mid_x + 2.6 * size, mid_y + 12.8 * size, 0.75 * size),
                  (mid_x + 5.2 * size, mid_y + 14.2 * size, 0.6 * size)]
        # never thinner than a texel, or a rat's tail is lost
        radius = max(0.75 * size, 0.6)
        item.add(_lay(shapes.tube(points, radius, 8, radius_end=radius * 0.45), unit, centre),
                 Mat(fur, rough=0.7, dim=0.9))
    face = Mat('black', rough=0.4, spec=0.6)
    for side_x in (-1, 1):
        x, y = mid_x + side_x * 1.45 * size, mid_y - 10.2 * size
        z = height(np.array(x), np.array(y), np.array(9.0)).item()
        item.add(_lay(shapes.ellipsoid((0.8 * size, 0.6 * size, 0.35 * size), (x, y, z), 6, 10), unit, centre), face)
    nose_z = height(np.array(mid_x), np.array(mid_y - 6.6 * size), np.array(9.0)).item()
    nose = shapes.ellipsoid((1.0 * size, 0.75 * size, 0.55 * size), (mid_x, mid_y - 6.4 * size, nose_z), 6, 10)
    item.add(_lay(nose, unit, centre), face)


@model
def batWing(item, words, seed):
    """A bat's wing skinned and spread: a fan of dark leather between its finger bones, each panel sagging between
    them, scalloped between the tips; the knuckles, the wrist and a thumb's pale hook."""
    root = (6.0, 24.0)
    tips = [(12.0, 4.0), (22.0, 6.0), (30.0, 13.0), (31.0, 22.0)]
    fan = [root] + tips + [(24.0, 26.0)]
    scallops = [(17.5, 6.5, 4.2, 2.8, 0.0), (27.0, 10.4, 3.6, 2.6, 0.6), (31.6, 18.0, 2.3, 3.4, 0.0),
                (27.0, 25.6, 4.0, 2.4, 0.0)]

    def outline(x, y):
        cut = None
        for mid_x, mid_y, reach_x, reach_y, rot in scallops:
            part = _sd_ellipse(x, y, mid_x, mid_y, reach_x, reach_y, rot)
            cut = part if cut is None else np.minimum(cut, part)
        return np.maximum(_sd_polygon(x, y, fan), -cut)

    def bone_dist(x, y):
        out = None
        for tip in tips:
            part = _sd_capsule(x, y, root, tip, 0.0)
            out = part if out is None else np.minimum(out, part)
        return out

    def height(x, y, depth):
        reach = np.hypot(x - root[0], y - root[1])
        sag = 1.1 * (1 - np.exp(-(bone_dist(x, y) / 2.2) ** 2)) * np.clip(reach / 10, 0, 1)
        return 1.2 - sag + 0.05 * reach

    unit, centre = 0.007, (18.0, 16.0)
    skin = _cut_sheet(outline, ((4, 33), (2, 28)), 0.25, height)
    item.add(_lay(skin, unit, centre), Mat('batSkin', rough=0.65, dim=0.82, bump=(0.25, 1.0 / (unit * 1.5))))
    # the bones a step darker than the skin, as the painted ones, so the fan reads by its ribs
    bone = Mat('batSkin', rough=0.6, dim=0.4)
    for tip_x, tip_y in tips:
        span = math.hypot(tip_x - root[0], tip_y - root[1])
        points = [(root[0] + (tip_x - root[0]) * share, root[1] + (tip_y - root[1]) * share, 1.25 + 0.05 * span * share)
                  for share in np.linspace(0, 1, 6)]
        item.add(_lay(shapes.tube(points, 0.75, 6, radius_end=0.35), unit, centre), bone)
        knuckle = (root[0] + (tip_x - root[0]) * 0.45, root[1] + (tip_y - root[1]) * 0.45, 1.25 + 0.05 * 0.45 * span)
        item.add(_lay(shapes.ellipsoid((0.75, 0.75, 0.6), knuckle, 5, 8), unit, centre), bone)
    arm = [(4.0, 26.0, 1.5), (6.0, 24.0, 1.6), (9.0, 22.0, 1.5)]
    item.add(_lay(shapes.tube(arm, 1.35, 8, radius_end=1.0), unit, centre), bone)
    item.add(_lay(shapes.ellipsoid((1.5, 1.4, 1.1), (6.0, 24.0, 1.6), 6, 10), unit, centre), bone)
    thumb = [(6.5, 22.8, 1.9), (5.6, 20.6, 2.2), (4.2, 19.6, 1.9)]
    item.add(_lay(shapes.tube(thumb, 0.55, 6, radius_end=0.15), unit, centre), Mat('bone', rough=0.5))


@model
def tailPiece(item, words, seed):
    """A scorpion's tail-piece in `ramp`: its keeled segments along a curl, each smaller than the last and pinched at
    its joints, then the swollen sting and its hooked, dark point."""
    ramp = words['ramp']
    segments = [(8.0, 26.0, 5.0), (12.0, 19.2, 4.6), (17.0, 13.8, 4.1), (22.8, 10.8, 3.7), (27.6, 11.6, 3.2)]
    bulb = (29.6, 15.0)
    # propped up toward the eye, so the curl reads whole as the painted one does
    unit, centre, tilt = 0.006, (18.0, 17.0), 58.0
    shell = Mat(ramp, rough=0.35, spec=0.6, bump=(0.2, 1.0 / (unit * 1.5)))
    chain = [(x, y) for x, y, _ in segments] + [bulb]
    for i, (x, y, radius) in enumerate(segments):
        before, after = chain[max(i - 1, 0)], chain[i + 1]
        angle = math.degrees(math.atan2(after[1] - before[1], after[0] - before[0]))
        half = 0.5 * math.hypot(after[0] - x, after[1] - y) * 1.05
        profile = [(radius * 0.42, half), (radius * 0.86, half * 0.62), (radius, half * 0.12),
                   (radius * 0.95, -half * 0.4), (radius * 0.75, -half * 0.8), (radius * 0.45, -half)]
        body = shapes.moved(shapes.lathe(profile, 8, top=True, foot=True), turn=(0, 90, angle),
                            scale=(1.0, 0.85, 1.0), offset=(x, y, radius * 0.85))
        item.add(_lay(body, unit, centre, tilt), shell, smooth=False)
    item.add(_lay(shapes.ellipsoid((2.9, 2.7, 2.5), (bulb[0], bulb[1], 2.6), 8, 12), unit, centre, tilt), shell)
    hook = [(30.2, 16.6, 2.6), (30.8, 18.6, 2.5), (30.2, 20.3, 2.2)]
    point = [(30.2, 20.3, 2.2), (29.0, 21.5, 1.9), (27.4, 21.8, 1.6)]
    item.add(_lay(shapes.tube(hook, 1.6, 8, radius_end=0.9), unit, centre, tilt), shell)
    item.add(_lay(shapes.tube(point, 0.9, 8, radius_end=0.2), unit, centre, tilt),
             Mat(ramp, rough=0.3, spec=0.7, dim=0.45))


@model
def shellPlate(item, words, seed):
    """A shell plate off a sea-creature's back in `ramp`: broad and domed, its near edge toothed, a ridge down its
    middle, ribs fanned out to the sides and growth lines across them."""
    ramp = words['ramp']
    teeth = [(4 + i * 3.25, 25.0 if i % 2 else 21.2) for i in range(9)]
    hinge = (17.0, 27.0)

    def outline(x, y):
        return np.maximum(_sd_ellipse(x, y, 17, 18.5, 14.5, 13), _sd_polygon(x, y, [(2, 4), (32, 4)] + teeth[::-1]))

    def height(x, y, depth):
        dome = 4.2 * np.clip(1 - ((x - 17) / 15.5) ** 2 - ((y - 14) / 13) ** 2, 0, 1) ** 0.6
        reach = np.hypot(x - hinge[0], y - hinge[1])
        rib = 0.6 * np.cos(np.arctan2(y - hinge[1], x - hinge[0]) * 9) * np.clip((reach - 4) / 8, 0, 1)
        ridge = 0.9 * np.exp(-((x - 17) / 1.8) ** 2) * _smooth(4, 9, y) * (1 - _smooth(20, 25, y))
        return (dome + rib + ridge) * _smooth(0, 1.2, depth) + 0.5

    unit, centre = 0.009, (17.0, 16.0)
    plate = _cut_sheet(outline, ((1, 33), (3, 27)), 0.22, height)
    growth = _rings_about(hinge, unit, centre, 5.6, 0.12)
    item.add(_lay(plate, unit, centre), Mat(ramp, rough=0.4, spec=0.55, pattern=(ramp, growth, 0.72)))


@model
def scales(item, words, seed):
    """A patch of fish skin in `ramp`: its scales laid in rows like roof tiles, each a face lit from above, its free
    edge a step down onto the next nearer row, the step in shadow; the patch's edge ragged."""
    ramp = words['ramp']
    # tipped well toward the eye: the faces then meet the light and the steps under their free edges fall dark
    unit, centre, tilt = 0.004, (17.0, 16.0), 46.0
    rag = _field(seed, 3.0)
    spread_x, spread_y, rise, reach_x, reach_y = 4.8, 4.2, 0.48, 2.95, 3.45

    def outline(x, y):
        return _sd_ellipse(x, y, 17, 16, 12.6, 9.4) + 0.5 * rag(x, y)

    def height(x, y, depth):
        base = 1.4 * np.clip(1 - ((x - 17) / 13) ** 2 - ((y - 16) / 10) ** 2, 0, 1) ** 0.5
        lift = np.full_like(x, np.nan)
        # nearer rows first: a farther row lies over the nearer, so it is laid last and wins where they overlap
        for row in reversed(range(-1, 7)):
            mid_y = 7.5 + row * spread_y
            for col in range(-1, 9):
                mid_x = 4.0 + col * spread_x + (row % 2) * spread_x / 2
                along, across = (x - mid_x) / reach_x, (y - mid_y) / reach_y
                face = base + rise * (y - mid_y + reach_y) + 0.25 * (1 - along * along)
                lift = np.where(along * along + across * across <= 1.0, face, lift)
        return np.where(np.isnan(lift), base, lift)

    skin = _cut_sheet(outline, ((3, 31), (5, 27)), 0.12, height)
    item.add(_lay(skin, unit, centre, tilt), Mat(ramp, rough=0.6, spec=0.3))


@model
def bigScale(item, words, seed):
    """One great scale in `ramp`: broad, pointed below, domed, two keels running down to its point, its top rim a
    raised dark lip with a groove inside it."""
    ramp = words['ramp']

    def outline(x, y):
        return _smin(_sd_ellipse(x, y, 15, 12, 11, 7.5), _sd_polygon(x, y, [(4.4, 13), (25.6, 13), (15, 26)]), 1.5)

    def keels(x, y):
        out = None
        for shift in (-3.2, 3.2):
            part = _sd_capsule(x, y, (15 + shift, 6.5), (15 + shift * 0.2, 23.5), 0.0)
            out = part if out is None else np.minimum(out, part)
        return out

    def height(x, y, depth):
        dome = 2.6 * np.sqrt(np.clip(depth / 6.0, 0, 1))
        keel = 1.1 * np.exp(-(keels(x, y) / 0.9) ** 2) * _smooth(0, 1.5, depth)
        top = 1 - _smooth(11, 15, y)
        lip = 0.9 * np.exp(-((depth - 0.9) / 0.7) ** 2) * top
        groove = -0.6 * np.exp(-((depth - 2.4) / 0.6) ** 2) * top
        return dome + keel + lip + groove

    unit, centre, tilt = 0.004, (15.0, 16.0), 32.0
    plate = _cut_sheet(outline, ((3, 27), (3, 27)), 0.2, height)
    item.add(_lay(plate, unit, centre, tilt), Mat(ramp, rough=0.35, spec=0.6, bump=(0.15, 1.0 / (unit * 1.5)),
                                                  pattern=(ramp, _rim(unit, centre, tilt), 0.45)))


@model
def claw(item, words, seed):
    """A crab's claw in `ramp`: the knobbled palm on its wrist, its two fingers curved apart with pale teeth along
    their inner edges, their tips dark."""
    ramp = words['ramp']
    unit, centre = 0.006, (17.0, 16.0)
    shell = Mat(ramp, rough=0.4, spec=0.55, bump=(0.45, 1.0 / (unit * 1.6)))
    palm = shapes.moved(shapes.ellipsoid((8.2, 6.2, 4.4), rings=12, sides=20), turn=(0, 0, -23), offset=(13, 19, 4.4))
    item.add(_lay(palm, unit, centre), shell)
    wrist = shapes.tube([(2.5, 26.0, 2.6), (5.5, 24.0, 2.9), (8.5, 22.0, 3.3)], 2.4, 10, radius_end=2.8)
    item.add(_lay(wrist, unit, centre), shell)
    upper = [(16.5, 14.0, 5.6), (19.5, 10.6, 5.2), (23.5, 9.0, 4.6), (27.2, 9.0, 4.0), (29.8, 10.6, 3.4)]
    lower = [(18.5, 20.6, 3.6), (22.5, 20.2, 3.2), (26.5, 18.8, 2.8), (30.2, 16.4, 2.4)]
    tip = Mat(ramp, rough=0.3, spec=0.7, dim=0.45)
    for finger, girth in ((upper, 3.0), (lower, 2.5)):
        cut = int(len(finger) * 0.6)
        item.add(_lay(shapes.tube(finger[:cut + 1], girth, 10, radius_end=girth * 0.55), unit, centre), shell)
        item.add(_lay(shapes.tube(finger[cut:], girth * 0.55, 10, radius_end=0.2), unit, centre), tip)
    tooth = Mat('bone', rough=0.5)
    for point in ((21.0, 13.0, 4.8), (24.2, 12.0, 4.4), (27.0, 11.8, 3.8), (22.5, 18.0, 3.6), (25.6, 17.0, 3.2),
                  (28.2, 15.6, 2.8)):
        item.add(_lay(shapes.ellipsoid((0.95, 0.95, 0.9), point, 5, 8), unit, centre), tooth)


@model
def feathers(item, words, seed):
    """Feathers fanned from their quills: each vane folded along its shaft, its barbs combed toward the tip, one split
    in its edge; `ramp` the vane, `bar` the bars across it, the shaft pale."""
    ramp, bar = words['ramp'], words['bar']
    quill = (12.0, 29.0)
    ends = [(6.0, 5.0), (17.0, 4.0), (27.0, 9.0)]
    unit, centre = 0.009, (17.0, 17.0)
    rng = np.random.RandomState(seed & 0x7fffffff)
    shaft_mat = Mat('featherPale', rough=0.5)
    for i, (end_x, end_y) in enumerate(ends):
        length = math.hypot(end_x - quill[0], end_y - quill[1])
        dir_x, dir_y = (end_x - quill[0]) / length, (end_y - quill[1]) / length
        split = rng.uniform(0.45, 0.75) * length
        split_side = 1 if rng.uniform() > 0.5 else -1
        base = 0.4 + i * 0.5   # each feather a little over the one before

        def frame(x, y, dir_x=dir_x, dir_y=dir_y):
            along = (x - quill[0]) * dir_x + (y - quill[1]) * dir_y
            across = -(x - quill[0]) * dir_y + (y - quill[1]) * dir_x
            return along, across

        def outline(x, y, length=length, frame=frame, split=split, split_side=split_side):
            along, across = frame(x, y)
            start = length * 0.18
            share = np.clip((along - start) / (length - start), 0, 1)
            half = 3.2 * np.sqrt(np.sin(np.pi * share * 0.92 + 0.08)) * (1 - 0.15 * (across < 0))
            vane = np.maximum(np.abs(across) - half, np.maximum(start - along, along - length))
            notch = np.abs(along - split - (np.abs(across) * 0.6)) - 0.45
            notch = np.maximum(notch, -(across * split_side) + 1.0)
            return np.maximum(vane, -notch)

        def height(x, y, depth, frame=frame, length=length, base=base):
            along, across = frame(x, y)
            fold = 0.9 - 0.25 * np.abs(across)
            curve = -0.004 * (along - length * 0.55) ** 2
            barbs = 0.12 * np.sin((along - np.abs(across) * 1.4) * 2 * math.pi / 1.6)
            return base + fold + curve + barbs

        box = ((min(quill[0], end_x) - 4, max(quill[0], end_x) + 4),
               (min(quill[1], end_y) - 4, max(quill[1], end_y) + 4))
        vane = _cut_sheet(outline, box, 0.22, height)
        bars = _bars(quill, (dir_x, dir_y), 3.2, 0.33, unit, centre)
        item.add(_lay(vane, unit, centre), Mat(ramp, rough=0.75, bump=(0.2, 1.0 / (unit * 1.2)),
                                               pattern=(bar, bars, 0.95)))
        points = [(quill[0] + dir_x * along, quill[1] + dir_y * along,
                   base + 1.0 - 0.004 * (along - length * 0.55) ** 2) for along in np.linspace(0, length, 8)]
        item.add(_lay(shapes.tube(points, 0.55, 6, radius_end=0.15), unit, centre), shaft_mat)


# --- leather and cloth: rolls lie across the picture, their near end's turns facing the eye ---

def _roll_place(mesh, unit):
    """A mesh drawn along x in texels (z up, y away from the eye), in metres and laid across the picture."""
    return shapes.moved(_scaled(mesh, unit), turn=(0, 0, LIE))


def _roll_axis():
    """The way a laid roll runs, in the world."""
    return (math.cos(math.radians(LIE)), math.sin(math.radians(LIE)), 0.0)


def _world(point, unit):
    """A point drawn along x in texels, where `_roll_place` sets it in the world."""
    x, y, z = point
    turn = math.radians(LIE)
    return (unit * (x * math.cos(turn) - y * math.sin(turn)), unit * (x * math.sin(turn) + y * math.cos(turn)),
            unit * z)


def _roll_parts(item, body, end, radius, length, unit, offset=(0.0, 0.0)):
    """A roll along x (texels; resting on the ground, its middle at `offset`) of `body`, its ends' faces `end` (a
    spiral of turns): laid across the picture."""
    off_x, off_y = offset
    tube = shapes.moved(shapes.cylinder(radius, length, 20, caps=False), offset=(off_x - length / 2, off_y, radius))
    item.add(_roll_place(tube, unit), body)
    for end_x in (-length / 2, length / 2):
        cap = shapes.moved(shapes.ellipsoid((0.25, radius * 0.995, radius * 0.995), rings=6, sides=20),
                           offset=(off_x + end_x, off_y, radius))
        item.add(_roll_place(cap, unit), end)


def _spiral_end(ramp, radius, length, unit, gap, offset=(0.0, 0.0), rough=0.85, spec=0.3):
    """A roll's end face: its own ramp, the turns a spiral a step darker, centred on its near end."""
    near = _world((offset[0] - length / 2, offset[1], radius), unit)
    return Mat(ramp, rough=rough, spec=spec, pattern=(ramp, _spiral(near, _roll_axis(), unit * gap, 0.38), 0.52))


def _wrap_band(radius, length, angle0, angle1, rows=6, columns=16):
    """A layer over a roll's front between two angles (degrees above its middle, toward the eye), all along it."""
    verts, faces = [], []
    for angle in np.linspace(math.radians(angle0), math.radians(angle1), rows):
        for x in np.linspace(-length / 2, length / 2, columns):
            verts.append((x, -radius * math.cos(angle), radius / 1.03 + radius * math.sin(angle)))
    for j in range(rows - 1):
        for i in range(columns - 1):
            faces.append((j * columns + i, j * columns + i + 1, (j + 1) * columns + i + 1, (j + 1) * columns + i))
    return verts, faces


def _ring(radius, thick, x, centre_z, sides=24):
    """A band round a roll at `x`: a ring in the plane across x."""
    return shapes.moved(shapes.torus(radius, thick, sides, 8), turn=(0, 90, 0), offset=(x, 0, centre_z))


def _hang_path(radius, reach, top=70.0):
    """Where cloth hanging off a roll runs, in the roll's cross-section (y away from the eye, z up): over the front
    from `top` degrees above the middle, straight down to the ground, then `reach` texels forward along it."""
    path = []
    for angle in np.linspace(math.radians(top), 0.0, 5):
        path.append((-radius * 1.04 * math.cos(angle), radius + radius * 1.04 * math.sin(angle)))
    front = -radius * 1.04
    path += [(front - 0.4, radius * 0.45), (front - 1.2, 0.5)]
    path += [(front - 1.2 - reach * share, 0.3) for share in (0.25, 0.5, 0.75, 1.0)]
    return path


def _hem_wave(x, seed):
    """How far a hanging cloth's free edge wanders forward or back at `x`."""
    return 0.8 * math.sin(x * 0.45 + 1.3 + (seed % 11) * 0.7)


def _drape(path, span, seed, ripple, pleats=0.0):
    """A sheet whose rows follow `path` [(y, z)], row `j` running along x over `span(j)`: hanging in `pleats` deep
    upright folds as it falls, lying in soft folds where it reaches the ground (its free edge waving)."""
    verts, faces = [], []
    columns = 32
    top = path[0][1]
    for j, (y, z) in enumerate(path):
        first, last = span(j)
        on_ground = 1.0 if z < 0.6 else 0.0
        fall = min(1.0, max(0.0, (top - z) / max(top, 1e-6)) * 1.6)
        for x in np.linspace(first, last, columns):
            fold = ripple * on_ground * max(0.0, math.sin(x * 0.7 + (seed % 7)))
            wander = on_ground * _hem_wave(x, seed) * min(1.0, j / max(len(path) - 1, 1))
            pleat = pleats * fall * math.sin(x * 1.25 + (seed % 5))
            verts.append((x, y + wander + pleat, z + fold))
    for j in range(len(path) - 1):
        for i in range(columns - 1):
            faces.append((j * columns + i, (j + 1) * columns + i, (j + 1) * columns + i + 1, j * columns + i + 1))
    return verts, faces


def _ribbon(points, width, seed, lift=0.35):
    """A flat strip along `points`, `width` wide, its edges lifting a little in waves where it lies."""
    points = np.asarray(points, dtype=np.float64)
    fine = []
    for k in range(len(points) - 1):
        for share in np.linspace(0, 1, 6, endpoint=False):
            fine.append(points[k] * (1 - share) + points[k + 1] * share)
    fine.append(points[-1])
    fine = np.asarray(fine)
    verts, faces = [], []
    for i, point in enumerate(fine):
        ahead = fine[min(i + 1, len(fine) - 1)] - fine[max(i - 1, 0)]
        ahead = ahead / (np.linalg.norm(ahead[:2]) or 1.0)
        side = np.array([-ahead[1], ahead[0], 0.0])
        for edge in (-0.5, 0.5):
            wave = lift * (1 + math.sin(i * 0.9 + seed + edge * 3)) * 0.5
            corner = point + side * width * edge
            verts.append((corner[0], corner[1], corner[2] + wave))
    for i in range(len(fine) - 1):
        faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    return verts, faces


@model
def skein(item, words, seed):
    """Silk in a hank: its threads twisted round each other in four plies, fat in the middle and thin to its ends, a
    loop at each end where the hank folds, a loose end trailing off; `ramp` the silk's, `strand` the loose end (on
    unless false)."""
    ramp, strand = words['ramp'], words.get('strand', True)
    unit = 0.006
    length, plies, twists, rest = 23.0, 4, 3.2, 4.4
    silk = Mat(ramp, rough=0.3, spec=0.75, bump=(0.2, 1.0 / (unit * 0.8)))
    # alternate plies a step apart, so the twist reads as bands across the hank even on white silk
    shade = Mat(ramp, rough=0.3, spec=0.75, bump=(0.2, 1.0 / (unit * 0.8)), dim=0.68)
    for k in range(plies):
        points, radii = [], []
        for share in np.linspace(-1, 1, 72):
            swell = 0.5 + 0.5 * math.cos(math.pi * share * 0.92)
            angle = share * 0.5 * twists * 2 * math.pi + k * 2 * math.pi / plies
            coil = 0.9 + 2.0 * swell
            points.append((share * length / 2, coil * math.cos(angle), rest + coil * math.sin(angle) * 0.85))
            radii.append(1.15 + 1.3 * swell)
        item.add(_roll_place(_tube(points, radii, 8), unit), silk if k % 2 == 0 else shade)
    for end in (-1, 1):
        loop = shapes.moved(shapes.torus(1.8, 1.0, 20, 10), turn=(50, 0, 0), offset=(end * (length / 2 + 1.5), 0, rest))
        item.add(_roll_place(loop, unit), silk)
    if strand:
        tip = length / 2
        points = [(tip + 2.2, -1.2, rest - 1.2), (tip + 3.2, -3.4, 1.4), (tip + 1.6, -5.8, 0.9),
                  (tip + 0.4, -8.2, 0.9), (tip + 2.0, -10.4, 0.9), (tip + 4.0, -11.8, 0.9)]
        item.add(_roll_place(_tube(points, [0.95] * 5 + [0.7], 6), unit), silk)


@model
def leatherRoll(item, words, seed):
    """A hide cured and rolled, its turns showing at its end, the hide's last edge lying along it, tied twice with a
    knotted cord, its end unrolled from under it as a corner lying before it; `ramp` the leather's."""
    ramp = words['ramp']
    unit, radius, length = 0.012, 4.6, 26.0
    leather = Mat(ramp, rough=0.75, bump=(0.35, 1.0 / (unit * 1.3)))
    _roll_parts(item, leather, _spiral_end(ramp, radius, length, unit, 1.3, rough=0.8), radius, length, unit)
    # the hide's last edge, a step along the roll's front
    edge_angle = math.radians(70)
    edge = [(share * length, -radius * math.sin(edge_angle), radius - radius * math.cos(edge_angle))
            for share in np.linspace(-0.5, 0.5, 12)]
    item.add(_roll_place(shapes.tube(edge, 0.35, 6), unit), leather)
    cord = Mat('rope', rough=0.85, bump=(0.4, 1.0 / (unit * 0.8)))
    for share in (0.3, 0.68):
        x = -length / 2 + length * share
        item.add(_roll_place(_ring(radius + 0.2, 0.55, x, radius), unit), cord)
        item.add(_roll_place(shapes.ellipsoid((0.9, 0.8, 0.8), (x, -radius - 0.3, radius * 0.75), 5, 8), unit), cord)
    # the hide's end, unrolled from under the roll: a corner lying flat before it, its tip curling up
    near = -length / 2
    corner = [(near + 1.0, 0.0), (near + 8.5, 0.0), (near + 7.0, -radius - 1.4), (near + 2.6, -radius - 4.2),
              (near - 0.2, -radius - 1.6)]
    tip = corner[3]

    def lie(x, y, depth):
        reach = np.hypot(x - tip[0], y - tip[1])
        return 0.25 + 0.35 * np.sin(x * 0.8 + y * 0.5 + seed % 5) ** 2 + 1.2 * np.exp(-(reach / 1.8) ** 2)
    flat = _cut_sheet(lambda x, y: _sd_polygon(x, y, corner), ((near - 3, near + 11), (-radius - 8, 1)), 0.25, lie)
    item.add(_roll_place(flat, unit), Mat(ramp, rough=0.75, dim=0.9, bump=(0.35, 1.0 / (unit * 1.3))))


@model
def leatherSlab(item, words, seed):
    """Leather boiled hard and folded square: two stiff layers, the upper one set forward and to the left, the upper
    stitched round its edge in pale thread; `ramp` the leather's."""
    ramp = words['ramp']
    unit = 0.01
    leather = Mat(ramp, rough=0.6, spec=0.4, bump=(0.3, 1.0 / (unit * 1.3)))
    size, thick, turn = 15.0, 2.0, 14.0
    lower = shapes.moved(shapes.box(size, size * 0.92, thick), offset=(2.5, 3.0, thick / 2), turn=(0, 0, turn))
    item.add(_scaled(lower, unit), leather, smooth=False, bevel=unit * 0.5)
    upper = shapes.moved(shapes.box(size, size * 0.92, thick), offset=(-1.5, -1.5, thick * 1.5), turn=(0, 0, turn))
    item.add(_scaled(upper, unit), leather, smooth=False, bevel=unit * 0.5)
    stitch = Mat('tan', rough=0.7)
    inset, per_side = 1.5, 6
    half_x, half_y = size / 2 - inset, size * 0.46 - inset
    for side in range(4):
        for k in range(per_side):
            share = (k + 0.5) / per_side * 2 - 1
            x, y, along = ((share * half_x, -half_y, 0), (half_x, share * half_y, 90), (-share * half_x, half_y, 0),
                           (-half_x, -share * half_y, 90))[side]
            dash = shapes.moved(shapes.box(1.1, 0.5, 0.35), turn=(0, 0, along), offset=(x, y, 0))
            dash = shapes.moved(dash, offset=(-1.5, -1.5, thick * 2 + 0.05), turn=(0, 0, turn))
            item.add(_scaled(dash, unit), stitch, smooth=False)


@model
def bolt(item, words, seed):
    """A bolt of cloth on its wooden core: the roll, its turns at its near end, and its loose end hanging off the
    front in upright pleats onto the ground, hemmed. `ramp` the cloth's; `weave` a coarse weave's relief and twill;
    `sheen` a silk's gloss; `stripe` a band of another ramp running along the cloth, round the roll and down the loose
    end (the twill gives way to it)."""
    ramp, weave, sheen, stripe = words['ramp'], words.get('weave', 0), words.get('sheen', False), words.get('stripe')
    unit, radius, length = 0.02, 5.0, 19.0
    rough, spec = (0.25, 0.8) if sheen else (0.85, 0.3)
    bump = (0.25 + weave * 4, 1.0 / (unit * 0.8)) if weave else (0.12, 1.0 / (unit * 0.9))
    band = None
    if stripe:
        origin = _world((-length / 2, 0, 0), unit)
        band = (stripe, _band(origin, _roll_axis(), [(unit * length * 0.32, unit * length * 0.42)]), 1.0)
    elif weave:
        band = (ramp, _twill(unit * 2.2), 1 - weave * 1.2)
    cloth = Mat(ramp, rough=rough, spec=spec, bump=bump, pattern=band)
    _roll_parts(item, cloth, _spiral_end(ramp, radius, length, unit, 0.9, rough=rough, spec=spec), radius, length, unit)
    core = shapes.moved(shapes.cylinder(1.2, length + 1.6, 12), offset=(-length / 2 - 0.8, 0, radius))
    item.add(_roll_place(core, unit), Mat('wood', rough=0.7))
    # the loose end: off the roll's front, down to the ground and forward, in pleats
    path = _hang_path(radius, 5.0, top=30.0)
    first, last = -length / 2 + 0.6, length / 2 - 0.6
    item.add(_roll_place(_drape(path, lambda j: (first, last), seed, 0.7, pleats=0.9), unit), cloth)
    hem_y, hem_z = path[-1]
    hem = [(x, hem_y + _hem_wave(x, seed), hem_z + 0.25) for x in np.linspace(first, last, 20)]
    item.add(_roll_place(shapes.tube(hem, 0.5, 6), unit), Mat(ramp, rough=rough, spec=spec, dim=0.7))


@model
def wraps(item, words, seed):
    """Hand wraps: two rolls of linen strip wound tight, their turns at their near ends, the loose end of one
    unwinding off its front and run out across the ground in a lazy curve."""
    unit, radius, length = 0.006, 4.4, 6.4
    linen = Mat('linen', rough=0.85, bump=(0.2, 1.0 / (unit * 0.9)))
    rolls = [(-5.5, -1.0), (5.5, 2.2)]
    for roll in rolls:
        _roll_parts(item, linen, _spiral_end('linen', radius, length, unit, 1.7, roll), radius, length, unit, roll)
    roll_x, roll_y = rolls[0]
    lift = math.radians(40)
    points = [(roll_x, roll_y - radius * math.cos(lift), radius + radius * math.sin(lift)),
              (roll_x, roll_y - radius - 0.05, radius), (roll_x + 0.1, roll_y - radius - 0.4, radius * 0.35),
              (roll_x + 0.6, roll_y - radius - 1.6, 0.1), (roll_x + 3.0, -8.6, 0.1), (roll_x + 8.0, -9.4, 0.1),
              (roll_x + 12.5, -8.0, 0.1), (roll_x + 16.0, -10.0, 0.1)]
    item.add(_roll_place(_ribbon(points, length * 0.92, seed), unit), linen)


@model
def bedroll(item, words, seed):
    """A bedroll: a wool blanket rolled tight, its turns at its near end, its red border lying along the roll where
    its last edge ends, two leather straps buckled round it."""
    unit, radius, length = 0.02, 5.0, 24.0
    wool = Mat('wool', rough=0.95, bump=(0.45, 1.0 / (unit * 0.9)))
    _roll_parts(item, wool, _spiral_end('wool', radius, length, unit, 1.2, rough=0.95), radius, length, unit)
    # the blanket's last edge: its red border wrapped over the front, a step where it ends
    border = _wrap_band(radius * 1.03, length, -18.0, 22.0)
    item.add(_roll_place(border, unit), Mat('silkRed', rough=0.9, bump=(0.3, 1.0 / (unit * 0.9))))
    strap = Mat('darkLeather', rough=0.6, spec=0.4)
    buckle = Mat('iron', rough=0.3, metal=0.25, spec=0.8)
    for share in (0.25, 0.7):
        x = -length / 2 + length * share
        band = shapes.moved(shapes.lathe([(radius + 0.35, 0.8), (radius + 0.35, -0.8)], 28),
                            turn=(0, 90, 0), offset=(x, 0, radius))
        item.add(_roll_place(band, unit), strap)
        item.add(_roll_place(shapes.box(1.0, 0.5, 2.2, (x, -radius - 0.45, radius * 0.9)), unit), buckle)


# --- the goods ---

@model
def foldedSilk(item, words, seed):
    """Silk folded in a stack, two pieces of `ramps` (the lower first), the upper set back on the lower: each folded
    over on itself, its fold rounded to the front, its top layer rippled so the sheen runs across it in bands."""
    lower_ramp, upper_ramp = words['ramps']
    unit = 0.01
    width, depth, thick, turn = 18.0, 10.0, 2.2, 22.0
    half_w, half_d, back = width * 0.485, depth * 0.31, depth * 0.19
    for k, ramp in enumerate((lower_ramp, upper_ramp)):
        silk = Mat(ramp, rough=0.28, spec=0.75)
        floor = k * thick * 2.0
        shift_x, shift_y = k * 0.8, k * 3.0
        pad = shapes.box(width, depth, thick, (shift_x, shift_y, floor + thick / 2))
        item.add(_scaled(shapes.moved(pad, turn=(0, 0, turn)), unit), silk, smooth=True, bevel=unit * thick * 0.45)

        # the folded-over layer: a soft pillow over the back of the piece
        def fold(x, y, depth_in, floor=floor, k=k):
            ripple = 0.3 * np.sin(x * 1.0 + y * 0.35 + k * 1.7) * _smooth(0, 1.0, depth_in)
            return floor + thick + thick * 0.7 * np.sqrt(_smooth(0, 1.6, depth_in)) + ripple
        verts, faces = _cut_sheet(lambda x, y: np.maximum(np.abs(x) - half_w, np.abs(y - back) - half_d),
                                  ((-half_w - 1, half_w + 1), (back - half_d - 1, back + half_d + 1)), 0.25, fold)
        layer = ([(x + shift_x, y + shift_y, z) for x, y, z in verts], faces)
        item.add(_scaled(shapes.moved(layer, turn=(0, 0, turn)), unit), silk)


@model
def fleece(item, words, seed):
    """Raw wool sheared and bundled in a fleece: a heap of curly locks over a slumped body, tied once round with a
    cord, knotted at the front."""
    unit = 0.012
    rng = np.random.RandomState(seed & 0x7fffffff)
    wool = Mat('wool', rough=0.95, bump=(0.35, 1.0 / (unit * 1.2)))
    body = shapes.wobble(shapes.ellipsoid((11.0, 8.0, 6.0), (0, 0, 4.5), rings=12, sides=20, flat=0.22), seed, 0.12)
    item.add(_scaled(body, unit), wool)
    for k, middle in enumerate(((-5.0, 3.0, 8.5), (4.5, 3.5, 9.0))):
        lump = shapes.wobble(shapes.ellipsoid((6.0, 5.0, 4.2), middle, rings=10, sides=16), seed + k * 9 - 5, 0.15)
        item.add(_scaled(lump, unit), wool)
    locks = 0
    while locks < 24:
        theta = rng.uniform(0, 2 * math.pi)
        phi = rng.uniform(0.15, 1.35)
        x = 11.0 * math.cos(theta) * math.sin(phi)
        if abs(x) < 1.8:   # the cord's way over the top stays clear
            continue
        y = 8.0 * math.sin(theta) * math.sin(phi)
        z = 4.5 + 6.0 * math.cos(phi)
        lock = rng.uniform(1.8, 2.6)
        curl = shapes.wobble(shapes.ellipsoid((lock, lock, lock * 0.8), (x, y, z), 6, 10), seed + locks, 0.2)
        item.add(_scaled(curl, unit), wool)
        locks += 1
    cord_points = [(0.3, -8.5 * math.cos(angle), 4.5 + 6.7 * math.sin(angle))
                   for angle in np.linspace(math.radians(-10), math.radians(190), 20)]
    cord = Mat('rope', rough=0.85, dim=0.8)
    item.add(_scaled(shapes.tube(cord_points, 0.85, 6), unit), cord)
    item.add(_scaled(shapes.ellipsoid((1.3, 1.0, 1.1), (0.3, -8.6, 5.2), 5, 8), unit), cord)


@model
def tusk(item, words, seed):
    """A tusk of ivory curving up and over, thick at its stained root (open, dark within) and tapering to a point, its
    growth lines faint across it."""
    unit = 0.012
    points = []
    for i in range(16):
        share = i / 15
        rise = 22 - math.sin(share * math.pi * 0.9) * 13 + share * 4
        points.append((share * 24 - 12, 0.0, 26 - rise))
    radii = [4.4 * (1 - share * 0.86) for share in np.linspace(0, 1, 16)]
    lines = _band((0, 0, 0), (1, 0, 0), [(unit * k * 3.0, unit * (k * 3.0 + 0.6)) for k in range(-6, 6)])
    ivory = Mat('ivory', rough=0.35, spec=0.6, pattern=('ivory', lines, 0.85))
    item.add(_tusk_place(shapes.tube(points[2:], radii[2], 12, radius_end=0.25), unit), ivory)
    root = shapes.tube(points[:3], radii[0], 12, radius_end=radii[2])
    item.add(_tusk_place(root, unit), Mat('ivory', rough=0.5, dim=0.45))
    cavity = shapes.moved(shapes.ellipsoid((0.2, radii[0] * 0.6, radii[0] * 0.6), rings=4, sides=12),
                          offset=(points[0][0] - 0.1, 0, points[0][2]))
    item.add(_tusk_place(cavity, unit), Mat('darkLeather', rough=0.9))


def _tusk_place(mesh, unit):
    """The tusk drawn in its own plane (x along, z up) in metres, leaning back from the eye as it rests."""
    return shapes.moved(_scaled(mesh, unit), turn=(-30, 0, 8))
