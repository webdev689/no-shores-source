import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArrivalSeen } from '../network/arrivalMessages.ts';
import { FLIGHT, shipPoint, shipPose } from './airshipFlight.ts';

/** A ship coming in toward the north to ground at (100, 200, 10), as the room sends one. */
const SHIP: ArrivalSeen = {
  id: 3,
  kind: 1,
  at: [100, 200, 10],
  heading: 0,
  high: 16,
  began: 600,
  hangs: 1080,
  leaves: 1350,
  gone: 1890,
};

const apart = (one: readonly number[], two: readonly number[]) => Math.hypot(one[0] - two[0], one[1] - two[1]);

test('a ship is drawn only from when it sets out until it is gone', () => {
  assert.equal(shipPose(SHIP, SHIP.began - 1), null);
  assert.equal(shipPose(SHIP, SHIP.gone), null);
  assert.ok(shipPose(SHIP, SHIP.began) && shipPose(SHIP, SHIP.gone - 1));
});

test('it comes in from far off, high, behind the way it comes, and slows into its ground', () => {
  const start = shipPose(SHIP, SHIP.began)!;
  assert.ok(Math.abs(apart(start.at, SHIP.at) - FLIGHT.inFarM) < 1, 'from far off');
  assert.ok(start.at[1] > SHIP.at[1] + 300, 'from the south, coming north');
  assert.ok(Math.abs(start.at[2] - (SHIP.at[2] + FLIGHT.inHighM)) < 1e-9, 'high');
  // Each second covers less ground than the one before as it slows.
  const steps = [0, 60, 120, 180, 240, 300, 360, 420].map((tick) => shipPose(SHIP, SHIP.began + tick)!.at);
  const runs = steps.slice(1).map((step, index) => apart(step, steps[index]!));
  for (let index = 1; index < runs.length; index++) assert.ok(runs[index]! < runs[index - 1]!, `${runs}`);
  const hung = shipPose(SHIP, SHIP.hangs)!;
  assert.ok(apart(hung.at, SHIP.at) < 1e-6 && Math.abs(hung.at[2] - (SHIP.at[2] + SHIP.high)) <= FLIGHT.bobM);
  assert.ok(Math.abs(hung.heading - SHIP.heading) < 0.05, 'facing the way it came');
});

test('it hangs with its hatch opening and its lift burning, then climbs away on a turn, its hatch shutting', () => {
  const opening = shipPose(SHIP, SHIP.hangs + FLIGHT.hatchTicks / 2)!;
  assert.ok(Math.abs(opening.hatch - 0.5) < 1e-9 && opening.lift === 1);
  assert.equal(shipPose(SHIP, SHIP.leaves - 1)!.hatch, 1);
  const away = shipPose(SHIP, SHIP.gone - 1)!;
  assert.ok(apart(away.at, SHIP.at) > FLIGHT.outFarM * 0.9, 'far off');
  assert.ok(away.at[2] > SHIP.at[2] + FLIGHT.outHighM * 0.95, 'high');
  assert.ok(Math.abs(away.heading - SHIP.heading) > 0.5, 'turned');
  assert.equal(away.hatch, 0);
});

test('a point of the ship is placed as the props shader places it: turned, pitched and rolled', () => {
  const level = { at: [10, 20, 30] as const, heading: Math.PI / 2, pitch: 0, roll: 0, burn: 0, lift: 0, hatch: 0 };
  // Heading east, its bow (+y in its own frame) points east.
  const bow = shipPoint(level, [0, 10, 0]);
  assert.ok(Math.abs(bow[0] - 20) < 1e-9 && Math.abs(bow[1] - 20) < 1e-9);
  const raised = shipPoint({ ...level, pitch: 0.3 }, [0, 10, 0]);
  assert.ok(raised[2] > 30 + 2.9, 'its nose up');
  const leaning = shipPoint({ ...level, roll: 0.3 }, [0, 0, 10]);
  assert.ok(Math.abs(leaning[2] - (30 + 10 * Math.cos(0.3))) < 1e-9, 'its mast leaning');
});
