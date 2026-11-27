"""The forge's layers: every animation rendered once on the bare male body and once on the bare female body, and each
piece of gear and each weapon alone over the same frames, with each pixel's depth. The game stacks the layers a look
names and keeps the nearest surface at each pixel (src/systems/studioArt/forgeLayers.js), so any outfit plays any
animation.

    python -I tools/sprite-forge/layers.py --body male --out public/art/studio/forge/layers [--anims walk,death]
                                           [--layers body,helm] [--samples 64]

Writes `<out>/<body>/<layer>_<anim>.png`, the colour, and `<layer>_<anim>_z.png`, the depth, for each layer and
animation the body has. Each is a strip: a row a view (0 the front .. 4 the back), a column a keyed frame (a class
record shorter than its animation picks among them by its `keys`), every cell the
animation's own size with the ground under the body on the cell's root pixel. The depth is 16 bits in red and green,
`(depth - DEPTH_BASE) * DEPTH_SCALE` along the camera's forward, nearer smaller. The cells, the roots, the layers and
each class archive's look go to src/systems/studioArt/forgeLooks.json."""
import argparse
import hashlib
import json
import math
import os
import re
import sys
import tempfile
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import anatomy  # noqa: E402
from body import coords  # noqa: E402
import armour  # noqa: E402
import clothes  # noqa: E402
import clothkit  # noqa: E402
import drape  # noqa: E402
import fit  # noqa: E402
import forge  # noqa: E402
import materials  # noqa: E402
import metals  # noqa: E402
import model  # noqa: E402
import bowhold  # noqa: E402
import bows  # noqa: E402
from gear import (BENT, BOW_KINDS, BOW_METAL_GRADE, CROSSBOW_METALS, build_bow,  # noqa: E402
                  build_crossbow, build_metal_bow, build_axe, build_sparks, build_staff, build_sword,  # noqa: E402
                  crossbow_at, crossbow_fallen, crossbow_frame, bow_fallen, build_weapon, owner_sword)
import poses  # noqa: E402
import beastfolk  # noqa: E402
import hair  # noqa: E402
import blunts3p  # noqa: E402
import daggers3p  # noqa: E402
import gunplay  # noqa: E402
import guns3p  # noqa: E402
import torch3p  # noqa: E402
import casting  # noqa: E402
import quaff  # noqa: E402
import playing  # noqa: E402
import riding  # noqa: E402
import driving  # noqa: E402
import onehand  # noqa: E402
import attacks  # noqa: E402,F401  (its attacks join poses.OWN)
import blows  # noqa: E402
import agility  # noqa: E402
# a short skirt rides up in the body's own moves that spread the legs, never stretched between them (the hang's plumb)
drape.RIDE_UP = frozenset(m for m in agility.MOVES if m not in ('hang', 'shimmy'))
import people  # noqa: E402
import props3p  # noqa: E402
import shields3p  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
import sheaths  # noqa: E402
import onthemove  # noqa: E402
import rendercache  # noqa: E402
import rigcape  # noqa: E402
import shape  # noqa: E402
import stage  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SPECS = os.path.join(HERE, 'specs')
LOOKS = os.environ.get('FORGE_LOOKS') or os.path.join(ROOT, 'src', 'systems', 'studioArt', 'forgeLooks.json')
# each strip's bare body: the body strips' hash it was drawn to fit, by body (`fitted_mark`); a strip whose body has been
# drawn again since is stale (test/systems/studioArt/forgeFitted.test.js)
FITTED = os.environ.get('FORGE_FITTED') or os.path.join(HERE, 'fitted')
# the skin of a face under a helm, drawn in its own colours and never graded: Daggerfall's helmed faces are drawn in
# a run of browns from (47, 31, 15) to (173, 127, 78) (TEXTURE.399, 478, 487, 488), far under the bare skin's
FACE_SKIN = (132, 98, 64)
# and under a hood, deep in its shade: Daggerfall's hooded mages' faces run from (35, 23, 11) to (59, 39, 19), a
# lit tip at most (109, 85, 54) (TEXTURE.486, 485)
FACE_HOOD = (54, 36, 18)
HOOD_NECK_Z = 1.49   # a hood's shade runs down the neck to its collar, as Daggerfall's throats are dark under it
# an armour piece over what is worn under it on the torso: a belt or a sash stands 4 cm off the body, and under a
# cuirass its own belt lies over it (forgeLayers.js `cover`)
ARMOUR_COVER = 0.07
DEPTH_BASE, DEPTH_SCALE = -3.0, 10000.0   # a depth from -3 m to 3.5 m in tenths of a millimetre

# Each body: the archive its proportions, colours and lights are fitted to, and the outfits its gear is built from.
# The man's poses are fitted to his archive, his sword's attack and his staff's animations to the archives named; every
# other body moves as he does (`moves`). A gear layer is a group of an outfit's parts by their names
BODIES = {
    'male': {'spec': 488, 'sword': 482, 'staff': 486, 'gear': {
        'medium': {'cuirass': ['cuirass'], 'coif_neck': ['coif_neck'], 'mail': ['mail'], 'bracers': ['bracers'],
                   'cuffed_boots': ['boot_L', 'boot_R', 'cuff_L', 'cuff_R', 'foot_L', 'foot_R'], 'coif': ['coif'],
                   'helm': ['helm', 'cheek_L', 'cheek_R', 'nasal'], 'collar': ['collar'],
                   'pauldrons': ['pauldron_L', 'pauldron_R'], 'war_belt': ['belt'],
                   'loin_panels': ['loin_front', 'loin_back']},
        'guard': {'arm_plate': ['arm_plate']},
        'archer': {'helm_dark': ['helm', 'cheek_L', 'cheek_R', 'nasal']},
    }},
    'female': {'spec': 487, 'moves': 'male', 'gear': {
        'medium_f': {'bodice': ['bodice'], 'coif_neck': ['coif_neck'], 'leggings': ['tights'],
                     'thigh_plates': ['thigh_plates'], 'bracers': ['bracers'],
                     'cuffed_boots': ['boot_L', 'boot_R', 'cuff_L', 'cuff_R', 'foot_L', 'foot_R'],
                     'helm_horned': ['helm', 'horn_L', 'horn_R'], 'pauldrons': ['pauldron_L', 'pauldron_R'],
                     'back_plate': ['back_plate']},
        'archer_f': {'top': ['top'], 'helm': ['helm', 'cheek_L', 'cheek_R', 'nasal'],
                     'loin_panels': ['loin_front', 'loin_back']},
    }},
    # the children (people.py's placed boys and girls): the man's and the woman's bodies at a child's size and
    # make (`CHILD`), wearing the same garments; strips and an index body of their own
    'boy': {'spec': 488, 'moves': 'male', 'base': 'male', 'gear': {}},
    'girl': {'spec': 487, 'moves': 'male', 'base': 'female', 'gear': {}},
}
# a child's make over the grown body's own: about two-thirds the height on screen, the head larger to it, the limbs
# and the trunk slighter
CHILD = {'scale': 0.66, 'head': 1.3, 'head_w': 1.1, 'torso_w': 0.86, 'torso_d': 0.9, 'arm_r': 0.82, 'leg_r': 0.84,
         'hand': 0.85}
# What each class archive wears (specs/class-looks.json: the class's kit over its armour, written from
# src/characters/enemy/classKits.js by classLooks.mjs), with the dye each layer takes, and the weapon its records swing
CLASS_LOOKS = json.load(open(os.path.join(SPECS, 'class-looks.json')))
WEAPON_OF = {399: 'axe', 488: 'axe', 487: 'axe', 486: 'staff', 485: 'staff'}   # every other class swings a sword
# by archive: (its body, its gear, the weapon its records swing, none for a person of the town, its dyes, its race)
LOOKS_OF = {int(a): (v['body'], v['gear'], None if 'race' in v else WEAPON_OF.get(int(a), 'sword'), v['dyes'],
                     v.get('race')) for a, v in CLASS_LOOKS.items()}
# The class archives the forge has fitted no spec to, each playing a fitted archive's records, which lie as its own do
# frame for frame (TEXTURE.476's are 482's): that archive, the mage whose spell its records 20-24 play where the class
# casts (enemyBasics.js `hasSpellAnimation`), and the archive whose bow its records 25-29 play
STAND_IN = {476: (482, 486, None), 478: (482, None, None), 480: (482, None, None), 484: (482, None, None),
            490: (482, 486, 482), 475: (481, 485, 481), 477: (481, None, None), 479: (481, None, None),
            483: (481, None, None), 489: (481, 485, 481)}
# a stand-in's record whose own frame count differs from the record it plays: by record, its own count
OWN_FRAMES = {477: {8: 7}, 475: dict.fromkeys(range(20, 25), 4), 489: dict.fromkeys(range(20, 25), 4)}


def class_records(archive):
    """A class archive's records: its own spec's, or those it stands in for (`STAND_IN`), each at its own length."""
    def spec(a):   # a person of the town's from its own archive (peopleSpecs.mjs), a class's fitted
        own = os.path.join(SPECS, 'people', f'{a}.json')
        return json.load(open(own if os.path.exists(own) else os.path.join(SPECS, f'{a}.json')))['records']
    if archive not in STAND_IN:
        return spec(archive)
    base, spell, bow = STAND_IN[archive]
    recs = [dict(r) for r in spec(base)[:20] + spec(spell or base)[20:25] + (spec(bow)[20:25] if bow else [])]
    for k, n in OWN_FRAMES.get(archive, {}).items():
        recs[k]['frames'] = n
        recs[k].pop('keys', None)
    return recs


# the animations every body plays, each with its frame count: Daggerfall's (the attack once a weapon, and the mage's
# own with the staff: its walk, idle, hurt, attack and spell) and the forge's own
STAFF_ANIMS = {'walk_staff': 4, 'attack_staff': 6, 'hurt_staff': 1, 'idle_staff': 1, 'spell': 4}
ANIMS = {'walk': 4, 'attack_axe': 6, 'attack_sword': 6, 'hurt': 1, 'idle': 1, 'bow': 4, **STAFF_ANIMS, **poses.OWN,
         **blows.BLOWS, **playing.PLAY, **onehand.ONEHAND, **riding.RIDE, **driving.DRIVE, **people.PEOPLE, **gunplay.GUNPLAY,
         **agility.MOVES, **casting.CAST, **quaff.QUAFF, **bowhold.ANIMS, **agility.ELSEWHERE, **onthemove.MOVES}
# the bow at rest in the left fist (poses.py `AT_REST`): each animation a carried weapon shows in, the right hand empty
BOW_REST = {anim: ANIMS[base] for anim, base in poses.AT_REST.items()}
ANIMS.update(BOW_REST)
WEAPONS = ('axe', 'sword', 'bow', 'staff')
# the placed people's props (props3p.py), each a layer drawn in the poses that set it out (people.py `PROPS_OF`)
PROP_LAYERS = tuple(f'prop_{n}' for n in props3p.LAYERS)
# the poses the placed people take and each layer's poses they wear it in, by body (specs/people-worn.json,
# peopleLooks.mjs): all that is drawn in their poses and on a child's body, so neither draws the whole wardrobe
PEOPLE_WORN = (json.load(open(os.path.join(SPECS, 'people-worn.json')))
               if os.path.exists(os.path.join(SPECS, 'people-worn.json')) else {})
CHILDREN = ('boy', 'girl')
# each bow type in each metal, a layer of its own drawn where the bow is (gear.py `build_metal_bow`): the bow a look
# carries is the one in hand (forgeLayers.js)
BOW_LAYERS = tuple(f'bow_{kind}_{metal.lower()}' for kind in BOW_KINDS for metal in bows.METALS)
# each metal's staff, a layer of its own (gear.py `build_staff`), drawn where the class staff is
STAFF_LAYERS = tuple(f'staff_{metal.lower()}' for metal in bows.METALS)
# each metal's crossbow, the owner's (gear.py `build_crossbow`), held in the bow's frames: the shot a look takes in hand
CROSSBOW_LAYERS = tuple(f'crossbow_{metal}' for metal in CROSSBOW_METALS)
# each metal's long sword and battleaxe (gear.py `build_sword`, `build_axe`), a layer of its own held as the class sword
# or axe is, in the metal's own colours: the one a look carries is the one in hand
SWORD_LAYERS = tuple(f'sword_{metal.lower()}' for metal in bows.METALS)
# each metal's short sword of the owner's (gear.py `OWNER_SWORD`), the one a Shortsword or a Wakazashi is held as
SHORT_METALS = tuple(metal for metal in bows.METALS if owner_sword(metal, True))
SHORT_LAYERS = tuple(f'sword_{metal.lower()}_short' for metal in SHORT_METALS)
AXE_LAYERS = tuple(f'axe_{metal.lower()}' for metal in bows.METALS)
# every layer held where a class weapon is, by that weapon: each metal's sword and axe, its dagger (daggers3p.py),
# and its mace, flail and warhammer (blunts3p.py)
HELD = {**dict.fromkeys(SWORD_LAYERS + SHORT_LAYERS, 'sword'), **dict.fromkeys(AXE_LAYERS, 'axe'),
        **dict.fromkeys(daggers3p.LAYERS, 'sword'), **blunts3p.HELD}
# the bard's instruments (playing.py), each drawn in its own playing alone
INSTRUMENT_LAYERS = tuple(playing.KIND_OF.values())
# each kind of shield in each metal on the left arm (shields3p.py), drawn in the shield's animations alone (onehand.py),
# and a pair's left weapon: the class sword, and each one-hander's own as the right holds it (`<layer>_l`)
SHIELD_METALS = shields3p.METALS
SHIELD_LAYERS = tuple(f'shield_{kind}_{(m or "plain").lower()}' for kind in shields3p.KINDS for m in SHIELD_METALS)
LEFT_HELD = ('sword_l', *(f'{n}_l' for n in HELD if n.startswith(('sword_', 'dagger_', 'mace_'))))
OFFHAND_LAYERS = (*SHIELD_LAYERS, *LEFT_HELD, *guns3p.OFF, torch3p.LAYER)
# the guns (guns3p.py) in the right fist, each drawn in its own moves (gunplay.py) and the hurt, the spell and the own
GUN_LAYERS = guns3p.HELD
# the weapons worn on the body (sheaths.py): sheathed, and the empty sheath or the quiver worn while one is drawn
SHEATH_LAYERS = sheaths.LAYERS
# the weapons whose hilt, guard and trim each strip marks for a faction's colour (stage.py `mark_trim`, metals.py
# `is_trim`): every sword, dagger, axe, mace, flail and warhammer, in hand or sheathed
TRIMMED = re.compile(r'^(sheath_)?(sword|dagger|axe|mace|flail|warhammer)_')
WORK = (360, 240)   # the work frame: room for a body fallen its length and a weapon raised overhead
# rows under the ground in the work frame, by animation: a weapon a fallen body drops lies nearer the eye than the body
# and lower on the screen, seen from behind most of all
BELOW = {'death': 60, 'fallen': 60}
RAW = {'cloth': False, 'all': False}   # the wardrobe's cloth left in its own light, off the band (--ungraded), or
# every layer ungraded (--raw), to measure a grade against


def held_as(weapon):
    """The class weapon a layer is held as (`HELD`), or the layer's own name."""
    return HELD.get(weapon, weapon)


def weapon_anims(weapon):
    """The animations a weapon's layer is drawn in (`held_anims`), and each one's own on the move (onthemove.py)."""
    anims = held_anims(weapon)
    return [*anims, *(name for name, (act, _) in onthemove.WALKS.items() if act in anims)]


def held_anims(weapon):
    """The animations a weapon's layer is drawn in: the bow in its own, the spark in the spell, a staff in the staff's
    and the forge's own, an axe or a sword (and what is held as either, `HELD`) in all the rest but the other's attack,
    and of the blows its own holds' (blows.py `blows_of`).
    The spell is cast with the left hand, so whatever the right holds is drawn in it, the staff or a weapon held
    one-handed, upright where the staff would stand; the spark is a layer of its own for any look. An instrument is
    drawn in its own playing, and no weapon is. A weapon worn on the body is drawn in the frames it is cleared in. A
    pair's second blade is drawn in its own moves and the body's held ones; a torch in its own (torch3p.py)."""
    if weapon in riding.LAYERS:   # the horse, under the rider alone
        return list(riding.RIDE)
    if weapon in SHEATH_LAYERS:   # a weapon worn on the body, in the frames it is cleared in
        return sheaths.anims_of(weapon)
    if weapon in INSTRUMENT_LAYERS:   # and the flute in the snake charmer's pose
        return [f'play_{weapon}', *(a for a, k in people.PLAYS.items() if k == weapon)]
    if weapon in PROP_LAYERS:
        return [a for a, ps in people.PROPS_OF.items() if weapon[len('prop_'):] in ps]
    if weapon in SHIELD_LAYERS:   # and let fall with the body and swung in the run, riding the left fist (`ShieldBearer`)
        return [*onehand.SHIELDED, 'death', 'fallen', 'run']
    if weapon in GUN_LAYERS or weapon in guns3p.OFF:
        return gunplay.anims_of(weapon)
    if weapon in LEFT_HELD:   # a pair's left weapon: and in the body's moves, held as the right is (`PairBearer`)
        return [*onehand.TWIN, *agility.HELD, *blows.PAIR]
    if weapon == torch3p.LAYER:
        return list(torch3p.ANIMS)
    if weapon in CROSSBOW_LAYERS:   # and carried at port arms in its own sprint (gunplay.py `xbowrun`)
        return ['bow', *BOW_REST, 'death', 'fallen', 'xbowrun']
    if weapon in BOW_LAYERS:   # in hand at rest too, let fall as any weapon is, and in its own holds (bowhold.py)
        return ['bow', *BOW_REST, 'death', 'fallen', *bowhold.ANIMS]
    if weapon == 'bow':
        return ['bow']
    if weapon == 'spark':   # and in the player's own cast (casting.py)
        return ['spell', *casting.CAST]
    if weapon == 'staff' or weapon in STAFF_LAYERS:   # and its own blows, in both hands
        return [*STAFF_ANIMS, *poses.OWN, *agility.HELD, *blows.blows_of(weapon)]
    held = held_as(weapon)
    return [a for a in ANIMS if a != 'bow' and a not in playing.PLAY and (a == 'spell' or a not in STAFF_ANIMS)
            and a != f"attack_{'sword' if held == 'axe' else 'axe'}"
            and (a not in onehand.ONEHAND or held == 'sword')   # one-handed, the sword alone
            and a not in gunplay.GUNPLAY   # a gun's moves hold the gun alone
            and a not in riding.RIDE and a not in BOW_REST   # a rider's fists are on the reins; at rest, the bow's
            and a not in bowhold.ANIMS   # and in its own holds
            and a not in driving.DRIVE   # and a driver's
            and a not in agility.BARE   # a climber's hands are on the wall
            and a not in casting.CAST   # a player casts with the weapon put away
            and a not in quaff.QUAFF   # and drinks with it put away
            and a not in agility.ELSEWHERE   # drawn for outside the game, the hands empty
            and a not in onthemove.WALKS   # on the move as its action is (`weapon_anims`)
            and (a not in blows.BLOWS or a in blows.blows_of(weapon))]   # each its own holds' blows


def anim_of(rec_anim, weapon):
    """The body's animation a class record plays: its attack is its weapon's, and a staff's walk, idle and hurt are its
    own, the staff upright in the fist."""
    if weapon == 'staff' and rec_anim in ('walk', 'idle', 'hurt', 'attack'):
        return f'{rec_anim}_staff'
    return f'attack_{weapon}' if rec_anim == 'attack' else rec_anim


def load_body(body):
    """The body's fitted tables: its archive's proportions, colours, lights and grade, and the poses of the body it
    moves as (`moves`: every body moves as the man, the sword's attack from the archive whose sword was fitted to
    him). Gives (spec, fit by animation, keys by animation)."""
    b = BODIES[body]
    mv = BODIES[b.get('moves', body)]
    path = os.path.join(SPECS, f"{b['spec']}.json")
    spec = json.load(open(path))
    shape.load_shape(path.replace('.json', '-shape.json'))
    materials.load_tint(path.replace('.json', '-colour.json'))
    stage.load_light(path.replace('.json', '-light.json'))
    forge.GRADE.clear()
    grade = path.replace('.json', '-grade.json')
    if os.path.exists(grade):
        forge.GRADE.update(json.load(open(grade)))
    forge.GRADE.setdefault('metal', armour.METAL_GRADE)   # the armour's metal onto Daggerfall's metal band
    forge.GRADE.setdefault('mail', armour.MAIL_GRADE)     # and its mail, on a body whose own outfit has none
    forge.GRADE.setdefault('bowmetal', BOW_METAL_GRADE)   # and a bow's, its shade kept on the band
    # the bare body's own proportions and skin, fitted to Daggerfall's bare archers (482, 481): its archive's were
    # fitted with its armour and clothes over it, which hid the body's own shape and most of its skin
    own = json.load(open(os.path.join(SPECS, f'mannequin-{body}.json')))
    shape.SHAPE.update(own['shape'])
    forge.GRADE.update(own.get('grade', {}))
    motion = os.path.join(SPECS, f"{mv['spec']}.json")
    fits = json.load(open(motion.replace('.json', '-fit.json')))
    sword_spec = json.load(open(os.path.join(SPECS, f"{mv['sword']}.json")))
    sword_fit = json.load(open(os.path.join(SPECS, f"{mv['sword']}-fit.json")))
    keys = {(r['anim'], r['view']): list(r['keys']) for r in json.load(open(motion))['records'] if r.get('keys')}
    sword_keys = {(r['anim'], r['view']): list(r['keys']) for r in sword_spec['records'] if r.get('keys')}
    staff_spec = json.load(open(os.path.join(SPECS, f"{mv['staff']}.json")))
    staff_fit = os.path.join(SPECS, f"{mv['staff']}-fit.json")
    staff_fit = json.load(open(staff_fit)) if os.path.exists(staff_fit) else {}
    staff_keys = {(r['anim'], r['view']): list(r['keys']) for r in staff_spec['records'] if r.get('keys')}
    per = {}
    for anim in ANIMS:
        if anim in STAFF_ANIMS:   # the mage's: its fit and keys alone
            per[anim] = (staff_fit, staff_keys)
        elif anim == 'attack_sword':
            per[anim] = ({k: v for k, v in fits.items() if not k.startswith('attack:')}
                         | {k: v for k, v in sword_fit.items() if k.startswith('attack:')},
                         {k: v for k, v in keys.items() if k[0] != 'attack'} | {k: v for k, v in sword_keys.items()
                                                                                if k[0] == 'attack'})
        else:
            per[anim] = (fits, keys)
    return spec, per


def pose(anim, key, view, per, weapon=None):
    """The body's pose and gear for keyed frame `key` of `anim`: a body's animation is its keyed frames in order, the
    same in every view. It takes the fit of the fitted archive's record frame `key` where that frame takes that key,
    and is posed as keyed elsewhere: a record's `keys` matched Daggerfall's outlines, not a body's motion. The sword's
    attack is the sword's, and the sword's reach keeps a carried point off the floor whichever weapon is carried. A
    staff's layer (`weapon`) is held as a staff in the forge's own animations, head up and standing on its foot."""
    fits, keys = per[anim]
    # the classic record's animation: 'attack' for 'attack_axe', 'walk' for 'walk_staff'; a move posed under its own
    # name (a playing, a placed person's 'lean_cane' or 'sit_ground', the bow at rest on the fit it rests in) is its own
    name = anim if anim in poses.ANIMS or anim in playing.PLAY or anim in BOW_REST else anim.split('_')[0]
    poses.FIT.clear()
    poses.FIT.update(fits)
    poses.KEYS.clear()
    poses.WEAPON[0] = (weapon if anim == 'spell' and weapon in ('axe', 'sword') else 'staff' if anim in STAFF_ANIMS
                       or weapon == 'staff' else 'axe' if anim == 'attack_axe' else 'sword')
    base = poses.AT_REST.get(name, name)
    order = keys.get((base, view))
    fitted = order is None or (key < len(order) and order[key] == key)
    p, gear = poses.pose_for(name, key, view, forge.VIEW_YAW[view], adj=None if fitted else {})
    p.anim = anim   # the move it is a frame of, for a holder that lays its gear by it (`ShieldBearer`); never keyed
    return p, gear


class Bare(forge.Fighter):
    """The bare body, and the shells that paint its head as an outfit paints it (model.py `face_materials`): the
    face's shadow under a helm ('face'), the woman archer's helm closed round the back of her head ('hood'), and a
    face painted in a hood's shade ('face_hooded'). They are cut on the body as built, before its proportions are laid
    on, as the paint is."""

    def __init__(self, body, weapon):
        anatomy.use(body)
        self.M = materials.palette()
        self.parts, self.skins, self.hands = model.build_body(self.M, 'naked')
        b = self.skins[0]
        y, z = b.rest[:, 1], b.rest[:, 2]
        self.skins.append(b.shell('face', self.M['face'], z > model.FACE_Z, 0.002))
        self.skins.append(b.shell('hood', self.M['plate'], (z > model.HOOD_Z) & (y > model.FACE_Y), 0.003))
        # a face in a hood's shade, painted as Daggerfall paints its hooded and helmed faces (`painted_face`)
        self.skins.append(b.shell('paint.face_hooded', painted_face(b, 'hooded', body == 'female', FACE_HOOD),
                                  z > HOOD_NECK_Z, 0.0015))
        self.axe = build_weapon(self.M, weapon)
        self.off = []   # what the left hand holds besides (onehand.py): a shield or a second sword, set by a layer
        self.bow = build_bow(self.M)
        self.bow_kind = 'long'
        self.sparks = build_sparks()
        self.extra = []
        self.shaped()

    def arm_staffs(self, obs):
        """Hold `obs` (each metal's staff, gear.py `build_staff`) in place of the weapon, all at once: a layer shows
        its own."""
        for ob in self.axe:
            bpy.data.objects.remove(ob, do_unlink=True)
        self.axe = list(obs)

    def arm_held(self, obs):
        """Hold `obs` (each metal's weapons, `HELD`) in place of the weapon, all at once: a metal's sword or axe sized
        as the class weapon is (shape.py `transform`), a first-person make (a dagger, a mace) at its own size. A
        layer shows its own."""
        self.arm_staffs(obs)
        for ob in self.axe:
            ob.data.vertices.foreach_set('co', shape.transform(ob.name, coords(ob.data)).ravel())
            ob.data.update()


class ShieldBearer(Bare):
    """A body holding a shield. In a frame whose gear lays nothing in the left fist (the fall, the run), the shield
    rides the fist as the guard holds it, so a fighter goes down with it on the arm, and it lies face up by the hand
    once the hand is down by the ground (nearer it than a forearm's length). In the run (`UPRIGHT`) the fist pumps
    turned over, so the shield is turned in its own plane about the fist until its top points up."""
    _grip = None
    UPRIGHT = ('run',)

    @classmethod
    def grip(cls):
        """The shield's frame in the left fist's, as the guard holds it."""
        if cls._grip is None:
            p, gear = onehand.guard(0, 0, 0.0)
            cls._grip = p.world()['hand_L'].inverted() @ gear['off']
        return cls._grip

    def key_gear(self, pose, gear):
        """The gear as `place` lays it: the strip's key (`Keys.pose`) holds the shield where it rides the fist."""
        if gear.get('off') is not None:
            return gear
        W = pose.world()
        m = W['hand_L'] @ self.grip()
        hand = W['hand_L'].translation
        if hand.z > (hand - W['farm_L'].translation).length:   # the arm off the ground (going down, flung up): on it
            return {**gear, 'off': self._upright(m, hand) if getattr(pose, 'anim', None) in self.UPRIGHT else m}
        # its face looks along the forearm (a centre grip): turned about the fist until the face looks up, as a dead
        # wrist lets it fall, so a fallen arm lays it flat and never on its edge
        face, up = -(m.to_3x3() @ Vector((0.0, 1.0, 0.0))), Vector((0.0, 0.0, 1.0))
        axis = face.cross(up)
        if axis.length > 1e-6:
            m = Matrix.Translation(hand) @ Matrix.Rotation(face.angle(up), 4, axis.normalized()) @ Matrix.Translation(-hand) @ m
        return {**gear, 'off': m}

    @staticmethod
    def _upright(m, hand):
        """Shield frame `m` turned about its face's axis through the fist until its top (+Z) points as near up as it
        can, its face kept where it looks."""
        face, top = (m.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized(), m.to_3x3() @ Vector((0.0, 0.0, 1.0))
        up = Vector((0.0, 0.0, 1.0))
        want, have = up - face * up.dot(face), top - face * top.dot(face)
        if want.length < 1e-3 or have.length < 1e-3:   # lying flat: no top to turn up
            return m
        want, have = want.normalized(), have.normalized()
        angle = math.atan2(have.cross(want).dot(face), have.dot(want))
        return Matrix.Translation(hand) @ Matrix.Rotation(angle, 4, face) @ Matrix.Translation(-hand) @ m

    def place(self, pose, gear):
        gear.update(self.key_gear(pose, gear))
        super().place(pose, gear)


class PairBearer(Bare):
    """A body holding a second sword in its left fist. In the body's held moves (agility.py `HELD`), whose gear lays
    nothing in that fist, the blade is held there as the right one is, mirrored across the body (agility.py
    `left_hold`)."""

    def key_gear(self, pose, gear):
        """The gear as `place` lays it: the strip's key (`Keys.pose`) holds the blade where the fist holds it."""
        anim = getattr(pose, 'anim', None)
        if gear.get('off') is not None or anim not in agility.HELD:
            return gear
        return {**gear, 'off': agility.left_hold(pose, anim)}

    def place(self, pose, gear):
        gear.update(self.key_gear(pose, gear))
        super().place(pose, gear)


class Dressed(Bare):
    """The bare body wearing the wardrobe or an armour set: each garment's shells posed with the body, the gauntlets'
    covers moved with the hands, and its drapes made again each frame (`hang`) over the body as posed, or over the
    `envelope`: every armour set at once, for the drapes worn over armour."""

    def __init__(self, body, weapon='axe'):
        super().__init__(body, weapon)
        self.covers = []
        self.active = None   # the skins a frame poses (the layer's own and the body's), or every one

    def place(self, pose, gear):
        every = self.skins
        if self.active is not None:
            self.skins = [sk for sk in every if sk.ob.name in self.active]
        try:
            super().place(pose, gear)
            clothkit.keep_out(every[0], self.skins[1:])   # the cloth never inside the skin, however the body bends
        finally:
            self.skins = every
        for name, cover in self.covers:
            ob = bpy.data.objects[name]
            cover.matrix_world = ob.matrix_world
            cover.hide_render = ob.hide_render
        self.W = {j: np.array(m) for j, m in pose.world().items()}


ENVELOPE = ('cuirass', 'pauldrons', 'greaves', 'boots')   # what a drape over armour hangs clear of: never the arms'


def envelope(body):
    """A fighter wearing every armour set at once over the body, the guilds' included: what a drape worn over armour
    hangs clear of, its pauldrons too, so a cloak falls from over the broadest of them."""
    E = Dressed(body)
    for m in armour.SETS:
        _, skins = armour.dress(E.M, E.skins[0], E.parts, m, pieces=ENVELOPE, woman=body == 'female')
        for sk in skins:
            bpy.data.objects.remove(sk.ob, do_unlink=True)
    for ob in [ob for ob in bpy.data.objects if ob.type == 'MESH' and ob.name.startswith('armour_')]:
        ob.hide_render = True
    E.built = len(E.skins)   # its own skins: each garment hung over it after adds one (`hang_over`), its own alone
    return E


def every_set(body):
    """The body wearing every piece of every armour set at once, hidden: what a worn weapon lies clear of
    (sheaths.py `Envelope`)."""
    E = Dressed(body)
    for m in armour.SETS:
        _, skins = armour.dress(E.M, E.skins[0], E.parts, m, pieces=armour.PIECES, woman=body == 'female')
        E.skins += skins
    for ob in [ob for ob in bpy.data.objects if ob.type == 'MESH']:
        if any(ob is x.ob for x in E.skins) or any(ob is x for x, _ in E.parts):
            ob.hide_render = True
    return E


PER = {}   # the body's fits and keys by animation (`load_body`), for what is posed outside a layer's own frames


def trim_classify(classify):
    """`classify` with a weapon's hilt, guard and trim (metals.py `is_trim`) told apart: their class negated, which
    `render` reads back as the trim's mask. The raster holds classes as signed bytes, every class under 128."""
    return lambda m: -classify(m) if m is not None and metals.is_trim(m.name) else classify(m)


class Layer:
    """One layer: the fighter its objects belong to and the objects it shows, and its raster of them alone. Its
    `drapes` are made again each frame over `over` (its own fighter, or the armour's envelope); its free objects (the
    drapes, the gauntlets' covers) are rastered as they stand."""

    def __init__(self, name, fighter, obs, classify, drapes=(), over=None, dye=False, order=0.0, cover=0.0, casters=(),
                 under=0.0):
        self.name, self.fighter, self.obs = name, fighter, set(obs) | {d.ob for d in drapes}
        if TRIMMED.match(name):
            classify = trim_classify(classify)
        # the weapon its frames hold: a staff in the forge's own moves, an axe or a sword in the spell
        held = held_as(name)
        self.weapon = ('staff' if name == 'staff' or name in STAFF_LAYERS else held if held in ('axe', 'sword')
                       else 'crossbow' if name in CROSSBOW_LAYERS else None)
        self.prop = name[len('prop_'):] if name in PROP_LAYERS else None   # laid where its pose sets it out
        self.drapes, self.over, self.dye, self.order, self.cover = list(drapes), over, dye, order, cover
        self.under = under   # how far behind it a drape may lie and still be drawn over it (a worn weapon's)
        self.casters = list(casters)   # unseen, but casting their shadow on it (a helm's on the face under it)
        names = {ob.name for ob in obs}
        sub = SimpleNamespace(
            skins=[sk for sk in fighter.skins if sk.ob.name in names],
            parts=[(ob, j) for ob, j in fighter.parts if ob.name in names],
            hands={s: k for s, k in fighter.hands.items() if any(ob.name in names for ob in k.values())},
            axe=[ob for ob in fighter.axe if ob.name in names],
            off=[ob for ob in getattr(fighter, 'off', []) if ob.name in names],   # the left hand's, a weapon too
            bow=[ob for ob in fighter.bow if ob.name in names])
        self.cloud = fit.Cloud(sub, classify=classify, live=True)
        held = {o.name for o in [*(sk.ob for sk in sub.skins), *(ob for ob, _ in sub.parts), *sub.axe, *sub.bow,
                                 *sub.off, *(ob for k in sub.hands.values() for ob in k.values())]}
        self.free = [ob for ob in self.obs if ob.name not in held]
        self.classify = classify
        self.extras = name == 'bow' or name in BOW_LAYERS   # the string and the arrow, made each frame

    def shows(self, ob):
        held = getattr(self, 'holdout', None)
        return ob in self.obs or (self.extras and ob in self.fighter.extra) or (held is not None and ob in held.objects)


def class_names():
    """Every class layer's name: the bare body's shells, the weapons and each outfit's gear groups. A layer's name is
    its strips' and its index entry's, so no wardrobe layer may take one."""
    gear = {g for b in BODIES.values() for groups in b['gear'].values() for g in groups}
    return {'body', 'face', 'hood', 'face_hooded', 'spark', *WEAPONS, *BOW_LAYERS, *STAFF_LAYERS, *CROSSBOW_LAYERS,
            *HELD, *INSTRUMENT_LAYERS, *OFFHAND_LAYERS, *SHEATH_LAYERS, *beastfolk.LAYERS, *riding.LAYERS,
            *PROP_LAYERS, *GUN_LAYERS, *hair.LAYERS} | gear


def wardrobe_layers(body, classify, want=None):
    """The wardrobe's layers over `body`, each garment in a dye's grey: its shells (`<garment>`), its drapes over the
    body (`<garment>_drape`) and over armour (`<garment>_plated`), and a cloak's clear of a full skirt
    (`<garment>_skirted`) and of a full skirt over armour (`<garment>_plated_skirted`)."""
    clash = {v for n in clothes.LAYERS for v in (n, f'{n}_drape', f'{n}_plated', f'{n}_skirted', f'{n}_plated_skirted')}
    clash &= class_names()
    if clash:
        raise ValueError(f'wardrobe layers named as class layers: {sorted(clash)}')
    W = Dressed(body)
    W.skins[0].woman = body == 'female'   # her garments where they differ from his (clothes.py WOMAN)
    E = None
    out = []
    for name in clothes.LAYERS:
        if want and not any(w in (name, f'{name}_drape', f'{name}_plated', f'{name}_skirted', f'{name}_plated_skirted')
                            for w in want):
            continue
        made = clothes.wear(name, W.skins[0], grey=True)
        shells = [m for m in made if not isinstance(m, drape.Drape)]
        hangs = [m for m in made if isinstance(m, drape.Drape)]
        under = hang_over(W, name, hangs) if hangs else None
        W.skins += shells
        gloves = []
        if name in clothes.GLOVED:   # the hands' covers, shown and moved with each hand as it is drawn (`Dressed`)
            covers = clothes.glove_covers(W.hands, clothes.garment_mats(name, W.skins[0].woman, grey=True))
            W.covers += covers
            gloves = [c for _, c in covers]
        if shells:
            out.append(Layer(name, W, [s.ob for s in shells] + gloves, classify, dye=True,
                             order=clothes.order_of(name)))
        if hangs:
            out.append(Layer(f'{name}_drape', W, [], classify, hangs, dye=True, order=clothes.drape_order(name)))
            if E is None:
                E = envelope(body)
            plated = [m for m in clothes.wear(name, W.skins[0], grey=True)]
            W.skins += [m for m in plated if not isinstance(m, drape.Drape)]   # posed for its drapes, never drawn
            plated = [m for m in plated if isinstance(m, drape.Drape)]
            over_e = hang_over(E, name, plated)
            out.append(Layer(f'{name}_plated', W, [], classify, plated, over=E, dye=True,
                             order=clothes.drape_order(name)))
            if 'cloak' in name:   # and a cloak hung clear of a full skirt (a gown's, a robe's)
                skirted = [m for m in clothes.wear(name, W.skins[0], grey=True) if isinstance(m, drape.Drape)]
                clear = drape.Skirt(f'{name}_clear', [mat for mat in W.M.values()][:1], clothes.WAIST_Z - 0.02, 0.1,
                                    ease=0.016, flare=0.13, folds=18, fold_depth=0.2, rows=22, cols=48)
                clear.ob.hide_render = True
                hang_over(W, name, skirted + [clear], under)
                for d in skirted:
                    if isinstance(d, drape.Cloak):
                        d.clear = clear
                out.append(Layer(f'{name}_skirted', W, [], classify, skirted, dye=True,
                                 order=clothes.drape_order(name)))
                # and over armour and a full skirt at once: clear of a gown's skirt hung over the armour
                both = [m for m in clothes.wear(name, W.skins[0], grey=True) if isinstance(m, drape.Drape)]
                clear_e = drape.Skirt(f'{name}_clear_plated', [mat for mat in W.M.values()][:1],
                                      clothes.WAIST_Z - 0.02, 0.1, ease=0.016, flare=0.13, folds=18, fold_depth=0.2,
                                      rows=22, cols=48)
                clear_e.ob.hide_render = True
                hang_over(E, name, both + [clear_e], over_e)
                for d in both:
                    if isinstance(d, drape.Cloak):
                        d.clear = clear_e
                out.append(Layer(f'{name}_plated_skirted', W, [], classify, both, over=E, dye=True,
                                 order=clothes.drape_order(name)))
    return out


def hang_over(fighter, name, drapes, under=None):
    """Garment `name`'s drapes hung over `fighter`'s body and what the game lets be worn under them
    (clothes.py `envelope`, made once a fighter and garment, or `under`), each posed with them. Gives the envelope."""
    if under is None:
        under = clothes.envelope(name, fighter.skins[0])
        if under is not None:
            fighter.skins.append(under)
    for d in drapes:
        d.over = ('body',) + ((under.ob.name,) if under is not None else ())
        if under is not None:
            d.needs = list(getattr(d, 'needs', [])) + [under.ob.name]
    return under


def set_of(name):
    """The armour set or metal a layer is graded in, by its name (`<piece>_<set>`): a pair's left twin's (`_l`) and a
    short sword's (`_short`) their metal's, as the right hand's."""
    return {k.lower(): k for k in armour.SETS}.get(name.removesuffix('_l').removesuffix('_short').rsplit('_', 1)[-1])


def set_graded(ly, *args):
    """`render` a layer in its armour set's own grades (armour.SET_GRADE) over the run's, by the layer's name
    (`set_of`), and the run's put back after."""
    m = set_of(ly.name)
    own = armour.SET_GRADE.get(m, {})
    was = {k: forge.GRADE.get(k) for k in own}
    forge.GRADE.update(own)
    try:
        return render(ly, *args)
    finally:
        for k, g in was.items():
            if g is None:
                forge.GRADE.pop(k, None)
            else:
                forge.GRADE[k] = g


def armour_layers(body, classify, materials_=None):
    """Each armour set's layers over `body`: its pieces (`<piece>_<material>`) and its under-suit
    (`under_<material>`), worn where no clothing covers the body."""
    out = []
    for m in materials_ or armour.MATERIALS:
        A = Dressed(body)
        mat, skins = armour.dress(A.M, A.skins[0], A.parts, m, woman=body == 'female')
        A.skins += skins
        A.covers = armour.gauntlet_hands(A.hands, mat, armour.STYLE[m])
        by = {}
        for ob in [ob for ob, _ in A.parts] + [c for _, c in A.covers]:
            if ob.name.startswith('armour_'):
                piece = ob.name.split('.')[0][len('armour_'):]
                by.setdefault(piece, []).append(ob)
        by.setdefault('cuirass', []).extend(sk.ob for sk in skins[1:])   # its yoke and mail skirt, worn with it
        for piece in armour.PIECES:   # its metal grey, which the game lays the set's ramp on; none where the set has
            if not by.get(piece):     # no such piece (chain's pauldrons are its hauberk's)
                continue
            out.append(Layer(f'{piece}_{m.lower()}', A, by.get(piece, []), classify, dye='metal',
                             order=clothes.ORDER['armour'], cover=ARMOUR_COVER))
        # a leather outfit's suit drawn over the skin wherever it lies within its own order of it (`under_order`): its
        # sleeves show under small caps, and the shoulder's skin swells past it as the arm swings
        out.append(Layer(f'under_{m.lower()}', A, [skins[0].ob], classify, dye='metal',
                         order=armour.STYLE[m].get('under_order', clothes.ORDER['skin'])))
        if by.get('helm'):   # the face under the helm, painted as Daggerfall paints it: the brow and eyes in its shade
            b = A.skins[0]
            face = b.shell(f'paint.face_{m.lower()}', painted_face(b, m, body == 'female'), b.rest[:, 2] > model.FACE_Z,
                           0.0015)
            attrs = face.me.attributes   # its paint read off the shaped head it was placed on, not the body as built
            if 'rest.001' in attrs:
                attrs.remove(attrs['rest'])
                attrs['rest.001'].name = 'rest'
            A.skins.append(face)
            out.append(Layer(f'face_{m.lower()}', A, [face.ob], classify, order=clothes.ORDER['skin']))
    return out


def painted_face(b, name, woman, skin=FACE_SKIN, front=None):
    """The skin of a face under a helm (or a hood: `skin`) painted as Daggerfall's faces read at a sprite's size,
    placed off this head's own nose: the brim's shade across the brow, the eyes dark under it, the cheeks hollowed,
    the mouth a line below the nose, the jaw's shadow under it (a man's darker, as a beard's). Painted, not cast: a
    cast shadow lays the whole face in one flat brown at the skin grade's floor. Painted ahead of `front` (rest Y),
    or of the nose's tip's back: a beast's long muzzle takes its marks back to the brow."""
    piece = np.array(anatomy.PIECES)[np.argmax(b.alpha, axis=1)]
    p = b.rest[piece == 'skull']
    ridge = p[(np.abs(p[:, 0]) < 0.006) & (p[:, 2] > 1.58) & (p[:, 2] < 1.72)]
    tip = ridge[np.argmin(ridge[:, 1])]   # the nose's tip, the face's foremost point
    nz, ny = float(tip[2]), float(tip[1])
    eye, mouth = nz + 0.034, nz - 0.033
    # Daggerfall's guard's face (TEXTURE.399): its skin's red at 47 (a tenth), 79 (half) and 134 (nine tenths); eyes
    # near black under the brim, the cheeks and the nose's tip lit, the mouth and the chin dark
    marks = [(0.0, nz, 0.2, 0.2, 0.42),                                                  # under the helm, all of it
             (0.0, nz - 0.004, 0.012, 0.016, -0.4),                                      # the nose's tip, lit
             (0.0, eye + 0.016, 0.07, 0.022, 0.5),                                       # the brim's shade
             (0.03, eye, 0.016, 0.01, 0.5), (-0.03, eye, 0.016, 0.01, 0.5),              # the eyes
             (0.046, nz - 0.012, 0.014, 0.024, 0.15), (-0.046, nz - 0.012, 0.014, 0.024, 0.15),   # the cheeks
             (0.0, mouth, 0.021, 0.006, 0.4),                                             # the mouth
             (0.0, mouth - 0.03, 0.042, 0.026, 0.1 if woman else 0.35)]                   # the jaw
    return materials.painted_face(skin, f'paint.face.{name.lower()}', marks, ny + 0.045 if front is None else front)


def build_layers(body, classify, want=None):
    """Every layer of `body`: the bare body (its hands too), each gear group of each outfit, and the weapons; of the
    shields and the worn weapons, only when `want` (the layers asked for) names one, as they take long to make."""
    naked = {w: Bare(body, w) for w in ('axe', 'sword', 'staff')}   # the others lend their weapons alone
    skins = {sk.ob.name: sk.ob for sk in naked['axe'].skins}
    out = [Layer('body', naked['axe'], [skins['body']]
                 + [ob for kinds in naked['axe'].hands.values() for ob in kinds.values()], classify),
           Layer('face', naked['axe'], [skins['face']], classify),
           Layer('hood', naked['axe'], [skins['hood']], classify),
           Layer('face_hooded', naked['axe'], [skins['paint.face_hooded']], classify, order=clothes.ORDER['skin']),
           Layer('axe', naked['axe'], naked['axe'].axe, classify),
           Layer('sword', naked['sword'], naked['sword'].axe, classify),
           Layer('bow', naked['axe'], naked['axe'].bow, classify),
           Layer('staff', naked['staff'], naked['staff'].axe, classify),
           Layer('spark', naked['axe'], naked['axe'].sparks, classify)]
    holder = Bare(body, 'axe')   # a body holding every metal's staff, each a layer, its metal grey
    made = {metal: build_staff(holder.M, metal) for metal in bows.METALS}
    holder.arm_staffs([ob for obs in made.values() for ob in obs])
    out += [Layer(f'staff_{metal.lower()}', holder, obs, classify, dye='metal') for metal, obs in made.items()]
    holder = Bare(body, 'axe')   # a body holding every metal's crossbow, each a layer in its own colours
    made = {metal: build_crossbow(metal) for metal in CROSSBOW_METALS}
    holder.arm_staffs([ob for obs in made.values() for ob in obs])
    out += [Layer(f'crossbow_{metal}', holder, obs, classify) for metal, obs in made.items()]
    for kind, build in (('sword', build_sword), ('axe', build_axe)):   # a body holding every metal's, each a layer
        holder = Bare(body, kind)
        made = {f'{kind}_{metal.lower()}': build(holder.M, metal) for metal in bows.METALS}
        if kind == 'sword':   # and each short sword of the owner's
            made |= {f'sword_{m.lower()}_short': build_sword(holder.M, m, short=True) for m in SHORT_METALS}
        holder.arm_held([ob for obs in made.values() for ob in obs])
        out += [Layer(name, holder, obs, classify) for name, obs in made.items()]
    # a body holding every metal's dagger, mace, flail and warhammer, each a layer in its own colours
    holder = Bare(body, 'sword')
    made = {f'dagger_{metal.lower()}': daggers3p.build(metal) for metal in daggers3p.METALS} | blunts3p.build_all()
    holder.arm_held([ob for obs in made.values() for ob in obs])
    out += [Layer(name, holder, obs, classify) for name, obs in made.items()]
    if not want or set(want) & set(SHEATH_LAYERS):   # the weapons worn on the body, clear of every armour set
        holder = Bare(body, 'axe')
        made = sheaths.build(holder.M, sheaths.materials_for(holder.M), want)
        poser = lambda anim, key: pose(anim, key, 0, PER, None)[0]   # noqa: E731
        worn = sheaths.hang_all(holder, made, sheaths.Envelope(every_set(body), poser))
        out += [Layer(name, holder, obs, classify, order=sheaths.order_of(name), under=sheaths.UNDER,
                      dye='metal' if name.startswith(sheaths.DYED) else False) for name, obs in worn.items()]
    holder = ShieldBearer(body, 'sword')   # a body holding every shield on its left arm, each a layer, its metal its set's
    for m in SHIELD_METALS if not want or set(want) & set(OFFHAND_LAYERS) else ():
        A = armour.palette(m or 'Iron', holder.M)
        for kind in shields3p.KINDS:
            obs = shields3p.build(kind, m, holder.M, A)
            holder.off += obs
            out.append(Layer(f'shield_{kind}_{(m or "plain").lower()}', holder, obs, classify, dye='metal'))
    holder = PairBearer(body, 'sword')   # a pair's left weapon: the class sword and each one-hander's own (`LEFT_HELD`)
    own = {f'sword_{m.lower()}_l': build_sword(holder.M, m) for m in bows.METALS}
    own |= {f'sword_{m.lower()}_short_l': build_sword(holder.M, m, short=True) for m in SHORT_METALS}
    own |= {f'dagger_{m.lower()}_l': daggers3p.build(m) for m in daggers3p.METALS}
    for name, obs in blunts3p.build_all().items():   # the maces; a flail or a hammer is never one of a pair
        if f'{name}_l' in LEFT_HELD:
            own[f'{name}_l'] = obs
        else:
            for ob in obs:
                bpy.data.objects.remove(ob, do_unlink=True)
    for ob in [ob for obs in own.values() for ob in obs]:   # each sized as the right hand's is (`Bare.arm_held`)
        ob.data.vertices.foreach_set('co', shape.transform(ob.name, coords(ob.data)).ravel())
        ob.data.update()
    made = {'sword_l': build_weapon(holder.M, 'sword'), **own}
    holder.off = [ob for obs in made.values() for ob in obs]
    out += [Layer(name, holder, obs, classify) for name, obs in made.items()]
    out += guns3p.held_layers(body, classify, Bare, Layer)   # the guns, each with its shot's flash
    out += torch3p.held_layers(body, classify, Bare, Layer)   # the torch, lit
    # the horse under the rider (riding.py), the Morrowind lane's Courser whole: posed by the frame, held by no hand;
    # and each mount look's own pieces, a layer each, drawn where they stand in front of the horse held out
    out.append(Layer('horse', naked['axe'], riding.mount().objects, classify))
    for name in riding.LOOK_LAYERS:
        look = Layer(name, naked['axe'], riding.mount().look_objects(name[len('horse_'):]), classify)
        look.holdout = riding.mount()
        out.append(look)
    holder = Bare(body, 'axe')   # a body holding every prop of the placed people's poses, each a layer of its own
    made = props3p.build_all()
    holder.arm_staffs([ob for obs in made.values() for ob in obs])
    out += [Layer(f'prop_{name}', holder, obs, classify) for name, obs in made.items()]
    holder = Bare(body, 'axe')   # a body holding every instrument, each a layer in its own colours
    made = playing.build_instruments()
    holder.arm_staffs([ob for obs in made.values() for ob in obs])
    out += [Layer(kind, holder, obs, classify) for kind, obs in made.items()]
    for kind in BOW_KINDS:   # a body holding every metal's bow of a type, each bow a layer, its metal grey
        archer = Bare(body, 'axe')
        made = {metal: build_metal_bow(archer.M, metal, kind) for metal in bows.METALS}
        archer.arm_bows([ob for obs in made.values() for ob in obs], kind)
        out += [Layer(f'bow_{kind}_{metal.lower()}', archer, obs, classify, dye='metal') for metal, obs in made.items()]
    for outfit, groups in BODIES[body]['gear'].items():
        f = forge.Fighter(outfit, body, 'axe')
        by_name = {}
        for ob in [sk.ob for sk in f.skins] + [ob for ob, _ in f.parts]:
            by_name.setdefault(ob.name.split('.')[0], []).append(ob)
        for layer, names in groups.items():
            out.append(Layer(layer, f, [ob for n in names for ob in by_name.get(n, [])], classify))
    return out


CUT = ('idle', 0, 0)   # the pose a cloak is cut on (drape.Cloak `cut_from`): standing, its first key, from the front


def swing(layer, anim, view, per):
    """A layer's drapes that swing (drape.Cloak, hair.py's hangs): each carried through `anim`'s keys in this view,
    from the body as posed at each key, before any frame of it is drawn. A cloak is cut first on the body standing
    (`CUT`), so it is one cloak whichever move a run draws it in first."""
    swung = [d for d in layer.drapes if hasattr(d, 'carry')]
    if not swung or all(getattr(d, 'carried', None) == (anim, view) for d in swung):
        return
    over = layer.over or layer.fighter
    uncut = [d for d in swung if isinstance(d, drape.Cloak) and d.cloth is None and getattr(d, 'cut_from', None) is None]
    if uncut:
        p, gear = pose(CUT[0], CUT[1], CUT[2], per, layer.weapon)
        layer.fighter.place(p, gear)
        if layer.over is not None:
            over.place(p, gear)
        for d in uncut:
            d.cut_from = (d.snapshot(layer.fighter.W, over)['pin'], layer.fighter.W)
    shots, Ws = {id(d): [] for d in swung}, []
    for k in range(ANIMS[anim]):
        p, gear = pose(anim, k, view, per, layer.weapon)
        layer.fighter.place(p, gear)
        if layer.over is not None:
            over.place(p, gear)
        Ws.append(layer.fighter.W)
        for d in swung:
            shots[id(d)].append(d.snapshot(layer.fighter.W, over))
    for d in swung:
        d.carry(shots[id(d)], anim, Ws)
        d.carried = (anim, view)


class Keys:
    """The run's keys (rendercache.py): each layer's make, once; each frame's pose; each strip's, from them."""

    def __init__(self, per, names):
        sc = bpy.context.scene
        self.per, self.made, self.poses, self.envelopes, self.hangs = per, {}, {}, {}, {}
        # the material list names a texel's material by its place, never what it draws: no layer's key holds it
        self.run = rendercache.digest(('forge', rendercache.VERSION['draw']), RAW, stage.LIGHT, stage.PX_PER_M,
                                      stage.ELEVATION, stage.WORK_W, stage.WORK_H, stage.ROOT_PX, sc.cycles.samples,
                                      sc.view_settings.view_transform, shape.SHAPE)

    def _envelope(self, E, shaded=True, named=()):
        """A fighter a layer's drapes hang over apart from its own (an armour envelope): as it was built, and the
        garments' envelopes those drapes name (`over`), never another garment's a run hung on it besides."""
        key = (id(E), shaded, tuple(sorted(named)))
        if key not in self.envelopes:
            built = getattr(E, 'built', len(E.skins))
            skins = E.skins[:built] + [sk for sk in E.skins[built:] if sk.ob.name in named]
            obs = sorted({ob.name: ob for ob in [o for o, _ in E.parts] + [sk.ob for sk in skins]}.values(),
                         key=lambda o: (rendercache.plain(o.name), o.name))
            self.envelopes[key] = rendercache.digest([rendercache.object_digest(ob, E, BENT, shaded) for ob in obs])
        return self.envelopes[key]

    def _worn(self, ly, shaded):
        """What a layer is made of: its objects, its drapes' make, what casts on it, the body under it and what its
        drapes hang over."""
        F = ly.fighter
        by_name = lambda o: (rendercache.plain(o.name), o.name)   # noqa: E731
        own = sorted((ob for ob in ly.obs if not any(ob is d.ob for d in ly.drapes)), key=by_name)
        under = F.skins[0].ob if getattr(F, 'skins', None) else None
        # a drape hung over a skin of its own fighter's (a garment's `_under` envelope, from the game's tables)
        named = {n for d in ly.drapes for n in getattr(d, 'over', ())}
        overs = sorted((sk.ob for sk in getattr(F, 'skins', [])[1:] if sk.ob.name in named and sk.ob not in own),
                       key=by_name)
        return [[rendercache.object_digest(ob, F, BENT, shaded) for ob in own],
                [rendercache.object_digest(ob, F, BENT, shaded) for ob in overs],
                [rendercache.drape_digest(d) for d in ly.drapes],
                [rendercache.object_digest(ob, F, BENT, shaded) for ob in sorted(ly.casters, key=by_name)],
                rendercache.object_digest(under, F, BENT, shaded) if under is not None and under not in own else None,
                self._envelope(ly.over, shaded, {n for d in ly.drapes for n in getattr(d, 'over', ())})
                if ly.over is not None else None]

    def layer(self, ly):
        if ly.name not in self.made:
            # the grades of the materials it is drawn in alone: a grade refitted for another moves no other key
            # (forge.py grade_frame reads `name`, `name@view` or the name before its first dot)
            mats = {rendercache.plain(m.name) for ob in [*ly.obs, *(d.ob for d in ly.drapes)]
                    for m in getattr(ob.data, 'materials', ()) if m}
            used = mats | {m.split('.')[0] for m in mats}
            grades = {k: v for k, v in {**forge.GRADE, **armour.SET_GRADE.get(set_of(ly.name), {})}.items()
                      if k.split('@')[0] in used}
            self.made[ly.name] = rendercache.digest(
                self.run, ly.name, self._worn(ly, True), grades, ly.dye, ly.weapon, bool(getattr(ly, 'extras', None)),
                ('cloth', rendercache.VERSION['cloth']) if ly.drapes else None, *drape_tags(ly),
                # a weapon's trim marked (`mark_trim`): its strips drawn again, and no other's
                'trim' if TRIMMED.match(ly.name) else None)
        return self.made[ly.name]

    def cloth(self, ly):
        """A layer's drapes as they hang, whatever their colour: their make and what they hang on and over."""
        if ly.name not in self.hangs:
            code = [rendercache.VERSION['cloth'], rendercache.VERSION['draw']]
            self.hangs[ly.name] = rendercache.digest('cloth', code, self._worn(ly, False), *drape_tags(ly))
        return self.hangs[ly.name]

    def made_all(self, layers):
        """Every layer's make read once, as built, before any of it is posed or hung: a drape hung keeps where it
        hangs, which is never its make."""
        for ly in layers:
            self.layer(ly)
            if ly.drapes:
                self.cloth(ly)

    def pose(self, anim, frame, view, weapon, held=None, fist=True):
        """A frame's pose and gear, the gear as the layer's fighter lays it where it lays its own (`held`: a gun's
        hold, guns3p.py `key_gear`); its fists only for a layer that reads them (`reads_fist`), so a fist closed in a
        move moves no other layer's key."""
        # by whose hold, not whether there is one: a shield's and a gun's both hold nothing named, so a run drawing both
        # would key the second by the first's
        key = (anim, frame, view, weapon, getattr(held, '__qualname__', None) if held else None)
        if key not in self.poses:
            p, gear = pose(anim, frame, view, self.per, weapon)
            g = held(p, gear) if held else gear
            self.poses[key] = (rendercache.digest(p.world(), g),
                               rendercache.digest(p.world(), {k: v for k, v in g.items() if k != 'fist'}))
        return self.poses[key][0 if fist else 1]

    def strip(self, ly, anim):
        held, fist = getattr(ly.fighter, 'key_gear', None), reads_fist(ly)
        return rendercache.digest(self.layer(ly), anim, [[self.pose(anim, f, v, ly.weapon, held, fist)
                                                          for f in range(ANIMS[anim])] for v in range(5)],
                                  *laid_tag(ly, anim), *ride_tag(ly, anim))


def laid_tag(ly, anim):
    """What a hip's worn weapon laid past its joint adds to its strip's key (sheaths.py `laid`): on the floor in a fall,
    its depth laid with it; plumb in the body's moves. Nothing elsewhere."""
    if not sheaths.hip_hold(ly.name):
        return ()
    if anim in sheaths.FELL:
        return ('grounded', 'depth')
    return (('hung', sheaths.HANG_SHARE),) if anim in sheaths.HUNG else ()


def drape_tags(ly):
    """What a layer's drapes add to its keys: a cloak's cut on the body standing (`CUT`), and its rig's version
    (rigcape.py) where it is rigged, else the air kept out of the body it hangs on (cloth.py `outside`), so a change to
    either draws its strips again and no other's; and a drape hung over an envelope named by its copy (drape.py
    `named`). Nothing for the rest, so their keys stand."""
    tags = []
    if any(isinstance(d, drape.Cloak) for d in ly.drapes or ()):   # a cloak alone: hair carries its own hang
        tags += [('cut', CUT), ('rig', rigcape.VERSION) if drape.RIG else ('air', 'sealed')]
    if any('.' in n for d in ly.drapes or () for n in (getattr(d, 'over', None) or ())):
        tags.append(('over', 'named'))
    return tags


def reads_fist(ly):
    """Whether a layer's pixels follow the fists (poses.py `FISTS`): its own hands drawn, a glove's or a gauntlet's
    covers moved with them (`Dressed`), or a drape hung clear of the hands as they show (drape.py `reads_hands`: a
    skirt, a bell sleeve). Each layer is drawn alone, so no other sees a hand."""
    covers = {c.name for _, c in getattr(ly.fighter, 'covers', ())}
    return bool(any(getattr(d, 'reads_hands', False) for d in ly.drapes or ())
                or getattr(getattr(ly, 'cloud', None), 'hands', None) or any(ob.name in covers for ob in ly.obs))


def ride_tag(ly, anim):
    """What a short skirt riding up adds to its strip's and its cloth's keys: in the moves it rides up in, its law
    (drape.py `RIDE_KEEP`, `RIDE_ABOVE`, the length kept); nothing elsewhere, so every other strip keeps its key."""
    if anim not in drape.RIDE_UP or not any(drape.rides_up(d) for d in (ly.drapes or ())):
        return ()
    return (('ride', 'kept', drape.RIDE_KEEP, drape.RIDE_ABOVE),)


class ClothRows:
    """Each layer's cloth through a view of an animation: read back where it was hung before (rendercache.Cloth),
    else kept frame by frame as it is hung, and stored once the view is whole."""

    def __init__(self):
        self.store, self.keys, self.rows = rendercache.Cloth(), None, {}

    def _key(self, layer, anim, view):
        return rendercache.digest(self.keys.cloth(layer), anim, view,
                                  [self.keys.pose(anim, f, view, layer.weapon) for f in range(ANIMS[anim])],
                                  *ride_tag(layer, anim))

    def row(self, layer, anim, view, per):
        if self.keys is None or rendercache.OFF:
            return None
        got = self.store.get(self._key(layer, anim, view))
        n = len(layer.drapes)
        return None if got is None else [got[f * n:(f + 1) * n] for f in range(ANIMS[anim])]

    def record(self, layer, anim, view, frame):
        if self.keys is None or rendercache.OFF:
            return
        key = self._key(layer, anim, view)
        row = self.rows.setdefault(key, {})
        row[frame] = [np.array(d.verts, copy=True) for d in layer.drapes]
        if len(row) == ANIMS[anim]:
            self.store.put(key, [v for f in range(ANIMS[anim]) for v in row[f]])
            del self.rows[key]


CLOTH = ClothRows()


def render(layer, anim, frame, view, per, tmp, names):
    """A layer's frame: its colour (graded as the forge grades) and its depth, cut to the box it fills, with that
    box's corner on the work frame; None where the layer draws nothing."""
    p, gear = pose(anim, frame, view, per, layer.weapon)
    if layer.weapon == 'crossbow':   # held where the bow is held, in the bow's place; at rest, by its stock
        W = p.world()
        held = (crossbow_frame(*gear['xbow']) if 'xbow' in gear else crossbow_fallen(gear['axe']) if 'axe' in gear
                else crossbow_at(gear['bow'], W['farm_L'].translation, W['hand_L'].translation))
        gear = {k: v for k, v in gear.items() if k not in ('bow', 'nock', 'draw', 'arrow', 'xbow')} | {'axe': held}
    elif layer.extras and 'axe' in gear:   # a bow let fall as any weapon is, its grip at the fist
        lying = anim == 'fallen' or frame >= poses.DEATH_DROP
        gear = {k: v for k, v in gear.items() if k != 'axe'} | {'bow': bow_fallen(gear['axe'], lying)}
    if layer.prop:   # a prop is held in the weapon's place, laid where its pose sets it out (people.py)
        gear = {**gear, 'axe': gear.get('props', {}).get(layer.prop)}
    for ob in layer.obs:
        ob.hide_render = False
    if isinstance(layer.fighter, Dressed):   # a frame poses the layer's own skins and the body under them alone
        # its body by its own name: a run of several armour sets builds a body a set, `body.001` past the first
        layer.fighter.active = ({ob.name for ob in layer.obs} | {layer.fighter.skins[0].ob.name}
                                | {n for d in layer.drapes for n in getattr(d, 'needs', ())})
    hung = CLOTH.row(layer, anim, view, per) if layer.drapes else None   # its cloth kept from a run before
    if hung is not None and frame == 0:
        print(f'  {layer.name} {anim} view {view}: its cloth kept, not hung again', flush=True)
    if hung is None:
        swing(layer, anim, view, per)   # a cloak carried through the whole animation in this view first
    layer.fighter.place(p, gear)   # its hands' fists, its weapon shown or not, the bow's string made
    moved = None
    if layer.name in SHEATH_LAYERS:   # a hip's on the floor under a fallen body, plumb in the body's moves; its depth too
        m = sheaths.laid(layer.name, anim, [ob for ob in layer.obs], p.world())
        moved = {ob.name: np.array(m) for ob in layer.obs} if m is not None else None
    if layer.drapes and hung is not None:   # hung as it hung before
        for d, verts in zip(layer.drapes, hung[frame]):
            d.verts = verts
            d.me.vertices.foreach_set('co', verts.ravel())
            d.me.update()
    elif layer.drapes:   # its drapes hung again over the body as it stands, or over the armour's envelope
        over = layer.over or layer.fighter
        if layer.over is not None:
            over.place(p, gear)
            for d in layer.drapes:
                d.rigid = ('armour_',)
        for d in layer.drapes:
            d.frame, d.anim = frame, anim
            d.update(layer.fighter.W, over)
        drape.ride_clear(layer.drapes, over)   # astride, never in the horse
        CLOTH.record(layer, anim, view, frame)
    for ob in bpy.data.objects:
        if ob.type in ('MESH', 'CURVES') and not layer.shows(ob):   # the horse's strands are hair curves
            ob.hide_render = True
    for ob in layer.casters:
        ob.hide_render, ob.visible_camera = False, False
    held = getattr(layer, 'holdout', None)
    if held is not None:
        held.held_out(True)
    try:
        work = stage.render_rgba(tmp)
    finally:
        if held is not None:
            held.held_out(False)
    if layer.name == 'horse':   # what each pixel shows: the hide's texel, or the mane, the tack (forgeLayers.js)
        texels = riding.mount().texel_kinds(work, lambda: stage.render_rgba(tmp))
    for ob in layer.casters:
        ob.hide_render, ob.visible_camera = True, True
    v, t, c, pc = layer.cloud.mesh(p, gear, pieces=True, moved=moved)
    if layer.free:   # what the cloud does not hold, as it stands
        dg = bpy.context.evaluated_depsgraph_get()
        vs, ts, cs, ps = [v], [t], [c], [pc]
        base = len(v)
        for ob in layer.free:
            if ob.hide_render or ob.type != 'MESH':   # the strands: the cards under them hold the mane's depth
                continue
            co, tr, cl, _ = fit.triangles(ob.evaluated_get(dg).to_mesh(), layer.classify)
            M = np.array(ob.matrix_world)
            vs.append(co @ M[:3, :3].T + M[:3, 3])
            ts.append(tr + base)
            cs.append(cl)
            ps.append(np.full(len(tr), fit.HORSE_PIECE if layer.name in riding.LAYERS else fit.FREE_PIECE))
            base += len(co)
        v, t, c, pc = np.concatenate(vs), np.concatenate(ts), np.concatenate(cs), np.concatenate(ps)
    px, py, depth = fit.project(v, layer.cloud.scale)
    ids, zs = fit.rasterize(px, py, depth, t, c, stage.WORK_W, stage.WORK_H, with_depth=True)
    trim, ids = ids < 0, np.abs(ids)   # a weapon's hilt, guard and trim (`trim_classify`), and every texel's class
    part = fit.rasterize(px, py, depth, t, pc, stage.WORK_W, stage.WORK_H)   # the part of the body each pixel shows
    if forge.GRADE and not RAW['all']:
        work = forge.grade_frame(work, ids, names, view)
    if layer.dye == 'hair':   # its grey on its steps, each a share of the hair's light the game colours
        work = dyeable(work, ids, names, hair.materials_(), band=None if RAW['cloth'] else (hair.BAND, 0))
    elif layer.dye:   # its cloth (or metal) exactly grey, which the game dyes; every other colour of it not quite grey
        dyed = ('metal', 'mail', 'armourmail', 'bowmetal') if layer.dye == 'metal' else ('garb',)
        # a class graded in its set's own colours (armour.SET_GRADE `ramp`: elven gold, daedric black) is never laid
        # grey for the dye, however near grey it runs
        own = tuple(c for c in dyed if 'ramp' in (forge.GRADE.get(c) or {}))
        dyed = tuple(c for c in dyed if c not in own)
        work = dyeable(work, ids, names, dyed, banded=not RAW['cloth'])
        if own:   # and its lone glints taken out as the dyed metal's are
            work = despeck(work, ids, names, own)
    on = work[..., 3] > 0
    if not on.any():
        return None
    hole = on & np.isinf(zs)
    if hole.any() and layer.extras and getattr(layer.fighter, 'lines', None):   # the string, the arrow: their depth
        near, line_z = on_lines(hole, layer.fighter.lines, layer.cloud.scale)
        zs, part = np.where(near, line_z, zs), np.where(near, fit.WEAPON_PIECE, part)
        hole &= ~near
    if hole.any():   # an edge the render softens past the raster: the depth beside it
        from scipy import ndimage
        dist, (iy, ix) = ndimage.distance_transform_edt(np.isinf(zs), return_indices=True)
        # the horse's strands lie along its cards, unrastered: each takes the depth of the card nearest it, however far
        near = hole & (dist <= (np.inf if layer.name in riding.LAYERS else 3))
        zs, part = np.where(near, zs[iy, ix], zs), np.where(near, part[iy, ix], part)
        trim = np.where(near, trim[iy, ix], trim)   # and its trim, so a guard's rim is marked as the guard
    if trim.any():   # where a faction's colour lies on a faction's weapon
        work = stage.mark_trim(work, trim)
    part = np.where(on & np.isinf(zs), fit.WEAPON_PIECE, part)
    if layer.dye == 'hair':   # a part of its own: no order weighs between it and the head or the armour it lies on
        part = np.where(on, fit.HAIR_PIECE, part)
    zs = np.where(on & np.isinf(zs), DEPTH_BASE, zs)   # a string or an arrow the raster has not: drawn over all
    ys, xs = np.nonzero(on)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    cut = (slice(y0, y1), slice(x0, x1))
    if RAW['all']:   # each texel's material in the depth strip's blue, in place of its part: what a grade is measured on
        part = ids
    if layer.name == 'horse':
        TEXELS[(anim, frame, view)] = texels[cut]
    return work[cut], np.where(on, zs, np.inf)[cut], int(x0), int(y0), part[cut].astype(np.uint8)


# the horse's texel frames (horse.py `texel_kinds`) by animation, frame and view, as `render` cuts them
TEXELS = {}
# a mount look's depth is kept in steps of this many of the depth's units (6.4 mm): its pieces stand a centimetre and
# more off the hide, so the rider in front of or behind them is never mistaken, and the strip is near half the size
LOOK_DEPTH_STEP = 64


def coarse_depth(zimg):
    """A depth strip's depth rounded down to LOOK_DEPTH_STEP, its part and alpha as they are."""
    out = zimg.copy()
    d = (zimg[..., 0].astype(np.int64) * 256 + zimg[..., 1]) // LOOK_DEPTH_STEP * LOOK_DEPTH_STEP
    out[..., 0], out[..., 1] = d >> 8, d & 255
    return out


def write_palette(path, rgba):
    """A look's colour strip on a palette of 256 of its own colours, its alpha exact: the game snaps every composed
    frame to its palette anyway, and the strip is a quarter of the size."""
    from PIL import Image
    Image.fromarray(np.ascontiguousarray(rgba, dtype=np.uint8)).quantize(256, method=Image.FASTOCTREE).save(
        path, 'PNG', optimize=True)


def write_small(path, arr):
    """A strip written with PNG's row filters chosen row by row (the texel strip's smooth texels pack a third
    smaller so): RGB or RGBA as `arr` has it."""
    from PIL import Image
    Image.fromarray(np.ascontiguousarray(arr, dtype=np.uint8)).save(path, 'PNG', optimize=True)


def on_lines(hole, lines, scale, reach=1.5):
    """The pixels of `hole` (drawn, nothing rastered under them) within `reach` pixels of a line the fighter holds, and
    that line's depth there: its bowstring and its arrow, tubes thinner than a pixel the raster's centres miss. So a
    string behind the body is drawn behind it. (mask, depth), the depth inf off the lines."""
    ys, xs = np.nonzero(hole)
    cx, cy = xs + 0.5, ys + 0.5   # each pixel's centre, as fit.py `rasterize` reads it
    best, z = np.full(len(xs), np.inf), np.full(len(xs), np.inf)
    for pts in lines:
        px, py, d = fit.project(np.array(pts, dtype=np.float64), scale)
        for i in range(len(pts) - 1):
            vx, vy = px[i + 1] - px[i], py[i + 1] - py[i]
            span = vx * vx + vy * vy
            t = np.clip(((cx - px[i]) * vx + (cy - py[i]) * vy) / span, 0.0, 1.0) if span else np.zeros(len(xs))
            dist = np.hypot(cx - (px[i] + t * vx), cy - (py[i] + t * vy))
            closer = dist < best
            best, z = np.where(closer, dist, best), np.where(closer, d[i] + t * (d[i + 1] - d[i]), z)
    near = best <= reach
    mask, depth = np.zeros(hole.shape, bool), np.full(hole.shape, np.inf)
    mask[ys[near], xs[near]] = True
    depth[ys[near], xs[near]] = z[near]
    return mask, depth


def dyeable(work, ids, names, cls=('garb',), banded=True, band=None):
    """A garment's frame with its cloth (the `cls` materials, where unsaturated: 'garb', or an armour's 'metal' and
    'mail') laid exactly grey on its band's nearest step (`banded`, else at its own brightness; `band` its own steps
    and shadow, the hair's), and every other texel nudged off grey: the game dyes grey and only grey
    (forgeLayers.js)."""
    out = work.copy()
    rgb = work[..., :3].astype(np.int16)
    on = work[..., 3] > 0
    hi, lo = rgb.max(axis=2), rgb.min(axis=2)
    cloth = on & np.isin(ids, [names.index(c) + 1 for c in cls if c in names]) & ((hi - lo) <= np.maximum(hi * 0.14, 6))
    lum = np.round(rgb.mean(axis=2)).astype(np.uint8)
    out[cloth, 0] = out[cloth, 1] = out[cloth, 2] = lum[cloth]
    # a metal on the steel band, a garment's cloth on Daggerfall's clothing band, each with its shadow under the foot
    band = band or ((armour.STEEL_BAND, armour.METAL_SHADOW) if 'metal' in cls else
                    (clothes.CLOTH_BAND, clothes.CLOTH_SHADOW) if 'garb' in cls and banded else None)
    if RAW['all']:   # measured in its own light: no step of a band
        band = None
    if band:
        from scipy import ndimage
        # a lone texel brighter (or darker) than all eight round it takes their nearest light: a rim's glint or a
        # seam finer than a pixel reads as a sparkle, never as an edge
        ring = np.ones((3, 3), bool)
        ring[1, 1] = False
        g = np.where(cloth, lum.astype(np.int16), -1)
        hi_n = ndimage.maximum_filter(g, footprint=ring, mode='constant', cval=-1)
        lo_n = -ndimage.maximum_filter(np.where(cloth, -lum.astype(np.int16), -999), footprint=ring, mode='constant',
                                       cval=-999)
        whole = ndimage.minimum_filter(cloth.astype(np.uint8), size=3, mode='constant') > 0   # metal all round
        lum = np.where(whole & (g > hi_n + armour.SPECK), hi_n, np.where(whole & (g < lo_n - armour.SPECK), lo_n, lum))
        lum = lum.astype(np.uint8)
        # each texel onto its nearest step of the band, grey at that step for the dye; darker than the band's foot,
        # shadow in the palette's blacks at its own light (a speck stays on the band's foot, where a black dot on a
        # bright ramp is noise; so does a metal's hairline, where cloth's crease folds into black as Daggerfall's do)
        steps, shadow = np.asarray(band[0], float), band[1]
        step = np.abs(lum[..., None].astype(float) - steps).argmin(axis=-1)
        g = (step * 16 + 8).astype(np.uint8)
        out[cloth, 0] = out[cloth, 1] = out[cloth, 2] = g[cloth]
        dark = cloth & (lum < shadow)
        if 'garb' in cls:
            parts, _ = ndimage.label(dark, np.ones((3, 3), bool))
            deep = dark & (np.bincount(parts.ravel())[parts] >= clothes.CREASE)
        else:
            deep = ndimage.binary_opening(dark, np.ones((2, 2), bool))
        out[deep, 0] = out[deep, 1] = lum[deep]
        out[deep, 2] = np.minimum(lum[deep].astype(np.int16) + 2, 255).astype(np.uint8)   # never quite grey: undyed
    other = on & ~cloth
    px = out[other, :3].astype(np.int16)
    grey = (px[:, 0] == px[:, 1]) & (px[:, 1] == px[:, 2])
    px[grey, 0] = np.where(px[grey, 0] < 255, px[grey, 0] + 1, 254)
    out[other, :3] = px.astype(np.uint8)
    return out


def despeck(work, ids, names, cls):
    """A metal graded in its own colours (`cls`) with each texel brighter or darker than all eight round it, and metal
    all round, taking their middle colour: a glint finer than a pixel reads as a sparkle, never as an edge."""
    from scipy import ndimage
    out = work.copy()
    on = (work[..., 3] > 0) & np.isin(ids, [names.index(c) + 1 for c in cls if c in names])
    if not on.any():
        return out
    lum = work[..., :3].astype(np.int16).mean(axis=2)
    ring = np.ones((3, 3), bool)
    ring[1, 1] = False
    g = np.where(on, lum, -1.0)
    hi_n = ndimage.maximum_filter(g, footprint=ring, mode='constant', cval=-1)
    lo_n = -ndimage.maximum_filter(np.where(on, -lum, -999.0), footprint=ring, mode='constant', cval=-999)
    whole = ndimage.minimum_filter(on.astype(np.uint8), size=3, mode='constant') > 0
    speck = whole & ((g > hi_n + armour.SPECK) | (g < lo_n - armour.SPECK))
    for c in range(3):
        mid = ndimage.median_filter(work[..., c], footprint=ring, mode='nearest')
        out[speck, c] = mid[speck]
    return out


def strip(frames, cell, root):
    """Each view's frames, laid a row a view, a cell a frame: the colour (RGBA) and the depth (16 bits in R and G,
    the part of the body in B (fit.py `PIECE_OF`, which the clipping check reads and the game does not), alpha where
    the layer draws)."""
    cw, ch = cell
    rx, ry = stage.ROOT_PX
    cols = max(len(r) for r in frames)
    rgba = np.zeros((ch * len(frames), cw * cols, 4), np.uint8)
    zimg = np.zeros_like(rgba)
    for v, row in enumerate(frames):
        for f, got in enumerate(row):
            if got is None:
                continue
            work, zs, x0, y0, part = got
            cx, cy = x0 - (rx - root[0]), y0 - (ry - root[1])   # the box's corner in the cell
            h, w = work.shape[:2]
            sx0, sy0 = max(0, -cx), max(0, -cy)
            sx1, sy1 = min(w, cw - cx), min(h, ch - cy)
            if sx1 <= sx0 or sy1 <= sy0:
                continue
            at = (slice(v * ch + cy + sy0, v * ch + cy + sy1), slice(f * cw + cx + sx0, f * cw + cx + sx1))
            cut, zcut = work[sy0:sy1, sx0:sx1], zs[sy0:sy1, sx0:sx1]
            mine = cut[..., 3] > 0
            d = np.where(mine, np.clip(np.round((zcut - DEPTH_BASE) * DEPTH_SCALE), 0, 65535), 0).astype(np.uint32)
            rgba[at] = np.where(mine[..., None], cut, rgba[at])
            z = zimg[at]
            z[..., 0] = np.where(mine, d >> 8, z[..., 0])
            z[..., 1] = np.where(mine, d & 255, z[..., 1])
            z[..., 2] = np.where(mine, part[sy0:sy1, sx0:sx1], z[..., 2])
            z[..., 3] = np.where(mine, 255, z[..., 3])
    return rgba, zimg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--body', required=True, choices=tuple(BODIES))
    ap.add_argument('--out', required=True)
    ap.add_argument('--anims', default='')
    ap.add_argument('--layers', default='')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--set', default='classic', choices=('classic', 'wardrobe', 'armour', 'beast', 'hair'),
                    help="the classic outfits' gear, the wardrobe's garments, the armour sets, the beast races or hair")
    ap.add_argument('--materials', default='', help='the armour sets (--set armour), all by default')
    ap.add_argument('--views', default='',
                    help='only these views (0 the front .. 4 the back); the others are kept from the strips as they stand')
    ap.add_argument('--raw', action='store_true',
                    help="every layer in its render's own light, ungraded and off any band, each texel's material in its"
                         " depth strip's blue, and the index left alone: what skingrade.py and modulegrade.py measure")
    ap.add_argument('--ungraded', action='store_true',
                    help="the wardrobe's cloth or the hair in its own light, as its grade (clothes.py "
                         "CLOTH_GRADE, hair.py GRADE) is measured")
    ap.add_argument('--plan', default='',
                    help='the strips stale against their keys written to this JSON (each with its frames), none drawn')
    ap.add_argument('--force', action='store_true', help='every strip drawn again, its key or not')
    ap.add_argument('--rekey', action='store_true',
                    help="each strip the index lists and the folder holds keyed as this code would draw it, none drawn")
    ap.add_argument('--index', action='store_true',
                    help="the body's class looks written to the index (class-looks.json changed), nothing rendered")
    args = ap.parse_args()
    RAW['all'] = args.raw
    body_name = args.body   # the body drawn: a child is built from its grown body (`base`), drawn at a child's make
    args.body = BODIES[body_name].get('base', body_name)
    if args.index:
        index = json.load(open(LOOKS)) if os.path.exists(LOOKS) else {}
        write_index(index, body_name, [])   # nothing laid over: the looks made under the lock from the index as it is
        print(f'{body_name}: the class looks -> {LOOKS}')
        return
    spec, per = load_body(args.body)
    PER.update(per)
    if body_name != args.body:
        for k, f in CHILD.items():
            shape.SHAPE[k] = shape.SHAPE.get(k, 1.0) * f
    poses.CARRY[0] = True   # the forge's own carry in the walk and the idle (poses.py)
    stage.PX_PER_M *= shape.SHAPE['scale']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(args.samples)
    stage.resize(*WORK)
    probe = forge.Fighter('naked', args.body, 'axe')   # the grade's material map: every palette name
    # the wardrobe's cloth, the armour's metal and a bow's, which the game dyes; a helmed face's paint, in its own colours;
    # the brotherhood's crimson leather, graded on its own
    names = sorted({*probe.M, *props3p.materials_(), 'garb', 'accent', 'metal', 'armourmail', 'bowmetal', 'paint',
                    'spark', 'staffwood', torch3p.MATERIAL,
                    'staffknob', 'crimson', *playing.materials(), *beastfolk.materials_(), *hair.materials_(),
                    *riding.horse.MATERIAL_OF.values()})
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            bpy.data.objects.remove(ob, do_unlink=True)
    ids_of = {n: i + 1 for i, n in enumerate(names)}
    classify = lambda m: ids_of.get(m.name.split('.')[0], 0) if m else 0   # noqa: E731
    want_layers = {n for n in args.layers.split(',') if n}
    if args.set == 'wardrobe':
        layers = wardrobe_layers(args.body, classify, want_layers)
        RAW['cloth'] = args.ungraded
        if not args.ungraded:
            forge.GRADE.setdefault('garb', clothes.CLOTH_GRADE)     # its cloth onto Daggerfall's, shadow and all
            forge.GRADE.setdefault('accent', clothes.CLOTH_GRADE)   # an accent's light as the cloth's, in its own hue
            forge.GRADE.setdefault('leather', armour.LEATHER_GRADE)   # its belts, shoes and boots as the armour's
    elif args.set == 'armour':
        layers = armour_layers(args.body, classify, [m for m in args.materials.split(',') if m] or None)
        forge.GRADE.setdefault('leather', armour.LEATHER_GRADE)   # the armour's own leather, not the outfits'
        forge.GRADE.setdefault('armourmail', armour.MAIL_GRADE)   # its mail on either body, not the outfit's own
    elif args.set == 'beast':
        layers = beastfolk.beast_layers(args.body, classify)
        forge.GRADE.update(beastfolk.grades(args.body))   # each hide onto its race's own colours
    elif args.set == 'hair':
        layers = hair.hair_layers(args.body, classify, want_layers)
        RAW['cloth'] = args.ungraded
        if not args.ungraded:
            forge.GRADE[hair.MATERIAL] = hair.GRADE   # its light evenly on its steps
    else:
        layers = build_layers(args.body, classify, want_layers)
        forge.GRADE.setdefault('leather', armour.LEATHER_GRADE)   # a worn weapon's sheath, as the armour's leather
        if os.path.exists(riding.HORSE_GRADE):   # the horse's coat and mane onto Daggerfall's town horse
            forge.GRADE.update(json.load(open(riding.HORSE_GRADE)))
    # the one-handed animations (onehand.py) and the guns' (gunplay.py) only when named: a run of every animation
    # draws them for no layer yet; and what is drawn for outside the game (agility.py `ELSEWHERE`)
    want_anims = (args.anims.split(',') if args.anims else
                  [a for a in ANIMS if onthemove.act_of(a) not in onehand.ONEHAND
                   and onthemove.act_of(a) not in gunplay.GUNPLAY and a not in agility.ELSEWHERE])
    if body_name in CHILDREN and not args.anims:   # a child draws only the poses the placed children take
        want_anims = [a for a in ANIMS if a in PEOPLE_WORN.get(body_name, {}).get('anims', ())]
    out = os.path.join(args.out, body_name)
    os.makedirs(out, exist_ok=True)
    tmp = os.path.join(tempfile.mkdtemp(), 'l.png')
    index = json.load(open(LOOKS)) if os.path.exists(LOOKS) else {}
    cells = index.setdefault('bodies', {}).setdefault(body_name, {}).setdefault('anims', {})
    drawn = index['bodies'][body_name].setdefault('layers', {})
    # each strip's key (rendercache.py): one whose key is unchanged is kept as it stands, never drawn again
    keys = Keys(per, names)
    keys.made_all([ly for ly in layers if not want_layers or ly.name in want_layers])
    CLOTH.keys = keys
    studio = os.path.abspath(args.out) == os.path.join(ROOT, 'public', 'art', 'studio', 'forge', 'layers')
    keys_at = os.environ.get('FORGE_KEYS') or (os.path.join(HERE, 'keys') if studio else args.out)
    global FITTED
    if not studio and not os.environ.get('FORGE_FITTED'):   # a trial's fitted lists beside its keys, never the studio's
        FITTED = os.path.join(args.out, 'fitted')
    manifest = rendercache.Manifest(keys_at, body_name)
    plan, drew = [], []
    fitted = {}   # the layers drawn this run, by animation (`fitted_mark`)
    for anim in want_anims:
        stage.resize(*WORK, below=BELOW.get(anim, 12))
        mine = [ly for ly in layers if (ly.name not in (*WEAPONS, *BOW_LAYERS, *STAFF_LAYERS, *CROSSBOW_LAYERS,
                                                        *HELD, *INSTRUMENT_LAYERS, *OFFHAND_LAYERS, *PROP_LAYERS,
                                                        *GUN_LAYERS,
                                                        *SHEATH_LAYERS, *riding.LAYERS, 'spark')
                                        or anim in weapon_anims(ly.name))
                and (not want_layers or ly.name in want_layers)
                # a placed person's pose: the body and what the people wear, hold and set out in it alone
                and ((anim not in people.PEOPLE and body_name not in CHILDREN) or ly.name == 'body'
                     or anim in PEOPLE_WORN.get(body_name, {}).get('layers', {}).get(ly.name, ()))]
        own_cells = index['bodies'][body_name].get('cells', {})
        stale, kept = [], []
        for ly in mine:
            at = own_cells.get(ly.name, {}).get(anim) or cells.get(anim)
            files = [os.path.join(out, f'{ly.name}_{anim}{z}.png') for z in ('', '_z')]
            fresh = (not args.force and anim in drawn.get(ly.name, ()) and at is not None
                     and manifest.fresh(f'{ly.name}_{anim}', keys.strip(ly, anim), [at['cell'], at['root']], files))
            (kept if fresh else stale).append(ly)
        if args.rekey:   # the strips as they stand, keyed by this code: a strip drawn by it keeps its key
            for ly in mine:
                at = own_cells.get(ly.name, {}).get(anim) or cells.get(anim)
                files = [os.path.join(out, f'{ly.name}_{anim}{z}.png') for z in ('', '_z')]
                if anim in drawn.get(ly.name, ()) and at is not None and all(os.path.exists(f) for f in files):
                    manifest.put(f'{ly.name}_{anim}', keys.strip(ly, anim), [at['cell'], at['root']])
            continue
        if args.plan:
            plan += [{'layer': ly.name, 'anim': anim, 'frames': 5 * ANIMS[anim], 'cloth': bool(ly.drapes)}
                     for ly in stale]
            continue
        if not stale:
            print(f'{body_name} {anim}: all {len(kept)} layers kept, their keys unchanged', flush=True)
            continue
        mine = stale
        views = {int(v) for v in args.views.split(',') if v} or set(range(5))
        works = {ly.name: [[set_graded(ly, anim, f, v, per, tmp, names) for f in range(ANIMS[anim])]
                           if v in views else kept_view(out, ly.name, anim, v, index['bodies'][body_name])
                           for v in range(5)] for ly in mine}
        boxes = [(x0, y0, x0 + w.shape[1], y0 + w.shape[0]) for rows in works.values() for row in rows
                 for got in row if got for w, _, x0, y0, _ in [got]]
        rx, ry = stage.ROOT_PX
        half = max(max(rx - b[0], b[2] - 1 - rx) for b in boxes) + 1
        top, low = min(b[1] for b in boxes), max(b[3] for b in boxes) - 1
        cell, root = [2 * half + 1, low - top + 1], [half, ry - top]   # the body's spot on the middle column
        if (want_layers or args.set != 'classic' or kept) and anim in cells:   # a layer drawn later, or beside strips
            cell, root = cells[anim]['cell'], cells[anim]['root']             # kept, keeps its animation's cell
        cells[anim] = {'frames': ANIMS[anim], 'cell': cell, 'root': root}
        own = beastfolk.own_cells(works, cell, root) if args.set == 'beast' else {}
        # any layer drawn past the animation's cell has a cell of its own, round it, so nothing of it is cut: a staff's
        # head over the body's, a warhammer's carried out past the class weapons, a helm's crest or a hood over the
        # head the classic layers set
        grown = beastfolk.own_cells(works, cell, root)
        own.update({n: got for n, got in grown.items() if list(got) != [cell, root]})
        for name, rows in works.items():
            rgba, zimg = strip(rows, *own.get(name, (cell, root)))
            mine_cells = index['bodies'][body_name].setdefault('cells', {})
            if name in own:   # drawn past the animation's cell: a cell of its own, round it (forgeLayers.js `layerCellOf`)
                mine_cells.setdefault(name, {})[anim] = {'frames': ANIMS[anim], 'cell': own[name][0],
                                                         'root': own[name][1]}
            elif anim in mine_cells.get(name, {}):   # within it now: its strip is in the animation's cell
                del mine_cells[name][anim]
                if not mine_cells[name]:
                    del mine_cells[name]
            if name in riding.LOOK_LAYERS:   # a look's colours on a palette of its own, its depth in coarse steps
                write_palette(os.path.join(out, f'{name}_{anim}.png'), rgba)
                write_small(os.path.join(out, f'{name}_{anim}_z.png'), coarse_depth(zimg))
            else:
                stage.write_png(os.path.join(out, f'{name}_{anim}.png'), rgba)
                stage.write_png(os.path.join(out, f'{name}_{anim}_z.png'), zimg)
            if name == 'horse':   # its texel strip, laid as its colour is (forgeLayers.js `HORSE_TEXELS`)
                tex_rows = [[None if got is None or (anim, f, v) not in TEXELS else (TEXELS[(anim, f, v)], *got[1:]) for f, got in enumerate(row)]
                            for v, row in enumerate(rows)]
                write_small(os.path.join(out, f'{name}_{anim}_t.png'), strip(tex_rows, *own.get(name, (cell, root)))[0][..., :3])
            drew.append((name, anim))
            laid = own.get(name, (cell, root))
            if views == set(range(5)):   # drawn in some views alone, it keeps its old key: a plan draws it whole later
                manifest.put(f'{name}_{anim}', keys.strip(next(ly for ly in mine if ly.name == name), anim),
                             [list(laid[0]), list(laid[1])])
            drawn.setdefault(name, [])
            if anim not in drawn[name]:
                drawn[name].append(anim)
            ly = next(ly for ly in mine if ly.name == name)
            if ly.order:   # drawn nearer than it lies by this much where layers meet (forgeLayers.js)
                index.setdefault('order', {})[name] = ly.order
            if ly.cover:   # and over what is worn under it on the torso, by this much
                index.setdefault('cover', {})[name] = ly.cover
            if ly.under:   # and under a drape this far behind it (a worn weapon under a cloak)
                index.setdefault('under', {})[name] = ly.under
            # its grey is cloth, which a look dyes; an armour's is metal, dyed on a metal's ramp; hair's, its own
            if ly.dye:
                for key in ('dye', 'metal') if ly.dye == 'metal' else () if ly.dye == 'hair' else ('dye',):
                    index.setdefault(key, [])
                    if name not in index[key]:
                        index[key].append(name)
        fitted[anim] = (fitted_mark(out, anim), [n for n in works if not n.startswith('body')], list(works))
        print(f'{body_name} {anim}: {len(works)} layers drawn, {len(kept)} kept, cell {cell}, root {root}', flush=True)
        manifest.write()
        if not RAW['all']:   # listed and fitted with its keys, so a run stopped past here leaves nothing half kept
            index['depth'] = {'base': DEPTH_BASE, 'scale': DEPTH_SCALE}
            write_index(index, body_name, [d for d in drew if d[1] == anim])
            write_fitted({anim: fitted[anim]}, body_name)
    if args.rekey:
        manifest.write()
        print(f'{body_name}: {len(getattr(manifest, "mine", ()))} strips keyed again -> {manifest.path}')
        return
    if args.plan:
        json.dump({'body': body_name, 'set': args.set, 'materials': args.materials, 'strips': plan},
                  open(args.plan, 'w'), indent=1)
        print(f'{body_name}: {len(plan)} strips stale, {sum(p["frames"] for p in plan)} frames -> {args.plan}')
        return
    index['depth'] = {'base': DEPTH_BASE, 'scale': DEPTH_SCALE}
    looks = index.setdefault('looks', {})
    looks.update(class_looks(body_name, drawn))
    for d in index['bodies'].values():
        for n in d['layers']:
            d['layers'][n] = [a for a in ANIMS if a in d['layers'][n]]
    if RAW['all']:   # the materials a raw run's depth strips name, by number (`render`), and nothing written to the index
        with open(os.path.join(out, '_materials.json'), 'w') as f:
            json.dump(names, f)
        print(f'{body_name}: raw, the index left as it stands')
        return
    write_index(index, body_name, drew if (want_layers or args.anims) else None)
    write_fitted(fitted, body_name)
    print(f'{body_name}: the index -> {LOOKS}')


def class_looks(body, drawn):
    """Each class archive's look on `body`: its outfit, its weapon, its records, each playing its animation (a record
    shorter or longer than its animation, the guard's attack or a woman mage's spell, plays the frames its keys name;
    one with none plays the animation's, its last again where the record runs past it), and its own moves: the strokes
    (blows.py `blow_records`), and the run last once it is drawn whole. A layer of its outfit not yet drawn in every
    move the look plays (`drawn`, the body's layers by animation; a blow not counted, its records standing in until
    drawn) is left off until it is, so the game never falls back to Daggerfall's own sprite for want of a strip."""
    out = {}
    for archive, (b, gear, weapon, dyes, race) in LOOKS_OF.items():
        if b != body:
            continue
        records = []
        for r in class_records(archive):
            anim = anim_of(r['anim'], weapon)
            keys = r.get('keys') or [min(i, ANIMS[anim] - 1) for i in range(r['frames'])]
            records.append({'anim': anim, 'view': r['view'], 'frames': r['frames'], 'canvas': r['canvas'],
                            'place': r['place'], **({'keys': keys} if r['frames'] != ANIMS[anim] else {})})
        anims = {r['anim'] for r in records} | set(poses.OWN)
        worn = [g for g in gear if anims <= set(drawn.get(g, ()))]
        dyes = {k: v for k, v in dyes.items() if k in worn}
        own = [{'anim': a, 'view': v, 'frames': n} for a, n in poses.OWN.items() for v in range(5)]
        # the strokes (blows.py): its weapon's hold's where the body, all it wears and its weapon are drawn in them
        stacked = lambda a: all(a in drawn.get(layer, ()) for layer in ('body', *worn, *([weapon] if weapon else [])))  # noqa: E731
        own += blows.blow_records(blows.CLASS_HOLD.get(weapon), stacked)
        # a pursuing foe runs (foeOwnMoves.js): the run last, so every other record keeps its place, and only where
        # the body, all it wears and its weapon are drawn in it
        if stacked('run'):
            own += [{'anim': 'run', 'view': v, 'frames': agility.MOVES['run']} for v in range(5)]
        out[str(archive)] = {
            'body': b, 'gear': worn + (['spark'] if weapon == 'staff' else []), 'weapon': weapon,
            **({'race': race} if race else {}), **({'dyes': dyes} if dyes else {}), 'records': records, 'own': own}
    return out


def kept_view(out, name, anim, view, drawn):
    """View `view` of a layer's strip as it stands in `out`, each frame as `render` gives it (colour, depth, the box's
    corner on the work frame, parts), placed by the strip's own cell and root: a run of a few views keeps the rest."""
    from PIL import Image
    cell = drawn.get('cells', {}).get(name, {}).get(anim) or drawn['anims'][anim]
    (cw, ch), (rx0, ry0) = cell['cell'], cell['root']
    rgba = np.asarray(Image.open(os.path.join(out, f'{name}_{anim}.png')).convert('RGBA'))
    zimg = np.asarray(Image.open(os.path.join(out, f'{name}_{anim}_z.png')).convert('RGBA')).astype(np.int64)
    rx, ry = stage.ROOT_PX
    row = []
    for f in range(ANIMS[anim]):
        at = (slice(view * ch, (view + 1) * ch), slice(f * cw, (f + 1) * cw))
        work, z = rgba[at], zimg[at]
        on = work[..., 3] > 0
        if not on.any():
            row.append(None)
            continue
        ys, xs = np.nonzero(on)
        cut = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
        zs = np.where(on, (z[..., 0] * 256 + z[..., 1]) / DEPTH_SCALE + DEPTH_BASE, np.inf)
        row.append((work[cut].copy(), zs[cut], int(rx - rx0 + xs.min()), int(ry - ry0 + ys.min()),
                    z[..., 2][cut].astype(np.uint8)))
    return row


def fitted_mark(out, anim):
    """The bare body's strips in `anim` as they stand in `out` (colour and depth), a short hash of their bytes: the
    body a layer drawn now is drawn to fit. None where the body has no strip there."""
    h = hashlib.sha256()
    for depth in ('', '_z'):
        path = os.path.join(out, f'body_{anim}{depth}.png')
        if not os.path.exists(path):
            return None
        with open(path, 'rb') as f:
            h.update(f.read())
    return h.hexdigest()[:12]


def write_fitted(fitted, body):
    """Each layer drawn this run listed under the body it was drawn to fit, in `FITTED/<body>.json`: by animation, the
    body's mark and the layers drawn to fit it. A layer leaves the mark it was listed under before."""
    os.makedirs(FITTED, exist_ok=True)
    path = os.path.join(FITTED, f'{body}.json')
    with open(LOOKS + '.lock', 'w') as lock:   # the index's lock: a run on the other body writes its own list
        rendercache.exclusive(lock)
        now = json.load(open(path)) if os.path.exists(path) else {}
        for anim, (mark, names, _) in fitted.items():
            if mark is None:
                continue
            marks = now.setdefault(anim, {})
            for m in list(marks):
                marks[m] = [n for n in marks[m] if n not in names]
                if not marks[m]:
                    del marks[m]
            marks[mark] = sorted(set(marks.get(mark, [])) | set(names))
        tmp = path + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(now, f, indent=1, sort_keys=True)
            f.write('\n')
        os.replace(tmp, path)


def write_index(index, body, drew=None):
    """The index written with this run's laid over the index as it stands now, under a lock, so a run at the same time
    (the other body's, or another shard's of this body) keeps its own. `drew`, the (layer, animation) strips this run
    drew: only those, and the animations' cells it set, are laid over the body's; with none, every strip the run lists.
    The body's class looks are made under the lock from the strips the index then lists; the order and dye with them."""
    with open(LOOKS + '.lock', 'w') as lock:
        rendercache.exclusive(lock)
        now = json.load(open(LOOKS)) if os.path.exists(LOOKS) else {}
        mine = index['bodies'][body]
        if drew is None:   # a whole run: every strip it lists, laid over as a named run's are, so another's are kept
            drew = [(name, anim) for name, anims in mine.get('layers', {}).items() for anim in anims]
        if body not in now.get('bodies', {}):
            now.setdefault('bodies', {})[body] = mine
        else:
            cur = now['bodies'][body]
            for anim in {a for _, a in drew}:
                cur.setdefault('anims', {})[anim] = mine['anims'][anim]
            for name, anim in drew:
                got = cur.setdefault('layers', {}).setdefault(name, [])
                if anim not in got:
                    got.append(anim)
                cur['layers'][name] = [a for a in ANIMS if a in got]
                own = mine.get('cells', {}).get(name, {}).get(anim)
                cells = cur.setdefault('cells', {})
                if own:
                    cells.setdefault(name, {})[anim] = own
                elif anim in cells.get(name, {}):
                    del cells[name][anim]
                    if not cells[name]:
                        del cells[name]
            if not cur.get('cells'):
                cur.pop('cells', None)
        now['depth'] = index['depth']
        # its class looks made from the strips as the index lists them now, never from this run's first reading of it
        now.setdefault('looks', {}).update(class_looks(body, now['bodies'][body].get('layers', {})))
        for key in ('order', 'cover', 'under'):
            if index.get(key):
                now.setdefault(key, {}).update(index[key])
        for key in ('dye', 'metal'):
            if index.get(key):
                now[key] = sorted(set(now.get(key, [])) | set(index[key]))
        tmp = LOOKS + '.tmp'
        with open(tmp, 'w') as f:
            json.dump(now, f, indent=1, sort_keys=True)
            f.write('\n')
        os.replace(tmp, LOOKS)


if __name__ == '__main__':
    main()
