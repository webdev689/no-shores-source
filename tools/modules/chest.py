"""The chests a won public event leaves each player: `event-chest`, iron-bound, and `event-chest-heroic`, gilded and set
with the Lattice's crystal. Each lid is a module of its own (`-lid`) built with its hinge, the back edge of its foot,
at its origin, so the page swings it open about its own x; the chest's `hinge` socket says where that hinge sits on the
chest.
"""
import math

import kit
import latticekit
from timbers import Frame, board, ring

# Each chest's width, depth and height to its lid, metres; its lid's rise over the arch; its bands' metal.
PLAIN = dict(size=(0.95, 0.58, 0.46), arch=0.2, metal='iron')
HEROIC = dict(size=(1.1, 0.66, 0.52), arch=0.24, metal='gold')
BANDS_X = (-0.32, 0.0, 0.32)


def body(module, kind):
    """The chest under its lid: boards on a frame, feet at its corners, bands of metal round it over the front, the
    bottom and the back, plates at its corners, a ring handle at each end and a lock plate at its front."""
    w, d, h = kind['size']
    metal = kind['metal']
    frame = Frame()
    rows = 3
    for side, (middle, turn, across) in {'front': ((0.0, -d / 2, 0.0), 0.0, w), 'back': ((0.0, d / 2, 0.0), 0.0, w),
                                         'east': ((w / 2, 0.0, 0.0), math.pi / 2, d),
                                         'west': ((-w / 2, 0.0, 0.0), math.pi / 2, d)}.items():
        face = frame.inner(middle, turn)
        for k in range(rows):
            board(module, face, (0.0, 0.0, 0.06 + (h - 0.06) * (k + 0.5) / rows),
                  (across - 0.01, 0.028, (h - 0.06) / rows - 0.008))
    board(module, frame, (0.0, 0.0, 0.07), (w - 0.04, d - 0.04, 0.025))
    for x in (-1, 1):
        for y in (-1, 1):
            board(module, frame, (x * (w / 2 - 0.05), y * (d / 2 - 0.05), 0.03), (0.1, 0.1, 0.06))
            board(module, frame, (x * (w / 2 - 0.03), y * (d / 2 - 0.03), h / 2 + 0.03), (0.055, 0.055, h - 0.05))
            # A plate bent round each corner, top and bottom.
            for z in (0.12, h - 0.05):
                board(module, frame, (x * (w / 2 + 0.017), y * (d / 2 - 0.06), z), (0.008, 0.13, 0.1), metal)
                board(module, frame, (x * (w / 2 - 0.06), y * (d / 2 + 0.017), z), (0.13, 0.008, 0.1), metal)
    for x in BANDS_X:   # bands down the front, under, and up the back
        for y in (-1, 1):
            board(module, frame, (x * w, y * (d / 2 + 0.016), h / 2 + 0.03), (0.055, 0.008, h - 0.04), metal)
        board(module, frame, (x * w, 0.0, 0.058), (0.055, d + 0.03, 0.008), metal)
        for z in (0.16, 0.3):   # its rivets
            for y in (-1, 1):
                board(module, frame, (x * w, y * (d / 2 + 0.022), z), (0.018, 0.008, 0.018), metal, bevel=0.0)
    for x in (-1, 1):   # the handles
        board(module, frame, (x * (w / 2 + 0.022), 0.0, h * 0.62), (0.012, 0.12, 0.06), metal)
        ring(module, frame, (x * (w / 2 + 0.035), 0.0, h * 0.5), 0.065, 0.011, metal, axis='X')
    board(module, frame, (0.0, -d / 2 - 0.02, h - 0.1), (0.14, 0.012, 0.16), metal)
    board(module, frame, (0.0, -d / 2 - 0.028, h - 0.12), (0.022, 0.006, 0.05), 'iron', bevel=0.0)
    # The hinge on the chest's back edge, the lid's own origin.
    module.socket('hinge', (0.0, d / 2, h), (0.0, 1.0))
    module.part((-w / 2, -d / 2, 0.0), (w / 2, d / 2, h))
    return w, d, h


def lid(module, kind):
    """The lid, its hinge at its origin and its foot running forward (-y) from there: an arch of boards over two end
    boards, bands of metal over the arch where the body's bands run, a rim along its front and the hasp hanging over
    the lock, the hinges' straps along its back."""
    w, d, _ = kind['size']
    arch = kind['arch']
    metal = kind['metal']
    frame = Frame()
    staves = 7

    def on_arch(share, out=0.0):
        """The arch's point at `share` of the way from the back (0) to the front (1), `out` off it."""
        angle = math.pi * share
        y = -d / 2 + d / 2 * math.cos(angle) * (1 + out / (d / 2))
        z = arch * math.sin(angle) * (1 + out / arch)
        return y, z

    for k in range(staves):
        a, b = on_arch(k / staves), on_arch((k + 1) / staves)
        middle = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        slope = math.atan2(b[1] - a[1], b[0] - a[0])
        board(module, frame, (0.0, middle[0], middle[1]), (w - 0.01, math.dist(a, b) + 0.006, 0.026),
              rotation=(slope, 0.0, 0.0))
    for x in (-1, 1):   # end boards, cut to the arch
        points = [(x * w / 2, -d / 2 + d / 2 * math.cos(math.pi * k / 10), arch * math.sin(math.pi * k / 10))
                  for k in range(11)]
        inner = [(p[0] - x * 0.026, p[1], p[2]) for p in points]
        faces = [tuple(range(11)), tuple(11 + k for k in range(11))]
        faces += [(k, k + 1, 12 + k, 11 + k) for k in range(10)]
        middle = (x * (w / 2 - 0.013), -d / 2, arch / 3)
        kit.solid_of(module, 'end', points + inner, kit.oriented(points + inner, faces, lambda at: tuple(
            at[axis] - middle[axis] for axis in range(3))), 'timber')
    for x in BANDS_X:
        for k in range(10):
            a, b = on_arch(k / 10, 0.012), on_arch((k + 1) / 10, 0.012)
            slope = math.atan2(b[1] - a[1], b[0] - a[0])
            board(module, frame, (x * w, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2), (0.058, math.dist(a, b) + 0.004, 0.008),
                  metal, rotation=(slope, 0.0, 0.0), bevel=0.0)
    board(module, frame, (0.0, -d - 0.008, 0.02), (w + 0.01, 0.012, 0.045), metal)
    board(module, frame, (0.0, -d - 0.02, -0.04), (0.08, 0.012, 0.13), metal)
    ring(module, frame, (0.0, -d - 0.03, -0.1), 0.025, 0.006, metal, axis='Y')
    for x in (-0.3, 0.3):   # the hinges' straps
        board(module, frame, (x * w, -0.06, 0.03), (0.05, 0.14, 0.008), metal, rotation=(-0.5, 0.0, 0.0))
        board(module, frame, (x * w, 0.012, -0.01), (0.05, 0.02, 0.04), 'iron')
    module.part((-w / 2, -d, 0.0), (w / 2, 0.0, arch))


def chest(module):
    body(module, PLAIN)


def chest_lid(module):
    lid(module, PLAIN)


def heroic(module):
    """The heroic chest: gilded bands and plates, and the Lattice's crystal set in gold at its front's corners."""
    w, d, h = body(module, HEROIC)
    m = latticekit.kinds()
    pick = latticekit.picker(module.random.randrange(1 << 30))
    for x in (-1, 1):
        board(module, Frame(), (x * (w / 2 - 0.04), -d / 2 - 0.03, h * 0.55), (0.09, 0.02, 0.12), 'gold')
        latticekit.cluster(module, m, pick, (x * (w / 2 - 0.04), -d / 2 - 0.04, h * 0.55), (0.0, -1.0, 0.25), 3,
                           (0.05, 0.11), 0.016, 0.4)


def heroic_lid(module):
    """Its lid, gilded, a crown of crystal set in a gold mount at the arch's top."""
    lid(module, HEROIC)
    w, d, _ = HEROIC['size']
    arch = HEROIC['arch']
    m = latticekit.kinds()
    pick = latticekit.picker(module.random.randrange(1 << 30))
    board(module, Frame(), (0.0, -d / 2, arch + 0.02), (0.22, 0.16, 0.035), 'gold')
    latticekit.cluster(module, m, pick, (0.0, -d / 2, arch + 0.03), (0.0, 0.0, 1.0), 7, (0.08, 0.22), 0.025, 0.55)
