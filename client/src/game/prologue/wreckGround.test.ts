import assert from 'node:assert/strict';
import { test } from 'node:test';
import wreck from '../../../../content/prologue/wreck.json' with { type: 'json' };
import { SQUARE_M, withoutDeadEnds } from './wreckGround.ts';
import { readWreck, topAt } from './wreckLayout.ts';

/** A block over squares `column` to `toColumn` and `row` to `toRow` (from the world's corner), its top `top`. */
const blockOf = (column: number, row: number, toColumn: number, toRow: number, top: number) => ({
  minX: column * SQUARE_M,
  maxX: (toColumn + 1) * SQUARE_M,
  minY: row * SQUARE_M,
  maxY: (toRow + 1) * SQUARE_M,
  top,
  bottom: 0,
});
// A deck 2 m up, ten squares by ten, the way across its middle.
const DECK = blockOf(0, 0, 9, 9, 2);
const WAY = [
  [0.1, 1.5],
  [2.9, 1.5],
] as const;

test('a low slot beside the deck, dropped into and never climbed out of, is left out', () => {
  const slot = blockOf(10, 3, 11, 4, 0.5);
  const kept = withoutDeadEnds([DECK, slot], WAY);
  assert.deepEqual(kept, [DECK]);
});

test('ground a body can step back up from, or that no body comes down into, is kept', () => {
  // A step down and a step back up, each under the body's step: a hollow it walks out of.
  const step = blockOf(10, 0, 10, 9, 1.6);
  const hollow = blockOf(11, 0, 11, 9, 1.2);
  // A perch over the deck no body steps up onto.
  const perch = blockOf(4, 9, 4, 9, 6);
  const kept = withoutDeadEnds([DECK, step, hollow, perch], WAY);
  assert.equal(kept.length, 4);
});

test('a dead end too wide to be a slip of the ground is left as it is', () => {
  const sunken = blockOf(10, 0, 19, 9, 0.6);
  assert.equal(withoutDeadEnds([DECK, sunken], WAY).length, 2);
});

const layout = readWreck();

test("the wreck's slots at the waterline by the Sloop's side and by the gun deck are gone; every spot keeps its ground", () => {
  const laid = wreck.course.map((block) => ({ ...block, bottom: 0 }));
  for (const [x, y] of [
    [25.15, 23.25],
    [25.15, 23.85],
    [2.2, 29.2],
    [24.55, 10.65],
  ] as const) {
    assert.ok(topAt(laid, x, y) > 0, `laid at ${x}, ${y}`);
    assert.equal(topAt(layout.course, x, y), 0, `left out at ${x}, ${y}`);
  }
  const spots = [
    layout.wake.at,
    layout.arena.thule,
    ...layout.path,
    ...layout.zones.flatMap((zone) => [zone.checkpoint, ...zone.wave.map((foe) => foe.at), ...zone.crew]),
  ];
  for (const [x, y] of spots) assert.equal(topAt(layout.course, x, y), topAt(laid, x, y), `${x}, ${y}`);
  const share = layout.course.length / laid.length;
  assert.ok(share > 0.9, `${layout.course.length} of ${laid.length} blocks kept`);
});
