import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadoutKinds } from './dressPanel.ts';

test('the player’s hands pick among the loadouts their gear can wear: every Melee kind, then every Ranged one', () => {
  const names = (slot: number) => loadoutKinds(slot).map(([, name]) => name);
  assert.deepEqual(names(1), ['Bow', 'Crossbow', 'Pistolet', 'Thunderlock', 'Double Pistolet']);
  assert.ok(names(0).includes('Sword & Shield') && names(0).includes('Greatsword'), 'the Melee kinds');
  assert.ok(!names(0).some((name) => ['Head', 'Torso', 'Arms', 'Legs', 'Cloak', 'Bow'].includes(name)), 'no armour');
  assert.equal(names(0).length, 13, 'the thirteen Melee kinds');
});
