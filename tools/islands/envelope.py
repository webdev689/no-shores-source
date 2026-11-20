"""The island modules' envelopes, without Blender: the contract's own sense (`contract_problems`) and each built
module's triangles against its size (`problems`).

A module stands in its frame (x east, y south, z up, metres; the origin the middle of its base, its front at -y)
within its size: x within ±size x / 2, y within ±size y / 2, z from a skirt below 0 (so it never floats where the game
sets it on a slope) up to size z. It fills most of that box, so the footprint the game reserves reads true, keeps to
its role's triangle budget, and has mesh where each of its solids stands.
"""
import catalog

TOLERANCE_M = 0.02
SKIRT_M = 0.8
# The least share of its size a module's mesh spans: across x and along y, and up.
FILL_ACROSS = 0.7
FILL_UP = 0.8
BUDGET = {
    'tree': 1800, 'shrub': 300, 'grass': 300, 'shore': 600, 'boulder': 600, 'drift': 600, 'outcrop': 1200,
    'stack': 1200, 'cliff': 1600, 'wreck': 2500, 'wreckBit': 600, 'ruin': 1500, 'door': 3000, 'landmark': 9000,
    'camp': 1200,
}


def contract_problems():
    """Every way kits.json does not make sense: a size not positive, a solid outside its size or not round, a role
    without a budget, a module of no kit, or biome kits that do not hold the same pieces."""
    found = []
    for name, module in catalog.MODULES.items():
        size = module['size']
        if len(size) != 3 or not all(value > 0 for value in size):
            found.append(f'{name}: size {size} is not three positive numbers')
            continue
        if module['role'] not in BUDGET:
            found.append(f"{name}: role {module['role']!r} has no triangle budget")
        for x, y, r in module['solids']:
            if r <= 0 or abs(x) > size[0] / 2 or abs(y) > size[1] / 2:
                found.append(f'{name}: solid ({x}, {y}, r {r}) stands outside its size {size}')
        if name.partition('.')[0] not in catalog.KITS:
            found.append(f'{name}: no kit of kits.json names it')
    pieces = {kit: [catalog.piece_of(name) for name in catalog.required(kit)] for kit in catalog.BIOMES}
    first = catalog.BIOMES[0]
    for kit, held in pieces.items():
        if held != pieces[first]:
            found.append(f'{kit}: holds {held}, not the pieces {first} holds')
        roles = [catalog.MODULES[f'{kit}.{piece}']['role'] for piece in held]
        if roles != [catalog.MODULES[f'{first}.{piece}']['role'] for piece in pieces[first]]:
            found.append(f'{kit}: its pieces play other roles than {first}\'s')
    return found


def _stands_in(corners, x, y, r):
    """Whether a triangle has a corner within the disc, or lies over its middle (seen from above)."""
    if any((corner[0] - x) ** 2 + (corner[1] - y) ** 2 <= r * r for corner in corners):
        return True
    (ax, ay), (bx, by), (cx, cy) = ((corner[0], corner[1]) for corner in corners)
    sides = [(bx - ax) * (y - ay) - (by - ay) * (x - ax), (cx - bx) * (y - by) - (cy - by) * (x - bx),
             (ax - cx) * (y - cy) - (ay - cy) * (x - cx)]
    return all(side >= 0 for side in sides) or all(side <= 0 for side in sides)


def problems(module, triangles):
    """Every rule a built module's triangles (each three corner positions) break, readable, one a line; an empty
    list passes."""
    if module not in catalog.MODULES:
        return [f'{module}: no module of content/islands/kits.json']
    if not triangles:
        return [f'{module}: no triangles']
    contract = catalog.MODULES[module]
    size, role = contract['size'], contract['role']
    points = [tuple(float(value) for value in corner) for corners in triangles for corner in corners]
    low = [min(point[axis] for point in points) for axis in range(3)]
    high = [max(point[axis] for point in points) for axis in range(3)]
    found = []
    limits = ((-size[0] / 2, size[0] / 2), (-size[1] / 2, size[1] / 2), (-SKIRT_M, size[2]))
    for axis, (least, most) in enumerate(limits):
        if low[axis] < least - TOLERANCE_M or high[axis] > most + TOLERANCE_M:
            found.append(f"{module}: spans {'xyz'[axis]} {low[axis]:.3f}..{high[axis]:.3f}, outside "
                         f'{least:g}..{most:g}')
    for axis, share in ((0, FILL_ACROSS), (1, FILL_ACROSS), (2, FILL_UP)):
        reach = high[axis] - max(low[axis], 0.0) if axis == 2 else high[axis] - low[axis]
        if reach < share * size[axis]:
            found.append(f"{module}: spans {reach:.2f} m of its {size[axis]:g} along {'xyz'[axis]}, under the "
                         f'{share:.0%} its footprint promises')
    if len(triangles) > BUDGET[role]:
        found.append(f'{module}: {len(triangles)} triangles, over the {BUDGET[role]} a {role} may have')
    for x, y, r in contract['solids']:
        if not any(_stands_in(corners, x, y, r) for corners in triangles):
            found.append(f'{module}: no mesh stands in its solid at ({x}, {y}), r {r}')
    return found
