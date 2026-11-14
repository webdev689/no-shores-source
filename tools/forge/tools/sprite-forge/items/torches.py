"""Handheld Torches' torch on the floor (TEXTURE.112358 record 0, four frames, and record 10, doused): the torch the
first-person hand holds (fptorch.py: its wooden handle, iron socket, four-strap cage and bed of coals) at its whole
length, lying where it fell, the cage's foot on the ground and the far end up and to the right. Lit, a fire of tongues
rises from the coals through the cage, white-hot at its heart, each frame its own lick; doused, the coals are dead
grey but for one ember, and a thin wisp of smoke curls up from them. Every frame's fire reaches the same height, and
the smoke as high, so the four frames and the doused one share one scale and one foot (the game sizes the billboard
by its picture)."""
import json
import math
import os

from . import shapes
from .kit import Mat
from .models import model

HERE = os.path.dirname(os.path.abspath(__file__))
LIE = 45.0          # degrees the torch is turned about z: the far end up and to the right
HANDLE = 0.25       # metres of handle below the fist's place (fptorch's handle runs only past the fist)
TILT = 4.0          # degrees the head stands up off the ground: the cage is thicker than the handle
FIRE = 0.3          # metres the tallest tongue reaches over the coals
HEAD = {'cage_r': 1.45, 'cage_len': 1.3, 'socket': 0.85, 'handle_r': 1.15}   # the head's sizes over the held torch's
# each frame's fire: the tallest tongue's lean (metres at its tip), the two licks beside it as (across, toward the
# far side, height share, lean), and the white-hot heart's lean
FRAMES = (
    {'lean': 0.006, 'tongues': ((-0.042, 0.0, 0.62, -0.03), (0.04, 0.01, 0.5, 0.026)), 'heart': 0.0},
    {'lean': 0.03, 'tongues': ((-0.036, 0.01, 0.46, -0.012), (0.044, 0.0, 0.68, 0.036)), 'heart': 0.008},
    {'lean': -0.012, 'tongues': ((-0.046, 0.0, 0.72, -0.038), (0.036, 0.01, 0.42, 0.014)), 'heart': -0.004},
    {'lean': -0.03, 'tongues': ((-0.04, 0.01, 0.54, -0.03), (0.042, 0.0, 0.6, 0.012)), 'heart': -0.008},
)


def _torch_shape():
    """The held torch's fitted sizes, its handle at a whole torch's length and its head grown (HEAD), so the cage
    still reads as a cage at thirty texels."""
    import fptorch
    with open(os.path.join(HERE, '..', 'specs', 'TORCH-shape.json')) as fh:
        shape = {**fptorch.TORCH, **json.load(fh), 'handle_below': HANDLE}
    return {**shape, **{name: shape[name] * grow for name, grow in HEAD.items()}}


def _laid(mesh, shape):
    """A mesh in the torch's own space (its axis up +z from the grip's place) laid on the ground: the axis along the
    picture, the cage's foot and the handle's butt resting, turned LIE about z."""
    reach = shape['cage_r'] * 1.05   # the strap's flare: how far the cage stands off its axis
    lift = reach - math.sin(math.radians(TILT)) * (shape['socket'] + 0.006)
    return shapes.moved(shapes.moved(mesh, turn=(0.0, 90.0 - TILT, 0.0)), offset=(0.0, 0.0, lift), turn=(0, 0, LIE))


def _along(shape, height):
    """Where a point `height` up the torch's axis lies once laid, and the torch's direction there."""
    point = _laid(([(0.0, 0.0, height)], []), shape)[0][0]
    return point


def _parts(shape):
    """The torch's four materials' meshes, from fptorch's own torch: handle, cage, pitch, ember."""
    import fptorch
    verts, tris, mats = fptorch.torch_mesh(shape)
    out = []
    for k in range(len(fptorch.TORCH_MATS)):
        faces = [tuple(int(i) for i in t) for t, m in zip(tris, mats) if m == k]
        out.append(([tuple(float(c) for c in v) for v in verts], faces))
    return out


def _tongue(height, radius, lean):
    """A tongue of flame up from its root: a teardrop drawn to a point, its tip bent `lean` across the picture."""
    profile = []
    for down in [k / 11 for k in range(12)]:
        reach = radius * (down ** 1.4) * math.sqrt(max(1.0 - down, 0.0)) / 0.47
        profile.append((max(reach, 1e-4), height * (1 - down)))
    verts, faces = shapes.lathe(profile, 14, top=True, foot=True)
    return [(x + lean * (z / height) ** 2, y, z) for x, y, z in verts], faces


@model
def droppedTorch(item, words, seed):
    """The torch on the floor. Words: `frame` (0-3), which lick of the fire; `lit` (default true), burning or doused."""
    import fptorch
    shape = _torch_shape()
    handle, cage, pitch, ember = _parts(shape)
    lit = words.get('lit', True)
    frame = int(words.get('frame', 0)) % len(FRAMES)
    item.add(_laid(handle, shape), Mat('wood', rough=0.85, bump=(0.4, 140.0)))
    item.add(_laid(cage, shape), Mat('iron', rough=0.35, metal=0.2, spec=0.8, bump=(0.3, 160.0)))
    if lit:
        item.add(_laid(pitch, shape), Mat('charcoal', rough=0.9, bump=(0.6, 200.0)))
        item.add(_laid(ember, shape), Mat('ember', rough=0.7, glow=0.6))
    else:   # the coals gone grey, one still red
        item.add(_laid(pitch, shape), Mat('charcoal', rough=0.95, bump=(0.6, 200.0)))
        item.add(_laid(ember, shape), Mat('smoky', rough=0.95, bump=(0.5, 200.0)))
    root = _along(shape, shape['socket'] + 0.55 * shape['cage_len'])   # the whole cage burns
    if lit:
        k = FRAMES[frame]
        fire = Mat('flame', rough=0.6, glow=0.15)
        item.add(shapes.moved(_tongue(FIRE, 0.05, k['lean']), offset=root), fire)
        for across, far, share, lean in k['tongues']:
            item.add(shapes.moved(_tongue(FIRE * share, 0.034, lean), offset=(root[0] + across, root[1] + far, root[2])),
                     fire)
        heart = Mat('flame', rough=0.6, glow=0.82)
        item.add(shapes.moved(_tongue(FIRE * 0.5, 0.034, k['heart']), offset=(root[0], root[1] - 0.026, root[2] + 0.01)),
                 heart)
        item.sparkle((root[0] - 0.02 + 0.012 * frame, root[1] - 0.02, root[2] + FIRE * (1.05 + 0.08 * (frame % 2))),
                     'flame', arm=0)
    else:
        # the last ember, on the coal bed's near lip between two straps: off the axis toward the eye
        bed = _along(shape, fptorch.coal_top(shape) - 0.006)
        near = (math.sin(math.radians(LIE)), -math.cos(math.radians(LIE)))
        coal = shapes.ellipsoid((0.012, 0.012, 0.01), rings=5, sides=8)
        item.add(shapes.moved(coal, offset=(bed[0] + 0.05 * near[0], bed[1] + 0.05 * near[1], bed[2] + 0.02)),
                 Mat('ember', rough=0.7, glow=0.45))
        # the smoke: a thin wisp curling up from the coals as high as the fire reaches, thinner as it rises
        steps = 16
        path = []
        for s in range(steps + 1):
            t = s / steps
            sway = 0.02 * math.sin(t * 2.4 * math.pi + 0.6) * (0.3 + t)
            path.append((root[0] + sway, root[1], root[2] + 0.02 + (FIRE - 0.02) * t))
        # drawn out to a point at the fire's crest, so the doused picture keeps the lit ones' scale
        item.add(shapes.tube(path, 0.014, sides=8, radius_end=1e-4), Mat('smoky', rough=1.0, glow=0.5))
