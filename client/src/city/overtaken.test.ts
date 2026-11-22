import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MassShape } from './cityMasses.ts';
import {
  buildingGrowth,
  crystalLamps,
  GREAT_M,
  heapGrowth,
  inPlazaWindow,
  OVERTAKEN,
  spire,
  wreckCrust,
} from './overtaken.ts';
import type { CityPlan, Solid } from './plan.ts';
import { solidTurn } from './solidMesh.ts';

const top = (solid: Solid): number => solid.at[2] + solidTurn(solid, [0, 0, solid.size[2]])[2];

test("a spire's tip stands on its leaning body, where the city crate stands it", () => {
  const [body, tip] = spire([10, 20, 5], 8, 2, [0.3, 0.4, 0.1]);
  assert.deepEqual([body.shape, tip.shape], ['column', 'column']);
  assert.equal(tip.material, 'crystal');
  // crates/city/src/overtaken.rs a_spires_tip_stands_on_its_leaning_body holds the same place
  assert.ok(Math.abs(tip.at[0] - 9.885211) < 1e-5 && Math.abs(tip.at[1] - 22.398019) < 1e-5, `${tip.at}`);
  assert.ok(Math.abs(tip.at[2] - 10.498757) < 1e-5, `${tip.at}`);
  assert.ok(tip.shape === 'column' && tip.top === 0 && Math.abs(tip.size[0] - 1.6) < 1e-12);
});

/** A house 12 m by 8 m, its walls broken off 6 m up, somewhere in the world. */
const HOUSE: MassShape = {
  east: 0,
  south: 0,
  base: 30,
  turn: 0.4,
  halfAlong: 6,
  halfAcross: 4,
  wall: 6,
  rise: 0,
  hip: false,
};

test('most buildings are overtaken, some heavily and some lightly, a few untouched, each by its place', () => {
  const count = 1500;
  let [untouched, heavy] = [0, 0];
  for (let k = 0; k < count; k++) {
    const place: [number, number] = [480_000 + k * 37.31, 2_270_000 + k * 11.7];
    const growth = buildingGrowth(HOUSE, place, place);
    assert.deepEqual(growth, buildingGrowth(HOUSE, place, place), 'the same every time');
    const all = [...growth.great, ...growth.detail];
    if (!all.length) {
      untouched++;
      continue;
    }
    assert.ok(all.every((solid) => solid.material === 'crystal' && solid.shape === 'column'));
    const highest = Math.max(...all.map(top));
    const breakAt = HOUSE.base + HOUSE.wall;
    if (highest > breakAt + HOUSE.wall * 0.6) heavy++;
    // the growth hugs its building: every foot within a few metres of its walls, none under its floor
    for (const solid of all) {
      const [east, south] = [solid.at[0] - place[0], solid.at[1] - place[1]];
      assert.ok(Math.hypot(east, south) < Math.hypot(6, 4) + 7, `${east}, ${south}`);
      assert.ok(solid.at[2] >= HOUSE.base - 0.5, `${solid.at[2]}`);
      // every spire's body and every shard grows from the building, up to its break; only a tip stands over it
      if (solid.shape === 'column' && solid.top > 0) assert.ok(solid.at[2] <= breakAt + 0.5, `${solid.at[2]}`);
    }
    assert.ok(all.length >= 8 && all.length <= 160, `${all.length} solids`);
    assert.ok(
      growth.detail.every((solid) => solid.size[2] < GREAT_M),
      'the detail is small',
    );
  }
  assert.ok(Math.abs(untouched / count - OVERTAKEN.untouched) < 0.03, `${untouched} untouched`);
  assert.ok(Math.abs(heavy / count - OVERTAKEN.heavy) < 0.04, `${heavy} heavy`);
});

test('a heavily overtaken building has veins up its corners, shards at its foot and great spires over its break', () => {
  const places = Array.from(
    { length: 200 },
    (_unused, k) => [500_000 + k * 13.1, 2_000_000 + k * 7.9] as [number, number],
  );
  const heavy = places
    .map((place) => buildingGrowth(HOUSE, place, place))
    .find((growth) => growth.great.some((solid) => top(solid) > HOUSE.base + HOUSE.wall * 1.6));
  assert.ok(heavy, 'some building is heavily overtaken');
  const low = heavy.detail.filter((solid) => solid.at[2] < HOUSE.base + 1);
  const climbing = heavy.detail.filter((solid) => solid.at[2] > HOUSE.base + 2 && solid.at[2] < HOUSE.base + 5);
  assert.ok(low.length >= 6 && climbing.length >= 6, `${low.length} at its foot, ${climbing.length} climbing`);
});

test('a fallen heap has a cluster rising from its heart, taller than the heap', () => {
  const heap: Solid = {
    shape: 'pyramid',
    top: 0.3,
    at: [100, 200, 10],
    size: [12, 8, 2],
    turn: 0.2,
    lean: 0,
    roll: 0,
    material: 'rubble',
  };
  const growths = Array.from({ length: 50 }, (_unused, k) => heapGrowth(heap, [k * 31.7, k * 3.3]));
  const grown = growths.filter((growth) => growth.great.length + growth.detail.length > 0);
  assert.ok(grown.length >= 35, `${grown.length} of 50`);
  for (const growth of grown) {
    const all = [...growth.great, ...growth.detail];
    assert.ok(Math.max(...all.map(top)) > 10 + 2 * 2, 'it rises over the heap');
    assert.ok(all.every((solid) => Math.hypot(solid.at[0] - 100, solid.at[1] - 200) < 6));
  }
});

test("a wreck is crusted at the waterline round its hull, as long as its ship's", () => {
  const crust = wreckCrust({ ship: 'schooner', at: [5000, 6000], heading: 1, heel: 0.4 });
  assert.ok(crust.length >= 16, `${crust.length}`);
  for (const solid of crust) {
    assert.ok(Math.abs(solid.at[2]) < 0.6, 'at the water');
    assert.ok(Math.hypot(solid.at[0] - 5000, solid.at[1] - 6000) < 20);
  }
  assert.deepEqual(crust, wreckCrust({ ship: 'schooner', at: [5000, 6000], heading: 1, heel: 0.4 }));
});

test('the great formations light a few lamps of the crystal at night, the tallest', () => {
  const great = [...spire([0, 0, 0], 20, 3, [0, 0, 0]), ...spire([30, 0, 0], 12, 2, [0, 0, 0])];
  const lamps = crystalLamps(great, 1);
  assert.equal(lamps.length, 1);
  assert.ok(lamps[0].at[0] === 0 && lamps[0].at[2] > 0, 'at the tallest');
  assert.equal(crystalLamps([], 3).length, 0);
});

test("the plaza's window holds no crystal the page lays", () => {
  const plan = { social: { bounds: [0, 0, 100, 50] } } as unknown as CityPlan;
  const [inside] = spire([-100, 25, 0], 4, 1, [0, 0, 0]);
  const [outside] = spire([-115, 25, 0], 4, 1, [0, 0, 0]);
  assert.ok(inPlazaWindow(inside, plan) && !inPlazaWindow(outside, plan));
});
