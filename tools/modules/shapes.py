"""Shapes past the kit's cut stone, for the things a keeper's stall is furnished with: slabs set at any angle, rods
between two points, turned work (a barrel, a pot, a candle, a baluster) from its profile, rings, balls, flat shapes
cut from an outline (a blade, a shield, a banner), and cloth: a drape hung from a rail and a striped awning.

None of them adds a part: the module adds the parts a body runs into itself, since a stall's furniture is too fine
for every piece to stop a body. Each takes its place in the module's frame (x east, y north, z up), and `turn` as
Blender's rotation, x then y then z, in radians.
"""
import math

import bmesh
import bpy  # noqa: F401 (bmesh and mathutils load with bpy)
import mathutils

import kit


def _placed(module, made, name, material, middle, turn, smooth=False):
    mesh = bpy.data.meshes.new(name)
    made.to_mesh(mesh)
    made.free()
    if smooth:
        for polygon in mesh.polygons:
            polygon.use_smooth = True
    item = kit.item_of(module, f'{name}{len(module.objects)}', mesh, material)
    item.location = middle
    item.rotation_euler = turn
    return item


def slab(module, middle, size, material, turn=(0.0, 0.0, 0.0), bevel=0.0):
    """A box round its middle, `size` across its own x, y and z, set at any angle; bevelled when asked."""
    made = bmesh.new()
    bmesh.ops.create_cube(made, size=1.0)
    bmesh.ops.scale(made, vec=mathutils.Vector(size), verts=made.verts)
    item = _placed(module, made, 'slab', material, middle, turn)
    if bevel > 0:
        modifier = item.modifiers.new('bevel', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 1
    return item


def rod(module, start, end, radius, material, sides=8, end_radius=None):
    """A round rod from `start` to `end`, capped, `radius` thick (tapering to `end_radius` at its end when given)."""
    start, end = mathutils.Vector(start), mathutils.Vector(end)
    length = (end - start).length
    made = bmesh.new()
    bmesh.ops.create_cone(made, cap_ends=True, segments=sides, radius1=radius,
                          radius2=radius if end_radius is None else end_radius, depth=length)
    bmesh.ops.translate(made, vec=(0.0, 0.0, length / 2), verts=made.verts)
    turn = (end - start).to_track_quat('Z', 'Y').to_euler()
    return _placed(module, made, 'rod', material, start, turn, smooth=sides > 6)


def lathe(module, at, profile, material, sides=16, turn=(0.0, 0.0, 0.0), smooth=True):
    """Turned work on `at`: the surface swept round its up axis by `profile`, (radius, height) pairs from its foot up,
    closed at its foot and its top where their radius is not nothing."""
    made = bmesh.new()
    rings = []
    for radius, height in profile:
        rings.append([made.verts.new((math.cos(math.tau * side / sides) * radius,
                                      math.sin(math.tau * side / sides) * radius, height)) for side in range(sides)])
    for low, high in zip(rings, rings[1:]):
        for side in range(sides):
            after = (side + 1) % sides
            made.faces.new((low[side], low[after], high[after], high[side]))
    if profile[0][0] > 1e-6:
        made.faces.new(rings[0][::-1])
    if profile[-1][0] > 1e-6:
        made.faces.new(rings[-1])
    bmesh.ops.remove_doubles(made, verts=made.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(made, faces=made.faces)
    return _placed(module, made, 'lathe', material, at, turn, smooth=smooth)


def ring(module, middle, radius, thick, material, turn=(0.0, 0.0, 0.0), segments=20, sides=4):
    """A ring of round section, `radius` to the middle of its rim and `thick` across the rim, lying level unless
    turned."""
    made = bmesh.new()
    loops = []
    for segment in range(segments):
        around = math.tau * segment / segments
        loop = []
        for side in range(sides):
            across = math.tau * side / sides
            reach = radius + math.cos(across) * thick / 2
            loop.append(made.verts.new((math.cos(around) * reach, math.sin(around) * reach,
                                        math.sin(across) * thick / 2)))
        loops.append(loop)
    for segment in range(segments):
        here, there = loops[segment], loops[(segment + 1) % segments]
        for side in range(sides):
            after = (side + 1) % sides
            made.faces.new((here[side], there[side], there[after], here[after]))
    bmesh.ops.recalc_face_normals(made, faces=made.faces)
    return _placed(module, made, 'ring', material, middle, turn, smooth=True)


def ball(module, middle, radius, material, detail=1, scale=(1.0, 1.0, 1.0), turn=(0.0, 0.0, 0.0)):
    """A ball round its middle, stretched by `scale` along its own axes."""
    made = bmesh.new()
    bmesh.ops.create_icosphere(made, subdivisions=detail, radius=radius)
    bmesh.ops.scale(made, vec=mathutils.Vector(scale), verts=made.verts)
    return _placed(module, made, 'ball', material, middle, turn, smooth=True)


def cutout(module, outline, depth, material, middle, turn=(0.0, 0.0, 0.0)):
    """A flat shape cut from `outline` ((x, z) points round it, in its own plane) and `depth` thick along its own y,
    its own origin at `middle`: a blade, a shield, a banner's swallowtail."""
    made = bmesh.new()
    front = [made.verts.new((x, -depth / 2, z)) for x, z in outline]
    back = [made.verts.new((x, depth / 2, z)) for x, z in outline]
    made.faces.new(front)
    made.faces.new(back[::-1])
    count = len(outline)
    for corner in range(count):
        after = (corner + 1) % count
        made.faces.new((front[corner], back[corner], back[after], front[after]))
    bmesh.ops.recalc_face_normals(made, faces=made.faces)
    return _placed(module, made, 'cutout', material, middle, turn)


def drape(module, start, end, drop, material, folds=4, depth=0.08, hem=0.0, thick=0.02):
    """Cloth hung from a level rail from `start` to `end`, falling `drop`, rippled `depth` out of its plane in `folds`
    folds that deepen toward its hem, its hem drawn up `hem` at its middle (a swag) when asked."""
    start, end = mathutils.Vector(start), mathutils.Vector(end)
    along = end - start
    out = mathutils.Vector((-along.y, along.x, 0.0)).normalized()
    columns, rows = max(4, folds * 4), 4
    made = bmesh.new()
    grid = []
    for row in range(rows + 1):
        down = row / rows
        line = []
        for column in range(columns + 1):
            share = column / columns
            ripple = math.sin(share * folds * math.tau) * depth * (0.45 + 0.55 * down)
            lift = hem * math.sin(share * math.pi) * down
            point = start + along * share + out * ripple
            point.z -= drop * down - lift
            line.append(made.verts.new(point))
        grid.append(line)
    for row in range(rows):
        for column in range(columns):
            made.faces.new((grid[row][column], grid[row][column + 1], grid[row + 1][column + 1],
                            grid[row + 1][column]))
    item = _placed(module, made, 'drape', material, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0), smooth=True)
    _thickened(item, thick)
    return item


def _thickened(item, thick):
    modifier = item.modifiers.new('thick', 'SOLIDIFY')
    modifier.thickness = thick
    modifier.offset = 0.0


def awning(module, west, east, back, front, high, low, cloths, stripes=6, sag=0.12, valance=0.32):
    """A canvas awning from its back edge (y `back`, at `high`) down to its front edge (y `front`, at `low`), across
    x from `west` to `east`, in `stripes` stripes of `cloths` in turn, sagging `sag` between its edges, a scalloped
    valance hanging `valance` from its front edge."""
    width = (east - west) / stripes
    rows = 5
    for stripe in range(stripes):
        material = cloths[stripe % len(cloths)]
        made = bmesh.new()
        grid = []
        for row in range(rows + 1):
            share = row / rows
            y = back + (front - back) * share
            z = high + (low - high) * share - sag * math.sin(share * math.pi)
            grid.append([made.verts.new((west + width * stripe + width * side, y, z)) for side in (0, 0.5, 1)])
        for row in range(rows):
            for side in range(2):
                made.faces.new((grid[row][side], grid[row][side + 1], grid[row + 1][side + 1], grid[row + 1][side]))
        # The valance: a flap hung from the front edge, its hem cut in a scallop.
        down = 1 if front < back else -1
        edge = [made.verts.new((west + width * stripe + width * share, front, low)) for share in (0.0, 1.0)]
        scallop = [made.verts.new((west + width * stripe + width * (1 - share),
                                   front, low - valance * (0.7 + 0.3 * math.sin(math.pi * share))))
                   for share in (0.0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0)]
        made.faces.new(edge + scallop if down > 0 else (edge + scallop)[::-1])
        item = _placed(module, made, 'awning', material, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0))
        _thickened(item, 0.03)


def banner(module, top, width, drop, material, facing_y=-1.0, trim='gold', tails=True):
    """A banner hung flat on a wall from a gilt rod: `top` the middle of its rod, `width` across x, falling `drop`,
    its foot cut in a swallowtail when `tails`; its face toward `facing_y` (-1 south, 1 north)."""
    half = width / 2
    foot = -drop
    outline = [(-half, 0.0), (half, 0.0), (half, foot)]
    outline += [(0.0, foot + width * 0.45), (-half, foot)] if tails else [(-half, foot)]
    offset = 0.03 * facing_y
    cutout(module, outline, 0.02, material, (top[0], top[1] + offset, top[2]))
    # A border of the trim down each side and across its head.
    for side in (-1, 1):
        slab(module, (top[0] + side * (half - 0.04), top[1] + offset * 1.6, top[2] - drop * 0.42),
             (0.06, 0.012, drop * 0.84), trim)
    rod(module, (top[0] - half - 0.12, top[1] + offset, top[2] + 0.04),
        (top[0] + half + 0.12, top[1] + offset, top[2] + 0.04), 0.025, 'gold' if trim == 'gold' else 'iron', sides=6)


def pyramid(module, middle, half_x, half_y, rise, material, eave=0.15, top=None):
    """A hipped cap on a rectangle round `middle` (its foot), `half_x` and `half_y` across, an eave `eave` deep at its
    edge, rising `rise` to a point, or to a flat top `top` (its half x and half y) to make a hood."""
    made = bmesh.new()
    foot = [made.verts.new((x * half_x, y * half_y, 0.0)) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    edge = [made.verts.new((vertex.co.x, vertex.co.y, eave)) for vertex in foot]
    if top is None:
        peak = [made.verts.new((0.0, 0.0, rise))]
    else:
        peak = [made.verts.new((x * top[0], y * top[1], rise)) for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        made.faces.new(peak)
    made.faces.new(foot[::-1])
    for corner in range(4):
        after = (corner + 1) % 4
        made.faces.new((foot[corner], foot[after], edge[after], edge[corner]))
        made.faces.new((edge[corner], edge[after], *([peak[0]] if top is None else [peak[after], peak[corner]])))
    bmesh.ops.recalc_face_normals(made, faces=made.faces)
    return _placed(module, made, 'pyramid', material, middle, (0.0, 0.0, 0.0))


class frame:
    """Builds a piece in a frame of its own: whatever is added inside `with shapes.frame(module, at, quarter):` is
    turned `quarter` quarter turns about up (counterclockwise seen from above) and then moved to `at`, its surfaces,
    its parts (still square to the module's frame) and its sockets alike."""

    def __init__(self, module, at, quarter=0):
        self.module = module
        self.matrix = mathutils.Matrix.Translation(at) @ mathutils.Matrix.Rotation(quarter * math.pi / 2, 4, 'Z')

    def __enter__(self):
        self.counts = (len(self.module.objects), len(self.module.parts), len(self.module.sockets))
        return self

    def __exit__(self, *exception):
        objects, parts, sockets = self.counts
        # An object's world matrix holds its place only once the scene is brought up to date.
        bpy.context.view_layer.update()
        for item in self.module.objects[objects:]:
            item.matrix_world = self.matrix @ item.matrix_world
        for number in range(parts, len(self.module.parts)):
            x0, y0, z0, x1, y1, z1 = self.module.parts[number]
            corners = [self.matrix @ mathutils.Vector((x, y, z0)) for x in (x0, x1) for y in (y0, y1)]
            self.module.parts[number] = [round(min(c.x for c in corners), 6), round(min(c.y for c in corners), 6),
                                         z0 + self.matrix.translation.z, round(max(c.x for c in corners), 6),
                                         round(max(c.y for c in corners), 6), z1 + self.matrix.translation.z]
        for socket in self.module.sockets[sockets:]:
            point = self.matrix @ mathutils.Vector(socket['at'])
            facing = self.matrix.to_3x3() @ mathutils.Vector((*socket['facing'], 0.0))
            socket['at'] = [round(point.x, 6), round(point.y, 6), round(point.z, 6)]
            socket['facing'] = [round(facing.x, 6), round(facing.y, 6)]
        bpy.context.view_layer.update()
        return False
