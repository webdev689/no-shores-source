import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasSize } from './canvasSize.ts';

test('the buffer is the displayed size times the pixel ratio', () => {
  assert.deepEqual(canvasSize(800, 600, 2), { width: 1600, height: 1200 });
});

test('fractional sizes round to whole pixels', () => {
  assert.deepEqual(canvasSize(333, 101, 1.5), { width: 500, height: 152 });
});

test('a hidden canvas still gets a one-pixel buffer', () => {
  assert.deepEqual(canvasSize(0, 0, 2), { width: 1, height: 1 });
});

test('a missing or broken pixel ratio counts as one', () => {
  assert.deepEqual(canvasSize(10, 20, 0), { width: 10, height: 20 });
  assert.deepEqual(canvasSize(10, 20, Number.NaN), { width: 10, height: 20 });
});
