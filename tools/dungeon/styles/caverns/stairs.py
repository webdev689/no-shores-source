"""The caverns' stairs and galleries, grown and worn as the rest: a rock arch round a flight's head and foot, boulders
at its feet and shelf fungus on it; a worn rock ledge down a flight's walls; and a gallery's lip of rock between two
boulders, an explorer's rope slung along it.

The stair head stands on the landing, y 0..0.3, the flight behind it at y < 0, and leaves the way up clear below
2.9 within 1.25 of its middle; the ledge and the lip span their whole edge, x ±1.6, their ends the same plain rock,
so the next ones meet them in one run.
"""
import math
import random

from details import box_uvs, rope
from shapes import _centre, add, facing, flat, mul, sub, sweep

from styles.caverns import forms
from styles.caverns.openings import _boulders, _roots, _widths

WAY = 1.25
LINTEL = 2.9


def _head_limit(point):
    """The stair head's room: |x| ≤ 1.6, y 0..0.3, z 0..3.2, the way up clear below 2.9 within 1.25."""
    x, y, z = point
    x = forms.ease_over(forms.ease_under(x, 1.585, 0.05), -1.585, 0.05)
    y = forms.ease_over(forms.ease_under(y, 0.29, 0.04), 0.008, 0.02)
    z = max(0.0, forms.ease_under(z, 3.185, 0.05))
    if abs(x) < WAY + 0.015 and z < LINTEL + 0.015:
        if WAY + 0.015 - abs(x) < LINTEL + 0.015 - z:
            x = math.copysign(WAY + 0.015, x)
        else:
            z = LINTEL + 0.015
    return x, y, z


def _on_floor(point):
    return point[2] <= 0.001


def stair_head(seed='caverns.stair.head'):
    """Broken rock round the way up, square-shouldered under the cave's roof, boulders heaped at its feet and shelf
    fungus grown on its jambs."""
    # Square corners, and sections every 0.25 along a path 8.5 long, put a section on each corner, so no face
    # between the jamb and the lintel cuts across the way.
    path = [(-WAY, -0.1), (-WAY, LINTEL), (WAY, LINTEL), (WAY, -0.1)]
    rock = forms.rim(path, _widths(seed, 0.42, 0.36, 0.3), 0.0, 0.22, seed, rings=8, rough=0.14, grain=2.2,
                     limit=_head_limit, step=0.25)
    rock += _boulders([((-1.43, 0.16, 0.0), (0.2, 0.15, 0.5), 1), ((1.44, 0.15, 0.0), (0.2, 0.15, 0.38), 1),
                       ((1.45, 0.14, 1.75), (0.18, 0.14, 0.3), 1)], seed, _head_limit)
    rock = forms.cull(rock, _on_floor)
    draw = random.Random(seed)
    fungus = []
    spots = ((-1.4, 1.3), (1.42, 1.9), (-1.38, 2.05), (1.45, 0.8), (-0.6, 3.05), (0.8, 3.08), (-1.42, 2.7))
    for point, normal in _roots(rock, [((x, 1.0, z), (0.0, -1.0, 0.0)) for x, z in spots]):
        grown = forms.bracket(point, (normal[0], max(normal[1], 0.5), 0.0), draw.uniform(0.05, 0.075), draw)
        if forms.kit_fits(grown, 'stair.head'):
            fungus += grown
    return {'stone': rock, 'fungus': fungus}


def _fade(x):
    """1 in a span's middle, 0 at its ends, x ±1.6: noise faded out so every span ends on the same plain rock."""
    return max(0.0, 1 - (abs(x) / 1.6) ** 4)


def _ridge(profile, seed, rough, steps, limit):
    """Rock run along x from -1.6 to 1.6 through an open profile [(y, z), ...] from the wall or the floor and back:
    each point pushed out from the profile's middle by noise faded to nothing at the ends, then kept by `limit`."""
    noise = forms.Noise(seed)
    middle = _centre([(0.0, y, z) for y, z in profile])
    sections = []
    for step in range(steps + 1):
        x = -1.6 + 3.2 * step / steps
        section = []
        for y, z in profile:
            out = sub((0.0, y, z), middle)
            reach = math.hypot(out[1], out[2]) or 1.0
            bump = rough * 1.6 * noise.fbm(x * 1.7, y * 3.0, z * 3.0) * _fade(x)
            section.append(limit(add((x, y, z), mul(out, bump / reach))))
        sections.append(section)
    centres = [(section[0][0], middle[1], middle[2]) for section in sections]
    faces = sweep(sections, closed=False, outward=lambda points, i: sub(_centre(points), centres[i]))
    faces = [list(zip([point for point, _ in face], box_uvs([point for point, _ in face]))) for face in faces]
    for section, outward in ((sections[0], (-1.0, 0.0, 0.0)), (sections[-1], (1.0, 0.0, 0.0))):
        faces.append(facing(flat(section), outward))
    return faces


def stair_side(seed='caverns.stair.side'):
    """A ledge of worn rock standing out of the wall along the flight, swelling and thinning."""
    profile = [(0.0, -0.3), (0.06, -0.27), (0.1, -0.12), (0.125, 0.1), (0.11, 0.28), (0.06, 0.4), (0.0, 0.44)]

    def limit(point):
        x, y, z = point
        return (max(-1.6, min(1.6, x)), forms.ease_over(forms.ease_under(y, 0.145, 0.02), 0.0, 0.01),
                max(-0.3, min(0.45, z)))

    return {'stone': _ridge(profile, seed, 0.06, 8, limit)}


def balustrade(seed='caverns.balustrade'):
    """A lip of rock along the gallery's edge, two boulders standing on it, and a rope slung over them, sagging
    between them and across to the next span's."""
    def limit(point):
        x, y, z = point
        return (max(-1.6, min(1.6, x)), forms.ease_over(forms.ease_under(y, 0.245, 0.02), 0.005, 0.02),
                max(0.0, forms.ease_under(z, 0.98, 0.03)))

    profile = [(0.0, 0.0), (0.03, 0.17), (0.09, 0.29), (0.17, 0.27), (0.23, 0.14), (0.25, 0.0)]
    rock = _ridge(profile, seed, 0.04, 10, limit)
    rock += _boulders([((-1.2, 0.125, 0.32), (0.26, 0.12, 0.5), 1), ((1.2, 0.125, 0.3), (0.24, 0.12, 0.52), 1),
                       ((0.1, 0.13, 0.0), (0.2, 0.11, 0.24), 1)], seed, limit)
    rock = forms.cull(rock, _on_floor)
    return {'stone': rock, 'rope': rope([(x, 0.125, _slung(x)) for x in ROPE_AT], radius=0.014, sides=4, strands=0,
                                        step=0.4)}


# Where the rope lies over the boulders' tops, and how far it sags between them and across to the next span.
ROPE_AT = (-1.586, -1.4, -1.2, -0.8, -0.4, 0.0, 0.4, 0.8, 1.2, 1.4, 1.586)
ROPE_TOP = 0.8


def _slung(x):
    if abs(x) <= 1.2:
        return ROPE_TOP - 0.18 * (1 - (x / 1.2) ** 2)
    return ROPE_TOP - 0.06 * (1 - ((abs(x) - 1.6) / 0.4) ** 2)
