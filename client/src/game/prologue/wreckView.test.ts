import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GLASS_SHELL } from '../../ships/lanternMesh.ts';
import { readWreckMesh, WRECK_VERTEX_BYTES, WRECK_WGSL } from './wreckView.ts';

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

test("a window's pane, its vertices' third byte GLASS_SHELL as the export writes it, burns as a ship's glass", () => {
  assert.match(WRECK_WGSL, new RegExp(`const GLASS_SHELL = ${GLASS_SHELL}u;`));
  assert.match(WRECK_WGSL, /drawn\.shell = part\.z;/);
  assert.match(WRECK_WGSL, /if \(drawn\.shell == GLASS_SHELL\) \{\n.*\n\s*return vec4f\(glass_burn\(/);
  assert.match(WRECK_WGSL, /fn glass_burn\(share: f32\)/, "the ships' own glass glow");
});
