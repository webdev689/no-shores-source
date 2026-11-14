"""The armour sets seen at once: each set worn whole on a body at rest, from the views asked, on one sheet, for judging
a set's design by eye before any layer is drawn. Each cell is drawn twice: large (`--zoom` times the sprite's scale),
where a plate's shape reads, and at the sprite's own scale beside it, where only what a sprite shows survives.

    python -I tools/sprite-forge/armourview.py --sets Iron,Steel --body male --views 0,1,2,4 --out /tmp/armour.png

The metal is drawn in a tint near its set's colour (`TINT`), never graded or dyed: the layers' grade and the game's
dye are what a player sees (layers.py, forgeLayers.js)."""
import argparse
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

import armour  # noqa: E402
import layers  # noqa: E402
import stage  # noqa: E402

# a set's metal near its ramp's middle, for the eye alone (linear RGB is set from these sRGB bytes)
TINT = {'Iron': (120, 112, 104), 'Steel': (150, 156, 166), 'Silver': (196, 204, 214), 'Elven': (206, 160, 74),
        'Dwarven': (166, 118, 70), 'Mithril': (110, 140, 190), 'Adamantium': (96, 100, 124), 'Ebony': (56, 52, 60),
        'Orcish': (96, 110, 60), 'Daedric': (60, 34, 32), 'Fighters': (186, 190, 204), 'Knights': (214, 218, 230),
        'Chain': (140, 142, 148)}


def _lin(c):
    c = np.asarray(c, float) / 255.0
    return tuple(np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4))


def tint(material):
    """Lay the set's tint on its grey metal: each `metal.<set>.*` material's base colour, its grey kept as its light."""
    want = TINT.get(material)
    if not want:
        return
    lin = _lin(want)
    for m in bpy.data.materials:
        if not m.name.startswith((f'metal.{material}.', f'armourmail.{material}')) or not m.node_tree:
            continue
        for node in m.node_tree.nodes:
            if node.type != 'BSDF_PRINCIPLED':
                continue
            base = node.inputs['Base Color']
            if base.is_linked:
                continue
            g = sum(base.default_value[:3]) / 3.0
            base.default_value = (*(min(1.0, c * g / 0.4) for c in lin), 1.0)


def rest_pose(fighter, view):
    """The idle's first keyed frame in `view`: the pose a set is judged in."""
    p, gear = layers.pose('idle', 0, view, layers.PER)
    fighter.place(p, {k: g for k, g in gear.items() if k != 'axe'})
    fighter.show(fighter.axe, False)


def render(tmp, zoom):
    """One render at `zoom` times the sprite's scale, on a backdrop."""
    w0, h0 = stage.WORK_W, stage.WORK_H
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = int(w0 * zoom), int(h0 * zoom)
    out = stage.render_rgba(tmp)
    sc.render.resolution_x, sc.render.resolution_y = w0, h0
    im = Image.fromarray(out)
    bg = Image.new('RGBA', im.size, (58, 66, 58, 255))
    bg.alpha_composite(im)
    box = im.getbbox()
    return bg, box


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sets', default=','.join(armour.SETS))
    ap.add_argument('--body', default='male', choices=('male', 'female'))
    ap.add_argument('--views', default='0,1,2,4')
    ap.add_argument('--zoom', type=float, default=3.0)
    ap.add_argument('--samples', type=int, default=16)
    ap.add_argument('--pieces', default=','.join(armour.PIECES))
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    views = [int(v) for v in args.views.split(',')]
    pieces = tuple(args.pieces.split(','))
    tmp = os.path.join(tempfile.mkdtemp(), 'a.png')
    rows = []
    for material in args.sets.split(','):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        stage.setup(args.samples)
        _, layers.PER = layers.load_body(args.body)
        stage.set_lights()
        A = layers.Dressed(args.body)
        mat, skins = armour.dress(A.M, A.skins[0], A.parts, material, pieces=pieces, woman=args.body == 'female')
        A.skins += skins
        if 'gauntlets' in pieces:
            A.covers = armour.gauntlet_hands(A.hands, mat, armour.STYLE[material])
        for sk in A.skins[1:]:
            if sk.ob.name in ('face', 'hood', 'paint.face_hooded'):
                sk.ob.hide_render = True
        tint(material)
        cells = []
        for v in views:
            rest_pose(A, v)
            big, box = render(tmp, args.zoom)
            small, _ = render(tmp, 1.0)
            cells.append((big, box, small))
        # crop every cell of the row to the union of its boxes, with a margin
        boxes = [b for _, b, _ in cells if b]
        x0 = min(b[0] for b in boxes) - 8
        y0 = min(b[1] for b in boxes) - 8
        x1 = max(b[2] for b in boxes) + 8
        y1 = max(b[3] for b in boxes) + 8
        z = args.zoom
        parts = []
        for big, _, small in cells:
            parts.append(big.crop((x0, y0, x1, y1)))
            s = small.crop((int(x0 / z), int(y0 / z), int(x1 / z) + 1, int(y1 / z) + 1))
            parts.append(s.resize((s.width * 2, s.height * 2), Image.NEAREST))
        h = max(p.height for p in parts) + 18
        row = Image.new('RGBA', (sum(p.width for p in parts) + 4 * len(parts), h), (30, 30, 34, 255))
        x = 0
        for p in parts:
            row.paste(p, (x, 18))
            x += p.width + 4
        ImageDraw.Draw(row).text((4, 3), f'{material} ({args.body})', fill=(240, 240, 240, 255))
        rows.append(row)
        print(material, flush=True)
    sheet = Image.new('RGBA', (max(r.width for r in rows), sum(r.height for r in rows)), (30, 30, 34, 255))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(args.out)


if __name__ == '__main__':
    main()
