import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIP_PARTS } from '../textures/shipPictures.ts';
import { GLASS_SHELL, lanternMesh } from './lanternMesh.ts';
import { HULL_LANTERNS } from './lanterns.ts';
import { VERTEX_BYTES } from './shipMesh.ts';

function vertices(mesh: ReturnType<typeof lanternMesh>) {
  const view = new DataView(mesh.vertices);
  return Array.from({ length: mesh.vertices.byteLength / VERTEX_BYTES }, (unused, vertex) => {
    const byte = vertex * VERTEX_BYTES;
    return {
      at: [0, 4, 8].map((offset) => view.getFloat32(byte + offset, true)),
      normal: [12, 13, 14].map((offset) => view.getInt8(byte + offset) / 127),
      part: view.getUint8(byte + 24),
      shell: view.getUint8(byte + 25),
    };
  });
}

test('a lantern of ours is glass round its middle under an iron cap, over an iron foot, on its pole', () => {
  const mesh = lanternMesh([{ at: [1, 2, 5], hung: { pole: 3 } }]);
  const all = vertices(mesh);
  const glass = all.filter((vertex) => vertex.shell === GLASS_SHELL);
  assert.ok(glass.length > 0);
  for (const vertex of glass) assert.ok(Math.abs((vertex.at[2] ?? 0) - 5) <= 0.2, 'glass about its middle');
  assert.ok(all.some((vertex) => vertex.part === SHIP_PARTS.indexOf('iron') && vertex.shell === 0));
  const pole = all.filter((vertex) => vertex.part === SHIP_PARTS.indexOf('spar'));
  assert.ok(Math.min(...pole.map((vertex) => vertex.at[2] ?? 0)) <= 3.0001, 'its pole stands from the rail');
  assert.ok(mesh.indices.every((corner) => corner < all.length));
  // Each glass face's normal points out from its middle.
  for (const vertex of glass.filter((each) => Math.abs(each.normal[2] ?? 0) < 0.5)) {
    const outward =
      (vertex.normal[0] ?? 0) * ((vertex.at[0] ?? 0) - 1) + (vertex.normal[1] ?? 0) * ((vertex.at[1] ?? 0) - 2);
    assert.ok(outward > 0, 'glass faces outward');
  }
});

test('a lantern the mesh carries is only sleeved in glass', () => {
  const all = vertices(lanternMesh([{ at: [0, 0, 4], hung: 'built' }]));
  assert.ok(all.length > 0 && all.every((vertex) => vertex.shell === GLASS_SHELL));
});

test('every hull carries lanterns at its stern and its quarters', () => {
  for (const [hull, lanterns] of Object.entries(HULL_LANTERNS)) {
    assert.ok(lanterns.length >= 3, hull);
    const sterns = lanterns.filter((lantern) => lantern.at[1] === 0);
    assert.equal(sterns.length, 1, `${hull}'s taffrail`);
    assert.ok(lanterns.some((lantern) => lantern.at[1] > 1) && lanterns.some((lantern) => lantern.at[1] < -1));
  }
});
