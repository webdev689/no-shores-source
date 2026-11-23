import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyMesh, laidMeshSteps } from './mesh.ts';
import { finished } from './steps.ts';

test('meshes are laid end to end for the GPU vertex by vertex: position, normal, UV, then the layer whole', () => {
  const first = {
    positions: [1, 2, 3, 4, 5, 6],
    normals: [0, 0, 1, 0, 1, 0],
    uvs: [0.5, 0.25, 2, 3],
    layers: [7, 9],
    indices: [0, 1, 0],
  };
  const second = { positions: [7, 8, 9], normals: [1, 0, 0], uvs: [1, 1], layers: [4], indices: [0, 0, 0] };
  const laid = finished(laidMeshSteps([first, emptyMesh(), second]));
  const floats = new Float32Array(laid.vertices);
  const whole = new Uint32Array(laid.vertices);
  assert.deepEqual([...floats.subarray(0, 8)], [1, 2, 3, 0, 0, 1, 0.5, 0.25]);
  assert.deepEqual([...floats.subarray(9, 17)], [4, 5, 6, 0, 1, 0, 2, 3]);
  assert.deepEqual([...floats.subarray(18, 26)], [7, 8, 9, 1, 0, 0, 1, 1]);
  assert.deepEqual([whole[8], whole[17], whole[26]], [7, 9, 4]);
  assert.deepEqual([...laid.indices], [0, 1, 0, 2, 2, 2], "each mesh's indices counted past the vertices before it");
  assert.deepEqual(laid.ranges, [
    { first: 0, count: 3 },
    { first: 3, count: 0 },
    { first: 3, count: 3 },
  ]);
});
