"""The Delve Gate (`outpost-gate-1` to `-3`, 3 x 3 cells): a raised platform climbed by a flight at its front, a well
in it whose steps lead down to a dark doorway at the foot of its back wall, `door` at the foot of those steps. Tier 1
is an earthen mound shored with timber under a headframe and lanterns; tier 2 cut stone under an arch over the worn
steps, its heavy door hung open; tier 3 a carved monumental arch hung with chains, braziers, statues by the flight.
The Captain's Lodge (`outpost-lodge-1` to `-3`) and the War Horn (`outpost-horn-1` to `-3`), 2 x 2 cells each.
"""
import math

import bmesh
import bpy
import mathutils

import adorn
import fittings
import kit
import outpost_kit as shell
import outpost_props as furnish
import ranges
import shapes
import stall_harbour

PLATFORM_M = 2.2
STEPS = 9
RUN_M = 0.42
WELL_HALF_M = 1.4
LANDING_Y = 3.4
ARCH_Y = -0.2
STEPS_HALF_M = 1.25
DOORWAY_Y = 4.6
BACK_Y = 5.4
SIDE_M = 5.0
FLIGHT_FOOT_Y = -5.4


def platform(module, body, cap, step, wear):
    """The gate's platform round its well, of `body` blocks capped in `cap`, its two flights of `step`; each block a
    part."""
    rise = PLATFORM_M / STEPS
    top_front = FLIGHT_FOOT_Y + STEPS * RUN_M
    head = LANDING_Y - STEPS * RUN_M
    for west, east, south, north in ((-SIDE_M, SIDE_M, top_front, head), (-SIDE_M, -WELL_HALF_M, head, BACK_Y),
                                     (WELL_HALF_M, SIDE_M, head, BACK_Y),
                                     (-WELL_HALF_M, WELL_HALF_M, DOORWAY_Y + 0.3, BACK_Y)):
        middle_x, middle_y = (west + east) / 2, (south + north) / 2
        kit.block(module, (middle_x, middle_y, 0.0), (east - west, north - south, PLATFORM_M - 0.12), body,
                  bevel=0.06, wear=wear, cuts=2, part=False)
        module.part((west, south, 0.0), (east, north, PLATFORM_M))
        kit.block(module, (middle_x, middle_y, PLATFORM_M - 0.14), (east - west + 0.06, north - south + 0.06, 0.14),
                  cap, bevel=0.03, wear=0.0, part=False)
    kit.stair(module, (0.0, FLIGHT_FOOT_Y, 0.0), (0, 1), 3.0, rise, RUN_M, STEPS, step, wear=wear)
    kit.stair(module, (0.0, LANDING_Y, 0.0), (0, -1), STEPS_HALF_M * 2, rise, RUN_M, STEPS, step, wear=wear)
    # The doorway: a recess of dark faces at the foot of the back wall, nothing past it.
    for x in (-1, 1):
        kit.block(module, (x * (WELL_HALF_M - 0.2), DOORWAY_Y + 0.15, 0.0), (0.4, 0.3, PLATFORM_M), body, bevel=0.03,
                  wear=wear, part=False)
    kit.block(module, (0.0, DOORWAY_Y + 0.15, 2.0), (WELL_HALF_M * 2, 0.3, PLATFORM_M - 2.0), body, bevel=0.03,
              wear=wear, part=False)
    module.part((-WELL_HALF_M, DOORWAY_Y, 0.0), (WELL_HALF_M, DOORWAY_Y + 0.3, PLATFORM_M))
    shapes.slab(module, (0.0, DOORWAY_Y + 0.28, 1.0), (2.0, 0.02, 2.0), 'black')
    for x in (-1, 1):
        shapes.slab(module, (x * 0.99, DOORWAY_Y + 0.15, 1.0), (0.02, 0.28, 2.0), 'black')
    shapes.slab(module, (0.0, DOORWAY_Y + 0.15, 1.99), (2.0, 0.28, 0.02), 'black')
    module.socket('door', (0.0, LANDING_Y + 0.3, 0.0), (0, -1))


def gate_mound(module):
    platform(module, 'rubble', 'turf', 'timber', 0.12)
    # Shoring: planks along the well's sides held by posts, logs across the doorway's head.
    for x in (-1, 1):
        for k in range(6):
            fittings.post(module, (x * (WELL_HALF_M - 0.08), 0.3 + k * 0.85, 0.0), PLATFORM_M + 0.3, side=0.16,
                          part=False)
        for z in (0.4, 1.0, 1.6):
            shapes.slab(module, (x * (WELL_HALF_M - 0.02), 2.3, z), (0.05, 4.4, 0.3), 'timber')
    shapes.rod(module, (-1.6, DOORWAY_Y - 0.05, 2.05), (1.6, DOORWAY_Y - 0.05, 2.05), 0.16, 'timber', sides=6)
    for x in (-1.0, 1.0):
        shapes.slab(module, (x, DOORWAY_Y - 0.05, 1.0), (0.2, 0.2, 2.0), 'timber')
    # A mine's portal over the head of the steps down, so the mound reads as a way in from the flight: two stout
    # posts, a cap beam braced to them and a lantern hung under it.
    portal = PLATFORM_M + 2.6
    for x in (-1, 1):
        fittings.post(module, (x * (WELL_HALF_M + 0.15), ARCH_Y, PLATFORM_M), 2.6, side=0.28)
        shapes.slab(module, (x * (WELL_HALF_M - 0.2), ARCH_Y, portal - 0.3), (0.8, 0.14, 0.14), 'timber',
                    turn=(0.0, -x * 0.75, 0.0))
    shapes.slab(module, (0.0, ARCH_Y, portal + 0.15), (WELL_HALF_M * 2 + 1.0, 0.36, 0.3), 'timber', bevel=0.01)
    module.part((-WELL_HALF_M - 0.5, ARCH_Y - 0.18, portal), (WELL_HALF_M + 0.5, ARCH_Y + 0.18, portal + 0.3))
    fittings.lantern(module, (0.0, ARCH_Y - 0.1, portal - 0.6), size=0.24, hung_from=portal)
    # The mound's front shored with posts and planks either side of the flight.
    top_front = FLIGHT_FOOT_Y + STEPS * RUN_M
    for x in (-1, 1):
        for k in range(4):
            fittings.post(module, (x * (1.9 + k * 1.0), top_front - 0.1, 0.0), PLATFORM_M + 0.1, side=0.18,
                          part=False)
        for z in (0.5, 1.4):
            shapes.slab(module, (x * 3.4, top_front - 0.04, z), (3.2, 0.06, 0.32), 'timber')
        near, far = sorted((x * 1.8, x * SIDE_M))
        module.part((near, top_front - 0.19, 0.0), (far, top_front, PLATFORM_M + 0.1))
    # The headframe over the well's mouth: two legs, a beam, a wheel and its rope down into the dark.
    for x in (-1, 1):
        shell.pole(module, (x * 1.8, 2.4, PLATFORM_M), (x * 0.9, 2.4, PLATFORM_M + 2.8), 0.08)
        module.part((x * 1.8 - 0.15, 2.25, PLATFORM_M), (x * 1.8 + 0.15, 2.55, PLATFORM_M + 1.2))
    shapes.slab(module, (0.0, 2.4, PLATFORM_M + 2.85), (2.3, 0.2, 0.2), 'timber')
    shapes.ring(module, (0.0, 2.4, PLATFORM_M + 2.5), 0.28, 0.05, 'timber', turn=(0.0, math.pi / 2, 0.0),
                segments=12, sides=4)
    shapes.rod(module, (0.0, 2.15, PLATFORM_M + 2.3), (0.0, 2.15, 1.0), 0.015, 'linen', sides=4)
    shapes.lathe(module, (0.0, 2.15, 0.6), [(0.16, 0.0), (0.2, 0.36), (0.0, 0.36)], 'timber', sides=10)
    for x in (-2.4, 2.4):
        furnish.lantern_post(module, (x, FLIGHT_FOOT_Y + 0.4, 0.0), high=2.2)
    for k in range(6):
        spot = ((1 if k % 2 else -1) * module.draw(2.2, 4.5), FLIGHT_FOOT_Y + module.draw(0.4, 3.2), 0.0)
        kit.rock(module, spot, (0.5, 0.4, 0.35),
                 k * 2.3, material='rubble', part=True, detail=2)
    shell.fits(module, 3, 3)


def arch(module, y, inner, outer, high, material, trim, deep=0.9):
    """An arch standing on the platform across the well's head at `y`: its body `outer` either side of the middle,
    its opening `inner` either side, round at its head; trim round its ring and a keystone; parts for its piers and
    its crown."""
    base = PLATFORM_M
    spring = base + high - inner - 0.6
    body = kit.block(module, (0.0, y, base), (outer * 2, deep, high), material, bevel=0.05, wear=0.03, cuts=2,
                     part=False)
    kit.cut(body, ranges._cutter(module, (0.0, y, base - 0.1), (inner * 2, deep + 1.0, spring - base + 0.1)))
    kit.cut(body, kit.cylinder_cutter((0.0, y, spring), inner, deep + 1.0))
    for side in (-1, 1):
        module.part((min(side * inner, side * outer), y - deep / 2, base), (max(side * inner, side * outer),
                    y + deep / 2, base + high))
    module.part((-inner, y - deep / 2, spring + inner), (inner, y + deep / 2, base + high))
    for face in (-1, 1):
        shapes.cutout(module, ranges._arch_band(inner, inner + 0.4, 12), 0.1, trim, (0.0, y + face * (deep / 2 +
                      0.04), spring))
        shapes.slab(module, (0.0, y + face * (deep / 2 + 0.08), spring + inner + 0.2), (0.5, 0.14, 0.7), trim)
    kit.block(module, (0.0, y, base + high), (outer * 2 + 0.3, deep + 0.3, 0.25), trim, bevel=0.03, wear=0.0,
              part=False)
    return spring


def gate_arch(module):
    platform(module, 'stone', 'trim', 'stone', 0.06)
    arch(module, ARCH_Y, WELL_HALF_M, 2.3, 4.0, 'stone', 'trim')
    # The heavy door's two leaves hung open against the landing's walls, their iron straps toward the steps.
    for side in (-1, 1):
        shell.door(module, (side * (WELL_HALF_M - 0.07), DOORWAY_Y - 0.55, 0.0), 1 if side < 0 else 3, 1.0, 2.0,
                   kind='bound')
        for z in (0.4, 1.6):
            shapes.slab(module, (side * (WELL_HALF_M - 0.04), DOORWAY_Y - 0.05, z), (0.1, 0.16, 0.2), 'iron')
    for x in (-SIDE_M + 0.6, SIDE_M - 0.6):
        furnish.lantern_post(module, (x, -1.2, PLATFORM_M), high=2.0)
    for side in (-1, 1):
        kit.block(module, (side * 2.0, FLIGHT_FOOT_Y + 1.9, 0.0), (0.8, 3.8, 1.0), 'stone', bevel=0.05, wear=0.05,
                  cuts=1)
        kit.block(module, (side * 2.0, FLIGHT_FOOT_Y + 1.9, 1.0), (0.9, 3.9, 0.14), 'trim', bevel=0.03, wear=0.0,
                  part=False)
    shell.fits(module, 3, 3)


def chains(module, start, end, sag, links=12):
    """A chain of iron links hung from `start` to `end`, sagging `sag` at its middle."""
    start, end = mathutils.Vector(start), mathutils.Vector(end)
    for link in range(links):
        share = (link + 0.5) / links
        point = start.lerp(end, share)
        point.z -= sag * math.sin(math.pi * share)
        along = (end - start).normalized() + mathutils.Vector((0.0, 0.0, -sag * math.pi * math.cos(math.pi * share) /
                                                                max(0.1, (end - start).length)))
        turn = along.to_track_quat('X', 'Z').to_euler()
        if link % 2:
            turn.x += math.pi / 2
        shapes.ring(module, tuple(point), 0.07, 0.025, 'iron', turn=tuple(turn), segments=8, sides=3)


def statue(module, x, y):
    """A hooded figure on a plinth beside the flight, leaning on a sword point down before it; a part."""
    kit.block(module, (x, y, 0.0), (1.1, 1.1, 0.3), 'trim', bevel=0.03, wear=0.02, part=False)
    kit.block(module, (x, y, 0.3), (0.9, 0.9, 1.1), 'stone', bevel=0.04, wear=0.03)
    kit.block(module, (x, y, 1.4), (1.05, 1.05, 0.15), 'trim', bevel=0.03, wear=0.0, part=False)
    adorn.figure(module, (x, y, 1.55), 'stone', tall=2.4)
    fittings.sword(module, (x, y - 0.55, 1.55), length=1.3, metal='stone')
    module.part((x - 0.55, y - 0.55, 0.0), (x + 0.55, y + 0.55, 4.0))


def gate_monument(module):
    platform(module, 'stone', 'trim', 'trim', 0.03)
    spring = arch(module, ARCH_Y, WELL_HALF_M, 2.6, 5.4, 'stone', 'trim', deep=1.1)
    front = ARCH_Y - 0.65
    # Its crown: a carved frieze, a gilt keystone and a pediment, chains hung across the arch and down its piers.
    kit.block(module, (0.0, ARCH_Y, PLATFORM_M + 5.65), (5.0, 1.2, 0.6), 'stone', bevel=0.04, wear=0.02, part=False)
    shapes.cutout(module, [(-2.5, 0.0), (2.5, 0.0), (0.0, 1.0)], 1.1, 'stone', (0.0, ARCH_Y, PLATFORM_M + 6.25))
    module.part((-2.5, ARCH_Y - 0.6, PLATFORM_M + 5.4), (2.5, ARCH_Y + 0.6, PLATFORM_M + 6.8))
    for face in (-1, 1):
        shapes.slab(module, (0.0, ARCH_Y + face * 0.65, spring + WELL_HALF_M + 0.2), (0.52, 0.06, 0.72), 'gold')
        for k in range(5):
            shapes.lathe(module, (-2.0 + k * 1.0, ARCH_Y + face * 0.62, PLATFORM_M + 5.95), [(0.14, 0.0), (0.14, 0.05),
                         (0.0, 0.06)], 'gold', sides=10, turn=(-face * math.pi / 2, 0.0, 0.0), smooth=False)
    chains(module, (-1.7, front, PLATFORM_M + 4.4), (1.7, front, PLATFORM_M + 4.4), 0.8, links=16)
    for side in (-1, 1):
        chains(module, (side * 1.9, front, PLATFORM_M + 4.2), (side * 1.95, front, PLATFORM_M + 0.6), 0.0, links=10)
        furnish.brazier(module, (side * (SIDE_M - 0.6), -1.0, PLATFORM_M), high=1.0, bowl=0.38)
        furnish.brazier(module, (side * 2.0, FLIGHT_FOOT_Y + 0.3, 0.0), high=0.9, bowl=0.32)
        statue(module, side * 2.6, FLIGHT_FOOT_Y + 2.4)
    shell.fits(module, 3, 3)


def spyglass(module, at):
    """A spyglass on a tripod, pointed out to sea."""
    x, y, z = at
    for leg in range(3):
        angle = math.tau * leg / 3
        shapes.rod(module, (x + math.cos(angle) * 0.35, y + math.sin(angle) * 0.35, z), (x, y, z + 1.3), 0.018,
                   'timber', sides=4)
    shapes.lathe(module, (x, y + 0.35, z + 1.38), [(0.03, 0.0), (0.035, 0.3), (0.045, 0.32), (0.045, 0.62),
                 (0.055, 0.64), (0.06, 0.9)], 'gold', sides=10, turn=(math.pi / 2 + 0.1, 0.0, 0.0))


def anchor(module, x, y):
    """A ship's anchor stood against a wall at `y`: its shank, stock, arms and flukes and a ring at its head."""
    shapes.slab(module, (x, y, 1.0), (0.12, 0.1, 1.9), 'iron')
    shapes.slab(module, (x, y - 0.06, 1.75), (1.1, 0.12, 0.12), 'timber')
    shapes.cutout(module, adorn.arc(0.6, 0.5, math.pi * 1.05, math.pi * 1.95, steps=10), 0.1, 'iron',
                  (x, y, 0.7))
    for side in (-1, 1):
        shapes.cutout(module, [(0.0, 0.0), (0.2, 0.12), (0.12, 0.3)], 0.1, 'iron',
                      (x + side * 0.55, y, 0.42), turn=(0.0, 0.0, 0.0 if side > 0 else math.pi))
    shapes.ring(module, (x, y, 2.05), 0.12, 0.04, 'iron', turn=(math.pi / 2, 0.0, 0.0), segments=10, sides=4)


def lodge_tent(module):
    shell.tent(module, (0.0, 0.6, 0.0), 0, 3.2, 3.8, 3.0, eave=1.7, open_door=True, out=0.5)
    fittings.post(module, (2.2, -1.45, 0.0), 2.2, side=0.14)
    stall_harbour.ship_wheel(module, (2.2, -1.6, 1.45))
    fittings.chest(module, (-1.7, -1.9, 0.0), turn=0.15)
    module.part((-2.2, -2.25, 0.0), (-1.2, -1.55, 0.6))
    fittings.scrolls(module, (-1.75, -1.9, 0.56), 5, length=0.5)
    spyglass(module, (2.6, -2.8, 0.0))
    top = furnish.trestle(module, (0.0, 1.4, 0.0), 1.4, 0.7)
    shapes.slab(module, (0.0, 1.4, top + 0.004), (1.0, 0.6, 0.006), 'linen')
    fittings.lantern(module, (0.0, 0.6, 2.0), size=0.24, hung_from=2.96)
    furnish.lantern_post(module, (-2.6, -0.4, 0.0), high=2.0)
    module.socket('use', (0.0, -2.3, 0.0), (0, -1))
    shell.fits(module, 2, 2)


def figurehead(module, at):
    """A ship's figurehead fixed over a door: a crowned maiden carved and painted, leaning out from a carved bracket,
    her hands crossed on her breast."""
    x, y, z = at
    shapes.cutout(module, [(-0.35, 0.0), (0.35, 0.0), (0.2, -0.3), (0.0, -0.5), (-0.2, -0.3)], 0.2, 'timber',
                  (x, y - 0.1, z))
    lean = 0.45
    shapes.lathe(module, (x, y - 0.2, z - 0.35), [(0.22, 0.0), (0.28, 0.3), (0.22, 0.6), (0.18, 0.8), (0.0, 0.85)],
                 'linen', sides=10, turn=(lean, 0.0, 0.0))
    head = (x, y - 0.2 - math.sin(lean) * 1.0, z - 0.35 + math.cos(lean) * 1.0)
    shapes.ball(module, head, 0.16, 'bone', detail=2, scale=(0.9, 1.0, 1.15))
    shapes.lathe(module, (head[0], head[1] + 0.03, head[2] + 0.12), [(0.12, 0.0), (0.13, 0.08), (0.1, 0.1)],
                 'black', sides=8, turn=(lean, 0.0, 0.0))
    shapes.lathe(module, (head[0], head[1], head[2] + 0.15), [(0.1, 0.0), (0.11, 0.08), (0.0, 0.08)], 'crimson',
                 sides=8, turn=(lean, 0.0, 0.0))
    shapes.slab(module, (x, y - 0.55, z + 0.15), (0.4, 0.08, 0.1), 'crimson', turn=(lean, 0.0, 0.0))


def lodge_timber(module):
    west, east, front, back, sill, wall = -2.3, 2.3, -1.4, 2.4, 0.3, 2.6
    kit.block(module, (0.0, (front + back) / 2, 0.0), (east - west + 0.3, back - front + 0.3, sill), 'stone',
              bevel=0.04, wear=0.03, cuts=1)
    def window_and_posts(x):
        shell.shutters(module, (x + (0.14 if x > 0 else -0.14), 0.5, sill + 1.0), 1 if x > 0 else 3, 0.7, 0.9)
        for y in (front, back):
            fittings.post(module, (x, y, 0.0), sill + wall, side=0.26)

    shell.walls(module, 'boards', west, east, front, back, wall, sill, front_gaps=((1.75, 2.85, 2.2),),
                beside=window_and_posts)
    shell.door(module, (0.0, front, sill), 0, 1.06, 2.2)
    kit.block(module, (0.0, front - 0.35, 0.0), (1.4, 0.5, sill - 0.05), 'stone', bevel=0.02, wear=0.0)
    eave, ridge = sill + wall, sill + wall + 1.9
    shell.shingles(module, west - 0.1, east + 0.1, front - 0.1, back + 0.1, eave, ridge, along_y=True)
    shell.barge_horns(module, front - 0.45, east + 0.35, eave, ridge, out=-1.0)
    figurehead(module, (0.0, front - 0.25, eave - 0.05))
    anchor(module, -1.4, front - 0.2)
    stall_harbour.coil(module, (1.5, front - 0.7, 0.0), 0.36)
    for x, y in ((3.0, 0.0), (3.0, 0.7)):
        fittings.barrel(module, (x, y, 0.0), radius=0.3, high=0.85)
    module.part((2.7, -0.3, 0.0), (3.3, 1.0, 0.85))
    module.socket('use', (0.0, front - 0.9, 0.0), (0, -1))
    shell.fits(module, 2, 2)


def lodge_stone(module):
    west, east, front, back, wall = -2.3, 2.3, -1.4, 2.4, 3.0
    shell.walls(module, 'stone', west, east, front, back, wall, front_gaps=((1.75, 2.85, 2.3),))
    shell.door(module, (0.0, front, 0.0), 0, 1.06, 2.3, kind='bound')
    for x in (-1.5, 1.5):
        shell.shutters(module, (x, front - 0.32, 1.1), 0, 0.6, 0.9)
    shell.shingles(module, west - 0.1, east + 0.1, front - 0.1, back + 0.1, wall + 0.18, wall + 2.1, along_y=True,
                   ends='stone')
    shapes.lathe(module, (0.0, front - 0.45, wall + 2.25), [(0.08, 0.0), (0.12, 0.1), (0.0, 0.42)], 'gold', sides=8)
    shapes.rod(module, (0.0, front - 0.3, 2.95), (0.0, front - 0.85, 2.95), 0.03, 'iron', sides=4)
    fittings.lantern(module, (0.0, front - 0.85, 2.3), size=0.28, hung_from=2.95)
    # Two flagstaffs held off the west wall by iron collars, the bell in its frame by the east wall.
    for y, cloth in ((front + 0.2, 'crimson'), (back - 0.2, 'linen')):
        for z in (1.6, 2.6):
            shapes.rod(module, (west - 0.3, y, z), (west - 0.6, y, z), 0.025, 'iron', sides=4)
            shapes.lathe(module, (west - 0.6, y, z - 0.05), [(0.06, 0.0), (0.06, 0.1)], 'iron', sides=8)
        furnish.flag(module, (west - 0.6, y, 0.0), 5.4, cloth, trim='gold')
    stall_harbour.bell_frame(module, 3.0, 0.4)
    module.socket('use', (0.0, front - 1.1, 0.0), (0, -1))
    shell.fits(module, 2, 2)


def horn_rest(base, length, mouth, y):
    """How high the great horn's underside lies over `y`, so a cradle under it meets it."""
    t = 0.5 - (y - base[1]) / length
    return base[2] + 0.3 * length * t * t - (0.05 + (mouth - 0.05) * t ** 2.4)


def great_horn(module, base, length, mouth, quarter=0):
    """A great horn of bone lying along y on `base` (its middle), its mouth `mouth` wide toward -y and curving up to
    it, iron bands round it and an iron mouthpiece at its narrow end."""
    def middle(t):
        return mathutils.Vector((0.0, length * (0.5 - t), 0.3 * length * t * t))

    def radius(t):
        return 0.05 + (mouth - 0.05) * t ** 2.4

    rings, sides = 16, 12
    made = bmesh.new()
    loops = []
    for ring in range(rings + 1):
        t = ring / rings
        along = (middle(min(1.0, t + 0.01)) - middle(max(0.0, t - 0.01))).normalized()
        across = along.cross(mathutils.Vector((1.0, 0.0, 0.0))).normalized()
        side = along.cross(across)
        loops.append([made.verts.new(middle(t) + (across * math.cos(math.tau * k / sides) + side * math.sin(math.tau *
                      k / sides)) * radius(t)) for k in range(sides)])
    for low, high in zip(loops, loops[1:]):
        for k in range(sides):
            made.faces.new((low[k], low[(k + 1) % sides], high[(k + 1) % sides], high[k]))
    made.faces.new(loops[0][::-1])
    bmesh.ops.recalc_face_normals(made, faces=made.faces)
    with shapes.frame(module, base, quarter):
        item = bpy.data.meshes.new('horn')
        made.to_mesh(item)
        made.free()
        for polygon in item.polygons:
            polygon.use_smooth = True
        kit.item_of(module, f'horn{len(module.objects)}', item, 'bone')
        shapes.lathe(module, tuple(middle(0.97)), [(radius(0.97) * 0.95, 0.0), (0.0, 0.02)], 'black', sides=12,
                     turn=(math.pi / 2 - 0.54, 0.0, 0.0))
        for t in (0.25, 0.5, 0.75, 0.97):
            along = (middle(t + 0.01) - middle(t - 0.01)).normalized()
            shapes.ring(module, tuple(middle(t)), radius(t) + 0.01, 0.04, 'iron',
                        turn=tuple(along.to_track_quat('Z', 'Y').to_euler()), segments=12, sides=4)
        shapes.rod(module, tuple(middle(0.0)), tuple(middle(0.0) + mathutils.Vector((0.0, 0.25, 0.0))), 0.04, 'iron',
                   sides=8, end_radius=0.06)


def horn_frame(module):
    base = (0.0, 0.0, 1.8)
    for y in (-0.8, 0.8):
        top = horn_rest(base, 3.2, 0.42, y)
        for side in (-1, 1):
            shell.pole(module, (side * 0.9, y, 0.0), (side * 0.15, y, top), 0.07)
        shapes.slab(module, (0.0, y, 1.0), (1.4, 0.1, 0.1), 'timber')
        shapes.slab(module, (0.0, y, top - 0.3), (0.7, 0.14, 0.12), 'timber')
        shapes.lathe(module, (0.0, y, top - 0.05), [(0.12, 0.0), (0.12, 0.05)], 'linen', sides=8)
    shapes.slab(module, (0.0, 0.0, 0.5), (0.1, 1.7, 0.1), 'timber')
    great_horn(module, base, 3.2, 0.42)
    module.part((-0.95, -0.95, 0.0), (0.95, 0.95, 2.4))
    for k in range(3):
        kit.rock(module, (-1.2 + k * 0.4, 1.4, 0.0), (0.3, 0.25, 0.2), k * 1.3, material='rubble', part=False,
                 detail=2)
    module.socket('use', (0.0, -2.2, 0.0), (0, -1))
    shell.fits(module, 2, 2)


def horn_platform(module):
    half, deck = 1.4, 1.8
    rise = deck / 7
    for x in (-half, half):
        for y in (-half, half):
            fittings.post(module, (x, y, 0.0), deck + 1.0, side=0.24)
    for k in (-1, 1):
        shapes.slab(module, (0.0, k * half, deck * 0.45), (half * 2, 0.08, 0.12), 'timber', turn=(0.0, 0.6, 0.0))
        shapes.slab(module, (k * half, 0.0, deck * 0.45), (0.08, half * 2, 0.12), 'timber', turn=(0.6, 0.0, 0.0))
    kit.block(module, (0.0, 0.0, deck - 0.12), (half * 2 + 0.3, half * 2 + 0.3, 0.12), 'timber', bevel=0.01,
              wear=0.0)
    for k in range(7):
        shapes.slab(module, (-half + 0.2 + k * 0.4, 0.0, deck + 0.01), (0.36, half * 2 + 0.2, 0.03), 'timber')
    for (start_x, start_y), (end_x, end_y) in (((-half, -half), (half, -half)), ((half, -half), (half, half)),
                                               ((-half, half), (half, half))):
        shapes.slab(module, ((start_x + end_x) / 2, (start_y + end_y) / 2, deck + 0.95),
                    (abs(end_x - start_x) + 0.1, abs(end_y - start_y) + 0.1, 0.1), 'timber')
        module.part((min(start_x, end_x) - 0.05, min(start_y, end_y) - 0.05, deck),
                    (max(start_x, end_x) + 0.05, max(start_y, end_y) + 0.05, deck + 1.0))
    kit.stair(module, (-half - 7 * 0.3, 0.6, 0.0), (1, 0), 1.0, rise, 0.3, 7, 'timber', wear=0.0)
    for y in (0.6 - 0.5, 0.6 + 0.5):
        fittings.post(module, (-half - 2.1, y, 0.0), 1.0, side=0.08, part=False)
        shapes.rod(module, (-half - 2.1, y, 0.95), (-half, y, deck + 0.9), 0.03, 'timber', sides=5)
    for y in (-0.6, 0.6):
        rest = horn_rest((0.0, 0.0, deck + 0.75), 3.0, 0.4, y)
        shapes.slab(module, (0.0, y, (deck + rest) / 2), (0.7, 0.14, rest - deck), 'timber')
    great_horn(module, (0.0, 0.0, deck + 0.75), 3.0, 0.4)
    furnish.brazier(module, (half - 0.4, half - 0.4, deck), high=0.85, bowl=0.28, foot=False)
    module.socket('use', (0.0, -2.2, 0.0), (0, -1))
    shell.fits(module, 2, 2)


def horn_tower(module):
    side, high = 3.2, 7.0
    middle = (0.0, 0.6)
    top = shell.keep(module, middle, side, high, (3.5,), plinth=0.3, course=0.12, string=0.2, grow=0.1, inset=0.05,
                     reach=0.0, merlons=(0.35, 1.1, 0.6, 0.7))
    shell.door(module, (0.0, middle[1] - side / 2 - 0.02, 0.0), 0, 1.0, 2.2, kind='bound')
    shell.slit(module, (0.0, middle[1] - side / 2 - 0.03, 4.6), 0)
    for face, face_middle in (('+x', (side / 2 + 0.03, middle[1])), ('-x', (-side / 2 - 0.03, middle[1])),
                              ('+y', (0.0, middle[1] + side / 2 + 0.03))):
        for z in (2.2, 5.0):
            shell.slit(module, (*face_middle, z), shell.QUARTERS[face])
    for y in (middle[1] - 0.6, middle[1] + 0.6):
        rest = horn_rest((0.0, middle[1] - 0.4, top + 0.7), 3.0, 0.42, y)
        shapes.slab(module, (0.0, y, (top + rest) / 2), (0.6, 0.16, rest - top), 'timber')
    great_horn(module, (0.0, middle[1] - 0.4, top + 0.7), 3.0, 0.42)
    for x in (-1, 1):
        furnish.brazier(module, (x * 1.0, middle[1] + 1.0, top), high=0.8, bowl=0.26, foot=False)
    for x in (-1.3, 1.3):
        shapes.rod(module, (x, middle[1] - side / 2, 2.9), (x, middle[1] - side / 2 - 0.5, 2.9), 0.03, 'iron', sides=4)
        fittings.lantern(module, (x, middle[1] - side / 2 - 0.5, 2.25), size=0.26, hung_from=2.9)
    module.socket('use', (0.0, middle[1] - side / 2 - 0.8, 0.0), (0, -1))
    shell.fits(module, 2, 2)
