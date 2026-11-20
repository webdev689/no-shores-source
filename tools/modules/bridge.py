"""Stone bridges: a way carried over a river on arches of cut stone, one module for each length of deck from 16 m to
40 m. The deck, 6.2 m wide and paved between parapets, runs along +y (Blender's frame) at 5.5 m over the module's
foot; one, two or three round arches are cut out of the stone body under it, its piers' cutwaters pointing into the
water; its abutments stand solid at either end. Its parts are the deck, the parapets, the piers and the abutments,
so the water and a swimmer pass under the arches.
"""
import kit

WIDE_M = 6.2
# The stone body's width under the deck.
BODY_M = WIDE_M - 0.3
DECK_M = 5.5
SLAB_M = 0.7
PARAPET = (0.45, 1.0)
LENGTHS = (16, 22, 28, 34, 40)
ABUTMENT_M = 3.0


def builder(length):
    """The builder of the bridge whose deck is `length` metres long."""

    def build(module):
        half = length / 2
        arches = 1 if length <= 22 else 2 if length <= 34 else 3
        pier = 2.2
        span = (length - 2 * ABUTMENT_M - (arches - 1) * pier) / arches
        radius = span / 2
        crown = DECK_M - SLAB_M - 0.4
        # The body under the deck, its arches cut out of it.
        # Up to the deck slab's underside, so no gap shows under the deck and stone stands over each arch's crown.
        body = kit.block(module, (0.0, 0.0, -1.0), (BODY_M, length, DECK_M - SLAB_M + 1.0), 'stone', bevel=0.05,
                         wear=0.03, part=False)
        middles = [-half + ABUTMENT_M + radius + number * (span + pier) for number in range(arches)]
        for middle in middles:
            kit.cut(body, kit.cylinder_cutter((0.0, middle, crown - radius), radius, WIDE_M + 2.0, along_y=False))
        # Its abutments and piers as parts, and a cutwater either side of each pier.
        # Each part as wide as the stone drawn round it: the abutments and piers the body's width, and the cutwaters
        # parts of their own, so a swimmer meets the stone where it is seen.
        for side in (-1, 1):
            module.part((-BODY_M / 2, side * half - (ABUTMENT_M if side > 0 else 0.0), 0.0),
                        (BODY_M / 2, side * half + (0.0 if side > 0 else ABUTMENT_M), DECK_M - SLAB_M))
        for number in range(arches - 1):
            at = middles[number] + radius + pier / 2
            module.part((-BODY_M / 2, at - pier / 2, 0.0), (BODY_M / 2, at + pier / 2, crown - radius * 0.2))
            # 0.6 m past where the arch springs off the pier, or past the foot where a flat arch springs under it.
            cutwater = max(crown - radius, 0.0) + 0.6 + 1.0
            for side in (-1, 1):
                kit.column(module, (side * (WIDE_M / 2 + 0.3), at, -1.0), pier / 2, cutwater, 'stone', sides=3,
                           top=0.85, wear=0.04, part=True)
        # The deck, its paving in courses across, the parapets and their coping.
        kit.block(module, (0.0, 0.0, DECK_M - SLAB_M), (WIDE_M, length, SLAB_M - 0.15), 'stone', bevel=0.04, wear=0.02,
                  part=False)
        module.part((-WIDE_M / 2, -half, DECK_M - SLAB_M), (WIDE_M / 2, half, DECK_M))
        y = -half
        while y < half - 0.2:
            deep = min(module.draw(0.6, 1.1), half - y)
            kit.block(module, (0.0, y + deep / 2, DECK_M - 0.15), (WIDE_M - 2 * PARAPET[0], deep - 0.04, 0.15),
                      'paving', bevel=0.0, wear=0.0, part=False)
            y += deep
        for side in (-1, 1):
            x = side * (WIDE_M / 2 - PARAPET[0] / 2)
            kit.block(module, (x, 0.0, DECK_M), (PARAPET[0], length, PARAPET[1]), 'stone', bevel=0.04, wear=0.03)
            kit.block(module, (x, 0.0, DECK_M + PARAPET[1]), (PARAPET[0] + 0.12, length, 0.18), 'trim', bevel=0.03,
                      wear=0.0, part=False)
            for end in (-1, 1):
                kit.block(module, (x, end * (half - 0.4), DECK_M), (0.8, 0.8, PARAPET[1] + 0.6), 'stone', bevel=0.06,
                          wear=0.03, part=False)
        module.socket('near', (0.0, -half, DECK_M), (0, -1))
        module.socket('far', (0.0, half, DECK_M), (0, 1))

    return build

