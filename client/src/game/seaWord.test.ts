import assert from 'node:assert/strict';
import { test } from 'node:test';
import { portCities } from './worldData.ts';
import { SeaWord, linesOf, washedUpWords } from './seaWord.ts';

const FACTS = { engageM: 750, holdReachM: 1_642.8, repairReachM: 3_000, shipNames: [] };

test('the sea’s word becomes the player’s lines: washing up, a piece gathered, a ship joining, her colours struck', () => {
  const kinds = new Map([[7, 'chest']]);
  const names = new Map([[1, 'Tithe Brig']]);
  const lines = linesOf(
    [
      [20, 100, 1, 1],
      [21, 101, 7, 3, 1, 0],
      [22, 102, 0, 2, 3, 1],
      [22, 103, 4, 0, 0, 0],
    ],
    [
      { kind: 'Struck', tick: 99, ship: 1 },
      { kind: 'Boarding', tick: 100, ship: 1 },
    ],
    { kinds, ports: ['Overlook', 'Sunspire', 'Rimeholt'], nameOf: (ship) => names.get(ship) ?? null },
  );
  assert.deepEqual(lines, [
    'The Tithe Brig’s colours are down: come alongside and press E to board her.',
    'Boarders away: the Tithe Brig’s crew stands to meet them.',
    'Your ship went down: you washed up at Sunspire; your ship lies at its roadstead.',
    'Gathered a chest: a Rare Vestige, an Ammo box.',
    'The Pirate Schooner joined the fight.',
    'Player 4 joined the fight.',
  ]);
});

test('the best find reads as English: an Atheric Vestige', () => {
  const lines = linesOf([[21, 1, 7, 5, 0, 0]], [], { kinds: new Map(), ports: [], nameOf: () => null });
  assert.deepEqual(lines, ['Gathered a crate: an Atheric Vestige.']);
});

test('her repair reads its time left, whole, or how to have it, by the rules’ reach', () => {
  const word = new SeaWord([], FACTS);
  assert.equal(word.repairWords({ whole: false, left: 12.2 }), 'Repairing her: 13 s left');
  assert.equal(word.repairWords({ whole: true, left: 0 }), 'She is whole');
  assert.equal(word.repairWords({ whole: false, left: 0 }), 'Repair: free, lying at rest within 3 km of a port city');
  assert.equal(word.repairWords(null), 'Repairs are made at sea, by a port city');
  assert.match(new SeaWord([], { ...FACTS, repairReachM: 1_500 }).repairWords({ whole: false, left: 0 }), /1\.5 km/);
});

test('washed up, the player walks into the social space of the port city she washed up at once its landmass is open', () => {
  const ports = portCities(
    [
      { id: 'overlook', name: 'Overlook', continent: 'continent-1' },
      { id: 'saltmarsh', name: 'Saltmarsh', continent: 'continent-2' },
      { id: 'sunspire', name: 'Sunspire', continent: 'continent-3' },
    ],
    ['overlook', 'sunspire', 'rimeholt'],
  );
  const word = new SeaWord(ports, FACTS);
  const room = {
    flotsam: [],
    takeTold: () => ({ naval: [], told: [[20, 5, 1, 1]] }),
    shipNamed: () => null,
  } as unknown as Parameters<SeaWord['step']>[0];
  word.step(room);
  const nodes = [{ id: 'sunspire-social' }, { id: 'sunspire-docks' }];
  assert.equal(word.ashore({ id: 'continent-1', nodes }), null, 'her port’s landmass is not open yet');
  const ashore = word.ashore({ id: 'continent-3', nodes });
  assert.deepEqual(ashore, {
    node: { id: 'sunspire-social' },
    washUp: { kind: 'wash-up', node: 'sunspire-social', words: washedUpWords('Sunspire') },
  });
  assert.equal(washedUpWords('Sunspire'), 'You washed up at Sunspire; your ship lies at its roadstead.');
  assert.equal(word.ashore({ id: 'continent-3', nodes }), null, 'taken once');
});

test('washed up on a found island, the player is told so and walks ashore there, taken once', () => {
  const lines = linesOf([[20, 100, -1, 1, 9]], [], { kinds: new Map(), ports: ['Overlook'], nameOf: () => null });
  assert.deepEqual(lines, [
    `Your ship went down: ${washedUpWords('an island you found', true).replace(/^You/, 'you')}`,
  ]);
  const word = new SeaWord([], FACTS);
  const room = {
    flotsam: [],
    takeTold: () => ({ naval: [], told: [[20, 100, -1, 1, 9]] }),
    shipNamed: () => null,
  } as unknown as Parameters<SeaWord['step']>[0];
  word.step(room);
  assert.equal(word.takeWashedIsle(), 9);
  assert.equal(word.takeWashedIsle(), null);
});
