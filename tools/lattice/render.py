"""Draw a Lattice foe with the Sprite Forge, through the forge's own render path, without touching tools/forge/.
Run from tools/forge/ with Blender's module:

    python -I ../lattice/render.py --enemy husk --anims husk_walk,husk_lunge,husk_gore --out <folder>

Its module (husk.py and the rest) gives its make, clothes, crystal, parts and moves. The strips go to <folder>/<enemy>:
its body; its clothes; `lattice_<enemy>`, its crystal; `_gore`, its flesh and blood; `_veins`, under any cloth; and a
layer for each of its own parts, such as a shield the game takes away. The forge's index and keys go to <folder> too."""
import argparse
import importlib
import os
import sys

sys.dont_write_bytecode = True   # nothing written beside the forge's code
for redirect in ('FORGE_KEYS', 'FORGE_FITTED', 'FORGE_LOOKS'):   # the forge's own homes for them are never used here
    os.environ.pop(redirect, None)
HERE = os.path.dirname(os.path.abspath(__file__))
FORGE = os.path.abspath(os.path.join(HERE, '..', 'forge'))
sys.path[:0] = [HERE, os.path.join(FORGE, 'tools', 'sprite-forge')]

import clothes  # noqa: E402
import growth  # noqa: E402
import layers  # noqa: E402
import poses  # noqa: E402

# past every cloth's band, so a shard shows wherever it breaks out; the Lattice's own materials are left ungraded by
# the forge, their colours their own, as the game snaps every frame to the palette
THROUGH_CLOTH = clothes.ORDER['belt'] + 0.0015


def grown_layers(foe):
    """The layers the foe draws beside its body and clothes."""
    name = foe.__name__
    grows = foe.CLUSTERS or hasattr(foe, 'wounds')
    return ([f'lattice_{name}', f'lattice_{name}_gore', f'lattice_{name}_veins'] if grows else []) + \
        [f'lattice_{name}_{part}' for part in getattr(foe, 'PARTS', ())]


def foe_layers(foe, body, classify):
    """The foe's body, crystal, gore and own parts, each a layer of one fighter, so all share its poses."""
    name = foe.__name__
    fighter = layers.Bare(body, 'axe')
    if hasattr(foe, 'reshape'):   # what the crystal has eaten of the body goes before it grows
        foe.reshape(fighter)
    torn_open = foe.wounds(fighter) if hasattr(foe, 'wounds') else ()   # what it tore open itself bleeds too
    crystal, gore, veins = growth.grow(fighter, foe.CLUSTERS, foe.STRAIN, foe.SEED, torn_open)
    own = foe.parts(fighter) if hasattr(foe, 'parts') else {}
    assert set(own) == set(getattr(foe, 'PARTS', ())), f'{name}: its parts {sorted(own)} are not its PARTS'
    hands = [ob for kinds in fighter.hands.values() for ob in kinds.values()] if getattr(foe, 'HANDS', True) else []
    flesh = foe.flesh(fighter) if hasattr(foe, 'flesh') else []   # its own flesh, coloured as its skin is
    body = ([layers.Layer('body', fighter, [fighter.skins[0].ob, *hands, *flesh], classify)]
            if getattr(foe, 'BODY', True) else [])
    under = ([layers.Layer(f'lattice_{name}_veins', fighter, veins, classify, order=clothes.ORDER['skin'])]
             if veins else [])   # on the skin, under any cloth
    grown = [(f'lattice_{name}', crystal), (f'lattice_{name}_gore', gore),
             *((f'lattice_{name}_{part}', obs) for part, obs in own.items())]
    made = under + [layers.Layer(layer, fighter, obs, classify, order=THROUGH_CLOTH) for layer, obs in grown if obs]
    assert {layer.name for layer in made} == set(grown_layers(foe)), f'{name}: its layers are not those it draws'
    return body + made


def moves_check(foe):
    """Every move poses every frame its table holds, so a table and its pose function never disagree."""
    for move, (pose, keys) in foe.MOVES.items():
        for frame in range(len(keys)):
            pose(frame, 0, 0.0)


def main():
    asked = argparse.ArgumentParser()
    asked.add_argument('--enemy', required=True)
    asked.add_argument('--out', required=True)
    known, rest = asked.parse_known_args()
    out = os.path.abspath(known.out)
    if os.path.commonpath([out, FORGE]) == FORGE:
        sys.exit(f'--out {known.out} is inside tools/forge/, which a Lattice render never writes into')
    name = known.enemy
    foe = importlib.import_module(name)
    layers.LOOKS = os.path.join(out, 'forgeLooks.json')
    layers.BODIES[name] = {'spec': 488, 'moves': 'male', 'base': 'male', 'gear': {}}   # its own body, as a child's is
    layers.CHILD = dict(getattr(foe, 'MAKE', {}))   # its make over the man's: the forge lays it on as a child's
    layers.WORK = getattr(foe, 'WORK', layers.WORK)   # a larger work frame for a foe the forge's would cut off
    # rows under the ground for what a move brings down before its feet, nearer the eye than they are
    layers.BELOW.update({move: getattr(foe, 'BELOW', {}).get(move, 24) for move in [*foe.MOVES, f'{name}_still']})
    poses.ANIMS.update({move: pose for move, (pose, _) in foe.MOVES.items()})
    layers.ANIMS.update({move: len(keys) for move, (_, keys) in foe.MOVES.items()})   # before the forge loads its body
    first = next(iter(foe.MOVES.values()))[0]   # a still of its first move's first frame, to judge its look by
    poses.ANIMS[f'{name}_still'] = lambda frame, view, yaw: first(0, view, yaw)
    layers.ANIMS[f'{name}_still'] = 1
    moves_check(foe)
    outfit = getattr(foe, 'OUTFIT', [])
    # the wardrobe asks DFO's game code what may be worn under each garment, and that code is not here: the outfit is
    # fixed, so what lies under each garment is the outfit's own garments in a lower band
    clothes.unders = lambda garment: [under for under in outfit
                                      if under != garment and clothes.order_of(under) < clothes.order_of(garment)]
    dressed = layers.wardrobe_layers
    layers.wardrobe_layers = lambda body, classify, want=None: foe_layers(foe, body, classify) + dressed(body, classify,
                                                                                                        want)
    drawn = [*(['body'] if getattr(foe, 'BODY', True) else []), *grown_layers(foe), *outfit]
    sys.argv[1:] = ['--set', 'wardrobe', '--body', name, '--layers', ','.join(drawn), '--out', out, *rest]
    layers.main()


if __name__ == '__main__':
    main()
