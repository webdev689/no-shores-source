import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWreckMesh, settleHeaps, WRECK_VERTEX_BYTES } from './wreckView.ts';

/** A mesh file as tools/wreck/export_wreck.py writes it: its header's length, the header, vertices and corners. */
function meshFile(header: object, vertices: number, indices: readonly number[]): ArrayBuffer {
  const json = JSON.stringify(header);
  // The vertices start on a whole word, as the export pads its header.
  const text = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const bytes = new ArrayBuffer(4 + text.length + vertices * WRECK_VERTEX_BYTES + indices.length * 4);
  new DataView(bytes).setUint32(0, text.length, true);
  new Uint8Array(bytes, 4, text.length).set(text);
  new Uint32Array(bytes, 4 + text.length + vertices * WRECK_VERTEX_BYTES).set(indices);
  return bytes;
}

const HEADER = {
  vertices: 4,
  indices: 6,
  stride: WRECK_VERTEX_BYTES,
  pieces: [
    { piece: 0, first: 0, count: 3 },
    { piece: 3, first: 3, count: 3 },
  ],
  light: { fire: 3, sky: 1 },
};

test("a wreck's mesh reads into its vertices, its corners, each piece's run and its light's full", () => {
  const mesh = readWreckMesh(meshFile(HEADER, 4, [0, 1, 2, 1, 2, 3]));
  assert.equal(mesh.vertices.byteLength, 4 * WRECK_VERTEX_BYTES);
  assert.deepEqual([...mesh.indices], [0, 1, 2, 1, 2, 3]);
  assert.deepEqual(mesh.pieces.get(3), { first: 3, count: 3 }, 'the heap closing zone 2 is the last run');
  assert.deepEqual(mesh.full, { fire: 3, sky: 1 });
});

test("a wreck's mesh that does not hold together is refused", () => {
  assert.throws(() => readWreckMesh(meshFile({ ...HEADER, stride: 28 }, 4, [0, 1, 2, 1, 2, 3])), /32 bytes/);
  assert.throws(() => readWreckMesh(meshFile(HEADER, 4, [0, 1, 2, 1, 2, 4])), /names no vertex/);
  assert.throws(() => readWreckMesh(meshFile({ ...HEADER, pieces: [] }, 4, [0, 1, 2, 1, 2, 3])), /no run/);
  assert.throws(() => readWreckMesh(meshFile({ ...HEADER, indices: 9 }, 4, [0, 1, 2, 1, 2, 3])), /not \d+ bytes/);
});

test('a heap that floats over the deck under its box is set down onto it; one resting there, and the wreck, are not', () => {
  // The wreck's own run, a heap closing zone 1 floating 4 m over the deck, and one closing zone 2 resting on it.
  const placed: [number, number, number, number][] = [
    [0, 0, 2, 0],
    [1, 0, 2, 0],
    [0.5, 0.5, 6, 2],
    [0.5, 0.6, 9, 2],
    [5.5, 0.5, 1.8, 3],
    [5.5, 0.6, 4.9, 3],
  ];
  const file = meshFile(
    {
      ...HEADER,
      vertices: placed.length,
      pieces: [0, 2, 3].map((piece, run) => ({ piece, first: run * 2, count: 2 })),
    },
    placed.length,
    [0, 1, 0, 2, 3, 2, 4, 5, 4].slice(0, 6),
  );
  const start = new DataView(file).getUint32(0, true) + 4;
  const view = new DataView(file);
  placed.forEach(([x, y, z, piece], vertex) => {
    const first = start + vertex * WRECK_VERTEX_BYTES;
    [x, y, z].forEach((value, axis) => view.setFloat32(first + axis * 4, value, true));
    view.setUint8(first + 25, piece);
  });
  const deck = { minX: -1, minY: -1, maxX: 7, maxY: 2, top: 2, bottom: 0 };
  const box = (minX: number, maxX: number) => ({ minX, minY: 0, maxX, maxY: 1, top: 0, bottom: 0 });
  const mesh = settleHeaps(readWreckMesh(file), [deck], [null, box(0, 1), box(5, 6)]);
  const heights = placed.map((unused, vertex) =>
    new DataView(mesh.vertices).getFloat32(vertex * WRECK_VERTEX_BYTES + 8, true),
  );
  assert.deepEqual(heights, [2, 2, 2, 5, 1.8, 4.9].map(Math.fround));
});
