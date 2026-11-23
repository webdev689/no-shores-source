import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type FoeType, rankChoices } from './roster.ts';

test("a type's ranks are offered plainest first by rank, whatever order the roster lists them in", () => {
  // The Tithe-Mate's: an Elite first in the roster (its rank when none is asked for), a Miniboss, and a Major.
  const mate: FoeType = {
    type: 4,
    name: 'Tithe-Mate',
    faction: 1,
    factionName: 'The Grey Tithe',
    domain: 'deck',
    role: 3,
    ranks: [3, 4, 2],
    right: null,
    left: null,
  };
  assert.deepEqual(rankChoices(mate), [
    ['2', 'Major'],
    ['3', 'Elite'],
    ['4', 'Miniboss'],
  ]);
  assert.deepEqual(mate.ranks, [3, 4, 2], "the roster's own list is left as it was");
});
