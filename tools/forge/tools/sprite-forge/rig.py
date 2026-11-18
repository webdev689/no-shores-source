"""The forge's skeleton: rigid segments on a joint tree, posed by forward kinematics with two-bone IK for the arms.

Axes: +X is the body's left, +Y its back, +Z up; the body faces -Y. Every joint's rest frame is the world's, so a
segment is modelled in world rest space and posed by its joint's matrix alone. No Blender armature is used: a rigid
part follows one joint exactly, which keeps every frame's silhouette crisp.
"""
import math
from mathutils import Euler, Matrix, Quaternion, Vector

# joint -> (parent, rest head in metres)
JOINTS = {
    'root': (None, (0.0, 0.0, 0.0)),
    'pelvis': ('root', (0.0, 0.0, 0.97)),
    'spine': ('pelvis', (0.0, 0.0, 1.10)),
    'chest': ('spine', (0.0, 0.0, 1.28)),
    'neck': ('chest', (0.0, -0.03, 1.50)),
    'head': ('neck', (0.0, -0.045, 1.57)),
}
# The classic fighter's arms are long: shoulder to fingertip about 0.74 m against a body 1.81 m tall, so the arm's
# design (laid out for a shoulder at 1.45 m) is stretched below the shoulder by ARM_LEN.
ARM_LEN = 1.14
SHOULDER_Z = 1.45


def arm_z(z):
    """A height on the arm as designed, after the stretch."""
    return z if z >= SHOULDER_Z else SHOULDER_Z - (SHOULDER_Z - z) * ARM_LEN


def _arm(x, y, z, side):
    sx = 0.215 * side
    return (sx + (x * side - sx) * ARM_LEN if z < SHOULDER_Z else x * side, y * ARM_LEN, arm_z(z))


for s, x in (('L', 1.0), ('R', -1.0)):
    JOINTS.update({
        f'clav_{s}': ('chest', (0.05 * x, 0.0, 1.47)),
        f'uarm_{s}': (f'clav_{s}', (0.215 * x, 0.0, 1.45)),
        f'farm_{s}': (f'uarm_{s}', _arm(0.245, 0.01, 1.20, x)),
        f'hand_{s}': (f'farm_{s}', _arm(0.26, -0.005, 0.965, x)),
        f'thigh_{s}': ('pelvis', (0.10 * x, 0.0, 0.95)),
        f'shin_{s}': (f'thigh_{s}', (0.105 * x, 0.0, 0.55)),
        f'foot_{s}': (f'shin_{s}', (0.11 * x, 0.015, 0.09)),
    })

ORDER = list(JOINTS)  # parents precede children


def rest(j):
    return Vector(JOINTS[j][1])


def offset(j):
    p = JOINTS[j][0]
    return rest(j) - (rest(p) if p else Vector((0, 0, 0)))


def euler(deg):
    return Euler([math.radians(a) for a in deg], 'XYZ')


class Pose:
    """Local rotations (degrees, XYZ) per joint, plus the root's place. `world` gives each joint's matrix."""

    def __init__(self, rot=None, root_loc=(0, 0, 0), yaw=0.0):
        self.rot = dict(rot or {})
        self.root_loc = Vector(root_loc)
        self.yaw = yaw
        self.quat = {}   # joint -> local Quaternion set by IK (overrides rot)
        self.clav_base = {}   # a collarbone's turn before the arm's solve lifted it (`_girdle`)

    def local(self, j):
        if j in self.quat:
            return self.quat[j].to_matrix().to_4x4()
        return euler(self.rot.get(j, (0, 0, 0))).to_matrix().to_4x4()

    def world(self):
        m = {}
        for j in ORDER:
            p = JOINTS[j][0]
            if p is None:
                base = Matrix.Translation(self.root_loc) @ Matrix.Rotation(math.radians(self.yaw), 4, 'Z')
                m[j] = base @ self.local(j)
            else:
                m[j] = m[p] @ Matrix.Translation(offset(j)) @ self.local(j)
        return m


def reach(side):
    """How far arm `side` puts its wrist from its shoulder, straight."""
    return (offset(f'farm_{side}').length + offset(f'hand_{side}').length) * 0.999


def _frame(long, front):
    """A rotation's matrix from a segment's long axis and its front, the front squared to the long axis."""
    long = Vector(long).normalized()
    front = Vector(front) - Vector(front).project(long)
    front.normalize()
    return Matrix((long, front, long.cross(front))).transposed()


# The shoulder girdle's share of a raised arm: past SHRUG_FROM degrees off hanging, the collarbone lifts SHRUG of
# each further degree, up to SHRUG_MAX, and swings forward or back as the upper arm points ahead or behind, up to
# SWING_MAX. A raised arm turned on the shoulder joint alone crushes the deltoid against the trapezius.
SHRUG_FROM, SHRUG, SHRUG_MAX, SWING, SWING_MAX = 30.0, 0.25, 22.0, 0.3, 16.0
PRONATE = 0.5   # the share of the hand's roll about the forearm the forearm takes, the wrist the rest


def _elbow(side, shoulder, target, pole):
    """Where the elbow goes for a wrist at `target` from `shoulder`, bent toward `pole` (world): (elbow, wrist, the
    shoulder-to-wrist way, the cosine and sine of the upper arm's angle off it, the pole squared to it)."""
    a = offset(f'farm_{side}').length
    b = offset(f'hand_{side}').length
    d = Vector(target) - shoulder
    dist = max(1e-6, min(d.length, reach(side)))
    d.normalize()
    cos_s = max(-1.0, min(1.0, (a * a + dist * dist - b * b) / (2 * a * dist)))
    sin_s = math.sqrt(1 - cos_s * cos_s)
    pv = Vector(pole) - Vector(pole).project(d)
    if pv.length < 1e-6:
        pv = Vector((0, -1, 0)) - Vector((0, -1, 0)).project(d)
    pv.normalize()
    return shoulder + d * (cos_s * a) + pv * (sin_s * a), shoulder + d * dist, d, cos_s, sin_s, pv


def _girdle(pose, side, target, pole):
    """Set the collarbone for a wrist reaching `target` (world), the elbow toward `pole`: its keyed or captured turn,
    then the lift and the swing the upper arm's way asks. The keyed turn is kept on the pose (`clav_base`), so a
    second solve of the arm starts from it again."""
    j = f'clav_{side}'
    if j not in pose.clav_base:
        q = pose.quat.get(j)
        pose.clav_base[j] = q.copy() if q is not None else euler(pose.rot.get(j, (0, 0, 0))).to_quaternion()
    base = pose.clav_base[j].copy()
    pose.quat[j] = base
    W = pose.world()
    shoulder = W[f'uarm_{side}'].translation
    elbow = _elbow(side, shoulder, target, pole)[0]
    u = W['chest'].to_3x3().inverted() @ (elbow - shoulder)
    if u.length < 1e-6:
        return
    u.normalize()
    raised = math.degrees(math.acos(max(-1.0, min(1.0, -u.z))))
    lift = min(SHRUG_MAX, max(0.0, raised - SHRUG_FROM) * SHRUG)
    ahead = math.degrees(math.asin(max(-1.0, min(1.0, -u.y))))   # + toward the front, - toward the back
    swing = max(-SWING_MAX, min(SWING_MAX, ahead * SWING * min(1.0, raised / 60.0)))
    sign = 1.0 if side == 'L' else -1.0
    # the left collarbone lifts on -Y and comes forward on -Z; the right mirrors it
    pose.quat[j] = base @ euler((0.0, -lift * sign, -swing * sign)).to_quaternion()


def solve_arm(pose, side, wrist_target, pole, hand_dir=None, hand_up=None, girdle=True):
    """Two-bone IK: put the wrist of arm `side` on `wrist_target` (world), the elbow bent toward `pole` (world
    direction). With `hand_dir` the hand's long axis points there (world), rolled so its back faces `hand_up`;
    without, the hand keeps the turn the arm's swing alone gives it.

    The collarbone takes its share of a raised arm (`_girdle`), unless `girdle` is false (a captured shoulder
    already moved as it should). The upper arm is rolled so its front faces the way the
    forearm bends, and the forearm turns on that hinge alone, then rolls PRONATE of the hand's roll."""
    t = Vector(wrist_target)
    W = pose.world()
    shoulder = W[f'uarm_{side}'].translation
    clav0 = pose.quat.get(f'clav_{side}')
    if girdle:
        _girdle(pose, side, t, pole)
        W = pose.world()
        if (t - W[f'uarm_{side}'].translation).length > max(reach(side), (t - shoulder).length):
            if clav0 is None:   # the lift put the wrist out of reach: the collarbone as keyed
                pose.quat.pop(f'clav_{side}', None)
            else:
                pose.quat[f'clav_{side}'] = clav0
            W = pose.world()
    clav = W[f'clav_{side}']
    shoulder = W[f'uarm_{side}'].translation
    # the elbow in the plane of the shoulder-to-wrist line and the pole
    elbow, wrist, d, cos_s, sin_s, pv = _elbow(side, shoulder, t, pole)
    clav_rot = clav.to_quaternion()
    r_u = offset(f'farm_{side}').normalized()
    r_f = offset(f'hand_{side}').normalized()
    # the hand's turn when none is asked: the old swing-only chain's, so whatever it holds stays where it was
    u_swing = r_u.rotation_difference(clav_rot.inverted() @ (elbow - shoulder).normalized())
    f_swing = r_f.rotation_difference((clav_rot @ u_swing).inverted() @ (wrist - elbow).normalized())
    hand_local = pose.quat.get(f'hand_{side}')
    if hand_local is None:
        hand_local = euler(pose.rot.get(f'hand_{side}', (0, 0, 0))).to_quaternion()
    if hand_dir is not None:
        # the hand's rest long axis is down (-Z); its back faces outward (+X on the left, -X on the right)
        rest_dir = Vector((0, 0, -1))
        rest_up = Vector((1 if side == 'L' else -1, 0, 0))
        want_dir = Vector(hand_dir).normalized()
        want_up = Vector(hand_up if hand_up is not None else rest_up)
        want_up = (want_up - want_up.project(want_dir)).normalized()
        rest_m = Matrix((rest_dir, rest_up, rest_dir.cross(rest_up))).transposed()
        want_m = Matrix((want_dir, want_up, want_dir.cross(want_up))).transposed()
        q_hand = (want_m @ rest_m.inverted()).to_quaternion()
    else:
        q_hand = clav_rot @ u_swing @ f_swing @ hand_local
    # upper arm: its long axis on the elbow, its front (-Y at rest) the way the forearm bends
    bend = d * sin_s - pv * cos_s
    q_u = (_frame(elbow - shoulder, bend) @ _frame(r_u, (0, -1, 0)).inverted()).to_quaternion()
    pose.quat[f'uarm_{side}'] = clav_rot.inverted() @ q_u
    # forearm: the hinge, then its share of the hand's roll about it
    want_f = q_u.inverted() @ (wrist - elbow).normalized()
    hinge = r_f.rotation_difference(want_f)
    fa = q_u @ hinge
    back = Vector((1 if side == 'L' else -1, 0, 0))
    seen, wanted = fa @ back, q_hand @ back
    axis = (wrist - elbow).normalized()
    seen, wanted = seen - seen.project(axis), wanted - wanted.project(axis)
    roll = 0.0
    if seen.length > 1e-6 and wanted.length > 1e-6:
        roll = math.atan2(axis.dot(seen.cross(wanted)), seen.dot(wanted))
    roll = max(-math.pi / 2, min(math.pi / 2, roll * PRONATE))
    pose.quat[f'farm_{side}'] = hinge @ Quaternion(r_f, roll)
    W = pose.world()
    pose.quat[f'hand_{side}'] = W[f'farm_{side}'].to_quaternion().inverted() @ q_hand
    return elbow


def rehinge(pose, side):
    """Arm `side` solved again to where it is, its wrist, elbow and hand kept: an arm posed by turns alone (a capture)
    rolled onto its elbow's hinge. The collarbone stays as it is."""
    W = pose.world()
    sh, el, wr = (W[f'{j}_{side}'].translation for j in ('uarm', 'farm', 'hand'))
    line = (wr - sh).normalized()
    pole = (el - sh) - (el - sh).project(line)
    if pole.length < 1e-4:
        pole = W['chest'].to_3x3() @ Vector((0.0, 1.0, 0.0))
    H = W[f'hand_{side}'].to_3x3()
    out = 1.0 if side == 'L' else -1.0
    solve_arm(pose, side, wr, pole, hand_dir=H @ Vector((0.0, 0.0, -1.0)), hand_up=H @ Vector((out, 0.0, 0.0)),
              girdle=False)
