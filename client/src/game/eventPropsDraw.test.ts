import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleMouth, moduleNumber } from '../city/modules.ts';
import { packMouth } from './eventPropsDraw.ts';

test("the fissure's mouth packs as triangles between its lips, each vertex at the foot and pointing up", () => {
  const fissure = moduleNumber('lattice-fissure');
  const [north, south] = moduleMouth(fissure) ?? [];
  assert.ok(north && south && north.length === south.length && north.length > 2);
  const packed = packMouth(fissure);
  assert.ok(packed);
  const view = new DataView(packed);
  const vertices = packed.byteLength / 20;
  assert.equal(vertices, (north.length - 1) * 6);
  // Its first triangle: the first north point, the next north point, the next south point.
  const point = (vertex: number) => [view.getFloat32(vertex * 20, true), view.getFloat32(vertex * 20 + 4, true)];
  assert.deepEqual(point(0), [Math.fround(north[0]?.[0] ?? NaN), Math.fround(north[0]?.[1] ?? NaN)]);
  assert.deepEqual(point(2), [Math.fround(south[1]?.[0] ?? NaN), Math.fround(south[1]?.[1] ?? NaN)]);
  for (let vertex = 0; vertex < vertices; vertex++) {
    assert.equal(view.getFloat32(vertex * 20 + 8, true), 0, 'at the foot');
    assert.equal(view.getInt8(vertex * 20 + 14), 127, 'pointing up');
    assert.equal(view.getInt8(vertex * 20 + 15), 0, 'no glow');
  }
  assert.equal(packMouth(moduleNumber('lattice-growth')), null, 'a module that does not open has none');
});
