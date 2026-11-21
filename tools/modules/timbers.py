"""What the event props' carpentry and cloth are built from: weathered boards and posts, iron bands and plates, crates,
barrels and sacks, cloth draped over a stack or hung from a bar. Each piece is placed by a frame (`Frame`): a point on
the ground and a turn about up, so a crate is built in its own square frame and stands wherever its stack wants it.
"""
import math

import bmesh
import bpy
import mathutils

import kit


class Frame:
    """A place to build in: `at` (x, y, z) and `turn` radians about up, carrying a piece's own frame to the module's."""

    def __init__(self, at=(0.0, 0.0, 0.0), turn=0.0, tilt=(0.0, 0.0)):
        self.at = mathutils.Vector(at)
        self.turn = turn
        self.tilt = tilt
        self.matrix = (mathutils.Matrix.Translation(self.at) @ mathutils.Matrix.Rotation(turn, 4, 'Z')
                       @ mathutils.Matrix.Rotation(tilt[1], 4, 'Y') @ mathutils.Matrix.Rotation(tilt[0], 4, 'X'))

    def point(self, local):
        return self.matrix @ mathutils.Vector(local)

    def inner(self, at=(0.0, 0.0, 0.0), turn=0.0, tilt=(0.0, 0.0)):
        """A frame inside this one."""
        made = Frame()
        made.matrix = self.matrix @ Frame(at, turn, tilt).matrix
        return made


def placed(item, frame, local, rotation=(0.0, 0.0, 0.0)):
    """Sets an object's place from its own middle `local` and `rotation` (x, y, z radians) in `frame`."""
    item.matrix_world = (frame.matrix @ mathutils.Matrix.Translation(local)
                         @ mathutils.Euler(rotation, 'XYZ').to_matrix().to_4x4())
    return item


def board(module, frame, middle, size, material='timber', rotation=(0.0, 0.0, 0.0), bevel=0.01):
    """A board, post or plate `size` across x, y and up, its middle at `middle` in `frame`, its edges eased."""
    item = kit.block(module, (0.0, 0.0, 0.0), size, material, bevel=bevel if min(size) > 2.5 * bevel else 0.0,
                     wear=0.0, part=False)
    item.location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    # kit.block stands a block on its foot: its mesh is about its middle, so the middle is the object's origin.
    return placed(item, frame, middle, rotation)


def mesh(module, name, made, material, smooth=True, frame=None):
    """A bmesh as an object in one material, smooth or faceted."""
    data = bpy.data.meshes.new(name)
    made.to_mesh(data)
    made.free()
    for polygon in data.polygons:
        polygon.use_smooth = smooth
    item = kit._object(module, f'{name}{len(module.objects)}', data, material)
    if frame is not None:
        item.matrix_world = frame.matrix
    return item


def weathered(module, size):
    """A board's size with the small differences hand-sawn boards have."""
    return tuple(side * module.draw(0.97, 1.03) for side in size)


def crate(module, frame, size=(0.8, 0.8, 0.75), lid=True, gone=(), lean=0.0):
    """A crate of weathered boards on four corner posts, battened top and bottom, braced across its front, its corners
    bound with iron plates; its lid of four boards on two cleats. `gone` names boards knocked out (('front', 1),
    ('lid', 2)...), `lean` tips its lid's last board up as if prised."""
    w, d, h = size
    planks = 3
    plank_h = h / planks
    t = 0.022
    for x in (-1, 1):
        for y in (-1, 1):
            board(module, frame, (x * (w / 2 - 0.035), y * (d / 2 - 0.035), h / 2), (0.06, 0.06, h - 0.01))
    sides = {'front': ((0.0, -d / 2, 0.0), 0.0, w), 'back': ((0.0, d / 2, 0.0), 0.0, w),
             'east': ((w / 2, 0.0, 0.0), math.pi / 2, d), 'west': ((-w / 2, 0.0, 0.0), math.pi / 2, d)}
    for side, (middle, turn, across) in sides.items():
        face = frame.inner(middle, turn)
        for k in range(planks):
            if (side, k) in gone:
                continue
            board(module, face, (module.draw(-0.01, 0.01), 0.0, plank_h * (k + 0.5)),
                  weathered(module, (across - 0.01, t, plank_h - 0.012)), rotation=(0.0, module.draw(-0.012, 0.012), 0.0))
        if side in ('front', 'back'):
            out = -1 if side == 'front' else 1
            for z in (0.045, h - 0.045):
                board(module, face, (0.0, out * 0.02, z), (across + 0.02, 0.03, 0.07))
            if (side, 'brace') not in gone:
                slope = math.atan2(h - 0.14, across - 0.12)
                board(module, face, (0.0, out * 0.024, h / 2), (math.hypot(across - 0.12, h - 0.14), 0.026, 0.07),
                      rotation=(0.0, -slope if side == 'front' else slope, 0.0))
    # Iron plates bent round each corner, top and bottom.
    for x in (-1, 1):
        for y in (-1, 1):
            for z in (0.06, h - 0.06):
                board(module, frame, (x * (w / 2 + 0.008), y * (d / 2 - 0.05), z), (0.006, 0.12, 0.09), 'iron')
                board(module, frame, (x * (w / 2 - 0.05), y * (d / 2 + 0.008), z), (0.12, 0.006, 0.09), 'iron')
    if lid:
        for k in range(4):
            if ('lid', k) in gone:
                continue
            tip = lean if k == 3 else 0.0
            board(module, frame, (0.0, -d / 2 + d * (k + 0.5) / 4, h + 0.012 + tip * 0.12),
                  weathered(module, (w + 0.02, d / 4 - 0.01, t)), rotation=(tip, 0.0, module.draw(-0.01, 0.01)))
        for x in (-1, 1):
            board(module, frame, (x * (w / 2 - 0.1), 0.0, h + 0.04), (0.07, d - 0.04, 0.03))
    return h + 0.05


def globe(around, rings):
    """A unit sphere of `rings` bands, `around` faces each, its faces wound outward. Built by hand: Blender's own uv
    sphere lays its faces' corners in an order that differs from one run to the next."""
    made = bmesh.new()
    bottom = made.verts.new((0.0, 0.0, -1.0))
    bands = []
    for ring in range(1, rings):
        lift = -math.cos(math.pi * ring / rings)
        wide = math.sin(math.pi * ring / rings)
        bands.append([made.verts.new((math.cos(math.tau * k / around) * wide, math.sin(math.tau * k / around) * wide,
                                      lift)) for k in range(around)])
    top = made.verts.new((0.0, 0.0, 1.0))
    for k in range(around):
        j = (k + 1) % around
        made.faces.new((bottom, bands[0][j], bands[0][k]))
        for ring in range(len(bands) - 1):
            made.faces.new((bands[ring][k], bands[ring][j], bands[ring + 1][j], bands[ring + 1][k]))
        made.faces.new((bands[-1][k], bands[-1][j], top))
    return made


def sack(module, frame, size=(0.32, 0.62), slumped=0.0, slit=False):
    """A sack of grey canvas, `size` its radius and height: full and round at the foot, creased, gathered at its neck
    and tied with cord; `slumped` lets it sag as a slit sack empties."""
    radius, high = size
    made = globe(14, 10)
    noise = mathutils.noise
    seed = mathutils.Vector((module.draw(0, 50), module.draw(0, 50), 0.0))
    neck_at = 0.78
    for vertex in made.verts:
        p = vertex.co
        up = (p.z + 1) / 2   # 0 at its foot, 1 at its top
        width = radius * (1.0 + 0.5 * slumped * (1 - up))
        if up > neck_at:   # gathered to the neck, then flaring a little above the tie
            gather = (up - neck_at) / (1 - neck_at)
            width *= 0.22 + 0.25 * gather ** 2
        else:
            width *= 1.0 - 0.15 * (up / neck_at) ** 3
        crease = 1.0 + 0.07 * noise.noise(p * 3.0 + seed) + 0.03 * noise.noise(p * 7.0 + seed)
        z = high * (1 - slumped * 0.55) * max(0.0, up - 0.04) / 0.96
        vertex.co = mathutils.Vector((p.x * width * crease, p.y * width * crease * 0.85, z))
    if slit:   # the slit: its side opened and fallen in
        for vertex in made.verts:
            if vertex.co.y < -radius * 0.5 and 0.1 < vertex.co.z < high * 0.5:
                vertex.co.y *= 0.55
    item = mesh(module, 'sack', made, 'canvas', frame=frame)
    tie = bmesh.new()
    bmesh.ops.create_cone(tie, cap_ends=True, segments=10, radius1=radius * 0.26, radius2=radius * 0.24, depth=0.04)
    bmesh.ops.translate(tie, vec=(0.0, 0.0, high * (1 - slumped * 0.55) * (neck_at + 0.02)), verts=tie.verts)
    mesh(module, 'tie', tie, 'timber', frame=frame)
    return item


def barrel(module, frame, radius=0.3, high=0.86, staves=18, hoops=4, head=True):
    """A barrel of staves, each its own board bellied out at the middle, its heads set in, bound with iron hoops."""
    made = bmesh.new()
    rings = 8

    def bulge(z):
        return radius * (0.84 + 0.16 * math.sin(math.pi * z / high))

    for stave in range(staves):
        own = module.draw(0.985, 1.015)
        a0, a1 = math.tau * stave / staves, math.tau * (stave + 0.96) / staves
        column = []
        for ring in range(rings + 1):
            z = high * ring / rings
            r = bulge(z) * own
            column.append((made.verts.new((math.cos(a0) * r, math.sin(a0) * r, z)),
                           made.verts.new((math.cos(a1) * r, math.sin(a1) * r, z))))
        for ring in range(rings):
            made.faces.new((column[ring][0], column[ring][1], column[ring + 1][1], column[ring + 1][0]))
    if head:
        for z, flip in ((0.04, True), (high - 0.04, False)):
            disk = [made.verts.new((math.cos(math.tau * k / staves) * bulge(z) * 0.96,
                                    math.sin(math.tau * k / staves) * bulge(z) * 0.96, z)) for k in range(staves)]
            made.faces.new(disk[::-1] if flip else disk)
    item = mesh(module, 'barrel', made, 'timber', smooth=False, frame=frame)
    band = bmesh.new()
    for k in range(hoops):
        z = high * (0.08 + 0.84 * k / (hoops - 1)) if hoops > 1 else high / 2
        rim = []
        for corner in range(staves):
            angle = math.tau * corner / staves
            r = bulge(z) + 0.008
            rim.append((band.verts.new((math.cos(angle) * r, math.sin(angle) * r, z - 0.02)),
                        band.verts.new((math.cos(angle) * r, math.sin(angle) * r, z + 0.02))))
        for corner in range(staves):
            a, b = rim[corner], rim[(corner + 1) % staves]
            band.faces.new((a[0], b[0], b[1], a[1]))
    mesh(module, 'hoop', band, 'iron', smooth=True, frame=frame)
    return item


def cloth(module, name, points, rows, columns, material='canvas'):
    """A sheet of cloth from a grid of `points` (rows by columns, row by row), smooth."""
    made = bmesh.new()
    verts = [made.verts.new(point) for point in points]
    for row in range(rows - 1):
        for column in range(columns - 1):
            k = row * columns + column
            made.faces.new((verts[k], verts[k + 1], verts[k + columns + 1], verts[k + columns]))
    return mesh(module, name, made, material)


def tarp(module, middle, size, tops, sag=0.05, torn=0.0, rope=True):
    """A tarp `size` (x, y) laid over a stack with its middle at `middle` (x, y): `tops` the boxes it lies on, each
    (x0, y0, x1, y1, top); it lies on them, falls in a curve off their edges to the ground, creased, and is pegged
    out at its corners by cords. `torn` drags it off toward -x, as plunderers leave it."""
    step = 0.09
    columns = int(size[0] / step) + 1
    rows = int(size[1] / step) + 1
    noise = mathutils.noise
    seed = mathutils.Vector((module.draw(0, 50), module.draw(0, 50), 0.0))
    heights = []
    for row in range(rows):
        for column in range(columns):
            x = middle[0] - size[0] / 2 + size[0] * column / (columns - 1)
            y = middle[1] - size[1] / 2 + size[1] * row / (rows - 1)
            best = 0.0
            for x0, y0, x1, y1, top in tops:
                # Cloth lies on a top and falls away from its edge over a hand's width, then hangs.
                out = math.hypot(max(x0 - x, 0.0, x - x1), max(y0 - y, 0.0, y - y1))
                best = max(best, top - (out * 2.2) ** 1.3 * top if out > 0 else top)
            heights.append(best)
    points = []
    for row in range(rows):
        for column in range(columns):
            x = middle[0] - size[0] / 2 + size[0] * column / (columns - 1)
            y = middle[1] - size[1] / 2 + size[1] * row / (rows - 1)
            near = [heights[r * columns + c] for r in range(max(0, row - 1), min(rows, row + 2))
                    for c in range(max(0, column - 1), min(columns, column + 2))]
            z = max(heights[row * columns + column] - sag * 0.3, sum(near) / len(near)) + 0.015
            z += 0.025 * noise.noise(mathutils.Vector((x, y, 0.0)) * 3.0 + seed)
            if torn:
                share = column / (columns - 1)
                z *= 1.0 - torn * max(0.0, 0.6 - share)
                x -= torn * max(0.0, 0.6 - share) * 0.5
            points.append((x, y, max(z, 0.012)))
    item = cloth(module, 'tarp', points, rows, columns)
    if rope:
        for cx, cy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            corner = points[(0 if cy < 0 else rows - 1) * columns + (0 if cx < 0 else columns - 1)]
            peg = (corner[0] + cx * 0.35, corner[1] + cy * 0.35, 0.0)
            run = mathutils.Vector(peg) - mathutils.Vector(corner)
            frame = Frame()
            along = run.normalized()
            item_rope = board(module, frame, tuple((mathutils.Vector(corner) + mathutils.Vector(peg)) / 2),
                              (0.012, 0.012, run.length), 'timber', bevel=0.0)
            item_rope.rotation_euler = mathutils.Vector((0.0, 0.0, 1.0)).rotation_difference(along).to_euler()
            board(module, Frame(peg), (0.0, 0.0, 0.08), (0.035, 0.035, 0.2), 'timber',
                  rotation=(cy * 0.25, -cx * 0.25, 0.0), bevel=0.0)
    return item


def ring(module, frame, middle, major, minor, material='iron', segments=12, sides=6, axis='X'):
    """A ring (a handle's, a hoop's), its middle at `middle`, round the frame's `axis`."""
    made = bmesh.new()
    loops = []
    for k in range(segments):
        a = math.tau * k / segments
        loop = []
        for j in range(sides):
            b = math.tau * j / sides
            r = major + minor * math.cos(b)
            local = (r * math.cos(a), r * math.sin(a), minor * math.sin(b))
            if axis == 'X':
                local = (local[2], local[0], local[1])
            elif axis == 'Y':
                local = (local[0], local[2], local[1])
            loop.append(made.verts.new(tuple(local[i] + middle[i] for i in range(3))))
        loops.append(loop)
    for k in range(segments):
        for j in range(sides):
            a, b = loops[k], loops[(k + 1) % segments]
            made.faces.new((a[j], b[j], b[(j + 1) % sides], a[(j + 1) % sides]))
    return mesh(module, 'ring', made, material, frame=frame)
