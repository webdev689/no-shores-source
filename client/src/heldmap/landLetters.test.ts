import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Rect } from './heldMapLaw.ts';
import { paintLand, type LandPainting } from './landLetters.ts';
import type { LandSheet } from './landSheet.ts';
import { recorder } from './painterForTests.ts';

const SHEET: LandSheet = {
  name: 'Overlook',
  origin: [1000, 2000],
  width: 400,
  height: 250,
  sea: [],
  coast: [],
  relief: [],
  index: [],
  rivers: [],
  grounds: [],
  walks: [],
  paths: [],
  standing: [],
  low: [],
  overhead: [],
  plants: [],
  ring: [
    [10, 10],
    [390, 10],
    [390, 240],
  ],
  places: [
    { name: 'Watch Court', at: [200, 120] },
    // Places whose names would fall on the court's: each takes the next room round its middle, the last has none.
    { name: 'Fountain', at: [205, 120] },
    { name: 'Well', at: [195, 121] },
    { name: 'Pump', at: [200, 119] },
    { name: 'Cistern', at: [201, 120] },
  ],
  marks: [
    { glyph: 'mage', at: [100, 100], word: 'The Mage' },
    { glyph: 'vault', at: [300, 100], word: 'Vault' },
    { glyph: 'vault', at: [320, 100], word: 'Vault' },
    { glyph: 'landing', at: [200, 200], word: 'Landing' },
  ],
};

const paint = (more: Partial<LandPainting> = {}) => {
  const recorded = recorder();
  const painting: LandPainting = {
    sheet: SHEET,
    view: { left: 0, top: 0, scale: 2 },
    ink: { width: 800, height: 500 },
    scale: 1,
    covers: [],
    table: null,
    player: null,
    ...more,
  };
  const table = paintLand(recorded.painter, { width: 1000, height: 700 }, { x: 20, y: 30 }, 1, painting);
  return { ...recorded, table };
};

test('the plan says no keeper by name: each is a glyph, and the table says what each glyph is, once', () => {
  const words = paint().texts();
  assert.equal(words.filter((word) => word === 'Vault').length, 1, 'the table names the vaults once');
  for (const word of ['Overlook', 'Watch Court', 'The Mage', 'Landing', 'You'])
    assert.ok(words.includes(word), `${word} in ${words.join(', ')}`);
  assert.ok(
    words.some((word) => typeof word === 'string' && word.endsWith(' m')),
    'the bar says its length',
  );
});

test("a place's name that would fall on one before it stands over its middle, else farther off, else is left off", () => {
  const words = paint().texts();
  assert.ok(
    ['Fountain', 'Well', 'Pump'].every((name) => words.includes(name)),
    `${words.join(', ')}`,
  );
  assert.ok(!words.includes('Cistern'));
});

test("a place's name keeps clear of the gauntlets: under a thumb it stands over its middle instead", () => {
  // Watch Court's middle is at (400, 240): its name stands 18 below it, or 18 above.
  const thumb: Rect = { x: 300, y: 245, width: 200, height: 20 };
  const { calls } = paint({ covers: [thumb] });
  const court = calls.findIndex((call) => call.name === 'fillText' && call.args[0] === 'Watch Court');
  const placed = calls
    .slice(0, court)
    .filter((call) => call.name === 'translate')
    .at(-1);
  assert.deepEqual(placed?.args, [400, 222]);
});

test('the table stands in a corner clear of the gauntlets, and keeps its corner while it is clear', () => {
  const lowerHands: Rect[] = [
    { x: 0, y: 300, width: 800, height: 200 },
    { x: 0, y: 0, width: 300, height: 300 },
  ];
  const { table } = paint({ covers: lowerHands });
  assert.equal(table.corner, 'upper-right');
  const kept = paint({ table: { ...table, corner: 'upper-left' } }).table;
  assert.equal(kept.corner, 'upper-left');
});

test('nothing is painted outside the map, and every save is restored', () => {
  const { calls, depth } = paint({ player: { at: [150, 40], heading: 1 } });
  const names = calls.map((call) => call.name);
  assert.equal(names[1], 'clearRect');
  const clip = names.indexOf('clip');
  assert.ok(clip > 0 && clip < names.indexOf('fillText'));
  assert.deepEqual(calls[names.indexOf('rect')]?.args, [0, 0, 800, 500]);
  assert.equal(depth(), 0);
});

test("the player's arrow stands where they do on the sheet", () => {
  const { calls } = paint({ view: { left: 50, top: 0, scale: 2 }, player: { at: [150, 40], heading: 0 } });
  const moves = calls.filter((call) => call.name === 'translate').map((call) => call.args);
  assert.ok(
    moves.some(([x, y]) => x === 200 && y === 80),
    JSON.stringify(moves),
  );
});

test("the player's arrow points the way they look: east, a quarter turn from north", () => {
  const { calls } = paint({ player: { at: [150, 60], heading: Math.PI / 2 } });
  const placed = calls.findIndex((call) => call.name === 'translate' && call.args[0] === 300 && call.args[1] === 120);
  const tip = calls.slice(placed).find((call) => call.name === 'moveTo')?.args as number[];
  assert.ok(Math.abs((tip[0] ?? 0) - 9) < 1e-9 && Math.abs(tip[1] ?? 0) < 1e-9, `${tip}`);
});
