import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, rebind } from '../player/binds.ts';
import { BINDS } from '../player/input.ts';
import { boundKey, pictureNode } from './gearNodes.ts';

test("a footer's control is shown by the key it is bound to now, and a gesture by its name", () => {
  BINDS.set(DEFAULTS);
  assert.deepEqual(['Right-click', 'details', 'character', 'Esc'].map(boundKey), ['Right-click', 'X', 'I', 'Esc']);
  const moved = rebind(DEFAULTS, { id: 'details', device: 'keys', place: 0 }, 'v').binds;
  BINDS.set(moved ?? DEFAULTS);
  assert.equal(boundKey('details'), 'V', 'rebound, the footer names the new key');
  BINDS.set(DEFAULTS);
});

test("a long thin icon is laid on its tile's diagonal, as a weapon is, unless the forge drew it standing", () => {
  const tall = { width: 10, height: 40, pixels: new Uint8ClampedArray(10 * 40 * 4).fill(255) };
  const laid = pictureNode(tall, 48, 1);
  assert.deepEqual([laid.width, laid.height], [48, 48], 'turned across the whole tile');
  const standing = pictureNode({ ...tall, upright: true }, 48, 1);
  assert.deepEqual([standing.width, standing.height], [10, 40], 'standing as drawn, at whole pixels');
});
