import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sphere } from './markView.ts';

test('the sphere is closed and every corner lies on it', () => {
  const { corners, faces } = sphere();
  assert.equal(corners.length / 3, 42);
  assert.equal(faces.length / 3, 80);
  for (let start = 0; start < corners.length; start += 3) {
    const length = Math.hypot(corners[start] ?? 0, corners[start + 1] ?? 0, corners[start + 2] ?? 0);
    assert.ok(Math.abs(length - 1) < 1e-6);
  }
  // Closed: every edge is shared by exactly two faces.
  const edges = new Map<string, number>();
  for (let start = 0; start < faces.length; start += 3) {
    for (const [one, other] of [
      [faces[start], faces[start + 1]],
      [faces[start + 1], faces[start + 2]],
      [faces[start + 2], faces[start]],
    ] as const) {
      const key = `${Math.min(one ?? 0, other ?? 0)}:${Math.max(one ?? 0, other ?? 0)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every((count) => count === 2));
});
