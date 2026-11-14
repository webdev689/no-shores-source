"""The forge's stage: camera, lights, render settings, and reading a render back as hard-edged RGBA rows.

The lights ride the camera, so every view is lit as the classic sprites are: from the front and a little above, each
form brightest in its middle and as bright on its left as on its right. The camera is orthographic at a fixed
pixels-per-metre, so a body is one size in every record."""
import json
import math
import os
import struct
import zlib

import bpy
import numpy as np
from mathutils import Vector

PX_PER_M = 62.0      # the classic medium fighter stands about 112 px tall in his helm
ELEVATION = 8.0      # degrees the camera looks down
WORK_W, WORK_H = 220, 190
ROOT_PX = (WORK_W // 2, WORK_H - 12)   # where the ground under the body lands in a work render
# the lights, each (direction it shines toward, strength), and the ambient's strength; colour.py --light fits them
LIGHT = {'key': [0.2, 1.0, -0.8, 5.0], 'fill': [-1.0, 0.6, -0.2, 0.5], 'top': [0.1, 0.2, -1.0, 1.2], 'world': 1.0}


def load_light(path):
    if os.path.exists(path):
        LIGHT.update(json.load(open(path)))


def set_lights(light=None):
    """Aim and set the stage's lights (after setup)."""
    light = light or LIGHT
    for name in ('key', 'fill', 'top'):
        ob = bpy.data.objects[name]
        x, y, z, e = light[name]
        ob.rotation_euler = Vector((x, y, z)).to_track_quat('-Z', 'Y').to_euler()
        ob.data.energy = e
    bpy.context.scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = light['world']


def setup(samples=64):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.cycles.seed = 7
    sc.cycles.filter_width = 0.01      # one point a pixel: edges stay jagged and crisp, as the classic renders are
    sc.cycles.max_bounces = 4
    sc.render.film_transparent = True
    sc.render.use_persistent_data = True   # the scene kept between frames: only what moved is synced again
    threads = int(os.environ.get('FORGE_THREADS') or 0)   # a run beside others on one machine: its share of the cores
    if threads:
        sc.render.threads_mode, sc.render.threads = 'FIXED', threads
    sc.render.resolution_x = WORK_W
    sc.render.resolution_y = WORK_H
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    world = bpy.data.worlds.new('world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.07, 0.07, 0.08, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    sc.world = world

    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    aim(cam)

    def sun(name, toward, energy, angle=0.05):
        ld = bpy.data.lights.new(name, 'SUN')
        ld.energy = energy
        ld.angle = angle
        ob = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(ob)
        ob.rotation_euler = Vector(toward).to_track_quat('-Z', 'Y').to_euler()
        return ob
    # key from the viewer's upper left, a cool fill from the right, a faint top light for the helm's crown
    for name in ('key', 'fill', 'top'):
        sun(name, LIGHT[name][:3], LIGHT[name][3])
    set_lights()
    return cam


def aim(cam):
    """Lay the camera so the ground under the body lands on ROOT_PX, at PX_PER_M and looking down ELEVATION."""
    cam.data.ortho_scale = max(WORK_W, WORK_H) / PX_PER_M
    e = math.radians(ELEVATION)
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)
    up = Vector((0, math.sin(e), math.cos(e)))
    fwd = Vector((0, math.cos(e), -math.sin(e)))
    rx, ry = ROOT_PX
    centre = Vector((0, 0, 0)) + up * ((ry - WORK_H / 2) / PX_PER_M) - Vector((1, 0, 0)) * ((rx - WORK_W / 2) / PX_PER_M)
    cam.location = centre - fwd * 12


def resize(w, h, below=12):
    """A work frame of `w` x `h` at the same scale, for records that reach further than Daggerfall's: a body fallen
    its length along the ground, a weapon raised overhead (the forge's own animations). `below`: the rows under the
    ground, room for what lies on it nearer the eye (a dropped weapon seen past a fallen body)."""
    global WORK_W, WORK_H, ROOT_PX
    WORK_W, WORK_H = w, h
    ROOT_PX = (w // 2, h - below)
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = w, h
    aim(sc.camera)


def _png(path, w, h, rgba, offset=None, box=None):
    raw = b''.join(b'\x00' + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    # its place in pixels (`oFFs`, unit 0): where a doll picture larger than its record's box is drawn
    place = chunk(b'oFFs', struct.pack('>iiB', int(offset[0]), int(offset[1]), 0)) if offset is not None else b''
    # where Daggerfall's box lies in it (`boXs`, a private chunk: x, y, width, height): the game lays the box out
    place += chunk(b'boXs', struct.pack('>iiii', *(int(v) for v in box))) if box is not None else b''
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + place
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def write_png(path, arr, offset=None, box=None):
    """arr: (h, w, 4) uint8, top row first; `offset` (x, y) its place in pixels, written as its `oFFs`; `box` where
    Daggerfall's box lies in it (x, y, width, height), as its `boXs`."""
    h, w = arr.shape[:2]
    _png(path, w, h, np.ascontiguousarray(arr, dtype=np.uint8).tobytes(), offset, box)


def render_rgba(tmp_path):
    """Render the scene; return (h, w, 4) uint8 rows top first, alpha cut hard at one half."""
    sc = bpy.context.scene
    sc.render.filepath = tmp_path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(tmp_path, check_existing=False)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(img)
    a = px[..., 3]
    rgb = px[..., :3]   # a saved PNG holds straight alpha
    out = np.zeros((h, w, 4), dtype=np.uint8)
    on = a >= 0.5
    out[..., :3] = np.clip(np.round(rgb * 255), 0, 255).astype(np.uint8)
    out[..., 3] = np.where(on, 255, 0)
    out[~on, :3] = 0
    return out
