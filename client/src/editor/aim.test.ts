import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookBearing, lookPitch, lookReach } from './aim.ts';

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

test("a look's pitch is found again from how far out it lays, either side of the dip", () => {
  for (const pitch of [-0.6, -0.2, -0.05, 0, 0.1]) {
    const reach = lookReach(pitch, 5.5);
    assert.ok(near(lookPitch(reach, 5.5), pitch, 1e-9), `${pitch}: ${lookPitch(reach, 5.5)}`);
  }
});
