import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DROPPED } from '../network/gearMessages.ts';
import { KINDS } from '../player/gear.ts';
import { qaDrops } from './qaDrops.ts';

test('the pictures lay each kind of drop where the player faces, an item as itself', () => {
  const near = (got: readonly number[], want: readonly number[]) =>
    assert.ok(
      got.every((each, index) => Math.abs(each - (want[index] ?? NaN)) < 1e-9),
      `${got} is not ${want}`,
    );
  // Facing north (south is +y), its right east.
  const [crystal, box, sword, helm] = qaDrops(
    [
      { what: 'vestige', rarity: 3, ahead: 4 },
      { what: 'ammoBox', ahead: 4, aside: 2, flying: 10 },
      { what: 'sword', rarity: 2, ahead: 6 },
      { what: 'head', rarity: 4, ahead: 6, aside: -2 },
    ],
    [10, 20, 0],
    0,
  );
  assert.equal(crystal?.kind, DROPPED.vestige);
  assert.equal(crystal?.rarity, 3);
  near(crystal?.at ?? [], [10, 16, 0]);
  assert.deepEqual(crystal?.from, crystal?.at, 'told of at rest');
  assert.equal(box?.kind, DROPPED.ammoBox);
  near(box?.at ?? [], [12, 16, 0]);
  near(box?.from ?? [], [12, 16, 1.5]);
  assert.equal(box?.flying, 10);
  assert.equal(sword?.kind, DROPPED.item);
  assert.equal(sword?.item?.kind, KINDS.indexOf('sword'));
  assert.equal(sword?.item?.rarity, 2);
  assert.equal(sword?.item?.story, undefined, 'not a prologue item, which its end takes back');
  assert.equal(helm?.item?.kind, KINDS.indexOf('head'));
  assert.deepEqual([helm?.slot, helm?.item?.bucket, sword?.item?.bucket], [2, 2, 0], 'each in its own slot');
  near(helm?.at ?? [], [8, 14, 0]);
  assert.equal(new Set([crystal, box, sword, helm].map((drop) => drop?.id)).size, 4, 'each its own number');
  assert.throws(() => qaDrops([{ what: 'shoe', ahead: 1 }], [0, 0, 0], 0), /shoe/);
});
