import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { planOfLayouts, plantedOf } from './layoutPlan.ts';
import type { NodeLayout } from './layouts.ts';

test('nothing wild grows on a run: its beats and its way are cleared', () => {
  const laid = {
    id: 'downs',
    kind: 'patrol',
    name: 'Downs',
    theme: '',
    ring: [],
    spawns: [],
    areas: [],
    paths: [],
    buildings: [],
    props: [{ model: 1, at: [0, 0, 0], yaw: 0, building: false, footprint: [0, 0, 1, 1], open: false }],
    tiles: [],
    solids: [],
    rooms: [],
    pads: [],
    runs: [
      {
        name: 'The Chalk Adit',
        kind: 'mine',
        place: 'rock',
        line: [
          [0, 0],
          [40, 0],
        ],
        beats: [{ at: [40, 0], radius: 20, level: 0 }],
        door: [64, 0],
      },
    ],
  } as unknown as NodeLayout;
  const clearings = planOfLayouts([laid])?.clearings ?? [];
  const covers = (x: number, y: number) =>
    clearings.some((clearing) => Math.hypot(x - clearing.at[0], y - clearing.at[1]) <= clearing.radius);
  assert.ok(covers(40, 15), "the beat's floor");
  assert.ok(covers(12, 4) && covers(27, -4), 'the way along its line');
  assert.ok(!covers(20, 30), 'not the rock beside it');
});

test("a chalk zone's rubble is chalk, and its other solids are as they were", () => {
  const solid = (material: string) => ({
    shape: 'block',
    at: [0, 0, 0],
    size: [1, 1, 1],
    turn: 0,
    lean: 0,
    roll: 0,
    material,
  });
  const laid = (stone?: string) =>
    ({
      id: 'z',
      ring: [],
      buildings: [],
      props: [],
      tiles: [],
      rooms: [],
      pads: [],
      areas: [],
      stone,
      solids: [solid('rubble'), solid('stone')],
    }) as unknown as NodeLayout;
  assert.deepEqual(
    planOfLayouts([laid('chalk')])?.works.map((each) => each.material),
    ['chalk', 'stone'],
  );
  assert.deepEqual(
    planOfLayouts([laid()])?.works.map((each) => each.material),
    ['rubble', 'stone'],
  );
});

test("a layout's plantings reach nature as placed instances", () => {
  const laid = (plantings?: unknown) => ({ id: 'vale', plantings }) as unknown as NodeLayout;
  const planted = plantedOf(
    [
      laid([
        {
          kind: 'oak',
          points: [
            [130, 70],
            [139, 70],
          ],
        },
        { kind: 'gorse', points: [[10, -200]] },
      ]),
      laid(),
    ],
    64,
  );
  assert.deepEqual(planted(2, 1), [
    { kind: 'oak', at: [130, 70] },
    { kind: 'oak', at: [139, 70] },
  ]);
  assert.deepEqual(planted(0, -4), [{ kind: 'gorse', at: [10, -200] }]);
  assert.deepEqual(planted(1, 1), [], 'none where nothing is planted');
});
