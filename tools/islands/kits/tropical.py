"""The tropical kit (rainforest, swamp): dark basalt and coral, a leaning coconut palm, a broadleaf on buttress roots,
a tall kapok and a vine-hung dead trunk, fern, a broad-leaf plant and reeds, and mangrove roots."""
from kits import growth, rocks, trees


def build(kit):
    name = 'tropical'
    return {
        **rocks.pieces(kit, 'basalt', name),
        'shore.drift': growth.mangrove(kit, f'{name}.shore.drift'),
        'tree.a': trees.palm(kit, f'{name}.tree.a', lean=1.0, fronds=12, droop=1.3, rings=False),
        'tree.b': trees.broadleaf(kit, f'{name}.tree.b', trunk_share=0.5, limbs=4, masses=7, buttress=5),
        'tree.c': trees.broadleaf(kit, f'{name}.tree.c', trunk_share=0.72, limbs=5, masses=7, part='leafAlt',
                                  slender=1.2, flat=0.5, buttress=6),
        'tree.dead': trees.snag(kit, f'{name}.tree.dead', vines=2),
        'shrub.a': growth.fern(kit, f'{name}.shrub.a', fronds=10, width=0.24),
        'shrub.b': growth.broad_leaves(kit, f'{name}.shrub.b', leaves=5, part='leafAlt'),
        'grass': growth.grass(kit, f'{name}.grass', 22, width=0.04, heads=3),
    }
