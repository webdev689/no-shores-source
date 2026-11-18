import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutMarksOf } from './layoutMarks.ts';

const LAID = {
  id: 'downs',
  kind: 'patrol',
  name: 'The Downs',
  theme: 'chalk',
  ring: [
    [0, 0],
    [100, 0],
    [100, 100],
  ],
  spawns: [[10, 10]],
  areas: [
    { kind: 'landing', name: 'Shingle Landing', at: [10, 10], radius: 48 },
    { kind: 'gate', name: '', at: [90, 90], radius: 40, leads_to: 'mill' },
  ],
  paths: [
    {
      tier: 'track',
      points: [
        [10, 10],
        [90, 90],
      ],
      heights: [3, 4],
      crossings: [],
    },
  ],
  sites: [{ kind: 'gate', at: [90, 90], radius: 40, holds: 'mill' }],
  buildings: [{ model: 1 }],
  solids: [{}],
  rooms: [{}],
  boxes: [[0, 0, 1, 1, 1, 0]],
  sculpt: { claim: [] },
};

test("a layout's marks keep what the editor draws and leave its buildings, solids and boxes behind", () => {
  const [marks] = layoutMarksOf(JSON.stringify([LAID]));
  assert.deepEqual(marks, {
    id: 'downs',
    kind: 'patrol',
    name: 'The Downs',
    ring: LAID.ring,
    areas: [
      { kind: 'landing', name: 'Shingle Landing', at: [10, 10], radius: 48 },
      { kind: 'gate', name: '', at: [90, 90], radius: 40, leadsTo: 'mill' },
    ],
    paths: [
      {
        tier: 'track',
        points: [
          [10, 10],
          [90, 90],
        ],
        heights: [3, 4],
      },
    ],
    sites: [{ kind: 'gate', at: [90, 90], radius: 40, holds: 'mill' }],
  });
});

test('no layouts, or text that is not a list, has no marks', () => {
  assert.deepEqual(layoutMarksOf('[]'), []);
  assert.deepEqual(layoutMarksOf('{}'), []);
});
