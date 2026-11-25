import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOOKS, layLanding } from './arrivalLooks.ts';

test('dust thrown up as a foe lands passes through a few kept sprites, not a new one every frame', () => {
  const laid = new Set<string>();
  for (let frame = 0; frame <= 1000; frame++) {
    const out: number[] = [];
    layLanding(out, [0, 0, 0], (frame / 1000) * LOOKS.landDustS);
    laid.add(out.join(','));
  }
  assert.ok(laid.size <= 9, `${laid.size} sprites`);
});
