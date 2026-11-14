"""The placed people's props (people.py): what a pose sets out or holds that is no garment and no weapon, each built in
its own frame and laid by the matrix its pose gives (`props`): a stool or a chest to sit on, a cane, a tray of cups,
a yoke with its pails, a juggler's balls, an anvil and a smith's hammer, a broom, a snake charmer's basket, a bowl, a
bottle and a book.

Each frame's origin and up: the stool, the chest, the anvil and the basket stand on the ground at their origin; the
cane and the broom rise from their foot along +Z; the tray lies on its palm; the yoke sits on the nape, along X; the
hammer is held at its grip, its haft up +Z; the balls wheel about their middle in the XZ plane; the bowl and the
bottle stand on their foot, +Z up; the book lies open on its spine's foot, its pages up +Z and their tops along +Y."""
import math

from mathutils import Matrix

import materials
from shapes import ellipsoid, loft, plate, tube_path

LAYERS = ('stool', 'chest', 'cane', 'tray', 'yoke', 'balls', 'anvil', 'hammer', 'broom', 'snake_basket', 'bowl',
          'bottle', 'book')


def materials_():
    """The props' own materials, by name (each graded in its own light, as an instrument is)."""
    return ('prop_wood', 'prop_darkwood', 'prop_iron', 'prop_pewter', 'prop_wicker', 'prop_straw', 'prop_snake',
            'prop_red', 'prop_yellow', 'prop_blue', 'prop_rope', 'prop_glass', 'prop_leather', 'prop_paper')


def palette():
    p = materials.plain
    return {'prop_wood': p('prop_wood', (0.30, 0.18, 0.09), rough=0.8, spec=0.2),
            'prop_darkwood': p('prop_darkwood', (0.16, 0.09, 0.05), rough=0.8, spec=0.2),
            'prop_iron': p('prop_iron', (0.16, 0.16, 0.17), metal=0.7, rough=0.45),
            'prop_pewter': p('prop_pewter', (0.45, 0.45, 0.46), metal=0.6, rough=0.35),
            'prop_wicker': p('prop_wicker', (0.45, 0.33, 0.16), rough=0.9, spec=0.1),
            'prop_straw': p('prop_straw', (0.55, 0.45, 0.2), rough=0.95, spec=0.05),
            'prop_snake': p('prop_snake', (0.16, 0.24, 0.08), rough=0.5, spec=0.4),
            'prop_red': p('prop_red', (0.5, 0.06, 0.04), rough=0.4), 'prop_yellow': p('prop_yellow', (0.6, 0.45, 0.05),
                                                                                  rough=0.4),
            'prop_blue': p('prop_blue', (0.06, 0.12, 0.5), rough=0.4), 'prop_rope': p('prop_rope', (0.4, 0.32, 0.18),
                                                                                  rough=0.9, spec=0.1),
            'prop_glass': p('prop_glass', (0.06, 0.18, 0.07), rough=0.15, spec=0.7),
            'prop_leather': p('prop_leather', (0.28, 0.08, 0.05), rough=0.7, spec=0.2),
            'prop_paper': p('prop_paper', (0.72, 0.66, 0.5), rough=0.95, spec=0.05)}


def _box(name, w, d, h, mat, z0=0.0, x=0.0):
    """A block `w` wide (X), `d` deep (Y), `h` high from `z0`, centred on the upright `x` along."""
    return plate(name, [(x - w / 2, z0), (x + w / 2, z0), (x + w / 2, z0 + h), (x - w / 2, z0 + h)], d, mat, 'XZ',
                 (0, d / 2, 0))


def stool(M):
    seat = loft('stool_seat', (0, 0, 0.40), (0, 0, 0.44), [(0, 0.17, 0.17), (1, 0.17, 0.17)], M['prop_wood'], subsurf=0)
    legs = [tube_path(f'stool_leg{k}', [(0.12 * math.cos(a), 0.12 * math.sin(a), 0.41), (0.15 * math.cos(a),
                                       0.15 * math.sin(a), 0.0)], 0.018, M['prop_darkwood'], subsurf=0)
            for k, a in enumerate((math.pi / 2, math.pi * 7 / 6, math.pi * 11 / 6))]
    return [seat, *legs]


def chest(M):
    body = _box('chest_body', 0.52, 0.34, 0.32, M['prop_wood'])
    lid = _box('chest_lid', 0.53, 0.35, 0.08, M['prop_darkwood'], 0.32)
    bands = [_box(f'chest_band{k}', 0.03, 0.36, 0.41, M['prop_iron'], 0.0, x) for k, x in enumerate((-0.17, 0.17))]
    return [body, lid, *bands]


def cane(M, length=0.92):
    shaft = tube_path('cane_shaft', [(0, 0, 0), (0, 0, length)], 0.012, M['prop_darkwood'], subsurf=0)
    crook = tube_path('cane_crook', [(0, 0, length), (0, -0.03, length + 0.05), (0, -0.08, length + 0.04),
                                     (0, -0.09, length - 0.01)], 0.012, M['prop_darkwood'], subsurf=0)
    return [shaft, crook]


def tray(M):
    board = loft('tray_board', (0, 0, 0.0), (0, 0, 0.014), [(0, 0.17, 0.17), (1, 0.17, 0.17)], M['prop_pewter'],
                 subsurf=0)
    cups = [loft(f'tray_cup{k}', (x, y, 0.014), (x, y, 0.07), [(0, 0.022, 0.022), (1, 0.03, 0.03)], M['prop_pewter'],
                 subsurf=0) for k, (x, y) in enumerate(((-0.06, 0.04), (0.05, 0.06)))]
    return [board, *cups]


def yoke(M):
    bar = tube_path('yoke_bar', [(-0.46, 0.0, -0.05), (-0.2, 0.0, 0.0), (0.2, 0.0, 0.0), (0.46, 0.0, -0.05)], 0.025,
                    M['prop_wood'], subsurf=0)
    out = [bar]
    for k, x in enumerate((-0.44, 0.44)):
        out.append(tube_path(f'yoke_rope{k}', [(x, 0.0, -0.05), (x, 0.0, -0.62)], 0.006, M['prop_rope'], subsurf=0))
        out.append(loft(f'yoke_pail{k}', (x, 0.0, -0.84), (x, 0.0, -0.6), [(0, 0.1, 0.1), (1, 0.13, 0.13)],
                        M['prop_wood'], cap=(True, False), subsurf=0))
    return out


def balls(M):
    return [ellipsoid(f'ball{k}', (0.11 * math.cos(a), 0.0, 0.11 * math.sin(a)), (0.035, 0.035, 0.035), M[mat],
                      subsurf=0, segs=12, rings=8)
            for k, (a, mat) in enumerate(((math.pi / 2, 'prop_red'), (math.pi * 7 / 6, 'prop_yellow'),
                                          (math.pi * 11 / 6, 'prop_blue')))]


def anvil(M):
    stump = loft('anvil_stump', (0, 0, 0), (0, 0, 0.58), [(0, 0.2, 0.2), (1, 0.18, 0.18)], M['prop_darkwood'],
                 subsurf=0)
    body = _box('anvil_body', 0.42, 0.16, 0.16, M['prop_iron'], 0.58)
    horn = loft('anvil_horn', (0.21, 0.0, 0.68), (0.4, 0.0, 0.70), [(0, 0.07, 0.06), (1, 0.01, 0.01)], M['prop_iron'],
                subsurf=0)
    work = _box('anvil_work', 0.16, 0.05, 0.03, M['prop_red'], 0.74)
    return [stump, body, horn, work]


def hammer(M):
    haft = tube_path('hammer_haft', [(0, 0, -0.06), (0, 0, 0.32)], 0.014, M['prop_wood'], subsurf=0)
    head = _box('hammer_head', 0.16, 0.05, 0.05, M['prop_iron'], 0.3)
    return [haft, head]


def broom(M):
    handle = tube_path('broom_handle', [(0, 0, 0.2), (0, 0, 1.4)], 0.015, M['prop_wood'], subsurf=0)
    head = loft('broom_head', (0, 0, 0.0), (0, 0, 0.24), [(0, 0.14, 0.05), (0.6, 0.08, 0.04), (1, 0.025, 0.025)],
                M['prop_straw'], subsurf=0)
    return [handle, head]


def snake_basket(M):
    basket = loft('basket_body', (0, 0, 0), (0, 0, 0.22), [(0, 0.13, 0.13), (0.7, 0.17, 0.17), (1, 0.15, 0.15)],
                  M['prop_wicker'], cap=(True, False), subsurf=0)
    snake = tube_path('basket_snake', [(0, 0, 0.12), (0.02, -0.02, 0.3), (-0.03, -0.05, 0.42), (0.0, -0.1, 0.48)],
                      0.022, M['prop_snake'], subsurf=0)
    head = ellipsoid('basket_snakehead', (0.0, -0.12, 0.49), (0.03, 0.045, 0.022), M['prop_snake'], subsurf=0,
                     segs=12, rings=8)
    return [basket, snake, head]


def bowl(M):
    body = loft('bowl_body', (0, 0, 0), (0, 0, 0.07), [(0, 0.045, 0.045), (0.4, 0.075, 0.075), (1, 0.09, 0.09)],
                M['prop_wood'], cap=(True, False), subsurf=0)
    stew = loft('bowl_stew', (0, 0, 0.05), (0, 0, 0.052), [(0, 0.082, 0.082), (1, 0.082, 0.082)], M['prop_darkwood'],
                subsurf=0)
    return [body, stew]


def bottle(M):
    body = loft('bottle_body', (0, 0, 0), (0, 0, 0.25), [(0, 0.035, 0.035), (0.55, 0.036, 0.036), (0.7, 0.016, 0.016),
                                                         (1, 0.012, 0.012)], M['prop_glass'], subsurf=0)
    cork = loft('bottle_cork', (0, 0, 0.245), (0, 0, 0.27), [(0, 0.01, 0.01), (1, 0.01, 0.01)], M['prop_wood'],
                subsurf=0)
    return [body, cork]


BOOK = (0.13, 0.19, 12)   # a leaf's width and height, and how far each half rises from flat (degrees)


def book(M):
    w, h, rise = BOOK
    out = []
    for k, x in enumerate((-1.0, 1.0)):   # each half: its board, its leaves on it, risen about the spine
        turn = math.radians(rise) * -x
        board = plate(f'book_board{k}', [(0, 0), (x * w, 0), (x * w, h), (0, h)], 0.006, M['prop_leather'], 'XY',
                      (0, 0, 0.003))
        leaves = plate(f'book_leaves{k}', [(0, 0.008), (x * (w - 0.008), 0.008), (x * (w - 0.008), h - 0.008),
                                           (0, h - 0.008)], 0.016, M['prop_paper'], 'XY', (0, 0, 0.014))
        for ob in (board, leaves):
            ob.data.transform(Matrix.Rotation(turn, 4, 'Y'))
            out.append(ob)
    return out


def build_all():
    """Every prop's objects, hidden, by name: {prop: [object]}."""
    M = palette()
    out = {name: globals()[name](M) for name in LAYERS}
    for obs in out.values():
        for ob in obs:
            ob.hide_render = True
    return out
