"""The forge's gear: the weapons and the rigid pieces of armour, each built in one place for whatever figure wears it.

A weapon is built in its own frame, in metres: its grip (the bow's riser) at the origin, its business end up +Z. Any
view that holds it places that frame in the hand. A rigid piece of armour is built where it sits on the body at rest
and hung on the joint that carries it (`hang`), so it moves with that joint. The layers that follow the body's surface
(a cuirass, mail, a bodice) are the body's own shells and stay with the outfits (model.py)."""
import json
import os

import numpy as np
from mathutils import Matrix, Vector

import axes
import blades
import fpmodel
import materials
import metals
from body import rest_attr
from rig import rest
from shapes import ellipsoid, loft, plate, sheet, tube_path


def hang(parts, ob, joint):
    ob.data.transform(Matrix.Translation(-rest(joint)))
    rest_attr(ob.data)
    parts.append((ob, joint))


# a hung piece that bends with the body under it, by name: where each vertex lies at rest, the joints it is weighted
# over, its weights over them and their heads (armour.py `_bend`)
BENT = {}


def bent(name, W, which=None):
    """Where the vertices of `name` (`BENT`; those indexed by `which`) lie in the world under the joints `W`, each
    blended over its joints as the skin under it is."""
    at, joints, w, heads = BENT[name]
    if which is not None:
        at, w = at[which], w[which]
    out = np.zeros_like(at)
    for k, j in enumerate(joints):
        M = np.array(W[j])
        out += w[:, k:k + 1] * ((at - heads[k]) @ M[:3, :3].T + M[:3, 3])
    return out


def bend(ob, W, joint):
    """Lay `ob`, hung on `joint`, as the skin under it is posed (`bent`), in its own joint's frame: the piece is
    still placed by its joint, and only its shape follows the body."""
    M = np.array(W[joint])
    ob.data.vertices.foreach_set('co', ((bent(ob.name, W) - M[:3, 3]) @ M[:3, :3]).ravel())
    ob.data.update()


def mirror(fn):
    for s, x in (('L', 1.0), ('R', -1.0)):
        fn(s, x)


# armour

def pointed_helm(parts, metal, guards=None):
    """The classic fighter's helm: its dome drawn in toward the crown, with a nasal and cheek guards (of `guards`, if
    given, else of the dome's metal)."""
    guards = guards or metal
    hang(parts, ellipsoid('helm', (0, -0.04, 1.645), (0.108, 0.13, 0.188), metal, z_cut=1.66,
                           subsurf=2, tilt_x=-14, squash=lambda v: Vector((v.x * (1 - 0.32 * max(v.z, 0) ** 2),
                                                                          v.y * (1 - 0.32 * max(v.z, 0) ** 2), v.z))),
          'head')
    hang(parts, plate('nasal', [(-0.013, 1.71), (0.013, 1.71), (0.009, 1.625), (-0.009, 1.625)], 0.01,
                       guards, 'XZ', (0, -0.165, 0)), 'head')
    mirror(lambda s, x: hang(parts, plate(f'cheek_{s}', [(-0.108, 1.668), (-0.04, 1.668), (-0.045, 1.608),
                                                          (-0.078, 1.59), (-0.1, 1.615)], 0.008,
                                            guards, 'YZ', (0.094 * x, 0, 0)), 'head'))


LOIN = ((1.135, 0.085, 0.128), (0.99, 0.075, 0.122), (0.84, 0.07, 0.126), (0.69, 0.064, 0.134))   # (height, half, depth)
# the woman archer's: from under her top, the front panel to below the knee, the back one broad over her hips
LOIN_F = {'front': ((0.97, 0.08, 0.118), (0.84, 0.074, 0.12), (0.69, 0.068, 0.126), (0.55, 0.062, 0.132)),
          'back': ((0.97, 0.12, 0.13), (0.91, 0.13, 0.15), (0.85, 0.12, 0.15), (0.79, 0.09, 0.14))}


def loincloth(parts, mat, rows_at=LOIN):
    """Front and back panels wrapping the hips: each row an arc, its edges drawn in toward the body. `rows_at` is one
    list of rows for both panels, or one a panel."""
    for side, y in (('front', -1.0), ('back', 1.0)):
        rows = []
        for z, half, depth in (rows_at[side] if isinstance(rows_at, dict) else rows_at):
            d = depth if y < 0 else depth + 0.04
            rows.append([(u * half, (d + 0.004 - 0.04 * u * u) * y, z) for u in (-1.0, -0.5, 0.0, 0.5, 1.0)])
        hang(parts, sheet(f'loin_{side}', rows, mat, thickness=0.006), 'pelvis')


def boots(parts, mat):
    def limb(s, x):
        # the boot: its turned-down cuff, a shaft to the ankle, the foot
        hang(parts, loft(f'cuff_{s}', (0.106 * x, 0.0, 0.47), (0.107 * x, 0.002, 0.40), [
            (0.0, 0.098, 0.1), (0.4, 0.104, 0.106), (1.0, 0.088, 0.09)], mat, subsurf=1), f'shin_{s}')
        hang(parts, loft(f'boot_{s}', (0.107 * x, 0.002, 0.42), (0.11 * x, 0.012, 0.06), [
            (0.0, 0.08, 0.084), (0.3, 0.076, 0.082), (0.7, 0.064, 0.068), (1.0, 0.06, 0.064)], mat), f'shin_{s}')
        hang(parts, loft(f'foot_{s}', (0.11 * x, 0.06, 0.055), (0.115 * x, -0.20, 0.036), [
            (0.0, 0.056, 0.054), (0.3, 0.064, 0.058), (0.8, 0.058, 0.04), (1.0, 0.038, 0.026)], mat), f'foot_{s}')
    mirror(limb)


def pauldrons(M, parts):
    mirror(lambda s, x: hang(parts, ellipsoid(f'pauldron_{s}', (0.19 * x, 0.0, 1.46), (0.14, 0.135, 0.105),
                                                M['silver'], z_cut=1.45, subsurf=2, tilt_y=28 * x, tilt_x=8),
                               f'clav_{s}'))


# weapons

def build_weapon(M, kind):
    """The weapon a spec names ('axe', 'sword'), in its own frame: grip at the origin, the business end up +Z."""
    return WEAPONS[kind](M)


# the long blade is blades.py's, from the shape the first-person forge fitted it to (fpmodel.py `longblade`), so one
# blade is seen from either view
BLADE_SHAPE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'WEAPON04-shape.json')


def blade_shape():
    S = fpmodel.defaults('longblade')
    if os.path.exists(BLADE_SHAPE):
        S.update(json.load(open(BLADE_SHAPE)))
    return S


def sword_tip(metal='Steel'):
    """Grip to the point of `metal`'s sword: its guard's top, then its blade's length."""
    return metals.TOPS[metal] + blades.shape(blade_shape(), metal)['blade_len']


SWORD_TIP = sword_tip()   # the steel sword's reach


# The owner's own swords (models/orcish_swords.blend, cut from the owner's files by ownermodels.py): a metal's long
# sword and its short sword, the one a Shortsword or a Wakazashi draws. Each is in build_sword's frame but its guard's
# underside on the origin, its faces in a slot a role (`owner.<role>`) the metal's own materials dress
OWNER_SWORDS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'orcish_swords.blend')
OWNER_SWORD = {'Orcish': {False: 'sword_orcish_long', True: 'sword_orcish_short'}}
OWNER_ROLES = ('blade', 'fit', 'grip', 'wrap')
OWNER_FIST = 0.012   # the guard's underside over the fist's middle, where the forged hilts' collars and ruffs stand
# each role's material by its name among the metal's hilt's (metals.py `hilt_materials`), or a colour (sRGB) for a
# cord of its own: the orcish blade and its fittings in the blade's olive, as the forged hilt's are, its grip and
# knuckle bow in that hilt's thongs, and the owner's red bands and guard ring an oxblood cord
OWNER_LOOK = {'Orcish': {'blade': 'blade', 'fit': 'blade', 'grip': 'haft.Orcish.thong', 'wrap': (100, 34, 26)}}
_OWNED = {}


def owner_sword(metal, short=False):
    """The name of `metal`'s own model of the owner's (`OWNER_SWORD`), a long sword or a short one, or None."""
    return OWNER_SWORD.get(metal, {}).get(short)


def owner_materials(metal):
    """Each role's material on `metal`'s sword of the owner's (`OWNER_LOOK`), made in Blender's current scene."""
    import materials
    worn = metals.hilt_materials(metal)
    return {role: worn[m] if isinstance(m, str) else
            materials.plain(f'haft.{metal}.cord', metals._linear(m), rough=0.75, spec=0.25)
            for role, m in OWNER_LOOK[metal].items()}


def owner_arrays(metal, short=False):
    """`metal`'s sword of the owner's as arrays, its guard's underside on the origin: (vertices, triangles, each
    triangle's role in OWNER_ROLES). Each sharp edge is split, so the part shades as the model does when drawn smooth
    (the first person's parts are). Read once a process."""
    key = (metal, short)
    if key not in _OWNED:
        import bpy
        import bmesh
        with bpy.data.libraries.load(OWNER_SWORDS, link=False) as (src, dst):
            dst.meshes = [owner_sword(metal, short)]
        me = dst.meshes[0]
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.split_edges(bm, edges=[e for e in bm.edges if not e.smooth])
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        roles = [OWNER_ROLES.index(m.name.split('.')[1]) for m in me.materials]
        v = np.array([tuple(p.co) for p in bm.verts])
        t = np.array([[p.index for p in f.verts] for f in bm.faces], dtype=np.int64)
        r = np.array([roles[f.material_index] for f in bm.faces], dtype=np.int64)
        bm.free()
        bpy.data.meshes.remove(me)
        _OWNED[key] = (v, t, r)
    return _OWNED[key]


def build_owner_sword(metal, short=False):
    """`metal`'s sword of the owner's (`owner_sword`) as one object in build_sword's frame: the fist's grip on the
    origin, the guard's underside OWNER_FIST over it, each role in the metal's own material (`owner_materials`)."""
    import bpy
    with bpy.data.libraries.load(OWNER_SWORDS, link=False) as (src, dst):
        dst.objects = [owner_sword(metal, short)]
    ob = dst.objects[0]
    me = ob.data
    me.transform(Matrix.Translation((0.0, 0.0, OWNER_FIST)))
    look = owner_materials(metal)
    for i, m in enumerate(me.materials):
        me.materials[i] = look[m.name.split('.')[1]]
    rest_attr(me)
    bpy.context.scene.collection.objects.link(ob)
    return [ob]


def build_sword(M, metal='Steel', short=False):
    """The long sword of `metal` in its own frame: the right fist's grip at the origin under the guard, the blade up
    +Z and flat in the XZ plane, the hilt long enough below for the left fist. Its hilt is the metal's own
    (metals.py); steel's blade wears the palette's `steel`, every other metal's its own metal and, for daedric, its
    glow. A metal the owner modelled draws the owner's (`build_owner_sword`), `short` its short sword where it has
    one."""
    import bpy
    if owner_sword(metal):
        return build_owner_sword(metal, short and owner_sword(metal, True) is not None)
    P = metals.palette(metal)
    obs = metals.hilt(metal, P)
    top = metals.TOPS[metal]
    # steel at the first-person forge's own rows, so its blade is that forge's to the vertex
    v, faces, mats = blades.long_blade(blade_shape(), metal, rows=fpmodel.ROWS if metal == 'Steel' else blades.ROWS,
                                       fins=True)
    me = bpy.data.meshes.new('sword_blade')
    me.from_pydata((v + (0.0, 0.0, top)).tolist(), [], faces.tolist())
    me.materials.append(M['steel'] if metal == 'Steel' else P.get('blade', P['metal']))
    if 'glow' in P:
        me.materials.append(P.get('blade_glow', P['glow']))
    if 'blade_groove' in blades.materials(metal):   # its fuller in a darker metal, as the first-person blade's is
        L = metals.LOOK[metal]
        dark = metals._linear(L.get('groove', tuple(0.55 * c for c in L.get('blade', L['metal']))))
        me.materials.append(materials.plain(f'steel.{metal}.groove', dark, metal=L['metallic'], rough=L['rough'],
                                            spec=0.6))
    if 'blade_inlay' in blades.materials(metal, True):   # its motifs a pale polished inlay
        L = metals.LOOK[metal]
        me.materials.append(materials.plain(f'steel.{metal}.inlay', metals._linear(L.get('inlay', (200, 200, 200))),
                                            metal=0.3, rough=0.3, spec=0.6))
    me.polygons.foreach_set('material_index', mats.tolist())
    me.update()
    me.shade_smooth()
    rest_attr(me)
    ob = bpy.data.objects.new('sword_blade', me)
    bpy.context.scene.collection.objects.link(ob)
    obs.append(ob)
    return obs


# the battleaxe is axes.py's, from the shape the first-person forge fitted it to (fpmodel.py `battleaxe`), so one axe
# of each metal is seen from either view
AXE_SHAPE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'WEAPON08-shape.json')
AXE_BUTT = 0.12   # the haft past the hand, to its butt
# metres further up the haft than the first-person hand the third person's fist holds a metal's battleaxe: so its
# head's middle lies where Daggerfall's war axe's does (gear.py `WAR_AXE`, poses.py `AXE_REACH`), its far end no farther
AXE_HOLD = 0.10
AXE_FLATS_LIFT = {'Ebony': 0.45, 'Daedric': 0.3}   # an axe's dark flats, this share of the way to its blade
AXE_THONG = (104, 74, 46)   # a wound haft's leather thongs, paler than its wood
# each metal's grip at the hand: its section's wrap (metals.grip) and its butt cap's profile (radius, height over
# the butt's foot), in the makers' language of the metal's sword
AXE_GRIP = {'Iron': 'cross', 'Steel': 'strip', 'Silver': 'cross', 'Elven': 'cord', 'Dwarven': 'bands',
            'Mithril': 'cord', 'Adamantium': 'bands', 'Ebony': 'cross', 'Orcish': 'strip', 'Daedric': 'cross'}
AXE_BUTTS = {
    'Iron': [(1.0, 0.0), (1.15, 0.008), (1.15, 0.022), (1.0, 0.03)],
    'Steel': [(0.9, 0.0), (1.2, 0.006), (1.2, 0.02), (1.05, 0.03), (1.0, 0.036)],
    'Silver': [(0.2, -0.018), (0.9, -0.012), (1.25, 0.0), (1.1, 0.012), (1.25, 0.022), (1.0, 0.034)],
    'Elven': [(0.05, -0.05), (0.5, -0.03), (1.05, -0.006), (1.1, 0.012), (1.0, 0.03)],
    'Dwarven': [(1.45, 0.0), (1.45, 0.016), (1.2, 0.02), (1.2, 0.036), (1.0, 0.04)],
    'Mithril': [(0.3, -0.022), (1.0, -0.012), (1.1, 0.0), (0.95, 0.024)],
    'Adamantium': [(1.5, 0.0), (1.55, 0.012), (1.55, 0.03), (1.2, 0.04), (1.0, 0.046)],
    'Ebony': [(0.05, -0.06), (0.6, -0.03), (1.15, -0.004), (1.0, 0.02)],
    'Orcish': [(0.4, -0.03), (1.3, -0.012), (1.35, 0.01), (1.0, 0.028)],
    'Daedric': [(0.05, -0.07), (0.7, -0.04), (1.3, -0.008), (1.15, 0.01), (1.0, 0.03)],
}


def axe_shape():
    S = fpmodel.defaults('battleaxe')
    if os.path.exists(AXE_SHAPE):
        S.update({k: v for k, v in json.load(open(AXE_SHAPE)).items() if k != 'records'})
    return S


def build_axe(M, metal=None):
    """The axe in its own frame: grip at the origin, haft up +Z, its bits in the XZ plane. With no `metal`, the war
    axe the class sprites carry; with one, that metal's battleaxe (axes.py `LOOK`), the first-person forge's own,
    in the metal's colours (metals.py `LOOK`), its grip wrapped and its butt capped in the metal's own language."""
    if metal is not None:
        return _battleaxe(M, metal)
    lo, hi = WAR_AXE['root']
    obs = [tube_path('axe_haft', [(0, 0, -0.12), (0, 0, 0.4), (0, 0, WAR_AXE['top'])], 0.019, M['haft'])]
    obs.append(loft('axe_socket', (0, 0, lo - 0.03), (0, 0, hi + 0.03), [(0, 0.03, 0.03), (1, 0.03, 0.03)],
                    M['blade'], subsurf=0))
    obs.append(_war_axe_bits(M))
    obs.append(loft('axe_spike', (0, 0, hi + 0.02), (0, 0, WAR_AXE['tip']), [(0, 0.022, 0.016), (1, 0.002, 0.002)],
                    M['blade'], n=8, subsurf=0))
    return obs


# Daggerfall's war axe (TEXTURE.488, 487, 399), measured on its side views: two broad bits, each a crescent from the
# socket out to a curved edge, from 0.42 to 0.82 m up the haft at its horns and reaching 0.195 m out. Each bit is
# thicker at its cheek than at its edge and swells in its middle, so its faces turn through the light: a flat plate
# takes one light all over and, square to the key light, goes white
WAR_AXE = {'root': (0.47, 0.77), 'horns': (0.42, 0.82), 'reach': 0.195, 'horn_out': 0.135, 'cheek': 0.024,
           'thick': (0.013, 0.003), 'swell': 0.010, 'crescent': 0.035, 'edge': 0.84, 'top': 0.80, 'tip': 0.84}


def _war_axe_bits(M, nu=17, ns=8):
    """The war axe's two bits (`WAR_AXE`) as one mesh: each a grid from its cheek on the socket (s 0) out to its edge
    (s 1), along the haft from its foot to its top (u), its faces apart by the bit's thickness there. The outer band
    of each face is the edge's bright metal."""
    import bpy
    A = WAR_AXE
    (r0, r1), (h0, h1) = A['root'], A['horns']
    half, mid = (h1 - h0) / 2, (h0 + h1) / 2
    sweep = np.radians(70.0)   # the edge an arc of an ellipse from horn to horn
    b = half / np.sin(sweep)
    a = (A['reach'] - A['horn_out']) / (1 - np.cos(sweep))
    cx = A['reach'] - a
    u = np.linspace(0.0, 1.0, nu)
    s = np.linspace(0.0, 1.0, ns)
    th = (u * 2 - 1) * sweep
    edge = np.stack([cx + a * np.cos(th), mid + b * np.sin(th)], 1)
    root = np.stack([np.full(nu, A['cheek']), r0 + (r1 - r0) * u], 1)
    P = root[:, None, :] + s[None, :, None] * (edge - root)[:, None, :]          # (nu, ns, 2): out, up
    # its sides drawn in toward its middle, so its horns stand out from the socket as a crescent's
    P[..., 1] += A['crescent'] * np.sin(np.pi * s)[None, :] * ((1 - 2 * u) * np.abs(1 - 2 * u))[:, None]
    t0, t1 = A['thick']
    H = t0 + (t1 - t0) * s[None, :] + A['swell'] * np.sin(np.pi * u)[:, None] * np.sin(np.pi * s)[None, :]
    verts, faces, mats, smooth = [], [], [], []
    for side in (1.0, -1.0):
        for face in (-1.0, 1.0):   # a face toward -Y and one toward +Y
            base = len(verts)
            for i in range(nu):
                for j in range(ns):
                    verts.append((side * P[i, j, 0], face * H[i, j], P[i, j, 1]))
            for i in range(nu - 1):
                for j in range(ns - 1):
                    q = [base + i * ns + j, base + (i + 1) * ns + j, base + (i + 1) * ns + j + 1, base + i * ns + j + 1]
                    faces.append(q if side * face > 0 else q[::-1])
                    mats.append(1 if s[j] >= A['edge'] else 0)
                    smooth.append(True)
        # the rim round the bit: its edge, its two sides and its cheek, flat between its faces
        ring = ([(i, ns - 1) for i in range(nu)] + [(nu - 1, j) for j in range(ns - 2, -1, -1)]
                + [(i, 0) for i in range(nu - 2, -1, -1)] + [(0, j) for j in range(1, ns)])
        for (i, j), (k, m) in zip(ring, ring[1:] + ring[:1]):
            base = len(verts)
            for (x, y), f in (((i, j), -1.0), ((k, m), -1.0), ((k, m), 1.0), ((i, j), 1.0)):
                verts.append((side * P[x, y, 0], f * H[x, y], P[x, y, 1]))
            q = [base, base + 1, base + 2, base + 3]
            faces.append(q if side < 0 else q[::-1])
            mats.append(1 if j == ns - 1 and m == ns - 1 else 0)
            smooth.append(False)
    me = bpy.data.meshes.new('axe_bits')
    me.from_pydata(verts, [], faces)
    me.materials.append(M['blade'])
    me.materials.append(M['edge'])
    me.polygons.foreach_set('material_index', mats)
    me.polygons.foreach_set('use_smooth', smooth)
    me.update()
    rest_attr(me)
    ob = bpy.data.objects.new('axe_bits', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _battleaxe(M, metal):
    import bpy
    P = metals.palette(metal)
    S = axes.shape(axe_shape(), metal)
    v, faces, mats = axes.battleaxe(S)
    v = v - (0.0, 0.0, AXE_HOLD)
    me = bpy.data.meshes.new('axe_head')
    me.from_pydata(v.tolist(), [], faces.tolist())
    steel = metal == 'Steel'
    L = metals.LOOK[metal]
    head = M['blade'] if steel else P.get('blade', P['metal'])   # its sword's blade: elven's gold, daedric's grey
    dark = L.get('groove', tuple(0.55 * c for c in L.get('blade', L['metal'])))
    lift = AXE_FLATS_LIFT.get(metal, 0.0)   # broad flats in the sword's groove would read black on a sprite
    dark = tuple(d + lift * (b - d) for d, b in zip(dark, L.get('blade', L['metal'])))
    own = {'axehead': head, 'haft': M['haft'] if steel else P['grip'],
           'glow': P.get('blade_glow', P.get('glow', P['accent'])),
           'haft_wrap': materials.plain(f'haft.{metal}.thong', metals._linear(AXE_THONG), rough=0.75, spec=0.25),
           'axe_groove': materials.plain(f'steel.{metal}.axe_groove', metals._linear(dark), metal=L['metallic'],
                                         rough=L['rough'], spec=0.6),
           'axe_sleeve': head, 'axe_grip': P['grip'],
           'axe_accent': materials.plain(f'edge.{metal}.axe', metals._linear(axes.ACCENT_COLOUR.get(
               metal, L.get('accent', L['fit']))), metal=1.0, rough=0.25)}
    for name in axes.materials(metal):
        me.materials.append(own[name])
    me.polygons.foreach_set('material_index', mats.tolist())
    me.update()
    me.shade_smooth()
    rest_attr(me)
    ob = bpy.data.objects.new('axe_head', me)
    bpy.context.scene.collection.objects.link(ob)
    r = S['haft_r']
    haft = M['haft'] if steel else P['grip']
    top = 0.0 if S.get('wrap') or S.get('dressed') else 0.11   # a haft dressed from the hand up: its grip below it
    obs = [ob, metals.lathe('axe_butt_haft', [(r, -AXE_BUTT + 0.02), (r, 0.002)], haft),
           metals.grip('axe_grip', -0.09, top, r * 1.08, P['grip'], wrap=AXE_GRIP[metal], depth=0.0016)]
    obs.append(metals.lathe('axe_butt', [(k * r, -AXE_BUTT + h) for k, h in AXE_BUTTS[metal]], P['fit'],
                            sides=8 if metal in ('Dwarven', 'Adamantium', 'Ebony') else 24))
    return obs


BOW_HALF = 0.66   # the length of each limb, grip to tip
BOW_ARC = 0.336   # radians each braced limb's tip turns from straight: the tips 0.11 m behind the grip


def build_bow(M):
    """The long bow in its own frame: the left-hand grip at the origin, limbs along +-Z, its back toward -Y. It is
    made straight; shape.py bends it, braced and as far as it is drawn, and lays on its fitted size."""
    pts = [(0, 0, i * BOW_HALF / 12) for i in range(-12, 13)]
    return [tube_path('bow', pts, lambda t: 0.011 + 0.007 * (1 - abs(2 * t - 1)), M['wood'], n=6)]


# each bow type: its limb a share of the long bow's, its braced turn a share of the long bow's fitted turn, and the
# radians its last share turns back toward the target (the first-person forge's types, fpbow.py BOW_TYPES): the long
# bow an even arc, the short bow shorter, bent harder and recurved
BOW_KINDS = {'long': (1.0, 1.0, 0.0), 'short': (0.75, 1.64, 0.9)}
BOW_GRIP = 0.045   # metres of the stave either side of the grip that are the wrapped riser, not a limb
# a bow's metal (`bowmetal`) onto the steel band from its foot to its top, share for share as the armour's metal is
# rendered (armour.py METAL_GRADE's): a limb is too thin to lose its shaded half to the blacks under the band, as plate
# does, so its shade stays the metal's own colour
BOW_METAL_GRADE = {'lum': [[35.6, 63.4, 103.0, 150.8, 189.0, 211.0, 255.0], [44.0, 52.0, 64.0, 100.0, 130.0, 160.0, 220.0]]}


def build_metal_bow(M, metal, kind):
    """`metal`'s own bow of type `kind` (bows.py, the first-person forge's designs) in the long bow's frame, made
    straight as `build_bow` is: a wrapped riser and two limbs and their work, seen in the bow's plane. Its metal is
    grey, which the game lays the bow's metal ramp on; its wood is its metal's own (bows.py `WOODS`), else the yew."""
    import bpy
    import armour
    import bows
    share = BOW_KINDS[kind][0]
    half = BOW_HALF * share
    A = armour.palette(metal, M)
    plate, rough = armour.FINISH[metal][:2]
    grey = materials.plain(f'bowmetal.{metal}', (plate, plate, plate), metal=0.15, rough=rough, spec=0.6)
    wood = (materials.plain(f'wood.{metal}', metals._linear(bows.WOODS[metal]), rough=0.5) if metal in bows.WOODS
            else M['wood'])
    stuffs = {'wood': wood, 'metal': grey, 'vein': A['glow'], 'cord': A['strap']}
    s = np.linspace(BOW_GRIP, half, 40)
    r = 0.018 - 0.007 * s / half   # the stave's girth, thickest at the grip (build_bow's)
    pieces = []
    for sign in (1.0, -1.0):
        c = np.stack([np.zeros_like(s), np.zeros_like(s), sign * s], axis=1)
        back = np.tile([0.0, -1.0, 0.0], (len(s), 1))
        pieces += bows.limb(bows.look(metal), c, back, r, r, (1.0, 0.0, 0.0), seen='side', span=half - BOW_GRIP)
    grip = np.linspace(-BOW_GRIP - 0.004, BOW_GRIP + 0.004, 6)
    ring = np.full(len(grip), 0.0195)
    pieces.append((*bows.tube(np.stack([0 * grip, 0 * grip, grip], axis=1), [[1.0, 0.0, 0.0]] * len(grip),
                              [[0.0, -1.0, 0.0]] * len(grip), ring, ring, n=10), 'cord'))
    names = list(stuffs)
    vs, fs, ms, base = [], [], [], 0
    for v, q, stuff in pieces:
        vs.append(v)
        fs.append(np.asarray(q) + base)
        ms.append(np.full(len(q), names.index(stuff)))
        base += len(v)
    name = f'bow_{kind}'
    me = bpy.data.meshes.new(name)
    me.from_pydata(np.concatenate(vs).tolist(), [], np.concatenate(fs).tolist())
    for n in names:
        me.materials.append(stuffs[n])
    me.polygons.foreach_set('material_index', np.concatenate(ms).tolist())
    me.update()
    me.shade_smooth()
    rest_attr(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return [ob]


# the staff as Daggerfall's mage carries it (TEXTURE.486, 485): 2.05 m from the ferrule to the spike, the right fist
# 0.8 m under the spike as it walks. In the attack the right fist slides down to 0.75 m off the foot, the left 0.45 m
# above it. Its work is the first-person forge's (staffs.py), 1.6 times as big, so a head reads on a sprite
# The owner's crossbows (models/crossbows.blend, cut from the owner's Crossbows.blend by its six metals): each in the held
# frame - its origin at the supporting hand under the forestock (CROSSBOW_MODEL_HOLD of its length back from the prod's
# front), +X along the aim, +Y across the prod, +Z up - CROSSBOW_MODEL_LEN long, in its own materials and colours.
CROSSBOWS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models', 'crossbows.blend')
CROSSBOW_METALS = ('iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril')
CROSSBOW_MODEL_LEN = 0.60
CROSSBOW_MODEL_HOLD = 0.30
CROSSBOW_LEN = 0.70    # its length in a forged hand: from the cheek's fist to just past the bow arm's, as it is aimed
CROSSBOW_HOLD = 0.08   # the bow arm's fist under the forestock, this share of its length back from the prod's front
CROSSBOW_RISE = 0.05   # the stock lies on that fist, not through it, clear of the arm seen from the side


def build_crossbow(metal):
    """`metal`'s crossbow (CROSSBOW_METALS), appended from the owner's models: its parts, each a mesh in the held frame,
    in the owner's own materials. Its colours are its own: no dye lays a metal on it."""
    import bpy
    with bpy.data.libraries.load(CROSSBOWS, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n.startswith(f'xbow_{metal}.')]
    obs = [ob for ob in dst.objects if ob is not None]
    for ob in obs:
        bpy.context.scene.collection.objects.link(ob)
    return obs


def crossbow_frame(at, aim, up, hold=CROSSBOW_HOLD, rise=CROSSBOW_RISE):
    """The crossbow's matrix in a fist at `at` (world): aimed along `aim`, its up `up` as near as the aim allows, the
    fist `hold` of its length back from the prod's front, the stock `rise` over it. The model scaled to
    CROSSBOW_LEN."""
    aim = Vector(aim).normalized()
    up = Vector(up)
    up = (up - up.project(aim)).normalized()
    k = CROSSBOW_LEN / CROSSBOW_MODEL_LEN
    front = CROSSBOW_MODEL_HOLD * CROSSBOW_MODEL_LEN * k   # the model's origin to the prod's front, scaled
    origin = Vector(at) - aim * (front - hold * CROSSBOW_LEN) + up * rise
    R = Matrix((aim, up.cross(aim), up)).transposed().to_4x4()
    R.translation = origin
    return R @ Matrix.Scale(k, 4)


def crossbow_at(bow_m, elbow, wrist):
    """The crossbow held in the bow's frames: on the bow arm's fist (the bow's grip, `bow_m`'s origin), aimed along
    that forearm (`elbow` to `wrist`, world points) - down the shot drawn, toward the ground lowered - its up the
    world's as near as the aim allows."""
    M = Matrix(bow_m)
    aim = (Vector(wrist) - Vector(elbow)).normalized()
    up = Vector((0.0, 0.0, 1.0))
    up = up if abs(aim.dot(up)) < 0.99 else Vector(M.col[0][:3])
    return crossbow_frame(M.translation, aim, up)


def crossbow_fallen(weapon_m, hold=0.45):
    """The crossbow where a held weapon's frame (`weapon_m`, poses.py `held`, `dropped`) puts it: aimed along its
    line, held by its stock, its up the world's, so it lies flat once let fall."""
    M = Matrix(weapon_m)
    return crossbow_frame(M.translation, M.col[2].xyz, Vector((0.0, 0.0, 1.0)), hold=hold, rise=0.0)


def bow_fallen(weapon_m, lying):
    """The bow where a held weapon's frame (`weapon_m`) puts it: its limbs along the weapon's line, its grip in the
    fist; `lying`, let fall past the hand, flat on the ground."""
    import poses
    M = Matrix(weapon_m)
    z = M.col[2].xyz.normalized()
    if not lying:
        return poses.frame_matrix(M.translation, z, M.col[0].xyz)
    return poses.frame_matrix(M.translation + z * BOW_HALF, z, Vector((0.0, 0.0, 1.0)))


STAFF_POLE = 1.91       # the pole, foot to head
STAFF_TOP = 0.66        # the carrying fist to the pole's top
STAFF_R = 0.0165        # the pole's half-width at its foot
STAFF_WORK = 1.6        # the first-person work's size, times
STAFF_FIST = -0.50      # the attack's right fist up the pole from the carrying fist
STAFF_HANDS = 0.45      # the attack's left fist up the pole from the right
STAFF_SHOE = 0.04       # the ferrule's length
STAFF_REACH = STAFF_TOP - STAFF_FIST + 0.14   # the attack's right fist to the knob's spike
STAFF_WOOD = (96, 64, 38)   # Daggerfall's staff's brown pole (sRGB)


def build_staff(M, metal=None):
    """A staff in its own frame: the carrying right fist at the origin, the head up +Z, the foot 1.25 m below. With
    no `metal` it is the class's staff, Daggerfall's: a plain pole under an iron knob (staffs.py `knob`), on an iron
    ferrule. A metal's is the first-person forge's design (staffs.py), its metal grey for the game to dye as a bow's
    is."""
    import bpy
    import armour
    import bows
    import staffs
    k = STAFF_WORK
    S = {'staff_len': STAFF_POLE / k, 'staff_r': STAFF_R / k, 'taper': 0.8, 'cap_len': 0.035, 'cap_r': 1.18}
    pieces = staffs.staff(S, metal or 'Steel', head=None if metal else staffs.knob)
    pieces += staffs.shoe(S['staff_r'], STAFF_SHOE / k)
    if metal:
        A = armour.palette(metal, M)
        plate, rough = armour.FINISH[metal][:2]
        wood = metals._linear(bows.WOODS.get(metal, STAFF_WOOD))
        stuffs = {'wood': materials.plain(f'staffwood.{metal}', wood, rough=0.5),
                  'metal': materials.plain(f'bowmetal.{metal}', (plate, plate, plate), metal=0.15, rough=rough, spec=0.6),
                  'cord': A['strap'], 'vein': A['glow']}
    else:
        plate, rough = armour.FINISH['Iron'][:2]   # its head and ferrule iron, the metal a metal staff's is made of
        iron = materials.plain('bowmetal.class', (plate, plate, plate), metal=0.15, rough=rough, spec=0.6)
        stuffs = {'wood': materials.plain('staffwood', metals._linear(STAFF_WOOD), rough=0.55), 'metal': iron,
                  'cord': iron, 'vein': M['wood']}
    names = list(stuffs)
    vs, fs, ms, base = [], [], [], 0
    for v, q, stuff in pieces:
        vs.append(np.asarray(v) * k + (0.0, 0.0, STAFF_TOP - STAFF_POLE))
        fs.append(np.asarray(q) + base)
        ms.append(np.full(len(q), names.index(stuff)))
        base += len(v)
    name = f"staff_{(metal or 'class').lower()}"
    me = bpy.data.meshes.new(name)
    me.from_pydata(np.concatenate(vs).tolist(), [], np.concatenate(fs).tolist())
    for n in names:
        me.materials.append(stuffs[n])
    me.polygons.foreach_set('material_index', np.concatenate(ms).tolist())
    me.update()
    me.shade_smooth()
    rest_attr(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return [ob]


# the spell's spark in the casting hand, as Daggerfall's mage throws it (TEXTURE.486 records 20-24, at the forge's 62
# px a metre): a pale heart in a solid yellow star, its thick tapering arms spread round in the picture's plane, each
# edged in darker gold, a few jagged dark-gold threads of lightning leading off their tips. Each size: the star's
# radius, its arms, the threads' count and reach. A gun's flash keeps its own make (`FLASH_SPARKS`, `FLASH_SHAPE`)
SPARKS = {1: (0.07, 6, 1, 0.06), 2: (0.105, 7, 3, 0.36), 3: (0.17, 8, 6, 0.55)}
FLASH_SPARKS = {1: (0.07, 6, 2, 0.14), 2: (0.11, 8, 5, 0.4), 3: (0.17, 9, 8, 0.6)}
SPARK_CORE, SPARK_STAR, SPARK_THREAD = (255, 246, 103), (215, 205, 0), (125, 104, 5)   # sRGB, Daggerfall's three
SPARK_RIM = (160, 140, 0)   # the star's darker edge
# the make, a share of the star's radius: the heart's radius, an arm's width at its foot and its length, where a
# thread leaves the heart, a thread's radius (metres), whether a thread forks, whether the arms spread round in the
# picture's plane (each thread then off an arm's tip) and the darker edge's colour, or none
SPARK_SHAPE = {'ball': 0.8, 'arm_w': 0.34, 'arm': (1.5, 2.5), 'thread_from': 1.4, 'thread_r': 0.013, 'fork': False,
               'planar': True, 'rim': SPARK_RIM}
FLASH_SHAPE = {'ball': 0.7, 'arm_w': 0.34, 'arm': (0.75, 1.2), 'thread_from': 0.5, 'thread_r': 0.011, 'fork': True,
               'planar': False, 'rim': None}


def _glow(name, rgb, strength):
    m = materials.plain(name, metals._linear(rgb), rough=0.6)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Emission Color'].default_value = (*metals._linear(rgb), 1)
    b.inputs['Emission Strength'].default_value = strength
    return m


def build_sparks(core=SPARK_CORE, thread=SPARK_THREAD, name='spark', sizes=SPARKS, star=SPARK_STAR, glow=1.0,
                 shape=SPARK_SHAPE):
    """The spark at each size (`sizes`), each one object about its own centre: a star of arms out of a heart, every
    arm its own length, and threads of lightning that wander out from it. Lit by itself: its heart in `core`, its
    arms in `star` (or the heart's, with none), its threads in `thread` at `glow`, made as `shape` says (a gun's
    flash is the same star in its orb's blue, guns3p.py)."""
    import bpy
    import bows
    core, thread = _glow(name, core, 1.0), _glow(f'{name}.thread', thread, glow)
    star = None if star is None else _glow(f'{name}.star', star, 1.0)
    rim = None if shape['rim'] is None else _glow(f'{name}.rim', shape['rim'], 1.0)
    arms = 0 if star is None else 2
    out = []
    for size, (r, points, threads, reach) in sizes.items():
        rng = np.random.default_rng(40 + size)
        pieces = [(*bows.ball(np.zeros(3), r * shape['ball'], n=14), 0)]
        behind = np.array([0.0, r * 0.25, 0.0])   # the edge lies just past the star from the eye (its frame's +Y)
        tips = []
        for i in range(points):
            if shape['planar']:   # round in the picture's plane, each a little off even, as Daggerfall's star is
                a = 2.0 * np.pi * (i + rng.uniform(-0.25, 0.25)) / points
                d = np.array([np.cos(a), rng.uniform(-0.15, 0.15), np.sin(a)])
            else:
                d = rng.normal(size=3)
                d[1] *= 0.5   # flattened toward the eye, so every view sees its points
            d /= np.linalg.norm(d)
            across = np.cross(d, (0.0, 0.0, 1.0) if abs(d[2]) < 0.9 else (1.0, 0.0, 0.0))
            across /= np.linalg.norm(across)
            tall = r * rng.uniform(*shape['arm'])
            w = r * shape['arm_w']
            if not shape['planar']:
                pieces.append((*bows.pyramid(d * r * 0.4, across, np.cross(d, across), d, w, w, tall, 0.0), arms))
                tips.append(d * (r * 0.4 + tall))
                continue
            # a tendril, as Daggerfall's star's arms are: tapering from the heart, bent a little to one side
            side = np.cross(d, (0.0, 1.0, 0.0))
            side /= np.linalg.norm(side)
            t = np.linspace(0.0, 1.0, 7)
            bend = rng.uniform(-0.6, 0.6) * tall
            path = d[None] * (r * 0.4 + t[:, None] * tall) + side[None] * (bend * np.sin(np.pi * 0.8 * t))[:, None]
            rad = w * (1.0 - t) ** 0.9 + 0.004
            u, v = bows._frames(path)
            pieces.append((*bows.tube(path, u, v, rad, rad, n=6), arms))
            if rim is not None:   # the arm again, wider, just behind it: its darker edge
                pieces.append((*bows.tube(path + behind, u, v, rad * 1.6 + 0.005, rad * 1.6 + 0.005, n=6), 3))
            tips.append(path[-1])
        for i in range(threads):
            if shape['planar']:   # off an arm's tip, outward
                start = tips[(i * 3) % len(tips)] * 0.9
                d = start / np.linalg.norm(start)
                pts = [start]
            else:
                d = rng.normal(size=3)
                d[1] *= 0.4
                d /= np.linalg.norm(d)
                pts = [d * r * shape['thread_from']]
            n = 7
            for k in range(n):
                step = reach / n * rng.uniform(0.7, 1.3)
                d = d + rng.normal(size=3) * 0.55
                d[1] *= 0.4
                d /= np.linalg.norm(d)
                pts.append(pts[-1] + d * step)
            path = np.array(pts)
            u, w = bows._frames(path)
            rad = np.full(len(path), shape['thread_r'])
            pieces.append((*bows.tube(path, u, w, rad, rad, n=4), 1))
            if shape['fork'] and len(path) > 4:   # a fork off its middle
                f = path[3] + np.cumsum(rng.normal(size=(3, 3)) * reach / n * 0.8, axis=0)
                fp = np.vstack([path[3], f])
                u, w = bows._frames(fp)
                pieces.append((*bows.tube(fp, u, w, rad[:4], rad[:4], n=4), 1))
        vs, fs, ms, base = [], [], [], 0
        for v, q, mat in pieces:
            vs.append(np.asarray(v))
            fs.append(np.asarray(q) + base)
            ms.append(np.full(len(q), mat))
            base += len(v)
        made = f'{name}_{size}'
        me = bpy.data.meshes.new(made)
        me.from_pydata(np.concatenate(vs).tolist(), [], np.concatenate(fs).tolist())
        me.materials.append(core)
        me.materials.append(thread)
        if star is not None:
            me.materials.append(star)
        if rim is not None:
            me.materials.append(rim)
        me.polygons.foreach_set('material_index', np.concatenate(ms).tolist())
        me.update()
        rest_attr(me)
        ob = bpy.data.objects.new(made, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.hide_render = True
        out.append(ob)
    return out


def bow_tips(draw=0.0, kind='long'):
    import shape
    half = BOW_HALF * BOW_KINDS[kind][0]
    return tuple(Vector(shape.bow_point((0, 0, z), draw=draw, kind=kind)) for z in (half, -half))


def string_mesh(M, a, nock, b):
    return tube_path('bowstring', [a, nock, b], 0.003, M['string'], n=4, subsurf=0)


def arrow_mesh(M, nock, tip):
    return tube_path('arrow', [nock, tip], 0.005, M['wood'], n=4, subsurf=0)


WEAPONS = {'axe': build_axe, 'sword': build_sword, 'staff': build_staff}   # each weapon a spec may name
