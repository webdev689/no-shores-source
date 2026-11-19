import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HINTS, seaHints } from './hints.ts';

const SAILING = { fighting: null, landing: false, atHelm: false, walking: false, managing: false };

test('at sea the keys listed follow what the player is doing, a fight first', () => {
  assert.equal(seaHints(SAILING), HINTS.sea);
  assert.equal(seaHints({ ...SAILING, managing: true }), HINTS.manage);
  assert.equal(seaHints({ ...SAILING, walking: true }), HINTS.deck);
  assert.equal(seaHints({ ...SAILING, atHelm: true }), HINTS.map);
  assert.equal(seaHints({ ...SAILING, landing: true }), HINTS.landing);
  assert.deepEqual(seaHints({ ...SAILING, walking: true, fighting: ['Her hull: 200'] }), [
    'Her hull: 200',
    ...HINTS.fight,
  ]);
});

test("the sea lists the ship's two buttons, and her deck how to take the helm again", () => {
  assert.ok(HINTS.sea.some((line) => line.includes('B manage') && line.includes('H leave the helm')));
  assert.ok(HINTS.deck.some((line) => line.includes('E: take the helm')));
});

test('on foot the keys listed take in the fight: the weapon, the swing, the guard, the dodge and the Arts', () => {
  const keys = HINTS.foot.join(' · ');
  for (const key of ['Z weapon', 'Right button swing', 'Left button or F guard', 'V dodge', 'R Anima', 'Q G Tenets'])
    assert.ok(keys.includes(key), key);
});
