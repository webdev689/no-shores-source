import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point2 } from './ground.ts';
import {
  alongNear,
  CLICK_PACE,
  clampPace,
  PACE_STEPS,
  PLANNED_PACE,
  pointAlong,
  sailSpeed,
  secondsLeft,
  SHIP_SPEED,
  shipAt,
  TURN_CHORD_M,
  voyageOf,
} from './voyage.ts';

function close(actual: number, expected: number, tolerance: number, what: string) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} is not within ${tolerance} of ${expected}`);
}
const origin: Point2 = [4_000_000, 2_000_000];
/** 10 km north, then 5 km east. */
const route: Point2[] = [origin, [origin[0], origin[1] - 10_000], [origin[0] + 5_000, origin[1] - 10_000]];

test('a voyage sails at ×60 set by a click and ×200 planned on the map, on the sea room’s ladder of a 12 m/s ship', () => {
  assert.deepEqual([...PACE_STEPS], [5, 10, 20, 30, 40, 60, 100, 200]);
  assert.equal(SHIP_SPEED, 12);
  assert.deepEqual([CLICK_PACE, PLANNED_PACE], [60, 200]);
  assert.equal(sailSpeed(CLICK_PACE), 720);
  assert.equal(sailSpeed(PLANNED_PACE), 2_400);
  assert.equal(clampPace(55), 40, 'rounded down onto the ladder');
  assert.equal(clampPace(1_000), 200);
  assert.equal(clampPace(1), 5, 'never under the bottom step');
  assert.equal(clampPace(Number.NaN), 5);
  assert.equal(sailSpeed(55), 480);
});

test('a voyage measures its route, and a point along it is held to its ends', () => {
  const voyage = voyageOf(route);
  assert.equal(voyage.lengthM, 15_000);
  assert.deepEqual(pointAlong(voyage, 4_000), [origin[0], origin[1] - 4_000]);
  assert.deepEqual(pointAlong(voyage, 12_000), [origin[0] + 2_000, origin[1] - 10_000]);
  assert.deepEqual(pointAlong(voyage, -50), origin);
  assert.deepEqual(pointAlong(voyage, 99_000), route[2]);
});

test('a ship sails its route at its pace, heading along it, and arrives at its end', () => {
  const voyage = voyageOf(route);
  const north = shipAt(voyage, 5 * sailSpeed(60));
  assert.deepEqual(north.position, [origin[0], origin[1] - 3_600]);
  close(north.heading ?? -1, 0, 1e-12, 'heading north');
  assert.equal(north.travelledM, 3_600);
  assert.equal(north.remainingM, 11_400);
  assert.equal(north.arrived, false);
  const east = shipAt(voyage, north.travelledM + 10 * sailSpeed(100));
  close(east.heading ?? -1, Math.PI / 2, 1e-12, 'heading east');
  assert.equal(east.arrived, true, '15.6 km sailed: past the end');
  assert.deepEqual(east.position, route[2]);
  assert.equal(east.remainingM, 0);
  assert.equal(secondsLeft(voyage, 3_600, 60), 11_400 / 720);
});

test('the heading swings through a corner over the turn chord instead of snapping at it', () => {
  const voyage = voyageOf(route);
  close(shipAt(voyage, 10_000).heading ?? -1, Math.PI / 4, 1e-12, 'half turned at the corner');
  close(shipAt(voyage, 10_000 - TURN_CHORD_M).heading ?? -1, 0, 1e-12, 'straight before the chord');
  close(shipAt(voyage, 10_000 + TURN_CHORD_M).heading ?? -1, Math.PI / 2, 1e-12, 'straight after it');
  let previous = 0;
  for (let along = 9_800; along <= 10_200; along += 10) {
    const heading = shipAt(voyage, along).heading ?? 0;
    assert.ok(heading >= previous - 1e-12 && heading - previous < 0.1, `a steady swing at ${along} m`);
    previous = heading;
  }
});

test('a voyage with no length has arrived and has no heading of its own', () => {
  for (const points of [[origin], [origin, origin], []]) {
    const fix = shipAt(voyageOf(points), 0);
    assert.equal(fix.arrived, true);
    assert.equal(fix.heading, null);
  }
});

test('a point is found along the voyage where the nearest leg passes it, looking only near where asked', () => {
  const voyage = voyageOf([
    [0, 0],
    [0, -1_000],
    [1_000, -1_000],
  ]);
  assert.equal(alongNear(voyage, [5, -500], 400, 3_000), 500);
  assert.equal(alongNear(voyage, [600, -990], 1_500, 3_000), 1_600, 'on the second leg');
  assert.equal(alongNear(voyage, [600, -990], 100, 200), 990, 'only the legs near where it looks: the first');
  assert.equal(alongNear(voyageOf([]), [0, 0], 0, 100), null);
});
