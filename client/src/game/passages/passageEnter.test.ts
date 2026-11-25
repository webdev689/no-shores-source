import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RoomLink } from '../../network/roomConnection.ts';
import { joinPassage } from './passageEnter.ts';

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
