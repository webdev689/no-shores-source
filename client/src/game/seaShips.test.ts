import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MarkDrawer } from '../editor/naval.ts';
import type { SeenPirate } from '../network/messages.ts';
import { SailRig, type SailCorners, windOff } from '../ships/sails.ts';
import { SeaShips } from './seaShips.ts';

// The Sloop's two, as her export measured them.
const SAILS: SailCorners[] = [
  { kind: 'stay', tack: [5.417, 0, 1.551], clew: [1.726, 0, 1.755], head: [-0.05, 0, 4.495] },
  {
    kind: 'gaff',
    tack: [-0.059, 0, 1.409],
    clew: [-2.859, 0, 1.491],
    throat: [-0.077, 0, 3.509],
    peak: [-2.377, 0, 4.391],
  },
];
const HULL = { waterline: { lengthM: 18.7, beamM: 5, draughtM: 1.5 }, sails: SAILS, marks: {} as MarkDrawer };
const WATER = { swell: undefined, depthAt: () => Infinity };
const OWN = {
  lies: { x: 0, y: 0, heading: 0, underWay: false },
  place: { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 },
};

test('a pirate first drawn is drawn under the sails she sails by, never setting them as she comes in view', () => {
  const pirate: SeenPirate = { id: 3, x: 800, y: -300, heading: 1.2, faction: 2, rank: 1 };
  const [, drawn] = new SeaShips(HULL).ships(1 / 60, 10, 0.4, OWN, [], [pirate], 4, WATER);
  // A rig sailed long at her heading in the same wind: her sails stand full.
  const sailed = new SailRig(SAILS);
  for (let tick = 0; tick < 600; tick++) sailed.step(1 / 60, { offDeg: windOff(1.2, 0.4), set: true }, 10);
  const [first, full] = [drawn?.rig.canvas(), sailed.canvas()];
  assert.ok(first && full);
  first.forEach((canvas, sail) =>
    canvas.forEach((value, index) =>
      assert.ok(Math.abs(value - (full[sail]?.[index] ?? Number.NaN)) < 1e-3, `sail ${sail} point ${index}`),
    ),
  );
});
