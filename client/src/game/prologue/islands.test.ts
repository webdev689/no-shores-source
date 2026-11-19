import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Landmass } from '../landmass.ts';
import { Islands, type IslandParts } from './islands.ts';

/** A landmass by its id alone, as far as the islands look at it. */
const land = (id: string) => ({ id, view: id }) as unknown as Landmass;

/** Islands over a worker that answers each opening when told, and writes down what it opened and what was drawn. */
function islands() {
  const opened: string[] = [];
  const drawn: string[] = [];
  const answers: { id: string; answer: () => void; fail: () => void }[] = [];
  const home = { landmass: land('saltmere'), drawers: { release: () => undefined } };
  const parts = {
    open: (id: string) => {
      opened.push(id);
      return new Promise<Landmass>((resolve, reject) =>
        answers.push({ id, answer: () => resolve(land(id)), fail: () => reject(new Error(`${id} would not open`)) }),
      );
    },
    scene: { setLand: (view: string) => void drawn.push(view) },
    drawersOn: () => ({ release: () => undefined }),
    terrainFor: () => undefined,
    home,
  } as unknown as IslandParts;
  return { islands: new Islands(parts), opened, drawn, answers };
}

const settle = async () => {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
};

test('the worker opens one continent at a time, in the order asked', async () => {
  const { islands: shown, opened, answers } = islands();
  void shown.open('highland');
  void shown.home();
  await settle();
  assert.deepEqual(opened, ['highland'], 'Saltmere waits for the highland to finish opening');
  answers[0]?.answer();
  await settle();
  assert.deepEqual(opened, ['highland', 'saltmere']);
});

test('once Saltmere is asked for, an island still opening is never drawn over it, and the worker ends on Saltmere', async () => {
  const { islands: shown, drawn, answers } = islands();
  void shown.open('highland');
  const late = shown.show();
  const homed = shown.home();
  await settle();
  answers[0]?.answer();
  await settle();
  answers[1]?.answer();
  await homed;
  assert.equal(await late, null, 'the island asked before Saltmere is not drawn');
  assert.equal(shown.landmass.id, 'saltmere');
  assert.deepEqual(drawn, []);
  assert.equal(answers.at(-1)?.id, 'saltmere');
});

test('an island that will not open leaves the worker free for the next, and Saltmere is opened again after it', async () => {
  const { islands: shown, opened, answers } = islands();
  const failing = shown.open('highland');
  failing.catch(() => undefined);
  await settle();
  answers[0]?.fail();
  await assert.rejects(failing);
  void shown.open('rain');
  await settle();
  answers[1]?.answer();
  assert.ok(await shown.show());
  assert.equal(shown.landmass.id, 'rain');
  const homed = shown.home();
  await settle();
  answers[2]?.answer();
  await homed;
  assert.deepEqual(opened, ['highland', 'rain', 'saltmere']);
  assert.equal(shown.landmass.id, 'saltmere');
});

test('a Saltmere the worker still holds is not opened again', async () => {
  const { islands: shown, opened } = islands();
  await shown.home();
  assert.deepEqual(opened, []);
});

test('Saltmere is drawn again even when the worker cannot open it, so no island stays drawn after the flight', async () => {
  const { islands: shown, drawn, answers } = islands();
  void shown.open('highland');
  await settle();
  answers[0]?.answer();
  await shown.show();
  assert.equal(shown.landmass.id, 'highland');
  const back = shown.home();
  await settle();
  answers[1]?.fail();
  await assert.rejects(back, /saltmere would not open/);
  assert.equal(shown.landmass.id, 'saltmere');
  assert.equal(drawn.at(-1), 'saltmere');
});
