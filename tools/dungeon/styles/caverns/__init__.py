"""The caverns' pieces: natural rock, crystal, fungus and still water, every one grown, dripped, broken or worn.
Nothing is built by hands but the exit's timber lintel, the sconce's lashing and the gallery's rope.

door.a/.b are rock arches round a doorway's jambs (.b studded with crystals); the pillar is a stalagnate; the wall trio
a flowstone curtain down a hewn room's wall; feature.a an outcrop with fungus, .b a seam with crystals; ceiling.a/.b/.c
stalactite clusters, small to large; floor.a scree, .b a drip puddle; stair.head a rock arch over a flight's head and
foot, stair.side a rock ledge down its walls, balustrade a gallery's rock lip with a rope slung along it. Landmarks: the
Still Lake, the Crystal Heart and the Stone Teeth.
"""
from styles.caverns import features, forms, growths, landmarks, openings, stairs


def kit_pieces(kit):
    """Every kit piece: {piece: object}."""
    def made(name, parts, smooth=50.0):
        return forms.make(kit, parts, name, smooth)

    pillar_streaks = growths.streaks(0.8)
    found = {
        'door.a': made('door.a', openings.door('caverns.door.a', False)),
        'door.b': made('door.b', openings.door('caverns.door.b', True)),
        'pillar.base': forms.paint(made('pillar.base', {'stone': growths.pillar_base()}), pillar_streaks),
        'pillar.shaft': forms.paint(made('pillar.shaft', {'stone': growths.pillar_shaft()}), pillar_streaks),
        'pillar.capital': forms.paint(made('pillar.capital', {'stone': growths.pillar_capital()}), pillar_streaks),
        'wall.base': forms.paint(made('wall.base', {'stone': growths.wall_base()}), growths.wall_streaks),
        'wall.shaft': forms.paint(made('wall.shaft', {'stone': growths.wall_shaft()}), growths.wall_streaks),
        'wall.cap': forms.paint(made('wall.cap', {'stone': growths.wall_cap()}), growths.wall_streaks),
        'ceiling.a': made('ceiling.a', growths.cluster('caverns.ceiling.a', 0.42, 0.12, 0.6, 7, 5)),
        'floor.a': made('floor.a', features.scree('caverns.floor.a')),
        'floor.b': made('floor.b', features.puddle('caverns.floor.b')),
        'sconce': made('sconce', openings.sconce('caverns.sconce')),
        'portal': made('portal', openings.portal('caverns.portal')),
        'exit': made('exit', openings.exit_frame('caverns.exit')),
        'stair.head': made('stair.head', stairs.stair_head()),
        'stair.side': made('stair.side', stairs.stair_side()),
        'balustrade': made('balustrade', stairs.balustrade()),
    }
    found['ceiling.b'] = made('ceiling.b', growths.cluster('caverns.ceiling.b', 0.5, 0.18, 1.1, 10, 3, stretch=2.4,
                                                           row=True))
    found['ceiling.c'] = made('ceiling.c', growths.cluster('caverns.ceiling.c', 0.85, 0.26, 1.15, 8, 3, giant=1.6))
    found['feature.a'] = made('feature.a', features.outcrop('caverns.feature.a'))
    parts, choose = features.seam('caverns.feature.b')
    rock = forms.paint(made('feature.b.rock', {'stone': parts.pop('stone')}), choose)
    found['feature.b'] = kit.join([rock, made('feature.b', parts)], 'feature.b')
    return found


def build(kit):
    """Every caverns module: {piece or landmark module: object}."""
    found = kit_pieces(kit)
    found.update(landmarks.build(kit))
    return found
