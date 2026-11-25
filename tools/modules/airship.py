"""The Grey Tithe's airship (`tithe-airship`): one of their brigs retrofitted to fly, as the owner has them, "large
modified vessels retrofitted with combustible thrusters". Her hull is the Brig's own, from the ships' builder
(shipkit), so she is the vessel the sea sails; what is fitted to her is in the bible's Modules note. She is built in
the ships' frame (x toward her bow, y to port, z up) and turned at the end so her bow points along the module's front
(Blender's -y), her keel's bottom amidships at the origin: the page flies her and lights her fires at her sockets.
"""
import math

import mathutils

import kit
import shipkit
from timbers import Frame, barrel, board, cloth, crate, ring

# Her hull: the Brig's numbers with her masts and sails left off.
HULL = 'brig'
# Her keel's bottom is this far under the ships' frame's zero, and the module stands it at the origin.
KEEL_M = 1.0
# The outrigger beams, fore and aft: where along her, how far out each way, how thick.
BEAMS_X = (4.6, -6.6)
BEAM_OUT_M = 9.4
BEAM_M = 0.55
# A thruster on a beam's end: its drum's radius and length, hung this far under the beam; its bell's mouth.
DRUM_M = 1.0
DRUM_LONG_M = 4.6
HANG_M = 1.45
BELL_M = 1.45
BELL_LONG_M = 1.4
# The two thrusters under her keel, bells down.
LIFTS_X = (9.4, -10.2)
LIFT_M = 0.8
# Her furnace house amidships, and its two stacks.
FURNACE = (-1.6, 2.6, 1.6, 2.1)
STACKS = ((0.6, 0.85), (0.6, -0.85))
STACK_M = 0.38
STACK_HIGH_M = 6.0


def tube(module, start, end, radius, end_radius=None, material='iron', sides=12, caps=True):
    """A round tube from `start` to `end`, its radius going from `radius` to `end_radius`, faceted."""
    start, end = mathutils.Vector(start), mathutils.Vector(end)
    run = end - start
    made = kit.bmesh.new()
    last = radius if end_radius is None else end_radius
    kit.bmesh.ops.create_cone(made, cap_ends=caps, segments=sides, radius1=radius, radius2=last, depth=run.length)
    data = kit.bpy.data.meshes.new('tube')
    made.to_mesh(data)
    made.free()
    item = kit.item_of(module, f'tube{len(module.objects)}', data, material)
    turn = mathutils.Vector((0.0, 0.0, 1.0)).rotation_difference(run.normalized()).to_matrix().to_4x4()
    item.matrix_world = mathutils.Matrix.Translation((start + end) / 2) @ turn
    return item


def thruster(module, at, way, sockets, name):
    """A thruster hung at `at`, its bell aft along `way` (a unit vector): its drum banded, an intake cowl at its front,
    rivets round its bands, the bell flared and sooted, its throat alight; its mouth's socket named `name`."""
    centre = mathutils.Vector(at)
    way = mathutils.Vector(way).normalized()
    front, back = centre - way * (DRUM_LONG_M / 2), centre + way * (DRUM_LONG_M / 2)
    tube(module, front, back, DRUM_M, sides=16)
    tube(module, front - way * 0.55, front, DRUM_M * 0.72, DRUM_M, sides=16, caps=False)
    tube(module, front - way * 0.6, front - way * 0.5, DRUM_M * 0.55, DRUM_M * 0.55, material='iron', sides=16)
    for k in range(5):
        band = front + way * (DRUM_LONG_M * (0.1 + 0.2 * k))
        tube(module, band - way * 0.07, band + way * 0.07, DRUM_M + 0.06, sides=16)
    mouth = back + way * BELL_LONG_M
    tube(module, back, mouth, DRUM_M * 0.92, BELL_M, sides=16, caps=False)
    tube(module, mouth - way * 0.08, mouth, BELL_M + 0.05, BELL_M + 0.08, sides=16, caps=False)
    # The throat: the fire seen up the bell, and its glow on the bell's inner wall.
    tube(module, back - way * 0.05, back + way * 0.6, DRUM_M * 0.75, DRUM_M * 0.95, material='glow', sides=16)
    module.socket(name, tuple(mouth), (way.x, way.y))
    sockets.append(name)


def beams(module, shape, sockets):
    """Each outrigger beam through her bulwarks, iron-capped and braced to her sides, a thruster under each end and a
    pipe run out along it from the furnace."""
    turn = 0
    for x in BEAMS_X:
        z = shape.deck(x) + 0.45
        board(module, Frame(), (x, 0.0, z), (BEAM_M, BEAM_OUT_M * 2, BEAM_M))
        for side in (1, -1):
            board(module, Frame(), (x, side * (BEAM_OUT_M - 0.2), z), (BEAM_M + 0.12, 0.5, BEAM_M + 0.12), 'iron')
            for band in (3.2, 5.6, 7.8):
                board(module, Frame(), (x, side * band, z), (BEAM_M + 0.06, 0.12, BEAM_M + 0.06), 'iron')
            low, _ = shape.surface(x, 1.8)
            tube(module, (x, side * 7.4, z - 0.2), (x, side * low[1], low[2]), 0.11, sides=8)
            tube(module, (x + 0.5, side * 7.4, z - 0.2), (x + 0.4, side * low[1], low[2] + 0.2), 0.08, sides=8)
            drum = (x - 0.4, side * BEAM_OUT_M * 0.92, z - HANG_M)
            for along in (-1.2, 1.2):
                board(module, Frame(), (drum[0] + along, drum[1], z - HANG_M / 2 + 0.1), (0.14, 0.32, HANG_M), 'iron')
            turn += 1
            thruster(module, drum, (-1.0, 0.0, 0.0), sockets, f'thrust-{turn}')
            tube(module, (x + 0.3, side * 1.8, z + 0.36), (x + 0.3, side * (BEAM_OUT_M - 0.6), z + 0.36), 0.12,
                 sides=8)
            tube(module, (x + 0.3, side * (BEAM_OUT_M - 0.6), z + 0.36), (drum[0] + 0.8, drum[1], drum[2] + DRUM_M),
                 0.12, sides=8)


def lifts(module, shape, sockets):
    """The two thrusters under her keel, hung in iron frames, bells down."""
    for number, x in enumerate(LIFTS_X, start=1):
        keel = shape.keel(x)
        for side in (1, -1):
            board(module, Frame(), (x, side * 0.5, keel - 0.35), (1.2, 0.12, 0.9), 'iron')
        top, low = keel - 0.55, keel - 1.7
        tube(module, (x, 0.0, top), (x, 0.0, low), LIFT_M, sides=14)
        for band in (top - 0.25, low + 0.25):
            tube(module, (x, 0.0, band + 0.06), (x, 0.0, band - 0.06), LIFT_M + 0.05, sides=14)
        mouth = low - 0.95
        tube(module, (x, 0.0, low), (x, 0.0, mouth), LIFT_M * 0.92, LIFT_M * 1.5, sides=14, caps=False)
        tube(module, (x, 0.0, low + 0.05), (x, 0.0, low - 0.5), LIFT_M * 0.7, LIFT_M * 0.95, material='glow',
             sides=14)
        name = f'lift-{number}'
        module.socket(name, (x, 0.0, mouth), (0.0, 0.0))
        sockets.append(name)


def furnace(module, shape, sockets):
    """The furnace house of riveted iron plate amidships, its firebox door alight, coal heaped by it, its two stacks
    with collars and capped tops, and the stores round it."""
    aft, fore, half, high = FURNACE
    deck = shape.deck((aft + fore) / 2)
    middle = ((aft + fore) / 2, 0.0, deck + high / 2)
    board(module, Frame(), middle, (fore - aft, half * 2, high), 'iron', bevel=0.04)
    board(module, Frame(), (middle[0], 0.0, deck + high + 0.06), (fore - aft + 0.3, half * 2 + 0.3, 0.12), 'iron')
    for k in range(4):
        x = aft + (fore - aft) * (k + 0.5) / 4
        for side in (1, -1):
            board(module, Frame(), (x, side * (half + 0.02), deck + high / 2), (0.06, 0.04, high - 0.1), 'iron')
    board(module, Frame(), (fore + 0.03, 0.0, deck + 0.55), (0.05, 0.8, 0.6), 'glow')
    board(module, Frame(), (fore + 0.06, 0.0, deck + 0.55), (0.04, 1.0, 0.08), 'iron')
    kit.rock(module, (fore + 1.1, 0.9, deck), (0.9, 0.7, 0.45), 31, part=False, detail=2)
    kit.rock(module, (fore + 1.0, -0.8, deck), (0.7, 0.6, 0.35), 32, part=False, detail=2)
    for number, (x, y) in enumerate(STACKS, start=1):
        base, top = deck + high, deck + high + STACK_HIGH_M
        tube(module, (x, y, base), (x, y, top), STACK_M, sides=12)
        for band in (base + 1.5, base + 3.5):
            tube(module, (x, y, band - 0.06), (x, y, band + 0.06), STACK_M + 0.05, sides=12)
        tube(module, (x, y, top), (x, y, top + 0.35), STACK_M, STACK_M * 1.35, sides=12, caps=False)
        name = f'stack-{number}'
        module.socket(name, (x, y, top + 0.35), (0.0, 0.0))
        sockets.append(name)
    for at, turn in (((aft - 1.0, 1.4), 0.2), ((aft - 1.1, -1.3), -0.3), ((fore + 2.6, -1.6), 0.5)):
        crate(module, Frame((at[0], at[1], shape.deck(at[0])), turn), (0.8, 0.8, 0.75))
    for at in ((aft - 2.2, 1.6), (aft - 2.3, 0.9), (fore + 2.4, 1.7)):
        barrel(module, Frame((at[0], at[1], shape.deck(at[0])), module.draw(0, 1)))


def mast(module, shape):
    """Her foremast cut down to a stub, a crow's nest on it and a yard across it, the Tithe's grey banner hung from
    the yard; her mainmast's stump."""
    x = 6.9
    deck = shape.deck(x)
    top = deck + 7.2
    tube(module, (x, 0.0, deck), (x, 0.0, top), 0.3, 0.26, material='timber', sides=10)
    board(module, Frame(), (x, 0.0, top - 1.4), (1.7, 1.7, 0.14))
    for side in (1, -1):
        board(module, Frame(), (x + side * 0.82, 0.0, top - 1.0), (0.06, 1.7, 0.7))
        board(module, Frame(), (x, side * 0.82, top - 1.0), (1.7, 0.06, 0.7))
    yard = top - 0.5
    tube(module, (x + 0.35, -2.8, yard), (x + 0.35, 2.8, yard), 0.11, material='timber', sides=8)
    rows, columns = 8, 5
    points = []
    for row in range(rows):
        down = row / (rows - 1)
        for column in range(columns):
            across = (column / (columns - 1) - 0.5) * 3.6
            points.append((x + 0.42 + 0.12 * math.sin(down * math.pi) + 0.05 * math.sin(across * 2.1),
                           across * (1.0 - 0.12 * down), yard - 0.05 - down * 3.4))
    cloth(module, 'banner', points, rows, columns)
    stump = -3.55
    tube(module, (stump, 0.0, shape.deck(stump)), (stump, 0.0, shape.deck(stump) + 1.3), 0.34, 0.33,
         material='timber', sides=10)
    ring(module, Frame(), (stump, 0.0, shape.deck(stump) + 1.25), 0.34, 0.05, axis='Z')


def plating(module, shape):
    """Iron plate riveted over her lower sides, where the sea once was, a plate every 2 m along her, each laid on her
    planking and standing a hand's breadth proud of it."""
    for side in (1, -1):
        for k in range(12):
            x0 = -11.6 + 2.0 * k
            inner, outer = [], []
            for x, z in ((x0, 1.0), (x0 + 1.9, 1.0), (x0 + 1.9, 2.7), (x0, 2.7)):
                (_, y, height), out = shape.surface(x, z)
                inner.append((x, side * (y + out[1] * 0.02), height + out[2] * 0.02))
                outer.append((x, side * (y + out[1] * 0.07), height + out[2] * 0.07))
            points = inner + outer
            faces = [(4, 5, 6, 7), (0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
            # Each face wound to face away from her middle, out of the plate.
            middle = [sum(point[axis] for point in points) / 8 for axis in range(3)]
            faces = kit.oriented(points, faces, lambda at, middle=middle: [at[axis] - middle[axis] for axis in range(3)])
            kit.solid_of(module, 'plate', points, faces, 'iron')


def wales(module, shape):
    """Two heavy strakes of timber along each of her sides over the plate, standing proud of her planking, as a brig's
    wales do."""
    for z0, z1 in ((2.78, 3.0), (3.08, 3.26)):
        for side in (1, -1):
            stations = [-13.0 + 0.65 * k for k in range(41)]
            points = []
            for x in stations:
                for z in (z0, z1):
                    (_, y, height), out = shape.surface(x, z)
                    points.append((x, side * (y + out[1] * 0.01), height + out[2] * 0.01))
                    points.append((x, side * (y + out[1] * 0.11), height + out[2] * 0.11))
            faces = []
            for k in range(len(stations) - 1):
                a, b = 4 * k, 4 * (k + 1)
                faces += [(a + 1, b + 1, b + 3, a + 3), (a + 2, a + 3, b + 3, b + 2), (a, b, b + 1, a + 1)]
            last = 4 * (len(stations) - 1)
            faces += [(0, 1, 3, 2), (last, last + 2, last + 3, last + 1)]
            middle = [sum(point[axis] for point in points) / len(points) for axis in range(3)]
            outward = lambda at, middle=middle: [0.0, at[1] - middle[1] + (at[1] - middle[1]) * 4, at[2] - middle[2]]
            kit.solid_of(module, 'wale', points, kit.oriented(points, faces, outward), 'timber')


def spur(module, shape):
    """An iron spur run out from her stem, collared where it meets her: the Tithe's, as their Ram's."""
    stem = shape.fore - 0.4
    low = shape.keel(stem) + 1.2
    tube(module, (stem, 0.0, low + 0.3), (stem + 3.6, 0.0, low - 0.2), 0.36, 0.03, sides=6)
    tube(module, (stem - 0.2, 0.0, low + 0.32), (stem + 0.25, 0.0, low + 0.28), 0.46, 0.46, sides=6)


def stays(module, shape):
    """Iron stays from her foremast's stub and from her stacks' collars out to each outrigger's end, holding the beams
    as she drives."""
    top = shape.deck(6.9) + 6.6
    for x in BEAMS_X:
        z = shape.deck(x) + 0.45
        for side in (1, -1):
            tube(module, (6.9, 0.0, top), (x, side * (BEAM_OUT_M - 0.4), z + 0.3), 0.03, sides=5)
            stack = STACKS[0 if side > 0 else 1]
            collar = (stack[0], stack[1], shape.deck(stack[0]) + FURNACE[3] + 3.5)
            tube(module, collar, (x, side * (BEAM_OUT_M - 0.6), z + 0.3), 0.025, sides=5)


def hatch(module, shape, sockets):
    """Her drop hatch amidships under her: an iron frame round it, its two doors hung open below her."""
    keel = shape.keel(0.0)
    for side in (1, -1):
        board(module, Frame(), (0.0, side * 1.2, keel - 0.06), (3.3, 0.14, 0.12), 'iron')
        board(module, Frame(), (side * 1.6, 0.0, keel - 0.06), (0.14, 2.5, 0.12), 'iron')
        board(module, Frame(), (0.0, side * 1.42, keel - 0.6), (3.0, 0.08, 1.1), rotation=(side * 0.35, 0.0, 0.0))
    module.socket('hatch', (0.0, 0.0, keel - 0.1), (0.0, 0.0))
    sockets.append('hatch')


def lanterns(module, shape):
    """A lantern at her bow and two at her stern, an iron cage round a flame; and her cabin's windows lit across her
    stern, each in its frame."""
    places = [(15.2, 0.0, shape.deck(15.2) + 2.3), (-15.3, 1.1, shape.deck(-15.3) + 2.7),
              (-15.3, -1.1, shape.deck(-15.3) + 2.7)]
    for at in places:
        board(module, Frame(), at, (0.26, 0.26, 0.34), 'glow')
        board(module, Frame(), (at[0], at[1], at[2] + 0.21), (0.34, 0.34, 0.06), 'iron')
        board(module, Frame(), (at[0], at[1], at[2] - 0.21), (0.34, 0.34, 0.06), 'iron')
    aft = shape.aft
    for y in (-1.5, -0.5, 0.5, 1.5):
        x = aft + 0.32 + 0.1 * abs(y)
        z = shape.deck(x) + 0.85
        board(module, Frame(), (x - 0.04, y, z), (0.06, 0.62, 0.5), 'glow')
        board(module, Frame(), (x - 0.08, y, z), (0.05, 0.72, 0.08), 'timber')
        board(module, Frame(), (x - 0.08, y, z + 0.3), (0.05, 0.76, 0.1), 'timber')


def airship(module):
    """The airship whole, turned so her bow points along the module's front."""
    numbers = shipkit.numbers(HULL, masts=(), headsails=(), bowsprit=None)
    _, shape = shipkit.hull(module, numbers)
    sockets = []
    beams(module, shape, sockets)
    lifts(module, shape, sockets)
    furnace(module, shape, sockets)
    mast(module, shape)
    plating(module, shape)
    wales(module, shape)
    spur(module, shape)
    stays(module, shape)
    hatch(module, shape, sockets)
    lanterns(module, shape)
    # The ships' frame turned to the module's: her bow to Blender's -y, her keel's bottom at the origin.
    turned = mathutils.Matrix.Translation((0.0, 0.0, KEEL_M)) @ mathutils.Matrix.Rotation(-math.pi / 2, 4, 'Z')
    kit.bpy.context.view_layer.update()
    for item in module.objects:
        item.matrix_world = turned @ item.matrix_world
    for socket in module.sockets:
        at = turned @ mathutils.Vector(socket['at'])
        way = turned.to_3x3() @ mathutils.Vector((*socket['facing'], 0.0))
        socket['at'] = [at.x, at.y, at.z]
        socket['facing'] = [way.x, way.y]
