import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resourcePicture, vestigePicture } from '../combat/dropPictures.ts';
import type { GearState } from '../network/gearMessages.ts';
import { gearMarked, nodesInReach } from './gearGround.ts';

const NODES = [
  { x: 0, y: 0, resource: 0 },
  { x: 10, y: 0, resource: 1 },
];

const spent = (indices: number[]) => ({ spent: indices, drops: [] }) as unknown as GearState;

test('a resource node is gathered within reach, and not once spent', () => {
  assert.deepEqual(nodesInReach({ x: 1, y: 1 }, NODES, null), [{ node: 0, resource: 0 }]);
  assert.deepEqual(nodesInReach({ x: 1, y: 1 }, NODES, spent([0])), []);
  assert.deepEqual(nodesInReach({ x: 9, y: 2 }, NODES, spent([0])), [{ node: 1, resource: 1 }]);
  assert.deepEqual(nodesInReach({ x: 5, y: 0 }, NODES, null), []);
});

test("the stall wears a sealed Vestige's mark over it and each node not yet spent its resource's, as in the game", () => {
  // The room sends the nodes a player may still gather: the first is spent.
  const lying = {
    spent: [0],
    nodes: [{ index: 1, ...NODES[1] }],
    drops: [{ id: 1, rarity: 3, slot: 0, at: [2, 2, 0] }],
  } as unknown as GearState;
  const marked = gearMarked({ x: 20, y: 0 }, lying);
  assert.deepEqual(
    marked.map((mark) => mark.picture),
    [vestigePicture(0), resourcePicture(1)],
    'a drop lying for the player wears none',
  );
  assert.deepEqual(marked[0]?.at.slice(0, 2), [20, 0], 'over the stall');
  assert.deepEqual(
    gearMarked({ x: 20, y: 0 }, null).map((mark) => mark.picture),
    [vestigePicture(0)],
  );
});
