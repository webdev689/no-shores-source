import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { type Block, type Body, type Controls, TUNING, stepBody, standing } from './motor.ts';

const still: Controls = { forward: 0, sideways: 0, yaw: 0, run: false, jump: false, crouch: false, mounted: false };
const TICK = 1 / 60;

/** Runs the body for `seconds` with the same controls, `once` applied on the first tick only. */
function run(
  body: Body,
  controls: Partial<Controls>,
  seconds: number,
  blocks: Block[] = [],
  once: Partial<Controls> = {},
) {
  let now = body;
  for (let tick = 0; tick < Math.round(seconds / TICK); tick++)
    now = stepBody(now, { ...still, ...controls, ...(tick === 0 ? once : {}) }, blocks, TICK);
  return now;
}

const close = (actual: number, expected: number, within: number) =>
  assert.ok(Math.abs(actual - expected) < within, `${actual} is not within ${within} of ${expected}`);

test('the body walks, runs and crouches at DFO’s paces, forward being where it looks', () => {
  const walked = run(standing(0, 0), { forward: 1 }, 1);
  close(walked.y, -TUNING.walk, 0.01);
  close(walked.x, 0, 1e-9);
  close(run(standing(0, 0), { forward: 1, run: true }, 1).y, -TUNING.run, 0.01);
  const crouched = run(standing(0, 0), { forward: 1 }, 1, [], { crouch: true });
  assert.ok(crouched.crouched);
  close(crouched.y, -TUNING.crouch, 0.01);
  // Looking east, forward is east.
  close(run(standing(0, 0), { forward: 1, yaw: Math.PI / 2 }, 1).x, TUNING.walk, 0.01);
});

test('a jump rises about half a metre and lands again', () => {
  let body = stepBody(standing(0, 0), { ...still, jump: true }, [], TICK);
  assert.equal(body.mode, 'air');
  let highest = 0;
  for (let tick = 0; tick < 120 && body.mode === 'air'; tick++) {
    body = stepBody(body, still, [], TICK);
    highest = Math.max(highest, body.z);
  }
  close(highest, TUNING.jump ** 2 / (2 * TUNING.gravity), 0.03);
  assert.equal(body.mode, 'ground');
  assert.equal(body.z, 0);
});

test('the body steps up onto a block no higher than a step, and is stopped by a taller one', () => {
  const step: Block = { minX: -1, maxX: 1, minY: -10, maxY: -1, top: 0.4 };
  close(run(standing(0, 0), { forward: 1 }, 1, [step]).z, 0.4, 1e-9);
  const wall: Block = { ...step, top: 3 };
  const stopped = run(standing(0, 0), { forward: 1 }, 1, [wall]);
  close(stopped.y, -1 + TUNING.radius, 0.08);
});

test('jumping at a low thin wall vaults it; at a low deep one, mantles onto it', () => {
  const thin: Block = { minX: -2, maxX: 2, minY: -1.3, maxY: -1, top: 1 };
  let body = run(standing(0, 0), { forward: 1 }, 0.3, [thin]);
  body = run(body, { forward: 1 }, 1.5, [thin], { jump: true });
  assert.equal(body.mode, 'ground');
  assert.ok(body.y < -1.3, `${body.y} is past the wall`);
  assert.equal(body.z, 0);
  const deep: Block = { ...thin, minY: -4 };
  body = run(run(standing(0, 0), { forward: 1 }, 0.3, [deep]), {}, 1.5, [deep], { forward: 1, jump: true });
  assert.equal(body.z, 1);
});

test('a lip in reach from the ground is mantled straight over; a higher one is caught on the jump and hung from', () => {
  const crate: Block = { minX: -5, maxX: 5, minY: -4, maxY: -1, top: 1.7 };
  let body = run(standing(0, 0), { forward: 1 }, 0.3, [crate]);
  body = run(body, {}, 1.5, [crate], { forward: 1, jump: true });
  assert.equal(body.mode, 'ground');
  assert.equal(body.z, 1.7);
});

test('hanging from a lip: sideways shimmies, forward climbs over, crouch lets go', () => {
  const ledge: Block = { minX: -5, maxX: 5, minY: -4, maxY: -1, top: 2.3 };
  let body = run(standing(0, 0), { forward: 1 }, 0.3, [ledge]);
  body = stepBody(body, { ...still, forward: 1, jump: true }, [ledge], TICK);
  for (let tick = 0; tick < 60 && body.mode === 'air'; tick++)
    body = stepBody(body, { ...still, forward: 1 }, [ledge], TICK);
  assert.equal(body.mode, 'hang');
  close(body.z, 2.3 - TUNING.hang, 1e-9);
  const shimmied = run(body, { sideways: 1 }, 1, [ledge]);
  close(shimmied.x - body.x, TUNING.shimmy, 0.02);
  assert.equal(shimmied.mode, 'hang');
  const over = run(run(body, { forward: 1 }, 0.2, [ledge]), {}, 1, [ledge]);
  assert.equal(over.mode, 'ground');
  assert.equal(over.z, 2.3);
  const dropped = run(body, {}, 1, [ledge], { crouch: true });
  assert.equal(dropped.mode, 'ground');
  assert.equal(dropped.z, 0);
});

test('pressing into a wall too high to grab climbs it, to its lip and over', () => {
  const tower: Block = { minX: -5, maxX: 5, minY: -4, maxY: -1, top: 4 };
  let body = run(standing(0, 0), { forward: 1 }, 0.5, [tower]);
  assert.equal(body.mode, 'climb');
  body = run(run(body, { forward: 1 }, 2.6, [tower]), {}, 1.5, [tower]);
  assert.equal(body.mode, 'ground');
  assert.equal(body.z, 4);
});
