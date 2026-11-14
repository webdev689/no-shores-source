"""The crafting materials: ores and stone, ingots and bars, logs, boards and what a tree gives, and the sculptor's
pieces. Long things lie across the picture, their far end up and to the right, as Daggerfall lays its icons; a bar or
a block shows its front, its top and its right end, as the painted ones did."""
import math
from statistics import NormalDist

import numpy as np

from . import shapes
from .kit import ELEVATION, Mat
from .models import model

LIE = 28.0      # degrees a long thing lies turned from across the eye, its right end away
BLOCK = -24.0   # degrees a block turns so its right side shows beside its front
SQUARE = -10.0  # degrees a bar turns so its right end shows beside its front and its top lies square to the eye
EYE = np.array([0.0, -math.cos(math.radians(ELEVATION)), math.sin(math.radians(ELEVATION))])   # toward the eye


# --- shader masks: each answers a socket over the object's coordinates whose value over a half shows the pattern ---

class _Graph:
    """Shader arithmetic over one material's nodes, so a mask reads as a sum: each call adds a node and answers its
    socket. A value is a number or a socket."""

    def __init__(self, nodes, links):
        self.nodes, self.links = nodes, links

    def _feed(self, socket, value):
        if isinstance(value, (int, float, tuple)):
            socket.default_value = value
        else:
            self.links.new(value, socket)

    def math(self, operation, first, second=0.0, third=0.0):
        node = self.nodes.new('ShaderNodeMath')
        node.operation = operation
        for socket, value in zip(node.inputs, (first, second, third)):
            self._feed(socket, value)
        return node.outputs['Value']

    def xyz(self, vector):
        node = self.nodes.new('ShaderNodeSeparateXYZ')
        self.links.new(vector, node.inputs['Vector'])
        return node.outputs['X'], node.outputs['Y'], node.outputs['Z']

    def vec(self, x, y, z):
        node = self.nodes.new('ShaderNodeCombineXYZ')
        for socket, value in zip(node.inputs, (x, y, z)):
            self._feed(socket, value)
        return node.outputs['Vector']

    def local(self, coord, offset=(0.0, 0.0, 0.0), turn=0.0):
        """The coordinates in a part's own frame, where `_place(mesh, offset, turn)` set it."""
        moved = self.nodes.new('ShaderNodeVectorMath')
        moved.operation = 'SUBTRACT'
        self.links.new(coord, moved.inputs[0])
        moved.inputs[1].default_value = tuple(float(value) for value in offset)
        turned = self.nodes.new('ShaderNodeVectorRotate')
        turned.rotation_type = 'Z_AXIS'
        turned.inputs['Angle'].default_value = math.radians(-turn)
        self.links.new(moved.outputs['Vector'], turned.inputs['Vector'])
        return turned.outputs['Vector']

    def stretch(self, vector, scale):
        node = self.nodes.new('ShaderNodeVectorMath')
        node.operation = 'MULTIPLY'
        self.links.new(vector, node.inputs[0])
        node.inputs[1].default_value = tuple(float(value) for value in scale)
        return node.outputs['Vector']

    def noise(self, vector, scale, detail=2.0, fourth=0.0):
        node = self.nodes.new('ShaderNodeTexNoise')
        node.noise_dimensions = '4D'
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        node.inputs['W'].default_value = fourth
        self.links.new(vector, node.inputs['Vector'])
        return node.outputs['Fac']

    def voronoi(self, vector, scale):
        node = self.nodes.new('ShaderNodeTexVoronoi')
        node.voronoi_dimensions = '3D'
        node.feature = 'F1'
        node.inputs['Scale'].default_value = scale
        self.links.new(vector, node.inputs['Vector'])
        return node

    def length(self, across, up):
        """The length of (across, up)."""
        return self.math('SQRT', self.math('ADD', self.math('MULTIPLY', across, across), self.math('MULTIPLY', up, up)))


def _fourth(seed):
    """A noise's fourth coordinate from a seed, so two rows' patterns never fall alike."""
    return (seed * 0.6180339) % 50.0


def _cut(share, spread=0.075):
    """The noise level a `share` of a surface lies above: Blender's noise sits about a half, `spread` its spread."""
    return 0.5 + spread * NormalDist().inv_cdf(1.0 - min(max(share, 0.02), 0.98))


def _patches(share, scale, seed, detail=2.0, stretch=(1.0, 1.0, 1.0), offset=(0, 0, 0), turn=0.0):
    """Patches over `share` of a surface, `scale` their noise's cycles a metre: veins, rust, tarnish, specks."""
    cut = _cut(share)

    def mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        at = graph.stretch(graph.local(coord, offset, turn), stretch)
        return graph.math('ADD', graph.noise(at, scale, detail, _fourth(seed)), 0.5 - cut)
    return mask


def _veins(scale, seed, width=0.03, offset=(0, 0, 0), turn=0.0):
    """Thin wandering veins where a noise crosses its middle: marble's, the checks splitting a log's end."""
    def mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        field = graph.noise(graph.local(coord, offset, turn), scale, 3.0, _fourth(seed))
        return graph.math('COMPARE', field, 0.5, width)
    return mask


def _stripes(direction, period, seed, share=0.35, offset=(0, 0, 0), turn=0.0):
    """Parallel strokes across `direction` `period` metres apart, a little wavering: a chisel's tooling."""
    def mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(graph.local(coord, offset, turn))
        way_x, way_y, way_z = direction
        along = graph.math('ADD', graph.math('MULTIPLY', x, way_x),
                           graph.math('MULTIPLY_ADD', y, way_y, graph.math('MULTIPLY', z, way_z)))
        bend = graph.math('MULTIPLY', graph.noise(coord, 40.0, 1.0, _fourth(seed)), period * 0.8)
        phase = graph.math('MULTIPLY', graph.math('ADD', along, bend), 1.0 / period)
        return graph.math('LESS_THAN', graph.math('FRACT', phase), share)
    return mask


def _either(*masks):
    """Where any of `masks` shows."""
    def mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        out = masks[0](nodes, links, coord)
        for other in masks[1:]:
            out = graph.math('MAXIMUM', out, other(nodes, links, coord))
        return out
    return mask


def _grain(period, seed, offset=(0, 0, 0), turn=0.0, share=0.3, wave=0.9, axis='x'):
    """Grain along a piece's length (its own `axis`): lines across its width `period` apart (metres), bent as a
    slow noise wanders, each `share` of its period dark."""
    def mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        at = graph.local(coord, offset, turn)
        x, y, z = graph.xyz(at)
        across, slow = (y, (0.6, 8.0, 8.0)) if axis == 'x' else (x, (8.0, 0.6, 8.0))
        bend = graph.noise(graph.stretch(at, slow), 9.0, 2.0, _fourth(seed))
        phase = graph.math('MULTIPLY_ADD', across, 1.0 / period, graph.math('MULTIPLY', bend, wave))
        return graph.math('LESS_THAN', graph.math('FRACT', phase), share)
    return mask


def _rings(gap, offset=(0, 0, 0), turn=0.0, centre=(0.0, 0.0), heart=0.0, share=0.4, axis='x'):
    """A cut end's growth rings round the piece's own `axis` through `centre` (its other two coordinates), `gap`
    metres apart, each `share` of its gap dark; within `heart` of the axis all dark (the heartwood's core)."""
    def mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(graph.local(coord, offset, turn))
        across, up = (y, z) if axis == 'x' else (x, z)
        dist = graph.length(graph.math('SUBTRACT', across, centre[0]), graph.math('SUBTRACT', up, centre[1]))
        ring = graph.math('LESS_THAN', graph.math('FRACT', graph.math('MULTIPLY', dist, 1.0 / gap)), share)
        return graph.math('MAXIMUM', ring, graph.math('LESS_THAN', dist, heart))
    return mask


def _place(mesh, offset=(0.0, 0.0, 0.0), turn=0.0):
    """A part built in its own frame, set at `offset` and turned `turn` degrees about z: what `_Graph.local` undoes."""
    return shapes.moved(mesh, offset=offset, turn=(0.0, 0.0, turn))


def _turned(point, turn):
    """A point in a part's own frame, turned `turn` degrees about z as `_place` turns the part."""
    return tuple(_place(([point], []), turn=turn)[0][0])


def _disc(centre, normal, radius, sides=12):
    """A flat disc facing `normal`: the sawn end of a branch stub, a wheel's bore."""
    facing = np.asarray(normal, dtype=np.float64)
    facing /= np.linalg.norm(facing)
    side = np.cross(facing, [0.0, 0.0, 1.0])
    if np.linalg.norm(side) < 1e-6:
        side = np.cross(facing, [1.0, 0.0, 0.0])
    side /= np.linalg.norm(side)
    up = np.cross(side, facing)
    middle = np.asarray(centre, dtype=np.float64)
    verts = [tuple(middle + facing * 1e-4)] + [tuple(middle + radius * (math.cos(angle) * side + math.sin(angle) * up))
                                               for angle in np.linspace(0, 2 * math.pi, sides, endpoint=False)]
    faces = [(0, 1 + k, 1 + (k + 1) % sides) for k in range(sides)]
    return verts, faces


def _ring_plate(outer, inner, depth, base=0.0):
    """A flat ring cut from a plate `depth` thick between two loops of one length, both counter-clockwise."""
    count = len(outer)
    verts = ([(x, y, base) for x, y in outer] + [(x, y, base) for x, y in inner]
             + [(x, y, base + depth) for x, y in outer] + [(x, y, base + depth) for x, y in inner])
    low_out, low_in, high_out, high_in = 0, count, 2 * count, 3 * count
    faces = []
    for k in range(count):
        k1 = (k + 1) % count
        faces += [(high_out + k, high_out + k1, high_in + k1, high_in + k),
                  (low_out + k, low_in + k, low_in + k1, low_out + k1),
                  (low_out + k, low_out + k1, high_out + k1, high_out + k),
                  (low_in + k, high_in + k, high_in + k1, low_in + k1)]
    return verts, faces


# --- ores and stone ---

def _crystal(radius, height, tip):
    """A six-sided crystal standing on its foot, its point `tip` above its `height`: its alternate facets as two
    meshes, so each can take its own step of light and the six faces read apart."""
    verts = []
    for k in range(6):
        angle = math.pi * k / 3
        verts += [(radius * 0.85 * math.cos(angle), radius * 0.85 * math.sin(angle), 0.0),
                  (radius * math.cos(angle), radius * math.sin(angle), height)]
    verts.append((0.0, 0.0, height + tip))
    halves = ([], [])
    for k in range(6):
        k1 = (k + 1) % 6
        halves[k % 2].extend([(2 * k, 2 * k1, 2 * k1 + 1, 2 * k + 1), (2 * k + 1, 2 * k1 + 1, 12)])
    return (verts, halves[0]), (verts, halves[1])


def _facing(verts, centre, radii, facing=0.35):
    """A lump's vertices that face the eye, each with its outward way: where its ore can crop out and be seen."""
    points = np.asarray(verts, dtype=np.float64)
    normal = (points - np.asarray(centre)) / np.asarray(radii) ** 2
    normal /= np.linalg.norm(normal, axis=1, keepdims=True)
    keep = normal @ EYE > facing
    return points[keep], normal[keep]


@model
def ore(item, words, seed):
    """A lump of `rock` with its ore in it: `vein` the ore's ramp, showing as patches through the rock and as metal
    nuggets cropping out of it, `fleck` how little of the rock it fills (0.55 much, 0.72 little), `glints` how many
    of its nuggets catch the light; `crystals` six-sided crystals of it standing out of the top; `glassy` a chunk
    broken in flat planes, as volcanic glass is."""
    rock, vein = words['rock'], words['vein']
    fleck, crystals = words.get('fleck', 0.6), words.get('crystals', 0)
    glassy, glints = words.get('glassy', False), words.get('glints', 4)
    rng = np.random.RandomState(seed & 0x7fffffff)
    # the crystals carry the ore where they stand, so less of it runs through the rock
    share = float(np.clip((0.8 - fleck) * 1.9, 0.12, 0.6)) * (0.6 if crystals else 1.0)
    radii, centre = (0.046, 0.034, 0.03), (0.0, 0.0, 0.021)
    vein_look = (vein, _patches(share, 34.0, seed, 3.0), 1.6 if vein == rock else 1.05)
    if glassy:
        # glass breaks in planes: few, flat facets, each one crisp tone, and a glassy shine on them
        body = shapes.wobble(shapes.ellipsoid(radii, centre, rings=4, sides=7, flat=0.2), seed, 0.3)
        item.add(body, Mat(rock, rough=0.1, spec=1.0, steps=5, dim=1.3, pattern=vein_look), smooth=False)
        chip = shapes.ellipsoid((0.016, 0.013, 0.012), (0.03, 0.006, 0.016), rings=3, sides=5)
        item.add(shapes.wobble(chip, seed + 2, 0.25), Mat(rock, rough=0.1, spec=1.0, steps=5), smooth=False)
        points, _ = _facing(body[0], centre, radii, 0.5)
        for k in range(min(glints, len(points))):
            item.sparkle(points[rng.randint(len(points))] + EYE * 0.002, ramp=vein, arm=1 if k == 0 else 0)
        return
    main = shapes.wobble(shapes.ellipsoid(radii, centre, rings=10, sides=18, flat=0.25), seed, 0.16)
    knob = shapes.ellipsoid((0.022, 0.019, 0.017), (0.026, 0.012, 0.034), rings=8, sides=12)
    rock_mat = Mat(rock, rough=0.85, bump=(0.5, 120.0), pattern=vein_look)
    item.add(main, rock_mat)
    item.add(shapes.wobble(knob, seed + 7, 0.2), rock_mat)
    # the ore crops out in nuggets, more of them the more of the rock it fills; the first ones catch the light
    metal = Mat(vein, rough=0.28, metal=0.25, spec=0.85)
    points, normals = _facing(main[0], centre, radii)
    nuggets = max(int(round(1 + share * 6)), min(glints, 6))
    picks = rng.choice(len(points), size=min(nuggets, len(points)), replace=False)
    for k, i in enumerate(picks):
        size = rng.uniform(0.005, 0.0075) * (1.0 if k < 1 + share * 6 else 0.6)
        at = points[i] - normals[i] * size * 0.35
        nugget = shapes.ellipsoid((size, size * 0.85, size * 0.7), tuple(at), rings=5, sides=7)
        item.add(shapes.wobble(nugget, seed + 11 + k, 0.25), metal, smooth=False)
        if k < glints:
            item.sparkle(at + normals[i] * size * 0.7 + np.array([-0.3, -0.2, 0.5]) * size, ramp=vein, arm=0)
    facets = (Mat(vein, rough=0.15, spec=0.9, steps=5, glow=0.12, dim=1.15),
              Mat(vein, rough=0.15, spec=0.9, steps=5, glow=0.12, dim=0.7))
    for i in range(crystals):
        x = -0.024 + 0.048 * (i + 0.5) / crystals + rng.uniform(-0.002, 0.002)
        y = rng.uniform(-0.004, 0.006)
        top = centre[2] + radii[2] * math.sqrt(max(0.05, 1 - (x / radii[0]) ** 2 - (y / radii[1]) ** 2))
        lean = -x / 0.024 * 12 + rng.uniform(-4, 4)
        place = dict(offset=(x, y, top - 0.01), turn=(rng.uniform(2, 8), lean, rng.uniform(0, 60)))
        for half, mat in zip(_crystal(0.0046, rng.uniform(0.029, 0.035), 0.008), facets):
            item.add(shapes.moved(half, **place), mat, smooth=False)


def _gear(teeth, outer, root, inner, depth):
    """A toothed wheel's rim lying flat, `teeth` teeth reaching from `root` to `outer`, open to `inner` within."""
    step = 2 * math.pi / teeth
    angles, reaches = [], []
    for i in range(teeth):
        for share, reach in ((0.0, root), (0.16, outer), (0.44, outer), (0.6, root), (0.8, root)):
            angles.append(i * step + share * step)
            reaches.append(reach)
    outline = [(reach * math.cos(angle), reach * math.sin(angle)) for angle, reach in zip(angles, reaches)]
    hole = [(inner * math.cos(angle), inner * math.sin(angle)) for angle in angles]
    return _ring_plate(outline, hole, depth)


@model
def scrap(item, words, seed):
    """Scrap of a fallen machine in `metal`: a toothed wheel with its spokes and hub leant over a bent bar, an iron
    plate with four rivets propped behind them, the metal tarnished in patches."""
    metal = words['metal']
    worn = Mat(metal, rough=0.32, metal=0.25, spec=0.8, pattern=(metal, _patches(0.3, 60.0, seed), 0.62))
    # the wheel leans back against the bar, its face turned up toward the eye
    lean = dict(offset=(-0.016, 0.006, 0.04), turn=(56, 0, -10))
    spokes = [shapes.moved(shapes.box(0.024, 0.0075, 0.0075, (0.02, 0, 0.0045)), turn=(0, 0, angle))
              for angle in (30, 120, 210, 300)]
    item.add(shapes.moved(shapes.joined(_gear(8, 0.047, 0.037, 0.027, 0.009), *spokes), **lean), worn, smooth=False)
    hub = shapes.lathe([(0.0045, 0.014), (0.011, 0.014), (0.0125, 0.011), (0.0125, -0.002)], sides=14, top=True,
                       foot=True)
    item.add(shapes.moved(hub, **lean), worn, smooth=False)
    item.add(shapes.moved(_disc((0, 0, 0.0142), (0, 0, 1), 0.0048, 10), **lean), Mat('iron', rough=0.8, dim=0.3),
             smooth=False)
    bar = shapes.tube([(-0.066, -0.026, 0.006), (-0.024, -0.034, 0.006), (0.004, -0.014, 0.013),
                       (0.03, -0.028, 0.007), (0.07, -0.01, 0.007)], 0.0058, sides=4)
    item.add(bar, worn, smooth=False)
    iron = Mat('iron', rough=0.55, metal=0.2, spec=0.6, pattern=('rust', _patches(0.25, 90.0, seed + 1), 1.0))
    plate_at = dict(offset=(0.05, 0.04, 0.04), turn=(62, 0, 14))
    item.add(shapes.moved(shapes.box(0.046, 0.04, 0.005), **plate_at), iron, smooth=False, bevel=0.001)
    for x, y in ((-0.015, -0.013), (0.015, -0.013), (-0.015, 0.013), (0.015, 0.013)):
        rivet = shapes.ellipsoid((0.004, 0.004, 0.003), (x, y, 0.0025), rings=4, sides=8, flat=0.5)
        item.add(shapes.moved(rivet, **plate_at), Mat('iron', rough=0.3, metal=0.2, spec=0.9, dim=1.2))


@model
def stoneLump(item, words, seed):
    """A lump of rough `rock` broken off the face: chipped in planes, specked through, a knob broken from its side."""
    rock = words['rock']
    stone = Mat(rock, rough=0.9, bump=(0.35, 70.0), steps=6, pattern=(rock, _patches(0.16, 110.0, seed, 1.0), 0.62))
    body = shapes.ellipsoid((0.056, 0.042, 0.042), (0.006, 0, 0.03), rings=6, sides=10, flat=0.25)
    item.add(shapes.wobble(body, seed, 0.18), stone, smooth=False)
    knob = shapes.ellipsoid((0.028, 0.024, 0.024), (-0.04, -0.006, 0.026), rings=5, sides=8)
    item.add(shapes.wobble(knob, seed + 2, 0.2), stone, smooth=False)


def _block_with_boss(item, size, centre, turn, margin_mat, boss_mat, margin=0.012, proud=0.003, bevel=0.003):
    """A dressed block: its faces drafted smooth round their edges, each face's middle left rough and standing
    `proud` of them (a boss), as a mason works a block with the chisel."""
    width, depth, height = size
    item.add(_place(shapes.box(width, depth, height), centre, turn), margin_mat, smooth=False, bevel=bevel)
    inner_w, inner_d, inner_h = width - 2 * margin, depth - 2 * margin, height - 2 * margin
    bosses = [shapes.box(inner_w, inner_d, proud, (0, 0, height / 2)),
              shapes.box(inner_w, proud, inner_h, (0, -depth / 2, 0)),
              shapes.box(proud, inner_d, inner_h, (width / 2, 0, 0)),
              shapes.box(proud, inner_d, inner_h, (-width / 2, 0, 0))]
    for boss in bosses:
        item.add(_place(boss, centre, turn), boss_mat, smooth=False, bevel=proud * 0.4)


@model
def cutStone(item, words, seed):
    """A dressed block of `rock`: smooth drafted margins round each face, specked through, and a boss in each face's
    middle tooled in the chisel's strokes."""
    rock = words['rock']
    margin = Mat(rock, rough=0.6, pattern=(rock, _patches(0.14, 110.0, seed, 1.0), 0.62), dim=1.05)
    boss = Mat(rock, rough=0.95, bump=(0.35, 60.0), pattern=(rock, _stripes((1.0, 0.5, 1.3), 0.015, seed), 0.74),
               dim=0.9)
    _block_with_boss(item, (0.13, 0.1, 0.085), (0, 0, 0.0425), BLOCK, margin, boss)


@model
def mortar(item, words, seed):
    """A wooden pail of mortar, its staves bound by two iron hoops, the mortar heaped in its mouth and the trowel
    stood in it."""
    height, top_r, foot_r = 0.1, 0.062, 0.053

    def staves(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(coord)
        angle = graph.math('ARCTAN2', y, x)
        seam = graph.math('LESS_THAN', graph.math('FRACT', graph.math('MULTIPLY', angle, 13 / (2 * math.pi))), 0.16)
        streak = graph.noise(graph.stretch(coord, (6.0, 6.0, 0.4)), 30.0, 2.0, _fourth(seed))
        return graph.math('MAXIMUM', seam, graph.math('GREATER_THAN', streak, 0.6))
    wood = Mat('wood', rough=0.85, pattern=('wood', staves, 0.55))
    item.add(shapes.lathe([(top_r, height), (foot_r, 0.0)], sides=26, foot=True), wood)
    item.add(shapes.moved(shapes.torus(top_r - 0.002, 0.004, 26, 6), offset=(0, 0, height)), wood)
    iron = Mat('iron', rough=0.45, metal=0.2, spec=0.7)
    for low in (0.018, 0.074):
        reach_low, reach_high = (foot_r + (top_r - foot_r) * (low + rise) / height + 0.0018 for rise in (0.0, 0.009))
        item.add(shapes.lathe([(reach_high, low + 0.009), (reach_low, low)], sides=26), iron)
    heap = shapes.lathe([(1e-4, height + 0.022), (0.025, height + 0.018), (0.045, height + 0.01),
                         (top_r - 0.003, height + 0.002)], sides=22, top=True, foot=True)
    item.add(shapes.wobble(heap, seed, 0.08),
             Mat('mortar', rough=0.95, bump=(0.6, 140.0), pattern=('mortar', _patches(0.25, 90.0, seed), 0.75)))
    # the trowel: a steel blade stuck point down in the heap, its shank rising to a wooden handle
    at = dict(offset=(0.02, -0.01, height + 0.016), turn=(-12, 14, -12))
    blade = shapes.prism([(-0.028, 0.05), (0.0, 0.0), (0.028, 0.05)], 0.003, -0.0015)
    item.add(shapes.moved(shapes.moved(blade, turn=(90, 0, 0)), **at), Mat('steel', rough=0.25, metal=0.25, spec=0.9),
             smooth=False)
    shank = shapes.tube([(0, 0, 0.049), (0, 0.003, 0.062), (0.005, 0.004, 0.072)], 0.0026, 6)
    item.add(shapes.moved(shank, **at), iron)
    handle = shapes.tube([(0.004, 0.004, 0.071), (0.022, 0.005, 0.08), (0.042, 0.006, 0.086)], 0.0065, 8,
                         radius_end=0.0058)
    item.add(shapes.moved(handle, **at), Mat('wood', rough=0.7, dim=1.1))


@model
def charcoal(item, words, seed):
    """Lumps of charcoal heaped two and one, each broken across its grain in cracks, a dull sheen on them."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    lumps = [((-0.026, -0.008, 0.017), LIE - 8, (0.03, 0.02, 0.018)),
             ((0.03, 0.004, 0.017), LIE + 10, (0.029, 0.021, 0.018)),
             ((0.002, 0.01, 0.044), LIE - 2, (0.03, 0.02, 0.019))]
    for k, (at, turn, radii) in enumerate(lumps):
        cracks = _either(_grain(0.013, seed + k, at, turn, share=0.26, wave=0.25, axis='y'),
                         _grain(0.011, seed + 5 + k, at, turn, share=0.14, wave=0.5))
        # lifted a step: the ramp is so dark its sheen and cracks would sink together
        mat = Mat('charcoal', rough=0.32, spec=0.8, bump=(0.4, 160.0), dim=1.3, pattern=('charcoal', cracks, 0.3))
        body = shapes.wobble(shapes.ellipsoid(radii, rings=6, sides=9), seed + k, 0.12)
        item.add(_place(body, at, turn), mat, smooth=False)
    for k in range(3):
        x, y, z = lumps[k][0]
        item.sparkle((x - 0.008 + rng.uniform(-0.004, 0.004), y - 0.006, z + 0.012), ramp='charcoal', arm=0)


@model
def resin(item, words, seed):
    """Drops of amber resin bled onto a chip of pine bark: the chip's pale wood under its plated bark, the drops
    glossy, one running down its side."""
    outline = [(-0.056, -0.016), (-0.03, -0.03), (0.02, -0.028), (0.058, -0.012), (0.056, 0.02), (0.01, 0.03),
               (-0.04, 0.024), (-0.06, 0.006)]
    wood = Mat('pine', rough=0.8, pattern=('pine', _grain(0.004, seed, (0, 0, 0), LIE, 0.3), 0.75))
    item.add(_place(shapes.prism(outline, 0.004), (0, 0, 0), LIE), wood, smooth=False)
    plates = _either(_grain(0.007, seed + 1, (0, 0, 0), LIE, 0.22, wave=1.6),
                     _grain(0.012, seed + 2, (0, 0, 0), LIE, 0.14, wave=0.4, axis='y'))
    bark = Mat('barkPine', rough=0.95, bump=(0.7, 150.0), pattern=('barkPine', plates, 0.45))
    top = [(x * 0.93, y * 0.86) for x, y in outline]
    item.add(_place(shapes.prism(top, 0.006, 0.004), (0, 0, 0), LIE), bark, smooth=False, bevel=0.0015)
    amber = Mat('amber', rough=0.06, spec=1.0, glow=0.22)
    drops = [(-0.022, -0.004, 0.0135, 0.011), (0.014, 0.008, 0.011, 0.0095), (0.034, -0.012, 0.0075, 0.0065)]
    for k, (x, y, radius, rise) in enumerate(drops):
        at = _turned((x, y, 0.0), LIE)
        drop = shapes.ellipsoid((radius, radius * 0.9, rise), (at[0], at[1], 0.0095), rings=8, sides=14, flat=0.42)
        item.add(shapes.wobble(drop, seed + k, 0.06), amber)
        item.sparkle((at[0] - radius * 0.45, at[1] - radius * 0.4, 0.0095 + rise * 0.75), ramp='amber',
                     arm=1 if k == 0 else 0)
    x, y = _turned((drops[0][0], drops[0][1], 0.0), LIE)[:2]
    run = shapes.tube([(x, y - 0.008, 0.012), (x - 0.001, y - 0.022, 0.01), (x + 0.001, y - 0.029, 0.004),
                       (x, y - 0.031, -0.003)], 0.0042, 8, radius_end=0.0032)
    item.add(run, amber)


# --- metal ---

def _stroke(start, finish, width, height, base):
    """A straight stroke from `start` to `finish` (x, y), `width` across, raised `height` from `base`."""
    (x0, y0), (x1, y1) = start, finish
    stroke = shapes.box(math.hypot(x1 - x0, y1 - y0) + width * 0.6, width, height, (0, 0, base + height / 2))
    return shapes.moved(stroke, offset=((x0 + x1) / 2, (y0 + y1) / 2, 0),
                        turn=(0, 0, math.degrees(math.atan2(y1 - y0, x1 - x0))))


def _mark_mesh(kind, top_len, top_depth, surface):
    """The mark struck on an ingot's top (`top_len` x `top_depth`, its face at `surface`): a raised relief half the
    top long and three quarters of it deep, its strokes about a texel and a half wide at the ingot's size, so its
    shape still reads in a few texels. The eye sees the top foreshortened, so strokes across it are drawn wider."""
    relief = 0.0024
    reach_x, reach_y = top_len * 0.25, top_depth * 0.38
    wide, deep = top_len * 0.075, top_depth * 0.2    # a stroke's width along the bar and across it

    def stroke(start, finish, width):
        return _stroke(start, finish, width, relief, surface)
    if kind == 'stamp':
        edge_x = reach_x * 0.8
        outer = [(-edge_x, -reach_y), (edge_x, -reach_y), (edge_x, reach_y), (-edge_x, reach_y)]
        inner = [(-edge_x + wide, -reach_y + deep), (edge_x - wide, -reach_y + deep), (edge_x - wide, reach_y - deep),
                 (-edge_x + wide, reach_y - deep)]
        return _ring_plate(outer, inner, relief, surface)
    if kind == 'groove':
        return stroke((-reach_x * 1.25, -reach_y * 0.15), (reach_x * 1.25, reach_y * 0.15), deep * 1.1)
    if kind == 'ring':
        loop = [(reach_x * 0.75 * math.cos(angle), reach_y * 1.05 * math.sin(angle))
                for angle in np.linspace(0, 2 * math.pi, 20, endpoint=False)]
        return _ring_plate(loop, [(x * 0.58, y * 0.48) for x, y in loop], relief, surface)
    if kind == 'moon':
        outer = [(reach_x * 0.65 * math.cos(angle), reach_y * math.sin(angle))
                 for angle in np.linspace(0.85, 2 * math.pi - 0.85, 14)]
        inner = [(reach_x * 0.3 + reach_x * 0.5 * math.cos(angle), reach_y * 0.78 * math.sin(angle))
                 for angle in np.linspace(2 * math.pi - 1.3, 1.3, 10)]
        return shapes.prism(outer + inner, relief, surface)
    if kind == 'star':
        # a four-pointed star: its points along and across the bar, a texel's waist between them
        outline = []
        for k in range(8):
            angle, reach = math.pi * k / 4, (1.0 if k % 2 == 0 else 0.3)
            outline.append((reach_x * 0.85 * reach * math.cos(angle), reach_y * 1.05 * reach * math.sin(angle)))
        return shapes.prism(outline, relief, surface)
    if kind == 'chevron':
        return shapes.joined(stroke((-reach_x * 0.9, reach_y * 0.8), (0, -reach_y * 0.75), wide * 1.1),
                             stroke((0, -reach_y * 0.75), (reach_x * 0.9, reach_y * 0.8), wide * 1.1))
    if kind == 'dots':
        return shapes.joined(*[shapes.ellipsoid((wide * 0.85, deep * 0.95, relief), (x * reach_x * 0.62, 0, surface),
                                                rings=4, sides=10) for x in (-1, 0, 1)])
    if kind == 'cross':
        return shapes.joined(stroke((-reach_x * 0.6, -reach_y), (reach_x * 0.6, reach_y), wide * 1.15),
                             stroke((-reach_x * 0.6, reach_y), (reach_x * 0.6, -reach_y), wide * 1.15))
    if kind == 'rune':
        path = [(-reach_x, -reach_y * 0.8), (-reach_x * 0.5, reach_y * 0.9), (0, -reach_y * 0.8),
                (reach_x * 0.5, reach_y * 0.9), (reach_x, -reach_y * 0.8)]
        return shapes.joined(*[stroke(path[k], path[k + 1], wide) for k in range(4)])
    if kind == 'hammer':
        return shapes.joined(stroke((-reach_x * 0.7, reach_y * 0.55), (reach_x * 0.7, reach_y * 0.55), deep * 1.5),
                             stroke((0, reach_y * 0.5), (0, -reach_y * 1.05), wide * 1.1))
    raise KeyError(f'ingot: no mark "{kind}"')


def _mark_mat(metal, mark):
    """A mark's look: struck into the metal a deep shade of it, or inlaid in its own ramp (`ramp`, as bright as `t`);
    an ember's mark glows."""
    ramp = mark.get('ramp')
    if ramp is None:
        return Mat(metal, rough=0.8, spec=0.1, dim=0.3)
    if ramp == 'ember':
        return Mat(ramp, rough=0.6, glow=0.6)
    return Mat(ramp, rough=0.3, metal=0.2, spec=0.8, dim=0.6 + 0.45 * mark.get('t', 0.5))


def ingot_parts(item, metal, mark=None, length=0.1, height=0.026, depth=0.05, offset=(0, 0, 0), turn=SQUARE):
    """A cast bar of `metal`: its top narrower than its foot, its edges bevelled, `mark` struck on its top; a `rust`
    mark eats it in patches instead. Its sides are a step darker than its top: the key light lays them close, and the
    painted bars kept top, front and end apart."""
    top_len, top_depth = length * 0.8, depth * 0.74
    body = shapes.frustum((length, depth), (top_len, top_depth), height)
    rust = mark and mark['kind'] == 'rust'
    pattern = ('rust', _patches(0.3, 140.0, 7, 2.0), 1.0) if rust else None
    look = dict(rough=0.3, metal=0.25, spec=0.8, pattern=pattern, bump=(0.25, 160.0) if rust else None)
    bevel = height * 0.1
    item.add(_place(body, offset, turn), Mat(metal, dim=0.95, **look), smooth=False, bevel=bevel)
    top = shapes.box(top_len - 2 * bevel, top_depth - 2 * bevel, 0.0004, (0, 0, height))
    # a metal's diffuse light is a quarter less, so a level top would fall to its ramp's middle - for ebony or daedric
    # near black; lifted, the top takes its ramp's bright steps, as a painted bar's did
    item.add(_place(top, offset, turn), Mat(metal, dim=1.4, **look), smooth=False)
    if not mark or rust:
        return
    relief = _mark_mesh(mark['kind'], top_len, top_depth, height + 0.0002)
    item.add(_place(relief, offset, turn), _mark_mat(metal, mark), smooth=False)


@model
def ingot(item, words, seed):
    """One ingot of `metal`, its own `mark` struck on it."""
    ingot_parts(item, words['metal'], words.get('mark'))


@model
def barStack(item, words, seed):
    """Bars stacked: two side by side and one laid over them (`pyramid`), or one on another (`two`)."""
    metal, mark, rows = words['metal'], words.get('mark'), words.get('rows', 'pyramid')
    bar = dict(length=0.09, height=0.022, depth=0.04)
    if rows == 'pyramid':
        # the lower two stand a little apart along their length too, so each shows its own end
        ingot_parts(item, metal, None, offset=_turned((0.014, 0.024, 0), SQUARE), **bar)
        ingot_parts(item, metal, None, offset=_turned((-0.014, -0.024, 0), SQUARE), **bar)
        ingot_parts(item, metal, mark, offset=_turned((0.0, 0.0, 0.022), SQUARE), **bar)
    else:
        ingot_parts(item, metal, None, **bar)
        ingot_parts(item, metal, mark, offset=_turned((0.006, 0.006, 0.022), SQUARE), **bar)


# --- wood ---

SKEW = 30.0   # degrees a log's near end is sawn aslant, so its rings face the eye


def _bark_relief(pattern, seed):
    """A bark's habit as its radius's share at (angle round the log, place along it from its middle) and the mask
    that darkens its furrows or marks it: deep lengthwise fissures, scaled plates, a skin with lenticels across it,
    a pale skin with dark eyes, or smooth with faint streaks. The two share one formula so the dark lies in the dips."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    phase = rng.uniform(0, 2 * math.pi)
    if pattern == 'fissure':
        ridges = 11

        def relief(angle, x):
            wave = math.cos(ridges * angle + 0.9 * math.sin(x * 28 + phase))
            return 1 - 0.13 * max(0.0, (wave - 0.35) / 0.65) + 0.02 * math.sin(3 * angle + x * 7)

        def mask(graph, x, angle):
            wave = graph.math('MULTIPLY', graph.math('SINE', graph.math('MULTIPLY_ADD', x, 28.0, phase)), 0.9)
            ridge = graph.math('COSINE', graph.math('MULTIPLY_ADD', angle, ridges, wave))
            return graph.math('GREATER_THAN', ridge, 0.55)
        return relief, mask
    if pattern == 'plates':
        rows, plate = 9, 0.032

        def relief(angle, x):
            row = angle * rows / (2 * math.pi)
            across, along = row % 1.0, (x / plate + 0.5 * math.floor(row) + 10) % 1.0
            return 1 + 0.07 * math.sin(math.pi * across) ** 0.6 * math.sin(math.pi * along) ** 0.6 - 0.035

        def mask(graph, x, angle):
            row = graph.math('MULTIPLY', angle, rows / (2 * math.pi))
            between_rows = graph.math('LESS_THAN', graph.math('FRACT', row), 0.2)
            along = graph.math('FRACT', graph.math('ADD', graph.math('MULTIPLY', x, 1 / plate),
                                                   graph.math('MULTIPLY', graph.math('FLOOR', row), 0.5)))
            return graph.math('MAXIMUM', between_rows, graph.math('LESS_THAN', along, 0.16))
        return relief, mask
    if pattern == 'lenticel':
        period = 0.017

        def relief(angle, x):
            return 1 + 0.025 * (((x / period) % 1.0) < 0.25) + 0.01 * math.sin(2 * angle + phase)

        def mask(graph, x, angle):
            band = graph.math('LESS_THAN', graph.math('FRACT', graph.math('MULTIPLY', x, 1 / period)), 0.25)
            broken = graph.math('GREATER_THAN', graph.math('SINE', graph.math('MULTIPLY_ADD', angle, 5.0, phase)), -0.3)
            return graph.math('MULTIPLY', band, broken)
        return relief, mask
    if pattern == 'eyes':
        def relief(angle, x):
            return 1 + 0.012 * math.sin(4 * angle + x * 12 + phase)
        return relief, None

    def relief(angle, x):
        return 1 + 0.015 * math.sin(2 * angle + x * 9 + phase)

    def mask(graph, x, angle):
        wave = graph.math('MULTIPLY', graph.math('SINE', graph.math('MULTIPLY_ADD', x, 14.0, phase)), 0.5)
        return graph.math('GREATER_THAN', graph.math('COSINE', graph.math('MULTIPLY_ADD', angle, 7.0, wave)), 0.82)
    return relief, mask


def _log_mesh(radius, length, relief, sides=44, segments=24, taper=0.94, skew=SKEW):
    """A log's bark along x about its middle, each ring's radius times `relief(angle, x)`, its near end sawn aslant by
    `skew` degrees toward the eye; and its two end rings, near first."""
    shear = math.tan(math.radians(skew))
    verts, faces = [], []
    for i in range(segments + 1):
        x = -length / 2 + length * i / segments
        ring_radius = radius * (1 + (taper - 1) * i / segments)
        for k in range(sides):
            angle = 2 * math.pi * k / sides
            reach = ring_radius * relief(angle, x)
            y, z = reach * math.cos(angle), reach * math.sin(angle)
            verts.append((x - shear * y * (1 - i / segments), y, z))
    for i in range(segments):
        for k in range(sides):
            k1 = (k + 1) % sides
            faces.append((i * sides + k, i * sides + k1, (i + 1) * sides + k1, (i + 1) * sides + k))
    return (verts, faces), verts[:sides], verts[-sides:]


def _end_cap(ring, share):
    """A sawn end inside its ring of bark: the bark's rim (the ring to `share` of it) and the wood within."""
    points = np.asarray(ring, dtype=np.float64)
    mid = points.mean(axis=0)
    inner = mid + (points - mid) * share
    count = len(ring)
    rim = ([tuple(p) for p in points] + [tuple(p) for p in inner],
           [(k, (k + 1) % count, count + (k + 1) % count, count + k) for k in range(count)])
    face = ([tuple(mid)] + [tuple(p) for p in inner], [(0, 1 + (k + 1) % count, 1 + k) for k in range(count)])
    return rim, face


@model
def log(item, words, seed):
    """A log lying across the picture, its near end sawn to show its rings: `bark` its bark's ramp and `pattern` its
    habit (fissure, plates, lenticel, eyes, smooth), `wood` its cut end's ramp, `hw` its girth, `len` its length,
    `knot` a sawn branch stub, `ringGap` its rings' spacing."""
    girth = words.get('hw', 5) * 0.011
    length = words.get('len', 19) * 0.0115
    pattern, wood = words.get('pattern'), words['wood']
    at = (0.0, 0.0, girth)
    relief, furrows = _bark_relief(pattern, seed)

    def bark_mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(graph.local(coord, at, LIE))
        if pattern == 'eyes':
            # a seed's own place in the cells, so two logs' eyes never fall alike
            shift = graph.vec(graph.math('ADD', x, _fourth(seed)), y, z)
            spot = graph.voronoi(graph.stretch(shift, (0.4, 1.0, 1.0)), 36.0)
            near = graph.math('LESS_THAN', spot.outputs['Distance'], 0.32)
            chosen = graph.math('GREATER_THAN', graph.xyz(spot.outputs['Color'])[0], 0.2)
            return graph.math('MULTIPLY', near, chosen)
        return furrows(graph, x, graph.math('ARCTAN2', z, y))
    if pattern == 'eyes':
        bark = Mat(words['bark'], rough=0.7, bump=(0.2, 120.0), pattern=('ink', bark_mask, 0.8))
    else:
        bump = {'fissure': (0.5, 110.0), 'plates': (0.45, 80.0), 'lenticel': (0.2, 150.0)}.get(pattern, (0.12, 90.0))
        bark = Mat(words['bark'], rough=0.9, bump=bump, pattern=(words['bark'], bark_mask, 0.42))
    body, near, far = _log_mesh(girth, length, relief)
    item.add(_place(body, at, LIE), bark)
    gap = words.get('ringGap', 1.4) * 0.0085
    # rings, and a check or two split across the face as it dried
    rings = _either(_rings(gap, at, LIE, heart=gap * 0.6), _veins(70.0, seed, 0.025, at, LIE))
    end = Mat(wood, rough=0.8, pattern=(wood, rings, 0.62), dim=1.05)
    for ring in (near, far):
        rim, face = _end_cap(ring, 0.87)
        item.add(_place(rim, at, LIE), Mat(words['bark'], rough=0.9, dim=0.8), smooth=False)
        item.add(_place(face, at, LIE), end, smooth=False)
    if words.get('knot'):
        # a branch stub reaching up toward the eye, sawn off short: its end pale wood in a ring of bark
        way = np.array([0.0, -0.55, 0.84])
        base = np.array([-length * 0.12, 0.0, 0.0]) + way * girth * 0.8
        tip = base + way * girth * 0.55
        stub = shapes.tube([tuple(base), tuple(tip)], girth * 0.33, 10, radius_end=girth * 0.27, caps=False)
        item.add(_place(stub, at, LIE), Mat(words['bark'], rough=0.9, dim=0.9))
        item.add(_place(_disc(tip, way, girth * 0.27, 10), at, LIE), Mat(wood, rough=0.8, dim=0.95), smooth=False)
        item.add(_place(_disc(tip + way * 0.0003, way, girth * 0.1, 8), at, LIE), Mat(wood, rough=0.8, dim=0.55),
                 smooth=False)


def _board(item, wood, size, offset, seed, grain, flecks, figure, knot=None):
    """One sawn board lying flat along x: grain down its length, its ends' rings, ray `flecks` that catch the light,
    a ribbon `figure` across it and a `knot`, each of these its own thin part laid on the top."""
    length, width, thick = size
    rng = np.random.RandomState(seed & 0x7fffffff)
    period = max(grain, 1.0) * 0.034
    lines = _grain(period, seed, offset, LIE, share=0.34, wave=1.1)
    body = Mat(wood, rough=0.7, bump=(0.15, 200.0), pattern=(wood, lines, 0.68))
    item.add(_place(shapes.box(length, width, thick, (0, 0, thick / 2)), offset, LIE), body, smooth=False,
             bevel=0.0015)
    ends = Mat(wood, rough=0.85, dim=0.9, pattern=(wood, _rings(0.008, offset, LIE, (width * 0.3, -0.05)), 0.6))
    for side in (-1, 1):
        cap = shapes.box(0.0012, width - 0.002, thick - 0.002, (side * (length / 2 + 0.0006), 0, thick / 2))
        item.add(_place(cap, offset, LIE), ends, smooth=False)
    top = thick + 0.0004
    if figure:
        dark = Mat(wood, rough=0.6, dim=0.62)
        bands = int(figure) + 1
        for k in range(bands):
            y = -width / 2 + width * (k + 0.5) / bands + rng.uniform(-0.006, 0.006)
            path = [(x, y + 0.006 * math.sin(x * 14 + k * 2.1), top) for x in np.linspace(-length, length, 9) * 0.47]
            strip = shapes.moved(shapes.tube(path, 0.0035, 4), scale=(1, 1, 0.25))
            item.add(_place(strip, offset, LIE), dark, smooth=False)
    if flecks:
        bright = Mat(wood, rough=0.5, glow=0.82)
        for k in range(int(flecks)):
            x, y = rng.uniform(-0.42, 0.42) * length, rng.uniform(-0.36, 0.36) * width
            fleck = shapes.ellipsoid((0.007, 0.0028, 0.0006), (x, y, top), rings=3, sides=8)
            item.add(_place(fleck, offset, LIE), bright, smooth=False)
    if knot:
        x, y = knot
        ring = shapes.ellipsoid((0.0105, 0.0075, 0.0008), (x, y, top), rings=3, sides=12)
        item.add(_place(ring, offset, LIE), Mat(wood, rough=0.6, dim=0.42), smooth=False)
        heart = shapes.ellipsoid((0.0045, 0.0032, 0.0012), (x - 0.001, y + 0.001, top + 0.0004), rings=3, sides=10)
        item.add(_place(heart, offset, LIE), Mat(wood, rough=0.6, dim=0.78), smooth=False)


@model
def sawnBoards(item, words, seed):
    """Two sawn boards of `wood`, the one laid square on the other: `grain` how wide its grain lies (texels), `flecks`
    pale ray flecks on the faces, `figure` a ribbon figure in so many dark bands, `knot` a dark knot on the top
    board."""
    wood = words['wood']
    grain, flecks, figure = words.get('grain', 1.7), words.get('flecks', 0), words.get('figure')
    size = (0.4, 0.15, 0.032)
    # the top board lies back across the lower, so the lower one's face shows before it
    _board(item, wood, size, (0.0, 0.0, 0.0), seed, grain, flecks, figure)
    _board(item, wood, size, _turned((0.025, 0.085, size[2]), LIE), seed + 1, grain, flecks, figure,
           knot=(-0.05, -0.02) if words.get('knot') else None)


@model
def heartwood(item, words, seed):
    """A quarter cut from the heart of an old log, resting on one split face: its end shows the heart's dark rings
    within a rim of bark, its split faces pale with the long grain, its bark fissured behind."""
    radius, length = 0.15, 0.075
    at, turn = (0.0, 0.0, 0.0), 9.0
    # the quarter's section: its corner the old log's heart, at the foot on the left
    edge = [(radius * math.cos(angle), radius * math.sin(angle)) for angle in np.linspace(0, math.pi / 2, 14)]
    count = len(edge)
    bark = Mat('barkMahogany', rough=0.95, bump=(0.6, 90.0),
               pattern=('barkMahogany', _grain(0.022, seed, at, turn, 0.3, 0.6, axis='y'), 0.45))
    shell = ([(x, y, z) for y in (0.0, length) for x, z in edge],
             [(k, count + k, count + k + 1, k + 1) for k in range(count - 1)])
    item.add(_place(shell, at, turn), bark)
    for y in (0.0, length):
        rim = ([(x, y, z) for x, z in edge] + [(x * 0.9, y, z * 0.9) for x, z in edge],
               [(k, k + 1, count + k + 1, count + k) for k in range(count - 1)])
        item.add(_place(rim, at, turn), Mat('barkMahogany', rough=0.9, dim=0.75), smooth=False)
    rings = _either(_rings(0.019, at, turn, (0.0, 0.0), heart=0.034, share=0.4, axis='y'),
                    _veins(40.0, seed, 0.02, at, turn))
    end = Mat('heartwood', rough=0.75, pattern=('heartwood', rings, 0.58))
    face = ([(0.0, 0.0, 0.0)] + [(x * 0.9, 0.0, z * 0.9) for x, z in edge],
            [(0, k + 1, k + 2) for k in range(count - 1)])
    item.add(_place(face, at, turn), end, smooth=False)
    split = Mat('heartwood', rough=0.85, dim=1.12, bump=(0.3, 160.0),
                pattern=('heartwood', _grain(0.009, seed + 1, at, turn, 0.3, 1.2, axis='y'), 0.72))
    for far_x, far_z in ((0.0, radius), (radius, 0.0)):
        quad = ([(0.0, 0.0, 0.0), (far_x, 0.0, far_z), (far_x, length, far_z), (0.0, length, 0.0)], [(0, 1, 2, 3)])
        item.add(_place(quad, at, turn), split, smooth=False)


def _split_piece(item, radius, length, arc, roll, at, wood, bark_ramp, seed):
    """One stick of split firewood along x: a wedge of a log `arc` degrees wide turned `roll` degrees, bark on its
    round side, its split faces pale, its near end showing the old log's rings."""
    angles = np.radians(np.linspace(roll - arc / 2, roll + arc / 2, 9))
    edge = [(radius * math.cos(angle), radius * math.sin(angle)) for angle in angles]
    low = min(min(z for _, z in edge), 0.0)
    edge = [(y, z - low) for y, z in edge]
    heart = (0.0, -low)
    count = len(edge)
    ends = (-length / 2, length / 2)
    bark = Mat(bark_ramp, rough=0.95, bump=(0.5, 160.0),
               pattern=(bark_ramp, _grain(0.012, seed, at, LIE, 0.3, 0.8), 0.5))
    shell = ([(x, y, z) for x in ends for y, z in edge],
             [(k, k + 1, count + k + 1, count + k) for k in range(count - 1)])
    item.add(_place(shell, at, LIE), bark)
    split = Mat(wood, rough=0.85, dim=1.05, pattern=(wood, _grain(0.01, seed + 1, at, LIE, 0.25, 1.0), 0.72))
    for y, z in (edge[0], edge[-1]):
        quad = ([(ends[0], heart[0], heart[1]), (ends[0], y, z), (ends[1], y, z), (ends[1], heart[0], heart[1])],
                [(0, 1, 2, 3)])
        item.add(_place(quad, at, LIE), split, smooth=False)
    end = Mat(wood, rough=0.8, dim=0.92, pattern=(wood, _rings(0.012, at, LIE, heart, share=0.35), 0.6))
    for x in ends:
        fan = ([(x, heart[0], heart[1])] + [(x, y, z) for y, z in edge], [(0, k + 1, k + 2) for k in range(count - 1)])
        item.add(_place(fan, at, LIE), end, smooth=False)


@model
def firewood(item, words, seed):
    """Split firewood stacked three and two, oak and pine, bark up on most, the split face of two turned to the eye,
    every near end showing rings, a cord tied round the stack."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    sticks = [(-0.066, 0.0, 'oak', 180, 300), (0.0, 0.0, 'pine', 130, 80), (0.066, 0.0, 'oak', 180, 100),
              (-0.033, 0.05, 'pine', 180, 305), (0.033, 0.05, 'oak', 130, 95)]
    for k, (y, z, wood, arc, roll) in enumerate(sticks):
        at = _turned((rng.uniform(-0.025, 0.025), y, z), LIE)
        _split_piece(item, 0.036, rng.uniform(0.36, 0.4), arc, roll + rng.uniform(-8, 8), at, wood, 'barkOak',
                     seed + 3 * k)
    loop = [(-0.1, 0.0), (-0.098, 0.04), (-0.07, 0.083), (-0.03, 0.094), (0.03, 0.094), (0.07, 0.083), (0.098, 0.04),
            (0.1, 0.0), (0.0, -0.008), (-0.1, 0.0)]
    cord = shapes.tube([(0.04, y, z + 0.003) for y, z in loop], 0.0048, 6)
    item.add(_place(cord, (0, 0, 0), LIE), Mat('rope', rough=0.9, bump=(0.4, 300.0)))
    knot = shapes.ellipsoid((0.01, 0.008, 0.006), (0.04, -0.015, 0.098), rings=5, sides=8)
    item.add(_place(knot, (0, 0, 0), LIE), Mat('rope', rough=0.9, dim=0.9))


# --- stonework ---

def _fluted(radius, foot, top, flutes, depth, rings=10, entasis=0.92):
    """A column's shaft from `foot` to `top`: `flutes` channels cut down it `depth` of its radius deep, between
    narrow fillets, the shaft narrowing a little toward its top."""
    sides = flutes * 6
    verts, faces = [], []
    for i in range(rings + 1):
        share = i / rings
        ring_radius = radius * (1 + (entasis - 1) * share ** 1.5)
        for k in range(sides):
            angle = 2 * math.pi * k / sides
            channel = math.sin(math.pi * (k % 6) / 6) ** 0.7 if k % 6 else 0.0
            reach = ring_radius * (1 - depth * channel)
            verts.append((reach * math.cos(angle), reach * math.sin(angle), foot + (top - foot) * share))
    for i in range(rings):
        for k in range(sides):
            k1 = (k + 1) % sides
            faces.append((i * sides + k, i * sides + k1, (i + 1) * sides + k1, (i + 1) * sides + k))
    return verts, faces


def _stone(rock, seed, rough=0.5, dim=1.0, bump=(0.25, 90.0)):
    """A worked stone's look by its rock: marble with thin dark veins, sandstone in faint beds, granite specked."""
    if rock == 'marble':
        return Mat(rock, rough=0.35, spec=0.5, dim=dim, bump=bump, pattern=(rock, _veins(16.0, seed, 0.022), 0.66))
    if rock == 'sandstone':
        beds = _grain(0.03, seed, (0, 0, 0), 0.0, 0.18, 0.6, axis='y')

        def bedded(nodes, links, coord):
            graph = _Graph(nodes, links)
            x, y, z = graph.xyz(coord)
            return beds(nodes, links, graph.vec(x, z, y))
        return Mat(rock, rough=0.9, dim=dim, bump=(bump[0] * 2, bump[1]), pattern=(rock, bedded, 0.78))
    return Mat(rock, rough=rough + 0.2, dim=dim, bump=bump, pattern=(rock, _patches(0.18, 120.0, seed, 1.0), 0.6))


@model
def stoneColumn(item, words, seed):
    """A short column of `rock`: a square plinth and a round moulding at its foot, a fluted shaft, a flared capital
    under a slab of an abacus."""
    rock = words['rock']
    stone, edge = _stone(rock, seed), _stone(rock, seed + 1, dim=0.92)
    item.add(_place(shapes.box(0.19, 0.19, 0.045, (0, 0, 0.0225)), turn=SQUARE / 2), stone, smooth=False, bevel=0.004)
    item.add(shapes.moved(shapes.torus(0.072, 0.013, 28, 8), offset=(0, 0, 0.057)), edge)
    item.add(_fluted(0.068, 0.062, 0.45, 8, 0.24), stone)
    item.add(shapes.lathe([(0.093, 0.482), (0.088, 0.47), (0.072, 0.455), (0.064, 0.448)], sides=30), edge)
    item.add(shapes.moved(shapes.torus(0.066, 0.006, 28, 6), offset=(0, 0, 0.45)), edge)
    # the abacus is shallow front to back, so from above it reads as a slab across the shaft, not a lid on it
    item.add(_place(shapes.box(0.19, 0.15, 0.03, (0, 0, 0.497)), turn=SQUARE / 2), stone, smooth=False, bevel=0.004)


@model
def bench(item, words, seed):
    """A bench of `rock`: a slab across two tapered legs, each leg on its own foot, the slab's edges rounded and its
    top worked smooth, the legs left rougher."""
    rock = words['rock']
    stone, rough = _stone(rock, seed), _stone(rock, seed + 1, dim=0.9, bump=(0.5, 70.0))
    turn = SQUARE * 0.6
    item.add(_place(shapes.box(0.92, 0.3, 0.07, (0, 0, 0.335)), turn=turn), stone, smooth=False, bevel=0.01)
    for x in (-0.3, 0.3):
        leg = shapes.moved(shapes.frustum((0.13, 0.24), (0.105, 0.21), 0.26), offset=(x, 0, 0.04))
        item.add(_place(leg, turn=turn), rough, smooth=False, bevel=0.005)
        item.add(_place(shapes.box(0.16, 0.27, 0.04, (x, 0, 0.02)), turn=turn), stone, smooth=False, bevel=0.006)


@model
def font(item, words, seed):
    """A font of `rock`: a round basin brimming with rippled water on a turned pedestal, on a square foot."""
    rock = words['rock']
    stone, edge = _stone(rock, seed), _stone(rock, seed + 1, dim=0.9)
    item.add(_place(shapes.box(0.24, 0.24, 0.04, (0, 0, 0.02)), turn=BLOCK), stone, smooth=False, bevel=0.004)
    item.add(shapes.lathe([(0.042, 0.236), (0.03, 0.215), (0.028, 0.12), (0.034, 0.075), (0.056, 0.058),
                           (0.066, 0.05), (0.066, 0.04)], sides=24), edge)
    item.add(shapes.lathe([(0.143, 0.305), (0.146, 0.323), (0.172, 0.323), (0.175, 0.312), (0.162, 0.287),
                           (0.12, 0.258), (0.07, 0.242), (0.042, 0.236)], sides=32), stone)

    def ripples(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(coord)
        bend = graph.math('MULTIPLY', graph.noise(coord, 30.0, 2.0, _fourth(seed)), 0.012)
        dist = graph.math('ADD', graph.length(graph.math('ADD', x, 0.03), graph.math('SUBTRACT', y, 0.02)), bend)
        return graph.math('LESS_THAN', graph.math('FRACT', graph.math('MULTIPLY', dist, 1 / 0.032)), 0.3)
    water = Mat('water', rough=0.2, spec=0.7, pattern=('water', ripples, 1.35))
    item.add(shapes.lathe([(1e-4, 0.309), (0.145, 0.309)], sides=32), water, smooth=False)


@model
def plinth(item, words, seed):
    """A plinth of `rock`: a broad block under a thin course, a smaller block set on it with a sunk panel framed on
    its front, and a cap stone over it."""
    rock = words['rock']
    stone, frame = _stone(rock, seed), _stone(rock, seed + 1, dim=1.06)
    item.add(_place(shapes.box(0.4, 0.3, 0.085, (0, 0, 0.0425)), turn=BLOCK), stone, smooth=False, bevel=0.006)
    item.add(_place(shapes.box(0.36, 0.26, 0.012, (0, 0.01, 0.091)), turn=BLOCK), frame, smooth=False, bevel=0.003)
    width, depth, height, foot, back = 0.22, 0.14, 0.2, 0.097, 0.02
    item.add(_place(shapes.box(width, depth, height, (0, back, foot + height / 2)), turn=BLOCK),
             _stone(rock, seed, dim=0.82), smooth=False, bevel=0.003)
    # the panel's frame stands proud of the block's face, so the panel within lies sunk behind it
    front, rim, proud = back - depth / 2, 0.035, 0.01
    face_y = front - proud / 2
    for size, centre in (((width, proud, rim), (0, face_y, foot + rim / 2)),
                         ((width, proud, rim), (0, face_y, foot + height - rim / 2)),
                         ((rim, proud, height - 2 * rim), (-width / 2 + rim / 2, face_y, foot + height / 2)),
                         ((rim, proud, height - 2 * rim), (width / 2 - rim / 2, face_y, foot + height / 2))):
        item.add(_place(shapes.box(*size, centre), turn=BLOCK), frame, smooth=False, bevel=0.002)
    cap = shapes.box(width + 0.03, depth + 0.03, 0.022, (0, back - 0.004, foot + height + 0.011))
    item.add(_place(cap, turn=BLOCK), frame, smooth=False, bevel=0.004)
