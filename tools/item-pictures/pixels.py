"""A render made a glyph, as the hand-drawn glyphs are: shrunk to its cells, each the mean of the render's pixels
over it, kept where it is half covered, its colours cut to a few, and the outline traced round it. No Blender here,
so `test_pixels.py` runs without it.
"""
import numpy as np

# Render pixels to a cell: each cell is the mean of these, so an edge falls on a whole cell.
SCALE = 8
OUTLINE = '#120e0a'
LETTERS = 'abcdefghijkl'


def glyph(pixels, cells, most=11):
    """A render as a glyph: each cell the mean of its pixels, kept where it is half covered, its colours cut to
    `most` by k-means (the same each run), and the outline traced round it. Its rows of letters and its colours, the
    outline first, then light to dark."""
    blocks = pixels.reshape(cells, SCALE, cells, SCALE, 4)
    cover = blocks[..., 3].mean(axis=(1, 3))
    weight = np.maximum(blocks[..., 3:4].sum(axis=(1, 3)), 1e-9)
    colours = (blocks[..., :3] * blocks[..., 3:4]).sum(axis=(1, 3)) / weight
    solid = cover >= 0.5
    centres = quantised(colours[solid], most)
    nearest = np.argmin(((colours[..., None, :] - centres[None, None]) ** 2).sum(axis=-1), axis=-1)
    order = np.argsort(-(centres @ np.array([0.2126, 0.7152, 0.0722])))
    place = np.empty(len(order), dtype=int)
    place[order] = np.arange(len(order))
    tone = np.where(solid, place[nearest] + 1, -1)
    edge = (~solid) & np.pad(solid, 1)[1:-1, 2:] | (~solid) & np.pad(solid, 1)[1:-1, :-2]
    edge |= (~solid) & np.pad(solid, 1)[2:, 1:-1] | (~solid) & np.pad(solid, 1)[:-2, 1:-1]
    tone = np.where(edge, 0, tone)
    used = sorted({int(each) for each in tone.flat if each >= 0})
    letter = {old: LETTERS[new] for new, old in enumerate(used)}
    rows = [''.join('.' if each < 0 else letter[int(each)] for each in row) for row in tone]
    palette = [OUTLINE if old == 0 else hexed(centres[order[old - 1]]) for old in used]
    return rows, palette


def quantised(colours, most):
    """At most `most` colours standing for `colours`: k-means from colours spread evenly by brightness."""
    if len(colours) == 0:
        return np.zeros((1, 3))
    unique = on_bytes(colours)
    if len(unique) <= most:
        return unique
    bright = colours @ np.array([0.2126, 0.7152, 0.0722])
    order = np.argsort(bright, kind='stable')
    centres = colours[order[np.linspace(0, len(order) - 1, most).astype(int)]].copy()
    for _ in range(30):
        nearest = np.argmin(((colours[:, None] - centres[None]) ** 2).sum(axis=-1), axis=1)
        for index in range(most):
            if np.any(nearest == index):
                centres[index] = colours[nearest == index].mean(axis=0)
    return on_bytes(centres)


def on_bytes(colours):
    """The colours as they are written, each channel to 1/255, and each once: two that write the same are one."""
    return np.unique(np.round(colours * 255) / 255, axis=0)


def hexed(colour):
    return '#' + ''.join(f'{int(round(min(max(value, 0), 1) * 255)):02x}' for value in colour)
