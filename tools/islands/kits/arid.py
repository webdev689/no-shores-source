"""The arid kit (desert, savanna, steppe): sandstone in bands, date palm, flat-topped acacia, scrub juniper and a
twisted dead tree, saltbush, a small cactus cluster and dry needle-grass, and a sun-bleached root."""
from kits import growth, rocks, trees


def build(kit):
    name = 'arid'
    return {
        **rocks.pieces(kit, 'sandstone', name),
        'shore.drift': growth.root(kit, f'{name}.shore.drift'),
        'tree.a': trees.palm(kit, f'{name}.tree.a', lean=0.6, fronds=14, droop=1.8, part='leafAlt'),
        'tree.b': trees.broadleaf(kit, f'{name}.tree.b', trunk_share=0.42, limbs=4, masses=6, part='leafAlt',
                                  slender=0.7, flat=0.45),
        'tree.c': trees.broadleaf(kit, f'{name}.tree.c', trunk_share=0.2, limbs=5, masses=9, slender=0.8),
        'tree.dead': trees.snag(kit, f'{name}.tree.dead', twist=1.0),
        'shrub.a': growth.bush(kit, f'{name}.shrub.a', 4, part='leafAlt'),
        'shrub.b': growth.cactus(kit, f'{name}.shrub.b'),
        'grass': growth.grass(kit, f'{name}.grass', 34, part='leafAlt', width=0.03),
    }
