"""The envelopes a module keeps, so nothing a body could walk into stands unblocked: each kit piece's room in its own
frame, and a landmark's footprint, height, walk zone and floor. Plain Python, without Blender.

`problems(module, triangles, water)` takes a module's triangles, three (x, y, z) corners each in the dungeon's frame
(x east, y south, z up, metres), and those of them that are water, and gives every rule it breaks as a readable line;
an empty list passes. A rule is a box the
piece may not reach into, so a triangle that only crosses it, its corners all outside, is caught as well.
"""
import math

import catalog

# How far, metres, geometry may touch a limit without breaking it: a face laid on the limit itself keeps it.
TOUCH_M = 0.002
# Far enough to stand for "unbounded" on an axis, metres.
FAR = 1000.0
# A dungeon lays a few hundred kit pieces, so each kind of piece has its own budget, the most repeated the least.
# The way through a doorway, metres either side of its middle: the rules' jambs stand from here (DOORWAY_HALF_M in
# crates/dungeon/src/dungeon.rs), so a door piece's reveal is where a body stops.
DOORWAY_HALF_M = 0.8
KIT_TRIANGLES = {
    'door': 1500, 'pillar.base': 500, 'pillar.shaft': 350, 'pillar.capital': 750, 'wall.base': 250,
    'wall.shaft': 150, 'wall.cap': 350, 'feature': 1500, 'ceiling': 600, 'floor': 300, 'sconce': 150,
    'portal': 2500, 'exit': 2500,
}
LANDMARK_TRIANGLES = 12000
# The walk zone: a body stands from just over the floor to over a head, metres. A solid stops a body whatever its
# height, so anything seen here must lie over one, grown by WALK_GROW_M.
WALK_LOW_M = 0.05
WALK_HIGH_M = 2.2
WALK_GROW_M = 0.05
# A landmark's floor is sampled on this grid, metres, to find holes into the void.
FLOOR_STEP_M = 0.2
BUCKET_M = 4 * FLOOR_STEP_M
# The page lays no room floor under a landmark, so where its floor stands off the room's z 0 at its edge the void
# shows as a hairline, unless a skirt closes the side down to SKIRT_M. The edge is sampled this far inside, metres.
EDGE_IN_M = 0.005
SKIRT_M = -0.05
# Under a dome or a vault the ceiling curves down from a ceiling piece's origin, laid at its top, so a wide piece
# pokes through the curve: one keeps within this of its origin, metres.
APEX_HALF_M = 0.8
# The smallest dome, over a room two cells square, rises this high over this radius, metres (dungeonCeilings.ts). It
# falls away fastest, so a ceiling piece under its curve is under every dome's and vault's. The curve falls away
# convexly, so a triangle whose corners are under it is under it throughout.
DOME_RADIUS_M = 3.2
DOME_RISE_M = 1.92
# The code's torch flame stands on the sconce's cup, at x ±0.06, y 0.29..0.41, z -0.15..-0.07 (metres). Something
# must reach in under the flame's foot: a cup's floor or a solid cup, not an arm ending at its edge.
CUP = ((-0.04, 0.04), (0.31, 0.39), (-0.155, -0.065))
FLAME = ((-0.05, 0.05), (0.30, 0.40), (-0.07, 0.2))
# A landmark's still water lies level over nothing: past its edge, this far, metres, a bank must stand at or over it,
# or the side under the edge shows, a trench or the void. A kit piece's water lies on the room's floor, which runs
# under it.
WATER_OUT_M = 0.03
LEVEL_M = 0.001
# How many offending corners or triangles a problem quotes.
EXAMPLES = 1


def _box(x=(-FAR, FAR), y=(-FAR, FAR), z=(-FAR, FAR)):
    return (x[0], y[0], z[0], x[1], y[1], z[1])


def dome_drop(reach):
    """How far the smallest dome's underside lies below its top at `reach` metres from it, seen from above."""
    share = min(1.0, reach / DOME_RADIUS_M)
    return DOME_RISE_M * (1 - math.sqrt(1 - share * share))


def _within(why, x=None, y=None, z=None):
    """Rules that keep a piece inside limits: one box past each limit given, (low, high) an axis, None for no limit
    that side."""
    rules = []
    for axis, limits in (('x', x), ('y', y), ('z', z)):
        if limits is None:
            continue
        low, high = limits
        if low is not None:
            rules.append((f'reach {axis} < {low:g} ({why})', _box(**{axis: (-FAR, low)})))
        if high is not None:
            rules.append((f'reach {axis} > {high:g} ({why})', _box(**{axis: (high, FAR)})))
    return rules


def _band(why, z, half_x=None, y_high=None, half_y=None):
    """Rules for a height band z (low, high): x within ±half_x, y at most y_high, and y within ±half_y there."""
    rules = []
    if half_x is not None:
        rules.append((why, _box(x=(half_x, FAR), z=z)))
        rules.append((why, _box(x=(-FAR, -half_x), z=z)))
    if y_high is not None:
        rules.append((why, _box(y=(y_high, FAR), z=z)))
    if half_y is not None:
        rules.append((why, _box(y=(half_y, FAR), z=z)))
        rules.append((why, _box(y=(-FAR, -half_y), z=z)))
    return rules


def kit_rules(piece, least, height, apex=False):
    """The boxes a kit piece may not reach into, each with why: `least` is the style's least ceiling and `height` the
    piece's own top, metres (a wall's cap hangs from the ceiling by it); `apex` when the style lays its ceiling pieces
    at a dome's top or a vault's ridge."""
    low = (-FAR, 2.4)
    if piece in ('door.a', 'door.b'):
        return (_within('a doorway edge spans x ±1.6; faces stand at most 0.12 proud', x=(-1.6, 1.6), y=(-0.12, 0.42))
                + _within('a door piece stands at most 3.4 high', z=(None, 3.4))
                + [(f'stand in the way through (|x| < {DOORWAY_HALF_M} below z 2.3)',
                    _box(x=(-DOORWAY_HALF_M, DOORWAY_HALF_M), z=(-FAR, 2.3)))])
    if piece == 'pillar.base':
        return (_within('a base stands z 0..0.6', z=(0, 0.6))
                + _band('stand past ±0.55 below z 0.25', (-FAR, 0.25), half_x=0.55, half_y=0.55)
                + _band('stand past ±0.35 from z 0.25 to 2.4', (0.25, 2.4), half_x=0.35, half_y=0.35))
    if piece == 'pillar.shaft':
        return (_within('a shaft is a unit z 0..1, stretched', z=(0, 1))
                + _band('stand past ±0.35 (a shaft spans z 0.25..2.4)', (-FAR, FAR), half_x=0.35, half_y=0.35))
    if piece == 'pillar.capital':
        return (_within('a capital stands z 0..0.7', z=(0, 0.7))
                + _band('stand past ±0.7', (-FAR, FAR), half_x=0.7, half_y=0.7))
    if piece in ('wall.base', 'wall.shaft', 'wall.cap'):
        cell = _within('a wall piece keeps to its cell, x ±1.6', x=(-1.6, 1.6))
        strict = 'stand past y 0.3 or |x| 0.8 below z 2.4'
        if piece == 'wall.base':
            return (cell + _within('a base stands on the floor, under the least ceiling', z=(0, least))
                    + _band(strict, low, half_x=0.8, y_high=0.3) + _band('stand past y 0.6', (2.4, FAR), y_high=0.6))
        if piece == 'wall.shaft':
            return (cell + _within('a shaft is a unit z 0..1, stretched', z=(0, 1))
                    + _band(f'{strict} (a shaft spans it)', (-FAR, FAR), half_x=0.8, y_high=0.3))
        # The cap's top meets the ceiling: under the least one, its foot hangs lowest.
        below = 2.4 - (least - height)
        return (cell + _within('a cap stands z 0.. under the least ceiling', z=(0, least))
                + _band('stand past y 0.6', (-FAR, FAR), y_high=0.6)
                + _band(f'{strict} (a cap under the least ceiling reaches below z {below:g})', (-FAR, below),
                        half_x=0.8, y_high=0.3))
    if piece in ('feature.a', 'feature.b'):
        return _within('a feature keeps y ≤ 0.3, |x| ≤ 0.8, z ≤ 3.0', x=(-0.8, 0.8), y=(None, 0.3), z=(None, 3.0))
    if piece in ('ceiling.a', 'ceiling.b', 'ceiling.c'):
        hang = round(least - 2.4, 4)
        near = (-APEX_HALF_M, APEX_HALF_M)
        return (_within('a ceiling piece keeps to its cell, ±1.6', x=(-1.6, 1.6), y=(-1.6, 1.6))
                + _within(f'a ceiling piece hangs at most {hang:g} (least ceiling less 2.4) under z 0', z=(-hang, 0))
                + (_within(f"a ceiling piece at a dome's top or a vault's ridge keeps within ±{APEX_HALF_M:g}",
                           x=near, y=near) if apex else []))
    if piece in ('floor.a', 'floor.b'):
        return _within('a floor piece lies within ±1.6, z ≤ 0.05', x=(-1.6, 1.6), y=(-1.6, 1.6), z=(None, 0.05))
    if piece == 'sconce':
        return (_within('a sconce keeps y ≤ 0.42, |x| ≤ 0.2', x=(-0.2, 0.2), y=(None, 0.42))
                + [("stand in the code's flame over the cup", _box(*FLAME))])
    if piece in ('portal', 'exit'):
        return (_within('an arch keeps |x| ≤ 1.3, y ≤ 0.3, z ≤ 3.1', x=(-1.3, 1.3), y=(None, 0.3), z=(None, 3.1))
                + [("stand before the code's face (1.4 × 2.4 at y 0.04)", _box(x=(-0.7, 0.7), y=(0.02, FAR),
                                                                                z=(0, 2.4)))])
    raise KeyError(f'{piece!r} is no kit piece')


def _clip(points, axis, value, sign):
    """The part of a convex polygon where sign * (coordinate - value) >= 0 (a polygon of any number of corners)."""
    kept = []
    for index, point in enumerate(points):
        after = points[(index + 1) % len(points)]
        here = sign * (point[axis] - value)
        there = sign * (after[axis] - value)
        if here >= 0:
            kept.append(point)
        if (here >= 0) != (there >= 0) and here != there:
            share = here / (here - there)
            kept.append(tuple(start + (end - start) * share for start, end in zip(point, after)))
    return kept


def reaches(corners, box):
    """Whether a triangle reaches into a box (x0, y0, z0, x1, y1, z1) by more than TOUCH_M."""
    for axis in range(3):
        low, high = box[axis] + TOUCH_M, box[axis + 3] - TOUCH_M
        if min(corner[axis] for corner in corners) >= high or max(corner[axis] for corner in corners) <= low:
            return False
    polygon = list(corners)
    for axis in range(3):
        polygon = _clip(_clip(polygon, axis, box[axis] + TOUCH_M, 1), axis, box[axis + 3] - TOUCH_M, -1)
        if not polygon:
            return False
    return True


def _quote(corners):
    return '(' + '), ('.join(', '.join(f'{value:.3f}' for value in corner) for corner in corners) + ')'


def _broken(module, triangles, rules):
    found = []
    for why, box in rules:
        hits = [corners for corners in triangles if reaches(corners, box)]
        if hits:
            found.append(f'{module}: {len(hits)} triangle(s) {why}, e.g. corners {_quote(hits[0])}')
    return found


def _grown(landmark):
    return [(x0 - WALK_GROW_M, y0 - WALK_GROW_M, x1 + WALK_GROW_M, y1 + WALK_GROW_M)
            for x0, y0, x1, y1, _ in landmark['solids']]


def _over(point, rects):
    return any(x0 - TOUCH_M <= point[0] <= x1 + TOUCH_M and y0 - TOUCH_M <= point[1] <= y1 + TOUCH_M
               for x0, y0, x1, y1 in rects)


def _minus(polygon, rect):
    """The pieces of a convex polygon outside a rectangle (x0, y0, x1, y1), seen from above, by more than TOUCH_M."""
    x0, y0, x1, y1 = (rect[0] - TOUCH_M, rect[1] - TOUCH_M, rect[2] + TOUCH_M, rect[3] + TOUCH_M)
    xs, ys = [point[0] for point in polygon], [point[1] for point in polygon]
    if min(xs) >= x1 or max(xs) <= x0 or min(ys) >= y1 or max(ys) <= y0:
        return [polygon]
    outside, rest = [], polygon
    for axis, low, high in ((0, x0, x1), (1, y0, y1)):
        outside += [piece for piece in (_clip(rest, axis, low, -1), _clip(rest, axis, high, 1)) if piece]
        rest = _clip(_clip(rest, axis, low, 1), axis, high, -1)
        if not rest:
            break
    return outside


def walk_zone(triangles, landmark):
    """The corners, and the triangles with no such corner, that stand in the walk zone (z 0.05..2.2) outside every
    solid grown by 0.05 m, seen from above."""
    rects = _grown(landmark)
    corners_out, spans = {}, []
    for corners in triangles:
        if min(corner[2] for corner in corners) >= WALK_HIGH_M or max(corner[2] for corner in corners) <= WALK_LOW_M:
            continue
        loose = [corner for corner in corners if WALK_LOW_M < corner[2] < WALK_HIGH_M and not _over(corner, rects)]
        if loose:
            corners_out.update(dict.fromkeys(loose))
            continue
        pieces = [_clip(_clip(list(corners), 2, WALK_LOW_M + TOUCH_M, 1), 2, WALK_HIGH_M - TOUCH_M, -1)]
        for rect in rects:
            pieces = [part for piece in pieces if piece for part in _minus(piece, rect)]
        if any(pieces):
            spans.append(corners)
    return list(corners_out), spans


def _bucketed(triangles):
    """Triangles filed by the BUCKET_M squares they cover seen from above (x and y), to find those over a point."""
    buckets = {}
    for corners in triangles:
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = corners
        area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
        if abs(area) < 1e-9:
            continue
        xs, ys = (ax, bx, cx), (ay, by, cy)
        for column in range(int(min(xs) // BUCKET_M), int(max(xs) // BUCKET_M) + 1):
            for row in range(int(min(ys) // BUCKET_M), int(max(ys) // BUCKET_M) + 1):
                buckets.setdefault((column, row), []).append((ax, ay, az, bx, by, bz, cx, cy, cz, area))
    return buckets


def _heights(buckets, x, y):
    """The height (z) at (x, y) of each filed triangle that covers it seen from above."""
    for ax, ay, az, bx, by, bz, cx, cy, cz, area in buckets.get((int(x // BUCKET_M), int(y // BUCKET_M)), ()):
        first = ((bx - x) * (cy - y) - (cx - x) * (by - y)) / area
        second = ((cx - x) * (ay - y) - (ax - x) * (cy - y)) / area
        if first >= -1e-6 and second >= -1e-6 and first + second <= 1 + 1e-6:
            yield first * az + second * bz + (1 - first - second) * cz


def floor_gaps(triangles, landmark):
    """The points of a grid over the footprint, FLOOR_STEP_M apart, that no floor covers seen from above. Where a body
    can stand, outside every solid grown by WALK_GROW_M, only a floor within WALK_LOW_M of the room's own counts (a
    puddle's dip hides under a foot), so a sunk or a raised one leaves the body hanging; over a solid (a pit, a basin,
    a lake) anything that closes the void does."""
    width, depth = (cells * catalog.CELL_M for cells in landmark['cells'])
    anywhere = _bucketed(triangles)
    level = _bucketed([corners for corners in triangles
                       if all(-WALK_LOW_M <= corner[2] <= WALK_LOW_M for corner in corners)])
    solids = _grown(landmark)
    columns, rows = round(width / FLOOR_STEP_M), round(depth / FLOOR_STEP_M)
    points = [((column + 0.5) * FLOOR_STEP_M, (row + 0.5) * FLOOR_STEP_M) for column in range(columns)
              for row in range(rows)]
    return [point for point in points if not _covered(anywhere if _over(point, solids) else level, *point)]


def edge_steps(triangles, landmark):
    """The points FLOOR_STEP_M apart along the footprint's edges, EDGE_IN_M inside and outside every solid grown by
    WALK_GROW_M, where the topmost floor (at most WALK_LOW_M high) stands off z 0 by more than TOUCH_M and no skirt
    closes the side from it, or from z 0 if it is sunk, down to SKIRT_M: each (x, y, its height or None)."""
    width, depth = (cells * catalog.CELL_M for cells in landmark['cells'])
    over = _bucketed(triangles)
    solids = _grown(landmark)
    found = []
    for axis, edge, inward, length in ((0, 0.0, 1, depth), (0, width, -1, depth), (1, 0.0, 1, width),
                                       (1, depth, -1, width)):
        other = 1 - axis
        # A skirt stands in the edge's plane: seen from the room, it covers (along, z) there.
        near = [corners for corners in triangles if all(abs(corner[axis] - edge) <= EDGE_IN_M for corner in corners)]
        skirt = _bucketed([tuple((corner[other], corner[2], corner[axis]) for corner in corners) for corners in near])
        for step in range(round(length / FLOOR_STEP_M)):
            along = (step + 0.5) * FLOOR_STEP_M
            point = [0.0, 0.0]
            point[axis], point[other] = edge + inward * EDGE_IN_M, along
            if _over(point, solids):
                continue
            top = max((z for z in _heights(over, *point) if z <= WALK_LOW_M), default=None)
            if top is None or (abs(top) > TOUCH_M and not _closed(skirt, along, top)):
                found.append((point[0], point[1], top))
    return found


def _covered(buckets, x, y):
    return next(_heights(buckets, x, y), None) is not None


def _closed(skirt, along, top):
    """Whether a skirt (faces in an edge's plane, filed by along and z) closes the side at `along` from a floor's
    `top`, or from z 0 over a sunk one, down to SKIRT_M: sampled every centimetre."""
    high, low = max(top, 0.0) - TOUCH_M, SKIRT_M + TOUCH_M
    count = math.ceil((high - low) / 0.01)
    return all(_covered(skirt, along, low + (high - low) * k / count) for k in range(count + 1))


def water_edges(triangles, water):
    """The points WATER_OUT_M past the middle of each edge of still water (a level water triangle's edge that no
    other water triangle has, level or running down a face) where none of the other triangles covers it at or over
    the water: each (x, y, the water's height)."""
    def key(ends):
        return tuple(sorted(tuple(round(value, 4) for value in end) for end in ends))

    shared = {}
    for corners in water:
        for k in range(3):
            edge = key((corners[k], corners[(k + 1) % 3]))
            shared[edge] = shared.get(edge, 0) + 1
    kept = {tuple(corners) for corners in water}
    others = _bucketed([corners for corners in triangles if tuple(corners) not in kept])
    found = []
    for corners in water:
        if max(c[2] for c in corners) - min(c[2] for c in corners) > LEVEL_M:
            continue
        for k in range(3):
            ends, third = (corners[k], corners[(k + 1) % 3]), corners[(k + 2) % 3]
            if shared[key(ends)] == 1:
                found += _bare(others, ends, third)
    return found


def _bare(others, ends, third):
    """The point WATER_OUT_M past the middle of still water's edge `ends`, away from its triangle's `third` corner,
    if none of `others` covers it at or over the water there."""
    (ax, ay, az), (bx, by, _) = ends
    length = math.hypot(bx - ax, by - ay)
    if length < 1e-6:
        return []
    middle = ((ax + bx) / 2, (ay + by) / 2)
    out = ((by - ay) / length, -(bx - ax) / length)
    if out[0] * (third[0] - middle[0]) + out[1] * (third[1] - middle[1]) > 0:
        out = (-out[0], -out[1])
    x, y = middle[0] + out[0] * WATER_OUT_M, middle[1] + out[1] * WATER_OUT_M
    top = max(_heights(others, x, y), default=None)
    return [(x, y, az)] if top is None or top < az - TOUCH_M else []


def _water_problem(module, edges):
    x, y, z = edges[0]
    return (f'{module}: still water at z {z:.3f} ends over no bank at {len(edges)} point(s) of its edge, e.g. '
            f'({x:.3f}, {y:.3f}): the side under the edge shows')


def landmark_problems(landmark, triangles):
    """Every rule a landmark's triangles break: its footprint, its height, the walk zone and its floor."""
    module = landmark['module']
    width, depth = (cells * catalog.CELL_M for cells in landmark['cells'])
    top = round(catalog.least_ceiling(landmark['style']) - 0.1, 4)
    found = []
    if len(triangles) > LANDMARK_TRIANGLES:
        found.append(f'{module}: {len(triangles)} triangles, over the {LANDMARK_TRIANGLES} a landmark may have')
    rules = (_within(f'its footprint is {width:g} × {depth:g}', x=(0, width), y=(0, depth))
             + _within(f"the style's least ceiling less 0.1 is {top:g}", z=(None, top)))
    found += _broken(module, triangles, rules)
    loose, spans = walk_zone(triangles, landmark)
    if loose:
        found.append(f'{module}: {len(loose)} corner(s) in the walk zone (z 0.05..2.2) over no solid grown 0.05, '
                     f'e.g. {_quote(loose[:EXAMPLES])}')
    if spans:
        found.append(f'{module}: {len(spans)} triangle(s) span the walk zone between solids, e.g. corners '
                     f'{_quote(spans[0])}')
    gaps = floor_gaps(triangles, landmark)
    if gaps:
        found.append(f'{module}: the floor is open at {len(gaps)} point(s) of the footprint, e.g. '
                     f'({gaps[0][0]:.2f}, {gaps[0][1]:.2f}): a landmark draws its own floor over all of it')
    steps = edge_steps(triangles, landmark)
    if steps:
        x, y, z = steps[0]
        height = 'no floor' if z is None else f'z {z:.3f}'
        found.append(f'{module}: the floor stands off the room\'s z 0 at {len(steps)} point(s) of its edge with no '
                     f'skirt to {SKIRT_M:g}, e.g. ({x:.3f}, {y:.3f}) at {height}: the void shows there')
    return found


def kit_budget(piece):
    """The most triangles a kit piece may have: its own kind's budget (`door.a` a door's, `pillar.base` its own)."""
    return KIT_TRIANGLES.get(piece, KIT_TRIANGLES.get(piece.split('.')[0], 0))


def kit_problems(module, piece, triangles):
    """Every rule a kit piece's triangles break."""
    style = module.split('.')[0]
    found = []
    budget = kit_budget(piece)
    if len(triangles) > budget:
        found.append(f'{module}: {len(triangles)} triangles, over the {budget} a {piece} may have')
    height = max((corner[2] for corners in triangles for corner in corners), default=0.0)
    apex = catalog.STYLES[style]['ceiling'] == 'apex'
    found += _broken(module, triangles, kit_rules(piece, catalog.least_ceiling(style), height, apex))
    if apex and piece.startswith('ceiling.'):
        above = list(dict.fromkeys(corner for corners in triangles for corner in corners
                                   if corner[2] > TOUCH_M - dome_drop(math.hypot(corner[0], corner[1]))))
        if above:
            found.append(f"{module}: {len(above)} corner(s) rise into the smallest dome's curve (radius "
                         f'{DOME_RADIUS_M:g}, rise {DOME_RISE_M:g}) over its top, e.g. {_quote(above[:EXAMPLES])}')
    if piece == 'sconce' and not any(reaches(corners, _box(*CUP)) for corners in triangles):
        found.append(f"{module}: nothing holds the code's flame: the cup stands at (0, 0.35, -0.15..-0.07)")
    return found


def problems(module, triangles, water=()):
    """Every rule a module's triangles break, readable, one a line; an empty list passes. `water` is those of its
    triangles that are water."""
    def exact(listed):
        return [tuple(tuple(float(value) for value in corner) for corner in corners) for corners in listed]

    triangles, water = exact(triangles), exact(water)
    if not triangles:
        return [f'{module}: no triangles']
    piece = catalog.piece_of(module)
    if piece is not None:
        return kit_problems(module, piece, triangles)
    landmark = catalog.landmark(module)
    if landmark is None:
        return [f'{module}: neither a kit piece nor a landmark in content/dungeon']
    edges = water_edges(triangles, water)
    return landmark_problems(landmark, triangles) + ([_water_problem(module, edges)] if edges else [])
