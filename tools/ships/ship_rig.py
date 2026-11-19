"""A ship's rig in the Sloop's style: raked masts with a cap, crosstrees and a topmast, a boom and a gaff on each,
a tapered bowsprit, and flat sails with clean corners, each one face, which the game bellies and swings.

A gaff sail's corners run tack, clew, peak, throat; a staysail's tack, clew, head; tools/ships/export_ship.py finds
them by where her canvas outline turns.
"""
import math

from ship_mesh import Piece

# A sail stands this far off the spars it is bent to, so canvas and wood never share a plane.
SAIL_OFF_M = 0.25
# A mast, boom, gaff or bowsprit is this many facets round, so it reads round as the Sloop's do.
ROUND = 16


def mast_at(mast, deck, height):
    """A point up a mast, `height` over the deck, raked aft by its rake."""
    lean = math.tan(math.radians(mast['rake_deg']))
    return (mast['x'] - height * lean, 0.0, deck + height)


def build_rig(hull, collection):
    """Her masts, booms, gaffs and bowsprit as one object of spars, and her sails as another."""
    spars, sails = Piece(), Piece()
    numbers = hull.numbers
    for mast in numbers['masts']:
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
        boom_start = mast_at(mast, deck, mast['boom_m'])
        boom_end = (mast['boom_to_m'], 0.0, boom_start[2] + 0.25)
        spars.prism(boom_start, boom_end, mast['radius_m'] * 0.6, 'spar', sides=ROUND,
                    end_radius=mast['radius_m'] * 0.45)
        throat = mast_at(mast, deck, mast['gaff_m'])
        peak = (mast['gaff_to_m'], 0.0, throat[2] + mast['gaff_rise_m'])
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
    sprit = numbers['bowsprit']
    sprit_start = (sprit['from_x_m'], 0.0, hull.deck(sprit['from_x_m']) + 0.9)
    sprit_end = (sprit['to_x_m'], 0.0, hull.deck(hull.fore) + sprit['rise_m'])
    spars.prism(sprit_start, sprit_end, sprit['radius_m'], 'spar', sides=ROUND,
                end_radius=sprit['radius_m'] * 0.55)
    stay = numbers['staysail']
    fore = numbers['masts'][0]
    head = mast_at(fore, hull.deck(fore['x']), stay['head_m'])
    stay_tack = (sprit_end[0] - 0.6, 0.0, sprit_end[2] - 0.1)
    stay_clew = (fore['x'] + stay['clew_ahead_m'], 0.0, hull.deck(fore['x']) + stay['clew_m'])
    corners = (stay_tack, stay_clew, (head[0] + 0.35, 0.0, head[2]))
    sails.face([sails.point(corner) for corner in corners], 'sail')
    return spars.build('Spars', collection), sails.build('Sails', collection)
