"""The bark, stone and leaf pictures, made in code: periodic noise, so a picture tiles round a trunk and along it with
no seam. Each is an albedo (display values, 0..1) and a height, from which normals() makes a tangent-space normal map.
"""
import numpy as np

SIZE = 256


def periodic_noise(size, cells, seed, stretch=(1, 1)):
    """Value noise that wraps at the picture's edges: `cells` lattice cells across (times `stretch` per axis)."""
    columns, rows = int(cells * stretch[0]), int(cells * stretch[1])
    rng = np.random.default_rng(seed)
    lattice = rng.uniform(-1, 1, (rows, columns))
    y, x = np.mgrid[0:size, 0:size] / size
    gx, gy = x * columns, y * rows
    x0, y0 = np.floor(gx).astype(int), np.floor(gy).astype(int)
    fx, fy = gx - x0, gy - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    x1, y1 = (x0 + 1) % columns, (y0 + 1) % rows
    x0, y0 = x0 % columns, y0 % rows
    top = lattice[y0, x0] * (1 - fx) + lattice[y0, x1] * fx
    bottom = lattice[y1, x0] * (1 - fx) + lattice[y1, x1] * fx
    return top * (1 - fy) + bottom * fy


def fractal(size, cells, seed, stretch=(1, 1), octaves=4):
    total, amplitude = np.zeros((size, size)), 1.0
    for octave in range(octaves):
        total += amplitude * periodic_noise(size, cells * 2 ** octave, seed + octave, stretch)
        amplitude *= 0.5
    return total / 1.9


def cells_of(size, count, seed):
    """Distance to the nearest of `count` points scattered on the wrapping square (worley noise), 0..~1."""
    rng = np.random.default_rng(seed)
    points = rng.uniform(0, 1, (count, 2))
    y, x = np.mgrid[0:size, 0:size] / size
    best = np.full((size, size), 9.0)
    for px, py in points:
        dx = np.abs(x - px)
        dy = np.abs(y - py)
        dx, dy = np.minimum(dx, 1 - dx), np.minimum(dy, 1 - dy)
        best = np.minimum(best, np.hypot(dx, dy))
    return best * count ** 0.5


def bark(style, colour, seed):
    """A bark or stone picture: albedo (SIZE, SIZE, 3) and height (SIZE, SIZE). Its v runs along the trunk."""
    size = SIZE
    base = np.array(colour, float)
    grain = fractal(size, 4, seed)
    if style == 'furrowed':
        ridges = np.abs(fractal(size, 3, seed + 1, (3, 0.7)))
        height = np.clip(ridges * 2.2, 0, 1) * 0.8 + 0.2 * grain
        shade = 0.55 + 0.6 * height
    elif style == 'scaly':
        plates = cells_of(size, 18, seed + 2)
        height = np.clip(plates * 1.4, 0, 1) * 0.7 + 0.3 * grain
        shade = 0.6 + 0.55 * height
    elif style == 'papery':
        dashes = fractal(size, 2, seed + 3, (1, 8))
        lenticels = (dashes > 0.32).astype(float) * (0.5 + 0.5 * np.clip(fractal(size, 3, seed + 4) + 0.6, 0, 1))
        patches = np.clip(fractal(size, 2, seed + 5) - 0.25, 0, 1) * 1.5
        height = 0.6 - 0.5 * lenticels + 0.1 * grain
        shade = 1.0 - 0.75 * lenticels - 0.45 * patches + 0.05 * grain
    elif style == 'ringed':
        y = np.mgrid[0:size, 0:size][0] / size
        rings = 0.5 + 0.5 * np.cos(y * np.pi * 2 * 5 + 0.6 * grain)
        height = rings ** 3 * 0.8 + 0.2 * np.abs(fractal(size, 3, seed + 6, (6, 1)))
        shade = 0.7 + 0.45 * height
    elif style == 'skin':
        x = np.mgrid[0:size, 0:size][1] / size
        rib = 0.5 + 0.5 * np.cos((x - 0.5) * np.pi * 2)
        spots = np.clip(0.18 - cells_of(size, 6, seed + 7) * 0.4, 0, 1) * 5 * (rib > 0.85)
        height = rib * 0.9 + 0.05 * grain
        shade = 0.72 + 0.35 * rib + 0.05 * grain
        base = base * (1 - spots[..., None] * 0.2) + np.array([0.8, 0.75, 0.6]) * spots[..., None] * 0.2
    elif style == 'dead':
        cracks = np.abs(fractal(size, 3, seed + 8, (5, 0.6)))
        height = np.clip(cracks * 2.5, 0, 1) * 0.6 + 0.4 * grain
        shade = 0.75 + 0.35 * height
    elif style == 'stone':
        y = np.mgrid[0:size, 0:size][0] / size
        strata = 0.5 + 0.5 * np.sin(y * np.pi * 2 * 3 + 1.4 * fractal(size, 2, seed + 9))
        height = 0.6 * grain + 0.3 * strata + 0.1 * cells_of(size, 30, seed + 10)
        shade = 0.82 + 0.25 * grain + 0.1 * strata
    else:
        height = 0.5 + 0.3 * grain
        shade = 0.9 + 0.15 * grain
    if style == 'papery':
        base = np.array([0.86, 0.85, 0.8])
    albedo = np.clip(shade[..., None] * base, 0, 1)
    return albedo, np.clip(height, 0, 1)


def leaf_picture(seed):
    """A leaf's veins and edge as a shade (multiplying its colour) and a height, its u across and v along it."""
    size = SIZE
    y, x = np.mgrid[0:size, 0:size] / size
    across = np.abs(x - 0.5)
    midrib = np.exp(-(across / 0.018) ** 2)
    veins = np.exp(-((np.abs((y - across * 0.9) * 7) % 1.0 - 0.5) / 0.07) ** 2) * (across < 0.45)
    grain = fractal(size, 6, seed, octaves=3)
    shade = 1.0 - 0.18 * midrib - 0.08 * veins + 0.06 * grain + 0.1 * (y - 0.5)
    height = 0.5 - 0.3 * midrib - 0.15 * veins + 0.2 * (0.5 - across)
    return np.clip(shade, 0, 1.2), np.clip(height, 0, 1)


def normals(height, strength):
    """A tangent-space normal map from a wrapping height: x along u, y up the picture (against v), z out."""
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5 * strength
    dy = (np.roll(height, 1, 0) - np.roll(height, -1, 0)) * 0.5 * strength
    normal = np.stack([-dx, -dy, np.ones_like(height)], -1)
    return normal / np.linalg.norm(normal, axis=-1, keepdims=True)
