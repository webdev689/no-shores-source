import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomConnection, type Snapshot } from '../network/roomConnection.ts';
import type { Point2 } from '../overworld/ground.ts';
import { maskFromOutlines } from '../overworld/seaRoute.ts';
import { Foot, type FootContext } from './foot.ts';
import type { IsleAt } from './isleLaw.ts';
import { IsleLanding, ashoreOn } from './isleVisit.ts';
import type { IsleHeld, Isles } from './isles.ts';
import type { Landmass } from './landmass.ts';
import { Sea } from './sea.ts';
import type { SeaHull } from './seaShips.ts';

test("a landing that fails closes the island room's socket rather than leaving it to rejoin for ever", async (context) => {
  let closed = 0;
  const connection = Object.assign(Object.create(RoomConnection.prototype) as RoomConnection, {
    close: () => closed++,
  });
  context.mock.method(RoomConnection, 'open', () => Promise.resolve(connection));
  context.mock.method(Foot, 'onDeck', (...asked: unknown[]) => {
    (asked[3] as (received: unknown) => unknown)(() => undefined);
    return Promise.reject(new Error('the ground did not load'));
  });
  const held = {
    seen: { id: 3, at: [1000, 2000], seed: 255n, kind: 'cove', name: 'A cove' },
    plan: {
      ring: [[0, 0]],
      spawns: [[1, 1]],
      blocks: [],
      heights: new Float32Array(4),
      facing: 0,
      wrecks: [],
      nodes: [],
    },
    heights: new Float32Array(4),
  } as unknown as IsleHeld;
  const rooms = (name: string) => `wss://rooms.test/${name}`;
  const foot = { rooms, session: () => Promise.resolve(null) } as unknown as FootContext;
  const where = { word: null, continent: 'continent-4', seas: 'normal' } as const;
  await assert.rejects(
    ashoreOn(foot, held, where, () => undefined),
    /the ground did not load/,
  );
  assert.equal(closed, 1);
});

/** A point `east` and `south` metres from one well inside the world's frame. */
const place = (east: number, south: number): Point2 => [1_000_000 + east, 1_000_000 + south];
/** A square of land 10 km a side whose west coast lies 30 km east of that point. */
const LAND: Point2[] = [place(30_000, -5_000), place(40_000, -5_000), place(40_000, 5_000), place(30_000, 5_000)];
const [LEFT, TOP] = place(-100_000, -100_000);
const MASK = maskFromOutlines([LAND], { leftM: LEFT, topM: TOP, widthM: 200_000, heightM: 200_000 });
/** A cove past the land, 60 km east, landed on from the west: its anchorage 150 m out from its middle that way. */
const COVE: IsleAt = {
  seen: { id: 3, seed: '255', at: place(60_000, 0), kind: 'cove', continent: 3, found: true },
  built: { reach: 250, anchorage: place(59_850, 0), landing: -Math.PI / 2 },
};
const ISLES = { all: () => [COVE] } as unknown as Isles;

/** The player's ship at sea at `start` beside the land, the cove's island kept clear of; and in a sea room that has
 *  sighted the Tithe ship `hostile` 3 km north of it. */
async function seaAt(start: Point2) {
  const landmass = { id: 'continent-9', plan: null, nodes: [], outline: LAND, heightAt: () => -50, mask: MASK };
  const hull = { waterline: { lengthM: 18, beamM: 5, draughtM: 2 }, shown: (hull: number) => hull, marks: {} };
  const sea = new Sea(landmass as unknown as Landmass, [LAND], hull as unknown as SeaHull, start, 0, {} as FootContext);
  sea.isles = ISLES;
  let hand: (snapshot: Snapshot) => void = () => undefined;
  const link = { player: 1, dressed: [], joins: 1, rejoining: false, lost: null, send: () => 0, pump: () => 0 };
  await sea.enterRoom((snapshot) => ((hand = snapshot), link));
  const hostile = { id: 7, x: start[0], y: start[1] - 3_000, heading: 0, faction: 1, rank: 1 };
  const lists = { players: [], ships: [], fights: [], flotsam: [], kept: [], told: [], decks: [], islands: [] };
  hand({ tick: 1n, hostiles: [hostile], taken: [], friendlies: [], charted: [], plates: [], ...lists } as never);
  return sea;
}

/** Whether no leg of a course passes over the land, looked at every 100 m along it. */
function overWater(course: readonly Point2[]): boolean {
  const [west, north] = place(30_000, -5_000);
  const [east, south] = place(40_000, 5_000);
  return course.slice(1).every((to, index) => {
    const from = course[index] ?? to;
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 100);
    return Array.from({ length: steps + 1 }, (unused, step) => step / Math.max(1, steps)).every((share) => {
      const [x, y] = [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
      return x <= west || x >= east || y <= north || y >= south;
    });
  });
}

test('a landing on a sea island sails for its offing on water, round the land between, then in to its anchorage', async () => {
  const sea = await seaAt(place(0, 0));
  const landing = new IsleLanding();
  assert.equal(landing.begin(sea, ISLES, 3), true);
  assert.deepEqual(sea.course.at(-1), COVE.built?.anchorage);
  assert.ok(overWater(sea.course), JSON.stringify(sea.course));
  const offing = sea.course.at(-2) ?? [0, 0];
  assert.ok(offing[0] < place(59_850, 0)[0] && Math.abs(offing[1] - place(0, 0)[1]) < 1, 'in on its landing bearing');
});

test('from the far side of a sea island its landing goes round it, never over it', async () => {
  const sea = await seaAt(place(62_000, 0));
  new IsleLanding().begin(sea, ISLES, 3);
  const middle = COVE.seen.at;
  const past = sea.course.slice(0, -1).every(([x, y]) => Math.hypot(x - middle[0], y - middle[1]) > 250);
  assert.ok(past, JSON.stringify(sea.course));
  assert.deepEqual(sea.course.at(-1), COVE.built?.anchorage);
});

test('a landing on a sea island ends a chase, as any other course does', async () => {
  const sea = await seaAt(place(0, 0));
  assert.equal(sea.sailToMark('hostile-7'), true);
  assert.match(sea.voyageNote, /^Chasing/);
  new IsleLanding().begin(sea, ISLES, 3);
  assert.doesNotMatch(sea.voyageNote, /^Chasing/);
  assert.deepEqual(sea.bound, COVE.built?.anchorage);
});
