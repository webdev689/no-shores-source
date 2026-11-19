import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VERTEX_BYTES } from '../../ships/shipMesh.ts';
import { SHIP_PARTS } from '../../textures/shipPictures.ts';
import { sceneryMesh } from './wreckScenery.ts';

test("a block that shows is a box of its kind under its top, measured from the origin, in its kind's picture", () => {
  const plank = { kind: 'planks', block: { minX: 11, minY: 21, maxX: 12, maxY: 23, top: 3 } } as const;
  const mesh = sceneryMesh([plank], [10, 20]);
  assert.equal(mesh.vertexCount, 24);
  assert.equal(mesh.indices.length, 36);
  const view = new DataView(mesh.vertices);
  const points = Array.from({ length: mesh.vertexCount }, (unused, vertex) =>
    [0, 1, 2].map((axis) => view.getFloat32(vertex * VERTEX_BYTES + axis * 4, true)),
  );
  const range = (axis: number) => [
    Math.min(...points.map((point) => point[axis] ?? 0)),
    Math.max(...points.map((point) => point[axis] ?? 0)),
  ];
  assert.deepEqual(range(0), [1, 2]);
  assert.deepEqual(range(1), [1, 3]);
  assert.ok(Math.abs((range(2)[0] ?? 0) - 2.88) < 1e-5 && range(2)[1] === 3, 'a plank is thin');
  assert.equal(view.getUint8(24), SHIP_PARTS.indexOf('deck'));
  assert.ok(Math.max(...mesh.indices) < mesh.vertexCount);
});
