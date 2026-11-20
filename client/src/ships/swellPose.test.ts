import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Swell } from '../rules/landRules.ts';
import { swellHeight } from '../water/swell.ts';
import { lagOf, poseOnSwell, RIDE, slams, sprayOf, turnHeel, wakeStirs } from './swellPose.ts';

/** One wave running north, 60 m long and a metre high, whole in any sea deeper than 20 m. */
const SWELL: Swell = {
  waves: [{ direction: [0, -1], number: (2 * Math.PI) / 60, frequency: 0.8, amplitude: 1, shift: 0, phase: 0 }],
  fullDepthM: 20,
  goneDepthM: 2,
  bearing: 0,
};
const deep = () => Infinity;

test('a ship rides the mean of the water under her, through her inertia, and tips with its slope along and across her', () => {
  const lies = { x: 0, y: 0, heading: 0 };
  const pose = poseOnSwell(SWELL, deep, lies, 9, 2.8, 3);
  const level = (x: number, y: number) => swellHeight(SWELL, x, y, 3, Infinity, lagOf(18));
  const [bow, stern] = [level(0, -9), level(0, 9)];
  const mean = (bow + stern + level(-2.8, 0) + level(2.8, 0) + level(0, 0)) / 5;
  assert.ok(Math.abs(pose.heave - mean) < 1e-12);
  assert.ok(Math.abs(pose.pitch - Math.atan2(bow - stern, 18)) < 1e-12);
  assert.ok(Math.abs(pose.roll) < 1e-12, 'a wave along her way does not heel her');
  const abeam = poseOnSwell(SWELL, deep, { ...lies, heading: Math.PI / 2 }, 9, 2.8, 3);
  assert.ok(Math.abs(abeam.pitch) < 1e-12 && Math.abs(abeam.roll) > 0, 'across it, it rolls her instead');
});

test('a ship in still water, or in water too shallow for the swell, lies level', () => {
  assert.deepEqual(poseOnSwell(undefined, deep, { x: 5, y: 5, heading: 1 }, 9, 2.8, 3), {
    heave: 0,
    pitch: 0,
    roll: 0,
  });
  const shoal = poseOnSwell(SWELL, () => 1, { x: 5, y: 5, heading: 1 }, 9, 2.8, 3);
  assert.deepEqual([shoal.heave, shoal.pitch, shoal.roll].map(Math.abs), [0, 0, 0]);
});

test('she heels into a turn by her swing and her way, once she makes a wake, never past 30 degrees', () => {
  const helm = (10 * Math.PI) / 180;
  assert.equal(turnHeel(helm, 0.4), 0, 'no wake, no heel');
  assert.ok(Math.abs(turnHeel(helm, 12) - (3 * Math.PI) / 180) < 1e-12, 'the helm hard over at 12 m/s: 3 degrees');
  assert.ok(turnHeel(-helm, 12) < 0, 'to port, to port');
  assert.ok(Math.abs(turnHeel(20 * helm, 12) - Math.PI / 6) < 1e-12);
});

test('her wake stirs at her bow and both quarters, deeper the more way she makes', () => {
  const stirs = wakeStirs({ x: 0, y: 0, heading: 0 }, 9, 2.8, 1);
  assert.deepEqual(
    stirs.map((stir) => [stir.x, stir.y]),
    [
      [0, -9],
      [-2.8, 6.3],
      [2.8, 6.3],
    ].map(([x = 0, y = 0]) => [x + 0, y + 0]),
  );
  assert.ok((wakeStirs({ x: 0, y: 0, heading: 0 }, 9, 2.8, 2)[0]?.strength ?? 0) < (stirs[0]?.strength ?? 0));
});

test('a bigger hull answers the swell slower, as the rules have her', () => {
  assert.equal(RIDE.lagSPerM, 0.02, 'crates/sailing/src/pose.rs LAG_S_PER_M');
  assert.ok(Math.abs(lagOf(38) / lagOf(18.7) - 38 / 18.7) < 1e-12);
  // A short, quick wave: the same middle, so only her inertia tells a long hull from a short one.
  const chop: Swell = { ...SWELL, waves: [{ ...SWELL.waves[0]!, number: (2 * Math.PI) / 400, frequency: 3 }] };
  const heaves = (halfLength: number) =>
    Array.from(
      { length: 300 },
      (_value, step) => poseOnSwell(chop, deep, { x: 0, y: 0, heading: 0 }, halfLength, 2.8, step * 0.05).heave,
    );
  const most = (values: number[]) => Math.max(...values.map(Math.abs));
  assert.ok(most(heaves(19)) < most(heaves(5)) * 0.8, `${most(heaves(19))} ${most(heaves(5))}`);
});

test('her bow slams pitching down into a crest, throwing spray by her way and the sea state', () => {
  assert.ok(slams(-0.02, 0.2, RIDE.slamClosingMS * 2));
  assert.ok(!slams(-0.02, -0.1, RIDE.slamClosingMS * 2), 'her stem clear of the water');
  assert.ok(!slams(-0.02, 0.2, RIDE.slamClosingMS * 0.5), 'meeting it gently');
  assert.ok(!slams(0.1, 0.2, RIDE.slamClosingMS * 2), 'rising');
  assert.equal(sprayOf(0, 1, 0), 0, 'no way, no spray');
  assert.ok(sprayOf(1, 0.9, 0) > sprayOf(1, 0.1, 0), 'a rough sea throws more');
  assert.ok(sprayOf(1, 0.5, 0) > sprayOf(1, 0.5, 3 * RIDE.slamSprayS) * 1.5, 'a slam bursts, then fades');
  assert.ok(sprayOf(1, 0.5, -1) < sprayOf(1, 0.5, 0), 'no slam yet');
  assert.ok(sprayOf(2, 1, 0) <= 1);
});
