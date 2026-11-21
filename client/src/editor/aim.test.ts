import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIM_EYE, aimEye, batterySide, lookBearing, lookRange, lookReach, yawInBattery } from './aim.ts';

const near = (actual: number, wanted: number, within = 1e-9) => Math.abs(actual - wanted) <= within;

test('a look down onto the water lays where it meets it, and past the dip on at 30 m a degree', () => {
  const dip = (10 * Math.PI) / 180;
  assert.ok(near(lookReach(-dip, 5.5), 5.5 / Math.tan(dip)));
  const flat = lookReach(0, 5.5);
  const raised = lookReach((1 * Math.PI) / 180, 5.5);
  assert.ok(near(raised - flat, 30, 1e-6), `${raised - flat}`);
  assert.ok(near(lookReach(-dip, 0.1), 0.5 / Math.tan(dip)), 'an eye under half a metre is reckoned at half a metre');
});

test('a look bears off its bow in degrees, starboard positive', () => {
  assert.ok(near(lookBearing(Math.PI / 2, 0), 90));
  assert.ok(near(lookBearing(0, Math.PI / 2), -90));
  assert.ok(near(lookBearing(0.1, 2 * Math.PI - 0.1), (0.2 * 180) / Math.PI));
  assert.ok(near(lookBearing(Math.PI, 0), 180));
});

const degrees = (value: number) => (value * Math.PI) / 180;

test('a look bears on a battery only off its bow and stern arcs, on the side it looks to', () => {
  const heading = 1;
  assert.equal(batterySide(heading + degrees(90), heading), 1);
  assert.equal(batterySide(heading - degrees(100), heading), -1);
  assert.equal(batterySide(heading + degrees(20), heading), null, 'over the bow');
  assert.equal(batterySide(heading - degrees(160), heading), null, 'over the stern');
});

test('a look held on a battery stays in its arc, past either end or across onto the other side', () => {
  const heading = 2;
  const held = (bearing: number, side: 1 | -1) =>
    lookBearing(yawInBattery(heading + degrees(bearing), heading, side), heading);
  assert.ok(near(held(80, 1), 80), 'a look in the arc is left where it is');
  assert.ok(near(held(10, 1), 36), 'toward the bow it stops inside the bow arc');
  assert.ok(near(held(170, 1), 139), 'toward the stern it stops inside the stern arc');
  assert.ok(near(held(-30, 1), 36), 'across the bow it comes back to the bow end');
  assert.ok(near(held(-150, 1), 139), 'across the stern it comes back to the stern end');
  assert.ok(near(held(-10, -1), -36) && near(held(100, -1), -139), 'port is starboard mirrored');
});

test('the aim eye stands out past its guns on the side looked at, up and aft', () => {
  // Heading north: starboard is east, aft is south.
  const [x, y, z] = aimEye({ x: 10, y: 20, heading: 0, heave: 0.5 }, 1);
  assert.ok(near(x, 10 + AIM_EYE.out) && near(y, 20 + AIM_EYE.aft) && near(z, 0.5 + AIM_EYE.up));
  assert.ok(near(aimEye({ x: 10, y: 20, heading: 0, heave: 0 }, -1)[0], 10 - AIM_EYE.out));
});

test("a look's range is how far out along its fire it meets the water, from its middle", () => {
  const ship = { x: 0, y: 0, heading: 0, heave: 0 };
  // Looking due east from the starboard eye, the water is met 50 m out from it.
  const eye = aimEye(ship, 1);
  const out = lookRange(ship, eye, Math.PI / 2, -Math.atan(eye[2] / 50));
  assert.ok(near(out, eye[0] + 50, 1e-6), `${out}`);
});
