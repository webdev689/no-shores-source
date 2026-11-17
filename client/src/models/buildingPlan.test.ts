import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { BuildingMeasure, BuildingTable } from './tables.ts';
import { buildingBox, buildingMasses } from './buildingPlan.ts';
import { buildingModel } from './buildings.ts';
import { buildingTable, idsOf, rayHit, vertexOf } from './fixtures.test.ts';

const ids = idsOf(buildingTable);

/** A made-up house: a 6 by 4.8 m box, 8 m high, on a 0.4 m grid, one wing 5.2 by 4 m from 3 m eaves. */
const house = (ridge: number): BuildingMeasure => ({
  min: [-3, 0, -2.4],
  max: [3, 8, 2.4],
  grid: [15, 12],
  walls: [[1, 0, 64, 64]],
  roofs: [[2, 0, 64, 64]],
  looks: [[1, 0, 64, 64]],
  plan: [{ eaves: 3, ridge, rects: [[1, 1, 14, 11]] }],
});

test("a building's masses are its plan's rectangles, inside its box, each from its base to its eaves, under its ridge", () => {
  for (const id of ids) {
    const measure = buildingTable[id];
    const masses = buildingMasses(buildingTable, id);
    assert.equal(
      masses.length,
      measure.plan.reduce((sum, wing) => sum + wing.rects.length, 0),
      `${id}: a mass a rectangle`,
    );
    const rects = measure.plan.flatMap((wing) => wing.rects.map((rect) => ({ wing, top: rect[4] ?? wing.eaves })));
    masses.forEach((mass, k) => {
      assert.ok(
        mass.west >= measure.min[0] - 1e-9 && mass.east <= measure.max[0] + 1e-9 && mass.west < mass.east,
        `${id}: inside along x`,
      );
      assert.ok(
        mass.south >= measure.min[2] - 1e-9 && mass.north <= measure.max[2] + 1e-9 && mass.south < mass.north,
        `${id}: inside along z`,
      );
      assert.equal(
        mass.base,
        rects[k].wing.low ?? measure.min[1],
        `${id}: from the ground, or a covered way's underside`,
      );
      assert.equal(mass.eaves, rects[k].top, `${id}: to its eaves`);
      // The table holds heights to the centimetre, so a top may pass its box's by half of one.
      assert.ok(
        mass.base < mass.eaves && mass.eaves <= mass.ridge && mass.ridge <= measure.max[1] + 0.011,
        `${id}: its ridge over its eaves, in its box`,
      );
      if (mass.roof === 'flat') assert.equal(mass.ridge, mass.eaves, `${id}: a flat mass's ridge is its eaves`);
    });
  }
  assert.deepEqual(buildingMasses(buildingTable, 99999), [], 'an id the Building Forge does not stand');
});

test("a far view's masses stand as the model does: over each mass's middle the model rises to its eaves and no higher than its ridge", () => {
  for (const id of ids) {
    const model = buildingModel(buildingTable, id, { doors: false });
    assert.ok(model);
    const measure = buildingTable[id];
    for (const mass of buildingMasses(buildingTable, id)) {
      // A narrow mass may stand under a taller neighbour's eaves.
      if (mass.east - mass.west < 1.2 || mass.north - mass.south < 1.2) continue;
      const above = measure.max[1] + 1;
      const middle = [(mass.west + mass.east) / 2 + 1e-3, above, (mass.south + mass.north) / 2 + 2e-3];
      const down = rayHit(model, middle, [0, -1, 0], above - measure.min[1] + 1);
      assert.ok(down !== null, `${id}: something over the mass`);
      const top = above - down;
      assert.ok(
        top >= mass.eaves - 0.02 && top <= mass.ridge + 1e-3,
        `${id}: ${top} between ${mass.eaves} and ${mass.ridge}`,
      );
    }
  }
});

test("a mass's roof is the model's: a gable's ridge runs to the roof's ends, a hip's stops short of them; a low pitch is flat", () => {
  const kinds = new Set<string>();
  for (let id = 1; id <= 40; id++) {
    const table: BuildingTable = { [id]: house(6) };
    const [mass] = buildingMasses(table, id);
    const model = buildingModel(table, id);
    assert.ok(model);
    assert.equal(mass.ridgeAlong, 'x', `${id}: the ridge along the longer side`);
    assert.ok(Math.abs(mass.ridge - (3 + 0.9 * 2.3)) < 1e-9, `${id}: the roof as steep as the forge lays it`);
    const atRidge: number[] = [];
    for (let k = 0; k < model.positions.length / 3; k++) {
      const corner = vertexOf(model, k);
      if (Math.abs(corner[1] - mass.ridge) < 1e-4) atRidge.push(Math.abs(corner[0]));
    }
    assert.ok(atRidge.length > 0, `${id}: the model reaches the mass's ridge`);
    const reach = Math.max(...atRidge);
    if (mass.roof === 'gable')
      assert.ok(reach > mass.east, `${id}: a gable's ridge runs out over its eaves (${reach})`);
    else
      assert.ok(
        mass.roof === 'hip' && reach < mass.east - 1,
        `${id}: a hip's ridge stops short of its ends (${reach})`,
      );
    kinds.add(mass.roof);
  }
  assert.deepEqual([...kinds].sort(), ['gable', 'hip'], 'both roofs among forty seeds');
  const [flat] = buildingMasses({ 1: house(3.2) }, 1);
  assert.deepEqual([flat.roof, flat.ridge], ['flat', 3]);
});

test("a building's box is its table's, its sides named as a mass's", () => {
  const measure = buildingTable[446];
  assert.deepEqual(buildingBox(buildingTable, 446), {
    west: measure.min[0],
    east: measure.max[0],
    south: measure.min[2],
    north: measure.max[2],
    base: measure.min[1],
    top: measure.max[1],
  });
  assert.equal(buildingBox(buildingTable, 99999), null);
});
