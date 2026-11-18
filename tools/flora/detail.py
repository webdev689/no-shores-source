"""The detailed model a skeleton grows into: bark tubes with UVs in bark-picture units, thousands of single leaves,
needles, leaflets and blades, buttress fins, a displaced rock. Each surface is numpy arrays (positions, faces, and
per-corner UVs and tints) that blender.py turns into objects, and near.py casts rays against.
"""
import math
from dataclasses import dataclass, field

import numpy as np

from grow import UP, unit

# One bark or stone picture covers this many metres of surface.
BARK_TILE_M = 0.8


@dataclass
class Surface:
    """Faces of one material: corners' positions, the faces as index lists, and each face corner's UV and tint
    (r, g, b multiplying the material's own colour, 1 for none)."""
    material: str
    points: list = field(default_factory=list)
    faces: list = field(default_factory=list)
    uvs: list = field(default_factory=list)
    tints: list = field(default_factory=list)
    count: int = 0

    def face(self, corners, uvs, tints):
        start = self.count
        self.count += len(corners)
        self.points.append(np.asarray(corners, float))
        self.faces.append(list(range(start, start + len(corners))))
        self.uvs.extend(uvs)
        self.tints.extend(tints)

    def grid(self, rows, uvs, tints):
        """Quads joining rows of corners: `rows` (r, c, 3), `uvs` (r, c, 2), `tints` (r, c, 3)."""
        rows, uvs, tints = np.asarray(rows, float), np.asarray(uvs, float), np.asarray(tints, float)
        count, columns = rows.shape[:2]
        start = self.count
        self.count += count * columns
        self.points.append(rows.reshape(-1, 3))
        index = np.arange(count * columns).reshape(count, columns) + start
        for row in range(count - 1):
            for column in range(columns - 1):
                quad = [index[row, column], index[row, column + 1], index[row + 1, column + 1], index[row + 1, column]]
                self.faces.append(quad)
                for at in ((row, column), (row, column + 1), (row + 1, column + 1), (row + 1, column)):
                    self.uvs.append(uvs[at])
                    self.tints.append(tints[at])

    def arrays(self):
        points = np.concatenate(self.points) if self.points else np.zeros((0, 3))
        return points, self.faces, np.array(self.uvs, float).reshape(-1, 2), np.array(self.tints, float).reshape(-1, 3)


def frame_of(direction):
    """Two unit vectors square to a direction and to each other."""
    side = np.cross(direction, UP)
    if np.linalg.norm(side) < 1e-4:
        side = np.array([1.0, 0.0, 0.0])
    side = unit(side)
    return side, unit(np.cross(side, direction))


def ground_shade(z):
    """Bark darkens toward the foot, darkest at the ground, where it meets the land's shade."""
    return 1.0 - 0.35 * float(np.clip(1 - z / 1.5, 0, 1)) ** 2


def tube(surface, points, radii, sides, ribs=0, closed_top=False):
    """A tapered tube along a polyline, its UVs in bark-picture units round and along, ribbed `ribs` times round."""
    points, radii = np.asarray(points, float), np.asarray(radii, float)
    if closed_top:
        tip = unit(points[-1] - points[-2])
        dome = [points[-1] + tip * radii[-1] * share for share in (0.45, 0.8, 0.97)]
        points = np.vstack([points, dome])
        radii = np.concatenate([radii, radii[-1] * np.array([0.9, 0.6, 0.25])])
    around = max(1, round(2 * math.pi * float(radii.max()) / BARK_TILE_M)) if not ribs else ribs
    rows, uvs, tints = [], [], []
    length = 0.0
    for index, point in enumerate(points):
        ahead = points[min(index + 1, len(points) - 1)] - points[max(index - 1, 0)]
        side, lift = frame_of(unit(ahead))
        if index:
            length += float(np.linalg.norm(point - points[index - 1]))
        ring, ring_uv = [], []
        for step in range(sides + 1):
            turn = step / sides * math.tau
            bulge = 1 + 0.09 * math.cos(turn * ribs) if ribs else 1
            ring.append(point + (side * math.cos(turn) + lift * math.sin(turn)) * radii[index] * bulge)
            ring_uv.append((step / sides * around, length / BARK_TILE_M))
        rows.append(ring)
        uvs.append(ring_uv)
        tints.append([[ground_shade(point[2])] * 3] * (sides + 1))
    surface.grid(rows, uvs, tints)


def leaf_shape(form, length, rng):
    """A leaf's outline in its own plane, (across, along) metres, base at the origin."""
    if form == 'needle':
        width = length * 0.12
        return [(-width, 0), (width, 0), (0, length)]
    width = length * (0.55 if form == 'broad' else 0.45) * rng.uniform(0.85, 1.15)
    if form == 'small':
        return [(0, 0), (width * 0.5, length * 0.4), (0, length), (-width * 0.5, length * 0.4)]
    return [(0, 0), (width * 0.5, length * 0.3), (width * 0.42, length * 0.68), (0, length),
            (-width * 0.42, length * 0.68), (-width * 0.5, length * 0.3)]


def leaf(surface, base, along, facing, outline, colour):
    """One leaf: its outline laid from `base` along `along`, its face toward `facing`."""
    across = unit(np.cross(facing, along))
    width = max(abs(x) for x, _ in outline) * 2 or 1
    length = max(y for _, y in outline) or 1
    corners = [base + across * x + along * y + facing * 0.12 * y * y / length for x, y in outline]
    surface.face(corners, [(x / width + 0.5, y / length) for x, y in outline], [colour] * len(outline))


def leaf_colour(model, rng):
    base = np.array(model.leaf['colour'], float)
    fleck = model.leaf.get('fleck')
    if fleck and rng.random() < fleck[1]:
        return tuple(np.array(fleck[0]) * rng.uniform(0.9, 1.1))
    shade = rng.uniform(0.82, 1.12)
    warm = rng.uniform(-0.04, 0.04)
    return tuple(np.clip(base * shade + np.array([warm, warm * 0.5, -warm]), 0, 1))


def spray(surface, model, cluster, rng):
    """A spray of single leaves round a twig's end, facing out of the crown and up to the light."""
    form, length = model.leaf['form'], model.leaf['length']
    if form == 'needle' and model.leaf.get('tufted'):
        # A pine's tuft: needles bursting out of a ball round the twig's end, more of them up and out than down.
        count = int(220 * (cluster.radius / 0.35) ** 2)
        for _ in range(count):
            way = unit(rng.normal(0, 1, 3) + cluster.out * 0.7)
            at = cluster.centre + way * cluster.radius * rng.random() ** 0.5 * 0.7
            reach = length * rng.uniform(0.7, 1.3)
            leaf(surface, at, way, unit(np.cross(way, rng.normal(0, 1, 3))), leaf_shape('needle', reach, rng),
                 leaf_colour(model, rng))
        return
    if form == 'needle':
        twig = unit(cluster.out * 0.6 + rng.normal(0, 0.3, 3))
        count = int(260 * (cluster.radius / 0.35) ** 2)
        for _ in range(count):
            at = cluster.centre + twig * rng.uniform(-cluster.radius, cluster.radius) * 0.9
            way = unit(rng.normal(0, 1, 3) + twig * 0.6 - UP * 0.2)
            reach = min(length * rng.uniform(0.7, 1.3), cluster.radius * 0.6)
            leaf(surface, at, way, unit(np.cross(way, twig) + UP * 0.1), leaf_shape('needle', reach, rng),
                 leaf_colour(model, rng))
        return
    count = int(np.clip(12 * (cluster.radius / length) ** 2, 40, 320))
    for _ in range(count):
        offset = rng.normal(0, 1, 3)
        offset = unit(offset) * cluster.radius * rng.random() ** 0.4
        offset += cluster.out * cluster.radius * 0.25
        facing = unit(cluster.out * 0.6 + UP * 0.8 + rng.normal(0, 0.45, 3))
        along = unit(np.cross(facing, rng.normal(0, 1, 3)))
        leaf(surface, cluster.centre + offset, along, facing, leaf_shape(form, length * rng.uniform(0.8, 1.2), rng),
             leaf_colour(model, rng))


def frond(surface, wood, model, strip, rng, flat=False):
    """A frond: a rachis with leaflets along both sides, longest at its middle, angled forward and drooping."""
    spine = strip.spine
    lengths = np.cumsum([0] + [float(np.linalg.norm(b - a)) for a, b in zip(spine[:-1], spine[1:])])
    total = lengths[-1]
    if not flat:
        tube(wood, spine, np.linspace(0.035, 0.01, len(spine)) * (strip.width + 0.3), 5)
    steps = int(total / 0.055)
    for step in range(1, steps):
        at = step / steps * total
        segment = min(len(spine) - 2, int(np.searchsorted(lengths, at)) - 1)
        share = (at - lengths[segment]) / max(1e-6, lengths[segment + 1] - lengths[segment])
        point = spine[segment] + (spine[segment + 1] - spine[segment]) * share
        ahead = unit(spine[segment + 1] - spine[segment])
        side, _ = frame_of(ahead)
        reach = strip.width * 0.5 * math.sin(math.pi * (0.08 + 0.92 * at / total)) ** 0.7
        for hand in (-1, 1):
            way = unit(side * hand + ahead * 0.55 - (UP * 0.35 if not flat else 0))
            facing = unit(np.cross(way, ahead) * hand + (UP * 0.5 if not flat else 0))
            leaf(surface, point, way, facing, leaf_shape('small', reach * rng.uniform(0.85, 1.05), rng),
                 leaf_colour(model, rng))


def blade(surface, model, strip, rng):
    """A blade of grass or a reed: a strip tapering to its tip, coloured from its foot up."""
    foot, tip = np.array(model.leaf['foot']), np.array(model.leaf['colour'])
    rows, uvs, tints = [], [], []
    count = len(strip.spine)
    for index, point in enumerate(strip.spine):
        ahead = unit(strip.spine[min(index + 1, count - 1)] - strip.spine[max(index - 1, 0)])
        side, _ = frame_of(ahead)
        width = strip.width * (1 - index / (count - 1)) ** 0.8 + 0.001
        share = index / (count - 1)
        rows.append([point - side * width, point + side * width])
        uvs.append([(0, share), (1, share)])
        tint = tuple((foot + (tip - foot) * share) * rng.uniform(0.92, 1.08))
        tints.append([tint, tint])
    surface.grid(rows, uvs, tints)


def strands(surface, colour, strip, rng):
    """Moss hanging under a crown's edge: a few thin wisps from one hold."""
    for _ in range(6):
        shift = rng.normal(0, 0.12, 3) * np.array([1, 1, 0])
        side = unit(np.array([rng.normal(), rng.normal(), 0]))
        rows = [[point + shift - side * 0.03, point + shift + side * 0.03] for point in strip.spine]
        rows[-1] = [rows[-1][0] - UP * rng.uniform(0, 0.4), rows[-1][1] - UP * rng.uniform(0, 0.4)]
        shade = tuple(np.array(colour) * rng.uniform(0.85, 1.1))
        surface.grid(rows, [[(0, share), (1, share)] for share in np.linspace(0, 1, len(rows))],
                     [[shade, shade]] * len(rows))


def fin_rows(turn, height, reach, thickness, stations, section):
    """A buttress's corners: at each of `stations` places out from the trunk, its cross-section, a slab `thickness`
    either side at the root thinning to the toe and rounded over its top edge, curving gently along the ground.
    `section` is the cross-section's (across, up) as shares of the half-thickness and of the edge's height."""
    way = np.array([math.cos(turn), math.sin(turn), 0.0])
    side = np.array([-way[1], way[0], 0.0])
    bend = 0.12 * reach * (1 if math.sin(turn * 3) >= 0 else -1)
    rows, outs = [], []
    for share in np.linspace(0, 1, stations):
        out = reach * share
        edge = height * (1 - share) ** 2 - 0.3
        half = thickness * (1 - share) ** 0.7 + 0.03
        middle = way * out + side * bend * math.sin(math.pi * share)
        rows.append([middle + side * half * across
                     + UP * (-0.3 + (edge + 0.3) * up + half * 0.6 * max(0.0, 1 - abs(across)))
                     for across, up in section])
        outs.append(out)
    return np.array(rows), outs


# The detailed buttress's cross-section, from its foot on one side over its top to its foot on the other.
FIN_SECTION = ((-1, 0), (-1, 0.5), (-0.85, 0.85), (-0.5, 1), (0, 1), (0.5, 1), (0.85, 0.85), (1, 0.5), (1, 0))


def fin(surface, turn, height, reach, thickness):
    """A buttress: a slab of wood with thickness from up the trunk, curving out along the ground, its uv in bark
    units round its section and along it."""
    rows, outs = fin_rows(turn, height, reach, thickness, 9, FIN_SECTION)
    uvs, tints = [], []
    for row, out in zip(rows, outs):
        around = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(row, axis=0), axis=1))])
        uvs.append([(length / BARK_TILE_M, out / BARK_TILE_M) for length in around])
        tints.append([[ground_shade(point[2])] * 3 for point in row])
    surface.grid(rows, uvs, tints)


def surfaces(model, rng):
    """The detailed model's surfaces: wood, foliage (leaves, needles, leaflets, blades, moss) and stone."""
    from rocks import rock_surface
    if model.rock:
        return [rock_surface(model.rock)]
    wood = Surface('bark')
    twigs = Surface('twig')
    foliage = Surface('leaf')
    for limb in model.limbs:
        thick = float(limb.radii.max())
        sides = 48 if model.ribs else 16 if limb.level == 0 else 8 if thick > 0.05 else 4
        # Twigs are their own surface, so a card's picture shows them among its leaves but not the limbs behind.
        into = twigs if limb.level > 0 and thick < 0.045 and not model.ribs else wood
        tube(into, limb.points, limb.radii, sides, model.ribs, closed_top=bool(model.ribs))
    for each in model.fins:
        fin(wood, *each)
    for cluster in model.clusters:
        spray(foliage, model, cluster, rng)
    for strip in model.fronds:
        frond(foliage, wood, model, strip, rng)
    for strip in model.blades:
        blade(foliage, model, strip, rng)
    for strip in model.moss:
        strands(foliage, model.moss_colour, strip, rng)
    return [surface for surface in (wood, twigs, foliage) if surface.points]
