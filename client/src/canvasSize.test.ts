import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasSize } from './canvasSize.ts';

test('the buffer is the displayed size times the pixel ratio', () => {
  assert.deepEqual(canvasSize(800, 600, 2), { width: 1600, height: 1200, ratio: 2 });
});

test('fractional sizes round to whole pixels', () => {
  assert.deepEqual(canvasSize(333, 101, 1.5), { width: 500, height: 152, ratio: 1.5 });
});

test('a hidden canvas still gets a one-pixel buffer', () => {
  assert.deepEqual(canvasSize(0, 0, 2), { width: 1, height: 1, ratio: 2 });
});

test('a missing or broken pixel ratio counts as one', () => {
  assert.deepEqual(canvasSize(10, 20, 0), { width: 10, height: 20, ratio: 1 });
  assert.deepEqual(canvasSize(10, 20, Number.NaN), { width: 10, height: 20, ratio: 1 });
});

test('a buffer wider or taller than the GPU draws is shrunk to its most, keeping its shape', () => {
  assert.deepEqual(canvasSize(5000, 1000, 2), { width: 8192, height: 1638, ratio: 8192 / 5000 });
  assert.deepEqual(canvasSize(1000, 6000, 2), { width: 1365, height: 8192, ratio: 8192 / 6000 });
});
