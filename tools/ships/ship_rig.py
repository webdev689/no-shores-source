"""A ship's rig in the Sloop's style: flat sails with clean corners, each one face, which the game bellies and swings.

A gaff mast carries a cap, crosstrees and a topmast, a boom and a gaff, and the sail between them. A square mast is
a lower mast with a top, a topmast with crosstrees and a topgallant, a yard for each of her square sails (course,
topsail, topgallant), and may carry a gaff spanker abaft it. Her bowsprit may run on into a jibboom, and her
headsails are bent to stays from her foremast to them. A gaff sail's corners run tack, clew, peak, throat; a
staysail's tack, clew, head; a square sail's foot to port, foot to starboard, head to starboard, head to port.
"""
import math

from ship_mesh import Piece

# A sail stands this far off the spars it is bent to, so canvas and wood never share a plane.
SAIL_OFF_M = 0.25
# A mast, boom, gaff or bowsprit is this many facets round, so it reads round as the Sloop's do.
ROUND = 16
# How far each spar of a square mast stands before its lower mast, in its lower mast's radii: the lower mast, its
# topmast and its topgallant, each touching the one below through their doubling.
AHEAD = (0.0, 1.4, 2.25)
# Each spar's radius at its head, as a share of its lower mast's: a yard is slung just before it.
HEAD_RADIUS = (0.8, 0.5, 0.3)
DOUBLING_M = 1.6


def mast_at(mast, deck, height):
    """A point up a mast, `height` over the deck, raked aft by its rake."""
    lean = math.tan(math.radians(mast['rake_deg']))
    return (mast['x'] - height * lean, 0.0, deck + height)


def section_at(mast, deck, height, section):
    """A point up one of a square mast's spars at `height`: its lower mast (0), its topmast (1) or its topgallant
    (2)."""
    x, _, z = mast_at(mast, deck, height)
    return (x + AHEAD[section] * mast['radius_m'], 0.0, z)


def build_rig(hull, collection):
    """Her masts, yards, booms, gaffs and bowsprit as one object of spars, and her sails as another."""
    spars, sails = Piece(), Piece()
    numbers = hull.numbers
    for mast in numbers['masts']:
        if mast.get('rig') == 'square':
            square_mast(spars, sails, hull, mast)
        else:
            gaff_mast(spars, hull, mast)
            gaff_sail(spars, sails, hull, mast, mast)
    bowsprit(spars, hull)
    if 'staysail' in numbers:
        stay = numbers['staysail']
        fore = numbers['masts'][0]
        head = mast_at(fore, hull.deck(fore['x']), stay['head_m'])
        sprit_end = sprit_line(hull)[1]
        stay_tack = (sprit_end[0] - 0.6, 0.0, sprit_end[2] - 0.1)
        stay_clew = (fore['x'] + stay['clew_ahead_m'], 0.0, hull.deck(fore['x']) + stay['clew_m'])
        corners = (stay_tack, stay_clew, (head[0] + 0.35, 0.0, head[2]))
        sails.face([sails.point(corner) for corner in corners], 'sail')
    for (top, bottom), sail in zip(headsail_stays(hull), numbers.get('headsails', ())):
        head, tack = along_x(top, bottom, sail['head_x_m']), along_x(top, bottom, sail['tack_x_m'])
        clew = (sail['clew_x_m'], 0.0, hull.deck(hull.fore) + sail['clew_m'])
        corners = [(x, sail['y_m'], z) for x, _, z in (tack, clew, head)]
        sails.face([sails.point(corner) for corner in corners], 'sail')
    return spars.build('Spars', collection), sails.build('Sails', collection)


def gaff_mast(spars, hull, mast):
    """A gaff mast: the mast, its cap, crosstrees, topmast and truck."""
    deck = hull.deck(mast['x'])
    foot, cap = mast_at(mast, deck, -0.1), mast_at(mast, deck, mast['height_m'])
    spars.prism(foot, cap, mast['radius_m'], 'spar', sides=ROUND, end_radius=mast['radius_m'] * 0.75)
    cap_x, _, cap_z = cap
    spars.box((cap_x - 0.32, -0.22, cap_z - 0.05), (cap_x + 0.22, 0.22, cap_z + 0.22), 'spar')
    trees = cap_z - 0.9
    for offset in (-0.25, 0.25):
        spars.box((cap_x + offset - 0.07, -0.95, trees), (cap_x + offset + 0.07, 0.95, trees + 0.14), 'spar')
    top = mast_at(mast, deck, mast['height_m'] + mast['topmast_m'])
    spars.prism((cap_x - 0.15, 0.0, cap_z - 0.6), top, mast['radius_m'] * 0.55, 'spar', sides=ROUND,
                end_radius=mast['radius_m'] * 0.35)
    spars.box((top[0] - 0.12, -0.12, top[2]), (top[0] + 0.12, 0.12, top[2] + 0.12), 'spar')


def gaff_sail(spars, sails, hull, mast, gear):
    """A boom and a gaff on a mast, their jaws, and the sail between them: `gear` holds their heights and reaches."""
    deck = hull.deck(mast['x'])
    boom_start = mast_at(mast, deck, gear['boom_m'])
    boom_end = (gear['boom_to_m'], 0.0, boom_start[2] + 0.25)
    spars.prism(boom_start, boom_end, mast['radius_m'] * 0.6, 'spar', sides=ROUND,
                end_radius=mast['radius_m'] * 0.45)
    throat = mast_at(mast, deck, gear['gaff_m'])
    peak = (gear['gaff_to_m'], 0.0, throat[2] + gear['gaff_rise_m'])
    spars.prism(throat, peak, mast['radius_m'] * 0.5, 'spar', sides=ROUND, end_radius=mast['radius_m'] * 0.35)
    jaw = [(throat[0] + 0.05, side * 0.22, throat[2] - 0.15) for side in (1, -1)]
    for x, y, z in jaw:
        spars.box((x - 0.35, y - 0.05, z), (x + 0.1, y + 0.05, z + 0.3), 'spar')
    aft = -1 if boom_end[0] < boom_start[0] else 1
    tack = (boom_start[0] + aft * (mast['radius_m'] + 0.1), 0.0, boom_start[2] + SAIL_OFF_M)
    clew = (boom_end[0] - aft * 0.3, 0.0, boom_end[2] + SAIL_OFF_M)
    head = (peak[0] - aft * 0.3, 0.0, peak[2] - SAIL_OFF_M)
    jaws = (throat[0] + aft * (mast['radius_m'] + 0.1), 0.0, throat[2] - SAIL_OFF_M)
    sails.face([sails.point(corner) for corner in (tack, clew, head, jaws)], 'sail')


def heights(mast):
    """A square mast's lower masthead, topmast head and truck, over her deck."""
    lower = mast['height_m']
    return lower, lower + mast['topmast_m'], lower + mast['topmast_m'] + mast['topgallant_m']


def square_mast(spars, sails, hull, mast):
    """A square mast: its lower mast with a top at its head, a topmast with a cap and crosstrees, a topgallant and
    a truck; a yard for each square sail and the sails between them, its lowest `bare_yards` yards without; and a
    spanker abaft it where it has one."""
    deck = hull.deck(mast['x'])
    radius = mast['radius_m']
    lower, upper, highest = heights(mast)
    spars.prism(mast_at(mast, deck, -0.1), mast_at(mast, deck, lower + 0.3), radius, 'spar', sides=ROUND,
                end_radius=radius * HEAD_RADIUS[0])
    for section, (low, high) in enumerate(((lower, upper), (upper, highest)), start=1):
        size = radius * HEAD_RADIUS[section - 1] * 0.75
        spars.prism(section_at(mast, deck, low - DOUBLING_M + 0.25, section), section_at(mast, deck, high + 0.3,
                    section), size, 'spar', sides=ROUND, end_radius=radius * HEAD_RADIUS[section])
        cap_x, _, cap_z = section_at(mast, deck, low, section - 1)
        reach = (AHEAD[section] - AHEAD[section - 1]) * radius
        spars.box((cap_x - 0.35, -0.22, cap_z + 0.3), (cap_x + reach + 0.3, 0.22, cap_z + 0.52), 'spar')
    top(spars, mast, deck)
    tree_x, _, tree_z = section_at(mast, deck, upper - 0.7, 1)
    for offset in (-0.22, 0.22):
        spars.box((tree_x + offset - 0.06, -1.15, tree_z), (tree_x + offset + 0.06, 1.15, tree_z + 0.12), 'spar')
    truck = section_at(mast, deck, highest + 0.3, 2)
    spars.box((truck[0] - 0.1, -0.1, truck[2]), (truck[0] + 0.1, 0.1, truck[2] + 0.12), 'spar')
    yards = [yard_at(mast, deck, height, section) + (reach,) for section, (height, reach) in
             enumerate(mast['yards'])]
    for x, z, reach in yards:
        for side in (1, -1):
            spars.prism((x, 0.0, z), (x, side * reach, z), 0.035 * reach ** 0.9, 'spar', sides=ROUND,
                        end_radius=0.015 * reach ** 0.9)
        spars.box((x - 0.18, -0.35, z - 0.12), (x + 0.18, 0.35, z + 0.12), 'spar')
    lean = math.tan(math.radians(mast['rake_deg']))
    for index, (x, z, reach) in enumerate(yards):
        if index < mast.get('bare_yards', 0):
            continue
        # Each sail hangs before its yard and leans aft with its mast, so it clears the top and caps below it.
        head_z, head_half = z - 0.2, reach - 0.35
        if index == 0:
            foot_z, foot_half = hull.floor_at(x) + mast['course_foot_m'], reach - 0.1
        else:
            foot_z, foot_half = yards[index - 1][1] + 0.2, yards[index - 1][2] - 0.45
        head_x, foot_x = x + SAIL_OFF_M, x + SAIL_OFF_M + (z - foot_z) * lean
        corners = ((foot_x, foot_half, foot_z), (foot_x, -foot_half, foot_z), (head_x, -head_half, head_z),
                   (head_x, head_half, head_z))
        sails.face([sails.point(corner) for corner in corners], 'sail')
    if 'spanker' in mast:
        gaff_sail(spars, sails, hull, mast, mast['spanker'])


def top(spars, mast, deck):
    """The top at a square mast's lower masthead: a platform round the mast, just reaching before its topmast, with a
    rim along its sides."""
    aft, fore, half, z = top_rim(mast, deck)
    spars.box((aft, -half, z - 0.12), (fore, half, z), 'spar')
    for side in (1, -1):
        spars.box((aft, side * half - 0.06, z), (fore, side * half + 0.06, z + 0.08), 'spar')


def top_rim(mast, deck):
    """Where a square mast's top's edges are: its aft and fore ends, its half width, and its height."""
    head_x, _, head_z = mast_at(mast, deck, mast['height_m'])
    fore = head_x + (AHEAD[1] + HEAD_RADIUS[0] * 0.75) * mast['radius_m'] + 0.15
    return head_x - mast['top_m'] * 0.7, fore, mast['top_m'], head_z - 0.33


def yard_at(mast, deck, height, section):
    """A yard's middle, slung before the spar of `section` at `height`, as (x, z)."""
    x, _, z = section_at(mast, deck, height, section)
    return x + mast['radius_m'] * HEAD_RADIUS[section] + 0.12, z


def sprit_line(hull):
    """Her bowsprit's heel and end, and her jibboom's heel and end where she has one."""
    sprit = hull.numbers['bowsprit']
    start = (sprit['from_x_m'], 0.0, hull.floor_at(sprit['from_x_m']) + 0.9)
    end = (sprit['to_x_m'], 0.0, hull.deck(hull.fore) + sprit['rise_m'])
    if 'jibboom_m' not in sprit:
        return start, end, None, None
    length = math.dist(start, end)
    way = [(end[axis] - start[axis]) / length for axis in range(3)]
    lift = (0.0, 0.0, sprit['radius_m'] * 0.9)
    heel = tuple(end[axis] - 1.6 * way[axis] + lift[axis] for axis in range(3))
    tip = tuple(end[axis] + sprit['jibboom_m'] * way[axis] + lift[axis] for axis in range(3))
    return start, end, heel, tip


def bowsprit(spars, hull):
    """Her bowsprit from its heel by the bitts, and her jibboom run out along its top where she has one, with a cap
    where they meet."""
    sprit = hull.numbers['bowsprit']
    start, end, heel, tip = sprit_line(hull)
    spars.prism(start, end, sprit['radius_m'], 'spar', sides=ROUND, end_radius=sprit['radius_m'] * 0.55)
    if tip:
        spars.prism(heel, tip, sprit['radius_m'] * 0.5, 'spar', sides=ROUND, end_radius=sprit['radius_m'] * 0.3)
        spars.box((end[0] - 0.15, -0.22, end[2] - 0.2), (end[0] + 0.12, 0.22, heel[2] + sprit['radius_m'] * 0.6),
                  'spar')


def headsail_stays(hull):
    """The stay each headsail is bent to, from its top on her foremast to her bowsprit's end or her jibboom's, in
    turn."""
    fore = hull.numbers['masts'][0]
    deck = hull.deck(fore['x'])
    _, end, _, tip = sprit_line(hull)
    return [(section_at(fore, deck, sail['stay_from_m'], 1), tip if sail.get('to_jibboom') else end)
            for sail in hull.numbers.get('headsails', ())]


def along_x(top, bottom, x):
    """The point on a straight line from `top` to `bottom` at `x`."""
    share = (x - top[0]) / (bottom[0] - top[0])
    return tuple(top[axis] + share * (bottom[axis] - top[axis]) for axis in range(3))
