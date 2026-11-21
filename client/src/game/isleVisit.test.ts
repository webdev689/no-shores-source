import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomConnection } from '../network/roomConnection.ts';
import { Foot, type FootContext } from './foot.ts';
import { ashoreOn } from './isleVisit.ts';
import type { IsleHeld } from './isles.ts';

test("a landing that fails closes the island room's socket rather than leaving it to rejoin for ever", async (context) => {
  let closed = 0;
  const connection = Object.assign(Object.create(RoomConnection.prototype) as RoomConnection, {
    close: () => closed++,
  });
  context.mock.method(RoomConnection, 'open', () => Promise.resolve(connection));
  context.mock.method(Foot, 'onDeck', (...asked: unknown[]) => {
    (asked[3] as (received: unknown) => unknown)(() => undefined);
    return Promise.reject(new Error('the ground did not load'));
  });
  const held = {
    seen: { id: 3, at: [1000, 2000], seed: 255n, kind: 'cove', name: 'A cove' },
    plan: { ring: [[0, 0]], spawns: [[1, 1]], blocks: [], heights: new Float32Array(4), facing: 0, wrecks: [] },
    heights: new Float32Array(4),
  } as unknown as IsleHeld;
  const rooms = (name: string) => `wss://rooms.test/${name}`;
  const foot = { rooms, session: () => Promise.resolve(null) } as unknown as FootContext;
  const where = { word: null, continent: 'continent-4', seas: 'normal' } as const;
  await assert.rejects(
    ashoreOn(foot, held, where, () => undefined),
    /the ground did not load/,
  );
  assert.equal(closed, 1);
});
