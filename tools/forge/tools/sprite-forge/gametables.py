"""The game's own tables the forge's wardrobe follows, read from its modules (node): each clothing template's equip
slot (`src/characters/equipRules.js`), its garments by variant and the armour pieces
(`src/systems/studioArt/forgeWardrobe.js`). What can be worn together is what the game lets a character wear."""
import functools
import json
import os
import subprocess

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
JS = """
const rules = await import('./src/characters/equipRules.js');
const w = await import('./src/systems/studioArt/forgeWardrobe.js');
const slot = {};
for (const g of ['MensClothing', 'WomensClothing'])
  for (const [t, r] of Object.entries(rules.SLOT_RULES[g] ?? {})) slot[t] = typeof r === 'string' ? r : (r.slot ?? 'Cloak');
console.log(JSON.stringify({ slot, garments: w.GARMENTS_OF_TEMPLATE, pieces: w.ARMOUR_PIECE, full: [...w.FULL_SKIRT] }));
"""


@functools.lru_cache(maxsize=1)
def tables():
    """{slot: template -> slot, garments: template -> variants, pieces: template -> piece, full: [garment]}"""
    out = subprocess.run(['node', '--input-type=module', '-e', JS], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


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
