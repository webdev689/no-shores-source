import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHEST_OPEN_RAD } from '../models/chest.ts';
import { cacheOf, chestMesh, chestsMesh, foundChest } from './dungeonChest.ts';
import { IRON } from './dungeonMesh.ts';

test("the cache reads from a snapshot's five numbers, and an empty one is none", () => {
  assert.deepEqual(cacheOf([1, 2, 0, Math.PI, 1]), { x: 1, y: 2, z: 0, bearing: Math.PI, open: true });
  assert.equal(cacheOf([1, 2, 0, 0, 0])?.open, false);
  assert.equal(cacheOf([]), null);
});

test("the owner's chest in the dungeon's wood, its hinge and latch iron, stands where the cache stands, open or shut", () => {
  const where = { x: 10, y: 20, z: 0, bearing: 0 };
  const tops = (open: boolean) => {
    const model = chestMesh({ ...where, open }, [364, 1]);
    const heights: number[] = [];
    for (let vertex = 0; vertex < model.positions.length / 3; vertex++)
      heights.push(model.positions[vertex * 3 + 2] ?? 0);
    const pictures = new Set(model.parts.map((part) => `${part.archive}.${part.record}`));
    assert.deepEqual([...pictures].sort(), ['364.1', `${IRON[0]}.${IRON[1]}`]);
    const eastings = Array.from(
      { length: model.positions.length / 3 },
      (unused, vertex) => model.positions[vertex * 3] ?? 0,
    );
    assert.ok(Math.min(...eastings) > 9 && Math.max(...eastings) < 11, 'round the cache');
    return Math.max(...heights);
  };
  assert.ok(tops(true) > tops(false) + 0.2, 'an open lid stands up over the shut one');
});

test("the chests a dungeon stands to find are the cache's chest, each its own, its lid as far open as it has swung", () => {
  const one = { x: 10, y: 20, z: 0, bearing: 0, open: false };
  const two = { x: 30, y: 20, z: 0, bearing: Math.PI / 2, open: false };
  const single = chestMesh(one, [364, 1]);
  const both = chestsMesh([one, two], [364, 1]);
  assert.equal(both.positions.length, 2 * single.positions.length, 'two chests, twice the mesh');
  const top = (lid: number) => {
    const model = chestMesh({ ...one, lid }, [364, 1]);
    return Math.max(
      ...Array.from({ length: model.positions.length / 3 }, (unused, vertex) => model.positions[vertex * 3 + 2] ?? 0),
    );
  };
  assert.ok(top(0.7) > top(0) && top(CHEST_OPEN_RAD) > top(0.7), 'the lid rises as it swings back');
  assert.equal(chestsMesh([], [364, 1]).positions.length, 0, 'none, nothing drawn');
});

test("a found chest's lid, thrown open, stays clear of the 0.3 m a wall's kit pieces stand proud", async () => {
  const { readFile } = await import('node:fs/promises');
  // Written by `cargo test -p room` (public/page_numbers_tests.rs).
  const written = await readFile(new URL('../../../target/protocol/room-numbers.json', import.meta.url), 'utf8');
  const room = JSON.parse(written) as { chestOffWallM: number; chestHalfDeepM: number };
  const [off, deep] = [room.chestOffWallM, room.chestHalfDeepM];
  assert.ok(off > 0 && deep > 0, 'the room stands its chests so far off the wall');
  // The wall is the line y = 0 to the north; the chest faces south, its middle where the room stands it.
  for (const opened of [null, 0.3, 10]) {
    const model = chestMesh(foundChest({ at: [5, off + deep, 0], facing: Math.PI, opened }), [364, 1]);
    const northings = Array.from(
      { length: model.positions.length / 3 },
      (unused, vertex) => model.positions[vertex * 3 + 1] ?? 0,
    );
    assert.ok(Math.min(...northings) >= 0.3, `opened ${opened}: ${Math.min(...northings).toFixed(3)} m off the wall`);
  }
});
