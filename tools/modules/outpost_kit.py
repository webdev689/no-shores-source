"""The shells the outposts' structures are built from, a tier's walls, roofs and cloth: rough poles, ridge tents and
canvas flies for a frontier camp (tier 1); boarded walls on stone sills under shingle roofs (tier 2); cut stone walls
with arrow slits and iron-bound doors (tier 3). Each structure stands on a footprint of 4 m cells, its origin the
middle of its foot and its front toward -y; `fits` fails the bake if it reaches within 0.2 m of an edge.
"""
import math

import bpy
import mathutils

import fittings
import kit
import shapes
import stall_harbour
from timbers import cloth, guy

CELL_M = 4.0
MARGIN_M = 0.2
# Which quarter turn (shapes.frame) faces a piece built toward -y out of each side.
QUARTERS = {'-y': 0, '+x': 1, '+y': 2, '-x': 3}


def fits(module, wide, deep):
    """Fails the bake if any surface, part or socket of the module reaches past its footprint (`wide` by `deep`
    cells) less the margin: the page may set structures side by side, touching, so none may reach into the next."""
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    half = (wide * CELL_M / 2 - MARGIN_M, deep * CELL_M / 2 - MARGIN_M)
    reaches = []
    for item in module.objects:
        evaluated = item.evaluated_get(depsgraph)
        for corner in evaluated.bound_box:
            point = item.matrix_world @ mathutils.Vector(corner)
            reaches.append((point.x, point.y, item.name))
    reaches += [(x, y, 'a part') for x0, y0, _, x1, y1, _ in module.parts for x, y in ((x0, y0), (x1, y1))]
    reaches += [(socket['at'][0], socket['at'][1], socket['name']) for socket in module.sockets]
    for x, y, name in reaches:
        if abs(x) > half[0] + 1e-6 or abs(y) > half[1] + 1e-6:
            raise ValueError(f'{module.name}: {name} reaches ({x:.2f}, {y:.2f}), past its footprint')


def pole(module, start, end, radius=0.06, material='timber'):
    """A rough pole from `start` to `end`, six-sided as an adzed trunk is and tapering a little."""
    return shapes.rod(module, start, end, radius, material, sides=6, end_radius=radius * 0.8)


def sheet(module, rows, columns, point, material='canvas', thick=0.02):
    """Cloth from a grid, `point(across, down)` placing each of its points (each a share, 0 to 1), creased by noise
    and thickened, so it reads from inside a tent as well as out."""
    noise = mathutils.noise
    seed = mathutils.Vector((module.draw(0, 50), module.draw(0, 50), 0.0))
    points = []
    for row in range(rows):
        for column in range(columns):
            x, y, z = point(column / (columns - 1), row / (rows - 1))
            crease = 0.018 * noise.noise(mathutils.Vector((x, y, z)) * 2.5 + seed)
            points.append((x + crease, y + crease * 0.6, max(0.01, z + crease)))
    item = cloth(module, 'sheet', points, rows, columns, material)
    shapes._thickened(item, thick)
    return item


def tent(module, at, quarter, wide, deep, ridge, eave=0.0, door=False, out=0.5, material='canvas'):
    """A ridge tent on `at`, turned `quarter` quarter turns, `wide` across and `deep` along its ridge, its door at its
    own -y end: canvas from the ridge pole down to its eaves at `eave` (an A-frame to the ground where that is 0) and a
    wall below them, sagging between its poles; its door's flaps tied back to its corner poles when `door`, laced
    shut otherwise; guy ropes pegged `out` past it. Its parts are its walls and its roof in strips stepping up to the
    ridge: an open tent's floor is left clear inside, a laced one is solid."""
    half_w, half_d = wide / 2, deep / 2
    walled = eave > 0.4
    low = eave if walled else 0.02
    bays = max(1, round(deep / 2.4)) if walled else 1
    with shapes.frame(module, at, quarter):
        for y in (-half_d, half_d):
            pole(module, (0.0, y, 0.0), (0.0, y, ridge + 0.16), 0.05)
            shapes.ball(module, (0.0, y, ridge + 0.2), 0.05, 'timber', detail=0)
        pole(module, (0.0, -half_d - 0.08, ridge - 0.04), (0.0, half_d + 0.08, ridge - 0.04), 0.045)
        slope_rows, skirt_rows = 6, 3 if walled else 0
        rows = slope_rows + skirt_rows + 1

        def roof(across, down, side):
            y = -half_d + deep * across
            sag = 0.07 * math.sin(math.pi * ((across * bays) % 1.0))
            row = down * (rows - 1)
            if row <= slope_rows:
                t = row / slope_rows
                bend = sag * math.sin(math.pi * t)
                return (side * (half_w * t - bend * 0.3), y, ridge + (low - ridge) * t - bend)
            k = (row - slope_rows) / skirt_rows
            return (side * (half_w + 0.04 * k - sag * 0.5 * math.sin(math.pi * k)), y, low * (1 - k))

        for side in (-1, 1):
            sheet(module, rows, bays * 6 + 1, lambda across, down, side=side: roof(across, down, side), material)

        def top(x):
            return ridge - (ridge - low) * min(1.0, abs(x) / half_w)

        def gable(y, outward):
            def point(across, down):
                x = -half_w + wide * across
                bulge = outward * 0.04 * math.sin(math.pi * across) * math.sin(math.pi * down)
                return (x, y + bulge, top(x) * (1 - down))
            sheet(module, 6, 9, point, material)

        gable(half_d, 1)
        tie = min(1.1, low * 0.55) if walled else ridge * 0.4
        if not door:
            gable(-half_d, -1)
            shapes.rod(module, (0.0, -half_d - 0.03, 0.05), (0.0, -half_d - 0.03, ridge - 0.1), 0.012, 'linen', sides=3)
        for side in (-1, 1) if door else ():
            def flap(across, down, side=side):
                # across from the door's middle out to its corner; the cloth gathered to the corner at its tie.
                x = side * half_w * (1 - across)
                z = top(x) * (1 - down)
                head = top(x)
                kept = 0.1 + 0.9 * (z - tie) / max(0.01, head - tie) if z > tie else 0.1 + 0.3 * (tie - z) / tie
                pulled = side * half_w - (side * half_w - x) * kept
                fold = 0.05 * math.sin(across * math.pi * 3) * (1 - kept)
                return (pulled, -half_d - 0.04 - fold, z)
            sheet(module, 8, 7, flap, material)
            shapes.ring(module, (side * half_w * 0.92, -half_d - 0.06, tie), 0.09, 0.025, 'linen',
                        turn=(math.pi / 2, 0.0, 0.0), segments=8, sides=3)
        if walled:
            for bay in range(bays + 1):
                y = -half_d + deep * bay / bays
                for side in (-1, 1):
                    pole(module, (side * half_w, y, 0.0), (side * half_w, y, eave + 0.1), 0.035)
                    guy(module, (side * half_w, y, eave + 0.06), (side * (half_w + out), y, 0.0), (0.0, -side * 0.25))
        else:
            for y in (-half_d, half_d):
                for side in (-1, 1):
                    guy(module, (0.0, y, ridge + 0.12), (side * out * 0.5, y + (1 if y > 0 else -1) * out, 0.0),
                        ((1 if y > 0 else -1) * 0.25, -side * 0.12))
        # The parts: walls to the eaves round an open tent, then the roof in strips up to the ridge.
        floor = low if door else 0.0
        if door:
            gap = half_w * 0.4
            module.part((-half_w, -half_d - 0.05, 0.0), (-gap, -half_d + 0.1, low))
            module.part((gap, -half_d - 0.05, 0.0), (half_w, -half_d + 0.1, low))
            module.part((-half_w, half_d - 0.1, 0.0), (half_w, half_d + 0.05, low))
            for side in (-1, 1):
                near, far = sorted((side * half_w, side * (half_w - 0.15)))
                module.part((near, -half_d, 0.0), (far, half_d, low))
        for strip in range(3):
            outer, inner = half_w * (3 - strip) / 3, half_w * (2 - strip) / 3
            for side in (-1, 1):
                near, far = sorted((side * outer, side * inner))
                module.part((near, -half_d, floor), (far, half_d, low + (ridge - low) * (strip + 1) / 3))


def fly(module, west, east, south, north, back, front, middles=(), out=0.5, material='canvas', valance=0.25,
        sag=0.08):
    """A canvas fly from its back edge (`north`, at `back`) down to its front (`south`, at `front`), sagging between
    them, a scalloped valance hung along its front; on rough poles at its corners and at each of `middles` (x) along
    its front and back, its corners guyed out `out` to either side."""
    def point(across, down):
        x = west + (east - west) * across
        return (x, north + (south - north) * down, back + (front - back) * down - sag * math.sin(math.pi * across) *
                math.sin(math.pi * down))
    sheet(module, max(4, int((north - south) / 0.35) + 1), max(4, int((east - west) / 0.35) + 1), point, material)

    def hem(across, down):
        scallop = valance * (0.75 + 0.25 * abs(math.sin(math.pi * across * max(2, round((east - west) / 0.6)))))
        return (west + (east - west) * across, south - 0.02, front - scallop * down)
    sheet(module, 3, max(4, int((east - west) / 0.2) + 1), hem, material)
    for x in (west, *middles, east):
        for y, z in ((south, front), (north, back)):
            pole(module, (x, y, 0.0), (x, y, z + 0.12), 0.05)
    for x, side in ((west, -1), (east, 1)):
        for y, z in ((south, front), (north, back)):
            guy(module, (x, y, z + 0.08), (x + side * out, y, 0.0), (0.0, -side * 0.25))


def run(module, kind, start, end, high, base=0.0, gaps=(), thick=0.6):
    """A wall square to the frame from `start` to `end` (its middle line's ends, `start` the lesser), `high` tall
    from `base`: of lapped boards when `kind` is 'boards', of ashlar on a plinth under a coping when 'stone'. Each of
    `gaps` (from, to, head: metres along it from `start`, and the opening's head over its base; then its sill, for a
    window) is left open from its sill to its head, the wall carried over it as a lintel; a part, every piece."""
    along_x = abs(end[0] - start[0]) > abs(end[1] - start[1])
    length = abs(end[0] - start[0]) if along_x else abs(end[1] - start[1])

    def at(along):
        return (start[0] + along, start[1]) if along_x else (start[0], start[1] + along)

    def piece(a, b, low, tall, lintel=False):
        if kind == 'boards':
            stall_harbour.boarded_wall(module, at(a), at(b), tall, low)
        elif lintel:
            middle = at((a + b) / 2)
            size = (b - a, thick, tall) if along_x else (thick, b - a, tall)
            kit.block(module, (*middle, low), size, 'stone', bevel=0.04, wear=0.02, cuts=1)
            face = (b - a + 0.3, thick + 0.08, 0.3) if along_x else (thick + 0.08, b - a + 0.3, 0.3)
            kit.block(module, (*middle, low), face, 'trim', bevel=0.03, wear=0.01, part=False)
        else:
            fittings.wall(module, at(a), at(b), tall, thick=thick, base=low, course=True)

    edge = 0.0
    for a, b, head, *sill in sorted(gaps):
        if a > edge:
            piece(edge, a, base, high)
        piece(a, b, base + head, high - head, lintel=True)
        if sill:
            piece(a, b, base, sill[0], lintel=True)
        edge = b
    if edge < length:
        piece(edge, length, base, high)


def opening(module, middle, quarter, wide, high, material='black', frame='timber'):
    """The dark of a window or doorway in a wall, its foot's middle at `middle` on the wall's face, turned `quarter`
    from facing -y: a dark panel inside a frame of `frame` round its sides and head, a sill under it."""
    with shapes.frame(module, middle, quarter):
        shapes.slab(module, (0.0, -0.01, high / 2), (wide, 0.04, high), material)
        for side in (-1, 1):
            shapes.slab(module, (side * (wide / 2 + 0.06), -0.02, high / 2), (0.12, 0.08, high + 0.1), frame)
        shapes.slab(module, (0.0, -0.02, high + 0.06), (wide + 0.3, 0.09, 0.12), frame)
        shapes.slab(module, (0.0, -0.05, -0.04), (wide + 0.2, 0.14, 0.08), frame)


def shutters(module, middle, quarter, wide, high):
    """A shuttered window: its opening, and two board shutters swung open flat to the wall either side of it."""
    opening(module, middle, quarter, wide, high)
    with shapes.frame(module, middle, quarter):
        for side in (-1, 1):
            x = side * (wide * 0.75 + 0.14)
            shapes.slab(module, (x, -0.04, high / 2), (wide / 2, 0.04, high), 'timber')
            for z in (0.18, high - 0.18):
                shapes.slab(module, (x, -0.07, z), (wide / 2 - 0.04, 0.02, 0.07), 'timber')
            shapes.slab(module, (side * (wide / 2 + 0.1), -0.07, high * 0.7), (0.1, 0.02, 0.03), 'iron')


def slit(module, middle, quarter, high=0.9):
    """An arrow slit in a stone wall's face, its middle at `middle`: a dark slot in a dressed surround, splayed out at
    its foot into a little cross."""
    with shapes.frame(module, middle, quarter):
        shapes.slab(module, (0.0, -0.01, 0.0), (0.42, 0.06, high + 0.3), 'trim')
        shapes.slab(module, (0.0, -0.045, 0.0), (0.09, 0.02, high), 'black')
        shapes.slab(module, (0.0, -0.045, -high * 0.18), (0.32, 0.02, 0.08), 'black')


def door(module, middle, quarter, wide, high, kind='ledged'):
    """A plank door in its opening, its foot's middle at `middle`, turned `quarter` from facing -y: ledged and braced
    boards ('ledged'); boards bound with iron straps, studs and a ring ('bound'); or sheeted in riveted iron
    ('iron'). Shut, so a part fills its opening."""
    with shapes.frame(module, middle, quarter):
        shapes.slab(module, (0.0, 0.0, high / 2), (wide, 0.1, high), 'iron' if kind == 'iron' else 'timber')
        planks = max(3, round(wide / 0.22))
        for plank in range(1, planks):
            shapes.slab(module, (-wide / 2 + plank * wide / planks, -0.052, high / 2), (0.014, 0.01, high - 0.06),
                        'black')
        straps = (0.3, high / 2, high - 0.3)
        if kind == 'ledged':
            for z in straps:
                shapes.slab(module, (0.0, -0.07, z), (wide - 0.1, 0.04, 0.14), 'timber')
            brace = math.atan2(high / 2 - 0.3, wide - 0.2)
            for low, high_z in ((0.3, high / 2), (high / 2, high - 0.3)):
                shapes.slab(module, (0.0, -0.07, (low + high_z) / 2), (math.hypot(wide - 0.2, high_z - low), 0.035,
                            0.11), 'timber', turn=(0.0, -brace, 0.0))
        else:
            for z in straps:
                shapes.slab(module, (0.0, -0.065, z), (wide - 0.04, 0.025, 0.1), 'iron')
                for stud in range(max(3, round(wide / 0.25))):
                    shapes.slab(module, (-wide / 2 + 0.12 + stud * (wide - 0.24) / max(2, round(wide / 0.25) - 1),
                                         -0.085, z), (0.035, 0.03, 0.035), 'iron' if kind == 'bound' else 'gold',
                                turn=(0.0, math.pi / 4, 0.0))
        shapes.ring(module, (wide * 0.28, -0.09, high * 0.45), 0.08, 0.022, 'iron', turn=(math.pi / 2, 0.0, 0.0),
                    segments=10, sides=4)
        shapes.slab(module, (wide * 0.28, -0.07, high * 0.52), (0.1, 0.03, 0.14), 'iron')
        module.part((-wide / 2, -0.05, 0.0), (wide / 2, 0.05, high))


def shingles(module, west, east, south, north, eave, ridge, along_y=False, material='roof', ends='timber',
             overhang=0.35):
    """A pitched roof over (`west`, `south`) to (`east`, `north`), its ridge along x (or along y when `along_y`, so
    its gables face front and back): each slope a deck laid with courses of shingles, staggered and each course's
    butts standing proud of the one above, its gables filled with `ends`, a ridge roll along its top; its parts step
    up its slopes in strips, so a body that climbs it stands near the shingles it sees."""
    if along_y:
        # Built a quarter turn round: the frame's x is the module's y, its y the module's -x.
        with shapes.frame(module, (0.0, 0.0, 0.0), 1):
            shingles(module, south, north, -east, -west, eave, ridge, False, material, ends, overhang)
        return
    half = (north - south) / 2
    middle_y = (south + north) / 2
    rise = ridge - eave
    pitch = math.atan2(rise, half)
    slope = math.hypot(half, rise) + overhang
    length = east - west + overhang * 2
    middle_x = (west + east) / 2
    for side in (-1, 1):
        # The deck from the eave's overhang to the ridge, then courses of shingles laid up it from its foot.
        deck_y = middle_y + side * (half + overhang * math.cos(pitch)) / 2
        deck_z = eave + rise / 2 - overhang / 2 * math.sin(pitch) + 0.08
        shapes.slab(module, (middle_x, deck_y, deck_z), (length, slope, 0.12), material, turn=(-side * pitch, 0.0,
                    0.0))
        courses = int(slope / 0.5)
        for course in range(courses):
            along = slope / 2 - (course + 0.5) * slope / courses
            spot_y = deck_y + side * math.cos(pitch) * along + side * math.sin(pitch) * 0.08
            spot_z = deck_z - math.sin(pitch) * along + math.cos(pitch) * 0.08
            x = west - overhang + (0.45 if course % 2 else 0.0)
            while x < east + overhang - 0.2:
                long = min(module.draw(0.9, 1.5), east + overhang - x)
                shapes.slab(module, (x + long / 2, spot_y, spot_z), (long - 0.035, slope / courses + 0.06, 0.035),
                            material, turn=(-side * (pitch - 0.045), 0.0, 0.0))
                x += long
            if course % 2:
                shapes.slab(module, (west - overhang + 0.225, spot_y, spot_z), (0.415, slope / courses + 0.06,
                            0.035), material, turn=(-side * (pitch - 0.045), 0.0, 0.0))
    for x in (west, east):
        shapes.cutout(module, [(-half, 0.0), (half, 0.0), (0.0, rise)], 0.2, ends, (x, middle_y, eave),
                      turn=(0.0, 0.0, math.pi / 2))
    shapes.rod(module, (west - overhang, middle_y, ridge + 0.14), (east + overhang, middle_y, ridge + 0.14), 0.11,
               'trim' if material == 'roof' else material, sides=8)
    strips = 4
    for side in (-1, 1):
        for strip in range(strips):
            outer = half * (strips - strip) / strips
            inner = half * (strips - strip - 1) / strips
            near, far = sorted((middle_y + side * outer, middle_y + side * inner))
            module.part((west, near, eave), (east, far, eave + rise * (strip + 1) / strips))


def barge_horns(module, y, half, eave, ridge, out=-1.0, material='timber'):
    """Carved barge boards along a gable's two edges at `y` (its foot `half` either side of the middle), crossed at
    the apex into two horns curling up past the ridge, a carved roundel in the gable under them."""
    rise = ridge - eave
    pitch = math.atan2(rise, half)
    length = math.hypot(half, rise) + 0.5
    for side in (-1, 1):
        shapes.slab(module, (side * half / 2, y + out * 0.14, eave + rise / 2 + 0.22), (length, 0.07, 0.24), material,
                    turn=(0.0, side * pitch, 0.0))
        tip = [(0.0, 0.0), (0.18, 0.05), (0.32, 0.3), (0.28, 0.62), (0.12, 0.8), (0.18, 0.6), (0.12, 0.32),
               (-0.02, 0.18)]
        shapes.cutout(module, [(side * x, z) for x, z in tip], 0.08, material, (side * -0.1, y + out * 0.14,
                      ridge + 0.25))
    shapes.lathe(module, (0.0, y + out * 0.12, eave + rise * 0.45), [(0.5, 0.0), (0.5, 0.06), (0.32, 0.1),
                 (0.12, 0.12), (0.0, 0.12)], material, sides=12, turn=(-out * math.pi / 2, 0.0, 0.0), smooth=False)
    for spoke in range(8):
        angle = math.tau * spoke / 8
        shapes.slab(module, (math.cos(angle) * 0.3, y + out * 0.2, eave + rise * 0.45 + math.sin(angle) * 0.3),
                    (0.16, 0.03, 0.04), material, turn=(0.0, -angle, 0.0))
