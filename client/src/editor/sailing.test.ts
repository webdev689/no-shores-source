import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Helm, ShipFloats } from '../rules/landRules.ts';
import type { Sailed } from './landClient.ts';
import { Sailing, type SailSource } from './sailing.ts';

interface Asked {
  readonly ship: ShipFloats;
  readonly helm: Helm;
  readonly time: number;
  readonly ticks: number;
}

/** A door that answers at once, or holds every answer until let go, and keeps what it was asked. */
function fakeDoor(aground = false, holding = false) {
  const asked: Asked[] = [];
  const held: (() => void)[] = [];
  const source: SailSource = {
    sail: (_id, ship, helm, time, ticks) => {
      asked.push({ ship, helm, time, ticks });
      const sailed: Sailed = { ship, pose: { heave: 0.1, pitch: 0, roll: 0, aground } };
      return holding ? new Promise((resolve) => held.push(() => resolve(sailed))) : Promise.resolve(sailed);
    },
  };
  return { source, asked, letGo: () => held.splice(0).forEach((resolve) => resolve()) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const ignore = () => undefined;

test('putting to sea where the door answers her aground is refused with a reason', async () => {
  const { source, asked } = fakeDoor(true);
  const answer = await Sailing.putToSea(source, 'square', 1000, 2000, 0.5, 10);
  assert.equal(typeof answer, 'string');
  assert.equal(asked[0]?.ticks, 0, 'the rules decide, stepping nothing');
  assert.deepEqual([...(asked[0]?.ship ?? [])], [1000, 2000, 0.5, 0, 0, 0, 0, 0]);
});

test('a long frame steps at most six ticks, ending at the time asked', async () => {
  const { source, asked } = fakeDoor();
  const sailing = await Sailing.putToSea(source, 'square', 0, 0, 0, 0);
  assert.ok(sailing instanceof Sailing);
  sailing.advance(5, new Set(), 100, ignore);
  assert.equal(asked[1]?.ticks, 6);
  assert.ok(Math.abs((asked[1]?.time ?? 0) - (100 - 6 / 60)) < 1e-9);
});

test('a frame shorter than a tick waits, and its time is kept for the next', async () => {
  const { source, asked } = fakeDoor();
  const sailing = await Sailing.putToSea(source, 'square', 0, 0, 0, 0);
  assert.ok(sailing instanceof Sailing);
  sailing.advance(0.01, new Set(), 1, ignore);
  assert.equal(asked.length, 1);
  sailing.advance(0.01, new Set(), 1.01, ignore);
  assert.equal(asked[1]?.ticks, 1);
});

test('while one step is with the door, no other is asked, and a press waits for a tick', async () => {
  const { source, asked, letGo } = fakeDoor(false, true);
  const pending = Sailing.putToSea(source, 'square', 0, 0, 0, 0);
  letGo();
  const sailing = await pending;
  assert.ok(sailing instanceof Sailing);
  sailing.press('w');
  sailing.advance(0.05, new Set(), 1, ignore);
  sailing.advance(0.05, new Set(), 1.05, ignore);
  assert.equal(asked.length, 2, 'one step in flight');
  assert.equal(asked[1]?.helm.climb, 1);
  letGo();
  await settle();
  sailing.advance(0.05, new Set(), 1.1, ignore);
  assert.equal(asked.length, 3);
  assert.equal(asked[2]?.helm.climb, 0, 'the press went with the first step');
});
