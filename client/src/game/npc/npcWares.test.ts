import assert from 'node:assert/strict';
import items from '../../../../content/gear/items.json' with { type: 'json' };
import { test } from 'node:test';
import { ASKS } from '../../network/gearMessages.ts';
import { priceWord, purseOf, rowsOf } from './npcWares.ts';
import { item, standing, state } from '../../network/gearForTests.ts';

const headings = (rows: ReturnType<typeof rowsOf>) => rows.map((row) => row.heading);

test('the Mage holds each Vestige carried to open it, and shows what one opened to', () => {
  const vestiges = [
    { id: 4, rarity: 2, slot: 0, level: 3, vaulted: false, source: 0 },
    { id: 5, rarity: 1, slot: 2, level: 3, vaulted: true, source: 0 },
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
  // four, then the Weaponsmith's (two here), then the Shipwright's six alone.
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
  // Her gift taken, the day's wares lead and her plain pieces, every Melee and Ranged kind, follow.
  const [supplies, weapons, first] = rowsOf('weaponsmith', gear);
  assert.deepEqual([supplies?.heading, weapons?.heading, first?.heading], ['Supplies', 'Weapons', 'To start']);
  assert.deepEqual(
    first?.wares.map((ware) => ware.ask),
    [6, 7].map((node) => ({ kind: ASKS.vend, column: 1, node })),
  );
  assert.deepEqual(weapons?.wares[0]?.ask, { kind: ASKS.vend, column: 1, node: 0 });
  assert.equal(
    supplies?.wares[0]?.note,
    'All five',
    'five crates is as many as are carried, said in a line its tile holds',
  );
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

test('the Tack sells the day’s horses and bardings', () => {
  const [mount] = rowsOf('tack', state({ cosmeticsSold: [3, 17, 24], aurem: 1_000 }));
  assert.equal(mount?.heading, 'Mount');
  assert.deepEqual(
    mount?.wares.map((ware) => [ware.picture.kind, ware.short]),
    [
      ['item', true],
      ['barding', true],
    ],
  );
});

test('the Tack gives the Bay free to one who pledged before her round, and sells it to everyone else', () => {
  const bay = 16;
  const ware = (fields: Parameters<typeof state>[0]) =>
    rowsOf('tack', state({ cosmeticsSold: [bay], ...fields }))[0]?.wares[0];
  const pledged = ware({ standing: standing({ pledge: 1 }) });
  assert.deepEqual(
    [pledged?.price, pledged?.note, pledged?.ask],
    [null, 'Free', { kind: ASKS.buyCosmetic, item: bay }],
  );
  assert.equal(ware({})?.price?.amount, 1_500, 'on the round, her goal gives it; at the counter it is sold');
});

test('Shape sells his week’s wares for Shapes while here, each asked for by the number the room sent with it', () => {
  // The room numbers a rolled Legendary by a hash of the piece and an Atheric by its place in the catalogue.
  const seawall = items.items.findIndex((entry) => entry.id === 'seawall');
  assert.ok(seawall >= 0);
  const wares = [
    item({ id: 3_405_691_582, kind: 2, rarity: 3, level: 20, source: 3, name: 0, price: 7 }),
    item({ id: seawall, kind: 12, rarity: 4, level: 20, price: 23, named: 'seawall' }),
  ];
  const here = state({ shapes: 10, level: 20, shape: { place: 2, wares } });
  const [row] = rowsOf('shape', here);
  assert.equal(row?.heading, 'Wares');
  assert.equal(row?.wares[0]?.name, 'Wreckborn Sword', 'a rolled Legendary named by its content’s set');
  assert.deepEqual(row?.wares[0]?.ask, { kind: ASKS.buyFromShape, node: 0, item: 3_405_691_582 }, 'the rolled piece');
  assert.deepEqual(row?.wares[1]?.ask, { kind: ASKS.buyFromShape, node: 1, item: seawall }, 'the Atheric shown');
  assert.deepEqual(row?.wares[1]?.price, { amount: 23, currency: 'shapes' });
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
  assert.deepEqual(crate && priceWord(crate), { words: 'All five', short: false });
  assert.deepEqual(low && priceWord(low), { words: 'From level 5', short: false });
  const able = rowsOf('weaponsmith', state({ aurem: 0, cratePrice: 300, crates: 1 })).find(
    (row) => row.heading === 'Supplies',
  )?.wares[0];
  assert.deepEqual(able && priceWord(able), { words: 'Not enough', short: true });
});

test("the Weaponsmith's starter pieces sent at no price are her gift: free, and saying so", () => {
  const six = Array.from({ length: 6 }, (_none, id) => item({ id, kind: 2, rarity: 2, price: 2_000 }));
  const armour = [...six, ...[13, 14, 15, 16].map((kind) => item({ kind, rarity: 0, price: 50 }))];
  // A Melee piece still owed free, the Ranged one taken: the room sends each at its price for this player.
  const weapons = [...six, item({ kind: 12, rarity: 0, price: 0 }), item({ kind: 8, rarity: 0, price: 50 })];
  const rows = rowsOf('weaponsmith', state({ wares: [...armour, ...weapons], aurem: 0, cratePrice: 300 }));
  assert.deepEqual(
    rows.map((row) => row.heading),
    ['To start', 'Supplies', 'Weapons'],
    'her gift owed, it leads',
  );
  const [start] = rows;
  const [given, sold] = start?.wares ?? [];
  assert.deepEqual([given?.price, given?.note, given?.short], [null, 'Free', false]);
  assert.match(given?.words ?? '', /gift/);
  assert.deepEqual(given?.ask, { kind: ASKS.vend, column: 1, node: 6 }, 'held to take it, as a purchase is');
  assert.deepEqual([sold?.price?.amount, sold?.note, sold?.short], [50, '', true], 'the other sold, short of Aurem');
});
