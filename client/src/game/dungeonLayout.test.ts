import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { askDungeon, ceilingAt, courseOf, type DungeonLayout, seenBlocks } from './dungeonLayout.ts';

/** A room's cell and a corridor's in a row of three, rock past them. */
const small = {
  cell: 3.2,
  columns: 3,
  rows: 1,
  cells: [0, -1, -2],
  boxes: [[3.2, 0, 3.5, 0.7, 3.2]],
} as unknown as DungeonLayout;

test('the camera and the shots stop on the rock beside the open cells too', () => {
  assert.deepEqual(courseOf(small), [{ minX: 3.2, minY: 0, maxX: 3.5, maxY: 0.7, top: 3.2 }]);
  const seen = seenBlocks(small);
  // The box, the rock cell east of the corridor, and the cells round the two open ones past the grid's edge.
  const rock = seen.slice(1).map((block) => [block.minX, block.minY]);
  assert.ok(
    rock.some(([x, y]) => x === 6.4 && y === 0),
    'the rock cell beside the corridor',
  );
  assert.ok(
    rock.some(([x, y]) => x === -3.2 && y === 0),
    'past the grid to the west',
  );
  assert.ok(!rock.some(([x, y]) => x === 0 && y === 0), 'never an open cell');
  assert.ok(
    seen.slice(1).every((block) => block.top > 5.6),
    'over every ceiling',
  );
});

test("a patrol's dungeon is read from the room module's own rules, the same each time", async (context) => {
  let bytes: Buffer;
  try {
    bytes = readFileSync('client/public/room.wasm');
  } catch {
    context.skip('room.wasm is not built: run `npm run wasm`');
    return;
  }
  const module = await WebAssembly.compile(new Uint8Array(bytes));
  const laid = askDungeon(module, 'saltgrass-downs', 'The Saltgrass Downs', 0);
  assert.match(laid.name, / of the Saltgrass Downs$/);
  assert.equal(laid.cells.length, laid.columns * laid.rows);
  assert.deepEqual(askDungeon(module, 'saltgrass-downs', 'The Saltgrass Downs', 0), laid);
  const furnished = laid.frames.length * 2 + laid.pillars.length;
  assert.ok(laid.boxes.length >= furnished, 'two jambs a frame, then the pillars, then the props’ solids');
  assert.equal(askDungeon(module, 'saltgrass-downs', 'The Saltgrass Downs', 0), laid, 'laid once, kept');
  assert.notEqual(askDungeon(module, 'saltgrass-downs', 'The Saltgrass Downs', 1), laid);
});

test("the ceiling over a point is its open cell's, and none over rock or off the grid", () => {
  const layout = { ...small, ceilings: [3.6, 3.2, 0] } as unknown as DungeonLayout;
  assert.deepEqual(
    [ceilingAt(layout, 1, 1), ceilingAt(layout, 4, 1), ceilingAt(layout, 7, 1), ceilingAt(layout, -1, 1)],
    [3.6, 3.2, null, null],
  );
});
