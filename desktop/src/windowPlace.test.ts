import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LEAST_HEIGHT, LEAST_WIDTH, firstPlace, openingPlace } from './windowPlace.ts';

const fullHd = { x: 0, y: 0, width: 1920, height: 1040 };
const right = { x: 1920, y: 0, width: 2560, height: 1400 };

test('a first window is centred on the main screen, at most a usual monitor', () => {
  assert.deepEqual(firstPlace(fullHd), {
    x: 192,
    y: 104,
    width: 1536,
    height: 832,
    maximized: false,
    fullScreen: false,
  });
  const huge = firstPlace({ x: 0, y: 0, width: 5120, height: 2880 });
  assert.equal(huge.width, 1920);
  assert.equal(huge.height, 1080);
});

test('a first window on a small screen keeps to the screen', () => {
  const small = firstPlace({ x: 0, y: 0, width: 800, height: 560 });
  assert.equal(small.width, 800);
  assert.equal(small.height, 560);
});

test('a window opens where it was left, on any screen that shows enough of it', () => {
  const kept = { x: 2000, y: 100, width: 1600, height: 900, maximized: true, fullScreen: false };
  assert.deepEqual(openingPlace(kept, [fullHd, right]), kept);
});

test('a window left on a screen since unplugged comes back to the main one, still maximized or whole', () => {
  const kept = { x: 2000, y: 100, width: 1600, height: 900, maximized: false, fullScreen: true };
  const place = openingPlace(kept, [fullHd]);
  assert.deepEqual(place, { ...firstPlace(fullHd), fullScreen: true });
});

test('a window kept smaller than the game lays out opens at the least', () => {
  const kept = { x: 10, y: 10, width: 300, height: 200, maximized: false, fullScreen: false };
  assert.deepEqual(openingPlace(kept, [fullHd]), { ...kept, width: LEAST_WIDTH, height: LEAST_HEIGHT });
});

test('with no screen known, the kept place stands', () => {
  assert.equal(openingPlace(null, []), null);
});
