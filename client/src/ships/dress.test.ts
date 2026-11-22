import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colourOf, DRESSES, factionSide, SHIP_SIDES } from './dress.ts';

test("a captain's faction gives its side: 0 a friendly ship fighting beside the players, any other a hostile one", () => {
  assert.deepEqual([1, 0, 2, 7].map(factionSide), ['tithe', 'friendly', 'tithe', 'tithe']);
  assert.deepEqual(SHIP_SIDES, ['player', 'friendly', 'tithe']);
});

test("each side's colours: the Tithe slate and bone under its emblem, a merchantman in Overlook's blue, a player's as painted", () => {
  assert.deepEqual(colourOf('#ff8000'), [1, 128 / 255, 0]);
  assert.equal(DRESSES.player.hull, null);
  assert.equal(DRESSES.friendly.hull, null, 'a merchantman in its natural timber');
  assert.deepEqual([DRESSES.tithe.emblem, DRESSES.friendly.emblem], [1, null], "the Tithe flies its faction's emblem");
});
