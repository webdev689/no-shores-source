import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WayGraph } from './ways.ts';

/** Two ways from (0, 0) to (20, 0): over a hill by (10, 15), two links; and along the flat, four; and a point alone. */
const GRAPH = new WayGraph({
  points: [
    { at: [0, 0], name: 'start' },
    { at: [10, 15], name: '' },
    { at: [20, 0], name: 'end' },
    { at: [5, 0], name: '' },
    { at: [10, 0], name: 'counter:mage' },
    { at: [15, 0], name: '' },
    { at: [50, 50], name: 'alone' },
  ],
  links: [
    [0, 1],
    [1, 2],
    [0, 3],
    [3, 4],
    [4, 5],
    [5, 2],
  ],
});

test('the shortest way is the shortest by length, not the one of fewest links', () => {
  assert.deepEqual(GRAPH.route(0, 2), [0, 3, 4, 5, 2]);
  assert.deepEqual(GRAPH.route(2, 0), [2, 5, 4, 3, 0]);
  assert.deepEqual(GRAPH.route(1, 1), [1]);
});

test('no way joins a point no link reaches', () => {
  assert.deepEqual(GRAPH.route(0, 6), []);
});
