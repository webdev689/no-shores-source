"""Boulders: an icosphere pushed out by noise into a lump, stepped into strata, cut flat underneath, its top dressed in
moss or snow by a tint. The same shape at two subdivisions gives the detailed model and the near mesh.
"""
import numpy as np

from detail import BARK_TILE_M, Surface


def icosphere(subdivisions):
    """A unit icosphere: its corners and triangles."""
    golden = (1 + 5 ** 0.5) / 2
    corners = [(-1, golden, 0), (1, golden, 0), (-1, -golden, 0), (1, -golden, 0), (0, -1, golden), (0, 1, golden),
               (0, -1, -golden), (0, 1, -golden), (golden, 0, -1), (golden, 0, 1), (-golden, 0, -1), (-golden, 0, 1)]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
             (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11),
             (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    points = [np.array(corner, float) / np.linalg.norm(corner) for corner in corners]
    for _ in range(subdivisions):
        middles = {}

        def middle(a, b):
            key = (min(a, b), max(a, b))
            if key not in middles:
                point = points[a] + points[b]
                points.append(point / np.linalg.norm(point))
                middles[key] = len(points) - 1
            return middles[key]

        faces = [triangle for a, b, c in faces for triangle in
                 ((a, middle(a, b), middle(c, a)), (b, middle(b, c), middle(a, b)), (c, middle(c, a), middle(b, c)),
                  (middle(a, b), middle(b, c), middle(c, a)))]
    return np.array(points), faces


def value_noise(points, seed):
    """Smooth value noise in 3D, about -1..1, the same for the same seed."""
    cell = np.floor(points).astype(np.int64)
    fraction = points - cell
    ease = fraction * fraction * (3 - 2 * fraction)
    total = np.zeros(len(points))
    for corner in range(8):
        offset = np.array([(corner >> axis) & 1 for axis in range(3)])
        hashed = (cell + offset) * np.array([73856093, 19349663, 83492791]) + seed * 2654435761
        hashed = (hashed[:, 0] ^ hashed[:, 1] ^ hashed[:, 2]) & 0xFFFFFFFF
        hashed = (hashed * 2246822519 + 3266489917) & 0xFFFFFFFF
        hashed ^= hashed >> 13
        value = (hashed & 0xFFFF) / 32767.5 - 1
        weight = np.prod(np.where(offset == 1, ease, 1 - ease), axis=1)
        total += value * weight
    return total


def fbm(points, seed, octaves=4):
    total, scale, amplitude = np.zeros(len(points)), 1.0, 1.0
    for octave in range(octaves):
        total += amplitude * value_noise(points * scale, seed + octave * 101)
        scale, amplitude = scale * 2.03, amplitude * 0.5
    return total


def shaped(directions, rock):
    """Where each direction of the unit sphere lies on the boulder: lumpy, stepped into strata, flat underneath."""
    size = np.array(rock['size'], float)
    seed = rock['seed']
    lump = 1 + 0.22 * fbm(directions * 1.3, seed) + 0.05 * fbm(directions * 5.0, seed + 7, 3)
    points = directions * lump[:, None] * size
    # Strata: ledges every 0.3 m or so, each a little recessed toward its top.
    layer = (points[:, 2] / (0.28 * size[2] + 0.05) + 0.4 * fbm(points * 0.8, seed + 13, 2)) % 1.0
    points[:, :2] *= (1 - 0.05 * np.clip((layer - 0.65) / 0.35, 0, 1) ** 2)[:, None]
    points[:, 2] = np.maximum(points[:, 2], -0.55 * size[2])
    points[:, 2] += size[2] * 0.35
    return points


def tints_of(points, rock):
    """Stone a little lighter up and varied; over the cap's share of its height, moss or snow."""
    size = np.array(rock['size'], float)
    height = (points[:, 2] - size[2] * 0.35) / size[2]
    shade = 0.88 + 0.12 * height + 0.08 * value_noise(points * 3.0, rock['seed'] + 3)
    tints = np.repeat(shade[:, None], 3, axis=1)
    if rock['cap']:
        colour, start = rock['cap']
        cover = np.clip((height - start) * 6, 0, 1)
        cap = np.array(colour, float) / np.maximum(np.array(rock['stone'], float), 0.05)
        tints = tints * (1 - cover[:, None] * 0.85) + cap * cover[:, None] * 0.85
    return tints


def box_uv(corners, normal):
    """Picture coordinates of a face's corners, laid on the axis plane the face most nearly faces, so the strata of
    the stone picture run level round the sides."""
    axis = int(np.argmax(np.abs(normal)))
    if axis == 2:
        return corners[:, :2] / BARK_TILE_M
    across = corners[:, 1] if axis == 0 else corners[:, 0]
    return np.stack([across, corners[:, 2]], 1) / BARK_TILE_M


def rock_surface(rock, subdivisions=5):
    """A boulder's surface at a subdivision: 5 for the detailed model, 2 for the near mesh."""
    directions, faces = icosphere(subdivisions)
    points = shaped(directions, rock)
    tints = tints_of(points, rock)
    surface = Surface('stone')
    # Its flat underside lies below the ground, so a slope's downhill side never shows a gap; it is left open.
    floor = rock['size'][2] * (0.35 - 0.55)
    for face in faces:
        corners = points[list(face)]
        if np.all(corners[:, 2] <= floor + 1e-6):
            continue
        normal = np.cross(corners[1] - corners[0], corners[2] - corners[0])
        surface.face(corners, box_uv(corners, normal), [tuple(tints[index]) for index in face])
    return surface
