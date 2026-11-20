"""The caverns' openings: two natural rock arches for doorways (the second studded with crystals), the portal's rock
arch crowded with crystals, the exit's rough rock frame under an explorer's timber lintel, and the sconce, a torch
wedged in a crevice and lashed with rope. Every rock is worn by noise and eased against its envelope.
"""
import math
import random

from details import arch_curve, rope
from shapes import _centre, add, facing, flat, mul, revolve, sub, sweep, unit

from styles.caverns import forms


def _door_limit(point):
    """A doorway edge's room: x ±1.6, faces at most 0.12 proud, under 3.4, the way through left clear."""
    x, y, z = point
    x = forms.ease_over(forms.ease_under(x, 1.585, 0.05), -1.585, 0.05)
    y = forms.ease_over(forms.ease_under(y, 0.41, 0.04), -0.11, 0.04)
    z = forms.ease_under(z, 3.38, 0.06)
    if abs(x) < 0.815 and z < 2.315:
        if 0.815 - abs(x) < 2.315 - z:
            x = math.copysign(0.815, x)
        else:
            z = 2.315
    return x, y, z


def _frame_limit(point):
    """The portal's and the exit's room: |x| ≤ 1.3, y ≤ 0.3, under 3.1, the code's face left clear."""
    x, y, z = point
    x = forms.ease_over(forms.ease_under(x, 1.285, 0.05), -1.285, 0.05)
    y = forms.ease_under(y, 0.29, 0.04)
    z = forms.ease_under(z, 3.085, 0.05)
    if abs(x) < 0.715 and z < 2.415 and y > 0.015:
        if 0.715 - abs(x) < 2.415 - z:
            x = math.copysign(0.715, x)
        else:
            z = 2.415
    return x, y, z


def _in_wall(point):
    """Whether a point of a piece on a wall lies in the wall's rock, where nobody sees it."""
    return point[1] < -0.01


def _arched(half, spring, crown, foot=-0.06):
    """An opening's edge from its left foot up, over a low arch, and down its right."""
    arc = arch_curve(half, spring, 'segmental', rise=crown - spring, segments=14)
    return [(-half, foot)] + arc + [(half, foot)]


def _widths(seed, feet, sides, crown):
    """How far the rock reaches out from the edge along it: wide at the feet, `sides` up the jambs, `crown` over."""
    noise = forms.Noise(seed)

    def width(share):
        middle = 1 - abs(2 * share - 1)
        base = feet + (sides - feet) * min(middle / 0.2, 1.0)
        base += (crown - sides) * max(0.0, (middle - 0.62) / 0.38) ** 1.5
        return base * (1 + 0.16 * noise(share * 7.0))
    return width


def _boulders(spots, seed, limit, floor=0.0):
    """Boulders at spots (centre, radii, detail), worn, broken and eased into the envelope, as faces."""
    faces = []
    for number, (centre, radii, detail) in enumerate(spots):
        faces += forms.boulder(centre, radii, f'{seed} {number}', detail=detail, rough=0.24, cuts=3, floor=floor,
                               limit=limit)
    return faces


def _roots(faces, rays):
    """Where rays (origin, direction) meet the rock: (point, outward) each."""
    return [found for found in (forms.cast(faces, origin, direction) for origin, direction in rays) if found]


def _crystals(roots, seed, piece, count, sizes, toward=None, facing_out=0.55, spread=0.55):
    """Crystals grown at roots (point, outward), `count` a root of `sizes` (radius, length ranges), leaning out of the
    rock by `facing_out` and away from `toward` (x, z); each kept only if it fits the piece."""
    draw = random.Random(f'crystals {seed}')
    grown = []
    for point, normal in roots:
        away = (0.0, 0.0, 1.0) if toward is None else unit((point[0] - toward[0], 0.0, point[2] - toward[1]))
        kept = 0
        for _ in range(count * 8):
            if kept >= count:
                break
            scatter = (draw.uniform(-1, 1), draw.uniform(-1, 1), draw.uniform(-1, 1))
            axis = unit(add(add(mul(normal, facing_out), mul(away, 0.6)), mul(scatter, spread)))
            radius, size = draw.uniform(*sizes[0]), draw.uniform(*sizes[1])
            base = add(add(point, mul(normal, -0.03)),
                       (draw.uniform(-0.08, 0.08), draw.uniform(-0.03, 0.03), draw.uniform(-0.08, 0.08)))
            crystal = forms.crystal(base, axis, radius, size, draw, sides=6 if radius > 0.04 else 5)
            if forms.kit_fits(crystal, piece):
                grown += crystal
                kept += 1
    return grown


def door(seed, studded):
    """A natural rock arch round a doorway: broken rock over the jambs and lintel, boulders heaped at its feet and
    shoulders and one jammed over its crown; `studded`, crystals break out of it."""
    path = _arched(0.83, 2.34, 2.66)
    rock = forms.rim(path, _widths(seed, 0.7, 0.5, 0.62), -0.1, 0.4, seed, rings=8, rough=0.11, grain=1.7,
                     limit=_door_limit, step=0.19)
    draw = random.Random(seed)
    lean = draw.uniform(-0.1, 0.1)
    rock += _boulders([((-1.27, 0.15, 0.3), (0.33, 0.27, 0.38), 1), ((1.3, 0.13, 0.24), (0.29, 0.27, 0.27), 1),
                       ((1.0, 0.2, 0.1), (0.17, 0.2, 0.13), 0), ((-1.16, 0.15, 2.5 + lean), (0.36, 0.27, 0.3), 1),
                       ((0.12 + lean, 0.15, 3.0), (0.42, 0.27, 0.27), 1), ((1.27, 0.15, 1.6), (0.24, 0.26, 0.32), 1),
                       ((-1.32, 0.15, 1.3), (0.22, 0.26, 0.28), 0), ((1.18, 0.15, 2.75), (0.26, 0.26, 0.24), 0)],
                      seed, _door_limit)
    parts = {'stone': rock}
    if studded:
        rays = [((x, -1.0, z), (0.0, 1.0, 0.0)) for x, z in ((-1.2, 0.85), (1.3, 2.25), (-0.45, 2.95),
                                                          (1.05, 0.3), (-1.1, 1.85), (0.55, 3.05))]
        rays += [((x, 1.5, z), (0.0, -1.0, 0.0)) for x, z in ((1.15, 1.2),)]
        rays += [((x, 0.15, 1.8), (0.0, 0.0, 1.0)) for x in (-0.45, 0.3)]
        parts['crystal'] = _crystals(_roots(rock, rays), seed, 'door.b', 3, ((0.03, 0.06), (0.14, 0.4)),
                                     (0.0, 1.2), facing_out=0.25)
    return parts


def portal(seed):
    """A rock arch crowded with crystals round the portal's face: great ones rising at its feet, more up its jambs,
    round its head and hanging from its soffit."""
    path = _arched(0.73, 2.44, 2.73)
    rock = forms.rim(path, _widths(seed, 0.52, 0.46, 0.32), -0.06, 0.27, seed, rings=8, rough=0.1, grain=1.8,
                     limit=_frame_limit, step=0.16)
    rock += _boulders([((-1.02, 0.12, 0.2), (0.27, 0.18, 0.26), 1), ((1.05, 0.12, 0.28), (0.25, 0.18, 0.32), 1),
                       ((-1.0, 0.12, 2.55), (0.3, 0.18, 0.3), 1)], seed, _frame_limit)
    rock = forms.cull(rock, _in_wall)
    feet = [((x, 0.13, -0.05), (0.0, 0.0, 1.0)) for x in (-1.12, -0.92, 0.95, 1.15)]
    front = _roots(rock, [((x, 1.0, z), (0.0, -1.0, 0.0)) for x, z in (
        (-1.05, 1.05), (1.0, 1.4), (-0.95, 2.1), (1.0, 2.3), (-0.6, 2.85), (0.3, 2.95), (0.95, 2.7), (-1.1, 2.6),
        (1.1, 0.8), (-1.0, 1.6), (-0.1, 3.0), (1.05, 1.9))])
    soffit = _roots(rock, [((x, 0.15, 2.0), (0.0, 0.0, 1.0)) for x in (-0.5, -0.15, 0.25, 0.55)])
    crystals = _crystals(feet, f'{seed} feet', 'portal', 4, ((0.045, 0.09), (0.3, 0.75)), (0.0, 1.2),
                         facing_out=1.0, spread=0.45)
    crystals += _crystals(front, f'{seed} jambs', 'portal', 4, ((0.025, 0.06), (0.12, 0.4)), (0.0, 1.2),
                          facing_out=0.2)
    crystals += _crystals(soffit, f'{seed} soffit', 'portal', 3, ((0.015, 0.035), (0.06, 0.2)), (0.0, 4.0),
                          facing_out=0.6)
    return {'stone': rock, 'crystal': crystals}


def _beam(x0, x1, y0, y1, z0, z1, draw):
    """A log hewn square by an explorer: its faces adzed flat, the bark left on its corners, one end cut askew.
    u runs along it, with the grain, and v round it."""
    middle_y, middle_z = (y0 + y1) / 2, (z0 + z1) / 2
    half_y, half_z = (y1 - y0) / 2, (z1 - z0) / 2
    section = []
    for k in range(12):
        angle = math.tau * (k + 0.5) / 12
        c, s = math.cos(angle), math.sin(angle)
        reach = 1.0 / max(abs(c) ** 6 + abs(s) ** 6, 1e-9) ** (1 / 6)
        section.append((half_y * c * min(reach, 1.12) * draw.uniform(0.95, 1.0),
                        half_z * s * min(reach, 1.12) * draw.uniform(0.95, 1.0)))
    skew = draw.uniform(0.04, 0.09)
    sections = []
    for share in (0.0, 0.33, 0.66, 1.0):
        x = x0 + (x1 - x0) * share
        sag = 0.012 * math.sin(math.pi * share)
        sections.append([(x + (skew * (dz / half_z) if share == 1.0 else 0.0), middle_y + dy, middle_z + dz - sag)
                         for dy, dz in section])
    faces = sweep(sections, outward=lambda points, i: sub(_centre(points), (_centre(points)[0], middle_y, middle_z)))
    faces += [facing(flat(sections[0]), (-1.0, 0.0, 0.0)), facing(flat(sections[-1]), (1.0, 0.0, 0.0))]
    return faces


def _wedge(x, y, z, size, toward, draw):
    """A timber wedge driven in along `toward` (+1 or -1 on x), its thin end in."""
    tip, back = x + toward * size, x
    half_y, half_z = size * 0.35, size * 0.22 * draw.uniform(0.8, 1.2)
    points = [(back, y - half_y, z - half_z), (back, y + half_y, z - half_z), (back, y + half_y, z + half_z),
              (back, y - half_y, z + half_z), (tip, y - half_y, z - 0.004), (tip, y + half_y, z - 0.004),
              (tip, y + half_y, z + 0.004), (tip, y - half_y, z + 0.004)]
    rings = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (3, 2, 6, 7), (0, 3, 7, 4), (1, 5, 6, 2)]
    middle = _centre(points)
    return [facing(flat([points[k] for k in ring]), sub(_centre([points[k] for k in ring]), middle))
            for ring in rings]


def exit_frame(seed):
    """A rough rock frame under a lintel some explorer set: a hewn log across the rock jambs, wedged tight, and the
    rock it holds up packed over it."""
    draw = random.Random(seed)
    corner = [(-0.73 + 0.14 * (1 - math.cos(a)), 2.58 + 0.14 * math.sin(a)) for a in (0.4, 0.8, 1.2)]
    path = ([(-0.73, -0.06), (-0.73, 2.58)] + corner + [(-0.45, 2.72), (0.45, 2.72)]
            + [(-x, z) for x, z in reversed(corner)] + [(0.73, 2.58), (0.73, -0.06)])
    rock = forms.rim(path, _widths(seed, 0.55, 0.48, 0.34), -0.06, 0.27, seed, rings=8, rough=0.1, grain=1.8,
                     limit=_frame_limit, step=0.15)
    rock += _boulders([((-1.05, 0.12, 0.22), (0.25, 0.18, 0.26), 2), ((1.08, 0.12, 0.17), (0.22, 0.18, 0.2), 1),
                       ((0.95, 0.12, 2.9), (0.3, 0.17, 0.2), 1), ((-0.9, 0.12, 2.95), (0.24, 0.16, 0.16), 1)],
                      seed, _frame_limit)
    rock = forms.cull(rock, _in_wall)
    wood = _beam(-1.16, 1.12, 0.0, 0.29, 2.42, 2.73, draw)
    wood += _wedge(-1.0, 0.16, 2.76, 0.16, 1, draw) + _wedge(1.02, 0.15, 2.755, 0.15, -1, draw)
    wood += _wedge(0.84, 0.14, 2.39, 0.12, -1, draw)
    return {'stone': rock, 'wood': wood}


def sconce(seed):
    """A torch wedged in the crack down a knob of rock and lashed to it with a turn of rope: its tow-wrapped head
    holds the code's flame. Lean, as every torch of a dungeon has one."""
    def keep(point):
        x, y, z = point
        x = forms.ease_over(forms.ease_under(x, 0.19, 0.03), -0.19, 0.03)
        crack = 0.09 * math.exp(-(x / 0.035) ** 2) * max(0.0, y + 0.05) / 0.2
        return x, forms.ease_under(y, 0.17, 0.04) - crack, z

    rock = forms.boulder((0.0, -0.04, -0.36), (0.2, 0.2, 0.22), f'{seed} knob', detail=1, rough=0.16, cuts=3,
                         limit=keep)
    rock = forms.cull(rock, _in_wall)
    top = (0.0, 0.35, -0.1)
    foot = (0.0, 0.01, -0.5)
    axis = unit(sub(top, foot))
    neck = sub(top, mul(axis, 0.13))
    wood = forms.rod(foot, neck, 0.02, 0.024, 5)
    head = revolve([(0.024, 0.0), (0.038, 0.035), (0.037, 0.1), (0.033, 0.13)], neck, axis, 5)
    head = head[:-2] + head[-1:]
    tied = sub(top, mul(axis, 0.31))
    horn = (0.11, 0.06, tied[2] - 0.03)
    across = unit(sub(horn, tied))
    side = unit((0.0, -axis[2], axis[1]))
    reach = 0.5 * math.dist(horn, tied) + 0.028
    middle = mul(add(tied, horn), 0.5)
    loop = []
    for k in range(8):
        angle = math.tau * 1.1 * k / 7
        lift = mul(axis, 0.024 * k / 7 - 0.012)
        loop.append(add(add(middle, lift), add(mul(across, reach * math.cos(angle)),
                                               mul(side, 0.03 * math.sin(angle)))))
    lashing = rope(loop + [add(loop[-1], (0.0, 0.02, -0.07))], radius=0.009, sides=3, step=0.06)
    return {'stone': rock, 'wood': wood, 'rope': head + lashing}
