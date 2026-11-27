"""The Lattice's armour, in Daedric's place: a suit of crystal plate after a reference, built from the
forge's own armour kit so it is shaded as its sets are, graded red, purple in its shadows, its edges lit purple,
strapped with leather over a dark suit. A tall closed helm crested with blades, a dark V across its eyes; broad
pauldrons flared and jagged; a keeled breastplate under a high collar; a studded belt, a long plate hung in front;
spiked vambraces; jagged cuisses and greaves; pointed sabatons. Registered beside the forge, every piece its own
make. Run from tools/forge/ with Blender's module:

    python -I ../lattice/armoury.py --body male --anims idle --out <folder>"""
import argparse
import math
import os
import sys

sys.dont_write_bytecode = True   # nothing written beside the forge's code
for redirect in ('FORGE_KEYS', 'FORGE_FITTED', 'FORGE_LOOKS'):   # the forge's own homes for them are never used here
    os.environ.pop(redirect, None)
HERE = os.path.dirname(os.path.abspath(__file__))
FORGE = os.path.abspath(os.path.join(HERE, '..', 'forge'))
sys.path[:0] = [HERE, os.path.join(FORGE, 'tools', 'sprite-forge')]

import bpy  # noqa: E402,F401  (Blender first: the forge's modules need its mathutils)
import numpy as np  # noqa: E402

import armour as A  # noqa: E402
import armourmakes  # noqa: E402
from armourkit import TAU, Mesh, cap_band, dome, solid, tube  # noqa: E402
from armourmakes import (BACK, FRONT, arm_frame, blade, cuff, disc, eye_z, flat, foot_base, foot_shell,  # noqa: E402
                         hang, head_shell, helm_frame, hoop, leg_frame, over_shoulder, shoulder_frame, standing_lip)

SET = 'Lattice'
# the crystal's grade, brightness onto colour: purple in its shadows, deep red through its body, its lit tops pale red
CRYSTAL = [[30.0, 70.0, 110.0, 145.0, 175.0, 200.0, 220.0, 236.0, 248.0, 255.0],
           [[18, 6, 26], [30, 9, 42], [45, 12, 55], [70, 14, 52], [100, 16, 42], [135, 20, 36], [170, 26, 34],
            [205, 40, 44], [232, 70, 70], [250, 120, 115]]]
LIGHT = ((150, 50, 220), 0.8)   # the purple crystal's light, along every plate's edge (armour.py `palette`'s seam)
STYLE = {'under': ('cloth', (14, 12, 18)), 'section': ('facet', 9), 'keel': 0.012, 'gap': 0.012, 'thick': 0.008,
         'edge': 0.0, 'seam': LIGHT, 'glow': True, 'mailskirt': False, 'muscle': 0.8}
EDGE = 0.0068   # a lit edge's roll: a pixel or more across, so it draws as a line and not dashes


def jagged(depth, count, at=0.0):
    """A hem or a top cut into `count` sharp points round the loop, `depth` deep: crystal broken, not rolled."""
    return lambda t: depth * np.abs(((np.asarray(t, float) - at) * count / TAU) % 1.0 * 2.0 - 1.0)


def lit(mesh, grid, closed=False):
    """A plate's every edge rolled in the crystal's light: its top and foot, and its sides where it is open."""
    for line in (grid[0], grid[-1]) + (() if closed else (grid[:, 0], grid[:, -1])):
        tube(mesh, line, EDGE, A.S_GLOW, n=5, closed=closed and len(line) == grid.shape[1])


def point(mesh, root, way, length, width, facing, thick):
    """A crystal point broken out of a plate's edge: a flat blade from `root` along `way`."""
    way = np.asarray(way, float) / np.linalg.norm(way)
    blade(mesh, root, np.asarray(root) + way * length, width, facing, thick, A.S_PLATE, belly=0.3)


def lattice_cuirass(parts, fit, mat):
    """A breastplate swelling over the chest, keeled down its middle, a V at the neck and a point at its foot; a
    backplate to match; a high collar flaring at the neck's sides; plates over the belly; a studded belt, and from it
    a long pointed plate hung in front."""
    s = fit.s
    gap, thick = s['gap'], s['thick']
    chest, spine, pelvis = Mesh(), Mesh(), Mesh()
    torso = ['torso']
    for at, vee, foot in ((FRONT, 0.06, 0.05), (BACK, 0.02, 0.03)):
        g = fit.band(torso, np.linspace(1.5, 1.18, 7), gap, th=np.linspace(at - 1.45, at + 1.45, 15),
                     keel_h=s['keel'] * 1.6, bulge=(lambda z, t: 0.012 * A._toward(t, FRONT, 1.1)) if at == FRONT else None,
                     top=lambda t, at=at, vee=vee: -vee * A._toward(t, at, 0.5),
                     hem=lambda t, at=at, foot=foot: foot * A._toward(t, at, 0.6))
        solid(chest, g, thick, A.S_PLATE, closed=False)
        lit(chest, g)
        g = fit.band(torso, np.linspace(1.17, 1.06, 3), gap * 0.8, th=np.linspace(at - 1.15, at + 1.15, 11),
                     keel_h=s['keel'])
        solid(spine, g, thick, A.S_PLATE, closed=False)
        lit(spine, g)
    g = fit.band(torso, np.linspace(1.6, 1.5, 3), gap * 0.6, th=np.linspace(FRONT - 2.1, FRONT + 2.1, 15),
                 top=lambda t: 0.035 * (1 - A._toward(t, FRONT, 0.9)) - 0.025 * A._toward(t, FRONT, 0.35))
    solid(chest, g, thick, A.S_PLATE, closed=False)   # the collar, high at the neck's sides, notched in front
    lit(chest, g)
    A._belt(pelvis, fit, 1.03, out=0.012)
    ring = fit.band(torso, [1.03], gap + 0.022, keel_h=0.0)[0]
    for k in range(0, len(ring), 3):   # its studs
        out = ring[k] - ring.mean(axis=0)
        out[2] = 0.0
        dome(pelvis, ring[k], 0.006, out / np.linalg.norm(out), A.S_TRIM)
    root = fit.band(torso, [1.0], gap + 0.02, th=[FRONT], keel_h=0.0)[0, 0]
    blade(pelvis, root, root + np.array((0.0, -0.03, -0.36)), 0.17, (0.0, -1.0, 0.1), thick, A.S_PLATE, belly=0.25,
          rim=EDGE)
    hang(parts, mat, fit, [('armour_cuirass.chest', chest, 'chest'), ('armour_cuirass.spine', spine, 'spine'),
                           ('armour_cuirass.pelvis', pelvis, 'pelvis')])


def lattice_pauldrons(parts, fit, mat):
    """Broad pauldrons of two lames, the top one arched front to back and flared up at its outer edge, three crystal
    points broken out along it; a point standing up by the neck; a leather strap round the arm under them."""
    s = fit.s
    for side in 'LR':
        m, strap_ = Mesh(), Mesh()
        x = shoulder_frame(fit, side)[3]
        for k in range(2):
            u, v = np.linspace(0.0 if k == 0 else 0.45, 1.0, 9), np.linspace(-1.0, 1.0, 9)
            rise = (lambda U, V, k=k: 0.014 - 0.045 * k - 0.06 * V ** 2 * (1 + 0.5 * U)
                    + (0.06 * U ** 2 if k == 0 else -0.03 * U))
            g = over_shoulder(fit, side, u, v, rise, s['gap'] + 0.012 * (2 - k), reach=0.06 + 0.02 * k, spread=0.05)
            flat(m, g, s['thick'], A.S_PLATE)
            tube(m, np.concatenate([g[0], g[1:, -1], g[-1, ::-1][1:], g[::-1, 0][1:]]), EDGE, A.S_GLOW, n=5,
                 closed=True)
            for j in ((1, 4, 7) if k == 0 else (2, 6)):
                point(m, g[-1, j], (x, 0.0, 0.7 if k == 0 else 0.15), 0.08 - 0.02 * k, 0.045, (0.0, -1.0, 0.0),
                      s['thick'])
        standing_lip(m, fit, side, 0.06, width=0.06, lean=0.2, thick=s['thick'], peak=True)
        hoop(strap_, fit, [f'arm_{side}'], A.arm_z(1.27), s['gap'], half=0.008)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}'),
                               (f'armour_pauldrons.strap_{side}', strap_, f'uarm_{side}')])


def lattice_gauntlets(parts, fit, mat):
    """A vambrace keeled down the forearm's outside, two points broken out along it and one off the elbow, strapped
    on, flaring to a jagged cuff at the wrist."""
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow + 0.015, wrist + 0.03, 6), s['gap'], keel_h=s['keel'], facing=out)
        solid(m, g, s['thick'], A.S_PLATE)
        lit(m, g, closed=True)
        cuff(m, fit, region, wrist, 0.035, 0.02, 0.012, s['thick'], A.S_PLATE, out, hem=jagged(0.014, 7))
        for z in (elbow - 0.05, wrist + 0.08):
            p = fit.band(region, [z], s['gap'] + s['thick'], th=[out], keel_h=0.0)[0, 0]
            point(m, p, (x, 0.0, 0.5), 0.06, 0.035, (0.0, -1.0, 0.0), s['thick'])
        p = fit.band(region, [elbow], s['gap'] + s['thick'], th=[BACK], keel_h=0.0)[0, 0]
        point(m, p, (0.3 * x, 1.0, 0.4), 0.07, 0.035, (x, 0.0, 0.0), s['thick'])
        hoop(m, fit, region, (elbow + wrist) / 2, s['gap'] + s['thick'] + 0.004, half=0.007)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def lattice_greaves(parts, fit, mat):
    """A cuisse over the thigh's front and outside, its foot jagged and points broken out down its outer edge; a knee
    cop notched into points, one standing up off it; a greave keeled down the shin and rising to a point over the knee,
    points down its outer edge, strapped above and below."""
    s = fit.s
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        g = fit.band(region, np.linspace(kz + 0.36, kz + 0.07, 6), s['gap'], th=FRONT + x * np.linspace(-0.5, 1.95, 11),
                     keel_h=0.0, hem=jagged(0.02, 9))
        solid(thigh, g, s['thick'], A.S_PLATE, closed=False)
        lit(thigh, g)
        for r in (1, 3, 5):
            point(thigh, g[r, -1], (x, 0.3, 0.5), 0.06, 0.035, (0.0, -1.0, 0.0), s['thick'])
        hoop(thigh, fit, region, kz + 0.22, s['gap'] + s['thick'] + 0.004, half=0.008)
        p = fit.band(region, [kz + 0.01], 0.024, th=[FRONT], keel_h=0.0)[0, 0]
        face = disc(shin, p, armourmakes.outward(fit, region, kz, p) + np.array((0.0, 0.0, 0.15)), 0.048, 0.007,
                    notch=6, boss=0.012)
        point(shin, face + np.array((0.0, 0.0, 0.03)), (0.0, -0.2, 1.0), 0.05, 0.03, (0.0, -1.0, 0.0), s['thick'])
        g = fit.band(region, np.linspace(kz - 0.03, 0.15, 7), s['gap'], th=FRONT + x * np.linspace(-1.2, 1.9, 11),
                     keel_h=s['keel'] * 1.4, top=lambda t: 0.035 * A._toward(t, FRONT, 0.4))
        solid(shin, g, s['thick'], A.S_PLATE, closed=False)
        lit(shin, g)
        for r in (1, 3, 5):
            point(shin, g[r, -1], (x, 0.4, 0.35), 0.055, 0.032, (0.0, -1.0, 0.0), s['thick'])
        for z in (kz - 0.12, 0.25):
            hoop(shin, fit, region, z, s['gap'] + s['thick'] + 0.006, half=0.009)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def lattice_boots(parts, fit, mat):
    """Sabatons drawn to a point at the toe, a point off the back of the ankle, a strap over the instep."""
    s = fit.s
    thick = s['thick'] * 0.85
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        region = [f'leg_{side}']
        g = fit.band(region, np.linspace(0.16, 0.03, 5), 0.008, keel_h=0.0, top=jagged(0.015, 6, BACK))
        solid(sh, g, thick, A.S_PLATE)
        lit(sh, g, closed=True)
        p = fit.band(region, [0.12], 0.008 + thick, th=[BACK], keel_h=0.0)[0, 0]
        point(sh, p, (0.0, 1.0, 0.6), 0.06, 0.03, (1.0, 0.0, 0.0), thick)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        foot_shell(ft, fit, side, np.linspace(0.03, toe + 0.06, 4), 0.006, over, thick, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.065, toe, 5), 0.01, over)
        cap = A._shut(cap, toe - np.array([0.015, 0.035]), [0.6, 0.15])   # drawn to a point
        solid(ft, cap, thick * 1.2, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        band = A._foot_rows(fit, side, [toe + 0.105, toe + 0.09], 0.012, over)
        solid(ft, band, 0.004, A.S_STRAP, closed=False, inward=lambda gg: A._toward_axis(gg))
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def lattice_helm(parts, fit, mat):
    """A tall closed helm drawn up to a point, a dark V across its eyes, its foot rolled in the crystal's light; crest
    blades swept back from its crown, the middle one tallest; a blade back from each temple."""
    s = fit.s
    m = Mesh()
    hc, sr, low, p = helm_frame(fit, tall=1.2)
    peak = 0.6
    shell = cap_band(m, hc, sr, (low - 0.6, 1.5707), (0, TAU), s['thick'], A.S_PLATE, rows=14, cols=28, point=peak)
    tube(m, shell[0], EDGE, A.S_GLOW, n=5, closed=True)
    eyes = math.asin(max(-1.0, min(1.0, (eye_z(p) - hc[2]) / sr[2])))
    for x in (1.0, -1.0):   # the V: from between the eyes up and out across each
        line = head_shell(hc, sr, np.linspace(eyes - 0.08, eyes + 0.1, 6), FRONT + x * np.linspace(0.0, 0.6, 6), peak,
                          out=s['thick'] + 0.002)
        tube(m, line, 0.007, A.S_DARK, n=5)
    for spread_, tall, lean in ((0.0, 0.24, 0.1), (0.07, 0.18, 0.12), (-0.07, 0.18, 0.12), (0.12, 0.11, 0.1),
                                (-0.12, 0.11, 0.1)):   # fanned out from the crown, so they read from the front too
        root = head_shell(hc, sr, 1.15, FRONT, peak, out=0.0) + np.array((spread_ * 0.3, 0.02, 0.0))
        facing = np.array((1.0 if spread_ >= 0 else -1.0, -1.2, 0.0)) if spread_ else np.array((0.0, -1.0, 0.0))
        blade(m, root, root + np.array((spread_, lean, tall)), 0.075, facing / np.linalg.norm(facing), s['thick'],
              A.S_PLATE, curve=(0.0, 0.07, 0.0), rim=EDGE)
    for x in (1.0, -1.0):
        root = head_shell(hc, sr, 0.25, (0.0 if x > 0 else math.pi), peak, out=0.0)
        blade(m, root, root + np.array((x * 0.04, 0.12, 0.1)), 0.04, (x, 0.0, 0.0), s['thick'], A.S_PLATE,
              curve=(0.0, 0.03, 0.03))
    hang(parts, mat, fit, [('armour_helm', m, 'head')])


def register():
    """The set beside the forge's own: its style (another set's for what it leaves alone), its finish and grade, and
    its every piece its own make (armourmakes.py `make_of`)."""
    A.STYLE[SET] = {**A.STYLE['Steel'], **STYLE, 'set': SET}
    A.FINISH[SET] = A.FINISH['Steel']
    A.SET_GRADE[SET] = {'metal': {'ramp': CRYSTAL}}
    A.MATERIALS = A.MATERIALS + (SET,)
    A.SETS = A.MATERIALS + A.GUILDS
    armourmakes.MAKES[SET] = {'cuirass': lattice_cuirass, 'pauldrons': lattice_pauldrons,
                              'gauntlets': lattice_gauntlets, 'greaves': lattice_greaves, 'boots': lattice_boots,
                              'helm': lattice_helm}


def main():
    asked = argparse.ArgumentParser()
    asked.add_argument('--out', required=True)
    known, rest_args = asked.parse_known_args()
    out = os.path.abspath(known.out)
    if os.path.commonpath([out, FORGE]) == FORGE:
        sys.exit(f'--out {known.out} is inside tools/forge/, which a Lattice render never writes into')
    register()
    import layers   # after the set is registered: the forge builds its lists of layers as it loads
    layers.LOOKS = os.path.join(out, 'forgeLooks.json')
    sys.argv[1:] = ['--set', 'armour', '--materials', SET, '--out', out, *rest_args]
    layers.main()


if __name__ == '__main__':
    main()
