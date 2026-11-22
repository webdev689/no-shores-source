import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, rebind } from '../player/binds.ts';
import { BINDS } from '../player/input.ts';
import { boundKey } from './gearNodes.ts';

test("a footer's control is shown by the key it is bound to now, and a gesture by its name", () => {
  BINDS.set(DEFAULTS);
  assert.deepEqual(['Right-click', 'details', 'character', 'Esc'].map(boundKey), ['Right-click', 'X', 'I', 'Esc']);
  const moved = rebind(DEFAULTS, { id: 'details', device: 'keys', place: 0 }, 'v').binds;
  BINDS.set(moved ?? DEFAULTS);
  assert.equal(boundKey('details'), 'V', 'rebound, the footer names the new key');
  BINDS.set(DEFAULTS);
});
