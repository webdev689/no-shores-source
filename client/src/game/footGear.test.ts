import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARK_FLOATS } from '../combat/marks.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { NODE_REACH_M, groundRings, useAt } from './footGear.ts';
import type { StationInfo } from './nodes.ts';

const ARMSMITH: StationInfo = { kind: 'armsmith', keeper: [0, -2], counter: [0, 0] };
const CHANDLER: StationInfo = { kind: 'chandler', keeper: [20, -2], counter: [20, 0] };
const lying = {
  nodes: [{ index: 3, x: 10, y: 0, resource: 0 }],
  drops: [{ id: 1, rarity: 3, slot: 0, at: [5, 5, 1] }],
} as unknown as GearState;

test('E at a counter opens its tab, and near a node asks the room to gather it', () => {
  const asked: GearAsk[] = [];
  const ask = (each: GearAsk) => asked.push(each);
  assert.match(useAt(0.5, 0.5, [ARMSMITH], lying, ask)?.words ?? '', /^E: The Armsmith/);
  const gather = useAt(10 + NODE_REACH_M - 0.1, 0, [ARMSMITH], lying, ask);
  assert.match(gather?.words ?? '', /^E: gather /);
  gather?.run();
  assert.deepEqual(asked, [{ kind: ASKS.gather, node: 3 }]);
  assert.equal(useAt(10 + NODE_REACH_M + 0.1, 0, [ARMSMITH], lying, ask), null, "out of the room's reach");
  assert.equal(useAt(20, 0, [CHANDLER], null, ask), null, 'a station that deals with no one offers nothing');
});

test('the ground rings each dealing counter, and each node and Vestige twice under a beam, on the floor', () => {
  const one = groundRings(null, [ARMSMITH], () => 0, 0).length;
  assert.equal(one % MARK_FLOATS, 0);
  assert.equal(groundRings(null, [ARMSMITH, CHANDLER], () => 0, 0).length, one, 'the chandler deals with no one');
  const all = groundRings(lying, [ARMSMITH], () => 2, 0);
  // A beam is two crossed planes of two triangles each.
  assert.equal(all.length, one * 5 + 2 * 12 * MARK_FLOATS);
  assert.ok(Math.abs((all[one + 2] ?? 0) - 2) < 0.1, "a node's ring stands on the floor's height, just over it");
});
