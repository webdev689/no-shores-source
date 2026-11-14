"""Hair on the forge's bodies (src/systems/studioArt/forgeHair.js). Daggerfall draws a player's hair as part of the head
(FACE<gender><race>I0.CIF): cropped, to the shoulders or tied back on a man; long, short, in a braid or in two tails on
a woman. Each style is a layer, `hair_<style>`, drawn over the bare body in every animation it plays, in a grey the
game lays the race's hair colour on as a frame is composed.

- the cap: the head's own surface above the hairline, pushed out, fuller at the crown; it moves with the head and
  the nape with the neck, as the skin under it does
- what hangs (`Fall`, `Tail`): made again each frame from the head as it stands, falling down the world and laid
  clear of the body at each height, as a skirt is (drape.py); carried through the animation's keys, it trails the
  head's way a little and blows back on a walk
- each style that hangs is four layers (`VARIANTS`): hung clear of the body, or of every armour set's cuirass and
  pauldrons (`_plated`), and lying over a cloak's back (`_cloaked`) or not
- the grey: graded so its light falls evenly on SHARES steps, each step the share of Daggerfall's hair at that light

    python -I tools/sprite-forge/layers.py --body female --set hair --out public/art/studio/forge/layers"""
import math

import bpy
import numpy as np

import anatomy
import armour
import drape
import materials
import shape
from body import coords
from drape import Drape, Frame, blur, hull_reach, posed_points
from rig import rest

STYLES = {'male': ('crop', 'shoulder', 'tied'), 'female': ('long', 'short', 'braid', 'tails')}
MATERIAL = 'hair'
SHARES = 16
BAND = tuple(k * 16 + 8 for k in range(SHARES))   # a step's grey, which the game reads its share off
# the hair's light share for share onto even steps, so step k is Daggerfall's hair at share k (forgeHairColours.json).
# Measured on the styles rendered `--ungraded` over walk, idle and attack_axe, every view
GRADE = {'lum': [[0.0, 28.0, 49.0, 85.0, 108.0, 122.0, 131.0, 138.0, 145.0, 150.0, 156.0, 161.0, 167.0, 173.0, 180.0,
                  190.0, 255.0],
                 [0.0, 16.0, 32.0, 48.0, 64.0, 80.0, 96.0, 112.0, 128.0, 144.0, 160.0, 176.0, 192.0, 208.0, 224.0,
                  240.0, 255.0]]}
# over a cloak where it lies over the body, past its outline within UNDER, as a worn weapon is (forgeLooks.json
# `order`, `under`); it is a part of its own (fit.py HAIR_PIECE), so against the body and armour depth alone decides
ORDER, UNDER = 0.07, 0.03
CRANIUM = (0.0, -0.03, 1.69)   # the bald head's cranium at rest (anatomy.HEAD): its middle
# the hairline: its height at rest round the head, from the brow (0) past the temple and over the ear to the nape (pi)
HAIRLINE = ([0.0, 0.55, 0.95, 1.35, 1.7, 2.1, 2.6, math.pi], [1.706, 1.7, 1.68, 1.668, 1.655, 1.63, 1.596, 1.586])
# each style: the cap's push at the crown and at its edge; what falls loose (its length below the root at the back
# and beside the face, how far round from the back it hangs, its flare); a tail's (its root's height and way round
# from the back, its length, its girth at the root and the tip, how braided, how far it stands out from its root)
STYLE = {
    'crop': {'cap': (0.009, 0.003)},
    'shoulder': {'cap': (0.011, 0.004), 'fall': {'back': 0.19, 'side': 0.115, 'span': 2.1, 'flare': 0.012}},
    'tied': {'cap': (0.006, 0.0025), 'tails': [{'z': 1.678, 'at': 0.0, 'length': 0.21, 'girth': (0.017, 0.011),
                                                'braid': 0.0, 'kick': 0.025}]},
    'long': {'cap': (0.01, 0.004), 'fall': {'back': 0.37, 'side': 0.14, 'span': 1.95, 'flare': 0.02}},
    'short': {'cap': (0.012, 0.0045), 'fall': {'back': 0.095, 'side': 0.075, 'span': 2.0, 'flare': 0.008}},
    'braid': {'cap': (0.006, 0.0025), 'tails': [{'z': 1.655, 'at': 0.0, 'length': 0.36, 'girth': (0.017, 0.008),
                                                 'braid': 1.0, 'kick': 0.025}]},
    'tails': {'cap': (0.007, 0.003), 'tails': [{'z': 1.63, 'at': a, 'length': 0.1, 'girth': (0.028, 0.022),
                                                'braid': 0.0, 'kick': 0.004} for a in (1.4, -1.4)]},
}
EASE = 0.014   # what hangs lies this far clear of the body
CLOAK = 0.018   # and this much farther over a cloak, which lies a cloth's ease and thickness off what it hangs over
# each hanging style's layers: its suffix, hung clear of the armour, over a cloak
VARIANTS = (('', False, False), ('_plated', True, False), ('_cloaked', False, True), ('_plated_cloaked', True, True))
HANGING = tuple(sorted(s for s, v in STYLE.items() if 'fall' in v or 'tails' in v))
LAYERS = tuple(sorted(f'hair_{s}{v}' for styles in STYLES.values() for s in styles
                      for v, _, _ in (VARIANTS if s in HANGING else VARIANTS[:1])))
ARMOURED = ('pelvis', 'spine', 'chest', 'neck', 'clav_L', 'clav_R')   # the joints carrying what the hair lies over
NAPE = 0.13   # how far either side of the neck the armour lies under the hair
STREAK = 0.04   # a streak of the hair's shading across, about three pixels: finer only speckles at a sprite's size
# how far a hang's tip trails the head's way between keys, the most it trails, and how far it blows back by animation
LAG, LAG_MAX = 0.45, 0.05
WIND = {'walk': 0.03, 'walk_staff': 0.03, 'horsewalk': 0.03, 'horsegallop': 0.07}


def materials_():
    """The hair's material name, which the grade and the raster read."""
    return (MATERIAL,)


def hair_material():
    """The hair: a matte grey, streaked along its strands, so its light is never one flat tone."""
    m, b = materials._principled(MATERIAL, (0.5, 0.5, 0.5), 0.0, 0.55, 0.35)
    nt = m.node_tree
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type, wave.bands_direction, wave.wave_profile = 'BANDS', 'X', 'SIN'
    wave.inputs['Scale'].default_value = 2 * math.pi / (20.0 * STREAK)   # a wave's bands are 20 to a unit
    wave.inputs['Distortion'].default_value = 1.0
    nt.links.new(materials._coords(m, (1.0, 1.0, 1.0)), wave.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.16, 0.16, 0.16, 1)
    ramp.color_ramp.elements[1].color = (0.28, 0.28, 0.28, 1)
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def round_head(p, c):
    """Each point's way round the head from the brow (0) to the nape (pi), either side."""
    return np.arctan2(np.abs(p[:, 0] - c[0]), -(p[:, 1] - c[1]))


def hairline(p):
    """Whether each point at rest (as built) lies above the hairline."""
    return p[:, 2] > np.interp(round_head(p, CRANIUM), *HAIRLINE)


def cap_push(p, crown, edge):
    """The cap's push at each point: `edge` at the hairline, rising to `crown` over the first 5 cm above it."""
    over = p[:, 2] - np.interp(round_head(p, CRANIUM), *HAIRLINE)
    t = np.clip(over / 0.05, 0.0, 1.0)
    return edge + (crown - edge) * t * t * (3 - 2 * t)


def head_reach(points, c, z, way, band=0.014, cone=0.3):
    """How far from `c` along each of `way` (radians round from the back, toward the body's left) the head reaches at
    height `z`: the farthest of `points` within `band` of that height and `cone` of that way."""
    q = points[np.abs(points[:, 2] - z) < band] - c
    ang = np.arctan2(q[:, 0], q[:, 1])
    out = []
    for a in np.atleast_1d(way):
        u = np.array([math.sin(a), math.cos(a), 0.0])
        d = np.abs((ang - a + math.pi) % (2 * math.pi) - math.pi)
        near = q[d < cone]
        out.append(float((near @ u).max()) if len(near) else 0.08)
    return np.array(out)


def armour_envelope(body):
    """The bare body wearing every armour set's cuirass and pauldrons at once, hidden: what hair over armour clears."""
    import layers
    E = layers.Dressed(body)
    for m in armour.SETS:
        _, skins = armour.dress(E.M, E.skins[0], E.parts, m, pieces=('cuirass', 'pauldrons'), woman=body == 'female')
        for sk in skins:   # the under-suit, inside the plate
            bpy.data.objects.remove(sk.ob, do_unlink=True)
    for ob, _ in E.parts:
        ob.hide_render = True
    return E


def clear_of(fighter, plated):
    """The posed points a hang clears: the body without its arms, and over armour (`plated`) the plate the trunk and
    the shoulders carry within NAPE of the neck either side, up to the jaw. Hair falls behind the shoulders and lies on
    a pauldron's inner edge, never out over the whole of every set's at once; an arm raised over the head lifts its
    pauldron out of the way. Thinned to one point in each 6 mm cell."""
    pts = [posed_points(fighter, ('body',))]
    if plated:
        C = fighter.W['chest'][:3, :3]
        neck, side, up = fighter.W['neck'][:3, 3], C @ np.array([1.0, 0.0, 0.0]), C @ np.array([0.0, 0.0, 1.0])
        for ob, joint in fighter.parts:
            if joint in ARMOURED and ob.name.startswith('armour_'):
                M = np.array(ob.matrix_world)
                q = coords(ob.data) @ M[:3, :3].T + M[:3, 3]
                pts.append(q[((q - neck) @ up < 0.06) & (np.abs((q - neck) @ side) < NAPE)])
    pts = np.concatenate(pts)
    _, keep = np.unique(np.floor(pts / 0.006).astype(np.int64), axis=0, return_index=True)
    return pts[keep]


class Hang:
    """What a hang shares: its root's place on the head, carried through the animation's keys (`carry`), the reach at
    each height of what it hangs over (`reach`, the body's or the armour's), its streaks laid along it (`strands`)."""

    def setup(self, c, plated=False, cloaked=False):
        self.c = np.asarray(c, float)   # the head's middle at rest, shaped
        self.head = np.array(rest('head'))
        self.lags, self.frame = None, 0
        self.plated, self.ease = plated, EASE + (CLOAK if cloaked else 0.0)
        self.fall = 1.0 if cloaked else 0.97   # over a cloak it hangs straight from the shoulder blades, as the cloak

    def strands(self, across, down):
        """Its pattern's place (the `rest` the material reads): `across` metres round it, `down` along it, so its
        streaks run its length at their own width."""
        n = self.rows * self.cols
        rr, kk = np.divmod(np.arange(n), self.cols)
        uv = np.zeros((2 * n, 3), np.float32)
        uv[:n, 0], uv[:n, 2] = kk / self.cols * across, -rr / self.rows * down
        uv[n:] = uv[:n]
        self.me.attributes['rest'].data.foreach_set('vector', uv.ravel())

    def world(self, H, p):
        return (np.asarray(p) - self.head) @ H[:3, :3].T + H[:3, 3]

    def snapshot(self, W, fighter):
        H = np.array(W['head'])
        return self.world(H, self.c[None])[0], Frame(W).y

    def carry(self, shots, anim, Ws):
        """Each key's trail: against the head's way from the key before to the key after (round, where the animation
        loops), at most LAG_MAX, and blown back on a walk."""
        _, loop, _ = drape.PACE.get(anim, drape.PACE_ELSE)
        loop = loop or anim.startswith(('walk', 'horse', 'breathe', 'play_'))
        P = np.array([s[0] for s in shots])
        n = len(P)
        out = []
        for k in range(n):
            if n < 2:
                v = np.zeros(3)
            elif loop:
                v = (P[(k + 1) % n] - P[(k - 1) % n]) / 2
            else:
                v = P[min(k + 1, n - 1)] - P[max(k - 1, 0)]
                v = v / max(1, min(k + 1, n - 1) - max(k - 1, 0))
            trail = -v * LAG
            size = np.linalg.norm(trail)
            if size > LAG_MAX:
                trail *= LAG_MAX / size
            out.append(trail + shots[k][1] * WIND.get(anim, 0.0))
        self.lags = out

    def trail(self):
        return self.lags[self.frame] if self.lags and self.frame < len(self.lags) else np.zeros(3)

    def reach(self, fighter, F, mid, heights, ways):
        """How far what it hangs over reaches from `mid` along each way (radians round in F's frame) at each height
        (along F.up), `heights` and `ways` alike in shape: read off its slices a cm apart, each the widest of it and its
        neighbours, so a hang never tucks in between two."""
        pts = clear_of(fighter, self.plated)
        q2, qh = F.to2(pts, mid)
        lo, hi = float(heights.min()) - 0.02, float(heights.max()) + 0.02
        levels = np.arange(hi, lo - 0.01, -0.01)
        flat = ways.ravel()
        table = np.zeros((len(levels), len(flat)))
        for k, z in enumerate(levels):
            sl = q2[np.abs(qh - z) < 0.012]
            if len(sl) >= 3:
                table[k] = hull_reach(sl, np.zeros(2), flat)
        table = np.maximum.reduce([drape._shift(table, 1, 0, 'edge'), table, drape._shift(table, -1, 0, 'edge')])
        h = heights.ravel()
        out = np.empty(len(flat))
        for j in range(len(flat)):
            out[j] = np.interp(h[j], levels[::-1], table[::-1, j])
        return out.reshape(ways.shape)


class Fall(Hang, Drape):
    """Hair hanging loose from round the head, from one temple round the back to the other: a sheet from the head's
    widest girth, falling down the world to its length (longer behind, shorter beside the face), flared a little,
    and at each height laid clear of the body's reach. It never draws in faster than hair falls."""

    def __init__(self, name, mat, skull, c, back, side, span, flare, crown, plated=False, cloaked=False, rows=16,
                 cols=29, thick=0.008):
        self.setup(c, plated, cloaked)
        self.span = span
        self.phi = np.linspace(-span, span, cols)
        reach = head_reach(skull, self.c, self.c[2], self.phi)
        u = np.stack([np.sin(self.phi), np.cos(self.phi), np.zeros(cols)], axis=1)
        self.ring = self.c + u * (reach + crown + 0.002)[:, None]   # just outside the cap at the head's widest
        w = 0.5 + 0.5 * np.cos(math.pi * self.phi / span)   # 1 behind, 0 at its ends
        self.length = side + (back - side) * np.minimum(1.0, 1.6 * w)   # its hem even across the back
        self.spread = flare * (0.25 + 0.75 * w)   # it flares behind, and beside the face hangs straight
        super().__init__(name, [mat, mat], rows, cols, False, thick, slots=(0, 0))
        self.strands(2 * span * float(reach.mean()), back)

    def update(self, W, fighter):
        F = Frame(W)
        H = np.array(W['head'])
        mid = self.world(H, self.c[None])[0]
        roots = self.world(H, self.ring)
        rows, cols = self.rows, self.cols
        T = np.linspace(0.0, 1.0, rows)
        trail = self.trail()
        free = (roots[None] - F.up * (T[:, None, None] * self.length[None, :, None])
                + trail * T[:, None, None] ** 1.5)
        q2, qh = F.to2(free.reshape(-1, 3), mid)
        q2, qh = q2.reshape(rows, cols, 2), qh.reshape(rows, cols)
        way = np.arctan2(q2[..., 1], q2[..., 0])
        rad = np.linalg.norm(q2, axis=2) + self.spread[None, :] * T[:, None] ** 1.3
        need = self.reach(fighter, F, mid, qh, way) + self.ease
        R = np.maximum(rad, need)
        for i in range(1, rows):   # it hangs: never drawn in under the row above faster than hair falls
            R[i] = np.maximum(R[i], R[i - 1] * self.fall)
        R = np.maximum(blur(R, 2, 1, 'edge'), need)
        out = np.cos(way)[..., None] * F.x + np.sin(way)[..., None] * F.y
        grid = mid + out * R[..., None] + F.up * qh[..., None]
        grid[..., 2] = np.maximum(grid[..., 2], 0.004)   # lying, it lies on the ground, never through it
        self.set(grid, out)


class Tail(Hang, Drape):
    """Hair gathered into a tail (a ponytail, a braid, two tails beside the face): a tube from its root on the head,
    tied there, falling down the world to its length, its girth tapering, a braid's swelling and narrowing along it;
    at each height laid clear of the body's reach."""

    def __init__(self, name, mat, skull, c, tails, plated=False, cloaked=False, rows=18, cols=10, thick=0.002):
        self.setup(c, plated, cloaked)
        self.tails = []
        for t in tails:
            at = t['at']
            u = np.array([math.sin(at), math.cos(at), 0.0])
            root = self.c + u * (head_reach(skull, self.c, t['z'], [at])[0] + 0.004)
            root[2] = t['z']
            self.tails.append({**t, 'root': root, 'u': u})
        self.rows1 = rows
        n = len(tails)
        super().__init__(name, [mat, mat], rows * n + 2 * (n - 1), cols, True, thick, slots=(0, 0))
        self.strands(2 * math.pi * tails[0]['girth'][0], tails[0]['length'] * n)

    def update(self, W, fighter):
        F = Frame(W)
        H = np.array(W['head'])
        mid = self.world(H, self.c[None])[0]
        trail = self.trail()
        th = np.linspace(0, 2 * math.pi, self.cols, endpoint=False)
        per = []
        for t in self.tails:
            rows = self.rows1
            T = np.linspace(0.0, 1.0, rows)
            root = self.world(H, t['root'][None])[0]
            out0 = H[:3, :3] @ t['u']
            # out from the head where it is tied, then down the world
            kick = t['kick'] * np.sin(np.clip(T * 4.0, 0.0, 1.0) * math.pi / 2)
            line = root[None] + out0 * kick[:, None] - F.up * (T * t['length'])[:, None] + trail * T[:, None] ** 1.5
            girth = t['girth'][0] + (t['girth'][1] - t['girth'][0]) * T
            girth = girth * (1 + 0.22 * t['braid'] * np.cos(T * t['length'] / 0.022 * math.pi) ** 2)
            girth[1] *= 1.25   # the tie
            q2, qh = F.to2(line, mid)
            way = np.arctan2(q2[:, 1], q2[:, 0])
            need = self.reach(fighter, F, mid, qh, way) + self.ease + girth
            R = np.maximum(np.linalg.norm(q2, axis=1), need)
            for i in range(1, rows):
                R[i] = max(R[i], R[i - 1] * self.fall)
            centre = mid + (np.cos(way)[:, None] * F.x + np.sin(way)[:, None] * F.y) * R[:, None] + F.up * qh[:, None]
            centre[:, 2] = np.maximum(centre[:, 2], 0.004 + girth)
            along = np.gradient(centre, axis=0)
            along /= np.maximum(np.linalg.norm(along, axis=1, keepdims=True), 1e-9)
            rings = []
            for i in range(rows):
                a = np.cross(along[i], F.x)
                if np.linalg.norm(a) < 0.2:   # running across the body: round it the other way
                    a = np.cross(along[i], F.y)
                a = a / np.linalg.norm(a)
                b = np.cross(along[i], a)
                rings.append(centre[i] + girth[i] * (np.outer(np.cos(th), a) + np.outer(np.sin(th), b)))
            per.append((rings, centre))
        grid = list(per[0][0])
        for (_, before), (rings, after) in zip(per, per[1:]):   # two tails' seam: collapsed onto each one's end
            grid += [np.repeat(before[-1][None], self.cols, axis=0), np.repeat(after[0][None], self.cols, axis=0)]
            grid += rings
        grid = np.array(grid)
        outv = grid - grid.mean(axis=1, keepdims=True)
        outv /= np.maximum(np.linalg.norm(outv, axis=2, keepdims=True), 1e-9)
        self.set(grid, outv)


def hair_layers(body, classify, want=None):
    """Each style of `body` its layers (those `want` names, or every one): its cap over the head and what of it hangs,
    in the hair's grey, a hanging style's four ways (`VARIANTS`)."""
    import layers

    class Haired(layers.Dressed):
        """The bare body with every style's cap cut on its head as built, before its proportions are laid on."""

        def shaped(self):
            if not hasattr(self, 'caps'):
                self.M[MATERIAL] = hair_material()
                b = self.skins[0]
                above = hairline(b.rest)
                self.caps = {}
                for style in STYLES[body]:
                    crown, edge = STYLE[style]['cap']
                    cap = b.shell(f'hair_{style}', self.M[MATERIAL], above, cap_push(b.rest, crown, edge))
                    self.skins.append(cap)
                    self.caps[style] = cap
            super().shaped()

    B = Haired(body)
    b = B.skins[0]
    skull = b.rest[np.argmax(b.alpha, axis=1) == anatomy.PIECES.index('skull')]   # shaped
    c = shape.transform('skull', np.array([CRANIUM]))[0]
    E = None
    out = []
    for style in STYLES[body]:
        s = STYLE[style]
        for suffix, plated, cloaked in VARIANTS if style in HANGING else VARIANTS[:1]:
            name = f'hair_{style}{suffix}'
            if want and name not in want:
                continue
            if plated and E is None:
                E = armour_envelope(body)
            hangs = []
            if 'fall' in s:
                f = s['fall']
                hangs.append(Fall(f'{name}_fall', B.M[MATERIAL], skull, c, f['back'], f['side'], f['span'], f['flare'],
                                  s['cap'][0], plated, cloaked))
            if 'tails' in s:
                hangs.append(Tail(f'{name}_tail', B.M[MATERIAL], skull, c, s['tails'], plated, cloaked))
            ly = layers.Layer(name, B, [B.caps[style].ob], classify, hangs, over=E if plated else None, dye='hair',
                              order=ORDER, under=UNDER)
            out.append(ly)
    return out
