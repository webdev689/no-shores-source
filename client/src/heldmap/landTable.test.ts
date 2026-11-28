import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LandMark } from './landSheet.ts';
import { barOf, tablePlace, tableRows, tableSize } from './landTable.ts';
import { recorder } from './painterForTests.ts';

const mark = (glyph: LandMark['glyph'], word: string): LandMark => ({ glyph, at: [0, 0], word });

test("the table lists each glyph the land holds once, keepers before sites, and the player's arrow last", () => {
  const rows = tableRows({
    marks: [mark('landing', 'Landing'), mark('vault', 'Vault'), mark('mage', 'The Mage'), mark('vault', 'Vault')],
  });
  assert.deepEqual(
    rows.map((row) => row.word),
    ['The Mage', 'Vault', 'Landing', 'You'],
  );
});

test('the table keys each line the sheet draws, a track, a footpath and what stands, before the arrow', () => {
  const path = (track: boolean, plain: { faint?: boolean; inked?: boolean } = {}) => ({
    track,
    width: 4,
    points: [],
    ...plain,
  });
  const square = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ] as const;
  const rows = tableRows({
    marks: [mark('landing', 'Landing')],
    paths: [path(true), path(false), path(false, { faint: true })],
    standing: [square],
  });
  assert.deepEqual(
    rows.map((row) => row.word),
    ['Landing', 'Track', 'Path', 'Walls and buildings', 'You'],
  );
  const plain = tableRows({ marks: [], paths: [path(false, { faint: true }), path(true, { inked: true })] });
  assert.deepEqual(
    plain.map((row) => row.word),
    ['You'],
    "a faint or inked line, a passage web's other ways, is keyed by none",
  );
});

test('a long table is laid in columns of at most seven rows', () => {
  const { painter } = recorder();
  const glyphs = ['mage', 'vault', 'weaponsmith', 'armorsmith', 'tailor', 'tack', 'stormcallers', 'lamplighters'];
  const rows = tableRows({ marks: glyphs.map((glyph) => mark(glyph as LandMark['glyph'], 'Seven letters')) });
  const short = tableSize(painter, 'Overlook', rows.slice(0, 3));
  const long = tableSize(painter, 'Overlook', rows);
  assert.equal(rows.length, 9);
  // Nine rows in two columns of five: five rows tall, and wider than one column.
  assert.equal(long.height - short.height, 2 * 20);
  assert.ok(long.width > short.width * 1.5);
});

test("the bar is the longest round length that fits, whatever the map's zoom", () => {
  assert.deepEqual(barOf({ left: 0, top: 0, scale: 2 }, 1), { metres: 25, units: 50 });
  assert.deepEqual(barOf({ left: 0, top: 0, scale: 0.5 }, 1), { metres: 100, units: 50 });
  assert.equal(barOf({ left: 0, top: 0, scale: 8 }, 2).metres, 10, 'on a larger screen its units are larger');
});

test('the table takes the clear corner over the fewest marks, and a corner under a hand never', () => {
  const ink = { width: 800, height: 500 };
  const size = { width: 200, height: 150 };
  const marksUpperLeft = [{ x: 20, y: 20, width: 10, height: 10 }];
  const handsBelow = [{ x: 0, y: 400, width: 800, height: 100 }];
  assert.equal(tablePlace(ink, size, 1, marksUpperLeft, handsBelow, null).corner, 'upper-right');
  const everywhere = [{ x: 0, y: 0, width: 800, height: 500 }];
  assert.equal(tablePlace(ink, size, 1, [], everywhere, null).corner, 'lower-left', 'with every corner covered');
});

test('the table names your company and other players after the arrow, each only while the map shows one', () => {
  const sheet = { marks: [] };
  assert.deepEqual(
    tableRows(sheet, []).map((row) => row.glyph),
    ['you'],
  );
  const others = [
    { at: [0, 0] as const, company: true },
    { at: [9, 9] as const, company: false },
  ];
  assert.deepEqual(
    tableRows(sheet, others).map((row) => [row.glyph, row.word]),
    [
      ['you', 'You'],
      ['company', 'Your company'],
      ['player', 'Other players'],
    ],
  );
});
