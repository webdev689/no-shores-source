import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainDress } from '../player/dressing.ts';
import { loadoutKinds, withLight } from './dressPanel.ts';

test('the player’s hands pick among the loadouts their gear can wear: every Melee kind, then every Ranged one', () => {
  const names = (slot: number) => loadoutKinds(slot).map(([, name]) => name);
  assert.deepEqual(names(1), ['Bow', 'Crossbow', 'Pistolet', 'Thunderlock', 'Double Pistolet']);
  assert.ok(names(0).includes('Sword & Shield') && names(0).includes('Greatsword'), 'the Melee kinds');
  assert.ok(!names(0).some((name) => ['Head', 'Torso', 'Arms', 'Legs', 'Cloak', 'Bow'].includes(name)), 'no armour');
  assert.equal(names(0).length, 13, 'the thirteen Melee kinds');
});

test('the player’s left carries their light only where the room lets the hands hold it, else what the loadout holds', () => {
  const ARMS = ['sword_iron torch_l', 'sword_iron shield_kite_iron'];
  const armsCode = (right: string | null, left: string) => ARMS.indexOf(`${right} ${left}`);
  const sword = { ...plainDress('human', 0).outfit, right: 'sword_iron', left: null };
  const shielded = { ...sword, left: 'shield_kite_iron' };
  assert.equal(withLight(sword, 'torch_l', [0], armsCode).left, 'torch_l', 'beside a sword the room takes a torch');
  assert.equal(withLight(shielded, 'torch_l', [1], armsCode), shielded, 'the shield kept where a torch is not taken');
  assert.equal(withLight(sword, 'torch_l', undefined, armsCode), sword, 'none before the room says what it takes');
  assert.equal(withLight(sword, null, [0], armsCode), sword);
});
