"""The wreck as a level, in the wreck's frame (x east, y north, metres): where the player wakes, the way to the arena,
the zones along it with their checkpoints and waves, and Thule's place; and the check that the ground holds it: every
zone and foe reached from the last, and none past a heap that still stands.

A wave's foes are of the roster by type and rank, as content/prologue/wreck.json numbers them (the Grey Tithe's deck
crews 7 to 12, the pirates' 13 to 17): Tithe and pirates fight each other as well as the player. A facing is degrees
clockwise from north.
"""

# Where the player wakes, by the Brig's wheel, and the way they face (degrees clockwise from north): down the way on.
WAKE = ((-14.3, 1.9), 35.2)

# The way from where the player wakes to Thule, as points.
PATH = (
    (-14.3, 1.9), (-13.1, 3.6), (-11.9, 3.9), (-10.4, 3.6), (-8.0, 3.3), (-4.4, 3.0), (0.0, 2.7), (3.9, 2.4),
    (5.4, 1.3), (8.4, 0.2), (12.3, -8.6), (12.3, -13.0), (3.6, -13.0), (2.2, -15.5), (1.5, -18.6), (1.5, -20.9),
    (0.4, -21.6), (0.1, -24.4),
    (0.1, -26.4), (0.1, -29.6), (0.4, -31.0), (1.8, -32.2), (1.8, -34.0),
)

# Each zone: its name; the box (west, south, east, north) that, entered, reaches it; its checkpoint; and its wave, in
# pairs of a Grey Tithe crewman and a pirate fighting each other, with any odd one out after them.
ZONES = (
    {'name': "the Brig's quarterdeck", 'area': (-19.5, -4.5, -11.4, 5.4), 'checkpoint': (-14.3, 1.9),
     'wave': ((7, 1, (-13.6, 2.8), 270), (13, 1, (-15.0, 3.0), 90))},
    {'name': "the Brig's broken waist", 'area': (-11.4, 0.4, -5.1, 5.6), 'checkpoint': (-10.4, 3.2),
     'wave': ((8, 2, (-8.6, 3.6), 90), (14, 1, (-7.4, 3.4), 270), (9, 1, (-5.8, 3.3), 270))},
    {'name': 'the torn deck over the gap', 'area': (-5.1, 0.4, 3.2, 5.4), 'checkpoint': (-3.0, 3.1),
     'wave': ((11, 1, (-0.8, 2.8), 90), (15, 1, (0.8, 2.6), 270))},
    {'name': "the Brig's fore deck", 'area': (3.2, -2.6, 18.5, 6.5), 'checkpoint': (5.6, 1.3),
     'wave': ((7, 1, (8.0, 2.3), 180), (13, 1, (8.1, 0.8), 0), (10, 1, (11.6, 2.3), 180), (17, 1, (11.8, 0.9), 0))},
    {'name': "the Sloop on her beam ends", 'area': (9.6, -27.0, 15.6, -5.5), 'checkpoint': (12.3, -9.4),
     'wave': ((9, 1, (12.6, -14.8), 180), (16, 1, (12.6, -16.4), 0), (14, 1, (12.3, -19.2), 0))},
    {'name': "the Frigate's waist", 'area': (-5.6, -21.0, 6.0, -1.0), 'checkpoint': (3.0, -13.0),
     'wave': ((11, 1, (-1.4, -9.4), 90), (17, 1, (0.2, -9.6), 270), (8, 1, (-2.6, -12.6), 90), (14, 1, (-1.2, -12.8),
                                                                                                    270),
              (9, 2, (2.6, -18.4), 0))},
    {'name': "the Frigate's gun deck", 'area': (-4.6, -30.0, 4.6, -21.0), 'checkpoint': (0.1, -25.2),
     'wave': ((10, 1, (-1.6, -26.4), 180), (13, 1, (-1.6, -28.2), 0), (12, 1, (2.1, -26.7), 270))},
    {'name': "the Frigate's quarterdeck", 'area': (-4.9, -41.0, 4.9, -32.75), 'checkpoint': (1.6, -33.2),
     'wave': ()},
)

# The camera's way back from the arena's heap to the player after its flight down the wreck: out past the Frigate's
# port side, clear of her masts, then past the Brig's broken stern half; points (x, y) and heights over the sea.
FLIGHT_BACK = ((-9.5, -24.0, 9.5), (-10.5, -6.5, 8.5))

# The masts still standing, by the ship's frame and where along her each stands: the Brig's fore, and the Frigate's
# fore and main. A camera flying the wreck keeps clear of them.
MASTS = (('brig', 6.85), ('frigate', 11.4), ('frigate', -0.55))

# The arena is the last zone; Thule stands before the wheel, facing the way in.
ARENA_ZONE = len(ZONES) - 1
THULE = (1.8, -34.0)


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
