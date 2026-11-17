import assert from 'node:assert/strict';
import { test } from 'node:test';
import { castOf } from './cast.ts';
import { FORM_BLOCK_BYTES, formBuffers, VERTEX_BYTES } from './forms.ts';
import { VERTEX_FLOATS } from './shapes.ts';

test("every form's meshes lie in the vertex buffer end to end, each with its own block of terms", () => {
  const cast = castOf('rainforest');
  const { vertices, parts, blocks } = formBuffers(cast);
  const plants = cast.kinds.flatMap((kind) => kind.plants.map((plant) => ({ kind, plant })));
  assert.equal(parts.length, plants.length);
  let next = 0;
  for (const [form, [near, far]] of parts.entries()) {
    const { kind, plant } = plants[form] ?? {};
    assert.ok(kind && plant);
    for (const [part, mesh, lod] of [
      [near, plant.near, 0],
      [far, plant.far, 1],
    ] as const) {
      if (!mesh) {
        assert.equal(part, null);
        continue;
      }
      assert.ok(part);
      assert.equal(part.firstVertex, next);
      assert.equal(part.vertexCount, mesh.vertices.length / VERTEX_FLOATS);
      assert.equal(part.twoSided, !mesh.closed);
      next += part.vertexCount;
      const terms = blocks.subarray((part.block * FORM_BLOCK_BYTES) / 4);
      assert.equal(terms[1], kind.reachM);
      assert.equal(terms[3], lod);
      assert.equal(terms[0], plant.far ? kind.nearM : 1e9, 'a plant with no far mesh keeps its near one to its reach');
    }
  }
  assert.equal(vertices.byteLength, next * VERTEX_BYTES);
});

test('a vertex keeps its position exactly and its normal, leaf, colour and sway to a byte', () => {
  const cast = castOf('savanna');
  const mesh = cast.kinds[0]?.plants[0]?.near;
  assert.ok(mesh);
  const bytes = new DataView(formBuffers(cast).vertices);
  for (const vertex of [0, 7, mesh.vertices.length / VERTEX_FLOATS - 1]) {
    const [from, byteAt] = [vertex * VERTEX_FLOATS, vertex * VERTEX_BYTES];
    for (let axis = 0; axis < 3; axis++)
      assert.equal(bytes.getFloat32(byteAt + axis * 4, true), mesh.vertices[from + axis]);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(Math.abs(bytes.getInt8(byteAt + 12 + axis) / 127 - (mesh.vertices[from + 3 + axis] ?? 0)) < 0.01);
    }
    assert.ok(Math.abs(bytes.getInt8(byteAt + 15) / 127 - (mesh.vertices[from + 9] ?? 0)) < 0.01);
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(
        Math.abs(bytes.getUint8(byteAt + 16 + channel) / 255 - (mesh.vertices[from + 6 + channel] ?? 0)) < 0.003,
      );
    }
    assert.ok(Math.abs(bytes.getUint8(byteAt + 19) / 255 - (mesh.vertices[from + 10] ?? 0)) < 0.003);
  }
});

test("a tree's contact shade spreads as wide as its crown and leans from where its leaves hang; grass casts none", () => {
  const cast = castOf('woodland');
  const { parts, blocks } = formBuffers(cast);
  const plants = cast.kinds.flatMap((kind) => kind.plants.map(() => kind));
  for (const [form, [near]] of parts.entries()) {
    const kind = plants[form];
    assert.ok(kind);
    const [radius, crownHeight, darkness] = blocks.subarray((near.block * FORM_BLOCK_BYTES) / 4 + 8);
    if (kind.name === 'fern') {
      assert.equal(near.shaded, false);
      continue;
    }
    assert.equal(near.shaded, true, kind.name);
    assert.ok((radius ?? 0) > 0.5 && (darkness ?? 0) > 0 && (darkness ?? 1) < 0.5, kind.name);
    if (kind.name === 'oak') assert.ok((radius ?? 0) > 3 && (crownHeight ?? 0) > 5, `${radius} ${crownHeight}`);
  }
});
