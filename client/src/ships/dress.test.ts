import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colourOf, DRESSES, factionSide } from './dress.ts';

test("a captain's faction gives its side: 1 the Grey Tithe, 2 the pirates, any other a friendly ship", () => {
  assert.deepEqual([1, 2, 0, 7].map(factionSide), ['tithe', 'pirate', 'friendly', 'friendly']);
});

test("each side's colours: the Tithe slate and bone, the pirates black and red, a player's as painted", () => {
  assert.deepEqual(colourOf('#ff8000'), [1, 128 / 255, 0]);
  assert.equal(DRESSES.player.hull, null);
  assert.equal(DRESSES.friendly.hull, null, 'a merchantman in its natural timber');
  assert.ok(DRESSES.pirate.hull && Math.max(...DRESSES.pirate.hull) < 0.15, 'a black hull');
  const [red = 0, green = 0] = DRESSES.pirate.stripe ?? [];
  assert.ok(red > 2 * green, 'a red stripe');
  assert.deepEqual([DRESSES.tithe.emblem, DRESSES.pirate.emblem], [1, 2], "each flies its faction's emblem");
});
