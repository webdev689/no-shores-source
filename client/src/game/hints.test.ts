import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HINTS, footHints, seaHints } from './hints.ts';

const SAILING = { fighting: false, landing: false, atHelm: false, walking: false, managing: false };
const words = (hints: readonly (readonly [string, string])[]) => hints.map(([key, said]) => `${key} ${said}`);

test('at sea the keys shown follow what the player is doing, a fight first', () => {
  assert.equal(seaHints(SAILING), HINTS.sea);
  assert.equal(seaHints({ ...SAILING, managing: true }), HINTS.manage);
  assert.equal(seaHints({ ...SAILING, walking: true }), HINTS.deck);
  assert.equal(seaHints({ ...SAILING, atHelm: true }), HINTS.map);
  assert.equal(seaHints({ ...SAILING, landing: true }), HINTS.landing);
  assert.equal(seaHints({ ...SAILING, walking: true, fighting: true }), HINTS.fight);
});

test("the sea shows the ship's two buttons, and her deck how to take the helm again", () => {
  assert.ok(words(HINTS.sea).includes('B Manage') && words(HINTS.sea).includes('H Leave the helm'));
  assert.ok(words(HINTS.deck).includes('E Take the helm at her wheel'));
});

test('on foot the keys shown take in the fight: the weapon, the swing, the guard, the dodge and the Arts', () => {
  const shown = words(HINTS.foot);
  for (const key of ['Z Weapon', 'Right button Swing or aim', 'Left button / F Guard or fire', 'V Dodge'])
    assert.ok(shown.includes(key), key);
  for (const key of ['R Anima', 'Q / G Tenets']) assert.ok(shown.includes(key), key);
});

test('the keys name how to aim Dusk Daggers only while Shadow is worn', () => {
  assert.equal(footHints(1), HINTS.foot, 'Storm');
  assert.equal(footHints(2), HINTS.foot, 'Divine');
  assert.equal(footHints(0), HINTS.foot, 'no Art worn yet');
  assert.deepEqual(footHints(3), [...HINTS.foot, ['Hold Q', 'Aim Dusk Daggers']], 'Shadow');
});
