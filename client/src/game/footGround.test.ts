import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeText } from './footGround.ts';
import type { NodeInfo } from './worldData.ts';

const NODE: NodeInfo = {
  id: 'saltgrass-downs',
  kind: 'patrol',
  name: 'Saltgrass Downs',
  continent: 'continent-1',
  ring: [
    [0, 0],
    [100, 0],
    [100, 100],
  ],
  spawns: [[10, 10]],
  centre: [50, 30],
};

test("a page playing alone writes its node's places into the node's file, as the bake does for the rooms", () => {
  const places = [
    { name: 'The Old Beacon', at: [10, -20] as const, radius: 30 },
    { name: 'The Chalk Adit', at: [40, 5] as const, radius: 25 },
  ];
  const box = { minX: 1, minY: 2, maxX: 3, maxY: 4, top: 5, bottom: 0 };
  const file = JSON.parse(nodeText({ ...NODE, places }, [0, 0, 100, 100], '{"cells":[]}', [box])) as Record<
    string,
    unknown
  >;
  assert.deepEqual(file.places, [
    { name: 'The Old Beacon', at: [10, -20], radius: 30 },
    { name: 'The Chalk Adit', at: [40, 5], radius: 25 },
  ]);
  assert.deepEqual(
    [file.id, file.bounds, file.boxes, file.ground],
    [NODE.id, [0, 0, 100, 100], [[1, 2, 3, 4, 5, 0]], { cells: [] }],
  );
  assert.deepEqual(JSON.parse(nodeText(NODE, [0, 0, 1, 1], '{}', [])).places, [], 'a node not laid names none');
});

test("a page playing alone writes its node's foes' sites into the node's file, as the bake does for the rooms", () => {
  const foes = [[10, -20] as const, [40, 5] as const];
  assert.deepEqual(JSON.parse(nodeText({ ...NODE, foes }, [0, 0, 100, 100], '{}', [])).foes, [
    [10, -20],
    [40, 5],
  ]);
  assert.deepEqual(JSON.parse(nodeText(NODE, [0, 0, 1, 1], '{}', [])).foes, [], 'a node not laid has none');
});

test("a page playing alone writes its node's ways into the node's file, where its room lays respawns near a fall", () => {
  const paths = [
    [[0, 0] as const, [60, 0] as const],
    [[5, 5] as const, [5, 40] as const],
  ];
  assert.deepEqual(JSON.parse(nodeText({ ...NODE, paths }, [0, 0, 100, 100], '{}', [])).paths, [
    [
      [0, 0],
      [60, 0],
    ],
    [
      [5, 5],
      [5, 40],
    ],
  ]);
  assert.deepEqual(JSON.parse(nodeText(NODE, [0, 0, 1, 1], '{}', [])).paths, [], 'a node not laid has none');
});
