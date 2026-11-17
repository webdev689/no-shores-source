import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestOnLine, nextId, placeAt, snapPoint } from './placeDrawing.ts';

const places = {
  roads: [
    {
      id: 'road-2',
      points: [
        [0, 0],
        [10_000, 0],
      ] as [number, number][],
    },
  ],
  towns: [
    {
      id: 'town-1',
      outline: [
        [20_000, 0],
        [30_000, 0],
        [30_000, 10_000],
        [20_000, 10_000],
      ] as [number, number][],
    },
  ],
  ports: [{ id: 'port-1', at: [50_000, 5_000] as [number, number] }],
  nodes: [
    {
      id: 'node-1',
      kind: 'patrol' as const,
      name: 'Downs',
      ring: [
        [24_000, 4_000],
        [26_000, 4_000],
        [26_000, 6_000],
      ] as [number, number][],
      spawns: [],
    },
  ],
};

test('a new place takes the next free number of its kind', () => {
  assert.equal(nextId(places, 'road'), 'road-3');
  assert.equal(nextId(places, 'river'), 'river-1');
  assert.equal(nextId(places, 'node'), 'node-2');
});

test('a road point snaps to a port, a road point or a town edge within reach, in whole metres', () => {
  assert.deepEqual(snapPoint(places, [50_400, 5_300], 1000), [50_000, 5_000]);
  assert.deepEqual(snapPoint(places, [10_200, 300], 1000), [10_000, 0]);
  assert.deepEqual(snapPoint(places, [19_300.4, 4_000.6], 1000), [20_000, 4_001]);
  assert.deepEqual(snapPoint(places, [40_000.4, 40_000], 1000), [40_000, 40_000], 'nothing near: it stays');
});

test('the place under a spot is the nearest within reach, or the town it is inside', () => {
  assert.deepEqual(placeAt(places, [5_000, 400], 1000), { list: 'roads', id: 'road-2' });
  assert.deepEqual(placeAt(places, [22_000, 5_000], 1000), { list: 'towns', id: 'town-1' });
  assert.deepEqual(placeAt(places, [25_500, 5_000], 1000), { list: 'nodes', id: 'node-1' }, 'a node in a town');
  const road = { id: 'road-9', points: [[25_000, 3_000] as [number, number], [25_000, 7_000] as [number, number]] };
  const crossed = { ...places, roads: [...places.roads, road] };
  assert.deepEqual(placeAt(crossed, [25_100, 4_500], 200), { list: 'roads', id: 'road-9' }, 'a road in a node');
  assert.deepEqual(placeAt(places, [50_300, 5_000], 1000), { list: 'ports', id: 'port-1' });
  assert.equal(placeAt(places, [80_000, 80_000], 1000), null);
  assert.equal(
    nearestOnLine(
      [
        [0, 0],
        [10, 0],
      ],
      [5, 3],
    ).distance,
    3,
  );
});
