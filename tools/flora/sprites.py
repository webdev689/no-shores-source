"""The pictures rendered from a detailed model: its impostor sheet (8 azimuths by 4 elevations, each frame 128 px, a
far plant drawn as one quad lit by the frame's normals) and the pictures its near mesh's cards wear (a spray of its
own leaves seen face on, a frond laid flat, a tuft from the side, a hanging strand of moss). Each picture is an
albedo with its coverage and a normal with the leaf share, cleaned of fringes: the colour at an edge is the surface's
own, not the transparent background's, and spreads out into the empty pixels so mipmaps never darken.
"""
import math

import bpy
import mathutils
import numpy as np

from atlas import AZIMUTHS, CELL, ELEVATIONS
from blender import ALBEDO, LEAF, NORMAL, camera, mesh_object, remove, render
from detail import Surface, frame_of, frond, spray, strands, tube
from grow import UP, Strip

TILE = 256
SAMPLES = 24


def sphere_of(surfaces):
    """The detailed model's bounding sphere: its box's middle, and the farthest point from it."""
    points = np.concatenate([surface.arrays()[0] for surface in surfaces])
    centre = (points.min(0) + points.max(0)) / 2
    return centre, float(np.linalg.norm(points - centre, axis=1).max()) * 1.02


def cleaned(albedo, normal, leaf):
    """Three renders made into a picture pair: the albedo unpremultiplied with its coverage as alpha, the normal
    unpremultiplied and renormalised with the leaf share as alpha, both bled into the empty pixels round them."""
    cover = albedo[..., 3]
    seen = cover > 0.002
    colour = np.where(seen[..., None], albedo[..., :3] / np.maximum(cover, 1e-6)[..., None], 0)
    facing = normal[..., :3] / np.maximum(normal[..., 3], 1e-6)[..., None] * 2 - 1
    facing = facing / np.maximum(np.linalg.norm(facing, axis=-1, keepdims=True), 1e-6)
    leafy = np.clip(leaf[..., 0] / np.maximum(leaf[..., 3], 1e-6), 0, 1)
    filled = cover > 0.5
    channels = np.concatenate([colour, facing, leafy[..., None]], -1)
    channels[~filled] = 0
    for _ in range(64):
        if filled.all():
            break
        total = np.zeros_like(channels)
        count = np.zeros(filled.shape)
        for shift in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            moved = np.roll(filled, shift, (0, 1))
            total += np.roll(channels, shift, (0, 1)) * moved[..., None]
            count += moved
        grow = ~filled & (count > 0)
        channels[grow] = total[grow] / count[grow][:, None]
        filled = filled | grow
    facing = channels[..., 3:6]
    facing = facing / np.maximum(np.linalg.norm(facing, axis=-1, keepdims=True), 1e-6)
    albedo_out = np.concatenate([np.clip(channels[..., :3], 0, 1), cover[..., None]], -1)
    normal_out = np.concatenate([facing * 0.5 + 0.5, channels[..., 6:7]], -1)
    return albedo_out, normal_out


def three(scene, plant, width, height, ao, space):
    """Albedo, normal and leaf renders of what the scene's camera sees."""
    plant.dress(ALBEDO, ao, space)
    albedo = render(scene, width, height, SAMPLES)
    plant.dress(NORMAL, ao, space)
    normal = render(scene, width, height, SAMPLES)
    plant.dress(LEAF, ao, space)
    leaf = render(scene, width, height, 4)
    return cleaned(albedo, normal, leaf)


def rotation(azimuth, elevation):
    """Turns the model so the camera, looking along +y, sees it from `azimuth` round and `elevation` up."""
    return mathutils.Matrix.Rotation(elevation, 4, 'X') @ mathutils.Matrix.Rotation(-math.pi / 2 - azimuth, 4, 'Z')


def impostor(scene, plant, centre, radius):
    """The impostor sheet: a row a elevation, a column an azimuth, each frame the model's bounding sphere seen from
    there, its normals in the model's own frame."""
    across = 2 * radius
    copies = []
    for item in plant.objects:
        item.hide_render = True
    for row, elevation in enumerate(ELEVATIONS):
        for column in range(AZIMUTHS):
            turn = rotation(column / AZIMUTHS * math.tau, math.radians(elevation))
            middle = mathutils.Vector(((column + 0.5) * across, 0, -(row + 0.5) * across))
            place = middle - turn.to_3x3() @ mathutils.Vector(centre)
            for item in plant.objects:
                copy = bpy.data.objects.new(f'{item.name} {row} {column}', item.data)
                copy.matrix_world = mathutils.Matrix.Translation(place) @ turn
                scene.collection.objects.link(copy)
                copies.append(copy)
    lens = camera(scene, (AZIMUTHS * across / 2, -radius * 4, -len(ELEVATIONS) * across / 2), (0, 1, 0), (0, 0, 1),
                  AZIMUTHS * across)
    # Occlusion lightly and over a short reach, so a dense crown darkens in its folds but its mass keeps the leaves'
    # own colour: a far fir or pine is the cast's green, not near black.
    ao = (0.4, float(np.clip(radius * 0.15, 0.3, 2.0)))
    sheet = three(scene, plant, AZIMUTHS * CELL, len(ELEVATIONS) * CELL, ao, 'OBJECT')
    for copy in copies:
        remove(copy)
    remove(lens)
    for item in plant.objects:
        item.hide_render = False
    return sheet


def spray_tile(scene, plant, model, centre, out, radius, rng):
    """A card's picture: the model's own sprays round the card's middle, and the twigs among them, seen face on.
    Only the sprays within the card are grown again for it, so its outline is ragged, never the card's square."""
    centre = np.asarray(centre, float)
    foliage, twigs = Surface('leaf'), Surface('twig')
    for cluster in model.clusters:
        if np.linalg.norm(cluster.centre - centre) < radius * 0.75:
            spray(foliage, model, cluster, rng)
    for limb in model.limbs:
        near = np.linalg.norm(limb.points - centre, axis=1) < radius
        if limb.level > 0 and float(limb.radii.max()) < 0.045 and near.sum() >= 2:
            tube(twigs, limb.points[near], limb.radii[near], 4)
    made = [surface for surface in (twigs, foliage) if surface.points]
    forward, up = -np.asarray(out, float), card_up(out)
    tile = alone(scene, plant, made, (centre + np.asarray(out) * 50, forward, up, radius * 2))
    # A spray strung along a bough is seen again turned, so it lies along the picture and its card can be cut to a
    # narrow rectangle round it (near.card_shape): the camera's up turns either way by the cover's slant.
    slant = cover_slant(tile[0][..., 3])
    if slant is None:
        return tile
    side = np.cross(forward, up)
    for turn in (slant, -slant):
        turned = alone(scene, plant, made, (centre + np.asarray(out) * 50, forward,
                                            up * math.cos(turn) + side * math.sin(turn), radius * 2))
        if box_area(turned[0][..., 3]) < box_area(tile[0][..., 3]):
            tile = turned
    return tile


def cover_slant(alpha):
    """The angle of a picture's cover's long axis from across it, radians, when the cover is long and slanted."""
    rows, columns = np.nonzero(alpha > 0.25)
    if len(rows) < 10:
        return None
    values, vectors = np.linalg.eigh(np.cov(np.stack([columns, rows]).astype(float)))
    if values[1] < 2.5 * max(values[0], 1e-9):
        return None
    slant = math.atan2(vectors[1, 1], vectors[0, 1])
    slant = (slant + math.pi / 2) % math.pi - math.pi / 2
    return slant if abs(slant) > 0.1 else None


def box_area(alpha):
    """The share of a picture the rectangle round its cover takes."""
    rows, columns = np.nonzero(alpha > 0.25)
    if len(rows) == 0:
        return 1.0
    return (rows.max() - rows.min() + 1) * (columns.max() - columns.min() + 1) / alpha.size


def card_up(out):
    """The up of a card facing `out`, as near.card_frame gives it before its roll."""
    return frame_of(np.asarray(out, float))[1]


def alone(scene, plant, surfaces, aim):
    """Renders surfaces made just for a picture, with the plant hidden: `aim` is (origin, forward, up, width)."""
    made = [mesh_object(surface, surface.material) for surface in surfaces]
    for item in plant.objects:
        item.hide_render = True
    hidden = plant.objects, plant.kinds
    plant.objects, plant.kinds = made, [surface.material for surface in surfaces]
    lens = camera(scene, *aim)
    tile = three(scene, plant, TILE, TILE, (0.3, aim[3] * 0.2), 'CAMERA')
    remove(lens)
    for item in made:
        remove(item)
    plant.objects, plant.kinds = hidden
    for item in plant.objects:
        item.hide_render = False
    return tile


def frond_tile(scene, plant, model, rng):
    """A frond laid flat along the picture, its tip at the top."""
    strip = model.fronds[0]
    length = float(np.sum(np.linalg.norm(np.diff(strip.spine, axis=0), axis=1)))
    flat = Strip(np.array([[0, y, 0] for y in np.linspace(0, length, 8)]), strip.width)
    foliage, wood = Surface('leaf'), Surface('bark')
    frond(foliage, wood, model, flat, rng, flat=True)
    return alone(scene, plant, [foliage], ((0, length / 2, 10), (0, 0, -1), (0, 1, 0), length)), length


def moss_tile(scene, plant, model, rng):
    """A hanging strand of moss, its hold at the top."""
    foliage = Surface('leaf')
    strands(foliage, model.moss_colour, Strip(np.array([UP * 0.0, UP * -0.7, UP * -1.4]), 0.5), rng)
    return alone(scene, plant, [foliage], ((0, -10, -0.7), (0, 1, 0), (0, 0, 1), 1.6))


def tuft_tiles(scene, plant, size):
    """The whole tuft from two sides, its foot at the picture's bottom."""
    tiles = []
    for turn in (0.0, math.pi / 2):
        way = np.array([math.sin(turn), -math.cos(turn), 0.0])
        lens = camera(scene, -way * 20 + UP * size / 2, way, UP, size)
        tiles.append(three(scene, plant, TILE, TILE, (0.4, size * 0.3), 'CAMERA'))
        remove(lens)
    return tiles


def box_of(sheet, pad=2):
    """The part of a frame any frame of the sheet fills, (left, top, right, bottom) as shares of a frame: the far
    quad covers only that."""
    albedo, _ = sheet
    covered = albedo[..., 3] > 0.1
    rows, columns = covered.shape
    frames = covered.reshape(rows // CELL, CELL, columns // CELL, CELL).any(axis=(0, 2))
    filled_rows, filled_columns = np.nonzero(frames)
    if len(filled_rows) == 0:
        return [0.0, 0.0, 1.0, 1.0]
    left, right = max(0, filled_columns.min() - pad), min(CELL, filled_columns.max() + 1 + pad)
    top, bottom = max(0, filled_rows.min() - pad), min(CELL, filled_rows.max() + 1 + pad)
    return [round(left / CELL, 4), round(top / CELL, 4), round(right / CELL, 4), round(bottom / CELL, 4)]


def canopy_of(sheet):
    """The mean colour of the leaves seen from the highest elevation: the wood's colour from afar."""
    albedo, normal = sheet
    top = slice((len(ELEVATIONS) - 1) * CELL, len(ELEVATIONS) * CELL)
    leafy = (albedo[top, :, 3] > 0.5) & (normal[top, :, 3] > 0.5)
    if leafy.sum() < 50:
        return None
    return [round(float(value), 4) for value in albedo[top][leafy][:, :3].mean(0)]

