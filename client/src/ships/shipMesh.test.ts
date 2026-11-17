import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readShipMesh, VERTEX_BYTES } from './shipMesh.ts';

const WATERLINE = { length_m: 6, beam_m: 2, draught_m: 0.5 };

/** A mesh file as the export writes it: its header, padded, then the vertices and the indices. */
function meshFile(vertices: number, indices: readonly number[], claimed = vertices): ArrayBuffer {
  const header = JSON.stringify({
    name: 'square',
    vertices: claimed,
    indices: indices.length,
    bounds: [
      [-1, -1, 0],
      [1, 1, 0],
    ],
    waterline: WATERLINE,
  });
  const text = new TextEncoder().encode(header + ' '.repeat((4 - ((4 + header.length) % 4)) % 4));
  const bytes = new ArrayBuffer(4 + text.length + vertices * VERTEX_BYTES + indices.length * 4);
  const view = new DataView(bytes);
  view.setUint32(0, text.length, true);
  new Uint8Array(bytes, 4).set(text);
  const start = 4 + text.length;
  for (let vertex = 0; vertex < vertices; vertex++) {
    view.setFloat32(start + vertex * VERTEX_BYTES, vertex % 2, true);
    view.setInt8(start + vertex * VERTEX_BYTES + 14, 127);
    view.setUint8(start + vertex * VERTEX_BYTES + 24, vertex % 5);
  }
  indices.forEach((index, corner) => view.setUint32(start + vertices * VERTEX_BYTES + corner * 4, index, true));
  return bytes;
}

test('a ship mesh reads as its header, its vertices and its triangles', () => {
  const mesh = readShipMesh(meshFile(4, [0, 1, 2, 2, 1, 3]));
  assert.equal(mesh.name, 'square');
  assert.equal(mesh.vertexCount, 4);
  assert.deepEqual([...mesh.indices], [0, 1, 2, 2, 1, 3]);
  assert.equal(mesh.vertices.byteLength, 4 * VERTEX_BYTES);
  assert.deepEqual(mesh.waterline, { lengthM: 6, beamM: 2, draughtM: 0.5 });
});

test('a mesh whose header claims more than its bytes hold, or a corner past its vertices, is refused', () => {
  assert.throws(() => readShipMesh(meshFile(4, [0, 1, 2], 5)), /bytes/);
  assert.throws(() => readShipMesh(meshFile(4, [0, 1, 4])), /corner/);
  assert.throws(() => readShipMesh(new ArrayBuffer(2)), /bytes/);
});

test('a mesh without a waterline, or with counts that are not whole, is refused', () => {
  const header = (fields: Record<string, unknown>) => {
    const text = new TextEncoder().encode(JSON.stringify(fields).padEnd(64, ' '));
    const bytes = new ArrayBuffer(4 + text.length);
    new DataView(bytes).setUint32(0, text.length, true);
    new Uint8Array(bytes, 4).set(text);
    return bytes;
  };
  assert.throws(() => readShipMesh(header({ name: 'none', vertices: 0, indices: 0 })), /waterline/);
  const flat = { length_m: 0, beam_m: 2, draught_m: 0.5 };
  assert.throws(() => readShipMesh(header({ name: 'flat', vertices: 0, indices: 0, waterline: flat })), /waterline/);
  const half = { name: 'half', vertices: 0.5, indices: 0, waterline: WATERLINE };
  assert.throws(() => readShipMesh(header(half)), /whole/);
});
