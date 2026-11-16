import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Body, bodyStep, EYE_M, type Effort, FLOAT_M, type Footing } from './swimming.ts';

const still: Effort = { east: 0, south: 0, dive: false, rise: false };
/** A beach: dry west of x 0, the bed falling 1 m every 10 m east of it, the sea's surface at `surface`. */
const beach =
  (surface = 0) =>
  (x: number): Footing =>
    x < 0 ? { bed: -x * 0.1, surface: null } : { bed: -x * 0.1, surface };

/** Steps a body `count` times of a tenth of a second. */
function run(body: Body, effort: Effort, footing: (x: number, y: number) => Footing, count: number): Body {
  let now = body;
  for (let step = 0; step < count; step++) now = bodyStep(now, effort, footing, 0.1);
  return now;
}

test('on dry ground the eyes stand above the feet', () => {
  const body = bodyStep({ x: -20, y: 0, eye: 0, stroke: 'walk' }, still, beach(), 0.1);
  assert.deepEqual([body.stroke, body.eye], ['walk', 2 + EYE_M]);
});

test('walking into the sea, a walker wades, then swims with their eyes on the surface', () => {
  const forward: Effort = { ...still, east: 1 };
  let body: Body = { x: -2, y: 0, eye: 0.2 + EYE_M, stroke: 'walk' };
  const strokes = new Set<string>();
  for (let step = 0; step < 60; step++) {
    body = bodyStep(body, forward, beach(), 0.1);
    strokes.add(body.stroke);
  }
  assert.deepEqual([...strokes], ['walk', 'wade', 'swim']);
  assert.ok(Math.abs(body.eye - FLOAT_M) < 0.01, `${body.eye}`);
  const wading = run({ x: 6, y: 0, eye: 0, stroke: 'wade' }, forward, beach(), 1);
  const walking = run({ x: -30, y: 0, eye: 0, stroke: 'walk' }, forward, beach(), 1);
  assert.ok(wading.x - 6 < walking.x + 30, 'water slows a wader');
});

test('a floating swimmer rides a wave up and down', () => {
  const body: Body = { x: 50, y: 0, eye: FLOAT_M, stroke: 'swim' };
  const risen = run(body, still, beach(0.8), 10);
  assert.ok(Math.abs(risen.eye - (0.8 + FLOAT_M)) < 0.01, `${risen.eye}`);
});

test('holding dive takes a swimmer under and stops them above the bed; let go, they drift back up', () => {
  const dived = run({ x: 50, y: 0, eye: FLOAT_M, stroke: 'swim' }, { ...still, dive: true }, beach(), 100);
  assert.equal(dived.stroke, 'dive');
  assert.ok(Math.abs(dived.eye - -4.5) < 1e-9, `${dived.eye}`);
  const drifting = run(dived, still, beach(), 20);
  assert.ok(drifting.eye > dived.eye && drifting.eye < FLOAT_M, `${drifting.eye}`);
  const rising = run(dived, { ...still, rise: true }, beach(), 20);
  assert.ok(rising.eye > drifting.eye, 'rise is faster than drifting');
  const surfaced = run(dived, still, beach(), 200);
  assert.deepEqual([surfaced.stroke, Math.abs(surfaced.eye - FLOAT_M) < 0.01], ['swim', true]);
});
