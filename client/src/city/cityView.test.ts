import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interleaved } from './cityView.ts';

test("a city's solids are laid for the GPU vertex by vertex: position, normal, UV, then the layer whole", () => {
  const solids = {
    positions: [1, 2, 3, 4, 5, 6],
    normals: [0, 0, 1, 0, 1, 0],
    uvs: [0.5, 0.25, 2, 3],
    layers: [7, 9],
    indices: [0, 1, 0],
  };
  const bytes = interleaved(solids);
  const floats = new Float32Array(bytes);
  const whole = new Uint32Array(bytes);
  assert.deepEqual([...floats.subarray(0, 8)], [1, 2, 3, 0, 0, 1, 0.5, 0.25]);
  assert.deepEqual([...floats.subarray(9, 17)], [4, 5, 6, 0, 1, 0, 2, 3]);
  assert.deepEqual([whole[8], whole[17]], [7, 9]);
});
