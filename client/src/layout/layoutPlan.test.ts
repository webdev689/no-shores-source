import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { planOfLayouts } from './layoutPlan.ts';
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
