import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startWatersRules } from '../rules/watersRules.ts';
import { BarLayout } from '../plus/barLayout.ts';
import { FILLS } from '../plus/tones.ts';
import {
  barOver,
  flashLeft,
  HULL_FLASH_SECONDS,
  HullLosses,
  type PlacedBar,
  placeShipBars,
  rankColour,
  shipName,
} from './shipBars.ts';

test('a bar is red for a Minor, orange for a Major and yellow for an Elite, a Miniboss and a Boss', () => {
  const [minor, major, elite, miniboss, boss] = [1, 2, 3, 4, 5].map(rankColour);
  assert.notEqual(minor, major);
  assert.notEqual(major, elite);
  assert.deepEqual([elite, miniboss, boss], [elite, elite, elite], 'one yellow for the three');
  assert.match(minor ?? '', /^#c8/, 'red');
  assert.match(major ?? '', /^#e07a/, 'orange');
});

test('a captain’s Sloop is named for its faction: the Tithe’s, else a friendly merchant’s', () => {
  assert.deepEqual([shipName(1), shipName(0)], ['Tithe Sloop', 'Merchant Sloop']);
  assert.deepEqual(
    [0, 1, 2, 3].map((hull) => [shipName(1, hull), shipName(0, hull)]),
    [
      ['Tithe Sloop', 'Merchant Sloop'],
      ['Tithe Schooner', 'Merchant Schooner'],
      ['Tithe Brig', 'Merchant Brig'],
      ['Tithe Frigate', 'Merchant Frigate'],
    ],
    'named for its faction and its hull, as the rules name it',
  );
});

test('its bar carries its number and faction, for its emblem; a fight’s one captain is number 0', () => {
  const sailing = { name: 'Tithe Sloop', faction: 1, rank: 3, hull: 50, maxHull: 200, state: 'sailing' };
  const place = { ship: [100, 40], pose: [1] };
  const bar = barOver({ ...sailing, ...place, id: 7 }, { leftM: 0, topM: 0 }, 1);
  assert.deepEqual(bar && [bar.key, bar.faction, bar.share], [7, 1, 0.25]);
  assert.equal(barOver({ ...sailing, ...place }, { leftM: 0, topM: 0 }, 1)?.key, 0);
  assert.equal(barOver({ ...sailing, ...place, state: 'sunk' }, { leftM: 0, topM: 0 }, 1), null, 'none once sunk');
});

test('each ship’s plate stands over its masthead, a Boss’s across the top, and none off the picture', () => {
  const project = ([x, y]: readonly [number, number, number]) => (x < 0 ? null : { x: x * 10, y: y * 10, depth: 100 });
  const placed = placeShipBars(
    [
      { key: 1, name: 'Tithe Sloop', faction: 1, rank: 1, share: 0.5, over: [20, 30, 16] },
      { key: 2, name: 'Tithe Sloop', faction: 1, rank: 3, share: 1.5, over: [-5, 30, 16] },
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
  assert.equal((placed[0]?.top ?? 0) + (placed[0]?.height ?? 0), 300, 'its plate’s foot over its masthead');
  assert.ok((placed[1]?.width ?? 0) > (placed[0]?.width ?? 0), 'the boss bar is the wider');
});

test('two ships side by side: the nearer’s plate stays over it, the farther’s lifted clear, drawn behind it', () => {
  const project = ([x, , z]: readonly [number, number, number]) => ({ x, y: 300, depth: z });
  const placed = placeShipBars(
    [
      { key: 1, name: 'Tithe Sloop', faction: 1, rank: 2, share: 1, over: [400, 0, 500] },
      { key: 2, name: 'Tithe Sloop', faction: 1, rank: 1, share: 1, over: [430, 0, 200] },
    ],
    project,
    800,
    new BarLayout(),
    Infinity,
  );
  assert.deepEqual(
    placed.map((plate) => plate.name),
    ['Tithe Sloop', 'Tithe Sloop'],
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

test('its hull’s losses read as a foe’s: it starts whole at its bar, a bite holds a pale strip, falls and flashes', () => {
  const hulls = new HullLosses();
  const plate = (share: number): PlacedBar => ({
    key: 4,
    left: 0,
    top: 0,
    width: 140,
    height: 26,
    bar: 8,
    name: 'Tithe Sloop',
    faction: 1,
    rank: 2,
    colour: rankColour(2),
    share,
    words: '',
  });
  const first = hulls.read(plate(0.6), 0, false);
  assert.deepEqual([first.lost, first.pieces, first.flash], [0.6, [], 0], 'first seen: nothing lost to read');
  const struck = hulls.read(plate(0.5), 1 / 60, false);
  assert.equal(struck.lost, 0.6, 'the strip holds where it stood');
  assert.deepEqual(struck.pieces, [{ left: 0.5, width: 0.09999999999999998, age: 0 }], 'the bite breaks off');
  assert.equal(struck.flash, 1, 'its bar’s edge flashes');
  assert.equal(hulls.read(plate(0.5), HULL_FLASH_SECONDS, false).flash, 0, 'for a quarter of a second');
  assert.deepEqual(hulls.read(plate(0.495), 1 / 60, false).pieces?.length, 1, 'half a hundredth breaks nothing off');
  const still = hulls.read({ ...plate(0.3), key: 5 }, 0, true);
  assert.deepEqual(hulls.read({ ...plate(0.2), key: 5 }, 1 / 60, true).pieces, [], 'reduced motion: nothing falls');
  assert.equal(still.flash, 0);
});

test('a bite’s flash steps down in three: whole, two thirds, a third, then none', () => {
  const steps = [0, 0.07, 0.09, 0.17, 0.23, 0.24].map(flashLeft);
  [1, 1, 2 / 3, 1 / 3, 1 / 3, 0].forEach((left, index) => assert.ok(Math.abs((steps[index] ?? -1) - left) < 1e-12));
});

test('every ship is named as the rules name it: each faction, each hull', async () => {
  const module = new URL('../../../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url);
  const bytes = await readFile(module).catch(() => {
    throw new Error('room_wasm.wasm is not built: run `npm run wasm` first');
  });
  const layout = await readFile(new URL('../../../content/world/layout.json', import.meta.url), 'utf8');
  const { shipNames } = startWatersRules(new WebAssembly.Module(bytes)).open(layout, []).sea;
  shipNames.forEach((hulls, faction) =>
    hulls.forEach((name, hull) => assert.equal(shipName(faction, hull), name, `faction ${faction}, hull ${hull}`)),
  );
  assert.equal(shipNames.length, 2, 'a friendly merchant’s and the Tithe’s');
});

test('a friendly ship’s plate is in the players’ side’s blue, whatever its rank', () => {
  const over = [20, 30, 16] as const;
  const placed = placeShipBars(
    [
      { key: 2, name: 'Merchant Brig', faction: 0, rank: 2, share: 1, over },
      { key: 1, name: 'Tithe Sloop', faction: 1, rank: 2, share: 1, over: [60, 30, 16] },
    ],
    ([x, y]) => ({ x: x * 10, y: y * 10, depth: 100 }),
    800,
    new BarLayout(),
    Infinity,
  );
  const colourOf = (key: number) => placed.find((bar) => bar.key === key)?.colour;
  assert.deepEqual([colourOf(2), colourOf(1)], [FILLS.ally, rankColour(2)]);
});

test('only the players’ side’s faction names a merchant: any other a hostile ship, the Tithe’s', () => {
  assert.deepEqual(
    [shipName(0, 1), shipName(3, 1), shipName(9)],
    ['Merchant Schooner', 'Tithe Schooner', 'Tithe Sloop'],
  );
});
