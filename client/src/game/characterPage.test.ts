import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../network/gearMessages.ts';
import { wordsIn } from '../ui/uiForTests.ts';
import { ammoLine, piecesNode } from './characterPage.ts';
import { sampleGear } from './gearShots.ts';

const gear = (fields: Partial<GearState>) => fields as GearState;

test('under the Ranged slot, the shots left of its capacity, or "No ammo" in the loss colour; none with none worn', () => {
  assert.deepEqual(ammoLine(gear({ ammo: 18, ammoMost: 24 })), { words: 'Ammo 18 of 24', none: false });
  assert.deepEqual(ammoLine(gear({ ammo: 0, ammoMost: 60 })), { words: 'No ammo', none: true });
  assert.equal(ammoLine(gear({ ammo: 0, ammoMost: 0 })), null);
});

test("under Prestige, each armour piece's share where they make it up; else only that it is the armour's", () => {
  const given = [22, 25, 20, 17];
  const items = sampleGear().items.map((each) =>
    each.at >= 4 && each.at <= 7 ? { ...each, prestige: given[each.at - 4] ?? 0 } : each,
  );
  const worn = { ...sampleGear(), items };
  assert.deepEqual(wordsIn(piecesNode(worn, 84)), ['HEAD', '22', 'TORSO', '25', 'ARMS', '20', 'LEGS', '17']);
  assert.deepEqual(wordsIn(piecesNode(worn, 90)), ['FROM THE ARMOUR WORN'], "another player's whole alone");
  assert.deepEqual(wordsIn(piecesNode(gear({ items: [] }), 0)), ['FROM THE ARMOUR WORN']);
});
