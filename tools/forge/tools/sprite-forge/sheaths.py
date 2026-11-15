"""Weapons worn on the body: a dagger or a sword at the waist in its sheath, a great sword, a battle axe or a staff on
the back, a bow across the back with its quiver across the waist; a Pistolet in a holster at the waist and the
Thunderlock slung across the back (guns3p.py). Each starts where the Morrowind body's Weapon
Sheathing lays it (src/systems/weaponSheathing.js; the addon's bones, vendor/weapon-sheathing xbase_anim_sh.nif): the
one-handers at the front of the left hip, run back and down past it; the two-handers on the upper back, the grip over
the right shoulder. Morrowind's units are 0.014 m on the forge's body (its pelvis and head joints at 76 and 119 units,
the forge's at 0.97 and 1.57 m), its +Y ahead the forge's -Y and its -X left the forge's +X.

Each piece is rigid on the joint it rides (the pelvis, the spine or the chest, gear.py `hang`), so it moves with the
body. It is laid clear (`clear`): leant out at its foot and pushed out until no surface of it crosses the body's or any
piece of any armour set (`Envelope`), in the standing frames it is laid in; not the arms', which swing past it. It is
drawn where it was laid in more (`anims_of`): struck, casting, fallen and riding. Each metal's
bow, staff and dagger is worn as the one held is made. It rides the trunk's part, not a weapon's, and its order is over
a skirt's and a cloak's: it is drawn over either wherever it lies over the body (forgeLayers.js). The quiver's is under
a cloak's: a cape hangs over it at the waist. A sword or a dagger is
two layers: sheathed (`sheath_<kind>`) and its sheath empty while drawn (`scabbard_<kind>`), the sheath lying in both
where it lies in either. A bow is worn with the quiver, a layer of its own, which stays while the bow is drawn.

A shield is slung flat on the back while the weapon is sheathed, or while a weapon it is never held with is out
(`slung_shield_<kind>_<metal>`). A crossbow is slung down the spine, over a shield worn with it, one layer for each
kind (`sheath_crossbow_<metal>_<kind>`). Each hand's weapon is worn at the other hip, so the two never share one: the
right hand's at the left hip, the left hand's (`<layer>_l`) at the right, where the left-hip hold is mirrored. So a
pair of a blade and a Pistolet wears its holster and its sheath apart. A Pistolet's holster hangs at the front of its
hip, the grip up and the butt forward to the drawing hand.

Points and ways are in body space, as poses.py's: the ground under the body, +X its left, -Y ahead, +Z up."""
import math

import numpy as np
from mathutils import Matrix, Quaternion, Vector

import armour
import bows
import clothes
import daggers3p
import gear
import gunplay
import guns3p
import agility
import onehand
import poses
import riding
import shields3p
from body import coords
from rig import rest
from shapes import tube_path

# where each is held: the joint it rides, its grip, the way its business end runs from the grip, its flat's way, and
# the way it is pushed clear of the armour. The hip is the addon's one-handers' bone; the back its two-handers'
HOLDS = {
    # the hip's grip at the belt, under the pauldron's edge however the shoulder swings
    'hip': ('pelvis', (0.151, -0.084, 1.04), (0.11, 0.63, -0.77), (0.0, -0.77, -0.63), (1.0, 0.25, 0.0)),
    # a great sword across the back, its tip out past the left leg's swing
    'back': ('chest', (-0.12, 0.139, 1.49), (0.47, 0.03, -0.88), (0.88, 0.0, 0.47), (0.0, 1.0, 0.0)),
    # an axe's head up behind the right shoulder blade, its haft down the back; a staff's head over the right shoulder
    'back_up': ('chest', (0.04, 0.15, 0.83), (-0.22, 0.02, 0.975), (0.975, 0.0, 0.22), (0.0, 1.0, 0.0)),
    'staff': ('chest', (0.0, 0.15, 1.20), (-0.55, 0.0, 0.83), (0.83, 0.0, 0.55), (0.0, 1.0, 0.0)),
    # a bow flat across the back from the left hip up over the right shoulder, its string toward the left shoulder; the
    # quiver across the small of the back at the belt, riding the spine as the back plates over it do, its mouth a
    # little up and the arrows out past the right hip where the right hand draws, its foot short of the bow's limb
    'bow': ('chest', (-0.02, 0.15, 1.36), (-0.64, 0.0, 0.77), (0.0, -1.0, 0.0), (0.0, 1.0, 0.0)),
    'quiver': ('spine', (-0.077, 0.15, 1.08), (-0.985, 0.0, 0.17), (0.17, 0.0, 0.985), (0.0, 1.0, 0.0)),
    # the left hand's blade at the right hip, the hip's mirror
    'hip_r': ('pelvis', (-0.151, -0.084, 1.04), (-0.11, 0.63, -0.77), (0.0, -0.77, -0.63), (-1.0, 0.25, 0.0)),
    # a Pistolet holstered at the front of the hip across from its hand, its muzzle down and back, its butt forward;
    # the Thunderlock slung flat across the back, its butt at the left hip, its muzzle up past the right shoulder, its
    # belly toward the right hip and its lock out (guns3p.py's frame: the muzzle +Z, the belly +X)
    'holster': ('pelvis', (0.17, -0.10, 1.06), (0.12, 0.30, -0.95), (0.0, -1.0, 0.25), (1.0, 0.2, 0.0)),
    'holster_r': ('pelvis', (-0.17, -0.10, 1.06), (-0.12, 0.30, -0.95), (0.0, -1.0, 0.25), (-1.0, 0.2, 0.0)),
    'sling': ('chest', (0.0, 0.16, 1.00), (-0.5, 0.0, 0.866), (-0.866, 0.0, -0.5), (0.0, 1.0, 0.0)),
    # a shield slung flat on the back between the shoulder blades, its face out and its top leant back with the spine
    'shield': ('chest', (0.0, 0.14, 1.24), (0.0, 0.12, 0.99), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
    # a crossbow slung flat down the spine, its prod across the shoulders under the neck and its stock down the back:
    # it lies nearest the back so, clear of every set's pauldrons
    'crossbow': ('chest', (0.0, 0.16, 1.25), (0.0, 0.0, 1.0), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0)),
}
CLEAR = 0.01    # how far past the last crossing a worn weapon is pushed
UNDER = 0.2     # past the body's outline, how far behind a skirt or a cloak a worn weapon may lie and still be drawn
                # over it (forgeLayers.js `under`): a skirt's flare, a cloak's edge over the quiver's arrows
ORDER = clothes.ORDER['cloak'] + 0.001   # its order: over a skirt and over a cloak, as a belt's and a strap's are
QUIVER_ORDER = (clothes.ORDER['drape'] + clothes.ORDER['cloak']) / 2   # the quiver's: over a skirt, under a cloak


def order_of(layer):
    """A worn weapon's order (forgeLooks.json `order`): the quiver at the waist under a cloak, any other over it."""
    return QUIVER_ORDER if layer == 'quiver' else ORDER

# each sword's sheath: its hold, the scale of its hilt, the length of its sheath from the guard, its girth (a
# dagger's is fitted to its own blade, `_dagger`)
SWORDS = {'sword': ('hip', 1.0, 0.86, 0.018),
          'greatsword': ('back', 1.1, 1.0, 0.022)}   # a claymore's metre of blade: swung back with the chest in a
                                                       # walk, its tip stays under a cloak


def frame(hold):
    """A hold's frame: its grip at the origin, its business end up +Z, its flat in the XZ plane."""
    _, at, way, flat, _ = HOLDS[hold]
    z = Vector(way).normalized()
    x = Vector(flat)
    x = (x - x.project(z)).normalized()
    m = Matrix((x, z.cross(x), z)).transposed().to_4x4()
    m.translation = Vector(at)
    return m


def _laid(obs, m):
    for ob in obs:
        ob.data.transform(m)
        ob.data.update()
    return obs


FLAT = (1.5, 0.65)   # a scabbard across its blade's flat (its frame's X) and through it, a share of its girth


def _scabbard(name, length, girth, A, top):
    """A sheath from the guard down `length`: leather, a metal mouth and a metal chape at its tip, its tip rounded,
    flat as the blade in it (`FLAT`), so at a sprite's size it reads as a scabbard and never a rod."""
    pts = [(0.0, 0.0, top + length * t) for t in np.linspace(0.0, 1.0, 12)]
    body = tube_path(name, pts, lambda t: girth * (1.0 - 0.35 * t ** 4), A['strap'], n=8)
    mouth = tube_path(f'{name}.mouth', [(0.0, 0.0, top - 0.004), (0.0, 0.0, top + 0.03)], girth * 1.18, A['trim'], n=8)
    chape = tube_path(f'{name}.chape', [(0.0, 0.0, top + length * 0.86), (0.0, 0.0, top + length * 0.99)],
                      girth * 0.98, A['trim'], n=8)
    return _laid([body, mouth, chape], Matrix.Diagonal((*FLAT, 1.0, 1.0)))


def _sword(kind, M, A):
    """`kind`'s sheath (sword, great sword) in its frame, twice: with the hilt over its mouth (sheathed) and
    empty (the sword drawn). Gives (the sheath, the hilt, the empty sheath)."""
    import bpy
    import metals
    _, k, length, girth = SWORDS[kind]
    top = metals.TOPS['Steel'] * k
    made = gear.build_sword(M)
    hilt = [ob for ob in made if not ob.name.startswith('sword_blade')]
    for ob in made:
        if ob.name.startswith('sword_blade'):   # the blade is in the sheath, unseen
            bpy.data.objects.remove(ob, do_unlink=True)
    _laid(hilt, Matrix.Scale(k, 4))
    return (_scabbard(f'sheath_{kind}', length, girth, A, top), hilt,
            _scabbard(f'scabbard_{kind}', length, girth, A, top))


def _quiver(M, A):
    """A quiver of leather, a metal rim, five arrows standing out of it, their feathers pale: 44 cm, to lie across a
    waist."""
    obs = [tube_path('quiver', [(0.0, 0.0, -0.20), (0.0, 0.0, 0.24)], lambda t: 0.042 + 0.006 * t, A['leather'], n=10),
           tube_path('quiver.rim', [(0.0, 0.0, 0.225), (0.0, 0.0, 0.25)], 0.05, A['trim'], n=10),
           tube_path('quiver.strap', [(-0.044, 0.0, -0.12), (-0.044, 0.0, 0.12)], 0.01, A['strap'], n=6)]
    for k, (x, y) in enumerate(((0.0, 0.0), (0.02, 0.012), (-0.02, 0.01), (0.012, -0.018), (-0.014, -0.016))):
        tip = 0.36 + 0.015 * (k % 2)
        obs.append(tube_path(f'quiver.arrow{k}', [(x, y, 0.0), (x, y, tip)], 0.0045, M['wood'], n=4))
        obs.append(tube_path(f'quiver.fletch{k}', [(x, y, tip - 0.09), (x, y, tip)], 0.011, A['trim'], n=4))
    return obs


def _bow(M, metal=None, kind='long'):
    """A bow braced as the held one is (shape.py `transform`, the body's own bend) and strung, in its frame: `metal`'s
    own of type `kind` (gear.py `build_metal_bow`), else the class's long bow."""
    import shape
    obs = gear.build_metal_bow(M, metal, kind) if metal else gear.build_bow(M)
    for ob in obs:
        ob.data.vertices.foreach_set('co', shape.transform(ob.name.split('.')[0], coords(ob.data)).ravel())
        ob.data.update()
    a, b = gear.bow_tips(kind=kind)
    return obs + [gear.string_mesh(M, a, (a + b) / 2, b)]


def _crossbow(metal):
    """`metal`'s crossbow (gear.py `build_crossbow`) at its held length, in a hold's frame: its prod's end up (+Z), the
    prod across the flat (+X), its middle at the grip."""
    k = gear.CROSSBOW_LEN / gear.CROSSBOW_MODEL_LEN
    mid = (gear.CROSSBOW_MODEL_HOLD - 0.5) * gear.CROSSBOW_MODEL_LEN   # the model's middle along its aim (+X)
    m = Matrix(((0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (1.0, 0.0, 0.0))).to_4x4() @ Matrix.Scale(k, 4) @ \
        Matrix.Translation((-mid, 0.0, 0.0))
    obs = gear.build_crossbow(metal)
    for ob in obs:   # each its own mesh, its own placing baked in
        ob.data = ob.data.copy()
        ob.data.transform(m @ ob.matrix_basis)
        ob.matrix_basis = Matrix.Identity(4)
    return obs


def _dagger(metal, A):
    """`metal`'s own dagger (daggers3p.py, as the third person holds it) in its frame, twice: its hilt over a sheath
    fitted to its blade (sheathed) and the sheath empty. Gives (the sheath, the hilt, the empty sheath)."""
    import bmesh
    ob, = daggers3p.build(metal)
    blade = {i for i, m in enumerate(ob.data.materials) if m.name.startswith('steel.')}   # its blade and fuller
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    cut = [f for f in bm.faces if f.material_index in blade]
    edge = np.array([v.co[:] for f in cut for v in f.verts])
    bmesh.ops.delete(bm, geom=cut, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    top, tip = float(edge[:, 2].min()), float(edge[:, 2].max())
    girth = float(np.abs(edge[:, 0]).max()) * 0.75 + 0.003   # round over the flat of the blade
    name = metal.lower()
    return (_scabbard(f'sheath_dagger_{name}', tip - top + 0.01, girth, A, top), [ob],
            _scabbard(f'scabbard_dagger_{name}', tip - top + 0.01, girth, A, top))


def _finish(f):
    """A finish's suffix on a layer's name: none for the plain, `_gilded` for the gold."""
    return '' if f == 'plain' else f'_{f}'


def _guns(lay, A):
    """The guns worn (guns3p.py): each hand's Pistolet in its holster at the other hip, or the holster empty while it
    is drawn; the Thunderlock slung on the back. Each in each finish. Pieces as `build` gives them."""
    kinds = []
    for hand, hold in (('', 'holster'), ('_l', 'holster_r')):
        empty = lay(hold, guns3p.build_holster(f'scabbard_pistolet{hand}', A))
        by_layer, held = {f'scabbard_pistolet{hand}': empty}, None
        for f in guns3p.FINISHES:
            name = f'sheath_pistolet{_finish(f)}{hand}'
            gun = lay(hold, guns3p.build_pistolet(f, name=name))
            by_layer[name] = lay(hold, guns3p.build_holster(f'{name}.holster', A)) + gun
            held = held or gun
        groups = [(empty, LEFT if hand else EMPTY_HOLSTER), (held, LEFT if hand else SHEATHED)]
        kinds.append([(hold, groups, by_layer, False)])
    slung = {f'sheath_thunderlock{_finish(f)}': lay('sling', guns3p.build_thunderlock(f, f'sheath_thunderlock_{f}'))
             for f in guns3p.FINISHES}
    kinds.append([('sling', [(slung['sheath_thunderlock'], SHEATHED)], slung, False)])
    return kinds


def build(M, A, want=()):
    """Every worn weapon as pieces to be laid clear (`hang_all`), each (its hold, what of it must lie clear in which
    animations, its objects by layer, whether it lies over the pieces of its kind laid before it), laid in body space
    where its hold lays it. A piece moves as one in every layer it is in: a sheath lies where it lay with the sword in
    it once the sword is drawn, and the quiver clear of every bow, worn with it or not. Each metal's bow, staff and
    dagger is its held one's (layers.py BOW_LAYERS, STAFF_LAYERS, daggers3p.py). With `want` (layer names), only the
    pieces of those layers."""
    lay = lambda hold, obs: _laid(obs, frame(hold))   # noqa: E731
    kinds = []
    for kind, (hold, *_) in SWORDS.items():
        sheath, hilt, empty = (lay(hold, obs) for obs in _sword(kind, M, A))
        kinds.append([(hold, [(empty, DRAWN), (hilt, SHEATHED)],
                       {f'sheath_{kind}': sheath + hilt, f'scabbard_{kind}': empty}, False)])
    for metal in daggers3p.METALS:
        sheath, hilt, empty = (lay('hip', obs) for obs in _dagger(metal, A))
        m = metal.lower()
        kinds.append([('hip', [(empty, DRAWN), (hilt, SHEATHED)],
                       {f'sheath_dagger_{m}': sheath + hilt, f'scabbard_dagger_{m}': empty}, False)])
    # the left hand's sword and each metal's dagger at the right hip
    sheath, hilt, empty = (lay('hip_r', obs) for obs in _sword('sword', M, A))
    kinds.append([('hip_r', [(empty, LEFT), (hilt, LEFT)], {'sheath_sword_l': sheath + hilt, 'scabbard_sword_l': empty},
                   False)])
    for metal in daggers3p.METALS:
        sheath, hilt, empty = (lay('hip_r', obs) for obs in _dagger(metal, A))
        m = metal.lower()
        kinds.append([('hip_r', [(empty, LEFT), (hilt, LEFT)],
                       {f'sheath_dagger_{m}_l': sheath + hilt, f'scabbard_dagger_{m}_l': empty}, False)])
    axe = lay('back_up', gear.build_axe(M))
    kinds.append([('back_up', [(axe, SHEATHED)], {'sheath_axe': axe}, False)])
    for metal in bows.METALS:
        staff = lay('staff', gear.build_staff(M, metal))
        kinds.append([('staff', [(staff, SHEATHED)], {f'sheath_staff_{metal.lower()}': staff}, False)])
    pieces = []
    for kind in gear.BOW_KINDS:
        for metal in bows.METALS:
            bow = lay('bow', _bow(M, metal, kind))
            pieces.append(('bow', [(bow, SHEATHED)], {f'sheath_bow_{kind}_{metal.lower()}': bow}, False))
    quiver = lay('quiver', _quiver(M, A))
    kinds.append(pieces + [('quiver', [(quiver, NOCKED)], {'quiver': quiver}, True)])
    kinds += _guns(lay, A)
    # each shield slung on the back, laid clear of the body as every piece is; each metal's crossbow slung alone, and
    # again over each kind of shield (`_<kind>`) for the two put away at once, so they never cross (the quiver's way)
    for kind in shields3p.KINDS:
        over = [f'sheath_crossbow_{m}_{kind}' for m in gear.CROSSBOW_METALS]
        slung = []
        for metal in shields3p.METALS:
            name = f'slung_shield_{kind}_{(metal or "plain").lower()}'
            if want and name not in want and not set(over) & set(want):
                continue
            obs = lay('shield', shields3p.build(kind, metal, M, armour.palette(metal or 'Iron', M)))
            slung.append(('shield', [(obs, SHEATHED)], {name: obs}, False))
        for m, name in zip(gear.CROSSBOW_METALS, over):
            if not want or name in want:
                obs = lay('crossbow', _crossbow(m))
                slung.append(('crossbow', [(obs, SHEATHED)], {name: obs}, True))
        kinds.append(slung)
    for m in gear.CROSSBOW_METALS:
        name = f'sheath_crossbow_{m}'
        if not want or name in want:
            obs = lay('crossbow', _crossbow(m))
            kinds.append([('crossbow', [(obs, SHEATHED)], {name: obs}, False)])
    if want:
        # a piece laid over its kind (the quiver over the bows) is laid over all of them in every run, so it lies the
        # same whichever layers the run draws; they are built to clear it, drawn only where asked
        wanted = lambda pc: bool(set(pc[2]) & set(want))   # noqa: E731
        kinds = [[pc for pc in pieces if wanted(pc) or (not pc[3] and any(o[3] and wanted(o) for o in pieces))]
                 for pieces in kinds]
    return [pieces for pieces in kinds if pieces]


# every worn weapon's layer: a sword's and each metal's dagger's sheathed and its sheath empty, the left hand's too; an
# axe; each metal's staff; each type of bow in each metal, and the quiver worn with any of them; each hand's Pistolet
# holstered in each finish and its holster empty; the Thunderlock slung in each finish
LEFT_LAYERS = (*(f'{s}_sword_l' for s in ('sheath', 'scabbard')),
               *(f'{s}_dagger_{m.lower()}_l' for m in daggers3p.METALS for s in ('sheath', 'scabbard')))
GUN_LAYERS = (*(f'sheath_pistolet{_finish(f)}{h}' for h in ('', '_l') for f in guns3p.FINISHES),
              'scabbard_pistolet', 'scabbard_pistolet_l', *(f'sheath_thunderlock{_finish(f)}' for f in guns3p.FINISHES))
LAYERS = (*(f'{s}_{k}' for k in SWORDS for s in ('sheath', 'scabbard')),
          *(f'{s}_dagger_{m.lower()}' for m in daggers3p.METALS for s in ('sheath', 'scabbard')),
          'sheath_axe', *(f'sheath_staff_{m.lower()}' for m in bows.METALS),
          *(f'sheath_bow_{k}_{m.lower()}' for k in gear.BOW_KINDS for m in bows.METALS), 'quiver', *LEFT_LAYERS,
          *GUN_LAYERS, *(f'slung_shield_{k}_{(m or "plain").lower()}' for k in shields3p.KINDS
                         for m in shields3p.METALS),
          *(f'sheath_crossbow_{m}{s}' for m in gear.CROSSBOW_METALS for s in ('', *(f'_{k}' for k in shields3p.KINDS))))
# a metal's own bow or staff, and a slung shield, its metal grey for the game to dye
DYED = ('sheath_bow_', 'sheath_staff_', 'slung_shield_')


ARMS = ('uarm', 'farm', 'hand')   # what swings past a worn weapon, never what it lies on
# the frames a worn weapon is drawn in: sheathed in the idle and the walk; the empty sheath while its blade is in the
# hand as well, in the sword's attack (a dagger's and a great sword's too); the quiver in the bow's, and in the walk
# and the idle with the bow at rest in the left fist
SHEATHED = ('idle', 'walk')
DRAWN = SHEATHED + ('attack_sword',)
# the quiver stays on the back in every move a bow's look plays: its class records (the archer's swing and hurt), the
# bow's own, the bow at rest and the fall, so it never comes and goes between them
NOCKED = DRAWN + ('hurt', 'bow', *poses.AT_REST, 'death', 'fallen')
# the left hand's weapon is in the left fist only in a brace's moves and the twin blades'. So it lies at its hip,
# sheathed or its sheath empty, through whatever the right hand does, the hurt included
LEFT = DRAWN + ('hurt', 'attack_axe', *gunplay.PISTOL, *gunplay.BRACE, *onehand.TWIN)
# the right's holster while its Pistolet is drawn, and through the hurt, which a gun's look keeps as it is
EMPTY_HOLSTER = SHEATHED + ('hurt', *gunplay.PISTOL, *gunplay.BRACE)
STEP = 0.005    # how finely the push out is found, metres


# The frames above are those a worn weapon is laid clear in. It is drawn, rigid where it was laid, in more: the
# weapon sheathed while the body is struck, casts, falls, lies, rides, crouches, jumps and climbs; its sheath empty in
# every move the blade is in the hand, a foe's own moves too, the shield's, the twin blades', the crouch and the jump
STRUCK = ('hurt', 'spell', 'cast', 'death', 'fallen', *riding.RIDE, *agility.MOVES, *gunplay.RUNS)
OWN_MOVES = ('parry', 'warcry', 'breathe', 'thrust', 'chop', 'swing2h')
# a crossbow's moves as a player plays them: the shot and the crossbow at rest
SHOT = ('bow', 'idle_bow', 'walk_bow', 'hurt_bow')
# what the other hand's weapon is worn through, drawn out of the hand that holds no shield: a blade's or a bare fist's,
# an axe's, a Pistolet's and a crossbow's moves
BESIDE = ('attack_sword', 'attack_axe', 'thrust', *gunplay.PISTOL, *SHOT)
EMPTY = DRAWN + ('hurt', 'spell', 'death', 'fallen', *OWN_MOVES, *onehand.SHIELDED, *onehand.TWIN, *agility.HELD)
# the bow at rest's idle, walk and flinch: a torch is carried so, the right hand's blade put away (torch3p.py)
CARRIED = ('idle_bow', 'walk_bow', 'hurt_bow')
TORCH_SHEATHS = ('sheath_sword', 'sheath_greatsword', 'sheath_dagger_')   # the blades a torch is held beside


def anims_of(layer):
    """The animations a worn weapon's layer is drawn in."""
    if layer.endswith('_l'):
        return list(dict.fromkeys(LEFT + ('spell', 'cast', 'death', 'fallen', *OWN_MOVES, *agility.MOVES)
                                  + ((*riding.RIDE, *SHOT) if layer.startswith('sheath_') else ())))
    if layer == 'scabbard_pistolet':
        return list(EMPTY_HOLSTER + ('death', 'fallen'))
    if layer == 'quiver':
        return list(dict.fromkeys(NOCKED + ('spell', 'cast', *riding.RIDE, *agility.MOVES, *gunplay.RUNS)))
    if layer.startswith('sheath_crossbow_'):   # put away, or beside the other hand's weapon out; over a shield: away
        return list(dict.fromkeys(SHEATHED + STRUCK + (() if layer.rsplit('_', 1)[1] in shields3p.KINDS else BESIDE)))
    if layer.startswith('slung_shield_'):   # and while an axe, a Pistolet or a crossbow is out (not a blade: a guard)
        return list(dict.fromkeys(SHEATHED + STRUCK + ('attack_axe', *gunplay.PISTOL, *SHOT)))
    if layer.startswith(TORCH_SHEATHS):   # and beside a torch carried at rest
        return list(dict.fromkeys(SHEATHED + STRUCK + CARRIED))
    return list(dict.fromkeys(SHEATHED + STRUCK if layer.startswith(('sheath_', 'slung_')) else EMPTY))


# a hip's sheath runs down and back, so under a body on its back it would run into the ground: in the death and the
# fall it is laid along its thigh instead, clear of the floor (a piece on the back lies under the body)
FELL = ('death', 'fallen')
FLOOR = 0.01
# in the body's moves a hip's piece swings on its belt as the hips lean (the run's, the crouch's): it hangs at the
# angle it hangs at standing, turned about its grip, a share of the lean taken (the belt holds it a little)
HUNG = (*agility.MOVES, *gunplay.RUNS)
HANG_SHARE = 0.8


def hip_hold(layer):
    """The hip hold a worn layer rides (a blade's sheath or a Pistolet's holster), or None."""
    if layer.startswith(('sheath_pistolet', 'scabbard_pistolet')):
        return 'holster_r' if layer.endswith('_l') else 'holster'
    if layer.startswith(('sheath_sword', 'scabbard_sword', 'sheath_dagger_', 'scabbard_dagger_')):
        return 'hip_r' if layer.endswith('_l') else 'hip'
    return None


def laid(layer, anim, obs, W):
    """`layer`'s objects, as posed for a frame of `anim` (joints `W`), laid where they lie past their joint: on the
    floor in a fall (`grounded`), plumb in the body's moves (`hung`). Gives the turn laid after the joint, or None."""
    return grounded(layer, anim, obs, W) if anim in FELL else hung(layer, anim, obs, W) if anim in HUNG else None


def hung(layer, anim, obs, W):
    """`layer`'s objects turned about their hip hold's grip, as the body's move leans the hips, back toward the way
    they run with the hips upright and facing where they face (`HANG_SHARE` of the turn). A hip's alone. Gives the
    turn, or None."""
    hold = hip_hold(layer)
    if hold is None or anim not in HUNG or not obs:
        return None
    joint, at, way = HOLDS[hold][:3]
    P = W[joint].to_3x3()
    ahead = P @ Vector((0.0, -1.0, 0.0))
    ahead.z = 0.0
    if ahead.length < 1e-6:
        return None
    up = Vector((0.0, 0.0, 1.0))
    y = -ahead.normalized()   # body space's +Y is behind
    upright = Matrix((y.cross(up), y, up)).transposed()   # the hips' turn with no lean: their heading alone
    now = (obs[0].matrix_world.to_3x3() @ Vector(way)).normalized()
    want = (upright @ (P.inverted() @ now)).normalized()
    turn = Quaternion().slerp(now.rotation_difference(want), HANG_SHARE).to_matrix().to_4x4()
    grip = obs[0].matrix_world @ (Vector(at) - rest(joint))
    m = Matrix.Translation(grip) @ turn @ Matrix.Translation(-grip)
    for ob in obs:
        ob.matrix_world = m @ ob.matrix_world
    return m


def grounded(layer, anim, obs, W):
    """`layer`'s objects, as posed for a frame of `anim` (joints `W`), laid on the floor where they would run under it:
    turned about the grip of their hip hold onto the thigh of that side, hip to knee, then raised until none lies
    under the floor. The death's and the fall's alone, and only a hip's. Gives the turn, or None."""
    hold = hip_hold(layer)
    if hold is None or anim not in FELL or not obs:
        return None
    joint, at, way = HOLDS[hold][:3]
    grip = obs[0].matrix_world @ (Vector(at) - rest(joint))
    pts = [ob.matrix_world @ v.co for ob in obs for v in ob.data.vertices]
    if min(p.z for p in pts) >= FLOOR:
        return None
    side = 'L' if at[0] > 0 else 'R'   # body +X is its left
    thigh = (W[f'shin_{side}'].translation - W[f'thigh_{side}'].translation).normalized()
    now = (obs[0].matrix_world.to_3x3() @ Vector(way)).normalized()
    about = lambda r: Matrix.Translation(grip) @ r @ Matrix.Translation(-grip)   # noqa: E731
    m = about(now.rotation_difference(thigh).to_matrix().to_4x4())
    low = min((m @ p for p in pts), key=lambda p: p.z)
    axis = (low - grip).cross(Vector((0.0, 0.0, 1.0)))
    if low.z < FLOOR and axis.length > 1e-6:
        axis.normalize()
        for deg in range(2, 92, 2):   # the least turn more, its lowest end raised to the floor's level
            lift = about(Matrix.Rotation(math.radians(deg), 4, axis)) @ m
            if min((lift @ p).z for p in pts) >= FLOOR:
                break
        m = lift
    for ob in obs:
        ob.matrix_world = m @ ob.matrix_world
    return m


def _tris(me):
    me.calc_loop_triangles()
    return [tuple(t.vertices) for t in me.loop_triangles]


class Envelope:
    """The body and every piece of every armour set worn at once (layers.py `every_set`), the arms aside, as each frame
    poses them: no surface of a worn weapon may cross one of theirs, in any frame it is drawn in. `pose(anim, key)`
    gives a frame's pose."""

    def __init__(self, fighter, pose):
        from mathutils.bvhtree import BVHTree
        self.tree, self.pose, self.cache = BVHTree.FromPolygons, pose, {}
        self.skins = []
        for sk in fighter.skins:
            arm = [k for k, j in enumerate(sk.joints) if j.split('_')[0] in ARMS]
            on = sk.w[:, arm].sum(axis=1) >= 0.5 if arm else np.zeros(len(sk.rest), bool)
            self.skins.append((sk, [t for t in _tris(sk.me) if not on[list(t)].any()]))
        self.parts = [(coords(ob.data), _tris(ob.data), j) for ob, j in fighter.parts
                      if ob.name.startswith('armour_') and j.split('_')[0] not in ARMS]

    def frame(self, anim, key):
        """A frame's joints and a tree of each surface as it is posed there, made once."""
        if (anim, key) not in self.cache:
            W = {j: np.array(m) for j, m in self.pose(anim, key).world().items()}
            trees = []
            for sk, tris in self.skins:
                sk.pose(W)
                trees.append(self.tree(coords(sk.me).tolist(), tris))
            for v, tris, j in self.parts:
                trees.append(self.tree((v @ W[j][:3, :3].T + W[j][:3, 3]).tolist(), tris))
            self.cache[(anim, key)] = (W, trees)
        return self.cache[(anim, key)]

    def forget(self, frame):
        """Let a frame's surfaces go: every armour set's are many, and a frame is made again if asked."""
        self.cache.pop(frame, None)

    def frames(self, anims):
        import layers
        return [(a, k) for a in anims for k in range(layers.ANIMS[a])]


LEANS = (0.0, 4.0, 8.0, 12.0, 16.0)   # degrees a worn weapon may lean out at its foot, about its top
LEAN_COST = 0.002   # metres of push a degree of lean must save to be taken


def _points(obs, at):
    """Objects' points about `at` and their triangles, numbered through them all."""
    v, tris, n = [], [], 0
    for ob in obs:
        tris += [tuple(i + n for i in t) for t in _tris(ob.data)]
        v.append(coords(ob.data) - at)
        n += len(ob.data.vertices)
    return np.concatenate(v), tris


class _Job:
    """A piece to be laid clear: its joint, its way out, its rest place about the joint, its parts (points about the
    joint, triangles, the frames each must lie clear in), and the top it leans about."""

    def __init__(self, hold, groups, env):
        self.joint = HOLDS[hold][0]
        self.out = np.array(HOLDS[hold][4], float)
        self.out /= np.linalg.norm(self.out)
        self.at = np.array(rest(self.joint))
        self.parts = [(*_points(obs, self.at), set(env.frames(anims))) for obs, anims in groups]
        self.frames = set().union(*(fs for _, _, fs in self.parts))
        every = np.concatenate([v for v, _, _ in self.parts])
        self.top, self.foot = every[np.argmax(every[:, 2])], every[np.argmin(every[:, 2])]
        axis = np.cross((0.0, 0.0, -1.0), self.out)
        self.axis = axis / np.linalg.norm(axis)

    def turn(self, deg):
        R = np.array(Matrix.Rotation(np.radians(deg), 3, Vector(self.axis)))
        reach = self.foot - self.top
        return R if (R @ reach - reach) @ self.out >= 0 else R.T   # the way that swings the foot out

    def moved(self, v, deg, d):
        return (v - self.top) @ self.turn(deg).T + self.top + self.out * d

    def crosses(self, env, frame, deg, d, others):
        """Whether, leant `deg` and pushed out `d`, a surface of it crosses another in `frame`: the body's, an armour's
        or one of `others` (the pieces laid before it, as that frame poses them)."""
        W, trees = env.frame(*frame)
        M = W[self.joint]
        for v, tris, frames in self.parts:
            if frame not in frames:
                continue
            u = self.moved(v, deg, d)
            mine = env.tree((u @ M[:3, :3].T + M[:3, 3]).tolist(), tris)
            if any(mine.overlap(t) for t in trees + others):
                return True
        return False

    def push(self, env, frame, deg, others):
        """How far out it must go, leant `deg`, so nothing crosses in `frame`: found to `STEP`, and `CLEAR` past."""
        if not self.crosses(env, frame, deg, 0.0, others):
            return 0.0
        lo, hi = 0.0, 0.02
        while self.crosses(env, frame, deg, hi, others) and hi < 0.5:
            lo, hi = hi, hi * 2
        while hi - lo > STEP:
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if self.crosses(env, frame, deg, mid, others) else (lo, mid)
        return hi + CLEAR


def clear(pieces, env, worn=()):
    """Lay pieces clear: lean each out at its foot about its top (`LEANS`) and push it out along its hold's way out,
    until in none of its frames does a surface of it cross the body's, an armour's or a piece of `worn` (laid before
    it: (joint, points, triangles, frames)); the lean that needs least push, a degree worth `LEAN_COST`. A lean's push
    is the most any of its frames needs. The frames are taken one at a time, each frame's surfaces made once for every
    piece and let go after, so a piece drawn in many frames never holds them all at once. `pieces`: [(hold, [(objects,
    animations)])], what must lie clear in which. Gives each piece's (a function laying an object of it as it moves,
    the piece as `worn` takes it, the push, the lean)."""
    jobs = [_Job(hold, groups, env) for hold, groups in pieces]
    need = [dict.fromkeys(LEANS, 0.0) for _ in jobs]
    for frame in sorted(set().union(*(job.frames for job in jobs))):
        # the pieces laid before, posed once a frame for every push tried against them
        W = env.frame(*frame)[0] if worn else None
        others = [env.tree((p @ W[j][:3, :3].T + W[j][:3, 3]).tolist(), t) for j, p, t, fs in worn if frame in fs]
        for job, most in zip(jobs, need):
            if frame in job.frames:
                for deg in LEANS:
                    most[deg] = max(most[deg], job.push(env, frame, deg, others))
        env.forget(frame)
    out = []
    for job, most in zip(jobs, need):
        d, deg = min(((most[g], g) for g in LEANS), key=lambda pair: pair[0] + LEAN_COST * pair[1])

        def place(ob, job=job, deg=deg, d=d):
            p = job.moved(coords(ob.data) - job.at, deg, d) + job.at
            ob.data.vertices.foreach_set('co', p.astype(np.float32).ravel())
            ob.data.update()
        counts = np.cumsum([0] + [len(v) for v, _, _ in job.parts])
        piece = (job.joint, np.concatenate([job.moved(v, deg, d) for v, _, _ in job.parts]),
                 [tuple(i + counts[k] for i in tri) for k, (_, tris, _) in enumerate(job.parts) for tri in tris],
                 job.frames)
        out.append((place, piece, d, deg))
    return out


def hang_all(holder, kinds, env):
    """Each worn weapon's pieces laid clear of `env` (an `Envelope`) in every frame they are laid in, a piece laid over
    those of its kind (the quiver over the bows) clear of them too, and hung on their joints in `holder`'s parts:
    {layer: [object]}."""
    laid = {}
    alone = [pc for pieces in kinds for pc in pieces if not pc[3]]
    laid.update(zip(map(id, alone), clear([(pc[0], pc[1]) for pc in alone], env)))
    for pieces in kinds:   # those laid over the rest of their kind, once the rest lie where they will
        over = [pc for pc in pieces if pc[3]]
        worn = [laid[id(pc)][1] for pc in pieces if not pc[3]]
        laid.update(zip(map(id, over), clear([(pc[0], pc[1]) for pc in over], env, worn)))
    layers = {}
    for pieces in kinds:
        for pc in pieces:
            hold, _, by_layer, _ = pc
            place, _, need, deg = laid[id(pc)]
            print(f'worn {"/".join(by_layer)} {hold}: leant {deg:.0f} degrees, pushed out {need * 100:.1f} cm',
                  flush=True)
            for name, obs in by_layer.items():
                for ob in obs:
                    place(ob)
                    gear.hang(holder.parts, ob, HOLDS[hold][0])
                layers.setdefault(name, []).extend(obs)
    return layers


def materials_for(M):
    """The worn weapons' materials: a set's leather and trim (armour.py `palette`, iron's: its metal grey, dyed by the
    weapon's metal) beside the body's own wood."""
    return armour.palette('Iron', M)

