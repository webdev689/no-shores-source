"""Growing shapes as plain faces, without Blender, as shapes.py's are: tapering limbs along a path, leaves, fronds and
blades. Leaves and blades are thin sheets with a face on each side, so they read from either side.
"""
import math

from details import _square_to, seeded
from shapes import add, cross, facing, length, mul, out_from, sub, sweep, unit


def tube(points, radii, sides=6, cap=True):
    """A round limb along a path (a list of points), its radius at each point `radii` (a list as long, or one
    number), capped at its ends: a trunk, a branch, a root, a vine. u runs along it, v round it."""
    radii = radii if isinstance(radii, (list, tuple)) else [radii] * len(points)
    across = _square_to(unit(sub(points[1], points[0])), (0.0, 1.0, 0.0))
    sections = []
    for index, (point, radius) in enumerate(zip(points, radii)):
        ahead = points[min(index + 1, len(points) - 1)]
        behind = points[max(index - 1, 0)]
        direction = unit(sub(ahead, behind))
        across = _square_to(direction, across)
        other = cross(direction, across)
        sections.append([add(point, add(mul(across, radius * math.cos(math.tau * k / sides)),
                                        mul(other, radius * math.sin(math.tau * k / sides)))) for k in range(sides)])
    faces = sweep(sections, outward=out_from(list(points)))
    if cap:
        for end, inward in ((0, 1), (-1, -2)):
            if radii[end] > 1e-6:
                ring = sections[end]
                faces.append(facing([(spot, (spot[0], spot[2])) for spot in ring], sub(points[end], points[inward])))
    return faces


def bent(start, end, bow=(0.0, 0.0, 0.0), steps=4):
    """Points from `start` to `end`, bowed by `bow` (a vector) at the middle: a curved trunk or a drooping branch."""
    return [add(add(start, mul(sub(end, start), share)), mul(bow, 4 * share * (1 - share)))
            for share in (step / steps for step in range(steps + 1))]


def sheet(rows):
    """Two-sided faces between rows of points (each row across the sheet), u across and v along."""
    faces = []
    for low, high in zip(rows, rows[1:]):
        for k in range(len(low) - 1):
            ring = [low[k], low[k + 1], high[k + 1], high[k]]
            corners = [(spot, (spot[0] + spot[1], spot[2])) for spot in ring]
            faces.append(corners)
            faces.append(corners[::-1])
    return faces


def frond(base, heading, reach, width, droop, rise=0.3, segments=4, fold=0.3):
    """A long leaf from `base`, heading `heading` degrees round the upright (0 east, 90 south), out `reach` metres,
    rising `rise` of it then drooping `droop` metres by its tip, `width` at its widest, folded along its rib by
    `fold` of its width: a palm's frond, a fern's, a long reed leaf."""
    out = (math.cos(math.radians(heading)), math.sin(math.radians(heading)), 0.0)
    side = (-out[1], out[0], 0.0)
    rows = []
    for step in range(segments + 1):
        share = step / segments
        rib = add(base, add(mul(out, reach * share), (0.0, 0.0, reach * rise * share - droop * share * share)))
        half = width / 2 * math.sin(math.pi * min(share * 1.15 + 0.08, 1.0)) if step < segments else 0.0
        rows.append([add(rib, add(mul(side, -half), (0, 0, -fold * half))), rib,
                     add(rib, add(mul(side, half), (0, 0, -fold * half)))])
    return sheet(rows)


def blade(base, heading, height, lean, width, bend=0.5, segments=2):
    """A blade of grass from `base` up `height` metres, leaning `lean` metres toward `heading` degrees by its tip
    (more toward the tip by `bend`), `width` at its foot: grass, a reed, a sedge."""
    out = (math.cos(math.radians(heading)), math.sin(math.radians(heading)), 0.0)
    side = (-out[1], out[0], 0.0)
    rows = []
    for step in range(segments + 1):
        share = step / segments
        rib = add(base, add(mul(out, lean * share ** (1 + bend)), (0.0, 0.0, height * share)))
        half = width / 2 * (1 - share)
        rows.append([add(rib, mul(side, -half)), add(rib, mul(side, half))] if step < segments else [rib, rib])
    return [face for face in sheet(rows) if length(sub(face[0][0], face[2][0])) > 1e-9]


def tuft(x, y, count, height, spread, width, seed=None, segments=2):
    """`count` blades from round (x, y), each arching out until its tip lies 0.6 to 1 of `spread` metres from the
    middle, up to `height`: a tussock, a clump of reeds."""
    draw = seeded(seed, 'tuft', x, y, count, height, spread, width)
    faces = []
    for _ in range(count):
        heading = draw.uniform(0, 360)
        reach = draw.uniform(0, spread * 0.25)
        foot = (x + reach * math.cos(math.radians(heading)), y + reach * math.sin(math.radians(heading)), -0.05)
        faces += blade(foot, heading, height * draw.uniform(0.6, 1.0), spread * draw.uniform(0.6, 1.0) - reach,
                       width, segments=segments)
    return faces
