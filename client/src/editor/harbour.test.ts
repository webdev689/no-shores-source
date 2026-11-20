import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Harbour } from './harbour.ts';
import type { Sailing, SailSource } from './sailing.ts';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function door(aground: boolean): { source: SailSource; asked: number[] } {
  const asked: number[] = [];
  return {
    asked,
    source: {
      sail: async (_id, ship, _helm, _time, ticks) => {
        asked.push(ticks);
        return { ship, pose: { heave: 0, pitch: 0, roll: 0, aground } };
      },
    },
  };
}

test('a model that fails to load is fetched once, and again only once it is brought in', async () => {
  let fetched = 0;
  const failures: unknown[] = [];
  const harbour = new Harbour<string>(
    () => {
      fetched++;
      return Promise.reject(new Error('no model'));
    },
    (error) => failures.push(error),
  );
  const { source } = door(false);
  for (let frame = 0; frame < 5; frame++) {
    harbour.board(source, 'square', 0, 0, 0, 0);
    await settle();
  }
  assert.equal(fetched, 1);
  assert.equal(failures.length, 1);
  harbour.leave();
  harbour.board(source, 'square', 0, 0, 0, 0);
  await settle();
  assert.equal(fetched, 2);
});

test('a refused putting to sea is asked once and says why once; brought in, it may be asked again', async () => {
  const failures: unknown[] = [];
  const harbour = new Harbour<string>(
    async () => 'model',
    (error) => failures.push(error),
  );
  const { source, asked } = door(true);
  let afloat = true;
  for (let frame = 0; frame < 5; frame++) {
    afloat = harbour.board(source, 'square', 0, 0, 0, 0);
    await settle();
  }
  assert.deepEqual(asked, [0]);
  assert.equal(failures.length, 1);
  assert.equal(afloat, false, 'the editor turns Sail off');
  assert.equal(harbour.sailing, null);
  harbour.leave();
  harbour.board(source, 'square', 0, 0, 0, 0);
  assert.deepEqual(asked, [0, 0]);
});

test('put to sea, it sails with its model until it is brought in', async () => {
  const harbour = new Harbour<string>(
    async () => 'model',
    () => undefined,
  );
  const { source } = door(false);
  harbour.board(source, 'square', 0, 0, 0, 0);
  await settle();
  assert.ok(harbour.sailing);
  assert.equal(harbour.view, 'model');
  harbour.leave();
  assert.equal(harbour.sailing, null);
  assert.equal(harbour.view, 'model', 'its model is kept for the next time');
});

test('an answer for a Sail since brought in is not taken by the next one', async () => {
  const held: { x: number; resolve: () => void }[] = [];
  const failures: unknown[] = [];
  const source: SailSource = {
    sail: (_id, ship, _helm, _time, _ticks) =>
      new Promise((resolve) =>
        held.push({
          x: ship[0] ?? 0,
          // The first spot is on land: its answer, were it taken, would refuse the second Sail.
          resolve: () => resolve({ ship, pose: { heave: 0, pitch: 0, roll: 0, aground: (ship[0] ?? 0) === 1000 } }),
        }),
      ),
  };
  const harbour = new Harbour<string>(
    async () => 'model',
    (error) => failures.push(error),
  );
  harbour.board(source, 'square', 1000, 0, 0, 0);
  harbour.leave();
  assert.equal(harbour.board(source, 'square', 5000, 0, 0, 0), true);
  for (const answer of held) answer.resolve();
  await settle();
  assert.equal(failures.length, 0, 'the first answer is dropped');
  assert.equal(harbour.sailing?.place({ leftM: 0, topM: 0 } as Parameters<Sailing['place']>[0], 1).x, 5000);
});
