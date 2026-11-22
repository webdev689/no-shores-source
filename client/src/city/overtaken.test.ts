import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MassShape } from './cityMasses.ts';
import {
  buildingGrowth,
  clearOfPlaza,
  type CrystalPlace,
  crystalLamps,
  formationMeshes,
  FORMATIONS,
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

/** The highest a formation placed in the world reaches, metres. */
const placedTop = (place: CrystalPlace): number => place.at[2] + Math.max(...FORMATIONS[place.formation].map(top));

test('most buildings are overtaken, some heavily and some lightly, a few untouched, each by its place', () => {
  const count = 1500;
  let [untouched, heavy] = [0, 0];
  const breakAt = HOUSE.base + HOUSE.wall;
  for (let k = 0; k < count; k++) {
    const place: [number, number] = [480_000 + k * 37.31, 2_270_000 + k * 11.7];
    const growth = buildingGrowth(HOUSE, place, place);
    assert.deepEqual(growth, buildingGrowth(HOUSE, place, place), 'the same every time');
    if (!growth.placed.length) {
      assert.equal(growth.great.length + growth.detail.length, 0);
      untouched++;
      continue;
    }
    const highest = Math.max(...growth.placed.map(placedTop), ...[...growth.great, ...growth.detail].map(top));
    if (highest > breakAt + HOUSE.wall * 0.6) heavy++;
    // the growth hugs its building: every foot within a few metres of its walls, none under its floor or over its break
    for (const { at } of [
      ...growth.placed,
      ...growth.great.filter((solid) => solid.shape === 'column' && solid.top > 0),
    ]) {
      assert.ok(Math.hypot(at[0] - place[0], at[1] - place[1]) < Math.hypot(6, 4) + 4.5, `${at}`);
      assert.ok(at[2] >= HOUSE.base - 0.5 && at[2] <= breakAt, `${at[2]}`);
    }
    assert.ok(growth.placed.length >= 2 && growth.placed.length <= 32, `${growth.placed.length} formations`);
  }
  assert.ok(Math.abs(untouched / count - OVERTAKEN.untouched) < 0.03, `${untouched} untouched`);
  assert.ok(Math.abs(heavy / count - OVERTAKEN.heavy) < 0.04, `${heavy} heavy`);
});

test('a heavily overtaken building has veins up its walls, crystal at its foot and a great spire over its break', () => {
  const places = Array.from(
    { length: 200 },
    (_unused, k) => [500_000 + k * 13.1, 2_000_000 + k * 7.9] as [number, number],
  );
  const heavy = places
    .map((place) => buildingGrowth(HOUSE, place, place))
    .find((growth) => growth.great.some((solid) => top(solid) > HOUSE.base + HOUSE.wall * 1.6));
  assert.ok(heavy, 'some building is heavily overtaken');
  const low = heavy.placed.filter((place) => place.at[2] < HOUSE.base + 1);
  const climbing = heavy.placed.filter((place) => place.at[2] > HOUSE.base + 1 && place.at[2] < HOUSE.base + 5);
  assert.ok(low.length >= 6 && climbing.length >= 4, `${low.length} at its foot, ${climbing.length} climbing`);
});

test('every formation is made of six-sided crystal pieces, the same on every load, a few large among many small', () => {
  assert.equal(FORMATIONS.length, 28);
  for (const solids of FORMATIONS) {
    assert.ok(solids.length >= 2 && solids.every((solid) => solid.material === 'crystal' && solid.shape === 'column'));
    assert.ok(Math.max(...solids.map(top)) < GREAT_M, 'small: the great spires are solids of their own');
  }
  const meshes = formationMeshes(9);
  assert.ok(meshes.every((mesh) => mesh.layers.every((layer) => layer === 9)));
  // a forged model's frame: up is its y, so a formation stands up off its foot
  assert.ok(meshes.every((mesh) => Math.max(...mesh.positions.filter((_unused, k) => k % 3 === 1)) > 0.3));
});

test('a fallen heap has a formation rising from its heart, over the heap', () => {
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
  const grown = growths.filter((growth) => growth.placed.length > 0);
  assert.ok(grown.length >= 35, `${grown.length} of 50`);
  for (const growth of grown) {
    assert.ok(Math.max(...growth.placed.map(placedTop)) > 10 + 2 + 1, 'it rises over the heap');
    assert.ok(growth.placed.every((place) => Math.hypot(place.at[0] - 100, place.at[1] - 200) < 1e-9));
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

test('a heavily overtaken building, however low it stands, has a spire standing well over its break', () => {
  const low = { ...HOUSE, wall: 2.5 };
  const grown = Array.from({ length: 300 }, (_unused, k) => buildingGrowth(low, [0, 0], [k * 41.3, k * 9.1]));
  const spired = grown.filter((growth) => growth.great.length + growth.detail.length > 0);
  assert.ok(Math.abs(spired.length / 300 - OVERTAKEN.heavy) < 0.07, `${spired.length} of 300`);
  for (const growth of spired) {
    const spire = [...growth.great, ...growth.detail];
    assert.ok(Math.max(...spire.map(top)) >= low.base + low.wall + 4, 'over its break');
    // only the tallest are drawn at every distance
    assert.equal(growth.great.length > 0, spire[0].size[2] / 0.75 >= GREAT_M);
  }
});

test("a spire by the plaza's window is kept or left out whole, its body and tip together", () => {
  const plan = { social: { bounds: [0, 0, 100, 50] } } as unknown as CityPlan;
  // leaning toward the window: its tip reaches in where its body does not
  const leaning = spire([-116, 25, 0], 12, 2, [Math.atan2(-1, 0), 0.5, 0]);
  const upright = spire([-116, 25, 0], 12, 2, [0, 0, 0]);
  assert.deepEqual(clearOfPlaza([...leaning, ...upright], plan), upright);
});

test("the plaza's window holds no crystal the page lays", () => {
  const plan = { social: { bounds: [0, 0, 100, 50] } } as unknown as CityPlan;
  assert.ok(inPlazaWindow([-100, 25], 3, plan) && inPlazaWindow([-112, 25], 3, plan));
  assert.ok(!inPlazaWindow([-115, 25], 3, plan) && !inPlazaWindow([50, 200], 3, plan));
});
