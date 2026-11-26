import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Point2 } from '../overworld/ground.ts';
import { ANCHORED_APART_M, berthOf, coastBerth, freePlaces, LEAD_M, portBerth, TAKEN_M } from './berths.ts';
import { approach, type IsleAt } from './isleLaw.ts';
import { OFFSHORE, offshore, offshoreStretch } from './seaLaw.ts';

/** Land west of x = 1000, the sea shelving away east of it: 1 m down a metre. */
const shore = (x: number) => (x < 1000 ? 10 : 1000 - x);
const apart = (one: Point2, other: Point2) => Math.hypot(one[0] - other[0], one[1] - other[1]);

test('the stretch off a shore runs from where it is first deep and off the land to its clearance on', () => {
  const { inshore, offing } = offshoreStretch((east) => shore(east), [0, 500], [900, 500]);
  const deep = 1000 + OFFSHORE.depthM;
  assert.ok(inshore[0] >= deep && inshore[0] <= deep + OFFSHORE.stepM, `${inshore[0]}`);
  assert.deepEqual(
    offing,
    offshore((east) => shore(east), [0, 500], [900, 500]),
    'its far end the roadstead',
  );
  // The room's coast reaches farther out than the ground's shore: the stretch starts off it.
  const coast = (point: Point2) => point[0] < 1500;
  const off = offshoreStretch((east) => shore(east), [0, 500], [900, 500], coast);
  assert.ok(off.inshore[0] >= 1500 && off.inshore[0] <= 1500 + OFFSHORE.stepM, `${off.inshore[0]}`);
  assert.ok(off.offing[0] - off.inshore[0] >= OFFSHORE.clearM);
});

/** A port whose city stands west of its harbour on the shore, its pier's two places off it, the sea deep east. */
const HARBOUR: Point2 = [900, 500];
const PLACES = [
  [1_050, 490, Math.PI / 2],
  [1_080, 510, Math.PI / 2],
] as const;
const PORT = {
  plan: { centre: [0, 500], harbour: HARBOUR, social: { moorings: PLACES } },
  heightAt: (east: number) => shore(east),
  outline: [] as Point2[],
} as never;
const ROADSTEAD = offshore((east) => shore(east), [0, 500], HARBOUR);
const ship = (x: number, y: number) => ({ x, y });

/** The way in to a place of the pier, its last stretch along the pier from `LEAD_M` out along its bearing (east). */
const along = (x: number, y: number) => ({ at: [x, y], offing: ROADSTEAD, lead: [x + LEAD_M, y] });

test("a port's berth is the first place of its pier no ship lies in, sailed in to from its roadstead along the pier", () => {
  assert.deepEqual(portBerth(PORT, []), along(1_050, 490));
  const first = ship(1_050 + TAKEN_M / 2, 490);
  assert.deepEqual(portBerth(PORT, [first]), along(1_080, 510), 'the first taken');
  assert.deepEqual(
    freePlaces(PLACES, [first, ship(5_000, 5_000)]).map(([x]) => x),
    [1_080],
    'a ship far off takes no place',
  );
});

test('every place of the pier taken, the ship anchors off it at the roadstead, clear of every other ship', () => {
  const pier = [ship(1_050, 490), ship(1_080, 510)];
  assert.deepEqual(portBerth(PORT, pier), { at: ROADSTEAD, offing: ROADSTEAD });
  const anchored = ship(ROADSTEAD[0], ROADSTEAD[1] + 10);
  const { at, offing } = portBerth(PORT, [...pier, anchored]) ?? { at: [0, 0], offing: [0, 0] };
  assert.equal(at[0], ROADSTEAD[0], 'across the way out from the roadstead');
  assert.ok(apart(at, [anchored.x, anchored.y]) >= ANCHORED_APART_M, JSON.stringify(at));
  assert.ok(apart(at, ROADSTEAD) <= 2 * ANCHORED_APART_M, 'as near as it can');
  assert.deepEqual(offing, ROADSTEAD);
  const noPier = { ...(PORT as object), plan: { centre: [0, 500], harbour: HARBOUR, social: {} } } as never;
  assert.deepEqual(portBerth(noPier, []), { at: ROADSTEAD, offing: ROADSTEAD }, 'a port with no pier, its roadstead');
});

test('a port whose water is deep only out along its way finds its anchorage further out, never on another ship', () => {
  // Deep water only in a channel 100 m wide straight out from the harbour: no place across the way out is deep.
  const channel = {
    ...(PORT as object),
    heightAt: (east: number, south: number) => (Math.abs(south - 500) < 50 ? shore(east) : 10),
  };
  const pier = [ship(1_050, 490), ship(1_080, 510)];
  const anchored = ship(ROADSTEAD[0], ROADSTEAD[1]);
  const { at } = portBerth(channel as never, [...pier, anchored]) ?? { at: ROADSTEAD };
  assert.ok(apart(at, [anchored.x, anchored.y]) >= ANCHORED_APART_M, JSON.stringify(at));
  assert.ok(at[0] > ROADSTEAD[0] && at[1] === ROADSTEAD[1], 'further out along the way out');
});

/** A landmass whose coast, as the room charts it, is a square 10 km a side; its ground under the sea everywhere. */
const SQUARE: Point2[] = [
  [0, 0],
  [10_000, 0],
  [10_000, 10_000],
  [0, 10_000],
];
const LAND = { heightAt: () => -50, outline: SQUARE } as never;

test('a coast with no port is berthed at just off the shore nearest the click, its offing 600 m on', () => {
  const { at, offing } = coastBerth(LAND, [300, 6_000]);
  assert.equal(at[1], 6_000, 'straight out from the click');
  assert.ok(at[0] <= -OFFSHORE.stepM && at[0] >= -2 * OFFSHORE.stepM, `a step off the west coast: ${at[0]}`);
  assert.equal(offing[1], 6_000);
  assert.ok(at[0] - offing[0] >= OFFSHORE.clearM && at[0] - offing[0] <= OFFSHORE.clearM + OFFSHORE.stepM);
  assert.deepEqual(coastBerth(LAND, [-4_000, 6_000]).at, at, 'asked from the ship lying off it, the same shore');
});

test('a sea island is berthed at its anchorage, from its offing', () => {
  const cove: IsleAt = {
    seen: { id: 3, seed: '255', at: [0, -50_000], kind: 'cove', continent: 3, found: true },
    built: { reach: 250, anchorage: [0, -50_150], landing: 0 },
  };
  const way = approach(cove);
  const aim = { kind: 'isle', id: 3, words: 'a cove' } as const;
  assert.deepEqual(berthOf(aim, LAND, [cove], []), { at: way?.anchorage, offing: way?.offing });
  assert.equal(berthOf({ ...aim, id: 4 }, LAND, [cove], []), null, 'an island not told of');
  const ashore = { kind: 'ashore', coast: 'Saltmere', toward: [300, 6_000] } as const;
  assert.deepEqual(berthOf(ashore, LAND, [], []), coastBerth(LAND, [300, 6_000]));
  // Another ship anchored there already: this one anchors out along the way in, clear of her, its offing beyond it.
  const other = ship(0, -50_150);
  const clear = berthOf(aim, LAND, [cove], [other]);
  assert.ok(clear && apart(clear.at, [other.x, other.y]) >= ANCHORED_APART_M, JSON.stringify(clear));
  assert.equal(clear?.at[0], 0, 'on its way in');
  assert.ok((clear?.offing[1] ?? 0) < (clear?.at[1] ?? 0), 'its offing still out beyond it');
});
