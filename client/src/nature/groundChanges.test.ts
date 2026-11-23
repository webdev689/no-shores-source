import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroundChanges } from './groundChanges.ts';
import { TILE_M } from './scatter.ts';

test("a tile's ground is unchanged unless a change since its version reached it", () => {
  const changes = new GroundChanges();
  assert.ok(changes.unchanged(5, 5, 0), 'no change yet');
  // Tiles 10 to 19 a side.
  changes.change([[10 * TILE_M, 10 * TILE_M, 20 * TILE_M - 1, 20 * TILE_M - 1]]);
  assert.equal(changes.version, 1);
  assert.ok(!changes.unchanged(10, 10, 0) && !changes.unchanged(19, 19, 0), 'inside the area');
  assert.ok(!changes.unchanged(9, 9, 0), "touching the area's corner");
  assert.ok(changes.unchanged(8, 15, 0) && changes.unchanged(15, 21, 0), 'clear of it');
  assert.ok(changes.unchanged(15, 15, 1), 'scattered since');
  changes.change([[0, 0, 1, 1]]);
  assert.ok(!changes.unchanged(15, 15, 0), 'the first change still counts for a tile older than both');
  assert.ok(changes.unchanged(15, 15, 1), 'but not for one scattered between them');
  changes.change(null);
  assert.ok(!changes.unchanged(500, -500, 2), 'a change everywhere reaches every tile');
});

test('a tile older than every change remembered is taken as changed', () => {
  const changes = new GroundChanges();
  for (let change = 0; change < 40; change++) changes.change([[0, 0, 1, 1]]);
  assert.ok(!changes.unchanged(50, 50, 0), 'too old to know');
  assert.ok(changes.unchanged(50, 50, 30), 'recent enough');
});
