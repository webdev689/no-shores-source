"""Faces that read at a sprite's size. Daggerfall draws a face by its shadows: the dark of its eye sockets and its mouth
under a lit brow, a nose and cheekbones catching the light. `face` builds a head of metaballs - a cranium, a jaw, a
chin, a brow ridge, cheekbones and a nose - with the sockets and the mouth carved into it (negative balls), and a dark
floor to each socket with the eye set in it. A head is sized by its height and faces -Y, as every creature does."""
import numpy as np

from beastkit import rigid
from body import blob, blob_mesh, seg

# each kind's jaw half width, chin half width, brow ridge's height, socket's half width and nose's length (metres, for
# a head 0.23 m tall)
KINDS = {
    'woman': {'jaw': 0.052, 'chin': 0.022, 'brow': 0.012, 'socket': 0.018, 'nose': 0.012},
    'man': {'jaw': 0.06, 'chin': 0.03, 'brow': 0.018, 'socket': 0.02, 'nose': 0.018},
    'dreugh': {'jaw': 0.07, 'chin': 0.035, 'brow': 0.026, 'socket': 0.025, 'nose': 0.0},
}
HEIGHT = 0.23


def face(name, centre, height, kind, M, put, joint, rides=None, skin='skin', socket='socket', eye='eye',
         mouth='mouth'):
    """A head `height` metres tall about `centre` (its middle, at the eyes' height), of `kind`, hung on `joint`. Returns
    the mouth's place, for a creature that opens it."""
    c, k, P = np.asarray(centre, dtype=np.float64), height / HEIGHT, KINDS[kind]

    def at(x, y, z):
        return tuple(c + np.array((x, y, z)) * k)

    def r(*v):
        return tuple(np.array(v) * k)
    head = [blob(at(0, 0.01, 0.03), r(0.075, 0.095, 0.09)),               # the cranium
            blob(at(0, -0.035, -0.055), r(P['jaw'], 0.06, 0.07)),         # the face and the jaw
            blob(at(0, -0.068, -0.105), r(P['chin'], 0.025, 0.025)),      # the chin
            blob(at(0, -0.078, 0.02), r(0.062, 0.02, max(P['brow'], 0.008)))]   # the brow ridge
    if P['nose']:
        head.append(seg(at(0, -0.088, 0.005), at(0, -0.1 - P['nose'], -0.04), 0.012 * k, 0.016 * k))
    for x in (1, -1):
        head.append(blob(at(0.045 * x, -0.064, -0.022), r(0.026, 0.022, 0.02)))   # a cheekbone
        head.append(blob(at(0.032 * x, -0.092, -0.004), r(P['socket'], 0.024, P['socket'] * 0.75), negative=True))
    head.append(blob(at(0, -0.094, -0.07), r(0.026, 0.016, 0.007), negative=True))   # the mouth's slot
    put(rigid(name, blob_mesh(name, head, res=0.005 * k), M[skin]), joint, rides)
    floors, eyes = [], []
    for x in (1, -1):
        floors.append(blob(at(0.032 * x, -0.07, -0.004), r(P['socket'] * 0.85, 0.012, P['socket'] * 0.65)))
        eyes.append(blob(at(0.032 * x, -0.078, -0.004), r(0.009, 0.006, 0.007)))
    put(rigid(f'{name}_sockets', blob_mesh(f'{name}_sockets', floors, res=0.003 * k), M[socket]), joint, rides)
    put(rigid(f'{name}_eyes', blob_mesh(f'{name}_eyes', eyes, res=0.002 * k), M[eye]), joint, rides)
    put(rigid(f'{name}_mouth', blob_mesh(f'{name}_mouth', [blob(at(0, -0.082, -0.07), r(0.022, 0.008, 0.005))],
                                         res=0.003 * k), M[mouth]), joint, rides)
    return at(0, -0.094, -0.07)
