import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CoastField } from './coastField.ts';
import type { Rect } from './heldMapLaw.ts';
import { onOwnSea } from './heldMapWaters.ts';
import type { MapWaters } from './watersWash.ts';

/** A small world: three waters in bands across a grid of 1 km cells, an island of land in the middle and a coast the
 *  field alone calls land. */
function world(): { waters: MapWaters; field: CoastField } {
  const [columns, rows] = [40, 30];
  const water = new Int16Array(columns * rows);
  const distance = new Float32Array(columns * rows).fill(5_000);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const cell = row * columns + column;
      water[cell] = column < 14 ? 0 : column < 27 ? 1 : 2;
      if (column >= 17 && column < 22 && row >= 10 && row < 16) water[cell] = -1;
      if (column === 22 && row >= 10 && row < 16) distance[cell] = -300;
    }
  return {
    waters: { columns, rows, cellM: 1_000, water, waters: [], mainPorts: [] },
    field: { columns, rows, cellM: 1_000, distance, island: new Uint8Array(columns * rows) },
  };
}

/** The rule as it reads: every point asked every 4 px across the box, ends included, judged by its cell. */
function judged(
  { waters, field }: ReturnType<typeof world>,
  view: { left: number; top: number; scale: number },
  box: Rect,
  continent: number,
): 0 | 1 | 2 {
  const cells = (rect: Rect) => {
    const [across, down] = [Math.max(1, Math.ceil(rect.width / 4)), Math.max(1, Math.ceil(rect.height / 4))];
    const found: number[] = [];
    for (let row = 0; row <= down; row++)
      for (let column = 0; column <= across; column++) {
        const x = Math.floor((view.left + (rect.x + (rect.width * column) / across) / view.scale) / waters.cellM);
        const y = Math.floor((view.top + (rect.y + (rect.height * row) / down) / view.scale) / waters.cellM);
        if (x >= 0 && y >= 0 && x < waters.columns && y < waters.rows) found.push(y * waters.columns + x);
      }
    return found;
  };
  const under = cells(box);
  if (under.some((cell) => (waters.water[cell] ?? -1) < 0 || (field.distance[cell] ?? 1) < 0)) return 0;
  if (under.every((cell) => waters.water[cell] === continent)) return 2;
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2, width: 0, height: 0 };
  return cells(middle).some((cell) => waters.water[cell] !== continent) ? 0 : 1;
}

test('a sea’s name stands on its sea as every point the rule asks under it says, at every zoom and across borders', () => {
  const small = world();
  let seed = 7;
  const random = () => ((seed = (seed * 16_807) % 2_147_483_647) - 1) / 2_147_483_646;
  const seen = new Set<number>();
  for (let trial = 0; trial < 3_000; trial++) {
    const view = { left: random() * 8_000 - 2_000, top: random() * 6_000 - 2_000, scale: 0.002 + random() * 0.05 };
    const box = { x: random() * 600, y: random() * 400, width: random() * 220, height: random() * 50 };
    const continent = Math.floor(random() * 3);
    const answer = onOwnSea(small.waters, small.field, view, box, continent);
    seen.add(answer);
    assert.equal(answer, judged(small, view, box, continent), `trial ${trial}`);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2], 'every answer was met');
});
