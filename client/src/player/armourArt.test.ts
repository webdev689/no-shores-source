import assert from 'node:assert/strict';
import { test } from 'node:test';
import spec from '../../../tools/forge/tools/sprite-forge/specs/armour-art.json' with { type: 'json' };
import type { Outfit } from '../forge/outfit.ts';
import { item, state } from '../network/gearForTests.ts';
import { wardrobeOf } from './dressing.ts';
import { KINDS, WORN, slotOf } from './gear.ts';
import { gearOutfit } from './gearLooks.ts';
import { BODIES, held } from './heldForTests.ts';
import { wornArt } from './itemPictures.ts';

const plain: Outfit = { armour: {}, garments: [], dyes: {}, right: null, left: null, drawn: true, hair: null };
/** The armour slots and the cloak's, by the gear crate's numbers. */
const [HEAD, TORSO, ARMS, LEGS, CLOAK] = [2, 3, 4, 5, 6];
/** The pieces of a set each armour slot's look needs drawn, as armourart.py `NEEDED` draws a look only where they are. */
const NEEDED: Readonly<Record<string, readonly string[]>> = {
  head: ['helm'],
  torso: ['cuirass'],
  arms: ['gauntlets'],
  legs: ['greaves', 'boots'],
};

test('the forge draws large every armour, cloak and clothes look an item wears alone, and no garment look none wears', () => {
  const drawnLooks = new Set(spec.garments.map((garments) => garments.join('+')));
  for (const [body, drawn] of Object.entries(BODIES)) {
    const wardrobe = wardrobeOf(body, drawn);
    const draws = (layer: string) => (drawn[layer]?.length ?? 0) > 0;
    const worn = new Set<string>();
    // And the shore's plain clothes, a shirt and breeches with boots.
    const plainClothes = (['torso', 'legs'] as const).map((kind) => ({ kind: KINDS.indexOf(kind), plain: true }));
    for (const fields of [...held(), ...plainClothes]) {
      const slot = slotOf(fields.kind);
      if (slot < HEAD || slot > CLOAK) continue;
      const outfit = gearOutfit(state({ items: [item({ ...fields, at: WORN + slot })] }), wardrobe, plain);
      const art = wornArt(outfit, slot, draws);
      if (!art) {
        // Only a piece the forge draws nothing of for its slot has none: a Normal helm or gauntlets.
        assert.ok(slot === HEAD || slot === ARMS, `${body} ${JSON.stringify(fields)} has no large picture`);
        assert.deepEqual([outfit.armour, outfit.garments], [{}, []], `${body} ${JSON.stringify(fields)} wears nothing`);
        continue;
      }
      assert.ok(draws(art.layer), `${body} ${art.look} is dyed as ${art.layer}, a layer the body draws`);
      worn.add(art.look);
      const set = /^(head|torso|arms|legs)_(.+)$/.exec(art.look);
      if (set) {
        const [, name = '', own = ''] = set;
        for (const piece of NEEDED[name] ?? []) assert.ok(draws(`${piece}_${own}`), `${body} ${art.look}: ${piece}`);
      } else assert.ok(drawnLooks.has(art.look), `${body} wears ${art.look}, which armourart.py's spec has not`);
    }
    const unworn = [...drawnLooks].filter((look) => !worn.has(look));
    assert.deepEqual(unworn, [], `garment looks armourart.py draws that nothing wears on the ${body} body`);
  }
});

test("a worn look's large picture is its set's slot, else its garments joined in the order put on", () => {
  const draws = (layer: string) => !['formal_cloak', 'long_skirt'].includes(layer);
  const outfit = (fields: Partial<Outfit>): Outfit => ({ ...plain, ...fields });
  const steel = outfit({ armour: { cuirass: 'steel', pauldrons: 'steel', greaves: 'steel', boots: 'steel' } });
  assert.deepEqual(wornArt(steel, TORSO, draws), { look: 'torso_steel', layer: 'cuirass_steel' });
  assert.deepEqual(wornArt(steel, LEGS, draws), { look: 'legs_steel', layer: 'greaves_steel' });
  assert.deepEqual(wornArt(outfit({ armour: { helm: 'chain' } }), HEAD, draws), {
    look: 'head_chain',
    layer: 'helm_chain',
  });
  assert.deepEqual(wornArt(outfit({ armour: { gauntlets: 'ebony' } }), ARMS, draws), {
    look: 'arms_ebony',
    layer: 'gauntlets_ebony',
  });
  const clothes = outfit({ garments: ['shirt_long_round', 'short_tunic'] });
  assert.deepEqual(wornArt(clothes, TORSO, draws), { look: 'shirt_long_round+short_tunic', layer: 'shirt_long_round' });
  // A garment drawn only as its drape is dyed as its drape: a cloak, a skirt to the ankles.
  const cloak = outfit({ garments: ['formal_cloak'] });
  assert.deepEqual(wornArt(cloak, CLOAK, draws), { look: 'formal_cloak', layer: 'formal_cloak_drape' });
  const skirt = outfit({ garments: ['long_skirt', 'shoes'] });
  assert.deepEqual(wornArt(skirt, LEGS, draws), { look: 'long_skirt+shoes', layer: 'long_skirt_drape' });
  assert.equal(wornArt(outfit({}), HEAD, draws), null, 'nothing worn');
  assert.equal(wornArt(outfit({ right: 'sword_iron' }), 0, draws), null, 'a loadout is the weapons’ own');
  assert.equal(
    wornArt(cloak, CLOAK, () => false),
    null,
    'a garment the body draws nothing of',
  );
});
