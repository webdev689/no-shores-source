import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS } from '../network/gearMessages.ts';
import { statusAsk } from './statusPanel.ts';

test('a status asked for goes to the room as a grant: its number, on whom, and its ticks, 0 for its own time', () => {
  assert.deepEqual(statusAsk(1, true, 2.5), { kind: ASKS.grantStatus, slot: 1, node: 1, count: 150 });
  assert.deepEqual(statusAsk(3, false, 0), { kind: ASKS.grantStatus, slot: 3, node: 0, count: 0 });
  assert.equal(statusAsk(0, false, Number.NaN).count, 0, 'a number that is none, its own time');
  assert.equal(statusAsk(0, false, 1e9).count, 600 * 60, 'ten minutes at most');
});
