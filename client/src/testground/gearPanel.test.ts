import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ammoLine, heldLine } from './gearPanel.ts';

test('the gear panel says Aurem, the one currency, then only the stacks held, as the inventory shows them', () => {
  const resources = [0, 3, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(
    heldLine({ aurem: 1200, stocks: [4, 0, 6, 0, 2], resources }),
    '1,200 Aurem · Weapon Fragments 4 · Weapon Essence 6 · Fruit of Dagon 2 · Cairn Iron 3',
  );
  assert.equal(heldLine({ aurem: 0, stocks: [0, 0, 0, 0, 0], resources: [] }), '0 Aurem', 'nothing held');
});

test('the gear panel shows a grant of ammunition with no Ranged weapon worn, as the share kept for one', () => {
  assert.equal(ammoLine({ ammo: 12, ammoMost: 30, ammoShare: 0.4, crates: 2 }), 'Ammo 12 of 30 · 2 Ammo crates');
  assert.equal(
    ammoLine({ ammo: 0, ammoMost: 0, ammoShare: 1, crates: 0 }),
    'No Ranged weapon worn: its ammo at 100% · 0 Ammo crates',
  );
  assert.equal(
    ammoLine({ ammo: 0, ammoMost: 0, ammoShare: 0, crates: 5 }),
    'No Ranged weapon worn: its ammo at 0% · 5 Ammo crates',
  );
});
