"""Grows a plant's skeleton from its seed: limbs (polylines with radii), the sprays of leaves at their tips, fronds,
blades, buttress fins and, for a rock, its shape. Pure Python and numpy, so the same seed grows the same plant on any
run. Blender's frame: metres, z up, the foot at the origin. detail.py dresses the skeleton in leaves and bark.
"""
import math
from dataclasses import dataclass, field

import numpy as np

UP = np.array([0.0, 0.0, 1.0])


@dataclass
class Limb:
    points: np.ndarray
    radii: np.ndarray
    level: int


@dataclass
class Cluster:
    """A spray of leaves round a twig's end: where it is, the way it faces out of the crown, and how far it reaches."""
    centre: np.ndarray
    out: np.ndarray
    radius: float


@dataclass
class Strip:
    """A frond, blade or strand of moss: its spine and its width at the base."""
    spine: np.ndarray
    width: float


@dataclass
class Model:
    height: float
    bark: dict
    leaf: dict | None = None
    limbs: list = field(default_factory=list)
    clusters: list = field(default_factory=list)
    fronds: list = field(default_factory=list)
    blades: list = field(default_factory=list)
    moss: list = field(default_factory=list)
    # Buttresses: (turn, height up the trunk, reach along the ground, thickness), metres.
    fins: list = field(default_factory=list)
    rock: dict | None = None
    moss_colour: tuple | None = None
    # Cactus skin is ribbed this many times round.
    ribs: int = 0


def unit(vector):
    length = np.linalg.norm(vector)
    return vector / length if length > 1e-9 else vector


def in_ellipsoids(points, ellipsoids):
    """Which points lie inside any of the ellipsoids (centre, radii)."""
    inside = np.zeros(len(points), bool)
    for centre, radii in ellipsoids:
        inside |= (((points - centre) / radii) ** 2).sum(1) <= 1.0
    return inside


def scatter_in(rng, ellipsoids, count, keep=None):
    """`count` points spread evenly through a union of ellipsoids, and kept by `keep` when it is given."""
    low = np.min([centre - radii for centre, radii in ellipsoids], axis=0)
    high = np.max([centre + radii for centre, radii in ellipsoids], axis=0)
    found = []
    while sum(len(each) for each in found) < count:
        trial = rng.uniform(low, high, size=(count * 4, 3))
        trial = trial[in_ellipsoids(trial, ellipsoids)]
        if keep is not None:
            trial = trial[keep(trial)]
        found.append(trial)
    return np.concatenate(found)[:count]


def chain(base, top, steps, rng, lean=0.0):
    """A trunk's nodes from its base to its top, wandering a little."""
    points = []
    drift = np.array([rng.normal(0, lean), rng.normal(0, lean), 0.0])
    for step in range(steps + 1):
        share = step / steps
        points.append(base + (top - base) * share + drift * share * share)
    return points


def colonise(rng, attractors, trunk, step, influence, kill, rise=0.0, rounds=160, sprout_from=0):
    """Space colonisation: each node grows toward the attractors nearest it until they are reached. `trunk` is the
    chain it starts from; branches may sprout from its nodes from `sprout_from` on. Gives each node and its parent."""
    nodes = [np.array(point, float) for point in trunk]
    parents = [-1] + list(range(len(trunk) - 1))
    live = attractors.copy()
    sprouting = np.arange(len(nodes)) >= sprout_from
    candidates = np.array(nodes)[sprouting]
    index_of = np.flatnonzero(sprouting)
    gaps = np.linalg.norm(live[:, None, :] - candidates[None, :, :], axis=2)
    nearest = index_of[gaps.argmin(1)]
    distance = gaps.min(1)
    for _ in range(rounds):
        if len(live) == 0:
            break
        pulled = distance < influence
        if not pulled.any():
            break
        ways = (live[pulled] - np.array(nodes)[nearest[pulled]]) / distance[pulled, None]
        sums = {}
        for node, way in zip(nearest[pulled], ways):
            sums[node] = sums.get(node, 0) + way
        grown = []
        for node in sorted(sums):
            way = unit(unit(sums[node]) + UP * rise + rng.normal(0, 0.08, 3))
            point = nodes[node] + way * step
            nodes.append(point)
            parents.append(node)
            grown.append(len(nodes) - 1)
        if not grown:
            break
        new = np.array([nodes[each] for each in grown])
        gaps = np.linalg.norm(live[:, None, :] - new[None, :, :], axis=2)
        closer = gaps.min(1) < distance
        nearest = np.where(closer, np.array(grown)[gaps.argmin(1)], nearest)
        distance = np.minimum(distance, gaps.min(1))
        alive = distance > kill
        live, nearest, distance = live[alive], nearest[alive], distance[alive]
    return np.array(nodes), np.array(parents)


def limbs_of(nodes, parents, root_radius, twig_radius, exponent=2.4):
    """The node tree as limbs: radii by the pipe model (a parent's area the sum of its children's), each limb
    following its thickest child on, every other child starting a limb a level up."""
    count = len(nodes)
    children = [[] for _ in range(count)]
    for node in range(1, count):
        children[parents[node]].append(node)
    radii = np.full(count, 1.0)
    for node in range(count - 1, -1, -1):
        if children[node]:
            radii[node] = sum(radii[child] ** exponent for child in children[node]) ** (1 / exponent)
    # A node carrying a few tips' worth of pipe is an outer twig.
    twigs = [node for node in range(count) if radii[node] <= 2.0]
    radii = np.maximum(radii * (root_radius / radii[0]), twig_radius)
    limbs = []
    starts = [(0, -1, 0)]
    while starts:
        node, parent, level = starts.pop()
        path = [parent] if parent >= 0 else []
        while True:
            path.append(node)
            if not children[node]:
                break
            ordered = sorted(children[node], key=lambda child: -radii[child])
            for other in ordered[1:]:
                starts.append((other, node, level + 1))
            node = ordered[0]
        if len(path) >= 2:
            # A branch starts inside its parent at its own thickness, not the parent's.
            widths = radii[path].copy()
            if parent >= 0:
                widths[0] = widths[1]
            limbs.append(Limb(nodes[path], widths, level))
    return limbs, twigs


def crowned(model, nodes, tips, centre, spray, rng, outward=None):
    """A spray of leaves at each twig, facing out of the crown from `centre`, none closer than half a spray."""
    placed = []
    for tip in tips:
        if any(np.linalg.norm(nodes[tip] - other) < spray * 0.5 for other in placed[-40:]):
            continue
        placed.append(nodes[tip])
        point = nodes[tip]
        out = unit(point - centre) if outward is None else outward(point)
        model.clusters.append(Cluster(point, unit(out + rng.normal(0, 0.15, 3)), spray * rng.uniform(0.8, 1.2)))


def flared(limb, flare, rise=1.6):
    """A trunk flaring toward its foot, `flare` times its radius at the ground."""
    heights = limb.points[:, 2]
    limb.radii = limb.radii * (1 + (flare - 1) * np.clip(1 - heights / rise, 0, 1) ** 2)
    return limb


def grounded(trunk_limb):
    """The trunk starts a little under the ground, so it meets a slope's downhill side."""
    trunk_limb.points = np.vstack([trunk_limb.points[:1] - [0, 0, 0.4], trunk_limb.points])
    trunk_limb.radii = np.concatenate([trunk_limb.radii[:1], trunk_limb.radii])
    return trunk_limb


def tree(rng, model, trunk_top, ellipsoids, count, step, influence, kill, trunk_radius, spray, rise=0.0,
         sprout_from=None, flare=1.25, keep=None, steps=None):
    """A tree grown by space colonisation into a crown made of ellipsoids."""
    steps = steps or max(3, int(trunk_top[2] / step))
    trunk = chain(np.zeros(3), np.array(trunk_top, float), steps, rng, lean=0.02 * trunk_top[2])
    attractors = scatter_in(rng, ellipsoids, count, keep)
    nodes, parents = colonise(rng, attractors, trunk, step, influence, kill, rise,
                              sprout_from=steps if sprout_from is None else sprout_from)
    limbs, tips = limbs_of(nodes, parents, trunk_radius, max(0.012, trunk_radius * 0.03))
    limbs[0] = grounded(flared(limbs[0], flare))
    model.limbs += limbs
    centre = np.mean([centre for centre, _ in ellipsoids], axis=0)
    crowned(model, nodes, tips, centre, spray, rng)
    return nodes
