import assert from 'node:assert/strict';
import { test } from 'node:test';
import factions from '../../../../content/gear/factions.json' with { type: 'json' };
import items from '../../../../content/gear/items.json' with { type: 'json' };
import { ASKS } from '../../network/gearMessages.ts';
import { KINDS, slotOf } from '../../player/gear.ts';
import { factionRows, rankRewards, reputationOf } from './factionRows.ts';
import { fragmentWords } from '../artLevels.ts';
import { ARTS } from '../artsCards.ts';
import { wareCard } from './npcWares.ts';
import { item, standing, state } from './stateForTests.ts';

/** The Stormcallers (faction 1, first in the list) keep the Storm Art (Art 1, first). */
const STORM = 1;
const headings = (rows: ReturnType<typeof factionRows>) => rows.map((row) => row.heading);
const row = (rows: ReturnType<typeof factionRows>, heading: string) => rows.find((each) => each.heading === heading);

/** Every faction's wares as the room sends them: each numbered by its place among its faction's, priced in Aurem. */
const SOLD = factions.factions.flatMap((faction) =>
  items.items
    .filter((named) => 'faction' in named && named.faction === faction.key)
    .map((named, place) => {
      const kind = KINDS.indexOf(named.kind as (typeof KINDS)[number]);
      const price =
        named.kind === 'cloak' ? factions.capeAurem : slotOf(kind) < 2 ? factions.weaponAurem : factions.armourAurem;
      const level = named.kind === 'cloak' ? 1 : 20;
      return item({ id: place, named: named.id, kind, rarity: 3, level, bucket: slotOf(kind), price });
    }),
);
const RANK = factions.reputationPerRank;
test('a faction piece’s card says the colour it is drawn in, and the cape’s what it earns', () => {
  const rows = factionRows(
    STORM,
    state({ standing: standing({ pledge: STORM, reputation: [3 * RANK, 0, 0] }), level: 20, factionWares: SOLD }),
    false,
  );
  const cardWords = (heading: string) => {
    const ware = row(rows, heading)?.wares[0];
    if (ware?.picture.kind !== 'item') return assert.fail(`no piece under ${heading}`);
    return wareCard(ware, ware.picture.item, null).words;
  };
  assert.match(cardWords('Armour'), /Drawn in Squall, a colour none but the Stormcallers wear\.$/);
  assert.match(cardWords('Weapons'), /Drawn in Squall/);
  assert.match(cardWords('Cape'), /Earns their reputation while you wear it, pledged to them\.$/);
});

test('unpledged, the first pledge is free and no cape is sold', () => {
  const rows = factionRows(STORM, state({ standing: standing({}), factionWares: SOLD }), false);
  assert.deepEqual(headings(rows), ['Reputation', 'Pledge', 'Art', 'Fragments', 'Armour', 'Weapons']);
  const pledge = row(rows, 'Pledge')?.wares[0];
  assert.deepEqual([pledge?.price, pledge?.ask], [null, { kind: ASKS.pledge, column: STORM }]);
});

test('pledged to another, switching costs its price; pledged here, it says so and the cape is sold', () => {
  const switching = row(factionRows(STORM, state({ standing: standing({ pledge: 2 }), aurem: 100 }), false), 'Pledge');
  assert.deepEqual(switching?.wares[0]?.price, { amount: 2_500, currency: 'aurem' });
  assert.equal(switching?.wares[0]?.short, true);
  const pledged = factionRows(
    STORM,
    state({ standing: standing({ pledge: STORM }), aurem: 3_000, factionWares: SOLD }),
    false,
  );
  assert.equal(row(pledged, 'Pledge')?.wares[0]?.note, 'Pledged');
  assert.equal(row(pledged, 'Pledge')?.wares[0]?.ask, null);
  assert.equal(row(pledged, 'Pledge')?.wares[0]?.about, 'Pledged');
  const sold = row(pledged, 'Cape')?.wares[0];
  assert.deepEqual(sold?.ask, { kind: ASKS.buyFactionWare, column: STORM, node: 0 });
  assert.deepEqual(
    [sold?.rarity, sold?.about],
    [3, 'Legendary Cloak · any level'],
    'a named Legendary, made at level 1',
  );
  const cape = item({ named: 'stormcallers_cape', kind: 18, rarity: 3 });
  const kept = factionRows(
    STORM,
    state({ standing: standing({ pledge: STORM }), items: [cape], factionWares: SOLD }),
    false,
  );
  assert.deepEqual([row(kept, 'Cape')?.wares[0]?.note, row(kept, 'Cape')?.wares[0]?.ask], ['Kept', null]);
});

test('rank and the meter to the next come of the reputation; each package waiting is a press to collect', () => {
  assert.deepEqual(reputationOf(STORM, standing({ reputation: [25_000, 0, 0] })), {
    rank: 2,
    toNext: 0.5,
    words: '5,000 of 10,000 to rank 3',
  });
  const rows = factionRows(
    STORM,
    state({ standing: standing({ reputation: [30_000, 0, 0], packages: [2, 0, 0] }) }),
    false,
  );
  const packages = row(rows, 'Reputation')?.wares;
  assert.equal(packages?.length, 2);
  assert.deepEqual(packages?.[0]?.ask, { kind: ASKS.collectPackage, column: STORM });
  assert.equal(row(factionRows(STORM, state({}), false), 'Reputation')?.empty, 'No packages wait for you.');
});

test('the Art not ready shows its bar; ready, a Rise press opens a choice of the fragments not owned', () => {
  const waiting = row(factionRows(STORM, state({ standing: standing({ artXp: [4_000, 0, 0] }) }), false), 'Art');
  assert.deepEqual([waiting?.art?.level, waiting?.art?.toNext], [1, 0.5]);
  assert.equal(
    waiting?.wares.some((ware) => ware.opens === 'rise'),
    false,
  );
  const ready = standing({ artXp: [8_000, 0, 0], artOwned: [0b000011, 0, 0] });
  const art = row(factionRows(STORM, state({ standing: ready, aurem: 1_000 }), false), 'Art');
  const rise = art?.wares.find((ware) => ware.opens === 'rise');
  assert.deepEqual([rise?.price, rise?.short], [{ amount: 1_000, currency: 'aurem' }, false]);
  const choosing = row(factionRows(STORM, state({ standing: ready, aurem: 1_000 }), true), 'Rise');
  assert.deepEqual(
    choosing?.wares.map((ware) => ware.ask),
    [2, 3, 4, 5].map((node) => ({ kind: ASKS.riseArt, column: STORM, node })),
  );
  // Each fragment is said as it works at the level the rise makes.
  const core = ARTS.find((each) => each.id === STORM)?.core ?? [];
  const atLevel = (level: number) =>
    [2, 3, 4, 5].map((place) => fragmentWords(core[place] as (typeof core)[number], level));
  assert.deepEqual(
    choosing?.wares.map((ware) => ware.words),
    atLevel(2),
  );
  assert.notDeepEqual(atLevel(2), atLevel(1), 'a fragment of this choice works longer a level up');
});

test('ready with every fragment owned, the Rise asks at once with no fragment to choose, and says so', () => {
  const learned = standing({ artXp: [8_000, 0, 0], artOwned: [0b111111, 0, 0] });
  const rows = factionRows(STORM, state({ standing: learned, aurem: 9_000 }), true);
  const rise = row(rows, 'Art')?.wares.find((ware) => ware.key === 'rise');
  assert.deepEqual(rise?.ask, { kind: ASKS.riseArt, column: STORM, node: 255 });
  assert.equal(rise?.opens, undefined);
  assert.equal(rise?.note, 'No fragment left to choose');
  assert.equal(row(rows, 'Rise'), undefined, 'no choice is shown');
});

test('a rise that needs fragments is short without them; at the highest level there is no rise', () => {
  const third = standing({ artLevels: [3, 1, 1], artXp: [32_000, 0, 0] });
  const rise = row(factionRows(STORM, state({ standing: third, aurem: 9_000 }), false), 'Art')?.wares.find(
    (ware) => ware.opens === 'rise',
  );
  assert.equal(rise?.short, true);
  assert.equal(rise?.price?.more, '10 Weapon and 10 Armor Fragments');
  const highest = row(factionRows(STORM, state({ standing: standing({ artLevels: [5, 1, 1] }) }), false), 'Art');
  assert.deepEqual([highest?.art?.level, highest?.art?.words], [5, 'The highest level']);
  assert.equal(
    highest?.wares.some((ware) => ware.opens === 'rise'),
    false,
  );
});

test('fragments owned or sold are lit; the rest are sold from rank 1', () => {
  const low = row(factionRows(STORM, state({ standing: standing({ artOwned: [1, 0, 0] }) }), false), 'Fragments');
  assert.deepEqual(
    low?.wares.slice(0, 2).map((ware) => [ware.dim, ware.note, ware.ask]),
    [
      [false, 'Owned', null],
      [true, 'From rank 1', null],
    ],
  );
  const ranked = standing({ reputation: [10_000, 0, 0] });
  const sold = row(factionRows(STORM, state({ standing: ranked, aurem: 7_500 }), false), 'Fragments')?.wares[0];
  assert.equal(sold?.dim, false, 'one that may be bought is lit, as the armour is');
  assert.deepEqual(sold?.ask, { kind: ASKS.buyFragment, column: STORM, node: 0 });
  assert.deepEqual(sold?.price, { amount: 7_500, currency: 'aurem' });
});

test('what the ranks keep is read from the emblem’s and the dye’s own sources', () => {
  assert.equal(
    rankRewards(STORM),
    'Rank 1 keeps their emblem. Rank 2 keeps their dye. Every rank from 3 leaves a package here.',
  );
});

test('no package is collected while ten Vestiges are carried', () => {
  const vestiges = Array.from({ length: 10 }, (unused, id) => ({ id, rarity: 1, slot: 0, level: 1, vaulted: false }));
  const full = state({ vestiges, standing: standing({ packages: [1, 0, 0] }) });
  const parcel = row(factionRows(STORM, full, false), 'Reputation')?.wares[0];
  assert.deepEqual([parcel?.note, parcel?.ask], ['Ten Vestiges carried', null]);
});

test('no cape is sold while nine cloaks are carried', () => {
  const cloaks = Array.from({ length: 9 }, (unused, id) => item({ id, kind: 18, bucket: 6 }));
  const full = state({ standing: standing({ pledge: STORM }), aurem: 9_000, items: cloaks, factionWares: SOLD });
  const cape = row(factionRows(STORM, full, false), 'Cape')?.wares[0];
  assert.deepEqual([cape?.note, cape?.ask], ['Nine cloaks carried', null]);
});

test("a faction's armour waits for the second rank and its weapons for the third, pledged or not", () => {
  const atRank = (rank: number, aurem = 100_000) =>
    factionRows(
      STORM,
      state({
        standing: standing({ pledge: 3, reputation: [rank * RANK, 0, 0] }),
        aurem,
        level: 20,
        factionWares: SOLD,
      }),
      false,
    );
  const names = (rows: ReturnType<typeof factionRows>, heading: string) =>
    row(rows, heading)?.wares.map((ware) => ware.name);
  assert.deepEqual(names(atRank(0), 'Armour'), [
    'Stormcaller Helm',
    'Stormcaller Hauberk',
    'Stormcaller Gauntlets',
    'Stormcaller Greaves',
  ]);
  assert.deepEqual(names(atRank(0), 'Weapons'), ['Squallbreak', 'Thunderstring']);
  const low = row(atRank(1), 'Armour')?.wares[0];
  assert.deepEqual([low?.note, low?.ask, low?.dim], ['From rank 2', null, true]);
  const helm = row(atRank(2), 'Armour')?.wares[0];
  assert.deepEqual(
    [helm?.note, helm?.ask, helm?.dim],
    ['', { kind: ASKS.buyFactionWare, column: STORM, node: 1 }, false],
  );
  assert.deepEqual(helm?.price, { amount: factions.armourAurem, currency: 'aurem' });
  assert.equal(helm?.about, 'Legendary Head · level 20');
  assert.match(helm?.words ?? '', /lightning comes\. Drawn in Squall, a colour none but the Stormcallers wear\.$/);
  assert.deepEqual(
    row(atRank(2), 'Weapons')?.wares.map((ware) => ware.note),
    ['From rank 3', 'From rank 3'],
  );
  const bow = row(atRank(3), 'Weapons')?.wares[1];
  assert.deepEqual(bow?.ask, { kind: ASKS.buyFactionWare, column: STORM, node: 6 });
  assert.equal(row(atRank(3, 100), 'Weapons')?.wares[1]?.short, true, 'short, still held to buy');
});

test('a faction piece is not asked for while its slot carries nine', () => {
  const helms = Array.from({ length: 9 }, (unused, id) => item({ id: 100 + id, kind: 0, bucket: 2 }));
  const full = state({
    standing: standing({ reputation: [2 * RANK, 0, 0] }),
    aurem: 100_000,
    level: 20,
    items: helms,
    factionWares: SOLD,
  });
  const helm = row(factionRows(STORM, full, false), 'Armour')?.wares[0];
  assert.deepEqual([helm?.note, helm?.ask], ['Its slot carries nine', null]);
});

test("away from a social space the room sends no faction's pieces, and no gear row shows", () => {
  const rows = factionRows(
    STORM,
    state({ standing: standing({ pledge: STORM, reputation: [9 * RANK, 0, 0] }) }),
    false,
  );
  assert.deepEqual(headings(rows), ['Reputation', 'Pledge', 'Art', 'Fragments']);
});

test('a faction whose name begins "The" is named once in a sentence: pledge, package and its words alike', () => {
  const VEILED = 3;
  const words = (pledge: number) => {
    const rows = factionRows(
      VEILED,
      state({ standing: standing({ pledge, reputation: [0, 0, 30_000], packages: [0, 0, 1] }) }),
      false,
    );
    return rows.flatMap((each) => each.wares).flatMap((ware) => [ware.name, ware.about, ware.words]);
  };
  const said = [...words(0), ...words(VEILED)];
  assert.ok(said.includes('Pledge to the Veiled'));
  assert.ok(said.includes('Pledged to the Veiled'));
  assert.ok(said.includes('From the Veiled'));
  assert.deepEqual(
    said.filter((each) => /the The|The The/.test(each)),
    [],
  );
});

test('a faction piece waits for the level it is made at: the rank says first, then the level', () => {
  const atLevel = (level: number, rank: number) =>
    factionRows(
      STORM,
      state({ standing: standing({ reputation: [rank * RANK, 0, 0] }), aurem: 100_000, level, factionWares: SOLD }),
      false,
    );
  const helm = (level: number, rank: number) => row(atLevel(level, rank), 'Armour')?.wares[0];
  assert.deepEqual(
    [helm(5, 3)?.note, helm(5, 3)?.ask, helm(5, 3)?.dim, helm(5, 3)?.short],
    ['From level 20', null, true, false],
  );
  assert.equal(helm(5, 1)?.note, 'From rank 2', 'the rank first');
  assert.equal(helm(19, 3)?.note, 'From level 20');
  assert.deepEqual(helm(20, 3)?.ask, { kind: ASKS.buyFactionWare, column: STORM, node: 1 });
});
