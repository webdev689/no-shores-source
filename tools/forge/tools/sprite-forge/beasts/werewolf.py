"""The werewolf (TEXTURE.264): a dark brown beast-man on the were-creatures' shared body (were.py), with a wolf's
heavy skull and short snarling muzzle, a ring of fangs round its open mouth, tall pointed ears and red eyes.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; it faces -Y)."""
import were
from beastkit import cone, rigid, tube
from body import blob, blob_mesh
from were import CLASS, GRADE_RGB, ref_class  # noqa: F401

# the wolf's head: a heavy skull, a short muzzle ahead and a little down
HEAD = ([(0, -0.1, 1.74), (0, -0.22, 1.77), (0, -0.32, 1.73), (0, -0.4, 1.68)],
        [(0.0, 0.12, 0.1, 0.1), (0.35, 0.145, 0.11, 0.1), (0.75, 0.085, 0.06, 0.07), (1.0, 0.05, 0.045, 0.045)])
EYES = (0.055, -0.3, 1.79)
TAIL = ([(0, 0.12, 0.98), (0, 0.3, 0.9), (0, 0.45, 0.88), (0, 0.55, 0.8)], 0.03)


def _ears(put, M):
    for x in (1, -1):
        put(rigid(f'ear_{x}', blob_mesh(f'ear_{x}', [blob((0.075 * x, -0.17, 1.91), (0.038, 0.016, 0.085),
                                                           along=(0.3 * x, 0.15, 1.0))], res=0.008), M['fur']),
            'head', 'head')


def _teeth(put, M):
    put(rigid('jaw', tube('jaw', [(0, -0.2, 1.68), (0, -0.3, 1.65), (0, -0.38, 1.63)],
                          [(0.0, 0.07, 0.03, 0.03), (1.0, 0.06, 0.02, 0.02)], n=12, step=0.012), M['fur']),
        'jaw', 'head')
    put(rigid('mouth', blob_mesh('mouth', [blob((0, -0.33, 1.66), (0.055, 0.07, 0.025))], res=0.008), M['mouth']),
        'head', 'head')
    for x in (1, -1):   # four fangs above and four below, ringing the open mouth
        for k in range(2):
            fx, fy = (0.02 + 0.025 * k) * x, -0.38 + 0.04 * k
            put(rigid(f'fang_up{x}{k}', cone(f'fang_up{x}{k}', (fx, fy, 1.68), (fx, fy, 1.62), 0.014), M['tooth']),
                'head', 'head')
            put(rigid(f'fang_lo{x}{k}', cone(f'fang_lo{x}{k}', (fx, fy + 0.01, 1.62), (fx, fy + 0.01, 1.68), 0.014),
                      M['tooth']), 'jaw', 'head')


KIND = were.Were(HEAD, _ears, _teeth, EYES, TAIL)
SKELETON = KIND.skel


def rest(j):
    return SKELETON.rest(j)


def palette():
    return were.coat((0.09, 0.05, 0.022), (0.1, 0.05, 0.02), (0.42, 0.24, 0.1))


def build(M):
    return KIND.build(M)


ANIMS = KIND.anims()


def pose_for(anim, frame, yaw, adj=None):
    return KIND.pose_for(anim, frame, yaw, adj)


PARAMS = KIND.params()
