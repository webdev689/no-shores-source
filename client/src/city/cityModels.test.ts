import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ForgedModel } from '../models/model.ts';
import { LAYER_BITS, MODEL_FLOATS, modelBuffers, PIECE_SHIFT, pieceNumbers } from './cityModels.ts';
import { CLEAR_GLASS } from './pictures.ts';

/** A model of two triangles: the first a wall's picture, the second a window's, its panes `clear` or not. */
const model = (clear: boolean): ForgedModel => ({
  positions: new Float32Array(18),
  normals: new Float32Array(18),
  uvs: new Float32Array(12),
  indices: Uint32Array.from([0, 1, 2, 3, 4, 5]),
  parts: [
    { archive: 1, record: 0, start: 0, count: 3 },
    { archive: 2, record: 0, start: 3, count: 3, clear },
  ],
  doors: [],
});

test("an open building's entry says it holds clear windows, which cast their shadow through their panes", () => {
  const buffers = modelBuffers([model(true), model(false), null], (archive) => archive);
  assert.deepEqual(
    buffers.entries.map((entry) => entry.clear ?? false),
    [true, false, false],
  );
  const layers = new Uint32Array(buffers.vertices);
  const layerAt = (vertex: number) => (layers[vertex * MODEL_FLOATS + 8] ?? 0) & LAYER_BITS;
  assert.deepEqual([layerAt(0), layerAt(3)], [1, 2 | CLEAR_GLASS], "the glass marked clear, the wall's picture not");
});

test('each window of a model is a piece of its own, numbered in its layer word so it is lit or dark as one', () => {
  // two quads sharing no corner, a triangle joined to the second by an edge, and a quad of two triangles that share
  // no vertex but two corners' places, as a window's are laid
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  const positions = Array.from({ length: 15 * 3 }, (_slot, index) => index);
  positions.splice(12 * 3, 3, ...positions.slice(9 * 3, 9 * 3 + 3));
  positions.splice(13 * 3, 3, ...positions.slice(11 * 3, 11 * 3 + 3));
  assert.deepEqual([...pieceNumbers(indices, positions)], [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3]);
  const spread = { ...model(false), positions: Float32Array.from({ length: 18 }, (_slot, index) => index) };
  const pieceOf = (windowed: boolean) => {
    const buffers = modelBuffers(
      [spread],
      (archive) => archive,
      [],
      () => windowed,
    );
    const words = new Uint32Array(buffers.vertices);
    return [0, 3].map((vertex) => (words[vertex * MODEL_FLOATS + 8] ?? 0) >>> PIECE_SHIFT);
  };
  assert.deepEqual(pieceOf(true), [1, 2], "a building's wall and its window apart");
  // a dungeon's models, and a city's props, keep their layer alone: their shaders read it whole
  assert.deepEqual(pieceOf(false), [0, 0]);
});
