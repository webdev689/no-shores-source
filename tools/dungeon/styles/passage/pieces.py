"""The passages' pieces as {role: faces}, sized to content/dungeon/kits.json's `passage` contract (the same sizes the
islands' kit holds): the lamp that burns on nothing in its ring of five stones, the mouths onward (open and shut),
the way in seen from inside, the Kindle mission's dead lamp, the Grey Tithe's tally post whole and broken, the
reliquary shut and open, and a Hold's ring. The grey-green stone is `stone` (its worn faces `stoneAlt`), the old
iron `iron`, what the game lights `glow`, the pecked cup marks `carve`.
"""
import math
import random

import details
import shapes

from . import forms
from .forms import block, cups, gather, move

# The lamp's ring: five stones 3.5 m out, the first due north, then every 72 degrees; its plinth's half and height.
RING_M = 3.5
PLINTH_HALF_M = 0.8
PLINTH_M = 1.4
FLAME_M = 3.2
# A mouth's opening: half its width and the lintel's underside.
OPENING_HALF_M = 0.68
LINTEL_M = 2.36
# A Hold's ring: its stones laid on 6 m round its middle (RING_M in crates/passage/src/plan.rs), how many, and the
# most a stone's top stands over the floor at its middle, kept with its tip under the walk zone's foot (envelope.py's
# WALK_LOW_M) so a body walks over it.
HOLD_RING_M = 6.0
HOLD_STONES = 32
HOLD_TOP_M = 0.038


def lamp(seed='passage.lamp'):
    """The lamp: a plinth of the grey-green stone, cup-marked on every face, carrying an iron standard whose cage of
    old iron holds glass round nothing, its middle at the flame's height; five standing stones round it and a ring of
    flags at the plinth's feet."""
    draw = random.Random(seed)
    half = PLINTH_HALF_M
    parts = {'stone': block(-half, -half, -0.3, half, half, 0.2, f'{seed} course', wear=0.015),
             'stoneAlt': block(-0.72, -0.72, 0.2, 0.72, 0.72, 1.24, f'{seed} die', wear=0.01)}
    parts['stone'] += block(-half, -half, 1.22, half, half, PLINTH_M, f'{seed} cap', bevel=0.03)
    marks = []
    for turn in (0, 90, 180, 270):
        face = [cups((0.0, -0.72, 0.74), (0.0, -1.0, 0.0), rings=3, radius=0.045, seed=f'{seed} {turn}')]
        for x, z, rings in ((-0.42, 1.02, 1), (0.44, 0.42, 0), (0.38, 1.05, 0), (-0.4, 0.44, 2)):
            face.append(cups((x + draw.uniform(-0.04, 0.04), -0.72, z), (0.0, -1.0, 0.0), rings=rings,
                             seed=f'{seed} {turn} {x}'))
        marks.append({role: move(faces, turn=turn) for role, faces in gather(*face).items()})
    parts = gather(parts, *marks, _standard(), _cage(), _ring_of_stones(seed))
    parts['stoneAlt'] += forms.flags(0.86, 1.75, 11, seed)
    return parts


def _standard():
    """The lamp's iron standard on the plinth: a foot plate, a tapering shaft with collars, and four arms out to the
    cage's corners."""
    iron = shapes.bevelled_box(-0.22, -0.22, PLINTH_M, 0.22, 0.22, PLINTH_M + 0.06, bevel=0.012)
    iron += shapes.cone((0.0, 0.0, PLINTH_M + 0.06), (0.0, 0.0, 2.8), 0.065, 0.04, sides=8)
    for z, radius in ((1.62, 0.07), (2.05, 0.06), (2.45, 0.055)):
        iron += shapes.ring((0.0, 0.0, z), radius, 0.014, sides=10, tube_sides=4)
    for corner in range(4):
        turn = math.radians(45 + 90 * corner)
        out = (math.sin(turn), -math.cos(turn))
        iron += forms.bent([(out[0] * 0.03, out[1] * 0.03, 2.6), (out[0] * 0.14, out[1] * 0.14, 2.72),
                            (out[0] * 0.2, out[1] * 0.2, 2.9)], 0.016, sides=5)
    return {'iron': iron}


def _cage():
    """The lamp's cage round its flame: a pan, four corner posts, glass on every side, a hood and its ring."""
    iron = shapes.lathe([(0.0, 2.86), (0.12, 2.86), (0.25, 2.9), (0.24, 2.95), (0.0, 2.95)], sides=12)
    for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        iron += shapes.box(x * 0.175 - 0.018, y * 0.175 - 0.018, 2.95, x * 0.175 + 0.018, y * 0.175 + 0.018, 3.46)
    for z in (3.07, 3.33):
        iron += shapes.ring((0.0, 0.0, z), 0.2, 0.01, sides=4, tube_sides=3)
    iron += shapes.cone((0.0, 0.0, 3.46), (0.0, 0.0, 3.64), 0.28, 0.03, sides=4)
    iron += shapes.ring((0.0, 0.0, 3.655), 0.024, 0.008, axis=(0.0, 1.0, 0.0), sides=8, tube_sides=3)
    glass = shapes.box(-0.16, -0.16, 2.95, 0.16, 0.16, 3.46)
    return {'iron': iron, 'glow': glass}


def _ring_of_stones(seed):
    """The five standing stones, broad face to the lamp, leaning a little, cup marks on the face that looks in."""
    draw = random.Random(f'{seed} ring')
    found = []
    for number in range(5):
        height = draw.uniform(1.86, 2.2)
        lean = (draw.uniform(-0.05, 0.05), draw.uniform(-0.04, 0.04))
        stone = forms.standing_stone(0.86, 0.44, height, f'{seed} {number}', lean=lean)
        stone = move(stone, at=(0.0, -RING_M, 0.0))
        marks = [cups((draw.uniform(-0.18, 0.18), -RING_M + 0.2, z), (0.0, 1.0, 0.0), rings=rings,
                      seed=f'{seed} {number} {z}') for z, rings in ((height * 0.55, 2), (height * 0.3, 0))]
        piece = gather({'stone' if number % 2 else 'stoneAlt': stone}, *marks)
        found.append({role: move(faces, turn=72 * number) for role, faces in piece.items()})
    return gather(*found)


def _jamb(side, seed):
    """A mouth's jamb of rough stones laid up dry, from x ±0.7 to ±1.2, a corbel stepping in under the lintel."""
    draw = random.Random(f'{seed} {side}')
    faces, level = [], -0.3
    while level < LINTEL_M - 0.05:
        top = min(LINTEL_M, level + draw.uniform(0.38, 0.62))
        inner = 0.7 + draw.uniform(0.0, 0.03)
        low, high = sorted((side * inner, side * (1.2 - draw.uniform(0.0, 0.04))))
        faces += forms.block(low, -0.385 + draw.uniform(0.0, 0.02), level, high, 0.39, top - 0.008,
                             f'{seed} {side} {level:.2f}', wear=0.02, bevel=0.03)
        level = top
    low, high = sorted((side * 0.64, side * 1.0))
    faces += forms.block(low, -0.36, 2.21, high, 0.36, LINTEL_M - 0.004, f'{seed} {side} corbel', wear=0.012)
    return faces


def _frame(seed, ringed=True):
    """What every mouth shares: its two jambs, the grey-green lintel cup-marked along its face, the stones packed
    over it and the worn sill."""
    draw = random.Random(f'{seed} frame')
    lintel = block(-1.18, -0.385, LINTEL_M, 1.18, 0.37, 2.8, f'{seed} lintel', wear=0.014)
    marks = [cups((x, -0.385, 2.58 + draw.uniform(-0.06, 0.06)), (0.0, -1.0, 0.0), rings=rings if ringed else 0,
                  seed=f'{seed} {x}')
             for x, rings in ((-0.8, 0), (-0.48, 1), (0.0, 3), (0.42, 0), (0.62, 1), (0.92, 0))]
    packing, x = [], -1.16
    while x < 1.1:
        wide = min(draw.uniform(0.36, 0.62), 1.16 - x)
        packing += block(x, -0.36 + draw.uniform(0.0, 0.03), 2.8, x + wide - 0.02, 0.34, 2.8 + draw.uniform(0.1, 0.19),
                         f'{seed} pack {x:.2f}', wear=0.02, bevel=0.025)
        x += wide
    sill = block(-0.72, -0.4, -0.3, 0.72, 0.3, 0.03, f'{seed} sill', wear=0.01)
    return gather({'stoneAlt': _jamb(-1, seed) + _jamb(1, seed) + packing, 'stone': lintel + sill}, *marks)


def _slab(seed, marked=True):
    """The slab that shuts a mouth, standing in its opening: grey-green, its edges rough, a ring-and-cup on its face,
    stones wedged at its foot."""
    draw = random.Random(f'{seed} slab')
    slab = block(-OPENING_HALF_M, -0.06, -0.3, OPENING_HALF_M, 0.16, LINTEL_M - 0.02, f'{seed} slab', wear=0.03,
                 bevel=0.05)
    marks = [cups((0.0, -0.06, 1.35), (0.0, -1.0, 0.0), rings=4, radius=0.04, seed=f'{seed} great')] if marked else []
    marks += [cups((x, -0.06, z), (0.0, -1.0, 0.0), rings=rings, seed=f'{seed} {x} {z}')
              for x, z, rings in ((-0.4, 1.9, 1), (0.38, 0.7, 0), (0.42, 1.95, 0), (-0.36, 0.62, 2))]
    wedges = []
    for x in (-0.5, 0.05, 0.48):
        wedges += details.rock(x + draw.uniform(-0.05, 0.05), -0.2, -0.05, (0.26, 0.24, 0.22),
                               seed=f'{seed} wedge {x}', detail=1, roughness=0.25)
    return gather({'stone': slab, 'stoneAlt': wedges}, *marks)


def mouth(shut, seed='passage.mouth'):
    """An onward mouth for a wall or a rock face: open, its dark way back to its rough back; shut, the slab in it."""
    found = _frame(seed)
    if shut:
        return gather(found, _slab(seed))
    # The way on, lit faintly beyond the reveal, so an open mouth reads open from across a room: a far plane of
    # light framed by rough rock at its sides and over it, chips of it lying on the sill.
    draw = random.Random(f'{seed} back')
    light = block(-0.6, 0.38, -0.3, 0.6, 0.4, LINTEL_M - 0.2, f'{seed} light', wear=0.0, bevel=0.0)
    back = []
    for row in range(5):
        for column in (0, 2):
            x = -0.62 + column * 0.62 + draw.uniform(-0.04, 0.04)
            back += details.rock(x, 0.33, row * 0.47 - 0.1, (0.34, 0.1, 0.56), seed=f'{seed} back {row} {column}',
                                 detail=0, roughness=0.25)
    for column in range(3):
        x = -0.46 + column * 0.46 + draw.uniform(-0.05, 0.05)
        back += details.rock(x, 0.33, LINTEL_M - 0.32, (0.5, 0.1, 0.3), seed=f'{seed} over {column}', detail=0,
                             roughness=0.25)
    rubble = []
    for number in range(5):
        x = -0.52 + number * 0.26 + draw.uniform(-0.04, 0.04)
        rubble += details.rock(x, 0.18, -0.02, (0.22, 0.2, 0.065), seed=f'{seed} rubble {number}', detail=1,
                               roughness=0.3)
    return gather(found, {'stoneAlt': back, 'stone': rubble, 'glow': light})


def way_in(seed='passage.way-in'):
    """The mouth a player came in by, from inside and shut: the same arch, its slab grown over with chalk and roots
    come down over the lintel from the ground above."""
    found = gather(_frame(seed, ringed=False), _slab(seed, marked=False))
    draw = random.Random(f'{seed} growth')
    spots = [(x, -0.06, z) for x in (-0.4, -0.1, 0.2, 0.42) for z in (0.25, 0.75, 1.25, 1.7, 2.1)]
    spots += [(x, -0.33, z) for x in (-0.82, 0.8) for z in (0.3, 0.9, 1.6)]
    chalk = forms.crust(spots, 22, seed, size=(0.2, 0.36), proud=0.045)
    roots = []
    for number in range(5):
        x = -0.86 + number * 0.43 + draw.uniform(-0.06, 0.06)
        path = [(x, 0.1, 2.95), (x + draw.uniform(-0.05, 0.05), -0.37, 2.82)]
        z, drift = 2.6, 0.0
        while z > 0.2 + number % 3 * 0.35:
            drift += draw.uniform(-0.08, 0.08)
            path.append((x + drift, -0.36 if abs(x + drift) > 0.7 else -0.085, z))
            z -= draw.uniform(0.18, 0.34)
        roots += details.rope(path, radius=0.022 + 0.01 * (number % 2), sides=5, strands=1, step=0.2)
    return gather(found, {'chalk': chalk, 'root': roots})


def kindle(seed='passage.kindle'):
    """A dead lamp on an iron hook post: a stone at its foot, the post forged square with collars, its top crooked
    over and a small cage of old iron and dark glass hung from the crook."""
    iron = shapes.prism((0.0, 0.0, 0.1), (0.0, 0.0, 2.32), 0.034, sides=4, turn=45.0)
    for z in (0.32, 1.1, 1.16, 2.0):
        iron += shapes.ring((0.0, 0.0, z), 0.032, 0.011, sides=8, tube_sides=3)
    crook = [(0.0, 0.0, 2.28), (0.02, 0.0, 2.35), (0.08, 0.0, 2.375), (0.14, 0.0, 2.36), (0.17, 0.0, 2.33)]
    iron += forms.bent(crook, 0.014, sides=5)
    iron += shapes.ring((0.17, 0.0, 2.305), 0.024, 0.006, axis=(1.0, 0.0, 0.0), sides=8, tube_sides=3)
    iron += shapes.cone((0.17, 0.0, 2.22), (0.17, 0.0, 2.29), 0.07, 0.012, sides=6)
    iron += shapes.lathe([(0.0, 2.06), (0.05, 2.06), (0.075, 2.08), (0.07, 2.1), (0.0, 2.1)], x=0.17, sides=8)
    for turn in (30, 150, 270):
        out = (math.cos(math.radians(turn)) * 0.06, math.sin(math.radians(turn)) * 0.06)
        iron += forms.rod((0.17 + out[0], out[1], 2.1), (0.17 + out[0], out[1], 2.225), 0.007, sides=4)
    glass = shapes.cylinder((0.17, 0.0, 2.1), (0.17, 0.0, 2.22), 0.052, sides=6)
    foot = details.rock(0.0, 0.0, -0.3, (0.48, 0.46, 0.58), seed=f'{seed} foot', detail=1, roughness=0.22)
    return {'iron': iron, 'glow': glass, 'stone': foot}


def _stick(x, top, length, seed):
    """A tally stick of hazel hung by its cord from the bar, notched down its face."""
    draw = random.Random(seed)
    wood = forms.rod((x, 0.0, top - length), (x, 0.0, top), 0.017, sides=6)
    carve = []
    for number in range(draw.randint(5, 9)):
        z = top - 0.04 - number * (length - 0.08) / 9 - draw.uniform(0.0, 0.01)
        wide = 0.008 if number % 5 == 4 else 0.005
        carve += shapes.box(x - wide - 0.004, -0.0185, z, x + wide + 0.004, -0.013, z + 0.008)
    rope = details.rope([(x, 0.0, top), (x, 0.0, top + 0.06)], radius=0.005, sides=4, strands=1)
    return {'wood': wood, 'carve': carve, 'rope': rope}


def tally_post(broken, seed='passage.tally-post'):
    """A Grey Tithe tally post: a squared post wedged in stones, a bar hung with notched tally sticks and a slate
    nailed to its face with the count scratched on it; broken, the post snapped and splintered, the bar hanging by
    one end and the sticks and the slate down at its foot."""
    draw = random.Random(seed)
    stones = []
    for turn in (10, 100, 190, 280):
        out = (math.sin(math.radians(turn)) * 0.23, -math.cos(math.radians(turn)) * 0.23)
        stones += details.rock(out[0], out[1], -0.15, (0.19, 0.17, 0.3), seed=f'{seed} stone {turn}', detail=1,
                               roughness=0.25)
    top = 1.52 if broken else 1.72
    wood = shapes.bevelled_box(-0.07, -0.07, -0.3, 0.07, 0.07, top, bevel=0.012)
    iron = shapes.ring((0.0, 0.0, 0.42), 0.085, 0.01, sides=4, tube_sides=3)
    found = {'stoneAlt': stones, 'iron': iron, 'wood': wood}
    slate = shapes.bevelled_box(-0.14, -0.1, -0.06, 0.14, -0.08, 0.3, bevel=0.006)
    scratches = []
    for row in range(3):
        for number in range(4 + row):
            x = -0.11 + number * 0.035
            scratches += shapes.box(x, -0.1035, 0.2 - row * 0.07, x + 0.006, -0.0995, 0.25 - row * 0.07)
        scratches += shapes.box(-0.115, -0.1035, 0.215 - row * 0.07, 0.04 + row * 0.03, -0.0995, 0.221 - row * 0.07)
    if not broken:
        wood += shapes.bevelled_box(-0.12, -0.12, 1.72, 0.12, 0.12, 1.8, bevel=0.01)
        wood += shapes.box(-0.29, -0.028, 1.45, 0.29, 0.028, 1.52)
        for number, x in enumerate((-0.25, -0.13, 0.13, 0.25)):
            found = gather(found, _stick(x, 1.38, draw.uniform(0.26, 0.34), f'{seed} stick {number}'))
        hung = (0.0, 0.0, 0.95)
        found = gather(found, {'slate': move(slate, at=hung), 'carve': move(scratches, at=hung)})
        found['iron'] += shapes.cone((0.0, -0.1, 1.2), (0.0, -0.075, 1.2), 0.008, 0.0, sides=4)
        return found
    splinters = []
    for number in range(9):
        turn = math.tau * number / 9
        x, y = math.cos(turn) * 0.05, math.sin(turn) * 0.05
        splinters += shapes.cone((x, y, top - 0.01), (x * 1.3, y * 1.3, top + draw.uniform(0.04, 0.14)), 0.022, 0.0,
                                 sides=3)
    found['wood'] += splinters
    bar = move(shapes.box(-0.29, -0.028, -0.028, 0.29, 0.028, 0.028), turn=0.0, roll=-58.0)
    found['wood'] += move(bar, at=(0.07, 0.0, 1.2))
    for number in range(4):
        lying = move(forms.rod((-0.15, 0.0, 0.0), (0.15, 0.0, 0.0), 0.012, sides=6),
                     at=(draw.uniform(-0.12, 0.12), draw.uniform(-0.28, -0.14), 0.012), turn=draw.uniform(-40, 40))
        found['wood'] += lying
    for number, (x, turn) in enumerate(((0.12, 18.0), (-0.1, -32.0))):
        half = shapes.bevelled_box(-0.09, -0.06, 0.0, 0.09, 0.06, 0.018, bevel=0.004)
        found.setdefault('slate', []).extend(move(half, at=(x, 0.22, 0.0), turn=turn))
    return found


def reliquary(open_, seed='passage.reliquary'):
    """A chest of the grey-green stone on a plinth course, cup-marked on its face, its lid bound in iron, hasped and
    locked; open, the lid stands back against its hinge and the chest gapes, dust in its floor."""
    plinth = block(-0.68, -0.44, -0.12, 0.68, 0.24, 0.1, f'{seed} plinth', wear=0.012)
    if open_:
        body = []
        for x0, y0, x1, y1 in ((-0.64, -0.4, 0.64, -0.32), (-0.64, 0.12, 0.64, 0.2), (-0.64, -0.32, -0.56, 0.12),
                               (0.56, -0.32, 0.64, 0.12)):
            body += block(x0, y0, 0.1, x1, y1, 0.72, f'{seed} wall {x0} {y0}', wear=0.008, bevel=0.015)
        dust = shapes.box(-0.56, -0.32, 0.1, 0.56, 0.12, 0.28)
    else:
        body, dust = block(-0.64, -0.4, 0.1, 0.64, 0.2, 0.72, f'{seed} body', wear=0.01), []
    marks = [cups((x, -0.4, 0.42), (0.0, -1.0, 0.0), rings=rings, seed=f'{seed} {x}')
             for x, rings in ((-0.38, 1), (0.0, 2), (0.38, 1))]
    lid = block(-0.68, -0.44, 0.0, 0.68, 0.24, 0.16, f'{seed} lid', wear=0.006, bevel=0.025)
    straps = []
    for x in (-0.42, 0.42):
        straps += shapes.box(x - 0.035, -0.448, 0.16, x + 0.035, 0.25, 0.175)
        straps += shapes.box(x - 0.035, -0.448, -0.06, x + 0.035, -0.44, 0.175)
        straps += shapes.box(x - 0.035, 0.24, -0.04, x + 0.035, 0.252, 0.175)
    for x in (-0.66, 0.66):
        straps += shapes.box(x - 0.025, -0.448, 0.03, x + 0.025, 0.25, 0.168)
    hasp = shapes.box(-0.045, -0.448, -0.1, 0.045, -0.44, 0.06)
    if open_:
        # The lid swung on its hinge at the back of the chest until it stands just past upright.
        lid = move(lid, turn=0.0, tilt=-92.0, about=(0.0, 0.24, 0.0))
        straps = move(straps, tilt=-92.0, about=(0.0, 0.24, 0.0))
        hasp = move(hasp, tilt=-92.0, about=(0.0, 0.24, 0.0))
    lift = (0.0, 0.0, 0.72)
    # The lock stays on the chest's face; its ring hangs from it, shut or open.
    lock = shapes.bevelled_box(-0.06, -0.44, 0.5, 0.06, -0.4, 0.64, bevel=0.01)
    lock += shapes.ring((0.0, -0.442, 0.5), 0.03, 0.006, axis=(0.0, 1.0, 0.0), sides=8, tube_sides=3)
    return gather({'stoneAlt': plinth, 'stone': body + move(lid, at=lift), 'iron': move(straps + hasp, at=lift) + lock,
                   'earth': dust}, *marks)


def hold_ring(seed='passage.ring'):
    """A Hold's ring: worn flat stones of the grey-green stone laid end to end in the floor on its 6 m, their joints
    running to its middle, their tops just proud of the floor so a body walks over them."""
    draw = random.Random(seed)
    found = []
    # Each stone's length and the joint after it, metres round the ring, drawn and then fitted to go once round.
    lengths = [draw.uniform(0.75, 1.35) for _ in range(HOLD_STONES)]
    joints = [draw.uniform(0.08, 0.17) for _ in range(HOLD_STONES)]
    fit = math.tau * HOLD_RING_M / (sum(lengths) + sum(joints))
    along = 0.0
    for length, joint in zip(lengths, joints):
        half = length * fit / 2
        turn = math.degrees((along + half) / HOLD_RING_M)
        along += (length + joint) * fit
        reach = HOLD_RING_M + draw.uniform(-0.03, 0.03)
        across = draw.uniform(0.17, 0.25)
        near, far = half * (1 - across / reach), half * (1 + across / reach)
        # Laid at the ring's north, its length along x, every corner knocked off unevenly: further along its length
        # than across its end, so its end keeps a straight run.
        corners = [(-near, -reach + across), (near, -reach + across), (far, -reach - across), (-far, -reach - across)]
        outline = []
        for corner, (x, y) in enumerate(corners):
            for other in (corners[corner - 1], corners[(corner + 1) % 4]):
                leg = draw.uniform(0.06, 0.2) if other == corners[corner ^ 1] else draw.uniform(0.05, 0.12)
                share = leg / math.hypot(other[0] - x, other[1] - y)
                outline.append((x + (other[0] - x) * share, y + (other[1] - y) * share))
        slope = (draw.uniform(-0.01, 0.01), draw.uniform(-0.01, 0.01))
        stone = forms.laid_stone(outline, draw.uniform(0.032, HOLD_TOP_M), 0.25, slope, bevel=0.045)
        role = 'stone' if draw.random() < 0.6 else 'stoneAlt'
        found.append({role: move(stone, turn=turn)})
    return gather(*found)
