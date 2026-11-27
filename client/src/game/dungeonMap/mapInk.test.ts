import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Gpu } from '../../gpu.ts';
import { INK, MapInk, mapFloats, type MapFrame } from './mapInk.ts';
import { MAP_FLOATS } from './mapShaders.ts';

const frame = (yaw: number, pitch: number): MapFrame => ({
  view: { yaw, pitch, scale: 10, centre: [5, 6, -8] },
  ratio: 2,
  size: { width: 800, height: 600 },
  every: false,
  storey: 1,
  storeys: { count: 2, storeyM: 8, top: 0 },
  grid: { cell: 3.2, columns: 20, rows: 30 },
});

test('the uniform holds the view, the storeys and the grid where the shaders read them', () => {
  const floats = mapFloats(frame(0, Math.PI / 2));
  assert.equal(floats.length, MAP_FLOATS);
  assert.deepEqual([...floats.slice(4, 8)], [5, 6, -8, 20], 'the middle, and the scale in device pixels');
  assert.deepEqual([...floats.slice(16, 18)], [1, 8]);
  assert.deepEqual([...floats.slice(20, 24)], [3.2, 20, 30, INK.depthRange].map(Math.fround));
});

test('on the plan the light comes from the upper left of the paper and the compass points up', () => {
  const floats = mapFloats(frame(0, Math.PI / 2));
  const [east, south, up] = floats.slice(24, 27);
  assert.ok((east ?? 0) < 0 && (south ?? 0) < 0 && (up ?? 0) > 0, 'from the west and the north, above');
  assert.ok(Math.abs(floats[36] ?? 1) < 1e-6 && (floats[37] ?? 0) < -0.99, 'north up the paper');
});

test('turned a quarter, the light still comes from the upper left of the paper', () => {
  const floats = mapFloats(frame(Math.PI / 2, Math.PI / 2));
  const [east, south] = floats.slice(24, 26);
  // Turned a quarter, east lies down the paper and south to its left: the upper left is west and south.
  assert.ok((east ?? 0) < 0 && (south ?? 0) > 0, `${east}, ${south}`);
});

test("the cells' words are written to the device once a version, and again once let go", () => {
  const written: unknown[] = [];
  const queue = { writeBuffer: (...wrote: unknown[]) => void written.push(wrote) };
  // A device whose every call answers another such stand-in, but for its queue, which counts what is written.
  const stand: object = new Proxy(function stub() {}, {
    get: (_target, key) =>
      key === 'queue' ? queue : key === 'then' ? undefined : key === Symbol.toPrimitive ? () => 0 : stand,
    apply: () => stand,
  });
  const ink = new MapInk({ device: stand, format: 'bgra8unorm' } as unknown as Gpu);
  const words = new Uint32Array([1, 0, 3]);
  ink.setCells(words, 7);
  ink.setCells(words, 7);
  assert.equal(written.length, 1, 'the same version is held');
  ink.setCells(words, 8);
  assert.equal(written.length, 2);
  ink.release();
  ink.setCells(words, 8);
  assert.equal(written.length, 3, 'let go, the cells are written again');
});
