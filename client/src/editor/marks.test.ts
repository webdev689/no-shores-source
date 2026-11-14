import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LandView } from '../rules/landRules.ts';
import { MARK, markCells } from './marks.ts';

const view = {
  id: 'test',
  width: 20,
  height: 20,
  leftM: 0,
  topM: 0,
  cellM: 1000,
  heights: new Float32Array(400),
  lakes: new Float32Array(400),
  rivers: [{ points: [[500, 500] as const, [1500, 500] as const], flow: [1, 1] }],
  groundHash: '',
  problems: [],
} satisfies LandView;

test('places mark the cells they cover, a town its whole area', () => {
  const marks = markCells(view, {
    roads: [
      {
        points: [
          [2500, 10_500],
          [8500, 10_500],
        ],
      },
    ],
    towns: [
      {
        outline: [
          [12_000, 12_000],
          [16_000, 12_000],
          [16_000, 16_000],
          [12_000, 16_000],
        ],
      },
    ],
    ports: [{ at: [18_500, 2500] }],
  });
  const markAt = (i: number, j: number) => marks[j * 20 + i];
  assert.equal(markAt(0, 0), MARK.river);
  assert.equal(markAt(5, 10), MARK.road);
  assert.equal(markAt(14, 14), MARK.town, 'inside the town');
  assert.equal(markAt(18, 2), MARK.port);
  assert.equal(markAt(17, 3), MARK.port, 'a port marks the cells around it');
  assert.equal(markAt(5, 5), MARK.none);
});
