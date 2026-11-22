import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PropTable } from '../models/tables.ts';
import { beforeDoor, doorOf, entranceAt, entrancesOf, standOf, turned } from './entrances.ts';

/** Entrance model 0 (42000) with its door as the forged props measure it. */
const props = {
  42000: {
    min: [-2.2, -2.5, -1.7],
    max: [2.2, 2.9, 2.3],
    looks: [],
    doors: [
      { type: 2, a: [-0.634, 0.045, -1.692], b: [-0.634, -2.205, -1.692], c: [0.616, -2.205, -1.692], n: [0, 0, -1] },
    ],
  },
} as unknown as PropTable;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("a patrol's entrances are five numbers each: x, y, the ground, the yaw and the model", () => {
  assert.deepEqual(entrancesOf([10, 20, 3, 0.5, 1, 30, 40, 4, 0, 0, 99]), [
    { x: 10, y: 20, ground: 3, yaw: 0.5, model: 1 },
    { x: 30, y: 40, ground: 4, yaw: 0, model: 0 },
  ]);
});

test("a model's +z faces north at yaw 0 and east at a quarter turn, as the city turns its models", () => {
  const north = turned([0, 1, 1], 0);
  assert.ok(near(north[0], 0) && near(north[1], -1) && north[2] === 1);
  const east = turned([0, 0, 1], Math.PI / 2);
  assert.ok(near(east[0], 1) && near(east[1], 0));
});

test('an entrance stands lifted by its block, and its door is its quad’s middle, turned and lifted', () => {
  const entrance = { x: 100, y: 200, ground: 10, yaw: 0, model: 0 };
  assert.deepEqual(standOf(entrance), [100, 200, 12.5]);
  const door = doorOf(entrance, props);
  assert.ok(door);
  const [x, y, z] = door.middle;
  assert.ok(near(x, 100 - 0.009) && near(y, 200 + 1.692) && near(z, 12.5 - 1.08));
  assert.ok(near(door.out[0], 0) && near(door.out[1], 1), 'model 42000’s door looks along -z: south at yaw 0');
});

test('E reaches a door within 2.5 m across the ground, and a player leaving stands 1.5 m before it facing out', () => {
  const entrances = [{ x: 100, y: 200, ground: 0, yaw: 0, model: 0 }];
  assert.equal(entranceAt(entrances, props, 100, 201.692 + 2.4), 0);
  assert.equal(entranceAt(entrances, props, 100, 201.692 + 2.6), null);
  const before = beforeDoor(entrances[0] ?? entrances[0], props);
  assert.ok(before && near(before.y, 201.692 + 1.5) && near(before.facing, Math.PI), 'facing south, away from it');
});
