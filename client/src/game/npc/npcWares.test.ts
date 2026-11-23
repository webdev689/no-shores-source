import assert from 'node:assert/strict';
import items from '../../../../content/gear/items.json' with { type: 'json' };
import { test } from 'node:test';
import { ASKS } from '../../network/gearMessages.ts';
import { priceWord, purseOf, rowsOf } from './npcWares.ts';
import { item, state } from '../../network/gearForTests.ts';

const headings = (rows: ReturnType<typeof rowsOf>) => rows.map((row) => row.heading);

test('the Mage holds each Vestige carried to open it, and shows what one opened to', () => {
  const vestiges = [
    { id: 4, rarity: 2, slot: 0, level: 3, vaulted: false },
    { id: 5, rarity: 1, slot: 2, level: 3, vaulted: true },
  ];
  const opened = item({ id: 9, rarity: 3 });
  const [row, shown] = rowsOf('mage', state({ vestiges, items: [opened], identified: 9 }));
  assert.equal(row?.heading, 'Vestiges');
  assert.deepEqual(
    row?.wares.map((ware) => ware.ask),
    [{ kind: ASKS.identify, item: 4 }],
    'only one carried',
  );
  assert.equal(shown?.heading, 'Opened');
  assert.deepEqual(shown?.wares[0]?.picture, { kind: 'item', item: opened });
  assert.equal(rowsOf('mage', state({}))[0]?.empty, 'Bring your Vestiges from the sea.');
});

test('the smiths sell their starter stock under To start, then six of the day’s wares, red when short', () => {
  // The message lists each vendor's stock in turn, each the day's six and then its starter pieces: the Armorsmith's
  // four, the Weaponsmith's two, then the Shipwright's six alone.
  const six = (each: Parameters<typeof item>[0]) => Array.from({ length: 6 }, (_none, id) => item({ ...each, id }));
  const plain = (kinds: number[]) => kinds.map((kind, place) => item({ id: 6 + place, kind, rarity: 0, price: 50 }));
  const wares = [
    ...six({ kind: 13, rarity: 2, price: 2_000 }),
    ...plain([13, 14, 15, 16]),
    ...six({ kind: 2, rarity: 2, price: 600 }),
    ...plain([12, 8]),
  ];
  const gear = state({ wares, aurem: 1_000, cratePrice: 300, crates: 5 });
  const [start, armour] = rowsOf('armorsmith', gear);
  assert.deepEqual(headings(rowsOf('armorsmith', gear)), ['To start', 'Armour']);
  assert.deepEqual(
    start?.wares.map((ware) => [ware.ask, ware.short]),
    [6, 7, 8, 9].map((node) => [{ kind: ASKS.vend, column: 0, node }, false]),
    'four plain pieces at 50 Aurem',
  );
  assert.equal(armour?.wares.length, 6);
  assert.deepEqual(
    [armour?.wares[0]?.short, armour?.wares[0]?.ask],
    [true, { kind: ASKS.vend, column: 0, node: 0 }],
    'a short ware is still held, for the room to refuse and its keeper to answer',
  );
  // The short rows first, side by side, so the day's six stay in view.
  const [first, supplies, weapons] = rowsOf('weaponsmith', gear);
  assert.deepEqual([first?.heading, supplies?.heading, weapons?.heading], ['To start', 'Supplies', 'Weapons']);
  assert.deepEqual(
    first?.wares.map((ware) => ware.ask),
    [6, 7].map((node) => ({ kind: ASKS.vend, column: 1, node })),
  );
  assert.deepEqual(weapons?.wares[0]?.ask, { kind: ASKS.vend, column: 1, node: 0 });
  assert.equal(supplies?.wares[0]?.note, 'You carry five', 'five crates is as many as are carried');
  assert.equal(supplies?.wares[0]?.ask, null);
});

test('the Tailor sells the day’s dyes as swatches, then emblems; the kept say so, the low say from when', () => {
  const gear = state({ cosmeticsSold: [1, 6, 17], cosmetics: [1], emblemsSold: [0], emblems: [0], aurem: 5_000 });
  const [dyes, emblems] = rowsOf('tailor', gear);
  assert.deepEqual(headings(rowsOf('tailor', gear)), ['Dyes', 'Emblems']);
  assert.equal(dyes?.wares.length, 2, 'the coat is the Tack’s');
  assert.equal(dyes?.wares[0]?.note, 'Kept');
  assert.equal(dyes?.wares[0]?.picture.kind, 'swatch');
  assert.equal(dyes?.wares[1]?.note, 'From level 5');
  assert.equal(dyes?.wares[1]?.ask, null);
  assert.equal(emblems?.wares[0]?.note, 'Kept');
  const able = rowsOf('tailor', state({ cosmeticsSold: [6], level: 5, aurem: 2_500 }))[0]?.wares[0];
  assert.deepEqual(able?.ask, { kind: ASKS.buyCosmetic, item: 6 });
  assert.deepEqual(able?.price, { amount: 2_500, currency: 'aurem' });
});

test('the Tack sells the day’s coats and bardings', () => {
  const [mount] = rowsOf('tack', state({ cosmeticsSold: [3, 17, 24], aurem: 1_000 }));
  assert.equal(mount?.heading, 'Mount');
  assert.deepEqual(
    mount?.wares.map((ware) => [ware.picture.kind, ware.short]),
    [
      ['swatch', true],
      ['barding', true],
    ],
  );
});

test('Shape sells his week’s wares for Shapes while here, and is gone while away', () => {
  const wares = [item({ id: 0, rarity: 3, price: 7, named: 'seawall' }), item({ id: 1, rarity: 4, price: 15 })];
  const here = state({ shapes: 10, shape: { place: 2, wares } });
  const [row] = rowsOf('shape', here);
  assert.equal(row?.heading, 'Wares');
  const seawall = items.items.findIndex((entry) => entry.id === 'seawall');
  assert.ok(seawall >= 0);
  assert.deepEqual(row?.wares[0]?.ask, { kind: ASKS.buyFromShape, node: 0, item: seawall }, 'the piece shown, named');
  assert.deepEqual(row?.wares[1]?.price, { amount: 15, currency: 'shapes' });
  assert.equal(row?.wares[1]?.short, true);
  assert.deepEqual(rowsOf('shape', state({ shape: null })), [
    { heading: 'Wares', wares: [], empty: 'Shape is away. He comes on Fridays.' },
  ]);
  assert.deepEqual(purseOf('shape', here), [{ glyph: 'shapes', amount: 10, name: 'Shapes' }]);
});

test('a ware that cannot be asked for says why under its price, not "Not enough"; one that can is red when short', () => {
  const poor = state({ aurem: 0, cratePrice: 300, crates: 5, cosmeticsSold: [6], level: 1 });
  const crate = rowsOf('weaponsmith', poor).find((row) => row.heading === 'Supplies')?.wares[0];
  const low = rowsOf('tailor', poor)[0]?.wares[0];
  assert.deepEqual(crate && priceWord(crate), { words: 'You carry five', short: false });
  assert.deepEqual(low && priceWord(low), { words: 'From level 5', short: false });
  const able = rowsOf('weaponsmith', state({ aurem: 0, cratePrice: 300, crates: 1 })).find(
    (row) => row.heading === 'Supplies',
  )?.wares[0];
  assert.deepEqual(able && priceWord(able), { words: 'Not enough', short: true });
});
