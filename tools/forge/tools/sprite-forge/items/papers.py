"""Papers and the gate's spoils: books, a chart, a music sheet, cards and their pack, a deed; the Deadlands' ember,
the crystals, the portal stone and the radiant stone, light amber and the star's shard. A paper's marks are drawn on
it by patterns or thin raised strokes, dark against the parchment; the gate's spoils give their own light."""
import itertools
import math

import bpy
import numpy as np

from . import shapes
from .kit import SUPER, Mat, eye_axes
from .models import model

LIE = 28.0   # degrees a long thing lies turned from across the eye, its right end away
TOWARD_EYE = 52.0   # degrees about x that turn a face from straight up to straight at the eye (90 less its elevation)


# --- shader arithmetic for the marks ---

class _Graph:
    """Shader-node arithmetic for a pattern's mask: each call adds a node and gives its output socket. A value may be
    a number or a socket; a test gives 1 where it holds and 0 elsewhere."""

    def __init__(self, nodes, links):
        self.nodes, self.links = nodes, links

    def _feed(self, socket, value):
        if isinstance(value, (int, float)):
            socket.default_value = value
        else:
            self.links.new(value, socket)

    def math(self, operation, first, second=0.0, third=0.0):
        node = self.nodes.new('ShaderNodeMath')
        node.operation = operation
        for socket, value in zip(node.inputs, (first, second, third)):
            self._feed(socket, value)
        return node.outputs[0]

    def xyz(self, vector):
        node = self.nodes.new('ShaderNodeSeparateXYZ')
        self.links.new(vector, node.inputs[0])
        return node.outputs[0], node.outputs[1], node.outputs[2]

    def unpose(self, coord, steps):
        """World coordinates back in a part's own frame, undoing `_posed(mesh, steps)` step by step."""
        for offset, turn in reversed(steps):
            sub = self.nodes.new('ShaderNodeVectorMath')
            sub.operation = 'SUBTRACT'
            self.links.new(coord, sub.inputs[0])
            sub.inputs[1].default_value = offset
            rot = self.nodes.new('ShaderNodeVectorRotate')
            rot.rotation_type = 'EULER_XYZ'
            rot.invert = True
            rot.inputs['Rotation'].default_value = [math.radians(t) for t in turn]
            self.links.new(sub.outputs['Vector'], rot.inputs['Vector'])
            coord = rot.outputs['Vector']
        return coord

    def dot(self, vector, axis):
        node = self.nodes.new('ShaderNodeVectorMath')
        node.operation = 'DOT_PRODUCT'
        self.links.new(vector, node.inputs[0])
        node.inputs[1].default_value = tuple(axis)
        return node.outputs['Value']

    def noise(self, vector, scale, detail=2.0):
        node = self.nodes.new('ShaderNodeTexNoise')
        node.inputs['Scale'].default_value = scale
        node.inputs['Detail'].default_value = detail
        self.links.new(vector, node.inputs['Vector'])
        return node.outputs['Fac']

    def between(self, value, low, high):
        return self.math('MINIMUM', self.math('GREATER_THAN', value, low), self.math('LESS_THAN', value, high))

    def inside(self, x, y, centre, radii, angle=0.0):
        """Within the ellipse of `radii` about `centre`, turned `angle` radians."""
        off_x, off_y = self.math('SUBTRACT', x, centre[0]), self.math('SUBTRACT', y, centre[1])
        cos, sin = math.cos(angle), math.sin(angle)
        along = self.math('MULTIPLY_ADD', off_x, cos, self.math('MULTIPLY', off_y, sin))
        across = self.math('MULTIPLY_ADD', off_y, cos, self.math('MULTIPLY', off_x, -sin))
        reach = self.math('ADD', self.math('POWER', self.math('DIVIDE', along, radii[0]), 2.0),
                          self.math('POWER', self.math('DIVIDE', across, radii[1]), 2.0))
        return self.math('LESS_THAN', reach, 1.0)

    def all(self, *tests):
        out = tests[0]
        for test in tests[1:]:
            out = self.math('MINIMUM', out, test)
        return out

    def any(self, *tests):
        out = tests[0]
        for test in tests[1:]:
            out = self.math('MAXIMUM', out, test)
        return out

    def but(self, test, without):
        return self.math('MINIMUM', test, self.math('SUBTRACT', 1.0, without))


def _posed(mesh, steps):
    """The mesh moved by each (offset, turn) step in order, as shapes.moved does one."""
    for offset, turn in steps:
        mesh = shapes.moved(mesh, offset=offset, turn=turn)
    return mesh


def _spiral(turns, inner, outer, steps=64, squash=1.0, start=0.0):
    """Points (x, y) of a spiral from `inner` to `outer` reach in `turns` turns, its y squashed by `squash`."""
    pts = []
    for i in range(steps + 1):
        share = i / steps
        angle = start + 2 * math.pi * turns * share
        reach = inner + (outer - inner) * share
        pts.append((reach * math.cos(angle), reach * math.sin(angle) * squash))
    return pts


def _skin(radii, seed, amp, direction):
    """Where a wobbled ellipsoid's skin lies along `direction` from its middle: the ellipsoid's surface there, pushed
    as shapes.wobble pushes it, so a part can sit on a seeded lump."""
    way = np.asarray(direction, dtype=np.float64)
    way = way / np.linalg.norm(way)
    point = way / math.sqrt(sum((way[i] / radii[i]) ** 2 for i in range(3)))
    rng = np.random.RandomState(seed & 0x7fffffff)
    waves = rng.normal(size=(6, 3))
    phase = rng.uniform(0, 2 * math.pi, size=6)
    field = sum(math.sin(way @ waves[k] * 3.0 + phase[k]) for k in range(6)) / 6
    return point * (1 + amp * field)


# --- books ---

BOOK_POSE = [((0.0, 0.0, 0.0), (14.0, 0.0, 30.0))]   # its head propped a little, turned so its spine shows


@model
def book(item, words, seed):
    """A closed book lying cover up, its spine to the left: boards of `cover`'s ramp, a raised border round the
    front, the page block between them, raised bands across the spine. `sigil` set in the cover (`swirl` a glowing
    violet swirl, else a stone of that ramp in a brass bezel), `clasp` a brass strap over the fore-edge, `cards` two
    cards laid in the pages and showing at the fore-edge."""
    cover_ramp, sigil = words['cover'], words.get('sigil')
    width, length, thick, board, lip = 0.125, 0.165, 0.046, 0.0055, 0.005

    def put(mesh):
        return _posed(mesh, BOOK_POSE)

    cover = Mat(cover_ramp, rough=0.7, bump=(0.12, 110.0))
    # the tooled border: a low raised frame inset from the cover's edges, lit along its upper left
    rim, inset, high = 0.0065, 0.011, 0.003
    frame_w, frame_l = width - inset - 0.007, length - 2 * inset
    frame_x = -width / 2 + inset + frame_w / 2
    bars = ((frame_w, rim, frame_x, frame_l / 2), (frame_w, rim, frame_x, -frame_l / 2),
            (rim, frame_l, frame_x - frame_w / 2, 0.0), (rim, frame_l, frame_x + frame_w / 2, 0.0))
    for size_x, size_y, mid_x, mid_y in bars:
        item.add(put(shapes.box(size_x, size_y, high, (mid_x, mid_y, thick + high / 2 - 0.0002))), cover, smooth=False)
    for z in (board / 2, thick - board / 2):
        item.add(put(shapes.box(width, length, board, (0.0, 0.0, z))), cover, smooth=False, bevel=0.0015)
    spine = shapes.moved(shapes.cylinder(thick / 2, length, sides=16), turn=(0, 0, 90))
    item.add(put(shapes.moved(spine, offset=(-width / 2, -length / 2, thick / 2), scale=(0.42, 1, 1))), cover)
    for y in (-0.055, -0.018, 0.018, 0.055):
        band = shapes.moved(shapes.cylinder(thick / 2 + 0.004, 0.008, sides=16), turn=(0, 0, 90))
        item.add(put(shapes.moved(band, offset=(-width / 2, y - 0.004, thick / 2), scale=(0.6, 1, 1))), cover)

    def leaves(nodes, links, coord):
        graph = _Graph(nodes, links)
        _, _, z = graph.xyz(graph.unpose(coord, BOOK_POSE))
        return graph.math('GREATER_THAN', graph.math('FRACT', graph.math('DIVIDE', z, 0.0105)), 0.6)

    pages = Mat('parchment', rough=0.9, pattern=('parchment', leaves, 0.78))
    block_w = width - lip - 0.004
    item.add(put(shapes.box(block_w, length - 2 * lip, thick - 2 * board,
                            (-width / 2 + 0.004 + block_w / 2, 0.0, thick / 2))), pages, smooth=False)
    top = thick + 0.0003
    if sigil == 'swirl':
        # few turns, wide apart and a texel thick, so the swirl still reads as one at the book's size
        swirl = shapes.tube([(x, y * 0.95 + 0.004, 0.0) for x, y in _spiral(1.35, 0.004, 0.04, 72)], 0.0052, 6)
        item.add(put(shapes.moved(swirl, offset=(0.004, 0, top), scale=(1, 1, 0.35))),
                 Mat('portal', rough=0.35, glow=0.65))
    elif sigil:
        bezel = shapes.moved(shapes.torus(0.016, 0.0028, 24, 8), offset=(0.004, 0.004, top))
        item.add(put(bezel), Mat('brass', rough=0.3, metal=0.25, spec=0.8))
        stone = shapes.ellipsoid((0.0145, 0.0145, 0.006), (0.004, 0.004, top), flat=0.5, rings=8, sides=20)
        item.add(put(stone), Mat(sigil, rough=0.25, spec=0.6))
    if words.get('clasp'):
        brass = Mat('brass', rough=0.3, metal=0.25, spec=0.8)
        strap = shapes.joined(shapes.box(0.034, 0.017, 0.003, (width / 2 - 0.014, 0.0, thick + 0.0012)),
                              shapes.box(0.003, 0.017, thick + 0.004, (width / 2 + 0.0018, 0.0, thick / 2)))
        item.add(put(strap), brass, smooth=False)
        item.add(put(shapes.ellipsoid((0.005, 0.005, 0.003), (width / 2 - 0.024, 0.0, thick + 0.0028))), brass)
    if words.get('cards'):
        stock = Mat('parchment', rough=0.6)
        # tucked just under the front board, so the book's depth does not hide where they show
        for from_head, z, angle in ((0.05, thick - board - 0.0012, 16.0), (0.026, thick - board - 0.0034, -10.0)):
            card = shapes.moved(shapes.box(0.06, 0.042, 0.0018), turn=(0, 0, angle),
                                offset=(width / 2 - lip + 0.006, length / 2 - from_head, z))
            item.add(put(card), stock, smooth=False)


# --- papers ---

CHART_POSE = [((0.0, 0.0, 0.0), (26.0, 0.0, 7.0))]   # tipped toward the eye, as if held up to read


@model
def chart(item, words, seed):
    """A chart: a parchment sheet rolled up at both ends, a border ruled round it, a green land with its darker shore,
    a dotted way of ink across the sea and a red X where it ends. The land's outline comes from `seed`."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    width, depth, roll = 0.25, 0.18, 0.0125
    flat_half = width / 2 - roll

    def put(mesh):
        return _posed(mesh, CHART_POSE)

    def border(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, _ = graph.xyz(graph.unpose(coord, CHART_POSE))
        outer = graph.all(graph.between(x, -flat_half + 0.008, flat_half - 0.008),
                          graph.between(y, -depth / 2 + 0.01, depth / 2 - 0.01))
        inner = graph.all(graph.between(x, -flat_half + 0.0135, flat_half - 0.0135),
                          graph.between(y, -depth / 2 + 0.0155, depth / 2 - 0.0155))
        return graph.but(outer, inner)

    paper = Mat('parchment', rough=0.85, bump=(0.2, 70.0), pattern=('parchment', border, 0.62))
    item.add(put(shapes.sheet(2 * flat_half, depth, 16, 12)), paper)
    for side in (-1, 1):
        rolled = shapes.moved(shapes.cylinder(roll, depth + 0.004, sides=14), turn=(0, 0, 90))
        item.add(put(shapes.moved(rolled, offset=(side * flat_half, -depth / 2 - 0.002, roll))), paper)
    lift = 0.0004
    # the land: a blob of seeded reach, its shore a darker ring
    centre, reach = (-0.03, -0.006), (0.052, 0.04)
    outline = []
    for k in range(14):
        angle = 2 * math.pi * k / 14
        grow = 1 + rng.uniform(-0.22, 0.22)
        outline.append((centre[0] + reach[0] * grow * math.cos(angle), centre[1] + reach[1] * grow * math.sin(angle)))

    def shore(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, _ = graph.xyz(graph.unpose(coord, CHART_POSE))
        return graph.math('SUBTRACT', 1.0, graph.inside(x, y, centre, (reach[0] * 0.62, reach[1] * 0.58)))

    land = Mat('green', rough=0.8, pattern=('green', shore, 0.55))
    item.add(put(shapes.prism(outline, lift, lift)), land, smooth=False)
    isle = [(0.045 + 0.014 * math.cos(angle), 0.05 + 0.01 * math.sin(angle))
            for angle in np.linspace(0, 2 * math.pi, 9)[:-1]]
    item.add(put(shapes.prism(isle, lift, lift)), land, smooth=False)
    ink = Mat('ink', rough=0.9)
    way = [(0.018 + 0.011 * i, -0.012 + 0.0095 * i + 0.004 * math.sin(i * 1.3)) for i in range(5)]
    dots = shapes.joined(*[shapes.box(0.0105, 0.0105, lift, (x, y, lift * 1.5)) for x, y in way])
    item.add(put(dots), ink, smooth=False)
    cross_at = (0.08, 0.044)
    cross = shapes.joined(*[shapes.moved(shapes.box(0.05, 0.0115, lift), turn=(0, 0, angle),
                                         offset=(cross_at[0], cross_at[1], lift * 1.5)) for angle in (45, -45)])
    item.add(put(cross), Mat('waxRed', rough=0.7), smooth=False)


SHEET_POSE = [((0.0, 0.0, 0.0), (46.0, 0.0, 0.0))]   # stood up nearly square to the eye, so its staves lie level


def _texel_grid():
    """The work render's texel grid as the kit framed it: the screen-right of its left edge, the screen-up of its top
    edge, and a texel's side, all metres. A pattern's mask is built after the framing, so a ruled line can be laid on
    one whole row of texels, where a line of a texel's width set at random splits between two and neither shows."""
    scene = bpy.context.scene
    camera = scene.camera
    wide, high = scene.render.resolution_x / SUPER, scene.render.resolution_y / SUPER
    per = camera.data.ortho_scale / max(wide, high)
    right, up, _ = eye_axes()
    where = np.asarray(camera.location)
    return where @ right - wide * per / 2, where @ up + high * per / 2, per


@model
def musicSheet(item, words, seed):
    """A sheet of music: parchment bowed a little, its bottom right corner folded over, two staves of five ruled
    lines, and on each four notes, a head and a stem, set by `seed`. The lines are ruled one texel deep with one
    clear between."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    width, height = 0.19, 0.25

    def lift(x, y):
        return 0.012 * (x / (width / 2)) ** 2

    staves = (0.095, -0.012)   # each staff's top line, metres up the sheet
    notes = [[(-0.056 + k * 0.035 + rng.randint(0, 2) * 0.005, 2 * rng.randint(0, 4) + 1) for k in range(4)]
             for _ in staves]   # (across, rows below the top line: odd, a space between lines)
    right, up, _ = eye_axes()

    def marks(nodes, links, coord):
        graph = _Graph(nodes, links)
        left, top, per = _texel_grid()
        x, _, _ = graph.xyz(graph.unpose(coord, SHEET_POSE))
        row = graph.math('FLOOR', graph.math('DIVIDE', graph.math('SUBTRACT', top, graph.dot(coord, up)), per))
        col = graph.math('FLOOR', graph.math('DIVIDE', graph.math('SUBTRACT', graph.dot(coord, right), left), per))
        marked = []
        for staff_top, staff_notes in zip(staves, notes):
            first = math.floor((top - _posed(([(0.0, staff_top, lift(0.0, staff_top))], []), SHEET_POSE)[0][0] @ up)
                               / per)
            lines = graph.any(*[graph.between(row, first + 2 * k - 0.5, first + 2 * k + 0.5) for k in range(5)])
            marked.append(graph.all(graph.between(x, -0.078, 0.078), lines))
            for across, below in staff_notes:
                head_row = first + below
                at = _posed(([(across, 0.0, 0.0)], []), SHEET_POSE)[0][0] @ right
                head_col = math.floor((at - left) / per)
                marked.append(graph.all(graph.between(row, head_row - 0.5, head_row + 0.5),
                                        graph.between(col, head_col - 0.5, head_col + 1.5)))
                marked.append(graph.all(graph.between(row, head_row - 3.5, head_row - 0.5),
                                        graph.between(col, head_col + 0.5, head_col + 1.5)))
        return graph.any(*marked)

    # its bottom right corner folded over: the sheet ends at the fold, the flap lies on it, its tip sprung up
    fold, corner = 0.042, (width / 2, -height / 2)
    verts, faces = shapes.sheet(width, height, 20, 26, lift)
    folded = []
    for x, y, z in verts:
        short = fold - ((corner[0] - x) + (y - corner[1]))
        if short > 0:
            x, y = x - short / 2, y + short / 2
        folded.append((x, y, z))
    item.add(_posed((folded, faces), SHEET_POSE),
             Mat('parchment', rough=0.85, bump=(0.15, 70.0), pattern=('ink', marks)))
    ends = [(corner[0] - fold, corner[1]), (corner[0], corner[1] + fold)]
    flap = [(x, y, lift(x, y) + 0.001) for x, y in ends] + [(corner[0] - fold, corner[1] + fold, 0.012)]
    item.add(_posed((flap, [(0, 1, 2)]), SHEET_POSE), Mat('parchment', rough=0.85), smooth=False)


# --- cards ---

def _lattice(steps, period, plane='xy'):
    """A card back's lattice: a checker of diamonds `period` across, in the card's own frame."""
    def mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(graph.unpose(coord, steps))
        upward = y if plane == 'xy' else z
        rising = graph.math('FLOOR', graph.math('DIVIDE', graph.math('ADD', x, upward), period))
        falling = graph.math('FLOOR', graph.math('DIVIDE', graph.math('SUBTRACT', x, upward), period))
        odd = graph.math('ABSOLUTE', graph.math('MODULO', graph.math('ADD', rising, falling), 2.0))
        return graph.math('GREATER_THAN', odd, 0.5)
    return mask


CARD_POSE = [((0.0, 0.0, 0.0), (0.0, 0.0, 14.0)), ((0.0, 0.0, 0.0), (TOWARD_EYE - 6.0, 0.0, 0.0))]


@model
def card(item, words, seed):
    """A playing card turned on its corner and bowed a little, its back to the eye: a white border, a blue panel
    with a lattice of diamonds, a gold oval in its middle."""
    width, height = 0.063, 0.088

    def lift(x, y):
        return 0.004 * (x / (width / 2)) ** 2

    item.add(_posed(shapes.sheet(width, height, 10, 12, lift), CARD_POSE), Mat('parchment', rough=0.6))
    panel = shapes.sheet(width - 0.011, height - 0.011, 10, 12, lambda x, y: lift(x, y) + 0.0005)
    lattice = ('cardBack', _lattice(CARD_POSE, 0.0085), 0.62)
    item.add(_posed(panel, CARD_POSE), Mat('cardBack', rough=0.6, pattern=lattice))
    emblem = shapes.ellipsoid((0.0115, 0.016, 0.0025), (0.0, 0.0, lift(0, 0) + 0.0008), flat=0.5, rings=8, sides=20)
    item.add(_posed(emblem, CARD_POSE), Mat('gold', rough=0.3, metal=0.25, spec=0.8))


PACK_TURN = -12.0   # its front turned toward the key light, its right side in shade


@model
def cardPack(item, words, seed):
    """A pack of cards in its paper wrap, a blue band round it sealed with red wax, and three cards fanned up out of
    its top, their backs to the eye."""
    width, depth, height = 0.062, 0.024, 0.056
    pose = [((0.0, 0.0, 0.0), (-10.0, 0.0, PACK_TURN))]   # leant back a little, its front to the light
    wrap = Mat('parchment', rough=0.85)
    item.add(_posed(shapes.box(width, depth, height, (0, 0, height / 2)), pose), wrap, smooth=False, bevel=0.0015)
    band_z = height * 0.46
    item.add(_posed(shapes.box(width + 0.0016, depth + 0.0016, 0.013, (0, 0, band_z)), pose),
             Mat('cardBack', rough=0.7), smooth=False)
    seal_pose = [((0.0, 0.0, 0.0), (90.0, 0.0, 0.0)), ((0.0, -depth / 2 - 0.0009, band_z), (0.0, 0.0, 0.0))] + pose

    def stamp(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, _ = graph.xyz(graph.unpose(coord, seal_pose))
        return graph.but(graph.inside(x, y, (0, 0), (0.006, 0.006)), graph.inside(x, y, (0, 0), (0.0035, 0.0035)))

    seal = shapes.lathe([(0.0001, 0.0032), (0.006, 0.003), (0.0088, 0.002), (0.0095, 0.0)], 20, top=True, foot=True)
    item.add(_posed(seal, seal_pose), Mat('waxRed', rough=0.45, spec=0.5, pattern=('waxRed', stamp, 0.6)))
    # the cards a little apart in depth and each a step lighter than the one behind it, so the fan reads card by card
    fan = ((-0.008, 0.006, -20.0, 0.72), (-0.001, 0.0, -4.0, 0.86), (0.006, -0.006, 12.0, 1.0))
    for shift_x, shift_y, angle, dim in fan:
        card_pose = [((0.0, 0.0, 0.0), (0.0, angle, 0.0)), ((shift_x, shift_y, 0.0), (0.0, 0.0, 0.0))] + pose
        back = Mat('cardBack', rough=0.6, dim=dim)
        item.add(_posed(shapes.box(0.034, 0.0012, 0.08, (0, 0, 0.04)), card_pose), back, smooth=False, bevel=0.003)


@model
def deed(item, words, seed):
    """A rolled deed lying across the picture: the roll of parchment, the edge of its last turn and the spiral of its
    near end, tied round with a red silk ribbon whose tails fall to a red wax seal lying before it."""
    length, radius = 0.185, 0.023
    pose = [((0.0, 0.0, radius), (0.0, 0.0, LIE))]

    def put(mesh):
        return _posed(mesh, pose)

    def edge(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(graph.unpose(coord, pose))
        angle = graph.math('ARCTAN2', z, y)
        turned = graph.between(angle, 0.55, 0.85)
        # the near end's spiral, the roll's turns seen end on
        reach = graph.math('SQRT', graph.math('ADD', graph.math('MULTIPLY', y, y), graph.math('MULTIPLY', z, z)))
        coil = graph.math('FRACT', graph.math('SUBTRACT', graph.math('DIVIDE', reach, 0.0062),
                                              graph.math('DIVIDE', angle, 2 * math.pi)))
        ends = graph.math('GREATER_THAN', graph.math('ABSOLUTE', x), length / 2 - 0.0005)
        spiral = graph.all(ends, graph.any(graph.math('LESS_THAN', coil, 0.38), graph.math('LESS_THAN', reach, 0.003)))
        return graph.any(graph.but(turned, ends), spiral)

    paper = Mat('parchment', rough=0.85, bump=(0.2, 80.0), pattern=('parchment', edge, 0.58))
    item.add(put(shapes.moved(shapes.cylinder(radius, length, sides=20), offset=(-length / 2, 0, 0))), paper)
    silk = Mat('silkRed', rough=0.5, spec=0.5)
    tie = 0.014
    item.add(put(shapes.moved(shapes.cylinder(radius + 0.0016, 0.012, sides=20), offset=(tie - 0.006, 0, 0))), silk)
    item.add(put(shapes.ellipsoid((0.007, 0.0045, 0.0065), (tie, -radius - 0.002, -0.002))), silk)
    tails = ([(tie + 0.002, -radius - 0.003, -0.004), (tie + 0.006, -radius - 0.009, -radius * 0.7),
              (tie + 0.01, -radius - 0.016, -radius + 0.002), (tie + 0.016, -radius - 0.03, -radius + 0.0025)],
             [(tie - 0.002, -radius - 0.003, -0.004), (tie - 0.008, -radius - 0.008, -radius * 0.75),
              (tie - 0.016, -radius - 0.013, -radius + 0.002)])
    for tail in tails:
        item.add(put(shapes.tube(tail, 0.0042, 6)), silk)
    seal_pose = [((0.0, 0.0, 0.0), (36.0, 0.0, 0.0)), ((tie + 0.024, -radius - 0.046, -radius + 0.009), (0, 0, 0))]
    seal_pose += pose

    def stamp(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, _ = graph.xyz(graph.unpose(coord, seal_pose))
        return graph.but(graph.inside(x, y, (0, 0), (0.0105, 0.0105)), graph.inside(x, y, (0, 0), (0.0062, 0.0062)))

    seal = shapes.lathe([(0.0001, 0.0045), (0.01, 0.0042), (0.0155, 0.0028), (0.0165, 0.0)], 20, top=True, foot=True)
    item.add(_posed(seal, seal_pose), Mat('waxRed', rough=0.45, spec=0.5, pattern=('waxRed', stamp, 0.62)))


# --- the gate's spoils ---

@model
def deadlandsEmber(item, words, seed):
    """A coal of the Deadlands: a lump of black stone split by branching cracks through which its glowing heart
    shows. The lump and its cracks come from `seed`."""
    radii, amp = (0.03, 0.024, 0.021), 0.2
    verts, faces = shapes.wobble(shapes.ellipsoid(radii, rings=40, sides=64, flat=0.18), seed, amp)
    pts = np.asarray(verts)
    mid = pts.mean(axis=0)
    centres = np.array([pts[list(face)].mean(axis=0) for face in faces]) - mid
    unit = centres / np.linalg.norm(centres, axis=1, keepdims=True)
    # the cracks wander over the face toward the eye and branch; the shell is opened along them
    gap = np.zeros(len(faces), dtype=bool)
    for share, way in _crack_walks(seed):
        for here, there in itertools.pairwise(way):
            step = there - here
            along = np.clip((unit - here) @ step / (step @ step), 0.0, 1.0)
            gap |= np.linalg.norm(unit - (here + along[:, None] * step), axis=1) < 0.085 * share
    shell = [face for face, opened in zip(faces, gap) if not opened]
    item.add((verts, shell), Mat('charcoal', rough=0.5, spec=0.55, bump=(0.5, 160.0)))
    heart = [tuple(mid + (point - mid) * 0.965) for point in pts]
    item.add((heart, faces), Mat('ember', rough=0.5, glow=0.72))


def _crack_walks(seed):
    """The ember's cracks as walks over the unit sphere of directions: three from about the eye's side, and two
    branches off them, each (its width share, its points)."""
    rng = np.random.RandomState((seed + 11) & 0x7fffffff)
    eye = np.array([0.0, -0.79, 0.62])

    def unit(vector):
        return vector / np.linalg.norm(vector)

    def walk(here, steps, stride):
        heading = unit(np.cross(here, rng.normal(size=3)))
        way = [here]
        for _ in range(steps):
            heading = unit(heading + np.cross(here, rng.normal(size=3)) * 0.45)
            heading = unit(heading - here * (heading @ here))
            here = unit(here + heading * stride)
            way.append(here)
        return way
    walks = [(1.0, walk(unit(eye + rng.normal(size=3) * 0.35), 9, 0.15)) for _ in range(3)]
    for _ in range(2):
        trunk = walks[rng.randint(len(walks))][1]
        walks.append((0.75, walk(trunk[rng.randint(2, len(trunk) - 2)], 4, 0.14)))
    return walks


def _crystal_mesh(radius, length):
    """A six-sided crystal standing on its foot, its point a short pyramid, an edge toward the eye: its faces on the
    left of that edge, and those on the right."""
    shoulder = length - radius * 1.5
    verts, faces = shapes.moved(shapes.lathe([(0.0001, length), (radius, shoulder), (radius, 0.0)], 6, top=True,
                                             foot=True), turn=(0, 0, 30))
    pts = np.asarray(verts)
    right = [face for face in faces if pts[list(face)].mean(axis=0)[0] > radius * 0.05]
    left = [face for face in faces if pts[list(face)].mean(axis=0)[0] <= radius * 0.05]
    return (verts, left), (verts, right)


@model
def crystal(item, words, seed):
    """A crystal of `ramp`, giving its own light: one long six-sided prism with its point, or `count` 3, a cluster of
    three on a lump of `base` stone. Its faces right of the edge toward the eye lie a step darker, as the painter
    split them, and a bright streak runs down its lit face."""
    ramp, count, base = words['ramp'], words.get('count', 1), words.get('base')
    lit = Mat(ramp, rough=0.15, spec=0.9, glow=0.2, steps=5)
    shaded = Mat(ramp, rough=0.15, spec=0.9, glow=0.2, steps=5, dim=0.72)
    streak = Mat(ramp, rough=0.3, glow=0.95)
    if count == 1:
        prisms = [(0.0, 0.0, 14.0, 0.055, 0.0092)]
    else:
        prisms = [(0.0, 0.0, 3.0, 0.062, 0.0095), (-0.014, 0.004, -26.0, 0.042, 0.0072),
                  (0.015, -0.004, 29.0, 0.045, 0.0076)]
    if base:
        lump = shapes.wobble(shapes.ellipsoid((0.03, 0.017, 0.009), (0, 0, 0.0015), flat=0.4, rings=10, sides=18),
                             seed, 0.22)
        item.add(lump, Mat(base, rough=0.7, spec=0.3, bump=(0.4, 110.0), dim=0.86), smooth=False)
    for x, y, tilt, length, radius in prisms:
        pose = [((0.0, 0.0, 0.0), (0.0, tilt, 0.0)), ((x, y, 0.0), (0.0, 0.0, 0.0))]
        left, right = _crystal_mesh(radius, length)
        item.add(_posed(left, pose), lit, smooth=False)
        item.add(_posed(right, pose), shaded, smooth=False)
        # the streak lies on the face between the edges at 210 and 270 degrees, a third of the way across
        edge = np.array([math.cos(math.radians(210)), math.sin(math.radians(210))]) * radius
        front = np.array([0.0, -radius])
        at = edge * 0.6 + front * 0.4
        normal = np.array([math.cos(math.radians(240)), math.sin(math.radians(240))]) * 0.0004
        line = [(at[0] + normal[0], at[1] + normal[1], z) for z in (length * 0.1, length - radius * 1.7)]
        item.add(_posed(shapes.tube(line, radius * 0.16, 4), pose), streak, smooth=False)


@model
def portalStone(item, words, seed):
    """A portal stone: a smooth, oval stone of dark rock, polished, a ring cut round its face, and in the ring a
    swirl of violet light with a bright bead at its heart. Its shape's small unevenness comes from `seed`."""
    radii, amp = (0.036, 0.029, 0.016), 0.04
    pose = [((0.0, 0.0, 0.0), (18.0, 0.0, 0.0))]

    def ring(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(graph.unpose(coord, pose))
        cut = graph.but(graph.inside(x, y, (0, 0), (0.0315, 0.0255)), graph.inside(x, y, (0, 0), (0.0275, 0.0219)))
        return graph.all(cut, graph.math('GREATER_THAN', z, 0.0))

    stone = shapes.wobble(shapes.ellipsoid(radii, rings=14, sides=28), seed, amp)
    item.add(_posed(stone, pose), Mat('darkRock', rough=0.3, spec=0.6, pattern=('darkRock', ring, 0.5)))

    def on_skin(x, y, sink):
        top = radii[2] * math.sqrt(max(1 - (x / radii[0]) ** 2 - (y / radii[1]) ** 2, 0.0))
        point = _skin(radii, seed, amp, (x, y, top))
        return tuple(point * (1 - sink / np.linalg.norm(point)))

    pts = _spiral(2.0, 0.0035, 0.0225, 90, squash=0.85)
    swirl = shapes.tube([on_skin(x, y, 0.0008) for x, y in pts], 0.0016, 6, radius_end=0.0025)
    item.add(_posed(swirl, pose), Mat('portal', rough=0.4, glow=0.38))
    bead = shapes.ellipsoid((0.0042, 0.0042, 0.0042), on_skin(0.0, 0.0, 0.0016), rings=8, sides=12)
    item.add(_posed(bead, pose), Mat('portal', rough=0.4, glow=0.92))


def _cut_gem(sides, radius, crown, pavilion, table):
    """A cut stone, its table up: a girdle of `sides`, a crown to a `table` share of it, a pavilion to a point."""
    ring = [(radius * math.cos(2 * math.pi * k / sides + math.pi / 2),
             radius * math.sin(2 * math.pi * k / sides + math.pi / 2)) for k in range(sides)]
    verts = [(x, y, 0.0) for x, y in ring] + [(x * table, y * table, crown) for x, y in ring]
    faces = [(k, (k + 1) % sides, sides + (k + 1) % sides, sides + k) for k in range(sides)]
    faces.append(tuple(range(sides, 2 * sides)))
    verts.append((0.0, 0.0, -pavilion))
    faces += [(2 * sides, (k + 1) % sides, k) for k in range(sides)]
    return verts, faces


@model
def radiantStone(item, words, seed):
    """A radiant stone: a white-gold gem cut in five, its table to the eye, shining like a small star: eight rays
    of light round it, the upright and level ones long, the slanting ones short."""
    radius = 0.012
    # its table tipped a little up from square to the eye, so the facets under the light outshine those away
    pose = [((0.0, 0.0, 0.0), (TOWARD_EYE - 12.0, 0.0, 0.0))]
    gem = _cut_gem(5, radius, radius * 0.5, radius * 0.75, 0.5)
    item.add(_posed(gem, pose), Mat('varla', rough=0.2, spec=0.8, glow=0.12, steps=6), smooth=False)
    right, up, forward = eye_axes()
    back = forward * radius * 0.6
    rays = Mat('varla', rough=0.5, glow=0.42)
    # a ray a little over a texel wide (the picture is its long rays' reach twice over, 28 texels) always fills one
    # whole row of texels, where a thinner one breaks up; only its last stretch thins to a point
    longest = radius * 2.35
    texel = 2 * longest / 28
    for k in range(8):
        angle = 2 * math.pi * k / 8
        reach = longest if k % 2 == 0 else radius * 1.7
        thick = texel * (0.58 if k % 2 == 0 else 0.85)
        way = right * math.cos(angle) + up * math.sin(angle)
        root, waist, tip = (tuple(back + way * share) for share in (radius * 0.5, reach * 0.78, reach))
        item.add(shapes.tube([root, waist], thick, 6), rays)
        item.add(shapes.tube([waist, tip], thick, 6, radius_end=thick * 0.55), rays)


@model
def lightAmber(item, words, seed):
    """A lump of amber, polished, with a light held inside it: a bright bead under its skin facing the eye, the amber
    round it lit from within. The lump comes from `seed`."""
    radii, amp = (0.025, 0.02, 0.022), 0.2
    lump = shapes.wobble(shapes.ellipsoid(radii, rings=16, sides=26), seed, amp)
    skin = _skin(radii, seed, amp, (0.2, -0.8, 0.3))
    core = skin * 0.93

    def lit_within(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(coord)
        offsets = [graph.math('POWER', graph.math('SUBTRACT', axis, core[i]), 2.0) for i, axis in enumerate((x, y, z))]
        reach = graph.math('SQRT', graph.math('ADD', graph.math('ADD', offsets[0], offsets[1]), offsets[2]))
        return graph.math('LESS_THAN', reach, 0.0095)

    item.add(lump, Mat('amber', rough=0.15, spec=0.9, glow=0.06, pattern=('amber', lit_within, 1.4)))
    item.add(shapes.ellipsoid((0.0045, 0.0045, 0.0045), tuple(core), rings=8, sides=12), Mat('varla', glow=0.95))


@model
def starShard(item, words, seed):
    """A shard of dark glass with stars in it: a broken blade of glass, its facets meeting at a point, leaning back;
    its outline and its stars come from `seed`."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    outline = [(-0.0132, 0.0022), (-0.0176, 0.0286), (-0.0044, 0.0506), (0.011, 0.0396), (0.0176, 0.0154),
               (0.0022, 0.0)]
    ring = [(x * rng.uniform(0.9, 1.1), 0.0, z * rng.uniform(0.92, 1.08)) for x, z in outline]
    apex_front = (-0.002, -0.0105, 0.029)
    apex_back = (0.001, 0.006, 0.024)
    verts = ring + [apex_front, apex_back]
    count = len(ring)
    front = [(k, (k + 1) % count, count) for k in range(count)]
    back = [((k + 1) % count, k, count + 1) for k in range(count)]
    pose = [((0.0, 0.0, 0.0), (-24.0, 0.0, 0.0))]
    # alternate facets a step apart, so each reads on its own where the light would lay two alike
    item.add(_posed((verts, front[1::2] + back), pose), Mat('void', rough=0.12, spec=0.9, glow=0.12, steps=6),
             smooth=False)
    item.add(_posed((verts, front[0::2]), pose), Mat('void', rough=0.12, spec=0.9, glow=0.12, steps=6, dim=0.68),
             smooth=False)
    # the stars: points on the facets that face the eye
    picks = rng.choice(count, size=5, replace=False)
    for i, k in enumerate(picks):
        start, end, apex = np.asarray(ring[k]), np.asarray(ring[(k + 1) % count]), np.asarray(apex_front)
        across, toward_apex = rng.uniform(0.15, 0.5), rng.uniform(0.15, 0.4)
        inside = start + (end - start) * across * (1 - toward_apex) + (apex - start) * toward_apex
        point = _posed(([tuple(inside)], []), pose)[0][0]
        item.sparkle(point, ramp='star', arm=1 if i < 2 else 0)
