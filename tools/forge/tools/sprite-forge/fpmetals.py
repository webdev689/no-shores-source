"""A weapon's first-person frames for each metal: the first-person forge's own render of its archive, its fitted poses,
lights and grade, with each metal's weapon in the hand - the sword's (its hilt, metals.py, and its blade, blades.py,
in the fist: fpsword.py, WEAPON04.CIF), the battleaxe's (axes.py, WEAPON08.CIF), the flail's (flails.py, WEAPON06.CIF), the mace's (maces.py, WEAPON05.CIF) or the
staff's (staffs.py, WEAPON01.CIF).

    python -I tools/sprite-forge/fpmetals.py --out public/art/studio/forge/WEAPON04 [--metals Iron,Daedric]
    python -I tools/sprite-forge/fpmetals.py --weapon battleaxe --out public/art/studio/forge/WEAPON08
    python -I tools/sprite-forge/fpmetals.py --weapon flail --out public/art/studio/forge/WEAPON06
    python -I tools/sprite-forge/fpmetals.py --weapon mace --out public/art/studio/forge/WEAPON05
    python -I tools/sprite-forge/fpmetals.py --weapon staff --out public/art/studio/forge/WEAPON01

Writes `<FILE>.CIF_<record>-<frame>_<Metal>.png` beside the forge's metal-less frames, which stay the steel's. The
metal is still rendered grey and the game still dyes it: a metal's frames give it its own shape, its dye its colour. A
daedric weapon's veins glow in a colour of their own, which no dye touches. A sword's hilt keeps its metal's own colours;
its hand in each armour set is fplayers.py's."""
import argparse
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import axes  # noqa: E402
import blades  # noqa: E402
import flails  # noqa: E402
import fpforge  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402
import fpwear  # noqa: E402
import maces  # noqa: E402

SPECS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
SPEC = {'sword': os.path.join(SPECS, 'WEAPON04.json'), 'battleaxe': os.path.join(SPECS, 'WEAPON08.json'),
        'flail': os.path.join(SPECS, 'WEAPON06.json'), 'mace': os.path.join(SPECS, 'WEAPON05.json'),
        'staff': os.path.join(SPECS, 'WEAPON01.json')}
LASH = (0.3, 0.19, 0.1)   # an orcish staff's rawhide lashings
GROOVE = 0.16   # a fuller's darker metal (blades.py `groove`): its grey, the blade's 0.57, so it reads facing the lamp
# a metal's own way in a weapon's records: a record's own light, and its grey graded under a top (`cap`: silver's dye turns the top grey a pale yellow, which would flatten
# a lit face) or over a floor (`lift`: mithril's dye is blue only over its top half, so its blade is lifted onto the
# blues, as its armour's plate is). Or its own colours by brightness (`colours`, a ramp or an armour ramp's name, met
# at `at`): never grey, so Daggerfall's dye never touches it; a lamp-lit blade spans less than a plate under the sun
GOLD_AT = [28.0, 55.0, 80.0, 104.0, 126.0, 146.0, 164.0, 180.0, 194.0, 206.0, 214.0, 220.0]
BRASS_AT = [30.0, 56.0, 84.0, 112.0, 140.0, 166.0, 192.0, 220.0]
# dwarven brass, olive and dull, onto the palette's own (ART_PAL.COL 191, 159, 77, 76, 75, 31, 28, 23): its clipped
# brightest a dull brass, not a pale glint, as the long blade's grade clips a fifth of its texels to its top
DWARVEN_BRASS = [[35, 23, 11], [58, 51, 25], [69, 63, 42], [83, 71, 44], [96, 76, 51], [112, 94, 72],
                 [132, 114, 82], [164, 141, 94]]
# adamantium's armour steel (armour.py ADAMANTIUM_STEEL), its 19 steps met evenly from black to a pale steel at the
# blade's clipped top, the palest two above it, so a fifth of the blade at its top is lit steel, not white
ADAMANTIUM_AT = [30.0 + 11.875 * i for i in range(19)]
# daedric's armour black (armour.py DAEDRIC_BLACK) met from black at the flats to its dull warm grey at the lit bevels,
# its seam (`glow`) the armour's dull deep red, not the other daedric weapons' orange
DAEDRIC_AT = [30.0, 60.0, 90.0, 120.0, 150.0, 175.0, 195.0, 210.0, 222.0]
DAEDRIC_SEAM = (0.42, 0.025, 0.015)
# a haft's brightest wood (`haft_top`): Daggerfall's grade lifts the lamp's brightest haft to a yellow glare, which a
# haft filling the screen by the eye turns into one orange bar; capped, its lit wood stays a brown, and that frame
# (the strike down's first) is lit lower, so its haft shades along its length instead of sitting at the cap
HAFT_TOP = (150.0, 92.0, 45.0)
OWN = {'sword': {'Silver': {'cap': 197},
                 'Elven': {'colours': 'ELVEN_GOLD', 'at': GOLD_AT},
                 'Dwarven': {'colours': DWARVEN_BRASS, 'at': BRASS_AT},
                 'Mithril': {'lift': 99},
                 'Adamantium': {'colours': 'ADAMANTIUM_STEEL', 'at': ADAMANTIUM_AT},
                 'Daedric': {'colours': 'DAEDRIC_BLACK', 'at': DAEDRIC_AT, 'glow': DAEDRIC_SEAM}},
       'battleaxe': {}}
# Daggerfall's axe grade holds most of the head at the band's floor, where the long blade's spreads it: on the blade's
# ramp positions a gold, brass or steel axe would be dark brown or black. So the axe meets the same colours higher:
# the floor on a gold's middle, a brass's third and a steel's middle, the gold's top short of its cream
AXE_AT = {'Elven': [-24.0, 3.0, 30.0, 58.0, 85.0, 112.0, 139.0, 166.0, 193.0, 220.0, 247.0, 274.0],
          'Dwarven': [-26.0, 9.0, 44.0, 79.0, 114.0, 150.0, 185.0, 220.0],
          'Adamantium': [44.0 + (i - 9) * 176.0 / 9.0 for i in range(19)],
          'Daedric': [40.0, 70.0, 95.0, 118.0, 140.0, 160.0, 180.0, 200.0, 220.0]}
# ebony's and daedric's heads on a smooth ramp (`spread`, the grade's darkest and lightest): Daggerfall's axe grade
# lays the darker half of a head's light on one step, which a dark metal shows as one flat black
AXE_SPREAD = {'Ebony': (105.0, 228.0), 'Daedric': (75.0, 228.0)}
AXE_FLATS = 0.55   # the darker metal (flats, a channel, a dark stone) graded as the head at this share of its light
# ebony's and daedric's flats fill most of the head and their sheaths most of the haft: graded as the others' are, the
# axe reads black. So their flats are a worked dark metal (`AXE_GROOVE`) graded as the head's ramp at a larger share
# of its light, a dark grey inside the bright bevels, and their sheath's black is lifted so its work shows
AXE_FLATS_OF = {'Ebony': 0.65, 'Daedric': 0.65}
AXE_GROOVE = {'Ebony': 0.34, 'Daedric': 0.34}
AXE_GRIP_LIFT = {'Ebony': 2.5, 'Daedric': 1.6}
# each metal's axe in its sword's colours; a grip wrapped as its warhammer's is graded as that warhammer's grip
# (`grip`)
# daedric's axe in its armour black, stepped evenly from black to the armour's warm grey, so its head on the smooth
# ramp shades from black to a lit charcoal round its seam and its bevels and faces turned to the lamp show its shape
DAEDRIC_AXE = [[11, 10, 10], [19, 18, 18], [28, 26, 26], [38, 35, 34], [49, 44, 42], [60, 53, 49], [73, 64, 58],
               [90, 80, 72], [112, 100, 89]]
for _metal in axes.METALS:
    _own = dict(OWN['sword'].get(_metal, {}))
    if _metal == 'Daedric':
        _own['colours'] = DAEDRIC_AXE
    OWN['battleaxe'][_metal] = {**_own, 'haft_top': HAFT_TOP, 'light': {'1:0': {'exposure': 1.55}},
                                'flats': AXE_FLATS_OF.get(_metal, AXE_FLATS),
                                **({'at': AXE_AT[_metal]} if _metal in AXE_AT else {}),
                                **({'spread': AXE_SPREAD[_metal]} if _metal in AXE_SPREAD else {}),
                                **({'grip': True} if 'axe_grip' in axes.materials(_metal) else {})}
# the grades a metal's own colours are laid on: the sword's blade's and its groove's (graded as the blade at load,
# each frame's own over it: fpsword.py `GRADED_AS`, fpcolour.py --frames), the axe's head's
METAL = {'sword': ('sword_blade', 'sword_groove'), 'battleaxe': ('axehead',)}


THONG = ((0.3, 0.16, 0.07), (0.62, 0.38, 0.18))   # a wound haft's leather, its dark and its light
GLOW = (1.0, 0.42, 0.06)   # a daedric vein's light: past any lamp's, and never grey, so no dye touches it
# its strength before the exposure: the render's exposure lifts it with the rest, so the glow is set against each
# render's (a record's or a frame's own) and keeps one colour in every frame (4 under the long blade's of -0.414)
GLOW_STRENGTH = 4.0 * 2.0 ** -0.414
SET_LIGHTS = fpstage.set_lights   # the scene's lights, as fpstage sets them; a glow's run wraps it, then puts it back


def _glow(spill=True):
    """A vein's glow. With `spill` off it lights nothing round it, only the eye sees it glow: a mace's flanges stand
    close to its veins, and their light would mottle the flanges."""
    import bpy
    m = bpy.data.materials.new('glow')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*GLOW, 1)
    b.inputs['Emission Color'].default_value = (*GLOW, 1)
    strength = b.inputs['Emission Strength']
    if not spill:
        value = nt.nodes.new('ShaderNodeValue')
        eye = nt.nodes.new('ShaderNodeMath')
        eye.operation = 'MULTIPLY'
        nt.links.new(value.outputs[0], eye.inputs[0])
        nt.links.new(nt.nodes.new('ShaderNodeLightPath').outputs['Is Camera Ray'], eye.inputs[1])
        nt.links.new(eye.outputs[0], strength)
        strength = value.outputs[0]
    strength.default_value = GLOW_STRENGTH * 2.0 ** -fpstage.LIGHT.get('exposure', 0.0)

    def lit(light=None):   # each render's lights: the glow set against their exposure
        SET_LIGHTS(light)
        strength.default_value = GLOW_STRENGTH * 2.0 ** -(light or fpstage.LIGHT).get('exposure', 0.0)
    fpstage.set_lights = lit
    return m


def _groove():
    """A fuller's darker metal, flecked as the blade's metal is (fpmodel.py's `blade`)."""
    import materials
    return fpmodel._diffuse(materials.speckle('blade_groove', (GROOVE,) * 3, (GROOVE + 0.03,) * 3, scale=900.0, at=0.45,
                                              rough=0.9, metal=0.0))


def wield(metal, weapon='sword'):
    """Put `metal`'s weapon in the first-person forge's hand: its mesh and materials, its length and its girth. Gives
    back what to restore. A record drawn in a shape of its own wears the metal's look over that shape."""
    import fpsword
    base, palette = dict(fpmodel.WEAPONS[weapon]), fpmodel.palette
    own = {}   # the metal's own materials, each made over the palette's
    design = dict(fpsword.DESIGN)
    if weapon == 'sword':   # its hilt and blade the metal's, in the fist at the fitted steel sword's poses
        fpsword.DESIGN['metal'] = metal
        mats = fpsword.mats(metal)
        fpmodel.WEAPONS[weapon] = {**base, 'mats': mats}
    elif weapon == 'mace':
        look = lambda S: maces.shape(S, metal)   # noqa: E731
        mats = maces.materials(metal)
        fpmodel.WEAPONS[weapon] = {
            **base,
            'parts': {'mace': lambda S: maces.mace(look(S))},
            'mats': mats,
            'length': lambda S, part: maces.length(look(S)),
        }
    elif weapon == 'battleaxe':
        look = lambda S: axes.shape(S, metal)   # noqa: E731
        mats = axes.materials(metal)
        if 'haft_wrap' in mats:   # its thongs graded as the haft is, so they keep a leather a shade paler than it
            own['haft_wrap'] = lambda: axes.wood('haft_wrap', THONG[0], THONG[1], scale=(400.0, 400.0, 60.0))
            fpforge.GRADE_AS['haft_wrap'] = 'haft'
        own.update(_axe_own(metal, mats))
        fpmodel.WEAPONS[weapon] = {
            **base,
            'parts': {'axe': lambda S: axes.battleaxe(look(S))},
            'mats': mats,
            'length': lambda S, part: axes.length(look(S)),
        }
    else:   # the flail: its chain posed in the metal's look, its iron's pieces told apart by that look
        look = lambda S: flails.shape(S, metal)   # noqa: E731
        mats = flails.materials(metal)
        fpmodel.WEAPONS[weapon] = {
            **base,
            'parts': {'flail': lambda S: flails.flail(look(S))},
            'mats': mats,
            'length': lambda S, part: flails.length(look(S)),
            'posed_joints': lambda S, v, pose: flails.posed(look(S), v, pose),
        }
        own['flailiron'] = lambda: flails.iron('flailiron', look({**flails.FLAIL, **fpmodel.SHAPE}))
    if 'glow' in mats:
        own['glow'] = lambda: _glow(spill=weapon != 'mace')
    if own:
        fpmodel.palette = lambda: {**palette(), **{n: make() for n, make in own.items()}}
    return base, palette, design


def unwield(weapon, held):
    """Take `wield`'s metal off the hand: the weapon, the palette and the sword's design as they were."""
    import fpsword
    fpmodel.WEAPONS[weapon], fpmodel.palette = held[0], held[1]
    fpsword.DESIGN.clear()
    fpsword.DESIGN.update(held[2])


def _axe_own(metal, mats):
    """A make's own materials past the fitted axe's (axes.py `ROLES`): its darker metal and its sleeves, graded as the
    head (so a metal's own colours, cap or lift take them too); its fittings matte in the metal's own colours,
    which no grade or dye touches; its grip as its warhammer's. A finer metal's head is smoother than iron's."""
    import materials
    import metals
    import fpwarhammers
    L, out = metals.LOOK[metal], {}
    if metal in AXE_SURFACE:
        out['axehead'] = lambda: axes.iron('axehead', **AXE_SURFACE[metal])
    for name in ('axe_groove', 'axe_sleeve'):   # the darker metal's grade is the head's at a share (OWN `flats`)
        if name in mats:
            fpforge.CLASSES[name] = 5
    if 'axe_sleeve' in mats:
        fpforge.GRADE_AS['axe_sleeve'] = 'axehead'
    if 'axe_groove' in mats:
        dark = AXE_GROOVE.get(metal, GROOVE)
        if metal in AXE_GROOVE:   # worked dark metal with the head's sheen and dents, so the lamp runs across its flats
            out['axe_groove'] = lambda: axes.iron('axe_groove', dark=(dark,) * 3, light=(dark + 0.06,) * 3, dent=0.06)
        else:
            out['axe_groove'] = lambda: fpmodel._diffuse(materials.speckle(
                'axe_groove', (dark,) * 3, (dark + 0.03,) * 3, scale=900.0, at=0.45, rough=0.9, metal=0.0))
    if 'axe_sleeve' in mats:
        out['axe_sleeve'] = lambda: axes.iron('axe_sleeve', **AXE_SURFACE.get(metal, {}))
    if 'axe_accent' in mats:
        colour = axes.ACCENT_COLOUR.get(metal, L.get('accent', L['fit']))
        out['axe_accent'] = lambda: fpmodel._diffuse(materials.plain('axe_accent', metals._linear(colour), rough=0.6))
    if 'axe_grip' in mats:
        k = fpwarhammers.GRIP_LIFT * AXE_GRIP_LIFT.get(metal, 1.0)
        lift = tuple(min(1.0, c * k) for c in metals._linear(L['grip']))
        out['axe_grip'] = lambda: fpmodel._diffuse(materials.plain('axe_grip', lift, rough=0.7))
    return out


# a finer metal's axe head (axes.py `iron`): shallower dents and a tighter mottle than worked iron's, as its
# warhammer's surface is (fpwarhammers.py `SURFACE`); orcish keeps iron's rough work
_FINE = {'dent': 0.03, 'dark': (0.56, 0.56, 0.56), 'light': (0.58, 0.58, 0.58)}
AXE_SURFACE = {m: _FINE for m in ('Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Daedric')}
AXE_SURFACE.update({m: {**_FINE, 'dent': 0.05} for m in ('Ebony', 'Daedric')})   # dark heads need their dents' light


def wield_staff(metal):
    """Put `metal`'s staff in the first-person forge's hand: its mesh in the staff's materials, its cord graded as its
    wood is. Gives back what to restore."""
    import materials
    base, palette, load = dict(fpmodel.WEAPONS['staff']), fpmodel.palette, fpforge.load
    fpmodel.WEAPONS['staff'] = {**base, 'parts': {'staff': fpmodel.metal_staff(metal)}, 'mats': fpmodel.STAFF_MATS}
    fpmodel.palette = lambda: {**palette(), 'lash': fpmodel._diffuse(materials.plain('lash', LASH, rough=0.9)),
                               'glow': _glow()}

    def graded(path):
        spec = load(path)
        fpforge.GRADE.setdefault('lash', fpforge.GRADE.get('staff'))
        return spec
    fpforge.load = graded
    return base, palette, load


def own_load(weapon, metal, load):
    """`load` (fpforge.py's) with `metal`'s own way in `weapon`'s records laid over what it loads (`OWN`): its records'
    lights, its grey capped or lifted, a haft's top, a smooth spread, darker flats, its own colours, its grip's grade.
    `load` itself where the metal has none."""
    own = OWN.get(weapon, {}).get(metal, {})
    if not own:
        return load

    def owned(path):
        spec = load(path)
        for key, light in own.get('light', {}).items():
            fpstage.RECORD_LIGHT[key] = {**fpstage.RECORD_LIGHT.get(key, {}), **light}
        grades = (fpforge.GRADE, *fpforge.RECORD_GRADE.values(), *fpforge.FRAME_GRADE.values())
        def capped(grade):   # the metal's grades, each once (two names may share one): the sword's hand is its own
            out = {id(g): g for n, g in grade.items() if 'lum' in g and (weapon != 'sword' or n in METAL[weapon])}
            return list(out.values())
        if 'cap' in own:
            for grade in grades:
                for g in capped(grade):
                    g['lum'] = [g['lum'][0], [min(v, own['cap']) for v in g['lum'][1]]]
        if 'haft_top' in own:
            for grade in grades:
                if 'rgb' in grade.get('haft', {}):
                    rgb = [[src, [min(v, top) for v in dst]]
                           for (src, dst), top in zip(grade['haft']['rgb'], own['haft_top'])]
                    grade['haft'] = {**grade['haft'], 'rgb': rgb}
        if 'lift' in own:
            for grade in grades:
                for g in capped(grade):
                    lo, top = own['lift'], max(g['lum'][1])
                    g['lum'] = [g['lum'][0], [lo + (v - 44.0) * (top - lo) / (top - 44.0) for v in g['lum'][1]]]
        if 'spread' in own:   # the head on a smooth ramp, every shade the lamp gives it a step of its own
            lo, hi = own['spread']
            for grade in grades:
                for name in METAL[weapon]:
                    g = grade.get(name)
                    if g and 'lum' in g:
                        src = g['lum'][0]
                        s0, s1 = src[0], src[-1]
                        dst = [lo + (hi - lo) * max(0.0, min(1.0, (v - s0) / (s1 - s0))) for v in src]
                        grade[name] = {**g, 'lum': [src, dst]}
        if 'flats' in own:   # the darker metal graded as the head, at a share of its light
            for grade in grades:
                g = grade.get('axehead')
                if g and 'lum' in g:
                    grade['axe_groove'] = {**g, 'lum': [g['lum'][0], [v * own['flats'] for v in g['lum'][1]]]}
        if 'colours' in own:
            ramp = own['colours']
            if isinstance(ramp, str):
                import bpy  # noqa: F401  (mathutils, which armour.py's anatomy needs, comes with it)
                import armour
                ramp = getattr(armour, ramp)[1]
            for grade in grades:
                for name in (*METAL[weapon], 'axe_groove'):
                    if name in grade:
                        grade[name] = {**grade[name], 'colours': [own['at'], ramp]}
        if own.get('grip'):   # its warhammer's grip's grade, where it has one
            import fpwarhammers
            grip = (fpwarhammers.own_grade(metal) or {}).get('hammer_grip')
            if grip:
                fpforge.GRADE['axe_grip'] = grip
        return spec
    return owned


def main():
    global GLOW
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--weapon', default='sword', choices=sorted(SPEC))
    ap.add_argument('--metals', default=','.join(m for m in blades.METALS if m != 'Steel'))
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--wear-only', action='store_true', help="the frames' wear maps alone (fpwear.py)")
    ap.add_argument('--records', default='', help='only these records (fpforge.py --records)')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for metal in [m for m in args.metals.split(',') if m]:
        work = tempfile.mkdtemp(prefix=f'fpmetal-{metal}-')
        staff = args.weapon == 'staff'
        held = wield_staff(metal) if staff else wield(metal, args.weapon)
        load = fpforge.load
        own = OWN.get(args.weapon, {}).get(metal, {})
        fpforge.load = own_load(args.weapon, metal, load)
        glow, GLOW = GLOW, own.get('glow', GLOW)   # a metal's own seam, put back after
        try:
            sys.argv = ['fpforge.py', '--spec', SPEC[args.weapon], '--out', work, '--samples', str(args.samples),
                        *(['--records', args.records] if args.records else []),
                        *(['--wear-only'] if args.wear_only else [])]
            fpforge.main()
        finally:
            GLOW = glow
            fpstage.set_lights = SET_LIGHTS
            fpforge.load = load
            fpforge.GRADE_AS.clear()
            if staff:
                fpmodel.WEAPONS['staff'], fpmodel.palette, fpforge.load = held
            else:
                unwield(args.weapon, held)
        fpwear.move(work, args.out, metal)
        print(f'{metal}: its frames into {args.out}', flush=True)


if __name__ == '__main__':
    main()
