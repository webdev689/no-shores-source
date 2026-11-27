// The kit pieces of a storeyed dungeon: each storey dressed as a dungeon of its own, nothing laid in a flight, in open
// air or under it, and the flights' arches and courses and the galleries' balustrades laid from each style's pack,
// the mesh drawing its own where a pack has none.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dressingOf } from './dungeonDressing.ts';
import { kitsOf } from './dungeonKits.ts';
import { FULL_PACKS } from './dungeonPacks.test.ts';
import { storeyKits } from './dungeonStoreyKits.ts';
import { STOREYED } from './dungeonStoreyMesh.test.ts';
import { storeyPlanes } from './dungeonStoreyPlanes.ts';

test("a flight's arches and side courses and a gallery's balustrades are laid where they belong", () => {
  const { placed, arches, courses, rails } = storeyKits(STOREYED, FULL_PACKS);
  assert.deepEqual([...arches], [0, 1]);
  assert.deepEqual([...courses], [0]);
  // The gallery's cells (0, 1) and (1, 2) on the top storey, each on its side over the open air at (0, 2).
  assert.deepEqual(
    [...rails].sort((a, b) => a - b),
    [7 * 4 + 1, 15 * 4 + 2],
  );
  const heads = placed.filter((piece) => piece.module.endsWith('.stair.head'));
  const near = (point: readonly number[], want: readonly number[]) =>
    point.every((value, axis) => Math.abs(value - (want[axis] ?? NaN)) < 1e-9);
  assert.ok(near(heads[0]?.place.origin ?? [], [6.4, 4.8, 0]), 'at the head, on the top landing');
  assert.ok(near(heads[1]?.place.origin ?? [], [19.2, 4.8, -8]), 'at the foot, on the lower landing');
  const sides = placed.filter((piece) => piece.module.endsWith('.stair.side'));
  assert.equal(sides.length, 8);
  for (const side of sides) {
    assert.equal(Math.abs(side.place.slope ?? 0), 0.625, 'sheared to the slope');
    const along = side.place.origin[0] - 6.4;
    assert.ok(Math.abs(side.place.origin[2] + (along * 8) / 12.8) < 1e-9, 'on the slope at its middle');
  }
  const railed = placed.filter((piece) => piece.module.endsWith('.balustrade')).map((piece) => piece.place.origin);
  assert.ok(near(railed[0] ?? [], [3.2, 8, 0]) && near(railed[1] ?? [], [1.6, 6.4, 0]), 'on the edges, on the floor');
});

test('a pack without the joining pieces leaves them to the mesh', () => {
  const none = storeyKits(STOREYED, new Map());
  assert.deepEqual([none.placed.length, none.arches.size, none.courses.size, none.rails.size], [0, 0, 0, 0]);
  const dressing = dressingOf(STOREYED, FULL_PACKS, 'temperate', []);
  assert.deepEqual([[...(dressing.arches ?? [])], [...(dressing.rails ?? [])].length], [[0, 1], 2]);
});

test('no kit piece stands in a flight or in open air, and under it only on the floor', () => {
  for (const plane of storeyPlanes(STOREYED)) {
    const busy = plane.layout.cells.flatMap((kind, cell) => (kind === -3 || kind === -4 ? [cell] : []));
    const opened = plane.storey === 1 ? [14] : [];
    const { placed } = kitsOf(plane.layout, FULL_PACKS, [], { busy: [...busy, ...opened] });
    assert.ok(placed.length > 0, `storey ${plane.storey} is dressed`);
    for (const piece of placed) {
      assert.ok(!busy.includes(piece.cell), `${piece.module} on ${piece.cell}`);
      assert.ok(!opened.includes(piece.cell) || piece.module.includes('.floor.'), `only a floor piece under open air`);
      assert.ok(plane.layout.cells[piece.cell]! >= -1, `${piece.module} on an open cell`);
    }
  }
});
