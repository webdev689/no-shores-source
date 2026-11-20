"""The wreck as a level, in the wreck's frame (x east, y north, metres): where the player wakes, the way to the arena,
the zones along it with their checkpoints and waves, and Thule's place; and the check that the ground holds it: every
zone and foe reached from the last, and none past a heap that still stands.

A wave's foes are of the roster by type and rank, as content/prologue/wreck.json numbers them (the Grey Tithe's deck
crews 7 to 12, the pirates' 13 to 17): Tithe and pirates fight each other as well as the player. A facing is degrees
clockwise from north.
"""

# Where the player wakes, by the Brig's wheel, and the way they face (degrees clockwise from north): down the way on.
WAKE = ((-28.9, 7.6), 35.2)

# The way from where the player wakes to Thule, as points.
PATH = (
    (-28.9, 7.6), (-27.7, 9.3), (-26.5, 9.6), (-25.0, 9.3), (-22.6, 9.0), (-19.0, 8.4), (-14.1, 7.8), (-6.0, 7.9),
    (0.3, 8.2), (8.0, 8.6), (15.2, 8.8), (19.6, 9.0), (20.4, 7.0), (23.2, 6.0), (23.9, 0.2), (26.5, -4.7),
    (25.7, -11.0), (25.7, -17.0), (17.7, -18.0), (9.1, -14.1), (3.6, -13.0), (2.2, -15.5), (1.5, -18.6), (1.5, -20.9),
    (0.4, -21.6), (0.1, -24.4), (0.1, -26.4), (0.1, -29.6), (0.4, -31.0), (1.8, -32.2), (1.8, -34.0),
)

# Each zone: its name; the box (west, south, east, north) that, entered, reaches it; its checkpoint; its wave, in pairs
# of a Grey Tithe crewman and a pirate fighting each other, with any odd one out after them, standing well on from
# where the zone is entered; and where three of the Brig's crew stand fighting them. The first is the quiet deck the
# player wakes on, with no wave; the last is the arena.
ZONES = (
    {'name': "the Brig's stern", 'area': (-36.5, 2.6, -16.4, 13.5), 'checkpoint': (-28.9, 7.6), 'wave': (),
     'crew': ()},
    {'name': "the wreckage of the Brig's waist", 'area': (-16.4, 2.6, -0.6, 14.5), 'checkpoint': (-12.5, 7.8),
     'wave': ((7, 1, (-5.0, 9.6), 90), (13, 1, (-3.4, 9.6), 270), (8, 2, (-5.0, 6.0), 90), (14, 1, (-3.4, 6.0), 270)),
     'crew': ((-6.6, 7.8), (-2.0, 7.8), (-4.2, 11.4))},
    {'name': 'the torn deck over the gap', 'area': (1.1, 2.0, 16.6, 15.0), 'checkpoint': (3.0, 8.4),
     'wave': ((11, 1, (9.6, 10.4), 90), (15, 1, (11.2, 10.4), 270), (9, 1, (10.4, 6.4), 270)),
     'crew': ((8.2, 8.4), (12.8, 8.4), (10.4, 12.4))},
    {'name': "the Brig's fore deck", 'area': (18.6, -6.0, 41.0, 16.0), 'checkpoint': (20.6, 7.0),
     'wave': ((7, 1, (28.4, -1.6), 180), (13, 1, (28.4, -3.4), 0), (10, 1, (32.0, -2.4), 180), (17, 1, (32.0, -4.2), 0)),
     'crew': ((26.6, -1.1), (33.8, -3.3), (30.2, -4.6))},
    {'name': "the Sloop on her beam ends", 'area': (7.0, -29.5, 32.0, -8.9), 'checkpoint': (25.7, -11.0),
     'wave': ((9, 1, (25.7, -19.5), 180), (16, 1, (25.7, -21.2), 0), (14, 1, (15.0, -19.0), 0)),
     'crew': ((25.7, -17.6), (13.0, -17.0), (16.6, -17.4))},
    {'name': "the Frigate's waist", 'area': (-24.5, -18.0, 5.8, -0.3), 'checkpoint': (3.0, -13.0),
     'wave': ((11, 1, (-17.0, -6.0), 90), (17, 1, (-15.4, -6.0), 270), (8, 1, (-18.0, -10.0), 90),
              (14, 1, (-16.4, -10.0), 270), (9, 2, (0.2, -3.5), 180)),
     'crew': ((-19.8, -8.0), (-13.8, -8.0), (-16.2, -3.8))},
    {'name': "the Frigate's gun deck", 'area': (-19.5, -28.4, 4.6, -22.0), 'checkpoint': (0.1, -25.2),
     'wave': ((10, 1, (-13.0, -27.0), 180), (13, 1, (-13.0, -28.6), 0), (12, 1, (-10.6, -31.5), 270)),
     'crew': ((-15.6, -27.8), (-10.4, -27.8), (-13.0, -24.8))},
    {'name': "the Frigate's quarterdeck", 'area': (-4.9, -41.0, 4.9, -30.7), 'checkpoint': (1.6, -33.2),
     'wave': (), 'crew': ()},
)

# The camera's way back from the arena's heap to the player after its flight down the wreck: out past the Frigate's
# port side, clear of her masts, then over the wreckage off her port bow; points (x, y) and heights over the sea.
FLIGHT_BACK = ((-9.5, -24.0, 9.5), (-14.0, -4.0, 8.5))

# The masts still standing, by the ship's frame and where along her each stands: the Brig's fore, and the Frigate's
# fore and main. A camera flying the wreck keeps clear of them.
MASTS = (('brig', 6.85), ('frigate', 11.4), ('frigate', -0.55))

# The arena is the last zone; Thule stands before the wheel, facing the way in.
ARENA_ZONE = len(ZONES) - 1
THULE = (1.8, -34.0)


def game(point):
    """A point of the wreck's frame (x east, y north) in the game's (x east, y south)."""
    return (round(point[0], 3), round(-point[1], 3))


def _apart(one, other):
    """How far apart two points are, metres."""
    return ((one[0] - other[0]) ** 2 + (one[1] - other[1]) ** 2) ** 0.5


def game_area(area):
    """A box (west, south, east, north) of the wreck's frame as the game's (minX, minY, maxX, maxY)."""
    west, south, east, north = area
    return (round(west, 3), round(-north, 3), round(east, 3), round(-south, 3))


# A figure stands this far, metres, clear of any ground a step higher or lower than its own: a body's radius and a
# hair, so none stands against a wall, over an edge, or in what is drawn.
FIGURE_ROOM_M = 0.45
# The least ground a body walks on in the whole wreck, every heap gone, square metres.
GROUND_LEAST_M2 = 2000.0
# How many of the Brig's crew stand in each zone with a wave.
CREW = 3
# How near a crewman stands to a boarder of his zone, on that boarder's deck, metres: under this, so they are fighting
# when the player comes (the page's wreckCrew test holds the same).
CREW_BY_M = 4.0
# How far a crewman's deck may stand over or under his boarder's and still count as the same deck: under this, metres.
SAME_DECK_M = 0.7


def check(reach, gates, climb, place=game):
    """The level's faults on the ground `reach` (wreck_reach.Reach, the game's frame) with the gates' boxes `gates`
    (minX, minY, maxX, maxY, the game's frame, by the zone each closes, none for a zone whose way on is open): an empty
    list when it holds. Every way on is walked, and every way round a standing gate is looked for climbing as high as
    `climb`; every figure stands on ground reached, with room round it, where `place` (the game's frame, as the export
    writes it) puts it; no ground reached while a zone's heap stands lies in a zone further on, which would bring the
    player back; and the whole is as large as it must be."""
    faults = []
    for index, zone in enumerate(ZONES):
        start = game(zone['checkpoint'])
        closed = [gate for gate in gates[index:] if gate is not None]
        reached = reach.flood(start, closed)
        if not reached:
            faults.append(f"{zone['name']}: its checkpoint stands on no ground")
            continue
        figures = [('a foe', at) for _, _, at, _ in zone['wave']] + [('a crewman', at) for at in zone['crew']]
        for what, at in [('its checkpoint', zone['checkpoint']), *figures]:
            if not reach.reaches(reached, place(at)):
                faults.append(f"{zone['name']}: {what} at {at} stands where the checkpoint does not reach")
            elif not reach.clear(place(at), FIGURE_ROOM_M):
                faults.append(f"{zone['name']}: {what} at {at} has no room round it")
        for at in zone['crew'] if zone['wave'] else ():
            by = min((foe for _, _, foe, _ in zone['wave']), key=lambda foe: _apart(place(foe), place(at)))
            deck = [reach.height(*reach.square_of(*place(point))) for point in (at, by)]
            if (_apart(place(by), place(at)) >= CREW_BY_M or None in deck
                    or abs(deck[0] - deck[1]) >= SAME_DECK_M):
                faults.append(f"{zone['name']}: a crewman at {at} stands {CREW_BY_M} m or more from a boarder on its deck")
        # The game lets the player stand in every zone up to the first whose way on is closed (wreckProgress.ts).
        furthest = next((ahead for ahead in range(index, len(gates)) if gates[ahead] is not None), len(ZONES) - 1)
        for later in ZONES[furthest + 1:]:
            box = game_area(later['area'])
            inside = [square for square in reached
                      if box[0] <= reach.middle(*square)[0] <= box[2] and box[1] <= reach.middle(*square)[1] <= box[3]]
            if inside:
                spots = [reach.middle(*square) for square in inside]
                across = [round(f([spot[axis] for spot in spots]), 2) for axis in (0, 1) for f in (min, max)]
                faults.append(f"{zone['name']}: {len(inside)} squares reached with its heap standing lie in "
                              f"{later['name']} (the game's x {across[0]} to {across[1]}, y {across[2]} to "
                              f"{across[3]}), which would bring the player back")
        has_wave = 0 < index < ARENA_ZONE
        if bool(zone['wave']) != has_wave or len(zone['crew']) != (CREW if has_wave else 0):
            faults.append(f"{zone['name']}: a wave and {CREW} crew stand in every zone but the first and the arena")
        if index + 1 < len(ZONES):
            after = ZONES[index + 1]
            if gates[index] is not None and reach.reaches(reach.flood(start, closed, climb), game(after['checkpoint'])):
                faults.append(f"{zone['name']}: {after['name']} is reached while its heap stands")
            opened = reach.flood(start, [gate for gate in gates[index + 1:] if gate is not None])
            if not reach.reaches(opened, game(after['checkpoint'])):
                faults.append(f"{zone['name']}: {after['name']} is not reached once its heap is gone")
    arena = reach.flood(game(ZONES[ARENA_ZONE]['checkpoint']))
    if not reach.reaches(arena, game(THULE)) or not reach.clear(game(THULE), FIGURE_ROOM_M):
        faults.append("Thule's place is not reached from the arena's checkpoint, or has no room round it")
    whole = len(reach.flood(game(WAKE[0]))) * reach.square_m2
    if whole < GROUND_LEAST_M2:
        faults.append(f'the ground a body walks is {whole:.0f} m2, under {GROUND_LEAST_M2:.0f}')
    return faults
