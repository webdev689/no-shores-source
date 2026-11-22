"""The sanctum's openings: door.a and door.b dress a doorway round the code's jambs (x ±0.9..1.6, y 0..0.3; the room
on -y, the corridor on +y), the portal and the exit frame the code's faces (1.4 × 2.4 at y 0.04, the room on +y).
Runes are plates laid a hair proud, and the corridor's face is plainer than the room's: a door is laid at every
doorway.
"""
import math

from shapes import add, mul

from . import motifs
from .motifs import ROUND

# door.a: the pointed head springs over the colonnettes; its underside clears 2.3 at x ±0.8.
SPRING_A = 1.82
HALF_A = 0.9
RADIUS_A = 1.4
# The portal's head: wide and low enough to keep under 3.1 with its hood.
SPRING_P = 1.76
HALF_P = 0.95
RADIUS_P = 1.1
# The exit's head, clearing the code's face (2.4 high) at x ±0.7.
SPRING_E = 2.11
HALF_E = 0.75
RADIUS_E = 0.9


def offset_curve(half, radius, spring, out, segments=16, y=None, x=0.0):
    """A pointed arch's underside `out` metres outward, as points (x, z), or (x, y, z) at `y`: the offset of a pointed
    arch keeps its two centres, so it is the arch of half + out and radius + out."""
    points = motifs.pointed(half + out, spring, (radius + out) / (2 * (half + out)), segments, x=x)
    return points if y is None else motifs.on_xz(points, y)


def ring(kit, half, radius, spring, inner, outer, y0, y1, part='stone', segments=16, stones=0, joint=0.015, x=0.0):
    """The part of a pointed arch's ring from `inner` to `outer` out from its underside, y0..y1."""
    return kit.arch(half + inner, spring, outer - inner, y0, y1, shape='pointed',
                    sharpness=(radius + inner) / (2 * (half + inner)), segments=segments, stones=stones, joint=joint,
                    part=part, x=x)


def curve_runes(curve, y, count, seed, cell=(0.06, 0.07), toward=-1, margin=0.06, lift=0.004):
    """Rune plates along a curve (x, z) on the face at `y`, each upright to the curve, facing -y (`toward` -1) or
    +y."""
    width, height = cell
    faces = []
    for number in range(count):
        share = margin + (1 - 2 * margin) * (number + 0.5) / count
        (px, pz), (tx, tz) = motifs.along_curve(curve, share)
        along = (tx * -toward, 0.0, tz * -toward)
        up = (-tz, 0.0, tx)
        origin = add((px, y, pz), add(mul(along, -width / 2), mul(up, -height / 2)))
        faces += motifs.glyph(motifs.rune(f'{seed}.{number}'), origin, along, up, width, height, 0.016, lift,
                              front_only=True)
    return faces


def face_runes(seed, count, x0, x1, z0, height, y, toward, front_only=True):
    """A row of runes across x0..x1 on the face at `y` looking along `toward` (-1 or +1 in y)."""
    width = (x1 - x0) / count
    start = (x0 + width * 0.15, y, z0) if toward < 0 else (x1 - width * 0.15, y, z0)
    step = (width, 0.0, 0.0) if toward < 0 else (-width, 0.0, 0.0)
    return motifs.rune_row(seed, count, start, step, (0.0, 0.0, 1.0), width * 0.7, height,
                           depth=0.004 if front_only else 0.012, front_only=front_only)


def halves(curve):
    """An arch's curve (left springing to right) as two halves, each from its springing to the point: a moulding
    swept in one piece over a door's head would reach its picture's darker tile edge on the way."""
    middle = len(curve) // 2
    return [curve[:middle + 1], curve[middle:][::-1]]


def arch_tube(kit, curve, radius, sides):
    """A roll or hood moulding over an arch, in two halves."""
    return kit.join([motifs.tube(kit, half, radius, sides=sides) for half in halves(curve)])


def colonnette(kit, x, y, z0, z1, radius, sides=8):
    """A dark shaft on a small spreading base, its ends hidden in the plinth and the capital."""
    return kit.join([motifs.shaft(kit, x, y, z0 + 0.06, z1, radius, sides=sides),
                     motifs.shaft(kit, x, y, z0, z0 + 0.06, radius + 0.012, 'trim', sides, top=radius)])


def sigil(kit, x, z, size, y, toward, part='brass', whorl=True):
    """The faith's mark: a crescent, horns up, cradling a whorl."""
    outline = [(x + a * size, z + b * size) for a, b in motifs.crescent(1.0, 0.78, 0.42, 6)]
    made = [kit.extrude_outline(outline, y, y + toward * 0.02, plane='xz', part=part)]
    if whorl:
        curl = motifs.spiral((x, z + 0.45 * size), 0.05 * size, 0.42 * size, 1.4, 7)
        made.append(motifs.tube(kit, [(a, y + toward * 0.012, b) for a, b in curl], 0.06 * size, 'relief', sides=4))
    return kit.join(made)


def door_a(kit):
    """A tall pointed arch on clustered dark colonnettes, a rune band round its head on the room's face, a hood over
    it, and a carved tympanum with the faith's mark under its point."""
    made = []
    for side in (1, -1):
        parts = [kit.bevelled_box(0.81, -0.12, 0.0, 1.6, 0.42, 0.3, bevel=0.025, part='trim'),
                 kit.box(0.83, -0.1, 0.3, 1.32, 0.4, 0.36, part='trim'),
                 colonnette(kit, 0.876, -0.04, 0.36, 1.57, 0.058),
                 colonnette(kit, 1.01, -0.055, 0.36, 1.57, 0.05),
                 colonnette(kit, 0.865, 0.15, 0.36, 1.57, 0.05),
                 colonnette(kit, 0.876, 0.34, 0.36, 1.57, 0.058),
                 kit.bevelled_box(0.8, -0.105, 1.57, 1.3, 0.405, 1.75, bevel=0.02, part='relief'),
                 kit.box(0.8, -0.12, 1.75, 1.34, 0.42, SPRING_A, part='trim'),
                 motifs.plates(kit, face_runes(f'door.a.cap.{side}', 2, 0.86, 1.26, 1.61, 0.1, -0.105, -1), 'trim',
                               'runes')]
        piece = kit.join(parts)
        made.append(piece if side > 0 else kit.scale(piece, -1, 1, 1))
    made.append(ring(kit, HALF_A, RADIUS_A, SPRING_A, 0.0, 0.16, -0.06, 0.36, segments=14))
    made.append(ring(kit, HALF_A, RADIUS_A, SPRING_A, 0.07, 0.16, -0.105, -0.06, part='relief', segments=14))
    band = offset_curve(HALF_A, RADIUS_A, SPRING_A, 0.115, 32)
    made.append(motifs.plates(kit, curve_runes(band, -0.105, 11, 'door.a.band'), 'trim', 'runes'))
    for y in (-0.06, 0.36):
        made.append(arch_tube(kit, offset_curve(HALF_A, RADIUS_A, SPRING_A, 0.035, 14, y), 0.045, 5))
    # The hood only on the room's face: the corridor's ceiling, 3.2, would cut it.
    made.append(arch_tube(kit, offset_curve(HALF_A, RADIUS_A, SPRING_A, 0.19, 14, -0.08), 0.033, 4))
    # The code's lintel stands at 2.8 inside the point: a lower lintel and a tympanum cover it.
    made.append(kit.box(-0.66, -0.05, 2.56, 0.66, 0.35, 2.66, part='trim'))
    head = [(px, pz) for px, pz in motifs.pointed(HALF_A, SPRING_A, RADIUS_A / (2 * HALF_A), 16) if pz > 2.68]
    made.append(kit.extrude_outline([(-0.63, 2.66)] + head + [(0.63, 2.66)], -0.03, 0.33, plane='xz',
                                    part='relief'))
    made.append(sigil(kit, 0.0, 2.84, 0.14, -0.03, -1))
    made.append(sigil(kit, 0.0, 2.84, 0.14, 0.33, 1, whorl=False))
    return kit.join(made)


def trefoil(spring=2.3, side=(0.55, 0.35), top=(2.5, 0.3), steps=6):
    """A trefoil head's underside (x, z) from its right springing at x = side's centre + radius to its left: two side
    lobes and a higher middle one, meeting at cusps."""
    (cx, radius), (cz, top_radius) = side, top
    # Where the right lobe meets the middle one: two circles' upper crossing.
    gap = math.hypot(cx, cz - spring)
    along = (gap * gap + radius * radius - top_radius * top_radius) / (2 * gap)
    rise = math.sqrt(max(radius * radius - along * along, 0.0))
    ux, uz = -cx / gap, (cz - spring) / gap
    cusp = (cx + ux * along - uz * rise, spring + uz * along + ux * rise)
    if cusp[1] < spring + uz * along - ux * rise:
        cusp = (cx + ux * along + uz * rise, spring + uz * along - ux * rise)
    right_end = math.atan2(cusp[1] - spring, cusp[0] - cx)
    middle_start = math.atan2(cusp[1] - cz, cusp[0])
    points = [(cx + radius * math.cos(right_end * k / steps), spring + radius * math.sin(right_end * k / steps))
              for k in range(steps + 1)]
    sweep = math.pi - 2 * middle_start
    points += [(top_radius * math.cos(middle_start + sweep * k / steps),
                cz + top_radius * math.sin(middle_start + sweep * k / steps)) for k in range(1, steps)]
    points += [(-px, pz) for px, pz in reversed(points[:steps + 1])]
    return points, cusp


def door_b(kit):
    """A trefoil head cut in a solid pointed slab, rolled along its lobes and knobbed at its cusps on the room's face, a
    carved roundel with a brass boss in each spandrel, on single dark colonnettes."""
    inner, cusp = trefoil()
    outer = offset_curve(1.0, 1.05, 2.3, 0.0, 16)
    made = [kit.extrude_outline(outer + inner, -0.08, 0.38, plane='xz', part='stone'),
            motifs.tube(kit, motifs.on_xz(inner, -0.08), 0.036, sides=4),
            arch_tube(kit, offset_curve(1.0, 1.05, 2.3, 0.01, 16, -0.08), 0.028, 4)]
    for hand in (1, -1):
        made.append(motifs.turned(kit, [(0.0, -0.06), (0.035, -0.035), (0.04, 0.0), (0.0, 0.04)], hand * cusp[0],
                                  -0.08, cusp[1] - 0.02, 6, 'relief', True))
        for y, toward in ((-0.08, -1), (0.38, 1)):
            centre = (hand * 0.6, y, 2.92)
            made.append(kit.revolve([(0.11, 0.0), (0.1, 0.02), (0.06, 0.025), (0.04, 0.035), (0.0, 0.04)],
                                    start=centre, axis=(0.0, toward, 0.0), sides=10, part='relief', smooth=ROUND))
        made.append(kit.revolve([(0.035, 0.0), (0.0, 0.025)], start=(hand * 0.6, -0.095, 2.92),
                                axis=(0.0, -1.0, 0.0), sides=6, part='brass', smooth=ROUND))
    for side in (1, -1):
        parts = [kit.bevelled_box(0.81, -0.12, 0.0, 1.6, 0.42, 0.32, bevel=0.025, part='trim'),
                 kit.box(0.83, -0.1, 0.32, 1.25, 0.4, 0.38, part='trim'),
                 colonnette(kit, 0.885, -0.035, 0.38, 2.1, 0.064, sides=10),
                 colonnette(kit, 0.885, 0.335, 0.38, 2.1, 0.064, sides=10),
                 motifs.shaft(kit, 0.86, 0.15, 0.38, 2.1, 0.05, 'trim', 6),
                 kit.bevelled_box(0.8, -0.1, 2.1, 1.3, 0.4, 2.3, bevel=0.02, part='relief'),
                 motifs.plates(kit, face_runes(f'door.b.cap.{side}', 2, 0.86, 1.24, 2.14, 0.12, -0.1, -1), 'trim',
                               'runes')]
        piece = kit.join(parts)
        made.append(piece if side > 0 else kit.scale(piece, -1, 1, 1))
    return kit.join(made)


def portal(kit):
    """A grand pointed arch of eleven voussoirs, a rune cut in each, on clustered colonnettes with rune capitals, under
    a hood moulding, and the faith's mark over the code's face."""
    made = []
    for side in (1, -1):
        parts = [kit.bevelled_box(0.72, 0.0, 0.0, 1.3, 0.12, 1.6, bevel=0.02),
                 kit.bevelled_box(0.71, 0.0, 0.0, 1.3, 0.3, 0.32, bevel=0.025, part='trim'),
                 kit.bevelled_box(0.73, 0.0, 0.32, 1.26, 0.28, 0.38, bevel=0.02, part='trim'),
                 colonnette(kit, 0.79, 0.2, 0.38, 1.56, 0.064, sides=10),
                 colonnette(kit, 0.98, 0.225, 0.38, 1.56, 0.058, sides=10),
                 colonnette(kit, 1.17, 0.2, 0.38, 1.56, 0.058, sides=10),
                 kit.bevelled_box(0.71, 0.0, 1.56, 1.29, 0.285, 1.7, bevel=0.02, part='relief'),
                 kit.bevelled_box(0.7, 0.0, 1.7, 1.3, 0.3, 1.76, bevel=0.02, part='trim'),
                 motifs.plates(kit, face_runes(f'portal.cap.{side}', 3, 0.76, 1.26, 1.58, 0.1, 0.285, 1), 'trim',
                               'runes')]
        piece = kit.join(parts)
        made.append(piece if side > 0 else kit.scale(piece, -1, 1, 1))
    made.append(ring(kit, HALF_P, RADIUS_P, SPRING_P, 0.0, 0.2, 0.04, 0.27, part='trim', segments=33, stones=11,
                     joint=0.02))
    middle = offset_curve(HALF_P, RADIUS_P, SPRING_P, 0.1, 44)
    made.append(motifs.plates(kit, curve_runes(middle, 0.27, 11, 'portal.voussoir', cell=(0.085, 0.1), toward=1,
                                               margin=0.0), 'relief', 'runes'))
    made.append(motifs.tube(kit, offset_curve(HALF_P, RADIUS_P, SPRING_P, 0.215, 22, 0.26), 0.025, sides=6))
    made.append(motifs.tube(kit, offset_curve(HALF_P, RADIUS_P, SPRING_P, 0.0, 22, 0.25), 0.03, sides=6))
    made.append(kit.bevelled_box(-0.76, 0.0, 2.4, 0.76, 0.14, 2.5, bevel=0.015, part='trim'))
    head = [(px, pz) for px, pz in motifs.pointed(HALF_P, SPRING_P, RADIUS_P / (2 * HALF_P), 24) if pz > 2.52]
    made.append(kit.extrude_outline([(-0.72, 2.5)] + head + [(0.72, 2.5)], 0.0, 0.035, plane='xz', part='relief'))
    made.append(sigil(kit, 0.0, 2.66, 0.12, 0.035, 1))
    return kit.join(made)


def pinnacle(kit, x):
    """A buttress beside the exit: a dark shaft, a blind lancet on its face, a gablet, a pyramid spire and a knob."""
    lancet = [(x - 0.09, 0.9)] + motifs.pointed(0.09, 1.85, 0.75, 8, x=x) + [(x + 0.09, 0.9)]
    made = [kit.bevelled_box(x - 0.21, 0.0, 0.0, x + 0.21, 0.26, 0.3, bevel=0.02, part='trim'),
            kit.bevelled_box(x - 0.17, 0.0, 0.3, x + 0.17, 0.22, 2.35, bevel=0.015, part='stoneAlt'),
            kit.extrude_outline(lancet, 0.22, 0.235, plane='xz', part='relief'),
            kit.extrude_outline([(x - 0.19, 2.35), (x + 0.19, 2.35), (x, 2.6)], 0.0, 0.24, plane='xz', part='trim'),
            kit.cone((x, 0.12, 2.5), (x, 0.12, 3.02), 0.16, 0.0, sides=4, seam=(0.7071, -0.7071, 0.0),
                     part='stoneAlt', smooth=None),
            motifs.turned(kit, [(0.0, 0.0), (0.03, 0.02), (0.02, 0.06), (0.0, 0.08)], x, 0.12, 3.0, 6, 'brass',
                          True)]
    return kit.join(made)


def exit_door(kit):
    """A slender pointed surround with one roll moulding running up, over and down unbroken, between two pinnacled
    buttresses, the faith's mark in its head."""
    outer = offset_curve(HALF_E, RADIUS_E, SPRING_E, 0.09, 16)
    inner = motifs.pointed(HALF_E, SPRING_E, RADIUS_E / (2 * HALF_E), 16)
    outline = ([(-HALF_E - 0.09, 0.0)] + outer + [(HALF_E + 0.09, 0.0), (HALF_E, 0.0)] + inner[::-1]
               + [(-HALF_E, 0.0)])
    made = [kit.extrude_outline(outline, 0.0, 0.16, plane='xz')]
    edge = offset_curve(HALF_E, RADIUS_E, SPRING_E, 0.045, 16, 0.16)
    for half in halves(edge):
        made.append(motifs.tube(kit, [(half[0][0], 0.16, 0.36)] + half, 0.034, sides=6))
    for side in (1, -1):
        made.append(kit.bevelled_box(side * 0.74, 0.0, 0.0, side * 0.86, 0.2, 0.36, bevel=0.015, part='trim'))
        made.append(pinnacle(kit, side * 1.05))
    made.append(kit.bevelled_box(-0.77, 0.0, 2.4, 0.77, 0.1, 2.47, bevel=0.012, part='trim'))
    head = [(px, pz) for px, pz in inner if pz > 2.49]
    made.append(kit.extrude_outline([(-0.71, 2.47)] + head + [(0.71, 2.47)], 0.0, 0.03, plane='xz', part='relief'))
    made.append(sigil(kit, 0.0, 2.64, 0.1, 0.03, 1))
    return kit.join(made)


def build(kit):
    return {'door.a': door_a(kit), 'door.b': door_b(kit), 'portal': portal(kit), 'exit': exit_door(kit)}
