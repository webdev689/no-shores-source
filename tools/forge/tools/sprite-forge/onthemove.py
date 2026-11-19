"""On the move: an action played while walking. The action's chest, arms, head and what it holds, over the legs and
hips of the walk that action's weapon walks in, one stride over the action's frames.

The upper body keeps the turn the action gives it in the world, and half its lean: on straight walking legs a lunge's
full lean bows the body over. The walk's hips are laid under it, going the walk's way, and the spine is turned against
them. The action keeps its own fit (the bow's shot's matches Daggerfall's) and its stance's turn. What the action holds
(a weapon, a bow's nock, a spell's spark, a muzzle's flash) moves with the chest. A blow's crouch and lunge are a
standing body's: on the move the legs walk, so the blow is struck from the stride, at the walk's height.

Each moving animation is its action's name and `walk`: the blows (`over1hwalk`), the bow's shot (`bowshotwalk`, its
legs the bow's own walk), the rifle's, the pistol's and the braced pistols' shots and the reloads (`gunshotwalk`),
and the cast (`castwalk`)."""
from mathutils import Matrix, Quaternion, Vector

import blows
import bowhold  # noqa: F401  the bow's walk, registered in poses
import casting
import gunplay
import poses

# each moving animation: the action it plays and the walk its legs take
WALKS = {**{f'{b}walk': (b, 'walk') for b in blows.BLOWS},
         'bowshotwalk': ('bow', 'bowwalk'), 'castwalk': ('cast', 'walk'),
         'gunshotwalk': ('gunshot', 'gunwalk'), 'gunreloadwalk': ('gunreload', 'gunwalk'),
         'pistolshotwalk': ('pistolshot', 'pistolwalk'), 'pistolreloadwalk': ('pistolreload', 'pistolwalk'),
         'braceshotwalk': ('braceshot', 'bracewalk')}
# the actions' frames, each moving animation as many as its action
FRAMES_OF = {**blows.BLOWS, 'bow': 4, **casting.CAST, **gunplay.RIFLE, **gunplay.PISTOL, **gunplay.BRACE}
MOVES = {name: FRAMES_OF[act] for name, (act, _) in WALKS.items()}
STRIDE = 4   # a walk's frames: one stride over the action
LEAN = 0.5   # the share of the action's lean the walking chest keeps
LEGS = tuple(f'{j}_{s}' for s in 'LR' for j in ('thigh', 'shin', 'foot'))


def act_of(anim):
    """The action a moving animation plays, or the animation itself."""
    return WALKS[anim][0] if anim in WALKS else anim


def _turn(p, j):
    """Joint `j`'s local turn as a quaternion, set by IK or keyed."""
    return p.quat[j].copy() if j in p.quat else p.local(j).to_quaternion()


def _upright(act, walk):
    """The action's chest turn `act` over the walk's `walk`: all its turn about the vertical, LEAN of its tilt."""
    d = act @ walk.inverted()
    twist = Quaternion((d.w, 0.0, 0.0, d.z)).normalized()
    return Quaternion().slerp(d @ twist.inverted(), LEAN) @ twist @ walk


def _carried(T, key, v):
    """What an action holds, moved with the chest by `T`: a matrix or a point whole, a spark's or a flash's place."""
    if isinstance(v, (Matrix, Vector)):
        return T @ v
    if key in ('spark', 'flash'):
        M, what = v
        return T @ M, what
    return v


def moving(name):
    act, walk = WALKS[name]
    frames = MOVES[name]

    def frame_of(frame, view, yaw):
        poses._adj = poses.FIT.get(f'{act}:{view}:{frame}', {})   # the action's own fit (the bow's shot's)
        p, gear = poses.ANIMS[act](frame, view, yaw)
        poses._adj = {}   # the walk unfitted, as a carried walk is
        w, _ = poses.ANIMS[walk](frame * STRIDE // frames, view, yaw)
        before = p.world()
        p.root_loc, p.yaw = w.root_loc.copy(), w.yaw   # the hips go the walk's way, whatever turn the action stands in
        for j in ('pelvis', *LEGS):
            p.quat[j] = _turn(w, j)
        chest = _upright(before['spine'].to_quaternion(), w.world()['spine'].to_quaternion())
        p.quat['spine'] = p.world()['pelvis'].to_quaternion().inverted() @ chest
        if act in blows.BLOWS and blows.aimed(act, frame):   # keyed arms laid again on the walking body
            return p, blows.struck(p, act, frame)
        T = p.world()['spine'] @ before['spine'].inverted()
        return p, {k: _carried(T, k, v) for k, v in gear.items()}
    return frame_of


ANIMS = {name: moving(name) for name in WALKS}
poses.ANIMS.update(ANIMS)
poses.FISTS.update({name: poses.FISTS.get(act, 'LR') for name, (act, _) in WALKS.items()})
