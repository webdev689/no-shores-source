import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArrivalSeen } from '../network/arrivalMessages.ts';
import { CROWN, crownState } from './crownLife.ts';

const CROWN_SEEN: ArrivalSeen = {
  id: 2,
  kind: 2,
  at: [0, 0, 5],
  heading: 1,
  high: 0,
  began: 100,
  hangs: 172,
  leaves: 300,
  gone: 348,
};

test('a crown grows out of its heart, overshooting a little before it sets whole', () => {
  assert.equal(crownState(CROWN_SEEN, 99), null);
  const scales = Array.from({ length: 73 }, (unused, tick) => crownState(CROWN_SEEN, 100 + tick)!.scale);
  assert.ok(scales[0]! < 0.1, 'from nearly nothing');
  assert.ok(Math.max(...scales) > 1.02, 'past whole');
  assert.ok(Math.abs(scales.at(-1)! - 1) < 0.03, 'and back');
});

test('it holds while its foes form, then cracks and breaks', () => {
  assert.equal(crownState(CROWN_SEEN, 200)!.cracking, 0);
  const cracking = crownState(CROWN_SEEN, CROWN_SEEN.leaves + CROWN.crackTicks / 2)!;
  assert.ok(cracking.cracking > 0.4 && !cracking.broken);
  assert.ok(crownState(CROWN_SEEN, CROWN_SEEN.leaves + CROWN.crackTicks)!.broken);
  assert.equal(crownState(CROWN_SEEN, CROWN_SEEN.gone), null);
});
