import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SeenShip } from '../network/messages.ts';
import type { Swell } from '../rules/landRules.ts';
import { hullSails, hullWaterline, SLOOP_HULL } from '../ships/hulls.ts';
import { SailRig } from '../ships/sails.ts';
import { poseOnSwell } from '../ships/swellPose.ts';
import type { Berthed } from './docking.ts';
import type { LandingAim } from './landingAsk.ts';
import { mooredShips, shipsLying } from './moorings.ts';

/** One wave running north, 60 m long and a metre high. */
const SWELL: Swell = {
  waves: [{ direction: [0, -1], number: (2 * Math.PI) / 60, frequency: 0.8, amplitude: 1, shift: 0, phase: 0 }],
  fullDepthM: 20,
  goneDepthM: 2,
  bearing: 0,
};
const deep = () => Infinity;
const FRIGATE = 3;

test('a moored ship rides the swell as every ship does, and lies level in still water', () => {
  const lying = [{ x: 100, y: 200, heading: 0.5, hull: SLOOP_HULL }];
  const { lengthM, beamM } = hullWaterline(SLOOP_HULL);
  for (const time of [0, 1.3, 4.5]) {
    const [ship] = mooredShips(lying, time, { swell: SWELL, depthAt: deep }).ships;
    const pose = poseOnSwell(SWELL, deep, { x: 100, y: 200, heading: 0.5 }, lengthM / 2, beamM / 2, time);
    assert.deepEqual(
      [ship?.place.z, ship?.place.pitch, ship?.place.roll, ship?.place.heading],
      [pose.heave, pose.pitch, pose.roll, 0.5],
    );
  }
  const [still] = mooredShips(lying, 3, { swell: undefined, depthAt: deep }).ships;
  assert.deepEqual([still?.place.z, still?.place.pitch, still?.place.roll], [0, 0, 0]);
});

test('each moored ship is drawn as its own hull, its sails furled, with a still footprint of its hull at its place', () => {
  const lying = [
    { x: 100, y: 200, heading: 0.5, hull: SLOOP_HULL },
    { x: 300, y: 200, heading: 1, hull: FRIGATE },
  ];
  const { ships, hulls } = mooredShips(lying, 3, { swell: undefined, depthAt: deep });
  assert.deepEqual(
    ships.map((ship) => [ship.hull, ship.look.side]),
    [
      [SLOOP_HULL, 'friendly'],
      [FRIGATE, 'friendly'],
    ],
  );
  for (const ship of ships) assert.deepEqual(ship.rig?.canvas(), new SailRig(hullSails(ship.hull)).canvas(), 'furled');
  const { lengthM, beamM } = hullWaterline(FRIGATE);
  assert.deepEqual(hulls[1], { x: 300, y: 200, heading: 1, halfLength: lengthM / 2, halfBeam: beamM / 2, way: 0 });
});

/** Overlook's pier, its two places, as its city's plan gives them. */
const PLAN = {
  social: {
    moorings: [
      [100, 200, 0.5],
      [130, 210, 0.5],
    ],
  },
} as never;
const SOCIAL = { id: 'overlook-social', kind: 'social', continent: 'continent-1' } as const;
const DOWNS = { id: 'saltgrass-downs', kind: 'patrol', continent: 'continent-1' } as const;
const COVE = { id: 'isle-3-00000000000000ff', kind: 'patrol', continent: 'continent-1' } as const;
const docked = (aim: LandingAim): Berthed => ({
  aim,
  berth: { at: [100, 200], offing: [100, -400] },
  landmass: 'continent-1',
});
const AT_PIER = docked({ kind: 'dock', port: 'Overlook', harbour: [0, 0] });
const OWN = { docked: AT_PIER, lies: { x: 101, y: 199, heading: 3 }, hull: FRIGATE };
const PARKED: SeenShip = { player: 4, x: 131, y: 211, heading: 1, pace: 0, hull: 2, dress: [], name: [], emblem: 0 };
const where = (ships: readonly { x: number; y: number; hull: number }[]) => ships.map(({ x, y, hull }) => [x, y, hull]);

test("ashore, the player's ship lies where it docked and others' where they parked; the pier's sloops only where none do", () => {
  assert.deepEqual(where(shipsLying(SOCIAL, PLAN, OWN, [])), [
    [101, 199, FRIGATE],
    [130, 210, SLOOP_HULL],
  ]);
  assert.deepEqual(where(shipsLying(SOCIAL, PLAN, OWN, [PARKED])), [
    [101, 199, FRIGATE],
    [131, 211, 2],
  ]);
  assert.deepEqual(where(shipsLying(DOWNS, PLAN, OWN, [PARKED])), where(shipsLying(SOCIAL, PLAN, OWN, [PARKED])));
  assert.deepEqual(where(shipsLying(SOCIAL, PLAN, { ...OWN, docked: null }, [])), [
    [100, 200, SLOOP_HULL],
    [130, 210, SLOOP_HULL],
  ]);
});

test("off the island it docked at the player's ship is not drawn; docked at a sea island, on that island alone", () => {
  assert.deepEqual(shipsLying({ ...DOWNS, continent: 'continent-4' }, null, OWN, []), []);
  assert.deepEqual(shipsLying(COVE, null, OWN, []), [], "a sea island in the landmass's waters is not the landmass");
  const atCove = { ...OWN, docked: docked({ kind: 'isle', id: 3, words: 'a cove' }) };
  assert.deepEqual(where(shipsLying(COVE, null, atCove, [])), [[101, 199, FRIGATE]]);
  assert.deepEqual(shipsLying({ ...COVE, id: 'isle-30-00000000000000ff' }, null, atCove, []), []);
  assert.deepEqual(shipsLying(DOWNS, null, atCove, []), []);
});

test("the player's own ship parked here is drawn from the land room's word once, where the page has no docking", () => {
  const own: SeenShip = { ...PARKED, player: 9, x: 101.4, y: 198.6, heading: 3, hull: FRIGATE };
  const reloaded = { docked: null, lies: undefined, hull: undefined };
  assert.deepEqual(where(shipsLying(SOCIAL, PLAN, reloaded, [own, PARKED])), [
    [101.4, 198.6, FRIGATE],
    [131, 211, 2],
  ]);
  assert.deepEqual(where(shipsLying(SOCIAL, PLAN, OWN, [own, PARKED])), [
    [101, 199, FRIGATE],
    [131, 211, 2],
  ]);
});
