import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MarkDrawer } from '../editor/naval.ts';
import { eyeFor, FIELD_OF_VIEW, HEIGHT } from '../overworld/overworldCamera.ts';
import type { FightCaptain, FightVessel, FightView } from '../rules/fightRules.ts';
import { BAR_OVER_M } from '../ships/shipBars.ts';
import { panShot, type Shot } from './camera.ts';
import { SeaCombat } from './seaCombat.ts';
import { pictureAt, shownScale } from './seaLaw.ts';
import type { SeaRoom } from './seaRoom.ts';

const vessel: FightVessel = {
  ship: [5000, 6000, 0.4, 0, 0, 0, 0, 2],
  pose: [0.2, 0, 0, 0],
  hull: 240,
  max_hull: 240,
  sail: 96,
  max_sail: 96,
  crew: 0,
  max_crew: 0,
  state: 'afloat',
  fires: 0,
  guns: { left: [0, 0], progress: [1, 1], load: 'round', braced: false },
};
const captain: FightCaptain = {
  ...vessel,
  ship: [5400, 5500, 2, 0, 0, 0, 0, 2],
  name: 'Pirate Sloop',
  faction: 2,
  rank: 2,
  mode: 'engage',
  hostile: true,
  run_out: [],
};
const FIRST: FightView = {
  clock: 0,
  player: vessel,
  captain,
  balls: [],
  lay: null,
  events: [],
  over: null,
  fingerprint: '',
};
const ROOM = { orders: () => undefined, takeFight: () => null } as unknown as SeaRoom;
const MARKS = { drawInto: () => undefined } as unknown as MarkDrawer;
const WATERLINE = { lengthM: 18.6775, beamM: 5.5684, draughtM: 1.8 };
/** The Sloop drawn 75 m long on the sea's view. */
const SEA_SCALE = 75 / WATERLINE.lengthM;

test('a fight draws every ship, her footprint, everyone aboard and each bar at the size the view shows her', () => {
  const fight = new SeaCombat(ROOM, FIRST, MARKS, 0);
  const ships = fight.ships(0.1, 0, 0, 3);
  assert.deepEqual(
    ships.map(({ place }) => [place.x, place.y, place.scale]),
    [
      [5000, 6000, 3],
      [5400, 5500, 3],
    ],
  );
  assert.deepEqual(
    fight.hulls(3).map((hull) => [hull.halfLength, hull.halfBeam]),
    Array.from({ length: 2 }, () => [(WATERLINE.lengthM / 2) * 3, (WATERLINE.beamM / 2) * 3]),
  );
  assert.deepEqual(
    ships.map(({ hull, look }) => [hull, look.side]),
    [
      [0, 'player'],
      [0, 'pirate'],
    ],
    "the player's Sloop as she is, the pirate's in the pirates' colours",
  );
  assert.equal(fight.ownAt(3)?.scale, 3);
  assert.deepEqual(fight.bars(3)[0]?.over, [5400, 5500, (0.2 + BAR_OVER_M) * 3]);
});

test("a fight begun at the sea's view keeps the size she is drawn at, and eases to her true size as it comes down", () => {
  const fight = new SeaCombat(ROOM, FIRST, MARKS, 0);
  const her = [5000, 6000, 0] as const;
  const { eye } = eyeFor(her, 2.6, (30 * Math.PI) / 180, HEIGHT.lowest);
  const sea: Shot = { eye, yaw: 2.6, pitch: (30 * Math.PI) / 180, fov: FIELD_OF_VIEW, near: 2, far: 60_000 };
  const scaleAt = (near: Shot, share: number) => {
    const shown = panShot(sea, near, share);
    const picture = { seaM: pictureAt(sea, her), shownM: pictureAt(shown, her), nearM: pictureAt(near, her), share };
    return shownScale(SEA_SCALE, picture);
  };
  const failed = (error: unknown) => {
    throw error;
  };
  let near = fight.frame(0, 0, sea.far, failed);
  assert.equal(fight.share, 0);
  assert.equal(scaleAt(near, fight.share), SEA_SCALE, 'as the sea drew her the frame before');
  let last = SEA_SCALE;
  for (let frame = 1; frame <= 20; frame++) {
    near = fight.frame(0.1, frame * 0.1, sea.far, failed);
    const scale = scaleAt(near, fight.share);
    assert.ok(scale <= last && scale >= 1, `${scale} times her size, after ${last}`);
    last = scale;
  }
  assert.equal(fight.share, 1, 'down at the fight');
  assert.equal(last, 1, 'her true size');
});

test("in a fight the player's footprint comes first, then the captains nearest her, and a sunk ship's goes", () => {
  const far = { ...captain, ship: [9000, 6000, 0, 3, 0, 0, 0, 2] as typeof captain.ship };
  const near = { ...captain, ship: [5100, 6000, 0, 0, 0, 0, 0, 2] as typeof captain.ship };
  const sunk = { ...captain, ship: [5050, 6000, 0, 0, 0, 0, 0, 2] as typeof captain.ship, state: 'sunk' as const };
  const fight = new SeaCombat(ROOM, { ...FIRST, captain: far, others: [sunk, near] }, MARKS, 0);
  const hulls = fight.hulls(4);
  assert.deepEqual(
    hulls.map((hull) => [hull.x, hull.way > 0, hull.scale]),
    [
      [5000, false, 4],
      [5100, false, 4],
      [9000, true, 4],
    ],
  );
});

test('a captain keeps her own harm when another leaves the fight and the view moves her up its list', async () => {
  const [north, south] = [
    { ...captain, ship: [5100, 5800, 0, 0, 0, 0, 0, 2], number: 5 },
    { ...captain, ship: [5300, 6200, 0, 0, 0, 0, 0, 2], number: 7 },
  ];
  const views: FightView[] = [
    // A ball through the hull of the captain the events name 7, the second of the others.
    {
      ...FIRST,
      others: [north, south],
      events: [{ kind: 'hit', ship: 7, by: 0, zone: 'hull', point: [5300, 6203, 1] }],
    },
    { ...FIRST, others: [south] },
  ];
  const room = { orders: () => undefined, takeFight: () => views.shift() ?? null } as unknown as SeaRoom;
  const fight = new SeaCombat(room, { ...FIRST, others: [north, south] }, MARKS, 0);
  const scarsOf = (x: number) =>
    fight.ships(0.1, 0, 0, 1).find(({ place }) => place.x === x)?.rig?.harm.scars.length ?? -1;
  for (let frame = 1; frame <= 6; frame++) {
    fight.frame(1 / 30, frame / 30, 1000, (error) => assert.fail(String(error)));
    await new Promise((settled) => setImmediate(settled));
  }
  assert.equal(views.length, 0, 'both views were taken');
  assert.equal(scarsOf(5300), 1, 'the one struck keeps her hole');
  assert.equal(scarsOf(5000), 0);
});

test("each captain's plate is keyed by her own fight number, so plates in a fight of three never share a lift", () => {
  const second = { ...captain, ship: [5420, 5500, 2, 0, 0, 0, 0, 2], number: 5 };
  const third = { ...captain, ship: [5440, 5500, 2, 0, 0, 0, 0, 2] };
  const fight = new SeaCombat(ROOM, { ...FIRST, others: [second, third] }, MARKS, 0);
  assert.deepEqual(
    fight.bars(1).map((bar) => bar.key),
    [1, 5, 3],
  );
});

test("her own gun's kick shakes the fight's eye, and it stands still again within a second", async () => {
  const fight = new SeaCombat(ROOM, FIRST, MARKS, 0);
  const still = fight.frame(0.1, 1, 1000, () => undefined);
  const muzzle = { kind: 'muzzle', ship: 0, point: [5000, 6002, 2], launch: [0, 300, 0] } as const;
  const room = { orders: () => undefined, takeFight: () => ({ ...FIRST, events: [muzzle] }) } as unknown as SeaRoom;
  const kicked = new SeaCombat(room, FIRST, MARKS, 0);
  kicked.frame(0.1, 1, 1000, () => undefined);
  await new Promise((resolve) => setTimeout(resolve, 0));
  kicked.frame(0.05, 1.05, 1000, () => undefined);
  kicked.draw({} as GPURenderPassEncoder, { fromEye: new Float32Array(16), eye: [5000, 6000, 10] }, 1.05);
  const shaken = kicked.frame(0.1, 1.2, 1000, () => undefined);
  const moved = (shot: Shot) => Math.hypot(...shot.eye.map((value, axis) => value - (still.eye[axis] ?? 0)));
  assert.ok(moved(shaken) > 0.005, `${moved(shaken)}`);
  assert.ok(moved(kicked.frame(0.1, 2.5, 1000, () => undefined)) < 1e-9);
});
