"""The outpost's two stores, each with `stores` at its front where what it gathers is kept and taken. The Island Camp
(`outpost-camp-1` to `-3`, 2 x 2 cells): a drying rack hung with hides and herbs, baskets, sacks and a rack of picks
and sickles; an open-fronted boarded shed of shelves and bins; a stone and timber-framed workshop with a hoist on a
beam out of its gable, bins and a handcart. The Dockyard's yard (`outpost-dock-1` to `-3`, 2 x 3 cells): timber on
chocks, canvas under a tarp, iron bars on a pallet and a shear-leg derrick; a long open shed over a slipway with a
ship's ribs on it; a stone and timber shed with a working crane, a rope walk and a forge for fittings.
"""
import math

import fittings
import kit
import market
import outpost_kit as shell
import outpost_props as furnish
import props
import shapes
import stall_tailor
import stall_weaponsmith
import timbers


def stores_at(module, y):
    module.socket('stores', (0.0, y, 0.0), (0, -1))


def drying_rack(module, west, east, y, high=2.1):
    """A drying rack of rough poles: an A-frame at each end, a ridge pole and two rails, hides and bundles of herbs
    hung from them; a part, as its hangings screen it."""
    for x in (west, east):
        for side in (-1, 1):
            shell.pole(module, (x, y + side * 0.7, 0.0), (x, y, high + 0.15), 0.045)
        shapes.rod(module, (x, y - 0.42, 0.85), (x, y + 0.42, 0.85), 0.03, 'timber', sides=5)
    shell.pole(module, (west - 0.15, y, high), (east + 0.15, y, high), 0.05)
    for z, out in ((1.45, -0.32), (1.45, 0.32)):
        shell.pole(module, (west, y + out, z), (east, y + out, z), 0.035)
    span = east - west
    for hide in range(3):
        start = west + 0.2 + hide * span / 3
        shapes.drape(module, (start, y, high - 0.05), (start + span / 3 - 0.4, y, high - 0.05), 1.1,
                     ('canvas', 'linen', 'straw')[hide], folds=2, depth=0.05, hem=0.12)
    for bundle in range(7):
        x = west + 0.3 + bundle * (span - 0.6) / 6
        for out in (-0.32, 0.32):
            shapes.rod(module, (x, y + out, 1.43), (x, y + out, 1.25), 0.006, 'linen', sides=3)
            shapes.lathe(module, (x, y + out, 0.95), [(0.03, 0.0), (0.09, 0.2), (0.06, 0.3), (0.04, 0.3)],
                         'verdant' if (bundle + (out > 0)) % 2 else 'straw', sides=6)
    module.part((west - 0.1, y - 0.7, 0.0), (east + 0.1, y + 0.7, high))


def camp_open(module):
    drying_rack(module, -2.6, 0.8, 1.6)
    furnish.tool_rack(module, (2.2, 2.4, 0.0), 0)
    for x, y, fill in ((-2.2, -0.8, 'straw'), (-1.5, -1.1, 'verdant'), (-1.9, -1.7, 'rubble'), (0.9, -0.9, 'straw')):
        market.basket(module, (x, y, 0.0), 0.32, fill)
    module.part((-2.55, -2.05, 0.0), (-1.15, -0.45, 0.35))
    for x, y in ((1.8, -0.4), (2.3, -0.2), (2.05, 0.3), (2.6, 0.45)):
        timbers.sack(module, timbers.Frame((x, y, 0.0), module.draw(0, math.tau)), (0.26, 0.56))
    timbers.sack(module, timbers.Frame((2.1, 0.0, 0.5), 1.0, (math.pi / 2 - 0.1, 0.0)), (0.22, 0.55), flat=0.6)
    module.part((1.5, -0.7, 0.0), (2.95, 0.8, 0.85))
    shapes.lathe(module, (-0.2, -1.9, 0.0), [(0.32, 0.0), (0.3, 0.45), (0.0, 0.45)], 'timber', sides=10)
    shapes.rod(module, (-0.2, -1.9, 0.45), (-0.05, -1.85, 1.0), 0.02, 'timber', sides=4)
    shapes.cutout(module, [(0.0, 0.0), (0.2, -0.04), (0.33, 0.06), (0.18, 0.02)], 0.01, 'iron', (-0.05, -1.85, 0.98))
    stores_at(module, -2.8)
    shell.fits(module, 2, 2)


def shelves(module, west, east, y, high=2.0, rows=3):
    """Shelves of boards on posts against a back wall, baskets and sacks on them; a part."""
    for x in (west, (west + east) / 2, east):
        fittings.post(module, (x, y, 0.0), high, side=0.09, part=False)
    for row in range(rows):
        z = 0.45 + row * (high - 0.4) / rows
        shapes.slab(module, ((west + east) / 2, y, z), (east - west + 0.1, 0.5, 0.04), 'timber')
        x = west + 0.3
        while x < east - 0.2:
            if module.random.random() < 0.5:
                market.basket(module, (x, y, z + 0.02), 0.2, ('straw', 'verdant', 'rubble')[row % 3])
            else:
                fittings.sack(module, (x, y, z + 0.02), size=0.36, material='canvas')
            x += module.draw(0.42, 0.55)
    module.part((west - 0.05, y - 0.27, 0.0), (east + 0.05, y + 0.27, high))


def camp_shed(module):
    west, east, front, back, wall = -2.6, 2.6, -1.4, 2.2, 2.6
    shell.walls(module, 'boards', west, east, front, back, wall, open_front=True, sides_from=front + 0.3)
    for x in (west, -0.9, 0.9, east):
        fittings.post(module, (x, front, 0.0), wall, side=0.24)
    shapes.slab(module, (0.0, front, wall - 0.12), (east - west + 0.3, 0.26, 0.26), 'timber', bevel=0.01)
    shell.shingles(module, west - 0.1, east + 0.1, front - 0.1, back + 0.1, wall + 0.02, wall + 1.4)
    shelves(module, west + 0.35, east - 0.35, back - 0.4)
    for x, fill in ((-1.5, 'rubble'), (0.0, 'straw'), (1.5, 'verdant')):
        furnish.heaped_bin(module, (x, 0.2, 0.0), (1.2, 0.9, 0.75), fill)
    for x in (-2.0, 2.0):
        for y in (-2.0, -2.6):
            fittings.sack(module, (x + module.draw(-0.1, 0.1), y, 0.0), size=0.5, material='canvas')
        module.part((x - 0.3, -2.9, 0.0), (x + 0.3, -1.75, 0.5))
    stores_at(module, -2.6)
    shell.fits(module, 2, 2)


def hoist(module, y, z, reach=1.3):
    """A hoist on a beam run out of a gable at `y`, `z` high: the beam on a brace, a pulley block at its end, the
    rope down to a hook with a crate slung from it, its fall belayed to a cleat on the wall."""
    end = y - reach
    shapes.slab(module, (0.0, y - reach / 2 + 0.2, z), (0.22, reach + 0.4, 0.24), 'timber', bevel=0.01)
    shapes.slab(module, (0.0, y - 0.4, z - 0.55), (0.12, 0.9, 0.12), 'timber', turn=(-0.9, 0.0, 0.0))
    shapes.lathe(module, (0.0, end + 0.1, z - 0.5), [(0.0, 0.0), (0.12, 0.02), (0.14, 0.18), (0.12, 0.34),
                 (0.0, 0.36)], 'timber', sides=8)
    shapes.ring(module, (0.0, end + 0.1, z - 0.32), 0.13, 0.04, 'iron', turn=(0.0, math.pi / 2, 0.0), segments=10,
                sides=4)
    shapes.rod(module, (0.0, end + 0.1, z - 0.5), (0.0, end + 0.1, 1.6), 0.015, 'linen', sides=4)
    shapes.rod(module, (0.0, end + 0.22, z - 0.4), (0.0, y - 0.05, 1.3), 0.015, 'linen', sides=4)
    shapes.ring(module, (0.0, end + 0.1, 1.55), 0.07, 0.025, 'iron', turn=(0.0, math.pi / 2, 0.0), segments=8, sides=3)
    for side in (-1, 1):
        shapes.rod(module, (0.0, end + 0.1, 1.5), (side * 0.3, end + 0.1, 1.15), 0.01, 'linen', sides=3)
    fittings.crate(module, (0.0, end + 0.1, 0.75), (0.6, 0.55, 0.4))


def camp_workshop(module):
    west, east, front, back = -2.6, 2.6, -1.6, 2.4
    eave, ridge = 3.0, 5.0
    fittings.framed_wall(module, (west, back), (east, back), eave)
    for x in (west, east):
        fittings.framed_wall(module, (x, front), (x, back), eave)
    for x in (west + 0.1, east - 0.1):
        kit.block(module, (x, front, 0.0), (0.7, 0.7, eave), 'stone', bevel=0.05, wear=0.03, cuts=1)
    kit.block(module, (0.0, front, eave - 0.4), (east - west + 0.6, 0.6, 0.4), 'trim', bevel=0.03, wear=0.01)
    shell.shingles(module, west - 0.15, east + 0.15, front - 0.1, back + 0.1, eave, ridge, along_y=True)
    shell.barge_horns(module, front - 0.45, east + 0.4, eave, ridge, out=-1.0)
    hoist(module, front - 0.4, ridge - 0.7)
    for x, fill in ((-1.6, 'rubble'), (-0.4, 'straw')):
        furnish.heaped_bin(module, (x, back - 0.8, 0.0), (1.0, 0.9, 0.8), fill)
    for x, fill in ((1.3, 'verdant'),):
        furnish.heaped_bin(module, (x, back - 0.8, 0.0), (1.2, 0.9, 0.8), fill)
    top = furnish.trestle(module, (-1.6, 0.0, 0.0), 1.4, 0.7, high=0.9)
    for k in range(3):
        shapes.slab(module, (-2.0 + k * 0.35, 0.05, top + 0.03), (0.08, 0.5, 0.06), 'iron', turn=(0.0, 0.0, 0.2 * k))
    furnish.handcart(module, (2.2, -2.6, 0.0), 0, load='rubble')
    furnish.lantern_post(module, (-2.9, -2.4, 0.0), high=2.4)
    furnish.flag(module, (0.0, back + 0.3, ridge - 0.1), 1.6, 'crimson', trim='gold', radius=0.03)
    stores_at(module, -3.0)
    shell.fits(module, 2, 2)


def iron_pallet(module, at):
    """Iron bars stacked crosswise on a pallet of boards, banded."""
    x, y, z = at
    for k in (-0.45, 0.0, 0.45):
        shapes.slab(module, (x, y + k, z + 0.06), (1.4, 0.1, 0.12), 'timber')
    for k in range(7):
        shapes.slab(module, (x - 0.6 + k * 0.2, y, z + 0.135), (0.16, 1.1, 0.03), 'timber')
    for layer in range(4):
        for bar in range(6 - layer % 2):
            along = -0.5 + bar * 0.2 + (layer % 2) * 0.1
            spot = (x + along, y, z + 0.2 + layer * 0.07) if layer % 2 == 0 else (x, y + along, z + 0.2 + layer * 0.07)
            shapes.slab(module, spot, (0.07, 1.2, 0.06) if layer % 2 == 0 else (1.2, 0.07, 0.06), 'iron')
    module.part((x - 0.7, y - 0.6, z), (x + 0.7, y + 0.6, z + 0.5))


def canvas_bolts(module, at):
    """Bolts of sailcloth stacked three, two and one, under a tarp pegged out at its corners."""
    x, y, z = at
    for row, count in enumerate((3, 2, 1)):
        for bolt in range(count):
            stall_tailor.bolt(module, (x - 0.22 * (count - 1) + bolt * 0.44, y, z + 0.2 + row * 0.36), 1.4, 0.2,
                              'linen', along_x=False)
    timbers.tarp(module, (x, y), (1.6, 1.3), [(x - 0.6, y - 0.55, x + 0.6, y + 0.55, z + 1.1)], sag=0.06)
    module.part((x - 0.8, y - 0.75, z), (x + 0.8, y + 0.75, z + 1.15))


def derrick(module, at, high=4.4, lean=0.8):
    """A shear-leg derrick: two spars splayed apart at their feet and lashed at their head, leaning out toward -y over
    a load, a guy back to a stake, a block and tackle down to a beam slung in a sling."""
    x, y, z = at
    head = (x, y - lean, z + high)
    for side in (-1, 1):
        shell.pole(module, (x + side * 1.1, y, z), head, 0.1)
        kit.block(module, (x + side * 1.1, y, z), (0.35, 0.35, 0.3), 'stone', bevel=0.04, wear=0.03, part=False)
        module.part((x + side * 1.1 - 0.17, y - 0.17, z), (x + side * 1.1 + 0.17, y + 0.17, z + 1.6))
    shapes.lathe(module, (head[0], head[1], head[2] - 0.15), [(0.14, 0.0), (0.14, 0.3)], 'linen', sides=8)
    timbers.guy(module, (head[0], head[1], head[2]), (x, y + 2.4, 0.0), (-0.3, 0.0), thick=0.025, stake=0.35)
    block = (x, y - lean, z + high - 0.9)
    shapes.rod(module, (block[0], block[1], head[2] - 0.1), block, 0.02, 'linen', sides=4)
    shapes.lathe(module, (block[0], block[1], block[2] - 0.35), [(0.0, 0.0), (0.12, 0.05), (0.13, 0.3), (0.0, 0.35)],
                 'timber', sides=8)
    shapes.rod(module, (block[0], block[1], block[2] - 0.35), (block[0], block[1], z + 1.3), 0.018, 'linen', sides=4)
    for side in (-1, 1):
        shapes.rod(module, (block[0], block[1], z + 1.3), (block[0] + side * 0.6, block[1], z + 0.95), 0.015, 'linen',
                   sides=3)
    shapes.slab(module, (block[0], block[1], z + 0.85), (2.2, 0.26, 0.24), 'timber', bevel=0.01)


def dock_yard(module):
    furnish.timber_stack(module, (-2.0, 1.8, 0.0), 4.4, layers=4, count=5, along_x=False)
    furnish.timber_stack(module, (2.0, 3.8, 0.0), 2.6, layers=2, count=4, along_x=False, beam=0.18)
    canvas_bolts(module, (1.9, 0.6, 0.0))
    iron_pallet(module, (1.9, -1.6, 0.0))
    derrick(module, (-1.0, -2.6, 0.0))
    for k in range(4):
        shapes.rod(module, (-3.1 + k * 0.15, -4.6, 0.12), (-3.1 + k * 0.15, -3.0, 0.12), 0.11, 'timber', sides=6)
    module.part((-3.25, -4.6, 0.0), (-2.5, -3.0, 0.25))
    fittings.rope_coil(module, (2.6, -3.6, 0.0), radius=0.35, turns=4)
    for x in (1.6, 2.3):
        fittings.barrel(module, (x, -4.6, 0.0), radius=0.32, high=0.9)
    module.part((1.25, -4.95, 0.0), (2.65, -4.25, 0.9))
    stores_at(module, -5.4)
    shell.fits(module, 2, 3)


def rib_cage(module, keel_z, start, end, beam, depth):
    """A ship's frame on the stocks: a keel along y from `start` to `end`, stem and sternpost rising at its ends and
    ribs bent up either side, widest amidships, a ribband along each side tying them."""
    length = end - start
    shapes.slab(module, (0.0, (start + end) / 2, keel_z + 0.12), (0.26, length, 0.24), 'timber', bevel=0.01)
    shapes.slab(module, (0.0, end + 0.2, keel_z + depth * 0.55), (0.22, 0.22, depth * 1.15), 'timber',
                turn=(-0.35, 0.0, 0.0))
    shapes.slab(module, (0.0, start - 0.05, keel_z + depth * 0.5), (0.22, 0.22, depth), 'timber',
                turn=(0.15, 0.0, 0.0))
    ribs = 9
    tops = {-1: [], 1: []}
    for rib in range(ribs):
        share = (rib + 0.5) / ribs
        y = start + length * share
        wide = beam / 2 * (0.35 + 0.65 * math.sin(math.pi * share) ** 0.6)
        points = [(math.sin(math.pi / 2 * k / 5) * wide, keel_z + 0.2 + depth * (1 - math.cos(math.pi / 2 * k / 5))
                   * (0.85 + 0.15 * share)) for k in range(6)]
        for side in (-1, 1):
            for (low_x, low_z), (high_x, high_z) in zip(points, points[1:]):
                shapes.rod(module, (side * low_x, y, low_z), (side * high_x, y, high_z), 0.07, 'timber', sides=4)
            tops[side].append((side * points[-1][0], y, points[-1][1]))
    for side in (-1, 1):
        for a, b in zip(tops[side], tops[side][1:]):
            shapes.rod(module, a, b, 0.06, 'timber', sides=4)


def dock_shed(module):
    half_x, front, back, eave, ridge = 3.1, -4.4, 5.0, 3.4, 5.4
    bays = 4
    for bay in range(bays + 1):
        y = front + (back - front) * bay / bays
        for x in (-half_x, half_x):
            kit.block(module, (x, y, 0.0), (0.45, 0.45, 0.25), 'stone', bevel=0.04, wear=0.02, part=False)
            fittings.post(module, (x, y, 0.25), eave - 0.25, side=0.26)
            for out in (-1, 1) if 0 < bay < bays else ((1,) if bay == 0 else (-1,)):
                shapes.slab(module, (x, y + out * 0.38, eave - 0.42), (0.12, 0.75, 0.1), 'timber',
                            turn=(-out * 0.7, 0.0, 0.0))
        shapes.slab(module, (0.0, y, eave + 0.05), (half_x * 2 + 0.3, 0.2, 0.2), 'timber', bevel=0.01)
    for x in (-half_x, half_x):
        shapes.slab(module, (x, (front + back) / 2, eave + 0.05), (0.24, back - front + 0.3, 0.24), 'timber')
    shell.shingles(module, -half_x - 0.1, half_x + 0.1, front - 0.1, back + 0.1, eave + 0.17, ridge, along_y=True)
    # The slipway: ground ways on blocks falling toward the front, the keel blocks, the frame and its shores.
    for x in (-1.0, 1.0):
        for k in range(6):
            y = front + 0.6 + k * 1.6
            kit.block(module, (x, y, 0.0), (0.5, 0.5, 0.3 + k * 0.06), 'timber', bevel=0.02, wear=0.0, part=False)
        shapes.slab(module, (x, 0.6, 0.48), (0.24, 9.0, 0.16), 'timber', turn=(math.atan2(0.3, 8.0), 0.0, 0.0))
    for k in range(5):
        kit.block(module, (0.0, front + 1.5 + k * 1.8, 0.0), (0.6, 0.5, 0.55), 'timber', bevel=0.02, wear=0.0,
                  part=False)
    rib_cage(module, 0.55, front + 1.2, back - 1.2, 2.6, 1.9)
    module.part((-1.4, front + 1.0, 0.0), (1.4, back - 0.8, 2.5))
    for side in (-1, 1):
        for y in (front + 2.6, 1.2, back - 2.6):
            shapes.rod(module, (side * 2.1, y, 0.0), (side * 1.25, y, 1.6), 0.06, 'timber', sides=5)
    furnish.timber_stack(module, (-2.6, front - 0.6, 0.0), 1.8, layers=2, count=3, along_x=True, beam=0.16)
    for x in (2.1, 2.7):
        fittings.barrel(module, (x, front - 0.5, 0.0), radius=0.3, high=0.85)
    module.part((1.8, front - 0.8, 0.0), (3.0, front - 0.2, 0.85))
    stores_at(module, -5.4)
    shell.fits(module, 2, 3)


def crane(module, x, y):
    """A working crane on a stone base: its mast, a jib braced out from it toward -y, the rope over a sheave at the
    jib's head down to a hook with a bundle of iron slung on it, a windlass at the mast's foot."""
    kit.block(module, (x, y, 0.0), (1.4, 1.4, 0.5), 'stone', bevel=0.05, wear=0.03, cuts=1)
    fittings.post(module, (x, y, 0.5), 4.3, side=0.32)
    shapes.lathe(module, (x, y, 4.8), [(0.22, 0.0), (0.22, 0.15), (0.0, 0.3)], 'iron', sides=8)
    head = (x, y - 2.6, 4.6)
    shapes.rod(module, (x, y, 4.4), head, 0.12, 'timber', sides=6)
    shapes.rod(module, (x, y, 1.9), (x, y - 1.6, 4.4), 0.09, 'timber', sides=6)
    shapes.lathe(module, (head[0], head[1], head[2] - 0.2), [(0.0, 0.0), (0.18, 0.04), (0.18, 0.12), (0.0, 0.16)],
                 'iron', sides=10, turn=(0.0, math.pi / 2, 0.0))
    shapes.rod(module, (x, y - 0.2, 4.45), (head[0], head[1] + 0.15, head[2] + 0.02), 0.015, 'linen', sides=4)
    shapes.rod(module, (head[0], head[1], head[2] - 0.2), (head[0], head[1], 1.5), 0.02, 'linen', sides=4)
    shapes.ring(module, (head[0], head[1], 1.42), 0.09, 0.03, 'iron', turn=(0.0, math.pi / 2, 0.0), segments=8, sides=3)
    for bar in range(5):
        shapes.slab(module, (head[0] - 0.2 + bar * 0.1, head[1], 1.0), (0.06, 0.06, 0.8), 'iron')
    shapes.ring(module, (head[0], head[1], 1.2), 0.3, 0.03, 'linen', segments=10, sides=3)
    for side in (-1, 1):
        shapes.slab(module, (x + side * 0.4, y + 0.6, 1.2), (0.12, 0.12, 0.9), 'timber')
    shapes.lathe(module, (x - 0.35, y + 0.6, 1.5), [(0.18, 0.0), (0.18, 0.7)], 'timber', sides=10,
                 turn=(0.0, math.pi / 2, 0.0))
    shapes.slab(module, (x + 0.42, y + 0.6, 1.7), (0.04, 0.05, 0.45), 'iron')
    module.part((x - 0.7, y - 0.7, 0.0), (x + 0.7, y + 0.7, 5.1))


def rope_walk(module, x, south, north):
    """A rope walk along y: T-headed posts down its length carrying strands of yarn, a spinning wheel at its head and
    a finished rope coiled at its foot."""
    posts = 5
    for k in range(posts):
        y = south + (north - south) * k / (posts - 1)
        fittings.post(module, (x, y, 0.0), 1.1, side=0.1, part=False)
        shapes.slab(module, (x, y, 1.12), (0.7, 0.1, 0.06), 'timber')
        for peg in (-0.25, 0.0, 0.25):
            shapes.rod(module, (x + peg, y, 1.15), (x + peg, y, 1.25), 0.01, 'timber', sides=3)
    for strand in (-0.25, 0.0, 0.25):
        shapes.rod(module, (x + strand, south, 1.2), (x + strand, north, 1.2), 0.012, 'linen', sides=3)
    props.wheel(module, (x, north + 0.5, 0.7), 0.6)
    for side in (-1, 1):
        shapes.slab(module, (x, north + 0.5 + side * 0.15, 0.4), (0.1, 0.06, 0.8), 'timber')
    fittings.rope_coil(module, (x, south - 0.6, 0.0), radius=0.35, turns=5)
    module.part((x - 0.4, south - 0.95, 0.0), (x + 0.4, north + 0.7, 1.3))


def dock_works(module):
    # The shed runs along the yard's length, as the Dockyard II's does: its stone back wall on the west, short end
    # walls, its east side open on piers; the crane and the rope walk in the open east of it and before it.
    west, east, front, back, wall = -3.2, 0.6, -0.8, 5.2, 3.6
    shell.run(module, 'stone', (west, front), (west, back), wall)
    shell.run(module, 'stone', (west, back), (east, back), wall)
    shell.run(module, 'stone', (west, front), (west + 1.6, front), wall)
    for y in (front, 1.2, 3.2):
        kit.block(module, (east, y, 0.0), (0.6, 0.6, wall), 'stone', bevel=0.05, wear=0.03, cuts=1)
    shapes.slab(module, (east, (front + back) / 2, wall + 0.12), (0.3, back - front + 0.4, 0.26), 'timber', bevel=0.01)
    shell.shingles(module, west - 0.1, east + 0.2, front - 0.1, back + 0.1, wall + 0.25, wall + 2.4, along_y=True)
    # The forge for fittings under the shed's back wall, its chimney through the roof.
    kit.block(module, (-1.6, back - 0.9, 0.0), (1.8, 1.2, 0.8), 'stone', bevel=0.05, wear=0.03, cuts=1)
    kit.block(module, (-1.6, back - 1.0, 0.8), (1.2, 0.7, 0.06), 'glow', bevel=0.0, wear=0.0, part=False)
    for _ in range(8):
        shapes.ball(module, (-1.6 + module.draw(-0.5, 0.5), back - 1.0 + module.draw(-0.25, 0.25), 0.88),
                    module.draw(0.06, 0.1), 'black', detail=0)
    shapes.pyramid(module, (-1.6, back - 0.6, 2.0), 0.95, 0.65, 1.2, 'stone', eave=0.2, top=(0.4, 0.4))
    kit.block(module, (-1.6, back - 0.4, 3.2), (0.8, 0.8, 3.6), 'stone', bevel=0.04, wear=0.03, cuts=1)
    module.part((-2.5, back - 1.5, 2.0), (-0.7, back, 3.2))
    stall_weaponsmith.anvil(module, (-1.4, 2.4, 0.0), turn=0.2)
    for k in range(5):
        shapes.slab(module, (-0.2 + k * 0.12, back - 0.35, 1.2 + (k % 2) * 0.2), (0.08, 0.04, 0.5), 'iron')
    crane(module, -2.3, -2.4)
    rope_walk(module, 2.3, -4.6, 4.4)
    iron_pallet(module, (-0.2, -3.0, 0.0))
    for k in range(3):
        stall_tailor.bolt(module, (-2.65 + k * 0.42, 0.4, 0.2), 1.2, 0.2, 'linen', along_x=False)
    module.part((-2.9, -0.25, 0.0), (-1.6, 1.05, 0.4))
    stores_at(module, -5.4)
    shell.fits(module, 2, 3)
