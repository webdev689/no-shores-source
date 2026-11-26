import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Snapshot } from '../network/roomConnection.ts';
import type { Point2 } from '../overworld/ground.ts';
import { maskFromOutlines } from '../overworld/seaRoute.ts';
import { CLICK_PACE } from '../overworld/voyage.ts';
import { type Berth, berthOf } from './berths.ts';
import { Docking } from './docking.ts';
import type { FootContext } from './foot.ts';
import type { IsleAt } from './isleLaw.ts';
import type { Isles } from './isles.ts';
import type { LandingAim } from './landingAsk.ts';
import type { Landmass } from './landmass.ts';
import { Sea } from './sea.ts';
import type { SeaHull } from './seaShips.ts';

/** A point `east` and `south` metres from one well inside the world's frame. */
const place = (east: number, south: number): Point2 => [1_000_000 + east, 1_000_000 + south];
/** A square of land 10 km a side whose west coast lies 30 km east of that point. */
const LAND: Point2[] = [place(30_000, -5_000), place(40_000, -5_000), place(40_000, 5_000), place(30_000, 5_000)];
const [LEFT, TOP] = place(-100_000, -100_000);
const MASK = maskFromOutlines([LAND], { leftM: LEFT, topM: TOP, widthM: 200_000, heightM: 200_000 });
const LANDMASS = { id: 'continent-9', plan: null, nodes: [], outline: LAND, heightAt: () => -50, mask: MASK };
/** A cove past the land, 60 km east, landed on from the west: its anchorage 150 m out from its middle that way. */
const COVE: IsleAt = {
  seen: { id: 3, seed: '255', at: place(60_000, 0), kind: 'cove', continent: 3, found: true },
  built: { reach: 250, anchorage: place(59_850, 0), landing: -Math.PI / 2 },
};
const ISLES = { all: () => [COVE] } as unknown as Isles;
const ISLE: LandingAim = { kind: 'isle', id: 3, words: 'a cove' };
const ASHORE: LandingAim = { kind: 'ashore', coast: 'Saltmere', toward: place(30_200, 0) };
const berth = (aim: LandingAim): Berth => {
  const found = berthOf(aim, LANDMASS as never, [COVE], []);
  assert.ok(found);
  return found;
};

const LISTS = { players: [], fights: [], flotsam: [], kept: [], told: [], decks: [], islands: [] };
/** The sea room's word at `tick`, with the player's own ship (player 1) lying at `ship`, if given. */
const wordOf = (tick: number, ship?: Point2) => {
  const ships = ship ? [{ player: 1, x: ship[0], y: ship[1], heading: 0, pace: 0, hull: 0, dress: [], name: [] }] : [];
  return { tick: BigInt(tick), hostiles: [], taken: [], friendlies: [], charted: [], plates: [], ships, ...LISTS };
};

/** The player's ship at sea at `start` beside the land, the cove's island kept clear of; and in a sea room that has
 *  sighted the Tithe ship `hostile` 3 km north of it, whose next words `hand` hands on. */
async function seaAt(start: Point2) {
  const hull = { waterline: { lengthM: 18, beamM: 5, draughtM: 2 }, shown: (hull: number) => hull, marks: {} };
  const sea = new Sea(LANDMASS as unknown as Landmass, [LAND], hull as unknown as SeaHull, start, 0, {} as FootContext);
  sea.isles = ISLES;
  let hand: (snapshot: Snapshot) => void = () => undefined;
  const link = { player: 1, dressed: [], joins: 1, rejoining: false, lost: null, send: () => 0, pump: () => 0 };
  await sea.enterRoom((snapshot) => ((hand = snapshot), link));
  const hostile = { id: 7, x: start[0], y: start[1] - 3_000, heading: 0, faction: 1, rank: 1 };
  hand({ ...wordOf(1), hostiles: [hostile] } as never);
  return { sea, hand: (tick: number, ship?: Point2) => hand(wordOf(tick, ship) as never) };
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
  const { sea } = await seaAt(place(0, 0));
  const landing = new Docking();
  assert.equal(landing.begin(sea, ISLE, berth(ISLE)), true);
  assert.deepEqual(sea.course.at(-1), COVE.built?.anchorage);
  assert.ok(overWater(sea.course), JSON.stringify(sea.course));
  const offing = sea.course.at(-2) ?? [0, 0];
  assert.ok(offing[0] < place(59_850, 0)[0] && Math.abs(offing[1] - place(0, 0)[1]) < 1, 'in on its landing bearing');
});

test('from the far side of a sea island its landing goes round it, never over it', async () => {
  const { sea } = await seaAt(place(62_000, 0));
  new Docking().begin(sea, ISLE, berth(ISLE));
  const middle = COVE.seen.at;
  const past = sea.course.slice(0, -1).every(([x, y]) => Math.hypot(x - middle[0], y - middle[1]) > 250);
  assert.ok(past, JSON.stringify(sea.course));
  assert.deepEqual(sea.course.at(-1), COVE.built?.anchorage);
});

test('a landing on a sea island ends a chase, as any other course does', async () => {
  const { sea } = await seaAt(place(0, 0));
  assert.equal(sea.sailToMark('hostile-7'), true);
  assert.match(sea.voyageNote, /^Chasing/);
  new Docking().begin(sea, ISLE, berth(ISLE));
  assert.doesNotMatch(sea.voyageNote, /^Chasing/);
  assert.deepEqual(sea.bound, COVE.built?.anchorage);
});

test('docking is seen from the Oversea view, the ship sailing at ×60 through its offing and in to its berth', async () => {
  const { sea } = await seaAt(place(0, 0));
  sea.switchLevel('sealevel');
  const { at, offing } = berth(ASHORE);
  assert.equal(new Docking().begin(sea, ASHORE, { at, offing }), true);
  assert.equal(sea.level, 'oversea');
  assert.equal(sea.pace, CLICK_PACE);
  assert.deepEqual(sea.course.slice(-2), [offing, at], 'its offing, then straight in');
  assert.ok(overWater(sea.course), JSON.stringify(sea.course));
});

test('the landing is made only once the ship lies at rest at its berth, once; turned elsewhere, it is given up', () => {
  const { at, offing } = berth(ASHORE);
  const sea = {
    position: place(0, 0),
    course: [] as Point2[],
    bound: null as Point2 | null,
    switchLevel: () => undefined,
    sailIn: (from: Point2, to: Point2) => ([sea.course, sea.bound] = [[sea.position, from, to], to]),
  };
  const docking = new Docking();
  docking.begin(sea as never, ASHORE, { at, offing });
  assert.equal(docking.making, ASHORE);
  assert.equal(docking.arrived(sea as never), null, 'under way');
  [sea.position, sea.course] = [[at[0] + 3, at[1]], []];
  assert.equal(docking.arrived(sea as never), ASHORE, 'at rest there');
  assert.equal(docking.arrived(sea as never), null, 'taken once');
  docking.begin(sea as never, ASHORE, { at: place(0, 0), offing });
  sea.bound = place(5_000, 0);
  assert.equal(docking.arrived(sea as never), null);
  assert.equal(docking.making, null, 'sent elsewhere');
});

/** A ship come to rest at its coast berth and docked there, its player gone ashore and back aboard. */
async function backAboard(lying: Point2) {
  const { at, offing } = berth(ASHORE);
  const { sea, hand } = await seaAt(lying);
  const docking = new Docking();
  docking.begin(sea, ASHORE, { at: lying, offing });
  assert.equal(docking.arrived(sea), ASHORE, 'docked');
  docking.cameAboard();
  return { sea, hand, docking, at, offing };
}

test('back aboard, once the room has placed the ship at its berth, it sails out at ×60 to the offing', async () => {
  const { at, offing } = berth(ASHORE);
  const { sea, hand, docking } = await backAboard(at);
  docking.undock(sea);
  hand(50, at);
  docking.undock(sea);
  assert.deepEqual(sea.course, [], 'not before the room has placed it');
  hand(120, at);
  docking.undock(sea);
  assert.deepEqual(sea.course, [at, offing], 'straight out');
  assert.equal(sea.pace, CLICK_PACE);
  sea.stop();
  docking.undock(sea);
  assert.deepEqual(sea.course, [], 'out once, then the ship is the player’s to sail');
  assert.equal(docking.docked, null, 'docked no more');
});

test('placed away from its berth, or set on a course of the player’s first, the ship takes no course of itself', async () => {
  const { at } = berth(ASHORE);
  const away: Point2 = [at[0] - 500, at[1]];
  const placedAway = await backAboard(away);
  placedAway.docking.docked = { aim: ASHORE, berth: berth(ASHORE) };
  placedAway.hand(50, away);
  placedAway.hand(120, away);
  placedAway.docking.undock(placedAway.sea);
  assert.deepEqual([placedAway.sea.course, placedAway.docking.docked], [[], null]);
  const steered = await backAboard(at);
  steered.sea.sailTo(place(0, 0));
  const course = steered.sea.course;
  steered.docking.undock(steered.sea);
  assert.deepEqual([steered.sea.course, steered.docking.docked], [course, null], 'the player’s course kept');
});
