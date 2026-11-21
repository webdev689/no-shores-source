import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenPirate, SeenShip } from '../network/messages.ts';
import { hullOfCaptain, hullSails, hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig, windOff } from '../ships/sails.ts';
import { FAIR_LINE, HULLS } from '../water/hullMask.ts';

/** Every hull's line the fair one: no mesh is fetched. */
const FAIR_LINES = { line: () => FAIR_LINE };
import { heelShare, SeaShips } from './seaShips.ts';

const WATER = { swell: undefined, depthAt: () => Infinity };
const OWN = {
  lies: { x: 0, y: 0, heading: 0, underWay: false },
  place: { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 },
};

test('a pirate first drawn is drawn under the sails it sails by, never setting them as it comes in view', () => {
  const pirate: SeenPirate = { id: 3, x: 800, y: -300, heading: 1.2, faction: 2, rank: 1 };
  const [, drawn] = new SeaShips(undefined, FAIR_LINES).ships(1 / 60, 10, 0.4, OWN, [], [pirate], 4, WATER);
  // A rig sailed long at its heading in the same wind: its sails stand full.
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

test('every ship leaves its footprint on the water as it is drawn, pirates too, the nearest its first', () => {
  const far: SeenPirate = { id: 3, x: 900, y: 0, heading: 1.2, faction: 2, rank: 1 };
  const pirates = [far, { id: 4, x: 0, y: -300, heading: 0.4, faction: 1, rank: 2 }];
  const other: SeenShip = { player: 2, x: 500, y: 0, heading: 0, pace: 0 };
  const hulls = new SeaShips(undefined, FAIR_LINES).hulls(OWN.lies, [other], pirates, 4);
  assert.deepEqual(
    hulls.map((hull) => [hull.x, hull.y, hull.way > 0]),
    [
      [0, 0, false],
      [0, -300, true],
      [500, 0, false],
      [900, 0, true],
    ],
    "the player's first, then the nearest the player's; a pirate is under way",
  );
  const { lengthM, beamM } = hullWaterline(SLOOP_HULL);
  for (const hull of hulls) assert.deepEqual([hull.halfLength, hull.halfBeam], [(lengthM / 2) * 4, (beamM / 2) * 4]);
  const many = Array.from({ length: HULLS + 4 }, (unused, index) => ({ ...far, id: index, x: 1000 - index * 10 }));
  const kept = new SeaShips(undefined, FAIR_LINES).hulls(OWN.lies, [], many, 1);
  assert.equal(kept.length, HULLS, 'as many as the water holds');
  const farthestKept = 1000 - (many.length - (HULLS - 1)) * 10;
  assert.equal(Math.max(...kept.slice(1).map((hull) => hull.x)), farthestKept, 'the farthest left out');
});

test('in the same turn a narrow hull heels more than the Sloop and a broad one less, by beam', () => {
  assert.equal(heelShare(SLOOP_HULL), 1);
  assert.ok(Math.abs(heelShare(1) - 5.5684 / hullWaterline(1).beamM) < 1e-9);
  assert.ok(heelShare(1) > 1 && heelShare(3) < 1, 'the Schooner more, the Frigate less');
  const heelOf = (hull: number) => {
    const ships = new SeaShips(undefined, FAIR_LINES);
    const lies = { x: 0, y: 0, heading: 0, underWay: true };
    ships.placeOf('one', lies, 1, WATER, 1 / 60, 0, hull);
    return ships.placeOf('one', { ...lies, heading: 0.002 }, 1, WATER, 1 / 60, 1 / 60, hull).roll;
  };
  assert.ok(heelOf(1) > heelOf(SLOOP_HULL) && heelOf(SLOOP_HULL) > heelOf(3));
});

test('a captain whose hull is still coming is drawn, its footprint laid, as the Sloop', () => {
  const pirate: SeenPirate = { id: 3, x: 800, y: -300, heading: 1.2, faction: 2, rank: 1 };
  const coming = new SeaShips(() => SLOOP_HULL);
  const [, drawn] = coming.ships(1 / 60, 10, 0.4, OWN, [], [pirate], 4, WATER);
  assert.equal(drawn?.hull, SLOOP_HULL);
  assert.equal(drawn?.rig?.sails.length, hullSails(SLOOP_HULL).length);
  const [, footprint] = coming.hulls(OWN.lies, [], [pirate], 1);
  assert.equal(footprint?.halfLength, hullWaterline(SLOOP_HULL).lengthM / 2);
});

test("each ship's footprint is its own hull at its drawn size, and its bow slams and throws spray in a rough sea", () => {
  const pirate: SeenPirate = { id: 7, x: 0, y: -300, heading: 0.4, faction: 1, rank: 4 };
  const lines = [0, 1, 2, 3].map((hull) => FAIR_LINE.map((share) => share * (1 - hull / 10)));
  const ships = new SeaShips(undefined, { line: (hull) => lines[hull] ?? FAIR_LINE });
  const [own, theirs] = ships.hulls(OWN.lies, [], [pirate], 4);
  assert.deepEqual([own?.scale, theirs?.scale], [4, 4]);
  assert.equal(own?.line, lines[SLOOP_HULL], 'its own hull line');
  assert.equal(theirs?.line, lines[hullOfCaptain(pirate)], "a captain's ship theirs");
  // A steep, quick sea running at its bow: as its bow drops into the next crest it slams.
  const wave = {
    direction: [0, 1] as const,
    number: (2 * Math.PI) / 30,
    frequency: 1.4,
    amplitude: 1.5,
    shift: 0,
    phase: 0,
  };
  const water = {
    swell: { waves: [wave], fullDepthM: 15, goneDepthM: 1, bearing: 0, state: 0.9 },
    depthAt: () => Infinity,
  };
  const lies = { ...OWN.lies, underWay: true };
  let most = 0;
  for (let step = 0; step < 400; step++) {
    ships.placeOf('own', lies, 1, water, 1 / 60, step / 60);
    most = Math.max(most, ships.hulls(lies, [], [], 1)[0]?.spray ?? 0);
  }
  const calm = new SeaShips(undefined, FAIR_LINES);
  let calmMost = 0;
  const still = {
    swell: { ...water.swell, state: 0.05, waves: [{ ...wave, amplitude: 0.05 }] },
    depthAt: () => Infinity,
  };
  for (let step = 0; step < 400; step++) {
    calm.placeOf('own', lies, 1, still, 1 / 60, step / 60);
    calmMost = Math.max(calmMost, calm.hulls(lies, [], [], 1)[0]?.spray ?? 0);
  }
  assert.ok(most > 0.5 && most > calmMost * 2, `rough ${most}, calm ${calmMost}`);
});
