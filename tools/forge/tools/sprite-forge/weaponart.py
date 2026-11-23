"""The weapons drawn large, for the page's weapon rows and gear screens: each look a loadout's hand takes, its model
alone at four times the man's pixels a metre (layers.py), laid level with its business end to the right, seen square
from the front. It is made as the man's layer in hand is (its size, a bow bent and strung as it is braced), lit by the
forge's lights, its edges hard and its alpha cut at a half, as the stage's are; then graded as that layer is, its
set's own grades and all, and a staff's, a bow's and a shield's metal laid grey on the steel band, and a blade's,
a head's or a haft's hilt, guard and trim marked (stage.py `mark_trim`). So the page lays the same dye and faction
ramps on it as on the layer, and snaps it to the same palette.

    python -I tools/sprite-forge/weaponart.py --out public/art/weapons [--looks sword_iron,bow_long_elven]

Writes `<out>/<layer>.png`, cut to what it draws. A left hand's twin (`dagger_iron_l`) is its right hand's picture.
A greatsword is its metal's sword. `--check` checks the layout and the looks without rendering."""
import argparse
import math
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import layers  # noqa: E402
import armour  # noqa: E402
import blunts3p  # noqa: E402
import bows  # noqa: E402
import daggers3p  # noqa: E402
import dollrender  # noqa: E402
import fit  # noqa: E402
import forge  # noqa: E402
import gear  # noqa: E402
import guns3p  # noqa: E402
import materials  # noqa: E402
import shape  # noqa: E402
import shields3p  # noqa: E402
import stage  # noqa: E402
from body import coords  # noqa: E402

BODY = 'male'
SIZE = 4   # times the man's pixels a metre
SAMPLES = 64   # the stage's own
MARGIN = 2   # clear texels round the weapon in the work render, so nothing it draws touches the frame's edge
# frame axes onto the world's (rows x, y, z; the eye looks along +Y, +X its right, +Z its up): a weapon's business end
# (+Z) to the right, its flat (XZ) to the eye, its +X down: a flail's chain hangs, a gun's grip and a shield's foot
# below. A bow's string (+Y, toward which its tips bend) hangs below its arc; a crossbow is aimed along its own +X,
# its top (+Z) tipped toward the eye by CROSSBOW_TILT so its prod reads; a shield's face (-Y) looks at the eye
CROSSBOW_TILT = math.radians(35.0)
LEVEL = ((0.0, 0.0, 1.0), (0.0, 1.0, 0.0), (-1.0, 0.0, 0.0))
TURNS = {'bow': ((0.0, 0.0, 1.0), (-1.0, 0.0, 0.0), (0.0, -1.0, 0.0)),
         'crossbow': ((1.0, 0.0, 0.0), (0.0, math.cos(CROSSBOW_TILT), -math.sin(CROSSBOW_TILT)),
                      (0.0, math.sin(CROSSBOW_TILT), math.cos(CROSSBOW_TILT))),
         'shield': ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))}
# a flail's chain swung (blunts3p.py `make`: swing, curl, sway) straight down the picture: along its frame's +X
HANGING = (90.0, 0.0, 0.0)
# the layers the figure lays its metal's ramp on (layers.py `build_layers`, `dye='metal'`), and the classes made grey
DYED = ('staff', 'bow', 'shield')
METAL_CLASSES = ('metal', 'mail', 'armourmail', 'bowmetal')


def make_of(layer):
    """A bow's length or a shield's kind: its layer's second word (`bow_short_iron`, `shield_tower_plain`)."""
    return layer.split('_')[1]


def looks():
    """Every look a loadout's hand takes (client gear.ts `gearHands`), in every metal the forge makes it in: its layer
    name to (kind, metal)."""
    out = {}
    for metal in bows.METALS:
        low = metal.lower()
        for kind in ('sword', 'dagger', 'mace', 'flail', 'warhammer', 'axe', 'staff'):
            out[f'{kind}_{low}'] = (kind, metal)
        for make in gear.BOW_KINDS:
            out[f'bow_{make}_{low}'] = ('bow', metal)
        for make in shields3p.KINDS:
            out[f'shield_{make}_{low}'] = ('shield', metal)
    for make in shields3p.KINDS:
        out[f'shield_{make}_plain'] = ('shield', None)
    for metal in layers.SHORT_METALS:
        out[f'sword_{metal.lower()}_short'] = ('sword', metal)
    for metal in gear.CROSSBOW_METALS:
        out[f'crossbow_{metal}'] = ('crossbow', metal)
    for gun in guns3p.HELD:
        out[gun] = ('gun', None)
    return out


def turn_of(kind):
    """The frame's turn onto the world for `kind`, 3 x 3."""
    return np.array(TURNS.get(kind, LEVEL))


def build(layer, kind, metal, palette):
    """`layer`'s objects in its own frame, made and sized as the man's layer in hand is (layers.py `build_layers`,
    `Bare.arm_held`): a sword and an axe sized as the class weapon, a bow bent and strung braced, a crossbow at the
    length a fist holds it."""
    if kind == 'sword':
        obs = gear.build_sword(palette, metal, short=layer.endswith('_short'))
    elif kind == 'axe':
        obs = gear.build_axe(palette, metal)
    elif kind == 'dagger':
        obs = daggers3p.build(metal)
    elif kind in blunts3p.KINDS:
        obs = dollrender._blunt(kind, metal, HANGING if kind == 'flail' else None)
    elif kind == 'staff':
        obs = gear.build_staff(palette, metal)
    elif kind == 'bow':
        obs = gear.build_metal_bow(palette, metal, make_of(layer))
    elif kind == 'crossbow':
        obs = gear.build_crossbow(metal)
    elif kind == 'gun':
        obs = guns3p.build(layer)
    else:
        obs = shields3p.build(make_of(layer), metal, palette, armour.palette(metal or 'Iron', palette))
    for ob in obs:
        if kind == 'crossbow':
            ob.matrix_world = Matrix.Scale(gear.CROSSBOW_LEN / gear.CROSSBOW_MODEL_LEN, 4) @ ob.matrix_world
            continue
        ob.data.vertices.foreach_set('co', shape.transform(ob.name, coords(ob.data)).ravel())
        ob.data.update()
    if kind == 'bow':   # its string from tip to tip, as the figure's braced bow is strung (forge.py `place`)
        tip, foot = gear.bow_tips(0.0, make_of(layer))
        obs.append(gear.string_mesh(palette, tip, (tip + foot) / 2, foot))
    return obs


def world_points(obs):
    """The evaluated objects' vertices in the world, (n, 3)."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for ob in obs:
        evaluated = ob.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        local = np.array([vertex.co[:] for vertex in mesh.vertices], dtype=np.float64).reshape(-1, 3)
        evaluated.to_mesh_clear()
        matrix = np.array(ob.matrix_world)
        points.append(local @ matrix[:3, :3].T + matrix[:3, 3])
    return np.concatenate(points)


def framed(points, pixels_a_metre, margin=MARGIN):
    """The work frame round world `points` seen along +Y: its even width and height in pixels, and the world point
    its middle looks at."""
    low, high = points.min(axis=0), points.max(axis=0)
    width = 2 * math.ceil(((high[0] - low[0]) * pixels_a_metre + 2 * margin) / 2)
    height = 2 * math.ceil(((high[2] - low[2]) * pixels_a_metre + 2 * margin) / 2)
    return width, height, (low + high) / 2


def material_ids(obs, classify):
    """Each work pixel's material class, the nearest surface over its centre's (fit.py `rasterize`), as the figure's
    layer reads its grade by."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    vertices, triangles, classes, base = [], [], [], 0
    for ob in obs:
        evaluated = ob.evaluated_get(depsgraph)
        local, faces, kinds, _ = fit.triangles(evaluated.to_mesh(), classify)
        evaluated.to_mesh_clear()
        matrix = np.array(ob.matrix_world)
        vertices.append(local @ matrix[:3, :3].T + matrix[:3, 3])
        triangles.append(faces + base)
        classes.append(kinds)
        base += len(local)
    across, down, depth = fit.project(np.concatenate(vertices))
    return fit.rasterize(across, down, depth, np.concatenate(triangles), np.concatenate(classes), stage.WORK_W,
                         stage.WORK_H)


def graded(work, ids, names, layer, dyed):
    """The work render graded as the figure's layer is (layers.py `render`, `set_graded`): its set's own grades over
    the body's, and a dyed layer's metal laid grey on the steel band for the page's ramp."""
    # Its set is the last word of its name but a short sword's own (`sword_orcish_short`).
    own = armour.SET_GRADE.get({name.lower(): name for name in armour.SETS}.get(
        layer.removesuffix('_short').rsplit('_', 1)[-1]), {})
    kept = dict(forge.GRADE)
    forge.GRADE.update(own)
    try:
        work = forge.grade_frame(work, ids, names, 0)
        if dyed:
            ramped = tuple(name for name in METAL_CLASSES if 'ramp' in (forge.GRADE.get(name) or {}))
            work = layers.dyeable(work, ids, names, tuple(c for c in METAL_CLASSES if c not in ramped))
            if ramped:
                work = layers.despeck(work, ids, names, ramped)
    finally:
        forge.GRADE.clear()
        forge.GRADE.update(kept)
    return work


def render(layer, kind, metal, palette, pixels_a_metre, tmp):
    """`layer` drawn large: (height, width, 4) uint8 cut to what it draws."""
    obs = build(layer, kind, metal, palette)
    turn = Matrix([list(row) + [0.0] for row in turn_of(kind)] + [[0.0, 0.0, 0.0, 1.0]])
    for ob in obs:
        ob.matrix_world = turn @ ob.matrix_world
    width, height, middle = framed(world_points(obs), pixels_a_metre)
    for ob in obs:
        ob.matrix_world = Matrix.Translation(-Vector(middle)) @ ob.matrix_world
    stage.resize(width, height, below=height // 2)
    work = stage.render_rgba(tmp)
    names = sorted({m.name.split('.')[0] for ob in obs for m in ob.data.materials if m})
    ids_of = {name: index + 1 for index, name in enumerate(names)}
    classify = lambda m: ids_of.get(m.name.split('.')[0], 0) if m else 0   # noqa: E731
    ids = material_ids(obs, layers.trim_classify(classify) if layers.TRIMMED.match(layer) else classify)
    trim, ids = ids < 0, np.abs(ids)   # its hilt, guard and trim, marked as the figure's layer marks them
    work = graded(work, ids, names, layer, kind in DYED)
    if trim.any():
        work = stage.mark_trim(work, stage.edged_trim(trim, ids > 0, work[..., 3] > 0))
    for ob in obs:
        bpy.data.objects.remove(ob, do_unlink=True)
    rows, columns = np.nonzero(work[..., 3])
    return work[rows.min():rows.max() + 1, columns.min():columns.max() + 1]


def check():
    """The layout and the looks, without rendering: each turn a rotation that lays the business end to the right (a
    shield's own up kept), and every look the client's hands reach drawn."""
    for kind in ('sword', 'bow', 'crossbow', 'shield'):
        turn = turn_of(kind)
        assert np.allclose(turn @ turn.T, np.eye(3)) and np.isclose(np.linalg.det(turn), 1.0), kind
    assert np.allclose(turn_of('sword') @ (0, 0, 1), (1, 0, 0)), 'a blade points right'
    assert np.allclose(turn_of('sword') @ (1, 0, 0), (0, 0, -1)), "a flail's chain hangs down"
    assert np.allclose(turn_of('bow') @ (0, 1, 0), (0, 0, -1)), "a bow's string below its arc"
    assert np.allclose(turn_of('crossbow') @ (1, 0, 0), (1, 0, 0)), 'a crossbow aims right'
    assert np.allclose(turn_of('shield') @ (0, -1, 0), (0, -1, 0)), "a shield's face to the eye"
    width, height, middle = framed(np.array([[-0.5, 0.0, -0.05], [0.5, 0.1, 0.05]]), 100.0)
    assert (width, height) == (104, 14) and np.allclose(middle, (0.0, 0.05, 0.0)), (width, height, middle)
    drawn = looks()
    every = [f'{kind}_{metal.lower()}' for kind in ('sword', 'dagger', 'mace', 'flail', 'warhammer', 'axe', 'staff')
             for metal in bows.METALS]
    every += [f'crossbow_{metal}' for metal in gear.CROSSBOW_METALS] + list(guns3p.HELD)
    every += [f'bow_{make}_{m.lower()}' for make in gear.BOW_KINDS for m in bows.METALS]
    every += [f'shield_{make}_{(m or "plain").lower()}' for make in shields3p.KINDS for m in shields3p.METALS]
    every += [f'sword_{m.lower()}_short' for m in layers.SHORT_METALS]
    assert set(every) <= set(drawn), sorted(set(every) - set(drawn))
    assert set(daggers3p.METALS) == set(blunts3p.METALS) == set(bows.METALS), 'a dagger and a mace in every metal'
    import metals
    trims = ('blade.Elven', 'haft.Ebony.black', 'edge.Ebony.trim', 'haft.Elven.dark')
    plain = ('steel.Elven.blade', 'edge.Daedric.glow', 'edge.Daedric.blade_glow', 'wood.Iron', 'blade')
    assert all(map(metals.is_trim, trims)) and not any(map(metals.is_trim, plain)), 'a hilt, never a blade or glow'
    assert layers.TRIMMED.match('sheath_dagger_ebony') and not layers.TRIMMED.match('shield_kite_elven')
    marked = stage.mark_trim(np.array([[[9, 9, 9, a] for a in (255, 254, 100, 255)]], np.uint8),
                             np.array([[True, False, True, False]]))
    assert marked[0, :, 3].tolist() == [254, 255, 100, 255], 'trim marked where drawn, and nothing else at its alpha'
    print(f'weaponart: the layout and {len(drawn)} looks check')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--out', default='public/art/weapons')
    parser.add_argument('--looks', default='', help='only these layers, by name')
    parser.add_argument('--samples', type=int, default=SAMPLES)
    parser.add_argument('--check', action='store_true', help='check the layout and the looks, and render nothing')
    args = parser.parse_args()
    if args.check:
        check()
        return
    layers.load_body(BODY)   # the man's proportions, tints, lights and grades: those his layers in hand are drawn in
    forge.GRADE.setdefault('leather', armour.LEATHER_GRADE)   # a bow's or staff's grip, as the figure's weapon run
    pixels_a_metre = stage.PX_PER_M * shape.SHAPE['scale'] * SIZE
    stage.ELEVATION = 0.0
    stage.PX_PER_M = pixels_a_metre
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(args.samples)
    palette = materials.palette()
    wanted = {name for name in args.looks.split(',') if name}
    os.makedirs(args.out, exist_ok=True)
    tmp = os.path.join(tempfile.mkdtemp(), 'weapon.png')
    started = time.time()
    drawn = 0
    for layer, (kind, metal) in looks().items():
        if wanted and layer not in wanted:
            continue
        picture = render(layer, kind, metal, palette, pixels_a_metre, tmp)
        stage.write_png(os.path.join(args.out, f'{layer}.png'), picture)
        drawn += 1
        print(f'{layer}: {picture.shape[1]} x {picture.shape[0]}', flush=True)
    print(f'weaponart: {drawn} weapons at {pixels_a_metre:.1f} px a metre in {time.time() - started:.0f} s')


if __name__ == '__main__':
    main()
