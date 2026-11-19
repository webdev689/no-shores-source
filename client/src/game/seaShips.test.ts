import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenPirate, SeenShip } from '../network/messages.ts';
import { hullSails, hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import { HULLS } from '../water/hullMask.ts';
import { SeaShips } from './seaShips.ts';

const WATER = { swell: undefined, depthAt: () => Infinity };
const OWN = {
  lies: { x: 0, y: 0, heading: 0, underWay: false },
  place: { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 },
};

test('a pirate first drawn is drawn under the sails she sails by, never setting them as she comes in view', () => {
  const pirate: SeenPirate = { id: 3, x: 800, y: -300, heading: 1.2, faction: 2, rank: 1 };
  const [, drawn] = new SeaShips().ships(1 / 60, 10, 0.4, OWN, [], [pirate], 4, WATER);
  // A rig sailed long at her heading in the same wind: her sails stand full.
  const sailed = new SailRig(hullSails(SLOOP_HULL));
  for (let tick = 0; tick < 600; tick++) sailed.step(1 / 60, { offDeg: windOff(1.2, 0.4), set: true }, 10);
  assert.equal(drawn?.look.side, 'pirate', "in the pirates' colours");
  const [first, full] = [drawn?.rig?.canvas(), sailed.canvas()];
  assert.ok(first && full);
  first.forEach((canvas, sail) =>
    canvas.forEach((value, index) =>
      assert.ok(Math.abs(value - (full[sail]?.[index] ?? Number.NaN)) < 1e-3, `sail ${sail} point ${index}`),
    ),
  );
});

test('every ship leaves her footprint on the water as she is drawn, pirates too, the nearest her first', () => {
  const far: SeenPirate = { id: 3, x: 900, y: 0, heading: 1.2, faction: 2, rank: 1 };
  const pirates = [far, { id: 4, x: 0, y: -300, heading: 0.4, faction: 1, rank: 2 }];
  const other: SeenShip = { player: 2, x: 500, y: 0, heading: 0, pace: 0 };
  const hulls = new SeaShips().hulls(OWN.lies, [other], pirates, 4);
  assert.deepEqual(
    hulls.map((hull) => [hull.x, hull.y, hull.way > 0]),
    [
      [0, 0, false],
      [0, -300, true],
      [500, 0, false],
      [900, 0, true],
    ],
    "the player's first, then the nearest her; a pirate is under way",
  );
  const { lengthM, beamM } = hullWaterline(SLOOP_HULL);
  for (const hull of hulls) assert.deepEqual([hull.halfLength, hull.halfBeam], [(lengthM / 2) * 4, (beamM / 2) * 4]);
  const many = Array.from({ length: 12 }, (unused, index) => ({ ...far, id: index, x: 1000 - index * 50 }));
  const kept = new SeaShips().hulls(OWN.lies, [], many, 1);
  assert.equal(kept.length, HULLS, 'as many as the water holds');
  const farthestKept = 1000 - (many.length - (HULLS - 1)) * 50;
  assert.equal(Math.max(...kept.slice(1).map((hull) => hull.x)), farthestKept, 'the farthest left out');
});
