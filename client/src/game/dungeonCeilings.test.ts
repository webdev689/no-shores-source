import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meshBuilder } from '../models/model.ts';
import { caveWall, ceilingHeights, closeEdge, isCave, roughness } from './dungeonCeilings.ts';
import type { CeilingForm, DungeonLayout } from './dungeonLayout.ts';

/** A room three cells east-west by two north-south, 4 m to its walls' heads, with rock round it. */
function roomOf(ceiling: CeilingForm, style: 'crypt' | 'caverns' = 'crypt'): DungeonLayout {
  const open = (column: number, row: number) => column >= 1 && column <= 3 && row >= 1 && row <= 2;
  const cells = Array.from({ length: 20 }, (empty, index) => (open(index % 5, Math.floor(index / 5)) ? 0 : -2));
  return {
    style,
    pictures: [123, 124],
    looks: [{ style, pictures: [123, 124] }],
    cellLooks: cells.map((kind) => (kind === -2 ? -1 : 0)),
    cell: 3.2,
    columns: 5,
    rows: 4,
    cells,
    ceilings: cells.map((kind) => (kind === -2 ? 0 : 4)),
    rooms: [{ x: 1, y: 1, width: 3, depth: 2, height: 4, walk: 0, role: 'nave', name: 'the Nave', ceiling, look: 0 }],
  } as unknown as DungeonLayout;
}

test('a vault rises across the narrower side, from its walls to over the middle, the same along its length', () => {
  const height = ceilingHeights(roomOf('vault'))(6);
  // A vault meets its walls in a square root, so a rounding there stands out a little more.
  assert.ok(Math.abs(height(4.8, 3.2) - 4) < 1e-6 && Math.abs(height(4.8, 9.6) - 4) < 1e-6, 'at its walls, their head');
  assert.ok(Math.abs(height(4.8, 6.4) - 5.6) < 1e-9, 'over its middle 1.6 m higher');
  assert.ok(Math.abs(height(4.0, 6.4) - height(12.0, 6.4)) < 1e-9, 'the same all along');
});

test('a dome is highest over its middle and falls to its walls round it', () => {
  const height = ceilingHeights(roomOf('dome'))(7);
  const middle = height(8, 6.4);
  assert.ok(middle > height(6, 6.4) && height(6, 6.4) > height(4.5, 6.4) && middle > 4.5);
  assert.ok(Math.abs(height(3.2, 3.2) - 4) < 1e-9, 'in a corner, the walls own head');
});

test("a cave's ceiling stands a quarter to over a metre above its walls and varies across it", () => {
  const layout = roomOf('cave', 'caverns');
  assert.ok(isCave(layout, 6) && !isCave(roomOf('vault'), 6));
  const height = ceilingHeights(layout)(6);
  const seen = new Set<number>();
  for (let x = 3.2; x < 12.8; x += 0.4)
    for (let y = 3.2; y < 9.6; y += 0.4) {
      const over = height(x, y) - 4;
      assert.ok(over >= 0.25 - 1e-9 && over <= 1.1 + 1e-9);
      seen.add(Math.round(over * 10));
    }
  assert.ok(seen.size > 4, 'it is not one height');
  assert.equal(roughness(1.3, 2.7, 1), roughness(1.3, 2.7, 1), 'the same everywhere');
});

test('an edge is closed only where one side stands higher than the other', () => {
  const mesh = meshBuilder();
  const edge = { from: [0, 0] as const, to: [3.2, 0] as const, facing: [0, 1, 0] as const };
  closeEdge(
    mesh,
    [123, 0],
    edge,
    () => 4,
    () => 4,
  );
  assert.equal(mesh.model().indices.length, 0);
  closeEdge(
    mesh,
    [123, 0],
    edge,
    () => 4,
    (x) => 4 + x / 10,
  );
  const model = mesh.model();
  assert.ok(model.indices.length > 0);
  // A model keeps its points in single precision.
  const heights = Array.from(
    { length: model.positions.length / 3 },
    (empty, vertex) => model.positions[vertex * 3 + 2],
  );
  assert.ok(heights.every((z) => (z ?? 0) >= 4 - 1e-5 && (z ?? 0) <= 4.32 + 1e-5));
});

test("a cave's wall bulges inside its edges and meets them exactly, so nothing shows between", () => {
  const mesh = meshBuilder();
  caveWall(mesh, [123, 0], { column: 1, row: 1, side: 3, cell: 3.2 }, 4);
  const { positions } = mesh.model();
  let bulged = 0;
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const [x, y, z] = [positions[vertex * 3] ?? 0, positions[vertex * 3 + 1] ?? 0, positions[vertex * 3 + 2] ?? 0];
    // A model keeps its points in single precision.
    const atEdge = Math.abs(x - 3.2) < 1e-5 || Math.abs(x - 6.4) < 1e-5 || z < 1e-5 || Math.abs(z - 4) < 1e-5;
    if (atEdge) assert.ok(Math.abs(y - 3.2) < 1e-5, 'on the wall at every edge');
    else bulged = Math.max(bulged, Math.abs(y - 3.2));
    assert.ok(Math.abs(y - 3.2) <= 0.22 + 1e-5);
  }
  assert.ok(bulged > 0.02, 'it bulges between its edges');
});
