"""The game's own tables the forge's wardrobe follows: each clothing template's equip slot (DFO's
`src/characters/equipRules.js`), its garments by variant and the armour pieces (DFO's
`src/systems/studioArt/forgeWardrobe.js`), saved from those modules into `specs/game-tables.json`, as DFO's game code is
not here. What can be worn together is what the game lets a character wear."""
import functools
import json
import os

TABLES = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'game-tables.json')


@functools.lru_cache(maxsize=1)
def tables():
    """{slot: template -> slot, garments: template -> variants, pieces: template -> piece, full: [garment]}"""
    with open(TABLES) as file:
        return json.load(file)


@functools.lru_cache(maxsize=1)
def slots():
    """Each garment's slot ('ChestClothes', 'LegsClothes', 'Feet', 'Cloak'), and the garments each is laid with in
    one of its templates' variants (a shirt's belt, its vest)."""
    T = tables()
    slot_of, together = {}, {}
    for t, variants in T['garments'].items():
        s = T['slot'].get(t, '')
        s = 'Cloak' if 'Cloak' in s else s
        for v in variants:
            gs = v.split(' ')
            for g in gs:
                if slot_of.setdefault(g, s) != s:
                    raise ValueError(f'{g} is worn in two slots: {slot_of[g]} and {s}')
                together.setdefault(g, set()).update(x for x in gs if x != g)
    return slot_of, together


def worn_with(a, b):
    """Whether garments `a` and `b` can be worn at once: in two slots, or laid together in one item."""
    slot_of, together = slots()
    if a == b or a not in slot_of or b not in slot_of:
        return False
    return slot_of[a] != slot_of[b] or b in together.get(a, ())
