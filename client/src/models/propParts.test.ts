import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { propModel } from './props.ts';
import { STEPPED_OVER_M, TOP_KEEP_M, joined, partsTable, partsText, type PropPart } from './propParts.ts';
import { idsOf, propTable } from './fixtures.test.ts';

const table = partsTable(propTable);
const partsOf = (id: number): readonly PropPart[] => {
  const parts = table.get(id);
  assert.ok(parts, `${id}: parts of its own`);
  return parts;
};
const holds = (parts: readonly PropPart[], [x, y, z]: readonly number[]): boolean =>
  parts.some(
    ([fromX, fromY, fromZ, toX, toY, toZ]) =>
      x >= fromX && x <= toX && y >= fromY && y <= toY && z >= fromZ && z <= toZ,
  );

test('the committed parts are what the forge builds, so they never drift from what is drawn', () => {
  const committed = readFileSync(new URL('../../../content/forged/parts.json', import.meta.url), 'utf8');
  assert.equal(committed, partsText(table), 'run `node tools/forgedParts.mjs` after changing the forge or its table');
});

test('every part lies in its piece box, or where its mesh reaches past it, and over what is stepped over', () => {
  for (const [id, parts] of table) {
    const model = propModel(propTable, id);
    assert.ok(model);
    const [min, max] = [[...propTable[id].min], [...propTable[id].max]];
    for (let vertex = 0; vertex < model.positions.length; vertex += 3)
      for (const axis of [0, 1, 2]) {
        min[axis] = Math.min(min[axis], model.positions[vertex + axis]);
        max[axis] = Math.max(max[axis], model.positions[vertex + axis]);
      }
    min[1] = propTable[id].min[1];
    for (const [fromX, fromY, fromZ, toX, toY, toZ] of parts) {
      assert.ok(
        fromX >= min[0] - 0.01 && fromZ >= min[2] - 0.01 && toX <= max[0] + 0.01 && toZ <= max[2] + 0.01,
        `${id}`,
      );
      assert.ok(fromY >= min[1] - 0.01 && toY <= max[1] + 0.01 && fromY < toY, `${id}: ${fromY} to ${toY}`);
      assert.ok(toY - min[1] >= STEPPED_OVER_M, `${id}: a part that is stepped over`);
    }
  }
});

test('every point of a piece drawn over a step is in its parts, a column at most away', () => {
  for (const id of idsOf(propTable)) {
    const model = propModel(propTable, id);
    if (!model) continue;
    const { min, max } = propTable[id];
    const parts = table.get(id) ?? [[min[0], min[1], min[2], max[0], max[1], max[2]] as const];
    const grown = parts.map(([fromX, fromY, fromZ, toX, toY, toZ]): PropPart => [
      fromX - 0.01,
      fromY - 0.01,
      fromZ - 0.01,
      toX + 0.01,
      toY + 0.01,
      toZ + 0.01,
    ]);
    for (let vertex = 0; vertex < model.positions.length; vertex += 3) {
      const point = [model.positions[vertex], model.positions[vertex + 1], model.positions[vertex + 2]];
      if (point[1] - min[1] < STEPPED_OVER_M) continue;
      assert.ok(holds(grown, point), `${id}: ${point.map((value) => value.toFixed(2))} left out`);
    }
  }
});

/** Whether a triangle crosses a box (low x, y, z, then high), each face's corners clipped to the box's x and z. */
function crosses(triangle: readonly (readonly number[])[], [fromX, fromY, fromZ, toX, toY, toZ]: PropPart): boolean {
  let polygon = triangle.map((point) => [...point]);
  for (const [axis, bound, above] of [
    [0, fromX - 1e-3, true],
    [0, toX + 1e-3, false],
    [2, fromZ - 1e-3, true],
    [2, toZ + 1e-3, false],
  ] as const) {
    const kept: number[][] = [];
    polygon.forEach((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      const [inside, nextInside] = [point, next].map((corner) =>
        above ? corner[axis] >= bound : corner[axis] <= bound,
      );
      if (inside) kept.push(point);
      if (inside !== nextInside) {
        const share = (bound - point[axis]) / (next[axis] - point[axis]);
        kept.push(point.map((value, index) => value + (next[index] - value) * share));
      }
    });
    polygon = kept;
  }
  const heights = polygon.map((point) => point[1]);
  return heights.length > 0 && Math.min(...heights) <= toY + 1e-3 && Math.max(...heights) >= fromY - 1e-3;
}

test('every part stands round what is drawn: some of its mesh lies within it', () => {
  for (const [id, parts] of table) {
    const model = propModel(propTable, id);
    assert.ok(model);
    const triangles: number[][][] = [];
    for (let first = 0; first < model.indices.length; first += 3)
      triangles.push(
        [0, 1, 2].map((corner) => [
          ...model.positions.slice(model.indices[first + corner] * 3, model.indices[first + corner] * 3 + 3),
        ]),
      );
    for (const part of parts)
      assert.ok(
        triangles.some((triangle) => crosses(triangle, part)),
        `${id}: a part round nothing drawn at ${part}`,
      );
  }
});

test('a beached boat is its hull, deck and mast, never a block as tall as its mast', () => {
  const { min, max } = propTable[41508];
  const parts = partsOf(41508);
  // Down the hull's middle, aft of its deckhouse and clear of its mast, a body stands on the deck.
  const deck = 0.075;
  for (const z of [-15, -12]) {
    const over = parts.filter(([fromX, , fromZ, toX, , toZ]) => fromX <= 0 && toX >= 0 && fromZ <= z && toZ >= z);
    assert.ok(over.length > 0 && over.every(([, , , , top]) => top <= deck + TOP_KEEP_M + 0.01), `at ${z}`);
  }
  assert.ok(!holds(parts, [0, max[1] - 0.5, -15]) && holds(parts, [0, deck - 0.1, -15]));
  assert.ok(
    parts.some(([, , , , top]) => top >= max[1] - 0.01),
    'its mast reaches its box top',
  );
  assert.ok(min[1] < deck);
});

test("a signpost's arms are walked under, and its post is run into", () => {
  const { min } = propTable[43720];
  const parts = partsOf(43720);
  assert.ok(holds(parts, [0, min[1] + 1, -0.9]), 'the post');
  assert.ok(!holds(parts, [0, min[1] + 1, 0.5]) && !holds(parts, [0, min[1] + 1.8, 0.5]), 'under the arms');
  assert.ok(holds(parts, [0, min[1] + 2.9, 0.5]), 'the arms');
});

test("a gate's arch is its two piers and its bar, the opening under the bar left to the layouts to shut", () => {
  const { min } = propTable[43003];
  const parts = partsOf(43003);
  assert.equal(parts.length, 3);
  assert.ok(holds(parts, [-1.8, min[1] + 1, 0]) && holds(parts, [1.8, min[1] + 1, 0]), 'the piers');
  assert.ok(!holds(parts, [0, min[1] + 1, 0]) && holds(parts, [0, min[1] + 3, 0]), 'the opening and the bar');
});

test('a piece its box keeps to is its box', () => {
  assert.equal(table.get(41817), undefined, 'a crate');
  assert.equal(table.get(41005), undefined, 'a shelf');
});

test('columns join only while every top in the box stands within the keep of its top', () => {
  // Three columns in a row, the first's top between the others': each is within the keep of it, not of each other.
  const tops = [1.2, 1.0, 1.4];
  const boxes = joined(
    tops.map((top) => [[0, top]]),
    1,
    tops.length,
    0,
  );
  for (const [, firstRow, , lastRow, , top] of boxes) {
    const lowest = Math.min(...tops.slice(firstRow, lastRow + 1));
    assert.ok(
      (top ?? 0) - lowest <= TOP_KEEP_M + 1e-9,
      `rows ${firstRow} to ${lastRow} stand ${(top ?? 0) - lowest} m over one`,
    );
  }
});
