import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARK_FLOATS } from '../combat/marks.ts';
import type { GearState } from '../network/gearMessages.ts';
import { gearRings, nodesInReach } from './gearGround.ts';

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

test('the ground marks the stall and each node; a drop lying for the player is no ring', () => {
  const lying = { spent: [], drops: [{ id: 1, rarity: 3, slot: 0, at: [2, 2, 0] }] } as unknown as GearState;
  const ring = gearRings({ x: 0, y: 0 }, [], null, 0).length;
  // The stall is two rings; each node one.
  assert.equal(gearRings({ x: 0, y: 0 }, NODES, lying, 0).length, ring + (ring / 2) * 2);
  assert.equal(ring % MARK_FLOATS, 0);
});
