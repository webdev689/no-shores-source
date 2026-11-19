import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heldLine } from './gearPanel.ts';

test('the gear panel says Aurem, the one currency, then only the stacks held, as the inventory shows them', () => {
  const resources = [0, 3, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(
    heldLine({ aurem: 1200, stocks: [4, 0, 6, 0, 2], resources }),
    '1,200 Aurem · Weapon Fragments 4 · Weapon Essence 6 · Fruit of Dagon 2 · Cairn Iron 3',
  );
  assert.equal(heldLine({ aurem: 0, stocks: [0, 0, 0, 0, 0], resources: [] }), '0 Aurem', 'nothing held');
});
