import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ForgedModel } from '../models/model.ts';
import { MODEL_FLOATS, modelBuffers } from './cityModels.ts';
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
  const layerAt = (vertex: number) => layers[vertex * MODEL_FLOATS + 8];
  assert.deepEqual([layerAt(0), layerAt(3)], [1, 2 | CLEAR_GLASS], "the glass marked clear, the wall's picture not");
});
