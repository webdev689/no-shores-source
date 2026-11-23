import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COSMETICS } from '../forge/cosmetics.ts';
import { item, state } from '../network/gearForTests.ts';
import { ASKS } from '../network/gearMessages.ts';
import { plainDress } from '../player/dressing.ts';
import { HORSE, MOUNT_SLOT, WORN, coatOfHorse, itemName, slotOf, wearAsks } from '../player/gear.ts';
import { mountAsked } from '../player/walker.ts';
import { appearanceRows, previewDress } from './appearance/appearanceModel.ts';
import { cardOf } from './gearCards.ts';
import { rowsOf } from './npc/npcWares.ts';

const numberOf = (id: string) => COSMETICS.findIndex((each) => each.id === id);
const chestnut = item({ id: 7, kind: HORSE, name: 1, bucket: MOUNT_SLOT });

test('a horse is an item named for its coat, worn in the Mount slot', () => {
  assert.equal(itemName(chestnut), 'Chestnut Horse');
  assert.equal(slotOf(HORSE), MOUNT_SLOT);
  assert.equal(coatOfHorse(chestnut), 'chestnut');
  assert.equal(coatOfHorse(item({ kind: 2, name: 1 })), null, 'a sword has no coat');
  assert.deepEqual(
    wearAsks(chestnut).map((each) => each.ask),
    [{ kind: ASKS.wear, item: 7, slot: MOUNT_SLOT }],
  );
});

test("a horse's card names it and its kind, says its coat's words, and shows no level", () => {
  const card = cardOf(chestnut);
  assert.equal(card.name, 'Chestnut Horse');
  assert.equal(card.kind, 'Normal Horse');
  assert.deepEqual(card.rows, []);
  assert.equal(card.words, COSMETICS[numberOf('chestnut')]?.words);
});

test('the Tack sells horses as items to the pack, one of each coat, and bardings', () => {
  const sold = [numberOf('dun'), numberOf('dawnfire')];
  const [row] = rowsOf('tack', state({ aurem: 9_000, level: 20, cosmeticsSold: sold }));
  const [horse, barding] = row?.wares ?? [];
  assert.equal(horse?.name, 'Dun Horse');
  assert.equal(horse?.about, 'Normal Horse');
  assert.equal(horse?.picture.kind, 'item');
  assert.deepEqual(horse?.ask, { kind: ASKS.buyCosmetic, item: numberOf('dun') });
  assert.equal(horse?.price?.amount, COSMETICS[numberOf('dun')]?.source.aurem);
  assert.equal(barding?.name, 'Dawnfire');
  const dun = item({ id: 3, kind: HORSE, name: 2, bucket: MOUNT_SLOT });
  const [owned] = rowsOf('tack', state({ aurem: 9_000, level: 20, cosmeticsSold: sold, items: [dun] }));
  assert.equal(owned?.wares[0]?.note, 'Kept', 'a horse held is kept');
  assert.equal(owned?.wares[0]?.ask, null);
});

test('the Appearance screen keeps the emblem and the dye alone; a horse is worn in the Mount slot', () => {
  const rows = appearanceRows(state({}));
  assert.deepEqual(
    rows.map((row) => row.heading),
    ['Emblem', 'Dye'],
  );
  const dress = plainDress('human', 0.3);
  const dye = rows[1]?.tiles.find((tile) => tile.id === 'coral') ?? null;
  assert.equal(previewDress(dress, dye).outfit.dye, 'coral');
});

test('the mount key mounts only with a horse worn; without one it does nothing and is told once a press', () => {
  const pressed = { pressed: (action: string) => action === 'mount' };
  const none = mountAsked(pressed, false, false);
  assert.equal(none.refused, true);
  assert.equal(none.controls.pressed('mount'), false, 'the press is dropped');
  const horse = mountAsked(pressed, false, true);
  assert.equal(horse.refused, false);
  assert.equal(horse.controls.pressed('mount'), true);
  assert.equal(mountAsked(pressed, true, false).refused, false, 'a rider gets down whatever is worn');
  assert.equal(mountAsked({ pressed: () => false }, false, false).refused, false, 'no press, no word');
  assert.equal(WORN + MOUNT_SLOT, 13, 'worn in the Mount slot on the wire');
});
