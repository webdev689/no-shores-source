"""Three of the outpost's works, each on 2 x 2 cells (8 m), its front toward -y and its `use` where a member stands
to work it. The Counting House (`outpost-counting-1` to `-3`): a canvas lean-to over a strongbox on a trestle, a
boarded counting shed with a counter window, a stone house with a barred window, an iron door and a gilt coin sign.
The War Table (`outpost-war-table-1` to `-3`): a map table under a canvas awning, an open pavilion under shingles, a
stone-pillared pavilion with braziers and an inlaid table. The Assay House (`outpost-assay-1` to `-3`): a crucible on
a hearth under an awning, a boarded smithy with its chimney and quench trough, a stone assay house with a tall chimney.
"""
import math

import fittings
import kit
import outpost_kit as shell
import outpost_props as furnish
import shapes
import stall_vault
import stall_weaponsmith
import war_table


def use_at(module, x, y):
    module.socket('use', (x, y, 0.0), (0, -1))


def coin_sacks(module, at):
    """Small sacks of coin tied at the neck, one slumped open with gold spilt at its mouth."""
    x, y, z = at
    for k, (along, across) in enumerate(((0.0, 0.0), (0.22, 0.08), (0.1, -0.18))):
        fittings.sack(module, (x + along, y + across, z), size=0.26 + 0.03 * (k % 2), material='canvas')
    for piece in range(6):
        shapes.lathe(module, (x - 0.2 + piece * 0.04, y - 0.25 + (piece % 2) * 0.05, z + piece % 3 * 0.012),
                     [(0.025, 0.0), (0.025, 0.008), (0.0, 0.008)], 'gold', sides=8)


def counting_camp(module):
    shell.fly(module, -2.0, 2.0, -1.2, 1.6, 2.5, 1.95, out=0.5)
    top = furnish.trestle(module, (0.0, 0.3, 0.0), 2.0, 0.8)
    furnish.strongbox(module, (0.45, 0.4, top))
    furnish.balance(module, (-0.55, 0.45, top))
    furnish.ledger(module, (-0.1, 0.15, top), turn=0.15)
    coin_sacks(module, (1.3, -0.1, top))
    shapes.lathe(module, (0.0, 1.2, 0.0), [(0.2, 0.0), (0.05, 0.03), (0.05, 0.45), (0.18, 0.47), (0.18, 0.52),
                 (0.0, 0.52)], 'timber', sides=8)
    fittings.crate(module, (-1.4, 1.1, 0.0), (0.7, 0.6, 0.55), turn=0.08)
    fittings.crate(module, (1.5, 1.15, 0.0), (0.6, 0.55, 0.5), turn=-0.1)
    module.part((-1.8, 0.75, 0.0), (-1.0, 1.45, 0.6))
    module.part((1.15, 0.85, 0.0), (1.85, 1.45, 0.55))
    furnish.lantern_post(module, (2.7, -1.0, 0.0))
    use_at(module, 0.45, -0.5)
    shell.fits(module, 2, 2)


def counting_shed(module):
    west, east, front, back, sill, wall = -2.4, 2.4, -1.4, 2.0, 0.3, 2.6
    kit.block(module, (0.0, (front + back) / 2, 0.0), (east - west + 0.3, back - front + 0.3, sill), 'stone',
              bevel=0.04, wear=0.03, cuts=1)
    # The front wall round its counter window, the east wall round its door.
    shell.walls(module, 'boards', west, east, front, back, wall, sill, front_gaps=((1.4, 3.4, 1.85, 0.65),),
                east_gaps=((1.4, 2.4, 2.0),))
    shell.door(module, (east + 0.12, 1.9 + front, sill), 1, 0.96, 2.0)
    for x in (west, east):
        for y in (front, back):
            fittings.post(module, (x, y, 0.0), sill + wall, side=0.26)
    # The counter window: its ledge, the upper shutter propped out as a hood, the lower one let down under the ledge.
    ledge = sill + 0.65
    shapes.slab(module, (0.0, front - 0.25, ledge + 0.03), (2.2, 0.6, 0.06), 'timber', bevel=0.01)
    for x in (-0.9, 0.9):
        shapes.slab(module, (x, front - 0.4, ledge - 0.2), (0.06, 0.06, 0.4), 'timber', turn=(0.6, 0.0, 0.0))
    shapes.slab(module, (0.0, front - 0.45, sill + 1.95), (2.1, 0.95, 0.05), 'timber', turn=(-0.55, 0.0, 0.0))
    for x in (-0.95, 0.95):
        shapes.rod(module, (x, front - 0.12, ledge + 0.06), (x, front - 0.82, sill + 1.72), 0.025, 'timber', sides=4)
    shapes.slab(module, (0.0, front - 0.14, sill + 0.35), (2.0, 0.05, 0.55), 'timber')
    inside = front + 0.45
    shapes.slab(module, (0.0, inside, ledge + 0.03), (2.2, 0.7, 0.06), 'timber')
    furnish.strongbox(module, (0.2, inside + 0.05, ledge + 0.06), size=(0.7, 0.45, 0.42))
    furnish.ledger(module, (-0.55, front - 0.25, ledge + 0.06), turn=-0.1)
    furnish.balance(module, (0.75, front - 0.2, ledge + 0.06), reach=0.25)
    shell.shingles(module, west - 0.1, east + 0.1, front - 0.1, back + 0.1, sill + wall, sill + wall + 1.5)
    for x, y in ((-3.0, -0.4), (-3.0, 0.4)):
        fittings.barrel(module, (x, y, 0.0), radius=0.3, high=0.85)
    module.part((-3.3, -0.7, 0.0), (-2.7, 0.7, 0.85))
    furnish.lantern_post(module, (2.9, -1.7, 0.0), high=2.3)
    use_at(module, 0.2, front - 0.85)
    shell.fits(module, 2, 2)


def coin(module, middle, radius, facing):
    """A gilt coin laid flat on a sign's face toward `facing` (+x or -x): its rim and a crown struck on it."""
    turn = (0.0, facing * math.pi / 2, 0.0)
    shapes.lathe(module, middle, [(radius, 0.0), (radius, 0.03), (radius * 0.85, 0.035), (0.0, 0.035)], 'gold',
                 sides=16, turn=turn, smooth=False)
    shapes.cutout(module, [(-0.12, -0.08), (0.12, -0.08), (0.14, 0.1), (0.07, 0.02), (0.0, 0.12), (-0.07, 0.02),
                           (-0.14, 0.1)], 0.02, 'gold', (middle[0] + facing * 0.04, middle[1], middle[2]),
                  turn=(0.0, 0.0, math.pi / 2))


def counting_house(module):
    west, east, front, back, wall = -2.5, 2.5, -1.5, 2.2, 3.0
    shell.walls(module, 'stone', west, east, front, back, wall, front_gaps=((0.9, 2.3, 2.2, 1.0), (3.25, 4.35, 2.3)))
    stall_vault.grille(module, -1.6, -0.2, front - 0.1, 1.0, 2.2)
    shell.door(module, (1.3, front, 0.0), 0, 1.06, 2.3, kind='iron')
    kit.block(module, (1.3, front - 0.45, 0.0), (1.4, 0.4, 0.12), 'trim', bevel=0.02, wear=0.0, part=False)
    # Behind the bars: the strongbox on its shelf, the ledger by it.
    shapes.slab(module, (-0.9, front + 0.6, 1.0), (1.4, 0.6, 0.06), 'timber')
    furnish.strongbox(module, (-0.9, front + 0.62, 1.03), size=(0.8, 0.45, 0.45), metal='gold')
    shapes.slab(module, (-0.9, front + 1.0, 1.65), (1.6, 0.04, 1.4), 'black')
    # The roof, hipped, with a gilt finial; the coin sign hung out from the west corner.
    shell.shingles(module, west - 0.1, east + 0.1, front - 0.1, back + 0.1, wall + 0.18, wall + 1.9, ends='stone')
    for x in (west - 0.1, east + 0.1):
        shapes.lathe(module, (x, (front + back) / 2, wall + 2.05), [(0.08, 0.0), (0.12, 0.1), (0.0, 0.42)], 'gold',
                     sides=8)
    board = fittings.sign(module, (west + 0.5, front - 0.32, 2.3), board='black', size=0.8)
    for facing in (-1, 1):
        coin(module, (board[0] + facing * 0.03, board[1], board[2]), 0.28, facing)
    for x in (west + 0.3, east - 0.3):
        shell.slit(module, (x, back + 0.33, 1.7), 2)
    furnish.brazier(module, (2.95, -2.4, 0.0), high=0.9, bowl=0.3)
    use_at(module, -0.9, front - 0.7)
    shell.fits(module, 2, 2)


def chart(module, middle, size, top, stones='rubble'):
    """A chart spread on a table, its routes inked, held flat by a stone at each corner and markers stood on it."""
    x, y = middle
    shapes.slab(module, (x, y, top + 0.004), (size[0], size[1], 0.006), 'linen', turn=(0.0, 0.0, 0.03))
    for _ in range(4):
        shapes.slab(module, (x + module.draw(-0.3, 0.3) * size[0], y + module.draw(-0.3, 0.3) * size[1], top + 0.009),
                    (module.draw(0.2, 0.45) * size[0], 0.012, 0.002), 'crimson', turn=(0.0, 0.0, module.draw(-1, 1)))
    for east_west in (-1, 1):
        for north_south in (-1, 1):
            kit.rock(module, (x + east_west * (size[0] / 2 - 0.06), y + north_south * (size[1] / 2 - 0.06), top),
                     (0.11, 0.09, 0.07), east_west * 3 + north_south, material=stones, part=False, detail=1)
    for piece in range(6):
        war_table.marker(module, (x + module.draw(-0.35, 0.35) * size[0], y + module.draw(-0.3, 0.3) * size[1],
                                  top + 0.01), ('gold', 'iron', 'crimson')[piece % 3], piece % 3)


def stools(module, spots):
    for x, y in spots:
        shapes.lathe(module, (x, y, 0.0), [(0.2, 0.0), (0.06, 0.04), (0.06, 0.42), (0.19, 0.44), (0.19, 0.48),
                     (0.0, 0.48)], 'timber', sides=8)


def war_table_camp(module):
    shell.fly(module, -1.9, 1.9, -1.5, 1.5, 2.45, 2.25, out=0.55, sag=0.12)
    top = furnish.trestle(module, (0.0, 0.0, 0.0), 2.4, 1.3)
    chart(module, (0.0, 0.05), (1.7, 1.0), top)
    fittings.scrolls(module, (0.95, 0.4, top), 3, length=0.4, along_x=False)
    stools(module, ((-0.7, 1.0), (0.7, 1.0), (-1.55, 0.0)))
    fittings.crate(module, (1.45, 1.05, 0.0), (0.6, 0.5, 0.5), turn=0.1)
    module.part((1.1, 0.75, 0.0), (1.8, 1.35, 0.5))
    fittings.scrolls(module, (1.45, 1.05, 0.5), 5, length=0.45)
    use_at(module, 0.0, -1.0)
    shell.fits(module, 2, 2)


def pavilion_post(module, x, y, high, beam_x, beam_y):
    """A pavilion's corner post on a stone pad, its knee braces out under the beams along x and y."""
    kit.block(module, (x, y, 0.0), (0.5, 0.5, 0.2), 'stone', bevel=0.04, wear=0.02, part=False)
    fittings.post(module, (x, y, 0.2), high - 0.2, side=0.26)
    shapes.slab(module, (x + beam_x * 0.38, y, high - 0.42), (0.75, 0.12, 0.1), 'timber',
                turn=(0.0, beam_x * 0.7, 0.0))
    shapes.slab(module, (x, y + beam_y * 0.38, high - 0.42), (0.12, 0.75, 0.1), 'timber',
                turn=(-beam_y * 0.7, 0.0, 0.0))


def standards_rack(module, x, y, cloths):
    """A rack of company standards behind the table: a rail on two posts, each standard's pole stood in it, a small
    banner on a crossbar near its head."""
    span = 0.5 * (len(cloths) - 1)
    for side in (-1, 1):
        fittings.post(module, (x + side * (span / 2 + 0.3), y, 0.0), 1.1, side=0.1, part=False)
    shapes.slab(module, (x, y, 1.0), (span + 0.7, 0.12, 0.08), 'timber')
    for k, cloth in enumerate(cloths):
        pole_x = x - span / 2 + k * 0.5
        shapes.rod(module, (pole_x, y, 0.0), (pole_x, y, 2.9), 0.025, 'timber', sides=6)
        shapes.lathe(module, (pole_x, y, 2.9), [(0.035, 0.0), (0.05, 0.05), (0.0, 0.2)], 'iron', sides=6)
        shapes.banner(module, (pole_x, y - 0.04, 2.72), 0.4, 0.75, cloth, trim='linen')
    module.part((x - span / 2 - 0.35, y - 0.15, 0.0), (x + span / 2 + 0.35, y + 0.15, 1.1))


def war_table_pavilion(module):
    half_x, half_y, eave = 2.3, 1.9, 2.8
    for x in (-half_x, half_x):
        for y in (-half_y, half_y):
            pavilion_post(module, x, y, eave, -1 if x > 0 else 1, -1 if y > 0 else 1)
    for y in (-half_y, half_y):
        shapes.slab(module, (0.0, y, eave + 0.1), (half_x * 2 + 0.4, 0.24, 0.24), 'timber', bevel=0.01)
    for x in (-half_x, half_x):
        shapes.slab(module, (x, 0.0, eave + 0.1), (0.24, half_y * 2 + 0.4, 0.24), 'timber', bevel=0.01)
    shell.shingles(module, -half_x - 0.1, half_x + 0.1, -half_y - 0.1, half_y + 0.1, eave + 0.22, eave + 1.9)
    fittings.floor(module, -half_x + 0.2, -half_y + 0.2, half_x - 0.2, half_y - 0.2, high=0.08)
    top = furnish.trestle(module, (0.0, -0.1, 0.08), 2.4, 1.3, turned=True)
    chart(module, (0.0, -0.05), (1.8, 1.0), top, stones='iron')
    for side in (-1, 1):
        shapes.cutout(module, [(-0.15, 0.0), (0.15, 0.0), (0.1, -0.12), (0.0, -0.16), (-0.1, -0.12)], 0.03, 'timber',
                      (side * 0.6, -0.1 - 0.67, top - 0.06))
    standards_rack(module, 0.0, 1.35, ('crimson', 'linen', 'black', 'verdant'))
    stools(module, ((-1.6, -0.1), (1.6, -0.1)))
    use_at(module, 0.0, -1.1)
    shell.fits(module, 2, 2)


def war_table_stone(module):
    half_x, half_y, high = 2.4, 2.0, 3.0
    kit.block(module, (0.0, 0.0, 0.0), (half_x * 2 + 0.8, half_y * 2 + 0.8, 0.3), 'stone', bevel=0.05, wear=0.03,
              cuts=1)
    fittings.floor(module, -half_x - 0.2, -half_y - 0.2, half_x + 0.2, half_y + 0.2, high=0.3)
    kit.block(module, (0.0, -half_y - 0.62, 0.0), (2.2, 0.3, 0.15), 'stone', bevel=0.03, wear=0.02)
    for x in (-half_x, half_x):
        for y in (-half_y, half_y):
            kit.block(module, (x, y, 0.3), (0.6, 0.6, 0.25), 'trim', bevel=0.03, wear=0.01, part=False)
            kit.column(module, (x, y, 0.55), 0.22, high - 0.55, 'stone', top=0.88)
            kit.block(module, (x, y, high), (0.6, 0.6, 0.22), 'trim', bevel=0.03, wear=0.01, part=False)
    for y in (-half_y, half_y):
        shapes.slab(module, (0.0, y, high + 0.37), (half_x * 2 + 0.6, 0.34, 0.3), 'timber', bevel=0.02)
    for x in (-half_x, half_x):
        shapes.slab(module, (x, 0.0, high + 0.37), (0.34, half_y * 2 + 0.6, 0.3), 'timber', bevel=0.02)
    # Its gables to the front and back, each a stone pediment with a gilt sun on it and a finial over it.
    shell.shingles(module, -half_x - 0.15, half_x + 0.15, -half_y - 0.15, half_y + 0.15, high + 0.52, high + 2.4,
                   along_y=True, material='timber', ends='trim')
    for y, out in ((-half_y - 0.15, -1), (half_y + 0.15, 1)):
        shapes.lathe(module, (0.0, y + out * 0.1, high + 1.2), [(0.38, 0.0), (0.38, 0.04), (0.2, 0.07), (0.0, 0.08)],
                     'gold', sides=16, turn=(-out * math.pi / 2, 0.0, 0.0), smooth=False)
        shapes.lathe(module, (0.0, y, high + 2.55), [(0.07, 0.0), (0.1, 0.1), (0.0, 0.4)], 'gold', sides=8)
    # The inlaid table: a gilt border and a compass star let into its top, the chart over half of it.
    top = furnish.trestle(module, (0.0, 0.0, 0.3), 2.6, 1.4, turned=True)
    for y in (-0.62, 0.62):
        shapes.slab(module, (0.0, y, top + 0.002), (2.45, 0.035, 0.004), 'gold')
    for x in (-1.22, 1.22):
        shapes.slab(module, (x, 0.0, top + 0.002), (0.035, 1.27, 0.004), 'gold')
    star = [((0.3 if k % 2 == 0 else 0.08) * math.sin(math.pi * k / 4), (0.3 if k % 2 == 0 else 0.08) *
             math.cos(math.pi * k / 4)) for k in range(8)]
    shapes.cutout(module, star, 0.004, 'gold', (0.75, 0.0, top + 0.002), turn=(math.pi / 2, 0.0, 0.0))
    shapes.ring(module, (0.75, 0.0, top + 0.003), 0.34, 0.02, 'gold', segments=16, sides=3)
    chart(module, (-0.45, 0.05), (1.2, 0.95), top, stones='gold')
    for x in (-half_x, half_x):
        furnish.brazier(module, (x + (0.55 if x < 0 else -0.55), -half_y + 0.05, 0.3), high=1.0, bowl=0.3,
                        foot=False)
    standards_rack(module, 0.0, 1.55, ('crimson', 'lamplighter_gold', 'black'))
    use_at(module, 0.0, -half_y - 1.0)
    shell.fits(module, 2, 2)


def crucible_hearth(module, x, y, stone='rubble'):
    """A hearth of rough stones waist high, coals glowing in its pit, the crucible set in them, a pair of tongs on
    its edge and the bellows at its side; a part."""
    kit.block(module, (x, y, 0.0), (1.3, 1.0, 0.75), stone, bevel=0.06, wear=0.05, cuts=1)
    for coal in range(10):
        shapes.ball(module, (x + module.draw(-0.4, 0.4), y + module.draw(-0.3, 0.3), 0.78), module.draw(0.06, 0.1),
                    'black' if coal % 3 else 'glow', detail=1, scale=(1.0, 1.0, 0.6))
    shapes.lathe(module, (x, y, 0.75), [(0.12, 0.0), (0.2, 0.08), (0.22, 0.3), (0.19, 0.32)], 'iron', sides=10)
    shapes.lathe(module, (x, y, 1.0), [(0.18, 0.0), (0.0, 0.01)], 'glow', sides=10)
    shapes.rod(module, (x + 0.45, y - 0.3, 0.78), (x + 0.75, y - 0.55, 0.95), 0.015, 'iron', sides=4)
    shapes.slab(module, (x - 0.95, y, 0.55), (0.55, 0.5, 0.08), 'timber', turn=(0.0, 0.1, 0.0))
    shapes.slab(module, (x - 0.95, y, 0.4), (0.5, 0.45, 0.14), 'black', bevel=0.02)
    module.part((x - 0.65, y - 0.5, 0.0), (x + 0.65, y + 0.5, 0.9))


def moulds(module, at, count=3, filled=2):
    """Ingot moulds in a row on `at`, iron troughs with gilt and iron bars cooling in some, and cast bars stacked."""
    x, y, z = at
    for k in range(count):
        shapes.slab(module, (x + k * 0.32, y, z + 0.05), (0.26, 0.5, 0.1), 'iron', bevel=0.01)
        shapes.slab(module, (x + k * 0.32, y, z + 0.1), (0.16, 0.4, 0.012), 'gold' if k < filled else 'black')
    for layer, bars in enumerate((3, 2)):
        for bar in range(bars):
            shapes.lathe(module, (x + count * 0.32 + 0.05 + bar * 0.12 + layer * 0.06, y, z + layer * 0.05),
                         [(0.06, 0.0), (0.04, 0.05), (0.0, 0.05)], 'gold', sides=4,
                         turn=(0.0, 0.0, math.pi / 4))


def assay_camp(module):
    shell.fly(module, -2.0, 2.0, -1.0, 1.7, 2.6, 2.1, out=0.5)
    crucible_hearth(module, 0.4, 0.8)
    top = furnish.trestle(module, (-1.0, -0.3, 0.0), 1.4, 0.7)
    furnish.balance(module, (-1.3, -0.25, top), reach=0.26)
    moulds(module, (-0.95, -0.3, top), count=2, filled=1)
    for k in range(3):
        fittings.sack(module, (1.5 + (k % 2) * 0.35, 0.2 + k * 0.4, 0.0), size=0.5, material='canvas')
    module.part((1.25, -0.05, 0.0), (2.1, 1.25, 0.5))
    shapes.ball(module, (1.6, -0.6, 0.0), 0.5, 'rubble', detail=2, scale=(1.2, 0.9, 0.5))
    module.part((1.1, -0.95, 0.0), (2.1, -0.25, 0.22))
    stall_weaponsmith.anvil(module, (2.8, 1.6, 0.0), turn=math.pi / 2)
    use_at(module, 0.4, -0.6)
    shell.fits(module, 2, 2)


def chimney(module, x, y, high, side=0.9):
    """A stone chimney stack rising to `high`, a capping course and its pots; a part."""
    kit.block(module, (x, y, 0.0), (side, side, high), 'stone', bevel=0.04, wear=0.03, cuts=2)
    kit.block(module, (x, y, high), (side + 0.2, side + 0.2, 0.2), 'trim', bevel=0.03, wear=0.0, part=False)
    for along in (-0.2, 0.2):
        shapes.lathe(module, (x + along, y, high + 0.2), [(0.12, 0.0), (0.1, 0.35), (0.12, 0.4), (0.08, 0.4)], 'roof',
                     sides=8)


def assay_smithy(module):
    west, east, front, back, wall = -2.4, 2.4, -1.3, 2.2, 2.6
    kit.block(module, (0.0, (front + back) / 2, 0.0), (east - west + 0.2, back - front + 0.2, 0.1), 'stone',
              bevel=0.03, wear=0.02, part=False)
    shell.walls(module, 'boards', west, east, front, back, wall, open_front=True, sides_from=front + 1.2)
    for x in (west, -1.0, 1.0, east):
        fittings.post(module, (x, front, 0.0), wall, side=0.24)
    shapes.slab(module, (0.0, front, wall - 0.1), (east - west + 0.3, 0.26, 0.26), 'timber', bevel=0.01)
    shell.shingles(module, west - 0.1, east + 0.1, front - 0.1, back + 0.1, wall + 0.05, wall + 1.6)
    chimney(module, -1.4, back - 0.3, 5.2, side=1.0)
    crucible_hearth(module, -1.4, back - 1.15, stone='stone')
    stall_weaponsmith.trough(module, 0.7, front + 0.6)
    furnish.balance(module, (1.4, back - 0.5, 0.95), reach=0.26)
    furnish.trestle(module, (1.4, back - 0.5, 0.0), 1.2, 0.6, high=0.95)
    moulds(module, (0.95, back - 0.45, 0.95), count=1, filled=1)
    stall_weaponsmith.anvil(module, (0.2, 0.6, 0.0), turn=0.3)
    for k in range(4):
        shapes.rod(module, (east - 0.15, front + 1.4 + k * 0.15, 1.9), (east - 0.15, front + 1.4 + k * 0.15, 0.9),
                   0.015, 'iron', sides=4)
    use_at(module, 0.2, front - 0.6)
    shell.fits(module, 2, 2)


def assay_house(module):
    west, east, front, back, wall = -2.4, 2.4, -1.5, 2.2, 3.2
    shell.walls(module, 'stone', west, east, front, back, wall, front_gaps=((1.9, 2.9, 2.4), (3.55, 4.25, 2.2, 1.0)))
    shell.door(module, (0.0, front, 0.0), 0, 0.96, 2.4, kind='bound')
    shell.opening(module, (1.5, front - 0.34, 1.0), 0, 0.66, 1.15)
    stall_vault.grille(module, 1.2, 1.8, front - 0.36, 1.0, 2.15)
    shell.shingles(module, west - 0.1, east + 0.1, front - 0.1, back + 0.1, wall + 0.18, wall + 1.8)
    chimney(module, -1.6, back - 0.1, 7.8, side=1.1)
    kit.block(module, (-1.6, back - 0.1, 4.0), (1.3, 1.3, 0.2), 'trim', bevel=0.03, wear=0.0, part=False)
    # The gilt balance sign hung from an iron bracket by the door.
    board = fittings.sign(module, (west + 0.45, front - 0.32, 2.5), board='black', size=0.8)
    for facing in (-1, 1):
        x = board[0] + facing * 0.04
        shapes.slab(module, (x, board[1], board[2] + 0.22), (0.02, 0.5, 0.04), 'gold')
        shapes.slab(module, (x, board[1], board[2] - 0.02), (0.02, 0.04, 0.46), 'gold')
        for side in (-1, 1):
            shapes.cutout(module, [(-0.1, 0.0), (0.1, 0.0), (0.0, 0.18)], 0.02, 'gold',
                          (x, board[1] + side * 0.22, board[2] - 0.08), turn=(0.0, 0.0, math.pi / 2))
    furnish.brazier(module, (2.9, -2.5, 0.0), high=0.9, bowl=0.3)
    stall_weaponsmith.trough(module, -2.2, -2.6)
    moulds(module, (-3.2, -0.2, 0.0), count=2, filled=2)
    use_at(module, 0.0, front - 0.8)
    shell.fits(module, 2, 2)
