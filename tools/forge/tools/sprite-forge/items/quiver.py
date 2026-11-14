"""A bow's quiver on an Eye of the Beholder sprite's back (src/player/eyeOfTheBeholder/eotbQuiver.js): a leather tube
standing upright, seen square to its side, with three arrows standing out of its mouth or none. Built so the tube is
28 of the picture's texels tall and the highest fletching ten more, the sizes the door hangs it by."""
import math

import numpy as np

from . import shapes
from .kit import Mat
from .models import model

TUBE = 0.56           # metres the tube stands
RISE = 0.2            # how far the highest arrow's fletching stands over its mouth (ten texels over the tube's 28)
RADIUS = 0.046        # the tube's radius at its foot; its mouth is a little wider


def _fletch(top, x, turn):
    """An arrow's end over the mouth: its nock, three vanes round its shaft, the shaft below them."""
    # bold for the size: the picture is 7 texels across, so a real shaft would be a fifth of one
    shaft = shapes.tube([(x, 0.0, TUBE - 0.04), (x, 0.0, top)], 0.0075, sides=6)
    vanes = []
    for k in range(3):
        a = turn + 2 * math.pi * k / 3
        out = (math.cos(a), math.sin(a))
        blade = [(0.0, top - 0.015), (0.0, top - 0.1), (0.024, top - 0.082), (0.028, top - 0.032), (0.018, top - 0.016)]
        verts = [(x + out[0] * r, out[1] * r, z) for r, z in blade]
        verts += [(x + out[0] * r - out[1] * 0.0012, out[1] * r + out[0] * 0.0012, z) for r, z in blade]
        n = len(blade)
        faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        vanes.append((verts, faces))
    nock = shapes.ellipsoid((0.006, 0.006, 0.008), centre=(x, 0.0, top + 0.004))
    return shaft, shapes.joined(*vanes), nock


@model
def quiver(item, words, seed):
    """The quiver: its tube of brown leather a touch wider at its mouth, a rolled rim of paler leather round the mouth,
    a dark strap band two thirds up where it is slung and a dark cap at its foot; with `arrows`, three arrows standing
    out of it at their own heights, each with its three vanes and its nock."""
    leather = Mat('leather', rough=0.55, spec=0.4, bump=(0.25, 90.0))
    tube = shapes.lathe([(RADIUS * 1.12, TUBE), (RADIUS * 1.08, TUBE * 0.6), (RADIUS, 0.02), (RADIUS * 0.9, 0.0)], 16,
                        top=False, foot=True)
    item.add(tube, leather)
    # the mouth's inside, dark, and its rolled rim
    item.add(shapes.ellipsoid((RADIUS * 1.05, RADIUS * 1.05, 0.002), centre=(0, 0, TUBE - 0.006)), Mat('darkLeather', rough=0.9, dim=0.5))
    item.add(shapes.moved(shapes.torus(RADIUS * 1.14, 0.009, 20, 6), offset=(0, 0, TUBE - 0.006)), Mat('tan', rough=0.5, spec=0.4))
    # the strap band where it is slung, and the cap at its foot
    band = TUBE * 0.62
    item.add(shapes.lathe([(RADIUS * 1.13, band + 0.022), (RADIUS * 1.13, band - 0.022)], 16, top=True, foot=True),
             Mat('darkLeather', rough=0.6))
    item.add(shapes.lathe([(RADIUS * 0.98, 0.05), (RADIUS * 0.98, -0.004), (0.0001, -0.006)], 16, top=True, foot=True),
             Mat('darkLeather', rough=0.6))
    if not words.get('arrows'):
        return
    shaft_mat, vane_mat, nock_mat = Mat('pine', rough=0.6), Mat('featherPale', rough=0.7), Mat('meatRaw', rough=0.6)
    for x, rise, turn in ((-0.032, RISE * 0.8, 0.3), (0.0, RISE, 1.2), (0.032, RISE * 0.9, 2.1)):
        shaft, vanes, nock = _fletch(TUBE + rise - 0.008, x, turn)
        item.add(shaft, shaft_mat)
        item.add(vanes, vane_mat, smooth=False)
        item.add(nock, nock_mat)
