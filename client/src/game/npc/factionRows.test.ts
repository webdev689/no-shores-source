import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ASKS } from '../../network/gearMessages.ts';
import { factionRows, rankRewards, reputationOf } from './factionRows.ts';
import { item, standing, state } from './stateForTests.ts';

/** The Stormcallers (faction 1, first in the list) keep the Storm Art (Art 1, first). */
const STORM = 1;
const headings = (rows: ReturnType<typeof factionRows>) => rows.map((row) => row.heading);
const row = (rows: ReturnType<typeof factionRows>, heading: string) => rows.find((each) => each.heading === heading);

test('unpledged, the first pledge is free and no cape is sold', () => {
  const rows = factionRows(STORM, state({ standing: standing({}) }), false);
  assert.deepEqual(headings(rows), ['Reputation', 'Pledge', 'Art', 'Fragments']);
  const pledge = row(rows, 'Pledge')?.wares[0];
  assert.deepEqual([pledge?.price, pledge?.ask], [null, { kind: ASKS.pledge, column: STORM }]);
});

test('pledged to another, switching costs its price; pledged here, it says so and the cape is sold', () => {
  const switching = row(factionRows(STORM, state({ standing: standing({ pledge: 2 }), aurem: 100 }), false), 'Pledge');
  assert.deepEqual(switching?.wares[0]?.price, { amount: 2_500, currency: 'aurem' });
  assert.equal(switching?.wares[0]?.short, true);
  const pledged = factionRows(STORM, state({ standing: standing({ pledge: STORM }), aurem: 3_000 }), false);
  assert.equal(row(pledged, 'Pledge')?.wares[0]?.note, 'Pledged');
  assert.equal(row(pledged, 'Pledge')?.wares[0]?.ask, null);
  assert.equal(row(pledged, 'Pledge')?.wares[0]?.about, 'Pledged');
  const sold = row(pledged, 'Cape')?.wares[0];
  assert.deepEqual(sold?.ask, { kind: ASKS.buyCape, column: STORM });
  assert.deepEqual(
    [sold?.rarity, sold?.about],
    [3, 'Legendary Cloak · any level'],
    'a named Legendary, made at level 1',
  );
  const cape = item({ named: 'stormcallers_cape', kind: 18, rarity: 3 });
  const kept = factionRows(STORM, state({ standing: standing({ pledge: STORM }), items: [cape] }), false);
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

test('fragments owned are lit; the rest are sold from rank 1', () => {
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
  const full = state({ standing: standing({ pledge: STORM }), aurem: 9_000, items: cloaks });
  const cape = row(factionRows(STORM, full, false), 'Cape')?.wares[0];
  assert.deepEqual([cape?.note, cape?.ask], ['Nine cloaks carried', null]);
});
