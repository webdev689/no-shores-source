import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../network/gearMessages.ts';
import { ammoLine } from './characterPage.ts';

const gear = (fields: Partial<GearState>) => fields as GearState;

test('under the Ranged slot, the shots left of its capacity, or "No ammo" in the loss colour; none with none worn', () => {
  assert.deepEqual(ammoLine(gear({ ammo: 18, ammoMost: 24 })), { words: '18 of 24 shots', none: false });
  assert.deepEqual(ammoLine(gear({ ammo: 0, ammoMost: 60 })), { words: 'No ammo', none: true });
  assert.equal(ammoLine(gear({ ammo: 0, ammoMost: 0 })), null);
});
