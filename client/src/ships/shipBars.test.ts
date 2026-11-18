import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BarLayout } from '../plus/barLayout.ts';
import { barOver, placeShipBars, rankColour, shipName } from './shipBars.ts';

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

test('her bar carries her number and faction, for her emblem; a fight’s one captain is number 0', () => {
  const sailing = { name: 'Pirate Sloop', faction: 2, rank: 3, hull: 50, maxHull: 200, state: 'sailing' };
  const place = { ship: [100, 40], pose: [1] };
  const bar = barOver({ ...sailing, ...place, id: 7 }, { leftM: 0, topM: 0 }, 1);
  assert.deepEqual(bar && [bar.key, bar.faction, bar.share], [7, 2, 0.25]);
  assert.equal(barOver({ ...sailing, ...place }, { leftM: 0, topM: 0 }, 1)?.key, 0);
  assert.equal(barOver({ ...sailing, ...place, state: 'sunk' }, { leftM: 0, topM: 0 }, 1), null, 'none once sunk');
});

test('each ship’s plate stands over her masthead, a Boss’s across the top, and none off the picture', () => {
  const project = ([x, y]: readonly [number, number, number]) => (x < 0 ? null : { x: x * 10, y: y * 10, depth: 100 });
  const placed = placeShipBars(
    [
      { key: 1, name: 'Tithe Sloop', faction: 1, rank: 1, share: 0.5, over: [20, 30, 16] },
      { key: 2, name: 'Pirate Sloop', faction: 2, rank: 3, share: 1.5, over: [-5, 30, 16] },
      { key: 3, name: 'Captain Brannoc Thule', faction: 1, rank: 5, share: 0.25, over: [-5, 0, 16] },
    ],
    project,
    800,
    new BarLayout(),
    Infinity,
  );
  assert.deepEqual(
    placed.map(({ name, left, width, share, colour, words }) => [name, left + width / 2, share, colour, words]),
    [
      ['Tithe Sloop', 200, 0.5, rankColour(1), ''],
      ['Captain Brannoc Thule', 400, 0.25, rankColour(5), 'The Grey Tithe'],
    ],
  );
  assert.equal((placed[0]?.top ?? 0) + (placed[0]?.height ?? 0), 300, 'her plate’s foot over her masthead');
  assert.ok((placed[1]?.width ?? 0) > (placed[0]?.width ?? 0), 'the boss bar is the wider');
});

test('two ships side by side: the nearer’s plate stays over her, the farther’s lifted clear, drawn behind it', () => {
  const project = ([x, , z]: readonly [number, number, number]) => ({ x, y: 300, depth: z });
  const placed = placeShipBars(
    [
      { key: 1, name: 'Tithe Sloop', faction: 1, rank: 2, share: 1, over: [400, 0, 500] },
      { key: 2, name: 'Pirate Sloop', faction: 2, rank: 1, share: 1, over: [430, 0, 200] },
    ],
    project,
    800,
    new BarLayout(),
    Infinity,
  );
  assert.deepEqual(
    placed.map((plate) => plate.name),
    ['Tithe Sloop', 'Pirate Sloop'],
    'the farther drawn first, so the nearer stands in front',
  );
  const [farther, nearer] = placed;
  assert.equal((nearer?.top ?? 0) + (nearer?.height ?? 0), 300);
  assert.ok((farther?.top ?? 0) + (farther?.height ?? 0) <= (nearer?.top ?? 0), 'the farther stands above, clear');
});

test('a Boss’s plate is as wide as the boss bar on foot: 640 px at most, three quarters of a narrow picture', () => {
  const boss = { key: 1, name: 'Captain Brannoc Thule', faction: 1, rank: 5, share: 1, over: [0, 0, 16] } as const;
  const widthAt = (picture: number) => placeShipBars([boss], () => null, picture, new BarLayout(), Infinity)[0]?.width;
  assert.equal(widthAt(1920), 640);
  assert.equal(widthAt(800), 608);
});
