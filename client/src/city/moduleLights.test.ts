import assert from 'node:assert/strict';
import { test } from 'node:test';
import { breachLamp, propLamps } from './eventProps.ts';
import { LIGHT_CELL_M, lightsOf } from './moduleLights.ts';

const group = (material: string, points: readonly (readonly number[])[], glow = 0) => ({
  material,
  positions: Float32Array.from(points.flat()),
  glows: Uint8Array.from(points.map(() => Math.round(glow * 127))),
});

test("a module's light is gathered from what of it burns: a row of candles one lamp, a crystal across the room another", () => {
  const candles = group('glow', [
    [0.2, 0.2, 1],
    [0.8, 0.2, 1],
    [1.4, 0.2, 1],
  ]);
  const crystal = group('crystal', [[20.5, 0.5, 2.5]], 0.5);
  const stone = group('stone', [[0.5, 0.5, 0.5]]);
  const lights = lightsOf([stone, candles, crystal]);
  assert.equal(lights.length, 2, 'stone gives none');
  const [fire, red] = lights;
  assert.equal(fire?.kind, 'fire');
  assert.ok(Math.abs((fire?.at[0] ?? NaN) - 0.8) < 1e-6, 'at the middle of the row');
  assert.equal(red?.kind, 'crystal');
  assert.ok(Math.abs((red?.glow ?? NaN) - 64 / 127) < 1e-6, 'glowing as its vertices do');
});

test('stained glass lights as glass, and lit cells further apart than a cell are lamps apart', () => {
  const panes = group('glass', [
    [0, 0, 5],
    [LIGHT_CELL_M * 2, 0, 5],
  ]);
  const lights = lightsOf([panes]);
  assert.deepEqual(
    lights.map((light) => light.kind),
    ['glass', 'glass'],
  );
});

test("a Breach's piece whose meshes have not come lights nothing yet, and asks again", () => {
  const seal = { module: 'breach-seal', at: [0, 0, 0] as const, turn: 0, scale: 1, rise: 1, lid: 0, glow: 1 };
  assert.deepEqual(propLamps([seal]), []);
});

test("a crystal lying across a cell's edge is one lamp, not one each side of it", () => {
  const bell = group(
    'crystal',
    [
      [-0.4, -0.4, 2],
      [0.4, -0.4, 2],
      [-0.4, 0.4, 2],
      [0.4, 0.4, 2],
    ],
    0.6,
  );
  const lights = lightsOf([bell]);
  assert.equal(lights.length, 1);
  assert.deepEqual(lights[0]?.at, [0, 0, 2]);
});

test("a crystal's lamp is as bright as the crystal glows: a dark root lights little, a lit point fully; a fire always", () => {
  const asIs = (local: readonly [number, number, number]) => local;
  const root = breachLamp({ at: [0, 0, 0], kind: 'crystal', glow: 0.075 }, 1, 1, asIs);
  const point = breachLamp({ at: [0, 0, 0], kind: 'crystal', glow: 0.15 }, 1, 1, asIs);
  assert.ok((root.light[0] ?? 0) * 3.9 < (point.light[0] ?? 0), 'a root at half the glow lights a quarter as much');
  assert.equal(point.light[0], 1);
  const fire = breachLamp({ at: [0, 0, 0], kind: 'fire', glow: 0 }, 1, 2, asIs);
  assert.equal(fire.light[0], 1);
  assert.equal(fire.reachM, 20, 'its reach scaled with its piece');
});

test("a lamp whose middle falls inside one of the module's solids stands out at the solid's nearest face", () => {
  // Crystal grown over a wall's west face, gathered to a middle inside the wall.
  const crust = group(
    'crystal',
    [
      [-21.5, 6, 4.5],
      [-21.9, 6, 3],
    ],
    0.3,
  );
  const wall = [-22, 2, 0, -14, 10, 5.2];
  const [lamp] = lightsOf([crust], [wall]);
  const [x = 0, y = 0, z = 0] = lamp?.at ?? [];
  const inside = x > -22 && x < -14 && y > 2 && y < 10 && z > 0 && z < 5.2;
  assert.ok(!inside, `out of the wall: ${lamp?.at.join(', ')}`);
  assert.ok(Math.abs(x - -22) < 0.5, 'by its west face, the nearest');
});

test('a lamp inside two overlapping solids leaves them both, through the nearest face that comes out clear', () => {
  const crust = group(
    'crystal',
    [
      [5, 1.4, 2],
      [5, 1.6, 2],
    ],
    0.3,
  );
  const [lamp] = lightsOf(
    [crust],
    [
      [0, 0, 0, 10, 1, 5],
      [0, 0.9, 0, 10, 3, 5],
    ],
  );
  const [x = 0, y = 0, z = 0] = lamp?.at ?? [];
  const inside = (box: number[]) =>
    x > box[0]! && x < box[3]! && y > box[1]! && y < box[4]! && z > box[2]! && z < box[5]!;
  assert.ok(!inside([0, 0, 0, 10, 1, 5]) && !inside([0, 0.9, 0, 10, 3, 5]), `in neither: ${lamp?.at.join(', ')}`);
});
