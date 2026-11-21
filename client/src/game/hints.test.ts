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

test("the sea shows the ship's two buttons, and its deck how to take the helm again", () => {
  assert.ok(words(HINTS.sea).includes('B Manage') && words(HINTS.sea).includes('H Leave the helm'));
  assert.ok(words(HINTS.deck).includes('E Take the helm at the wheel'));
});

test('sailing shows the zoom on the wheel, and landing a second click on a mark', () => {
  assert.ok(words(HINTS.sea).includes('Wheel Zoom'));
  assert.ok(words(HINTS.landing).includes('Click Choose a mark, again to land'));
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
  const bare = footHints(0).map(([key]) => key);
  assert.ok(!bare.includes('R') && !bare.includes('Q / G'), 'no Art worn, as in the prologue: none of its keys');
  assert.equal(footHints(0).length, HINTS.foot.length - 2, 'and every other key kept');
  assert.deepEqual(footHints(3), [...HINTS.foot, ['Hold Q', 'Aim Dusk Daggers']], 'Shadow');
});

test('no key hint puts a colon between its key and its action, nor "to" after the wheel', () => {
  for (const [key, said] of Object.values(HINTS).flat()) {
    assert.ok(!key.includes(':') && !said.includes(':'), `${key} ${said}`);
    assert.ok(!(key === 'Wheel' && said.startsWith('to')), `${key} ${said}`);
  }
});
