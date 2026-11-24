"""What the outposts' structures are furnished with: a fire pit ringed with stones, braziers, a weapon rack, a trestle
table, an iron-bound strongbox, a balance with its pans, a ledger, stacked timber on chocks, flags, lanterns on posts
and bins of what an island gives. Each takes its place in the module's frame (x east, y north, z up, the front toward
-y) and adds its own part where a body would run into it.
"""
import math

import fittings
import kit
import props
import shapes
from outpost_kit import pole


def fire_pit(module, at, radius=0.75, tripod=True):
    """A fire in a ring of rough stones: logs laid crossed and burnt black, embers glowing among them, a flame, and a
    tripod of poles over it with a pot hung from its head."""
    x, y, z = at
    stones = max(9, round(math.tau * radius / 0.32))
    for stone in range(stones):
        angle = math.tau * stone / stones + module.draw(-0.08, 0.08)
        size = module.draw(0.22, 0.32)
        kit.rock(module, (x + math.cos(angle) * radius, y + math.sin(angle) * radius, z), (size, size * 0.85,
                 size * 0.7), stone * 1.7 + module.draw(0, 9), material='rubble', part=False, detail=2)
    shapes.lathe(module, at, [(radius * 0.85, 0.0), (radius * 0.85, 0.03), (0.0, 0.05)], 'black', sides=12)
    for log in range(5):
        angle = math.tau * log / 5 + 0.3
        reach = radius * 0.6
        shapes.rod(module, (x + math.cos(angle) * reach, y + math.sin(angle) * reach, z + 0.08),
                   (x - math.cos(angle) * reach * 0.2, y - math.sin(angle) * reach * 0.2, z + 0.22), 0.06,
                   'timber' if log % 2 else 'black', sides=6)
    for ember in range(8):
        angle = math.tau * ember / 8
        shapes.ball(module, (x + math.cos(angle) * radius * 0.3, y + math.sin(angle) * radius * 0.3, z + 0.08),
                    module.draw(0.06, 0.1), 'glow', detail=0)
    shapes.lathe(module, (x, y, z + 0.1), [(0.26, 0.0), (0.18, 0.25), (0.08, 0.5), (0.0, 0.7)], 'glow', sides=7)
    module.part((x - radius - 0.12, y - radius - 0.12, z), (x + radius + 0.12, y + radius + 0.12, z + 0.35))
    if not tripod:
        return
    head = (x, y, z + 1.7)
    for leg in range(3):
        angle = math.tau * leg / 3 + 0.5
        pole(module, (x + math.cos(angle) * (radius + 0.3), y + math.sin(angle) * (radius + 0.3), z),
             (head[0], head[1], head[2] + 0.12), 0.035)
    shapes.rod(module, head, (x, y, z + 0.95), 0.008, 'iron', sides=3)
    shapes.lathe(module, (x, y, z + 0.6), [(0.14, 0.0), (0.22, 0.12), (0.22, 0.3), (0.2, 0.34), (0.0, 0.34)], 'iron',
                 sides=12)
    shapes.ring(module, (x, y, z + 0.94), 0.2, 0.012, 'iron', turn=(math.pi / 2, 0.0, 0.0), segments=12, sides=3)


def brazier(module, at, high=1.0, bowl=0.38, foot=True):
    """A standing iron brazier on `at`: three legs splayed from a waisted stem, a ring of spikes round the bowl,
    coals and a flame; on a squared stone foot when `foot`."""
    x, y, z = at
    if foot:
        kit.block(module, at, (bowl * 2 + 0.3, bowl * 2 + 0.3, 0.3), 'stone', bevel=0.04, wear=0.02, part=False)
        z += 0.3
    for leg in range(3):
        angle = math.tau * leg / 3
        shapes.rod(module, (x + math.cos(angle) * bowl * 0.9, y + math.sin(angle) * bowl * 0.9, z),
                   (x, y, z + high * 0.45), 0.025, 'iron', sides=4)
    shapes.lathe(module, (x, y, z + high * 0.4), [(0.05, 0.0), (0.035, high * 0.3), (0.08, high * 0.55)], 'iron',
                 sides=6)
    top = z + high * 0.95
    shapes.lathe(module, (x, y, top - 0.3), [(0.08, 0.0), (bowl * 0.8, 0.14), (bowl, 0.3), (bowl * 1.04, 0.33),
                 (bowl * 0.95, 0.33)], 'iron', sides=12)
    for spike in range(8):
        angle = math.tau * spike / 8
        shapes.rod(module, (x + math.cos(angle) * bowl, y + math.sin(angle) * bowl, top), (x + math.cos(angle) *
                   bowl * 1.12, y + math.sin(angle) * bowl * 1.12, top + 0.14), 0.016, 'iron', sides=3,
                   end_radius=0.002)
    for coal in range(7):
        angle = math.tau * coal / 7
        shapes.ball(module, (x + math.cos(angle) * bowl * 0.5, y + math.sin(angle) * bowl * 0.5, top - 0.02),
                    bowl * 0.24, 'black' if coal % 2 else 'glow', detail=0)
    # The flame in three tongues of unlike heights, the lesser two leaning out from the middle, so it reads as fire
    # and not as one smooth cone.
    for tongue, (out, lean, tall) in enumerate(((0.0, 0.0, 0.75), (0.25, 0.28, 0.55), (0.25, 0.28, 0.45))):
        angle = math.tau * tongue / 3 + 0.5
        east, north = math.cos(angle), math.sin(angle)
        shapes.lathe(module, (x + east * bowl * out, y + north * bowl * out, top - 0.04),
                     [(bowl * 0.4, 0.0), (bowl * 0.28, tall * 0.33), (bowl * 0.1, tall * 0.73), (0.0, tall)], 'glow',
                     sides=6, turn=(-north * lean, east * lean, 0.0))
    module.part((x - bowl, y - bowl, at[2]), (x + bowl, y + bowl, top + 0.1))


def trestle(module, at, length, deep, high=0.85, material='timber', turned=False):
    """A table on `at`: a top of three boards on two splayed trestles braced along, or on four turned legs under a
    moulded apron when `turned`; a part. Returns its top's height."""
    x, y, z = at
    top = z + high
    for board in range(3):
        shapes.slab(module, (x, y - deep / 3 + board * deep / 3, top - 0.03), (length, deep / 3 - 0.012, 0.06),
                    material, bevel=0.008)
    if turned:
        for east_west in (-1, 1):
            for north_south in (-1, 1):
                shapes.lathe(module, (x + east_west * (length / 2 - 0.12), y + north_south * (deep / 2 - 0.1), z),
                             [(0.07, 0.0), (0.05, 0.08), (0.06, high * 0.3), (0.035, high * 0.45), (0.06, high * 0.6),
                              (0.045, high - 0.16), (0.06, high - 0.06)], material, sides=8)
        for north_south in (-1, 1):
            shapes.slab(module, (x, y + north_south * (deep / 2 - 0.1), top - 0.14), (length - 0.2, 0.05, 0.16),
                        material)
        for east_west in (-1, 1):
            shapes.slab(module, (x + east_west * (length / 2 - 0.12), y, top - 0.14), (0.05, deep - 0.2, 0.16),
                        material)
    else:
        for east_west in (-1, 1):
            leg_x = x + east_west * (length / 2 - 0.25)
            for north_south in (-1, 1):
                shapes.rod(module, (leg_x, y + north_south * (deep / 2 - 0.05), z),
                           (leg_x, y + north_south * 0.08, top - 0.08), 0.035,
                           material, sides=5)
            shapes.slab(module, (leg_x, y, top - 0.1), (0.09, deep - 0.1, 0.08), material)
        shapes.slab(module, (x, y, z + high * 0.35), (length - 0.5, 0.06, 0.08), material)
    module.part((x - length / 2, y - deep / 2, z), (x + length / 2, y + deep / 2, top))
    return top


def strongbox(module, at, size=(0.8, 0.5, 0.48), turn=0.0, metal='iron'):
    """An iron-bound strongbox on `at`: a box of thick boards, iron straps over its lid and down its sides, iron
    corners, a hasp with a great padlock at its front, a ring handle at each end."""
    wide, deep, high = size
    with shapes.frame(module, at, 0):
        kit.block(module, (0.0, 0.0, 0.0), (wide, deep, high * 0.78), 'timber', turn=turn, bevel=0.015, wear=0.0,
                  part=False)
        kit.block(module, (0.0, 0.0, high * 0.78), (wide + 0.02, deep + 0.02, high * 0.22), 'timber', turn=turn,
                  bevel=0.02, wear=0.0, part=False)
    cos, sin = math.cos(turn), math.sin(turn)

    def placed(local_x, local_y, local_z):
        return (at[0] + local_x * cos - local_y * sin, at[1] + local_x * sin + local_y * cos, at[2] + local_z)

    for share in (-0.34, 0.0, 0.34):
        shapes.slab(module, placed(wide * share, 0.0, high + 0.005), (0.07, deep + 0.04, 0.012), metal,
                    turn=(0.0, 0.0, turn))
        for side in (-1, 1):
            shapes.slab(module, placed(wide * share, side * (deep / 2 + 0.012), high / 2), (0.07, 0.012, high),
                        metal, turn=(0.0, 0.0, turn))
    for east_west in (-1, 1):
        for north_south in (-1, 1):
            shapes.slab(module, placed(east_west * (wide / 2 - 0.03), north_south * (deep / 2 - 0.03), high / 2),
                        (0.09, 0.09, high + 0.03), metal, turn=(0.0, 0.0, turn))
        shapes.ring(module, placed(east_west * (wide / 2 + 0.04), 0.0, high * 0.6), 0.06, 0.016, 'iron',
                    turn=(0.0, math.pi / 2, turn), segments=8, sides=3)
    shapes.slab(module, placed(0.0, -deep / 2 - 0.02, high * 0.78), (0.08, 0.02, 0.2), 'iron', turn=(0.0, 0.0, turn))
    shapes.slab(module, placed(0.0, -deep / 2 - 0.05, high * 0.6), (0.14, 0.05, 0.13), 'iron', bevel=0.01,
                turn=(0.0, 0.0, turn))
    shapes.ring(module, placed(0.0, -deep / 2 - 0.05, high * 0.7), 0.045, 0.015, 'iron', turn=(math.pi / 2, 0.0, turn),
                segments=8, sides=3)
    shapes.slab(module, placed(0.0, -deep / 2 - 0.078, high * 0.6), (0.03, 0.006, 0.05), 'gold', turn=(0.0, 0.0, turn))


def balance(module, at, metal='iron', reach=0.32):
    """A balance standing on `at`: a turned post on a foot, a beam across its head with a pointer, and a pan hung
    from each end by three cords, one pan lower with its weights."""
    x, y, z = at
    shapes.lathe(module, at, [(0.12, 0.0), (0.12, 0.03), (0.04, 0.05), (0.02, 0.5), (0.035, 0.53), (0.0, 0.55)],
                 metal, sides=10)
    head = z + 0.53
    shapes.slab(module, (x, y, head), (reach * 2 + 0.04, 0.02, 0.025), metal)
    shapes.cutout(module, [(-0.015, 0.0), (0.015, 0.0), (0.0, 0.12)], 0.01, metal, (x, y - 0.012, head))
    for side, drop in ((-1, 0.3), (1, 0.36)):
        pan = (x + side * reach, y, head - drop)
        for cord in range(3):
            angle = math.tau * cord / 3
            shapes.rod(module, (pan[0], pan[1], head), (pan[0] + math.cos(angle) * 0.09, pan[1] + math.sin(angle) *
                       0.09, pan[2] + 0.03), 0.003, metal, sides=3)
        shapes.lathe(module, pan, [(0.03, 0.0), (0.1, 0.02), (0.11, 0.035)], metal, sides=10)
    for weight in range(3):
        shapes.lathe(module, (x + reach - 0.03 + weight * 0.03, y, head - 0.36 + 0.02), [(0.018, 0.0), (0.018, 0.03),
                     (0.008, 0.04), (0.0, 0.045)], metal, sides=6)


def ledger(module, at, turn=0.0, cover='crimson'):
    """A ledger lying open on `at`: its two boards and the leaves between, a ribbon, an inkpot and a quill by it."""
    x, y, z = at
    for side in (-1, 1):
        shapes.slab(module, (x + side * 0.16 * math.cos(turn), y + side * 0.16 * math.sin(turn), z + 0.008),
                    (0.32, 0.42, 0.016), cover, turn=(0.0, -side * 0.06, turn))
        shapes.slab(module, (x + side * 0.15 * math.cos(turn), y + side * 0.15 * math.sin(turn), z + 0.03),
                    (0.29, 0.39, 0.03), 'linen', turn=(0.0, -side * 0.06, turn))
    shapes.slab(module, (x, y - 0.12, z + 0.04), (0.012, 0.3, 0.004), 'crimson', turn=(0.0, 0.0, turn))
    ink = (x + 0.42 * math.cos(turn), y + 0.42 * math.sin(turn), z)
    shapes.lathe(module, ink, [(0.04, 0.0), (0.045, 0.05), (0.02, 0.07), (0.022, 0.08), (0.0, 0.08)], 'black', sides=8)
    shapes.rod(module, (ink[0], ink[1], ink[2] + 0.05), (ink[0] + 0.04, ink[1] + 0.06, ink[2] + 0.26), 0.012, 'linen',
               sides=4, end_radius=0.003)


def timber_stack(module, at, length, layers=4, count=5, along_x=True, beam=0.22):
    """Sawn timber stacked to season on `at`: beams laid in layers on chocks, each layer on cross sticks so air
    reaches it, a wedge at each end of the bottom layer; a part."""
    x, y, z = at
    width = count * (beam + 0.04)

    def size(long, across, tall):
        return (long, across, tall) if along_x else (across, long, tall)

    def spot(along, across, up):
        return (x + along, y + across, z + up) if along_x else (x + across, y + along, z + up)

    for chock in (-0.4, 0.0, 0.4):
        shapes.slab(module, spot(chock * length, 0.0, 0.08), size(0.2, width + 0.2, 0.16), 'timber', bevel=0.01)
    height = 0.16
    for layer in range(layers):
        for piece in range(count - layer % 2):
            across = -width / 2 + (beam + 0.04) * (piece + 0.5 + (layer % 2) * 0.5)
            long = length * module.draw(0.92, 1.0)
            shapes.slab(module, spot(module.draw(-0.05, 0.05), across, height + beam / 2),
                        size(long, beam * module.draw(0.95, 1.05), beam), 'timber', bevel=0.01)
        height += beam
        if layer < layers - 1:
            for stick in (-0.42, 0.0, 0.42):
                shapes.slab(module, spot(stick * length, 0.0, height + 0.02), size(0.05, width, 0.04), 'timber')
            height += 0.04
    for end in (-1, 1):
        shapes.slab(module, spot(-0.4 * length, end * (width / 2 + 0.05), 0.2), size(0.12, 0.1, 0.1), 'timber',
                    turn=(0.0, 0.0, 0.0))
    low = spot(-length / 2, -width / 2 - 0.1, 0.0)
    high = spot(length / 2, width / 2 + 0.1, height)
    module.part((min(low[0], high[0]), min(low[1], high[1]), z),
                (max(low[0], high[0]), max(low[1], high[1]), height + z))
    return height + z


def flag(module, foot, high, cloth, trim='linen', finial='gold', radius=0.04):
    """A flagstaff on `foot`, a gilt ball at its head and a swallowtailed pennant flying from it toward +x."""
    x, y, z = foot
    shapes.rod(module, foot, (x, y, z + high), radius, 'timber', sides=6, end_radius=radius * 0.7)
    shapes.ball(module, (x, y, z + high + 0.05), radius * 1.5, finial, detail=1)
    shapes.cutout(module, [(0.0, 0.0), (1.4, -0.12), (1.0, -0.32), (1.4, -0.52), (0.0, -0.64)], 0.015, cloth,
                  (x + radius, y, z + high - 0.08))
    shapes.cutout(module, [(0.0, -0.26), (1.0, -0.3), (0.0, -0.38)], 0.02, trim, (x + radius, y, z + high - 0.08))


def lantern_post(module, at, high=2.2, side=0.12):
    """A lantern on a post: a squared post, an arm out of its head toward -y, the lantern hung from it."""
    x, y, z = at
    fittings.post(module, at, high, side=side, part=False)
    shapes.slab(module, (x, y - 0.25, z + high - 0.1), (0.07, 0.6, 0.07), 'timber')
    shapes.rod(module, (x, y, z + high - 0.45), (x, y - 0.35, z + high - 0.12), 0.02, 'timber', sides=4)
    fittings.lantern(module, (x, y - 0.5, z + high - 0.62), size=0.24, hung_from=z + high - 0.12)


def heaped_bin(module, at, size, fill='rubble', boards='timber'):
    """A bin of boards on `at`, open at its top and heaped with `fill` (ore, grain, roots); a part."""
    wide, deep, high = size
    x, y, z = at
    for side in (-1, 1):
        shapes.slab(module, (x, y + side * (deep / 2 - 0.02), z + high / 2), (wide, 0.04, high), boards)
        shapes.slab(module, (x + side * (wide / 2 - 0.02), y, z + high / 2), (0.04, deep, high), boards)
        for east_west in (-1, 1):
            shapes.slab(module, (x + east_west * (wide / 2 - 0.03), y + side * (deep / 2 - 0.03), z + high / 2 + 0.02),
                        (0.07, 0.07, high + 0.04), boards)
    for band in (0.12, high - 0.1):
        for side in (-1, 1):
            shapes.slab(module, (x, y + side * (deep / 2 + 0.005), z + band), (wide + 0.02, 0.01, 0.05), 'iron')
    shapes.ball(module, (x, y, z + high * 0.8), 0.5, fill, detail=2, scale=(wide * 0.92, deep * 0.92, 0.5))
    module.part((x - wide / 2, y - deep / 2, z), (x + wide / 2, y + deep / 2, z + high))


def weapon_rack(module, at, quarter=0, length=1.8):
    """A rack of arms on `at`, turned `quarter`: two posts on feet, a rail at the foot and a notched rail at the
    shoulder, spears and a halberd stood in it, two swords hung from its top and a round shield leant at its end."""
    with shapes.frame(module, at, quarter):
        for side in (-1, 1):
            fittings.post(module, (side * length / 2, 0.0, 0.0), 1.6, side=0.1, part=False)
            shapes.slab(module, (side * length / 2, 0.0, 0.04), (0.14, 0.7, 0.08), 'timber')
        for z, deep in ((0.22, 0.24), (1.25, 0.12), (1.55, 0.1)):
            shapes.slab(module, (0.0, 0.0, z), (length + 0.1, deep, 0.08), 'timber', bevel=0.01)
        arms = 6
        for arm in range(arms):
            arm_x = -length / 2 + 0.2 + arm * (length - 0.4) / (arms - 1)
            fittings.polearm(module, (arm_x, 0.0, 0.26), high=2.0 + 0.15 * (arm % 2),
                             head='spear' if arm % 3 else 'halberd')
        for side in (-0.3, 0.3):
            fittings.sword(module, (side, -0.09, 0.45), length=1.0)
        fittings.round_shield(module, (length / 2 + 0.2, -0.2, 0.42), radius=0.38, face='crimson', facing=-1.0)
        module.part((-length / 2 - 0.1, -0.35, 0.0), (length / 2 + 0.45, 0.35, 1.6))


def tool_rack(module, at, quarter=0, length=1.6):
    """A rack of field tools on `at`, turned `quarter`: a rail on two posts, picks and mattocks stood head up against
    it, sickles hung from pegs, a shovel and a rake."""
    with shapes.frame(module, at, quarter):
        for side in (-1, 1):
            fittings.post(module, (side * length / 2, 0.0, 0.0), 1.5, side=0.1, part=False)
        shapes.slab(module, (0.0, 0.0, 1.35), (length + 0.1, 0.08, 0.1), 'timber', bevel=0.01)
        shapes.slab(module, (0.0, 0.0, 0.3), (length + 0.1, 0.06, 0.08), 'timber')
        for tool in range(4):
            tool_x = -length / 2 + 0.25 + tool * 0.3
            shapes.rod(module, (tool_x, -0.1, 0.0), (tool_x, -0.1, 1.15), 0.02, 'timber', sides=5)
            pick = [(-0.38, 0.03), (-0.05, 0.05), (0.0, 0.08), (0.05, 0.05), (0.3, 0.0), (0.05, -0.03), (-0.05, -0.03)]
            shapes.cutout(module, pick if tool % 2 else [(x * 0.8, z * 1.6) for x, z in pick], 0.04, 'iron',
                          (tool_x, -0.1, 1.17))
        for peg in range(3):
            peg_x = length / 2 - 0.25 - peg * 0.22
            shapes.rod(module, (peg_x, 0.0, 1.32), (peg_x, -0.12, 1.32), 0.012, 'timber', sides=4)
            outline = [(math.cos(a) * 0.17, -0.05 - math.sin(a) * 0.17) for a in (0.0, 0.6, 1.2, 1.8, 2.4)]
            outline += [(math.cos(a) * 0.13, -0.03 - math.sin(a) * 0.12) for a in (2.3, 1.7, 1.1, 0.5, 0.1)]
            shapes.cutout(module, outline, 0.01, 'iron', (peg_x - 0.02, -0.11, 1.22))
            shapes.rod(module, (peg_x + 0.16, -0.11, 1.2), (peg_x + 0.16, -0.11, 0.98), 0.016, 'timber', sides=4)
        shapes.rod(module, (length / 2 + 0.2, -0.1, 0.0), (length / 2 + 0.2, -0.1, 1.4), 0.02, 'timber', sides=5)
        shapes.slab(module, (length / 2 + 0.2, -0.1, 0.12), (0.24, 0.03, 0.3), 'iron')
        module.part((-length / 2 - 0.1, -0.25, 0.0), (length / 2 + 0.35, 0.1, 1.5))


def handcart(module, at, quarter=0, load='rubble'):
    """A handcart on `at`, turned `quarter`: its bed on two spoked wheels, its handles down on a prop, side boards,
    and heaped with `load`; a part."""
    with shapes.frame(module, at, quarter):
        bed = 0.7
        kit.block(module, (0.0, 0.0, bed), (1.6, 1.0, 0.06), 'timber', bevel=0.01, wear=0.0, part=False)
        for side in (-1, 1):
            shapes.slab(module, (0.0, side * 0.48, bed + 0.2), (1.6, 0.04, 0.34), 'timber')
            shapes.slab(module, (side * 0.78, 0.0, bed + 0.2), (0.04, 0.96, 0.34), 'timber')
            props.wheel(module, (0.15, side * 0.62, 0.48), 0.48)
            shapes.rod(module, (-0.8, side * 0.35, bed), (-1.6, side * 0.4, 0.65), 0.035, 'timber', sides=5)
        shapes.rod(module, (0.15, -0.72, 0.48), (0.15, 0.72, 0.48), 0.04, 'iron', sides=6)
        shapes.slab(module, (0.7, 0.0, bed / 2), (0.07, 0.07, bed), 'timber')
        shapes.ball(module, (0.0, 0.0, bed + 0.3), 0.5, load, detail=2, scale=(1.4, 0.85, 0.55))
        module.part((-0.8, -0.7, 0.0), (0.8, 0.7, bed + 0.5))
