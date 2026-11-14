"""A pose seen at once: each frame of the named animations on the bare body, with its props, from the views asked,
on one sheet at few samples, for keying a pose by eye before any layer is drawn in it.

    python -I tools/sprite-forge/poseview.py --anims sit,crouch --views 0,2 --out /tmp/poses.png"""
import argparse
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from PIL import Image  # noqa: E402

import attacks  # noqa: E402
import forge  # noqa: E402
import people  # noqa: E402
import playing  # noqa: E402
import poses  # noqa: E402
import props3p  # noqa: E402
import stage  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--anims', required=True)
    ap.add_argument('--views', default='0,2,4')
    ap.add_argument('--out', required=True)
    ap.add_argument('--weapon', default='', help='a weapon in the right fist where the pose holds one: axe or sword')
    args = ap.parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(16)
    fighter = forge.Fighter('naked', weapon=args.weapon or 'axe')
    fighter.show(fighter.axe, False)
    props = props3p.build_all()
    played = playing.build_instruments()
    tmp = os.path.join(tempfile.mkdtemp(), 'p.png')
    rows = []
    for anim in args.anims.split(','):
        n = {**people.PEOPLE, **playing.PLAY, **attacks.ATTACKS}.get(anim, 1)
        for frame in range(n):
            cells = []
            for v in (int(x) for x in args.views.split(',')):
                p, gear = poses.ANIMS[anim](frame, v, forge.VIEW_YAW[v])
                fighter.place(p, {k: g for k, g in gear.items() if k != 'axe' or args.weapon})
                fighter.show(fighter.axe, bool(args.weapon) and gear.get('axe') is not None)
                for name, obs in props.items():
                    m = gear.get('props', {}).get(name)
                    for ob in obs:
                        ob.hide_render = m is None
                        if m is not None:
                            ob.matrix_world = m
                held = people.PLAYS.get(anim) or playing.KIND_OF.get(anim)
                for kind, obs in played.items():
                    for ob in obs:
                        ob.hide_render = kind != held or gear.get('axe') is None
                        if kind == held and gear.get('axe') is not None:
                            ob.matrix_world = gear['axe']
                cut = Image.fromarray(stage.render_rgba(tmp))
                bg = Image.new('RGBA', cut.size, (70, 78, 90, 255))
                bg.alpha_composite(cut)
                cells.append(bg)
            row = Image.new('RGBA', (sum(c.width for c in cells), cells[0].height))
            x = 0
            for c in cells:
                row.paste(c, (x, 0))
                x += c.width
            rows.append(row)
            print(anim, frame, flush=True)
    sheet = Image.new('RGBA', (max(r.width for r in rows), sum(r.height for r in rows)))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(args.out)


if __name__ == '__main__':
    main()
