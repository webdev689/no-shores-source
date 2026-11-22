"""The item forge's stage and grade. An item is rendered twice from one orthographic eye, a little above and before it:
once lit, every surface white, for its light; once flat, every surface its material's own mark, for which material
each texel shows. Each texel then takes its material's ramp (tools/sprite-forge/specs/item-ramps.json) at its light,
as Daggerfall shades an icon: smooth along the ramp, its edge away from the light the ramp's darkest sunk
(`SHADOW_EDGE`), the whole spread about its middle (`CONTRAST`), no outline. It is drawn `SUPER` times as large and
each texel takes the material most of its samples show and their light, so a texel is a render's and never a shrunk
picture's. The game snaps the picture to the player's palette as it decodes (systems/textureReplacement.js `look`)."""
import json
import math
import os
import tempfile

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
RAMPS_PATH = os.path.join(HERE, '..', 'specs', 'item-ramps.json')

ELEVATION = 38.0     # degrees the eye looks down on an item resting before it
SUPER = 4            # samples a texel's side: the picture is rendered this many times as large
SAMPLES = 24         # light samples a sample
SHADOW_EDGE = 0.45   # the edge away from the light: its ramp's darkest, darkened by this share
CONTRAST = 1.2       # the light spread about its middle grey
MARGIN = 2           # clear texels round the item in the work render
AO_REACH = 0.06      # how far a crease or a contact darkens, a share of the item's longest side on screen
SEAM_GAP = 0.05      # a texel beside one nearer the eye by this share of the longest side lies under it: a seam
STEEPEST = 12.0      # the most texels of depth a level top steps a row, for an eye near level: cot(4.8 degrees)
SEAM_TONE = 0.35     # a seam's light, a share of its own: the line where one part lies over another
# the light, toward which each shines in the eye's own frame (right, up, into the picture), its strength; and the
# ambient. The lights ride the eye, so an item lying under it and a tool held square to it are lit alike: the key from
# the eye's upper left, as Daggerfall's icons are lit, the fill from the right keeping the far side legible
KEY = ((0.55, -0.43, 0.717), 3.4)
FILL = ((-0.8, -0.021, 0.461), 0.55)
AMBIENT = 0.08
# a spoiled food's stages: its colours drawn toward a sick green-grey (`tint` laid on each step's grey, `mix` of the
# way) and darkened, and mould grown over `cover` of it in soft patches `patch` metres across, in the mould's own ramp
SPOIL = {
    'mouldy': {'tint': (0.92, 1.0, 0.8), 'mix': 0.3, 'dark': 0.93, 'cover': 0.3, 'patch': 0.022,
               'mould': [[92, 102, 80], [134, 146, 114], [174, 184, 148], [206, 212, 180], [232, 236, 214]]},
    'rotten': {'tint': (0.84, 1.0, 0.66), 'mix': 0.72, 'dark': 0.76, 'cover': 0.48, 'patch': 0.03,
               'mould': [[28, 32, 20], [50, 56, 34], [76, 84, 52], [104, 114, 72], [136, 146, 98]]},
}
# the light pass's tone: a texel's linear light times this is its place on its ramp (0 darkest, 1 lightest). Linear,
# not the display's curve: a lit sphere then runs from deep shadow (about 0.1) to bright light (about 0.93), as the
# painted icons' spheres did, where the display's curve lifts the shadow to half
EXPOSURE = 1.0


def load_ramps():
    with open(RAMPS_PATH) as fh:
        return {k: np.asarray(v, dtype=np.float64) for k, v in json.load(fh).items()}


RAMPS = load_ramps()


def spoiled(name, stage):
    """Ramp `name` as stage `stage` (SPOIL) draws it, registered under `<name>~<stage>`; and the stage's mould ramp
    under `mould~<stage>`. Gives the spoiled ramp's name."""
    law = SPOIL[stage]
    key = f'{name}~{stage}'
    if key not in RAMPS:
        steps = RAMPS[name]
        grey = steps.mean(axis=1, keepdims=True) * np.asarray(law['tint']) * 1.04
        RAMPS[key] = np.clip((steps * (1 - law['mix']) + grey * law['mix']) * law['dark'], 0, 255)
    RAMPS.setdefault(f'mould~{stage}', np.asarray(law['mould'], dtype=np.float64))
    return key


def along(ramp, tone):
    """A ramp's colours at `tone` (an array, 0 its darkest step, 1 its lightest), between the two nearest steps."""
    t = np.clip(tone, 0.0, 1.0) * (len(ramp) - 1)
    lo = np.floor(t).astype(int)
    hi = np.minimum(lo + 1, len(ramp) - 1)
    f = (t - lo)[..., None]
    return ramp[lo] * (1 - f) + ramp[hi] * f


class Mat:
    """A material: its ramp's name; how rough its surface is and how much of a mirror (`metal`: past about a third a
    surface mirrors the dark round it and reads black, so a metal is a bright, smooth surface with `spec`, not a
    mirror); `glow` the share of its light it gives off itself (an ember, a crystal: its tone never falls below it, and
    its edge is never sunk); `pattern` (other ramp, mask[, dim]), or a list of them laid in order, where another ramp shows - `mask(nodes, links, coord)`
    gives a node socket over the object's own coordinates (metres) whose value over a half is the other ramp (a tiger's
    stripes, a trout's spots), its light times `dim` (a log's rings: its own wood a step darker); `bump` (strength,
    scale) a fine relief that breaks its light (bark, a loaf's crust, weave), `scale` its noise's cycles a metre;
    `steps` snaps its tone to that many even levels, so each flat facet of a cut stone or a crystal is one crisp tone
    and its edges stay sharp, as a painted facet is; `dim` its light times this (alternate facets of one stone a step
    apart, so the cut reads where the light alone would lay two facets alike)."""

    def __init__(self, ramp, rough=0.6, metal=0.0, glow=0.0, pattern=None, bump=None, spec=0.3, steps=0, dim=1.0):
        if ramp not in RAMPS:
            raise KeyError(f'item kit: no ramp "{ramp}"')
        # one pattern, or several laid in order, a later one over an earlier (a pelt's belly, then its stripes)
        self.patterns = [] if not pattern else [pattern] if isinstance(pattern[0], str) else list(pattern)
        for one in self.patterns:
            if one[0] not in RAMPS:
                raise KeyError(f'item kit: no ramp "{one[0]}"')
        self.ramp, self.rough, self.metal, self.glow, self.pattern, self.bump, self.spec, self.steps, self.dim = (
            ramp, rough, metal, glow, pattern, bump, spec, steps, dim)


def _node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for name, v in inputs.items():
        n.inputs[name].default_value = v
    return n


def setup(samples=SAMPLES):
    """A fresh scene: Cycles on the CPU at a fixed seed, one point a sample, a clear ground, the eye and the lights."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.cycles.seed = 7
    sc.cycles.filter_width = 0.01
    sc.cycles.max_bounces = 3
    sc.cycles.use_adaptive_sampling = False
    sc.render.film_transparent = True
    sc.render.dither_intensity = 0.0
    threads = int(os.environ.get('FORGE_THREADS') or 0)
    if threads:
        sc.render.threads_mode, sc.render.threads = 'FIXED', threads
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'OPEN_EXR'
    sc.render.image_settings.color_depth = '32'
    sc.render.image_settings.exr_codec = 'NONE'
    sc.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('world')
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = AMBIENT
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    sc.collection.objects.link(cam)
    sc.camera = cam
    e = math.radians(ELEVATION)
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)
    right, up, fwd = eye_axes()
    for name, ((across, rise, into), energy) in (('key', KEY), ('fill', FILL)):
        toward = across * right + rise * up + into * fwd
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
        light.data.energy = energy
        light.data.angle = math.radians(2.0)
        light.rotation_euler = Vector(tuple(toward)).to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(light)
    return sc


def eye_axes():
    """The eye's right, up and forward (into the picture), in the world."""
    e = math.radians(ELEVATION)
    return (np.array([1.0, 0.0, 0.0]), np.array([0.0, math.sin(e), math.cos(e)]),
            np.array([0.0, math.cos(e), -math.sin(e)]))


class Item:
    """One item's scene: its objects, each of one material. `add` builds an object from a mesh; `render` draws them."""

    def __init__(self, sc, spoil=None, seed=0):
        if spoil is not None and spoil not in SPOIL:
            raise KeyError(f'item kit: no spoil stage "{spoil}"')
        self.sc = sc
        self.spoil = spoil   # a spoiled food's stage (SPOIL), or None
        self.seed = seed
        self.parts = []   # (object, Mat)
        self.mats = []    # the distinct Mats, in order: a material's place is its mark in the flat pass
        self.sparkles = []   # (world point, ramp, arm), laid on the finished picture
        self.span = 1.0      # the item's longest side on screen, metres (set by `frame`)
        self.per = 1.0       # metres a texel (set by `frame`)

    def add(self, mesh, mat, smooth=True, bevel=0.0, subsurf=0, name='part'):
        verts, faces = mesh
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
        me.validate(clean_customdata=False)
        me.update()
        for p in me.polygons:
            p.use_smooth = smooth
        ob = bpy.data.objects.new(name, me)
        self.sc.collection.objects.link(ob)
        if bevel:
            m = ob.modifiers.new('bevel', 'BEVEL')
            m.width, m.segments, m.limit_method = bevel, 2, 'ANGLE'
        if subsurf:
            m = ob.modifiers.new('subsurf', 'SUBSURF')
            m.levels = m.render_levels = subsurf
        if not any(m is mat for m in self.mats):
            self.mats.append(mat)
        self.parts.append((ob, mat))
        return ob

    # --- the two passes' materials ---
    def _lit(self, mat):
        m = bpy.data.materials.new(f'lit-{mat.ramp}')
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes['Principled BSDF']
        # creases and contacts darkened by how much of the world they see (a pot's mouth, where a lid meets its jar)
        occlusion = _node(nt, 'ShaderNodeAmbientOcclusion', Color=(0.8, 0.8, 0.8, 1.0), Distance=AO_REACH * self.span)
        nt.links.new(occlusion.outputs['Color'], b.inputs['Base Color'])
        b.inputs['Roughness'].default_value = mat.rough
        b.inputs['Metallic'].default_value = mat.metal
        b.inputs['Specular IOR Level'].default_value = mat.spec
        if mat.bump:
            strength, scale = mat.bump
            coord = nt.nodes.new('ShaderNodeTexCoord')
            noise = _node(nt, 'ShaderNodeTexNoise', Scale=scale, Detail=3.0)
            nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
            bump = _node(nt, 'ShaderNodeBump', Strength=strength)
            nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
            nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
        return m

    def _flat(self, mat, mark, others):
        """The flat pass's material: its mark as an emitted red, and each pattern's mark (`others`, in its patterns'
        order) where that pattern shows; its distance from the eye, metres, as the green, for the seams."""
        m = bpy.data.materials.new(f'flat-{mat.ramp}')
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        camera = nt.nodes.new('ShaderNodeCameraData')

        def emitted(value):
            colour = nt.nodes.new('ShaderNodeCombineColor')
            colour.inputs['Red'].default_value = value
            nt.links.new(camera.outputs['View Z Depth'], colour.inputs['Green'])
            light = _node(nt, 'ShaderNodeEmission', Strength=1.0)
            nt.links.new(colour.outputs['Color'], light.inputs['Color'])
            return light
        surface = emitted(mark).outputs['Emission']
        coord = nt.nodes.new('ShaderNodeTexCoord')
        for pattern, other in zip(mat.patterns, others):
            fac = pattern[1](nt.nodes, nt.links, coord.outputs['Object'])
            step = _node(nt, 'ShaderNodeMath')
            step.operation = 'GREATER_THAN'
            step.inputs[1].default_value = 0.5
            nt.links.new(fac, step.inputs[0])
            mix = nt.nodes.new('ShaderNodeMixShader')
            nt.links.new(step.outputs['Value'], mix.inputs['Fac'])
            nt.links.new(surface, mix.inputs[1])
            nt.links.new(emitted(other).outputs['Emission'], mix.inputs[2])
            surface = mix.outputs['Shader']
        if self.spoil:
            # the mould: where a noise over the surface, seeded by the row, passes its stage's cover
            law = SPOIL[self.spoil]
            coord = nt.nodes.new('ShaderNodeTexCoord')
            noise = _node(nt, 'ShaderNodeTexNoise', Scale=1.0 / law['patch'], Detail=2.0)
            noise.noise_dimensions = '4D'
            noise.inputs['W'].default_value = (self.seed % 997) * 0.37
            nt.links.new(coord.outputs['Object'], noise.inputs['Vector'])
            step = _node(nt, 'ShaderNodeMath')
            step.operation = 'GREATER_THAN'
            step.inputs[1].default_value = 0.5 + 0.22 * (0.5 - law['cover']) / 0.5
            nt.links.new(noise.outputs['Fac'], step.inputs[0])
            mould = emitted(self.mould_mark)
            grown = nt.nodes.new('ShaderNodeMixShader')
            nt.links.new(step.outputs['Value'], grown.inputs['Fac'])
            nt.links.new(surface, grown.inputs[1])
            nt.links.new(mould.outputs['Emission'], grown.inputs[2])
            surface = grown.outputs['Shader']
        nt.links.new(surface, out.inputs['Surface'])
        return m

    # --- the eye ---
    def frame(self, px, span=None):
        """Set the eye and the work render so the item's longest side on screen is `px` texels (each SUPER samples), or
        so `px` texels hold `span` metres, as every picture of one thing does to share its scale."""
        right, up, fwd = eye_axes()
        dg = bpy.context.evaluated_depsgraph_get()
        pts = []
        for ob, _ in self.parts:
            ev = ob.evaluated_get(dg)
            me = ev.to_mesh()
            mw = np.array(ob.matrix_world)
            co = np.array([v.co for v in me.vertices], dtype=np.float64)
            if len(co):
                pts.append(co @ mw[:3, :3].T + mw[:3, 3])
            ev.to_mesh_clear()
        pts = np.concatenate(pts)
        sx, sy = pts @ right, pts @ up
        measured = max(sx.max() - sx.min(), sy.max() - sy.min())
        if span is not None and measured > span:
            raise ValueError(f'kit: the item spans {measured:.3f}, past the {span} its picture holds')
        span = measured if span is None else span
        per = span / px   # metres a texel
        self.span, self.per = span, per
        w = int(math.ceil((sx.max() - sx.min()) / per)) + 2 * MARGIN
        h = int(math.ceil((sy.max() - sy.min()) / per)) + 2 * MARGIN
        sc = self.sc
        sc.render.resolution_x, sc.render.resolution_y = w * SUPER, h * SUPER
        cam = sc.camera
        cam.data.ortho_scale = max(w, h) * per
        mid = right * (sx.max() + sx.min()) / 2 + up * (sy.max() + sy.min()) / 2
        depth = pts @ fwd
        cam.location = Vector(mid + fwd * (depth.min() - 5.0))
        cam.data.clip_end = depth.max() - depth.min() + 10.0
        return w, h

    def _render(self, path):
        self.sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path, check_existing=False)
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
        bpy.data.images.remove(img)
        os.remove(path)
        return px

    def sparkle(self, point, ramp='diamond', arm=2):
        """A sparkle laid on the finished picture where world `point` shows: a bright texel and a cross of `arm`
        texels round it, its tips a step down, as a perfect stone's glint is drawn. Never sunk at the edge."""
        if ramp not in RAMPS:
            raise KeyError(f'item kit: no ramp "{ramp}"')
        self.sparkles.append((np.asarray(point, dtype=np.float64), ramp, arm))

    def render(self, px, samples=SAMPLES, span=None):
        """The item's picture: (h, w, 4) uint8 rows top first, cut to what it draws, `px` texels on its longest side
        (or holding `span` metres)."""
        w, h = self.frame(px, span)
        # every look a texel may take: each material's ramp, and each pattern's (ramp, dim) as a look of its own
        looks = []
        for m in self.mats:
            if (m.ramp, m.dim, m.glow, m.steps) not in looks:
                looks.append((m.ramp, m.dim, m.glow, m.steps))
        pattern_look = lambda m, one: (one[0], one[2] if len(one) > 2 else 1.0, m.glow, m.steps)
        for m in self.mats:
            for one in m.patterns:
                if pattern_look(m, one) not in looks:
                    looks.append(pattern_look(m, one))
        if self.spoil:
            looks.append((f'mould~{self.spoil}', 1.0, 0.0, 0))
        marks = [(i + 1) / (len(looks) + 1) for i in range(len(looks))]
        mark_of = {look: marks[i] for i, look in enumerate(looks)}
        if self.spoil:
            self.mould_mark = marks[-1]
        lit = {id(m): self._lit(m) for m in self.mats}
        flat = {}
        for m in self.mats:
            others = [mark_of[pattern_look(m, one)] for one in m.patterns]
            flat[id(m)] = self._flat(m, mark_of[(m.ramp, m.dim, m.glow, m.steps)], others)
        tmp = tempfile.mkdtemp(prefix='itemforge-')
        sc = self.sc
        # the light
        for ob, m in self.parts:
            ob.data.materials.clear()
            ob.data.materials.append(lit[id(m)])
        sc.cycles.samples = samples
        sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = AMBIENT
        for name in ('key', 'fill'):
            bpy.data.objects[name].hide_render = False
        light = self._render(os.path.join(tmp, 'light.exr'))
        # the marks
        for ob, m in self.parts:
            ob.data.materials.clear()
            ob.data.materials.append(flat[id(m)])
        sc.cycles.samples = 1
        sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
        for name in ('key', 'fill'):
            bpy.data.objects[name].hide_render = True
        flat_px = self._render(os.path.join(tmp, 'flat.exr'))
        os.rmdir(tmp)
        if self.spoil:   # each look's ramp as the stage draws it
            looks = [(name if name.startswith('mould~') else spoiled(name, self.spoil), *rest) for name, *rest in looks]
        return self.grade(light, flat_px, marks, looks, w, h)

    def _texel(self, point, w, h):
        """Where world `point` shows in the work render, in texels (x right, y down)."""
        right, up, _ = eye_axes()
        cam = self.sc.camera
        per = cam.data.ortho_scale / max(w, h)
        rel = point - np.asarray(cam.location)
        return w / 2 + (rel @ right) / per, h / 2 - (rel @ up) / per

    def grade(self, light, flat, marks, looks, w, h):
        """Each texel from its SUPER x SUPER samples: drawn where most samples are, the look most of them show, their
        light; then its ramp at that light, the edge away from the light sunk, the sparkles laid on, the whole spread,
        cut to what it draws."""
        S = SUPER
        alpha = light[..., 3] >= 0.5
        lum = EXPOSURE * (0.2126 * light[..., 0] + 0.7152 * light[..., 1] + 0.0722 * light[..., 2])
        marks_arr = np.asarray(marks)
        mark = np.argmin(np.abs(flat[..., 0][..., None] - marks_arr), axis=-1)
        mark = np.where(alpha & (flat[..., 3] >= 0.5), mark, -1)
        blk = lambda a: a.reshape(h, S, w, S).transpose(0, 2, 1, 3).reshape(h, w, S * S)
        a_b, m_b, l_b = blk(alpha), blk(mark), blk(lum)
        drawn = a_b.sum(axis=-1) * 2 >= S * S
        counts = np.stack([(m_b == i).sum(axis=-1) for i in range(len(looks))], axis=-1)
        which = np.argmax(counts, axis=-1)
        drawn &= counts.max(axis=-1) > 0
        sel = m_b == which[..., None]
        tone = (l_b * sel).sum(axis=-1) / np.maximum(sel.sum(axis=-1), 1)
        depth = np.where(sel, blk(flat[..., 1]), np.inf).min(axis=-1)   # the texel's nearest sample of its look
        dims = np.asarray([look[1] for look in looks])[which]
        glow = np.asarray([look[2] for look in looks])[which]
        # a seam: a texel lies under a part before it where it is farther from the eye than its neighbour's surface,
        # carried on one texel by that surface's own slope, by more than SEAM_GAP. A level top seen from above steps
        # cot(elevation) texels nearer at each row down; that is its slope, never a seam, so a slope that steep is
        # still a slope, however low the eye. Where the neighbour's surface gives no slope (it is one texel wide), the
        # jump must pass two such steps as well
        gap = SEAM_GAP * self.span
        step = 2 * self.per * min(max(1.0, 1.0 / math.tan(math.radians(max(ELEVATION, 0.1)))), STEEPEST)
        far = np.pad(np.where(drawn, depth, np.inf), 2, constant_values=np.inf)
        under = np.zeros_like(drawn)
        with np.errstate(invalid='ignore'):   # a clear texel beside a clear one: inf less inf, never a seam
            for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                beside = far[2 + dy:2 + dy + h, 2 + dx:2 + dx + w]
                beyond = far[2 + 2 * dy:2 + 2 * dy + h, 2 + 2 * dx:2 + 2 * dx + w]
                sloped = np.isfinite(beyond) & (np.abs(beside - beyond) < max(gap, step))
                carried = np.where(sloped, 2 * beside - beyond, beside)
                need = np.where(sloped, gap, np.maximum(gap, step))
                under |= np.isfinite(beside) & (depth - carried > need)
        seam = drawn & under & (glow <= 0)
        tone = glow + (1 - glow) * tone * dims * np.where(seam, SEAM_TONE, 1.0)
        steps = np.asarray([look[3] for look in looks])[which]
        faceted = steps > 0
        tone = np.where(faceted, np.round(np.clip(tone, 0, 1) * np.maximum(steps - 1, 1)) / np.maximum(steps - 1, 1), tone)
        out = np.zeros((h, w, 4), dtype=np.float64)
        for i, (name, *_) in enumerate(looks):
            on = drawn & (which == i)
            if on.any():
                out[on, :3] = along(RAMPS[name], tone[on])
        # the edge away from the light: a drawn texel with clear ground to its right or below it, where the shape runs
        # at least three texels deep behind it. A stroke one or two texels across (a wire, a stem, a line) stays lit
        # along its length, as a painted stroke does, or the sunk edge would swallow it whole
        pad = np.pad(drawn, 3, constant_values=False)
        at = lambda dy, dx: pad[3 + dy:3 + dy + h, 3 + dx:3 + dx + w]
        right_open = ~at(0, 1) & at(0, -1) & at(0, -2)
        below_open = ~at(1, 0) & at(-1, 0) & at(-2, 0)
        away = drawn & (right_open | below_open) & (glow <= 0)
        for i, (name, *_) in enumerate(looks):
            on = away & (which == i)
            if on.any():
                out[on, :3] = RAMPS[name][0] * (1 - SHADOW_EDGE)
        for point, name, arm in self.sparkles:
            x, y = (int(math.floor(v)) for v in self._texel(point, w, h))
            ramp = RAMPS[name]
            for dx, dy, t in [(0, 0, 1.0)] + [(sx * r, sy * r, 0.75 if r == arm else 1.0)
                                               for r in range(1, arm + 1) for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1))]:
                if 0 <= x + dx < w and 0 <= y + dy < h:
                    out[y + dy, x + dx, :3] = along(ramp, np.asarray(t))
                    drawn[y + dy, x + dx] = True
        out[..., :3] = np.clip(np.round(128 + (np.round(out[..., :3]) - 128) * CONTRAST), 0, 255)
        out[..., 3] = np.where(drawn, 255, 0)
        out[~drawn, :3] = 0
        ys, xs = np.nonzero(drawn)
        if not len(ys):
            raise ValueError('item kit: the item drew nothing')
        return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8)


def write_png(path, pic):
    """Write (h, w, 4) uint8 rows as an RGBA PNG."""
    import struct
    import zlib
    h, w = pic.shape[:2]
    raw = b''.join(b'\x00' + pic[y].tobytes() for y in range(h))

    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
