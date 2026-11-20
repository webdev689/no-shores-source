import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { type Player } from '../player/player.ts';
import { installQaViews, qaLook, type QaView } from './qaViews.ts';
import type { NodeInfo } from './worldData.ts';

const ring = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
] as const;
const node = { id: 'n', ring, spawns: [[5, 5]], centre: [50, 50] } as unknown as NodeInfo;

test('a QA look takes the bearing as yaw and the camera as asked, a high one past the wheel limit', () => {
  const first = qaLook(ring, [40, 60, 90, 'first']);
  assert.equal(first?.yaw, Math.PI / 2);
  assert.equal(first?.view.firstPerson, true);
  const high = qaLook(ring, [40, 60, 0, 'third,200,40']);
  assert.equal(high?.view.distance, 200);
  assert.equal(high?.pitch, (40 * Math.PI) / 180);
  assert.equal(qaLook(ring, [40, 60, 0, 'third,60'])?.pitch, 0.1);
});

test('a QA look outside the node, or with a camera not understood, is refused', () => {
  assert.equal(qaLook(ring, [140, 60, 0, 'first']), null);
  assert.equal(qaLook(ring, [40, 60, 0, 'third,60,x']), null);
  assert.equal(qaLook(ring, [40, 60, 0, 'sideways']), null);
});

/** A host that records the arrivals it is asked for, and a hook installed on it. */
function hooked(search: string, offline: boolean) {
  const arrivals: { node: NodeInfo; facing: number }[] = [];
  const walker = { player: { body: { x: 5, y: 5 }, pitch: 0.1, view: { firstPerson: true } } as unknown as Player };
  const target: { __qaView?: (view: QaView) => Promise<boolean> } = {};
  installQaViews(target, search, offline, {
    node: () => node,
    arrive: async (arrived, facing) => void arrivals.push({ node: arrived, facing }),
    walker,
  });
  return { target, arrivals, walker };
}

test('the hook is installed offline with a spawn in the address, and never online or without one', () => {
  assert.ok(hooked('?at=n&spawn=1,2,3', true).target.__qaView);
  assert.equal(hooked('?at=n&spawn=1,2,3', false).target.__qaView, undefined);
  assert.equal(hooked('?at=n', true).target.__qaView, undefined);
});

test('a view arrives in the node with its point as the only spawn, and sets the camera after', async () => {
  const { target, arrivals, walker } = hooked('?spawn=1,2', true);
  assert.equal(await target.__qaView?.([40, 60, 90, 'third,200,40']), true);
  assert.deepEqual(arrivals[0]?.node.spawns, [[40, 60]]);
  assert.equal(arrivals[0]?.facing, Math.PI / 2);
  assert.equal(walker.player.view.distance, 200);
  assert.equal(walker.player.pitch, (40 * Math.PI) / 180);
  assert.equal(await target.__qaView?.([400, 60, 0, 'first']), false);
  assert.equal(arrivals.length, 1);
});
