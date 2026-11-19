import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ShipMesh } from '../ships/shipMesh.ts';
import { VERTEX_BYTES } from '../ships/shipMesh.ts';
import { brokenMesh, settledDepth } from './wrecks.ts';

test("a wreck keeps every face under her masts' stumps, and settles to her deck", () => {
  const heights = [0, 1, 2, 9, 12];
  const vertices = new ArrayBuffer(heights.length * VERTEX_BYTES);
  heights.forEach((height, k) => new DataView(vertices).setFloat32(k * VERTEX_BYTES + 8, height, true));
  const mesh: ShipMesh = {
    name: 'test',
    vertexCount: heights.length,
    vertices,
    indices: new Uint32Array([0, 1, 2, 1, 2, 3, 2, 3, 4]),
    waterline: { lengthM: 10, beamM: 3, draughtM: 1 },
  };
  assert.deepEqual([...brokenMesh(mesh, 5).indices], [0, 1, 2]);
  for (const ship of ['sloop', 'schooner'] as const) {
    const depth = settledDepth(ship);
    assert.ok(depth > 1 && depth < 3, `${ship} settles ${depth} m`);
  }
});
