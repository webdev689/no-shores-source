"""The torch as the third person sees it, lit in a fist: the first-person torch's make (fptorch.py `torch_mesh`) at a
carried torch's length, and a flame of its own over the coals, lit by itself.

Its own frame is the first-person torch's: the grip's middle on the handle's axis at the origin, +Z up the handle
toward the head. It is held upright in the left fist, leant a little ahead, laid where the pose closes that fist
and never solving the arm again, so the body drawn without it closes the same hand (`TorchBearer`). In the cast the
left hand throws the spell (casting.py), so the torch is in the right fist; a weapon is put away for it.

The flame is three teardrops round the cage's axis, each inside the last, deep orange to white-hot at its root, with
a few tongues licking up off it; Daggerfall's own fires are such a flat-lit shape at a sprite's size."""
import math

import numpy as np

import fpbow
import fptorch

LAYER = 'torch_l'
MATERIAL = 'torch'   # every material of it is named `torch.<role>`: one class for the grade, which leaves it as lit

# the third person's torch, metres: the first-person make with a carried torch's handle under the fist
SHAPE = {**fptorch.TORCH, 'handle_below': 0.30, 'socket': 0.12, 'handle_r': 0.022}
UP = (0.0, -0.22, 1.0)   # its line in body space: upright, leant a little ahead (-Y)
ACROSS = (1.0, 0.0, 0.0)   # the way its first strap faces, body space

# the flame's teardrops: (its height, its widest radius, how far up it is widest, a share of its height), outer first
FLAME = ((0.27, 0.058, 0.30), (0.19, 0.041, 0.28), (0.10, 0.022, 0.30))
FLAME_RGB = ((255, 120, 24), (255, 186, 58), (255, 244, 196))   # deep orange, yellow, white-hot
FLAME_GLOW = (1.4, 1.8, 2.4)
TONGUES = 4   # the tongues licking up off the outer flame, each its own height and lean
WOOD = ((0.06, 0.04, 0.025), (0.16, 0.1, 0.055))   # the handle's oiled wood, dark and light


# the animations it is drawn in: the shield's stance in place of the idle and the walk, and its cut for the attack
# (onehand.py: a torch is held up where a shield is), the bow at rest's with the weapon put away (poses.py `AT_REST`:
# the left fist carried ahead, the right arm free), the flinch, the cast and the body's moves with the hands free.
# Never on the wall (agility.py `BARE`), in the saddle or let fall: a dead fighter's torch goes out
ANIMS = ('guard', 'march', 'slash', 'hurt', 'idle_bow', 'walk_bow', 'hurt_bow', 'cast', 'run', 'crouch_idle',
         'crouch_walk', 'jump')
RIGHT = ('cast',)   # the fist it is held in there: the right


def _teardrop(height, wide, at, z0, n=20, rings=14, x=0.0, y=0.0):
    """A flame's teardrop up +Z from `z0`: round at its foot, widest `at` its height, drawn to a point at its top."""
    from fpmodel import _axis_loft
    t = np.linspace(0.0, 1.0, rings)
    r = np.where(t < at, np.sqrt(np.clip(1.0 - ((at - t) / at) ** 2, 0.0, 1.0)),
                 ((1.0 - t) / (1.0 - at)) ** 1.4) * wide + 1e-4
    return _axis_loft(z0 + t * height, r, r, n=n, caps=(True, False), x=x, y=y)


def flame_mesh(S=SHAPE, seed=7):
    """The flame over the coals: (vertices, triangles, layer: 0 outer, 1 middle, 2 core)."""
    z0 = fptorch.coal_top(S) - 0.006
    pieces = [(*_teardrop(h, w, at, z0), k) for k, (h, w, at) in enumerate(FLAME)]
    rng = np.random.default_rng(seed)
    h0, w0, _ = FLAME[0]
    for i in range(TONGUES):   # tongues round the outer flame, each its own height, leant out from the axis
        a = 2.0 * math.pi * (i + rng.uniform(-0.2, 0.2)) / TONGUES
        out = w0 * 0.45
        v, t = _teardrop(h0 * rng.uniform(0.55, 0.85), w0 * 0.42, 0.35, z0 + h0 * 0.18, n=12, rings=10,
                         x=out * math.cos(a), y=out * math.sin(a))
        pieces.append((v, t, 0))
    return fpbow._join(pieces)


def build():
    """The torch lit, as objects in its own frame: its body in oiled wood, worked iron, pitch and embers, and its
    flame, each material `torch.<role>`."""
    import bpy
    import axes
    import gear
    import materials
    from body import rest_attr
    pitch = materials.plain(f'{MATERIAL}.pitch', (0.05, 0.035, 0.022), rough=0.55, spec=0.35)
    ember = gear._glow(f'{MATERIAL}.ember', (230, 90, 16), 2.5)
    body_mats = [axes.wood(f'{MATERIAL}.wood', *WOOD), axes.iron(f'{MATERIAL}.iron', dark=(0.3, 0.3, 0.3),
                                                                  light=(0.38, 0.38, 0.38), dents=90.0), pitch, ember]
    flames = [gear._glow(f'{MATERIAL}.flame{k}', rgb, glow) for k, (rgb, glow) in enumerate(zip(FLAME_RGB, FLAME_GLOW))]
    out = []
    for name, (v, t, m), mats in ((f'{LAYER}.body', fptorch.torch_mesh(SHAPE), body_mats),
                                  (f'{LAYER}.flame', flame_mesh(), flames)):
        used = sorted(set(m.tolist()))
        me = bpy.data.meshes.new(name)
        me.from_pydata(v.tolist(), [], t.tolist())
        for k in used:
            me.materials.append(mats[k])
        me.polygons.foreach_set('material_index', [used.index(k) for k in m.tolist()])
        me.update()
        me.shade_smooth()
        rest_attr(me)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        out.append(ob)
    return out


def holder(Bare):
    """`Bare` (layers.py) holding the torch in a fist: the left, or the right where the left throws a spell
    (`RIGHT`). The gear's left-hand frame is the torch's wherever it is drawn (`key_gear`), so what the left fist
    held besides (a shield's frame in the stance) is never read."""
    import poses

    class TorchBearer(Bare):
        def key_gear(self, pose, gear):
            """The gear as `place` lays it: the strip's key (layers.py `Keys.pose`) holds the torch's hold."""
            side = 'R' if getattr(pose, 'anim', None) in RIGHT else 'L'
            return {**gear, 'off': poses.in_fist(pose, UP, side, ACROSS)}

        def place(self, pose, gear):
            gear.update(self.key_gear(pose, gear))
            super().place(pose, gear)
    return TorchBearer


def held_layers(body, classify, Bare, Layer):
    """The torch's layer on `body`: lit, in a fist."""
    TorchBearer = holder(Bare)
    bearer = TorchBearer(body, 'sword')
    bearer.off = build()
    return [Layer(LAYER, bearer, bearer.off, classify)]
