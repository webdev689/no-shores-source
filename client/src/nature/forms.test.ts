import assert from 'node:assert/strict';
import { test } from 'node:test';
import { castOf } from './cast.ts';
import { type FloraForm, formsOf, type LoadedFlora, MESH_VERTEX_BYTES } from './flora.ts';
import { FORM_BLOCK_BYTES, formBuffers, QUAD_VERTICES } from './forms.ts';

/** A biome's forms as loaded, each near mesh `count` vertices of its own bytes. */
function loadedOf(biome: string, count = 6): LoadedFlora {
  const forms = formsOf(castOf(biome), biome);
  const meshes = forms.map((_form, index) => {
    const vertices = new Uint8Array(count * MESH_VERTEX_BYTES).fill(index + 1);
    return { vertices: vertices.buffer, count };
  });
  return { forms, meshes, layers: [] };
}

test("every form's near mesh lies in the vertex buffer end to end; its far quad is made in the shader", () => {
  const cast = castOf('rainforest');
  const loaded = loadedOf('rainforest');
  const { vertices, parts, blocks } = formBuffers(cast, loaded);
  const kinds = cast.kinds.flatMap((kind) => Array.from({ length: kind.forms }, () => kind));
  assert.equal(parts.length, kinds.length);
  for (const [form, [near, far]] of parts.entries()) {
    const kind = kinds[form];
    assert.ok(kind);
    assert.equal(near.firstVertex, form * 6);
    assert.equal(new Uint8Array(vertices)[near.firstVertex * MESH_VERTEX_BYTES], form + 1, 'its own bytes');
    const terms = (part: { block: number }) => blocks.subarray((part.block * FORM_BLOCK_BYTES) / 4);
    assert.equal(terms(near)[1], kind.reachM);
    assert.equal(terms(near)[3], 0);
    if (!Number.isFinite(kind.nearM)) {
      assert.equal(far, null, `${kind.name} is drawn near only`);
      assert.equal(terms(near)[0], 1e9, 'a plant with no far detail keeps its near one to its reach');
      continue;
    }
    assert.ok(far);
    assert.equal(far.vertexCount, QUAD_VERTICES);
    assert.equal(terms(far)[3], 1);
    assert.equal(terms(near)[0], kind.nearM);
  }
  assert.equal(vertices.byteLength, parts.length * 6 * MESH_VERTEX_BYTES);
});

test("a form's terms name its pictures' layer and bark, and its sprites' sheet and sphere", () => {
  const cast = castOf('woodland');
  const loaded = loadedOf('woodland');
  const { parts, blocks } = formBuffers(cast, loaded);
  const [near, far] = parts[0] ?? [];
  const form = loaded.forms[0] as FloraForm;
  assert.ok(near && far && form.impostor);
  const terms = blocks.subarray((far.block * FORM_BLOCK_BYTES) / 4);
  assert.deepEqual([...terms.subarray(12, 16)], [form.layer, ...form.bark.slice(0, 3)].map(Math.fround));
  assert.equal(terms[16], form.impostor.layer);
  assert.equal(terms[18], Math.fround(form.impostor.radius));
  assert.deepEqual([...terms.subarray(20, 23)], form.impostor.centre.map(Math.fround));
  assert.equal(terms[9], Math.fround(form.shade[1]), 'a widened far tree sinks by its crown height');
  assert.equal(terms[10], 0, 'a far quad draws no contact shade of its own');
});

test("a tree's contact shade spreads as wide as its crown and leans from where its leaves hang; grass casts none", () => {
  const cast = castOf('woodland');
  const { parts, blocks } = formBuffers(cast, loadedOf('woodland'));
  const kinds = cast.kinds.flatMap((kind) => Array.from({ length: kind.forms }, () => kind));
  for (const [form, [near]] of parts.entries()) {
    const kind = kinds[form];
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

test('a far quad covers only the part of its frames the plant fills, or the whole frame when no box is baked', () => {
  const cast = castOf('woodland');
  const loaded = loadedOf('woodland');
  const [first, second] = loaded.forms as FloraForm[];
  assert.ok(first?.impostor && second?.impostor);
  const boxed = { ...first, impostor: { ...first.impostor, box: [0.3, 0.1, 0.7, 1] as const } };
  const unboxed = { ...second, impostor: { ...second.impostor, box: undefined } };
  const { parts, blocks } = formBuffers(cast, { ...loaded, forms: [boxed, unboxed, ...loaded.forms.slice(2)] });
  const box = (index: number) => {
    const far = parts[index]?.[1];
    assert.ok(far);
    return [...blocks.subarray((far.block * FORM_BLOCK_BYTES) / 4 + 24, (far.block * FORM_BLOCK_BYTES) / 4 + 28)];
  };
  assert.deepEqual(box(0), [0.3, 0.1, 0.7, 1].map(Math.fround));
  assert.deepEqual(box(1), [0, 0, 1, 1]);
});
