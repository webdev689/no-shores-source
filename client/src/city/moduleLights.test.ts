import assert from 'node:assert/strict';
import { test } from 'node:test';
import { propLamps } from './eventProps.ts';
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
