"""A beast's fitted proportions: each piece of its fused body grown or thinned about its own axis (`<piece>_g`), along
it by a profile of factors (`<piece>_p`, one a section row), and its whole size on screen (`scale`). beastfit.py fits
them; beastforge.py lays them on the meshes it renders and beastfit.py on its raster's points, by the same `move`, so
what is fitted is what is drawn. A group of pieces may be sized whole about a centre (a Piece's `size`: the head and
its cheeks, and every rigid part riding them). `elevation` is how far the camera looks down on the beast, fitted as
the rest are. Kept beside the spec as <spec>-shape.json."""
import json
import os

import numpy as np

from beastkit import chain_place
from shape import write_shape  # noqa: F401  (the fighter's writer: one row a key)

DEFAULT = {'scale': 1.0}
SHAPE = dict(DEFAULT)


def load_shape(path):
    SHAPE.clear()
    SHAPE.update(DEFAULT)
    if os.path.exists(path):
        SHAPE.update(json.load(open(path)))


def key(piece):
    """A piece's girth key: a left and a right piece share one (`fore_L`, `fore_R` -> `fore_g`)."""
    base = piece[:-2] if piece.endswith(('_L', '_R')) else piece
    return base + '_g'


def profile_key(piece):
    return key(piece)[:-2] + '_p'


def frame_of(points, piece):
    """Each point's foot on the piece's axis and its share of the way along it: (n, 4)."""
    axis = piece.axis
    if len(axis) == 1:
        return np.hstack([np.repeat(axis, len(points), axis=0), np.zeros((len(points), 1))])
    at, foot = chain_place(points, axis)
    length = np.linalg.norm(np.diff(axis, axis=0), axis=1).sum()
    return np.hstack([foot, (at / length)[:, None]])


def move(p, alpha, frames, pieces, S):
    """Points `p` (rest space) moved by the proportions `S`: each by every piece it lies on (its shares `alpha`), about
    its foot on that piece's axis (`frames`, from frame_of)."""
    out = p.copy()
    for k, pc in enumerate(pieces):
        a = alpha[:, k]
        if not a.any():
            continue
        f = frames[:, 4 * k:4 * k + 4]
        g = np.full(len(p), float(S.get(key(pc.name), 1.0)))
        prof = S.get(profile_key(pc.name))
        if prof is not None and pc.rows is not None:
            g *= np.interp(f[:, 3], pc.rows, prof)
        out += (a * (g - 1.0))[:, None] * (p - f[:, :3])
        if pc.size is not None:   # the whole piece sized about its group's centre
            k_, c = pc.size
            out += (a * (float(S.get(k_, 1.0)) - 1.0))[:, None] * (p - np.asarray(c))
    return out


def defaults(beast):
    """Every proportion a beast's pieces take, at its default."""
    import stage
    out = dict(DEFAULT, elevation=float(stage.ELEVATION))
    for pc in pieces_of(beast):
        out[key(pc.name)] = 1.0
        if pc.size is not None:
            out[pc.size[0]] = 1.0
        if pc.rows is not None:
            out[profile_key(pc.name)] = [1.0] * len(pc.rows)
    return out


def pieces_of(beast):
    seen, out = set(), []
    for sk in beast.skins:
        for pc in sk.pieces:
            if key(pc.name) not in seen:
                seen.add(key(pc.name))
                out.append(pc)
    return out


class Shaper:
    """Lays a shape table on a beast's skins and on the rigid parts riding them: each vertex keeps its rest place,
    its shares of its skin's pieces and its feet on their axes, so a table is laid on at any time."""

    def __init__(self, beast):
        self.beast = beast
        self.rest = [sk.rest.copy() for sk in beast.skins]
        self.frames = [np.hstack([frame_of(r, pc) for pc in sk.pieces]) for sk, r in zip(beast.skins, self.rest)]
        self.rigid = []
        for ob, j in beast.parts:   # a rigid part on a piece of a skin (beastkit.hang's `rides`) moves as it does
            on = ob.get('rides')
            if on is None:
                continue
            sk, k = next((s, i) for s in beast.skins for i, pc in enumerate(s.pieces) if pc.name == on)
            head = np.array(beast.kind.rest(j))
            co = np.array([v.co[:] for v in ob.data.vertices]) + head
            alpha = np.zeros((len(co), len(sk.pieces)))
            alpha[:, k] = 1.0
            self.rigid.append((ob, head, co, alpha, np.hstack([frame_of(co, pc) for pc in sk.pieces]), sk.pieces))

    def lay(self, S):
        for sk, r, f in zip(self.beast.skins, self.rest, self.frames):
            sk.rest = move(r, sk.alpha, f, sk.pieces, S)
            sk.me.vertices.foreach_set('co', sk.rest.ravel())
            sk.me.update()
        for ob, head, co, alpha, f, pieces in self.rigid:
            ob.data.vertices.foreach_set('co', (move(co, alpha, f, pieces, S) - head).ravel())
            ob.data.update()
