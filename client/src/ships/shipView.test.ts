import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Gpu } from '../gpu.ts';
import type { ShipMesh } from './shipMesh.ts';
import { ShipView, shipTurn } from './shipView.ts';

/** Where the turn takes a vector of her own frame, in the world's (east, south, up). */
function turned(turn: Float32Array, vector: readonly [number, number, number]): number[] {
  return [0, 1, 2].map((row) =>
    [0, 1, 2].reduce((sum, column) => sum + (turn[column * 4 + row] ?? 0) * vector[column], 0),
  );
}

function near(found: readonly number[], wanted: readonly number[]): void {
  assert.ok(
    found.every((value, index) => Math.abs(value - (wanted[index] ?? Number.NaN)) < 1e-6),
    `${found.join(', ')} is not ${wanted.join(', ')}`,
  );
}

test('her bow points along her heading and her starboard side to its right', () => {
  near(turned(shipTurn(0, 0, 0), [1, 0, 0]), [0, -1, 0]);
  near(turned(shipTurn(0, 0, 0), [0, 1, 0]), [1, 0, 0]);
  near(turned(shipTurn(Math.PI / 2, 0, 0), [1, 0, 0]), [1, 0, 0]);
  near(turned(shipTurn(Math.PI / 2, 0, 0), [0, 1, 0]), [0, 1, 0]);
});

test('a pitch lifts her bow and a roll puts her starboard side down', () => {
  const pitch = 0.1;
  near(turned(shipTurn(0, pitch, 0), [1, 0, 0]), [0, -Math.cos(pitch), Math.sin(pitch)]);
  const roll = 0.2;
  near(turned(shipTurn(0, 0, roll), [0, 1, 0]), [Math.cos(roll), 0, -Math.sin(roll)]);
  near(turned(shipTurn(0, 0, roll), [0, 0, 1]), [Math.sin(roll), 0, Math.cos(roll)]);
});

/** A GPU whose device takes any call, counting the textures it makes and lets go of. */
function countingGpu(): { gpu: Gpu; made: () => number; destroyed: () => number } {
  let [made, destroyed] = [0, 0];
  const anything = (): unknown =>
    new Proxy(() => undefined, {
      get: (target, key) => (key === 'then' ? undefined : anything()),
      apply: () => anything(),
    });
  const texture = () =>
    new Proxy(
      {},
      {
        get: (target, key) => (key === 'destroy' ? () => (destroyed += 1) : anything()),
      },
    );
  const device = new Proxy(
    {},
    {
      get: (target, key) =>
        key === 'createTexture'
          ? () => {
              made += 1;
              return texture();
            }
          : anything(),
    },
  );
  return { gpu: { device, format: 'bgra8unorm' } as unknown as Gpu, made: () => made, destroyed: () => destroyed };
}

const MESH: ShipMesh = {
  name: 'block',
  vertexCount: 0,
  vertices: new ArrayBuffer(0),
  indices: new Uint32Array(0),
  waterline: { lengthM: 1, beamM: 1, draughtM: 0 },
};

test("every ship drawn on one device shares one upload of the ships' pictures, let go with the last of them", () => {
  const { gpu, made, destroyed } = countingGpu();
  const views = [1, 2, 3].map(() => new ShipView(gpu, MESH, [], 1));
  assert.equal(made(), 1, 'one texture for three ships');
  views[0]?.destroy();
  views[0]?.destroy();
  views[1]?.destroy();
  assert.equal(destroyed(), 0, 'kept while a ship still draws with it');
  views[2]?.destroy();
  assert.equal(destroyed(), 1, 'and let go with the last');
  new ShipView(gpu, MESH, [], 1);
  assert.equal(made(), 2, 'a ship after that uploads it again');
});
