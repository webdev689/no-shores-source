"""A ship's finer work, past what the Sloop carries: wales along her sides, gunport lids propped open, channels with
deadeyes and chainplates, shrouds with ratlines, stays between her mastheads and to her bowsprit, a bobstay and
dolphin striker, mast hoops, a rudder, catheads with their anchors, hawse holes and a stern lantern; on deck a windlass,
a bell, a binnacle, a skylight, boom gallows, a ship's boat on chocks, pin rails, stores and coils of rope.

Standing rigging is tarred, so it wears the iron part; everything else wears the part it is made of.
"""
import math

from ship_hull import BODY_ROWS, PORT_LINTEL_M, inner
from ship_mesh import Piece, normalised
from ship_rig import mast_at

ROPE_M = 0.025
RATLINE_EVERY_M = 0.42
# A port's lid stands open this far above level, degrees.
LID_OPEN_DEG = 20


def build_details(hull, collection):
    """Her finer work as one object."""
    piece = Piece()
    wales(piece, hull)
    port_lids(piece, hull)
    for mast in hull.numbers['masts']:
        shrouds(piece, hull, mast)
        mast_hoops(piece, hull, mast)
        pin_rails(piece, hull, mast['x'])
        coils(piece, hull, mast['x'])
    stays(piece, hull)
    bowsprit_gear(piece, hull)
    rudder(piece, hull)
    anchors(piece, hull)
    stern_lantern(piece, hull)
    windlass(piece, hull)
    bell(piece, hull)
    quarterdeck_gear(piece, hull)
    boat(piece, hull)
    stores(piece, hull)
    return piece.build('Details', collection)


def outward(hull, x, z, side):
    """Her side at `x` and height `z`, and the way out from it, on the side named by `side` (1 port, -1 starboard)."""
    (_, y, _), (_, section_y, section_z) = hull.surface(x, z)
    plan_x, plan_y = hull.plan_out(x)
    normal = normalised((plan_x * section_y, side * plan_y * section_y, section_z))
    return (x, side * y, z), normal


def rail(hull, x):
    """The top of her rail cap at `x`, and its half width there."""
    y, z = hull.section(x)[-1]
    return y, z + 0.08


def wales(piece, hull):
    """Two raised wales along each side: one under her gunports, one over her waterline."""
    places = [x for x in hull.stations() if hull.half_beam(x) > 1.0]
    for height in (lambda x: hull.deck(x) - 0.12, lambda x: 1.95):
        for side in (1, -1):
            band = []
            for x in places:
                point, normal = outward(hull, x, height(x), side)
                band.append([tuple(point[axis] + normal[axis] * out + (0, 0, up)[axis] for axis in range(3))
                             for out, up in ((0.0, -0.11), (0.07, -0.11), (0.07, 0.11), (0.0, 0.11))])
            for here, there in zip(band, band[1:]):
                for edge, facing in ((0, (0, 0, -1)), (1, (0, side, 0)), (2, (0, 0, 1))):
                    piece.quad([here[edge], there[edge], there[edge + 1], here[edge + 1]], 'hull', facing)


def port_lids(piece, hull):
    """A lid over each gunport, hinged at its lintel and propped open, with two iron straps."""
    tilt = math.radians(LID_OPEN_DEG)
    for x in hull.numbers['ports']:
        lintel = hull.deck(x) + PORT_LINTEL_M + 0.03
        for side in (1, -1):
            (px, py, pz), normal = outward(hull, x, lintel, side)
            out = normalised((normal[0] * math.cos(tilt), normal[1] * math.cos(tilt), normal[2] * math.cos(tilt)
                              + math.sin(tilt)))
            thick = normalised((0.0, -out[2] * side, abs(out[1])))
            reach = [value * 0.7 for value in out]
            depth = [value * 0.06 for value in thick]
            piece.slab((px - 0.42, py, pz), ((0.84, 0, 0), reach, depth), 'hull')
            for strap in (-0.26, 0.2):
                corner = tuple((px + strap, py, pz)[axis] + depth[axis] for axis in range(3))
                piece.slab(corner, ((0.06, 0, 0), reach, [value / 3 for value in depth]), 'iron')


def shrouds(piece, hull, mast):
    """A channel each side at the mast, three deadeyes on it with chainplates down her side, shrouds from them to the
    crosstrees, and ratlines across the shrouds."""
    deck = hull.deck(mast['x'])
    trees = mast_at(mast, deck, mast['height_m'] - 0.9)
    places = (mast['x'] + 0.35, mast['x'] - 0.35, mast['x'] - 1.05)
    for side in (1, -1):
        rail_y, rail_z = rail(hull, mast['x'])
        board_z = rail_z - 0.3
        piece.slab((places[-1] - 0.3, side * (rail_y - 0.05), board_z), ((places[0] - places[-1] + 0.6, 0, 0),
                   (0, side * 0.5, 0), (0, 0, 0.1)), 'hull')
        lines = []
        for x in places:
            eye = (x, side * (rail_y + 0.33), board_z + 0.18)
            piece.prism((x, eye[1], board_z + 0.1), (x, eye[1], board_z + 0.26), 0.11, 'spar', sides=8)
            (_, low_y, low_z), _ = outward(hull, x, board_z - 1.2, side)
            piece.prism((x, eye[1], board_z + 0.1), (x, low_y + side * 0.03, low_z), 0.025, 'iron', sides=4)
            top = (trees[0], side * 0.3, trees[2])
            piece.prism(eye, top, ROPE_M, 'iron', sides=5)
            lines.append((eye, top))
        (first_low, first_high), (last_low, last_high) = lines[0], lines[-1]
        z = first_low[2] + 0.6
        while z < trees[2] - 0.8:
            ends = [along(low, high, z) for low, high in ((first_low, first_high), (last_low, last_high))]
            piece.prism(ends[0], ends[1], 0.012, 'iron', sides=4, caps=False)
            z += RATLINE_EVERY_M


def along(low, high, z):
    """The point of a straight line from `low` to `high` at height `z`."""
    share = (z - low[2]) / (high[2] - low[2])
    return tuple(low[axis] + share * (high[axis] - low[axis]) for axis in range(3))


def stays(piece, hull):
    """A stay from her foremast to her bowsprit before the staysail's luff, and two between her mastheads."""
    fore, main = hull.numbers['masts'][0], hull.numbers['masts'][-1]
    fore_deck, main_deck = hull.deck(fore['x']), hull.deck(main['x'])
    head = mast_at(fore, fore_deck, hull.numbers['staysail']['head_m'] + 0.3)
    sprit = hull.numbers['bowsprit']
    sprit_end = (sprit['to_x_m'], 0.0, hull.deck(hull.fore) + sprit['rise_m'])
    piece.prism((head[0] + 0.5, 0.0, head[2]), (sprit_end[0] - 0.4, 0.0, sprit_end[2] + 0.05), ROPE_M, 'iron',
                sides=5)
    for height in (lambda mast: mast['height_m'] - 0.2, lambda mast: mast['height_m'] + mast['topmast_m'] - 0.3):
        piece.prism(mast_at(main, main_deck, height(main)), mast_at(fore, fore_deck, height(fore)), ROPE_M, 'iron',
                    sides=5)


def bowsprit_gear(piece, hull):
    """A dolphin striker hung under her bowsprit, a martingale from its end to the striker's foot and back to her
    stem's face, and a bobstay from its end to her stem's foot."""
    sprit = hull.numbers['bowsprit']
    start = (sprit['from_x_m'], 0.0, hull.deck(sprit['from_x_m']) + 0.9)
    end = (sprit['to_x_m'], 0.0, hull.deck(hull.fore) + sprit['rise_m'])
    share = 1 - 1.6 / (end[0] - start[0])
    root = tuple(start[axis] + share * (end[axis] - start[axis]) for axis in range(3))
    foot = (root[0] - 0.15, 0.0, root[2] - 1.3)
    piece.prism(root, foot, 0.06, 'spar', sides=8)
    piece.prism(end, foot, ROPE_M * 1.3, 'iron', sides=5)
    stem_face = hull.fore + 0.12
    piece.prism(foot, (stem_face, 0.0, hull.deck(hull.fore) - 0.3), ROPE_M * 1.3, 'iron', sides=5)
    piece.prism(end, (stem_face, 0.0, hull.keel(hull.fore) + 0.15), 0.035, 'iron', sides=6)


def mast_hoops(piece, hull, mast):
    """Hoops round the mast between its boom and gaff, that the gaff sail's luff is bent to."""
    deck = hull.deck(mast['x'])
    lean = math.radians(mast['rake_deg'])
    axis = (-math.sin(lean), 0.0, math.cos(lean))
    height = mast['boom_m'] + 0.6
    while height < mast['gaff_m'] - 0.4:
        share = height / mast['height_m']
        radius = mast['radius_m'] * (1 - 0.25 * share) + 0.05
        piece.ring(mast_at(mast, deck, height), axis, radius, 0.05, 'spar', segments=10)
        height += 1.05


def pin_rails(piece, hull, x):
    """A rail inside each bulwark by the mast, its belaying pins through it."""
    deck = hull.deck(x)
    for side in (1, -1):
        inside = inner(hull.section(x), len(BODY_ROWS))
        y = inside[-1][0]
        z = deck + 1.05
        piece.slab((x - 0.9, side * (y - 0.2), z), ((1.2, 0, 0), (0, side * 0.2, 0), (0, 0, 0.08)), 'spar')
        for step in range(5):
            px = x - 0.78 + step * 0.24
            piece.prism((px, side * (y - 0.1), z - 0.12), (px, side * (y - 0.1), z + 0.26), 0.022, 'spar', sides=5)


def coils(piece, hull, x):
    """Coils of rope lying on deck by the mast's fife rail."""
    deck = hull.deck(x)
    for side in (1, -1):
        for turn in range(3):
            piece.ring((x - 1.0, side * 1.0, deck + 0.03 + turn * 0.055), (0, 0, 1), 0.27 - turn * 0.03, 0.055,
                       'spar', segments=10)


def rudder(piece, hull):
    """Her rudder hung on her sternpost, broad below and narrowing to its head, with iron straps."""
    aft = hull.aft
    low, high = hull.keel(aft) + 0.1, hull.deck(aft) + 0.25
    corners = [(aft, -0.12, low), (aft - 0.95, -0.12, low), (aft - 0.95, 0.12, low), (aft, 0.12, low),
               (aft, -0.12, high), (aft - 0.4, -0.12, high), (aft - 0.4, 0.12, high), (aft, 0.12, high)]
    hexahedron(piece, corners, 'hull')
    for share in (0.2, 0.5, 0.8):
        z = low + share * (high - low)
        reach = 0.95 - 0.55 * share
        piece.slab((aft - reach * 0.6, -0.14, z), ((reach * 0.6 + 0.1, 0, 0), (0, 0.28, 0), (0, 0, 0.07)), 'iron')


def hexahedron(piece, corners, part):
    """A six-sided solid from its eight corners, bottom four then top four, each four in turn round."""
    middle = [sum(point[axis] for point in corners) / 8 for axis in range(3)]
    faces = ((0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))
    for face in faces:
        points = [corners[index] for index in face]
        centre = [sum(point[axis] for point in points) / 4 for axis in range(3)]
        piece.quad(points, part, [centre[axis] - middle[axis] for axis in range(3)])


def anchors(piece, hull):
    """A cathead each side at her bow, an anchor hung from it clear of her side, and a hawse hole below the rail."""
    x = hull.fore - 2.6
    for side in (1, -1):
        rail_y, rail_z = rail(hull, x)
        piece.slab((x - 0.11, side * (rail_y - 0.3), rail_z - 0.05), ((0.22, 0, 0), (0.25, side * 1.25, 0),
                   (0, 0, 0.2)), 'spar')
        hang = (x + 0.25, side * (rail_y + 0.88), rail_z - 0.15)
        piece.ring((hang[0], hang[1], hang[2] - 0.12), (0, 1, 0), 0.11, 0.035, 'iron', segments=8)
        top, crown = hang[2] - 0.25, hang[2] - 2.1
        piece.prism((hang[0], hang[1], top), (hang[0], hang[1], crown), 0.055, 'iron', sides=6)
        piece.prism((hang[0], hang[1] - side * 0.7, top - 0.15), (hang[0], hang[1] + side * 0.7, top - 0.15), 0.07,
                    'spar', sides=6, end_radius=0.045)
        for way in (1, -1):
            tip = (hang[0] + way * 0.55, hang[1], crown + 0.5)
            piece.prism((hang[0], hang[1], crown), tip, 0.05, 'iron', sides=6)
            piece.slab((tip[0] - 0.11, hang[1] - 0.03, tip[2] - 0.05), ((0.22, 0, 0), (0, 0.06, 0), (0, 0, 0.28)),
                       'iron')
        hole_x = hull.fore - 1.5
        point, normal = outward(hull, hole_x, hull.deck(hole_x) - 0.25, side)
        centre = tuple(point[axis] + normal[axis] * 0.02 for axis in range(3))
        piece.ring(centre, normal, 0.15, 0.06, 'iron', segments=10)
        across = normalised((normal[1], -normal[0], 0.0)) if abs(normal[2]) < 0.99 else (1.0, 0.0, 0.0)
        up = normalised((normal[1] * across[2] - normal[2] * across[1], normal[2] * across[0] - normal[0] * across[2],
                         normal[0] * across[1] - normal[1] * across[0]))
        disc = [tuple(centre[axis] + 0.13 * (math.cos(angle) * across[axis] + math.sin(angle) * up[axis])
                      for axis in range(3)) for angle in (2 * math.pi * step / 10 for step in range(10))]
        piece.face([piece.point(corner) for corner in (disc if side > 0 else disc[::-1])], 'iron')


def stern_lantern(piece, hull):
    """A lantern on a post at her taffrail."""
    x = hull.aft + 0.55
    base = hull.deck(x) + hull.numbers['quarterdeck_m'][1]
    piece.prism((x, 0.0, base), (x, 0.0, base + 1.35), 0.06, 'spar', sides=8)
    piece.prism((x, 0.0, base + 1.35), (x, 0.0, base + 1.75), 0.17, 'iron', sides=6, end_radius=0.15)
    piece.prism((x, 0.0, base + 1.75), (x, 0.0, base + 1.95), 0.17, 'iron', sides=6, end_radius=0.03)
    piece.ring((x, 0.0, base + 2.0), (1, 0, 0), 0.07, 0.025, 'iron', segments=8)


def windlass(piece, hull):
    """A windlass across her foredeck aft of the bitts: its barrel between two cheeks, iron bands and a pawl post."""
    x = hull.numbers['bowsprit']['from_x_m'] - 0.9
    deck = hull.deck(x)
    piece.prism((x, -0.85, deck + 0.55), (x, 0.85, deck + 0.55), 0.21, 'spar', sides=12)
    for y in (-0.55, 0.0, 0.55):
        piece.ring((x, y, deck + 0.55), (0, 1, 0), 0.215, 0.05, 'iron', segments=12)
    for side in (1, -1):
        piece.slab((x - 0.3, side * 0.85, deck), ((0.6, 0, 0), (0, side * 0.2, 0), (0, 0, 0.85)), 'hull')
    piece.slab((x - 0.45, -0.1, deck), ((0.18, 0, 0), (0, 0.2, 0), (0, 0, 0.95)), 'spar')


def bell(piece, hull):
    """A ship's bell in its frame before her foremast."""
    x = hull.numbers['masts'][0]['x'] + 0.95
    deck = hull.deck(x)
    for side in (1, -1):
        piece.slab((x - 0.06, side * 0.35 - 0.06, deck), ((0.12, 0, 0), (0, 0.12, 0), (0, 0, 1.5)), 'spar')
    piece.slab((x - 0.08, -0.45, deck + 1.5), ((0.16, 0, 0), (0, 0.9, 0), (0, 0, 0.14)), 'spar')
    piece.prism((x, 0.0, deck + 1.48), (x, 0.0, deck + 1.16), 0.08, 'iron', sides=10, end_radius=0.17)


def quarterdeck_gear(piece, hull):
    """On her quarterdeck: a binnacle before the wheel, a skylight, and gallows the main boom rests in."""
    rise = hull.numbers['quarterdeck_m'][1]
    helm = hull.numbers['helm_x_m']
    x = helm + 0.9
    base = hull.deck(x) + rise
    piece.box((x - 0.25, -0.25, base), (x + 0.25, 0.25, base + 0.95), 'hull')
    piece.prism((x, 0.0, base + 0.95), (x, 0.0, base + 1.17), 0.2, 'iron', sides=8, end_radius=0.08)
    sky = hull.numbers['quarterdeck_m'][0] - 1.15
    base = hull.deck(sky) + rise
    piece.box((sky - 0.65, -0.5, base), (sky + 0.65, 0.5, base + 0.3), 'hull', skip=('bottom',))
    for side in (1, -1):
        piece.slab((sky - 0.6, side * 0.45, base + 0.3), ((1.2, 0, 0), (0, -side * 0.45, 0.25), (0, 0, 0.03)), 'iron')
        for bar in (-0.3, 0.0, 0.3):
            piece.prism((sky + bar, side * 0.45, base + 0.34), (sky + bar, 0.0, base + 0.58), 0.02, 'spar', sides=4)
    main = hull.numbers['masts'][-1]
    gallows = hull.aft + 1.0
    boom_start = mast_at(main, hull.deck(main['x']), main['boom_m'])
    share = (gallows - boom_start[0]) / (main['boom_to_m'] - boom_start[0])
    boom_z = boom_start[2] + 0.25 * share - main['radius_m'] * 0.55
    base = hull.deck(gallows) + rise
    for side in (1, -1):
        piece.slab((gallows - 0.08, side * 1.15 - 0.08, base), ((0.16, 0, 0), (0, 0.16, 0), (0, 0, boom_z - base)),
                   'spar')
    piece.slab((gallows - 0.1, -1.3, boom_z - 0.12), ((0.2, 0, 0), (0, 2.6, 0), (0, 0, 0.14)), 'spar')


def boat(piece, hull):
    """Her boat, upturned on two chocks amidships: a little lofted hull with a keel along its top."""
    centre, length, half_beam, depth = hull.numbers['boat_x_m'], 3.6, 0.7, 0.55
    base = hull.deck(centre) + 0.28
    for chock in (-1.1, 1.1):
        piece.box((centre + chock - 0.12, -0.75, hull.deck(centre)), (centre + chock + 0.12, 0.75, base), 'spar')
    rows = ((1.0, 0.0), (0.85, 0.4), (0.45, 0.85), (0.0, 1.0))
    stations = [centre - length / 2 + length * step / 10 for step in range(11)]
    width = lambda x: half_beam * max(0.0, 1 - (2 * (x - centre) / length) ** 2) ** 0.5  # noqa: E731
    for x0, x1 in zip(stations, stations[1:]):
        for side in (1, -1):
            for (s0, h0), (s1, h1) in zip(rows, rows[1:]):
                corners = [(x0, side * s0 * width(x0), base + h0 * depth),
                           (x1, side * s0 * width(x1), base + h0 * depth),
                           (x1, side * s1 * width(x1), base + h1 * depth),
                           (x0, side * s1 * width(x0), base + h1 * depth)]
                piece.quad(corners, 'hull', (0, side, 0.5))
        piece.quad([(x0, -width(x0), base), (x1, -width(x1), base), (x1, width(x1), base), (x0, width(x0), base)],
                   'deck', (0, 0, -1))
    piece.box((centre - length / 2, -0.05, base + depth - 0.02), (centre + length / 2, 0.05, base + depth + 0.07),
              'spar')


def stores(piece, hull):
    """Two barrels and a crate by her companionway."""
    deck_at = hull.deck
    for x, y in ((-4.9, -1.3), (-4.3, -1.35)):
        base = deck_at(x)
        piece.prism((x, y, base), (x, y, base + 0.85), 0.3, 'hull', sides=12)
        for z in (0.12, 0.42, 0.73):
            piece.ring((x, y, base + z), (0, 0, 1), 0.305, 0.05, 'iron', segments=12)
    x, y = -4.6, 1.35
    base = deck_at(x)
    piece.box((x - 0.35, y - 0.3, base), (x + 0.35, y + 0.3, base + 0.55), 'hull')
    for dx in (-0.33, 0.29):
        piece.box((x + dx, y - 0.31, base), (x + dx + 0.04, y + 0.31, base + 0.56), 'spar')
