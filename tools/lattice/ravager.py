"""The Ravager, the Husk gone ranged. After the owner's own in project-final: the Husk's body, red, reading apart by
what it carries, not its colour: a ragged crystal hood closed over its skull in place of the Husk's great crystal,
open at the front so the face reads in its shadow with two eyes glowing through, swept back to a peak; a mantle of
two rows of dark shards hanging from the shoulders, open at the front and longer behind; and a crystal blade grown
out of each fist, its edge the weapon when cornered. Project-final's gun-blades are reshaped: no firearms, so it
hurls the shards that grow on its blades, a layer of their own the game takes away as they are thrown. In a
townsman's vest. Drawn by render.py; its moves are ravager_moves.py's."""
import numpy as np

import growth
from ravager_moves import MOVES  # noqa: F401

STRAIN = 'red'
SEED = 17
OUTFIT = ['shirt_short_v', 'vest', 'belt', 'casual_pants', 'tall_boots']   # a townsman's, the forge's archive 384
PARTS = ['shroud', 'blades', 'ammunition']
EYES = (1.0, 0.25, 0.18)
HUNCHED = np.radians(34)   # how far its chest leans in every move (husk_moves.py `HUNCH`, spine and chest)
BLADE = dict(length=0.56, width=0.11, thick=0.042)   # project-final's own blade, metres past the knuckles

CLUSTERS = [
    dict(piece='arm_L', joint='farm_L', middle=lambda p, n: -4 * np.abs(p[:, 2] - 1.05) + n[:, 0] - n[:, 1],
         count=4, spread=0.06, length=(0.04, 0.1), width=0.026, lean=(0.5, -0.3, 0.1)),   # shards growing to throw
    dict(piece='arm_R', joint='farm_R', middle=lambda p, n: -4 * np.abs(p[:, 2] - 1.05) - n[:, 0] - n[:, 1],
         count=4, spread=0.06, length=(0.04, 0.1), width=0.026, lean=(-0.5, -0.3, 0.1)),
    dict(piece='torso', joint='chest', middle=lambda p, n: -np.abs(p[:, 2] - 1.25) - 2 * np.abs(p[:, 0] + 0.06) - p[:, 1],
         count=4, spread=0.08, length=(0.05, 0.12), width=0.032, lean=(-0.2, -0.6, 0.1)),  # through the chest
    dict(piece='skull', joint='head', middle=lambda p, n: -2.0 * p[:, 0] - 1.0 * p[:, 1] + 0.2 * p[:, 2],
         count=2, spread=0.04, length=(0.04, 0.08), width=0.022, lean=(-0.6, -0.3, 0.3)),  # through the right cheek
]


def hood(fighter, crystal, eye):
    """A dark cowl over the skull but its face, a shell of the skin, and over it shards, swept back to a peak; and two
    eyes glowing in the shadow under it, on the face's own skin. Returns the cowl, and the rest."""
    p, ways, piece = growth.skin_of(fighter)
    head = np.nonzero(piece == 'skull')[0]
    front = p[head, 1].min()
    cowl = (piece == 'skull') & (p[:, 1] > front + 0.035)
    fighter.skins.append(fighter.skins[0].shell('ravager_cowl', growth.DEEP[crystal.name], cowl, 0.004))
    pick = np.random.default_rng(SEED)
    behind = head[p[head, 1] > front + 0.05]
    made = []
    for k, at in enumerate(pick.choice(behind, size=26, replace=False)):
        peak = max(0.0, p[at, 1] - front - 0.1) * 0.9 + max(0.0, p[at, 2] - 1.7) * 0.9   # longer up and back
        # laid back and down at rest, so they sweep back once its head bows with its hunch
        made.append(growth.shard(f'ravager_hood_{k}', p[at], ways[at] + np.array((0.0, 0.9, -0.5)),
                                 0.04 + peak + pick.uniform(0, 0.03), 0.04, pick.uniform(0, np.pi), crystal))
    for side in (1.0, -1.0):
        at = growth.nearest(p, np.array((0.032 * side, front, 1.635)))
        made.append(growth.shard(f'ravager_eye_{side:+.0f}', p[at], ways[at], 0.02, 0.016, 0.0, eye, widest=0.5))
    return fighter.skins[-1].ob, made


def mantle(crystal):
    """Two rows of broad shards hanging from a ring round the shoulders, open at the front, longer behind, dark but
    for their points; laid forward at rest by its hunch's lean, so they hang straight down as it stands."""
    pick = np.random.default_rng(SEED + 1)
    hang_down = np.array((0.0, -np.sin(HUNCHED), -np.cos(HUNCHED)))
    made = []
    for row, (ring, drop) in enumerate(((0.31, 0.0), (0.25, 0.08))):
        for k, t in enumerate(np.linspace(0, 2 * np.pi, 12, endpoint=False)):
            out = np.array((np.cos(t), np.sin(t), 0.0))   # y > 0 behind
            if out[1] < -0.55:   # open at the front, for the arms
                continue
            behind = (out[1] + 1) / 2
            base = np.array((out[0] * ring, out[1] * ring * 0.8, 1.5 - drop))
            made.append(growth.shard(f'ravager_mantle_{row}_{k}', base, out * 0.12 + hang_down,
                                     0.14 + 0.28 * behind * (1.0 - row * 0.3) + pick.uniform(0, 0.06), 0.045, t,
                                     crystal, widest=0.6))
    return made


def blade(side, crystal):
    """A flat blade grown from the knuckles along the fist's line, a diamond in section, widest a third of the way;
    and the shards it throws, growing along its back edge."""
    x = 1.0 if side == 'L' else -1.0
    wrist, way = growth.forearm(side)
    start = wrist + way * 0.09
    edge, flat = np.array((x * 0.5, -0.86, 0.0)), np.array((x * 0.86, 0.5, 0.0))
    made = growth.blade(f'ravager_blade_{side}', start, way, edge, flat,
                        (BLADE['length'], BLADE['width'], BLADE['thick']),
                        [(0.0, 0.5), (0.33, 1.0), (0.8, 0.6), (1.0, 0.0)], crystal)
    ammunition = [growth.shard(f'ravager_ammo_{side}_{k}', start + way * BLADE['length'] * share
                               - edge * BLADE['width'] * 0.4, -edge + way * 0.5 + flat * 0.3, 0.07, 0.016, k, crystal)
                  for k, share in enumerate((0.15, 0.35, 0.55, 0.72))]
    return [made], ammunition


def parts(fighter):
    crystal = growth.crystal_material('red')
    eye = growth.glowing('lattice.ravager_eye', tuple(c * 0.25 for c in EYES), 1.6, EYES, rough=0.1)
    cowl, hooded = hood(fighter, crystal, eye)
    shroud = growth.hung(fighter, 'head', hooded)
    cloak = growth.hung(fighter, 'chest', mantle(crystal))
    blades, ammunition = [], []
    for side in ('L', 'R'):
        edge, shards = blade(side, crystal)
        blades += growth.hung(fighter, f'hand_{side}', edge)
        ammunition += growth.hung(fighter, f'hand_{side}', shards)
    return {'shroud': [cowl, *shroud, *cloak], 'blades': blades, 'ammunition': ammunition}
