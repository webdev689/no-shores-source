import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutMarksOf, layoutsNamed } from './layoutMarks.ts';

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
    runs: [],
  });
});

test("a layout's runs are marked by their name, kind, place, line, beats and door", () => {
  const run = {
    name: 'The Chalk Adit',
    kind: 'mine',
    place: 'rock',
    mouth: [10, 10],
    line: [
      [10, 10],
      [40, 40],
    ],
    levels: [0, 0],
    beats: [{ at: [40, 40], radius: 22, level: 0 }],
    door: [60, 60],
    facing: [0.7, 0.7],
  };
  const [marks] = layoutMarksOf(JSON.stringify([{ ...LAID, runs: [run] }]));
  assert.deepEqual(marks?.runs, [
    {
      name: 'The Chalk Adit',
      kind: 'mine',
      place: 'rock',
      line: run.line,
      beats: [{ at: [40, 40], radius: 22 }],
      door: [60, 60],
    },
  ]);
});

test('no layouts, or text that is not a list, has no marks', () => {
  assert.deepEqual(layoutMarksOf('[]'), []);
  assert.deepEqual(layoutMarksOf('{}'), []);
});

test('named layouts come whole in the order named, without their boxes and claims', () => {
  const other = { ...LAID, id: 'mill', name: 'Weir Mill' };
  const named = JSON.parse(layoutsNamed(JSON.stringify([LAID, other]), ['mill', 'gone', 'downs'])) as {
    id: string;
  }[];
  assert.deepEqual(
    named.map((layout) => layout.id),
    ['mill', 'downs'],
  );
  const kept: Record<string, unknown> = { ...LAID };
  delete kept.boxes;
  delete kept.sculpt;
  assert.deepEqual(named[1], kept);
  assert.equal(layoutsNamed('{}', ['downs']), '[]');
});
