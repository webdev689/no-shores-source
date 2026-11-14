"""The wereboar (TEXTURE.269): a tan beast-man on the were-creatures' shared body (were.py), with a boar's heavy head
and short blunt snout ending in a pink-grey disc, two thick grey tusks hooking up and back from its lower jaw,
drooping ears and red eyes.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; it faces -Y)."""
import materials
import were
from beastkit import rigid, tube
from body import blob, blob_mesh
from were import CLASS, GRADE_RGB, ref_class  # noqa: F401

# the boar's head: a heavy skull and a short blunt snout
HEAD = ([(0, -0.1, 1.74), (0, -0.22, 1.75), (0, -0.31, 1.71), (0, -0.37, 1.68)],
        [(0.0, 0.13, 0.1, 0.1), (0.35, 0.15, 0.11, 0.1), (0.8, 0.095, 0.075, 0.075), (0.95, 0.08, 0.07, 0.07),
         (1.0, 0.06, 0.06, 0.06)])
EYES = (0.07, -0.29, 1.79)
TAIL = ([(0, 0.12, 0.98), (0, 0.3, 0.9), (0, 0.42, 0.88), (0, 0.48, 0.8)], 0.03)


def _ears(put, M):
    for x in (1, -1):
        put(rigid(f'ear_{x}', blob_mesh(f'ear_{x}', [blob((0.1 * x, -0.16, 1.84), (0.05, 0.014, 0.035),
                                                           along=(1.0 * x, 0.2, -0.3))], res=0.008), M['fur']),
            'head', 'head')


def _teeth(put, M):
    put(rigid('jaw', tube('jaw', [(0, -0.2, 1.67), (0, -0.3, 1.64), (0, -0.35, 1.63)],
                          [(0.0, 0.08, 0.035, 0.035), (1.0, 0.06, 0.025, 0.025)], n=12, step=0.012), M['fur']),
        'jaw', 'head')
    put(rigid('snout', blob_mesh('snout', [blob((0, -0.37, 1.68), (0.07, 0.015, 0.06))], res=0.006), M['snout']),
        'head', 'head')
    for x in (1, -1):   # the tusks: thick, from the jaw's corners out, up and back
        put(rigid(f'tusk_{x}', tube(f'tusk_{x}', [(0.07 * x, -0.33, 1.63), (0.1 * x, -0.35, 1.69),
                                                   (0.1 * x, -0.3, 1.74)],
                                    [(0.0, 0.025, 0.025, 0.025), (1.0, 0.006, 0.006, 0.006)], n=8, up=(0, -1, 0),
                                    step=0.01), M['tooth']), 'jaw', 'head')


KIND = were.Were(HEAD, _ears, _teeth, EYES, TAIL)
SKELETON = KIND.skel


def rest(j):
    return SKELETON.rest(j)


def palette():
    return were.coat((0.17, 0.11, 0.05), (0.18, 0.11, 0.05), (0.5, 0.34, 0.16),
                     extra={'snout': materials.plain('snout', (0.35, 0.25, 0.25), rough=0.6, spec=0.3)})


def build(M):
    return KIND.build(M)


ANIMS = KIND.anims()


def pose_for(anim, frame, yaw, adj=None):
    return KIND.pose_for(anim, frame, yaw, adj)


PARAMS = KIND.params()
