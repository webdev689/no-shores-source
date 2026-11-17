import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRIED_TINT,
  DRY_STAGES,
  DRY_TIME,
  atlasCells,
  buildAtlas,
  driedTint,
  dryStage,
  freshTint,
  markKind,
  pickCell,
} from './art.ts';

test('a mark dries in eight steps over three minutes', () => {
  assert.equal(dryStage(0), 0);
  assert.equal(dryStage(DRY_TIME / DRY_STAGES - 0.01), 0);
  assert.equal(dryStage(DRY_TIME / DRY_STAGES), 1);
  assert.equal(dryStage(DRY_TIME / 2), 4);
  assert.equal(dryStage(DRY_TIME), DRY_STAGES);
  assert.equal(dryStage(DRY_TIME * 10), DRY_STAGES);
});

test('a dried mark is the dried tint, shaded as its fresh one was', () => {
  const fresh = freshTint(() => 0);
  assert.deepEqual(driedTint(fresh, DRY_STAGES), [...DRIED_TINT.slice(0, 3), 1]);
  const halfway = driedTint(fresh, DRY_STAGES / 2);
  assert.ok(halfway[0] < fresh[0] && halfway[0] > DRIED_TINT[0]);
});

test('a pool wears a pool, a wall a drip, a long drop a streak and the rest spatter', () => {
  assert.equal(markKind({ pool: true }), 'pool');
  assert.equal(markKind({ wall: true }), 'drip');
  assert.equal(markKind({ print: true }), 'print');
  assert.equal(markKind({ stretch: 2 }), 'streak');
  assert.equal(markKind({}), 'spatter');
});

test("a mark's cell is one of its own kind's, sometimes mirrored", () => {
  const cells = atlasCells();
  const cell = pickCell(cells, 'print', () => 0.3);
  assert.equal(cell.kind, 'print');
  assert.ok(cell.u0 > cell.u1);
});

test('the sheet is generated: clear at its borders, inked inside its cells', () => {
  const atlas = buildAtlas({ size: 64, cells: 2 });
  assert.equal(atlas.height, 32 * 5);
  assert.equal(atlas.colours[3], 0);
  let inked = 0;
  for (let i = 3; i < atlas.colours.length; i += 4) if ((atlas.colours[i] ?? 0) > 0) inked++;
  assert.ok(inked > 100);
});
