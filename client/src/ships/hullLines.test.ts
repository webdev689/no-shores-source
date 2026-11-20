import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FAIR_LINE, lineAt, STATIONS } from '../water/hullMask.ts';
import { HullLines, waterlineOf } from './hullLines.ts';
import { type ShipMesh, VERTEX_BYTES } from './shipMesh.ts';

/** A diamond hull 20 m long and 4 m wide at its waterline, 1 m deep and 1 m high: its widest amidships, pointed at
 *  both ends, each face crossing its waterline. */
function diamond(): ShipMesh {
  const corners = [
    [10, 0, 0.5],
    [0, 2, 1],
    [0, 2, -1],
    [-10, 0, 0.5],
    [0, -2, 1],
    [0, -2, -1],
    [10, 0, -0.5],
    [-10, 0, -0.5],
  ];
  const bytes = new ArrayBuffer(corners.length * VERTEX_BYTES);
  const view = new DataView(bytes);
  corners.forEach(([x = 0, y = 0, z = 0], vertex) => {
    [x, y, z].forEach((value, axis) => view.setFloat32(vertex * VERTEX_BYTES + axis * 4, value, true));
  });
  // Bow to side's top to stern below, so each face is cut by its waterline.
  const faces = [0, 1, 7, 0, 4, 7, 6, 2, 3, 6, 5, 3, 1, 2, 3, 4, 5, 0];
  return {
    name: 'diamond',
    vertexCount: corners.length,
    vertices: bytes,
    indices: Uint32Array.from(faces),
    waterline: { lengthM: 20, beamM: 4, draughtM: 1 },
  };
}

test("its own line is read where its mesh's faces cross its waterline", () => {
  const line = waterlineOf(diamond());
  assert.equal(line.length, STATIONS);
  assert.ok(line.every((share) => share >= 0 && share <= 1));
  const middle = lineAt(line, 0);
  assert.ok(middle > 0.6, `full amidships: ${middle}`);
  assert.ok(lineAt(line, 0.95) < middle && lineAt(line, -0.95) < middle, 'fining to its ends');
});

test('a hull whose mesh has not come keeps the fair line, and takes its own once it has', async () => {
  const lines = new HullLines(async () => diamond());
  assert.equal(lines.line(2), FAIR_LINE);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.notEqual(lines.line(2), FAIR_LINE);
  assert.deepEqual([...lines.table().slice(2 * STATIONS, 3 * STATIONS)], [...lines.line(2)]);
  assert.deepEqual([...lines.table().slice(0, STATIONS)], [...FAIR_LINE]);
  assert.ok(lineAt(FAIR_LINE, 1) < 0.05 && lineAt(FAIR_LINE, 0) > 0.95, 'the fair line is pointed at its bow');
});
