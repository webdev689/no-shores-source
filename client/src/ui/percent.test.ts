import assert from 'node:assert/strict';
import { test } from 'node:test';
import { percentWords } from './percent.ts';

test('a share reads 100% only once whole and 0% only at none, rounded between', () => {
  assert.deepEqual([0, 0.004, 0.012, 0.375, 0.5, 0.994, 0.996, 1].map(percentWords), [
    '0%',
    '1%',
    '1%',
    '38%',
    '50%',
    '99%',
    '99%',
    '100%',
  ]);
  assert.deepEqual([-0.2, 1.3].map(percentWords), ['0%', '100%'], 'held to its whole');
});
