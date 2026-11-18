"""Each grower in species.py: a form's shape and seed in, its skeleton (grow.Model) out."""
import math

import numpy as np

from grow import (UP, Cluster, Limb, Model, Strip, chain, colonise, crowned, flared, grounded, limbs_of, scatter_in,
                  tree, unit)


def ring_lobes(rng, centre, radii, lobes, lobe):
    """A crown of a core and lobes swelling out of it, a ragged outline: the lower ring wider, the upper smaller."""
    shapes = [(np.array(centre, float), np.array(radii, float) * 0.8)]
    for index in range(lobes):
        turn = index / lobes * math.tau + rng.uniform(-0.3, 0.3)
        upper = index % 2
        out = np.array([math.cos(turn) * radii[0] * (0.55 - 0.15 * upper), math.sin(turn) * radii[1] *
                        (0.55 - 0.15 * upper), radii[2] * (-0.15 + 0.5 * upper)])
        size = lobe * rng.uniform(0.75, 1.1) * (1 - 0.2 * upper)
        shapes.append((np.array(centre, float) + out, np.array([size, size, size * 0.8])))
    return shapes


def broadleaf(shape, rng):
    model = Model(shape['height'], dict(colour=shape['bark'], style=shape['style']),
                  dict(colour=shape['leaves'], form='broad', length=0.17))
    rx, ry, rz = shape['crown']
    centre = (0, 0, shape['crown_at'])
    lobes = ring_lobes(rng, centre, (rx, ry, rz), 6, min(rx, rz) * 0.6)
    tree(rng, model, (0, 0, shape['crown_at'] - rz * 0.55), lobes, 700, 0.5, rx * 0.7, 0.8, shape['trunk'], 0.85)
    return model


def birch(shape, rng):
    height = shape['height']
    model = Model(height, dict(colour=(0.86, 0.85, 0.8), style='papery'),
                  dict(colour=shape['leaves'], form='small', length=0.07))
    centre = (0, 0, height * 0.66)
    lobes = ring_lobes(rng, centre, (height * 0.2, height * 0.2, height * 0.32), 7, height * 0.11)
    tree(rng, model, (0, 0, height * 0.45), lobes, 420, 0.45, height * 0.25, 0.6, height * 0.017, 0.45, rise=0.35,
         sprout_from=3)
    return model


def acacia(shape, rng):
    model = Model(7.5, dict(colour=shape['bark'], style='furrowed'),
                  dict(colour=shape['leaves'], form='small', length=0.05))
    crown = [(np.array([0, 0, 6.6]), np.array([5.6, 5.6, 1.1])),
             (np.array([1.5, 0.8, 6.9]), np.array([3.5, 3.0, 0.8]))]
    tree(rng, model, (0, 0, 2.4), crown, 500, 0.45, 4.0, 0.7, 0.28, 0.75, rise=0.25,
         keep=lambda points: points[:, 2] > 6.1)
    return model


def baobab(shape, rng):
    model = Model(12, dict(colour=shape['bark'], style='smooth'),
                  dict(colour=shape['leaves'], form='broad', length=0.1))
    trunk = chain(np.zeros(3), np.array([0, 0, 8.5]), 8, rng)
    crown = [(np.array([0, 0, 10.5]), np.array([4.5, 4.5, 1.6]))]
    nodes, parents = colonise(rng, scatter_in(rng, crown, 70), trunk, 0.6, 4.0, 1.0, rise=0.5, sprout_from=7)
    limbs, tips = limbs_of(nodes, parents, 1.6, 0.06, exponent=2.0)
    # A bottle of a trunk: swelling to its middle, then narrowing sharply into the limbs.
    heights = limbs[0].points[:, 2]
    limbs[0].radii = np.where(heights < 8.6, 1.6 + 0.35 * np.sin(np.clip(heights / 8.6, 0, 1) * math.pi) -
                              0.8 * np.clip((heights - 6.5) / 2.1, 0, 1), limbs[0].radii)
    limbs[0] = grounded(limbs[0])
    model.limbs += limbs
    crowned(model, nodes, tips, np.array([0, 0, 9.0]), 0.55, rng)
    return model


def dead(shape, rng):
    height = shape['height']
    model = Model(height, dict(colour=shape['bark'], style='dead'))
    crown = [(np.array([0, 0, height * 0.65]), np.array([height * 0.3, height * 0.3, height * 0.35]))]
    tree(rng, model, (0, 0, height * 0.4), crown, 45, 0.35, height * 0.45, 0.5, 0.2, 0, rise=0.3, sprout_from=2)
    model.clusters = []
    return model


def mangrove(shape, rng):
    model = Model(6.5, dict(colour=shape['bark'], style='furrowed'),
                  dict(colour=shape['leaves'], form='broad', length=0.11))
    crown = ring_lobes(rng, (0, 0, 4.6), (3.3, 3.3, 1.7), 6, 1.5)
    tree(rng, model, (0, 0, 3.4), crown, 500, 0.4, 2.6, 0.6, 0.22, 0.55)
    # Arching prop roots from the trunk down to the water, holding it clear.
    for index in range(7):
        turn = index / 7 * math.tau + rng.uniform(-0.3, 0.3)
        reach = rng.uniform(1.6, 2.6)
        start = rng.uniform(1.4, 2.6)
        steps = np.linspace(0, 1, 7)
        points = np.stack([np.cos(turn) * reach * steps, np.sin(turn) * reach * steps,
                           start * (1 - steps) + 0.9 * np.sin(steps * math.pi) - 0.3 * steps], 1)
        model.limbs.append(Limb(points, np.full(7, 0.07), 1))
    return model


def conifer(shape, rng):
    """A fir or spruce: whorls of drooping boughs round a straight trunk, longer at each tier's foot, needled to the
    tip of its leader."""
    height, width, tiers = shape['height'], shape['width'], shape['tiers']
    model = Model(height, dict(colour=shape['bark'], style='scaly'),
                  dict(colour=shape['leaves'], form='needle', length=0.11))
    model.limbs.append(grounded(flared(Limb(np.array([[0, 0, z] for z in np.linspace(0, height, 12)]),
                                            np.linspace(height * 0.018, 0.02, 12), 0), 1.4, 1.0)))
    first = height * 0.08
    whorls = max(8, int((height - first) / (0.42 * height / 18 + 0.25)))
    spray_size = 0.35 + 0.04 * width
    for whorl in range(whorls):
        share = whorl / whorls
        z = first + (height - first) * share
        in_tier = (share * tiers) % 1.0
        # The cone's outline: the full width at the foot, narrowing a little slower than straight toward the top.
        reach = width * 0.55 * (1 - share) ** 0.85 * (1.0 - 0.25 * in_tier) + 0.2
        droop = 0.25 + shape['skirt'] * 3 * (1 - share)
        boughs = 7 + int(rng.integers(0, 3))
        offset = rng.uniform(0, math.tau)
        for bough in range(boughs):
            turn = offset + bough / boughs * math.tau + rng.uniform(-0.2, 0.2)
            length = reach * rng.uniform(0.85, 1.1)
            steps = np.linspace(0, 1, 6)
            points = np.stack([np.cos(turn) * length * steps, np.sin(turn) * length * steps,
                               z + length * (0.15 * steps - droop * steps ** 2)], 1)
            model.limbs.append(Limb(points, np.linspace(0.02 + 0.03 * (1 - share) * width / 6, 0.008, 6), 1))
            sprays = max(1, int(length / (spray_size * 0.9)))
            for spray in range(sprays):
                along = (spray + 0.6) / sprays
                at = np.array([math.cos(turn) * length * along, math.sin(turn) * length * along,
                               z + length * (0.15 * along - droop * along ** 2)])
                out = unit(np.array([at[0], at[1], 0.0]) + UP * 0.25)
                model.clusters.append(Cluster(at, out, spray_size * (1.1 - 0.3 * share)))
    # The leader's last stretch is needled too, so the tree ends in a green tip, not a bare spike.
    for z in np.arange(height - 1.6, height - 0.1, 0.35):
        model.clusters.append(Cluster(np.array([0.0, 0.0, z]), UP, spray_size * 0.6))
    return model


def umbrella_pine(shape, rng):
    """A stone pine: a tall trunk forking into a broad, flat, dense crown of needle tufts."""
    height = shape['height']
    model = Model(height, dict(colour=shape['bark'], style='scaly'),
                  dict(colour=shape['leaves'], form='needle', length=0.16, tufted=True))
    crown = [(np.array([0, 0, height * 0.84]), np.array([5.4, 5.4, 1.9])),
             (np.array([1.8, -1.0, height * 0.88]), np.array([3.2, 3.2, 1.4]))]
    tree(rng, model, (0, 0, height * 0.6), crown, 900, 0.5, 4.0, 0.7, 0.4, 0.8, rise=0.35,
         keep=lambda points: points[:, 2] > height * 0.76)
    # Tufts face up out of the crown's flat top, so from above and afar it reads as one green roof.
    for cluster in model.clusters:
        cluster.out = unit(cluster.out * 0.5 + UP)
    return model


def tiered(shape, rng):
    """Broad tiers, one over another with air between them, drooping at their rims and stepping in as they rise, over
    a trunk flaring onto buttress fins. Each tier is a flat disc of crown its boughs grow into from the trunk."""
    height, spread, tiers, depth = shape['height'], shape['spread'], shape['tiers'], shape['depth']
    model = Model(height, dict(colour=shape['bark'], style='smooth'),
                  dict(colour=shape['leaves'], form='broad', length=0.12))
    base = height * shape['crown_base']
    crown = []
    for tier in range(tiers):
        share = tier / max(1, tiers - 1)
        # The lowest tier sits a little over the crown's base and the highest just under the top, so the top tier's
        # leaves reach the tree's height.
        z = base + depth + (height - base - 2 * depth) * share
        radius = spread * (1 - shape['step_in'] * share)
        crown.append((np.array([rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), z]),
                      np.array([radius, radius * rng.uniform(0.85, 1.0), depth])))
    top = crown[-1][0][2]
    tree(rng, model, (0, 0, top - depth), crown, 300 * tiers, 0.6, spread * shape['influence'], 1.0, shape['trunk'],
         shape['spray'],
         rise=0.05, sprout_from=int(base / 0.6 * 0.85), flare=shape['flare'])
    # A tier's rim sags below it, the further out the more, so each tier reads as its own drooping layer.
    for cluster in model.clusters:
        out = math.hypot(cluster.centre[0], cluster.centre[1]) / spread
        cluster.centre = cluster.centre - UP * shape['droop'] * out ** 2
        cluster.out = unit(cluster.out * 0.35 + UP - UP * out * 0.6)
    for fin in range(shape['fins']):
        turn = fin / shape['fins'] * math.tau + rng.uniform(-0.3, 0.3)
        model.fins.append((turn, shape['trunk'] * rng.uniform(3.5, 5), shape['trunk'] * rng.uniform(2.6, 3.4),
                           shape['trunk'] * 0.35))
    if shape['moss']:
        model.moss_colour = shape['moss']
        # Moss hangs from the underside of every tier's outer half.
        under = [cluster for cluster in model.clusters
                 if math.hypot(cluster.centre[0], cluster.centre[1]) > spread * 0.45]
        for cluster in under[::9]:
            hold = cluster.centre - UP * 0.25
            length = rng.uniform(0.8, 1.6)
            model.moss.append(Strip(np.array([hold, hold - UP * length * 0.5, hold - UP * length]), 0.5))
    return model


def palm(shape, rng):
    height, bow = shape['height'], shape['bow']
    model = Model(height, dict(colour=shape['bark'], style='ringed'),
                  dict(colour=shape['leaves'], form='frond', length=0.6))
    turn = rng.uniform(0, math.tau)
    steps = np.linspace(0, 1, 14)
    sway = np.array([math.cos(turn), math.sin(turn), 0.0])
    points = np.array([sway * bow * step ** 2 + UP * height * step for step in steps])
    model.limbs.append(grounded(flared(Limb(points, np.linspace(0.26, 0.17, 14), 0), 1.5, 0.8)))
    top = points[-1]
    for frond in range(shape['fronds']):
        angle = frond / shape['fronds'] * math.tau + rng.uniform(-0.15, 0.15)
        rise = rng.uniform(-0.1, 0.9)
        length = shape['length'] * rng.uniform(0.85, 1.1)
        way = np.array([math.cos(angle), math.sin(angle), 0.0])
        along = np.linspace(0, 1, 7)
        spine = [top + way * length * share + UP * length * (rise * share - (0.55 + 0.35 * rise) * share ** 2)
                 for share in along]
        model.fronds.append(Strip(np.array(spine), 1.0))
    return model


def cactus(shape, rng):
    height = shape['height']
    model = Model(height, dict(colour=shape['bark'], style='skin'))
    model.ribs = 12
    column = np.array([[0, 0, z] for z in np.linspace(0, height, 10)])
    radius = 0.36
    model.limbs.append(grounded(Limb(column, radius * (1 - 0.25 * np.linspace(0, 1, 10) ** 3), 0)))
    for arm in range(int(rng.integers(1, 4))):
        turn = rng.uniform(0, math.tau)
        start = height * rng.uniform(0.35, 0.6)
        out = rng.uniform(0.7, 1.1)
        rise = height * rng.uniform(0.2, 0.35)
        way = np.array([math.cos(turn), math.sin(turn), 0.0])
        bend = np.linspace(0, 1, 9)
        points = [UP * start + way * radius * 0.5]
        for share in bend[1:]:
            across = min(1.0, share * 2.2)
            points.append(UP * (start + rise * max(0.0, share - 0.3) / 0.7) + way * (radius * 0.5 + out * across))
        model.limbs.append(Limb(np.array(points), np.full(9, radius * 0.7), 1))
    return model


def shrub(shape, rng):
    width, height = shape['width'], shape['height']
    model = Model(height, dict(colour=(0.3, 0.25, 0.19), style='smooth'),
                  dict(colour=shape['leaves'], form='small' if height < 1.4 else 'broad',
                       length=0.035 + 0.02 * height, fleck=shape['fleck']))
    lumps = []
    for lump in range(shape['lumps']):
        turn = lump / shape['lumps'] * math.tau + rng.uniform(-0.4, 0.4)
        out = width * 0.22 * (lump > 0)
        size = width * 0.36 * rng.uniform(0.85, 1.1)
        lumps.append((np.array([math.cos(turn) * out, math.sin(turn) * out, height * 0.55]),
                      np.array([size, size, height * 0.45])))
    tree(rng, model, (0, 0, height * 0.12), lumps, 260, height * 0.12 + 0.05, width * 0.45, 0.12 + 0.05 * width,
         0.02 + 0.015 * height, 0.12 + 0.12 * height, sprout_from=0, flare=1.0, steps=2)
    return model


def bush(shape, rng):
    """Woody stems fanning from one foot, each ending in a tuft of leaves, gaps of sky between them."""
    width, height = shape['width'], shape['height']
    model = Model(height, dict(colour=shape['bark'], style='dead'),
                  dict(colour=shape['leaves'], form='small', length=0.035))
    stems = shape['stems'] * 2
    for stem in range(stems):
        turn = stem / stems * math.tau + rng.uniform(-0.3, 0.3)
        reach = width * 0.5 * rng.uniform(0.6, 1.0)
        top = height * (rng.uniform(0.8, 1.0) if shape['flat'] else rng.uniform(0.55, 1.0))
        steps = np.linspace(0, 1, 5)
        lift = steps ** 0.5 if not shape['flat'] else np.minimum(1, steps * 1.6)
        points = np.stack([np.cos(turn) * reach * steps ** 1.3, np.sin(turn) * reach * steps ** 1.3, top * lift], 1)
        model.limbs.append(Limb(points, np.linspace(0.025, 0.008, 5), 1))
        tuft = shape['tuft'] * 2.2
        out = unit(np.array([points[-1][0], points[-1][1], height * (1.2 if shape['flat'] else 0.4)]))
        model.clusters.append(Cluster(points[-1], out, tuft))
        model.clusters.append(Cluster(points[3], out, tuft * 0.7))
    return model


def tuft(shape, rng):
    height, spread = shape['height'], shape['spread']
    model = Model(height, dict(colour=shape['foot'], style='smooth'),
                  dict(colour=shape['tip'], foot=shape['foot'], form='blade', length=height))
    for _ in range(shape['blades']):
        turn = rng.uniform(0, math.tau)
        at = rng.uniform(0, spread * 0.6) * np.array([math.cos(turn), math.sin(turn), 0.0])
        lean = rng.uniform(0.15, 0.6) * np.array([math.cos(turn), math.sin(turn), 0.0])
        tall = height * rng.uniform(0.55, 1.0)
        steps = np.linspace(0, 1, 5)
        spine = np.array([at + lean * tall * share ** 1.6 + UP * tall * (share - 0.15 * share ** 2)
                          for share in steps])
        model.blades.append(Strip(spine, 0.012 + 0.01 * height))
    return model


def fern(shape, rng):
    size, trunk = shape['size'], shape['trunk']
    model = Model(trunk + size, dict(colour=(0.3, 0.24, 0.18), style='furrowed'),
                  dict(colour=shape['leaves'], form='frond', length=0.6))
    top = UP * max(trunk, 0.05)
    if trunk > 0:
        model.limbs.append(grounded(Limb(np.array([[0, 0, 0], [0, 0, trunk * 0.5], top]),
                                         np.array([0.2, 0.15, 0.13]), 0)))
    fronds = 10 if trunk > 0 else 9
    for frond in range(fronds):
        turn = frond / fronds * math.tau + rng.uniform(-0.2, 0.2)
        rise = rng.uniform(0.6, 1.2)
        length = size * (1.6 if trunk > 0 else 1.1) * rng.uniform(0.8, 1.05)
        way = np.array([math.cos(turn), math.sin(turn), 0.0])
        spine = [top + way * length * share + UP * length * (rise * share - (rise * 0.9 + 0.2) * share ** 2)
                 for share in np.linspace(0, 1, 7)]
        model.fronds.append(Strip(np.array(spine), length * 0.32))
    return model


def rock(shape, rng):
    model = Model(shape['size'][2], dict(colour=shape['stone'], style='stone'))
    model.rock = dict(size=shape['size'], cap=shape['cap'], stone=shape['stone'],
                      seed=int(rng.integers(0, 2 ** 31)))
    return model


GROWERS = dict(broadleaf=broadleaf, birch=birch, acacia=acacia, baobab=baobab, dead=dead, mangrove=mangrove,
               conifer=conifer, umbrella_pine=umbrella_pine, tiered=tiered, palm=palm, cactus=cactus, shrub=shrub,
               bush=bush, tuft=tuft, fern=fern, rock=rock)


def grown(form):
    """A form's skeleton, the same for the same seed."""
    return GROWERS[form['grow']](form, np.random.default_rng(form['seed']))
