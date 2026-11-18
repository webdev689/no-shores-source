"""The near mesh, baked from the skeleton and the detailed model: trunks and main limbs as tapered rings, foliage as
alpha-cut cards where the detailed model's sprays are, fronds as bent strips, grass as crossed cards, a boulder at a
low subdivision. Each vertex carries its wind weight (stiff at the foot, free at the tips) and the ambient occlusion
the detailed model casts on it.
"""
import math
import struct

import bpy  # noqa: F401 (Blender's module brings mathutils with it)
import mathutils
import numpy as np

from detail import BARK_TILE_M, frame_of
from grow import UP, unit
from rocks import rock_surface

# Triangle budgets: the most a form's near mesh may hold, by what grows it.
BUDGETS = dict(tree=600, shrub=240, low=60, rock=300)
# The leaf share the client knows moss by, and lets go of past a stone's throw (natureShader.ts MOSS).
MOSS_LEAF = 0.6
VERTEX_BYTES = 36


def budget_of(form):
    grow = form['grow']
    if grow == 'rock':
        return 'rock'
    if grow in ('shrub', 'bush') or (grow == 'fern' and form['trunk'] > 0):
        return 'shrub'
    if grow in ('tuft', 'fern'):
        return 'low'
    return 'tree'


class Near:
    """Triangles, three corners each; a corner is (position, normal, uv, tile, tint, leaf, ao). `tile` names the
    picture its uv lies in: None for the form's bark, whose uv repeats in bark-picture units."""

    def __init__(self):
        self.corners = []

    def triangle(self, *corners):
        self.corners.extend(corners)

    def quad(self, a, b, c, d):
        self.triangle(a, b, c)
        self.triangle(a, c, d)

    @property
    def triangles(self):
        return len(self.corners) // 3


def corner(position, normal, uv, tile=None, tint=(1, 1, 1), leaf=0.0):
    return dict(p=np.asarray(position, float), n=unit(np.asarray(normal, float)), uv=tuple(uv), tile=tile,
                tint=tuple(tint), leaf=leaf)


def resampled(points, radii, step):
    """A limb's points and radii every `step` metres or so, keeping its ends."""
    lengths = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1))])
    count = max(1, int(round(lengths[-1] / step)))
    at = np.linspace(0, lengths[-1], count + 1)
    return (np.stack([np.interp(at, lengths, points[:, axis]) for axis in range(3)], 1), np.interp(at, lengths, radii))


def ring_tube(near, points, radii, sides, ribs=0):
    """A tapered tube of `sides` round, its uv in bark-picture units, a rib a side when ribbed."""
    around = ribs or max(1, round(2 * math.pi * float(radii.max()) / BARK_TILE_M))
    rings, length = [], 0.0
    for index, point in enumerate(points):
        ahead = unit(points[min(index + 1, len(points) - 1)] - points[max(index - 1, 0)])
        side, lift = frame_of(ahead)
        if index:
            length += float(np.linalg.norm(point - points[index - 1]))
        shade = 1.0 - 0.35 * float(np.clip(1 - point[2] / 1.5, 0, 1)) ** 2
        ring = []
        for step in range(sides + 1):
            turn = step / sides * math.tau
            out = side * math.cos(turn) + lift * math.sin(turn)
            ring.append(corner(point + out * radii[index], out, (step / sides * around, length / BARK_TILE_M),
                               tint=(shade,) * 3))
        rings.append(ring)
    for low, high in zip(rings[:-1], rings[1:]):
        for step in range(sides):
            near.quad(low[step], low[step + 1], high[step + 1], high[step])


def wood(near, model, budget):
    """The trunk and the thickest limbs that fit the budget, thickest first."""
    order = sorted(range(len(model.limbs)), key=lambda index: (model.limbs[index].level > 0,
                                                               -float(model.limbs[index].radii[-1])))
    for index in order:
        limb = model.limbs[index]
        trunk = limb.level == 0
        step = max(0.5, model.height / (5 if trunk else 6))
        points, radii = resampled(limb.points, limb.radii, step)
        sides = 12 if model.ribs else 7 if trunk else 5 if radii.max() > 0.08 else 3
        if not trunk and near.triangles + (len(points) - 1) * sides * 2 > budget:
            continue
        ring_tube(near, points, radii, sides, model.ribs if trunk or model.ribs else 0)
        if model.ribs:
            tip = unit(points[-1] - points[-2])
            dome = np.array([points[-1] + tip * radii[-1] * 0.6, points[-1] + tip * radii[-1] * 0.95])
            ring_tube(near, np.vstack([points[-1:], dome]), np.array([radii[-1], radii[-1] * 0.7, 0.05]), 12,
                      model.ribs)
    for turn, height, reach, _ in model.fins:
        way = np.array([math.cos(turn), math.sin(turn), 0.0])
        side = np.array([-way[1], way[0], 0.0])
        foot, top, toe = UP * -0.3, UP * height, way * reach - UP * 0.3
        bend = way * reach * 0.3 + UP * height * 0.25
        uv = lambda point: (float(np.dot(point, way)) / BARK_TILE_M, float(point[2]) / BARK_TILE_M)
        near.quad(*(corner(point, side, uv(point), tint=(0.7,) * 3) for point in (foot, toe, bend, top)))


def groups_of(clusters, count):
    """The sprays gathered into `count` cards: k-means on their centres, seeded evenly through them."""
    centres = np.array([cluster.centre for cluster in clusters])
    count = min(count, len(clusters))
    means = centres[np.linspace(0, len(clusters) - 1, count).astype(int)].copy()
    for _ in range(10):
        nearest = np.linalg.norm(centres[:, None] - means[None], axis=2).argmin(1)
        for group in range(count):
            members = centres[nearest == group]
            if len(members):
                means[group] = members.mean(0)
    groups = []
    for group in range(count):
        members = [cluster for cluster, at in zip(clusters, nearest) if at == group]
        if not members:
            continue
        centre = means[group]
        radius = max(float(np.linalg.norm(cluster.centre - centre)) + cluster.radius for cluster in members)
        out = unit(sum(cluster.out for cluster in members))
        groups.append((centre, out, radius * 0.85))
    return groups


def crown_normal(model):
    """The way a point of the crown faces: out of the ellipsoid the sprays fill, so cards light as one mass."""
    centres = np.array([cluster.centre for cluster in model.clusters])
    middle = centres.mean(0)
    spread = np.maximum(centres.std(0) * 1.7, 0.2)
    return lambda point: unit((point - middle) / spread ** 2 + UP * 0.3 / spread[2])


def card_frame(out, roll):
    """A card's across and up: square to the way it faces, turned by `roll` about it."""
    across, up = frame_of(out)
    across, up = (across * math.cos(roll) + up * math.sin(roll), -across * math.sin(roll) + up * math.cos(roll))
    return across, up


def cards(near, model, groups, tiles, normal_of, rng):
    """Two crossed cards at each group, one facing out of the crown and one square to it, wearing its picture."""
    for index, (centre, out, radius) in enumerate(groups):
        across, up = card_frame(out, rng.uniform(0, math.tau))
        tile = tiles[index % len(tiles)]
        for face_up in (up, unit(np.cross(across, up) * 0.5 + up * 0.5)):
            square = [centre + (across * x + face_up * y) * radius for x, y in ((-1, 1), (1, 1), (1, -1), (-1, -1))]
            uvs = ((0, 0), (1, 0), (1, 1), (0, 1))
            near.quad(*(corner(point, normal_of(point), uv, tile, leaf=1.0) for point, uv in zip(square, uvs)))


def strip(near, spine, width, tile, normal_of, leaf=1.0, uv_width=None, side=None):
    """A frond or strand of moss as a bent strip along its spine, the picture's top at the spine's tip."""
    points, _ = resampled(spine, np.zeros(len(spine)), max(0.3, float(np.linalg.norm(spine[-1] - spine[0])) / 3))
    count = len(points)
    half = (uv_width or 1.0) / 2
    for index in range(count - 1):
        rows = []
        for at in (index, index + 1):
            ahead = unit(points[min(at + 1, count - 1)] - points[max(at - 1, 0)])
            across = side if side is not None else unit(np.cross(ahead, UP))
            v = 1 - at / (count - 1)
            rows.append((points[at] - across * width / 2, points[at] + across * width / 2, v))
        (a, b, va), (d, c, vd) = rows
        near.quad(corner(a, normal_of(a), (0.5 - half, va), tile, leaf=leaf),
                  corner(b, normal_of(b), (0.5 + half, va), tile, leaf=leaf),
                  corner(c, normal_of(c), (0.5 + half, vd), tile, leaf=leaf),
                  corner(d, normal_of(d), (0.5 - half, vd), tile, leaf=leaf))


def crossed(near, size, tiles):
    """Grass: three cards crossed through the foot, each in two rows so the wind bends it."""
    for index, turn in enumerate((0.0, math.pi / 3, 2 * math.pi / 3)):
        way = np.array([math.cos(turn), math.sin(turn), 0.0])
        tile = tiles[index % len(tiles)]
        rows = [(z, 1 - z / size) for z in (0.0, size / 2, size)]
        for (z0, v0), (z1, v1) in zip(rows[:-1], rows[1:]):
            normal = lambda z: unit(UP + np.cross(way, UP) * 0.3)
            near.quad(corner(-way * size / 2 + UP * z0, normal(z0), (0, v0), tile, leaf=1.0),
                      corner(way * size / 2 + UP * z0, normal(z0), (1, v0), tile, leaf=1.0),
                      corner(way * size / 2 + UP * z1, normal(z1), (1, v1), tile, leaf=1.0),
                      corner(-way * size / 2 + UP * z1, normal(z1), (0, v1), tile, leaf=1.0))


def rock(near, model):
    surface = rock_surface(model.rock, subdivisions=2)
    points, faces, uvs, tints = surface.arrays()
    # Smooth normals: each corner's, the mean of the faces round its point.
    keys = [tuple(np.round(point, 5)) for point in points]
    sums = {}
    for face in faces:
        a, b, c = points[face]
        normal = np.cross(b - a, c - a)
        for index in face:
            sums[keys[index]] = sums.get(keys[index], 0) + normal
    for face in faces:
        a, b, c = face
        near.triangle(*(corner(points[i], sums[keys[i]], uvs[i], tint=tints[i]) for i in (a, b, c)))


def occlusion(near, detailed, reach):
    """Each corner's ambient occlusion: how many of 24 rays out over its normal the detailed model stops."""
    points, faces = [], []
    for surface in detailed:
        surface_points, surface_faces, _, _ = surface.arrays()
        start = sum(len(chunk) for chunk in points)
        points.append(surface_points)
        faces.extend([[index + start for index in face] for face in surface_faces])
    tree = mathutils.bvhtree.BVHTree.FromPolygons(np.concatenate(points).tolist(), faces)
    golden = math.pi * (3 - 5 ** 0.5)
    rays = [np.array([math.cos(golden * i) * math.sqrt(1 - z * z), math.sin(golden * i) * math.sqrt(1 - z * z), z])
            for i, z in enumerate(np.linspace(0.97, -0.97, 48))]
    known = {}
    for each in near.corners:
        key = (tuple(np.round(each['p'], 4)), tuple(np.round(each['n'], 3)))
        if key not in known:
            ways = [ray for ray in rays if float(np.dot(ray, each['n'])) > 0.05][:24]
            start = mathutils.Vector(each['p'] + each['n'] * 0.04)
            hits = sum(tree.ray_cast(start, mathutils.Vector(ray), reach)[0] is not None for ray in ways)
            known[key] = 1 - 0.8 * hits / max(1, len(ways))
        each['ao'] = known[key]


def sway_of(point, height):
    """How freely a point moves in the wind: still at the foot, freest at the top and the crown's rim."""
    up = max(0.0, float(point[2])) / max(height, 0.5)
    out = math.hypot(point[0], point[1]) / max(height, 0.5)
    return float(np.clip(up ** 1.6 + 0.4 * out, 0, 1))


def encoded(near, height, rects):
    """The near mesh's bytes for the client (forms.ts): a vertex count, then 36 bytes a vertex in the game's frame
    (x east, y south, z up: Blender's y turned round). `rects` maps a picture to its (u, v, width, height) in its
    layer; bark's uv stays in picture units, wrapping."""
    out = [struct.pack('<I', len(near.corners))]
    corners = near.corners
    for first in range(0, len(corners), 3):
        triangle = corners[first:first + 3]
        p = [each['p'] for each in triangle]
        uv = [np.array(each['uv'], float) for each in triangle]
        edge1, edge2 = p[1] - p[0], p[2] - p[0]
        duv1, duv2 = uv[1] - uv[0], uv[2] - uv[0]
        determinant = duv1[0] * duv2[1] - duv2[0] * duv1[1]
        scale = 1.0 / determinant if abs(determinant) > 1e-12 else 0.0
        along_u = (edge1 * duv2[1] - edge2 * duv1[1]) * scale
        along_v = (edge2 * duv1[0] - edge1 * duv2[0]) * scale
        for each in triangle:
            normal = each['n']
            tangent = unit(along_u - normal * float(np.dot(along_u, normal)))
            if not np.any(tangent):
                tangent = frame_of(normal)[0]
            # The picture's up runs against v; which way cross(normal, tangent) points decides the sign.
            sign = 1.0 if float(np.dot(np.cross(normal, tangent), -along_v)) >= 0 else -1.0
            u, v = each['uv']
            if each['tile'] is not None:
                left, top, width, tall = rects[each['tile']]
                u, v = left + min(max(u, 0.002), 0.998) * width, top + min(max(v, 0.002), 0.998) * tall
            game = lambda vector: (vector[0], -vector[1], vector[2])
            snorm = lambda value: max(-127, min(127, round(value * 127)))
            unorm = lambda value: max(0, min(255, round(value * 255)))
            out.append(struct.pack('<3f', *game(each['p'])))
            out.append(struct.pack('<4b', *(snorm(value) for value in game(normal)), snorm(each['leaf'])))
            # Turning y round mirrors the frame, so the bitangent's sign turns too.
            out.append(struct.pack('<4b', *(snorm(value) for value in game(tangent)), snorm(-sign)))
            out.append(struct.pack('<2f', u, v))
            out.append(struct.pack('<4B', *(unorm(value / 2) for value in each['tint']), unorm(each['ao'])))
            out.append(struct.pack('<4B', unorm(sway_of(each['p'], height)), 255 if each['tile'] is None else 0, 0, 0))
    return b''.join(out)
