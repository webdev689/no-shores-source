"""What the keepers' stalls are furnished with, built from the kit and its shapes: counters, posts, shelves of books,
barrels, crates, sacks, chests, lanterns and candles, blades, polearms and shields, coils of rope. Each takes its
place in the module's frame (x east, y north, z up) and its draws from the module's own random, so a module builds
the same every time. Only `counter`, `floor` and `wall` add parts; the module adds the rest where a body would run
into them.
"""
import math

import bmesh
import mathutils

import kit
import shapes

BOOK_CLOTHS = ('crimson', 'verdant', 'black', 'linen', 'stormcaller_blue', 'veiled_dusk', 'timber')


def floor(module, west, south, east, north, high=0.15, material='paving'):
    """A floor of flags laid on a low stone plinth from (`west`, `south`) to (`east`, `north`), its top `high` over
    the module's foot, stepped onto from the ground; a part."""
    kit.block(module, ((west + east) / 2, (south + north) / 2, 0.0), (east - west, north - south, high - 0.05),
              'stone', bevel=0.04, wear=0.0)
    y = south
    while y < north - 0.2:
        deep = min(module.draw(0.7, 1.1), north - y)
        x = west
        while x < east - 0.2:
            long = min(module.draw(0.8, 1.4), east - x)
            kit.block(module, (x + long / 2, y + deep / 2, high - 0.06), (long - 0.04, deep - 0.04, 0.06), material,
                      bevel=0.0, wear=0.0, part=False)
            x += long
        y += deep


def wall(module, start, end, high, thick=0.5, base=0.0, material='stone', course=True):
    """A run of ashlar wall square to the frame from `start` to `end` (its middle line's ends), `high` tall from
    `base`, with a plinth at its foot and a moulded coping; a part."""
    along_x = abs(end[0] - start[0]) > abs(end[1] - start[1])
    length = abs(end[0] - start[0]) if along_x else abs(end[1] - start[1])
    middle = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
    size = (length, thick, high) if along_x else (thick, length, high)
    kit.block(module, (*middle, base), size, material, bevel=0.04, wear=0.02, cuts=2)
    grow = (0.0, 0.12) if along_x else (0.12, 0.0)
    kit.block(module, (*middle, base), (size[0] + grow[0], size[1] + grow[1], 0.35), 'trim', bevel=0.03, wear=0.0,
              part=False)
    if course:
        kit.block(module, (*middle, base + high), (size[0] + grow[0], size[1] + grow[1], 0.18), 'trim', bevel=0.04,
                  wear=0.0, part=False)


def post(module, at, high, side=0.22, material='timber', part=True):
    """A square timber post on `at`, chamfered; a part."""
    return kit.block(module, at, (side, side, high), material, bevel=0.03, wear=0.0, part=part)


def counter(module, west, east, y, high=1.05, deep=0.7, top='timber', front='timber', panels=True):
    """A shop counter from `west` to `east`, its front face toward -y at `y`: a panelled front, a top board standing
    a little proud of it all round, a kick at its foot; a part."""
    middle = ((west + east) / 2, y + deep / 2)
    length = east - west
    kit.block(module, (*middle, 0.0), (length, deep, high - 0.06), front, bevel=0.02, wear=0.0, part=False)
    module.part((west, y, 0.0), (east, y + deep, high))
    kit.block(module, (middle[0], middle[1] - 0.03, high - 0.07), (length + 0.12, deep + 0.12, 0.07), top,
              bevel=0.015, wear=0.0, part=False)
    kit.block(module, (middle[0], y - 0.015, 0.0), (length + 0.02, 0.06, 0.14), front, bevel=0.01, wear=0.0,
              part=False)
    if not panels:
        return
    panels = max(1, round(length / 0.9))
    for panel in range(panels + 1):
        x = west + 0.04 + (length - 0.08) * panel / panels
        shapes.slab(module, (x, y - 0.025, (high - 0.06) / 2 + 0.07), (0.08, 0.05, high - 0.2), 'timber')
    shapes.slab(module, (middle[0], y - 0.025, high - 0.2), (length - 0.04, 0.05, 0.07), 'timber')


def books(module, west, east, y, z, deep=0.26, high=0.32, facing=-1.0):
    """A row of books on a shelf from `west` to `east`, spines toward `facing` (-1 south, 1 north), standing, now
    and then leaning or lying in a stack, in the cloths' colours. A standing book is drawn as its spine, its top and
    its sides only (its back and foot are never seen), each colour's books one mesh."""
    rows = {}
    x = west
    while x < east - 0.05:
        if module.random.random() < 0.08 and east - x > 0.4:
            for layer in range(module.random.randint(2, 4)):
                tall = module.draw(0.04, 0.07)
                shapes.slab(module, (x + 0.17, y, z + 0.06 * layer + tall / 2),
                            (module.draw(0.26, 0.32), deep * module.draw(0.8, 1.0), tall),
                            module.random.choice(BOOK_CLOTHS), turn=(0.0, 0.0, module.draw(-0.15, 0.15)))
            x += 0.36
            continue
        thick = module.draw(0.04, 0.09)
        tall = high * module.draw(0.62, 0.95)
        material = module.random.choice(BOOK_CLOTHS)
        if module.random.random() < 0.06:
            shapes.slab(module, (x + thick / 2, y, z + tall / 2), (thick, deep * 0.9, tall), material,
                        turn=(0.0, module.draw(-0.18, 0.18), 0.0))
        else:
            made = rows.setdefault(material, bmesh.new())
            front = y + facing * deep * module.draw(0.4, 0.5)
            _book(made, x, x + thick, front, y - facing * deep / 2, z, z + tall, facing)
        x += thick + 0.004
        if module.random.random() < 0.05:
            x += module.draw(0.05, 0.15)
    for material, made in rows.items():
        shapes._placed(module, made, 'books', material, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0))


def _book(made, west, east, front, back, foot, top, facing):
    """A standing book's spine (at `front`), top and sides, wound to face out for spines toward `facing`."""
    corners = (((west, front, foot), (east, front, foot), (east, front, top), (west, front, top)),
               ((west, front, top), (east, front, top), (east, back, top), (west, back, top)),
               ((west, back, foot), (west, front, foot), (west, front, top), (west, back, top)),
               ((east, front, foot), (east, back, foot), (east, back, top), (east, front, top)))
    for quad in corners:
        made.faces.new([made.verts.new(corner) for corner in (quad if facing < 0 else quad[::-1])])


def scrolls(module, at, count, length=0.5, along_x=True):
    """A pile of rolled scrolls on `at`, lying along x (or y), linen with a cord round each."""
    for number in range(count):
        row, place = divmod(number, 4)
        spot = (at[0] + (0.0 if along_x else (place - 1.5) * 0.09 + row * 0.045),
                at[1] + ((place - 1.5) * 0.09 + row * 0.045 if along_x else 0.0), at[2] + 0.045 + row * 0.075)
        half = length / 2 * module.draw(0.85, 1.0)
        start = (spot[0] - half, spot[1], spot[2]) if along_x else (spot[0], spot[1] - half, spot[2])
        end = (spot[0] + half, spot[1], spot[2]) if along_x else (spot[0], spot[1] + half, spot[2])
        shapes.rod(module, start, end, 0.04, 'linen', sides=6)
        band = (spot[0] - 0.02, spot[1], spot[2]) if along_x else (spot[0], spot[1] - 0.02, spot[2])
        shapes.rod(module, band, (spot[0] + 0.02, spot[1], spot[2]) if along_x else (spot[0], spot[1] + 0.02, spot[2]),
                   0.044, 'crimson', sides=6)


def bookcase(module, west, east, y, high, shelves, facing=-1.0, deep=0.4):
    """A timber bookcase against a wall from `west` to `east`, its open face toward `facing`, its shelves full of
    books and here and there a pile of scrolls; a part."""
    middle = (west + east) / 2
    width = east - west
    back = y - facing * deep / 2
    kit.block(module, (middle, back + facing * 0.02, 0.0), (width, 0.04, high), 'timber', bevel=0.0, wear=0.0,
              part=False)
    for x in (west + 0.04, east - 0.04):
        kit.block(module, (x, y, 0.0), (0.08, deep, high), 'timber', bevel=0.01, wear=0.0, part=False)
    kit.block(module, (middle, y, high - 0.02), (width + 0.1, deep + 0.06, 0.08), 'timber', bevel=0.02, wear=0.0,
              part=False)
    step = (high - 0.3) / shelves
    for shelf in range(shelves + 1):
        z = 0.12 + shelf * step
        kit.block(module, (middle, y, z - 0.03), (width - 0.12, deep - 0.02, 0.03), 'timber', bevel=0.0, wear=0.0,
                  part=False)
        if shelf == shelves:
            break
        if module.random.random() < 0.25:
            books(module, west + 0.1, middle - 0.05, y + facing * 0.03, z, deep=deep * 0.65, high=step * 0.8)
            scrolls(module, (middle + width / 4, y, z), module.random.randint(4, 8), length=deep * 0.9,
                    along_x=False)
        else:
            books(module, west + 0.1, east - 0.1, y + facing * 0.03, z, deep=deep * 0.65, high=step * 0.85)
    module.part((west, min(y - deep / 2, back), 0.0), (east, max(y + deep / 2, back), high))


def barrel(module, at, radius=0.32, high=0.9, lying=False, turn=0.0):
    """A coopered barrel on `at`, bellied, with iron hoops, standing (or lying along x turned `turn`), its lid of
    darker staves."""
    profile = [(radius * 0.84, 0.0), (radius * 0.94, high * 0.15), (radius, high * 0.5), (radius * 0.94, high * 0.85),
               (radius * 0.84, high)]
    lay = (0.0, math.pi / 2, turn) if lying else (0.0, 0.0, turn)
    foot = (at[0], at[1], at[2] + radius) if lying else at
    if lying:
        foot = (at[0] - math.cos(turn) * high / 2, at[1] - math.sin(turn) * high / 2, at[2] + radius)
    shapes.lathe(module, foot, profile, 'timber', sides=14, turn=lay)
    for share, grow in ((0.08, 0.89), (0.3, 0.985), (0.7, 0.985), (0.92, 0.89)):
        shapes.lathe(module, foot, [(radius * grow + 0.012, high * share - 0.03), (radius * grow + 0.012,
                                    high * share + 0.03)], 'iron', sides=14, turn=lay, smooth=False)


def crate(module, at, size, turn=0.0, material='timber'):
    """A slatted crate on `at`: its box and a frame of battens round each face's edges."""
    kit.block(module, at, size, material, turn=turn, bevel=0.015, wear=0.0, part=False)
    wide, deep, high = size
    cos, sin = math.cos(turn), math.sin(turn)

    def placed(x, y, z):
        return (at[0] + x * cos - y * sin, at[1] + x * sin + y * cos, at[2] + z)

    for side in (-1, 1):
        shapes.slab(module, placed(0.0, side * (deep / 2 + 0.01), high / 2), (wide * 0.98, 0.03, 0.08), 'timber',
                    turn=(0.0, 0.0, turn))
        brace = (math.hypot(wide, high) * 0.9, 0.03, 0.07)
        shapes.slab(module, placed(0.0, side * (deep / 2 + 0.01), high / 2), brace, 'timber',
                    turn=(0.0, math.atan2(high, wide), turn))
        shapes.slab(module, placed(side * (wide / 2 + 0.01), 0.0, high / 2), (0.03, deep * 0.98, 0.08), 'timber',
                    turn=(0.0, 0.0, turn))


def sack(module, at, size=0.5, material='linen', turn=0.0):
    """A filled sack slumped on `at`, tied at its neck."""
    shapes.ball(module, (at[0], at[1], at[2] + size * 0.42), size * 0.5, material, detail=2,
                scale=(1.0, 0.85, 0.9), turn=(0.0, 0.0, turn))
    shapes.lathe(module, (at[0], at[1], at[2] + size * 0.8), [(size * 0.16, 0.0), (size * 0.08, size * 0.12),
                 (size * 0.14, size * 0.24), (0.0, size * 0.26)], material, sides=8)


def chest(module, at, size=(0.9, 0.55, 0.55), turn=0.0, banded='iron'):
    """A chest on `at` with a curved lid, iron bands over it and a gilt lock at its front."""
    wide, deep, high = size
    kit.block(module, at, (wide, deep, high * 0.7), 'timber', turn=turn, bevel=0.02, wear=0.0, part=False)
    cos, sin = math.cos(turn), math.sin(turn)
    lid = (at[0], at[1], at[2] + high * 0.7)
    shapes.lathe(module, (lid[0] - cos * wide / 2, lid[1] - sin * wide / 2, lid[2]),
                 [(deep / 2, 0.0), (deep / 2, wide)], 'timber', sides=12, turn=(0.0, math.pi / 2, turn), smooth=True)
    for share in (-0.38, 0.0, 0.38):
        spot = (at[0] + cos * wide * share, at[1] + sin * wide * share, lid[2])
        shapes.lathe(module, (spot[0] - cos * 0.03, spot[1] - sin * 0.03, spot[2]), [(deep / 2 + 0.012, 0.0),
                     (deep / 2 + 0.012, 0.06)], banded, sides=12, turn=(0.0, math.pi / 2, turn), smooth=False)
        shapes.slab(module, (spot[0], spot[1], at[2] + high * 0.35), (0.06, deep + 0.02, high * 0.7), banded,
                    turn=(0.0, 0.0, turn))
    shapes.slab(module, (at[0] + sin * (deep / 2 + 0.02), at[1] - cos * (deep / 2 + 0.02), at[2] + high * 0.62),
                (0.1, 0.03, 0.12), 'gold', turn=(0.0, 0.0, turn))


def lantern(module, at, size=0.3, hung_from=None):
    """An iron lantern standing on `at` (or hung by a chain from `hung_from` above it): a glowing pane box in an
    iron frame under a pointed cap with a ring."""
    x, y, z = at
    shapes.slab(module, (x, y, z + size * 0.55), (size * 0.62, size * 0.62, size * 0.8), 'glow')
    for dx in (-1, 1):
        for dy in (-1, 1):
            shapes.rod(module, (x + dx * size * 0.33, y + dy * size * 0.33, z),
                       (x + dx * size * 0.33, y + dy * size * 0.33, z + size), size * 0.04, 'iron', sides=4)
    kit.block(module, (x, y, z), (size * 0.78, size * 0.78, size * 0.12), 'iron', bevel=0.0, wear=0.0, part=False)
    shapes.lathe(module, (x, y, z + size * 0.95), [(size * 0.5, 0.0), (size * 0.1, size * 0.35), (0.0, size * 0.42)],
                 'iron', sides=4, turn=(0.0, 0.0, math.pi / 4), smooth=False)
    shapes.ring(module, (x, y, z + size * 1.47), size * 0.1, size * 0.04, 'iron', turn=(math.pi / 2, 0.0, 0.0),
                segments=8, sides=4)
    if hung_from is not None:
        shapes.rod(module, (x, y, z + size * 1.5), (x, y, hung_from), 0.012, 'iron', sides=4)


def candle(module, at, high=0.25, radius=0.035, lit=True):
    """A wax candle on `at`, drips round its foot, its flame lit."""
    shapes.lathe(module, at, [(radius * 1.5, 0.0), (radius * 1.2, 0.02), (radius, 0.04), (radius, high),
                              (radius * 0.7, high + 0.01), (0.0, high + 0.012)], 'bone', sides=8)
    if lit:
        shapes.ball(module, (at[0], at[1], at[2] + high + 0.04), radius * 0.6, 'glow', detail=1,
                    scale=(1.0, 1.0, 2.0))


def sword(module, foot, length=1.0, turn=0.0, tilt=0.0, roll=0.0, metal='iron'):
    """A sword from its point at `foot`, standing point down unless set at an angle (`tilt` about x, `roll` about y,
    then `turn` about up): blade, crossguard, a bound grip and a pommel."""
    angles = (tilt, roll, turn)
    spin = mathutils.Euler(angles).to_matrix()
    base = mathutils.Vector(foot)

    def placed(x, z):
        return tuple(base + spin @ mathutils.Vector((x, 0.0, z)))

    blade = length * 0.72
    shapes.cutout(module, [(-0.035, 0.08), (0.0, 0.0), (0.035, 0.08), (0.03, blade), (-0.03, blade)], 0.012, metal,
                  placed(0.0, 0.0), turn=angles)
    shapes.slab(module, placed(0.0, blade + 0.02), (0.24, 0.04, 0.04), metal, turn=angles)
    shapes.rod(module, placed(0.0, blade + 0.04), placed(0.0, blade + 0.04 + length * 0.18), 0.02, 'black', sides=6)
    shapes.ball(module, placed(0.0, blade + 0.07 + length * 0.18), 0.035, 'gold', detail=1)


def polearm(module, foot, high=2.4, head='spear', turn=0.0):
    """A polearm standing butt down on `foot`: a timber haft with an iron head, a spear's leaf or a halberd's axe and
    spike."""
    x, y, z = foot
    shapes.rod(module, (x, y, z), (x, y, z + high), 0.022, 'timber', sides=6)
    top = z + high
    shapes.lathe(module, (x, y, top - 0.12), [(0.03, 0.0), (0.03, 0.12)], 'iron', sides=6, smooth=False)
    if head == 'spear':
        shapes.cutout(module, [(0.0, 0.0), (0.05, 0.12), (0.0, 0.38), (-0.05, 0.12)], 0.015, 'iron', (x, y, top),
                      turn=(0.0, 0.0, turn))
    else:
        shapes.cutout(module, [(0.0, 0.0), (0.025, 0.1), (0.0, 0.32), (-0.025, 0.1)], 0.015, 'iron', (x, y, top),
                      turn=(0.0, 0.0, turn))
        shapes.cutout(module, [(0.02, -0.18), (0.26, -0.24), (0.3, 0.0), (0.26, 0.2), (0.02, 0.1)], 0.015, 'iron',
                      (x, y, top - 0.05), turn=(0.0, 0.0, turn))
        shapes.cutout(module, [(-0.02, -0.05), (-0.16, 0.0), (-0.02, 0.05)], 0.015, 'iron', (x, y, top - 0.05),
                      turn=(0.0, 0.0, turn))


def round_shield(module, middle, radius=0.4, face='crimson', facing=-1.0, rim='iron'):
    """A round shield hung flat on a wall, its face toward `facing` (-1 south, 1 north): painted boards in an iron
    rim round a domed boss."""
    turn = (math.pi / 2 * -facing, 0.0, 0.0)
    shapes.lathe(module, middle, [(radius, 0.0), (radius, 0.03), (0.0, 0.05)], face, sides=20, turn=turn)
    shapes.ring(module, middle, radius, 0.035, rim, turn=turn, segments=20, sides=4)
    shapes.ball(module, (middle[0], middle[1] + facing * 0.05, middle[2]), radius * 0.22, rim, detail=1,
                scale=(1.0, 1.0, 1.0))


def kite_shield(module, middle, high=0.9, face='verdant', facing=-1.0, charge='gold', device='chevron'):
    """A kite shield hung on a wall, its face toward `facing`, painted with a device in its charge's colour: a
    chevron, a band across (fess), a band down (pale) or quarterings."""
    half = high * 0.32
    outline = [(-half, high * 0.35), (half, high * 0.35), (half * 0.95, 0.0), (half * 0.5, -high * 0.4),
               (0.0, -high * 0.65), (-half * 0.5, -high * 0.4), (-half * 0.95, 0.0)]
    shapes.cutout(module, outline, 0.04, face, middle)
    x, y, z = middle[0], middle[1] + facing * 0.03, middle[2]
    if device == 'chevron':
        for side in (-1, 1):
            shapes.slab(module, (x + side * half * 0.42, y, z - high * 0.08), (half * 1.05, 0.02, 0.09), charge,
                        turn=(0.0, side * 0.62, 0.0))
    elif device == 'fess':
        shapes.slab(module, (x, y, z + high * 0.02), (half * 1.9, 0.02, high * 0.2), charge)
    elif device == 'pale':
        shapes.slab(module, (x, y, z - high * 0.1), (half * 0.6, 0.02, high * 0.85), charge)
    else:
        for side in (-1, 1):
            shapes.cutout(module, [(0.0, 0.0), (side * half * 0.95, 0.0), (side * half * 0.5, -high * 0.4),
                                   (0.0, -high * 0.65)] if side > 0 else
                          [(0.0, 0.0), (0.0, high * 0.35), (side * half, high * 0.35), (side * half * 0.95, 0.0)],
                          0.02, charge, (x, y, z))


def rope_coil(module, at, radius=0.3, turns=4, material='linen'):
    """A coil of rope lying on `at`, its turns stacked a little inward as they rise."""
    for number in range(turns):
        shapes.ring(module, (at[0], at[1], at[2] + 0.035 + number * 0.06), radius * (1 - number * 0.05), 0.07,
                    material, segments=14, sides=3)


def hay_bale(module, at, turn=0.0, size=(1.0, 0.5, 0.45)):
    """A bound bale of hay on `at`: a straw-coloured block roughened at its faces, two cords round it."""
    kit.block(module, at, size, 'straw', turn=turn, bevel=0.06, wear=0.0, part=False)
    cos, sin = math.cos(turn), math.sin(turn)
    for share in (-0.25, 0.25):
        spot = (at[0] + cos * size[0] * share, at[1] + sin * size[0] * share, at[2] + size[2] / 2)
        shapes.slab(module, spot, (0.025, size[1] + 0.03, size[2] + 0.03), 'timber', turn=(0.0, 0.0, turn))


def gable_roof(module, west, east, south, north, eave, ridge, material='roof', ends='plaster', overhang=0.35):
    """A pitched roof along x over (`west`, `south`) to (`east`, `north`): two tiled slopes from the eaves at `eave`
    up to a ridge at `ridge`, gable ends of `ends` filling its triangles, a ridge piece along its top; its parts
    boxes from the eaves up in strips that step with its slopes."""
    half = (north - south) / 2
    rise = ridge - eave
    pitch = math.atan2(rise, half)
    slope = math.hypot(half, rise) + overhang
    length = east - west + overhang * 2
    middle_x = (west + east) / 2
    for side in (-1, 1):
        middle_y = (south + north) / 2 + side * (half + overhang * math.cos(pitch)) / 2
        middle_z = eave + rise / 2 - overhang / 2 * math.sin(pitch) + 0.08
        turn = (-side * pitch, 0.0, 0.0)
        shapes.slab(module, (middle_x, middle_y, middle_z), (length, slope, 0.14), material, turn=turn)
        # Battens of tiles across each slope, so the slope reads as courses from far off.
        courses = int(slope / 0.45)
        for course in range(1, courses):
            along = (course / courses - 0.5) * slope
            spot = (middle_x, middle_y + math.cos(pitch) * along + side * math.sin(pitch) * 0.08,
                    middle_z - side * math.sin(pitch) * along + math.cos(pitch) * 0.08)
            shapes.slab(module, spot, (length, 0.05, 0.04), material, turn=turn)
    for x in (west, east):
        shapes.cutout(module, [(-half, 0.0), (half, 0.0), (0.0, rise)], 0.2, ends, (x, (south + north) / 2, eave),
                      turn=(0.0, 0.0, math.pi / 2))
    shapes.rod(module, (west - overhang, (south + north) / 2, ridge + 0.12), (east + overhang, (south + north) / 2,
               ridge + 0.12), 0.11, 'trim', sides=8)
    # Its parts step up each slope in strips, so a body that climbs onto it stands near the tiles it sees.
    strips = 4
    for side in (-1, 1):
        for strip in range(strips):
            outer = half * (strips - strip) / strips
            inner = half * (strips - strip - 1) / strips
            near, far = sorted(((south + north) / 2 + side * outer, (south + north) / 2 + side * inner))
            module.part((west, near, eave), (east, far, eave + rise * (strip + 1) / strips))


def sign(module, at, board='black', size=0.8):
    """A shop's sign hung on an iron bracket out toward -y from a pier's face at `at` (the bracket's foot, high on
    the pier): a scrolled bracket, two hooks and a board edge-on to the street. Returns the board's middle, for the
    sign's emblem to be laid on both its faces (toward -x and +x)."""
    x, y, z = at
    shapes.rod(module, (x, y, z + 0.6), (x, y - size - 0.3, z + 0.6), 0.03, 'iron', sides=6)
    shapes.rod(module, (x, y, z), (x, y - 0.55, z + 0.6), 0.02, 'iron', sides=6)
    shapes.ring(module, (x, y - size - 0.35, z + 0.6), 0.06, 0.02, 'iron', turn=(0.0, math.pi / 2, 0.0), segments=8,
                sides=3)
    middle = (x, y - 0.3 - size / 2, z - size / 2 + 0.3)
    for hook in (-1, 1):
        hook_y = middle[1] + hook * size * 0.35
        shapes.rod(module, (x, hook_y, z + 0.6), (x, hook_y, middle[2] + size / 2), 0.01, 'iron', sides=4)
    shapes.slab(module, middle, (0.05, size, size), board, bevel=0.01)
    shapes.slab(module, (x, middle[1], middle[2] + size / 2), (0.08, size + 0.06, 0.05), 'gold')
    return middle


def framed_wall(module, start, end, high, thick=0.3):
    """A timber-framed wall square to the frame from `start` to `end` (its middle line's ends): a stone sill wall
    waist high, plaster panels over it between timber studs, a rail and a brace in every other bay, a plate along its
    top; a part."""
    along_x = abs(end[0] - start[0]) > abs(end[1] - start[1])
    length = abs(end[0] - start[0]) if along_x else abs(end[1] - start[1])
    middle = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)

    def at(share, z):
        offset = -length / 2 + share * length
        return (middle[0] + offset, middle[1], z) if along_x else (middle[0], middle[1] + offset, z)

    def sized(long, deep, tall):
        return (long, deep, tall) if along_x else (deep, long, tall)

    kit.block(module, (*middle, 0.0), sized(length, thick + 0.1, 0.8), 'stone', bevel=0.04, wear=0.03, cuts=1)
    kit.block(module, (*middle, 0.8), sized(length, thick - 0.06, high - 0.8), 'plaster', bevel=0.0, wear=0.0,
              part=False)
    module.part(tuple(middle[axis] - sized(length, thick + 0.1, 0)[axis] / 2 for axis in (0, 1)) + (0.0,),
                tuple(middle[axis] + sized(length, thick + 0.1, 0)[axis] / 2 for axis in (0, 1)) + (high,))
    bays = max(1, round(length / 1.3))
    for side in (-1, 1):
        lift = side * (thick / 2)
        face = (lambda point: (point[0], point[1] + lift, point[2])) if along_x else \
            (lambda point: (point[0] + lift, point[1], point[2]))
        for stud in range(bays + 1):
            shapes.slab(module, face(at(stud / bays, (high + 0.8) / 2)), sized(0.16, 0.06, high - 0.8), 'timber')
        for z in (0.86, 2.2, high - 0.08):
            shapes.slab(module, face(at(0.5, z)), sized(length, 0.07, 0.16), 'timber')
        for bay in range(0, bays, 2):
            run = length / bays
            lean = math.atan2(2.2 - 0.86, run)
            spot = face(at((bay + 0.5) / bays, (2.2 + 0.86) / 2))
            turn = (0.0, -lean, 0.0) if along_x else (lean, 0.0, 0.0)
            shapes.slab(module, spot, sized(math.hypot(run, 1.34) - 0.1, 0.06, 0.14), 'timber', turn=turn)
