import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emberBox, isleLights } from './isleLights.ts';
import { type KitPack, MODULE_NAMES, PARTS, VERTEX_BYTES } from './isleModules.ts';
import type { IslePlacement, IsleShown } from './islePlan.ts';

/** A pack of one module whose vertices stand at `points`, each wearing `parts`' part of the same place. */
function packOf(module: string, points: readonly (readonly [number, number, number])[], parts: readonly string[]) {
  const vertices = new Uint8Array(points.length * VERTEX_BYTES);
  const floats = new Float32Array(vertices.buffer);
  points.forEach((point, vertex) => {
    floats.set(point, (vertex * VERTEX_BYTES) / 4);
    vertices[vertex * VERTEX_BYTES + 24] = PARTS.indexOf(parts[vertex] ?? 'ember');
  });
  const entry = { name: module, vertexStart: 0, vertexCount: points.length, indexStart: 0, indexCount: 0 };
  return { kit: 'common', vertices, indices: new Uint32Array(), modules: new Map([[module, entry]]) } as KitPack;
}

const isle = (placements: IslePlacement[]): IsleShown =>
  ({ id: 1, at: [1000, 2000], climate: 'temperate', plan: { placements }, heights: new Float64Array() }) as never;

test("an ember's box is the box round every vertex wearing it, none for a module without", () => {
  const pack = packOf(
    'common.camp.fire',
    [
      [-0.3, -0.3, 0],
      [0.3, 0.3, 0.18],
      [2, 2, 2],
    ],
    ['ember', 'ember', 'bark'],
  );
  const box = emberBox(pack, 'common.camp.fire') ?? [];
  assert.deepEqual(
    [...box].map((value) => Math.round(value * 100) / 100),
    [-0.3, -0.3, 0, 0.3, 0.3, 0.18],
  );
  assert.equal(emberBox(packOf('common.camp.fire', [[0, 0, 0]], ['bark']), 'common.camp.fire'), null);
});

test("a camp fire's coals burn a fire that casts; a lantern's glass a flame lit by its lamp; a cold one nothing", () => {
  const [camp, lamp] = [MODULE_NAMES.indexOf('common.camp.fire'), MODULE_NAMES.indexOf('passage.lamp')];
  const boxes: Record<string, readonly [number, number, number, number, number, number]> = {
    'common.camp.fire': [-0.3, -0.3, 0, 0.3, 0.3, 0.18],
    'passage.lamp': [-0.16, -0.16, 2.95, 0.16, 0.16, 3.46],
    'passage.mouth.open': [-1, -0.2, 0, 1, 0.2, 2],
  };
  const lights = isleLights(
    [
      isle([
        [camp, 10, 20, 5, 0, 1, 1],
        [lamp, 0, 0, 1, 0, 1, 1, 0],
        [lamp, 30, 0, 1, 0, 1, 1, 1],
        [MODULE_NAMES.indexOf('passage.mouth.open'), 5, 5, 0, 0, 1, 1],
      ]),
    ],
    (module) => boxes[module] ?? null,
  );
  assert.equal(lights.fires.length, 2, 'the camp and the lit lamp; the cold lamp and the mouth none');
  const [fire, flame] = lights.fires;
  assert.ok(fire?.casts && (fire?.sizeM ?? 0) >= 0.5);
  assert.deepEqual(fire?.at.slice(0, 2), [1010, 2020]);
  assert.ok(flame && !flame.casts && flame.at[2] > 3.9 && flame.at[2] < 4.21, 'in its glass');
  assert.equal(lights.lamps.length, 1);
  assert.equal(lights.lamps[0]?.seed, flame?.seed);
  assert.equal(lights.lamps[0]?.motion, 'lantern');
});
