"""The outpost's hall, its heart, on a plot of 4 x 4 cells (16 m), its front toward -y. The Command Tent
(`outpost-hall-1`, so named in the guilds' content): a great command tent filling the plot's middle, its door's flaps
tied back on a map table inside, three smaller tents round a stone-ringed fire pit, crates, barrels and a rack of arms.
The Longhouse (`-2`): a long boarded hall on a stone sill under a shingle roof, its front gable carved and run out over
a porch on posts hung with shields, iron-strapped doors, a smoke louvre on its ridge. The Stronghold (`-3`): a stone
ground floor under a boarded upper storey, a square stone tower at its back corner with arrow slits and two flagstaffs
in iron collars, an iron-bound door between braziers. Each has `door` at its door and `use` outside it.
"""
import math

import fittings
import kit
import outpost_kit as shell
import outpost_props as furnish
import shapes


def doorway(module, y):
    """The hall's sockets: `door` at the middle of its front door, `use` a stride out from it."""
    module.socket('door', (0.0, y, 0.0), (0, -1))
    module.socket('use', (0.0, y - 0.9, 0.0), (0, -1))


def supplies(module, at):
    """A camp's stores by a tent: crates stacked two high, barrels standing, sacks against them and a coil of rope."""
    x, y = at
    fittings.crate(module, (x, y, 0.0), (0.9, 0.8, 0.7), turn=0.05)
    fittings.crate(module, (x + 0.05, y, 0.7), (0.75, 0.65, 0.55), turn=-0.12)
    fittings.crate(module, (x + 0.95, y + 0.1, 0.0), (0.8, 0.7, 0.62), turn=0.0)
    module.part((x - 0.5, y - 0.45, 0.0), (x + 1.4, y + 0.5, 1.25))
    for along, across in ((-0.9, 0.2), (-0.9, -0.5)):
        fittings.barrel(module, (x + along, y + across, 0.0), radius=0.3, high=0.85)
    module.part((x - 1.2, y - 0.8, 0.0), (x - 0.6, y + 0.5, 0.85))
    for along in (0.3, 0.8):
        fittings.sack(module, (x + along, y - 0.75, 0.0), size=0.5, material='canvas')
    fittings.rope_coil(module, (x + 0.95, y + 0.1, 0.62), radius=0.24, turns=3)


def hall_camp(module):
    # The command tent at the back of the plot, open toward the front, the map table and a chest inside.
    # Wide and deep enough to fill the plot's middle, its front wall where the old one's was.
    shell.tent(module, (0.0, 2.6, 0.0), 0, 8.0, 9.6, 5.0, eave=2.4, open_door=True, out=0.6)
    top = furnish.trestle(module, (0.0, 3.6, 0.0), 2.4, 1.1)
    shapes.slab(module, (-0.2, 3.6, top + 0.004), (1.5, 0.9, 0.006), 'linen', turn=(0.0, 0.0, 0.05))
    for line in range(4):
        shapes.slab(module, (-0.6 + line * 0.25, 3.5 + module.draw(-0.2, 0.2), top + 0.01), (module.draw(0.2, 0.5),
                    0.012, 0.002), 'crimson', turn=(0.0, 0.0, module.draw(-1.0, 1.0)))
    for x, y in ((-0.9, 3.2), (0.5, 4.0), (-0.9, 4.0), (0.5, 3.2)):
        kit.rock(module, (x, y, top), (0.09, 0.08, 0.06), x * 7 + y, material='rubble', part=False, detail=1)
    furnish.ledger(module, (0.85, 3.4, top), turn=0.2, cover='black')
    fittings.chest(module, (2.6, 6.4, 0.0), turn=0.0)
    module.part((2.15, 6.1, 0.0), (3.05, 6.7, 0.6))
    fittings.lantern(module, (0.0, 2.6, 3.9), size=0.26, hung_from=4.96)
    for x in (-1.6, 1.6):
        shapes.lathe(module, (x, 3.6, 0.0), [(0.18, 0.0), (0.16, 0.42), (0.2, 0.45), (0.0, 0.46)], 'timber', sides=8)
    # The fire and the three tents round it, each door toward it.
    furnish.fire_pit(module, (3.6, -3.6, 0.0), radius=0.6)
    for at, quarter in (((5.95, -3.6, 0.0), 3), ((3.6, -6.0, 0.0), 2), ((6.2, -0.8, 0.0), 3)):
        shell.tent(module, at, quarter, 2.0, 2.4, 1.8, out=0.35)
    shapes.rod(module, (2.45, -4.3, 0.16), (2.45, -2.9, 0.16), 0.16, 'timber', sides=7)
    module.part((2.29, -4.3, 0.0), (2.61, -2.9, 0.32))
    # The west of the plot: arms, stores, a chopping block and a lantern by the command tent's door.
    furnish.weapon_rack(module, (-5.4, -3.6, 0.0), 0)
    supplies(module, (-6.4, 1.6))
    supplies(module, (-6.4, 4.8))
    shapes.lathe(module, (-3.0, -5.6, 0.0), [(0.32, 0.0), (0.3, 0.5), (0.0, 0.5)], 'timber', sides=10)
    shapes.rod(module, (-3.0, -5.6, 0.5), (-2.9, -5.5, 1.1), 0.025, 'timber', sides=5)
    shapes.slab(module, (-3.0, -5.6, 0.55), (0.04, 0.22, 0.12), 'iron', turn=(0.0, 0.0, 0.5))
    module.part((-3.3, -5.9, 0.0), (-2.7, -5.3, 0.5))
    for row in range(3):
        for log in range(4 - row):
            shapes.rod(module, (-4.6 + log * 0.3 + row * 0.15, -6.6, 0.12 + row * 0.24),
                       (-4.6 + log * 0.3 + row * 0.15, -5.8, 0.12 + row * 0.24), 0.12, 'timber', sides=6)
    module.part((-4.75, -6.6, 0.0), (-3.55, -5.8, 0.72))
    furnish.lantern_post(module, (-1.6, -2.8, 0.0))
    doorway(module, -2.45)
    shell.fits(module, 4, 4)


def porch_post(module, x, y, high):
    """A porch post on a stone pad, a carved capital under its beam and braces out to the beam either side."""
    kit.block(module, (x, y, 0.0), (0.5, 0.5, 0.25), 'stone', bevel=0.04, wear=0.02, part=False)
    fittings.post(module, (x, y, 0.25), high - 0.25, side=0.26)
    shapes.lathe(module, (x, y, high - 0.32), [(0.16, 0.0), (0.2, 0.12), (0.17, 0.2), (0.21, 0.3)], 'timber',
                 sides=8, turn=(0.0, 0.0, math.pi / 8))
    for side in (-1, 1):
        shapes.slab(module, (x + side * 0.38, y, high - 0.42), (0.75, 0.12, 0.1), 'timber',
                    turn=(0.0, -side * 0.7, 0.0))


def louvre(module, y, ridge, long=1.6):
    """A smoke louvre on the ridge at `y`: slatted sides under a little gabled cap, the hall's hearth smoke out
    through its slats."""
    for side in (-1, 1):
        for slat in range(4):
            shapes.slab(module, (side * 0.42, y, ridge - 0.05 + slat * 0.15), (0.05, long, 0.1), 'timber',
                        turn=(0.0, side * 0.5, 0.0))
        for end in (-1, 1):
            fittings.post(module, (side * 0.42, y + end * long / 2, ridge - 0.2), 0.85, side=0.1, part=False)
        shapes.slab(module, (side * 0.32, y, ridge + 0.78), (0.8, long + 0.4, 0.06), 'roof', turn=(0.0, side * 0.62,
                    0.0))
    shapes.rod(module, (0.0, y - long / 2 - 0.2, ridge + 1.02), (0.0, y + long / 2 + 0.2, ridge + 1.02), 0.06,
               'trim', sides=6)


def hall_longhouse(module):
    west, east, front, back, porch = -4.0, 4.0, -3.6, 6.6, -6.0
    sill, wall, eave, ridge = 0.5, 3.0, 3.5, 7.2
    door_wide, door_high = 1.8, 2.6
    # The stone sill under the walls, broken for the door; the boarded walls on it; corner and wall posts.
    for west_end, east_end, south_end, north_end in ((west, east, back, back), (west, west, front, back),
                                                     (east, east, front, back), (west, -door_wide / 2, front, front),
                                                     (door_wide / 2, east, front, front)):
        middle = ((west_end + east_end) / 2, (south_end + north_end) / 2, 0.0)
        size = ((east_end - west_end + 0.4, 0.4, sill) if south_end == north_end else
                (0.4, north_end - south_end + 0.4, sill))
        kit.block(module, middle, size, 'stone', bevel=0.04, wear=0.03, cuts=1)
    shell.walls(module, 'boards', west, east, front, back, wall, sill, open_front=True)
    shell.run(module, 'boards', (west, front), (-door_wide / 2, front), wall, sill)
    shell.run(module, 'boards', (door_wide / 2, front), (east, front), wall, sill)
    lintel = sill + wall - door_high
    kit.block(module, (0.0, front, door_high), (door_wide, 0.2, lintel), 'timber', bevel=0.01, wear=0.0)
    for side in (-1, 1):
        shell.door(module, (side * door_wide / 4, front - 0.02, 0.0), 0, door_wide / 2 - 0.02, door_high, kind='bound')
        fittings.post(module, (side * (door_wide / 2 + 0.12), front - 0.12, 0.0), door_high + 0.2, side=0.2)
    kit.block(module, (0.0, front - 0.25, 0.0), (door_wide + 0.4, 0.5, 0.08), 'stone', bevel=0.02, wear=0.0, part=False)
    shapes.slab(module, (0.0, front - 0.13, door_high + 0.15), (door_wide + 0.6, 0.12, 0.25), 'timber')
    for x in (west, east):
        for y in (front, 1.5, back):
            fittings.post(module, (x, y, sill), wall, side=0.3)
        for y in (-1.0, 4.0):
            shell.shutters(module, (x + (0.14 if x > 0 else -0.14), y, sill + 1.1), 1 if x > 0 else 3, 0.8, 0.9)
    for x in (-2.6, 2.6):
        shell.shutters(module, (x, front - 0.14, sill + 1.1), 0, 0.8, 0.9, bars=True)
    # The roof, run out over the porch, its gables carved and the smoke louvre on its ridge.
    shell.shingles(module, west, east, porch, back, eave, ridge, along_y=True)
    shell.barge_horns(module, porch - 0.36, east + 0.25, eave, ridge, out=-1.0)
    shell.barge_horns(module, back + 0.36, east + 0.25, eave, ridge, out=1.0)
    louvre(module, 1.5, ridge)
    # The porch: posts on pads under a beam, its floor flagged, a bench, shields on its inner posts, lanterns hung.
    for x in (-3.7, -1.3, 1.3, 3.7):
        porch_post(module, x, porch + 0.2, eave)
    shapes.slab(module, (0.0, porch + 0.2, eave - 0.1), (8.2, 0.3, 0.3), 'timber', bevel=0.01)
    fittings.floor(module, -3.9, porch, 3.9, front - 0.2, high=0.06)
    for x in (-1.3, 1.3):
        fittings.round_shield(module, (x, porch + 0.2 - 0.17, 2.2), radius=0.42, face='crimson' if x < 0 else 'black')
    kit.block(module, (-2.4, front - 0.55, 0.42), (1.8, 0.4, 0.06), 'timber', bevel=0.01, wear=0.0, part=False)
    for x in (-3.15, -1.65):
        shapes.slab(module, (x, front - 0.55, 0.27), (0.08, 0.34, 0.42), 'timber')
    module.part((-3.3, front - 0.75, 0.0), (-1.5, front - 0.35, 0.48))
    for x in (-2.5, 2.5):
        fittings.lantern(module, (x, porch + 0.2, 2.5), size=0.26, hung_from=eave - 0.25)
    # Firewood stacked along the east wall under the eaves, barrels by the porch.
    for row in range(4):
        for log in range(10):
            shapes.rod(module, (east + 0.45 + (row % 2) * 0.12, -2.4 + log * 0.5, 0.15 + row * 0.27),
                       (east + 1.25 + (row % 2) * 0.12, -2.4 + log * 0.5, 0.15 + row * 0.27), 0.13, 'timber', sides=6)
    module.part((east + 0.3, -2.6, 0.0), (east + 1.45, 2.5, 1.1))
    for x, y in ((-4.9, porch + 0.6), (-5.2, porch + 1.3), (4.9, porch + 0.5)):
        fittings.barrel(module, (x, y, 0.0), radius=0.32, high=0.9)
        module.part((x - 0.32, y - 0.32, 0.0), (x + 0.32, y + 0.32, 0.9))
    furnish.weapon_rack(module, (-5.6, 1.5, 0.0), 1)
    doorway(module, front - 0.25)
    shell.fits(module, 4, 4)


def tower(module, west, south, side, high):
    """A square stone tower from (`west`, `south`), `side` across and `high` tall: string courses, a corbelled
    parapet, merlons round its top and two flagstaffs in iron collars at its west corners."""
    middle = (west + side / 2, south + side / 2)
    top = shell.keep(module, middle, side, high, (4.2, 8.4))
    for y in (south + 0.45, south + side - 0.45):
        x = west + 0.45
        shapes.lathe(module, (x, y, top), [(0.12, 0.0), (0.12, 0.35), (0.09, 0.38), (0.09, 0.55), (0.12, 0.58),
                     (0.0, 0.6)], 'iron', sides=8)
        furnish.flag(module, (x, y, top + 0.5), 3.6, 'crimson' if y < middle[1] else 'linen', trim='gold')
    faces = (('-y', (west + side * 0.78, south)), ('+x', (west + side, middle[1])),
             ('+y', (middle[0], south + side)), ('-x', (west, middle[1])))
    for face, (x, y) in faces:
        for z in (2.2, 6.2, 10.0):
            push = {'-y': (0, -0.03), '+x': (0.03, 0), '+y': (0, 0.03), '-x': (-0.03, 0)}[face]
            shell.slit(module, (x + push[0], y + push[1], z), shell.QUARTERS[face])


def hall_stronghold(module):
    west, east, front, back = -5.4, 5.4, -3.2, 4.6
    stone, upper = 4.2, 3.0
    door_wide, door_high = 2.2, 3.0
    # The stone ground floor, its door's opening carried over by a lintel; arrow slits along its front.
    shell.walls(module, 'stone', west, east, front, back, stone, thick=0.7,
                front_gaps=((-west - door_wide / 2, -west + door_wide / 2, door_high),))
    for side in (-1, 1):
        shell.door(module, (side * door_wide / 4, front - 0.1, 0.0), 0, door_wide / 2 - 0.02, door_high, kind='bound')
    shapes.ball(module, (0.0, front - 0.32, door_high - 0.4), 0.12, 'gold', detail=1)
    for x in (-4.2, -2.6, 2.6, 4.2):
        shell.slit(module, (x, front - 0.36, 1.9), 0)
    for y in (-1.5, 1.5):
        shell.slit(module, (west - 0.36, y, 1.9), 3)
    # The crest over the door: a stone panel, a gilt star on it.
    kit.block(module, (0.0, front - 0.38, door_high + 0.25), (1.2, 0.1, 0.8), 'trim', bevel=0.03, wear=0.0, part=False)
    star = [((0.32 if k % 2 == 0 else 0.13) * math.sin(math.pi * k / 5), (0.32 if k % 2 == 0 else 0.13) *
             math.cos(math.pi * k / 5)) for k in range(10)]
    shapes.cutout(module, star, 0.03, 'gold', (0.0, front - 0.45, door_high + 0.65))
    # Joists' ends out of the stone's head, the boarded upper storey on them, shuttered windows along its front.
    for x in [west + 0.4 + k * 0.9 for k in range(12)]:
        shapes.slab(module, (x, front - 0.4, stone + 0.1), (0.16, 0.5, 0.18), 'timber')
    base = stone + 0.18
    def corner_posts(x):
        for y in (front, back):
            fittings.post(module, (x, y, base), upper, side=0.3)

    shell.walls(module, 'boards', west, east, front, back, upper, base, beside=corner_posts)
    for x in (-3.6, -1.2, 1.2, 3.6):
        shell.shutters(module, (x, front - 0.14, base + 0.9), 0, 0.8, 1.0, bars=True)
        fittings.post(module, (x + 0.6 if x < 0 else x - 0.6, front, base), upper, side=0.22, part=False)
    eave = base + upper
    shell.shingles(module, west - 0.1, east + 0.1, front - 0.1, back + 0.1, eave, eave + 2.6)
    for x in (west - 0.1, east + 0.1):
        shapes.lathe(module, (x, (front + back) / 2, eave + 2.75), [(0.08, 0.0), (0.12, 0.1), (0.0, 0.4)], 'gold',
                     sides=8)
    tower(module, 2.8, 2.8, 4.6, 12.4)
    # Braziers on their feet either side of the door, iron lanterns on brackets over them.
    for x in (-2.0, 2.0):
        furnish.brazier(module, (x, front - 1.2, 0.0), high=0.95, bowl=0.34)
        shapes.rod(module, (x * 0.7, front - 0.35, 3.4), (x * 0.7, front - 0.85, 3.4), 0.03, 'iron', sides=4)
        fittings.lantern(module, (x * 0.7, front - 0.85, 2.7), size=0.28, hung_from=3.4)
    doorway(module, front - 0.45)
    shell.fits(module, 4, 4)
