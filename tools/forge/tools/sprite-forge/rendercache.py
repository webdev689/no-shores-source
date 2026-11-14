"""The forge's render cache: a strip is drawn again only when something it is made of has changed.

Each frame has a key: a fingerprint of everything that goes into it. That is the layer as built (each object's mesh,
attributes, modifiers and materials' node trees, a skin's rest and weights, a bent piece's weights, a drape's own
make), the body's joints as posed for the frame and where the gear is held, the grades, the stage and the code that
draws it (`CORE`, and for a drape `CLOTH`). A strip's key is its frames' keys together. The keys of the strips in the
studio are kept beside them (`keys-<body>.json`), so a run finds a strip whose key is unchanged and keeps it as it
stands, drawing nothing: renders are deterministic, so drawing it again would give the same bytes.

A drape's cloth is kept apart (`Cloth`), in the run's own cache folder (FORGE_CACHE, else ~/.cache/dfo-forge): its
vertices each frame, keyed without its materials, so a cloth whose colour or grade changed is drawn again without
being hung again. FORGE_CACHE=off turns both off."""
import hashlib
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
# the code every strip is drawn by: a change to any of it draws every strip again
CORE = ('layers.py', 'forge.py', 'fit.py', 'stage.py', 'body.py', 'gear.py', 'shape.py', 'rendercache.py')
# and the code a drape is hung by
CLOTH = ('drape.py', 'clothkit.py', 'clothes.py', 'fabric.py')
# the forge's drawing version, raised by hand when the code draws a strip differently from what its inputs (meshes,
# materials, poses, grades, the stage) already say; `cloth` for how a drape hangs. A key holds these numbers, never the
# code itself, so a change that draws nothing new keeps every strip. keys/version.json records the code's digest
# beside them, and test/tooling/forgeversion.test.js fails where the code moved and neither was raised nor recorded
VERSION_FILE = os.path.join(HERE, 'keys', 'version.json')
VERSION = json.load(open(VERSION_FILE)) if os.path.exists(VERSION_FILE) else {'draw': 0, 'cloth': 0}
OFF = os.environ.get('FORGE_CACHE') == 'off'
_SUFFIX = re.compile(r'(\.\d{3,})+$')


def plain(name):
    """A Blender name without the `.001` Blender adds where the name is taken, so a thing keeps its key whatever
    else its process built beside it."""
    return _SUFFIX.sub('', name)
FOLDER = os.environ.get('FORGE_CACHE') or os.path.join(os.path.expanduser('~'), '.cache', 'dfo-forge')


def feed(h, x):
    """Fold `x` into hash `h`: numbers, text, arrays, matrices and the containers of them, in a fixed order."""
    if x is None:
        h.update(b'\0N')
    elif isinstance(x, (bytes, bytearray)):
        h.update(bytes(x))
    elif isinstance(x, str):
        h.update(b'\0S' + x.encode())
    elif isinstance(x, (bool, int, float, np.integer, np.floating)):
        h.update(b'\0V' + repr(x if not isinstance(x, (np.integer, np.floating)) else x.item()).encode())
    elif isinstance(x, np.ndarray):
        h.update(f'\0A{x.dtype}{x.shape}'.encode())
        h.update(np.ascontiguousarray(x).tobytes())
    elif isinstance(x, dict):
        h.update(b'\0D')
        for k in sorted(x, key=str):
            feed(h, str(k))
            feed(h, x[k])
    elif isinstance(x, (list, tuple)):
        h.update(b'\0L')
        for v in x:
            feed(h, v)
    elif isinstance(x, (set, frozenset)):
        feed(h, sorted(x, key=repr))
    elif hasattr(x, '__len__') and hasattr(x, '__getitem__'):   # a mathutils Matrix, Vector or Color
        feed(h, np.array(x, dtype=np.float64))
    elif hasattr(x, '__dict__') and not isinstance(x, type):
        # a plain object (a mounted frame's riding.py Stride): its fields, never its repr, which names where it lies in
        # memory and so differs from run to run
        feed(h, [type(x).__name__, vars(x)])
    else:
        feed(h, repr(x))


def digest(*parts):
    h = hashlib.sha1()
    for p in parts:
        feed(h, p)
    return h.hexdigest()[:24]


_SOURCES = {}


def sources(names):
    """The code in `names` (files beside this one), as one digest."""
    key = tuple(names)
    if key not in _SOURCES:
        h = hashlib.sha1()
        for n in names:
            path = os.path.join(HERE, n)
            if os.path.exists(path):
                h.update(n.encode())
                h.update(open(path, 'rb').read())
        _SOURCES[key] = h.hexdigest()
    return _SOURCES[key]


def _props(owner, skip=()):
    """An RNA struct's own settings: each writable number, flag, choice or text it holds, by name."""
    out = {}
    for p in owner.bl_rna.properties:
        if p.identifier in skip or p.identifier in ('rna_type', 'name', 'location', 'width', 'height', 'select',
                                                     'show_options', 'show_preview', 'hide', 'mute', 'label',
                                                     'parent', 'color', 'use_custom_color', 'dimensions'):
            continue
        if p.type in ('BOOLEAN', 'INT', 'FLOAT', 'ENUM', 'STRING') and not p.is_readonly:
            v = getattr(owner, p.identifier)
            out[p.identifier] = tuple(v) if hasattr(v, '__len__') and not isinstance(v, str) else v
    return out


_MATS = {}


def material_digest(m):
    """A material as it draws: its node tree, each node's settings and unlinked inputs, and its links."""
    if m is None:
        return 'none'
    if m.name not in _MATS:
        h = hashlib.sha1()
        feed(h, plain(m.name))
        nt = m.node_tree
        for n in sorted(nt.nodes, key=lambda n: (plain(n.name), n.name)) if nt else ():
            feed(h, [n.bl_idname, plain(n.name), _props(n)])
            if n.bl_idname == 'ShaderNodeValToRGB':
                feed(h, [n.color_ramp.interpolation, [(e.position, tuple(e.color)) for e in n.color_ramp.elements]])
            if n.bl_idname == 'ShaderNodeTexImage':   # a picture drawn on it (the horse's coat): its own bytes
                feed(h, image_digest(n.image))
            for i in n.inputs:
                if not i.is_linked and hasattr(i, 'default_value'):
                    feed(h, [i.identifier, i.default_value])
        for link in nt.links if nt else ():
            feed(h, [plain(link.from_node.name), link.from_socket.identifier, plain(link.to_node.name),
                     link.to_socket.identifier])
        _MATS[m.name] = h.hexdigest()
    return _MATS[m.name]


_IMAGES = {}


def image_digest(image):
    """A texture's picture by its bytes, read once a file: one repainted moves every key it draws in."""
    if image is None:
        return 'none'
    import bpy
    path = bpy.path.abspath(image.filepath) if image.filepath else ''
    key = path or image.name
    if key not in _IMAGES:
        if path and os.path.exists(path):
            _IMAGES[key] = hashlib.sha1(open(path, 'rb').read()).hexdigest()
        else:   # packed or made in the run: its pixels
            px = np.empty(len(image.pixels), np.float32)
            image.pixels.foreach_get(px)
            _IMAGES[key] = hashlib.sha1(px.tobytes()).hexdigest()
    return _IMAGES[key]


def faces_digest(me):
    """A mesh's faces whatever order they were built in: each its corners from its lowest vertex on, winding kept, with
    its material slot and smoothing, sorted. Some pieces (the helm) are built with their faces in an order that changes
    from run to run, and a key read off that order changed with it."""
    n = len(me.polygons)
    corners = np.empty(len(me.loops), np.int32)
    me.loops.foreach_get('vertex_index', corners)
    start, total, slot = (np.empty(n, np.int32) for _ in range(3))
    smooth = np.empty(n, bool)
    me.polygons.foreach_get('loop_start', start)
    me.polygons.foreach_get('loop_total', total)
    me.polygons.foreach_get('material_index', slot)
    me.polygons.foreach_get('use_smooth', smooth)
    faces = []
    for s, t, m, sm in zip(start.tolist(), total.tolist(), slot.tolist(), smooth.tolist()):
        ring = corners[s:s + t].tolist()
        low = ring.index(min(ring)) if ring else 0
        faces.append((ring[low:] + ring[:low], m, sm))
    faces.sort()
    return hashlib.sha1(json.dumps(faces, separators=(',', ':')).encode()).hexdigest()


def mesh_digest(me, co=None, shaded=True):
    """A mesh as built: its vertices (`co`, where its rest is not what it holds now), faces, smoothing, slots and
    every attribute on its points (the patterns read them), and (`shaded`) its materials."""
    h = hashlib.sha1()
    if co is None:
        co = np.empty(len(me.vertices) * 3, np.float32)
        me.vertices.foreach_get('co', co)
    feed(h, np.asarray(co, np.float32))
    feed(h, faces_digest(me))
    for a in sorted(me.attributes, key=lambda a: a.name):
        if a.domain == 'POINT' and a.data_type in ('FLOAT_VECTOR', 'FLOAT', 'FLOAT_COLOR') and a.name != 'position':
            key = {'FLOAT_VECTOR': 'vector', 'FLOAT': 'value', 'FLOAT_COLOR': 'color'}[a.data_type]
            width = {'vector': 3, 'value': 1, 'color': 4}[key]
            arr = np.empty(len(a.data) * width, np.float32)
            a.data.foreach_get(key, arr)
            feed(h, [a.name, arr])
    for uv in sorted(me.uv_layers, key=lambda u: u.name):   # where a picture lies on it
        arr = np.empty(len(uv.data) * 2, np.float32)
        uv.data.foreach_get('uv', arr)
        feed(h, [uv.name, arr])
    if shaded:
        feed(h, [material_digest(m) for m in me.materials])
    return h.hexdigest()


def object_digest(ob, fighter=None, bent=None, shaded=True):
    """An object as the layer draws it: its mesh at rest, its modifiers and (`shaded`) how it shades; a skin's rest
    and weights and a bent piece's weights, which pose it."""
    skin = next((sk for sk in getattr(fighter, 'skins', ()) if sk.ob is ob), None)
    parts = {o.name: j for o, j in getattr(fighter, 'parts', ())}
    co = None
    extra = []
    if skin is not None:   # posed each frame by its weights: its rest is what it is
        co = skin.rest
        extra = [skin.w, list(skin.joints), skin.heads, skin.alpha]
    if bent and ob.name in bent:
        at, joints, w, heads = bent[ob.name]
        co = at
        extra += [list(joints), w, heads]
    if ob.type != 'MESH':
        return digest(ob.type, plain(ob.name), _props(ob))
    return digest(plain(ob.name), parts.get(ob.name), mesh_digest(ob.data, co, shaded), extra,
                  [(m.type, _props(m)) for m in ob.modifiers], ob.visible_shadow)


def drape_digest(d):
    """A drape's own make: its kind and every number and array it was made with, but never where it hangs now."""
    own = {k: v for k, v in vars(d).items() if k not in ('verts', 'ob', 'me', 'frame', 'carried', 'shots', 'Ws')
           and isinstance(v, (int, float, str, bool, tuple, list, np.ndarray)) and not callable(v)}
    return digest(type(d).__name__, own)


class Manifest:
    """The keys of a body's strips in the studio, by strip (`<layer>_<anim>`): each its frames' key and the cell it
    was laid in."""

    def __init__(self, folder, body):
        self.path = os.path.join(folder, f'keys-{body}.json')
        self.keys = json.load(open(self.path)) if os.path.exists(self.path) else {}

    def fresh(self, name, key, cell, files):
        """Whether strip `name` stands as `key` would draw it, laid in `cell`, both its files there."""
        got = self.keys.get(name)
        return (not OFF and got is not None and got['key'] == key and got['cell'] == cell
                and all(os.path.exists(f) for f in files))

    def put(self, name, key, cell):
        self.keys[name] = {'key': key, 'cell': cell}
        self.mine = getattr(self, 'mine', set()) | {name}

    def write(self):
        """This run's keys laid over the file as it stands now, under a lock, so runs side by side keep each other's;
        written a strip a line, so two branches' keys merge line by line."""
        import fcntl
        os.makedirs(os.path.dirname(self.path) or '.', exist_ok=True)
        with open(self.path + '.lock', 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            now = json.load(open(self.path)) if os.path.exists(self.path) else {}
            now.update({n: self.keys[n] for n in getattr(self, 'mine', ())})
            self.keys = {**now, **{n: self.keys[n] for n in getattr(self, 'mine', ())}}
            tmp = self.path + '.tmp'
            with open(tmp, 'w') as f:
                f.write('{\n' + ',\n'.join(f' {json.dumps(n)}: {json.dumps(now[n], separators=(",", ":"))}'
                                             for n in sorted(now)) + '\n}\n')
            os.replace(tmp, self.path)


class Cloth:
    """A drape's vertices each frame, kept by the key of what hangs it (its make, the poses it is carried through,
    what it hangs over and the code), so it is hung once whatever its colour."""

    def __init__(self, folder=FOLDER):
        self.folder = os.path.join(folder, 'cloth')

    def _path(self, key):
        return os.path.join(self.folder, key[:2], f'{key}.npz')

    def get(self, key):
        if OFF:
            return None
        path = self._path(key)
        if not os.path.exists(path):
            return None
        with np.load(path) as z:
            return [z[f'v{i}'] for i in range(len(z.files))]

    def put(self, key, verts):
        if OFF:
            return
        path = self._path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + '.tmp.npz'
        np.savez_compressed(tmp, **{f'v{i}': v for i, v in enumerate(verts)})
        os.replace(tmp, path)


def record():
    """keys/version.json with the code's digests as they stand now, its versions kept."""
    now = {**VERSION, 'core': sources(CORE), 'cloth_code': sources(CLOTH)}
    with open(VERSION_FILE, 'w') as out:
        json.dump(now, out, indent=1, sort_keys=True)
        out.write('\n')
    print(f'recorded: draw {now["draw"]}, cloth {now["cloth"]}')


if __name__ == '__main__':   # python3 rendercache.py --record: the code moved and draws nothing new
    if sys.argv[1:] == ['--record']:
        record()
    else:
        sys.exit('python3 rendercache.py --record')
