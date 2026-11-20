import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MarkDrawer } from '../editor/naval.ts';
import { eyeFor, FIELD_OF_VIEW, HEIGHT } from '../overworld/overworldCamera.ts';
import type { FightCaptain, FightVessel, FightView } from '../rules/fightRules.ts';
import { BAR_OVER_M } from '../ships/shipBars.ts';
import { panShot, type Shot } from './camera.ts';
import { roomSource, SeaCombat } from './seaCombat.ts';
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
  id: 1,
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

test('a fight draws every Sloop, her footprint, everyone aboard and each bar at the size the view shows her', () => {
  const fight = new SeaCombat(roomSource(ROOM, FIRST), FIRST, MARKS, [], 0);
  const ships = fight.ships(0.1, 0, 0, 3);
  assert.deepEqual(
    ships.map(({ place }) => [place.x, place.y, place.scale]),
    [
      [5000, 6000, 3],
      [5400, 5500, 3],
    ],
  );
  assert.deepEqual(
    fight.hulls(WATERLINE, 3).map((hull) => [hull.halfLength, hull.halfBeam]),
    Array.from({ length: 2 }, () => [(WATERLINE.lengthM / 2) * 3, (WATERLINE.beamM / 2) * 3]),
  );
  assert.equal(fight.ownAt(3)?.scale, 3);
  assert.deepEqual(fight.bars(3)[0]?.over, [5400, 5500, (0.2 + BAR_OVER_M) * 3]);
});

test('each captain keeps a plate of her own, keyed by her number in the fight, so a hit lowers her bar alone', () => {
  const struck = { ...captain, id: 2, hull: captain.max_hull / 2 };
  const third = { ...captain, id: 3, ship: [5600, 5500, 0, 0, 0, 0, 0, 0] };
  const view: FightView = { ...FIRST, captain, others: [struck, third] };
  const fight = new SeaCombat(roomSource(ROOM, view), view, MARKS, [], 0);
  const bars = fight.bars(1);
  assert.deepEqual(
    bars.map((bar) => bar.key),
    [1, 2, 3],
  );
  assert.deepEqual(
    bars.map((bar) => bar.share),
    [1, 0.5, 1],
  );
  // The second gone from the fight, as the wire leaves her out: the third keeps her own plate.
  const after: FightView = { ...view, others: [third] };
  const later = new SeaCombat(roomSource(ROOM, after), after, MARKS, [], 0).bars(1);
  assert.deepEqual(
    later.map((bar) => bar.key),
    [1, 3],
  );
});

test("a fight begun at the sea's view keeps the size she is drawn at, and eases to her true size as it comes down", () => {
  const fight = new SeaCombat(roomSource(ROOM, FIRST), FIRST, MARKS, [], 0);
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
