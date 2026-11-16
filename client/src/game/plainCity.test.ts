import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VERTEX_FLOATS } from './meshes.ts';
import { type PlanSolid, plainCityMesh } from './plainCity.ts';

/** The span of a mesh's vertices along an axis, rounded to the millimetre. */
function span(mesh: Float32Array, axis: number): [number, number] {
  const values: number[] = [];
  for (let start = axis; start < mesh.length; start += VERTEX_FLOATS) values.push(mesh[start] ?? Number.NaN);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return [round(Math.min(...values)), round(Math.max(...values))];
}

const block: PlanSolid = { shape: 'block', at: [100, 200, 10], size: [4, 2, 3], turn: 0, material: 'stone' };

test('a block stands on the middle of its base, x east and y north of the anchor, from its foot up', () => {
  const mesh = plainCityMesh([block], [100, 200]);
  assert.equal(mesh.length / VERTEX_FLOATS, 30, 'four sides and a top, two triangles each');
  assert.deepEqual(span(mesh, 0), [-2, 2]);
  assert.deepEqual(span(mesh, 1), [-1, 1]);
  assert.deepEqual(span(mesh, 2), [10, 13]);
});

test('a solid turned a quarter clockwise lays its width north and south', () => {
  const mesh = plainCityMesh([{ ...block, turn: Math.PI / 2 }], [100, 200]);
  assert.deepEqual(span(mesh, 0), [-1, 1]);
  assert.deepEqual(span(mesh, 1), [-2, 2]);
});

test('a column is round with its own faces, a cone has no top, and a dome rises to its crown', () => {
  const column = plainCityMesh([{ ...block, shape: 'column', sides: 8, top: 1 }], [100, 200]);
  assert.equal(column.length / VERTEX_FLOATS, (8 * 2 + 6) * 3);
  const cone = plainCityMesh([{ ...block, shape: 'column', sides: 8, top: 0 }], [100, 200]);
  assert.equal(cone.length / VERTEX_FLOATS, 8 * 3, 'one triangle a side, meeting at the point');
  const dome = plainCityMesh([{ ...block, shape: 'dome', sides: 8, size: [10, 10, 5] }], [100, 200]);
  assert.deepEqual(span(dome, 2), [10, 15]);
  assert.deepEqual(span(dome, 0), [-5, 5]);
});
