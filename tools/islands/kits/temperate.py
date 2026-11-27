"""The temperate kit (woodland, highland, and Overlook's temperate-coast): granite with weed lines, oak, birch, pine
and a lightning-struck snag, gorse, fern and tussock grass, and a bleached driftwood log."""
from kits import growth, rocks, trees


def build(kit):
    name = 'temperate'
    return {
        **rocks.pieces(kit, 'granite', name),
        'shore.drift': growth.log(kit, f'{name}.shore.drift'),
        'tree.a': trees.oak(kit, f'{name}.tree.a'),
        'tree.b': trees.broadleaf(kit, f'{name}.tree.b', trunk_share=0.55, limbs=3, masses=6, part='leafAlt',
                                  bark='wood', slender=0.55),
        'tree.c': trees.scots_pine(kit, f'{name}.tree.c'),
        'tree.dead': trees.snag(kit, f'{name}.tree.dead'),
        'shrub.a': growth.bush(kit, f'{name}.shrub.a', 3, bloom=6, bloom_part='leafAlt'),
        'shrub.b': growth.fern(kit, f'{name}.shrub.b'),
        'grass': growth.grass(kit, f'{name}.grass', 26),
    }
