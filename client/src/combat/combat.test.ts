import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project } from './hud.ts';
import { DITHER_M, MARK_FLOATS, type TelegraphMark, ditherCode, marksMesh } from './marks.ts';
import { IRON } from './markSprites.ts';
import { SHAPES } from '../rules/fighters.ts';

const lunge = (elapsed: number, iron: boolean): TelegraphMark => ({
  kind: 'telegraph',
  shape: 'lunge',
  elapsed,
  windup: 42,
  origin: [1, 2, 0.5],
  bearing: Math.PI / 2,
  ahead: 0,
  iron,
  feintAt: null,
});

const vertices = (mesh: Float32Array) =>
  Array.from({ length: mesh.length / MARK_FLOATS }, (unused, index) =>
    mesh.subarray(index * MARK_FLOATS, (index + 1) * MARK_FLOATS),
  );
const colourSet = (mesh: Float32Array) => new Set(vertices(mesh).map((vertex) => [...vertex.slice(3, 6)].join()));

test('a telegraphed blow is marked on the ground where its shape lies, filling as it winds up, red when iron', () => {
  const early = marksMesh([lunge(4, false)], []);
  const late = marksMesh([lunge(40, true)], []);
  assert.equal(early.length % MARK_FLOATS, 0);
  for (const vertex of vertices(late)) {
    assert.ok(Math.abs((vertex[2] ?? 0) - 0.53) < 0.01, 'a little over the ground it stands on');
    const [east = 0, south = 0] = vertex;
    assert.ok(
      east >= 1 - 0.3 - 1e-6 && east <= 1 + 4.5 + DITHER_M / 2 + 1e-6,
      'along its lane, east, its dark line outside',
    );
    assert.ok(Math.abs(south - 2) <= 0.6 + DITHER_M / 2 + 1e-6);
  }
  const reach = (mesh: Float32Array) => Math.max(...vertices(mesh).map((vertex) => vertex[0] ?? 0));
  assert.ok(reach(late) >= 5.4, 'its edge marks the whole lane from the start');
  const iron = [...Float32Array.from(IRON[2])].join();
  assert.ok(colourSet(late).has(iron), 'iron is the iron red');
  assert.ok(!colourSet(early).has(iron), 'a plain blow is gold');
  // The fill is dithered whole on the ground: an opacity above 1, keeping more of its cells in its last stretch; its
  // edge is on the ground too, every cell kept.
  const codes = (mesh: Float32Array) => new Set(vertices(mesh).map((vertex) => vertex[6] ?? 0));
  assert.deepEqual(codes(early), new Set([ditherCode(0.25), ditherCode(1)]));
  assert.deepEqual(codes(late), new Set([ditherCode(0.5), ditherCode(1)]));
  assert.ok(
    vertices(late).every((vertex) => (vertex[6] ?? 0) >= 1),
    'every part of it solid',
  );
  const arrow = marksMesh([], [{ owner: 3, ranged: 1, at: [0, 0, 1], velocity: [45, 0, 0], age: 0, muzzle: null }]);
  assert.equal(
    arrow.length,
    3 * 12 * MARK_FLOATS,
    'an arrow is its head, its shaft and its fletching, each crossed strips',
  );
});

test("a blow's last ticks light its mark's edge white-hot first, then its fill thickens", () => {
  const hot = [...Float32Array.from([1, 0xf6 / 255, 0xd0 / 255])].join();
  const white = (elapsed: number) => colourSet(marksMesh([lunge(elapsed, false)], [])).has(hot);
  assert.ok(!white(20) && white(31) && white(32) && !white(35), 'white-hot for its first three ticks of twelve');
});

test('a point projects through the camera onto the canvas, and nothing behind it does', () => {
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  assert.deepEqual(project(identity, [0, 0, 0.5], 800, 600), { x: 400, y: 300 });
  assert.deepEqual(project(identity, [1, 1, 0.5], 800, 600), { x: 800, y: 0 });
  const behind = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1]);
  assert.equal(project(behind, [0, 0, 0], 800, 600), null);
});

test('an iron blow’s edge is drawn twice, the second inside the first: its shape says iron, not its colour alone', () => {
  for (const shape of SHAPES) {
    const mark = (iron: boolean) => marksMesh([{ ...lunge(20, iron), shape, ahead: 3 }], []).length;
    assert.ok(mark(true) > mark(false), shape);
  }
  // A lunge's lane lies 0.6 m either side of its line, 2 m south; its iron edge again 0.2 m in.
  const iron = marksMesh([lunge(20, true)], []);
  const asides = new Set<number>();
  for (let index = 0; index < iron.length; index += MARK_FLOATS)
    asides.add(Math.round(Math.abs((iron[index + 1] ?? 0) - 2) * 100) / 100);
  assert.ok(asides.has(0.6) && asides.has(0.4), [...asides].join(' '));
});

test('marks are laid from an origin, so a mark far out in the world keeps its centimetres', () => {
  const far = { ...lunge(40, false), origin: [1_000_001, 2_000_002, 0.5] as const };
  const near = marksMesh([lunge(40, false)], []);
  const laid = marksMesh([far], [], [], [], [1_000_000, 2_000_000, 0]);
  assert.equal(laid.length, near.length);
  laid.forEach((value, index) => assert.ok(Math.abs(value - (near[index] ?? 0)) < 1e-4, `at ${index}: ${value}`));
});

test('far out in the world, the marks are measured from an origin near them, exact where 32-bit floats are not', () => {
  const far = [2_807_143.37, 1_207_025.81, 30.25] as const;
  const out = { ...lunge(40, false), origin: far };
  const mesh = marksMesh([out], [], [], [], far);
  const near = marksMesh([lunge(40, false)], [], [], [], [1, 2, 0.5]);
  assert.deepEqual(Array.from(mesh), Array.from(near), 'the same mark wherever it is, from its own origin');
});
