import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CHART_CELL_M,
  CHART_COLUMNS,
  chartAround,
  discoveryText,
  emptyDiscovery,
  readDiscovery,
  SIGHT_M,
  sightIslands,
} from './discovery.ts';

const cell = (column: number, row: number) => row * CHART_COLUMNS + column;

test('the sea is charted within sight of a point, and charting it again changes nothing', () => {
  const discovery = emptyDiscovery();
  const point = [100.5 * CHART_CELL_M, 50.5 * CHART_CELL_M] as const;
  assert.ok(chartAround(discovery, point));
  const reach = SIGHT_M / CHART_CELL_M;
  assert.equal(discovery.charted[cell(100, 50)], 1);
  assert.equal(discovery.charted[cell(100 + Math.floor(reach), 50)], 1, 'the cell at the edge of sight');
  assert.equal(discovery.charted[cell(100 + Math.ceil(reach) + 1, 50)], 0, 'past sight');
  assert.equal(discovery.charted[cell(100 + Math.floor(reach), 50 + Math.floor(reach))], 0, 'the corner, past sight');
  assert.ok(!chartAround(discovery, point));
});

test('charting by the frame’s edge keeps within it', () => {
  const discovery = emptyDiscovery();
  assert.ok(chartAround(discovery, [0, 0]));
  assert.equal(discovery.charted[cell(0, 0)], 1);
});

test('an island is sighted once its coast comes within sight, and only once', () => {
  const discovery = emptyDiscovery();
  const square = [
    [0, 0],
    [100_000, 0],
    [100_000, 100_000],
    [0, 100_000],
  ] as const;
  const islands = [{ id: 'near', outline: square }];
  assert.deepEqual(sightIslands(discovery, [100_000 + SIGHT_M + 1000, 50_000], islands), []);
  assert.deepEqual(sightIslands(discovery, [100_000 + SIGHT_M - 1000, 50_000], islands), ['near']);
  assert.deepEqual(sightIslands(discovery, [100_000 + 10, 50_000], islands), []);
  assert.ok(discovery.islands.has('near'));
});

test('a discovery kept as text reads back the same', () => {
  const discovery = emptyDiscovery();
  chartAround(discovery, [300_000, 200_000]);
  discovery.islands.add('continent-1');
  discovery.ports.add('overlook');
  discovery.nodes.add('overlook-social');
  const back = readDiscovery(discoveryText(discovery));
  assert.deepEqual(back.charted, discovery.charted);
  assert.deepEqual([...back.islands], ['continent-1']);
  assert.deepEqual([...back.ports], ['overlook']);
  assert.deepEqual([...back.nodes], ['overlook-social']);
});

test('a missing, damaged or foreign store reads as nothing discovered', () => {
  for (const text of [null, '', 'not json', '{"charted": 5}', '{"charted": "AAAA"}', '[]']) {
    const back = readDiscovery(text);
    assert.equal(back.charted.some(Boolean), false, String(text));
    assert.equal(back.islands.size + back.ports.size + back.nodes.size, 0, String(text));
  }
});
