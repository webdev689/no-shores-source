import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Charting, WARM_REACH_M } from './charting.ts';

const continents = [
  {
    id: 'home',
    outline: [
      [0, 0],
      [100_000, 0],
      [100_000, 100_000],
      [0, 100_000],
    ] as [number, number][],
  },
  {
    id: 'far',
    outline: [
      [300_000, 0],
      [400_000, 0],
      [400_000, 100_000],
      [300_000, 100_000],
    ] as [number, number][],
  },
];
const nearFar: [number, number] = [260_000, 50_000];

test('a nearer continent is opened once a second while sailing, one at a time, and handed on once open', async () => {
  const asked: string[] = [];
  const handed: string[] = [];
  let finish = (_id: string) => {};
  const charting = new Charting(
    continents,
    (id) => {
      asked.push(id);
      return new Promise<string>((resolve) => (finish = resolve));
    },
    (opened) => handed.push(opened),
  );
  charting.tick(nearFar, 'home', 0.5, true);
  assert.deepEqual(asked, [], 'not before a second has passed');
  charting.tick(nearFar, 'home', 0.6, false);
  assert.deepEqual(asked, [], 'not while the ship does not sail');
  charting.tick(nearFar, 'home', 0.1, true);
  assert.deepEqual(asked, ['far']);
  assert.ok(charting.busy);
  charting.tick(nearFar, 'home', 5, true);
  assert.deepEqual(asked, ['far'], 'one at a time');
  finish('far');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(handed, ['far']);
  assert.ok(!charting.busy);
});

test('a continent that will not open is not tried again', async () => {
  let tries = 0;
  const charting = new Charting(
    continents,
    () => {
      tries += 1;
      return Promise.reject(new Error('no'));
    },
    () => assert.fail('nothing opened'),
  );
  const quiet = console.error;
  console.error = () => {};
  try {
    charting.tick(nearFar, 'home', 1, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    charting.tick(nearFar, 'home', 1, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    console.error = quiet;
  }
  assert.equal(tries, 1);
});

test("a continent is warmed once as the ship comes within twice its opening's reach, before it is opened", () => {
  const warmed: string[] = [];
  const opened: string[] = [];
  const charting = new Charting(
    continents,
    (id) => (opened.push(id), new Promise<string>(() => undefined)),
    () => undefined,
    (id) => warmed.push(id),
  );
  // South of the far continent, where its coast is the nearest.
  const off = (metres: number): [number, number] => [350_000, -metres];
  charting.tick(off(WARM_REACH_M + 1000), 'home', 1, true);
  assert.deepEqual(warmed, [], 'not yet near enough');
  charting.tick(off(WARM_REACH_M - 1000), 'home', 1, true);
  charting.tick(off(WARM_REACH_M - 2000), 'home', 1, true);
  assert.deepEqual([warmed, opened], [['far'], []], 'warmed once, not yet opened');
  charting.tick(off(40_000), 'home', 1, true);
  assert.deepEqual(opened, ['far']);
});
