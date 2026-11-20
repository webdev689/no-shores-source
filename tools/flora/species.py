"""What the flora pipeline grows: every biome's kinds, in the order and with the names of the client's casts
(client/src/nature/coolCasts.ts and warmCasts.ts, which keep how each kind grows, how big and how often), and the
forms each kind is grown in, from a seed. Colours are the land's own display values (0..1 a channel).

Each form names a grower in grow.py and its shape: heights and widths in metres at size 1, colours of bark, leaves,
stone. A kind's forms share one leaf and one bark picture; its first form is the one they are cut from.
"""


def twice(grow, seed, **shape):
    """A kind's two forms: the same grower from two seeds a hundred and one apart, as the casts grow them."""
    return [dict(grow=grow, seed=seed, **shape), dict(grow=grow, seed=seed + 101, **shape)]


def boulders(seed, stone, cap=None):
    return [
        dict(grow='rock', seed=seed, size=(1.6, 1.3, 1.1), stone=stone, cap=cap),
        dict(grow='rock', seed=seed + 7, size=(2.6, 2.0, 1.5), stone=stone, cap=cap),
    ]


def meadow(seed, height, foot, tip, blades=8):
    return [dict(grow='tuft', seed=seed, height=height, spread=height * 0.35, blades=blades * 6, foot=foot, tip=tip)]


FIR_BARK = (0.3, 0.24, 0.2)
FIR = (0.11, 0.25, 0.19)


def firs(seed):
    return twice('conifer', seed, height=18, width=6, tiers=6, skirt=0.07, bark=FIR_BARK, leaves=FIR)


def oak(seed, height, crown_at, crown, bark, leaves, trunk=0.42):
    return twice('broadleaf', seed, height=height, trunk=trunk, crown_at=crown_at, crown=crown, bark=bark,
                 leaves=leaves, style='furrowed')


def tiered(seed, height, base, spread, tiers, trunk, flare, fins, bark, leaves, moss=None, depth=0.5, droop=1.2,
           step_in=0.3, spray=0.8, influence=0.6):
    """A tiered tree: `tiers` discs of crown from `base` (a share of the height) up, each `depth` metres thick either
    side of its middle, their rims sagging `droop` metres, each `step_in` of the spread narrower at the top."""
    return dict(grow='tiered', seed=seed, height=height, crown_base=base, spread=spread, tiers=tiers, trunk=trunk,
                flare=flare, fins=fins, bark=bark, leaves=leaves, moss=moss, depth=depth, droop=droop,
                step_in=step_in, spray=spray, influence=influence)


# Rainforest canopy trees: deep tiers close together, so from above their crowns read as one closed roof.
CANOPY = dict(depth=1.7, droop=1.2, step_in=0.2, spray=0.95)


def palms(seed, height, bow, fronds, length, bark, leaves):
    return twice('palm', seed, height=height, bow=bow, fronds=fronds, length=length, bark=bark, leaves=leaves)


def shrub(seed, width, height, lumps, leaves, fleck=None):
    return [dict(grow='shrub', seed=seed, width=width, height=height, lumps=lumps, leaves=leaves, fleck=fleck)]


def bush(seed, width, height, stems, tuft, flat, leaves, wood):
    return [dict(grow='bush', seed=seed, width=width, height=height, stems=stems, tuft=tuft, flat=flat,
                 leaves=leaves, bark=wood)]


def fern(seed, size, leaves, trunk=0.0):
    return dict(grow='fern', seed=seed, size=size, leaves=leaves, trunk=trunk)


# Each biome's kinds: (name, its forms), in the cast's order.
BIOMES = {
    'temperate-coast': [
        ('oak', oak(11, 11, 7.2, (4.2, 4.2, 2.8), (0.33, 0.27, 0.21), (0.24, 0.4, 0.15))),
        ('pine', twice('umbrella_pine', 21, height=15, bark=(0.5, 0.3, 0.2), leaves=(0.17, 0.33, 0.21))),
        ('boulder', boulders(31, (0.52, 0.52, 0.5), ((0.3, 0.42, 0.18), 0.45))),
        ('gorse', shrub(41, 1.8, 1.3, 3, (0.19, 0.33, 0.13), ((0.86, 0.72, 0.2), 0.2))),
        ('grass', meadow(51, 0.6, (0.22, 0.42, 0.14), (0.52, 0.66, 0.3))),
    ],
    'highland': [
        ('fir', firs(12)),
        ('birch', twice('birch', 22, height=12, leaves=(0.46, 0.6, 0.22))),
        ('granite', boulders(32, (0.58, 0.53, 0.52), ((0.36, 0.42, 0.26), 0.6))),
        ('heather', shrub(42, 1.0, 0.6, 5, (0.28, 0.27, 0.2), ((0.52, 0.3, 0.5), 0.4))),
        ('upland grass', meadow(52, 0.5, (0.3, 0.38, 0.18), (0.66, 0.62, 0.36))),
    ],
    'woodland': [
        ('oak', oak(13, 13, 8.5, (4.8, 4.8, 3.2), (0.3, 0.25, 0.2), (0.2, 0.37, 0.12), trunk=0.5)),
        ('beech', twice('broadleaf', 23, height=19, trunk=0.45, crown_at=12.5, crown=(3.8, 3.8, 5.2),
                        bark=(0.52, 0.52, 0.48), leaves=(0.28, 0.46, 0.15), style='smooth')),
        ('fir', firs(33)),
        ('mossy boulder', boulders(43, (0.45, 0.45, 0.42), ((0.24, 0.4, 0.14), 0.1))),
        ('fern', [fern(53, 0.9, (0.24, 0.46, 0.14))]),
        ('hazel', shrub(48, 2.4, 2.0, 4, (0.22, 0.4, 0.14))),
    ],
    'steppe': [
        ('birch', twice('birch', 27, height=11, leaves=(0.5, 0.6, 0.24))),
        ('rock', boulders(37, (0.55, 0.53, 0.5))),
        ('sagebrush', bush(47, 1.2, 0.9, 7, 0.2, False, (0.6, 0.64, 0.5), (0.42, 0.37, 0.3))),
        ('dry grass', meadow(57, 0.55, (0.55, 0.52, 0.3), (0.8, 0.74, 0.48))),
    ],
    'tundra': [
        ('spruce', twice('conifer', 19, height=5, width=2.2, tiers=4, skirt=0.2, bark=FIR_BARK,
                         leaves=(0.12, 0.22, 0.17))),
        ('dead tree', twice('dead', 29, height=6, bark=(0.6, 0.57, 0.52))),
        ('snowy rock', boulders(39, (0.48, 0.48, 0.48), ((0.94, 0.95, 0.97), 0.2))),
        ('dwarf shrub', shrub(49, 1.0, 0.35, 2, (0.42, 0.33, 0.22), ((0.55, 0.25, 0.18), 0.3))),
    ],
    'desert': [
        ('cactus', twice('cactus', 14, height=6.5, bark=(0.32, 0.48, 0.26))),
        ('date palm', palms(24, 12, 1.2, 11, 4.2, (0.48, 0.38, 0.27), (0.33, 0.48, 0.2))),
        ('red rock', boulders(34, (0.7, 0.38, 0.24))),
        ('dry shrub', bush(44, 1.3, 0.9, 7, 0.15, False, (0.42, 0.47, 0.26), (0.45, 0.38, 0.3))),
    ],
    'savanna': [
        ('acacia', twice('acacia', 15, bark=(0.28, 0.23, 0.18), leaves=(0.34, 0.42, 0.15))),
        ('baobab', [dict(grow='baobab', seed=25, bark=(0.56, 0.49, 0.42), leaves=(0.4, 0.48, 0.19))]),
        ('boulder', boulders(35, (0.66, 0.5, 0.36))),
        ('tall grass', meadow(55, 1.3, (0.62, 0.55, 0.28), (0.88, 0.78, 0.45), 10)),
        ('thorn bush', bush(45, 2.2, 1.5, 6, 0.24, True, (0.36, 0.44, 0.18), (0.3, 0.25, 0.2))),
    ],
    'rainforest': [
        ('giant', [tiered(seed, 40, 0.42, 9, 3, 0.9, 1.6, 4, (0.4, 0.36, 0.3), (0.22, 0.4, 0.13), depth=2.0, droop=1.8,
                          step_in=0.15, spray=1.0, influence=0.9) for seed in (16, 117)]),
        # Three canopy trees of their own heights, spreads and greens, their flat crowns overlapping.
        ('canopy tree', [
            tiered(37, 22, 0.28, 7, 3, 0.5, 1.5, 0, (0.42, 0.38, 0.3), (0.17, 0.37, 0.11), **CANOPY),
            tiered(36, 17, 0.27, 7.5, 3, 0.45, 1.5, 0, (0.38, 0.33, 0.26), (0.12, 0.32, 0.1), **CANOPY),
            tiered(38, 14, 0.25, 6.5, 3, 0.4, 1.4, 0, (0.36, 0.3, 0.24), (0.27, 0.43, 0.13), **CANOPY),
        ]),
        ('palm', palms(26, 15, 2.2, 10, 4.8, (0.42, 0.36, 0.28), (0.24, 0.48, 0.14))),
        ('tree fern', [fern(seed, 2.4, (0.2, 0.46, 0.13), 3) for seed in (56, 157)]),
        ('understory', shrub(46, 2.2, 1.6, 4, (0.16, 0.4, 0.12))),
    ],
    'swamp': [
        ('cypress', [tiered(seed, 16, 0.3, 6.5, 4, 0.5, 2.6, 4, (0.28, 0.22, 0.18), (0.24, 0.32, 0.15),
                            moss=(0.2, 0.24, 0.17), depth=0.7, droop=1.8, step_in=0.45, spray=0.75)
                     for seed in (18, 119)]),
        ('mangrove', twice('mangrove', 28, bark=(0.35, 0.28, 0.22), leaves=(0.16, 0.33, 0.13))),
        ('reeds', meadow(58, 2.0, (0.25, 0.4, 0.15), (0.62, 0.55, 0.3), 12)),
        ('marsh fern', [fern(59, 0.8, (0.22, 0.42, 0.16))]),
    ],
}

# Kinds drawn only near (grass, ferns, reeds) have no sprites: the client's casts give them no far detail.
NEAR_ONLY = {'grass', 'upland grass', 'dry grass', 'tall grass', 'reeds', 'fern', 'marsh fern'}
