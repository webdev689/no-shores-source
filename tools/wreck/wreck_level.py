"""The wreck as a level, in the wreck's frame (x east, y north, metres): where the player wakes, the way to the arena,
the zones along it with their checkpoints and waves, and Thule's place; and the check that the ground holds it: every
zone and foe reached from the last, and none past a heap that still stands.

A wave's foes are of the roster by type and rank, as content/prologue/wreck.json numbers them (the Grey Tithe's deck
crews 7 to 12, the pirates' 13 to 17): Tithe and pirates fight each other as well as the player. A facing is degrees
clockwise from north.
"""

# Where the player wakes, by the Brig's wheel, and the way they face (degrees clockwise from north): along her deck.
WAKE = ((-14.8, 0.6), 84.0)

# The way from where the player wakes to Thule, as points.
PATH = (
    (-14.8, 0.6), (-12.2, 3.2), (-8.0, 3.3), (-4.4, 3.0), (0.0, 2.7), (3.9, 2.4), (6.6, 1.6), (8.4, 0.2),
    (12.3, -8.6), (12.3, -13.0), (3.6, -13.0), (0.6, -15.5), (0.1, -20.6), (0.1, -24.4), (0.1, -26.4), (0.1, -31.0),
    (0.0, -35.4),
)

# Each zone: its name; the box (west, south, east, north) that, entered, reaches it; its checkpoint; and its wave.
ZONES = (
    {'name': "the Brig's quarterdeck", 'area': (-19.5, -4.5, -11.4, 5.4), 'checkpoint': (-14.8, 0.6),
     'wave': ((7, 1, (-13.5, 2.7), 135), (13, 1, (-13.0, 1.5), 315))},
    {'name': "the Brig's broken waist", 'area': (-11.4, 0.4, -5.1, 5.6), 'checkpoint': (-10.4, 3.2),
     'wave': ((8, 2, (-8.6, 3.5), 270), (14, 1, (-7.2, 3.0), 90), (9, 1, (-6.0, 3.6), 270))},
    {'name': 'the torn deck over the gap', 'area': (-5.1, 0.4, 3.2, 5.4), 'checkpoint': (-3.0, 2.95),
     'wave': ((15, 1, (-0.6, 2.75), 270), (16, 1, (1.8, 2.5), 270))},
    {'name': "the Brig's fore deck", 'area': (3.2, -2.6, 18.5, 6.5), 'checkpoint': (5.2, 2.4),
     'wave': ((7, 1, (8.2, 2.5), 0), (17, 1, (9.0, 0.5), 180), (10, 1, (11.6, 2.2), 270), (13, 1, (7.2, 0.6), 90))},
    {'name': "the Sloop on her beam ends", 'area': (9.6, -27.0, 15.6, -5.5), 'checkpoint': (12.3, -9.4),
     'wave': ((16, 1, (12.3, -15.0), 0), (14, 1, (12.3, -18.6), 0))},
    {'name': "the Frigate's waist", 'area': (-5.6, -21.0, 6.0, -1.0), 'checkpoint': (3.0, -13.0),
     'wave': ((11, 1, (-0.5, -9.5), 180), (8, 1, (-2.2, -13.2), 90), (17, 1, (1.4, -16.6), 0), (9, 2, (-1.2, -18.4),
                                                                                                   0))},
    {'name': "the Frigate's gun deck", 'area': (-4.6, -30.6, 4.6, -21.0), 'checkpoint': (0.1, -25.2),
     'wave': ((10, 1, (-2.4, -26.8), 90), (12, 1, (2.0, -27.4), 270), (13, 1, (-2.2, -28.8), 90))},
    {'name': "the Frigate's quarterdeck", 'area': (-5.6, -42.0, 5.6, -30.6), 'checkpoint': (0.1, -31.0),
     'wave': ()},
)

# The arena is the last zone; Thule stands at its middle, facing the way in.
ARENA_ZONE = len(ZONES) - 1
THULE = (0.0, -35.4)


def game(point):
    """A point of the wreck's frame (x east, y north) in the game's (x east, y south)."""
    return (round(point[0], 3), round(-point[1], 3))


def game_area(area):
    """A box (west, south, east, north) of the wreck's frame as the game's (minX, minY, maxX, maxY)."""
    west, south, east, north = area
    return (round(west, 3), round(-north, 3), round(east, 3), round(-south, 3))


def check(reach, gates, climb):
    """The level's faults on the ground `reach` (wreck_reach.Reach, the game's frame) with the gates' boxes `gates`
    (minX, minY, maxX, maxY, the game's frame, by the zone each closes): an empty list when it holds. Every way on is
    walked, and every way round a standing gate is looked for climbing as high as `climb`."""
    faults = []
    standing = []
    for index, zone in enumerate(ZONES):
        start = game(zone['checkpoint'])
        closed = [gates[later] for later in range(index, len(gates))]
        reached = reach.flood(start, closed)
        if not reached:
            faults.append(f"{zone['name']}: its checkpoint stands on no ground")
            continue
        for _, _, at, _ in zone['wave']:
            if not reach.reaches(reached, game(at)):
                faults.append(f"{zone['name']}: a foe at {at} stands where the checkpoint does not reach")
        if index + 1 < len(ZONES):
            after = ZONES[index + 1]
            if reach.reaches(reach.flood(start, closed, climb), game(after['checkpoint'])):
                faults.append(f"{zone['name']}: {after['name']} is reached while its heap stands")
            opened = reach.flood(start, closed[1:])
            if not reach.reaches(opened, game(after['checkpoint'])):
                faults.append(f"{zone['name']}: {after['name']} is not reached once its heap is gone")
        standing.append(zone['name'])
    if not reach.reaches(reach.flood(game(ZONES[ARENA_ZONE]['checkpoint'])), game(THULE)):
        faults.append("Thule's place is not reached from the arena's checkpoint")
    return faults
