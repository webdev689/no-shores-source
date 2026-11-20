import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MARK_FLOATS } from '../combat/marks.ts';
import { ASKS, type GearAsk, type GearState } from '../network/gearMessages.ts';
import { NODE_REACH_M, STORY_BEHIND_ON_FOOT, groundRings, tellsPrologue, useAt } from './footGear.ts';
import type { StationInfo } from './nodes.ts';
import { countersOf } from './plazaLife.ts';

const ARMSMITH: StationInfo = { kind: 'armsmith', keeper: [0, -2], counter: [0, 0] };
const CHANDLER: StationInfo = { kind: 'chandler', keeper: [20, -2], counter: [20, 0] };
const lying = {
  nodes: [{ index: 3, x: 10, y: 0, resource: 0 }],
  drops: [{ id: 1, rarity: 3, slot: 0, at: [5, 5, 1] }],
} as unknown as GearState;

test('E at a counter opens its tab, and near a node asks the room to gather it', () => {
  const asked: GearAsk[] = [];
  const ask = (each: GearAsk) => asked.push(each);
  assert.match(useAt(0.5, 0.5, [ARMSMITH], lying, ask)?.words ?? '', /^The Armsmith/);
  const gather = useAt(10 + NODE_REACH_M - 0.1, 0, [ARMSMITH], lying, ask);
  assert.match(gather?.words ?? '', /^Gather /);
  gather?.run();
  assert.deepEqual(asked, [{ kind: ASKS.gather, node: 3 }]);
  assert.equal(useAt(10 + NODE_REACH_M + 0.1, 0, [ARMSMITH], lying, ask), null, "out of the room's reach");
  assert.equal(useAt(20, 0, [CHANDLER], null, ask), null, 'a station that deals with no one offers nothing');
});

test('the ground rings each dealing counter, and each node twice under a beam, on the floor; a drop is no ring', () => {
  const one = groundRings(null, [ARMSMITH], () => 0, 0).length;
  assert.equal(one % MARK_FLOATS, 0);
  assert.equal(groundRings(null, [ARMSMITH, CHANDLER], () => 0, 0).length, one, 'the chandler deals with no one');
  const all = groundRings(lying, [ARMSMITH], () => 2, 0);
  // A beam is two crossed planes of two triangles each.
  assert.equal(all.length, one * 3 + 12 * MARK_FLOATS);
  assert.ok(Math.abs((all[one + 2] ?? 0) - 2) < 0.1, "a node's ring stands on the floor's height, just over it");
});

test('the room is told the prologue was played once for each word on the gear that says it is not kept', () => {
  const unkept = { prologueDone: false } as unknown as GearState;
  const restored = { prologueDone: false } as unknown as GearState;
  assert.equal(tellsPrologue(unkept, true, null), true);
  assert.equal(tellsPrologue(unkept, true, unkept), false, 'told once for that word');
  assert.equal(tellsPrologue(restored, true, unkept), true, 'told again once the kept character comes');
  assert.equal(tellsPrologue({ prologueDone: true } as unknown as GearState, true, null), false);
  assert.equal(tellsPrologue(unkept, false, null), false, 'not played in this browser');
  assert.equal(tellsPrologue(null, true, null), false);
});

test('on foot the room is always told, so no character is kept out by a prologue that did not run', () => {
  // Every way onto foot comes after the story: played through, Begin at the title, a `?at=` link, or a story that
  // could not start or go on.
  const unkept = { prologueDone: false } as unknown as GearState;
  assert.equal(tellsPrologue(unkept, STORY_BEHIND_ON_FOOT, null), true);
});

test('the bounty board is used and ringed where a player stands before it, though no keeper stands there', () => {
  const ask = () => undefined;
  const counters = countersOf({ stations: [ARMSMITH], board: [5, 0] });
  assert.equal(useAt(5.5, 0, counters, null, ask)?.words, 'The Bounty Board: bounties for XP and Aurem');
  assert.equal(useAt(9, 0, counters, null, ask), null, 'past its reach');
  assert.equal(groundRings(null, counters, () => 0, 0).length, 2 * groundRings(null, [ARMSMITH], () => 0, 0).length);
  assert.deepEqual(countersOf({ stations: [ARMSMITH] }), [ARMSMITH], 'no board in any other plaza');
});
