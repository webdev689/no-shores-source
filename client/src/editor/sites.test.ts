import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ringArea, type Spot } from './placeDrawing.ts';
import {
  distinctPoints,
  movedCity,
  newNode,
  type Node,
  nodeAt,
  ringMiddle,
  siteFocus,
  spawnAt,
  withNodeFields,
  withoutLastSpawn,
  withoutSpawn,
  withSpawn,
} from './sites.ts';

const square = (west: number, north: number, side: number): Spot[] => [
  [west, north],
  [west + side, north],
  [west + side, north + side],
  [west, north + side],
];

const nodes: Node[] = [
  { id: 'big', kind: 'patrol', name: 'Big', ring: square(0, 0, 1000), spawns: [[100, 100]] },
  { id: 'small', kind: 'boss', name: 'Small', ring: square(400, 400, 200), spawns: [] },
];

test('a ring middle is its points’ mean, or inside a corner when the mean falls outside', () => {
  assert.deepEqual(ringMiddle(square(0, 0, 100)), [50, 50]);
  // A U open to the north: the mean of its points lies in the gap between its arms.
  const shape: Spot[] = [
    [0, 0],
    [100, 0],
    [100, 300],
    [200, 300],
    [200, 0],
    [300, 0],
    [300, 400],
    [0, 400],
  ];
  const middle = ringMiddle(shape);
  assert.ok(nodeAt([{ ...nodes[0], ring: shape }], middle), `${middle.join()} lies inside the U`);
  assert.equal(ringArea(square(0, 0, 100)), 10_000);
});

test('a drawing drops repeated points, and a ring a last point back on its first', () => {
  const clicks: Spot[] = [
    [0, 0],
    [10, 0],
    [10, 0],
    [10, 10],
    [0, 0],
  ];
  assert.deepEqual(distinctPoints(clicks, true), [
    [0, 0],
    [10, 0],
    [10, 10],
  ]);
  assert.equal(distinctPoints(clicks, false).length, 4, 'a course may come back to where it started');
});

test('a new node takes the next node number, its id for a blank name, and a spawn at its middle', () => {
  const places = { nodes: [{ ...nodes[0], id: 'node-2' }, nodes[1]] };
  const node = newNode(places, 'mission', '  ', square(0.4, 0, 600));
  assert.equal(node.id, 'node-3');
  assert.equal(node.name, 'node-3');
  assert.deepEqual(node.ring[0], [0, 0], 'whole metres');
  assert.deepEqual(node.spawns, [[300, 300]]);
  assert.equal(newNode({}, 'boss', 'The Maw', square(0, 0, 600)).id, 'node-1');
});

test('the node under a spot is the smallest holding it; a spawn is found within reach', () => {
  assert.equal(nodeAt(nodes, [500, 500])?.id, 'small');
  assert.equal(nodeAt(nodes, [50, 50])?.id, 'big');
  assert.equal(nodeAt(nodes, [5000, 50]), null);
  assert.deepEqual(spawnAt(nodes, [110, 95], 20), { node: 'big', index: 0 });
  assert.equal(spawnAt(nodes, [200, 200], 20), null);
});

test('spawns are added inside a node, taken last first, or taken one by one', () => {
  const added = withSpawn(nodes, [450.6, 450.2]);
  assert.deepEqual(added?.[1]?.spawns, [[451, 450]]);
  assert.equal(withSpawn(nodes, [5000, 5000]), null, 'outside every node');
  assert.deepEqual(withoutLastSpawn(added ?? [], [450, 450])?.[1]?.spawns, []);
  assert.equal(withoutLastSpawn(nodes, [450, 450]), null, 'the small node has none to take');
  assert.deepEqual(withoutSpawn(nodes, { node: 'big', index: 0 })[0]?.spawns, []);
  assert.equal(nodes[0]?.spawns.length, 1, 'the nodes given are left as they were');
});

test('a node’s kind and name change; a blank name keeps the old one', () => {
  const changed = withNodeFields(nodes, 'small', { kind: 'dungeon', name: ' ' });
  assert.deepEqual([changed[1]?.kind, changed[1]?.name], ['dungeon', 'Small']);
  assert.equal(withNodeFields(nodes, 'big', { name: 'Bigger' })[0]?.name, 'Bigger');
});

test('the city moves to a spot in whole metres', () => {
  const city = { id: 'overlook', name: 'Overlook', centre: [0, 0] as Spot, motif: 'beacon' };
  assert.deepEqual(movedCity(city, [10.4, 20.6]), { ...city, centre: [10, 21] });
});

test('a site is shown whole: the city with its wall, a node with room round it', () => {
  const city = { id: 'overlook', name: 'Overlook', centre: [1000, 2000] as Spot, motif: 'beacon' };
  assert.deepEqual(siteFocus({ city, nodes }, 'overlook'), { x: 1000, y: 2000, acrossM: 8640 });
  assert.deepEqual(siteFocus({ city, nodes }, 'big'), { x: 500, y: 500, acrossM: 1600 });
  assert.equal(siteFocus({ city, nodes }, 'none'), null);
});
