import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS } from '../../network/gearMessages.ts';
import { priceWord, purseOf, rowsOf } from './npcWares.ts';
import { item, state } from './stateForTests.ts';

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

test('the smiths sell their halves of the day’s wares, red when short; the Weaponsmith sells the Ammo crate too', () => {
  const wares = [item({ id: 0, kind: 13, rarity: 2, price: 2_000 }), item({ id: 0, kind: 2, rarity: 2, price: 600 })];
  const gear = state({ wares, aurem: 1_000, cratePrice: 300, crates: 5 });
  const [armour] = rowsOf('armorsmith', gear);
  assert.deepEqual(headings(rowsOf('armorsmith', gear)), ['Armor']);
  assert.deepEqual(
    [armour?.wares[0]?.short, armour?.wares[0]?.ask],
    [true, { kind: ASKS.vend, column: 0, node: 0 }],
    'a short ware is still held, for the room to refuse and its keeper to answer',
  );
  const [weapons, supplies] = rowsOf('weaponsmith', gear);
  assert.deepEqual([weapons?.heading, supplies?.heading], ['Weapons', 'Supplies']);
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
  const wares = [item({ id: 0, rarity: 3, price: 7 }), item({ id: 1, rarity: 4, price: 15 })];
  const here = state({ shapes: 10, shape: { place: 2, wares } });
  const [row] = rowsOf('shape', here);
  assert.equal(row?.heading, 'Wares');
  assert.deepEqual(row?.wares[0]?.ask, { kind: ASKS.buyFromShape, node: 0 });
  assert.deepEqual(row?.wares[1]?.price, { amount: 15, currency: 'shapes' });
  assert.equal(row?.wares[1]?.short, true);
  assert.deepEqual(rowsOf('shape', state({ shape: null })), [
    { heading: 'Wares', wares: [], empty: 'Shape is away. He comes on Fridays.' },
  ]);
  assert.deepEqual(purseOf('shape', here), [{ glyph: 'shapes', amount: 10, name: 'Shapes' }]);
});

test('a ware that cannot be asked for says why under its price, not "Not enough"; one that can is red when short', () => {
  const poor = state({ aurem: 0, cratePrice: 300, crates: 5, cosmeticsSold: [6], level: 1 });
  const crate = rowsOf('weaponsmith', poor)[1]?.wares[0];
  const low = rowsOf('tailor', poor)[0]?.wares[0];
  assert.deepEqual(crate && priceWord(crate), { words: 'You carry five', short: false });
  assert.deepEqual(low && priceWord(low), { words: 'From level 5', short: false });
  const able = rowsOf('weaponsmith', state({ aurem: 0, cratePrice: 300, crates: 1 }))[1]?.wares[0];
  assert.deepEqual(able && priceWord(able), { words: 'Not enough', short: true });
});
