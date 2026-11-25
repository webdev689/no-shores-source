import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RoomLink } from '../../network/roomConnection.ts';
import type { PassagePlan } from '../../rules/passageRules.ts';
import { hollowBoxes, joinPassage } from './passageEnter.ts';

/** A join that finds the first `full` copies full, recording each name joined and each link closed. */
function joins(full: number) {
  const [joined, closed] = [[] as string[], [] as string[]];
  const join = (name: string) => {
    joined.push(name);
    const link = { close: () => closed.push(name) } as unknown as RoomLink;
    return Promise.resolve({ link, full: joined.length <= full });
  };
  return { join, joined, closed };
}

test('a public zone full joins its next copy, letting go of the one that turned the player away', async () => {
  const { join, joined, closed } = joins(2);
  await joinPassage('passage-continent-1-w9-z3', join);
  assert.deepEqual(joined, [
    'passage-continent-1-w9-z3',
    'passage-continent-1-w9-z3--2',
    'passage-continent-1-w9-z3--3',
  ]);
  assert.deepEqual(closed, joined.slice(0, 2));
});

test('a company’s route is its own room alone: full, it is not copied, and every copy full says so', async () => {
  const route = joins(1);
  await assert.rejects(joinPassage('passage-continent-1-w9-z3--run-a1b2c3d4', route.join), /This passage is full/);
  assert.equal(route.joined.length, 1);
  await assert.rejects(joinPassage('passage-continent-1-w9-z3', joins(99).join), /This passage is full/);
});

test('a hollow’s foot boxes hold its dressing (cliffs, boulders, trees) as well as its pieces', () => {
  const plan = {
    ground: { kind: 'open', placements: [], blocks: [[0, 0, 4, 4, 9]], ring: [] },
    solids: [[10, 10, 11, 11, 2]],
  } as unknown as PassagePlan;
  assert.deepEqual(
    hollowBoxes(plan).map((box) => [box.minX, box.top, box.bottom]),
    [
      [0, 9, -100],
      [10, 2, -100],
    ],
  );
  assert.deepEqual(hollowBoxes({ ground: { kind: 'under' }, solids: [] } as unknown as PassagePlan), []);
});
