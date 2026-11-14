"""The medium fighters: an organic body (body.py) dressed in layers over it. The man ('medium') wears a silver helm and
pauldrons over a mail coif, a muscled cuirass, mail legs, a loincloth, cuffed boots and bracers. The woman
('medium_f') wears a horned helm, the silver pauldrons, a dark bodice open at the bust, teal leggings with dark plates
over the thighs, green boots, bracers and a plate at the small of her back; she wears no hood, only mail at her neck.
The guard ('guard') is the man in plate sleeves from shoulder to wrist, mail to the boots with no loincloth or belt,
and brown leather boots. The archer ('archer') is the man bare to the waist and the knee: a dark helm, bracers, the
belt and loincloth and the cuffed boots. The fighters and the guard carry a double-bit war axe, the archer a long
sword (gear.py); all but the guard a long bow too. The woman archer ('archer_f') wears a green top open at the
bust, teal panels at the hips, dark plates over her bare thighs, green boots, bracers and a grey pointed helm
closed round the back of her head.

`build_body` answers the rigid parts as (object, joint), the skinned parts (body.Skinned), and each hand's open and
closed meshes. The weapons and the rigid pieces of armour are gear.py's."""
import math

import numpy as np
from mathutils import Vector

import anatomy
import gear
from body import blob, bone, face_materials
from gear import hang, mirror
from rig import arm_z, rest
from shapes import ellipsoid, loft, plate, tube_path


def _rigid(name, me, mat):
    import bpy
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    return ob


BRACER = (arm_z(0.972), arm_z(1.163))   # the arm's faces between these heights are its bracer


# the four fingers, index first: across the palm (toward the thumb +), each knuckle's depth below the wrist joint,
# the finger's length and radius; each finger's three bones as shares of its length
FINGERS = [(0.03, 0.093, 0.074, 0.0106), (0.0105, 0.096, 0.082, 0.0109), (-0.009, 0.093, 0.077, 0.0102),
           (-0.0265, 0.086, 0.060, 0.0092)]
PHALANX = (0.46, 0.30, 0.24)
GRIP_AT = 0.075   # wrist joint to the held haft's centre (poses.py FIST)


def hand_frame(x):
    """The hand's frame about its wrist joint: `P(o, f, d)` the point `o` out of its back, `f` toward the thumb and
    `d` down the hand."""
    s = 1.0 if x > 0 else -1.0
    J = rest('hand_L' if x > 0 else 'hand_R')
    return lambda o, f, d: tuple(J + Vector((o * s, -f, -d)))


def hand_bones(x, closed):
    """The bones of a hand's four fingers, index first, and of its thumb, each a list of (a, b, radius): open, each
    finger's three curl a little toward the palm, the little finger most; closed, each wraps the haft's circle at the
    grip, its tip pressed back into the palm, and the thumb crosses them outside. The hand and a gauntlet's lames
    (armour.py) lie on them."""
    P = hand_frame(x)
    fingers = []
    if not closed:
        for i, (f, d, length, r) in enumerate(FINGERS):
            splay, flex = (1.5 - i) * 0.05, (12 + 4 * i, 22 + 4 * i, 14)
            o, ang, bones = 0.002, 0.0, []
            for k, share in enumerate(PHALANX):
                ang += math.radians(flex[k])
                n = length * share
                o2, d2, f2 = o - n * math.sin(ang), d + n * math.cos(ang), f + n * splay * math.cos(ang)
                bones.append((P(o, f, d), P(o2, f2, d2), r * (1 - 0.08 * k)))
                o, d, f = o2, d2, f2
            fingers.append(bones)
        thumb = [P(-0.004, 0.022, 0.03), P(-0.014, 0.046, 0.058), P(-0.02, 0.058, 0.084), P(-0.024, 0.063, 0.104)]
    else:
        wrap = 0.0275
        for f, d, length, r in FINGERS:
            pts = [(0.019, knuckle_at(d))]
            pts += [(wrap * math.cos(math.radians(a)), GRIP_AT + wrap * math.sin(math.radians(a))) for a in (118, 192, 250)]
            fingers.append([(P(o1, f, d1), P(o2, f, d2), r * (1 - 0.08 * k))
                            for k, ((o1, d1), (o2, d2)) in enumerate(zip(pts, pts[1:]))])
        thumb = [P(-0.002, 0.024, 0.03), P(-0.016, 0.044, 0.054), P(-0.036, 0.036, 0.072), P(-0.04, 0.015, 0.083)]
    return fingers, [(thumb[k], thumb[k + 1], r) for k, r in enumerate((0.0128, 0.0112, 0.0102))]


def knuckle_at(d):
    """How far down the hand a closed finger's knuckle lies, the finger's open knuckle `d` down."""
    return GRIP_AT + 0.019 + (d - 0.093) * 0.4


def _hand(x, closed):
    """A hand's blobs about its wrist joint: the palm faces the thigh, the thumb comes off its front, the four fingers
    lie front to back, the index foremost, on their bones (`hand_bones`)."""
    P = hand_frame(x)
    fingers, thumb = hand_bones(x, closed)
    parts = [blob(P(0.0, 0.001, 0.004), (0.02, 0.027, 0.033)),        # the wrist, run up into the forearm
             blob(P(0.003, 0.003, 0.042), (0.016, 0.034, 0.028)),     # the palm's heel
             blob(P(-0.007, -0.025, 0.054), (0.01, 0.012, 0.028)),    # its outer pad
             blob(P(-0.006, 0.025, 0.046), (0.013, 0.015, 0.023))]    # the thumb's pad
    if not closed:
        parts += [blob(P(0.002, 0.002, 0.08), (0.0135, 0.041, 0.022)),    # the knuckles' row
                  blob(P(-0.001, 0.002, 0.096), (0.0105, 0.036, 0.01))]   # the web between the fingers
        for bones in fingers:
            parts += [bone(a, b, r, 0.35, 0.3 if k < 2 else 0.05) for k, (a, b, r) in enumerate(bones)]
    else:
        parts.append(blob(P(0.022, 0.002, 0.07), (0.013, 0.041, 0.024)))   # the palm against the haft
        for (f, d, _, r), bones in zip(FINGERS, fingers):
            parts.append(blob(P(0.024, f, knuckle_at(d) - 0.002), (0.012, r * 1.05, 0.012)))   # the knuckle
            parts += [bone(a, b, rr, 0.3, 0.3 if k < 2 else 0.05) for k, (a, b, rr) in enumerate(bones)]
    for k, (a, b, r) in enumerate(thumb):
        parts.append(bone(a, b, r, 0.3, 0.3 if k < 2 else 0.05))
    return parts


# the armour over the naked body: each layer the body's own surface over a region, pushed out this far (metres)
CUIRASS = 0.018
COIF = 0.008
MAIL_HIPS, MAIL_LEGS = 0.015, 0.024   # the mail hangs looser round the legs
BRACER_PUSH = 0.007
FACE_Z = 1.55   # the head's skin above this is the face's material, shadowed under the helm
HOOD_Z, FACE_Y = 1.47, -0.055   # the woman archer's helm closes over her head behind FACE_Y, down to HOOD_Z
# the heights at rest where the layers end: the cuirass's top and bottom, the coif's foot, the mail's waist and the
# boot's cuff, each with a ring of overlap, and the bracer's band
CUIRASS_Z, COIF_Z, MAIL_Z, CUFF_Z = (1.09, 1.475), 1.465, 1.105, (0.39, 0.40, 0.41)


OUTFITS = ('medium', 'medium_f', 'guard', 'archer', 'archer_f', 'naked')
TOP_Z = (0.95, 1.44)   # the woman archer's top: from her hips to under her bare shoulders
ARM_PLATE = 0.009   # the guard's sleeves of plate
# the woman's layers: the bodice from the crotch to the collar, over the legs' tops to TIGHTS_Z[1]; the leggings from
# the boots' cuff to TIGHTS_Z[0]; the plates over the thighs' fronts between THIGH_PLATE_Z
BODICE, TIGHTS, THIGH_PLATE = 0.012, 0.006, 0.016
TIGHTS_Z, THIGH_PLATE_Z = (0.95, 0.97), (0.62, 0.92)


def build_body(M, outfit='medium'):
    """The fighter: (rigid parts, skinned parts, hands {side: {'open': ob, 'fist': ob}}). The skinned parts are the
    naked body (anatomy.py) and, dressed, the armour laid over it as layers of its own surface."""
    cuts = (*CUIRASS_Z, COIF_Z, MAIL_Z, *CUFF_Z, *BRACER, BRACER[0] + 0.01, BRACER[1] - 0.01)
    if outfit == 'medium_f':
        cuts = (CUIRASS_Z[1], COIF_Z, *TIGHTS_Z, *THIGH_PLATE_Z, *CUFF_Z, *BRACER, BRACER[0] + 0.01, BRACER[1] - 0.01)
    if outfit == 'archer_f':
        cuts = (*TOP_Z, *THIGH_PLATE_Z, *CUFF_Z, *BRACER, BRACER[0] + 0.01, BRACER[1] - 0.01)
    guard, bare = outfit == 'guard', outfit == 'archer'
    if guard:
        cuts = (*CUIRASS_Z, COIF_Z, MAIL_Z, *CUFF_Z, BRACER[0], BRACER[0] + 0.01)
    if bare:
        cuts = (*CUFF_Z, *BRACER, BRACER[0] + 0.01, BRACER[1] - 0.01)
    body, parts, hands = anatomy.build(M, _hand, _rigid, hang, () if outfit == 'naked' else cuts)
    if outfit == 'naked':
        return parts, [body], hands
    if outfit == 'medium_f':
        return _medium_f(M, body, parts, hands)
    if outfit == 'archer_f':
        return _archer_f(M, body, parts, hands)
    body.me.materials.append(M['face'])
    face_materials(body.me, lambda c: 1 if c[2] > FACE_Z else 0)
    skins = [body]
    piece = np.array(anatomy.PIECES)[np.argmax(body.alpha, axis=1)]
    z = body.rest[:, 2]
    torso, leg = piece == 'torso', np.char.startswith(piece, 'leg_')
    arm = np.char.startswith(piece, 'arm_')

    def layer(name, mat, mask, push):
        sub = body.alpha[mask]

        def axis(p):   # the limb's own axis under the mail's lattice, blended where pieces meet
            return sum((sub[:, k:k + 1] * ax(p) for k, ax in enumerate(body.axes) if ax is not None), 0.0 * p)
        skins.append(body.shell(name, mat, mask, push, axis=axis))
    # the layers overlap a ring where they meet, so no skin shows between them
    def band(lo, hi):   # the vertices on the cuts count as inside
        return (z > lo - 1e-5) & (z < hi + 1e-5)
    if not bare:
        layer('cuirass', M['cuirass'], torso & band(*CUIRASS_Z), CUIRASS)
        layer('coif_neck', M['coif'], torso & band(COIF_Z, 9), COIF)
        layer('mail', M['mail'], (torso & band(0, MAIL_Z)) | (leg & band(CUFF_Z[1], 9)),
              np.where(leg, MAIL_LEGS, MAIL_HIPS))
    # the skin under the layers and the boots goes; a margin of it stays under each layer's edge
    under = torso | (leg & ~band(*CUFF_Z[::2])) | np.char.startswith(piece, 'barefoot_')
    if bare:   # only the boots hide him
        under = (leg & band(0, CUFF_Z[0])) | np.char.startswith(piece, 'barefoot_')
    if guard:   # plate from the wrist to the shoulder, under the pauldron
        layer('arm_plate', M['armplate'], arm & band(BRACER[0], 9), ARM_PLATE)
        under |= arm & band(BRACER[0] + 0.01, 9) & ~band(BRACER[0] + 0.01, BRACER[0] + 0.01)
    else:
        layer('bracers', M['bracer'], arm & band(*BRACER), BRACER_PUSH)
        under |= arm & band(BRACER[0] + 0.01, BRACER[1] - 0.01) & ~band(BRACER[0] + 0.01, BRACER[0] + 0.01) \
            & ~band(BRACER[1] - 0.01, BRACER[1] - 0.01)
    body.cut(~under)

    gear.boots(parts, M['leatherboot' if guard else 'boot'])

    # head: the mail coif over the body's own head (none on the archer), the helm with its nasal and cheek guards
    if not bare:
        hang(parts, loft('coif', (0, -0.025, 1.72), (0, -0.02, 1.47), [
            (0.0, 0.10, 0.10, 0, 0.018), (0.25, 0.108, 0.112, 0, 0.022), (0.55, 0.10, 0.10, 0, 0.03),
            (0.8, 0.088, 0.088, 0, 0.026), (1.0, 0.075, 0.075, 0, 0.02)],
            M['coif'], cap=(True, False)), 'head')
    gear.pointed_helm(parts, M['plate'] if bare else M['silver'])   # the archer's helm is dark

    # shoulders and waist: the pauldrons hugging the shoulder, a silver rim under the collar, belt and loincloth
    if not bare:
        hang(parts, loft('collar', (0, 0, 1.415), (0, 0, 1.44), [(0, 0.215, 0.13, 0, -0.002),
                                                                (1, 0.212, 0.128, 0, -0.004)],
                          M['silver'], subsurf=1, cap=(False, False)), 'chest')
        gear.pauldrons(M, parts)
    if guard:
        return parts, skins, hands
    hang(parts, loft('belt', (0, 0, 1.10), (0, 0, 1.15), [(0, 0.182, 0.125, 0, 0.0), (1, 0.18, 0.124, 0, 0.0)],
                      M['leather'], subsurf=1, cap=(False, False)), 'pelvis')
    gear.loincloth(parts, M['cloth'])
    return parts, skins, hands


def _medium_f(M, body, parts, hands):
    """The woman's medium armour over her body (see the module's note). Her helm leaves her face open, so her face is
    skin as Daggerfall shows it, not the man's shadow under his helm."""
    skins = [body]
    piece = np.array(anatomy.PIECES)[np.argmax(body.alpha, axis=1)]
    x, y, z = body.rest[:, 0], body.rest[:, 1], body.rest[:, 2]
    torso, leg = piece == 'torso', np.char.startswith(piece, 'leg_')
    arm = np.char.startswith(piece, 'arm_')

    def band(lo, hi):   # the vertices on the cuts count as inside
        return (z > lo - 1e-5) & (z < hi + 1e-5)
    # the bodice's neck opens in a V down to the bust, where her skin shows
    vee = torso & (y < -0.02) & (z > 1.30) & (np.abs(x) < 0.55 * (z - 1.30) + 0.01)
    # a thigh's front: the two-thirds of its round facing forward of its own axis
    side = np.sign(x)
    dx, dy = x - 0.105 * side, y
    front = dy < -0.35 * np.hypot(dx, dy)
    skins.append(body.shell('bodice', M['cuirass'], (torso & band(0, CUIRASS_Z[1]) & ~vee) | (leg & band(TIGHTS_Z[0], 9)),
                            BODICE))
    skins.append(body.shell('coif_neck', M['coif'], torso & band(COIF_Z, 9), COIF))
    skins.append(body.shell('tights', M['tights'], leg & band(CUFF_Z[1], TIGHTS_Z[1]), TIGHTS))
    skins.append(body.shell('thigh_plates', M['plate'], leg & band(*THIGH_PLATE_Z) & front, THIGH_PLATE))
    skins.append(body.shell('bracers', M['bracer'], arm & band(*BRACER), BRACER_PUSH))
    under = (torso & ~vee) | (leg & ~band(*CUFF_Z[::2])) | np.char.startswith(piece, 'barefoot_')
    under |= arm & band(BRACER[0] + 0.01, BRACER[1] - 0.01) & ~band(BRACER[0] + 0.01, BRACER[0] + 0.01) \
        & ~band(BRACER[1] - 0.01, BRACER[1] - 0.01)
    body.cut(~under)
    gear.boots(parts, M['greenboot'])
    # head: no hood, only mail at the neck (above); the dark helm open at the face, its two horns curving up and forward
    hang(parts, ellipsoid('helm', (0, -0.04, 1.65), (0.112, 0.134, 0.17), M['plate'], z_cut=1.66, subsurf=2,
                           tilt_x=-14), 'head')
    # each horn sweeps out from the helm's crown, then up, its tip hooked forward
    mirror(lambda s, x: hang(parts, tube_path(f'horn_{s}', [
        (0.08 * x, -0.01, 1.745), (0.15 * x, -0.02, 1.77), (0.172 * x, -0.04, 1.83), (0.15 * x, -0.085, 1.875),
        (0.115 * x, -0.115, 1.885)], lambda t: 0.022 * (1 - t) + 0.004, M['horn'], n=8), 'head'))
    gear.pauldrons(M, parts)
    # the plate at the small of her back
    hang(parts, plate('back_plate', [(-0.07, 1.10), (0.07, 1.10), (0.05, 0.92), (-0.05, 0.92)], 0.01,
                       M['silver'], 'XZ', (0, 0.135, 0)), 'pelvis')
    return parts, skins, hands


def _archer_f(M, body, parts, hands):
    """The woman archer (see the module's note): bare-armed and bare-thighed, her face shadowed under the helm."""
    body.me.materials.append(M['face'])
    body.me.materials.append(M['plate'])
    # her helm closes round the back and sides of her head to the neck: there the head is the helm's dark metal
    face_materials(body.me, lambda c: 2 if c[2] > HOOD_Z and c[1] > FACE_Y else 1 if c[2] > FACE_Z else 0)
    skins = [body]
    piece = np.array(anatomy.PIECES)[np.argmax(body.alpha, axis=1)]
    x, y, z = body.rest[:, 0], body.rest[:, 1], body.rest[:, 2]
    torso, leg = piece == 'torso', np.char.startswith(piece, 'leg_')
    arm = np.char.startswith(piece, 'arm_')

    def band(lo, hi):   # the vertices on the cuts count as inside
        return (z > lo - 1e-5) & (z < hi + 1e-5)
    vee = torso & (y < -0.02) & (z > 1.30) & (np.abs(x) < 0.55 * (z - 1.30) + 0.01)
    side = np.sign(x)
    dx, dy = x - 0.105 * side, y
    front = dy < -0.35 * np.hypot(dx, dy)
    skins.append(body.shell('top', M['cloth'], torso & band(*TOP_Z) & ~vee, BODICE))
    skins.append(body.shell('thigh_plates', M['plate'], leg & band(*THIGH_PLATE_Z) & front, THIGH_PLATE))
    skins.append(body.shell('bracers', M['bracer'], arm & band(*BRACER), BRACER_PUSH))
    under = (torso & band(TOP_Z[0] + 0.01, TOP_Z[1] - 0.01) & ~vee) | (leg & band(0, CUFF_Z[0]))
    under |= np.char.startswith(piece, 'barefoot_')
    under |= arm & band(BRACER[0] + 0.01, BRACER[1] - 0.01) & ~band(BRACER[0] + 0.01, BRACER[0] + 0.01) \
        & ~band(BRACER[1] - 0.01, BRACER[1] - 0.01)
    body.cut(~under)
    gear.boots(parts, M['greenboot'])
    gear.pointed_helm(parts, M['helmet'], M['plate'])
    gear.loincloth(parts, M['tights'], gear.LOIN_F)
    return parts, skins, hands


