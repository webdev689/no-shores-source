"""The cabin's furnishing and finish: frames down its walls under the beams, a wainscot rail and skirting, a cushioned
bench under the stern windows, a table set with a chart, a decanter and cups under the lantern, two chairs on a rug, a
curtained bunk and a sea chest, a desk with a book and inkwell, a bookshelf, a weapon rack, wall lanterns, a coaming
round the hatch and its door shut in it, and a barrel and crate by the stairs.

All of it keeps to the walls and the stern, so the middle of the room and its forward floor stay open for players to
furnish. Cloth, paper and wax wear the sail part.
"""
import math

from ship_mesh import Piece

LANTERN_HEIGHT_M = 1.9


def furnish(piece: Piece, room):
    """Everything in the cabin but its shell, beams, stairs and windows. `room` holds its numbers."""
    frames(piece, room)
    rails(piece, room)
    stern_bench(piece, room)
    table(piece, room)
    bunk(piece, room)
    desk(piece, room)
    bookshelf(piece, room)
    weapon_rack(piece, room)
    wall_lanterns(piece, room)
    hatch_coaming(piece, room)
    hatch_door(piece, room)
    corner_stores(piece, room)


def wall(room, z):
    """A side wall's distance from the room's middle at height `z`."""
    return room['floor_half'] + (room['ceiling_half'] - room['floor_half']) * z / room['height']


def lean(room):
    """How far the walls lean out for each metre up."""
    return (room['ceiling_half'] - room['floor_half']) / room['height']


def frames(piece, room):
    """A frame down each side wall under every beam, leaning out with the wall."""
    x = room['aft'] + 0.4
    while x < room['hatch_aft'] - 0.1:
        for side in (1, -1):
            corner = (x - 0.08, side * room['floor_half'], 0.0)
            piece.slab(corner, ((0.16, 0, 0), (0, -side * 0.1, 0), (0, side * lean(room) * room['height'],
                                                                     room['height'])), 'spar')
        x += room['beam_every']


def rails(piece, room):
    """A wainscot rail along both side walls and the stern wall, and a skirting along their foot."""
    aft, length = room['aft'], room['fore'] - room['aft']
    for z, tall, out in ((0.0, 0.16, 0.04), (1.0, 0.1, 0.06)):
        for side in (1, -1):
            corner = (aft, side * wall(room, z), z)
            piece.slab(corner, ((length, 0, 0), (0, -side * out, 0), (0, side * lean(room) * tall, tall)), 'spar')
        half = wall(room, z)
        piece.slab((aft, -half, z), ((out, 0, 0), (0, 2 * half, 0), (0, 0, tall)), 'spar')


def stern_bench(piece, room):
    """A bench across the stern under its windows, with three cushions along it."""
    aft = room['aft']
    half = wall(room, 0.45) - 0.25
    piece.box((aft, -half, 0.0), (aft + 0.55, half, 0.45), 'hull')
    piece.box((aft + 0.5, -half, 0.05), (aft + 0.56, half, 0.4), 'spar')
    for index in range(3):
        y0 = -half + 0.05 + index * (2 * half - 0.1) / 3
        y1 = y0 + (2 * half - 0.1) / 3 - 0.05
        piece.box((aft + 0.04, y0, 0.45), (aft + 0.52, y1, 0.55), 'sail')


def table(piece, room):
    """The table on a rug, two chairs, a chart, a decanter, two cups and a candle, under the hanging lantern."""
    x, top = room['aft'] + 2.4, 0.76
    piece.slab((x - 1.5, -1.15, 0.0), ((3.0, 0, 0), (0, 2.3, 0), (0, 0, 0.012)), 'sail')
    piece.box((x - 0.85, -0.5, top - 0.06), (x + 0.85, 0.5, top), 'deck')
    piece.box((x - 0.8, -0.45, top - 0.16), (x + 0.8, 0.45, top - 0.06), 'spar', skip=('top',))
    for dx in (-0.75, 0.75):
        for dy in (-0.4, 0.4):
            piece.box((x + dx - 0.05, dy - 0.05, 0.012), (x + dx + 0.05, dy + 0.05, top - 0.06), 'spar')
    piece.box((x - 0.45, -0.3, top), (x + 0.35, 0.3, top + 0.01), 'sail')
    piece.prism((x + 0.55, 0.25, top), (x + 0.55, 0.25, top + 0.18), 0.07, 'iron', sides=8, end_radius=0.06)
    piece.prism((x + 0.55, 0.25, top + 0.18), (x + 0.55, 0.25, top + 0.3), 0.025, 'iron', sides=6)
    for dy in (-0.2, 0.05):
        piece.prism((x + 0.6, dy, top), (x + 0.6, dy, top + 0.1), 0.04, 'iron', sides=8, end_radius=0.05)
    piece.prism((x - 0.65, -0.25, top), (x - 0.65, -0.25, top + 0.03), 0.07, 'iron', sides=8)
    piece.prism((x - 0.65, -0.25, top + 0.03), (x - 0.65, -0.25, top + 0.2), 0.022, 'sail', sides=6)
    for side in (1, -1):
        chair(piece, x + 0.1, side * 0.85, side)
    lantern = room['height'] - 0.16
    piece.prism((x, 0.0, lantern), (x, 0.0, lantern - 0.6), 0.012, 'iron', sides=4)
    lamp(piece, (x, 0.0, lantern - 0.6), hanging=True)


def chair(piece, x, y, side):
    seat = 0.45
    piece.box((x - 0.22, y - 0.22, seat - 0.05), (x + 0.22, y + 0.22, seat), 'deck')
    for dx in (-0.18, 0.18):
        for dy in (-0.18, 0.18):
            piece.box((x + dx - 0.03, y + dy - 0.03, 0.012), (x + dx + 0.03, y + dy + 0.03, seat - 0.05), 'spar')
    back = y + side * 0.2
    piece.box((x - 0.22, back - 0.03, seat), (x + 0.22, back + 0.03, seat + 0.5), 'spar')
    piece.box((x - 0.24, back - 0.04, seat + 0.45), (x + 0.24, back + 0.04, seat + 0.55), 'spar')


def lamp(piece, top, hanging=False):
    """A lantern: an iron frame round its glass, a cap and a ring, its top at `top`."""
    x, y, z = top
    piece.ring((x, y, z + 0.02), (1, 0, 0) if hanging else (0, 1, 0), 0.04, 0.015, 'iron', segments=8)
    piece.prism((x, y, z), (x, y, z - 0.08), 0.03, 'iron', sides=6, end_radius=0.12)
    piece.prism((x, y, z - 0.08), (x, y, z - 0.34), 0.11, 'sail', sides=6, end_radius=0.1)
    for step in range(6):
        angle = 2 * math.pi * step / 6
        post = (x + 0.115 * math.cos(angle), y + 0.115 * math.sin(angle))
        piece.prism((post[0], post[1], z - 0.08), (post[0], post[1], z - 0.34), 0.012, 'iron', sides=4)
    piece.prism((x, y, z - 0.34), (x, y, z - 0.4), 0.12, 'iron', sides=6, end_radius=0.08)


def bunk(piece, room):
    """A box bed against the starboard wall: posts, a canopy rail, a curtain drawn half along, a pillow, and a sea
    chest at its foot."""
    x, w = room['aft'] + 2.0, room['floor_half']
    piece.box((x - 1.0, -w, 0.0), (x + 1.0, -w + 0.9, 0.45), 'spar')
    piece.box((x - 0.95, -w + 0.05, 0.45), (x + 0.95, -w + 0.85, 0.6), 'sail')
    piece.box((x - 0.9, -w + 0.15, 0.6), (x - 0.55, -w + 0.75, 0.72), 'sail')
    piece.box((x - 1.0, -w + 0.82, 0.45), (x + 1.0, -w + 0.9, 0.7), 'spar')
    for dx in (-0.98, 0.98):
        piece.box((x + dx - 0.05, -w + 0.82, 0.0), (x + dx + 0.05, -w + 0.92, 1.95), 'spar')
    piece.box((x - 1.03, -w + 0.82, 1.9), (x + 1.03, -w + 0.92, 2.0), 'spar')
    piece.slab((x - 0.95, -w + 0.86, 0.75), ((0.9, 0, 0), (0, 0.03, 0), (0, 0, 1.14)), 'sail')
    chest_x = x + 1.55
    piece.box((chest_x - 0.4, -w + 0.1, 0.0), (chest_x + 0.4, -w + 0.65, 0.5), 'hull')
    piece.box((chest_x - 0.42, -w + 0.08, 0.5), (chest_x + 0.42, -w + 0.67, 0.58), 'hull')
    for dx in (-0.25, 0.25):
        piece.box((chest_x + dx - 0.03, -w + 0.07, 0.0), (chest_x + dx + 0.03, -w + 0.68, 0.6), 'iron')
    piece.box((chest_x - 0.06, -w + 0.66, 0.36), (chest_x + 0.06, -w + 0.7, 0.48), 'iron')


def desk(piece, room):
    """A desk against the port wall with its drawers, a hutch above, an open book, an inkwell and a candle."""
    x, w = room['aft'] + 1.6, room['floor_half']
    piece.box((x - 0.7, w - 0.6, 0.0), (x + 0.7, w, 0.8), 'spar')
    for z in (0.2, 0.5):
        piece.box((x - 0.6, w - 0.62, z), (x + 0.6, w - 0.6, z + 0.22), 'deck')
        piece.box((x - 0.06, w - 0.65, z + 0.09), (x + 0.06, w - 0.62, z + 0.13), 'iron')
    piece.box((x - 0.65, w - 0.3, 0.8), (x + 0.65, w - 0.05, 1.3), 'deck', skip=('bottom',))
    for dx in (-0.22, 0.22):
        piece.box((x + dx - 0.02, w - 0.3, 0.8), (x + dx + 0.02, w - 0.05, 1.3), 'spar')
    for way in (1, -1):
        piece.slab((x, w - 0.5, 0.81), ((way * 0.22, 0, 0.03), (0, 0.16, 0), (0, 0, 0.012)), 'sail')
    piece.prism((x + 0.4, w - 0.45, 0.8), (x + 0.4, w - 0.45, 0.87), 0.04, 'iron', sides=8)
    piece.prism((x - 0.45, w - 0.42, 0.8), (x - 0.45, w - 0.42, 0.83), 0.06, 'iron', sides=8)
    piece.prism((x - 0.45, w - 0.42, 0.83), (x - 0.45, w - 0.42, 0.98), 0.02, 'sail', sides=6)


def bookshelf(piece, room):
    """A bookshelf against the port wall forward of the desk, its shelves lined with books."""
    x0, x1, w, top = room['aft'] + 2.6, room['aft'] + 4.0, room['floor_half'], 2.1
    piece.box((x0, w - 0.4, 0.0), (x1, w, 0.05), 'spar')
    for x in (x0, x1 - 0.05):
        piece.box((x, w - 0.4, 0.0), (x + 0.05, w, top), 'spar')
    piece.box((x0, w - 0.05, 0.0), (x1, w, top), 'spar')
    piece.box((x0 - 0.03, w - 0.43, top), (x1 + 0.03, w, top + 0.06), 'spar')
    heights = (0.26, 0.3, 0.22, 0.28, 0.24, 0.31, 0.2, 0.27, 0.25, 0.29, 0.23)
    parts = ('hull', 'iron', 'deck', 'sail', 'hull', 'deck', 'iron')
    for shelf in range(4):
        z = 0.05 + shelf * 0.5
        piece.box((x0 + 0.05, w - 0.38, z), (x1 - 0.05, w - 0.05, z + 0.04), 'spar')
        x, index = x0 + 0.08, shelf * 3
        while x < x1 - 0.18:
            thick = 0.06 + 0.03 * (index % 3)
            tall = heights[index % len(heights)]
            piece.box((x, w - 0.33, z + 0.04), (x + thick, w - 0.08, z + 0.04 + tall), parts[index % len(parts)])
            x += thick + 0.01
            index += 1


def weapon_rack(piece, room):
    """A rack on the starboard wall forward of the chest: three muskets standing in it and two cutlasses hung."""
    x0, x1 = room['aft'] + 4.3, room['aft'] + 5.6
    w = wall(room, 1.4)
    piece.slab((x0, -w, 0.9), ((x1 - x0, 0, 0), (0, 0.06, 0), (0, -lean(room) * 1.1, 1.1)), 'spar')
    piece.box((x0, -room['floor_half'] + 0.02, 0.0), (x1, -room['floor_half'] + 0.3, 0.12), 'spar')
    for index in range(3):
        x = x0 + 0.25 + index * 0.3
        foot, head = (x, -room['floor_half'] + 0.16, 0.12), (x + 0.04, -wall(room, 1.75) + 0.12, 1.75)
        piece.prism(foot, (head[0], head[1], 0.7), 0.045, 'spar', sides=6)
        piece.prism((x + 0.01, foot[1], 0.7), head, 0.018, 'iron', sides=6)
    for index in range(2):
        x = x1 - 0.3 - index * 0.25
        y = -wall(room, 1.2) + 0.1
        piece.slab((x - 0.02, y, 0.85), ((0.04, 0, 0), (0, 0.01, 0), (0, 0, 0.7)), 'iron')
        piece.box((x - 0.07, y - 0.02, 1.55), (x + 0.07, y + 0.03, 1.58), 'iron')
        piece.prism((x, y, 1.58), (x, y, 1.72), 0.02, 'spar', sides=6)


def wall_lanterns(piece, room):
    """A lantern on a bracket on each side wall, toward the stern and toward the stairs."""
    for x in (room['aft'] + 1.0, room['hatch_aft'] - 0.6):
        for side in (1, -1):
            w = wall(room, LANTERN_HEIGHT_M)
            piece.box((x - 0.06, side * (w - 0.03) - 0.03, LANTERN_HEIGHT_M - 0.2), (x + 0.06, side * (w - 0.03)
                      + 0.03, LANTERN_HEIGHT_M + 0.1), 'spar')
            arm = side * (w - 0.3)
            piece.prism((x, side * (w - 0.03), LANTERN_HEIGHT_M), (x, arm, LANTERN_HEIGHT_M), 0.02, 'iron', sides=4)
            lamp(piece, (x, arm, LANTERN_HEIGHT_M - 0.02))


def hatch_coaming(piece, room):
    """Boards round the hatch the stairs come down through."""
    x0, x1, half, z = room['hatch_aft'], room['fore'], room['hatch_half'], room['height']
    for y in (-half - 0.1, half):
        piece.box((x0, y, z - 0.22), (x1, y + 0.1, z), 'spar', skip=('top',))
    piece.box((x0 - 0.1, -half - 0.1, z - 0.22), (x0, half + 0.1, z), 'spar', skip=('top',))


def hatch_door(piece, room):
    """The hatch over the stairs, shut: its boards inside the coaming, two iron straps across them, and a ring to
    pull it by."""
    x0, x1, half, z = room['hatch_aft'], room['fore'], room['hatch_half'], room['height']
    piece.box((x0, -half, z - 0.01), (x1, half, z), 'hull', skip=('top',))
    boards = 4
    width = 2 * half / boards
    for board in range(boards):
        y = -half + board * width
        piece.box((x0 + 0.03, y + 0.01, z - 0.09), (x1 - 0.03, y + width - 0.01, z - 0.01), 'deck', skip=('top',))
    for x in (x0 + 0.35, x1 - 0.35):
        piece.box((x - 0.05, -half + 0.02, z - 0.11), (x + 0.05, half - 0.02, z - 0.09), 'iron', skip=('top',))
    piece.box((x1 - 0.65, -0.08, z - 0.13), (x1 - 0.55, 0.08, z - 0.09), 'iron', skip=('top',))
    piece.ring((x1 - 0.6, 0.0, z - 0.21), (1, 0, 0), 0.08, 0.025, 'iron', segments=10)


def corner_stores(piece, room):
    """A barrel and a crate in the forward corner to starboard of the stairs."""
    x, y = room['fore'] - 0.55, -room['floor_half'] + 0.5
    piece.prism((x, y, 0.0), (x, y, 0.85), 0.3, 'hull', sides=12)
    for z in (0.12, 0.42, 0.73):
        piece.ring((x, y, z), (0, 0, 1), 0.305, 0.05, 'iron', segments=12)
    piece.box((x - 1.15, y - 0.3, 0.0), (x - 0.45, y + 0.3, 0.55), 'hull')
    for dx in (-1.13, -0.51):
        piece.box((x + dx, y - 0.31, 0.0), (x + dx + 0.04, y + 0.31, 0.56), 'spar')
