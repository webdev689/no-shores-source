import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeShipBars, rankColour, shipName } from './shipBars.ts';

test('a bar is red for a Minor, orange for a Major and yellow for an Elite, a Miniboss and a Boss', () => {
  const [minor, major, elite, miniboss, boss] = [1, 2, 3, 4, 5].map(rankColour);
  assert.notEqual(minor, major);
  assert.notEqual(major, elite);
  assert.deepEqual([elite, miniboss, boss], [elite, elite, elite], 'one yellow for the three');
  assert.match(minor ?? '', /^#c8/, 'red');
  assert.match(major ?? '', /^#e07a/, 'orange');
});

test('a captain’s Sloop is named for her faction', () => {
  assert.deepEqual([shipName(1), shipName(2)], ['Tithe Sloop', 'Pirate Sloop']);
});

test('each ship’s bar stands where her masthead is drawn, a Boss’s across the top, and none off the picture', () => {
  const project = ([x, y]: readonly [number, number, number]) => (x < 0 ? null : { x: x * 10, y: y * 10 });
  const placed = placeShipBars(
    [
      { name: 'Tithe Sloop', rank: 1, share: 0.5, over: [20, 30, 16] },
      { name: 'Pirate Sloop', rank: 3, share: 1.5, over: [-5, 30, 16] },
      { name: 'Captain Brannoc Thule', rank: 5, share: 0.25, over: [-5, 0, 16] },
    ],
    project,
    800,
  );
  assert.deepEqual(
    placed.map(({ name, x, y, share, colour }) => [name, x, y, share, colour]),
    [
      ['Tithe Sloop', 200, 300, 0.5, rankColour(1)],
      ['Captain Brannoc Thule', 400, 34, 0.25, rankColour(5)],
    ],
  );
  assert.ok((placed[1]?.width ?? 0) > (placed[0]?.width ?? 0), 'the boss bar is the wider');
});
