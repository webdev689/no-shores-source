"""Builds every dungeon style's modules in Blender, checks each against its envelope, and writes the packs.

    <python with bpy> -I tools/dungeon/build.py --out DIR [--style S ...] [--preview [flat]] [--pictures DIR]

For each style (all of kits.json's by default) it runs styles/<style>.py's build(kit), refuses a missing or extra
name, and checks every module (envelope.py). It writes DIR/<style>.modules for each style that passes, DIR/modules.blend
with every style in a collection of its own, and with --preview DIR/previews/<style>.png: in the game's pictures by
torchlight (from --pictures, else painted by previewPictures.ts into DIR/pictures), or flat parts. It fails listing
every problem. Point --out outside the repository: packs, models and renders are kept out of git.
"""
import argparse
import importlib
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
# Run with -I, the script's own folder is not on the path: the kit and the styles sit beside it.
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import catalog  # noqa: E402
import envelope  # noqa: E402
import export  # noqa: E402
import kit  # noqa: E402
import preview  # noqa: E402


def named(style, made):
    """The style's objects by module name, in the pack's order, and the problems with what build(kit) gave."""
    problems, found, seen = [], {}, {}
    if not isinstance(made, dict):
        return {}, [f'{style}: build(kit) gave {type(made).__name__}, not {{name: object}}']
    for key, item in made.items():
        module = f'{style}.{key}' if key in catalog.PIECES else key
        if not isinstance(item, bpy.types.Object) or item.type != 'MESH':
            problems.append(f'{module}: {item!r} is not a mesh object')
        elif item.name in seen:
            problems.append(f'{module}: the same object as {seen[item.name]}: give each its own (kit.copy)')
        else:
            seen[item.name] = module
            found[module] = item
    required = catalog.required(style)
    problems += [f'{module}: missing' for module in required if module not in found]
    problems += [f'{module}: no module of {style} (kits.json, landmarks.json)' for module in found
                 if module not in required]
    return {module: found[module] for module in required if module in found}, problems


def tidy(collection, kept):
    """Removes what a style left in its collection besides its modules, saying what went."""
    left = [item for item in collection.objects if item not in kept]
    if left:
        print(f'{collection.name}: removed {len(left)} object(s) in no module: {", ".join(item.name for item in left)}')
    for item in left:
        bpy.data.objects.remove(item)


def build_style(style):
    """A style's modules, their triangles, and the problems with them."""
    collection = kit.start(style)
    made = importlib.import_module(f'styles.{style}').build(kit)
    modules, problems = named(style, made)
    tidy(collection, set(modules.values()))
    for module, item in modules.items():
        item.name = item.data.name = module
    depsgraph = bpy.context.evaluated_depsgraph_get()
    triangles = {}
    for module, item in modules.items():
        try:
            triangles[module] = export.gather(item, depsgraph)
        except ValueError as refusal:
            # The refusal names the object, which is named by its module.
            problems.append(str(refusal))
            continue
        problems += envelope.problems(module, [[corner[0] for corner in corners] for corners in triangles[module]])
    return modules, triangles, problems


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--out', required=True, help='the folder to write into, outside the repository')
    parser.add_argument('--style', action='append', choices=list(catalog.STYLES), help='a style (repeat for more)')
    parser.add_argument('--preview', nargs='?', const='pictures', choices=['pictures', 'flat'],
                        help="render a contact sheet a style, in the game's pictures (the default) or flat parts")
    parser.add_argument('--pictures', help="previewPictures.ts's folder, for pictures of another climate or season")
    args = parser.parse_args()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)
    styles = args.style or list(catalog.STYLES)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    problems, built = [], {}
    for style in styles:
        began = time.time()
        modules, triangles, found = build_style(style)
        problems += found
        built[style] = (modules, triangles)
        if not found:
            data = export.pack(style, [(module, triangles[module]) for module in modules])
            with open(os.path.join(out, f'{style}.modules'), 'wb') as file:
                file.write(data)
            print(f'{style}: {len(modules)} modules, {sum(map(len, triangles.values()))} triangles, '
                  f'{len(data) / 1024:.0f} KiB ({time.time() - began:.1f} s)', flush=True)
        else:
            print(f'{style}: {len(found)} problem(s), no pack written', flush=True)
    preview.paint()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, 'modules.blend'), compress=True)
    if args.preview:
        folder = args.pictures or os.path.join(out, 'pictures')
        if args.preview == 'pictures' and not args.pictures:
            painter = ['node', os.path.join(HERE, 'previewPictures.ts'), folder]
            subprocess.run(painter + [word for style in styles for word in ('--style', style)], check=True)
        for style, (modules, triangles) in built.items():
            counts = {module: len(triangles.get(module, ())) for module in modules}
            pictures = None
            if args.preview == 'pictures':
                pictures = preview.read_pictures(os.path.join(folder, f'{style}.pictures'))
            path = preview.sheet(style, modules, counts, os.path.join(out, 'previews'), pictures)
            print(f'{style}: {path}', flush=True)
    if problems:
        sys.exit('\n'.join([f'{len(problems)} problem(s):'] + problems))


if __name__ == '__main__':
    main()
