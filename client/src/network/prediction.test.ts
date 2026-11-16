import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { type Body, type Controls, floatsOf, startMovementRules } from '../rules/movementRules.ts';
import { Prediction } from './prediction.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/movement_wasm.wasm', import.meta.url);
const moduleBytes = await readFile(MODULE).catch(() => {
  throw new Error('movement_wasm.wasm is not built: run `npm run wasm` first');
});
const rules = await startMovementRules(moduleBytes);
rules.setCourse([{ minX: -5, minY: -4, maxX: 5, maxY: -1, top: 2.3 }]);
const step = (body: Body, controls: Controls) => rules.step(body, controls);
const still: Controls = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
const script: Controls[] = Array.from({ length: 40 }, (unused, tick) => ({
  ...still,
  forward: 1,
  yaw: 0.2,
  jump: tick === 12,
}));

/** The room's word after each input: the bodies the same rules step, from where the player stood. */
function predictedRun(prediction: Prediction, from: Body, stepWith: typeof step): Body[] {
  const bodies = [from];
  for (const controls of script) {
    prediction.next(controls);
    bodies.push(stepWith(bodies[bodies.length - 1] ?? from, controls));
  }
  return bodies;
}

test('while the room agrees, its word corrected by the inputs it has not taken is the predicted body, to the bit', () => {
  const prediction = new Prediction();
  const roomSaw = predictedRun(prediction, rules.standing(0, 2), step);
  // The room has taken the first 25 inputs; 15 are still on their way.
  const predicted = roomSaw[roomSaw.length - 1];
  const corrected = prediction.corrected(roomSaw[25] ?? rules.standing(0, 2), 25, step);
  assert.deepEqual(floatsOf(corrected), predicted && floatsOf(predicted));
  assert.equal(prediction.waitingCount, 15);
});

test('on a window of the land, the room’s word and the prediction still agree to the bit', async () => {
  const onLand = await startMovementRules(moduleBytes);
  const grid = (value: number) => ({
    width: 2,
    height: 2,
    left_m: -1000,
    top_m: -1000,
    cell_m: 1000,
    first_column: 0,
    first_row: 0,
    data: [value, value, value, value],
  });
  const window = { land: grid(10), lake_level: [0, 0, 0, 0], rivers: [], roads: [], towns: [], coast: grid(5000) };
  const ground = { ...window, across: grid(-50), pads: [{ bounds: [-10, -10, 10, 10], level: 12 }], seed: 7 };
  assert.equal(onLand.setGround(JSON.stringify(ground)), true);
  const prediction = new Prediction();
  const roomSaw = predictedRun(prediction, onLand.standing(0, -9), (body, controls) => onLand.step(body, controls));
  assert.equal(roomSaw[0]?.z, 12, 'standing on the terrace');
  const last = roomSaw[roomSaw.length - 1];
  assert.ok(last && last.y < -10, 'walked off the terrace onto the land');
  const corrected = prediction.corrected(roomSaw[10] ?? onLand.standing(0, -9), 10, (body, controls) =>
    onLand.step(body, controls),
  );
  assert.deepEqual(floatsOf(corrected), last && floatsOf(last));
});

test('a body the room says is still, as a dead one is, stays where the room saw it', () => {
  const prediction = new Prediction();
  for (const controls of script.slice(0, 5)) prediction.next(controls);
  const dead = rules.standing(3, 3);
  assert.deepEqual(floatsOf(prediction.corrected(dead, 2, step, true)), floatsOf(dead));
  assert.equal(prediction.waitingCount, 3);
});

test('where the room knows better, the body moves to the room’s word with the waiting inputs on top', () => {
  const prediction = new Prediction();
  for (const controls of script.slice(0, 5)) prediction.next(controls);
  const elsewhere = rules.standing(3, 3);
  const corrected = prediction.corrected(elsewhere, 2, step);
  const expected = script.slice(2, 5).reduce(step, elsewhere);
  assert.deepEqual(floatsOf(corrected), floatsOf(expected));
});

test('inputs are numbered 1, 2, 3 and so on', () => {
  const prediction = new Prediction();
  assert.deepEqual([prediction.next(still), prediction.next(still), prediction.next(still)], [1, 2, 3]);
});
