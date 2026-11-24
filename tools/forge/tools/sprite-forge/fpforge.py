"""Daggerfall Online first-person forge: render a first-person weapon archive from the forge's own weapon, seen by the player's eye.

    python -I tools/sprite-forge/fpforge.py --spec tools/sprite-forge/specs/WEAPON04.json --out <dir> [--records 0,6]

Needs Blender as a Python module (`pip install bpy==5.2.3`, Python 3.13). Each frame is rendered over the whole
320 x 200 screen and cut to its record's canvas where the game draws that record (the spec's `screen`), or on a spec
drawn on canvases of its own or grown past them to the rect all its pictures draw in (`drawn`, fpgrow.py); a resting
frame of those has room past the screen (`ROOM`), and with FORGE_WHOLE=1 every frame is written whole. A record with
`mirror` is another record's screen flipped, as Daggerfall's own is (`drop` pixels lower, `shift` along, where
Daggerfall drew it so). Writes `<archive>_<record>-<frame>.png`; `--work` writes the whole screens instead, and
`--wear-only` each frame's wear map in its place, with no render (fpwear.py). A record with a `sway` (the flail's
idle) is rendered again a frame a step of its swing, as a record past the file's own
(`<archive>_<sway record>-<k>.png`). A record with a `grow` is cut to a canvas grown past its own (`cut`). Metal
comes out grey and nothing else does: the game reads grey as the metal the dye recolours (src/combat/forgeFrames.js)."""
import argparse
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fparm  # noqa: E402
import fpbow  # noqa: E402
import fpdagger  # noqa: E402
import fpsword  # noqa: E402
import fpheld  # noqa: E402
import fpwarhammer  # noqa: E402
import lifetools  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402

# a material's class in the reference (reference.mjs): 5 the band the metal dye recolours (a climbing painting's grey
# cloth), 6 the tan ramp (its leather), 7 the red-brown ramp, else 1. The claws' fur is drawn in the other ramps, and
# their paw pads and the pink round their nails in the red-brown's darks.
CLASSES = {'blade': 5, 'axehead': 5, 'macehead': 5, 'macecore': 5, 'ferrule': 5, 'staff': 1, 'haft': 1, 'macehaft': 1,
           'blade_groove': 5, 'haft_wrap': 1, 'linen': 5, 'gauntlet': 6, 'legging': 6, 'boot': 7, 'flailiron': 5, 'flailwood': 1,
           'fur': 1, 'pelt': 1, 'claw': 5, 'pad': 7, 'paw': 7,
           **fpbow.CLASSES, **fpheld.CLASSES, **fpdagger.CLASSES, **fpsword.CLASSES, **fpwarhammer.CLASSES, **lifetools.CLASSES}


FIT_CLASSES = {}   # a weapon's own classes in the fit alone, over CLASSES (fpmodel.WEAPONS `fit_classes`)


def fit_classes():
    """The class each material is read against in the fit: CLASSES, with the weapon's own over them."""
    return {**CLASSES, **FIT_CLASSES}


def pairs_with(name, ref):
    """Where a material is read against the reference: a metal on the band's texels, any other material on every drawn
    texel off the band (its shadows are drawn in darker ramps than its own)."""
    return ref == 5 if fit_classes().get(name) == 5 else (ref > 0) & (ref != 5)


FIT = {}     # '<record>:<frame>' -> the frame's pose (fpstage.pose_matrix's)
KEYS = {}    # '<record>:<frame>' -> a pose typed by hand that the fit is pulled toward (fpfit.py: a frame's priors)
# material -> its grade (fpcolour.py): {'lum': [brightness at its shares, the reference's]} for a material drawn grey,
# {'rgb': [[a channel at its shares, the reference's], ...]} for any other
GRADE = {}
RECORD_GRADE = {}   # '<record>' -> a record's own grade, by material (fpcolour.py --records): over the archive's
# '<record>:<frame>' -> a frame's own grade of its metal (fpcolour.py --frames): its brightness share for share onto
# Daggerfall's frame's, so each frame has the range of light and dark Daggerfall's has, over the record's and archive's
FRAME_GRADE = {}
GRADE_AS = {}   # a material graded as another wherever that one is graded, by a record's or a frame's own grade too


def load(spec_path):
    """The spec and every table beside it laid on: shape, poses, grade, lights."""
    spec = json.load(open(spec_path))
    fpstage.view(spec.get('view'))
    base = spec_path[:-len('.json')]
    fpmodel.load_shape(base + '-shape.json', spec['weapon'])
    FIT.clear()
    if os.path.exists(base + '-fit.json'):
        FIT.update(json.load(open(base + '-fit.json')))
    KEYS.clear()
    if os.path.exists(base + '-keys.json'):
        KEYS.update(json.load(open(base + '-keys.json')))
    GRADE.clear()
    RECORD_GRADE.clear()
    FRAME_GRADE.clear()
    if os.path.exists(base + '-grade.json'):
        table = json.load(open(base + '-grade.json'))
        RECORD_GRADE.update(table.pop('records', {}))
        FRAME_GRADE.update(table.pop('frames', {}))
        GRADE.update(table)
    hands = fpmodel.WEAPONS[spec['weapon']].get('hands')
    if hands:   # a picture that wears our hands wears them in their own colours (the held map: the climbing hands')
        own = json.load(open(os.path.join(os.path.dirname(spec_path), f'{hands}-grade.json')))
        GRADE.update({m: own[m] for m in fparm.mats() if m in own})
    fpstage.load_light(base + '-light.json')
    FIT_CLASSES.clear()
    FIT_CLASSES.update(fpmodel.WEAPONS[spec['weapon']].get('fit_classes', {}))
    arm = fpmodel.WEAPONS[spec['weapon']].get('arm_from')
    if arm:   # the arm every picture wears, in its own archive's grade: it looks the same whatever the hand holds
        own = json.load(open(os.path.join(os.path.dirname(os.path.abspath(spec_path)), f'{arm}-grade.json')))
        GRADE.update({n: own[n] for n in fparm.mats() if n in own})
        GRADE.update({n: GRADE[g] for n, g in fpmodel.WEAPONS[spec['weapon']].get('grade_as', {}).items() if g in GRADE})
    own_as = fpmodel.WEAPONS[spec['weapon']].get('graded_as', {})
    if own_as:   # a material graded and lit as another of this archive's tables names (the sword's blade as `blade`)
        GRADE.update({n: GRADE[g] for n, g in own_as.items() if g in GRADE})
        maps = fpstage.LIGHT.get('map', {})
        maps.update({n: maps[g] for n, g in own_as.items() if g in maps})
    return spec


def rect(rec):
    return [*rec['screen'], *rec['canvas']]


def out_rect(rec):
    """The rect a record's frames are cut to: its canvas, or on a spec drawn on canvases of its own or grown past
    Daggerfall's the rect all its pictures draw in (`drawn`, fpgrow.py), so a frame is never cut short."""
    return rec.get('drawn') or rect(rec)


def place_of(spec, rec):
    """Where a record's frames are written to be drawn (their PNG's `oFFs`), on a spec drawn on canvases of its own
    (`placed`: the sword's) or grown past Daggerfall's (`grown`): its drawn rect's corner. None: the classic box."""
    return out_rect(rec)[:2] if spec.get('placed') or spec.get('grown') else None


def box_of(spec, rec):
    """Where Daggerfall's box lies in a grown record's pictures (their PNG's `boXs`): the game lays the box out as it
    lays the classic frame, and draws the picture round it. None on any other spec."""
    if not spec.get('grown'):
        return None
    x, y, w, h = rect(rec)
    dx, dy = out_rect(rec)[:2]
    return [x - dx, y - dy, w, h]


# Rendering whole (FORGE_WHOLE=1), every script writes each frame's whole canvas, uncut; fpgrow.py then cuts each
# record's pictures, every metal's, set's, left twin's, layer's and map's, to the one rect they all draw in.
WHOLE = os.environ.get('FORGE_WHOLE') == '1'
# Room past the screen (left, top, right) for a frame the Weapon Widget moves at rest: its inertia drags the idle up to
# ~94 pixels sideways on a fast turn and its bob and look lower it up to ~16 (src/combat/weapon/weaponWidgetMotion.js),
# so the weapon runs on past the screen's edge there instead of ending at it. Left and right alike: a canvas's size
# gives its origin.
ROOM = (96, 32, 96)


def record_of(spec, r):
    """Record `r`, or for a swing's frames standing as a record past the file's own, the record they swing."""
    recs = spec['records']
    return recs[r] if r < len(recs) else next(rec for rec in recs if rec.get('sway', {}).get('record') == r)


def room_of(spec, r):
    """The room past the screen record `r` is rendered with: ROOM for the idle (and its swing) and the bow's draw, the
    frames the widget's bob and inertia move, on a spec drawn on canvases of its own or grown; else none."""
    if not (spec.get('placed') or spec.get('grown')):
        return (0, 0, 0)
    rec = record_of(spec, r)
    if rec.get('room'):   # a record the game draws lower than forged needs as much more room above
        return tuple(rec['room'])
    return ROOM if rec.get('state') == 'Idle' or spec['weapon'] == 'bow' else (0, 0, 0)


def aim(spec, r):
    """The eye set to render record `r` (a mirrored record: its source, whose screens it flips): its canvas, with the
    record's room past the screen. Aimed again before a record's screens are cut, as `cut` finds them on the canvas
    last aimed: rendering every record first leaves the last one's."""
    fpstage.bleed(*room_of(spec, record_of(spec, r).get('mirror', r)))


def cut(scr, rect):
    """A frame's picture from its screen: `rect` cut from it, or rendering whole, the whole canvas."""
    return scr if WHOLE else fpstage.crop(scr, rect)


def marks(spec, rec):
    """What a frame's PNG carries past its pixels (stage.write_png's keywords): its place and its box, none whole."""
    return {} if WHOLE else {'offset': place_of(spec, rec), 'box': box_of(spec, rec)}


DRAWN_PAD = 3   # texels round what a record draws (fpgrow.py): a render's soft edge never meets its picture's edge


def write_spec(spec_path, spec):
    """A spec written back as the specs are kept: one record a line."""
    head = {k: v for k, v in spec.items() if k != 'records'}
    lines = ['{'] + [f' {json.dumps(k)}: {json.dumps(v)},' for k, v in head.items()]
    lines += [' "records": [', ',\n'.join(f'  {json.dumps(rec)}' for rec in spec['records']), ' ]', '}']
    with open(spec_path, 'w') as fh:
        fh.write('\n'.join(lines) + '\n')


def part_of(spec, rec):
    """The part of the weapon a record shows (a punch's fist, a kick's boot): the record's, else the weapon's first."""
    return rec.get('part') or fpmodel.parts(spec['weapon'])[0]


def write_table(path, table):
    """A table of frames, one line a frame, numbers rounded."""
    def rnd(v):
        if isinstance(v, dict):
            return {k: rnd(x) for k, x in v.items()}
        if isinstance(v, list):
            return [rnd(x) for x in v]
        return round(v, 3) if isinstance(v, float) else v
    keys = sorted(table, key=lambda k: tuple(int(n) for n in k.split(':')))
    rows = ',\n'.join(f'  {json.dumps(k)}: {json.dumps(rnd(table[k]))}' for k in keys)
    with open(path, 'w') as fh:
        fh.write('{\n' + rows + '\n}\n')


class Eye:
    """The weapon before the eye, in Blender, and the fitter's raster of the same weapon for its material map."""

    def __init__(self, spec, samples=64, render=True):
        """`render` off: the raster alone, no Blender scene (a wear map needs no render)."""
        self.weapon = spec['weapon']
        self.names = list(fpmodel.WEAPONS[self.weapon]['mats'])
        parts = fpmodel.parts(self.weapon)
        if render:
            import bpy
            bpy.ops.wm.read_factory_settings(use_empty=True)
            fpstage.setup(fpmodel.SHAPE, samples)
            self.M = fpmodel.palette()
            self.obs = parts = fpmodel.build(self.weapon, self.M)
        ids = {n: k + 1 for k, n in enumerate(self.names)}
        self.ids = {part: fpmodel.triangles(self.weapon, ids, part=part) for part in parts}
        self.rest = {part: v for part, (v, _, _) in self.ids.items()}   # each part's mesh before its joints bend it
        self._own = {}   # a part in a record's own shape (`drawn`)
        self._moved = set()   # the parts whose mesh holds other vertices than the archive's rest
        if render:
            self.hide = {n: _camera_switch(self.M[n]) for n in self.names}   # a material hidden from the eye
            bpy.context.scene.cycles.transparent_max_bounces = 64   # a ray through a hidden hand crosses every finger
            self.tmp = os.path.join(tempfile.mkdtemp(), 'f.png')

    def drawn(self, part, record):
        """A part as a record draws it: (its shape, its rest vertices, its triangles and materials) - the archive's, or
        the record's own shape's (fpmodel.shape_for), whose mesh has the same vertices moved."""
        S = fpmodel.shape_for(record)
        if S is fpmodel.SHAPE:
            return S, self.rest[part], self.ids[part]
        key = (part, str(record))
        if key not in self._own:
            ids = {n: k + 1 for k, n in enumerate(self.names)}
            tri = fpmodel.triangles(self.weapon, ids, S, part)
            assert len(tri[0]) == len(self.rest[part]), 'a record\'s own shape keeps its part\'s vertices'
            self._own[key] = (S, tri[0], tri)
        return self._own[key]

    def reshape(self, part, record):
        """Forget a part's mesh in a record's own shape, so the next draw makes it in the shape as it now is."""
        self._own.pop((part, str(record)), None)

    def matrix(self, pose, part, S=None):
        S = S or fpmodel.SHAPE
        M, _ = fpstage.pose_matrix(pose, S, fpmodel.length(self.weapon, S, part))
        return np.diag([1.0, 1.0, S['aspect'], 1.0]) @ M   # the screen's pixel aspect, laid on the scene

    def _hits(self, pose, part, only, record):
        """The fitter's raster: (each pixel's triangle among those drawn, -1 none; those triangles' indices in the
        part; every vertex's screen u, v and depth)."""
        S, _, (v, t, c) = self.drawn(part, record)
        index = np.arange(len(t))
        if only is not None:   # by the ids the triangles carry: a name twice (chain's mail) carries its last place's
            index = index[np.isin(c, [k + 1 for k, n in enumerate(self.names) if n in only])]
        v = fpmodel.posed(self.weapon, part, v, pose, S)
        M, _ = fpstage.pose_matrix(pose, S, fpmodel.length(self.weapon, S, part))
        uvz = fpstage.project(v @ M[:3, :3].T + M[:3, 3], S)
        return fpstage.raster(*uvz, t[index]), index, uvz

    def id_map(self, pose, part, only=None, record=None):
        """Each pixel's material (its index in `names`, from 1; 0 none), by the fitter's raster: of `only` those
        materials, when given."""
        tri, index, _ = self._hits(pose, part, only, record)
        c = self.drawn(part, record)[2][2]
        return np.where(tri >= 0, c[index[np.maximum(tri, 0)]], 0)

    def surface(self, pose, part, only=None, record=None):
        """`id_map`, with each pixel's triangle (its index in the part, -1 none) and its corners' shares of the pixel's
        middle, as the eye sees the triangle in depth: (ids, triangles, shares (h, w, 3)). A wear map reads the part's
        rest from them (fpwear.py)."""
        tri, index, (u, v, z) = self._hits(pose, part, only, record)
        t, c = self.drawn(part, record)[2][1:]
        on = tri >= 0
        k = np.full(tri.shape, -1)
        k[on] = index[tri[on]]
        ys, xs = np.nonzero(on)
        T = t[k[on]]
        px, py = xs + 0.5 - fpstage.OX, ys + 0.5 - fpstage.OY   # the canvas's pixel on the screen the vertices lie on
        (ax, bx, qx), (ay, by, qy) = u[T].T, v[T].T
        area = (bx - ax) * (qy - ay) - (qx - ax) * (by - ay)   # fpstage.raster's edge functions, over each depth
        w = np.stack([((bx - px) * (qy - py) - (qx - px) * (by - py)), ((qx - px) * (ay - py) - (ax - px) * (qy - py)),
                      ((ax - px) * (by - py) - (bx - px) * (ay - py))], axis=1) / area[:, None] / z[T]
        shares = np.zeros(tri.shape + (3,))
        shares[on] = w / w.sum(axis=1, keepdims=True)
        return np.where(on, c[np.maximum(k, 0)], 0), k, shares

    def screen(self, pose, part, raw=False, only=None, record=None, under=(), frame=None, sheets=(), solid=()):
        """`_screen` on the canvas the eye renders. With room past the screen, the screen itself is rendered again on
        its own and laid over: Cycles seeds a pixel's noise by where it lies, so the screen keeps the very pixels it
        has with no room, and the room only adds what runs on past it."""
        at = (fpstage.OX, fpstage.OY, fpstage.RW - fpstage.W - fpstage.OX)
        whole = self._screen(pose, part, raw, only, record, under, frame, sheets, solid)
        if at == (0, 0, 0):
            return whole
        fpstage.bleed()
        try:
            inner = self._screen(pose, part, raw, only, record, under, frame, sheets, solid)
        finally:
            fpstage.bleed(*at)
        whole[at[1]:at[1] + fpstage.H, at[0]:at[0] + fpstage.W] = inner
        return whole

    def _screen(self, pose, part, raw=False, only=None, record=None, under=(), frame=None, sheets=(), solid=()):
        """The whole screen with `part` at `pose`, graded (or `raw`, as rendered): (h, w, 4) uint8. With `only`, only
        those materials are seen: the rest still shade them and cast their shadows (a garment's layer), and those
        `under` it (the layers drawn beneath) cut it where they lie nearer the eye, so the layers laid in order draw
        what is in front. A layer hides its inner faces, except the `sheets` (a vane, two-sided) and the closed
        `solid`s, whose faces may wind either way. A `record` is drawn in its own light and grade, where it has them."""
        from mathutils import Matrix
        import stage
        for n, (hide, back, cut) in self.hide.items():
            hide.outputs[0].default_value = 0.0 if only is None or n in only or n in under else 1.0
            back.outputs[0].default_value = 0.0 if only is None or n in under or n in sheets or n in solid else 1.0
            cut.outputs[0].default_value = 1.0 if n in under else 0.0
        for name, ob in self.obs.items():
            ob.hide_render = name != part
        ob = self.obs[part]
        S, rest, _ = self.drawn(part, record)
        if fpmodel.joints(self.weapon, part) or S is not fpmodel.SHAPE:   # bent as the pose bends it, in its shape
            ob.data.vertices.foreach_set('co', fpmodel.posed(self.weapon, part, rest, pose, S).ravel())
            ob.data.update()
            self._moved.add(part)
        elif part in self._moved:   # a record drawn in its own shape went before: the archive's mesh again
            ob.data.vertices.foreach_set('co', rest.ravel())
            ob.data.update()
            self._moved.discard(part)
        ob.matrix_world = Matrix(self.matrix(pose, part, S).tolist())
        fpstage.set_lights(fpstage.light_for(record, frame))
        work = stage.render_rgba(self.tmp)
        grade = {**GRADE, **RECORD_GRADE.get(str(record), {}), **FRAME_GRADE.get(f'{record}:{frame}', {})}
        grade.update({n: grade[g] for n, g in GRADE_AS.items() if g in grade})
        return work if raw else finish(work, self.id_map(pose, part, only, record), self.names, grade)


def _camera_switch(m):
    """Three switches on material `m`, each 0 off and 1 on, each for camera rays alone: one hides it from the eye while
    it still shades and shadows the rest, one hides only its inner faces (a layer's: inside a cuff's open end is the
    layer under it, not a hole), and one makes it a holdout, cutting what lies behind it out of the picture (a layer
    under the one drawn). Returns (hide, inner, cut)."""
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    surf = out.inputs['Surface'].links[0].from_socket
    path = nt.nodes.new('ShaderNodeLightPath')
    switch, inner = nt.nodes.new('ShaderNodeValue'), nt.nodes.new('ShaderNodeValue')
    switch.outputs[0].default_value = inner.outputs[0].default_value = 0.0
    back = nt.nodes.new('ShaderNodeMath')
    back.operation = 'MULTIPLY'
    nt.links.new(nt.nodes.new('ShaderNodeNewGeometry').outputs['Backfacing'], back.inputs[0])
    nt.links.new(inner.outputs[0], back.inputs[1])
    either = nt.nodes.new('ShaderNodeMath')
    either.operation = 'MAXIMUM'
    nt.links.new(switch.outputs[0], either.inputs[0])
    nt.links.new(back.outputs[0], either.inputs[1])
    both = nt.nodes.new('ShaderNodeMath')
    both.operation = 'MULTIPLY'
    nt.links.new(path.outputs['Is Camera Ray'], both.inputs[0])
    nt.links.new(either.outputs[0], both.inputs[1])
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(both.outputs[0], mix.inputs['Fac'])
    nt.links.new(surf, mix.inputs[1])
    nt.links.new(nt.nodes.new('ShaderNodeBsdfTransparent').outputs[0], mix.inputs[2])
    cut = nt.nodes.new('ShaderNodeValue')
    cut.outputs[0].default_value = 0.0
    hold = nt.nodes.new('ShaderNodeMath')
    hold.operation = 'MULTIPLY'
    nt.links.new(path.outputs['Is Camera Ray'], hold.inputs[0])
    nt.links.new(cut.outputs[0], hold.inputs[1])
    holdout = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(hold.outputs[0], holdout.inputs['Fac'])
    nt.links.new(mix.outputs[0], holdout.inputs[1])
    nt.links.new(nt.nodes.new('ShaderNodeHoldout').outputs[0], holdout.inputs[2])
    nt.links.new(holdout.outputs[0], out.inputs['Surface'])
    return switch, inner, cut



def tone(lum, m, size):
    """`lum` with its texture taken out within material `m`: the median over `size` texels, those past its edge taking
    their nearest's, so each face keeps its edges and its tone and loses its mottle."""
    from scipy import ndimage as ndi
    _, (iy, ix) = ndi.distance_transform_edt(~m, return_indices=True)
    return ndi.median_filter(lum[iy, ix], size=size)


def finish(work, ids, names, grade=None):
    """Each material's pixels through its grade. A metal's come out grey, its brightness mapped onto the reference's;
    every other material's keep their hue and are never quite grey."""
    out = work.copy()
    on = work[..., 3] > 0
    if (on & (ids == 0)).any():   # a pixel the render covers and the raster misses by a hair: its nearest material's
        from scipy import ndimage as ndi
        _, (iy, ix) = ndi.distance_transform_edt(ids == 0, return_indices=True)
        ids = ids[iy, ix]
    rgb = work[..., :3].astype(np.float64)
    lum = rgb.mean(axis=2)
    for k, n in enumerate(names):
        m = on & (ids == k + 1)
        if not m.any():
            continue
        g = (GRADE if grade is None else grade).get(n)
        if CLASSES.get(n) == 5:
            at_ = tone(lum, m, g['detail'][0])[m] if g and 'detail' in g else lum[m]   # graded by its face's tone
            if g and 'share' in g:   # this frame's own light share for share onto a fixed spread: a metal as fully lit,
                at, dst = g['share']   # its shade to its glints, in a frame its lamp leaves dim as in one it floods.
                src = np.percentile(at_, at) + np.arange(len(at)) * 1e-3   # By each face's tone where it has `detail`:
                want = np.interp(at_, src, dst)   # stretched texel by texel, a shadow's render noise turns to speckle
            else:
                want = np.interp(at_, *g['lum']) if g else lum[m]
            if g and 'detail' in g:   # and its texture laid back over it at its own contrast
                want = want + g['detail'][1] * (lum[m] - at_)
            px = np.repeat(np.clip(np.round(want), 0, 255)[:, None], 3, axis=1)
            if g and 'shade' in g:   # its shadow off the band, in the archive's own dark colours, never quite grey
                cut, (src, dst, at, colours) = g['shade']
                dark = at_ < cut
                b = np.interp(at_[dark], src, dst)
                colours = np.asarray(colours, dtype=np.float64)
                shade = np.round(np.stack([np.interp(b, at, colours[:, c]) for c in range(3)], axis=1))
                same = (shade[:, 0] == shade[:, 1]) & (shade[:, 1] == shade[:, 2])
                shade[same, 0] = np.where(shade[same, 0] < 255, shade[same, 0] + 1, 254)
                px[dark] = shade
            if g and 'colours' in g:   # a metal in its own colours at that brightness (elven gold): never grey, so no
                at, colours = g['colours']   # dye touches it
                colours = np.asarray(colours, dtype=np.float64)
                px = np.round(np.stack([np.interp(px[:, 0], at, colours[:, c]) for c in range(3)], axis=1))
                same = (px[:, 0] == px[:, 1]) & (px[:, 1] == px[:, 2])
                px[same, 0] = np.where(px[same, 0] < 255, px[same, 0] + 1, 254)
            out[m, :3] = np.clip(px, 0, 255).astype(np.uint8)
            continue
        if g and 'ramp' in g:   # brightness share for share, then the reference's own colour at that brightness
            src, dst, at, colours = g['ramp']
            want = np.interp(lum[m], src, dst)
            colours = np.asarray(colours, dtype=np.float64)
            out[m, :3] = np.clip(np.round(np.stack([np.interp(want, at, colours[:, c]) for c in range(3)], axis=1)),
                                 0, 255).astype(np.uint8)
        elif g and 'rgb' in g:   # each channel mapped share for share onto the reference's under it
            for c, (src, dst) in enumerate(g['rgb']):
                out[m, c] = np.clip(np.round(np.interp(rgb[m][:, c], src, dst)), 0, 255).astype(np.uint8)
        elif g:
            want = np.interp(lum[m], *g['lum'])
            out[m, :3] = np.clip(np.round(rgb[m] * (want / np.maximum(lum[m], 1.0))[:, None]), 0, 255).astype(np.uint8)
        px = out[m, :3].astype(np.int16)
        grey = (px[:, 0] == px[:, 1]) & (px[:, 1] == px[:, 2])
        px[grey, 0] = np.where(px[grey, 0] < 255, px[grey, 0] + 1, 254)   # not metal: never grey
        out[m, :3] = px.astype(np.uint8)
    return out


def series_poses(rec, pose, joints):
    """A record's series (the climbing arms'): its fitted `pose` with the hand stepped through the series' keys - each
    key a place along the run (`at`, 0 to 1) and joint values, a value a key leaves out the fitted pose's - one pose a
    frame, the arm held where it was fitted."""
    ser = rec['series']
    keys = sorted(ser.get('keys', [{'at': 0.0}]), key=lambda k: k['at'])   # no keys: every frame the fitted pose
    n = ser['frames']
    out = []
    for k in range(n):
        u = k / (n - 1) if n > 1 else 0.0
        j = max(i for i, key in enumerate(keys) if key['at'] <= u + 1e-9) if u >= keys[0]['at'] else 0
        a, b = keys[j], keys[min(j + 1, len(keys) - 1)]
        w = 0.0 if b['at'] <= a['at'] else (u - a['at']) / (b['at'] - a['at'])
        p = dict(pose)
        for name, *_ in joints:
            va, vb = a.get(name, pose.get(name, 0.0)), b.get(name, pose.get(name, 0.0))
            p[name] = float(va + (vb - va) * w)
        out.append(p)
    return out


def outlined(pic, dark):
    """A picture's outline drawn dark, as a painted sprite's is: each drawn texel beside the clear ground round it, its
    colour times `dark`. Where the canvas cuts the arm off is no edge, nor is a hole inside it (the layer under shows
    there)."""
    from scipy import ndimage as ndi
    on = pic[..., 3] > 0
    lab, _ = ndi.label(~np.pad(on, 1, constant_values=False))
    out_ = lab == lab[0, 0]   # the clear ground: what reaches the canvas's edge round the arm
    p = np.pad(out_[1:-1, 1:-1], 1, constant_values=False)
    edge = on & (p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:])
    out = pic.copy()
    was = pic[edge, :3].astype(np.int16)
    px = np.round(was * dark).astype(np.int16)
    # darkening rounds a colour to grey now and then: a texel that was not grey stays off it (grey is metal)
    grey = (px[:, 0] == px[:, 1]) & (px[:, 1] == px[:, 2]) & ~((was[:, 0] == was[:, 1]) & (was[:, 1] == was[:, 2]))
    px[grey, 0] = np.where(px[grey, 0] < 255, px[grey, 0] + 1, 254)
    out[edge, :3] = px.astype(np.uint8)
    return out


def sway_rect(rec):
    """A swing's canvas: its own size, sharing the record's bottom-right corner, where the record's row anchors it."""
    x, y, cw, ch = rect(rec)
    sw, sh = rec['sway']['canvas']
    return [x + cw - sw, y + ch - sh, sw, sh]


def sway_out(rec):
    """The rect a swing's frames are cut to: its canvas, or grown, the rect they all draw in (`drawn`, fpgrow.py)."""
    return rec['sway'].get('drawn') or sway_rect(rec)


def sway_marks(spec, rec):
    """A swing frame's place and box, as `marks` gives a frame's: its canvas is its box."""
    if WHOLE or not spec.get('grown'):
        return {}
    (x, y, w, h), (dx, dy) = sway_rect(rec), sway_out(rec)[:2]
    return {'offset': [dx, dy], 'box': [x - dx, y - dy, w, h]}


def series_rect(rec):
    """A series frame's canvas: the record's grown by the series' pad (left, top, right, bottom)."""
    x, y, cw, ch = rect(rec)
    left, top, right, bottom = rec['series']['pad']
    return [x - left, y - top, cw + left + right, ch + top + bottom]


def flipped(screen, rec):
    """A mirrored record's whole screen from its source's (`screen`, rows first): flipped, as Daggerfall's own is, then
    `drop` pixels lower (its canvas cut at its foot) and `shift` along (right, or left if less than 0), where Daggerfall
    drew the flip so."""
    d, k = rec.get('drop', 0), rec.get('shift', 0)
    out = np.pad(screen[:, ::-1], ((d, 0), (0, 0)) + ((0, 0),) * (screen.ndim - 2))[:screen.shape[0]]
    if k:
        moved = np.zeros_like(out)
        moved[:, max(k, 0):out.shape[1] + min(k, 0)] = out[:, max(-k, 0):out.shape[1] - max(k, 0)]
        out = moved
    return out


def paired(screen):
    """A record of both hands (the werecreature's idle, `pair`): the hand drawn and its mirror across the screen's
    middle, the drawn hand over its mirror where they meet."""
    flip = screen[:, ::-1]
    if screen.ndim == 3 and screen.shape[2] == 4:
        return np.where(screen[..., 3:4] > 0, screen, flip)
    return np.where(screen != 0, screen, flip)


def screens(eye, spec, records=None, draw=None):
    """Every frame's whole screen, by record: a mirrored record is its source's flipped. `draw` makes a frame's screen
    (eye.screen's arguments), eye.screen's by default."""
    draw = draw or eye.screen
    out = {}

    def of(r):
        if r in out:
            return out[r]
        rec = spec['records'][r]
        if 'mirror' in rec:
            out[r] = [flipped(s, rec) for s in of(rec['mirror'])]
        else:
            aim(spec, r)
            out[r] = [draw(FIT[f'{r}:{f}'], part_of(spec, rec), record=r, frame=f) for f in range(rec['frames'])]
            if rec.get('pair'):
                out[r] = [paired(s) for s in out[r]]
        return out[r]
    for r in range(len(spec['records'])):
        if records is None or r in records:
            of(r)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--out', required=True, help='where the frames go')
    ap.add_argument('--records', default='')
    ap.add_argument('--work', action='store_true', help='write the whole screens')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--wear-only', action='store_true', help="each frame's wear map in its place (fpwear.py)")
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    spec = load(args.spec)
    eye = Eye(spec, args.samples, render=not args.wear_only)
    only = {int(r) for r in args.records.split(',') if r != ''} or None
    os.makedirs(args.out, exist_ok=True)
    import stage
    draw, write = eye.screen, stage.write_png
    if args.wear_only:   # the same frames, cut and flipped alike, each a map of where its wear shows
        import fpwear
        draw, write = fpwear.Painter(eye).screen, fpwear.save
    n = 0
    for r, rec in enumerate(spec['records']):   # a series (the climbing arms): its own frames, the arm still
        if 'series' not in rec or (only and r not in only) or args.wear_only:
            continue
        part = part_of(spec, rec)
        for k, pose in enumerate(series_poses(rec, FIT[f'{r}:0'], fpmodel.joints(spec['weapon'], part))):
            for i, garment in enumerate(fparm.OUTFIT):   # each garment its own layer: armour swaps one without the rest
                under = tuple(fparm.GARMENTS[g]['mat'] for g in fparm.OUTFIT[:i])
                scr = eye.screen(pose, part, only=(fparm.GARMENTS[garment]['mat'],), record=r, under=under)
                pic = scr if args.work else fpstage.crop(scr, series_rect(rec))
                if rec['series'].get('outline'):
                    pic = outlined(pic, rec['series']['outline'])
                os.makedirs(os.path.join(args.out, garment), exist_ok=True)
                name = rec['series']['name'] + (f'-{k}' if rec['series']['frames'] > 1 else '')   # one frame: its name
                stage.write_png(os.path.join(args.out, garment, f'{name}.png'), pic)
                n += 1
    for r, rec in enumerate(spec['records']):   # a swing (the flail's idle): the record's pose, its joints swung
        hook = fpmodel.WEAPONS[spec['weapon']].get('sway')
        if 'sway' not in rec or not hook or (only and r not in only):
            continue
        sw, pose = rec['sway'], FIT[f'{r}:0']
        aim(spec, r)
        for k, joints in enumerate(hook(fpmodel.shape_for(r), pose, sw['frames'], sw['angle'])):
            scr = draw(dict(pose, **joints), part_of(spec, rec), record=r, frame=0)
            pic = scr if args.work else cut(scr, sway_out(rec))
            at = {} if args.work or args.wear_only else sway_marks(spec, rec)
            write(os.path.join(args.out, f"{spec['archive']}_{sw['record']}-{k}.png"), pic, **at)
            n += 1
    plain = {r for r, rec in enumerate(spec['records']) if 'series' not in rec and (not only or r in only)}
    for r, frames in sorted(screens(eye, spec, plain, draw).items() if plain else ()):
        if r not in plain:
            continue
        rec = spec['records'][r]
        aim(spec, r)
        for f, scr in enumerate(frames):
            name = f"{spec['archive']}_{r}-{f}.png"
            pic = scr if args.work else cut(scr, out_rect(rec))
            at = {} if args.work else marks(spec, rec)
            write(os.path.join(args.out, name), pic, **at)
            n += 1
    print(f"forged {n} {'wear maps' if args.wear_only else 'frames'} into {args.out}")


if __name__ == '__main__':
    main()
