import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Rect } from './heldMapLaw.ts';
import { LandLettering, paintLand, type LandPainting } from './landLetters.ts';
import { DOT, ROUTE } from './mapLetters.ts';
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

/** The land's map lettered as the held map letters it: its sheet onto a picture of its own (`sheet`'s calls), and
 *  that copied onto the parchment's with what moves on it painted over (`calls`). */
const lettered = () => {
  const [parchment, sheet] = [recorder(), recorder()];
  const lettering = new LandLettering({
    width: 1,
    height: 1,
    getContext: () => sheet.painter,
  } as unknown as OffscreenCanvas);
  const painting = (more: Partial<LandPainting> = {}): LandPainting => ({
    sheet: SHEET,
    view: { left: 0, top: 0, scale: 2 },
    ink: { width: 800, height: 500 },
    scale: 1,
    covers: [],
    table: null,
    player: null,
    ...more,
  });
  const letter = (more: Partial<LandPainting> = {}, reads = 'still') =>
    lettering.paint(
      parchment.painter,
      { width: 1000, height: 700 },
      { inkAt: { x: 20, y: 30 }, dpr: 1, reads },
      painting(more),
    );
  return { letter, calls: parchment.calls, sheet: sheet.calls, depth: parchment.depth };
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
  const { letter, calls } = lettered();
  letter({ view: { left: 50, top: 0, scale: 2 }, player: { at: [150, 40], heading: 0 } });
  const moves = calls.filter((call) => call.name === 'translate').map((call) => call.args);
  assert.ok(
    moves.some(([x, y]) => x === 200 && y === 80),
    JSON.stringify(moves),
  );
});

test("the player's arrow points the way they look: east, a quarter turn from north", () => {
  const { letter, calls } = lettered();
  letter({ player: { at: [150, 60], heading: Math.PI / 2 } });
  const placed = calls.findIndex((call) => call.name === 'translate' && call.args[0] === 300 && call.args[1] === 120);
  const tip = calls.slice(placed).find((call) => call.name === 'moveTo')?.args as number[];
  assert.ok(Math.abs((tip[0] ?? 0) - 9) < 1e-9 && Math.abs(tip[1] ?? 0) < 1e-9, `${tip}`);
});

/** Other players and the event in the world: the sheet's origin is (1000, 2000), and the view 2 pixels a metre. */
const moving = (others: readonly { at: readonly [number, number]; company: boolean }[], clock = '2:59') => ({
  moving: { others, events: [{ at: [1150, 2100] as const, name: 'The Grey Tithe Raid', clock }] },
});

test('what moves is painted over a copy of the sheet, which is painted again only when the map or its table changes', () => {
  const { letter, calls, sheet } = lettered();
  const sheetPaintings = () => sheet.filter((call) => call.name === 'clearRect').length;
  assert.equal(letter(moving([{ at: [1100, 2050], company: false }])), true);
  assert.equal(sheetPaintings(), 1);
  assert.equal(letter(moving([{ at: [1100.1, 2050.1], company: false }])), false, 'moved within a pixel: nothing');
  assert.equal(letter(moving([{ at: [1103, 2050], company: false }])), true, 'moved 6 pixels: the marks again');
  assert.equal(letter(moving([{ at: [1103, 2050], company: false }], '2:58')), true, 'the clock on: the marks again');
  assert.equal(sheetPaintings(), 1, 'the sheet itself only once');
  assert.equal(letter(moving([{ at: [1103, 2050], company: false }], '2:58'), 'panned'), true);
  assert.equal(sheetPaintings(), 2, 'the map panned: the sheet again');
  assert.equal(letter(moving([{ at: [1103, 2050], company: true }], '2:58'), 'panned'), true);
  assert.equal(sheetPaintings(), 3, 'a company dot now, so a row more in the table: the sheet again');
  assert.ok(calls.filter((call) => call.name === 'drawImage').length >= 4, 'each painting copies the sheet in');
});

test('each other player on the map is a dot in their colour, one off it neither dotted nor in the table', () => {
  const { letter, calls, sheet } = lettered();
  letter(
    moving([
      { at: [1100, 2050], company: false },
      { at: [9000, 2050], company: true },
    ]),
  );
  const dots = calls.flatMap((call, index) => (call.name === 'arc' && call.args[2] === 3.2 ? [index] : []));
  const filled = dots.map((index) => calls.slice(index).find((call) => call.name === 'fill')?.fillStyle);
  assert.deepEqual(filled, [DOT.player], 'only the one on the map');
  const words = sheet.filter((call) => call.name === 'fillText').map((call) => call.args[0]);
  assert.ok(words.includes('Other players') && !words.includes('Your company'), JSON.stringify(words));
});

test('the event running is ringed at its ground with its name and time left, and nothing moving covers the table', () => {
  const { letter, calls, depth } = lettered();
  letter({ ...moving([{ at: [1100, 2050], company: true }]), player: { at: [150, 40], heading: 0 } });
  const placed = calls.find((call) => call.name === 'translate' && call.args[0] === 300 && call.args[1] === 200);
  assert.ok(placed, 'at its ground, (150, 100) on the sheet, 2 pixels a metre');
  const said = calls.find((call) => call.name === 'fillText' && call.args[0] === 'The Grey Tithe Raid 2:59');
  assert.equal(said?.fillStyle, ROUTE);
  const clip = calls.findIndex((call) => call.name === 'clip');
  assert.deepEqual(calls[clip]?.args, ['evenodd']);
  const rects = calls.slice(0, clip).filter((call) => call.name === 'rect');
  assert.equal(rects.length, 2, 'the map, then the table cut out of it');
  assert.ok(clip < calls.findIndex((call) => call.name === 'arc'), 'clipped before anything moving is painted');
  assert.equal(depth(), 0);
});
