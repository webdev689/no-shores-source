"""A biome's pictures packed into layers 1024 px square (a texture array on the GPU), each layer written as two PNGs
(albedo with coverage, normal with leaf share) that hold its mipmaps beside it: level 0 at the left, 1024 px square,
and each smaller level stacked down the 512 px column to its right. Mips keep each picture's coverage, so alpha-cut
leaves do not thin out with distance.
"""
import struct
import zlib

import numpy as np

LAYER = 1024
# An impostor sheet: a column an azimuth round the plant, a row an elevation (degrees), each frame CELL px square.
AZIMUTHS = 8
ELEVATIONS = (0, 25, 50, 75)
CELL = 128
# Levels 0 to 5: a 128 px impostor frame is still 4 px across at the last, so no picture bleeds into its neighbour.
MIPS = 6
SHEET = (AZIMUTHS * CELL, len(ELEVATIONS) * CELL)


def packed(sheets, groups):
    """Where each picture goes: impostor sheets (1024 x 512) two to a layer, then groups of 256 px tiles, sixteen to
    a layer, each group kept in one layer (a form's cards and bark are read from one). Gives each picture's
    (layer, x, y), and the layer count."""
    places = {}
    layer, top = 0, 0
    for name in sheets:
        places[name] = (layer, 0, top)
        top += SHEET[1]
        if top >= LAYER:
            layer, top = layer + 1, 0
    slots = [(layer, x, y) for y in range(top, LAYER, 256) for x in range(0, LAYER, 256)]
    for group in groups:
        if len(slots) < len(group):
            layer += 1
            slots = [(layer, x, y) for y in range(0, LAYER, 256) for x in range(0, LAYER, 256)]
        for name in group:
            places[name] = slots.pop(0)
    return places, 1 + max((place[0] for place in places.values()), default=0)


def kept_cover(alpha, target):
    """Scales a mip's alpha so as much of it passes the client's test (alpha over a half) as passed at level 0."""
    if target <= 0 or alpha.max() <= 0 or (alpha > 0.5).mean() >= target:
        return alpha
    low, high = 1.0, 8.0
    for _ in range(16):
        middle = (low + high) / 2
        if (np.minimum(alpha * middle, 1) > 0.5).mean() < target:
            low = middle
        else:
            high = middle
    return np.minimum(alpha * (low + high) / 2, 1)


def mips(level0, cover_cells=128):
    """The mip chain of a layer's picture (float, 1024 x 1024 x 4): box filtered, the alpha of each 128 px cell kept
    at its level-0 coverage when `cover_cells` is given."""
    chain = [level0]
    for level in range(1, MIPS):
        previous = chain[-1]
        size = previous.shape[0] // 2
        smaller = previous.reshape(size, 2, size, 2, 4).mean((1, 3))
        if cover_cells:
            cell = cover_cells >> level
            for row in range(0, size, cell):
                for column in range(0, size, cell):
                    first = level0[row << level:(row + cell) << level, column << level:(column + cell) << level, 3]
                    block = smaller[row:row + cell, column:column + cell]
                    block[..., 3] = kept_cover(block[..., 3], float((first > 0.5).mean()))
        chain.append(smaller)
    return chain


def with_mips(chain):
    """The chain laid out in one picture, 1.5 times as wide as level 0."""
    out = np.zeros((LAYER, LAYER + LAYER // 2, 4), np.float32)
    out[:LAYER, :LAYER] = chain[0]
    for level in range(1, MIPS):
        size = LAYER >> level
        top = LAYER - (2 * LAYER >> level)
        out[top:top + size, LAYER:LAYER + size] = chain[level]
    return out


def png(pixels):
    """RGBA8 PNG bytes of float pixels (rows top first), each row filtered by the one above it."""
    data = np.clip(np.round(pixels * 255), 0, 255).astype(np.uint8)
    height, width = data.shape[:2]
    rows = data.reshape(height, width * 4).astype(np.int16)
    up = (rows - np.vstack([np.zeros((1, width * 4), np.int16), rows[:-1]])) % 256
    raw = np.hstack([np.full((height, 1), 2, np.int16), up]).astype(np.uint8).tobytes()

    def chunk(kind, body):
        return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def layers(pictures, places, count):
    """Each layer's albedo and normal PNG bytes, from the pictures (name: (albedo, normal)) at their places."""
    out = []
    for layer in range(count):
        albedo = np.zeros((LAYER, LAYER, 4), np.float32)
        normal = np.zeros((LAYER, LAYER, 4), np.float32)
        normal[..., 2] = 1.0
        normal[..., :3] = normal[..., :3] * 0.5 + 0.5
        for name, (picture_albedo, picture_normal) in pictures.items():
            at, x, y = places[name]
            if at != layer:
                continue
            height, width = picture_albedo.shape[:2]
            albedo[y:y + height, x:x + width] = picture_albedo
            normal[y:y + height, x:x + width] = picture_normal
        normal_chain = mips(normal, cover_cells=0)
        out.append((png(with_mips(mips(albedo))), png(with_mips(normal_chain))))
    return out
