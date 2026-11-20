import assert from 'node:assert/strict';
import { test } from 'node:test';
import { feelOf, navalEventOf } from './seaFight.ts';

const read = (numbers: number[]) => {
  let index = 0;
  return () => numbers[index++] ?? 0;
};

test('the sea’s own events reach the fight’s feel by its kinds; a ball’s splash and hit go with its shot’s', () => {
  const sail = navalEventOf(13, read([40, 1, 2]));
  assert.deepEqual(sail && feelOf(sail), { kind: 'sail-lost', ship: 1, sail: 2 });
  const flotsam = navalEventOf(17, read([40, 9, 5, 6, 2]));
  assert.deepEqual(flotsam && feelOf(flotsam), { kind: 'flotsam', id: 9, at: [5, 6], item: 'chest' });
  const hit = navalEventOf(12, read([40, 1, 4, -1, 2, 1]));
  assert.deepEqual(hit, { kind: 'Hit', tick: 40, ship: 1, at: [4, -1, 2], part: 'sail' });
  assert.equal(hit && feelOf(hit), null);
  assert.equal(navalEventOf(99, read([])), null);
});
