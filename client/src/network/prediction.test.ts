import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type Body, type Controls, floatsOf, startMovementRules } from '../rules/movementRules.ts';
import { Prediction } from './prediction.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/movement_wasm.wasm', import.meta.url);
const rules = await startMovementRules(
  await readFile(MODULE).catch(() => {
    throw new Error('movement_wasm.wasm is not built: run `npm run wasm` first');
  }),
);
rules.setCourse([{ minX: -5, minY: -4, maxX: 5, maxY: -1, top: 2.3 }]);
const step = (body: Body, controls: Controls) => rules.step(body, controls);
const still: Controls = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
const script: Controls[] = Array.from({ length: 40 }, (unused, tick) => ({
  ...still,
  forward: 1,
  yaw: 0.2,
  jump: tick === 12,
}));

test('while the room agrees, its word corrected by the inputs it has not taken is the predicted body, to the bit', () => {
  const prediction = new Prediction<Controls>();
  let predicted = rules.standing(0, 2);
  const roomSaw: Body[] = [predicted];
  for (const controls of script) {
    prediction.next(controls);
    predicted = step(predicted, controls);
    roomSaw.push(predicted);
  }
  // The room has taken the first 25 inputs; 15 are still on their way.
  const corrected = prediction.corrected(roomSaw[25] ?? predicted, 25, step);
  assert.deepEqual(floatsOf(corrected), floatsOf(predicted));
  assert.equal(prediction.waitingCount, 15);
});

test('where the room knows better, the body moves to the room’s word with the waiting inputs on top', () => {
  const prediction = new Prediction<Controls>();
  for (const controls of script.slice(0, 5)) prediction.next(controls);
  const elsewhere = rules.standing(3, 3);
  const corrected = prediction.corrected(elsewhere, 2, step);
  const expected = script.slice(2, 5).reduce(step, elsewhere);
  assert.deepEqual(floatsOf(corrected), floatsOf(expected));
});

test('inputs are numbered 1, 2, 3 and so on', () => {
  const prediction = new Prediction<Controls>();
  assert.deepEqual([prediction.next(still), prediction.next(still), prediction.next(still)], [1, 2, 3]);
});
