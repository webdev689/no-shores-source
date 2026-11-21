"""Builds every module in Blender and writes what the game reads of it.

    python -I tools/modules/bake.py <folder>

Each surface group is a mesh file in the folder named by its hash, as R2 names it (`modules/<sha-256>.mesh`): a
vertex count and a triangle count (two little-endian u32), then each vertex's position in the game's frame (3 floats)
and its normal (3 signed bytes and a zero), then each triangle's three vertex numbers (u32). The manifest,
content/modules/modules.json, names R2's base and each module's size, parts, sockets and groups; `publish.py`
uploads the meshes it names.
"""
import hashlib
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import catalogue  # noqa: E402
import kit  # noqa: E402

sys.path.insert(0, os.path.dirname(HERE))
from r2 import PUBLIC  # noqa: E402

MANIFEST = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'content', 'modules', 'modules.json')

# A module's triangles at most, every group together: it is drawn near the eye with the city's solids.
MOST_TRIANGLES = 32000


def snorm(value):
    return max(-127, min(127, round(value * 127)))


def encoded(group):
    """A surface group's mesh file."""
    out = [struct.pack('<2I', len(group['vertices']), len(group['triangles']))]
    for (x, y, z), (nx, ny, nz) in group['vertices']:
        out.append(struct.pack('<3f4b', x, y, z, snorm(nx), snorm(ny), snorm(nz), 0))
    for triangle in group['triangles']:
        out.append(struct.pack('<3I', *triangle))
    return b''.join(out)


def baked(name):
    """One module built and exported: its manifest entry and its mesh files' bytes by key."""
    kit.reset()
    module = kit.Module(name, catalogue.SEEDS[name])
    catalogue.BUILDERS[name](module)
    made = kit.exported(module)
    files = {}
    groups = []
    for material, group in made['groups'].items():
        data = encoded(group)
        key = f'modules/{hashlib.sha256(data).hexdigest()}.mesh'
        files[key] = data
        groups.append(dict(material=material, mesh=key, triangles=len(group['triangles'])))
    total = sum(group['triangles'] for group in groups)
    if total > MOST_TRIANGLES:
        sys.exit(f'{name}: {total} triangles, over {MOST_TRIANGLES}')
    sockets = [dict(socket, at=written(socket['at']), facing=written(socket['facing'])) for socket in made['sockets']]
    entry = dict(name=name, size=made['size'], parts=[written(part) for part in made['parts']], sockets=sockets,
                 groups=groups)
    if made['pads']:
        entry['pads'] = [written(pad) for pad in made['pads']]
    return entry, files


def written(values, digits=3):
    """Numbers as the manifest writes them: to the millimetre, a zero without its sign, the same on every machine."""
    return [round(value, digits) + 0.0 for value in values]


def main():
    folder = sys.argv[1]
    os.makedirs(os.path.join(folder, 'modules'), exist_ok=True)
    entries = []
    for name in catalogue.BUILDERS:
        entry, files = baked(name)
        for key, data in files.items():
            with open(os.path.join(folder, key), 'wb') as file:
                file.write(data)
        entries.append(entry)
        triangles = sum(group['triangles'] for group in entry['groups'])
        print(f'{name}: {triangles} triangles, {len(entry["parts"])} parts, size {entry["size"]}', flush=True)
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w') as file:
        json.dump(dict(base=PUBLIC, modules=entries), file, separators=(',', ':'))
        file.write('\n')


if __name__ == '__main__':
    main()
