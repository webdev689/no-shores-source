import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LAMP_COLOUR, LAMP_FADE_M, LAMP_NEAR_M, lampAlpha, lampPoints, lampSize, lanternsLit } from './lanterns.ts';

test('a far lamp is half a metre across up close and grows with distance, a few pixels at any range', () => {
  assert.equal(lampSize(10), 0.5);
  assert.equal(lampSize(125), 0.5);
  assert.equal(lampSize(1000), 4);
});

test('a far lamp shows nothing within 45 m, where the lantern itself is seen, and is whole 45 m past that', () => {
  assert.equal(lampAlpha(LAMP_NEAR_M), 0);
  assert.equal(lampAlpha(30), 0);
  assert.equal(lampAlpha(LAMP_NEAR_M + LAMP_FADE_M / 2), 0.5);
  assert.equal(lampAlpha(LAMP_NEAR_M + LAMP_FADE_M), 1);
  assert.equal(lampAlpha(1000), 1);
  assert.deepEqual(LAMP_COLOUR, [1, 0.62, 0.22]);
});

test('a ship shows at most four of her lanterns far off: the first, the last and spread between', () => {
  assert.deepEqual(lampPoints([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(lampPoints([1, 2, 3, 4]), [1, 2, 3, 4]);
  assert.deepEqual(lampPoints([...Array(18).keys()]), [0, 6, 11, 17]);
  assert.deepEqual(lampPoints([]), []);
});

test('the Grey Tithe sails dark, a friendly ship runs dark, every other ship shows her lanterns', () => {
  assert.equal(lanternsLit({ side: 'player' }), true);
  assert.equal(lanternsLit({ side: 'friendly' }), true);
  assert.equal(lanternsLit({ side: 'tithe' }), false);
  assert.equal(lanternsLit({ side: 'friendly', dark: true }), false);
});
