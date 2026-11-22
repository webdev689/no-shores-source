import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captainAtSea, captainInFight, captainStands, handsShown, plainCrew } from './shipCrew.ts';

test('each hull carries its own hands, cut by the share of its men left, one at least while any are', () => {
  const whole = captainAtSea('a', 2, 2);
  assert.deepEqual(
    [0, 1, 2, 3].map((hull) => handsShown(hull, whole)),
    [3, 4, 5, 6],
  );
  assert.equal(handsShown(3, { ...whole, share: 0.5 }), 3);
  assert.equal(handsShown(3, { ...whole, share: 0.01 }), 1);
  assert.equal(handsShown(3, { ...whole, share: 0 }), 0);
  assert.equal(handsShown(0, { ...whole, share: 2 / 3 }), 2, 'two thirds of three are two');
  assert.equal(handsShown(0, { ...whole, share: 1 / 3 + 1e-15 }), 1, 'a hair of rounding over one hand is one');
  assert.equal(handsShown(0, { ...whole, share: Number.NaN }), 0, 'a share not known shows none');
});

test('struck, a ship keeps its hands and its captain leaves the wheel; going down or gone, no one is aboard', () => {
  const whole = plainCrew('b');
  assert.deepEqual([handsShown(0, whole), captainStands(whole)], [3, 'wheel']);
  const struck = { ...whole, state: 'struck' as const };
  assert.deepEqual([handsShown(0, struck), captainStands(struck)], [3, 'aside']);
  for (const state of ['sinking', 'sunk'] as const)
    assert.deepEqual([handsShown(0, { ...whole, state }), captainStands({ ...whole, state })], [0, null]);
});

test("in a fight a captain's people are its men left of its whole, its state and its sides run out", () => {
  const fought = captainInFight('fight-1', {
    faction: 1,
    rank: 3,
    crew: 9,
    max_crew: 18,
    state: 'afloat',
    run_out: ['starboard'],
  });
  assert.deepEqual(fought, { key: 'fight-1', faction: 1, rank: 3, share: 0.5, state: 'afloat', runOut: ['starboard'] });
  assert.equal(captainInFight('none', { ...fought, crew: 0, max_crew: 0, run_out: [] }).share, 0);
});
