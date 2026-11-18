import assert from 'node:assert/strict';
import { test } from 'node:test';
import { project } from './hud.ts';
import { MARK_FLOATS, type TelegraphMark, marksMesh } from './marks.ts';
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

test('a telegraphed blow is marked on the ground where its shape lies, filling as it winds up, red when iron', () => {
  const early = marksMesh([lunge(4, false)], []);
  const late = marksMesh([lunge(40, true)], []);
  assert.equal(early.length % MARK_FLOATS, 0);
  const vertices = (mesh: Float32Array) =>
    Array.from({ length: mesh.length / MARK_FLOATS }, (unused, index) =>
      mesh.subarray(index * MARK_FLOATS, (index + 1) * MARK_FLOATS),
    );
  for (const vertex of vertices(late)) {
    assert.ok(Math.abs((vertex[2] ?? 0) - 0.53) < 1e-6, 'a little over the ground it stands on');
    assert.ok((vertex[0] ?? 0) >= 1 - 0.3 - 1e-6 && (vertex[0] ?? 0) <= 1 + 4.5 + 1e-6, 'along its lane, east');
    assert.ok(Math.abs((vertex[1] ?? 0) - 2) <= 0.6 + 1e-6);
  }
  const reach = (mesh: Float32Array) => Math.max(...vertices(mesh).map((vertex) => vertex[0] ?? 0));
  assert.ok(reach(late) >= 5.4, 'its edge marks the whole lane from the start');
  const red = vertices(late).every((vertex) => (vertex[3] ?? 0) > 0.9 && (vertex[4] ?? 0) < 0.2);
  assert.ok(red, 'iron is red');
  assert.ok((vertices(late)[0]?.[6] ?? 0) > (vertices(early)[0]?.[6] ?? 0), 'brighter in its last stretch');
  const arrow = marksMesh([], [{ owner: 3, ranged: 1, at: [0, 0, 1], velocity: [45, 0, 0], age: 0 }]);
  assert.equal(arrow.length, 12 * MARK_FLOATS, 'an arrow is two crossed strips');
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
