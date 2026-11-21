import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Swell } from '../rules/landRules.ts';
import { hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { poseOnSwell } from '../ships/swellPose.ts';
import { mooredShips } from './moorings.ts';

/** One wave running north, 60 m long and a metre high. */
const SWELL: Swell = {
  waves: [{ direction: [0, -1], number: (2 * Math.PI) / 60, frequency: 0.8, amplitude: 1, shift: 0, phase: 0 }],
  fullDepthM: 20,
  goneDepthM: 2,
  bearing: 0,
};
const deep = () => Infinity;

test('a moored ship rides the swell as every ship does, and lies level in still water', () => {
  const moorings = [[100, 200, 0.5]] as const;
  const { lengthM, beamM } = hullWaterline(SLOOP_HULL);
  for (const time of [0, 1.3, 4.5]) {
    const [ship] = mooredShips(moorings, time, { swell: SWELL, depthAt: deep }).ships;
    const pose = poseOnSwell(SWELL, deep, { x: 100, y: 200, heading: 0.5 }, lengthM / 2, beamM / 2, time);
    assert.deepEqual(
      [ship?.place.z, ship?.place.pitch, ship?.place.roll, ship?.place.heading],
      [pose.heave, pose.pitch, pose.roll, 0.5],
    );
  }
  const [still] = mooredShips(moorings, 3, { swell: undefined, depthAt: deep }).ships;
  assert.deepEqual([still?.place.z, still?.place.pitch, still?.place.roll], [0, 0, 0]);
});

test('the moored ships are drawn as friendly sloops, each with a still footprint at her place', () => {
  const { ships, hulls } = mooredShips([[100, 200, 0.5]], 3, { swell: undefined, depthAt: deep });
  assert.equal(ships.length, 1);
  assert.equal(ships[0]?.look.side, 'friendly');
  assert.deepEqual([hulls[0]?.x, hulls[0]?.y, hulls[0]?.heading, hulls[0]?.way], [100, 200, 0.5, 0]);
});
