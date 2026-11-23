import assert from 'node:assert/strict';
import { test } from 'node:test';
import { standIn, standIns } from './standIns.ts';

test('what stood in is said once each, and asking starts afresh', () => {
  standIns();
  standIn('figures');
  standIn('plants');
  standIn('figures');
  assert.deepEqual(standIns(), ['figures', 'plants']);
  assert.deepEqual(standIns(), [], 'a frame with none');
});
