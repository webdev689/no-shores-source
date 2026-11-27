import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countingGpu } from '../../gpuForTests.ts';
import { BloodView } from './view.ts';

test('the blood lets go of every buffer and picture it made', () => {
  const { gpu, live } = countingGpu();
  const view = new BloodView(gpu, 64, { format: 'depth32float', compare: 'greater' });
  assert.ok(live() > 0);
  view.destroy();
  assert.equal(live(), 0, 'its sheet, droplet and their flags too, which each place entered makes again');
});
