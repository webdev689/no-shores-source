"""Draw a Lattice foe with the Sprite Forge, through the forge's own render path, without touching tools/forge/.
Run from tools/forge/ with Blender's module:

    python -I ../lattice/render.py --enemy husk --anims husk_walk,husk_lunge,husk_gore --out <folder>

The foe's module (husk.py and the rest) gives its make, clothes, crystal, own parts and moves. It writes the forge's
strips with their depth twins into <folder>/<enemy>: its body; any clothes it wears; `lattice_<enemy>`, its crystal and
torn edges; `lattice_<enemy>_gore`, its flesh and blood; and a layer for each of its own parts, such as a shield the
game takes away when it breaks. The forge's index, keys and fitted lists go to <folder> too."""
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.abspath(os.path.join(HERE, '..', 'forge', 'tools', 'sprite-forge')), HERE]

import clothes  # noqa: E402
import growth  # noqa: E402
import layers  # noqa: E402
import poses  # noqa: E402

THROUGH_CLOTH = clothes.ORDER['belt'] + 0.0015   # past every cloth's band, so a shard shows wherever it breaks out


def foe_layers(foe, body, classify):
    """The foe's body, crystal, gore and own parts, each a layer of one fighter, so all share its poses."""
    name = foe.__name__
    fighter = layers.Bare(body, 'axe')
    if hasattr(foe, 'reshape'):   # what the crystal has eaten of the body goes before it grows
        foe.reshape(fighter)
    crystal, gore = growth.grow(fighter, foe.CLUSTERS, foe.STRAIN, foe.SEED)
    own = foe.parts(fighter) if hasattr(foe, 'parts') else {}
    skins = {sk.ob.name: sk.ob for sk in fighter.skins}
    hands = [ob for kinds in fighter.hands.values() for ob in kinds.values()] if getattr(foe, 'HANDS', True) else []
    return [layers.Layer('body', fighter, [skins['body'], *hands], classify),
            layers.Layer(f'lattice_{name}', fighter, crystal, classify, order=THROUGH_CLOTH),
            layers.Layer(f'lattice_{name}_gore', fighter, gore, classify, order=THROUGH_CLOTH),
            *(layers.Layer(f'lattice_{name}_{part}', fighter, obs, classify, order=THROUGH_CLOTH)
              for part, obs in own.items())]


def main():
    at = sys.argv.index('--enemy')
    name = sys.argv[at + 1]
    del sys.argv[at:at + 2]
    foe = importlib.import_module(name)
    layers.LOOKS = os.path.join(sys.argv[sys.argv.index('--out') + 1], 'forgeLooks.json')   # never the studio's
    layers.BODIES[name] = {'spec': 488, 'moves': 'male', 'base': 'male', 'gear': {}}   # its own body, as a child's is
    layers.CHILD = dict(getattr(foe, 'MAKE', {}))   # its make over the man's: the forge lays it on as a child's
    layers.WORK = getattr(foe, 'WORK', layers.WORK)   # a larger work frame for a foe the forge's would cut off
    poses.ANIMS.update({move: pose for move, (pose, _) in foe.MOVES.items()})
    layers.ANIMS.update({move: len(keys) for move, (_, keys) in foe.MOVES.items()})   # before the forge loads its body
    outfit = getattr(foe, 'OUTFIT', [])
    # the wardrobe asks DFO's game code what may be worn under each garment, and that code is not here: the outfit is
    # fixed, so what lies under each garment is the outfit's own garments in a lower band
    clothes.unders = lambda g: [u for u in outfit if u != g and clothes.order_of(u) < clothes.order_of(g)]
    dressed = layers.wardrobe_layers
    layers.wardrobe_layers = lambda body, classify, want=None: foe_layers(foe, body, classify) + dressed(body, classify,
                                                                                                        want)
    drawn = ['body', f'lattice_{name}', f'lattice_{name}_gore', *(f'lattice_{name}_{p}' for p in getattr(foe, 'PARTS', ())),
             *outfit]
    sys.argv += ['--set', 'wardrobe', '--body', name, '--layers', ','.join(drawn)]
    layers.main()


if __name__ == '__main__':
    main()
