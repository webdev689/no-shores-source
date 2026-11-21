import assert from 'node:assert/strict';
import { test } from 'node:test';
import manifest from '../../../content/modules/modules.json' with { type: 'json' };
import { readModuleMesh } from './modules.ts';
import { pictureBook } from './pictures.ts';

test('a module mesh reads its vertices, normals and triangles', () => {
  const bytes = new ArrayBuffer(8 + 3 * 16 + 12);
  const view = new DataView(bytes);
  view.setUint32(0, 3, true);
  view.setUint32(4, 1, true);
  [
    [0, 0, 0],
    [1, 0, 0],
    [0, 2, 0.5],
  ].forEach((point, vertex) => {
    point.forEach((value, axis) => view.setFloat32(8 + vertex * 16 + axis * 4, value, true));
    view.setInt8(8 + vertex * 16 + 14, 127);
    view.setInt8(8 + vertex * 16 + 15, vertex * 60);
  });
  [0, 2, 1].forEach((index, corner) => view.setUint32(8 + 48 + corner * 4, index, true));
  const mesh = readModuleMesh(bytes);
  assert.deepEqual([...mesh.positions], [0, 0, 0, 1, 0, 0, 0, 2, 0.5]);
  assert.deepEqual([...mesh.normals], [0, 0, 127, 0, 0, 127, 0, 0, 127]);
  assert.deepEqual([...mesh.glows], [0, 60, 120]);
  assert.deepEqual([...mesh.triangles], [0, 2, 1]);
  assert.throws(() => readModuleMesh(bytes.slice(0, 20)), /wrong length/);
});

test("every material a module's surfaces wear is one the page draws, and the first group is never paving", () => {
  const book = pictureBook({ climate: 'temperate', season: 'summer' }, [], [2], () => []);
  for (const module of manifest.modules) {
    assert.notEqual(module.groups[0]?.material, 'paving', module.name);
    for (const group of module.groups) assert.ok(group.material in book.materials, `${module.name}: ${group.material}`);
  }
});
