"""The frozen kit (tundra): dark slate under snow caps, spruce, a snow-laden fir, a wind-bent pine and a bare grey
trunk, heather, crowberry and frosted sedge, and an ice floe."""
from kits import growth, rocks, trees


def build(kit):
    name = 'frozen'
    return {
        **rocks.pieces(kit, 'slate', name),
        'shore.drift': growth.floe(kit, f'{name}.shore.drift'),
        'tree.a': trees.conifer(kit, f'{name}.tree.a', tiers=8, spread=0.85),
        'tree.b': trees.conifer(kit, f'{name}.tree.b', tiers=6, snow=True),
        'tree.c': trees.windswept(kit, f'{name}.tree.c'),
        'tree.dead': trees.snag(kit, f'{name}.tree.dead', part='wood', bark='wood', snow=True),
        'shrub.a': growth.bush(kit, f'{name}.shrub.a', 6, part='leafAlt'),
        'shrub.b': growth.bush(kit, f'{name}.shrub.b', 3, bloom=6, bloom_part='rockAlt'),
        'grass': growth.grass(kit, f'{name}.grass', 24, tips='snow', width=0.04),
    }
